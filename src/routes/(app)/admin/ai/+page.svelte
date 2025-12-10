<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	// Tab state
	let activeTab: 'dashboard' | 'office-manager' | 'revenue-optimizer' | 'policies' | 'api-keys' = 'dashboard';

	// New policy form
	let newPolicyContent = '';
	let newPolicyPriority = 50;

	// Provider state (local variables that can be changed by UI)
	let omProvider: string = data.officeManager?.provider ?? 'anthropic';
	let roProvider: string = data.revenueOptimizer?.provider ?? 'anthropic';

	// Model state
	let omModel: string = data.officeManager?.model ?? 'claude-3-haiku-20240307';
	let roModel: string = data.revenueOptimizer?.model ?? 'claude-3-haiku-20240307';

	// Computed model lists based on selected provider
	$: currentModels = data.modelOptions[omProvider as keyof typeof data.modelOptions] || [];
	$: roCurrentModels = data.modelOptions[roProvider as keyof typeof data.modelOptions] || [];

	// Reset model to first option when provider changes
	$: if (currentModels.length > 0 && !currentModels.find(m => m.value === omModel)) {
		omModel = currentModels[0].value;
	}
	$: if (roCurrentModels.length > 0 && !roCurrentModels.find(m => m.value === roModel)) {
		roModel = roCurrentModels[0].value;
	}
</script>

<svelte:head>
	<title>AI Mentats - TeamTime Admin</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-4xl mx-auto">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold">AI Mentats</h1>
				<p class="text-sm text-gray-500 mt-1">Configure the AI Office Manager and Revenue Optimizer</p>
			</div>
			<div class="flex items-center gap-2">
				<a
					href="/admin/ai/prompts"
					class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
					</svg>
					View System Prompts
				</a>
				{#if data.hasAnthropicKey || data.hasOpenAIKey || data.hasSegmindKey}
					<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
						API Configured
					</span>
				{:else}
					<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
						API Key Required
					</span>
				{/if}
			</div>
		</div>

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				{form.message || 'Settings saved successfully'}
			</div>
		{/if}

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		<!-- Tab Navigation -->
		<div class="border-b border-gray-200 mb-6">
			<nav class="flex gap-4 overflow-x-auto">
				<button
					on:click={() => activeTab = 'dashboard'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'dashboard' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Dashboard
				</button>
				<button
					on:click={() => activeTab = 'office-manager'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'office-manager' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Office Manager
				</button>
				<button
					on:click={() => activeTab = 'revenue-optimizer'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'revenue-optimizer' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Revenue Optimizer
				</button>
				<button
					on:click={() => activeTab = 'policies'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'policies' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					Policies
				</button>
				<button
					on:click={() => activeTab = 'api-keys'}
					class="px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap {activeTab === 'api-keys' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				>
					API Keys
				</button>
			</nav>
		</div>

		<!-- Dashboard Tab -->
		{#if activeTab === 'dashboard'}
			<div class="space-y-6">
				<!-- Stats Cards -->
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<div class="card p-4">
						<div class="text-2xl font-bold text-primary-600">{data.stats.actionsToday}</div>
						<div class="text-sm text-gray-500">Actions Today</div>
					</div>
					<div class="card p-4">
						<div class="text-2xl font-bold text-green-600">{data.stats.executedToday}</div>
						<div class="text-sm text-gray-500">Executed</div>
					</div>
					<div class="card p-4">
						<div class="text-2xl font-bold text-blue-600">{data.stats.activeMemories}</div>
						<div class="text-sm text-gray-500">Active Memories</div>
					</div>
					<div class="card p-4">
						<div class="text-2xl font-bold text-purple-600">${(data.stats.totalCostToday / 100).toFixed(2)}</div>
						<div class="text-sm text-gray-500">Cost Today</div>
					</div>
				</div>

				<!-- Agent Status -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<div class="card p-4">
						<div class="flex items-center justify-between mb-2">
							<h3 class="font-semibold">Office Manager</h3>
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {data.officeManager?.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
								{data.officeManager?.enabled ? 'Active' : 'Disabled'}
							</span>
						</div>
						{#if data.officeManager?.dryRunMode}
							<span class="inline-flex items-center px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
								Dry Run Mode
							</span>
						{/if}
						<p class="text-sm text-gray-500 mt-2">
							Runs every 15 minutes, 7am-7pm. Monitors attendance, tasks, and sends helpful reminders.
						</p>
					</div>

					<div class="card p-4">
						<div class="flex items-center justify-between mb-2">
							<h3 class="font-semibold">Revenue Optimizer</h3>
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {data.revenueOptimizer?.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
								{data.revenueOptimizer?.enabled ? 'Active' : 'Disabled'}
							</span>
						</div>
						{#if data.revenueOptimizer?.dryRunMode}
							<span class="inline-flex items-center px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
								Dry Run Mode
							</span>
						{/if}
						<p class="text-sm text-gray-500 mt-2">
							Runs nightly at 11pm. Analyzes patterns and writes memories/policies that guide the Office Manager.
						</p>
					</div>
				</div>

				<!-- Recent Actions -->
				<div class="card">
					<div class="card-header">
						<h3 class="font-semibold">Recent Actions (Last 24 Hours)</h3>
					</div>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-4 py-2 text-left">Time</th>
									<th class="px-4 py-2 text-left">Agent</th>
									<th class="px-4 py-2 text-left">Action</th>
									<th class="px-4 py-2 text-left">Status</th>
								</tr>
							</thead>
							<tbody>
								{#if data.recentActions.length === 0}
									<tr>
										<td colspan="4" class="px-4 py-8 text-center text-gray-500">
											No actions recorded yet. Enable an agent to start!
										</td>
									</tr>
								{:else}
									{#each data.recentActions as action}
										<tr class="border-t">
											<td class="px-4 py-2 whitespace-nowrap">
												{new Date(action.createdAt).toLocaleTimeString()}
											</td>
											<td class="px-4 py-2">
												<span class="capitalize">{action.agent.replace('_', ' ')}</span>
											</td>
											<td class="px-4 py-2">
												{action.toolName || 'Observation'}
											</td>
											<td class="px-4 py-2">
												{#if action.executed}
													<span class="inline-flex items-center px-2 py-1 rounded text-xs bg-green-100 text-green-800">Executed</span>
												{:else if action.blockedReason}
													<span class="inline-flex items-center px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800" title={action.blockedReason}>Blocked</span>
												{:else if action.error}
													<span class="inline-flex items-center px-2 py-1 rounded text-xs bg-red-100 text-red-800" title={action.error}>Error</span>
												{:else}
													<span class="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">Logged</span>
												{/if}
											</td>
										</tr>
									{/each}
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{/if}

		<!-- Office Manager Tab -->
		{#if activeTab === 'office-manager'}
			<form method="POST" action="?/saveOfficeManager" use:enhance class="space-y-6">
				<div class="card">
					<div class="card-header">
						<h3 class="font-semibold">Office Manager Configuration</h3>
					</div>
					<div class="card-body space-y-4">
						<!-- Enable Toggle -->
						<div class="flex items-center justify-between">
							<div>
								<label class="font-medium">Enable Office Manager</label>
								<p class="text-sm text-gray-500">Runs every 15 minutes during business hours</p>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input type="checkbox" name="enabled" checked={data.officeManager?.enabled ?? false} class="sr-only peer">
								<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
							</label>
						</div>

						<!-- Dry Run Toggle -->
						<div class="flex items-center justify-between border-t pt-4">
							<div>
								<label class="font-medium">Dry Run Mode</label>
								<p class="text-sm text-gray-500">Log actions without executing them (for testing)</p>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input type="checkbox" name="dryRunMode" checked={data.officeManager?.dryRunMode ?? false} class="sr-only peer">
								<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
							</label>
						</div>

						<!-- Provider Selection -->
						<div class="border-t pt-4">
							<label class="block font-medium mb-2">AI Provider</label>
							<select name="provider" bind:value={omProvider} class="input w-full">
								<option value="anthropic" disabled={!data.hasAnthropicKey}>
									Anthropic (Claude) {!data.hasAnthropicKey ? '- API Key Required' : ''}
								</option>
								<option value="openai" disabled={!data.hasOpenAIKey}>
									OpenAI (GPT) {!data.hasOpenAIKey ? '- API Key Required' : ''}
								</option>
								<option value="segmind" disabled={!data.hasSegmindKey}>
									Segmind (Multi-Provider) {!data.hasSegmindKey ? '- API Key Required' : ''}
								</option>
							</select>
						</div>

						<!-- Model Selection -->
						<div>
							<label class="block font-medium mb-2">Model</label>
							<select name="model" bind:value={omModel} class="input w-full">
								{#each currentModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
						</div>

						<!-- Tone Selection -->
						<div>
							<label class="block font-medium mb-2">Communication Tone</label>
							<select name="tone" value={data.officeManager?.tone ?? 'helpful_parent'} class="input w-full">
								{#each Object.entries(data.toneDescriptions) as [value, desc]}
									<option value={value}>{desc}</option>
								{/each}
							</select>
						</div>

						<!-- Temperature -->
						<div>
							<label class="block font-medium mb-2">Temperature: {data.officeManager?.temperature ?? 0.3}</label>
							<input type="range" name="temperature" min="0" max="1" step="0.1" value={data.officeManager?.temperature ?? 0.3} class="w-full">
							<p class="text-sm text-gray-500">Lower = more consistent, Higher = more creative</p>
						</div>

						<!-- Recipients -->
						<div class="border-t pt-4">
							<div class="flex items-center justify-between">
								<div>
									<label class="font-medium">Send Recommendations to All Admins</label>
									<p class="text-sm text-gray-500">When enabled, workflow tips go to all admin users</p>
								</div>
								<label class="relative inline-flex items-center cursor-pointer">
									<input type="checkbox" name="sendToAllAdmins" checked={data.officeManager?.sendToAllAdmins ?? true} class="sr-only peer">
									<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
								</label>
							</div>
						</div>

						<!-- Custom Instructions -->
						<div class="border-t pt-4">
							<label class="block font-medium mb-2">Custom Instructions</label>
							<textarea
								name="instructions"
								value={data.officeManager?.instructions ?? data.defaultInstructions.office_manager}
								rows="4"
								class="input w-full font-mono text-sm"
								placeholder="Additional instructions for the Office Manager..."
							></textarea>
							<p class="text-sm text-gray-500 mt-1">These instructions are appended to the system prompt</p>
						</div>
					</div>
				</div>

				<button type="submit" class="btn-primary w-full">Save Office Manager Settings</button>
			</form>
		{/if}

		<!-- Revenue Optimizer Tab -->
		{#if activeTab === 'revenue-optimizer'}
			<form method="POST" action="?/saveRevenueOptimizer" use:enhance class="space-y-6">
				<div class="card">
					<div class="card-header">
						<h3 class="font-semibold">Revenue Optimizer Configuration</h3>
					</div>
					<div class="card-body space-y-4">
						<!-- Enable Toggle -->
						<div class="flex items-center justify-between">
							<div>
								<label class="font-medium">Enable Revenue Optimizer</label>
								<p class="text-sm text-gray-500">Runs nightly at 11pm</p>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input type="checkbox" name="enabled" checked={data.revenueOptimizer?.enabled ?? false} class="sr-only peer">
								<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
							</label>
						</div>

						<!-- Dry Run Toggle -->
						<div class="flex items-center justify-between border-t pt-4">
							<div>
								<label class="font-medium">Dry Run Mode</label>
								<p class="text-sm text-gray-500">Log actions without executing them</p>
							</div>
							<label class="relative inline-flex items-center cursor-pointer">
								<input type="checkbox" name="dryRunMode" checked={data.revenueOptimizer?.dryRunMode ?? false} class="sr-only peer">
								<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
							</label>
						</div>

						<!-- Provider Selection -->
						<div class="border-t pt-4">
							<label class="block font-medium mb-2">AI Provider</label>
							<select name="provider" bind:value={roProvider} class="input w-full">
								<option value="anthropic" disabled={!data.hasAnthropicKey}>
									Anthropic (Claude) {!data.hasAnthropicKey ? '- API Key Required' : ''}
								</option>
								<option value="openai" disabled={!data.hasOpenAIKey}>
									OpenAI (GPT) {!data.hasOpenAIKey ? '- API Key Required' : ''}
								</option>
								<option value="segmind" disabled={!data.hasSegmindKey}>
									Segmind (Multi-Provider) {!data.hasSegmindKey ? '- API Key Required' : ''}
								</option>
							</select>
						</div>

						<!-- Model Selection -->
						<div>
							<label class="block font-medium mb-2">Model</label>
							<select name="model" bind:value={roModel} class="input w-full">
								{#each roCurrentModels as model}
									<option value={model.value}>{model.label}</option>
								{/each}
							</select>
						</div>

						<!-- Recipients -->
						<div class="border-t pt-4">
							<div class="flex items-center justify-between">
								<div>
									<label class="font-medium">Send Reports to All Admins</label>
									<p class="text-sm text-gray-500">Daily summaries and recommendations go to all admin users</p>
								</div>
								<label class="relative inline-flex items-center cursor-pointer">
									<input type="checkbox" name="sendToAllAdmins" checked={data.revenueOptimizer?.sendToAllAdmins ?? true} class="sr-only peer">
									<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
								</label>
							</div>
						</div>

						<!-- Custom Instructions -->
						<div class="border-t pt-4">
							<label class="block font-medium mb-2">Custom Instructions</label>
							<textarea
								name="instructions"
								value={data.revenueOptimizer?.instructions ?? data.defaultInstructions.revenue_optimizer}
								rows="4"
								class="input w-full font-mono text-sm"
								placeholder="Additional instructions for the Revenue Optimizer..."
							></textarea>
						</div>
					</div>
				</div>

				<button type="submit" class="btn-primary w-full">Save Revenue Optimizer Settings</button>
			</form>
		{/if}

		<!-- Policies Tab -->
		{#if activeTab === 'policies'}
			<div class="space-y-6">
				<div class="card">
					<div class="card-header">
						<h3 class="font-semibold">Add Policy Note</h3>
						<p class="text-sm text-gray-500">Policies guide the Office Manager's behavior</p>
					</div>
					<form method="POST" action="?/addPolicy" use:enhance class="card-body space-y-4">
						<div>
							<label class="block font-medium mb-2">Policy Content</label>
							<textarea
								name="content"
								bind:value={newPolicyContent}
								rows="3"
								class="input w-full"
								placeholder="e.g., 'Be extra supportive with new employees during their first week'"
							></textarea>
						</div>
						<div>
							<label class="block font-medium mb-2">Priority: {newPolicyPriority}</label>
							<input type="range" name="priority" min="1" max="100" bind:value={newPolicyPriority} class="w-full">
							<p class="text-sm text-gray-500">Higher priority policies take precedence</p>
						</div>
						<button type="submit" class="btn-primary">Add Policy</button>
					</form>
				</div>

				<div class="card">
					<div class="card-header">
						<h3 class="font-semibold">Active Policies ({data.stats.activePolicies})</h3>
					</div>
					<div class="card-body">
						{#if data.stats.activePolicies === 0}
							<p class="text-gray-500 text-center py-4">No policies defined yet. Add one above or let the Revenue Optimizer create them automatically.</p>
						{:else}
							<p class="text-gray-500">Policy list coming soon...</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- API Keys Tab -->
		{#if activeTab === 'api-keys'}
			<form method="POST" action="?/saveApiKeys" use:enhance class="space-y-6">
				<div class="card">
					<div class="card-header">
						<h3 class="font-semibold">API Keys</h3>
						<p class="text-sm text-gray-500">Keys are stored locally and never sent to our servers</p>
					</div>
					<div class="card-body space-y-4">
						<div>
							<label class="block font-medium mb-2">
								Anthropic API Key
								{#if data.hasAnthropicKey}
									<span class="ml-2 text-xs text-green-600">Configured</span>
								{/if}
							</label>
							<input
								type="password"
								name="anthropicKey"
								class="input w-full font-mono"
								placeholder={data.hasAnthropicKey ? '••••••••••••••••' : 'sk-ant-...'}
							>
							<p class="text-sm text-gray-500 mt-1">
								Get your key at <a href="https://console.anthropic.com/" target="_blank" class="text-primary-600 hover:underline">console.anthropic.com</a>
							</p>
						</div>

						<div class="border-t pt-4">
							<label class="block font-medium mb-2">
								OpenAI API Key
								{#if data.hasOpenAIKey}
									<span class="ml-2 text-xs text-green-600">Configured</span>
								{/if}
							</label>
							<input
								type="password"
								name="openaiKey"
								class="input w-full font-mono"
								placeholder={data.hasOpenAIKey ? '••••••••••••••••' : 'sk-...'}
							>
							<p class="text-sm text-gray-500 mt-1">
								Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" class="text-primary-600 hover:underline">platform.openai.com</a>
							</p>
						</div>

						<div class="border-t pt-4">
							<label class="block font-medium mb-2">
								Segmind API Key
								{#if data.hasSegmindKey}
									<span class="ml-2 text-xs text-green-600">Configured</span>
								{/if}
							</label>
							<input
								type="password"
								name="segmindKey"
								class="input w-full font-mono"
								placeholder={data.hasSegmindKey ? '••••••••••••••••' : 'SG_...'}
							>
							<p class="text-sm text-gray-500 mt-1">
								Get your key at <a href="https://www.segmind.com/api-keys" target="_blank" class="text-primary-600 hover:underline">segmind.com</a> - Access Claude, GPT, Gemini, DeepSeek, Llama & more
							</p>
						</div>

						<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
							<p class="text-sm text-yellow-800">
								<strong>Security Note:</strong> API keys are stored in a local file that is excluded from git. They are never transmitted to any external service except the AI providers themselves.
							</p>
						</div>
					</div>
				</div>

				<button type="submit" class="btn-primary w-full">Save API Keys</button>
			</form>
		{/if}
	</div>
</div>
