// Edit Time Entry Tool - Adjust clock-in/out times on an existing time entry
import { db, users, timeEntries } from '$lib/server/db';
import { eq, and, ne, or, gte, lte, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { isValidUUID } from '../utils/validation';
import { parsePacificDatetime, toPacificDateTimeString } from '$lib/server/utils/timezone';
import { audit } from '$lib/server/services/audit-service';

const log = createLogger('ai:tools:edit-time-entry');

interface EditTimeEntryParams {
	timeEntryId: string;
	clockIn?: string;
	clockOut?: string;
	notes?: string;
}

interface EditTimeEntryResult {
	success: boolean;
	userName?: string;
	timeEntryId?: string;
	before?: { clockIn: string; clockOut: string | null };
	after?: { clockIn: string; clockOut: string | null };
	error?: string;
}

/**
 * Parse a flexible datetime string into a UTC Date.
 * Accepts ISO 8601 (2024-01-15T09:00:00) or "YYYY-MM-DD HH:MM" in Pacific time.
 */
function parseFlexibleDatetime(input: string): Date | null {
	if (!input || typeof input !== 'string') return null;

	const trimmed = input.trim();

	if (trimmed.includes('T')) {
		try {
			return parsePacificDatetime(trimmed);
		} catch {
			return null;
		}
	}

	const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
	if (match) {
		try {
			return parsePacificDatetime(`${match[1]}T${match[2].padStart(5, '0')}`);
		} catch {
			return null;
		}
	}

	return null;
}

export const editTimeEntryTool: AITool<EditTimeEntryParams, EditTimeEntryResult> = {
	name: 'edit_time_entry',
	description: 'Edit an existing time entry to fix incorrect clock-in or clock-out times. Does NOT recalculate points or re-trigger rules. Provide at least one of clockIn or clockOut to change.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			timeEntryId: {
				type: 'string',
				description: 'The ID of the time entry to edit'
			},
			clockIn: {
				type: 'string',
				description: 'New clock-in time in Pacific time. Accepts ISO 8601 or "YYYY-MM-DD HH:MM" format'
			},
			clockOut: {
				type: 'string',
				description: 'New clock-out time in Pacific time. Accepts ISO 8601 or "YYYY-MM-DD HH:MM" format'
			},
			notes: {
				type: 'string',
				description: 'Reason for editing the time entry'
			}
		},
		required: ['timeEntryId']
	},

	requiresConfirmation: true,
	requiresApproval: false,
	cooldown: {
		global: 2
	},
	rateLimit: {
		maxPerHour: 15
	},

	getConfirmationMessage(params: EditTimeEntryParams): string {
		const changes: string[] = [];
		if (params.clockIn) changes.push(`clock-in to ${params.clockIn}`);
		if (params.clockOut) changes.push(`clock-out to ${params.clockOut}`);
		return `Edit time entry ${params.timeEntryId}: change ${changes.join(' and ')}?`;
	},

	validate(params: EditTimeEntryParams) {
		if (!isValidUUID(params.timeEntryId)) {
			return { valid: false, error: `Invalid timeEntryId format: "${params.timeEntryId}". Expected a UUID.` };
		}

		if (!params.clockIn && !params.clockOut) {
			return { valid: false, error: 'At least one of clockIn or clockOut must be provided' };
		}

		if (params.clockIn) {
			const parsed = parseFlexibleDatetime(params.clockIn);
			if (!parsed) {
				return { valid: false, error: `Invalid clockIn format: "${params.clockIn}". Use ISO 8601 or "YYYY-MM-DD HH:MM" in Pacific time.` };
			}
			if (parsed > new Date()) {
				return { valid: false, error: 'clockIn cannot be in the future' };
			}
		}

		if (params.clockOut) {
			const parsed = parseFlexibleDatetime(params.clockOut);
			if (!parsed) {
				return { valid: false, error: `Invalid clockOut format: "${params.clockOut}". Use ISO 8601 or "YYYY-MM-DD HH:MM" in Pacific time.` };
			}
			if (parsed > new Date()) {
				return { valid: false, error: 'clockOut cannot be in the future' };
			}
		}

		if (params.notes && params.notes.length > 500) {
			return { valid: false, error: 'Notes must be under 500 characters' };
		}

		return { valid: true };
	},

	async execute(params: EditTimeEntryParams, context: ToolExecutionContext): Promise<EditTimeEntryResult> {
		if (context.dryRun) {
			return { success: true, timeEntryId: params.timeEntryId, error: 'Dry run - no changes made' };
		}

		try {
			// Fetch the existing entry
			const [existing] = await db
				.select({
					id: timeEntries.id,
					userId: timeEntries.userId,
					clockIn: timeEntries.clockIn,
					clockOut: timeEntries.clockOut,
					notes: timeEntries.notes
				})
				.from(timeEntries)
				.where(eq(timeEntries.id, params.timeEntryId));

			if (!existing) {
				return { success: false, error: `Time entry ${params.timeEntryId} not found` };
			}

			// Get user name for the result
			const [user] = await db
				.select({ name: users.name })
				.from(users)
				.where(eq(users.id, existing.userId));

			const newClockIn = params.clockIn ? parseFlexibleDatetime(params.clockIn)! : existing.clockIn;
			const newClockOut = params.clockOut ? parseFlexibleDatetime(params.clockOut)! : existing.clockOut;

			// Validate clockOut > clockIn when both are set
			if (newClockOut && newClockIn && newClockOut <= newClockIn) {
				return { success: false, error: 'clockOut must be after clockIn' };
			}

			// Duration check
			if (newClockOut && newClockIn) {
				const durationHours = (newClockOut.getTime() - newClockIn.getTime()) / (1000 * 60 * 60);
				if (durationHours > 24) {
					return { success: false, error: `Resulting duration of ${durationHours.toFixed(1)} hours exceeds maximum of 24 hours` };
				}
			}

			// Check for overlapping entries (excluding self)
			if (newClockOut) {
				const overlapping = await db
					.select({ id: timeEntries.id, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut })
					.from(timeEntries)
					.where(
						and(
							eq(timeEntries.userId, existing.userId),
							ne(timeEntries.id, params.timeEntryId),
							lte(timeEntries.clockIn, newClockOut),
							or(
								sql`${timeEntries.clockOut} IS NULL`,
								gte(timeEntries.clockOut, newClockIn)
							)
						)
					)
					.limit(1);

				if (overlapping.length > 0) {
					const overlap = overlapping[0];
					return {
						success: false,
						error: `Would overlap with entry ${overlap.id} (${toPacificDateTimeString(overlap.clockIn)} - ${overlap.clockOut ? toPacificDateTimeString(overlap.clockOut) : 'still active'})`
					};
				}
			}

			const now = new Date();
			const updateData: Record<string, unknown> = {
				updatedAt: now,
				updatedBy: context.userId || null
			};

			if (params.clockIn) updateData.clockIn = newClockIn;
			if (params.clockOut) updateData.clockOut = newClockOut;
			if (params.notes) {
				const existingNotes = existing.notes || '';
				updateData.notes = existingNotes
					? `${existingNotes} | [AI edit] ${params.notes}`
					: `[AI edit] ${params.notes}`;
			}

			await db
				.update(timeEntries)
				.set(updateData)
				.where(eq(timeEntries.id, params.timeEntryId));

			// Audit log with before/after data
			await audit({
				userId: context.userId || existing.userId,
				action: 'time_entry_updated',
				entityType: 'time_entry',
				entityId: params.timeEntryId,
				beforeData: {
					clockIn: existing.clockIn.toISOString(),
					clockOut: existing.clockOut?.toISOString() || null
				},
				afterData: {
					clockIn: newClockIn.toISOString(),
					clockOut: newClockOut?.toISOString() || null,
					notes: params.notes,
					source: 'ai_edit',
					runId: context.runId
				}
			});

			log.info({
				timeEntryId: params.timeEntryId,
				userId: existing.userId,
				userName: user?.name,
				before: { clockIn: existing.clockIn.toISOString(), clockOut: existing.clockOut?.toISOString() },
				after: { clockIn: newClockIn.toISOString(), clockOut: newClockOut?.toISOString() },
				runId: context.runId
			}, 'AI edited time entry');

			return {
				success: true,
				userName: user?.name || 'Unknown',
				timeEntryId: params.timeEntryId,
				before: {
					clockIn: toPacificDateTimeString(existing.clockIn),
					clockOut: existing.clockOut ? toPacificDateTimeString(existing.clockOut) : null
				},
				after: {
					clockIn: toPacificDateTimeString(newClockIn),
					clockOut: newClockOut ? toPacificDateTimeString(newClockOut) : null
				}
			};
		} catch (error) {
			log.error({ error, params }, 'Edit time entry tool error');
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: EditTimeEntryResult): string {
		if (!result.success) return `Failed to edit time entry: ${result.error}`;

		let msg = `Updated ${result.userName}'s time entry`;
		if (result.before && result.after) {
			const changes: string[] = [];
			if (result.before.clockIn !== result.after.clockIn) {
				changes.push(`clock-in: ${result.before.clockIn} → ${result.after.clockIn}`);
			}
			if (result.before.clockOut !== result.after.clockOut) {
				changes.push(`clock-out: ${result.before.clockOut || 'none'} → ${result.after.clockOut || 'none'}`);
			}
			if (changes.length) msg += ` (${changes.join(', ')})`;
		}
		return msg;
	}
};
