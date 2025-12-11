<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';

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

	// Tool call result types
	interface ToolCallResult {
		success: boolean;
		error?: string;
		// create_claude_code_prompt results
		prompt?: string;
		title?: string;
		decisionId?: string;
		// analyze_change_impact results
		affectedFiles?: { file: string; reason: string; severity: 'high' | 'medium' | 'low' }[];
		riskAssessment?: { level: 'high' | 'medium' | 'low'; factors: string[] };
		recommendations?: string[];
	}

	interface ToolCall {
		name: string;
		params?: Record<string, unknown>;
		result?: ToolCallResult;
	}

	interface ChatMessageWithMeta {
		role: 'user' | 'assistant';
		content: string;
		toolCalls?: ToolCall[];
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

	// Prompt modal state
	let showPromptModal = false;
	let currentPrompt = '';
	let currentPromptTitle = '';
	let copiedToClipboard = false;

	// Show prompt in modal
	function showPrompt(prompt: string, title: string) {
		currentPrompt = prompt;
		currentPromptTitle = title || 'Generated Claude Code Prompt';
		copiedToClipboard = false;
		showPromptModal = true;
	}

	// Copy prompt to clipboard
	async function copyPromptToClipboard() {
		await navigator.clipboard.writeText(currentPrompt);
		copiedToClipboard = true;
		setTimeout(() => copiedToClipboard = false, 2000);
	}

	// Check for generated prompts in tool calls
	function checkForGeneratedPrompts(toolCalls: ToolCall[]) {
		if (!toolCalls || !Array.isArray(toolCalls)) return;
		for (const tc of toolCalls) {
			if (tc.name === 'create_claude_code_prompt' && tc.result?.prompt) {
				const title = (tc.params?.title as string) || tc.result.title || '';
				showPrompt(tc.result.prompt, title);
				break; // Only show first prompt automatically
			}
		}
	}

	// Get severity color class
	function getSeverityClass(severity: string): string {
		switch (severity) {
			case 'high': return 'text-red-600 bg-red-50';
			case 'medium': return 'text-yellow-600 bg-yellow-50';
			case 'low': return 'text-green-600 bg-green-50';
			default: return 'text-gray-600 bg-gray-50';
		}
	}

	// Get risk level color class
	function getRiskLevelClass(level: string): string {
		switch (level) {
			case 'high': return 'text-red-700 bg-red-100 border-red-300';
			case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-300';
			case 'low': return 'text-green-700 bg-green-100 border-green-300';
			default: return 'text-gray-700 bg-gray-100 border-gray-300';
		}
	}

	// Start a new chat (reset state for new conversation button)
	function resetToNewChat() {
		currentChatId = null;
		currentMessages = [];
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
		// Capture message FIRST before any async operations or state changes
		const userMessage = messageInput.trim();

		if (!userMessage || isLoading) return;

		// Clear input and set loading state immediately
		messageInput = '';
		isLoading = true;

		// Create chat if needed
		let chatId = currentChatId;
		if (!chatId) {
			const response = await fetch('/api/architect/chats', {
				method: 'POST'
			});
			const result = await response.json();
			if (result.success) {
				chatId = result.session.id;
				currentChatId = chatId;
				currentMessages = [];
			} else {
				isLoading = false;
				return;
			}
		}

		currentMessages = [...currentMessages, { role: 'user', content: userMessage }];

		try {
			// Create an AbortController for timeout (2 minutes for complex queries)
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 120000);

			const response = await fetch(`/api/architect/chats/${chatId}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: userMessage,
					contextModules: selectedContextModules
				}),
				signal: controller.signal
			});

			clearTimeout(timeoutId);
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
				// Auto-show generated prompts
				if (result.toolCalls) {
					checkForGeneratedPrompts(result.toolCalls);
				}
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
			let errorMessage = 'Unknown error';
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					errorMessage = 'Request timed out after 2 minutes. Ada may be processing a complex query. Try asking a more specific question or reducing the context modules.';
				} else {
					errorMessage = error.message;
				}
			}
			currentMessages = [
				...currentMessages,
				{
					role: 'assistant',
					content: `Error: ${errorMessage}`
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
			case 'quick': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
			case 'standard': return 'bg-blue-100 text-blue-800 border-blue-300';
			case 'deliberate': return 'bg-violet-100 text-violet-800 border-violet-300';
			default: return 'bg-gray-100 text-gray-800 border-gray-200';
		}
	}

	function getTierIcon(tier: string): string {
		switch (tier) {
			case 'quick': return '⚡';
			case 'standard': return '🎯';
			case 'deliberate': return '🧠';
			default: return '🔄';
		}
	}

	function getTierDescription(tier: string): string {
		switch (tier) {
			case 'quick': return 'Fast response using efficient model';
			case 'standard': return 'Balanced response with full capabilities';
			case 'deliberate': return 'Multi-model deliberation for complex decisions';
			default: return 'Unknown tier';
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
											<div class="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200/70">
												<button
													on:click={() => toggleConsultationDetails(i)}
													class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-sm {getTierClass(message.consultation.tier)} cursor-pointer hover:shadow-md transition-all"
													title="{getTierDescription(message.consultation.tier)} - Click for details"
												>
													<span class="text-sm">{getTierIcon(message.consultation.tier)}</span>
													<span class="capitalize">{message.consultation.tier}</span>
												</button>
												<div class="flex items-center gap-1.5 text-xs text-gray-500">
													<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded">
														{getModelShortName(message.consultation.models.primary.model)}
													</span>
													{#if message.consultation.tier === 'deliberate' && message.consultation.models.review}
														<span class="text-gray-300">+</span>
														<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded">
															{getModelShortName(message.consultation.models.review.model)}
														</span>
													{/if}
												</div>
												{#if message.consultation.costCents > 0}
													<span class="text-xs text-gray-400 ml-auto">
														${(message.consultation.costCents / 100).toFixed(3)}
													</span>
												{/if}
											</div>
											<!-- Expandable consultation details -->
											{#if expandedConsultation === i}
												<div class="mb-3 p-3 bg-white/70 rounded-lg border border-gray-200 text-xs space-y-2 shadow-inner">
													<div class="text-gray-600">
														<span class="font-semibold text-gray-700">Why this tier:</span> {message.consultation.reason}
													</div>
													<div class="flex flex-wrap gap-1">
														<span class="font-semibold text-gray-700">Triggers:</span>
														{#each message.consultation.triggers as trigger}
															<span class="inline-flex px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{trigger}</span>
														{/each}
													</div>
													<div class="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
														<div>
															<span class="font-semibold text-gray-700">Primary Model:</span>
															<div class="text-gray-600">{message.consultation.models.primary.provider} / {message.consultation.models.primary.model}</div>
														</div>
														{#if message.consultation.models.review}
															<div>
																<span class="font-semibold text-gray-700">Review Model:</span>
																<div class="text-gray-600">{message.consultation.models.review.provider} / {message.consultation.models.review.model}</div>
															</div>
														{/if}
														{#if message.consultation.models.synthesizer}
															<div>
																<span class="font-semibold text-gray-700">Synthesizer:</span>
																<div class="text-gray-600">{message.consultation.models.synthesizer.provider} / {message.consultation.models.synthesizer.model}</div>
															</div>
														{/if}
													</div>
													<div class="flex justify-between pt-2 border-t border-gray-200">
														<span><span class="font-semibold text-gray-700">Tokens:</span> {message.consultation.tokensUsed.toLocaleString()}</span>
														<span><span class="font-semibold text-gray-700">Cost:</span> ${(message.consultation.costCents / 100).toFixed(4)}</span>
													</div>
												</div>
											{/if}
										{/if}
										<!-- Message content with markdown rendering for assistant -->
										{#if message.role === 'assistant'}
											<MarkdownRenderer content={message.content} class_name="text-sm" />
										{:else}
											<div class="whitespace-pre-wrap text-sm">{message.content}</div>
										{/if}
										{#if message.toolCalls?.length}
											<div class="mt-3 pt-3 border-t border-gray-200 space-y-3">
												<div class="text-xs font-medium text-gray-600">Tools Used:</div>
												{#each message.toolCalls as tc}
													<div class="rounded-lg border bg-white/80 overflow-hidden">
														<!-- Tool header -->
														<div class="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
															<span class="text-xs font-medium text-gray-700 flex items-center gap-1">
																{#if tc.name === 'create_claude_code_prompt'}
																	<span>📄</span> Create Claude Code Prompt
																{:else if tc.name === 'create_architecture_decision'}
																	<span>📋</span> Create Architecture Decision
																{:else if tc.name === 'analyze_change_impact'}
																	<span>🔍</span> Analyze Change Impact
																{:else}
																	<span>🔧</span> {tc.name}
																{/if}
															</span>
															{#if tc.result?.success === false}
																<span class="text-xs text-red-600">Failed</span>
															{:else if tc.result?.success === true}
																<span class="text-xs text-green-600">Success</span>
															{/if}
														</div>

														<!-- Tool result content -->
														<div class="p-3">
															{#if tc.result?.success === false}
																<div class="text-sm text-red-600">
																	Error: {tc.result.error || 'Unknown error'}
																</div>
															{:else if tc.name === 'create_claude_code_prompt' && tc.result?.prompt}
																<div class="flex items-center gap-2">
																	<button
																		class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-100 text-primary-700 border border-primary-200 hover:bg-primary-200 transition-colors cursor-pointer"
																		on:click={() => showPrompt(tc.result?.prompt || '', String(tc.params?.title || tc.result?.title || ''))}
																	>
																		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
																			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
																		</svg>
																		View Generated Prompt
																	</button>
																	<span class="text-xs text-gray-500">
																		{tc.result.prompt.length.toLocaleString()} characters
																	</span>
																	{#if tc.result.decisionId}
																		<a
																			href="/admin/architect/decisions/{tc.result.decisionId}"
																			class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
																		>
																			View ADR
																		</a>
																	{/if}
																</div>
															{:else if tc.name === 'create_architecture_decision' && tc.result?.decisionId}
																<div class="flex items-center gap-2">
																	<a
																		href="/admin/architect/decisions/{tc.result.decisionId}"
																		class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 transition-colors"
																	>
																		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
																		</svg>
																		View Decision Record
																	</a>
																	{#if tc.result.title}
																		<span class="text-xs text-gray-600">"{tc.result.title}"</span>
																	{/if}
																</div>
															{:else if tc.name === 'analyze_change_impact' && tc.result}
																<!-- Impact Analysis Results -->
																<div class="space-y-3">
																	<!-- Risk Level -->
																	{#if tc.result.riskAssessment}
																		<div class="flex items-center gap-2">
																			<span class="text-xs font-medium text-gray-600">Risk Level:</span>
																			<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border {getRiskLevelClass(tc.result.riskAssessment.level)}">
																				{tc.result.riskAssessment.level.toUpperCase()}
																			</span>
																		</div>
																		{#if tc.result.riskAssessment.factors?.length}
																			<div class="text-xs text-gray-600">
																				<span class="font-medium">Risk factors:</span>
																				<ul class="list-disc list-inside mt-1 text-gray-500">
																					{#each tc.result.riskAssessment.factors as factor}
																						<li>{factor}</li>
																					{/each}
																				</ul>
																			</div>
																		{/if}
																	{/if}

																	<!-- Affected Files -->
																	{#if tc.result.affectedFiles?.length}
																		<div>
																			<span class="text-xs font-medium text-gray-600">Affected Files ({tc.result.affectedFiles.length}):</span>
																			<div class="mt-1 max-h-32 overflow-y-auto space-y-1">
																				{#each tc.result.affectedFiles as file}
																					<div class="flex items-start gap-2 text-xs">
																						<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium {getSeverityClass(file.severity)}">
																							{file.severity}
																						</span>
																						<code class="text-gray-700 font-mono text-xs">{file.file}</code>
																						<span class="text-gray-400 truncate">- {file.reason}</span>
																					</div>
																				{/each}
																			</div>
																		</div>
																	{/if}

																	<!-- Recommendations -->
																	{#if tc.result.recommendations?.length}
																		<div>
																			<span class="text-xs font-medium text-gray-600">Recommendations:</span>
																			<ol class="list-decimal list-inside mt-1 text-xs text-gray-600 space-y-0.5">
																				{#each tc.result.recommendations as rec}
																					<li>{rec}</li>
																				{/each}
																			</ol>
																		</div>
																	{/if}
																</div>
															{:else}
																<!-- Generic fallback for other tools -->
																<div class="text-xs text-gray-500">
																	{#if tc.result}
																		<pre class="bg-gray-50 rounded p-2 overflow-auto max-h-24 text-xs">{JSON.stringify(tc.result, null, 2)}</pre>
																	{:else}
																		<span class="italic">No result data</span>
																	{/if}
																</div>
															{/if}
														</div>
													</div>
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
			<div class="space-y-6">
				<!-- Basic Settings -->
				<form method="POST" action="?/saveConfig" use:enhance class="card">
					<div class="card-header">
						<h3 class="font-semibold">Basic Settings</h3>
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
						<button type="submit" class="btn-primary w-full mt-4">Save Basic Settings</button>
					</div>
				</form>

				<!-- Model Configuration by Tier -->
				<form method="POST" action="?/saveTierConfig" use:enhance class="card">
					<div class="card-header">
						<h3 class="font-semibold">Model Configuration by Tier</h3>
						<p class="text-sm text-gray-500 mt-1">Ada uses different models based on query complexity</p>
					</div>
					<div class="card-body space-y-6">
						<!-- Quick Tier -->
						<div class="border rounded-lg p-4 bg-emerald-50">
							<div class="flex items-center gap-2 mb-3">
								<span class="text-lg">⚡</span>
								<span class="font-medium text-emerald-800">Quick Tier</span>
								<span class="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">Simple questions</span>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Provider</label>
									<select name="quickProvider" class="input w-full text-sm">
										<option value="anthropic" selected={data.tierConfig?.quickProvider === 'anthropic'}>Anthropic</option>
										<option value="openai" selected={data.tierConfig?.quickProvider === 'openai'}>OpenAI</option>
									</select>
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
									<select name="quickModel" class="input w-full text-sm">
										<optgroup label="Anthropic">
											<option value="claude-3-5-sonnet-20241022" selected={data.tierConfig?.quickModel === 'claude-3-5-sonnet-20241022'}>Claude 3.5 Sonnet</option>
											<option value="claude-3-5-haiku-20241022" selected={data.tierConfig?.quickModel === 'claude-3-5-haiku-20241022'}>Claude 3.5 Haiku</option>
											<option value="claude-sonnet-4-20250514" selected={data.tierConfig?.quickModel === 'claude-sonnet-4-20250514'}>Claude Sonnet 4</option>
										</optgroup>
										<optgroup label="OpenAI">
											<option value="gpt-4o-mini" selected={data.tierConfig?.quickModel === 'gpt-4o-mini'}>GPT-4o Mini</option>
											<option value="gpt-4o" selected={data.tierConfig?.quickModel === 'gpt-4o'}>GPT-4o</option>
										</optgroup>
									</select>
								</div>
							</div>
						</div>

						<!-- Standard Tier -->
						<div class="border rounded-lg p-4 bg-blue-50">
							<div class="flex items-center gap-2 mb-3">
								<span class="text-lg">🎯</span>
								<span class="font-medium text-blue-800">Standard Tier</span>
								<span class="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">Normal discussions</span>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Provider</label>
									<select name="standardProvider" class="input w-full text-sm">
										<option value="anthropic" selected={data.tierConfig?.standardProvider === 'anthropic'}>Anthropic</option>
										<option value="openai" selected={data.tierConfig?.standardProvider === 'openai'}>OpenAI</option>
									</select>
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
									<select name="standardModel" class="input w-full text-sm">
										<optgroup label="Anthropic">
											<option value="claude-sonnet-4-20250514" selected={data.tierConfig?.standardModel === 'claude-sonnet-4-20250514'}>Claude Sonnet 4</option>
											<option value="claude-3-5-sonnet-20241022" selected={data.tierConfig?.standardModel === 'claude-3-5-sonnet-20241022'}>Claude 3.5 Sonnet</option>
											<option value="claude-opus-4-20250514" selected={data.tierConfig?.standardModel === 'claude-opus-4-20250514'}>Claude Opus 4</option>
										</optgroup>
										<optgroup label="OpenAI">
											<option value="gpt-4o" selected={data.tierConfig?.standardModel === 'gpt-4o'}>GPT-4o</option>
											<option value="o1-mini" selected={data.tierConfig?.standardModel === 'o1-mini'}>o1 Mini</option>
										</optgroup>
									</select>
								</div>
							</div>
						</div>

						<!-- Deliberate Tier -->
						<div class="border rounded-lg p-4 bg-violet-50">
							<div class="flex items-center gap-2 mb-3">
								<span class="text-lg">🧠</span>
								<span class="font-medium text-violet-800">Deliberate Tier</span>
								<span class="text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded">Major decisions</span>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Provider</label>
									<select name="deliberatePrimaryProvider" class="input w-full text-sm">
										<option value="anthropic" selected={data.tierConfig?.deliberatePrimaryProvider === 'anthropic'}>Anthropic</option>
										<option value="openai" selected={data.tierConfig?.deliberatePrimaryProvider === 'openai'}>OpenAI</option>
									</select>
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
									<select name="deliberatePrimaryModel" class="input w-full text-sm">
										<optgroup label="Anthropic">
											<option value="claude-opus-4-20250514" selected={data.tierConfig?.deliberatePrimaryModel === 'claude-opus-4-20250514'}>Claude Opus 4</option>
											<option value="claude-sonnet-4-20250514" selected={data.tierConfig?.deliberatePrimaryModel === 'claude-sonnet-4-20250514'}>Claude Sonnet 4</option>
										</optgroup>
										<optgroup label="OpenAI">
											<option value="o1" selected={data.tierConfig?.deliberatePrimaryModel === 'o1'}>o1 (Reasoning)</option>
											<option value="gpt-4o" selected={data.tierConfig?.deliberatePrimaryModel === 'gpt-4o'}>GPT-4o</option>
										</optgroup>
									</select>
								</div>
							</div>
						</div>

						<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
							<p class="text-sm text-blue-800">
								<strong>How tiers work:</strong> Ada automatically selects a tier based on your message complexity. Quick tier handles simple questions, Standard for normal discussions, and Deliberate for major architectural decisions requiring deeper analysis.
							</p>
						</div>

						<button type="submit" class="btn-primary w-full">Save Model Configuration</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
</div>

<!-- Prompt Modal -->
{#if showPromptModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/50"
			on:click={() => showPromptModal = false}
			on:keydown={(e) => e.key === 'Escape' && (showPromptModal = false)}
			aria-label="Close modal"
		></button>

		<!-- Modal -->
		<div class="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b">
				<h3 class="font-bold text-lg flex items-center gap-2">
					<span>📋</span>
					<span>{currentPromptTitle}</span>
				</h3>
				<button
					class="p-2 rounded-full hover:bg-gray-100 transition-colors"
					on:click={() => showPromptModal = false}
					aria-label="Close"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-auto p-4">
				<div class="bg-gray-50 rounded-lg p-4 border">
					<MarkdownRenderer content={currentPrompt} class_name="text-sm prompt-content" />
				</div>
			</div>

			<!-- Footer -->
			<div class="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-xl">
				<button
					class="px-4 py-2 rounded-lg border hover:bg-gray-100 transition-colors"
					on:click={() => showPromptModal = false}
				>
					Close
				</button>
				<button
					class="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors flex items-center gap-2"
					on:click={copyPromptToClipboard}
				>
					{#if copiedToClipboard}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
						</svg>
						Copied!
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
						</svg>
						Copy to Clipboard
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.animation-delay-200 {
		animation-delay: 0.2s;
	}
	.animation-delay-400 {
		animation-delay: 0.4s;
	}
</style>
