<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	// Consultation metadata type
	interface ConsultationMetadata {
		tier: 'quick' | 'standard' | 'deliberate';
		reason: string;
		triggers: string[];
		models: {
			primary: { provider: string; model: string };
			review?: { provider: string; model: string };
			synthesizer?: { provider: string; model: string };
		};
		costCents: number;
		tokensUsed: number;
	}

	interface ChatMessageWithMeta {
		role: 'user' | 'assistant';
		content: string;
		toolCalls?: unknown[];
		consultation?: ConsultationMetadata;
	}

	// Chat state
	let currentChatId: string | null = null;
	let currentMessages: ChatMessageWithMeta[] = [];
	let messageInput = '';
	let isLoading = false;
	let selectedContextModules: string[] = [...data.contextModules];
	let expandedConsultation: number | null = null;

	// Tab state
	let activeTab: 'chat' | 'history' | 'decisions' | 'config' = 'chat';

	// Start a new chat
	async function startNewChat() {
		const response = await fetch('/api/architect/chats', {
			method: 'POST'
		});
		const result = await response.json();
		if (result.success) {
			currentChatId = result.session.id;
			currentMessages = [];
			messageInput = '';
		}
	}

	// Load an existing chat
	async function loadChat(chatId: string) {
		const response = await fetch(`/api/architect/chats/${chatId}`);
		const result = await response.json();
		if (result.success) {
			currentChatId = chatId;
			currentMessages = result.session.messages;
			activeTab = 'chat';
		}
	}

	// Send a message
	async function sendMessage() {
		if (!messageInput.trim() || isLoading) return;

		// Create chat if needed
		if (!currentChatId) {
			await startNewChat();
		}

		const userMessage = messageInput;
		messageInput = '';
		currentMessages = [...currentMessages, { role: 'user', content: userMessage }];
		isLoading = true;

		try {
			const response = await fetch(`/api/architect/chats/${currentChatId}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: userMessage,
					contextModules: selectedContextModules
				})
			});

			const result = await response.json();

			if (result.success) {
				currentMessages = [
					...currentMessages,
					{
						role: 'assistant',
						content: result.response,
						toolCalls: result.toolCalls,
						consultation: result.consultation
					}
				];
			} else {
				currentMessages = [
					...currentMessages,
					{
						role: 'assistant',
						content: `Error: ${result.error}`
					}
				];
			}
		} catch (error) {
			currentMessages = [
				...currentMessages,
				{
					role: 'assistant',
					content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
				}
			];
		} finally {
			isLoading = false;
			invalidateAll();
		}
	}

	// Handle enter key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	// Format status badge
	function getStatusClass(status: string): string {
		switch (status) {
			case 'approved': return 'bg-green-100 text-green-800';
			case 'implemented': return 'bg-blue-100 text-blue-800';
			case 'rejected': return 'bg-red-100 text-red-800';
			case 'in_progress': return 'bg-yellow-100 text-yellow-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	// Consultation tier badge styling
	function getTierClass(tier: string): string {
		switch (tier) {
			case 'quick': return 'bg-green-100 text-green-800 border-green-200';
			case 'standard': return 'bg-blue-100 text-blue-800 border-blue-200';
			case 'deliberate': return 'bg-purple-100 text-purple-800 border-purple-200';
			default: return 'bg-gray-100 text-gray-800 border-gray-200';
		}
	}

	function getTierIcon(tier: string): string {
		switch (tier) {
			case 'quick': return '⚡';
			case 'standard': return '💭';
			case 'deliberate': return '🤔';
			default: return '🔄';
		}
	}

	function getModelShortName(model: string): string {
		const names: Record<string, string> = {
			'claude-opus-4-20250514': 'Opus 4',
			'claude-sonnet-4-20250514': 'Sonnet 4',
			'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
			'claude-3-opus-20240229': 'Opus 3',
			'claude-3-haiku-20240307': 'Haiku 3',
			'gpt-4o': 'GPT-4o',
			'gpt-4-turbo-preview': 'GPT-4T',
			'gpt-4': 'GPT-4'
		};
		return names[model] || model;
	}

	function toggleConsultationDetails(index: number) {
		expandedConsultation = expandedConsultation === index ? null : index;
	}
</script>

<svelte:head>
	<title>Ada - Architecture Advisor | TeamTime Admin</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-5xl mx-auto">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold">Ada - Architecture Advisor</h1>
				<p class="text-sm text-gray-500 mt-1">Get architectural guidance and create Claude Code prompts</p>
			</div>
			<div class="flex items-center gap-2">
				{#if data.config?.enabled}
					<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
						Active
					</span>
					{#if data.config?.dryRunMode}
						<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
							Dry Run
						</span>
					{/if}
				{:else}
					<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
						Not Configured
					</span>
				{/if}
			</div>
		</div>

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				{form.message || 'Success'}
			</div>
		{/if}

		<!-- Tab Navigation -->
		<div class="border-b border-gray-200 mb-6">
			<nav class="flex gap-4 overflow-x-auto">
				<button
					on:click={() => activeTab = 'chat'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'chat' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Chat with Ada
				</button>
				<button
					on:click={() => activeTab = 'history'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'history' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Chat History
				</button>
				<button
					on:click={() => activeTab = 'decisions'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'decisions' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Decisions
					{#if data.stats.pendingDecisions > 0}
						<span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-primary-100 text-primary-800">
							{data.stats.pendingDecisions}
						</span>
					{/if}
				</button>
				<button
					on:click={() => activeTab = 'config'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'config' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Configuration
				</button>
			</nav>
		</div>

		<!-- Chat Tab -->
		{#if activeTab === 'chat'}
			<div class="space-y-4">
				<!-- Context Module Selection -->
				<div class="card p-4">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-700">Context Modules:</span>
						<div class="flex gap-2 flex-wrap">
							{#each data.contextModules as mod}
								<label class="inline-flex items-center">
									<input
										type="checkbox"
										value={mod}
										checked={selectedContextModules.includes(mod)}
										on:change={(e) => {
											if (e.currentTarget.checked) {
												selectedContextModules = [...selectedContextModules, mod];
											} else {
												selectedContextModules = selectedContextModules.filter(m => m !== mod);
											}
										}}
										class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
									>
									<span class="ml-1 text-sm capitalize">{mod}</span>
								</label>
							{/each}
						</div>
					</div>
				</div>

				<!-- Chat Messages -->
				<div class="card min-h-[400px] max-h-[600px] overflow-y-auto">
					{#if currentMessages.length === 0}
						<div class="p-8 text-center text-gray-500">
							<div class="text-4xl mb-4">🏛️</div>
							<h3 class="font-semibold text-lg mb-2">Hello! I'm Ada, your Architecture Advisor.</h3>
							<p class="text-sm max-w-md mx-auto">
								Ask me about implementing features, database changes, API design, or any architectural decisions.
								I'll help you think through the approach and can generate Claude Code prompts for implementation.
							</p>
						</div>
					{:else}
						<div class="p-4 space-y-4">
							{#each currentMessages as message, i}
								<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
									<div class="{message.role === 'user' ? 'bg-primary-100 text-primary-900' : 'bg-gray-100 text-gray-900'} rounded-lg px-4 py-2 max-w-[80%]">
										<!-- Consultation tier badge for assistant messages -->
										{#if message.role === 'assistant' && message.consultation}
											<div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
												<button
													on:click={() => toggleConsultationDetails(i)}
													class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border {getTierClass(message.consultation.tier)} cursor-pointer hover:opacity-80 transition-opacity"
													title="Click for details"
												>
													<span>{getTierIcon(message.consultation.tier)}</span>
													<span class="capitalize">{message.consultation.tier}</span>
												</button>
												<span class="text-xs text-gray-400">
													{getModelShortName(message.consultation.models.primary.model)}
													{#if message.consultation.tier === 'deliberate' && message.consultation.models.review}
														+ {getModelShortName(message.consultation.models.review.model)}
													{/if}
												</span>
												{#if message.consultation.costCents > 0}
													<span class="text-xs text-gray-400">
														${(message.consultation.costCents / 100).toFixed(3)}
													</span>
												{/if}
											</div>
											<!-- Expandable consultation details -->
											{#if expandedConsultation === i}
												<div class="mb-2 p-2 bg-white/50 rounded text-xs space-y-1">
													<div><strong>Reason:</strong> {message.consultation.reason}</div>
													<div><strong>Triggers:</strong> {message.consultation.triggers.join(', ')}</div>
													<div><strong>Primary:</strong> {message.consultation.models.primary.provider} / {message.consultation.models.primary.model}</div>
													{#if message.consultation.models.review}
														<div><strong>Review:</strong> {message.consultation.models.review.provider} / {message.consultation.models.review.model}</div>
													{/if}
													{#if message.consultation.models.synthesizer}
														<div><strong>Synthesizer:</strong> {message.consultation.models.synthesizer.provider} / {message.consultation.models.synthesizer.model}</div>
													{/if}
													<div><strong>Tokens:</strong> {message.consultation.tokensUsed.toLocaleString()}</div>
												</div>
											{/if}
										{/if}
										<div class="whitespace-pre-wrap text-sm">{message.content}</div>
										{#if message.toolCalls?.length}
											<div class="mt-2 pt-2 border-t border-gray-200">
												<div class="text-xs text-gray-500 mb-1">Tools Used:</div>
												{#each message.toolCalls as tc}
													<span class="inline-flex items-center px-2 py-1 rounded text-xs bg-white border mr-1 mb-1">
														{tc.name}
													</span>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/each}
							{#if isLoading}
								<div class="flex justify-start">
									<div class="bg-gray-100 rounded-lg px-4 py-2">
										<div class="flex items-center gap-2">
											<div class="animate-pulse flex gap-1">
												<div class="w-2 h-2 bg-gray-400 rounded-full"></div>
												<div class="w-2 h-2 bg-gray-400 rounded-full animation-delay-200"></div>
												<div class="w-2 h-2 bg-gray-400 rounded-full animation-delay-400"></div>
											</div>
											<span class="text-sm text-gray-500">Ada is thinking...</span>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Message Input -->
				<div class="card p-4">
					<div class="flex gap-2">
						<textarea
							bind:value={messageInput}
							on:keydown={handleKeydown}
							placeholder="Ask Ada about architecture, features, or implementation..."
							rows="2"
							disabled={isLoading}
							class="input flex-1 resize-none"
						></textarea>
						<button
							on:click={sendMessage}
							disabled={!messageInput.trim() || isLoading}
							class="btn-primary px-6 self-end"
						>
							{isLoading ? 'Sending...' : 'Send'}
						</button>
					</div>
					<div class="flex justify-between items-center mt-2">
						<span class="text-xs text-gray-500">Press Enter to send, Shift+Enter for new line</span>
						{#if currentChatId}
							<button
								on:click={() => { currentChatId = null; currentMessages = []; }}
								class="text-xs text-gray-500 hover:text-gray-700"
							>
								New Conversation
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- History Tab -->
		{#if activeTab === 'history'}
			<div class="card">
				<div class="card-header flex justify-between items-center">
					<h3 class="font-semibold">Chat History</h3>
					<span class="text-sm text-gray-500">{data.chatSessions.length} sessions</span>
				</div>
				<div class="divide-y">
					{#if data.chatSessions.length === 0}
						<div class="p-8 text-center text-gray-500">
							No chat sessions yet. Start a conversation with Ada!
						</div>
					{:else}
						{#each data.chatSessions as session}
							<button
								on:click={() => loadChat(session.id)}
								class="w-full p-4 text-left hover:bg-gray-50 transition-colors"
							>
								<div class="flex justify-between items-start">
									<div>
										<div class="font-medium">{session.title || 'Untitled Conversation'}</div>
										<div class="text-sm text-gray-500 mt-1">
											{session.messageCount} messages · {session.tokensUsed.toLocaleString()} tokens
										</div>
									</div>
									<div class="text-xs text-gray-400">
										{new Date(session.updatedAt).toLocaleDateString()}
									</div>
								</div>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/if}

		<!-- Decisions Tab -->
		{#if activeTab === 'decisions'}
			<div class="space-y-4">
				<div class="flex justify-between items-center">
					<h3 class="font-semibold">Architecture Decisions</h3>
					<a href="/admin/architect/decisions" class="text-sm text-primary-600 hover:underline">
						View All →
					</a>
				</div>
				<div class="card">
					<div class="divide-y">
						{#if data.recentDecisions.length === 0}
							<div class="p-8 text-center text-gray-500">
								No architecture decisions yet. Ask Ada to create one!
							</div>
						{:else}
							{#each data.recentDecisions as decision}
								<a
									href="/admin/architect/decisions/{decision.id}"
									class="block p-4 hover:bg-gray-50 transition-colors"
								>
									<div class="flex justify-between items-start">
										<div>
											<div class="font-medium">{decision.title}</div>
											<div class="flex items-center gap-2 mt-1">
												<span class="inline-flex items-center px-2 py-0.5 rounded text-xs {getStatusClass(decision.status)}">
													{decision.status}
												</span>
												<span class="text-xs text-gray-500 capitalize">{decision.category}</span>
											</div>
										</div>
										<div class="text-xs text-gray-400">
											{new Date(decision.createdAt).toLocaleDateString()}
										</div>
									</div>
								</a>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Config Tab -->
		{#if activeTab === 'config'}
			<form method="POST" action="?/saveConfig" use:enhance class="space-y-6">
				<div class="card">
					<div class="card-header">
						<h3 class="font-semibold">Ada Configuration</h3>
					</div>
					<div class="card-body space-y-4">
						<!-- Enable Toggle -->
						<div class="flex items-center justify-between">
							<div>
								<label class="font-medium">Enable Ada</label>
								<p class="text-sm text-gray-500">Allow interactive architecture consultations</p>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input type="checkbox" name="enabled" checked={data.config?.enabled ?? false} class="sr-only peer">
								<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
							</label>
						</div>

						<!-- Dry Run Toggle -->
						<div class="flex items-center justify-between border-t pt-4">
							<div>
								<label class="font-medium">Dry Run Mode</label>
								<p class="text-sm text-gray-500">Return placeholder responses without calling the API</p>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input type="checkbox" name="dryRunMode" checked={data.config?.dryRunMode ?? false} class="sr-only peer">
								<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
							</label>
						</div>

						<!-- Provider Selection -->
						<div class="border-t pt-4">
							<label class="block font-medium mb-2">AI Provider</label>
							<select name="provider" value={data.config?.provider ?? 'anthropic'} class="input w-full">
								<option value="anthropic">Anthropic (Claude)</option>
								<option value="openai">OpenAI (GPT)</option>
							</select>
						</div>

						<!-- Model Selection -->
						<div>
							<label class="block font-medium mb-2">Model</label>
							<select name="model" value={data.config?.model ?? 'claude-3-5-sonnet-20241022'} class="input w-full">
								<option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Recommended)</option>
								<option value="claude-3-opus-20240229">Claude 3 Opus (Most Capable)</option>
								<option value="claude-3-haiku-20240307">Claude 3 Haiku (Fastest)</option>
								<option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
								<option value="gpt-4o">GPT-4o</option>
							</select>
						</div>

						<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
							<p class="text-sm text-blue-800">
								<strong>Note:</strong> Ada is an interactive advisor. Unlike the Office Manager and Revenue Optimizer, she doesn't run on a schedule. She responds to your questions and produces Claude Code prompts and ADRs.
							</p>
						</div>
					</div>
				</div>

				<button type="submit" class="btn-primary w-full">Save Configuration</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.animation-delay-200 {
		animation-delay: 0.2s;
	}
	.animation-delay-400 {
		animation-delay: 0.4s;
	}
</style>
