<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	$: active = data.groups.filter((g) => !g.archivedAt);
	$: archived = data.groups.filter((g) => g.archivedAt);

	let editingId: string | null = null;
</script>

<svelte:head><title>Vendor Groups - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<h1 class="text-2xl font-bold text-gray-900 mt-2">Vendor Groups</h1>
	<p class="text-gray-600 text-sm mt-1">Reporting tags for vendors. A vendor can belong to many groups.</p>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}

	<div class="card mt-6">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Add a group</h2></div>
		<div class="card-body">
			<form method="POST" action="?/create" use:enhance class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
				<div class="md:col-span-6">
					<label class="label" for="new-name">Name</label>
					<input id="new-name" name="name" type="text" class="input" required placeholder="Antiques" />
				</div>
				<div class="md:col-span-2">
					<label class="label" for="new-color">Color</label>
					<input id="new-color" name="color" type="color" class="input h-10 p-1" value="#6B7280" />
				</div>
				<div class="md:col-span-2">
					<label class="label" for="new-order">Order</label>
					<input id="new-order" name="displayOrder" type="number" class="input" value="0" />
				</div>
				<div class="md:col-span-2">
					<button type="submit" class="btn btn-primary w-full">Add</button>
				</div>
			</form>
		</div>
	</div>

	<div class="card mt-6">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Active groups ({active.length})</h2></div>
		<div class="card-body p-0">
			{#if active.length === 0}
				<p class="text-sm text-gray-500 p-4">No groups yet.</p>
			{:else}
				<table class="w-full text-sm">
					<thead class="bg-gray-50 text-left">
						<tr>
							<th class="px-4 py-2 font-medium text-gray-700">Name</th>
							<th class="px-4 py-2 font-medium text-gray-700">Color</th>
							<th class="px-4 py-2 font-medium text-gray-700">Order</th>
							<th class="px-4 py-2 font-medium text-gray-700">Members</th>
							<th class="px-4 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						{#each active as g (g.id)}
							{#if editingId === g.id}
								<tr>
									<td colspan="5" class="px-4 py-3 bg-gray-50">
										<form method="POST" action="?/update" use:enhance={() => () => { editingId = null; }} class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
											<input type="hidden" name="id" value={g.id} />
											<div class="md:col-span-6">
												<label class="label text-xs" for={`name-${g.id}`}>Name</label>
												<input id={`name-${g.id}`} name="name" type="text" class="input" value={g.name} required />
											</div>
											<div class="md:col-span-2">
												<label class="label text-xs" for={`color-${g.id}`}>Color</label>
												<input id={`color-${g.id}`} name="color" type="color" class="input h-10 p-1" value={g.color} />
											</div>
											<div class="md:col-span-2">
												<label class="label text-xs" for={`order-${g.id}`}>Order</label>
												<input id={`order-${g.id}`} name="displayOrder" type="number" class="input" value={g.displayOrder} />
											</div>
											<div class="md:col-span-2 flex gap-2">
												<button type="submit" class="btn btn-primary flex-1">Save</button>
												<button type="button" class="btn btn-secondary flex-1" on:click={() => (editingId = null)}>Cancel</button>
											</div>
										</form>
									</td>
								</tr>
							{:else}
								<tr>
									<td class="px-4 py-2 font-medium">{g.name}</td>
									<td class="px-4 py-2"><span class="inline-block w-6 h-6 rounded border" style="background: {g.color}"></span></td>
									<td class="px-4 py-2 tabular-nums">{g.displayOrder}</td>
									<td class="px-4 py-2 text-gray-600">{g.memberCount}</td>
									<td class="px-4 py-2 text-right whitespace-nowrap">
										<button type="button" class="text-primary-600 hover:underline mr-3" on:click={() => (editingId = g.id)}>Edit</button>
										<form method="POST" action="?/archive" use:enhance class="inline">
											<input type="hidden" name="id" value={g.id} />
											<button type="submit" class="text-red-600 hover:underline">Archive</button>
										</form>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>

	{#if archived.length > 0}
		<details class="mt-6">
			<summary class="text-sm text-gray-600 cursor-pointer">Archived ({archived.length})</summary>
			<div class="mt-2 space-y-1 text-sm text-gray-500">
				{#each archived as g (g.id)}
					<div>{g.name} <span class="text-xs">— archived {g.archivedAt ? new Date(g.archivedAt).toLocaleDateString() : ''}</span></div>
				{/each}
			</div>
		</details>
	{/if}
</div>
