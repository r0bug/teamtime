<script lang="ts">
	import { goto } from '$app/navigation';
	import { notify } from '$lib/notify';
	import Spinner from '$lib/components/Spinner.svelte';
	import { HOLD_REASONS, HOLD_REASON_LABELS } from '$lib/holds';

	let reason: string = 'customer_pickup';
	let missingPrice = false;
	let customerName = '';
	let customerPhone = '';
	let itemDescription = '';
	let pickupDate = '';
	let notes = '';

	let photo: { file: File; preview: string; uploaded?: { filePath: string; originalName: string; mimeType: string; sizeBytes: number } } | null = null;
	let submitting = false;

	function handlePhotoSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !file.type.startsWith('image/')) return;
		if (photo) URL.revokeObjectURL(photo.preview);
		photo = { file, preview: URL.createObjectURL(file) };
		input.value = '';
	}

	function removePhoto() {
		if (photo) URL.revokeObjectURL(photo.preview);
		photo = null;
	}

	async function uploadPhoto(): Promise<boolean> {
		if (!photo || photo.uploaded) return !!photo?.uploaded;
		const formData = new FormData();
		formData.append('file', photo.file);
		const response = await fetch('/api/uploads', { method: 'POST', body: formData, credentials: 'same-origin' });
		const contentType = response.headers.get('content-type');
		if (!contentType || !contentType.includes('application/json')) {
			throw new Error(`Server error (${response.status})`);
		}
		const data = await response.json();
		if (!response.ok || !data.file) throw new Error(data.error || 'Failed to upload photo');
		photo = { ...photo, uploaded: data.file };
		return true;
	}

	async function handleSubmit() {
		if (!photo) {
			notify.error('A photo of the item is required');
			return;
		}
		if (!missingPrice) {
			if (!customerName.trim()) return notify.error('Customer name is required');
			if (!customerPhone.trim()) return notify.error('Customer phone is required');
		}
		if (reason === 'customer_pickup' && !pickupDate) {
			return notify.error('A pickup date is required for customer pickup holds');
		}

		submitting = true;
		try {
			await uploadPhoto();
			const response = await fetch('/api/holds', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					reason,
					missingPrice,
					customerName: customerName.trim() || null,
					customerPhone: customerPhone.trim() || null,
					itemDescription: itemDescription.trim() || null,
					pickupDate: reason === 'customer_pickup' ? pickupDate : null,
					notes: notes.trim() || null,
					photo: photo.uploaded
				})
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.error || 'Failed to create hold');
			}
			notify.success('Hold created');
			goto('/holds');
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to create hold');
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>New Hold - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-2xl mx-auto">
	<div class="mb-6">
		<a href="/holds" class="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm mb-2">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to Holds
		</a>
		<h1 class="text-2xl font-bold">New Customer Hold</h1>
		<p class="text-gray-600 mt-1">Park an item in the holds area</p>
	</div>

	<form on:submit|preventDefault={handleSubmit} class="space-y-6">
		<!-- Photo -->
		<div class="card">
			<div class="card-body">
				<h2 class="text-lg font-semibold mb-4">Item Photo *</h2>
				{#if photo}
					<div class="relative w-40 h-40 bg-gray-100 rounded-lg overflow-hidden">
						<img src={photo.preview} alt="Item" class="w-full h-full object-cover" />
						<button
							type="button"
							on:click={removePhoto}
							class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
							aria-label="Remove photo"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{:else}
					<label class="w-40 h-40 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors">
						<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
						<span class="text-xs text-gray-500 mt-1">Add Photo</span>
						<input type="file" accept="image/*" capture="environment" on:change={handlePhotoSelect} class="hidden" />
					</label>
				{/if}
			</div>
		</div>

		<!-- Hold details -->
		<div class="card">
			<div class="card-body space-y-4">
				<label class="flex items-center gap-3 cursor-pointer">
					<input type="checkbox" bind:checked={missingPrice} class="w-5 h-5 rounded border-gray-300 text-primary-600" />
					<span>
						<span class="font-medium">Missing price</span>
						<span class="block text-sm text-gray-500">Waiting on the vendor for a price — no customer needed. Cleared when the price comes back.</span>
					</span>
				</label>

				<div>
					<label for="reason" class="label">Reason *</label>
					<select id="reason" bind:value={reason} class="input">
						{#each HOLD_REASONS as r}
							<option value={r}>{HOLD_REASON_LABELS[r]}</option>
						{/each}
					</select>
				</div>

				{#if reason === 'customer_pickup'}
					<div>
						<label for="pickupDate" class="label">Pickup date *</label>
						<input id="pickupDate" type="date" bind:value={pickupDate} class="input" />
						<p class="text-xs text-gray-500 mt-1">The hold turns red 24h after this date and flashes after 48h.</p>
					</div>
				{/if}

				{#if !missingPrice}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="customerName" class="label">Customer name *</label>
							<input id="customerName" type="text" bind:value={customerName} class="input" placeholder="Name" />
						</div>
						<div>
							<label for="customerPhone" class="label">Phone *</label>
							<input id="customerPhone" type="tel" bind:value={customerPhone} class="input" placeholder="(509) 555-0123" />
						</div>
					</div>
				{/if}

				<div>
					<label for="itemDescription" class="label">Item description</label>
					<input id="itemDescription" type="text" bind:value={itemDescription} class="input" placeholder="What is it? (optional)" />
				</div>

				<div>
					<label for="notes" class="label">Notes</label>
					<textarea id="notes" bind:value={notes} rows="2" class="input" placeholder="Anything else (optional)"></textarea>
				</div>
			</div>
		</div>

		<div class="flex gap-4">
			<a href="/holds" class="btn-secondary flex-1">Cancel</a>
			<button type="submit" disabled={submitting || !photo} class="btn-primary flex-1">
				{#if submitting}
					<Spinner size="sm" /><span class="ml-2">Creating…</span>
				{:else}
					Create Hold
				{/if}
			</button>
		</div>
	</form>
</div>
