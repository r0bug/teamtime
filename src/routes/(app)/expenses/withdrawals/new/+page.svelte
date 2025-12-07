<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	export let form: ActionData;

	let loading = false;

	function getDefaultDateTime() {
		const now = new Date();
		return now.toISOString().slice(0, 16);
	}
</script>

<svelte:head>
	<title>Log Withdrawal - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/expenses" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">Log ATM Withdrawal</h1>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		<div class="card">
			<div class="card-body">
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-6"
				>
					<div>
						<label for="amount" class="label">Amount Withdrawn *</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
							<input
								type="number"
								id="amount"
								name="amount"
								required
								step="0.01"
								min="0.01"
								class="input pl-8"
								placeholder="0.00"
							/>
						</div>
					</div>

					<div>
						<label for="withdrawnAt" class="label">Date & Time *</label>
						<input
							type="datetime-local"
							id="withdrawnAt"
							name="withdrawnAt"
							required
							class="input"
							value={getDefaultDateTime()}
						/>
					</div>

					<div>
						<label for="address" class="label">ATM Location</label>
						<input
							type="text"
							id="address"
							name="address"
							class="input"
							placeholder="e.g., 123 Main St, City"
						/>
					</div>

					<div>
						<label for="notes" class="label">Notes</label>
						<textarea
							id="notes"
							name="notes"
							rows="3"
							class="input"
							placeholder="Any additional notes..."
						></textarea>
					</div>

					<div class="flex gap-4 pt-4">
						<a href="/expenses" class="btn-ghost flex-1 text-center">Cancel</a>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{#if loading}
								Saving...
							{:else}
								Log Withdrawal
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
