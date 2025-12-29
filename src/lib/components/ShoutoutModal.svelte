<!--
  ShoutoutModal.svelte - Shoutout Creation Form Modal

  Modal dialog for creating a new shoutout/recognition.
  Allows selecting award type, category, and writing a message.

  Props:
  - recipientId: UUID of the person to recognize
  - recipientName: Display name of the recipient
  - sourceType: Origin of shoutout ('task', 'pricing', 'message', 'manual')
  - sourceId: ID of the source entity (optional)

  Events:
  - close: Modal should be closed
  - created: Shoutout was successfully created { shoutoutId: string }
-->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	export let recipientId: string;
	export let recipientName: string;
	export let sourceType: 'task' | 'pricing' | 'message' | 'manual' = 'manual';
	export let sourceId: string | undefined = undefined;

	const dispatch = createEventDispatcher<{
		close: void;
		created: { shoutoutId: string };
	}>();

	interface AwardType {
		id: string;
		name: string;
		description: string | null;
		category: string;
		points: number;
		icon: string;
		color: string;
		managerOnly: boolean;
	}

	let awardTypes: AwardType[] = [];
	let selectedAwardType: AwardType | null = null;
	let title = '';
	let description = '';
	let loading = false;
	let submitting = false;
	let error = '';

	const categoryLabels: Record<string, string> = {
		teamwork: 'Teamwork',
		quality: 'Quality',
		initiative: 'Initiative',
		customer: 'Customer Service',
		mentoring: 'Mentoring',
		innovation: 'Innovation',
		reliability: 'Reliability',
		general: 'General'
	};

	onMount(async () => {
		loading = true;
		try {
			const res = await fetch('/api/award-types');
			if (res.ok) {
				const data = await res.json();
				awardTypes = data.awardTypes;
				// Default to Quick Shoutout
				selectedAwardType = awardTypes.find(t => t.name === 'Quick Shoutout') || awardTypes[0];
			}
		} catch (e) {
			console.error('Failed to load award types:', e);
		} finally {
			loading = false;
		}
	});

	function selectAwardType(award: AwardType) {
		selectedAwardType = award;
	}

	async function submitShoutout() {
		if (!selectedAwardType || !title.trim()) {
			error = 'Please select an award type and enter a message';
			return;
		}

		submitting = true;
		error = '';

		try {
			const res = await fetch('/api/shoutouts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipientId,
					awardTypeId: selectedAwardType.id,
					category: selectedAwardType.category,
					title: title.trim(),
					description: description.trim() || undefined,
					sourceType,
					sourceId
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to create shoutout');
			}

			const data = await res.json();
			dispatch('created', { shoutoutId: data.shoutout.id });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create shoutout';
		} finally {
			submitting = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			dispatch('close');
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Modal Backdrop -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
	transition:fade={{ duration: 150 }}
	on:click|self={() => dispatch('close')}
	role="dialog"
	aria-modal="true"
	aria-labelledby="shoutout-title"
>
	<!-- Modal Content -->
	<div
		class="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
		transition:fly={{ y: 20, duration: 200 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-amber-50">
			<h2 id="shoutout-title" class="text-lg font-semibold text-gray-900 flex items-center gap-2">
				<span class="text-2xl">🌟</span>
				Recognize {recipientName}
			</h2>
			<button
				type="button"
				on:click={() => dispatch('close')}
				class="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
				aria-label="Close"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 overflow-y-auto p-4 space-y-4">
			{#if loading}
				<div class="flex items-center justify-center py-8">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
				</div>
			{:else}
				<!-- Award Type Selection -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-2">Choose Award Type</label>
					<div class="grid grid-cols-2 gap-2">
						{#each awardTypes as award}
							<button
								type="button"
								on:click={() => selectAwardType(award)}
								class="p-3 rounded-lg border-2 text-left transition-all
									{selectedAwardType?.id === award.id
										? 'border-amber-500 bg-amber-50'
										: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
							>
								<div class="flex items-center gap-2">
									<span class="text-xl">{award.icon}</span>
									<div class="min-w-0">
										<div class="font-medium text-sm text-gray-900 truncate">{award.name}</div>
										<div class="text-xs text-amber-600">+{award.points} pts</div>
									</div>
								</div>
								{#if award.managerOnly}
									<div class="mt-1 text-xs text-purple-600 font-medium">Manager only</div>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<!-- Message -->
				<div>
					<label for="shoutout-title" class="block text-sm font-medium text-gray-700 mb-1">
						Why are you recognizing them? <span class="text-red-500">*</span>
					</label>
					<input
						id="shoutout-title"
						type="text"
						bind:value={title}
						placeholder="e.g., Great teamwork on today's estate sale!"
						maxlength="100"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500
							focus:border-amber-500 text-sm"
					/>
					<p class="mt-1 text-xs text-gray-500">{title.length}/100</p>
				</div>

				<!-- Optional Description -->
				<div>
					<label for="shoutout-desc" class="block text-sm font-medium text-gray-700 mb-1">
						Additional details (optional)
					</label>
					<textarea
						id="shoutout-desc"
						bind:value={description}
						placeholder="Share more about what made this stand out..."
						rows="2"
						maxlength="500"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500
							focus:border-amber-500 text-sm resize-none"
					></textarea>
				</div>

				<!-- Info Box -->
				{#if selectedAwardType}
					<div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
						<p class="text-blue-800">
							{#if selectedAwardType.managerOnly}
								This award will be <strong>automatically approved</strong> as a manager award.
							{:else}
								This shoutout will be <strong>sent for manager approval</strong> before {recipientName} is notified.
							{/if}
						</p>
					</div>
				{/if}

				{#if error}
					<div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
						{error}
					</div>
				{/if}
			{/if}
		</div>

		<!-- Footer -->
		<div class="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
			<button
				type="button"
				on:click={() => dispatch('close')}
				class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
			>
				Cancel
			</button>
			<button
				type="button"
				on:click={submitShoutout}
				disabled={submitting || !selectedAwardType || !title.trim()}
				class="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600
					rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed
					flex items-center gap-2"
			>
				{#if submitting}
					<div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
				{:else}
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
							d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
					</svg>
				{/if}
				Send Shoutout
			</button>
		</div>
	</div>
</div>
