<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	function selectionFor(vendorId: string, current: string[]): Set<string> {
		return new Set(current);
	}

	// Track which groups are toggled for each vendor row before submit.
	let groupsByVendor: Record<string, Set<string>> = {};
	$: for (const item of data.items) {
		if (!groupsByVendor[item.vendor.id]) {
			groupsByVendor[item.vendor.id] = selectionFor(item.vendor.id, item.groupIds);
		}
	}

	function toggleGroup(vendorId: string, groupId: string) {
		const set = groupsByVendor[vendorId] ?? new Set();
		if (set.has(groupId)) set.delete(groupId);
		else set.add(groupId);
		groupsByVendor = { ...groupsByVendor, [vendorId]: new Set(set) };
	}
</script>

<svelte:head><title>Vendor Onboarding - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<div class="mt-2 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Vendor Onboarding</h1>
			<p class="text-gray-600 text-sm">{data.items.length} vendor{data.items.length === 1 ? '' : 's'} need configuring.</p>
		</div>
		<a href="/admin/vendor-groups" class="btn btn-secondary text-sm">Manage groups →</a>
	</div>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}

	{#if data.items.length === 0}
		<div class="card mt-6"><div class="card-body text-center text-gray-500 py-12">
			🎉 All vendors are onboarded.
		</div></div>
	{:else}
		<div class="space-y-3 mt-6">
			{#each data.items as item (item.vendor.id)}
				<div class="card">
					<div class="card-body space-y-3">
						<div class="flex items-start justify-between flex-wrap gap-2">
							<div>
								<a class="font-semibold text-primary-700 hover:underline" href={`/admin/vendors/${item.vendor.id}`}>{item.vendor.displayName}</a>
								<div class="text-xs text-gray-500 mt-0.5">
									{#if item.vendor.nrsVendorId}NRS #{item.vendor.nrsVendorId} · {/if}
									{#if item.vendor.boothNumber}Booth {item.vendor.boothNumber} · {/if}
									<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{item.vendor.status}</span>
								</div>
							</div>
							<div class="flex flex-wrap gap-1 text-xs">
								{#each item.missing as miss}
									<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">missing: {miss}</span>
								{/each}
								{#if item.missing.length === 0}
									<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-800">configured</span>
								{/if}
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<form method="POST" action="?/savePrefix" use:enhance class="flex items-end gap-2">
								<input type="hidden" name="vendorId" value={item.vendor.id} />
								<div class="flex-1">
									<label class="label text-xs" for={`prefix-${item.vendor.id}`}>Inventory code prefix</label>
									<input
										id={`prefix-${item.vendor.id}`}
										name="inventoryCodePrefix"
										type="text"
										class="input font-mono uppercase"
										maxlength="6"
										value={item.vendor.inventoryCodePrefix ?? ''}
										placeholder="SR"
									/>
								</div>
								<button type="submit" class="btn btn-secondary">Save</button>
							</form>

							<form method="POST" action="?/saveGroups" use:enhance class="flex flex-col gap-2">
								<input type="hidden" name="vendorId" value={item.vendor.id} />
								<div>
									<label class="label text-xs">Reporting groups</label>
									{#if data.allGroups.length === 0}
										<p class="text-xs text-gray-500"><a class="text-primary-600 hover:underline" href="/admin/vendor-groups">Create one →</a></p>
									{:else}
										<div class="flex flex-wrap gap-2">
											{#each data.allGroups as g (g.id)}
												{@const checked = groupsByVendor[item.vendor.id]?.has(g.id) ?? false}
												<label class="inline-flex items-center gap-2 px-2 py-0.5 rounded-full border cursor-pointer text-xs"
													style={checked ? `background:${g.color}; border-color:${g.color}; color:white;` : ''}>
													<input
														type="checkbox"
														name="groupId"
														value={g.id}
														checked={checked}
														on:change={() => toggleGroup(item.vendor.id, g.id)}
														class="hidden"
													/>
													{g.name}
												</label>
											{/each}
										</div>
									{/if}
								</div>
								<button type="submit" class="btn btn-secondary self-start">Save groups</button>
							</form>
						</div>

						<div class="flex items-center justify-between border-t border-gray-100 pt-3">
							<a href={`/admin/vendors/${item.vendor.id}#portal-section`} class="text-sm text-primary-600 hover:underline">
								Configure portal access →
							</a>
							<form method="POST" action="?/markComplete" use:enhance>
								<input type="hidden" name="vendorId" value={item.vendor.id} />
								<button type="submit" class="btn btn-primary text-sm">Mark onboarding complete</button>
							</form>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
