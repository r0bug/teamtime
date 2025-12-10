<script lang="ts">
	import { goto } from '$app/navigation';

	let description = '';
	let pickNotes = '';
	let photos: Array<{ file: File; preview: string; uploading: boolean; uploaded?: { filePath: string; originalName: string; mimeType: string; sizeBytes: number } }> = [];
	let submitting = false;
	let error = '';

	function handlePhotoSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files) return;

		for (const file of Array.from(input.files)) {
			if (!file.type.startsWith('image/')) continue;
			if (photos.length >= 10) break; // Max 10 photos

			const preview = URL.createObjectURL(file);
			photos = [...photos, { file, preview, uploading: false }];
		}

		// Reset input so same file can be selected again
		input.value = '';
	}

	function removePhoto(index: number) {
		URL.revokeObjectURL(photos[index].preview);
		photos = photos.filter((_, i) => i !== index);
	}

	async function uploadPhoto(index: number) {
		const photo = photos[index];
		if (photo.uploaded || photo.uploading) return;

		photos[index] = { ...photo, uploading: true };
		photos = photos;

		try {
			const formData = new FormData();
			formData.append('file', photo.file);

			const response = await fetch('/api/uploads', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Upload failed');
			}

			const { file: uploadedFile } = await response.json();
			photos[index] = { ...photo, uploading: false, uploaded: uploadedFile };
			photos = photos;
		} catch (e) {
			console.error('Upload error:', e);
			photos[index] = { ...photo, uploading: false };
			photos = photos;
			error = e instanceof Error ? e.message : 'Failed to upload photo';
		}
	}

	async function uploadAllPhotos() {
		const uploadPromises = photos.map((photo, index) => {
			if (!photo.uploaded) {
				return uploadPhoto(index);
			}
			return Promise.resolve();
		});
		await Promise.all(uploadPromises);
	}

	async function handleSubmit() {
		error = '';

		// Validation
		if (photos.length === 0) {
			error = 'At least one photo is required';
			return;
		}

		if (!description.trim()) {
			error = 'Description is required';
			return;
		}

		submitting = true;

		try {
			// Upload any remaining photos
			await uploadAllPhotos();

			// Check all photos uploaded successfully
			const uploadedPhotos = photos.filter(p => p.uploaded).map(p => p.uploaded);
			if (uploadedPhotos.length === 0) {
				error = 'Failed to upload photos';
				submitting = false;
				return;
			}

			// Create the inventory drop
			const response = await fetch('/api/inventory-drops', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					description: description.trim(),
					pickNotes: pickNotes.trim() || null,
					photos: uploadedPhotos
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to create inventory drop');
			}

			const { drop } = await response.json();

			// Redirect to the drop detail page
			goto(`/inventory/drops/${drop.id}`);
		} catch (e) {
			console.error('Submit error:', e);
			error = e instanceof Error ? e.message : 'Failed to create inventory drop';
			submitting = false;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'copy';
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		const files = event.dataTransfer?.files;
		if (!files) return;

		for (const file of Array.from(files)) {
			if (!file.type.startsWith('image/')) continue;
			if (photos.length >= 10) break;

			const preview = URL.createObjectURL(file);
			photos = [...photos, { file, preview, uploading: false }];
		}
	}
</script>

<svelte:head>
	<title>New Inventory Drop - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-2xl mx-auto">
	<div class="mb-6">
		<a href="/inventory/drops" class="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm mb-2">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to Inventory Drops
		</a>
		<h1 class="text-2xl font-bold">New Inventory Drop</h1>
		<p class="text-gray-600 mt-1">Upload photos of items for AI identification</p>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
			{error}
		</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit} class="space-y-6">
		<!-- Photos Section -->
		<div class="card">
			<div class="card-body">
				<h2 class="text-lg font-semibold mb-4">Photos *</h2>

				<!-- Drag and drop zone -->
				<div
					on:dragover={handleDragOver}
					on:drop={handleDrop}
					class="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-4 text-center hover:border-primary-500 hover:bg-primary-50 transition-colors"
				>
					<svg class="mx-auto w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
					</svg>
					<p class="mt-2 text-gray-600">Drag and drop photos here, or</p>
					<label class="inline-block mt-2 cursor-pointer">
						<span class="btn-secondary">Choose Files</span>
						<input
							type="file"
							accept="image/*"
							multiple
							capture="environment"
							on:change={handlePhotoSelect}
							class="hidden"
						/>
					</label>
				</div>

				<!-- Photo previews -->
				{#if photos.length > 0}
					<div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
						{#each photos as photo, index}
							<div class="relative aspect-square bg-gray-100 rounded-lg overflow-hidden group">
								<img src={photo.preview} alt="Item photo" class="w-full h-full object-cover" />

								{#if photo.uploading}
									<div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
										<div class="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
									</div>
								{:else if photo.uploaded}
									<div class="absolute top-1 right-1 bg-green-500 text-white rounded-full p-1">
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										</svg>
									</div>
								{/if}

								<button
									type="button"
									on:click={() => removePhoto(index)}
									class="absolute top-1 left-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						{/each}

						{#if photos.length < 10}
							<label class="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors">
								<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
								<span class="text-xs text-gray-500 mt-1">Add Photo</span>
								<input
									type="file"
									accept="image/*"
									multiple
									capture="environment"
									on:change={handlePhotoSelect}
									class="hidden"
								/>
							</label>
						{/if}
					</div>
				{/if}

				<p class="text-sm text-gray-500 mt-4">
					Upload up to 10 photos. The AI will identify individual items in the photos.
				</p>
			</div>
		</div>

		<!-- Description -->
		<div class="card">
			<div class="card-body space-y-4">
				<h2 class="text-lg font-semibold">Details</h2>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700 mb-1">
						Description *
					</label>
					<textarea
						id="description"
						bind:value={description}
						rows="3"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
						placeholder="Describe what you're dropping off (e.g., 'Estate sale pickup - kitchen items, vintage glassware')"
						required
					></textarea>
				</div>

				<div>
					<label for="pickNotes" class="block text-sm font-medium text-gray-700 mb-1">
						Pick Notes (Optional)
					</label>
					<textarea
						id="pickNotes"
						bind:value={pickNotes}
						rows="2"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
						placeholder="Any additional notes about the source, condition, or other details"
					></textarea>
				</div>
			</div>
		</div>

		<!-- Submit Button -->
		<div class="flex gap-4">
			<a href="/inventory/drops" class="btn-secondary flex-1">
				Cancel
			</a>
			<button
				type="submit"
				disabled={submitting || photos.length === 0}
				class="btn-primary flex-1"
			>
				{#if submitting}
					<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
					Creating Drop...
				{:else}
					Create Drop
				{/if}
			</button>
		</div>
	</form>
</div>
