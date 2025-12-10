<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	// Props
	export let configId: string;
	export let configName: string;
	export let fields: CashCountField[];
	export let locationId: string;
	export let timeEntryId: string | null = null;
	export let disabled = false;

	interface CashCountField {
		name: string;
		label: string;
		type: 'currency' | 'integer' | 'decimal';
		multiplier?: number;
		required?: boolean;
		order: number;
	}

	const dispatch = createEventDispatcher<{
		submit: { configId: string; values: Record<string, number>; totalAmount: number; notes: string };
		cancel: void;
	}>();

	// Form state
	let values: Record<string, string> = {};
	let notes = '';
	let submitting = false;
	let error = '';

	// Initialize values
	$: {
		for (const field of fields) {
			if (!(field.name in values)) {
				values[field.name] = '';
			}
		}
	}

	// Sort fields by order
	$: sortedFields = [...fields].sort((a, b) => a.order - b.order);

	// Calculate total
	$: totalAmount = sortedFields.reduce((sum, field) => {
		const value = parseFloat(values[field.name]) || 0;
		const multiplier = field.multiplier || 1;
		return sum + (value * multiplier);
	}, 0);

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}

	function getFieldPlaceholder(field: CashCountField): string {
		if (field.type === 'integer') return '0';
		if (field.type === 'currency') return '0.00';
		return '0.00';
	}

	function getFieldStep(field: CashCountField): string {
		if (field.type === 'integer') return '1';
		return '0.01';
	}

	async function handleSubmit() {
		error = '';

		// Validate required fields
		for (const field of sortedFields) {
			if (field.required && !values[field.name]) {
				error = `${field.label} is required`;
				return;
			}
		}

		// Convert string values to numbers
		const numericValues: Record<string, number> = {};
		for (const field of sortedFields) {
			numericValues[field.name] = parseFloat(values[field.name]) || 0;
		}

		submitting = true;

		try {
			const response = await fetch('/api/cash-counts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					configId,
					locationId,
					timeEntryId,
					values: numericValues,
					totalAmount,
					notes: notes.trim() || null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to submit cash count');
			}

			dispatch('submit', {
				configId,
				values: numericValues,
				totalAmount,
				notes: notes.trim()
			});

			// Reset form
			values = {};
			notes = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to submit cash count';
		} finally {
			submitting = false;
		}
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

<div class="bg-white rounded-lg border p-6">
	<h2 class="text-lg font-semibold mb-4">{configName}</h2>

	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
			{error}
		</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit} class="space-y-4">
		<!-- Cash Count Fields -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			{#each sortedFields as field}
				<div>
					<label for={field.name} class="block text-sm font-medium text-gray-700 mb-1">
						{field.label}
						{#if field.required}
							<span class="text-red-500">*</span>
						{/if}
						{#if field.multiplier && field.multiplier !== 1}
							<span class="text-gray-400 font-normal">
								(x{field.multiplier < 1 ? field.multiplier.toFixed(2) : field.multiplier})
							</span>
						{/if}
					</label>
					<div class="relative">
						{#if field.type === 'currency'}
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
						{/if}
						<input
							type="number"
							id={field.name}
							bind:value={values[field.name]}
							placeholder={getFieldPlaceholder(field)}
							step={getFieldStep(field)}
							min="0"
							class="w-full {field.type === 'currency' ? 'pl-7' : 'pl-3'} pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							disabled={disabled || submitting}
						/>
					</div>
					{#if field.multiplier && field.multiplier !== 1 && values[field.name]}
						<p class="text-xs text-gray-500 mt-1">
							= {formatCurrency((parseFloat(values[field.name]) || 0) * field.multiplier)}
						</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Total -->
		<div class="border-t pt-4 mt-4">
			<div class="flex items-center justify-between text-lg font-semibold">
				<span>Total</span>
				<span class="text-primary-600">{formatCurrency(totalAmount)}</span>
			</div>
		</div>

		<!-- Notes -->
		<div>
			<label for="notes" class="block text-sm font-medium text-gray-700 mb-1">
				Notes (optional)
			</label>
			<textarea
				id="notes"
				bind:value={notes}
				rows="2"
				class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
				placeholder="Any discrepancies or notes..."
				disabled={disabled || submitting}
			></textarea>
		</div>

		<!-- Actions -->
		<div class="flex gap-3 pt-2">
			<button
				type="button"
				on:click={handleCancel}
				class="btn-secondary flex-1"
				disabled={submitting}
			>
				Cancel
			</button>
			<button
				type="submit"
				class="btn-primary flex-1"
				disabled={disabled || submitting}
			>
				{#if submitting}
					<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
					Submitting...
				{:else}
					Submit Count
				{/if}
			</button>
		</div>
	</form>
</div>
