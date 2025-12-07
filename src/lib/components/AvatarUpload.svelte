<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let currentAvatar: string | null = null;
	export let name: string = '';
	export let size: 'sm' | 'md' | 'lg' = 'lg';

	const dispatch = createEventDispatcher();

	let isDragging = false;
	let isUploading = false;
	let error = '';
	let fileInput: HTMLInputElement;

	const sizeClasses = {
		sm: 'w-10 h-10 text-sm',
		md: 'w-16 h-16 text-xl',
		lg: 'w-24 h-24 text-3xl'
	};

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map(n => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	async function handleFile(file: File) {
		if (!file.type.startsWith('image/')) {
			error = 'Please upload an image file';
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			error = 'Image must be less than 5MB';
			return;
		}

		error = '';
		isUploading = true;

		try {
			// Read and resize image
			const resizedImage = await resizeImage(file, 256);

			const formData = new FormData();
			formData.append('imageData', resizedImage);

			const response = await fetch('/api/avatar', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Upload failed');
			}

			currentAvatar = result.avatarUrl;
			dispatch('change', { avatarUrl: result.avatarUrl });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			isUploading = false;
		}
	}

	function resizeImage(file: File, maxSize: number): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						reject(new Error('Canvas not supported'));
						return;
					}

					// Calculate crop dimensions (square from center)
					const size = Math.min(img.width, img.height);
					const x = (img.width - size) / 2;
					const y = (img.height - size) / 2;

					canvas.width = maxSize;
					canvas.height = maxSize;

					// Draw cropped and resized image
					ctx.drawImage(img, x, y, size, size, 0, 0, maxSize, maxSize);

					resolve(canvas.toDataURL('image/jpeg', 0.9));
				};
				img.onerror = () => reject(new Error('Failed to load image'));
				img.src = e.target?.result as string;
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsDataURL(file);
		});
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const file = e.dataTransfer?.files[0];
		if (file) {
			handleFile(file);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handlePaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;

		for (const item of items) {
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) {
					handleFile(file);
					e.preventDefault();
					break;
				}
			}
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			handleFile(file);
		}
	}

	function triggerFileInput() {
		fileInput?.click();
	}

	async function removeAvatar() {
		isUploading = true;
		try {
			const response = await fetch('/api/avatar', { method: 'DELETE' });
			if (response.ok) {
				currentAvatar = null;
				dispatch('change', { avatarUrl: null });
			}
		} catch (err) {
			error = 'Failed to remove avatar';
		} finally {
			isUploading = false;
		}
	}
</script>

<svelte:window on:paste={handlePaste} />

<div class="flex flex-col items-center gap-4">
	<div
		class="relative group cursor-pointer"
		on:drop={handleDrop}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:click={triggerFileInput}
		on:keydown={(e) => e.key === 'Enter' && triggerFileInput()}
		role="button"
		tabindex="0"
	>
		<div
			class="rounded-full overflow-hidden flex items-center justify-center transition-all duration-200 {sizeClasses[size]} {isDragging ? 'ring-4 ring-primary-500 ring-offset-2' : ''} {isUploading ? 'opacity-50' : ''}"
		>
			{#if currentAvatar}
				<img src={currentAvatar} alt={name} class="w-full h-full object-cover" />
			{:else}
				<div class="w-full h-full bg-primary-600 flex items-center justify-center text-white font-medium">
					{getInitials(name)}
				</div>
			{/if}
		</div>

		<!-- Overlay on hover -->
		<div class="absolute inset-0 rounded-full bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
			{#if isUploading}
				<svg class="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
				</svg>
			{:else}
				<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			{/if}
		</div>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		class="hidden"
		on:change={handleFileSelect}
	/>

	<div class="text-center">
		<p class="text-sm text-gray-500">
			Click, drag & drop, or paste an image
		</p>
		{#if currentAvatar}
			<button
				type="button"
				on:click|stopPropagation={removeAvatar}
				class="text-sm text-red-600 hover:text-red-700 mt-1"
				disabled={isUploading}
			>
				Remove photo
			</button>
		{/if}
	</div>

	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}
</div>
