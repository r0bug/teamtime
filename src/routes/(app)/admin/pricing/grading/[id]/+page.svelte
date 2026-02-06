<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: decision = data.decision;
	$: photos = data.photos;
	$: existingGrade = data.existingGrade;

	let priceAccuracy = existingGrade?.priceAccuracy || 3;
	let justificationQuality = existingGrade?.justificationQuality || 3;
	let photoQuality = existingGrade?.photoQuality || 3;
	let feedback = existingGrade?.feedback || '';

	let submitting = false;

	$: overallGrade = (priceAccuracy * 0.4 + justificationQuality * 0.3 + photoQuality * 0.3).toFixed(2);
	$: pointsPreview = getPointsPreview(parseFloat(overallGrade));

	function formatDate(date: Date | string | null): string {
		if (!date) return '';
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString('en-US', {
			timeZone: 'America/Los_Angeles',
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatPrice(price: string | number): string {
		return Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	}

	function getPointsPreview(grade: number): { points: number; label: string; class: string } {
		if (grade >= 4.5) return { points: 25, label: 'Excellent', class: 'text-green-600' };
		if (grade >= 3.5) return { points: 15, label: 'Good', class: 'text-blue-600' };
		if (grade >= 2.5) return { points: 5, label: 'Acceptable', class: 'text-yellow-600' };
		return { points: -10, label: 'Poor', class: 'text-red-600' };
	}

	function getGradeColor(grade: number): string {
		if (grade >= 4.5) return 'text-green-600';
		if (grade >= 3.5) return 'text-blue-600';
		if (grade >= 2.5) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getSliderGradient(): string {
		return 'linear-gradient(to right, #ef4444, #f97316, #eab308, #3b82f6, #22c55e)';
	}

	let selectedPhoto: string | null = null;
</script>

<svelte:head>
	<title>Grade Pricing - {decision.itemDescription}</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<a href="/admin/pricing/grading" class="text-primary-600 hover:underline text-sm mb-2 inline-block">
				← Back to Grading Queue
			</a>
			<h1 class="text-2xl font-bold text-gray-900">Grade Pricing Decision</h1>
		</div>
	</div>

	{#if form?.error}
		<div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
			{form.error}
		</div>
	{/if}

	<!-- Decision Details -->
	<div class="card mb-6">
		<div class="card-header">
			<h2 class="font-semibold">Item Details</h2>
		</div>
		<div class="card-body">
			<div class="grid md:grid-cols-2 gap-6">
				<div>
					<dl class="space-y-4">
						<div>
							<dt class="text-sm text-gray-500">Item Description</dt>
							<dd class="font-medium text-gray-900">{decision.itemDescription}</dd>
						</div>
						<div>
							<dt class="text-sm text-gray-500">Price Set</dt>
							<dd class="text-2xl font-bold text-gray-900">{formatPrice(decision.price)}</dd>
						</div>
						<div>
							<dt class="text-sm text-gray-500">Destination</dt>
							<dd class="font-medium capitalize">{decision.destination}</dd>
						</div>
						{#if decision.ebayReason}
							<div>
								<dt class="text-sm text-gray-500">eBay Reason</dt>
								<dd class="text-gray-700">{decision.ebayReason}</dd>
							</div>
						{/if}
					</dl>
				</div>
				<div>
					<dl class="space-y-4">
						<div>
							<dt class="text-sm text-gray-500">Priced By</dt>
							<dd class="font-medium text-gray-900">{decision.userName}</dd>
						</div>
						<div>
							<dt class="text-sm text-gray-500">Priced At</dt>
							<dd class="text-gray-700">{formatDate(decision.pricedAt)}</dd>
						</div>
						{#if decision.address}
							<div>
								<dt class="text-sm text-gray-500">Location</dt>
								<dd class="text-gray-700">{decision.address}</dd>
							</div>
						{/if}
					</dl>
				</div>
			</div>

			<!-- Justification -->
			<div class="mt-6 pt-6 border-t">
				<h3 class="text-sm text-gray-500 mb-2">Price Justification</h3>
				<p class="text-gray-700 bg-gray-50 p-4 rounded-lg">{decision.priceJustification}</p>
			</div>
		</div>
	</div>

	<!-- Photos -->
	{#if photos.length > 0}
		<div class="card mb-6">
			<div class="card-header">
				<h2 class="font-semibold">Photos ({photos.length})</h2>
			</div>
			<div class="card-body">
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
					{#each photos as photo}
						<button
							type="button"
							on:click={() => selectedPhoto = photo.filePath}
							class="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-primary-500 transition-all"
						>
							<img
								src="{photo.filePath}?w=256"
								alt={photo.originalName}
								class="w-full h-full object-cover"
								loading="lazy"
							/>
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Grade Form or Existing Grade -->
	{#if existingGrade}
		<div class="card">
			<div class="card-header bg-green-50">
				<h2 class="font-semibold text-green-700">Already Graded</h2>
			</div>
			<div class="card-body">
				<div class="grid md:grid-cols-2 gap-6">
					<div>
						<div class="text-center mb-4">
							<p class="text-sm text-gray-500 mb-1">Overall Grade</p>
							<p class="text-4xl font-bold {getGradeColor(parseFloat(existingGrade.overallGrade))}">
								{existingGrade.overallGrade}
							</p>
							<p class="text-sm text-gray-500 mt-1">out of 5.0</p>
						</div>
						<div class="text-center">
							<p class="text-lg font-semibold {existingGrade.pointsAwarded >= 0 ? 'text-green-600' : 'text-red-600'}">
								{existingGrade.pointsAwarded >= 0 ? '+' : ''}{existingGrade.pointsAwarded} points
							</p>
						</div>
					</div>
					<div class="space-y-3">
						<div class="flex justify-between">
							<span class="text-gray-600">Price Accuracy</span>
							<span class="font-medium">{existingGrade.priceAccuracy}/5</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Justification Quality</span>
							<span class="font-medium">{existingGrade.justificationQuality}/5</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Photo Quality</span>
							<span class="font-medium">{existingGrade.photoQuality}/5</span>
						</div>
						{#if existingGrade.feedback}
							<div class="pt-3 border-t">
								<p class="text-sm text-gray-500 mb-1">Feedback</p>
								<p class="text-gray-700">{existingGrade.feedback}</p>
							</div>
						{/if}
						<div class="pt-3 border-t text-sm text-gray-500">
							Graded by {existingGrade.graderName} on {formatDate(existingGrade.gradedAt)}
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<form method="POST" action="?/grade" use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}>
			<div class="card">
				<div class="card-header">
					<h2 class="font-semibold">Grade This Decision</h2>
				</div>
				<div class="card-body space-y-6">
					<!-- Overall Grade Preview -->
					<div class="text-center py-4 bg-gray-50 rounded-lg">
						<p class="text-sm text-gray-500 mb-1">Overall Grade Preview</p>
						<p class="text-4xl font-bold {getGradeColor(parseFloat(overallGrade))}">{overallGrade}</p>
						<p class="text-sm {pointsPreview.class} mt-2 font-medium">
							{pointsPreview.label}: {pointsPreview.points >= 0 ? '+' : ''}{pointsPreview.points} points
						</p>
					</div>

					<!-- Price Accuracy (40%) -->
					<div>
						<div class="flex justify-between mb-2">
							<label for="priceAccuracy" class="font-medium text-gray-700">
								Price Accuracy <span class="text-gray-400 font-normal">(40%)</span>
							</label>
							<span class="text-lg font-bold {getGradeColor(priceAccuracy)}">{priceAccuracy}</span>
						</div>
						<p class="text-sm text-gray-500 mb-3">Was the price appropriate for this item?</p>
						<input
							type="range"
							id="priceAccuracy"
							name="priceAccuracy"
							min="1"
							max="5"
							bind:value={priceAccuracy}
							class="w-full h-2 rounded-lg appearance-none cursor-pointer"
							style="background: {getSliderGradient()}"
						/>
						<div class="flex justify-between text-xs text-gray-400 mt-1">
							<span>Poor</span>
							<span>Excellent</span>
						</div>
					</div>

					<!-- Justification Quality (30%) -->
					<div>
						<div class="flex justify-between mb-2">
							<label for="justificationQuality" class="font-medium text-gray-700">
								Justification Quality <span class="text-gray-400 font-normal">(30%)</span>
							</label>
							<span class="text-lg font-bold {getGradeColor(justificationQuality)}">{justificationQuality}</span>
						</div>
						<p class="text-sm text-gray-500 mb-3">Did they explain their reasoning well?</p>
						<input
							type="range"
							id="justificationQuality"
							name="justificationQuality"
							min="1"
							max="5"
							bind:value={justificationQuality}
							class="w-full h-2 rounded-lg appearance-none cursor-pointer"
							style="background: {getSliderGradient()}"
						/>
						<div class="flex justify-between text-xs text-gray-400 mt-1">
							<span>Poor</span>
							<span>Excellent</span>
						</div>
					</div>

					<!-- Photo Quality (30%) -->
					<div>
						<div class="flex justify-between mb-2">
							<label for="photoQuality" class="font-medium text-gray-700">
								Photo Quality <span class="text-gray-400 font-normal">(30%)</span>
							</label>
							<span class="text-lg font-bold {getGradeColor(photoQuality)}">{photoQuality}</span>
						</div>
						<p class="text-sm text-gray-500 mb-3">Are the photos clear and helpful?</p>
						<input
							type="range"
							id="photoQuality"
							name="photoQuality"
							min="1"
							max="5"
							bind:value={photoQuality}
							class="w-full h-2 rounded-lg appearance-none cursor-pointer"
							style="background: {getSliderGradient()}"
						/>
						<div class="flex justify-between text-xs text-gray-400 mt-1">
							<span>Poor</span>
							<span>Excellent</span>
						</div>
					</div>

					<!-- Feedback -->
					<div>
						<label for="feedback" class="font-medium text-gray-700 block mb-2">
							Feedback (Optional)
						</label>
						<textarea
							id="feedback"
							name="feedback"
							rows="3"
							bind:value={feedback}
							class="input w-full"
							placeholder="Add notes for the employee..."
						></textarea>
					</div>

					<!-- Submit -->
					<div class="flex gap-4">
						<button
							type="submit"
							disabled={submitting}
							class="btn-primary flex-1"
						>
							{submitting ? 'Submitting...' : 'Submit Grade'}
						</button>
						<a href="/admin/pricing/grading" class="btn-secondary">Cancel</a>
					</div>
				</div>
			</div>
		</form>
	{/if}
</div>

<!-- Photo Lightbox -->
{#if selectedPhoto}
	<div
		class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
		on:click={() => selectedPhoto = null}
		on:keypress={(e) => e.key === 'Escape' && (selectedPhoto = null)}
		role="button"
		tabindex="0"
	>
		<button
			type="button"
			class="absolute top-4 right-4 text-white text-4xl hover:text-gray-300"
			on:click={() => selectedPhoto = null}
		>
			&times;
		</button>
		<img
			src={selectedPhoto}
			alt="Full size"
			class="max-w-full max-h-full object-contain"
			on:click|stopPropagation
		/>
	</div>
{/if}

<style>
	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: white;
		border: 3px solid #4f46e5;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0,0,0,0.2);
	}

	input[type="range"]::-moz-range-thumb {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: white;
		border: 3px solid #4f46e5;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0,0,0,0.2);
	}
</style>
