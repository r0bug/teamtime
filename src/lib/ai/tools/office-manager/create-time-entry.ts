// Create Time Entry Tool - Create manual/backdated time entries for corrections
import { db, users, timeEntries } from '$lib/server/db';
import { eq, and, or, gte, lte, sql } from 'drizzle-orm';
import type { AITool, ToolExecutionContext } from '../../types';
import { createLogger } from '$lib/server/logger';
import { validateRequiredUserId, validateLocationId } from '../utils/validation';
import { parsePacificDatetime, toPacificDateTimeString } from '$lib/server/utils/timezone';
import { audit } from '$lib/server/services/audit-service';

const log = createLogger('ai:tools:create-time-entry');

interface CreateTimeEntryParams {
	userId: string;
	clockIn: string;
	clockOut: string;
	locationId?: string;
	notes: string;
}

interface CreateTimeEntryResult {
	success: boolean;
	userName?: string;
	timeEntryId?: string;
	clockIn?: string;
	clockOut?: string;
	durationHours?: number;
	error?: string;
}

/**
 * Parse a flexible datetime string into a UTC Date.
 * Accepts ISO 8601 (2024-01-15T09:00:00) or "YYYY-MM-DD HH:MM" in Pacific time.
 */
function parseFlexibleDatetime(input: string): Date | null {
	if (!input || typeof input !== 'string') return null;

	const trimmed = input.trim();

	// ISO 8601 with T separator — use parsePacificDatetime directly
	if (trimmed.includes('T')) {
		try {
			return parsePacificDatetime(trimmed);
		} catch {
			return null;
		}
	}

	// "YYYY-MM-DD HH:MM" format — convert to ISO format
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

export const createTimeEntryTool: AITool<CreateTimeEntryParams, CreateTimeEntryResult> = {
	name: 'create_time_entry',
	description: 'Create a manual/backdated time entry for a user who forgot to clock in. Requires a reason. Does NOT trigger points, task rules, or achievements — backdated entries should not game the system. Use get_available_staff to look up user IDs first.',
	agent: 'office_manager',
	parameters: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				description: 'The user ID to create the entry for'
			},
			clockIn: {
				type: 'string',
				description: 'Clock-in time in Pacific time. Accepts ISO 8601 (2024-01-15T09:00) or "YYYY-MM-DD HH:MM" format'
			},
			clockOut: {
				type: 'string',
				description: 'Clock-out time in Pacific time. Accepts ISO 8601 (2024-01-15T17:00) or "YYYY-MM-DD HH:MM" format'
			},
			locationId: {
				type: 'string',
				description: 'Optional location ID for the time entry'
			},
			notes: {
				type: 'string',
				description: 'Required reason for the manual entry (e.g., "Forgot to clock in")'
			}
		},
		required: ['userId', 'clockIn', 'clockOut', 'notes']
	},

	requiresConfirmation: true,
	requiresApproval: false,
	cooldown: {
		perUser: 10
	},
	rateLimit: {
		maxPerHour: 10
	},

	getConfirmationMessage(params: CreateTimeEntryParams): string {
		return `Create manual time entry for user ${params.userId}: ${params.clockIn} to ${params.clockOut}? Reason: ${params.notes}`;
	},

	validate(params: CreateTimeEntryParams) {
		const userValidation = validateRequiredUserId(params.userId, 'userId');
		if (!userValidation.valid) return userValidation;

		// Validate clock-in time
		const clockInDate = parseFlexibleDatetime(params.clockIn);
		if (!clockInDate) {
			return { valid: false, error: `Invalid clockIn format: "${params.clockIn}". Use ISO 8601 (2024-01-15T09:00) or "YYYY-MM-DD HH:MM" in Pacific time.` };
		}

		// Validate clock-out time
		const clockOutDate = parseFlexibleDatetime(params.clockOut);
		if (!clockOutDate) {
			return { valid: false, error: `Invalid clockOut format: "${params.clockOut}". Use ISO 8601 (2024-01-15T17:00) or "YYYY-MM-DD HH:MM" in Pacific time.` };
		}

		// clockOut must be after clockIn
		if (clockOutDate <= clockInDate) {
			return { valid: false, error: 'clockOut must be after clockIn' };
		}

		// Duration check (max 24 hours)
		const durationMs = clockOutDate.getTime() - clockInDate.getTime();
		const durationHours = durationMs / (1000 * 60 * 60);
		if (durationHours > 24) {
			return { valid: false, error: `Duration of ${durationHours.toFixed(1)} hours exceeds maximum of 24 hours` };
		}

		// No future times
		const now = new Date();
		if (clockInDate > now) {
			return { valid: false, error: 'clockIn cannot be in the future' };
		}
		if (clockOutDate > now) {
			return { valid: false, error: 'clockOut cannot be in the future' };
		}

		const locValidation = validateLocationId(params.locationId);
		if (!locValidation.valid) return locValidation;

		// Validate notes
		if (!params.notes || params.notes.trim().length < 5) {
			return { valid: false, error: 'Notes/reason is required and must be at least 5 characters (explain why this manual entry is needed)' };
		}
		if (params.notes.length > 500) {
			return { valid: false, error: 'Notes must be under 500 characters' };
		}

		return { valid: true };
	},

	async execute(params: CreateTimeEntryParams, context: ToolExecutionContext): Promise<CreateTimeEntryResult> {
		if (context.dryRun) {
			return { success: true, error: 'Dry run - no entry created' };
		}

		try {
			const clockInDate = parseFlexibleDatetime(params.clockIn)!;
			const clockOutDate = parseFlexibleDatetime(params.clockOut)!;

			// Get user info
			const [user] = await db
				.select({ id: users.id, name: users.name, isActive: users.isActive })
				.from(users)
				.where(eq(users.id, params.userId));

			if (!user) return { success: false, error: 'User not found' };
			if (!user.isActive) return { success: false, error: 'Cannot create entry for inactive user' };

			// Check for overlapping entries
			const overlapping = await db
				.select({ id: timeEntries.id, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut })
				.from(timeEntries)
				.where(
					and(
						eq(timeEntries.userId, params.userId),
						// Overlap: existing.clockIn < new.clockOut AND (existing.clockOut IS NULL OR existing.clockOut > new.clockIn)
						lte(timeEntries.clockIn, clockOutDate),
						or(
							sql`${timeEntries.clockOut} IS NULL`,
							gte(timeEntries.clockOut, clockInDate)
						)
					)
				)
				.limit(1);

			if (overlapping.length > 0) {
				const overlap = overlapping[0];
				return {
					success: false,
					error: `Overlaps with existing time entry ${overlap.id} (${toPacificDateTimeString(overlap.clockIn)} - ${overlap.clockOut ? toPacificDateTimeString(overlap.clockOut) : 'still active'})`
				};
			}

			const now = new Date();
			const durationMs = clockOutDate.getTime() - clockInDate.getTime();
			const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

			// Insert the manual entry
			const [entry] = await db
				.insert(timeEntries)
				.values({
					userId: params.userId,
					clockIn: clockInDate,
					clockOut: clockOutDate,
					locationId: params.locationId || null,
					notes: `[Manual entry] ${params.notes}`,
					updatedBy: context.userId || null,
					updatedAt: now
				})
				.returning({ id: timeEntries.id });

			// Audit log
			await audit({
				userId: context.userId || params.userId,
				action: 'time_entry_created',
				entityType: 'time_entry',
				entityId: entry.id,
				afterData: {
					userId: params.userId,
					clockIn: clockInDate.toISOString(),
					clockOut: clockOutDate.toISOString(),
					locationId: params.locationId,
					notes: params.notes,
					source: 'ai_manual_entry',
					runId: context.runId
				}
			});

			log.info({
				userId: params.userId,
				userName: user.name,
				timeEntryId: entry.id,
				clockIn: clockInDate.toISOString(),
				clockOut: clockOutDate.toISOString(),
				durationHours,
				runId: context.runId
			}, 'AI created manual time entry');

			return {
				success: true,
				userName: user.name,
				timeEntryId: entry.id,
				clockIn: toPacificDateTimeString(clockInDate),
				clockOut: toPacificDateTimeString(clockOutDate),
				durationHours
			};
		} catch (error) {
			log.error({ error, params }, 'Create time entry tool error');
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	},

	formatResult(result: CreateTimeEntryResult): string {
		if (!result.success) return `Failed to create time entry: ${result.error}`;

		return `Created manual time entry for ${result.userName}: ${result.clockIn} to ${result.clockOut} (${result.durationHours}h)`;
	}
};
