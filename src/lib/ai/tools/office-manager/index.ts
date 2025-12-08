// Office Manager Tools
export { sendMessageTool } from './send-message';
export { createTaskTool } from './create-task';

import { sendMessageTool } from './send-message';
import { createTaskTool } from './create-task';
import type { AITool } from '../../types';

export const officeManagerTools: AITool[] = [
	sendMessageTool,
	createTaskTool
];
