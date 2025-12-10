// Locations Context Provider - Business locations and their details
import { db, locations } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { AIContextProvider, AIAgent } from '../../types';

interface LocationsData {
	locations: {
		locationId: string;
		name: string;
		address: string | null;
	}[];
	summary: {
		totalActive: number;
	};
}

export const locationsProvider: AIContextProvider<LocationsData> = {
	moduleId: 'locations',
	moduleName: 'Business Locations',
	description: 'Active business locations with IDs for tool usage',
	priority: 20, // High priority - needed for location-related actions
	agents: ['office_manager', 'revenue_optimizer'],

	async isEnabled() {
		return true;
	},

	async getContext(): Promise<LocationsData> {
		const activeLocations = await db
			.select({
				id: locations.id,
				name: locations.name,
				address: locations.address
			})
			.from(locations)
			.where(eq(locations.isActive, true))
			.orderBy(locations.name);

		return {
			locations: activeLocations.map(l => ({
				locationId: l.id,
				name: l.name,
				address: l.address
			})),
			summary: {
				totalActive: activeLocations.length
			}
		};
	},

	estimateTokens(context: LocationsData): number {
		// UUIDs and addresses add tokens per location
		return 50 + context.locations.length * 50;
	},

	formatForPrompt(context: LocationsData): string {
		const lines: string[] = [
			'## Business Locations',
			`Total: ${context.summary.totalActive} active location(s)`,
			'',
			'**IMPORTANT: When using tools like create_cash_count_task, you MUST use the location_id (UUID), not the name.**',
			''
		];

		for (const loc of context.locations) {
			lines.push(`- **${loc.name}** (location_id: \`${loc.locationId}\`)`);
			if (loc.address) {
				lines.push(`  Address: ${loc.address}`);
			}
		}
		lines.push('');

		return lines.join('\n');
	}
};
