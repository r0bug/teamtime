<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: withdrawal = data.withdrawal;
	$: allocations = data.allocations;

	let loading = false;
	let showAllocateModal = false;

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'fully_spent': return 'badge-success';
			case 'partially_assigned': return 'badge-warning';
			default: return 'badge-gray';
		}
	}
</script>

<svelte:head>
	<title>Withdrawal Details - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/expenses" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold flex-1">Withdrawal Details</h1>
			<span class={getStatusClass(withdrawal.status)}>{withdrawal.status.replace('_', ' ')}</span>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
				Allocation added successfully
			</div>
		{/if}

		<!-- Withdrawal Info -->
		<div class="card mb-6">
			<div class="card-body space-y-4">
				<div class="flex justify-between items-start">
					<div>
						<div class="text-3xl font-bold text-primary-600">${withdrawal.amount}</div>
						<div class="text-sm text-gray-500">Withdrawn on {formatDate(withdrawal.withdrawnAt)}</div>
					</div>
				</div>

				{#if withdrawal.address}
					<div class="flex items-center gap-2 text-gray-600">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						<span>{withdrawal.address}</span>
					</div>
				{/if}

				{#if withdrawal.notes}
					<p class="text-gray-700">{withdrawal.notes}</p>
				{/if}

				<div class="grid grid-cols-3 gap-4 pt-4 border-t">
					<div class="text-center">
						<div class="text-lg font-semibold">${withdrawal.amount}</div>
						<div class="text-xs text-gray-500">Total</div>
					</div>
					<div class="text-center">
						<div class="text-lg font-semibold text-green-600">${data.totalAllocated.toFixed(2)}</div>
						<div class="text-xs text-gray-500">Allocated</div>
					</div>
					<div class="text-center">
						<div class="text-lg font-semibold text-orange-600">${data.remaining.toFixed(2)}</div>
						<div class="text-xs text-gray-500">Remaining</div>
					</div>
				</div>

				{#if data.remaining > 0}
					<button on:click={() => showAllocateModal = true} class="btn-primary w-full">
						Add Allocation
					</button>
				{/if}
			</div>
		</div>

		<!-- Allocations -->
		<div class="card">
			<div class="card-body">
				<h2 class="text-lg font-semibold mb-4">Allocations</h2>
				{#if allocations.length > 0}
					<div class="space-y-3">
						{#each allocations as allocation}
							<div class="bg-gray-50 p-3 rounded-lg">
								<div class="flex justify-between items-start">
									<div>
										<div class="font-medium">{allocation.productDescription}</div>
										<div class="text-xs text-gray-500">{formatDate(allocation.createdAt)}</div>
									</div>
									<div class="font-semibold">${allocation.amount}</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-gray-500 text-center py-4">No allocations yet</p>
				{/if}
			</div>
		</div>

		{#if data.isManager}
			<div class="mt-6">
				<form method="POST" action="?/delete" use:enhance={({ cancel }) => {
					if (!confirm('Are you sure you want to delete this withdrawal?')) {
						cancel();
					}
				}}>
					<button type="submit" class="text-red-600 hover:text-red-700 text-sm">
						Delete Withdrawal
					</button>
				</form>
			</div>
		{/if}
	</div>
</div>

<!-- Allocate Modal -->
{#if showAllocateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg max-w-md w-full p-6">
			<h3 class="text-lg font-semibold mb-4">Add Allocation</h3>
			<form
				method="POST"
				action="?/allocate"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showAllocateModal = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="productDescription" class="label">What was purchased? *</label>
					<input
						type="text"
						id="productDescription"
						name="productDescription"
						required
						class="input"
						placeholder="e.g., Office supplies"
					/>
				</div>

				<div>
					<label for="amount" class="label">Amount * (max: ${data.remaining.toFixed(2)})</label>
					<div class="relative">
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
						<input
							type="number"
							id="amount"
							name="amount"
							required
							step="0.01"
							min="0.01"
							max={data.remaining}
							class="input pl-8"
							placeholder="0.00"
						/>
					</div>
				</div>

				<div class="flex gap-4 pt-4">
					<button type="button" on:click={() => showAllocateModal = false} class="btn-ghost flex-1">Cancel</button>
					<button type="submit" disabled={loading} class="btn-primary flex-1">
						{loading ? 'Saving...' : 'Add Allocation'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
