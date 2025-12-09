<script lang="ts">
	import type { PageData } from './$types';
	import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';

	export let data: PageData;

	// Track which prompt is expanded
	let expandedMentat: string | null = null;

	function toggleExpand(codename: string) {
		expandedMentat = expandedMentat === codename ? null : codename;
	}

	function getStatusClass(enabled: boolean, dryRunMode: boolean): string {
		if (!enabled) return 'bg-gray-100 text-gray-800';
		if (dryRunMode) return 'bg-yellow-100 text-yellow-800';
		return 'bg-green-100 text-green-800';
	}

	function getStatusText(enabled: boolean, dryRunMode: boolean): string {
		if (!enabled) return 'Disabled';
		if (dryRunMode) return 'Dry Run';
		return 'Active';
	}

	function formatProvider(provider: string): string {
		return provider === 'anthropic' ? 'Anthropic' : 'OpenAI';
	}

	function formatModel(model: string): string {
		const modelNames: Record<string, string> = {
			'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
			'claude-3-opus-20240229': 'Claude 3 Opus',
			'claude-3-haiku-20240307': 'Claude 3 Haiku',
			'claude-sonnet-4-20250514': 'Claude Sonnet 4',
			'claude-opus-4-20250514': 'Claude Opus 4',
			'gpt-4o': 'GPT-4o',
			'gpt-4-turbo-preview': 'GPT-4 Turbo',
			'gpt-4': 'GPT-4'
		};
		return modelNames[model] || model;
	}

	function formatTone(tone: string | undefined): string {
		if (!tone) return 'Default';
		const toneNames: Record<string, string> = {
			'helpful_parent': 'Helpful Parent',
			'professional': 'Professional',
			'casual': 'Casual',
			'formal': 'Formal'
		};
		return toneNames[tone] || tone;
	}

	// Copy prompt to clipboard
	let copiedMentat: string | null = null;
	async function copyPrompt(codename: string, prompt: string) {
		await navigator.clipboard.writeText(prompt);
		copiedMentat = codename;
		setTimeout(() => copiedMentat = null, 2000);
	}
</script>

<svelte:head>
	<title>System Prompts - AI Mentats - TeamTime Admin</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-5xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<div class="flex items-center gap-2 mb-1">
					<a href="/admin/ai" class="text-gray-500 hover:text-gray-700">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
						</svg>
					</a>
					<h1 class="text-2xl font-bold">System Prompts</h1>
				</div>
				<p class="text-sm text-gray-500">View the system prompts used by each AI Mentat</p>
			</div>
		</div>

		<!-- Info Banner -->
		<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
			<div class="flex gap-3">
				<svg class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<p class="text-sm text-blue-800">
						<strong>Read-Only View:</strong> These are the actual system prompts sent to the AI models.
						The prompts are generated dynamically based on each agent's configuration settings.
						To modify prompts, update the agent's configuration or custom instructions on the
						<a href="/admin/ai" class="underline hover:no-underline">AI Mentats page</a>.
					</p>
				</div>
			</div>
		</div>

		<!-- Mentat Prompts -->
		<div class="space-y-4">
			{#each data.mentats as mentat}
				<div class="card">
					<!-- Header (always visible) -->
					<button
						class="w-full card-header flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
						on:click={() => toggleExpand(mentat.codename)}
					>
						<div class="flex items-center gap-3">
							<div class="text-2xl">
								{#if mentat.codename === 'office_manager'}
									<span title="Office Manager">&#128188;</span>
								{:else if mentat.codename === 'revenue_optimizer'}
									<span title="Revenue Optimizer">&#128202;</span>
								{:else}
									<span title="Architecture Advisor">&#127963;</span>
								{/if}
							</div>
							<div class="text-left">
								<h3 class="font-semibold">{mentat.name}</h3>
								<p class="text-sm text-gray-500">{mentat.description}</p>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getStatusClass(mentat.enabled, mentat.dryRunMode)}">
								{getStatusText(mentat.enabled, mentat.dryRunMode)}
							</span>
							<svg
								class="w-5 h-5 text-gray-400 transition-transform {expandedMentat === mentat.codename ? 'rotate-180' : ''}"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
							</svg>
						</div>
					</button>

					<!-- Expanded Content -->
					{#if expandedMentat === mentat.codename}
						<div class="card-body border-t">
							<!-- Metadata -->
							<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b">
								<div>
									<span class="text-xs text-gray-500 uppercase tracking-wide">Provider</span>
									<p class="font-medium">{formatProvider(mentat.provider)}</p>
								</div>
								<div>
									<span class="text-xs text-gray-500 uppercase tracking-wide">Model</span>
									<p class="font-medium">{formatModel(mentat.model)}</p>
								</div>
								{#if mentat.tone}
									<div>
										<span class="text-xs text-gray-500 uppercase tracking-wide">Tone</span>
										<p class="font-medium">{formatTone(mentat.tone)}</p>
									</div>
								{/if}
								<div>
									<span class="text-xs text-gray-500 uppercase tracking-wide">Prompt Length</span>
									<p class="font-medium">{mentat.systemPrompt.length.toLocaleString()} chars</p>
								</div>
							</div>

							<!-- System Prompt -->
							<div class="mb-4">
								<div class="flex items-center justify-between mb-2">
									<h4 class="font-medium text-gray-700">System Prompt</h4>
									<button
										class="inline-flex items-center gap-1 px-3 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200 transition-colors"
										on:click|stopPropagation={() => copyPrompt(mentat.codename, mentat.systemPrompt)}
									>
										{#if copiedMentat === mentat.codename}
											<svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
											</svg>
											<span class="text-green-600">Copied!</span>
										{:else}
											<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
											</svg>
											<span>Copy</span>
										{/if}
									</button>
								</div>
								<div class="bg-gray-50 rounded-lg border max-h-[500px] overflow-y-auto">
									<div class="p-4">
										<MarkdownRenderer content={mentat.systemPrompt} class_name="text-sm" />
									</div>
								</div>
							</div>

							<!-- Tools Description (for Ada) -->
							{#if mentat.toolsDescription}
								<div>
									<div class="flex items-center justify-between mb-2">
										<h4 class="font-medium text-gray-700">Available Tools</h4>
										<button
											class="inline-flex items-center gap-1 px-3 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200 transition-colors"
											on:click|stopPropagation={() => copyPrompt(mentat.codename + '_tools', mentat.toolsDescription || '')}
										>
											{#if copiedMentat === mentat.codename + '_tools'}
												<svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
												</svg>
												<span class="text-green-600">Copied!</span>
											{:else}
												<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
												</svg>
												<span>Copy</span>
											{/if}
										</button>
									</div>
									<div class="bg-gray-50 rounded-lg border max-h-[300px] overflow-y-auto">
										<div class="p-4">
											<MarkdownRenderer content={mentat.toolsDescription} class_name="text-sm" />
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
