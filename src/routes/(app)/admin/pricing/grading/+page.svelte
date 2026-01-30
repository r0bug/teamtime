<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: ungradedPricing = data.ungradedPricing;
	$: stats = data.stats;
	$: showAll = data.showAll;

	function formatDate(date: Date | string | null): string {
		if (!date) return '';
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString('en-US', {
			timeZone: 'America/Los_Angeles',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatPrice(price: string | number): string {
		return Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	}

	function getDestinationBadge(destination: string): { class: string; label: string } {
		switch (destination) {
			case 'ebay':
				return { class: 'bg-blue-100 text-blue-800', label: 'eBay' };
			case 'store':
				return { class: 'bg-green-100 text-green-800', label: 'Store' };
			default:
				return { class: 'bg-gray-100 text-gray-800', label: destination };
		}
	}
</script>

<svelte:head>
	<title>Pricing Grading - Admin</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Pricing Grading</h1>
			<p class="text-gray-600">Review and grade pricing decisions</p>
		</div>
		<a href="/admin" class="btn-secondary">Back to Admin</a>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-3 gap-4 mb-6">
		<div class="card">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-amber-600">{stats.ungraded}</p>
				<p class="text-sm text-gray-600">Ungraded</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-green-600">{stats.graded}</p>
				<p class="text-sm text-gray-600">Graded</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-gray-600">{stats.total}</p>
				<p class="text-sm text-gray-600">Total</p>
			</div>
		</div>
	</div>

	<!-- Toggle View -->
	<div class="mb-4 flex gap-2">
		<a
			href="/admin/pricing/grading"
			class="px-4 py-2 rounded-lg transition-colors {!showAll ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Ungraded Only
		</a>
		<a
			href="/admin/pricing/grading?all=true"
			class="px-4 py-2 rounded-lg transition-colors {showAll ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			Show All
		</a>
	</div>

	<!-- Pricing Decisions List -->
	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold">{showAll ? 'All Pricing Decisions' : 'Ungraded Pricing Decisions'}</h2>
		</div>

		{#if ungradedPricing.length === 0}
			<div class="card-body text-center py-12">
				<p class="text-4xl mb-4">🎉</p>
				<p class="text-gray-600">All pricing decisions have been graded!</p>
			</div>
		{:else}
			<div class="divide-y divide-gray-100">
				{#each ungradedPricing as decision}
					<a
						href="/admin/pricing/grading/{decision.id}"
						class="block p-4 hover:bg-gray-50 transition-colors"
					>
						<div class="flex items-start justify-between">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span class="font-medium text-gray-900 truncate">
										{decision.itemDescription}
									</span>
									<span class="px-2 py-0.5 text-xs rounded-full font-medium {getDestinationBadge(decision.destination).class}">
										{getDestinationBadge(decision.destination).label}
									</span>
									{#if decision.hasGrade}
										<span class="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-800">
											Graded
										</span>
									{/if}
								</div>
								<p class="text-sm text-gray-600 truncate mb-2">
									{decision.priceJustification}
								</p>
								<div class="flex items-center gap-4 text-xs text-gray-500">
									<span>By {decision.userName}</span>
									<span>{formatDate(decision.pricedAt)}</span>
									{#if decision.photoCount > 0}
										<span class="flex items-center gap-1">
											<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
											</svg>
											{decision.photoCount} photos
										</span>
									{/if}
								</div>
							</div>
							<div class="text-right ml-4">
								<p class="text-lg font-bold text-gray-900">{formatPrice(decision.price)}</p>
								<p class="text-xs text-primary-600 mt-1">
									{decision.hasGrade ? 'View' : 'Grade'} →
								</p>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Grade Scale Reference -->
	<div class="mt-6 card">
		<div class="card-header">
			<h3 class="font-semibold">Grading Reference</h3>
		</div>
		<div class="card-body">
			<div class="grid md:grid-cols-5 gap-4 text-center text-sm">
				<div class="p-2 rounded-lg bg-red-50 border border-red-200">
					<p class="font-bold text-red-700">1 - Poor</p>
					<p class="text-xs text-red-600">Price way off, no real justification</p>
				</div>
				<div class="p-2 rounded-lg bg-orange-50 border border-orange-200">
					<p class="font-bold text-orange-700">2 - Below Average</p>
					<p class="text-xs text-orange-600">Price questionable, weak justification</p>
				</div>
				<div class="p-2 rounded-lg bg-yellow-50 border border-yellow-200">
					<p class="font-bold text-yellow-700">3 - Acceptable</p>
					<p class="text-xs text-yellow-600">Price defensible, basic justification</p>
				</div>
				<div class="p-2 rounded-lg bg-blue-50 border border-blue-200">
					<p class="font-bold text-blue-700">4 - Good</p>
					<p class="text-xs text-blue-600">Price reasonable, adequate justification</p>
				</div>
				<div class="p-2 rounded-lg bg-green-50 border border-green-200">
					<p class="font-bold text-green-700">5 - Excellent</p>
					<p class="text-xs text-green-600">Price spot-on, thorough justification</p>
				</div>
			</div>
		</div>
	</div>
</div>
