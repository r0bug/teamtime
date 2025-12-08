// Tools Registry
export * from './office-manager';
export * from './revenue-optimizer';

import { officeManagerTools } from './office-manager';
import { revenueOptimizerTools } from './revenue-optimizer';
import type { AITool, AIAgent } from '../types';

export function getToolsForAgent(agent: AIAgent): AITool<unknown, unknown>[] {
	switch (agent) {
		case 'office_manager':
			return officeManagerTools;
		case 'revenue_optimizer':
			return revenueOptimizerTools;
		default:
			return [];
	}
}
