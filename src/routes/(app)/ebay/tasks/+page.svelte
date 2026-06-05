<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';
	import { formatCurrency, formatDateTime } from '$lib/utils';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let showClaimed = data.showClaimed;
	let showCompleted = data.showCompleted;
	let claimingTaskId: string | null = null;

	function updateFilters() {
		const params = new URLSearchParams();
		if (showClaimed) params.set('showClaimed', 'true');
		if (showCompleted) params.set('showCompleted', 'true');
		goto(`/ebay/tasks${params.toString() ? '?' + params.toString() : ''}`, { replaceState: true });
	}

	async function claimTask(taskId: string) {
		claimingTaskId = taskId;

		try {
			const response = await fetch(`/api/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status: 'in_progress'
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to claim task');
			}

			await invalidateAll();
		} catch (e) {
			console.error('Claim error:', e);
			notify.error(e instanceof Error ? e.message : 'Failed to claim task');
		} finally {
			claimingTaskId = null;
		}
	}
</script>

<svelte:head>
	<title>eBay Listing Tasks - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">eBay Listing Tasks</h1>
		<p class="text-gray-600 mt-1">Items waiting to be listed on eBay</p>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-4 mb-6">
		<label class="flex items-center gap-2 cursor-pointer">
			<input
				type="checkbox"
				bind:checked={showClaimed}
				on:change={updateFilters}
				class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
			/>
			<span class="text-sm text-gray-700">Show claimed tasks</span>
		</label>

		<label class="flex items-center gap-2 cursor-pointer">
			<input
				type="checkbox"
				bind:checked={showCompleted}
				on:change={updateFilters}
				class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
			/>
			<span class="text-sm text-gray-700">Show completed tasks</span>
		</label>
	</div>

	<!-- Tasks List -->
	<div class="space-y-4">
		{#each data.tasks as task}
			<div class="card">
				<div class="card-body">
					<div class="flex items-start gap-4">
						<!-- Thumbnail -->
						<div class="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
							{#if task.thumbnail}
								<img
									src={task.thumbnail}
									alt={task.pricingDecision?.itemDescription || task.title}
									class="w-full h-full object-cover"
								/>
							{:else}
								<div class="w-full h-full flex items-center justify-center text-gray-400">
									<svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
								</div>
							{/if}
						</div>

						<!-- Details -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-1">
								<StatusBadge status={task.status} />
								{#if task.pricingDecision}
									<span class="text-lg font-bold text-primary-600">
										{formatCurrency(task.pricingDecision.price)}
									</span>
								{/if}
							</div>

							<h3 class="font-medium text-gray-900">
								{task.pricingDecision?.itemDescription || task.title}
							</h3>

							{#if task.pricingDecision?.ebayReason}
								<p class="text-sm text-gray-600 mt-1 line-clamp-2">
									<span class="font-medium">Why eBay:</span> {task.pricingDecision.ebayReason}
								</p>
							{/if}

							<div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
								<span>{formatDateTime(task.createdAt)}</span>
								{#if task.assigneeName}
									<span>Claimed by {task.assigneeName}</span>
								{/if}
							</div>
						</div>

						<!-- Actions -->
						<div class="flex flex-col gap-2 flex-shrink-0">
							{#if task.pricingDecision}
								<a
									href="/pricing/{task.pricingDecision.id}"
									class="btn-secondary text-sm"
								>
									View Details
								</a>
							{/if}

							{#if !task.assignedTo && task.status === 'not_started' && data.canListOnEbay}
								<button
									on:click={() => claimTask(task.id)}
									disabled={claimingTaskId === task.id}
									class="btn-primary text-sm"
								>
									{#if claimingTaskId === task.id}
										<Spinner size="sm" />
										<span class="ml-1">Claiming...</span>
									{:else}
										Claim Task
									{/if}
								</button>
							{:else if task.assignedTo && task.status === 'in_progress'}
								<a
									href="/tasks/{task.id}"
									class="btn-primary text-sm"
								>
									Continue
								</a>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<EmptyState
				title="No eBay listing tasks available"
				message="Tasks are created when items are marked for eBay during pricing."
			/>
		{/each}
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
