// User Migration Service
// Handles migration from legacy role-based system to new user type system

import { db, users, userTypes, userMigrationBackup, appSettings, auditLogs } from '$lib/server/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createLogger } from '$lib/server/logger';

const log = createLogger('server:user-migration');

export interface MigrationResult {
	success: boolean;
	migratedCount: number;
	skippedCount: number;
	errors: string[];
	batchId: string;
}

export interface MigrationStatus {
	status: 'pending' | 'in_progress' | 'completed' | 'partial' | 'error';
	totalUsers: number;
	migratedUsers: number;
	unmigatedUsers: number;
	lastMigrationBatch?: string;
	lastMigrationDate?: Date;
}

export interface RevertResult {
	success: boolean;
	revertedCount: number;
	errors: string[];
}

/**
 * Get the current migration status
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
	// Get total user count
	const [{ count: totalUsers }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(eq(users.isActive, true));

	// Get users with user types assigned
	const [{ count: migratedUsers }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(and(
			eq(users.isActive, true),
			sql`${users.userTypeId} IS NOT NULL`
		));

	// Get last migration info
	const [lastMigration] = await db
		.select()
		.from(userMigrationBackup)
		.orderBy(sql`${userMigrationBackup.migratedAt} DESC`)
		.limit(1);

	// Get status from settings
	const [statusSetting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'user_migration_status'));

	const status = statusSetting?.value as MigrationStatus['status'] || 'pending';

	return {
		status,
		totalUsers,
		migratedUsers,
		unmigatedUsers: totalUsers - migratedUsers,
		lastMigrationBatch: lastMigration?.migrationBatch,
		lastMigrationDate: lastMigration?.migratedAt
	};
}

/**
 * Get or create system user types for each legacy role
 * Returns a map of role -> userTypeId
 */
async function ensureSystemUserTypes(): Promise<Map<string, string>> {
	const roleMap = new Map<string, string>();

	const systemTypes = [
		{ name: 'Admin', basedOnRole: 'admin' as const, priority: 100, color: '#DC2626', isSystem: true, isTemplate: true },
		{ name: 'Manager', basedOnRole: 'manager' as const, priority: 80, color: '#2563EB', isSystem: true, isTemplate: true },
		{ name: 'Purchaser', basedOnRole: 'purchaser' as const, priority: 60, color: '#059669', isSystem: true, isTemplate: true },
		{ name: 'Staff', basedOnRole: 'staff' as const, priority: 40, color: '#6B7280', isSystem: true, isTemplate: true }
	];

	for (const type of systemTypes) {
		// Check if exists
		let [existing] = await db
			.select()
			.from(userTypes)
			.where(eq(userTypes.name, type.name))
			.limit(1);

		if (!existing) {
			// Create it
			[existing] = await db
				.insert(userTypes)
				.values(type)
				.returning();
		} else {
			// Update to ensure it's marked as system and template
			[existing] = await db
				.update(userTypes)
				.set({ isSystem: true, isTemplate: true, updatedAt: new Date() })
				.where(eq(userTypes.id, existing.id))
				.returning();
		}

		roleMap.set(type.basedOnRole, existing.id);
	}

	return roleMap;
}

/**
 * Migrate all users from legacy roles to new user type system
 */
export async function migrateAllUsers(performedByUserId?: string): Promise<MigrationResult> {
	const batchId = `migration_${Date.now()}_${randomUUID().substring(0, 8)}`;
	const errors: string[] = [];
	let migratedCount = 0;
	let skippedCount = 0;

	try {
		// Update status to in_progress
		await db
			.update(appSettings)
			.set({ value: 'in_progress', updatedAt: new Date() })
			.where(eq(appSettings.key, 'user_migration_status'));

		// Ensure system user types exist
		const roleMap = await ensureSystemUserTypes();

		// Get all active users without a user type
		const usersToMigrate = await db
			.select()
			.from(users)
			.where(and(
				eq(users.isActive, true),
				isNull(users.userTypeId)
			));

		log.info('Found users to migrate', { count: usersToMigrate.length });

		for (const user of usersToMigrate) {
			try {
				const targetUserTypeId = roleMap.get(user.role);

				if (!targetUserTypeId) {
					errors.push(`No user type found for role '${user.role}' (user: ${user.email})`);
					skippedCount++;
					continue;
				}

				// Create backup record
				await db.insert(userMigrationBackup).values({
					userId: user.id,
					originalRole: user.role,
					originalUserTypeId: user.userTypeId,
					migratedUserTypeId: targetUserTypeId,
					migrationBatch: batchId
				});

				// Update user with new user type
				await db
					.update(users)
					.set({ userTypeId: targetUserTypeId, updatedAt: new Date() })
					.where(eq(users.id, user.id));

				migratedCount++;

				// Log to audit
				await db.insert(auditLogs).values({
					userId: performedByUserId,
					action: 'user_migrated',
					entityType: 'user',
					entityId: user.id,
					beforeData: { role: user.role, userTypeId: user.userTypeId },
					afterData: { role: user.role, userTypeId: targetUserTypeId, migrationBatch: batchId }
				});

			} catch (userError) {
				const errorMsg = userError instanceof Error ? userError.message : 'Unknown error';
				errors.push(`Failed to migrate user ${user.email}: ${errorMsg}`);
				skippedCount++;
			}
		}

		// Update status
		const finalStatus = errors.length > 0 ? 'partial' : 'completed';
		await db
			.update(appSettings)
			.set({ value: finalStatus, updatedAt: new Date() })
			.where(eq(appSettings.key, 'user_migration_status'));

		log.info('Migration completed', {
			migratedCount,
			skippedCount,
			errorCount: errors.length,
			status: finalStatus
		});

		return {
			success: errors.length === 0,
			migratedCount,
			skippedCount,
			errors,
			batchId
		};

	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		log.error('Fatal migration error', { error: errorMsg });

		await db
			.update(appSettings)
			.set({ value: 'error', updatedAt: new Date() })
			.where(eq(appSettings.key, 'user_migration_status'));

		return {
			success: false,
			migratedCount,
			skippedCount,
			errors: [...errors, `Fatal error: ${errorMsg}`],
			batchId
		};
	}
}

/**
 * Revert a specific migration batch
 */
export async function revertMigrationBatch(batchId: string, performedByUserId?: string): Promise<RevertResult> {
	const errors: string[] = [];
	let revertedCount = 0;

	try {
		// Get all backup records for this batch that haven't been reverted
		const backupRecords = await db
			.select()
			.from(userMigrationBackup)
			.where(and(
				eq(userMigrationBackup.migrationBatch, batchId),
				isNull(userMigrationBackup.revertedAt)
			));

		log.info('Reverting users from batch', { batchId, count: backupRecords.length });

		for (const backup of backupRecords) {
			try {
				// Restore original user type (null for legacy users)
				await db
					.update(users)
					.set({ userTypeId: backup.originalUserTypeId, updatedAt: new Date() })
					.where(eq(users.id, backup.userId));

				// Mark backup as reverted
				await db
					.update(userMigrationBackup)
					.set({ revertedAt: new Date() })
					.where(eq(userMigrationBackup.id, backup.id));

				revertedCount++;

				// Log to audit
				await db.insert(auditLogs).values({
					userId: performedByUserId,
					action: 'user_migration_reverted',
					entityType: 'user',
					entityId: backup.userId,
					beforeData: { userTypeId: backup.migratedUserTypeId },
					afterData: { userTypeId: backup.originalUserTypeId, revertedBatch: batchId }
				});

			} catch (userError) {
				const errorMsg = userError instanceof Error ? userError.message : 'Unknown error';
				errors.push(`Failed to revert user ${backup.userId}: ${errorMsg}`);
			}
		}

		// Update status back to pending if all users were reverted
		const status = await getMigrationStatus();
		if (status.migratedUsers === 0) {
			await db
				.update(appSettings)
				.set({ value: 'pending', updatedAt: new Date() })
				.where(eq(appSettings.key, 'user_migration_status'));
		}

		log.info('Revert completed', { revertedCount, errorCount: errors.length });

		return {
			success: errors.length === 0,
			revertedCount,
			errors
		};

	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		log.error('Revert fatal error', { error: errorMsg });

		return {
			success: false,
			revertedCount,
			errors: [...errors, `Fatal error: ${errorMsg}`]
		};
	}
}

/**
 * Revert all users to a default user type
 */
export async function revertAllToDefault(performedByUserId?: string): Promise<RevertResult> {
	const errors: string[] = [];
	let revertedCount = 0;

	try {
		// Get default user type ID from settings
		const [defaultSetting] = await db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, 'default_user_type_id'));

		const defaultUserTypeId = defaultSetting?.value || null;

		// If no default is set, revert to null (use legacy role fallback)
		const targetUserTypeId = defaultUserTypeId && defaultUserTypeId.length > 0 ? defaultUserTypeId : null;

		// Get all active users
		const allUsers = await db
			.select()
			.from(users)
			.where(eq(users.isActive, true));

		const batchId = `revert_default_${Date.now()}`;

		for (const user of allUsers) {
			try {
				// Create backup record before reverting
				await db.insert(userMigrationBackup).values({
					userId: user.id,
					originalRole: user.role,
					originalUserTypeId: user.userTypeId,
					migratedUserTypeId: targetUserTypeId,
					migrationBatch: batchId
				});

				// Update to default
				await db
					.update(users)
					.set({ userTypeId: targetUserTypeId, updatedAt: new Date() })
					.where(eq(users.id, user.id));

				revertedCount++;

				// Log to audit
				await db.insert(auditLogs).values({
					userId: performedByUserId,
					action: 'user_reset_to_default',
					entityType: 'user',
					entityId: user.id,
					beforeData: { userTypeId: user.userTypeId },
					afterData: { userTypeId: targetUserTypeId, resetBatch: batchId }
				});

			} catch (userError) {
				const errorMsg = userError instanceof Error ? userError.message : 'Unknown error';
				errors.push(`Failed to reset user ${user.email}: ${errorMsg}`);
			}
		}

		log.info('Reset to default completed', { revertedCount, errorCount: errors.length });

		return {
			success: errors.length === 0,
			revertedCount,
			errors
		};

	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		log.error('Reset fatal error', { error: errorMsg });

		return {
			success: false,
			revertedCount,
			errors: [...errors, `Fatal error: ${errorMsg}`]
		};
	}
}

/**
 * Get the default user type ID from settings
 */
export async function getDefaultUserTypeId(): Promise<string | null> {
	const [setting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'default_user_type_id'));

	return setting?.value && setting.value.length > 0 ? setting.value : null;
}

/**
 * Set the default user type ID
 */
export async function setDefaultUserTypeId(userTypeId: string | null, performedByUserId?: string): Promise<void> {
	const value = userTypeId || '';

	// Verify user type exists if provided
	if (userTypeId) {
		const [userType] = await db
			.select()
			.from(userTypes)
			.where(eq(userTypes.id, userTypeId))
			.limit(1);

		if (!userType) {
			throw new Error(`User type ${userTypeId} not found`);
		}
	}

	// Get old value for audit
	const [oldSetting] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.key, 'default_user_type_id'));

	// Update or insert
	await db
		.insert(appSettings)
		.values({ key: 'default_user_type_id', value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value, updatedAt: new Date() }
		});

	// Log to audit
	await db.insert(auditLogs).values({
		userId: performedByUserId,
		action: 'default_user_type_changed',
		entityType: 'setting',
		entityId: 'default_user_type_id',
		beforeData: { value: oldSetting?.value },
		afterData: { value }
	});
}

/**
 * Get recent migration batches
 */
export async function getMigrationBatches(limit = 10): Promise<{
	batchId: string;
	migratedAt: Date;
	userCount: number;
	revertedCount: number;
}[]> {
	const batches = await db
		.select({
			batchId: userMigrationBackup.migrationBatch,
			migratedAt: sql<Date>`MIN(${userMigrationBackup.migratedAt})`,
			userCount: sql<number>`COUNT(*)::int`,
			revertedCount: sql<number>`COUNT(${userMigrationBackup.revertedAt})::int`
		})
		.from(userMigrationBackup)
		.groupBy(userMigrationBackup.migrationBatch)
		.orderBy(sql`MIN(${userMigrationBackup.migratedAt}) DESC`)
		.limit(limit);

	return batches;
}
