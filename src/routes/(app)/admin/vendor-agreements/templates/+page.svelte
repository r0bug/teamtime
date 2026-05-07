<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;

	$: primary = data.templates.filter((t) => t.kind === 'primary');
	$: addons = data.templates.filter((t) => t.kind === 'addon');

	function statusLabel(t: typeof data.templates[0]): string {
		if (t.archivedAt) return 'archived';
		if (!t.isActive) return `superseded (v${t.version})`;
		return `active v${t.version}`;
	}
</script>

<svelte:head>
	<title>Agreement Templates - TeamTime Admin</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Agreement Templates</h1>
			<p class="text-gray-600 mt-1">Reusable rental and add-on agreement documents.</p>
		</div>
		<a href="/admin/vendor-agreements/templates/new" class="btn btn-primary">+ New Template</a>
	</div>

	{#each [{ heading: 'Primary Agreements', items: primary }, { heading: 'Add-On Agreements', items: addons }] as section}
		<div class="mb-8">
			<h2 class="text-lg font-semibold text-gray-900 mb-3">{section.heading}</h2>
			{#if section.items.length === 0}
				<div class="card"><div class="card-body text-gray-500 text-sm">No templates yet.</div></div>
			{:else}
				<div class="card">
					<div class="card-body p-0">
						<table class="w-full text-sm">
							<thead class="bg-gray-50 text-left">
								<tr>
									<th class="px-4 py-2 font-medium text-gray-700">Title</th>
									<th class="px-4 py-2 font-medium text-gray-700">Code</th>
									<th class="px-4 py-2 font-medium text-gray-700">Status</th>
									<th class="px-4 py-2 font-medium text-gray-700">Updated</th>
									<th class="px-4 py-2"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each section.items as t (t.id)}
									<tr>
										<td class="px-4 py-2">{t.title}</td>
										<td class="px-4 py-2 font-mono text-xs text-gray-600">{t.code}</td>
										<td class="px-4 py-2">
											<span class="text-xs {t.archivedAt ? 'text-gray-400' : t.isActive ? 'text-green-700' : 'text-gray-500'}">{statusLabel(t)}</span>
										</td>
										<td class="px-4 py-2 text-gray-600">{new Date(t.updatedAt).toLocaleDateString()}</td>
										<td class="px-4 py-2 text-right">
											<a href={`/admin/vendor-agreements/templates/${t.id}`} class="text-primary-600 hover:underline">Edit</a>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>
	{/each}
</div>
