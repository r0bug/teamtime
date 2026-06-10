<script lang="ts">
	import { goto } from '$app/navigation';
	import { notify } from '$lib/notify';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// Two mutually-exclusive pickers. Each value is '' (unset), an 'all_*' group,
	// or a userId. Picking from one clears the other.
	let staffTarget = 'all_staff'; // '' | 'all_staff' | <staffUserId>
	let vendorTarget = ''; // '' | 'all_vendors' | <vendorUserId>

	function onStaffChange() {
		if (staffTarget) vendorTarget = '';
	}
	function onVendorChange() {
		if (vendorTarget) staffTarget = '';
	}

	let body = '';
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

	async function uploadPhoto() {
		if (!photo || photo.uploaded) return;
		const formData = new FormData();
		formData.append('file', photo.file);
		const response = await fetch('/api/uploads', { method: 'POST', body: formData, credentials: 'same-origin' });
		const contentType = response.headers.get('content-type');
		if (!contentType || !contentType.includes('application/json')) {
			throw new Error(`Server error (${response.status})`);
		}
		const result = await response.json();
		if (!response.ok || !result.file) throw new Error(result.error || 'Failed to upload photo');
		photo = { ...photo, uploaded: result.file };
	}

	// Resolve the two pickers into { recipientGroup, recipientUserId }.
	function resolveTarget() {
		const sel = vendorTarget || staffTarget || 'all_staff';
		if (sel === 'all_staff' || sel === 'all_vendors') {
			return { recipientGroup: sel, recipientUserId: null };
		}
		return { recipientGroup: null, recipientUserId: sel };
	}

	async function handleSubmit() {
		if (!body.trim() && !photo) {
			return notify.error('Add a note, a photo, or both');
		}
		submitting = true;
		try {
			if (photo) await uploadPhoto();
			const { recipientGroup, recipientUserId } = resolveTarget();
			const response = await fetch('/api/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipientGroup,
					recipientUserId,
					body: body.trim() || null,
					photo: photo?.uploaded ?? null
				})
			});
			if (!response.ok) {
				const result = await response.json().catch(() => ({}));
				throw new Error(result.error || 'Failed to create note');
			}
			notify.success('Note posted');
			goto('/notes');
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Failed to create note');
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>New Note - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-2xl mx-auto">
	<div class="mb-6">
		<a href="/notes" class="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm mb-2">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to Notes
		</a>
		<h1 class="text-2xl font-bold">New Note</h1>
		<p class="text-gray-600 mt-1">Post a note to the board, optionally directed at someone</p>
	</div>

	<form on:submit|preventDefault={handleSubmit} class="space-y-6">
		<div class="card">
			<div class="card-body space-y-4">
				<div>
					<span class="label">Directed at</span>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<select aria-label="Staff target" bind:value={staffTarget} on:change={onStaffChange} class="input">
							<option value="all_staff">All staff</option>
							<option value="" disabled>— staff members —</option>
							{#each data.staff as member}
								<option value={member.id}>{member.name}</option>
							{/each}
						</select>
						<select aria-label="Vendor target" bind:value={vendorTarget} on:change={onVendorChange} class="input">
							<option value="">No vendor</option>
							<option value="all_vendors">All vendors</option>
							<option value="" disabled>— vendors —</option>
							{#each data.vendors as v}
								<option value={v.userId}>{v.displayName}</option>
							{/each}
						</select>
					</div>
					<p class="text-xs text-gray-500 mt-1">Pick a staff target or a vendor target — choosing one clears the other. Vendors only see notes directed at them.</p>
				</div>

				<div>
					<label for="body" class="label">Note</label>
					<textarea id="body" bind:value={body} rows="4" class="input" placeholder="Type a note (optional if you add a photo)"></textarea>
				</div>

				<div>
					<span class="label">Photo of a hand-written note</span>
					{#if photo}
						<div class="relative w-40 h-40 bg-gray-100 rounded-lg overflow-hidden">
							<img src={photo.preview} alt="Note" class="w-full h-full object-cover" />
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
		</div>

		<div class="flex gap-4">
			<a href="/notes" class="btn-secondary flex-1">Cancel</a>
			<button type="submit" disabled={submitting} class="btn-primary flex-1">
				{#if submitting}
					<Spinner size="sm" /><span class="ml-2">Posting…</span>
				{:else}
					Post Note
				{/if}
			</button>
		</div>
	</form>
</div>
