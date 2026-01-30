<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let newName = '';
	let newPlatform: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'twitter' | 'other' = 'instagram';
	let loading = false;

	const platformIcons: Record<string, string> = {
		instagram: '\u{1F4F7}',
		facebook: '\u{1F464}',
		tiktok: '\u{1F3B5}',
		youtube: '\u{25B6}\u{FE0F}',
		twitter: '\u{1F426}',
		other: '\u{1F4F1}'
	};

	const platformLabels: Record<string, string> = {
		instagram: 'Instagram',
		facebook: 'Facebook',
		tiktok: 'TikTok',
		youtube: 'YouTube',
		twitter: 'Twitter/X',
		other: 'Other'
	};

	function formatDate(date: string | Date | null) {
		if (!date) return '-';
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatNumber(num: number | undefined): string {
		if (num === undefined) return '-';
		return num.toLocaleString();
	}

	function resetForm() {
		newName = '';
		newPlatform = 'instagram';
		showCreateModal = false;
	}
</script>

<svelte:head>
	<title>Social Media Configs - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Social Media Metrics</h1>
			<p class="text-gray-600 mt-1">Configure platforms and track engagement metrics</p>
		</div>
		<button on:click={() => showCreateModal = true} class="btn-primary">
			<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Config
		</button>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
			{form.created ? 'Configuration created!' : form.deleted ? 'Configuration deleted!' : 'Configuration updated!'}
		</div>
	{/if}

	<!-- Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-purple-600">{data.configs.length}</div>
				<div class="text-sm text-gray-600">Total Configs</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-green-600">{data.configs.filter(c => c.isActive).length}</div>
				<div class="text-sm text-gray-600">Active</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-blue-600">{data.recentSubmissions.length}</div>
				<div class="text-sm text-gray-600">Recent Submissions</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-orange-600">{data.configs.reduce((acc, c) => acc + c.submissionCount, 0)}</div>
				<div class="text-sm text-gray-600">Total Submissions</div>
			</div>
		</div>
	</div>

	<!-- Configurations -->
	<div class="card mb-8">
		<div class="card-header">
			<h2 class="font-semibold">Configurations</h2>
		</div>
		{#if data.configs.length > 0}
			<div class="divide-y divide-gray-200">
				{#each data.configs as config}
					<div class="px-4 py-4 hover:bg-gray-50">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="text-2xl">{platformIcons[config.platform] || platformIcons.other}</span>
								<div>
									<div class="flex items-center gap-2">
										<span class="font-medium text-gray-900">{config.name}</span>
										<span class="px-2 py-0.5 text-xs rounded-full {config.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
											{config.isActive ? 'Active' : 'Inactive'}
										</span>
									</div>
									<div class="text-sm text-gray-500">
										{platformLabels[config.platform]} &bull; {config.fields?.length || 0} fields &bull; {config.submissionCount} submissions
									</div>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<form method="POST" action="?/toggleActive" use:enhance>
									<input type="hidden" name="configId" value={config.id} />
									<button type="submit" class="text-sm text-primary-600 hover:text-primary-700">
										{config.isActive ? 'Deactivate' : 'Activate'}
									</button>
								</form>
								<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
									if (!confirm('Delete this configuration?')) {
										cancel();
									}
								}} class="inline">
									<input type="hidden" name="configId" value={config.id} />
									<button
										type="submit"
										class="text-sm text-red-600 hover:text-red-700"
									>
										Delete
									</button>
								</form>
							</div>
						</div>
						{#if config.fields && config.fields.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each config.fields as field}
									<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
										{field.label}{field.required ? '*' : ''}
									</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div class="card-body text-center text-gray-500 py-8">
				<p class="mb-4">No configurations created yet</p>
				<button on:click={() => showCreateModal = true} class="btn-primary">
					Create Your First Config
				</button>
			</div>
		{/if}
	</div>

	<!-- Recent Submissions -->
	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold">Recent Submissions</h2>
		</div>
		{#if data.recentSubmissions.length > 0}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Post URL</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metrics</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each data.recentSubmissions as submission}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap">
									<span class="text-lg mr-1">{platformIcons[submission.platform || 'other']}</span>
									<span class="text-sm text-gray-600">{submission.configName}</span>
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
									{submission.userName || 'Unknown'}
								</td>
								<td class="px-4 py-3 text-sm text-primary-600">
									<a href={submission.postUrl} target="_blank" rel="noopener noreferrer" class="hover:underline truncate max-w-xs block">
										{submission.postUrl}
									</a>
								</td>
								<td class="px-4 py-3 text-sm text-gray-600">
									{#if submission.values}
										{@const vals = submission.values}
										{Object.entries(vals).slice(0, 3).map(([k, v]) => `${k}: ${formatNumber(v)}`).join(', ')}
										{#if Object.keys(vals).length > 3}
											<span class="text-gray-400">+{Object.keys(vals).length - 3} more</span>
										{/if}
									{/if}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
									{formatDate(submission.submittedAt)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="card-body text-center text-gray-500 py-8">
				<p>No submissions yet</p>
			</div>
		{/if}
	</div>
</div>

<!-- Create Config Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg max-w-md w-full p-6">
			<h3 class="text-lg font-semibold mb-4">Create Social Media Config</h3>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
						if (form?.success) {
							resetForm();
						}
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="name" class="label">Configuration Name *</label>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={newName}
						required
						class="input"
						placeholder="e.g., Backroom Boy Instagram"
					/>
				</div>

				<div>
					<label for="platform" class="label">Platform *</label>
					<select id="platform" name="platform" bind:value={newPlatform} class="input">
						<option value="instagram">Instagram</option>
						<option value="facebook">Facebook</option>
						<option value="tiktok">TikTok</option>
						<option value="youtube">YouTube</option>
						<option value="twitter">Twitter/X</option>
						<option value="other">Other</option>
					</select>
				</div>

				<div class="bg-gray-50 p-3 rounded-lg">
					<p class="text-sm text-gray-600 mb-2">Default metrics for {platformLabels[newPlatform]}:</p>
					<div class="flex flex-wrap gap-1">
						{#if newPlatform === 'instagram'}
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Likes*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Comments*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Saves</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Shares</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Reach</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Impressions</span>
						{:else if newPlatform === 'facebook'}
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Reactions*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Comments*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Shares</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Reach</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Engagement %</span>
						{:else if newPlatform === 'tiktok'}
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Views*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Likes*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Comments</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Shares</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Saves</span>
						{:else if newPlatform === 'youtube'}
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Views*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Likes*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Comments</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Subs Gained</span>
						{:else if newPlatform === 'twitter'}
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Impressions*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">Likes*</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Retweets</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Replies</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Profile Clicks</span>
						{:else}
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Views</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Likes</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Comments</span>
							<span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">Shares</span>
						{/if}
					</div>
					<p class="text-xs text-gray-500 mt-2">* Required fields</p>
				</div>

				<input type="hidden" name="useTemplate" value="true" />

				<div class="flex gap-4 pt-4">
					<button type="button" on:click={resetForm} class="btn-ghost flex-1">Cancel</button>
					<button type="submit" disabled={loading || !newName} class="btn-primary flex-1">
						{loading ? 'Creating...' : 'Create Config'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
