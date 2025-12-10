// Office Manager Chat Module
export {
	createChatSession,
	getChatSession,
	getChatSessionForUser,
	listChatSessions,
	updateChatTitle,
	addUserMessage,
	addAssistantMessage,
	createPendingAction,
	getPendingAction,
	getPendingActionsForChat,
	approvePendingAction,
	rejectPendingAction,
	expireOldActions,
	deleteChatSession,
	logAIAction,
	type ChatSession,
	type PendingAction
} from './session';

export {
	processUserMessage,
	processUserMessageStream,
	executeConfirmedAction,
	type ProcessMessageResult,
	type StreamEvent
} from './orchestrator';
