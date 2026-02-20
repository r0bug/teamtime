// Office Manager Tools
export { sendMessageTool } from './send-message';
export { createTaskTool } from './create-task';
export { cancelTaskTool } from './cancel-task';
export { completeTaskTool } from './complete-task';
export { deleteTaskTool } from './delete-task';
export { listTaskRulesTool } from './list-task-rules';
export { toggleTaskRuleTool } from './toggle-task-rule';
export { createTaskRuleTool } from './create-task-rule';
export { updateScheduleTool } from './update-schedule';
export { copyScheduleTool } from './copy-schedule';
export { sendSMSTool } from './send-sms';
export { scheduleSMSTool } from './schedule-sms';
export { viewScheduledSMSTool } from './view-scheduled-sms';
export { cancelScheduledSMSTool } from './cancel-scheduled-sms';
export { getAvailableStaffTool } from './get-available-staff';
export { viewScheduleTool } from './view-schedule';
export { tradeShiftsTool } from './trade-shifts';
export { deleteScheduleTool } from './delete-schedule';
export { deleteDuplicateSchedulesTool } from './delete-duplicate-schedules';
export { createRecurringTaskTool } from './create-recurring-task';
export { createScheduleTool } from './create-schedule';
export { createCashCountTaskTool } from './create-cash-count-task';
export { createSocialMediaTaskTool } from './create-social-media-task';
export { processInventoryPhotosTool } from './process-inventory-photos';
export { continueWorkTool } from './continue-work';
export { reviewPastChatsTool } from './review-past-chats';
export { getChatDetailsTool } from './get-chat-details';
export { getMyPermissionsTool } from './get-my-permissions';
export { viewSalesTool } from './view-sales';
export { viewPointsTool } from './view-points';
export { awardPointsTool } from './award-points';
export { giveShoutoutTool } from './give-shoutout';
export { queryMetricsTool } from './query-metrics';
export { getVendorCorrelationsTool } from './get-vendor-correlations';
export { analyzeStaffingPatternsTool } from './analyze-staffing-patterns';
export { runSalesScraperTool } from './run-sales-scraper';
export { clockUserTool } from './clock-user';
export { createTimeEntryTool } from './create-time-entry';
export { editTimeEntryTool } from './edit-time-entry';
export {
	viewUserPermissionsTool,
	grantTemporaryPermissionTool,
	changeUserTypeTool,
	rollbackPermissionChangeTool,
	listGrantableUserTypesTool,
	listGrantablePermissionsTool,
	viewPendingApprovalsTool,
	permissionTools
} from './permission-tools';

import { sendMessageTool } from './send-message';
import { createTaskTool } from './create-task';
import { cancelTaskTool } from './cancel-task';
import { completeTaskTool } from './complete-task';
import { deleteTaskTool } from './delete-task';
import { listTaskRulesTool } from './list-task-rules';
import { toggleTaskRuleTool } from './toggle-task-rule';
import { createTaskRuleTool } from './create-task-rule';
import { updateScheduleTool } from './update-schedule';
import { copyScheduleTool } from './copy-schedule';
import { sendSMSTool } from './send-sms';
import { scheduleSMSTool } from './schedule-sms';
import { viewScheduledSMSTool } from './view-scheduled-sms';
import { cancelScheduledSMSTool } from './cancel-scheduled-sms';
import { getAvailableStaffTool } from './get-available-staff';
import { viewScheduleTool } from './view-schedule';
import { tradeShiftsTool } from './trade-shifts';
import { deleteScheduleTool } from './delete-schedule';
import { deleteDuplicateSchedulesTool } from './delete-duplicate-schedules';
import { createRecurringTaskTool } from './create-recurring-task';
import { createScheduleTool } from './create-schedule';
import { createCashCountTaskTool } from './create-cash-count-task';
import { createSocialMediaTaskTool } from './create-social-media-task';
import { processInventoryPhotosTool } from './process-inventory-photos';
import { continueWorkTool } from './continue-work';
import { reviewPastChatsTool } from './review-past-chats';
import { getChatDetailsTool } from './get-chat-details';
import { getMyPermissionsTool } from './get-my-permissions';
import { viewSalesTool } from './view-sales';
import { viewPointsTool } from './view-points';
import { awardPointsTool } from './award-points';
import { giveShoutoutTool } from './give-shoutout';
import { queryMetricsTool } from './query-metrics';
import { getVendorCorrelationsTool } from './get-vendor-correlations';
import { analyzeStaffingPatternsTool } from './analyze-staffing-patterns';
import { runSalesScraperTool } from './run-sales-scraper';
import { clockUserTool } from './clock-user';
import { createTimeEntryTool } from './create-time-entry';
import { editTimeEntryTool } from './edit-time-entry';
import { permissionTools } from './permission-tools';
import type { AITool } from '../../types';

// Use explicit any for the tools array since each tool has its own type parameters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const officeManagerTools: AITool<any, any>[] = [
	// Permission check tool - should be called first
	getMyPermissionsTool,
	// Read-only tools
	viewScheduleTool,
	getAvailableStaffTool,
	reviewPastChatsTool,
	getChatDetailsTool,
	viewSalesTool,
	viewPointsTool,
	// Metrics tools
	queryMetricsTool,
	getVendorCorrelationsTool,
	analyzeStaffingPatternsTool,
	// Action tools
	sendMessageTool,
	createTaskTool,
	cancelTaskTool,
	completeTaskTool,
	deleteTaskTool,
	sendSMSTool,
	scheduleSMSTool,
	viewScheduledSMSTool,
	cancelScheduledSMSTool,
	tradeShiftsTool,
	deleteScheduleTool,
	deleteDuplicateSchedulesTool,
	createRecurringTaskTool,
	createScheduleTool,
	updateScheduleTool,
	copyScheduleTool,
	// Time entry management tools
	clockUserTool,
	createTimeEntryTool,
	editTimeEntryTool,
	createCashCountTaskTool,
	createSocialMediaTaskTool,
	processInventoryPhotosTool,
	continueWorkTool,
	// Task rule management tools
	listTaskRulesTool,
	toggleTaskRuleTool,
	createTaskRuleTool,
	// Sales scraper
	runSalesScraperTool,
	// Gamification & recognition tools
	awardPointsTool,
	giveShoutoutTool,
	// Permission management tools
	...permissionTools
];

// Tools that require user confirmation before execution (for chat mode)
export const confirmationRequiredTools = officeManagerTools.filter(t => t.requiresConfirmation);

// Read-only tools that don't modify state
export const readOnlyTools = officeManagerTools.filter(t => !t.requiresConfirmation && !t.requiresApproval);
