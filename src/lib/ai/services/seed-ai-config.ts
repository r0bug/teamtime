// Seed script for AI tool configuration
// Run once to populate initial keywords from hardcoded values

import { db } from '$lib/server/db';
import { aiToolKeywords, aiContextKeywords } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ai:config-seed');

// Current hardcoded keywords from orchestrator.ts
const SCHEDULING_KEYWORDS = [
	'schedule', 'shift', 'assign', 'apply', 'create schedule',
	'staff', 'employee', 'worker', 'coverage', 'roster'
];

const SCHEDULE_CREATION_KEYWORDS = [
	'apply this schedule', 'apply schedule', 'create schedule', 'create the schedule',
	'add schedule', 'set schedule', 'make schedule', 'build schedule',
	'schedule for next week', 'schedule for the week'
];

export async function seedAIConfig(): Promise<{ toolKeywords: number; contextKeywords: number }> {
	let toolKeywordsInserted = 0;
	let contextKeywordsInserted = 0;

	try {
		// Seed force keywords for create_schedule tool
		for (const keyword of SCHEDULE_CREATION_KEYWORDS) {
			try {
				await db.insert(aiToolKeywords).values({
					agent: 'office_manager',
					toolName: 'create_schedule',
					keyword,
					matchType: 'contains',
					isActive: true
				});
				toolKeywordsInserted++;
			} catch {
				// Ignore duplicate errors
			}
		}

		// Seed context trigger keywords for 'users' provider (staff data)
		for (const keyword of SCHEDULING_KEYWORDS) {
			try {
				await db.insert(aiContextKeywords).values({
					agent: 'office_manager',
					providerId: 'users',
					keyword,
					isActive: true
				});
				contextKeywordsInserted++;
			} catch {
				// Ignore duplicate errors
			}
		}

		log.info({ toolKeywordsInserted, contextKeywordsInserted }, 'AI config seed completed');
		return { toolKeywords: toolKeywordsInserted, contextKeywords: contextKeywordsInserted };
	} catch (error) {
		log.error({ error }, 'AI config seed failed');
		throw error;
	}
}

// Additional tool-specific keywords that might be useful
export async function seedAdditionalKeywords(): Promise<void> {
	const additionalKeywords = [
		// Task keywords
		{ agent: 'office_manager', toolName: 'create_task', keyword: 'create a task' },
		{ agent: 'office_manager', toolName: 'create_task', keyword: 'assign a task' },
		{ agent: 'office_manager', toolName: 'create_task', keyword: 'make a task' },

		// Message keywords
		{ agent: 'office_manager', toolName: 'send_message', keyword: 'send a message' },
		{ agent: 'office_manager', toolName: 'send_message', keyword: 'message to' },

		// SMS keywords
		{ agent: 'office_manager', toolName: 'send_sms', keyword: 'send sms' },
		{ agent: 'office_manager', toolName: 'send_sms', keyword: 'text message' },

		// Cash count keywords
		{ agent: 'office_manager', toolName: 'create_cash_count_task', keyword: 'cash count' },
		{ agent: 'office_manager', toolName: 'create_cash_count_task', keyword: 'count the drawer' },
	];

	for (const kw of additionalKeywords) {
		try {
			await db.insert(aiToolKeywords).values({
				agent: kw.agent,
				toolName: kw.toolName,
				keyword: kw.keyword,
				matchType: 'contains',
				isActive: true
			});
		} catch {
			// Ignore duplicates
		}
	}

	log.info({ count: additionalKeywords.length }, 'Additional keywords seeded');
}
