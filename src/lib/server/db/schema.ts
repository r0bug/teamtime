import { pgTable, text, timestamp, boolean, uuid, integer, jsonb, pgEnum, decimal, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['manager', 'purchaser', 'staff']);
export const taskStatusEnum = pgEnum('task_status', ['not_started', 'in_progress', 'completed', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);
export const taskSourceEnum = pgEnum('task_source', ['manual', 'recurring', 'event_triggered', 'purchase_approval']);
export const triggerEventEnum = pgEnum('trigger_event', ['clock_in', 'clock_out', 'first_clock_in', 'last_clock_out']);
export const purchaseStatusEnum = pgEnum('purchase_status', ['pending', 'approved', 'denied']);
export const withdrawalStatusEnum = pgEnum('withdrawal_status', ['unassigned', 'partially_assigned', 'fully_spent']);
export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'broadcast']);
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

// Users table
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	username: text('username').notNull().unique(),
	pinHash: text('pin_hash').notNull(),
	role: userRoleEnum('role').notNull().default('staff'),
	name: text('name').notNull(),
	phone: text('phone'),
	avatarUrl: text('avatar_url'),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
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
	messages: many(messages)
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
	photos: many(messagePhotos)
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
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type AtmWithdrawal = typeof atmWithdrawals.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
