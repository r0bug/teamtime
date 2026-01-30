// Tools Registry
export * from './office-manager';
export * from './revenue-optimizer';

import { officeManagerTools } from './office-manager';
import { revenueOptimizerTools } from './revenue-optimizer';
import type { AITool, AIAgent } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getToolsForAgent(agent: AIAgent): AITool<any, any>[] {
	switch (agent) {
		case 'office_manager':
			return officeManagerTools;
		case 'revenue_optimizer':
			return revenueOptimizerTools;
		default:
			return [];
	}
}
