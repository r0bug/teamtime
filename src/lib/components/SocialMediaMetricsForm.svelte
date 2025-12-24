<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let configId: string;
	export let configName: string;
	export let platform: string;
	export let fields: SocialMediaField[];
	export let existingUrl: string | null = null;
	export let taskId: string;
	export let disabled = false;

	interface SocialMediaField {
		name: string;
		label: string;
		type: 'integer' | 'decimal' | 'percentage' | 'currency';
		required?: boolean;
		order: number;
	}

	const dispatch = createEventDispatcher<{
		submit: { configId: string; postUrl: string; values: Record<string, number>; notes: string };
		cancel: void;
	}>();

	let postUrl = existingUrl || '';
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

	function getPlatformIcon(platform: string): string {
		const icons: Record<string, string> = {
			instagram: '📷',
			facebook: '👤',
			tiktok: '🎵',
			youtube: '▶️',
			twitter: '🐦',
			other: '📱'
		};
		return icons[platform] || '📱';
	}

	async function handleSubmit() {
		error = '';

		if (!postUrl.trim()) {
			error = 'Post URL is required';
			return;
		}

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
			const response = await fetch('/api/social-media-metrics', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					taskId,
					configId,
					postUrl: postUrl.trim(),
					values: numericValues,
					notes: notes.trim() || null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to submit metrics');
			}

			dispatch('submit', {
				configId,
				postUrl: postUrl.trim(),
				values: numericValues,
				notes: notes.trim()
			});

			// Reset form
			values = {};
			notes = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to submit metrics';
		} finally {
			submitting = false;
		}
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

<div class="bg-white rounded-lg border p-6">
	<div class="flex items-center gap-2 mb-4">
		<span class="text-2xl">{getPlatformIcon(platform)}</span>
		<h2 class="text-lg font-semibold">{configName}</h2>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
			{error}
		</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit} class="space-y-4">
		<!-- Post URL -->
		<div>
			<label for="postUrl" class="block text-sm font-medium text-gray-700 mb-1">
				Post URL <span class="text-red-500">*</span>
			</label>
			<input
				type="url"
				id="postUrl"
				bind:value={postUrl}
				placeholder="https://..."
				class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
				disabled={disabled || submitting}
				required
			/>
		</div>

		<!-- Metric Fields -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			{#each sortedFields as field}
				<div>
					<label for={field.name} class="block text-sm font-medium text-gray-700 mb-1">
						{field.label}
						{#if field.required}
							<span class="text-red-500">*</span>
						{/if}
					</label>
					<div class="relative">
						{#if field.type === 'currency'}
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
						{/if}
						{#if field.type === 'percentage'}
							<span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
						{/if}
						<input
							type="number"
							id={field.name}
							bind:value={values[field.name]}
							placeholder="0"
							step={field.type === 'integer' ? '1' : '0.01'}
							min="0"
							class="w-full {field.type === 'currency' ? 'pl-7' : 'pl-3'} {field.type === 'percentage' ? 'pr-7' : 'pr-3'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							disabled={disabled || submitting}
						/>
					</div>
				</div>
			{/each}
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
				placeholder="Any observations about this post..."
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
					Submit Metrics
				{/if}
			</button>
		</div>
	</form>
</div>
