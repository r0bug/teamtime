<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';
	import { formatCurrency } from '$lib/utils';
	import {
		commissionAt,
		scaleSteps,
		evaluate,
		baselineSales,
		applyGrowth,
		rentPerSqftForTarget,
		breakEvenSales,
		totals,
		round2,
		type RentScale,
		type BaselineMode
	} from '$lib/revenue-calc/model';
	import type { PageData } from './$types';

	export let data: PageData;
	type Vendor = PageData['vendors'][number];

	// ── Scale (local copy; "Save scale" persists it) ───────────────────────
	let scale: RentScale = { ...data.scale };
	let savingScale = false;
	$: steps = scaleSteps(scale, 8);

	// ── Selection ──────────────────────────────────────────────────────────
	let search = '';
	let showCurrent = true;
	let showDeparted = true;
	let minSqft = 0;
	let selected: Record<string, boolean> = {};
	let expanded: Record<string, boolean> = {};

	$: visible = data.vendors.filter((v) => {
		if (v.current ? !showCurrent : !showDeparted) return false;
		if (v.sqft < minSqft) return false;
		if (!search.trim()) return true;
		const q = search.trim().toLowerCase();
		return v.label.toLowerCase().includes(q) || v.names.some((n) => n.toLowerCase().includes(q)) || v.vendorIds.some((id) => String(id).includes(q));
	});
	$: selectedVendors = data.vendors.filter((v) => selected[v.key]);

	function selectVisible(on: boolean) {
		for (const v of visible) {
			selected[v.key] = on;
			if (on) overrideFor(v.key);
		}
		selected = selected;
		ov = ov;
	}
	function clearSelection() {
		selected = {};
	}

	// ── Scenario controls ──────────────────────────────────────────────────
	let mode: BaselineMode = 'avg3';
	let growthPct = 0;
	let globalRent = 2; // $/sq ft applied to every selected vendor unless overridden
	type Override = { sqft: string; sales: string; rent: string; comm: string };
	let ov: Record<string, Override> = {};
	function overrideFor(key: string): Override {
		if (!ov[key]) ov[key] = { sqft: '', sales: '', rent: '', comm: '' };
		return ov[key];
	}
	const num = (s: string): number | null => {
		const n = Number(s);
		return s.trim() !== '' && Number.isFinite(n) ? n : null;
	};
	function resetOverrides() {
		ov = {};
		for (const v of selectedVendors) overrideFor(v.key);
		ov = ov;
	}

	// ── Rows ───────────────────────────────────────────────────────────────
	interface Row {
		v: Vendor;
		sqft: number;
		baseline: number | null; // from history, before growth
		sales: number;
		salesIsManual: boolean;
		curRentPerSqft: number;
		curComm: number | null;
		curCommDerived: boolean;
		cur: ReturnType<typeof evaluate>;
		rentPerSqft: number;
		comm: number;
		commIsCustom: boolean;
		out: ReturnType<typeof evaluate>;
		delta: number;
		rentForTarget: number | null;
		breakEven: number | null;
	}

	function buildRow(v: Vendor, o: Override | undefined): Row {
		const sqft = num(o?.sqft ?? '') ?? v.sqft;
		const baseline = baselineSales(v.sales, mode);
		const manual = num(o?.sales ?? '');
		const sales = manual ?? applyGrowth(baseline ?? 0, growthPct);

		// Current terms: rent on record; commission from vendor payment %, else derived from last month with sales.
		const curRentPerSqft = sqft > 0 ? round2(v.rent / sqft) : 0;
		let curComm = v.commissionPct;
		let derived = false;
		if (curComm === null) {
			for (let i = v.sales.length - 1; i >= 0; i--) {
				const g = v.sales[i];
				const r = v.retained[i];
				if (g && g > 0 && r !== null) {
					curComm = round2((r / g) * 100);
					derived = true;
					break;
				}
			}
		}
		const cur = evaluate({ sqft, rentPerSqft: curRentPerSqft, commissionPct: curComm ?? 0, monthlySales: sales }, data.target);

		const rentPerSqft = num(o?.rent ?? '') ?? globalRent;
		const customComm = num(o?.comm ?? '');
		const comm = customComm ?? commissionAt(scale, rentPerSqft);
		const out = evaluate({ sqft, rentPerSqft, commissionPct: comm, monthlySales: sales }, data.target);

		return {
			v,
			sqft,
			baseline,
			sales,
			salesIsManual: manual !== null,
			curRentPerSqft,
			curComm,
			curCommDerived: derived,
			cur,
			rentPerSqft,
			comm,
			commIsCustom: customComm !== null,
			out,
			delta: round2(out.storeRevenue - cur.storeRevenue),
			rentForTarget: rentPerSqftForTarget(sqft, data.target, sales, comm),
			breakEven: curComm === null ? null : breakEvenSales(sqft, { rentPerSqft, commissionPct: comm }, { rentPerSqft: curRentPerSqft, commissionPct: curComm })
		};
	}

	$: rows = selectedVendors.map((v) => buildRow(v, ov[v.key] ?? overrideFor(v.key))) as Row[];
	// referenced so Svelte re-runs `rows` when these change
	$: rows, scale, mode, growthPct, globalRent, ov;
	$: curTotals = totals(rows.map((r) => ({ sqft: r.sqft, monthlySales: r.sales, outcome: r.cur })));
	$: newTotals = totals(rows.map((r) => ({ sqft: r.sqft, monthlySales: r.sales, outcome: r.out })));

	const modeLabels: Record<BaselineMode, string> = {
		last: 'Last month',
		avg3: '3-month avg',
		avg6: '6-month avg',
		avg12: '12-month avg',
		trend: 'Trend (next month)',
		manual: 'Manual only'
	};

	function monthLabel(m: string): string {
		const [y, mo] = m.split('-').map(Number);
		return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
	}
	const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatCurrency(n));
	const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${round2(n)}%`);
	const signed = (n: number) => (n > 0 ? '+' : '') + formatCurrency(n);

	function enhanceWith(label: string) {
		return () => {
			return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
				savingScale = false;
				if (result.type === 'success') {
					notify.success(result.data?.message ?? `${label} done`);
					await invalidateAll();
				} else if (result.type === 'failure') {
					notify.error(result.data?.error ?? `${label} failed`);
				} else {
					await update();
				}
			};
		};
	}
</script>

<svelte:head>
	<title>Revenue Calculator - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
	<div>
		<div class="flex items-center gap-2 text-sm text-gray-500 mb-2">
			<a href="/admin" class="hover:text-primary-600 transition-colors">Admin</a>
			<span>›</span>
			<span class="text-gray-900">Revenue Calculator</span>
		</div>
		<h1 class="text-2xl font-bold text-gray-900">Booth Revenue Calculator</h1>
		<p class="text-gray-600">
			Try rent levels against real sales history. Nothing here changes a vendor's terms.
			Target: <span class="font-medium text-gray-900">{formatCurrency(data.target)} / sq ft / month</span>
			<a href="/admin/settings" class="text-primary-600 hover:underline text-sm ml-1">(change)</a>
		</p>
	</div>

	<!-- Scale -->
	<div class="card">
		<div class="card-header flex flex-wrap items-center justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold text-gray-900">Rent ↔ commission scale</h2>
				<p class="text-sm text-gray-500">Straight line: more rent per sq ft, lower commission on sales.</p>
			</div>
			<form method="POST" action="?/saveScale" use:enhance={() => { savingScale = true; return enhanceWith('Save')(); }}>
				<input type="hidden" name="rentLow" value={scale.rentLow} />
				<input type="hidden" name="commLow" value={scale.commLow} />
				<input type="hidden" name="rentHigh" value={scale.rentHigh} />
				<input type="hidden" name="commHigh" value={scale.commHigh} />
				<button type="submit" class="btn-primary btn-sm" disabled={savingScale}>Save scale</button>
			</form>
		</div>
		<div class="card-body grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="label" for="rentLow">Low rent ($/sq ft)</label>
						<input id="rentLow" type="number" min="0" step="0.25" class="input" bind:value={scale.rentLow} />
						<input type="range" min="0" max="10" step="0.25" class="w-full mt-1" bind:value={scale.rentLow} aria-label="Low rent" />
					</div>
					<div>
						<label class="label" for="commLow">…pays commission (%)</label>
						<input id="commLow" type="number" min="0" max="100" step="1" class="input" bind:value={scale.commLow} />
						<input type="range" min="0" max="100" step="1" class="w-full mt-1" bind:value={scale.commLow} aria-label="Commission at low rent" />
					</div>
					<div>
						<label class="label" for="rentHigh">High rent ($/sq ft)</label>
						<input id="rentHigh" type="number" min="0" step="0.25" class="input" bind:value={scale.rentHigh} />
						<input type="range" min="0" max="10" step="0.25" class="w-full mt-1" bind:value={scale.rentHigh} aria-label="High rent" />
					</div>
					<div>
						<label class="label" for="commHigh">…pays commission (%)</label>
						<input id="commHigh" type="number" min="0" max="100" step="1" class="input" bind:value={scale.commHigh} />
						<input type="range" min="0" max="100" step="1" class="w-full mt-1" bind:value={scale.commHigh} aria-label="Commission at high rent" />
					</div>
				</div>
				<p class="text-xs text-gray-500">
					Example: a 100 sq ft booth at {formatCurrency(scale.rentHigh)}/sq ft pays {formatCurrency(scale.rentHigh * 100)} rent and {scale.commHigh}% commission;
					at {formatCurrency(scale.rentLow)}/sq ft it pays {formatCurrency(scale.rentLow * 100)} and {scale.commLow}%.
				</p>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-gray-100 text-gray-600">
						<tr><th class="px-3 py-1.5 text-left">Rent / sq ft</th><th class="px-3 py-1.5 text-right">Commission</th><th class="px-3 py-1.5 text-right">100 sq ft, $2,000 sales → store</th></tr>
					</thead>
					<tbody>
						{#each steps as s}
							{@const o = evaluate({ sqft: 100, rentPerSqft: s.rentPerSqft, commissionPct: s.commissionPct, monthlySales: 2000 })}
							<tr class="border-t border-gray-100">
								<td class="px-3 py-1 font-mono">{formatCurrency(s.rentPerSqft)}</td>
								<td class="px-3 py-1 text-right font-mono">{s.commissionPct}%</td>
								<td class="px-3 py-1 text-right font-mono">{formatCurrency(o.storeRevenue)} <span class="text-gray-400">({formatCurrency(o.perSqft ?? 0)}/sq ft)</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Vendor picker -->
		<div class="card lg:col-span-1">
			<div class="card-header">
				<h2 class="text-lg font-semibold text-gray-900">Vendors</h2>
				<p class="text-sm text-gray-500">{selectedVendors.length} selected · {data.vendors.filter((v) => v.current).length} on the floor, {data.vendors.filter((v) => !v.current).length} departed</p>
			</div>
			<div class="card-body space-y-3">
				<input type="search" class="input" placeholder="Search code, name or NRS id…" bind:value={search} />
				<div class="flex flex-wrap items-center gap-3 text-sm">
					<label class="flex items-center gap-1"><input type="checkbox" bind:checked={showCurrent} /> Current</label>
					<label class="flex items-center gap-1"><input type="checkbox" bind:checked={showDeparted} /> Departed</label>
					<label class="flex items-center gap-1">Min sq ft <input type="number" min="0" class="input w-20 py-0.5" bind:value={minSqft} /></label>
				</div>
				<div class="flex gap-2">
					<button type="button" class="btn-secondary btn-sm" on:click={() => selectVisible(true)}>Select shown</button>
					<button type="button" class="btn-ghost btn-sm" on:click={() => selectVisible(false)}>Unselect shown</button>
					<button type="button" class="btn-ghost btn-sm" on:click={clearSelection}>Clear</button>
				</div>
				<ul class="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto border border-gray-200 rounded-md">
					{#each visible as v (v.key)}
						<li>
							<label class="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
								<input type="checkbox" class="mt-1" bind:checked={selected[v.key]} on:change={() => overrideFor(v.key)} />
								<span class="min-w-0 flex-1">
									<span class="flex items-center gap-2">
										<span class="font-medium text-gray-900 truncate">{v.label}</span>
										{#if v.shared}<span class="badge-gray">shared</span>{/if}
										{#if !v.current}<span class="badge-warning">left{v.lastSeenMonth ? ` ${monthLabel(v.lastSeenMonth)}` : ''}</span>{/if}
									</span>
									<span class="block text-xs text-gray-500 truncate">{v.names.join(', ')}</span>
									<span class="block text-xs text-gray-500">{v.sqft} sq ft · rent {money(v.rent)} · comm {pct(v.commissionPct)}</span>
								</span>
							</label>
						</li>
					{:else}
						<li class="px-3 py-6 text-center text-sm text-gray-500">No vendors match.</li>
					{/each}
				</ul>
			</div>
		</div>

		<!-- Scenario -->
		<div class="card lg:col-span-2">
			<div class="card-header">
				<h2 class="text-lg font-semibold text-gray-900">Scenario</h2>
				<p class="text-sm text-gray-500">Baseline sales come from the last {data.months.length} complete months of NRS sales. Override any cell per vendor.</p>
			</div>
			<div class="card-body space-y-4">
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<div>
						<label class="label" for="mode">Baseline sales</label>
						<select id="mode" class="input" bind:value={mode}>
							{#each Object.entries(modeLabels) as [k, label]}<option value={k}>{label}</option>{/each}
						</select>
					</div>
					<div>
						<label class="label" for="growth">Sales growth: {growthPct > 0 ? '+' : ''}{growthPct}%</label>
						<input id="growth" type="range" min="-50" max="100" step="5" class="w-full mt-2" bind:value={growthPct} />
					</div>
					<div>
						<label class="label" for="globalRent">Rent for all selected: {formatCurrency(globalRent)}/sq ft → {commissionAt(scale, globalRent)}%</label>
						<input id="globalRent" type="range" min={scale.rentLow} max={scale.rentHigh} step="0.25" class="w-full mt-2" bind:value={globalRent} />
					</div>
				</div>
				<div class="flex justify-end">
					<button type="button" class="btn-ghost btn-sm" on:click={resetOverrides}>Clear per-vendor overrides</button>
				</div>

				{#if rows.length === 0}
					<p class="text-center text-gray-500 py-8">Select one or more vendors to run the numbers.</p>
				{:else}
					<div class="overflow-x-auto -mx-4 sm:mx-0">
						<table class="w-full text-sm min-w-[56rem]">
							<thead class="bg-gray-100 text-gray-600">
								<tr>
									<th class="px-2 py-2 text-left">Vendor</th>
									<th class="px-2 py-2 text-right">Sq ft</th>
									<th class="px-2 py-2 text-right">Sales / mo</th>
									<th class="px-2 py-2 text-right">Today</th>
									<th class="px-2 py-2 text-right">Proposed rent</th>
									<th class="px-2 py-2 text-right">Comm %</th>
									<th class="px-2 py-2 text-right">Store / mo</th>
									<th class="px-2 py-2 text-right">$ / sq ft</th>
									<th class="px-2 py-2 text-right">Δ vs today</th>
									<th class="px-2 py-2"></th>
								</tr>
							</thead>
							<tbody>
								{#each rows as r (r.v.key)}
									<tr class="border-t border-gray-200 align-top">
										<td class="px-2 py-2">
											<div class="font-medium text-gray-900">{r.v.label}</div>
											<div class="text-xs text-gray-500 truncate max-w-[10rem]">{r.v.names.join(', ')}</div>
											{#if !r.v.current}<span class="badge-warning">departed</span>{/if}
										</td>
										<td class="px-2 py-2 text-right">
											<input type="number" min="0" class="input w-20 py-0.5 text-right" placeholder={String(r.v.sqft)} bind:value={ov[r.v.key].sqft} on:input={() => (ov = ov)} />
										</td>
										<td class="px-2 py-2 text-right">
											<input type="number" min="0" step="50" class="input w-28 py-0.5 text-right" placeholder={r.baseline === null ? 'no history' : String(applyGrowth(r.baseline, growthPct))} bind:value={ov[r.v.key].sales} on:input={() => (ov = ov)} />
											{#if r.baseline === null && !r.salesIsManual}<div class="text-xs text-amber-600">no sales history</div>{/if}
										</td>
										<td class="px-2 py-2 text-right text-gray-600 whitespace-nowrap">
											<div>{money(r.v.rent)} rent</div>
											<div>{pct(r.curComm)}{#if r.curCommDerived}<span class="text-gray-400" title="derived from last month's retained ÷ gross">*</span>{/if} comm</div>
											<div class="font-medium text-gray-900">{money(r.cur.storeRevenue)}</div>
											<div class="text-xs text-gray-400">{money(r.cur.perSqft)}/sq ft</div>
										</td>
										<td class="px-2 py-2 text-right">
											<input type="number" min="0" step="0.25" class="input w-24 py-0.5 text-right" placeholder={String(globalRent)} bind:value={ov[r.v.key].rent} on:input={() => (ov = ov)} />
											<div class="text-xs text-gray-500">= {money(r.out.rent)}</div>
											{#if r.rentForTarget !== null}
												<button type="button" class="text-xs text-primary-600 hover:underline" title="Set rent so this booth hits the target at these sales" on:click={() => { ov[r.v.key].rent = String(r.rentForTarget); ov = ov; }}>
													target needs {formatCurrency(r.rentForTarget)}
												</button>
											{/if}
										</td>
										<td class="px-2 py-2 text-right">
											<input type="number" min="0" max="100" step="1" class="input w-20 py-0.5 text-right" placeholder={String(commissionAt(scale, r.rentPerSqft))} bind:value={ov[r.v.key].comm} on:input={() => (ov = ov)} />
											<div class="text-xs text-gray-500">= {money(r.out.commission)}</div>
										</td>
										<td class="px-2 py-2 text-right font-medium text-gray-900">{money(r.out.storeRevenue)}</td>
										<td class="px-2 py-2 text-right">
											<span class={r.out.gapToTarget === 0 ? 'text-emerald-600 font-medium' : 'text-amber-600'}>{money(r.out.perSqft)}</span>
											{#if r.out.gapToTarget && r.out.gapToTarget > 0}<div class="text-xs text-amber-600">short {money(r.out.gapToTarget)}</div>{/if}
										</td>
										<td class="px-2 py-2 text-right font-mono {r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-red-600' : 'text-gray-500'}">{signed(r.delta)}</td>
										<td class="px-2 py-2 text-right">
											<button type="button" class="btn-ghost btn-sm" on:click={() => { expanded[r.v.key] = !expanded[r.v.key]; }} aria-label="Toggle history for {r.v.label}">{expanded[r.v.key] ? '▴' : '▾'}</button>
										</td>
									</tr>
									{#if expanded[r.v.key]}
										<tr class="bg-gray-50">
											<td colspan="10" class="px-3 py-2">
												<div class="text-xs text-gray-600 mb-1">
													History (oldest → newest). Vendor keeps {money(r.sales - r.out.commission)} of {money(r.sales)} under the proposal.
													{#if r.breakEven !== null} Break-even vs today: {money(r.breakEven)} in monthly sales.{/if}
												</div>
												<div class="overflow-x-auto">
													<table class="text-xs">
														<thead><tr class="text-gray-500"><th class="pr-3 text-left">Month</th>{#each data.months as m}<th class="px-2 text-right">{monthLabel(m)}</th>{/each}</tr></thead>
														<tbody>
															<tr><td class="pr-3 text-gray-500">Gross sales</td>{#each r.v.sales as s}<td class="px-2 text-right font-mono">{s === null ? '—' : formatCurrency(s)}</td>{/each}</tr>
															<tr><td class="pr-3 text-gray-500">Store kept</td>{#each r.v.retained as s}<td class="px-2 text-right font-mono">{s === null ? '—' : formatCurrency(s)}</td>{/each}</tr>
															<tr><td class="pr-3 text-gray-500">Sq ft</td>{#each r.v.sqftHistory as s}<td class="px-2 text-right font-mono">{s === null ? '—' : s}</td>{/each}</tr>
															<tr><td class="pr-3 text-gray-500">Rent</td>{#each r.v.rentHistory as s}<td class="px-2 text-right font-mono">{s === null ? '—' : formatCurrency(s)}</td>{/each}</tr>
														</tbody>
													</table>
												</div>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
							<tfoot class="bg-gray-800 text-white">
								<tr>
									<td class="px-2 py-2 font-semibold">Totals ({rows.length})</td>
									<td class="px-2 py-2 text-right">{newTotals.sqft}</td>
									<td class="px-2 py-2 text-right">{money(newTotals.sales)}</td>
									<td class="px-2 py-2 text-right">{money(curTotals.storeRevenue)}<div class="text-xs text-gray-300">{money(curTotals.perSqft)}/sq ft</div></td>
									<td class="px-2 py-2 text-right">{money(newTotals.rent)}</td>
									<td class="px-2 py-2 text-right">{money(newTotals.commission)}</td>
									<td class="px-2 py-2 text-right font-bold">{money(newTotals.storeRevenue)}</td>
									<td class="px-2 py-2 text-right">{money(newTotals.perSqft)}</td>
									<td class="px-2 py-2 text-right font-mono {newTotals.storeRevenue - curTotals.storeRevenue >= 0 ? 'text-emerald-300' : 'text-red-300'}">{signed(round2(newTotals.storeRevenue - curTotals.storeRevenue))}</td>
									<td></td>
								</tr>
							</tfoot>
						</table>
					</div>
					<p class="text-xs text-gray-500">
						* commission derived from retained ÷ gross in the latest month with sales (vendor payment % not on record).
						Sq ft is the painted cell count; rent and commission for past months are as archived, otherwise today's values.
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Archive -->
	<div class="card">
		<div class="card-header flex flex-wrap items-center justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold text-gray-900">Floorplan archive</h2>
				<p class="text-sm text-gray-500">
					Monthly record of each booth's space, rent and commission, kept so departed vendors and size changes stay available here.
					Captured daily, after floorplan edits, and on demand.
				</p>
			</div>
			<form method="POST" action="?/capture" use:enhance={enhanceWith('Capture')}>
				<button type="submit" class="btn-secondary btn-sm">Capture now</button>
			</form>
		</div>
		<div class="card-body text-sm text-gray-700">
			{#if data.archive.months.length === 0}
				No months archived yet. Press “Capture now” to record this month (and backfill earlier months from saved floorplan snapshots, if any).
			{:else}
				Archived months: {data.archive.months.map(monthLabel).join(', ')}.
				{#if data.archive.lastCapturedAt}Last capture {new Date(data.archive.lastCapturedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}.{/if}
			{/if}
		</div>
	</div>
</div>
