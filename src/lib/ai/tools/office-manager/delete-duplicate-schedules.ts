/**
 * @module AI/Tools/DeleteDuplicateSchedules
 * @description AI tool for identifying and removing duplicate shift entries.
 *
 * This tool scans for shifts with identical user/date/time combinations and
 * removes duplicates while preserving the first entry. Supports dry-run mode
 * to preview deletions before executing.
 *
 * Timezone: Uses Pacific timezone (America/Los_Angeles) for date boundary calculations.
 * Date inputs (startDate, endDate) are parsed as Pacific time.
 *
 * @see {@link $lib/server/utils/timezone} for timezone utilities
 */
import { db, shifts, users } from '$lib/server/db';
import { eq, sql, and, gte, lte, inArray } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { parsePacificDate, parsePacificEndOfDay } from '$lib/server/utils/timezone';

const log = createLogger('ai:tools:delete-duplicate-schedules');

interface DeleteDuplicateSchedulesParams {
	startDate?: string; // ISO date string (YYYY-MM-DD)
	endDate?: string; // ISO date string (YYYY-MM-DD)
	dryRun?: boolean; // If true, just show what would be deleted
}

interface DuplicateInfo {
	userName: string;
	date: string;
	time: string;
	duplicateCount: number;
	idsToDelete: string[];
}

interface DeleteDuplicateSchedulesResult {
	success: boolean;
	duplicatesFound: number;
	deletedCount: number;
	duplicates: DuplicateInfo[];
	error?: string;
}

export const deleteDuplicateSchedulesTool: AITool<DeleteDuplicateSchedulesParams, DeleteDuplicateSchedulesResult> = {
	name: 'delete_duplicate_schedules',
	description: 'Find and delete duplicate scheduled shifts in a single batch operation. Duplicates are shifts for the same user with the same start time. Keeps the oldest shift (first created) and removes duplicates. Use this when you need to clean up multiple duplicate schedules at once.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			startDate: {
				type: 'string',
				description: 'Start date to check for duplicates (YYYY-MM-DD format). Defaults to 30 days ago.'
			},
			endDate: {
				type: 'string',
				description: 'End date to check for duplicates (YYYY-MM-DD format). Defaults to 30 days from now.'
			},
			dryRun: {
				type: 'boolean',
				description: 'If true, only shows what would be deleted without actually deleting. Use for preview.'
			}
		},
		required: []
	},

	requiresApproval: false,
	requiresConfirmation: true, // Single confirmation for the entire batch

	cooldown: {
		global: 60 // Don't run more than once per minute
	},
	rateLimit: {
		maxPerHour: 5
	},

	getConfirmationMessage(params: DeleteDuplicateSchedulesParams): string {
		if (params.dryRun) {
			return 'Run duplicate schedule check (preview only)?';
		}
		return 'Delete all duplicate schedules found?\n\nThis will keep the oldest shift for each user/time combination and delete the duplicates.';
	},

	validate(params: DeleteDuplicateSchedulesParams) {
		// Validate date formats if provided
		if (params.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
			return { valid: false, error: 'startDate must be in YYYY-MM-DD format' };
		}
		if (params.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
			return { valid: false, error: 'endDate must be in YYYY-MM-DD format' };
		}
		return { valid: true };
	},

	async execute(params: DeleteDuplicateSchedulesParams, context: ToolExecutionContext): Promise<DeleteDuplicateSchedulesResult> {
		try {
			// Set default date range
			const now = new Date();
			const defaultStart = new Date(now);
			defaultStart.setDate(defaultStart.getDate() - 30);
			const defaultEnd = new Date(now);
			defaultEnd.setDate(defaultEnd.getDate() + 30);

			const startDate = params.startDate ? parsePacificDate(params.startDate) : defaultStart;
			const endDate = params.endDate ? parsePacificEndOfDay(params.endDate) : defaultEnd;

			// Find all shifts in date range with user info
			const allShifts = await db
				.select({
					id: shifts.id,
					userId: shifts.userId,
					userName: users.name,
					startTime: shifts.startTime,
					endTime: shifts.endTime,
					createdAt: shifts.createdAt
				})
				.from(shifts)
				.innerJoin(users, eq(shifts.userId, users.id))
				.where(and(
					gte(shifts.startTime, startDate),
					lte(shifts.startTime, endDate)
				))
				.orderBy(shifts.startTime, shifts.createdAt);

			// Group by user + start time to find duplicates
			const groupedShifts = new Map<string, typeof allShifts>();
			for (const shift of allShifts) {
				const key = `${shift.userId}-${shift.startTime.toISOString()}`;
				if (!groupedShifts.has(key)) {
					groupedShifts.set(key, []);
				}
				groupedShifts.get(key)!.push(shift);
			}

			// Find groups with duplicates
			const duplicates: DuplicateInfo[] = [];
			const idsToDelete: string[] = [];

			for (const [, shiftsGroup] of groupedShifts) {
				if (shiftsGroup.length > 1) {
					// Sort by createdAt to keep the oldest
					shiftsGroup.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

					// Keep the first one, delete the rest
					const duplicateIds = shiftsGroup.slice(1).map(s => s.id);
					idsToDelete.push(...duplicateIds);

					const firstShift = shiftsGroup[0];
					duplicates.push({
						userName: firstShift.userName,
						date: firstShift.startTime.toLocaleDateString('en-US', {
							weekday: 'short',
							month: 'short',
							day: 'numeric',
							timeZone: 'America/Los_Angeles'
						}),
						time: `${firstShift.startTime.toLocaleTimeString('en-US', {
							hour: 'numeric',
							minute: '2-digit',
							timeZone: 'America/Los_Angeles'
						})} - ${firstShift.endTime.toLocaleTimeString('en-US', {
							hour: 'numeric',
							minute: '2-digit',
							timeZone: 'America/Los_Angeles'
						})}`,
						duplicateCount: duplicateIds.length,
						idsToDelete: duplicateIds
					});
				}
			}

			if (duplicates.length === 0) {
				return {
					success: true,
					duplicatesFound: 0,
					deletedCount: 0,
					duplicates: []
				};
			}

			// If dry run or context.dryRun, don't actually delete
			if (params.dryRun || context.dryRun) {
				return {
					success: true,
					duplicatesFound: idsToDelete.length,
					deletedCount: 0,
					duplicates,
					error: params.dryRun ? 'Dry run - showing what would be deleted' : undefined
				};
			}

			// Delete all duplicates in one batch
			await db.delete(shifts).where(inArray(shifts.id, idsToDelete));

			log.info('Deleted duplicate schedules', {
				deletedCount: idsToDelete.length,
				duplicateGroups: duplicates.length
			});

			return {
				success: true,
				duplicatesFound: idsToDelete.length,
				deletedCount: idsToDelete.length,
				duplicates
			};
		} catch (error) {
			log.error('Delete duplicate schedules tool error', { error });
			return {
				success: false,
				duplicatesFound: 0,
				deletedCount: 0,
				duplicates: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	formatResult(result: DeleteDuplicateSchedulesResult): string {
		if (!result.success) {
			return `Failed to process duplicates: ${result.error}`;
		}

		if (result.duplicatesFound === 0) {
			return 'No duplicate schedules found.';
		}

		if (result.deletedCount === 0 && result.error?.includes('Dry run')) {
			let msg = `Found ${result.duplicatesFound} duplicate shift(s) that would be deleted:\n`;
			for (const dup of result.duplicates) {
				msg += `  - ${dup.userName}: ${dup.date} ${dup.time} (${dup.duplicateCount} duplicate${dup.duplicateCount > 1 ? 's' : ''})\n`;
			}
			return msg;
		}

		let msg = `Deleted ${result.deletedCount} duplicate shift(s):\n`;
		for (const dup of result.duplicates) {
			msg += `  - ${dup.userName}: ${dup.date} ${dup.time} (${dup.duplicateCount} removed)\n`;
		}
		return msg;
	}
};
