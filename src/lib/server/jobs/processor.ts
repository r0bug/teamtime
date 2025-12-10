// Job processor - executes jobs from the queue
import { getPendingJobs, acquireJob, completeJob, failJob, type JobType, type JobPayload, type JobResult } from './queue';
import type { Job } from '$lib/server/db/schema';

// Job handlers registry
type JobHandler<T extends JobType> = (payload: JobPayload[T]) => Promise<JobResult[T]>;

const handlers: Partial<Record<JobType, JobHandler<JobType>>> = {};

// Register a job handler
export function registerHandler<T extends JobType>(type: T, handler: JobHandler<T>): void {
	handlers[type] = handler as unknown as JobHandler<JobType>;
}

// Process a single job
async function processJob(job: Job): Promise<boolean> {
	const handler = handlers[job.type as JobType];

	if (!handler) {
		console.error(`[JobProcessor] No handler registered for job type: ${job.type}`);
		await failJob(job.id, `No handler registered for job type: ${job.type}`);
		return false;
	}

	// Try to acquire the job (atomic operation to prevent race conditions)
	const acquired = await acquireJob(job.id);
	if (!acquired) {
		// Job was already picked up by another worker
		return false;
	}

	console.log(`[JobProcessor] Processing job ${job.id} (type: ${job.type}, attempt: ${acquired.attempts})`);

	try {
		const result = await handler(job.payload as JobPayload[JobType]);
		await completeJob(job.id, result);
		console.log(`[JobProcessor] Job ${job.id} completed successfully`);
		return true;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[JobProcessor] Job ${job.id} failed:`, errorMessage);
		await failJob(job.id, errorMessage);
		return false;
	}
}

// Process pending jobs (call this from cron or API endpoint)
export async function processPendingJobs(limit = 10): Promise<{
	processed: number;
	succeeded: number;
	failed: number;
}> {
	const pendingJobs = await getPendingJobs(limit);

	let processed = 0;
	let succeeded = 0;
	let failed = 0;

	for (const job of pendingJobs) {
		processed++;
		const success = await processJob(job);
		if (success) {
			succeeded++;
		} else {
			failed++;
		}
	}

	return { processed, succeeded, failed };
}

// Run the processor continuously (for long-running process)
export async function runProcessor(options: {
	batchSize?: number;
	pollInterval?: number;
	maxIterations?: number;
} = {}): Promise<void> {
	const { batchSize = 10, pollInterval = 5000, maxIterations = Infinity } = options;

	let iterations = 0;

	console.log('[JobProcessor] Starting job processor...');

	while (iterations < maxIterations) {
		try {
			const { processed, succeeded, failed } = await processPendingJobs(batchSize);

			if (processed > 0) {
				console.log(`[JobProcessor] Batch complete: ${succeeded}/${processed} succeeded, ${failed} failed`);
			}

			// If no jobs were found, wait before polling again
			if (processed === 0) {
				await new Promise(resolve => setTimeout(resolve, pollInterval));
			}
		} catch (error) {
			console.error('[JobProcessor] Error processing batch:', error);
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		iterations++;
	}

	console.log('[JobProcessor] Processor stopped');
}
