<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let itemDescription = '';
	let price = '';
	let priceJustification = '';
	let destination: 'store' | 'ebay' = 'store';
	let ebayReason = '';
	let locationId = '';
	let photos: Array<{ file: File; preview: string; uploading: boolean; uploaded?: { filePath: string; originalName: string; mimeType: string; sizeBytes: number } }> = [];
	let submitting = false;
	let error = '';

	// Geolocation
	let lat: number | null = null;
	let lng: number | null = null;
	let address = '';
	let gettingLocation = false;

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
				body: formData,
				credentials: 'same-origin'
			});

			// Handle non-JSON responses (e.g., network errors, proxy errors)
			const contentType = response.headers.get('content-type');
			if (!contentType || !contentType.includes('application/json')) {
				const text = await response.text();
				console.error('Non-JSON response:', response.status, text.substring(0, 200));
				throw new Error(`Server error (${response.status})`);
			}

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || `Upload failed (${response.status})`);
			}

			if (!data.file) {
				throw new Error('Server did not return file info');
			}

			photos[index] = { ...photo, uploading: false, uploaded: data.file };
			photos = photos;
		} catch (e) {
			console.error('Upload error:', e, 'Photo:', photo.file?.name, 'Type:', photo.file?.type, 'Size:', photo.file?.size);
			photos[index] = { ...photo, uploading: false };
			photos = photos;
			// Show more specific error for network issues
			if (e instanceof TypeError && e.message.includes('fetch')) {
				error = 'Network error - check your connection';
			} else {
				error = e instanceof Error ? e.message : 'Failed to upload photo';
			}
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

	function getLocation() {
		if (!navigator.geolocation) {
			error = 'Geolocation is not supported by your browser';
			return;
		}

		gettingLocation = true;
		navigator.geolocation.getCurrentPosition(
			async (position) => {
				lat = position.coords.latitude;
				lng = position.coords.longitude;
				gettingLocation = false;

				// Optionally reverse geocode for address
				try {
					const response = await fetch(
						`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
					);
					const data = await response.json();
					if (data.display_name) {
						address = data.display_name;
					}
				} catch (e) {
					console.error('Geocoding error:', e);
				}
			},
			(err) => {
				gettingLocation = false;
				error = 'Unable to get your location';
				console.error('Geolocation error:', err);
			},
			{ enableHighAccuracy: true }
		);
	}

	async function handleSubmit() {
		error = '';

		// Validation
		if (photos.length === 0) {
			error = 'At least one photo is required';
			return;
		}

		if (!itemDescription.trim()) {
			error = 'Item description is required';
			return;
		}

		const priceNum = parseFloat(price);
		if (isNaN(priceNum) || priceNum <= 0) {
			error = 'Price must be a positive number';
			return;
		}

		if (priceJustification.trim().length < 10) {
			error = 'Price justification must be at least 10 characters';
			return;
		}

		if (destination === 'ebay' && !ebayReason.trim()) {
			error = 'Please explain why this item should be listed on eBay';
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

			// Submit pricing decision
			const response = await fetch('/api/pricing-decisions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemDescription: itemDescription.trim(),
					price: priceNum,
					priceJustification: priceJustification.trim(),
					destination,
					ebayReason: destination === 'ebay' ? ebayReason.trim() : null,
					locationId: locationId || null,
					lat,
					lng,
					address: address || null,
					photos: uploadedPhotos
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to submit pricing decision');
			}

			const { decision } = await response.json();

			// Redirect to the decision detail page
			goto(`/pricing/${decision.id}`);
		} catch (e) {
			console.error('Submit error:', e);
			error = e instanceof Error ? e.message : 'Failed to submit pricing decision';
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Price New Item - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-2xl mx-auto">
	<div class="mb-6">
		<a href="/pricing" class="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm mb-2">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to Pricing History
		</a>
		<h1 class="text-2xl font-bold">Price New Item</h1>
		<p class="text-gray-600 mt-1">Document item details, price, and destination</p>
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

				<div class="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
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

				<p class="text-sm text-gray-500">
					Take or upload up to 10 photos of the item. Photos will be uploaded when you submit.
				</p>
			</div>
		</div>

		<!-- Item Details -->
		<div class="card">
			<div class="card-body space-y-4">
				<h2 class="text-lg font-semibold">Item Details</h2>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700 mb-1">
						Description *
					</label>
					<textarea
						id="description"
						bind:value={itemDescription}
						rows="3"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
						placeholder="Describe the item (brand, model, condition, etc.)"
						required
					></textarea>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="price" class="block text-sm font-medium text-gray-700 mb-1">
							Price *
						</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
							<input
								id="price"
								type="number"
								step="0.01"
								min="0.01"
								bind:value={price}
								class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
								placeholder="0.00"
								required
							/>
						</div>
					</div>

					<div>
						<label for="location" class="block text-sm font-medium text-gray-700 mb-1">
							Location
						</label>
						<select
							id="location"
							bind:value={locationId}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
						>
							<option value="">Select location...</option>
							{#each data.locations as location}
								<option value={location.id}>{location.name}</option>
							{/each}
						</select>
					</div>
				</div>

				<div>
					<label for="justification" class="block text-sm font-medium text-gray-700 mb-1">
						Price Justification *
					</label>
					<textarea
						id="justification"
						bind:value={priceJustification}
						rows="2"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
						placeholder="Explain why you chose this price (eBay comps, condition, rarity, etc.)"
						required
					></textarea>
					<p class="text-xs text-gray-500 mt-1">Minimum 10 characters</p>
				</div>
			</div>
		</div>

		<!-- Destination -->
		<div class="card">
			<div class="card-body space-y-4">
				<h2 class="text-lg font-semibold">Destination</h2>

				<div class="flex gap-4">
					<label class="flex-1 cursor-pointer">
						<input
							type="radio"
							bind:group={destination}
							value="store"
							class="sr-only peer"
						/>
						<div class="p-4 border-2 rounded-lg peer-checked:border-primary-500 peer-checked:bg-primary-50 hover:bg-gray-50 transition-colors">
							<div class="flex items-center gap-3">
								<div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
									<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
									</svg>
								</div>
								<div>
									<div class="font-medium text-gray-900">Store</div>
									<div class="text-sm text-gray-500">Price for in-store sale</div>
								</div>
							</div>
						</div>
					</label>

					<label class="flex-1 cursor-pointer">
						<input
							type="radio"
							bind:group={destination}
							value="ebay"
							class="sr-only peer"
						/>
						<div class="p-4 border-2 rounded-lg peer-checked:border-primary-500 peer-checked:bg-primary-50 hover:bg-gray-50 transition-colors">
							<div class="flex items-center gap-3">
								<div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
									<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
									</svg>
								</div>
								<div>
									<div class="font-medium text-gray-900">eBay</div>
									<div class="text-sm text-gray-500">List on eBay</div>
								</div>
							</div>
						</div>
					</label>
				</div>

				{#if destination === 'ebay'}
					<div>
						<label for="ebayReason" class="block text-sm font-medium text-gray-700 mb-1">
							Why eBay? *
						</label>
						<textarea
							id="ebayReason"
							bind:value={ebayReason}
							rows="2"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
							placeholder="Explain why this item should be listed on eBay (higher value, niche market, etc.)"
							required
						></textarea>
						<p class="text-xs text-gray-500 mt-1">
							A task will be created for eBay-capable team members to list this item.
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- GPS Location -->
		<div class="card">
			<div class="card-body">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold">GPS Location</h2>
					<button
						type="button"
						on:click={getLocation}
						disabled={gettingLocation}
						class="btn-secondary text-sm"
					>
						{#if gettingLocation}
							<div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent mr-2"></div>
							Getting Location...
						{:else if lat && lng}
							<svg class="w-4 h-4 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							Update Location
						{:else}
							<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							Get Current Location
						{/if}
					</button>
				</div>

				{#if lat && lng}
					<div class="text-sm text-gray-600">
						<p><strong>Coordinates:</strong> {lat.toFixed(6)}, {lng.toFixed(6)}</p>
						{#if address}
							<p class="mt-1"><strong>Address:</strong> {address}</p>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-gray-500">
						Optional: Capture GPS coordinates where this item was priced.
					</p>
				{/if}
			</div>
		</div>

		<!-- Submit Button -->
		<div class="flex gap-4">
			<a href="/pricing" class="btn-secondary flex-1">
				Cancel
			</a>
			<button
				type="submit"
				disabled={submitting || photos.length === 0}
				class="btn-primary flex-1"
			>
				{#if submitting}
					<div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
					Submitting...
				{:else}
					Submit Pricing Decision
				{/if}
			</button>
		</div>
	</form>
</div>
