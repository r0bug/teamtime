// Database-backed job queue for background processing
import { db, jobs } from '$lib/server/db';
import { eq, and, lte, sql, desc, asc } from 'drizzle-orm';
import type { Job, NewJob } from '$lib/server/db/schema';

export type JobType =
	| 'inventory_drop_process'
	| 'inventory_drop_upload_complete'
	| 'scheduled_sms';

export interface JobPayload {
	inventory_drop_process: {
		dropId: string;
		userId: string;
	};
	inventory_drop_upload_complete: {
		dropId: string;
	};
	scheduled_sms: {
		toUserId?: string;
		toPhone?: string;
		toAllStaff?: boolean;
		message: string;
		scheduledBy: string;
		aiRunId?: string;
	};
}

export interface JobResult {
	inventory_drop_process: {
		itemCount: number;
		notes?: string;
	};
	inventory_drop_upload_complete: {
		photosUploaded: number;
	};
	scheduled_sms: {
		success: boolean;
		recipientCount?: number;
		recipientName?: string;
		messageSid?: string;
		error?: string;
	};
}

// Type-safe job creation
export async function createJob<T extends JobType>(
	type: T,
	payload: JobPayload[T],
	options?: {
		priority?: number;
		maxAttempts?: number;
		runAt?: Date;
	}
): Promise<Job> {
	const [job] = await db
		.insert(jobs)
		.values({
			type,
			payload: payload as Record<string, unknown>,
			priority: options?.priority ?? 0,
			maxAttempts: options?.maxAttempts ?? 3,
			runAt: options?.runAt ?? new Date()
		})
		.returning();

	return job;
}

// Get pending jobs that are ready to run
export async function getPendingJobs(limit = 10): Promise<Job[]> {
	return db
		.select()
		.from(jobs)
		.where(
			and(
				eq(jobs.status, 'pending'),
				lte(jobs.runAt, new Date())
			)
		)
		.orderBy(desc(jobs.priority), asc(jobs.runAt))
		.limit(limit);
}

// Get a specific job by ID
export async function getJob(jobId: string): Promise<Job | null> {
	const [job] = await db
		.select()
		.from(jobs)
		.where(eq(jobs.id, jobId))
		.limit(1);
	return job ?? null;
}

// Acquire a job for processing (atomic update to prevent race conditions)
export async function acquireJob(jobId: string): Promise<Job | null> {
	const [job] = await db
		.update(jobs)
		.set({
			status: 'running',
			startedAt: new Date(),
			attempts: sql`${jobs.attempts} + 1`
		})
		.where(
			and(
				eq(jobs.id, jobId),
				eq(jobs.status, 'pending')
			)
		)
		.returning();

	return job ?? null;
}

// Mark job as completed
export async function completeJob<T extends JobType>(
	jobId: string,
	result: JobResult[T]
): Promise<Job | null> {
	const [job] = await db
		.update(jobs)
		.set({
			status: 'completed',
			result: result as Record<string, unknown>,
			completedAt: new Date()
		})
		.where(eq(jobs.id, jobId))
		.returning();

	return job ?? null;
}

// Mark job as failed
export async function failJob(jobId: string, error: string): Promise<Job | null> {
	// First get the job to check attempts
	const [currentJob] = await db
		.select()
		.from(jobs)
		.where(eq(jobs.id, jobId))
		.limit(1);

	if (!currentJob) return null;

	// Check if we should retry
	const shouldRetry = currentJob.attempts < currentJob.maxAttempts;

	const [job] = await db
		.update(jobs)
		.set({
			status: shouldRetry ? 'pending' : 'failed',
			error,
			// If retrying, schedule for later (exponential backoff)
			runAt: shouldRetry
				? new Date(Date.now() + Math.pow(2, currentJob.attempts) * 1000 * 60) // 2, 4, 8 minutes, etc.
				: currentJob.runAt,
			startedAt: null,
			completedAt: shouldRetry ? null : new Date()
		})
		.where(eq(jobs.id, jobId))
		.returning();

	return job ?? null;
}

// Cancel a pending job
export async function cancelJob(jobId: string): Promise<Job | null> {
	const [job] = await db
		.update(jobs)
		.set({
			status: 'cancelled',
			completedAt: new Date()
		})
		.where(
			and(
				eq(jobs.id, jobId),
				eq(jobs.status, 'pending')
			)
		)
		.returning();

	return job ?? null;
}

// Get jobs for a specific type and payload filter
export async function getJobsByType(type: JobType, status?: Job['status']): Promise<Job[]> {
	const conditions = [eq(jobs.type, type)];
	if (status) {
		conditions.push(eq(jobs.status, status));
	}

	return db
		.select()
		.from(jobs)
		.where(and(...conditions))
		.orderBy(desc(jobs.createdAt))
		.limit(100);
}

// Clean up old completed/failed/cancelled jobs
export async function cleanupOldJobs(olderThanDays = 7): Promise<number> {
	const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

	const result = await db
		.delete(jobs)
		.where(
			and(
				sql`${jobs.status} IN ('completed', 'failed', 'cancelled')`,
				lte(jobs.createdAt, cutoff)
			)
		)
		.returning();

	return result.length;
}

// Get job statistics
export async function getJobStats(): Promise<{
	pending: number;
	running: number;
	completed: number;
	failed: number;
	cancelled: number;
}> {
	const results = await db
		.select({
			status: jobs.status,
			count: sql<number>`count(*)`
		})
		.from(jobs)
		.groupBy(jobs.status);

	const stats = {
		pending: 0,
		running: 0,
		completed: 0,
		failed: 0,
		cancelled: 0
	};

	for (const row of results) {
		stats[row.status] = Number(row.count);
	}

	return stats;
}
