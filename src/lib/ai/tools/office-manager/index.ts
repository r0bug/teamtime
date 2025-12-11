// Office Manager Tools
export { sendMessageTool } from './send-message';
export { createTaskTool } from './create-task';
export { cancelTaskTool } from './cancel-task';
export { sendSMSTool } from './send-sms';
export { getAvailableStaffTool } from './get-available-staff';
export { viewScheduleTool } from './view-schedule';
export { tradeShiftsTool } from './trade-shifts';
export { createRecurringTaskTool } from './create-recurring-task';
export { createScheduleTool } from './create-schedule';
export { createCashCountTaskTool } from './create-cash-count-task';
export { processInventoryPhotosTool } from './process-inventory-photos';
export { continueWorkTool } from './continue-work';
export { reviewPastChatsTool } from './review-past-chats';
export { getChatDetailsTool } from './get-chat-details';
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
import { sendSMSTool } from './send-sms';
import { getAvailableStaffTool } from './get-available-staff';
import { viewScheduleTool } from './view-schedule';
import { tradeShiftsTool } from './trade-shifts';
import { createRecurringTaskTool } from './create-recurring-task';
import { createScheduleTool } from './create-schedule';
import { createCashCountTaskTool } from './create-cash-count-task';
import { processInventoryPhotosTool } from './process-inventory-photos';
import { continueWorkTool } from './continue-work';
import { reviewPastChatsTool } from './review-past-chats';
import { getChatDetailsTool } from './get-chat-details';
import { permissionTools } from './permission-tools';
import type { AITool } from '../../types';

// Use explicit any for the tools array since each tool has its own type parameters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const officeManagerTools: AITool<any, any>[] = [
	sendMessageTool,
	createTaskTool,
	cancelTaskTool,
	sendSMSTool,
	getAvailableStaffTool,
	viewScheduleTool,
	tradeShiftsTool,
	createRecurringTaskTool,
	createScheduleTool,
	createCashCountTaskTool,
	processInventoryPhotosTool,
	continueWorkTool,
	reviewPastChatsTool,
	getChatDetailsTool,
	...permissionTools
];

// Tools that require user confirmation before execution (for chat mode)
export const confirmationRequiredTools = officeManagerTools.filter(t => t.requiresConfirmation);

// Read-only tools that don't modify state
export const readOnlyTools = officeManagerTools.filter(t => !t.requiresConfirmation && !t.requiresApproval);
