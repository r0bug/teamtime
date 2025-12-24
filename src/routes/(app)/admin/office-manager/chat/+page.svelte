<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';

	export let data: PageData;

	// Message types
	interface ToolCall {
		name: string;
		params: Record<string, unknown>;
		result?: unknown;
		formattedResult?: string; // Human-readable formatted result
		pendingActionId?: string;
	}

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: string;
		toolCalls?: ToolCall[];
	}

	interface PendingAction {
		id: string;
		toolName: string;
		confirmationMessage: string;
		createdAt: string;
		expiresAt: string;
	}

	// Chat state
	let currentChatId: string | null = null;
	let currentMessages: ChatMessage[] = [];
	let pendingActions: PendingAction[] = [];
	let messageInput = '';
	let isLoading = false;
	let showSidebar = true;

	// Start a new chat (for sidebar button only)
	async function startNewChat() {
		const response = await fetch('/api/office-manager/chats', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		const result = await response.json();
		if (result.success) {
			currentChatId = result.session.id;
			currentMessages = [];
			pendingActions = [];
			messageInput = '';
			invalidateAll();
		}
	}

	// Load an existing chat
	async function loadChat(chatId: string) {
		const response = await fetch(`/api/office-manager/chats/${chatId}`);
		const result = await response.json();
		if (result.success) {
			currentChatId = chatId;
			currentMessages = result.session.messages || [];
			pendingActions = result.pendingActions || [];
		}
	}

	// Delete a chat
	async function deleteChat(chatId: string, event: Event) {
		event.stopPropagation();
		if (!confirm('Delete this chat?')) return;

		const response = await fetch(`/api/office-manager/chats/${chatId}`, {
			method: 'DELETE'
		});
		const result = await response.json();
		if (result.success) {
			if (currentChatId === chatId) {
				currentChatId = null;
				currentMessages = [];
				pendingActions = [];
			}
			invalidateAll();
		}
	}

	// Send a message with streaming
	async function sendMessage() {
		// Capture message FIRST before any async operations or state changes
		const userMessage = messageInput.trim();

		if (!userMessage || isLoading) return;

		// Clear input and set loading state immediately
		messageInput = '';
		isLoading = true;

		// Create chat if needed
		let chatId = currentChatId;
		if (!chatId) {
			const response = await fetch('/api/office-manager/chats', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const result = await response.json();
			if (result.success) {
				chatId = result.session.id;
				currentChatId = chatId;
				currentMessages = [];
				pendingActions = [];
			} else {
				isLoading = false;
				return;
			}
		}

		// Optimistically add user message
		const tempUserMsg: ChatMessage = {
			id: `temp-${Date.now()}`,
			role: 'user',
			content: userMessage,
			timestamp: new Date().toISOString()
		};
		currentMessages = [...currentMessages, tempUserMsg];

		// Create placeholder for streaming assistant message
		const assistantMsgId = `msg-${Date.now()}`;
		const assistantMsg: ChatMessage = {
			id: assistantMsgId,
			role: 'assistant',
			content: '',
			timestamp: new Date().toISOString(),
			toolCalls: []
		};
		currentMessages = [...currentMessages, assistantMsg];

		try {
			const response = await fetch(`/api/office-manager/chats/${chatId}/stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: userMessage })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to send message');
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6);
					if (data === '[DONE]') continue;

					try {
						const event = JSON.parse(data);

						if (event.type === 'text' && event.content) {
							// Update the streaming message content
							const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
							if (msgIndex !== -1) {
								currentMessages[msgIndex].content += event.content;
								currentMessages = [...currentMessages];
							}
						} else if (event.type === 'tool_start') {
							// Add tool call to message
							const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
							if (msgIndex !== -1 && currentMessages[msgIndex].toolCalls) {
								currentMessages[msgIndex].toolCalls!.push({
									name: event.toolName,
									params: event.toolParams || {},
									result: undefined,
									pendingActionId: undefined
								});
								currentMessages = [...currentMessages];
							}
						} else if (event.type === 'tool_result') {
							// Update tool call result
							const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
							if (msgIndex !== -1 && currentMessages[msgIndex].toolCalls) {
								const toolIndex = currentMessages[msgIndex].toolCalls!.findIndex(
									tc => tc.name === event.toolName && tc.result === undefined
								);
								if (toolIndex !== -1) {
									currentMessages[msgIndex].toolCalls![toolIndex].result = event.result;
									currentMessages[msgIndex].toolCalls![toolIndex].formattedResult = event.formattedResult;
									currentMessages = [...currentMessages];
								}
							}
						} else if (event.type === 'pending_action') {
							// Add pending action
							pendingActions = [...pendingActions, {
								id: event.pendingActionId,
								toolName: event.toolName,
								confirmationMessage: event.confirmationMessage,
								createdAt: new Date().toISOString(),
								expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
							}];

							// Update tool call with pending action ID
							const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
							if (msgIndex !== -1 && currentMessages[msgIndex].toolCalls) {
								const toolIndex = currentMessages[msgIndex].toolCalls!.findIndex(
									tc => tc.name === event.toolName && !tc.pendingActionId
								);
								if (toolIndex !== -1) {
									currentMessages[msgIndex].toolCalls![toolIndex].pendingActionId = event.pendingActionId;
									currentMessages = [...currentMessages];
								}
							}
						} else if (event.type === 'error') {
							const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
							if (msgIndex !== -1) {
								currentMessages[msgIndex].content += `\n\nError: ${event.error}`;
								currentMessages = [...currentMessages];
							}
						}
					} catch {
						// Invalid JSON, skip
					}
				}
			}
		} catch (error) {
			// Update the assistant message with error
			const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
			if (msgIndex !== -1) {
				currentMessages[msgIndex].content = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
				currentMessages = [...currentMessages];
			}
		} finally {
			isLoading = false;
			invalidateAll();
		}
	}

	// Confirm a pending action and handle AI continuation
	async function confirmAction(actionId: string) {
		const response = await fetch(`/api/office-manager/actions/${actionId}/confirm`, {
			method: 'POST'
		});

		// Check if response is streaming (success) or JSON (failure)
		const contentType = response.headers.get('Content-Type') || '';

		if (contentType.includes('text/event-stream')) {
			// Remove from pending actions
			pendingActions = pendingActions.filter(a => a.id !== actionId);

			// Create a streaming message for AI continuation
			const assistantMsgId = `assistant-${Date.now()}`;
			const continuationMsg: ChatMessage = {
				id: assistantMsgId,
				role: 'assistant',
				content: '',
				timestamp: new Date().toISOString(),
				toolCalls: []
			};
			currentMessages = [...currentMessages, continuationMsg];
			isLoading = true;

			try {
				const reader = response.body?.getReader();
				const decoder = new TextDecoder();

				if (reader) {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						const chunk = decoder.decode(value);
						const lines = chunk.split('\n');

						for (const line of lines) {
							if (!line.startsWith('data: ')) continue;
							const data = line.slice(6).trim();
							if (data === '[DONE]') continue;

							try {
								const event = JSON.parse(data);

								if (event.type === 'action_confirmed') {
									// Action was confirmed - add brief confirmation
									const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
									if (msgIndex !== -1) {
										currentMessages[msgIndex].content = `✓ ${event.toolName} completed. `;
										currentMessages = [...currentMessages];
									}
								} else if (event.type === 'text' && event.content) {
									// Update the streaming message content
									const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
									if (msgIndex !== -1) {
										currentMessages[msgIndex].content += event.content;
										currentMessages = [...currentMessages];
									}
								} else if (event.type === 'tool_start') {
									// Add tool call to message
									const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
									if (msgIndex !== -1 && currentMessages[msgIndex].toolCalls) {
										currentMessages[msgIndex].toolCalls!.push({
											name: event.toolName,
											params: event.toolParams || {},
											result: undefined,
											pendingActionId: undefined
										});
										currentMessages = [...currentMessages];
									}
								} else if (event.type === 'tool_result') {
									// Update tool call result
									const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
									if (msgIndex !== -1 && currentMessages[msgIndex].toolCalls) {
										const toolIndex = currentMessages[msgIndex].toolCalls!.findIndex(
											tc => tc.name === event.toolName && tc.result === undefined
										);
										if (toolIndex !== -1) {
											currentMessages[msgIndex].toolCalls![toolIndex].result = event.result;
											currentMessages[msgIndex].toolCalls![toolIndex].formattedResult = event.formattedResult;
											currentMessages = [...currentMessages];
										}
									}
								} else if (event.type === 'pending_action') {
									// Add pending action
									pendingActions = [...pendingActions, {
										id: event.pendingActionId,
										toolName: event.toolName,
										confirmationMessage: event.confirmationMessage,
										createdAt: new Date().toISOString(),
										expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
									}];

									// Update tool call with pending action ID
									const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
									if (msgIndex !== -1 && currentMessages[msgIndex].toolCalls) {
										const toolIndex = currentMessages[msgIndex].toolCalls!.findIndex(
											tc => tc.name === event.toolName && !tc.pendingActionId
										);
										if (toolIndex !== -1) {
											currentMessages[msgIndex].toolCalls![toolIndex].pendingActionId = event.pendingActionId;
											currentMessages = [...currentMessages];
										}
									}
								} else if (event.type === 'error') {
									const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
									if (msgIndex !== -1) {
										currentMessages[msgIndex].content += `\n\nError: ${event.error}`;
										currentMessages = [...currentMessages];
									}
								}
							} catch {
								// Invalid JSON, skip
							}
						}
					}
				}
			} catch (error) {
				const msgIndex = currentMessages.findIndex(m => m.id === assistantMsgId);
				if (msgIndex !== -1) {
					currentMessages[msgIndex].content += `\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`;
					currentMessages = [...currentMessages];
				}
			} finally {
				isLoading = false;
				invalidateAll();
			}
		} else {
			// JSON response (failure case)
			const result = await response.json();
			// Show error - use message field (contains formatted error) or error field
			alert(`Failed to confirm action: ${result.message || result.error || 'Unknown error'}`);
		}
	}

	// Reject a pending action
	async function rejectAction(actionId: string) {
		const response = await fetch(`/api/office-manager/actions/${actionId}/reject`, {
			method: 'POST'
		});
		const result = await response.json();

		if (result.success) {
			// Remove from pending actions
			pendingActions = pendingActions.filter(a => a.id !== actionId);
			// Add result message
			const rejectMsg: ChatMessage = {
				id: `reject-${Date.now()}`,
				role: 'assistant',
				content: result.message,
				timestamp: new Date().toISOString()
			};
			currentMessages = [...currentMessages, rejectMsg];
		} else {
			alert(`Failed to reject action: ${result.error}`);
		}
	}

	// Handle Enter key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	// Format date
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days === 0) {
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} else if (days === 1) {
			return 'Yesterday';
		} else if (days < 7) {
			return date.toLocaleDateString([], { weekday: 'short' });
		}
		return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Office Manager Chat - TeamTime</title>
</svelte:head>

<div class="h-[calc(100vh-4rem)] flex">
	<!-- Sidebar - Chat List -->
	<div
		class="w-64 border-r bg-gray-50 flex flex-col {showSidebar ? '' : 'hidden md:flex'}"
	>
		<div class="p-4 border-b">
			<button
				on:click={startNewChat}
				class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				New Chat
			</button>
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if data.chatSessions.length === 0}
				<div class="p-4 text-gray-500 text-sm text-center">
					No chats yet. Start a new one!
				</div>
			{:else}
				{#each data.chatSessions as session}
					<button
						on:click={() => loadChat(session.id)}
						class="w-full p-3 text-left hover:bg-gray-100 border-b transition group
							{currentChatId === session.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}"
					>
						<div class="flex items-center justify-between">
							<span class="font-medium text-sm truncate flex-1">
								{session.title}
							</span>
							<button
								on:click={(e) => deleteChat(session.id, e)}
								class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
							</button>
						</div>
						<div class="text-xs text-gray-500 mt-1">
							{session.messageCount} messages - {formatDate(session.updatedAt)}
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Main Chat Area -->
	<div class="flex-1 flex flex-col">
		<!-- Mobile toggle -->
		<button
			on:click={() => showSidebar = !showSidebar}
			class="md:hidden p-2 border-b"
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>

		<!-- Messages -->
		<div class="flex-1 overflow-y-auto p-4 space-y-4">
			{#if !currentChatId && currentMessages.length === 0}
				<div class="flex flex-col items-center justify-center h-full text-gray-500">
					<svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
							d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
					</svg>
					<h2 class="text-xl font-semibold mb-2">Office Manager Chat</h2>
					<p class="text-center max-w-md">
						Chat with the AI assistant to manage schedules, send messages to staff, create tasks, and more.
					</p>
					<button
						on:click={startNewChat}
						class="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
					>
						Start a Chat
					</button>
				</div>
			{:else}
				{#each currentMessages as message}
					<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div
							class="max-w-[80%] rounded-lg p-3
								{message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}"
						>
							{#if message.role === 'assistant'}
								<MarkdownRenderer content={message.content} />
							{:else}
								<p class="whitespace-pre-wrap">{message.content}</p>
							{/if}

							{#if message.toolCalls && message.toolCalls.length > 0}
								<div class="mt-2 pt-2 border-t border-gray-200">
									{#each message.toolCalls as toolCall}
										<div class="text-xs bg-gray-50 rounded p-2 mt-1">
											<div class="flex items-center gap-2">
												<span class="font-mono font-semibold text-gray-700">{toolCall.name}</span>
												{#if toolCall.pendingActionId}
													<span class="text-yellow-600">Pending approval</span>
												{:else if toolCall.result}
													<span class="text-green-600">Executed</span>
												{/if}
											</div>
											{#if toolCall.formattedResult}
												<div class="mt-2 text-sm text-gray-800 whitespace-pre-wrap bg-white rounded p-2 border border-gray-200">
													{toolCall.formattedResult}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if isLoading}
					<div class="flex justify-start">
						<div class="bg-gray-100 rounded-lg p-3">
							<div class="flex items-center gap-2">
								<div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
								<div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
								<div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Pending Actions -->
		{#if pendingActions.length > 0}
			<div class="border-t bg-yellow-50 p-4">
				<h3 class="font-semibold text-yellow-800 mb-2">Actions Pending Confirmation</h3>
				<div class="space-y-2">
					{#each pendingActions as action}
						<div class="bg-white rounded-lg p-3 border border-yellow-200">
							<div class="text-sm font-medium">{action.toolName}</div>
							<p class="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{action.confirmationMessage}</p>
							<div class="flex gap-2 mt-2">
								<button
									on:click={() => confirmAction(action.id)}
									class="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
								>
									Approve
								</button>
								<button
									on:click={() => rejectAction(action.id)}
									class="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition"
								>
									Reject
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Input Area -->
		<div class="border-t p-4">
			<div class="flex gap-2">
				<textarea
					bind:value={messageInput}
					on:keydown={handleKeydown}
					placeholder="Type a message..."
					rows="2"
					class="flex-1 resize-none border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					disabled={isLoading}
				></textarea>
				<button
					on:click={sendMessage}
					disabled={isLoading || !messageInput.trim()}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
							d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>
