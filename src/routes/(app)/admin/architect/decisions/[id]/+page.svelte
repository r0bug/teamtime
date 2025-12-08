<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showDeleteConfirm = false;
	let copied = false;

	function getStatusClass(status: string): string {
		switch (status) {
			case 'approved': return 'bg-green-100 text-green-800';
			case 'implemented': return 'bg-blue-100 text-blue-800';
			case 'rejected': return 'bg-red-100 text-red-800';
			case 'in_progress': return 'bg-yellow-100 text-yellow-800';
			case 'superseded': return 'bg-purple-100 text-purple-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function getCategoryClass(category: string): string {
		switch (category) {
			case 'schema': return 'bg-indigo-100 text-indigo-800';
			case 'api': return 'bg-cyan-100 text-cyan-800';
			case 'ui': return 'bg-pink-100 text-pink-800';
			case 'security': return 'bg-red-100 text-red-800';
			case 'integration': return 'bg-orange-100 text-orange-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	async function copyPrompt() {
		if (data.decision.claudeCodePrompt) {
			await navigator.clipboard.writeText(data.decision.claudeCodePrompt);
			copied = true;
			setTimeout(() => copied = false, 2000);
		}
	}
</script>

<svelte:head>
	<title>{data.decision.title} | Architecture Decisions</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-4xl mx-auto">
		<div class="flex items-center gap-2 mb-6">
			<a href="/admin/architect/decisions" class="text-gray-500 hover:text-gray-700">
				← Back to Decisions
			</a>
		</div>

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				{form.message}
			</div>
		{/if}

		<div class="card mb-6">
			<div class="card-header">
				<div class="flex items-start justify-between">
					<div>
						<h1 class="text-xl font-bold">{data.decision.title}</h1>
						<div class="flex items-center gap-2 mt-2">
							<span class="inline-flex items-center px-2 py-1 rounded text-sm {getStatusClass(data.decision.status)}">
								{data.decision.status.replace('_', ' ')}
							</span>
							<span class="inline-flex items-center px-2 py-1 rounded text-sm {getCategoryClass(data.decision.category)}">
								{data.decision.category}
							</span>
						</div>
					</div>
					<form method="POST" action="?/updateStatus" use:enhance class="flex items-center gap-2">
						<select name="status" value={data.decision.status} class="input text-sm">
							{#each data.statuses as status}
								<option value={status}>{status.replace('_', ' ')}</option>
							{/each}
						</select>
						<button type="submit" class="btn-primary text-sm px-3 py-1">
							Update
						</button>
					</form>
				</div>
			</div>
			<div class="card-body">
				<div class="grid grid-cols-2 gap-4 text-sm mb-4 pb-4 border-b">
					<div>
						<span class="text-gray-500">Created:</span>
						<span class="ml-2">{new Date(data.decision.createdAt).toLocaleString()}</span>
					</div>
					{#if data.decision.implementedAt}
						<div>
							<span class="text-gray-500">Implemented:</span>
							<span class="ml-2">{new Date(data.decision.implementedAt).toLocaleString()}</span>
						</div>
					{/if}
				</div>

				<div class="space-y-6">
					<div>
						<h3 class="font-semibold text-gray-900 mb-2">Context</h3>
						<p class="text-gray-700 whitespace-pre-wrap">{data.decision.context}</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-900 mb-2">Decision</h3>
						<p class="text-gray-700 whitespace-pre-wrap">{data.decision.decision}</p>
					</div>

					{#if data.decision.consequences}
						<div>
							<h3 class="font-semibold text-gray-900 mb-2">Consequences</h3>
							<p class="text-gray-700 whitespace-pre-wrap">{data.decision.consequences}</p>
						</div>
					{/if}

					{#if data.decision.relatedFiles?.length}
						<div>
							<h3 class="font-semibold text-gray-900 mb-2">Related Files</h3>
							<div class="flex flex-wrap gap-2">
								{#each data.decision.relatedFiles as file}
									<code class="px-2 py-1 bg-gray-100 rounded text-sm">{file}</code>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#if data.decision.implementationPlan?.phases?.length}
			<div class="card mb-6">
				<div class="card-header">
					<h3 class="font-semibold">Implementation Plan</h3>
				</div>
				<div class="card-body">
					<div class="space-y-4">
						{#each data.decision.implementationPlan.phases as phase, i}
							<div class="border-l-2 border-primary-200 pl-4">
								<h4 class="font-medium text-gray-900">
									Phase {i + 1}: {phase.name}
								</h4>
								{#if phase.dependencies?.length}
									<p class="text-xs text-gray-500 mt-1">
										Depends on: {phase.dependencies.join(', ')}
									</p>
								{/if}
								<ul class="mt-2 space-y-1">
									{#each phase.tasks as task}
										<li class="text-sm text-gray-700 flex items-start">
											<span class="mr-2">•</span>
											{task}
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		{#if data.decision.claudeCodePrompt}
			<div class="card mb-6">
				<div class="card-header flex justify-between items-center">
					<h3 class="font-semibold">Claude Code Prompt</h3>
					<button
						on:click={copyPrompt}
						class="btn-secondary text-sm px-3 py-1"
					>
						{copied ? '✓ Copied!' : 'Copy to Clipboard'}
					</button>
				</div>
				<div class="card-body">
					<pre class="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">{data.decision.claudeCodePrompt}</pre>
				</div>
			</div>
		{/if}

		<!-- Danger Zone -->
		<div class="card border-red-200">
			<div class="card-header bg-red-50">
				<h3 class="font-semibold text-red-800">Danger Zone</h3>
			</div>
			<div class="card-body">
				{#if showDeleteConfirm}
					<div class="bg-red-50 p-4 rounded-lg">
						<p class="text-red-800 mb-4">Are you sure you want to delete this decision? This cannot be undone.</p>
						<form method="POST" action="?/delete" use:enhance class="flex gap-2">
							<button type="submit" class="btn-danger">Yes, Delete</button>
							<button type="button" on:click={() => showDeleteConfirm = false} class="btn-secondary">Cancel</button>
						</form>
					</div>
				{:else}
					<button on:click={() => showDeleteConfirm = true} class="btn-danger">
						Delete Decision
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
