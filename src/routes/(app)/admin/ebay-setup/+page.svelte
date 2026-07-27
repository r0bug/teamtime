<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	let msg = '';
	let err = '';

	// new consignor form
	let ncType: 'vendor' | 'estate' | 'walkin' | 'house' = 'walkin';
	let ncName = '';
	let ncPhone = '';
	let ncEmail = '';

	// new group form (per consignor)
	let ngConsignorId = '';
	let ngName = '';
	let ngCode = '';
	let ngPercent: number | null = null;

	// lister editor state
	let editUserId = '';
	let editComp: 'commission' | 'points' | 'none' = 'none';
	let editPercent: number | null = null;
	let editPpd: number | null = 1;

	async function post(path: string, body: unknown, method = 'POST') {
		msg = '';
		err = '';
		const res = await fetch(path, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const out = await res.json().catch(() => ({}));
		if (!res.ok) {
			err = out.error || `HTTP ${res.status}`;
			throw new Error(err);
		}
		return out;
	}

	async function addConsignor() {
		try {
			await post('/api/ebay/consignors', { type: ncType, name: ncName, phone: ncPhone || undefined, email: ncEmail || undefined });
			msg = `Consignor "${ncName}" added.`;
			ncName = ''; ncPhone = ''; ncEmail = '';
			await invalidateAll();
		} catch { /* err shown */ }
	}

	async function addGroup(consignorId: string) {
		try {
			await post('/api/ebay/groups', { consignorId, name: ngName, code: ngCode || undefined, consignorPercent: Number(ngPercent) });
			msg = `Group "${ngName}" created — give ListFlow items its ID (copy button below).`;
			ngName = ''; ngCode = ''; ngPercent = null; ngConsignorId = '';
			await invalidateAll();
		} catch { /* err shown */ }
	}

	async function toggleConsignor(id: string, isActive: boolean) {
		try {
			await post(`/api/ebay/consignors/${id}`, { isActive: !isActive }, 'PATCH');
			await invalidateAll();
		} catch { /* err shown */ }
	}

	async function updateGroupPercent(id: string, current: string) {
		const next = prompt('New consignor % for this group (0-100). Only affects PENDING settlements:', current);
		if (next == null) return;
		try {
			await post(`/api/ebay/groups/${id}`, { consignorPercent: Number(next) }, 'PATCH');
			msg = 'Group rate updated.';
			await invalidateAll();
		} catch { /* err shown */ }
	}

	function startEdit(userId: string, s: { compType?: string; commissionPercent?: string | null; pointsPerDollar?: string | null } | null) {
		editUserId = userId;
		editComp = (s?.compType as typeof editComp) ?? 'none';
		editPercent = s?.commissionPercent != null ? Number(s.commissionPercent) : null;
		editPpd = s?.pointsPerDollar != null ? Number(s.pointsPerDollar) : 1;
	}

	async function saveLister() {
		try {
			await post('/api/ebay/lister-settings', {
				userId: editUserId,
				compType: editComp,
				commissionPercent: editComp === 'commission' ? Number(editPercent) : null,
				pointsPerDollar: editComp === 'points' ? Number(editPpd) : null
			}, 'PUT');
			msg = 'Lister settings saved. Applies to pending settlements on next sync.';
			editUserId = '';
			await invalidateAll();
		} catch { /* err shown */ }
	}

	function copy(text: string) {
		navigator.clipboard?.writeText(text);
		msg = 'Copied group ID — paste it on items in ListFlow.';
	}

	function fmtComp(s: { compType: string; commissionPercent: string | null; pointsPerDollar: string | null } | null): string {
		if (!s || s.compType === 'none') return 'not configured';
		if (s.compType === 'commission') return `${Number(s.commissionPercent).toFixed(1)}% commission`;
		return `${Number(s.pointsPerDollar)} pts/$`;
	}
</script>

<svelte:head>
	<title>eBay Setup - TeamTime</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 py-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">eBay Setup</h1>
		<p class="text-sm text-gray-600">
			Consignor rates and lister compensation. Changes touch only <b>pending</b> settlements —
			approved periods are frozen history ·
			<a href="/admin/commissions" class="text-primary-600 hover:underline">Settlements →</a>
		</p>
	</div>

	{#if msg}<p class="text-sm text-emerald-700 mb-3">{msg}</p>{/if}
	{#if err}<p class="text-sm text-red-600 mb-3">{err}</p>{/if}

	<!-- ── Lister compensation ─────────────────────────────── -->
	<div class="card overflow-hidden mb-8">
		<div class="px-4 py-3 border-b border-gray-200">
			<h2 class="font-semibold text-gray-900">Lister compensation</h2>
			<p class="text-xs text-gray-500 mt-0.5">
				Commission % is of NET revenue (after eBay fees), carved out of the YakimaFinds share.
				Points feed the performance-bonus system for hourly staff.
			</p>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200 text-left text-gray-600">
						<th class="px-4 py-3 font-medium">Lister</th>
						<th class="px-4 py-3 font-medium">Compensation</th>
						<th class="px-4 py-3 font-medium text-right">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.listerSettings as row (row.user.id)}
						<tr class="border-b border-gray-100">
							<td class="px-4 py-3 font-medium text-gray-900">{row.user.name}</td>
							{#if editUserId === row.user.id}
								<td class="px-4 py-3" colspan="2">
									<div class="flex flex-wrap items-center gap-2">
										<select class="input w-auto" bind:value={editComp}>
											<option value="none">none (review manually)</option>
											<option value="commission">commission %</option>
											<option value="points">points / dollar</option>
										</select>
										{#if editComp === 'commission'}
											<input class="input w-24" type="number" min="0" max="100" step="0.5" bind:value={editPercent} placeholder="%" />
										{:else if editComp === 'points'}
											<input class="input w-24" type="number" min="0" step="0.25" bind:value={editPpd} placeholder="pts/$" />
										{/if}
										<button class="btn btn-primary btn-sm" on:click={saveLister}>Save</button>
										<button class="btn btn-secondary btn-sm" on:click={() => (editUserId = '')}>Cancel</button>
									</div>
								</td>
							{:else}
								<td class="px-4 py-3 text-gray-700">{fmtComp(row.settings)}</td>
								<td class="px-4 py-3 text-right">
									<button class="btn btn-secondary btn-sm" on:click={() => startEdit(row.user.id, row.settings)}>Edit</button>
								</td>
							{/if}
						</tr>
					{:else}
						<tr><td colspan="3" class="px-4 py-8 text-center text-gray-500">
							No listers yet — flag users "can list on eBay" in <a href="/admin/users" class="text-primary-600 hover:underline">Users</a>.
						</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- ── Consignors & groups ─────────────────────────────── -->
	<div class="card mb-6">
		<div class="px-4 py-3 border-b border-gray-200">
			<h2 class="font-semibold text-gray-900">Add consignor</h2>
		</div>
		<div class="card-body flex flex-wrap items-end gap-3">
			<label class="text-sm text-gray-600">Type
				<select class="input w-auto block mt-1" bind:value={ncType}>
					<option value="walkin">walk-in customer</option>
					<option value="vendor">existing vendor</option>
					<option value="estate">estate sale</option>
					<option value="house">house (YF inventory)</option>
				</select>
			</label>
			<label class="text-sm text-gray-600 flex-1 min-w-40">Name
				<input class="input block mt-1 w-full" bind:value={ncName} placeholder="Smith Estate" />
			</label>
			<label class="text-sm text-gray-600">Phone
				<input class="input block mt-1 w-36" bind:value={ncPhone} />
			</label>
			<label class="text-sm text-gray-600">Email
				<input class="input block mt-1 w-48" bind:value={ncEmail} />
			</label>
			<button class="btn btn-primary" disabled={!ncName.trim()} on:click={addConsignor}>Add</button>
		</div>
	</div>

	{#each data.consignors as c (c.id)}
		<div class="card overflow-hidden mb-4 {c.isActive ? '' : 'opacity-60'}">
			<div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
				<div>
					<span class="font-semibold text-gray-900">{c.name}</span>
					<span class="text-xs text-gray-500 ml-2 uppercase">{c.type}</span>
					{#if !c.isActive}<span class="text-xs text-red-500 ml-2">inactive</span>{/if}
				</div>
				<div class="flex gap-2">
					<button class="btn btn-secondary btn-sm" on:click={() => (ngConsignorId = ngConsignorId === c.id ? '' : c.id)}>
						+ Group
					</button>
					<button class="btn btn-secondary btn-sm" on:click={() => toggleConsignor(c.id, c.isActive)}>
						{c.isActive ? 'Deactivate' : 'Reactivate'}
					</button>
				</div>
			</div>

			{#if ngConsignorId === c.id}
				<div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-end gap-3">
					<label class="text-sm text-gray-600 flex-1 min-w-40">Group name
						<input class="input block mt-1 w-full" bind:value={ngName} placeholder="Barn lot — July" />
					</label>
					<label class="text-sm text-gray-600">Code
						<input class="input block mt-1 w-28" bind:value={ngCode} placeholder="SMITH1" />
					</label>
					<label class="text-sm text-gray-600">Consignor %
						<input class="input block mt-1 w-24" type="number" min="0" max="100" step="1" bind:value={ngPercent} />
					</label>
					<button class="btn btn-primary btn-sm" disabled={!ngName.trim() || ngPercent == null} on:click={() => addGroup(c.id)}>
						Create
					</button>
				</div>
			{/if}

			{#if c.groups.length}
				<table class="w-full text-sm">
					<tbody>
						{#each c.groups as g (g.id)}
							<tr class="border-b border-gray-100">
								<td class="px-4 py-2 font-medium text-gray-900">{g.name}</td>
								<td class="px-4 py-2 text-gray-600">{g.code ?? '—'}</td>
								<td class="px-4 py-2 text-right text-gray-900 font-medium">{Number(g.consignorPercent).toFixed(0)}%</td>
								<td class="px-4 py-2 text-right whitespace-nowrap">
									<button class="btn btn-secondary btn-sm" on:click={() => updateGroupPercent(g.id, g.consignorPercent)}>Rate</button>
									<button class="btn btn-secondary btn-sm" title="Copy group ID for ListFlow" on:click={() => copy(g.id)}>Copy ID</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="px-4 py-3 text-sm text-gray-500">No groups yet — a group holds the agreed % (of net-after-fees) for a batch of items.</p>
			{/if}
		</div>
	{:else}
		<p class="text-gray-500 text-sm">No consignors yet.</p>
	{/each}
</div>
