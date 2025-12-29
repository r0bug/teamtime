import { pgTable, text, timestamp, boolean, uuid, integer, jsonb, pgEnum, decimal, serial, unique, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'purchaser', 'staff']);

// AI System Enums
export const aiAgentEnum = pgEnum('ai_agent', ['office_manager', 'revenue_optimizer', 'architect']);
export const aiProviderEnum = pgEnum('ai_provider', ['anthropic', 'openai', 'segmind']);
export const aiMemoryScopeEnum = pgEnum('ai_memory_scope', ['user', 'location', 'global']);
export const aiPolicyScopeEnum = pgEnum('ai_policy_scope', ['global', 'location', 'role']);
export const aiToneEnum = pgEnum('ai_tone', ['helpful_parent', 'professional', 'casual', 'formal']);
export const architectureStatusEnum = pgEnum('architecture_status', [
	'proposed',
	'approved',
	'in_progress',
	'implemented',
	'rejected',
	'superseded'
]);
export const architectureCategoryEnum = pgEnum('architecture_category', [
	'schema',
	'api',
	'ui',
	'integration',
	'security',
	'architecture'
]);
export const taskStatusEnum = pgEnum('task_status', ['not_started', 'in_progress', 'completed', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);
export const taskSourceEnum = pgEnum('task_source', ['manual', 'recurring', 'event_triggered', 'purchase_approval', 'ebay_listing', 'inventory_drop']);
export const taskAssignmentTypeEnum = pgEnum('task_assignment_type', ['individual', 'all_staff']);
export const inventoryDropStatusEnum = pgEnum('inventory_drop_status', ['pending', 'processing', 'completed', 'failed']);
export const inventoryDropUploadStatusEnum = pgEnum('inventory_drop_upload_status', ['pending', 'uploading', 'completed', 'failed']);
export const jobStatusEnum = pgEnum('job_status', ['pending', 'running', 'completed', 'failed', 'cancelled']);
export const pricingDestinationEnum = pgEnum('pricing_destination', ['store', 'ebay']);
export const triggerEventEnum = pgEnum('trigger_event', ['clock_in', 'clock_out', 'first_clock_in', 'last_clock_out']);
export const ruleTriggerTypeEnum = pgEnum('rule_trigger_type', [
	'clock_in',
	'clock_out',
	'first_clock_in',
	'last_clock_out',
	'time_into_shift',
	'task_completed',
	'schedule',
	'closing_shift'
]);
export const assignmentTypeEnum = pgEnum('assignment_type', [
	'specific_user',
	'clocked_in_user',
	'role_rotation',
	'location_staff',
	'least_tasks'
]);
export const purchaseStatusEnum = pgEnum('purchase_status', ['pending', 'approved', 'denied']);
export const withdrawalStatusEnum = pgEnum('withdrawal_status', ['unassigned', 'partially_assigned', 'fully_spent']);
export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'broadcast', 'group']);
export const notificationTypeEnum = pgEnum('notification_type', [
	'task_assigned',
	'task_due',
	'task_overdue',
	'schedule_change',
	'shift_request',
	'new_message',
	'purchase_decision',
	'shift_reminder'
]);

// Office Manager Chat Enums
export const pendingActionStatusEnum = pgEnum('pending_action_status', ['pending', 'approved', 'rejected', 'expired']);
export const cashCountTriggerEnum = pgEnum('cash_count_trigger', ['shift_start', 'shift_end', 'manual']);

// Data Visibility Enums
export const visibilityGroupTypeEnum = pgEnum('visibility_group_type', ['team', 'store', 'department', 'custom']);
export const visibilityLevelEnum = pgEnum('visibility_level', ['none', 'own', 'same_group', 'same_role', 'lower_roles', 'all']);
export const visibilityCategoryEnum = pgEnum('visibility_category', ['tasks', 'messages', 'schedule', 'attendance', 'users', 'pricing', 'expenses']);
export const visibilityGrantTypeEnum = pgEnum('visibility_grant_type', ['view', 'view_summary', 'none']);

// Gamification Enums
export const pointCategoryEnum = pgEnum('point_category', ['attendance', 'task', 'pricing', 'sales', 'bonus', 'achievement']);
export const achievementTierEnum = pgEnum('achievement_tier', ['bronze', 'silver', 'gold', 'platinum']);
export const leaderboardPeriodEnum = pgEnum('leaderboard_period', ['daily', 'weekly', 'monthly']);

// ============================================
// ACCESS CONTROL TABLES (User Types & Permissions)
// ============================================

// User Types - custom user types for granular access control
export const userTypes = pgTable('user_types', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	description: text('description'),
	isSystem: boolean('is_system').notNull().default(false), // true for built-in types (Admin, Manager, etc.)
	isTemplate: boolean('is_template').notNull().default(false), // templates can be copied but not deleted
	basedOnRole: userRoleEnum('based_on_role'), // fallback role for unspecified permissions
	priority: integer('priority').notNull().default(50), // higher = checked first
	color: text('color').default('#6B7280'), // UI display color
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// User migration backup - tracks original user state before migration for rollback
export const userMigrationBackup = pgTable('user_migration_backup', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	originalRole: text('original_role').notNull(),
	originalUserTypeId: uuid('original_user_type_id'),
	migratedUserTypeId: uuid('migrated_user_type_id').references(() => userTypes.id),
	migratedAt: timestamp('migrated_at', { withTimezone: true }).notNull().defaultNow(),
	revertedAt: timestamp('reverted_at', { withTimezone: true }),
	migrationBatch: text('migration_batch').notNull()
});

// Permissions - route and action level permissions
export const permissions = pgTable('permissions', {
	id: uuid('id').primaryKey().defaultRandom(),
	routePattern: text('route_pattern').notNull(), // e.g., '/admin/users', '/tasks/[id]'
	actionName: text('action_name'), // null = page access, or 'createUser', 'deleteUser', etc.
	name: text('name').notNull(), // human-readable: "Create User"
	description: text('description'),
	module: text('module').notNull(), // 'admin', 'tasks', 'pricing', etc.
	isAutoDiscovered: boolean('is_auto_discovered').notNull().default(false),
	defaultGranted: boolean('default_granted').notNull().default(false), // default for new user types
	requiresRole: userRoleEnum('requires_role'), // minimum role even with permission
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniqueRouteAction: unique().on(table.routePattern, table.actionName)
}));

// User Type Permissions - junction table linking user types to permissions
export const userTypePermissions = pgTable('user_type_permissions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userTypeId: uuid('user_type_id')
		.notNull()
		.references(() => userTypes.id, { onDelete: 'cascade' }),
	permissionId: uuid('permission_id')
		.notNull()
		.references(() => permissions.id, { onDelete: 'cascade' }),
	granted: boolean('granted').notNull().default(true), // true = allow, false = deny
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniqueUserTypePermission: unique().on(table.userTypeId, table.permissionId)
}));

// Temporary Permissions - time-limited permission changes by Office Manager AI
export const temporaryPermissions = pgTable('temporary_permissions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	changeType: text('change_type').notNull(), // 'permission_grant', 'permission_revoke', 'user_type_change'
	permissionId: uuid('permission_id').references(() => permissions.id, { onDelete: 'cascade' }),
	originalUserTypeId: uuid('original_user_type_id').references(() => userTypes.id),
	newUserTypeId: uuid('new_user_type_id').references(() => userTypes.id),
	grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),
	grantedByUserId: uuid('granted_by_user_id').references(() => users.id),
	grantedByAiRunId: uuid('granted_by_ai_run_id'),
	justification: text('justification').notNull(),
	approvalStatus: text('approval_status').notNull().default('auto_approved'),
	approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
	approvedAt: timestamp('approved_at', { withTimezone: true }),
	isActive: boolean('is_active').notNull().default(true),
	rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
	rolledBackByUserId: uuid('rolled_back_by_user_id').references(() => users.id),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Permission Change Notifications
export const permissionChangeNotifications = pgTable('permission_change_notifications', {
	id: uuid('id').primaryKey().defaultRandom(),
	temporaryPermissionId: uuid('temporary_permission_id').notNull().references(() => temporaryPermissions.id, { onDelete: 'cascade' }),
	recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	notificationType: text('notification_type').notNull(), // 'user', 'manager', 'admin'
	sentAt: timestamp('sent_at', { withTimezone: true }),
	readAt: timestamp('read_at', { withTimezone: true }),
	deliveryMethod: text('delivery_method').notNull().default('in_app'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// DATA VISIBILITY TABLES (What data users can see)
// ============================================

// Visibility Groups - custom groups like teams, stores, departments
export const visibilityGroups = pgTable('visibility_groups', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	description: text('description'),
	groupType: visibilityGroupTypeEnum('group_type').notNull().default('team'),
	locationId: uuid('location_id'), // Optional: tie group to a location (forward reference, will be resolved)
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Visibility Group Members - who belongs to which groups
export const visibilityGroupMembers = pgTable('visibility_group_members', {
	id: uuid('id').primaryKey().defaultRandom(),
	groupId: uuid('group_id').notNull().references(() => visibilityGroups.id, { onDelete: 'cascade' }),
	userId: uuid('user_id'), // Forward reference to users (will be resolved after users table)
	isLeader: boolean('is_leader').notNull().default(false), // Leaders may have expanded visibility
	joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniqueGroupUser: unique().on(table.groupId, table.userId)
}));

// Visibility Rules - system-wide visibility rules (scenario toggles)
export const visibilityRules = pgTable('visibility_rules', {
	id: uuid('id').primaryKey().defaultRandom(),
	ruleKey: text('rule_key').notNull().unique(), // e.g., 'staff_see_manager_tasks', 'peer_schedule_visibility'
	name: text('name').notNull(),
	description: text('description'),
	category: visibilityCategoryEnum('category').notNull(),

	// Who this rule applies to (viewer)
	viewerRole: userRoleEnum('viewer_role'), // 'staff', 'manager', 'admin', NULL=all
	viewerGroupId: uuid('viewer_group_id').references(() => visibilityGroups.id, { onDelete: 'set null' }),

	// What they can see (target)
	targetRole: userRoleEnum('target_role'), // 'staff', 'manager', 'admin', NULL=all
	targetGroupId: uuid('target_group_id').references(() => visibilityGroups.id, { onDelete: 'set null' }),

	// The visibility setting
	visibilityLevel: visibilityLevelEnum('visibility_level').notNull().default('none'),

	isEnabled: boolean('is_enabled').notNull().default(false),
	priority: integer('priority').notNull().default(50), // Higher = checked first
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// User Visibility Grants - explicit user-level visibility overrides
export const userVisibilityGrants = pgTable('user_visibility_grants', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull(), // The viewer (forward reference to users)

	// What category of data
	dataCategory: visibilityCategoryEnum('data_category').notNull(),

	// Target specification (one of these)
	targetUserId: uuid('target_user_id'), // See specific user's data
	targetGroupId: uuid('target_group_id').references(() => visibilityGroups.id, { onDelete: 'cascade' }), // See group's data
	targetRole: userRoleEnum('target_role'), // See all of a role's data

	// Grant type
	grantType: visibilityGrantTypeEnum('grant_type').notNull().default('view'),

	// Temporal
	grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp('expires_at', { withTimezone: true }), // NULL = permanent
	grantedByUserId: uuid('granted_by_user_id'), // Forward reference to users
	reason: text('reason'),

	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Visibility Presets - predefined scenario configurations
export const visibilityPresets = pgTable('visibility_presets', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(), // 'Strict Privacy', 'Team Collaborative', 'Open Organization'
	description: text('description'),
	rules: jsonb('rules').$type<{
		ruleKey: string;
		isEnabled: boolean;
		visibilityLevel?: string;
	}[]>().notNull(),
	isSystem: boolean('is_system').notNull().default(false), // System presets can't be deleted
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Users table
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	username: text('username').notNull().unique(),
	pinHash: text('pin_hash').notNull(),
	passwordHash: text('password_hash'), // Optional password for password-based login
	role: userRoleEnum('role').notNull().default('staff'),
	userTypeId: uuid('user_type_id').references(() => userTypes.id, { onDelete: 'set null' }), // Custom user type for granular permissions
	name: text('name').notNull(),
	phone: text('phone'),
	avatarUrl: text('avatar_url'),
	hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }),
	twoFactorEnabled: boolean('two_factor_enabled').notNull().default(true),
	canListOnEbay: boolean('can_list_on_ebay').notNull().default(false), // User can claim eBay listing tasks
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Sessions table (for Lucia auth)
export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	deviceFingerprint: text('device_fingerprint'),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	lastActive: timestamp('last_active', { withTimezone: true }).notNull().defaultNow(),
	last2faAt: timestamp('last_2fa_at', { withTimezone: true }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Two-factor authentication codes
export const twoFactorCodes = pgTable('two_factor_codes', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	code: text('code').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	used: boolean('used').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Locations table
export const locations = pgTable('locations', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	address: text('address'),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Shifts table
export const shifts = pgTable('shifts', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
	startTime: timestamp('start_time', { withTimezone: true }).notNull(),
	endTime: timestamp('end_time', { withTimezone: true }).notNull(),
	notes: text('notes'),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Time entries table
export const timeEntries = pgTable('time_entries', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	shiftId: uuid('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
	clockIn: timestamp('clock_in', { withTimezone: true }).notNull(),
	clockInLat: decimal('clock_in_lat', { precision: 10, scale: 7 }),
	clockInLng: decimal('clock_in_lng', { precision: 10, scale: 7 }),
	clockInAddress: text('clock_in_address'),
	clockOut: timestamp('clock_out', { withTimezone: true }),
	clockOutLat: decimal('clock_out_lat', { precision: 10, scale: 7 }),
	clockOutLng: decimal('clock_out_lng', { precision: 10, scale: 7 }),
	clockOutAddress: text('clock_out_address'),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' })
});

// Task templates table
export const taskTemplates = pgTable('task_templates', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	description: text('description'),
	steps: jsonb('steps').$type<{ step: number; title: string; description?: string }[]>(),
	photoRequired: boolean('photo_required').notNull().default(false),
	notesRequired: boolean('notes_required').notNull().default(false),
	recurrenceRule: jsonb('recurrence_rule').$type<{
		frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
		interval?: number;
		daysOfWeek?: number[];
		timeOfDay?: string;
	}>(),
	triggerEvent: triggerEventEnum('trigger_event'),
	triggerConditions: jsonb('trigger_conditions').$type<{
		locationId?: string;
		timeWindowStart?: string;
		timeWindowEnd?: string;
	}>(),
	locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
	isActive: boolean('is_active').notNull().default(true),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Tasks table
export const tasks = pgTable('tasks', {
	id: uuid('id').primaryKey().defaultRandom(),
	templateId: uuid('template_id').references(() => taskTemplates.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	description: text('description'),
	assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
	assignmentType: taskAssignmentTypeEnum('assignment_type').notNull().default('individual'),
	priority: taskPriorityEnum('priority').notNull().default('medium'),
	dueAt: timestamp('due_at', { withTimezone: true }),
	status: taskStatusEnum('status').notNull().default('not_started'),
	photoRequired: boolean('photo_required').notNull().default(false),
	notesRequired: boolean('notes_required').notNull().default(false),
	source: taskSourceEnum('source').notNull().default('manual'),
	linkedEventId: uuid('linked_event_id'),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Task completions table
export const taskCompletions = pgTable('task_completions', {
	id: uuid('id').primaryKey().defaultRandom(),
	taskId: uuid('task_id')
		.notNull()
		.references(() => tasks.id, { onDelete: 'cascade' }),
	completedBy: uuid('completed_by')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
	notes: text('notes'),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	address: text('address'),
	// Office Manager cancellation fields
	cancelledByOfficeManager: boolean('cancelled_by_office_manager').default(false),
	cancellationReason: text('cancellation_reason'),
	countsAsMissed: boolean('counts_as_missed').default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Task photos table
export const taskPhotos = pgTable('task_photos', {
	id: uuid('id').primaryKey().defaultRandom(),
	taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
	taskCompletionId: uuid('task_completion_id').references(() => taskCompletions.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(),
	originalName: text('original_name').notNull(),
	mimeType: text('mime_type').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	capturedAt: timestamp('captured_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Task assignment rules table - configures automatic task creation and assignment
export const taskAssignmentRules = pgTable('task_assignment_rules', {
	id: uuid('id').primaryKey().defaultRandom(),
	// Either templateId OR cashCountConfigId should be set (one is required)
	templateId: uuid('template_id')
		.references(() => taskTemplates.id, { onDelete: 'cascade' }),
	cashCountConfigId: uuid('cash_count_config_id')
		.references(() => cashCountConfigs.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),

	// Trigger configuration
	triggerType: ruleTriggerTypeEnum('trigger_type').notNull(),
	triggerConfig: jsonb('trigger_config').$type<{
		hoursIntoShift?: number; // For 'time_into_shift'
		taskTemplateId?: string; // For 'task_completed' - which template triggers this
		cronExpression?: string; // For 'schedule' - e.g., '0 9 * * 1' (Mon 9am)
	}>().notNull().default({}),

	// Conditions - when should the rule apply?
	conditions: jsonb('conditions').$type<{
		locationId?: string; // Specific location only
		roles?: string[]; // User roles that trigger this rule
		daysOfWeek?: number[]; // 0=Sunday, 6=Saturday
		timeWindowStart?: string; // HH:MM format
		timeWindowEnd?: string; // HH:MM format
	}>(),

	// Assignment configuration
	assignmentType: assignmentTypeEnum('assignment_type').notNull(),
	assignmentConfig: jsonb('assignment_config').$type<{
		userId?: string; // For 'specific_user'
		roles?: string[]; // For 'role_rotation', 'location_staff', 'least_tasks'
		rotationState?: { lastAssignedUserId?: string; rotationIndex?: number }; // Internal state for rotation
	}>(),

	// Rule priority (higher = checked first)
	priority: integer('priority').notNull().default(0),

	// Lifecycle
	isActive: boolean('is_active').notNull().default(true),
	lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
	triggerCount: integer('trigger_count').notNull().default(0),

	// Audit
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Purchase requests table
export const purchaseRequests = pgTable('purchase_requests', {
	id: uuid('id').primaryKey().defaultRandom(),
	taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
	requesterId: uuid('requester_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	description: text('description').notNull(),
	proposedPrice: decimal('proposed_price', { precision: 10, scale: 2 }).notNull(),
	sellerInfo: text('seller_info'),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	address: text('address'),
	status: purchaseStatusEnum('status').notNull().default('pending'),
	decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
	decidedAt: timestamp('decided_at', { withTimezone: true }),
	decisionNotes: text('decision_notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ATM withdrawals table
export const atmWithdrawals = pgTable('atm_withdrawals', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
	withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }).notNull(),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	address: text('address'),
	receiptPhotoPath: text('receipt_photo_path'),
	status: withdrawalStatusEnum('status').notNull().default('unassigned'),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Withdrawal allocations table
export const withdrawalAllocations = pgTable('withdrawal_allocations', {
	id: uuid('id').primaryKey().defaultRandom(),
	withdrawalId: uuid('withdrawal_id')
		.notNull()
		.references(() => atmWithdrawals.id, { onDelete: 'cascade' }),
	amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
	productDescription: text('product_description'),
	purchaseRequestId: uuid('purchase_request_id').references(() => purchaseRequests.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Allocation photos table
export const allocationPhotos = pgTable('allocation_photos', {
	id: uuid('id').primaryKey().defaultRandom(),
	allocationId: uuid('allocation_id')
		.notNull()
		.references(() => withdrawalAllocations.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(),
	originalName: text('original_name').notNull(),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	capturedAt: timestamp('captured_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// PRICING DECISIONS (Item Pricing & eBay Routing)
// ============================================

// Pricing decisions table - immutable record of pricing decisions
export const pricingDecisions = pgTable('pricing_decisions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }), // Who priced it
	itemDescription: text('item_description').notNull(),
	price: decimal('price', { precision: 10, scale: 2 }).notNull(),
	priceJustification: text('price_justification').notNull(), // Why this price
	destination: pricingDestinationEnum('destination').notNull().default('store'),
	ebayReason: text('ebay_reason'), // Required when destination='ebay'
	ebayTaskId: uuid('ebay_task_id').references(() => tasks.id, { onDelete: 'set null' }), // Auto-created task for eBay items
	locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	address: text('address'),
	pricedAt: timestamp('priced_at', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	// Note: No updatedAt - pricing decisions are immutable for audit purposes
});

// Pricing decision photos table
export const pricingDecisionPhotos = pgTable('pricing_decision_photos', {
	id: uuid('id').primaryKey().defaultRandom(),
	pricingDecisionId: uuid('pricing_decision_id')
		.notNull()
		.references(() => pricingDecisions.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(),
	originalName: text('original_name').notNull(),
	mimeType: text('mime_type').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
	lat: decimal('lat', { precision: 10, scale: 7 }),
	lng: decimal('lng', { precision: 10, scale: 7 }),
	capturedAt: timestamp('captured_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// INVENTORY DROPS (Batch Item Submission with LLM Identification)
// ============================================

// Inventory drops table - batch submission of items for LLM identification
export const inventoryDrops = pgTable('inventory_drops', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }), // Who submitted the drop
	description: text('description').notNull(), // Description of the batch
	pickNotes: text('pick_notes'), // Optional notes about where items came from
	status: inventoryDropStatusEnum('status').notNull().default('pending'),
	// Upload progress tracking
	uploadStatus: inventoryDropUploadStatusEnum('upload_status').notNull().default('pending'),
	photosTotal: integer('photos_total').notNull().default(0), // Total photos to upload
	photosUploaded: integer('photos_uploaded').notNull().default(0), // Photos successfully uploaded
	uploadError: text('upload_error'), // Error message if upload failed
	// Processing tracking
	itemCount: integer('item_count').default(0), // Number of items identified
	processingError: text('processing_error'), // Error message if processing failed
	retryCount: integer('retry_count').notNull().default(0), // Number of retry attempts
	processedAt: timestamp('processed_at', { withTimezone: true }),
	reviewedAt: timestamp('reviewed_at', { withTimezone: true }), // When the drop was marked as reviewed
	// Link to finalize task
	finalizeTaskId: uuid('finalize_task_id').references(() => tasks.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Inventory drop photos table - photos uploaded with the drop
export const inventoryDropPhotos = pgTable('inventory_drop_photos', {
	id: uuid('id').primaryKey().defaultRandom(),
	dropId: uuid('drop_id')
		.notNull()
		.references(() => inventoryDrops.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(),
	originalName: text('original_name').notNull(),
	mimeType: text('mime_type').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
	orderIndex: integer('order_index').notNull().default(0), // Order of photos in the drop
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Inventory drop items table - items identified by LLM from the photos
export const inventoryDropItems = pgTable('inventory_drop_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	dropId: uuid('drop_id')
		.notNull()
		.references(() => inventoryDrops.id, { onDelete: 'cascade' }),
	itemDescription: text('item_description').notNull(), // LLM-generated description
	suggestedPrice: decimal('suggested_price', { precision: 10, scale: 2 }), // LLM-suggested price (optional)
	confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }), // 0.00-1.00
	sourcePhotoIds: jsonb('source_photo_ids').$type<string[]>().notNull().default([]), // Which photos contain this item
	pricingDecisionId: uuid('pricing_decision_id').references(() => pricingDecisions.id, { onDelete: 'set null' }), // Created after identification
	deleted: boolean('deleted').notNull().default(false), // Soft delete flag for items user wants to remove
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Conversations table
export const conversations = pgTable('conversations', {
	id: uuid('id').primaryKey().defaultRandom(),
	type: conversationTypeEnum('type').notNull().default('direct'),
	title: text('title'),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Conversation participants table
export const conversationParticipants = pgTable('conversation_participants', {
	id: uuid('id').primaryKey().defaultRandom(),
	conversationId: uuid('conversation_id')
		.notNull()
		.references(() => conversations.id, { onDelete: 'cascade' }),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
	lastReadAt: timestamp('last_read_at', { withTimezone: true }),
	isArchived: boolean('is_archived').notNull().default(false)
});

// Messages table
export const messages = pgTable('messages', {
	id: uuid('id').primaryKey().defaultRandom(),
	conversationId: uuid('conversation_id')
		.notNull()
		.references(() => conversations.id, { onDelete: 'cascade' }),
	senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
	content: text('content').notNull(),
	isSystemMessage: boolean('is_system_message').notNull().default(false),
	// Thread support
	parentMessageId: uuid('parent_message_id'),
	threadReplyCount: integer('thread_reply_count').notNull().default(0),
	lastThreadReplyAt: timestamp('last_thread_reply_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Message photos table
export const messagePhotos = pgTable('message_photos', {
	id: uuid('id').primaryKey().defaultRandom(),
	messageId: uuid('message_id')
		.notNull()
		.references(() => messages.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(),
	originalName: text('original_name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// GROUP CHAT TABLES
// ============================================

// Groups table - each group has one conversation
export const groups = pgTable('groups', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	description: text('description'),
	// Link to conversation - each group has exactly one conversation
	conversationId: uuid('conversation_id')
		.notNull()
		.references(() => conversations.id, { onDelete: 'cascade' }),
	// Auto-sync with userType
	linkedUserTypeId: uuid('linked_user_type_id')
		.references(() => userTypes.id, { onDelete: 'set null' }),
	isAutoSynced: boolean('is_auto_synced').notNull().default(false),
	// Appearance
	color: text('color').default('#6B7280'),
	// Status
	isActive: boolean('is_active').notNull().default(true),
	// Audit
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniqueConversation: unique().on(table.conversationId),
	uniqueLinkedUserType: unique().on(table.linkedUserTypeId)
}));

// Group members table
export const groupMembers = pgTable('group_members', {
	id: uuid('id').primaryKey().defaultRandom(),
	groupId: uuid('group_id')
		.notNull()
		.references(() => groups.id, { onDelete: 'cascade' }),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	// Member role within the group
	role: text('role').notNull().default('member'), // 'admin', 'member'
	// For auto-synced groups, track whether membership is auto-assigned
	isAutoAssigned: boolean('is_auto_assigned').notNull().default(false),
	joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
	addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' })
}, (table) => ({
	uniqueGroupUser: unique().on(table.groupId, table.userId)
}));

// Thread participants table - track who has participated in a thread
export const threadParticipants = pgTable('thread_participants', {
	id: uuid('id').primaryKey().defaultRandom(),
	messageId: uuid('message_id') // The parent message (thread root)
		.notNull()
		.references(() => messages.id, { onDelete: 'cascade' }),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	lastReadAt: timestamp('last_read_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniqueThreadUser: unique().on(table.messageId, table.userId)
}));

// Notifications table
export const notifications = pgTable('notifications', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	type: notificationTypeEnum('type').notNull(),
	title: text('title').notNull(),
	body: text('body'),
	data: jsonb('data').$type<Record<string, unknown>>(),
	isRead: boolean('is_read').notNull().default(false),
	readAt: timestamp('read_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Push subscriptions table
export const pushSubscriptions = pgTable('push_subscriptions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	endpoint: text('endpoint').notNull().unique(),
	keys: jsonb('keys').$type<{ p256dh: string; auth: string }>().notNull(),
	deviceInfo: text('device_info'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// App settings table
export const appSettings = pgTable('app_settings', {
	id: serial('id').primaryKey(),
	key: text('key').notNull().unique(),
	value: text('value').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Audit logs table
export const auditLogs = pgTable('audit_logs', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
	action: text('action').notNull(),
	entityType: text('entity_type').notNull(),
	entityId: text('entity_id'),
	beforeData: jsonb('before_data').$type<Record<string, unknown>>(),
	afterData: jsonb('after_data').$type<Record<string, unknown>>(),
	ipAddress: text('ip_address'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Store hours table - operating hours per location per day
export const storeHours = pgTable('store_hours', {
	id: uuid('id').primaryKey().defaultRandom(),
	locationId: uuid('location_id')
		.notNull()
		.references(() => locations.id, { onDelete: 'cascade' }),
	dayOfWeek: integer('day_of_week').notNull(), // 0=Sunday, 1=Monday, etc.
	openTime: text('open_time'), // HH:MM format, null = closed
	closeTime: text('close_time'), // HH:MM format, null = closed
	isClosed: boolean('is_closed').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Info posts table - announcements and documentation for staff
export const infoPosts = pgTable('info_posts', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	content: text('content').notNull(),
	category: text('category').notNull().default('general'), // general, contacts, how-to, policy
	isPinned: boolean('is_pinned').notNull().default(false),
	isActive: boolean('is_active').notNull().default(true),
	createdBy: uuid('created_by')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// AI SYSTEM TABLES ("Shackled Mentats")
// ============================================

// AI Configuration - one row per agent
export const aiConfig = pgTable('ai_config', {
	id: serial('id').primaryKey(),
	agent: aiAgentEnum('agent').notNull().unique(),
	enabled: boolean('enabled').notNull().default(false),
	provider: aiProviderEnum('provider').notNull().default('anthropic'),
	model: text('model').notNull().default('claude-3-haiku-20240307'),
	tone: aiToneEnum('tone').notNull().default('helpful_parent'),
	instructions: text('instructions'), // Custom instructions appended to system prompt
	cronSchedule: text('cron_schedule').notNull().default('*/15 7-19 * * *'),
	// Operational hours - easier to configure than cron
	operationalStartHour: integer('operational_start_hour').notNull().default(9), // 9 AM
	operationalEndHour: integer('operational_end_hour').notNull().default(17), // 5 PM
	operationalDays: jsonb('operational_days').$type<number[]>().default([1, 2, 3, 4, 5]), // Mon-Fri (0=Sun, 6=Sat)
	runIntervalMinutes: integer('run_interval_minutes').notNull().default(15), // How often to run
	maxTokensContext: integer('max_tokens_context').notNull().default(4000),
	temperature: decimal('temperature', { precision: 2, scale: 1 }).notNull().default('0.3'),
	dryRunMode: boolean('dry_run_mode').notNull().default(false),
	// Recipient settings - which users get AI messages
	sendToAllAdmins: boolean('send_to_all_admins').notNull().default(true),
	specificRecipientIds: jsonb('specific_recipient_ids').$type<string[]>().default([]),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// AI Actions Log - complete audit trail of all AI decisions
export const aiActions = pgTable('ai_actions', {
	id: uuid('id').primaryKey().defaultRandom(),
	agent: aiAgentEnum('agent').notNull(),
	runId: uuid('run_id').notNull(), // Groups actions from same run
	runStartedAt: timestamp('run_started_at', { withTimezone: true }).notNull(),

	// Context snapshot for quick queries
	contextSnapshot: jsonb('context_snapshot').$type<{
		clockedIn?: number;
		expectedButMissing?: number;
		overdueTasks?: number;
		pendingApprovals?: number;
		unassignedWithdrawals?: number;
		activeMemories?: number;
		activePolicies?: number;
		totalUsers?: number;
	}>(),
	contextTokens: integer('context_tokens'),

	// LLM interaction
	provider: aiProviderEnum('provider'), // anthropic, openai, segmind
	model: text('model'), // e.g., claude-sonnet-4-20250514, gpt-4o
	reasoning: text('reasoning'), // AI's explanation of its decision
	toolName: text('tool_name'), // null if observation only
	toolParams: jsonb('tool_params').$type<Record<string, unknown>>(),

	// Execution status
	executed: boolean('executed').notNull().default(false),
	executionResult: jsonb('execution_result').$type<Record<string, unknown>>(),
	blockedReason: text('blocked_reason'), // Why action wasn't executed
	error: text('error'),

	// Linked entities
	targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
	createdTaskId: uuid('created_task_id').references(() => tasks.id, { onDelete: 'set null' }),
	createdMessageId: uuid('created_message_id').references(() => messages.id, { onDelete: 'set null' }),

	// Cost tracking
	tokensUsed: integer('tokens_used'),
	costCents: integer('cost_cents'),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// AI Pending Work - tracks incomplete multi-step tasks for continuation
export const aiPendingWork = pgTable('ai_pending_work', {
	id: uuid('id').primaryKey().defaultRandom(),
	agent: aiAgentEnum('agent').notNull(),
	runId: uuid('run_id').notNull(), // Original run that created this

	// Task chain info
	remainingTasks: jsonb('remaining_tasks').$type<string[]>().notNull(),
	completedActions: jsonb('completed_actions').$type<{ tool: string; result: string }[]>().default([]),
	reason: text('reason').notNull(),

	// Status
	status: text('status').notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'expired'
	iterationCount: integer('iteration_count').notNull().default(1),
	maxIterations: integer('max_iterations').notNull().default(5),

	// Expiration (auto-expire after some time to prevent stuck tasks)
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// AI Cooldowns - prevent repeated actions
export const aiCooldowns = pgTable('ai_cooldowns', {
	id: uuid('id').primaryKey().defaultRandom(),
	agent: aiAgentEnum('agent').notNull(),
	userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
	actionType: text('action_type').notNull(), // e.g., 'send_message', 'late_reminder'
	relatedEntityId: uuid('related_entity_id'), // e.g., task ID, shift ID
	relatedEntityType: text('related_entity_type'), // e.g., 'task', 'shift'
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	reason: text('reason'),
	aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// AI Memory - long-term observations written by Revenue Optimizer
export const aiMemory = pgTable('ai_memory', {
	id: uuid('id').primaryKey().defaultRandom(),
	scope: aiMemoryScopeEnum('scope').notNull(),

	// Scope targets
	userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
	locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),

	memoryType: text('memory_type').notNull(), // 'pattern', 'preference', 'observation', 'performance'
	content: text('content').notNull(),

	// Confidence tracking
	confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull().default('0.50'),
	observationCount: integer('observation_count').notNull().default(1),
	lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull().defaultNow(),

	// Lifecycle
	isActive: boolean('is_active').notNull().default(true),
	expiresAt: timestamp('expires_at', { withTimezone: true }),

	// Audit
	createdByRunId: uuid('created_by_run_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// AI Policy Notes - dynamic behavior modifiers
export const aiPolicyNotes = pgTable('ai_policy_notes', {
	id: uuid('id').primaryKey().defaultRandom(),
	scope: aiPolicyScopeEnum('scope').notNull().default('global'),

	// Scope targets
	locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
	targetRole: userRoleEnum('target_role'),

	content: text('content').notNull(),
	priority: integer('priority').notNull().default(50), // 1-100, higher = more important

	isActive: boolean('is_active').notNull().default(true),

	// Audit
	updatedByRunId: uuid('updated_by_run_id'),
	createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// AI TOOL CONTROL PANEL TABLES
// ============================================

// AI Tool Configuration - per-tool overrides for enabling/disabling and behavior
export const aiToolConfig = pgTable('ai_tool_config', {
	id: uuid('id').primaryKey().defaultRandom(),
	agent: text('agent').notNull(), // 'office_manager' | 'revenue_optimizer' | 'architect'
	toolName: text('tool_name').notNull(),
	isEnabled: boolean('is_enabled').notNull().default(true),
	requiresConfirmation: boolean('requires_confirmation'), // null = use default from tool definition
	cooldownPerUserMinutes: integer('cooldown_per_user_minutes'),
	cooldownGlobalMinutes: integer('cooldown_global_minutes'),
	rateLimitMaxPerHour: integer('rate_limit_max_per_hour'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniqueAgentTool: unique().on(table.agent, table.toolName)
}));

// AI Tool Keywords - keywords that force a specific tool to be called
export const aiToolKeywords = pgTable('ai_tool_keywords', {
	id: uuid('id').primaryKey().defaultRandom(),
	agent: text('agent').notNull(),
	toolName: text('tool_name').notNull(),
	keyword: text('keyword').notNull(),
	matchType: text('match_type').notNull().default('contains'), // 'contains' | 'exact' | 'regex'
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// AI Context Provider Configuration - per-provider settings
export const aiContextConfig = pgTable('ai_context_config', {
	id: uuid('id').primaryKey().defaultRandom(),
	agent: text('agent').notNull(),
	providerId: text('provider_id').notNull(), // 'users', 'attendance', 'tasks', 'memory', 'locations', 'user_permissions'
	isEnabled: boolean('is_enabled').notNull().default(true),
	priorityOverride: integer('priority_override'), // null = use default from provider
	customContext: text('custom_context'), // "Always include" text appended to provider output
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniqueAgentProvider: unique().on(table.agent, table.providerId)
}));

// AI Context Keywords - keywords that trigger context injection from a specific provider
export const aiContextKeywords = pgTable('ai_context_keywords', {
	id: uuid('id').primaryKey().defaultRandom(),
	agent: text('agent').notNull(),
	providerId: text('provider_id').notNull(),
	keyword: text('keyword').notNull(),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ============================================
// ARCHITECTURE ADVISOR (ADA) TABLES
// ============================================

// Architecture Decisions - ADRs created by Ada
export const architectureDecisions = pgTable('architecture_decisions', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	status: architectureStatusEnum('status').notNull().default('proposed'),
	category: architectureCategoryEnum('category').notNull(),

	// ADR Content
	context: text('context').notNull(), // Why is this needed?
	decision: text('decision').notNull(), // What are we doing?
	consequences: text('consequences'), // Tradeoffs and implications

	// Claude Code Integration
	claudeCodePrompt: text('claude_code_prompt'), // Generated prompt for Claude Code
	implementationPlan: jsonb('implementation_plan').$type<{
		phases: { name: string; tasks: string[]; dependencies?: string[] }[];
	}>(),

	// Related files and implementation tracking
	relatedFiles: jsonb('related_files').$type<string[]>(),
	implementedAt: timestamp('implemented_at', { withTimezone: true }),

	// Audit
	createdByAiRunId: uuid('created_by_ai_run_id'),
	createdByChatId: uuid('created_by_chat_id'),
	createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Architecture Chats - Interactive sessions with Ada
export const architectureChats = pgTable('architecture_chats', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title'),

	// Conversation history
	messages: jsonb('messages').$type<{
		role: 'user' | 'assistant';
		content: string;
		timestamp: string;
		toolCalls?: { name: string; params: unknown; result?: unknown }[];
	}[]>().notNull().default([]),

	// Context configuration
	contextModules: jsonb('context_modules').$type<string[]>(), // Which context to include

	// Usage tracking
	tokensUsed: integer('tokens_used').default(0),
	costCents: integer('cost_cents').default(0),
	decisionsCreated: jsonb('decisions_created').$type<string[]>().default([]),
	promptsGenerated: integer('prompts_generated').default(0),

	// Audit
	createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Presentation mode enum for multi-model results
export const presentationModeEnum = pgEnum('presentation_mode', [
	'synthesized',
	'side_by_side',
	'primary_with_notes'
]);

// Architect-specific configuration for multi-model consultation
export const architectConfig = pgTable('architect_config', {
	id: serial('id').primaryKey(),

	// Tier 1: Quick responses (simple questions)
	quickProvider: aiProviderEnum('quick_provider').notNull().default('anthropic'),
	quickModel: text('quick_model').notNull().default('claude-sonnet-4-20250514'),

	// Tier 2: Standard conversation
	standardProvider: aiProviderEnum('standard_provider').notNull().default('anthropic'),
	standardModel: text('standard_model').notNull().default('claude-opus-4-20250514'),

	// Tier 3: Deliberation - Primary (main recommendation)
	deliberatePrimaryProvider: aiProviderEnum('deliberate_primary_provider').notNull().default('anthropic'),
	deliberatePrimaryModel: text('deliberate_primary_model').notNull().default('claude-opus-4-20250514'),

	// Tier 3: Deliberation - Reviewer (different provider for perspective)
	deliberateReviewProvider: aiProviderEnum('deliberate_review_provider').notNull().default('openai'),
	deliberateReviewModel: text('deliberate_review_model').notNull().default('gpt-4o'),

	// Tier 3: Deliberation - Synthesizer
	deliberateSynthProvider: aiProviderEnum('deliberate_synth_provider').notNull().default('anthropic'),
	deliberateSynthModel: text('deliberate_synth_model').notNull().default('claude-sonnet-4-20250514'),

	// Deliberation triggers
	triggerOnADRCreation: boolean('trigger_on_adr_creation').notNull().default(true),
	triggerOnPromptGeneration: boolean('trigger_on_prompt_generation').notNull().default(true),
	triggerOnSchemaDesign: boolean('trigger_on_schema_design').notNull().default(true),
	triggerOnExplicitRequest: boolean('trigger_on_explicit_request').notNull().default(true),

	// Presentation mode: how to show multi-model results
	presentationMode: presentationModeEnum('presentation_mode').notNull().default('synthesized'),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type ArchitectConfig = typeof architectConfig.$inferSelect;
export type NewArchitectConfig = typeof architectConfig.$inferInsert;

// ============================================
// OFFICE MANAGER CHAT TABLES
// ============================================

// Office Manager Chat Sessions
export const officeManagerChats = pgTable('office_manager_chats', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	messages: jsonb('messages').$type<OfficeManagerMessage[]>().default([]),
	summary: text('summary'), // AI-generated summary for long-term memory
	topics: jsonb('topics').$type<string[]>().default([]), // Key topics for searchability
	actionsPerformed: jsonb('actions_performed').$type<string[]>().default([]), // Tools used in this chat
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Office Manager Message type
export interface OfficeManagerMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
	toolCalls?: {
		name: string;
		params: Record<string, unknown>;
		result?: unknown;
		pendingActionId?: string;
	}[];
}

// Pending Actions for confirmation workflow
export const officeManagerPendingActions = pgTable('office_manager_pending_actions', {
	id: uuid('id').primaryKey().defaultRandom(),
	chatId: uuid('chat_id')
		.notNull()
		.references(() => officeManagerChats.id, { onDelete: 'cascade' }),
	toolName: text('tool_name').notNull(),
	toolArgs: jsonb('tool_args').$type<Record<string, unknown>>().notNull(),
	confirmationMessage: text('confirmation_message').notNull(),
	status: pendingActionStatusEnum('status').notNull().default('pending'),
	executionResult: jsonb('execution_result').$type<Record<string, unknown>>(),
	executedAt: timestamp('executed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

// ============================================
// CASH COUNT TABLES
// ============================================

// Cash Count Field type
export interface CashCountField {
	name: string;
	label: string;
	type: 'currency' | 'integer' | 'decimal';
	multiplier?: number; // For denominations, e.g., 0.25 for quarters
	required?: boolean;
	order: number;
}

// Cash Count Configuration (per location)
export const cashCountConfigs = pgTable('cash_count_configs', {
	id: uuid('id').primaryKey().defaultRandom(),
	locationId: uuid('location_id')
		.notNull()
		.references(() => locations.id, { onDelete: 'cascade' }),
	name: text('name').notNull(), // e.g., "Opening Count", "Closing Count"
	fields: jsonb('fields').$type<CashCountField[]>().notNull(),
	triggerType: cashCountTriggerEnum('trigger_type').notNull(),
	isActive: boolean('is_active').notNull().default(true),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Cash Count Submissions
export const cashCounts = pgTable('cash_counts', {
	id: uuid('id').primaryKey().defaultRandom(),
	configId: uuid('config_id')
		.notNull()
		.references(() => cashCountConfigs.id, { onDelete: 'cascade' }),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	locationId: uuid('location_id')
		.notNull()
		.references(() => locations.id, { onDelete: 'cascade' }),
	timeEntryId: uuid('time_entry_id').references(() => timeEntries.id, { onDelete: 'set null' }),
	values: jsonb('values').$type<Record<string, number>>().notNull(),
	totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
	notes: text('notes'),
	submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow()
});

// Cash Count Task Links (connects tasks to cash count configs)
export const cashCountTaskLinks = pgTable('cash_count_task_links', {
	id: uuid('id').primaryKey().defaultRandom(),
	taskId: uuid('task_id')
		.notNull()
		.references(() => tasks.id, { onDelete: 'cascade' }),
	configId: uuid('config_id')
		.notNull()
		.references(() => cashCountConfigs.id, { onDelete: 'cascade' }),
	locationId: uuid('location_id')
		.notNull()
		.references(() => locations.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type CashCountTaskLink = typeof cashCountTaskLinks.$inferSelect;
export type NewCashCountTaskLink = typeof cashCountTaskLinks.$inferInsert;

// ============================================
// SOCIAL MEDIA METRICS SYSTEM
// ============================================

export const socialMediaPlatformEnum = pgEnum('social_media_platform', ['instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'other']);

// Social Media Field Type
export interface SocialMediaField {
	name: string;
	label: string;
	type: 'integer' | 'decimal' | 'percentage' | 'currency';
	required?: boolean;
	order: number;
}

// Social Media Configurations
export const socialMediaConfigs = pgTable('social_media_configs', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	platform: socialMediaPlatformEnum('platform').notNull(),
	fields: jsonb('fields').$type<SocialMediaField[]>().notNull(),
	requireUrl: boolean('require_url').notNull().default(true),
	requireScreenshot: boolean('require_screenshot').notNull().default(false),
	isActive: boolean('is_active').notNull().default(true),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Social Media Task Links (connects tasks to social media configs)
export const socialMediaTaskLinks = pgTable('social_media_task_links', {
	id: uuid('id').primaryKey().defaultRandom(),
	taskId: uuid('task_id')
		.notNull()
		.references(() => tasks.id, { onDelete: 'cascade' }),
	configId: uuid('config_id')
		.notNull()
		.references(() => socialMediaConfigs.id, { onDelete: 'cascade' }),
	postUrl: text('post_url'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Social Media Submissions
export const socialMediaSubmissions = pgTable('social_media_submissions', {
	id: uuid('id').primaryKey().defaultRandom(),
	taskId: uuid('task_id')
		.notNull()
		.references(() => tasks.id, { onDelete: 'cascade' }),
	configId: uuid('config_id')
		.notNull()
		.references(() => socialMediaConfigs.id, { onDelete: 'cascade' }),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	postUrl: text('post_url').notNull(),
	values: jsonb('values').$type<Record<string, number>>().notNull(),
	notes: text('notes'),
	submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow()
});

export type SocialMediaConfig = typeof socialMediaConfigs.$inferSelect;
export type NewSocialMediaConfig = typeof socialMediaConfigs.$inferInsert;
export type SocialMediaTaskLink = typeof socialMediaTaskLinks.$inferSelect;
export type SocialMediaSubmission = typeof socialMediaSubmissions.$inferSelect;

// ============================================
// JOB QUEUE TABLE (Database-backed job queue for background processing)
// ============================================

export const jobs = pgTable('jobs', {
	id: uuid('id').primaryKey().defaultRandom(),
	type: text('type').notNull(), // 'inventory_drop_upload', 'inventory_drop_process', etc.
	status: jobStatusEnum('status').notNull().default('pending'),
	priority: integer('priority').notNull().default(0), // Higher = more urgent
	payload: jsonb('payload').$type<Record<string, unknown>>().notNull(), // Job-specific data
	result: jsonb('result').$type<Record<string, unknown>>(), // Job result on completion
	error: text('error'), // Error message if failed
	attempts: integer('attempts').notNull().default(0), // Number of attempts
	maxAttempts: integer('max_attempts').notNull().default(3),
	runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(), // When to run the job
	startedAt: timestamp('started_at', { withTimezone: true }), // When processing started
	completedAt: timestamp('completed_at', { withTimezone: true }), // When processing finished
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

// Relations

// Access Control Relations
export const userTypesRelations = relations(userTypes, ({ many }) => ({
	users: many(users),
	permissions: many(userTypePermissions)
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
	userTypePermissions: many(userTypePermissions)
}));

export const userTypePermissionsRelations = relations(userTypePermissions, ({ one }) => ({
	userType: one(userTypes, {
		fields: [userTypePermissions.userTypeId],
		references: [userTypes.id]
	}),
	permission: one(permissions, {
		fields: [userTypePermissions.permissionId],
		references: [permissions.id]
	})
}));

export const usersRelations = relations(users, ({ one, many }) => ({
	userType: one(userTypes, {
		fields: [users.userTypeId],
		references: [userTypes.id]
	}),
	sessions: many(sessions),
	shifts: many(shifts),
	timeEntries: many(timeEntries),
	tasks: many(tasks),
	purchaseRequests: many(purchaseRequests),
	atmWithdrawals: many(atmWithdrawals),
	notifications: many(notifications),
	pushSubscriptions: many(pushSubscriptions)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	})
}));

export const shiftsRelations = relations(shifts, ({ one }) => ({
	user: one(users, {
		fields: [shifts.userId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [shifts.locationId],
		references: [locations.id]
	})
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
	user: one(users, {
		fields: [timeEntries.userId],
		references: [users.id]
	}),
	shift: one(shifts, {
		fields: [timeEntries.shiftId],
		references: [shifts.id]
	})
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
	template: one(taskTemplates, {
		fields: [tasks.templateId],
		references: [taskTemplates.id]
	}),
	assignee: one(users, {
		fields: [tasks.assignedTo],
		references: [users.id]
	}),
	completions: many(taskCompletions),
	photos: many(taskPhotos)
}));

export const taskCompletionsRelations = relations(taskCompletions, ({ one, many }) => ({
	task: one(tasks, {
		fields: [taskCompletions.taskId],
		references: [tasks.id]
	}),
	completedByUser: one(users, {
		fields: [taskCompletions.completedBy],
		references: [users.id]
	}),
	photos: many(taskPhotos)
}));

export const taskAssignmentRulesRelations = relations(taskAssignmentRules, ({ one }) => ({
	template: one(taskTemplates, {
		fields: [taskAssignmentRules.templateId],
		references: [taskTemplates.id]
	}),
	cashCountConfig: one(cashCountConfigs, {
		fields: [taskAssignmentRules.cashCountConfigId],
		references: [cashCountConfigs.id]
	}),
	createdByUser: one(users, {
		fields: [taskAssignmentRules.createdBy],
		references: [users.id]
	})
}));

export const taskTemplatesRelations = relations(taskTemplates, ({ one, many }) => ({
	location: one(locations, {
		fields: [taskTemplates.locationId],
		references: [locations.id]
	}),
	createdByUser: one(users, {
		fields: [taskTemplates.createdBy],
		references: [users.id]
	}),
	tasks: many(tasks),
	assignmentRules: many(taskAssignmentRules)
}));

export const purchaseRequestsRelations = relations(purchaseRequests, ({ one }) => ({
	requester: one(users, {
		fields: [purchaseRequests.requesterId],
		references: [users.id]
	}),
	task: one(tasks, {
		fields: [purchaseRequests.taskId],
		references: [tasks.id]
	}),
	decider: one(users, {
		fields: [purchaseRequests.decidedBy],
		references: [users.id]
	})
}));

export const atmWithdrawalsRelations = relations(atmWithdrawals, ({ one, many }) => ({
	user: one(users, {
		fields: [atmWithdrawals.userId],
		references: [users.id]
	}),
	allocations: many(withdrawalAllocations)
}));

export const withdrawalAllocationsRelations = relations(withdrawalAllocations, ({ one, many }) => ({
	withdrawal: one(atmWithdrawals, {
		fields: [withdrawalAllocations.withdrawalId],
		references: [atmWithdrawals.id]
	}),
	purchaseRequest: one(purchaseRequests, {
		fields: [withdrawalAllocations.purchaseRequestId],
		references: [purchaseRequests.id]
	}),
	photos: many(allocationPhotos)
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
	creator: one(users, {
		fields: [conversations.createdBy],
		references: [users.id]
	}),
	participants: many(conversationParticipants),
	messages: many(messages),
	group: one(groups, {
		fields: [conversations.id],
		references: [groups.conversationId]
	})
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
	conversation: one(conversations, {
		fields: [conversationParticipants.conversationId],
		references: [conversations.id]
	}),
	user: one(users, {
		fields: [conversationParticipants.userId],
		references: [users.id]
	})
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id]
	}),
	sender: one(users, {
		fields: [messages.senderId],
		references: [users.id]
	}),
	photos: many(messagePhotos),
	// Thread support
	parentMessage: one(messages, {
		fields: [messages.parentMessageId],
		references: [messages.id],
		relationName: 'threadReplies'
	}),
	threadReplies: many(messages, { relationName: 'threadReplies' }),
	threadParticipants: many(threadParticipants)
}));

// Group Chat Relations
export const groupsRelations = relations(groups, ({ one, many }) => ({
	conversation: one(conversations, {
		fields: [groups.conversationId],
		references: [conversations.id]
	}),
	linkedUserType: one(userTypes, {
		fields: [groups.linkedUserTypeId],
		references: [userTypes.id]
	}),
	members: many(groupMembers),
	createdByUser: one(users, {
		fields: [groups.createdBy],
		references: [users.id]
	})
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
	group: one(groups, {
		fields: [groupMembers.groupId],
		references: [groups.id]
	}),
	user: one(users, {
		fields: [groupMembers.userId],
		references: [users.id]
	}),
	addedByUser: one(users, {
		fields: [groupMembers.addedBy],
		references: [users.id]
	})
}));

export const threadParticipantsRelations = relations(threadParticipants, ({ one }) => ({
	message: one(messages, {
		fields: [threadParticipants.messageId],
		references: [messages.id]
	}),
	user: one(users, {
		fields: [threadParticipants.userId],
		references: [users.id]
	})
}));

// Pricing Decisions Relations
export const pricingDecisionsRelations = relations(pricingDecisions, ({ one, many }) => ({
	user: one(users, {
		fields: [pricingDecisions.userId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [pricingDecisions.locationId],
		references: [locations.id]
	}),
	ebayTask: one(tasks, {
		fields: [pricingDecisions.ebayTaskId],
		references: [tasks.id]
	}),
	photos: many(pricingDecisionPhotos)
}));

export const pricingDecisionPhotosRelations = relations(pricingDecisionPhotos, ({ one }) => ({
	pricingDecision: one(pricingDecisions, {
		fields: [pricingDecisionPhotos.pricingDecisionId],
		references: [pricingDecisions.id]
	})
}));

// Inventory Drops Relations
export const inventoryDropsRelations = relations(inventoryDrops, ({ one, many }) => ({
	user: one(users, {
		fields: [inventoryDrops.userId],
		references: [users.id]
	}),
	photos: many(inventoryDropPhotos),
	items: many(inventoryDropItems)
}));

export const inventoryDropPhotosRelations = relations(inventoryDropPhotos, ({ one }) => ({
	drop: one(inventoryDrops, {
		fields: [inventoryDropPhotos.dropId],
		references: [inventoryDrops.id]
	})
}));

export const inventoryDropItemsRelations = relations(inventoryDropItems, ({ one }) => ({
	drop: one(inventoryDrops, {
		fields: [inventoryDropItems.dropId],
		references: [inventoryDrops.id]
	}),
	pricingDecision: one(pricingDecisions, {
		fields: [inventoryDropItems.pricingDecisionId],
		references: [pricingDecisions.id]
	})
}));

// AI System Relations
export const aiActionsRelations = relations(aiActions, ({ one }) => ({
	targetUser: one(users, {
		fields: [aiActions.targetUserId],
		references: [users.id]
	}),
	createdTask: one(tasks, {
		fields: [aiActions.createdTaskId],
		references: [tasks.id]
	}),
	createdMessage: one(messages, {
		fields: [aiActions.createdMessageId],
		references: [messages.id]
	})
}));

export const aiCooldownsRelations = relations(aiCooldowns, ({ one }) => ({
	user: one(users, {
		fields: [aiCooldowns.userId],
		references: [users.id]
	}),
	aiAction: one(aiActions, {
		fields: [aiCooldowns.aiActionId],
		references: [aiActions.id]
	})
}));

export const aiMemoryRelations = relations(aiMemory, ({ one }) => ({
	user: one(users, {
		fields: [aiMemory.userId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [aiMemory.locationId],
		references: [locations.id]
	})
}));

export const aiPolicyNotesRelations = relations(aiPolicyNotes, ({ one }) => ({
	location: one(locations, {
		fields: [aiPolicyNotes.locationId],
		references: [locations.id]
	}),
	createdByUser: one(users, {
		fields: [aiPolicyNotes.createdByUserId],
		references: [users.id]
	})
}));

// Architecture Advisor Relations
export const architectureDecisionsRelations = relations(architectureDecisions, ({ one }) => ({
	createdByUser: one(users, {
		fields: [architectureDecisions.createdByUserId],
		references: [users.id]
	}),
	chat: one(architectureChats, {
		fields: [architectureDecisions.createdByChatId],
		references: [architectureChats.id]
	})
}));

export const architectureChatsRelations = relations(architectureChats, ({ one, many }) => ({
	createdByUser: one(users, {
		fields: [architectureChats.createdByUserId],
		references: [users.id]
	}),
	decisions: many(architectureDecisions)
}));

// Office Manager Chat Relations
export const officeManagerChatsRelations = relations(officeManagerChats, ({ one, many }) => ({
	user: one(users, {
		fields: [officeManagerChats.userId],
		references: [users.id]
	}),
	pendingActions: many(officeManagerPendingActions)
}));

export const officeManagerPendingActionsRelations = relations(officeManagerPendingActions, ({ one }) => ({
	chat: one(officeManagerChats, {
		fields: [officeManagerPendingActions.chatId],
		references: [officeManagerChats.id]
	})
}));

// Cash Count Relations
export const cashCountConfigsRelations = relations(cashCountConfigs, ({ one, many }) => ({
	location: one(locations, {
		fields: [cashCountConfigs.locationId],
		references: [locations.id]
	}),
	createdByUser: one(users, {
		fields: [cashCountConfigs.createdBy],
		references: [users.id]
	}),
	cashCounts: many(cashCounts)
}));

export const cashCountsRelations = relations(cashCounts, ({ one }) => ({
	config: one(cashCountConfigs, {
		fields: [cashCounts.configId],
		references: [cashCountConfigs.id]
	}),
	user: one(users, {
		fields: [cashCounts.userId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [cashCounts.locationId],
		references: [locations.id]
	}),
	timeEntry: one(timeEntries, {
		fields: [cashCounts.timeEntryId],
		references: [timeEntries.id]
	})
}));

// Data Visibility Relations
export const visibilityGroupsRelations = relations(visibilityGroups, ({ one, many }) => ({
	location: one(locations, {
		fields: [visibilityGroups.locationId],
		references: [locations.id]
	}),
	members: many(visibilityGroupMembers),
	rulesAsViewer: many(visibilityRules, { relationName: 'viewerGroup' }),
	rulesAsTarget: many(visibilityRules, { relationName: 'targetGroup' }),
	grants: many(userVisibilityGrants)
}));

export const visibilityGroupMembersRelations = relations(visibilityGroupMembers, ({ one }) => ({
	group: one(visibilityGroups, {
		fields: [visibilityGroupMembers.groupId],
		references: [visibilityGroups.id]
	}),
	user: one(users, {
		fields: [visibilityGroupMembers.userId],
		references: [users.id]
	})
}));

export const visibilityRulesRelations = relations(visibilityRules, ({ one }) => ({
	viewerGroup: one(visibilityGroups, {
		fields: [visibilityRules.viewerGroupId],
		references: [visibilityGroups.id],
		relationName: 'viewerGroup'
	}),
	targetGroup: one(visibilityGroups, {
		fields: [visibilityRules.targetGroupId],
		references: [visibilityGroups.id],
		relationName: 'targetGroup'
	})
}));

export const userVisibilityGrantsRelations = relations(userVisibilityGrants, ({ one }) => ({
	user: one(users, {
		fields: [userVisibilityGrants.userId],
		references: [users.id],
		relationName: 'grantsAsViewer'
	}),
	targetUser: one(users, {
		fields: [userVisibilityGrants.targetUserId],
		references: [users.id],
		relationName: 'grantsAsTarget'
	}),
	targetGroup: one(visibilityGroups, {
		fields: [userVisibilityGrants.targetGroupId],
		references: [visibilityGroups.id]
	}),
	grantedByUser: one(users, {
		fields: [userVisibilityGrants.grantedByUserId],
		references: [users.id],
		relationName: 'grantsMade'
	})
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type NewTaskTemplate = typeof taskTemplates.$inferInsert;
export type TaskAssignmentRule = typeof taskAssignmentRules.$inferSelect;
export type NewTaskAssignmentRule = typeof taskAssignmentRules.$inferInsert;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type AtmWithdrawal = typeof atmWithdrawals.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type StoreHours = typeof storeHours.$inferSelect;
export type InfoPost = typeof infoPosts.$inferSelect;

// Pricing System Types
export type PricingDecision = typeof pricingDecisions.$inferSelect;
export type NewPricingDecision = typeof pricingDecisions.$inferInsert;
export type PricingDecisionPhoto = typeof pricingDecisionPhotos.$inferSelect;
export type NewPricingDecisionPhoto = typeof pricingDecisionPhotos.$inferInsert;

// AI System Types
export type AIConfig = typeof aiConfig.$inferSelect;
export type NewAIConfig = typeof aiConfig.$inferInsert;
export type AIAction = typeof aiActions.$inferSelect;
export type NewAIAction = typeof aiActions.$inferInsert;
export type AICooldown = typeof aiCooldowns.$inferSelect;
export type NewAICooldown = typeof aiCooldowns.$inferInsert;
export type AIMemory = typeof aiMemory.$inferSelect;
export type NewAIMemory = typeof aiMemory.$inferInsert;
export type AIPolicyNote = typeof aiPolicyNotes.$inferSelect;
export type NewAIPolicyNote = typeof aiPolicyNotes.$inferInsert;

// Architecture Advisor Types
export type ArchitectureDecision = typeof architectureDecisions.$inferSelect;
export type NewArchitectureDecision = typeof architectureDecisions.$inferInsert;
export type ArchitectureChat = typeof architectureChats.$inferSelect;
export type NewArchitectureChat = typeof architectureChats.$inferInsert;

// Inventory Drops Types
export type InventoryDrop = typeof inventoryDrops.$inferSelect;
export type NewInventoryDrop = typeof inventoryDrops.$inferInsert;
export type InventoryDropPhoto = typeof inventoryDropPhotos.$inferSelect;
export type NewInventoryDropPhoto = typeof inventoryDropPhotos.$inferInsert;
export type InventoryDropItem = typeof inventoryDropItems.$inferSelect;
export type NewInventoryDropItem = typeof inventoryDropItems.$inferInsert;

// Office Manager Chat Types
export type OfficeManagerChat = typeof officeManagerChats.$inferSelect;
export type NewOfficeManagerChat = typeof officeManagerChats.$inferInsert;
export type OfficeManagerPendingAction = typeof officeManagerPendingActions.$inferSelect;
export type NewOfficeManagerPendingAction = typeof officeManagerPendingActions.$inferInsert;

// Cash Count Types
export type CashCountConfig = typeof cashCountConfigs.$inferSelect;
export type NewCashCountConfig = typeof cashCountConfigs.$inferInsert;
export type CashCount = typeof cashCounts.$inferSelect;
export type NewCashCount = typeof cashCounts.$inferInsert;

// Access Control Types
export type UserType = typeof userTypes.$inferSelect;
export type NewUserType = typeof userTypes.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type UserTypePermission = typeof userTypePermissions.$inferSelect;
export type NewUserTypePermission = typeof userTypePermissions.$inferInsert;

// AI Tool Control Panel Types
export type AIToolConfig = typeof aiToolConfig.$inferSelect;
export type NewAIToolConfig = typeof aiToolConfig.$inferInsert;
export type AIToolKeyword = typeof aiToolKeywords.$inferSelect;
export type NewAIToolKeyword = typeof aiToolKeywords.$inferInsert;
export type AIContextConfig = typeof aiContextConfig.$inferSelect;
export type NewAIContextConfig = typeof aiContextConfig.$inferInsert;
export type AIContextKeyword = typeof aiContextKeywords.$inferSelect;
export type NewAIContextKeyword = typeof aiContextKeywords.$inferInsert;

// Data Visibility Types
export type VisibilityGroup = typeof visibilityGroups.$inferSelect;
export type NewVisibilityGroup = typeof visibilityGroups.$inferInsert;
export type VisibilityGroupMember = typeof visibilityGroupMembers.$inferSelect;
export type NewVisibilityGroupMember = typeof visibilityGroupMembers.$inferInsert;
export type VisibilityRule = typeof visibilityRules.$inferSelect;
export type NewVisibilityRule = typeof visibilityRules.$inferInsert;
export type UserVisibilityGrant = typeof userVisibilityGrants.$inferSelect;
export type NewUserVisibilityGrant = typeof userVisibilityGrants.$inferInsert;
export type VisibilityPreset = typeof visibilityPresets.$inferSelect;
export type NewVisibilityPreset = typeof visibilityPresets.$inferInsert;

// ============================================================================
// SALES METRICS
// ============================================================================

// Vendor sales detail (stored in JSONB for flexibility)
export interface VendorSalesData {
	vendor_id: string;
	vendor_name: string;
	total_sales: number;
	vendor_amount: number;
	retained_amount: number;
	// Future: linked TeamTime user
	linked_user_id?: string;
}

// Sales Snapshots - periodic captures of daily sales from LOB software
export const salesSnapshots = pgTable('sales_snapshots', {
	id: uuid('id').primaryKey().defaultRandom(),

	// When this snapshot was captured
	capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),

	// The business day this data represents
	saleDate: date('sale_date').notNull(),

	// Totals
	totalSales: decimal('total_sales', { precision: 12, scale: 2 }).notNull(),
	totalVendorAmount: decimal('total_vendor_amount', { precision: 12, scale: 2 }).notNull(),
	totalRetained: decimal('total_retained', { precision: 12, scale: 2 }).notNull(),
	vendorCount: integer('vendor_count').notNull(),

	// Per-vendor breakdown (JSONB for flexibility)
	vendors: jsonb('vendors').$type<VendorSalesData[]>().notNull(),

	// Source tracking
	source: text('source').default('scraper'), // 'scraper', 'manual', 'api'

	// For linking to scheduled AI runs
	aiRunId: uuid('ai_run_id'),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Index for efficient date range queries
// Note: Add via migration: CREATE INDEX idx_sales_snapshots_sale_date ON sales_snapshots(sale_date);

// Sales Snapshot Types
export type SalesSnapshot = typeof salesSnapshots.$inferSelect;
export type NewSalesSnapshot = typeof salesSnapshots.$inferInsert;

// ============================================================================
// GAMIFICATION SYSTEM
// ============================================================================

// Point Transactions - Immutable ledger of all point changes
export const pointTransactions = pgTable('point_transactions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	points: integer('points').notNull(), // Can be negative for penalties
	category: pointCategoryEnum('category').notNull(),
	action: text('action').notNull(), // 'clock_in_on_time', 'task_completed', etc.
	description: text('description'),
	multiplier: decimal('multiplier', { precision: 3, scale: 2 }).default('1.00'),
	basePoints: integer('base_points').notNull(), // Points before multiplier
	sourceType: text('source_type'), // 'time_entry', 'task', 'pricing_decision', 'sales_snapshot'
	sourceId: uuid('source_id'), // ID of the source record
	metadata: jsonb('metadata'), // Additional context (streak count, grade details, etc.)
	earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// User Stats - Aggregated performance metrics per user
export const userStats = pgTable('user_stats', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),

	// Points
	totalPoints: integer('total_points').notNull().default(0),
	weeklyPoints: integer('weekly_points').notNull().default(0),
	monthlyPoints: integer('monthly_points').notNull().default(0),

	// Level
	level: integer('level').notNull().default(1),
	levelProgress: integer('level_progress').notNull().default(0), // Points toward next level

	// Streaks
	currentStreak: integer('current_streak').notNull().default(0), // Days
	longestStreak: integer('longest_streak').notNull().default(0),
	lastStreakDate: date('last_streak_date'), // Last day streak was maintained

	// Category totals (lifetime)
	attendancePoints: integer('attendance_points').notNull().default(0),
	taskPoints: integer('task_points').notNull().default(0),
	pricingPoints: integer('pricing_points').notNull().default(0),
	salesPoints: integer('sales_points').notNull().default(0),

	// Performance metrics
	tasksCompleted: integer('tasks_completed').notNull().default(0),
	tasksOnTime: integer('tasks_on_time').notNull().default(0),
	pricingDecisions: integer('pricing_decisions').notNull().default(0),
	avgPricingGrade: decimal('avg_pricing_grade', { precision: 3, scale: 2 }),
	onTimeRate: decimal('on_time_rate', { precision: 5, scale: 2 }), // Percentage

	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Achievement criteria type for JSONB storage
export interface AchievementCriteria {
	type: 'streak' | 'count' | 'threshold' | 'cumulative';
	field?: string; // Field in userStats to check
	value: number; // Target value
	comparison?: 'gte' | 'eq' | 'lte'; // Default: gte
}

// Achievements - Badge/achievement definitions
export const achievements = pgTable('achievements', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: text('code').notNull().unique(), // 'FIRST_CLOCK_IN', 'STREAK_7', 'PRICING_MASTER'
	name: text('name').notNull(),
	description: text('description').notNull(),
	category: pointCategoryEnum('category').notNull(),
	tier: achievementTierEnum('tier').notNull(),
	icon: text('icon'), // Icon name or emoji
	pointReward: integer('point_reward').notNull().default(0),
	criteria: jsonb('criteria').$type<AchievementCriteria>().notNull(),
	isSecret: boolean('is_secret').notNull().default(false), // Hidden until earned
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// User Achievements - Earned achievements per user
export const userAchievements = pgTable('user_achievements', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	achievementId: uuid('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
	earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
	notifiedAt: timestamp('notified_at', { withTimezone: true }) // When user was notified
}, (table) => ({
	uniqueUserAchievement: unique().on(table.userId, table.achievementId)
}));

// Pricing Grades - Admin grading for pricing decisions
export const pricingGrades = pgTable('pricing_grades', {
	id: uuid('id').primaryKey().defaultRandom(),
	pricingDecisionId: uuid('pricing_decision_id').notNull().unique().references(() => pricingDecisions.id, { onDelete: 'cascade' }),
	gradedBy: uuid('graded_by').notNull().references(() => users.id, { onDelete: 'set null' }),

	// Grade components (1-5 scale)
	priceAccuracy: integer('price_accuracy').notNull(),
	justificationQuality: integer('justification_quality').notNull(),
	photoQuality: integer('photo_quality').notNull(),
	overallGrade: decimal('overall_grade', { precision: 3, scale: 2 }).notNull(), // Weighted average

	feedback: text('feedback'), // Optional admin notes
	pointsAwarded: integer('points_awarded').notNull(), // Points given based on grade

	gradedAt: timestamp('graded_at', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Leaderboard ranking entry type for JSONB storage
export interface LeaderboardRanking {
	rank: number;
	userId: string;
	userName: string;
	points: number;
	breakdown: {
		attendance: number;
		tasks: number;
		pricing: number;
		sales: number;
	};
}

// Leaderboard Snapshots - Historical leaderboard data
export const leaderboardSnapshots = pgTable('leaderboard_snapshots', {
	id: uuid('id').primaryKey().defaultRandom(),
	period: leaderboardPeriodEnum('period').notNull(),
	periodStart: date('period_start').notNull(),
	periodEnd: date('period_end').notNull(),
	rankings: jsonb('rankings').$type<LeaderboardRanking[]>().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	uniquePeriod: unique().on(table.period, table.periodStart)
}));

// Team Goals - Collective team objectives
export const teamGoals = pgTable('team_goals', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	description: text('description'),
	targetValue: integer('target_value').notNull(),
	currentValue: integer('current_value').notNull().default(0),
	metricType: text('metric_type').notNull(), // 'total_sales', 'tasks_completed', 'pricing_decisions'
	bonusPoints: integer('bonus_points').notNull(), // Points each member gets if goal met
	startDate: date('start_date').notNull(),
	endDate: date('end_date').notNull(),
	isActive: boolean('is_active').notNull().default(true),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Gamification Relations
export const pointTransactionsRelations = relations(pointTransactions, ({ one }) => ({
	user: one(users, {
		fields: [pointTransactions.userId],
		references: [users.id]
	})
}));

export const userStatsRelations = relations(userStats, ({ one }) => ({
	user: one(users, {
		fields: [userStats.userId],
		references: [users.id]
	})
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
	user: one(users, {
		fields: [userAchievements.userId],
		references: [users.id]
	}),
	achievement: one(achievements, {
		fields: [userAchievements.achievementId],
		references: [achievements.id]
	})
}));

export const pricingGradesRelations = relations(pricingGrades, ({ one }) => ({
	pricingDecision: one(pricingDecisions, {
		fields: [pricingGrades.pricingDecisionId],
		references: [pricingDecisions.id]
	}),
	grader: one(users, {
		fields: [pricingGrades.gradedBy],
		references: [users.id]
	})
}));

export const teamGoalsRelations = relations(teamGoals, ({ one }) => ({
	creator: one(users, {
		fields: [teamGoals.createdBy],
		references: [users.id]
	})
}));

// Gamification Types
export type PointTransaction = typeof pointTransactions.$inferSelect;
export type NewPointTransaction = typeof pointTransactions.$inferInsert;
export type UserStats = typeof userStats.$inferSelect;
export type NewUserStats = typeof userStats.$inferInsert;
export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type PricingGrade = typeof pricingGrades.$inferSelect;
export type NewPricingGrade = typeof pricingGrades.$inferInsert;
export type LeaderboardSnapshot = typeof leaderboardSnapshots.$inferSelect;
export type NewLeaderboardSnapshot = typeof leaderboardSnapshots.$inferInsert;
export type TeamGoal = typeof teamGoals.$inferSelect;
export type NewTeamGoal = typeof teamGoals.$inferInsert;

