<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	// Format status badge
	function getStatusClass(status: string): string {
		switch (status) {
			case 'approved': return 'bg-green-100 text-green-800';
			case 'implemented': return 'bg-blue-100 text-blue-800';
			case 'rejected': return 'bg-red-100 text-red-800';
			case 'in_progress': return 'bg-yellow-100 text-yellow-800';
			case 'superseded': return 'bg-purple-100 text-purple-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function getCategoryClass(category: string): string {
		switch (category) {
			case 'schema': return 'bg-indigo-100 text-indigo-800';
			case 'api': return 'bg-cyan-100 text-cyan-800';
			case 'ui': return 'bg-pink-100 text-pink-800';
			case 'security': return 'bg-red-100 text-red-800';
			case 'integration': return 'bg-orange-100 text-orange-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function applyFilter(type: 'status' | 'category', value: string | null) {
		const url = new URL(window.location.href);
		if (value) {
			url.searchParams.set(type, value);
		} else {
			url.searchParams.delete(type);
		}
		goto(url.toString());
	}
</script>

<svelte:head>
	<title>Architecture Decisions | TeamTime Admin</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-5xl mx-auto">
		<div class="flex items-center justify-between mb-6">
			<div>
				<div class="flex items-center gap-2 mb-2">
					<a href="/admin/architect" class="text-gray-500 hover:text-gray-700">
						← Back to Ada
					</a>
				</div>
				<h1 class="text-2xl font-bold">Architecture Decisions</h1>
				<p class="text-sm text-gray-500 mt-1">Track and manage architectural decisions</p>
			</div>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
			<button
				on:click={() => applyFilter('status', null)}
				class="card p-3 text-center hover:bg-gray-50 transition-colors {!data.filters.status ? 'ring-2 ring-primary-500' : ''}"
			>
				<div class="text-2xl font-bold">{data.stats.total}</div>
				<div class="text-xs text-gray-500">Total</div>
			</button>
			<button
				on:click={() => applyFilter('status', 'proposed')}
				class="card p-3 text-center hover:bg-gray-50 transition-colors {data.filters.status === 'proposed' ? 'ring-2 ring-primary-500' : ''}"
			>
				<div class="text-2xl font-bold text-gray-600">{data.stats.proposed}</div>
				<div class="text-xs text-gray-500">Proposed</div>
			</button>
			<button
				on:click={() => applyFilter('status', 'approved')}
				class="card p-3 text-center hover:bg-gray-50 transition-colors {data.filters.status === 'approved' ? 'ring-2 ring-primary-500' : ''}"
			>
				<div class="text-2xl font-bold text-green-600">{data.stats.approved}</div>
				<div class="text-xs text-gray-500">Approved</div>
			</button>
			<button
				on:click={() => applyFilter('status', 'in_progress')}
				class="card p-3 text-center hover:bg-gray-50 transition-colors {data.filters.status === 'in_progress' ? 'ring-2 ring-primary-500' : ''}"
			>
				<div class="text-2xl font-bold text-yellow-600">{data.stats.inProgress}</div>
				<div class="text-xs text-gray-500">In Progress</div>
			</button>
			<button
				on:click={() => applyFilter('status', 'implemented')}
				class="card p-3 text-center hover:bg-gray-50 transition-colors {data.filters.status === 'implemented' ? 'ring-2 ring-primary-500' : ''}"
			>
				<div class="text-2xl font-bold text-blue-600">{data.stats.implemented}</div>
				<div class="text-xs text-gray-500">Implemented</div>
			</button>
			<button
				on:click={() => applyFilter('status', 'rejected')}
				class="card p-3 text-center hover:bg-gray-50 transition-colors {data.filters.status === 'rejected' ? 'ring-2 ring-primary-500' : ''}"
			>
				<div class="text-2xl font-bold text-red-600">{data.stats.rejected}</div>
				<div class="text-xs text-gray-500">Rejected</div>
			</button>
		</div>

		<!-- Category Filters -->
		<div class="flex gap-2 mb-6 flex-wrap">
			<button
				on:click={() => applyFilter('category', null)}
				class="px-3 py-1 rounded-full text-sm {!data.filters.category ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
			>
				All Categories
			</button>
			{#each data.categories as cat}
				<button
					on:click={() => applyFilter('category', cat)}
					class="px-3 py-1 rounded-full text-sm capitalize {data.filters.category === cat ? getCategoryClass(cat) : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
				>
					{cat}
				</button>
			{/each}
		</div>

		<!-- Decisions List -->
		<div class="card">
			<div class="divide-y">
				{#if data.decisions.length === 0}
					<div class="p-8 text-center text-gray-500">
						{#if data.filters.status || data.filters.category}
							No decisions match the current filters.
						{:else}
							No architecture decisions yet. Ask Ada to create one!
						{/if}
					</div>
				{:else}
					{#each data.decisions as decision}
						<a
							href="/admin/architect/decisions/{decision.id}"
							class="block p-4 hover:bg-gray-50 transition-colors"
						>
							<div class="flex justify-between items-start">
								<div class="flex-1">
									<div class="font-medium">{decision.title}</div>
									<div class="flex items-center gap-2 mt-1 flex-wrap">
										<span class="inline-flex items-center px-2 py-0.5 rounded text-xs {getStatusClass(decision.status)}">
											{decision.status.replace('_', ' ')}
										</span>
										<span class="inline-flex items-center px-2 py-0.5 rounded text-xs {getCategoryClass(decision.category)}">
											{decision.category}
										</span>
										{#if decision.relatedFiles?.length}
											<span class="text-xs text-gray-400">
												{decision.relatedFiles.length} file{decision.relatedFiles.length !== 1 ? 's' : ''}
											</span>
										{/if}
									</div>
									<p class="text-sm text-gray-600 mt-2">{decision.context}</p>
								</div>
								<div class="text-xs text-gray-400 whitespace-nowrap ml-4">
									{new Date(decision.createdAt).toLocaleDateString()}
								</div>
							</div>
						</a>
					{/each}
				{/if}
			</div>
		</div>
	</div>
</div>
