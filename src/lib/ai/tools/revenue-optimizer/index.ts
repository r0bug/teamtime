// Revenue Optimizer Tools Index
export { writeMemoryTool } from './write-memory';
export { createPolicyTool } from './create-policy';
export { sendRecommendationTool } from './send-recommendation';
export { analyzeSalesPatternsTool } from './analyze-sales-patterns';
export { getStaffingInsightsTool } from './get-staffing-insights';

import { writeMemoryTool } from './write-memory';
import { createPolicyTool } from './create-policy';
import { sendRecommendationTool } from './send-recommendation';
import { analyzeSalesPatternsTool } from './analyze-sales-patterns';
import { getStaffingInsightsTool } from './get-staffing-insights';

export const revenueOptimizerTools = [
	writeMemoryTool,
	createPolicyTool,
	sendRecommendationTool,
	analyzeSalesPatternsTool,
	getStaffingInsightsTool
];
