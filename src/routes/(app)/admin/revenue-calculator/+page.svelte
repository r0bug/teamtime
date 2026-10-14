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
		rentIncreaseForTarget,
		salesForTarget,
		breakEvenSales,
		totals,
		totalCosts,
		breakEvenPerSqft,
		type CostLine,
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

	// ── Fixed monthly costs (utilities, insurance, labor…) ─────────────────
	let costs: CostLine[] = data.costs.map((c) => ({ ...c }));
	let savingCosts = false;
	function addCost() {
		costs = [...costs, { name: '', amount: 0 }];
	}
	function removeCost(i: number) {
		costs = costs.filter((_, idx) => idx !== i);
	}
	$: monthlyCosts = totalCosts(costs.filter((c) => c.name.trim() && Number.isFinite(Number(c.amount))).map((c) => ({ name: c.name, amount: Number(c.amount) })));
	$: floorSqft = data.vendors.filter((v) => v.current).reduce((a, v) => a + v.sqft, 0);
	$: breakEven = breakEvenPerSqft(monthlyCosts, floorSqft);

	// "If sales fall by X%" stress test for the contract threshold column.
	let stressPct = 25;

	// ── Selection ──────────────────────────────────────────────────────────
	let search = '';
	let showCurrent = true;
	let showDeparted = true;
	let minSqft = 0;
	let selected: Record<string, boolean> = Object.fromEntries(data.vendors.filter((v) => v.current).map((v) => [v.key, true]));
	let expanded: Record<string, boolean> = {};
	let sortBy: 'label' | 'today' | 'proposed' | 'sqft' | 'sales' = 'today';

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
	let mode: BaselineMode = 'auto';
	let growthPct = 0;
	let applyGlobal = false; // off: each vendor keeps today's rent unless overridden
	let globalRent = 2; // $/sq ft applied to every selected vendor when applyGlobal is on
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
		/** Sales below which the proposal no longer meets the target. */
		thresholdSales: number | null;
		/** Sales after the stress drop, and the rent increase needed then. */
		stressedSales: number;
		stressRentIncrease: number;
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

		const rentPerSqft = num(o?.rent ?? '') ?? (applyGlobal ? globalRent : curRentPerSqft);
		const customComm = num(o?.comm ?? '');
		const comm = customComm ?? commissionAt(scale, rentPerSqft, curComm);
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
			breakEven: curComm === null ? null : breakEvenSales(sqft, { rentPerSqft, commissionPct: comm }, { rentPerSqft: curRentPerSqft, commissionPct: curComm }),
			thresholdSales: salesForTarget(sqft, data.target, rentPerSqft, comm),
			stressedSales: round2(sales * (1 - stressPct / 100)),
			stressRentIncrease: rentIncreaseForTarget(sqft, data.target, rentPerSqft, comm, sales * (1 - stressPct / 100))
		};
	}

	$: rows = sortRows(selectedVendors.map((v) => buildRow(v, ov[v.key] ?? overrideFor(v.key))) as Row[], sortBy);
	// referenced so Svelte re-runs `rows` when these change
	$: rows, scale, mode, growthPct, globalRent, applyGlobal, ov, sortBy, stressPct;
	$: allCurrentRevenue = totals(
		data.vendors
			.filter((v) => v.current)
			.map((v) => {
				const r = buildRow(v, undefined);
				return { sqft: r.sqft, monthlySales: r.sales, outcome: r.cur };
			})
	);
	$: allCurrentRevenue, mode, growthPct;

	function contractClause(r: Row): string {
		const rent = formatCurrency(r.out.rent);
		const comm = `${round2(r.comm)}%`;
		if (r.thresholdSales === null) return `Rent ${rent}/month; store commission ${comm} of gross sales.`;
		const bump = formatCurrency(r.stressRentIncrease);
		return (
			`Rent ${rent}/month plus a ${comm} store commission on gross sales. ` +
			`Monthly sales threshold: ${formatCurrency(r.thresholdSales)}. ` +
			`If gross sales for a calendar month fall below the threshold, rent for the following month increases by the shortfall × ${comm}` +
			` (at ${formatCurrency(r.stressedSales)} in sales, +${bump}/month), capped at ${formatCurrency(Math.max(0, data.target * r.sqft - r.out.rent))}.`
		);
	}
	function copyClause(r: Row) {
		navigator.clipboard?.writeText(contractClause(r)).then(() => notify.success('Clause copied'), () => notify.error('Could not copy'));
	}

	function sortRows(rs: Row[], by: typeof sortBy): Row[] {
		const val = (r: Row) =>
			by === 'today' ? (r.cur.perSqft ?? -1) : by === 'proposed' ? (r.out.perSqft ?? -1) : by === 'sqft' ? r.sqft : by === 'sales' ? r.sales : 0;
		return [...rs].sort((a, b) => (by === 'label' ? a.v.label.localeCompare(b.v.label) : val(b) - val(a) || a.v.label.localeCompare(b.v.label)));
	}
	$: curTotals = totals(rows.map((r) => ({ sqft: r.sqft, monthlySales: r.sales, outcome: r.cur })));
	$: newTotals = totals(rows.map((r) => ({ sqft: r.sqft, monthlySales: r.sales, outcome: r.out })));

	const modeLabels: Record<BaselineMode, string> = {
		auto: '3-month avg (2 or 1 if that is all there is)',
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
				savingCosts = false;
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

	<!-- Store summary -->
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
		<div class="card"><div class="card-body py-3"><div class="text-xs text-gray-500">Monthly costs</div><div class="text-xl font-semibold text-gray-900">{money(monthlyCosts)}</div></div></div>
		<div class="card"><div class="card-body py-3"><div class="text-xs text-gray-500">Booth sq ft on the floor</div><div class="text-xl font-semibold text-gray-900">{floorSqft}</div></div></div>
		<div class="card"><div class="card-body py-3"><div class="text-xs text-gray-500">Break-even $/sq ft</div><div class="text-xl font-semibold {breakEven !== null && breakEven > data.target ? 'text-red-600' : 'text-gray-900'}">{money(breakEven)}</div><div class="text-xs text-gray-400">target {money(data.target)}</div></div></div>
		<div class="card"><div class="card-body py-3"><div class="text-xs text-gray-500">Store revenue today ({modeLabels[mode].split(' (')[0]})</div><div class="text-xl font-semibold text-gray-900">{money(allCurrentRevenue.storeRevenue)}</div><div class="text-xs text-gray-400">{money(allCurrentRevenue.perSqft)}/sq ft</div></div></div>
		<div class="card"><div class="card-body py-3"><div class="text-xs text-gray-500">Margin after costs</div><div class="text-xl font-semibold {allCurrentRevenue.storeRevenue - monthlyCosts >= 0 ? 'text-emerald-600' : 'text-red-600'}">{signed(round2(allCurrentRevenue.storeRevenue - monthlyCosts))}</div></div></div>
	</div>

	<!-- Costs -->
	<div class="card">
		<div class="card-header flex flex-wrap items-center justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold text-gray-900">Fixed monthly costs</h2>
				<p class="text-sm text-gray-500">Utilities, insurance, labor, building rent… Total ÷ booth sq ft = the break-even rate above.</p>
			</div>
			<form method="POST" action="?/saveCosts" use:enhance={() => { savingCosts = true; return enhanceWith('Save')(); }}>
				<input type="hidden" name="costs" value={JSON.stringify(costs)} />
				<button type="submit" class="btn-primary btn-sm" disabled={savingCosts}>Save costs</button>
			</form>
		</div>
		<div class="card-body">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
				{#each costs as c, i}
					<div class="flex items-center gap-2">
						<input class="input flex-1" placeholder="e.g. Utilities" bind:value={c.name} />
						<input type="number" min="0" step="1" class="input w-32 text-right" bind:value={c.amount} />
						<button type="button" class="btn-ghost btn-sm" aria-label="Remove cost" on:click={() => removeCost(i)}>✕</button>
					</div>
				{/each}
			</div>
			<div class="mt-3 flex items-center justify-between">
				<button type="button" class="btn-secondary btn-sm" on:click={addCost}>+ Add cost</button>
				<span class="text-sm text-gray-700">Total <span class="font-semibold">{money(monthlyCosts)}</span> / month</span>
			</div>
		</div>
	</div>

	<!-- Scale -->
	<div class="card">
		<div class="card-header flex flex-wrap items-center justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold text-gray-900">Rent ↔ commission scale</h2>
				<p class="text-sm text-gray-500">
					{#if scale.mode === 'step'}
						Each vendor keeps their normal commission rate. Rent is optional; at or above the premium rent the store only takes the floor rate (card fees).
					{:else}
						Straight line between the two anchors: more rent per sq ft, lower commission on sales (never below the floor).
					{/if}
				</p>
			</div>
			<form method="POST" action="?/saveScale" use:enhance={() => { savingScale = true; return enhanceWith('Save')(); }}>
				<input type="hidden" name="mode" value={scale.mode} />
				<input type="hidden" name="minComm" value={scale.minComm} />
				<input type="hidden" name="rentLow" value={scale.rentLow} />
				<input type="hidden" name="commLow" value={scale.commLow} />
				<input type="hidden" name="rentHigh" value={scale.rentHigh} />
				<input type="hidden" name="commHigh" value={scale.commHigh} />
				<button type="submit" class="btn-primary btn-sm" disabled={savingScale}>Save scale</button>
			</form>
		</div>
		<div class="card-body grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div class="space-y-4">
				<div class="flex flex-wrap items-center gap-4 text-sm">
					<label class="flex items-center gap-1"><input type="radio" bind:group={scale.mode} value="step" /> Step (normal rate, then floor above premium rent)</label>
					<label class="flex items-center gap-1"><input type="radio" bind:group={scale.mode} value="linear" /> Straight line</label>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="label" for="rentLow">{scale.mode === 'step' ? 'Minimum rent ($/sq ft, 0 = optional)' : 'Low rent ($/sq ft)'}</label>
						<input id="rentLow" type="number" min="0" step="0.25" class="input" bind:value={scale.rentLow} />
						<input type="range" min="0" max="10" step="0.25" class="w-full mt-1" bind:value={scale.rentLow} aria-label="Low rent" />
					</div>
					<div>
						<label class="label" for="commLow">{scale.mode === 'step' ? 'Normal commission when rate unknown (%)' : '…pays commission (%)'}</label>
						<input id="commLow" type="number" min="0" max="100" step="1" class="input" bind:value={scale.commLow} />
						<input type="range" min="0" max="100" step="1" class="w-full mt-1" bind:value={scale.commLow} aria-label="Commission at low rent" />
					</div>
					<div>
						<label class="label" for="rentHigh">{scale.mode === 'step' ? 'Premium rent threshold ($/sq ft)' : 'High rent ($/sq ft)'}</label>
						<input id="rentHigh" type="number" min="0" step="0.25" class="input" bind:value={scale.rentHigh} />
						<input type="range" min="0" max="60" step="0.5" class="w-full mt-1" bind:value={scale.rentHigh} aria-label="High rent" />
					</div>
					<div>
						<label class="label" for="commHigh">{scale.mode === 'step' ? 'Commission at premium rent (%)' : '…pays commission (%)'}</label>
						<input id="commHigh" type="number" min="0" max="100" step="1" class="input" bind:value={scale.commHigh} />
						<input type="range" min="0" max="100" step="1" class="w-full mt-1" bind:value={scale.commHigh} aria-label="Commission at high rent" />
					</div>
					<div>
						<label class="label" for="minComm">Floor — card fees (%)</label>
						<input id="minComm" type="number" min="0" max="100" step="0.5" class="input" bind:value={scale.minComm} />
					</div>
				</div>
				<p class="text-xs text-gray-500">
					Example: a 12 sq ft cabinet at {formatCurrency(400)}/mo is {formatCurrency(400 / 12)}/sq ft → {commissionAt(scale, 400 / 12, 13)}% commission
					(normal rate 13%). Store revenue on {formatCurrency(1000)} of sales: {formatCurrency(evaluate({ sqft: 12, rentPerSqft: 400 / 12, commissionPct: commissionAt(scale, 400 / 12, 13), monthlySales: 1000 }).storeRevenue)}
					= {formatCurrency(evaluate({ sqft: 12, rentPerSqft: 400 / 12, commissionPct: commissionAt(scale, 400 / 12, 13), monthlySales: 1000 }).perSqft ?? 0)}/sq ft.
				</p>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-gray-100 text-gray-600">
						<tr><th class="px-3 py-1.5 text-left">Rent / sq ft</th><th class="px-3 py-1.5 text-right">Commission{#if scale.mode === 'step'} (13% vendor){/if}</th><th class="px-3 py-1.5 text-right">100 sq ft, $2,000 sales → store</th></tr>
					</thead>
					<tbody>
						{#each steps as s}
							{@const o = evaluate({ sqft: 100, rentPerSqft: s.rentPerSqft, commissionPct: commissionAt(scale, s.rentPerSqft, 13), monthlySales: 2000 })}
							<tr class="border-t border-gray-100">
								<td class="px-3 py-1 font-mono">{formatCurrency(s.rentPerSqft)}</td>
								<td class="px-3 py-1 text-right font-mono">{commissionAt(scale, s.rentPerSqft, 13)}%</td>
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
				<p class="text-sm text-gray-500">Revenue per sq ft = (rent + commission × monthly sales) ÷ painted sq ft. Sales come from the last {data.months.length} complete months of NRS sales. Override any cell per vendor.</p>
			</div>
			<div class="card-body space-y-4">
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
						<label class="label" for="stress">Contract stress test: sales fall {stressPct}%</label>
						<input id="stress" type="range" min="0" max="75" step="5" class="w-full mt-2" bind:value={stressPct} />
						<p class="text-xs text-gray-500">Shows the rent increase needed to stay at target if sales drop this much.</p>
					</div>
					<div>
						<label class="label flex items-center gap-2" for="globalRent">
							<input type="checkbox" bind:checked={applyGlobal} />
							<span>Set rent for all selected: {formatCurrency(globalRent)}/sq ft{#if applyGlobal} → {commissionAt(scale, globalRent, null)}%{/if}</span>
						</label>
						<input id="globalRent" type="range" min="0" max={Math.max(scale.rentHigh, 10)} step="0.25" class="w-full mt-2" bind:value={globalRent} disabled={!applyGlobal} />
						<p class="text-xs text-gray-500">Off: every vendor keeps today's rent unless you type one in their row.</p>
					</div>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<label class="text-sm text-gray-600 flex items-center gap-2">Sort by
						<select class="input py-0.5 w-auto" bind:value={sortBy}>
							<option value="today">Today $/sq ft</option>
							<option value="proposed">Proposed $/sq ft</option>
							<option value="sales">Sales</option>
							<option value="sqft">Sq ft</option>
							<option value="label">Vendor</option>
						</select>
					</label>
					<button type="button" class="btn-ghost btn-sm" on:click={resetOverrides}>Clear per-vendor overrides</button>
				</div>

				{#if rows.length === 0}
					<p class="text-center text-gray-500 py-8">Select one or more vendors to run the numbers.</p>
				{:else}
					<div class="overflow-x-auto -mx-4 sm:mx-0">
						<table class="w-full text-sm min-w-[68rem]">
							<thead class="bg-gray-100 text-gray-600">
								<tr>
									<th class="px-2 py-2 text-left">Vendor</th>
									<th class="px-2 py-2 text-right">Sq ft</th>
									<th class="px-2 py-2 text-right">Sales / mo</th>
									<th class="px-2 py-2 text-right">Today</th>
									<th class="px-2 py-2 text-right">Today $/sq ft</th>
									<th class="px-2 py-2 text-right">Proposed rent</th>
									<th class="px-2 py-2 text-right">Comm %</th>
									<th class="px-2 py-2 text-right">Store / mo</th>
									<th class="px-2 py-2 text-right">$ / sq ft</th>
									<th class="px-2 py-2 text-right">Δ vs today</th>
									<th class="px-2 py-2 text-right">Sales threshold</th>
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
											<div>{money(r.v.rent)} rent <span class="text-gray-400">({money(r.curRentPerSqft)}/sq ft)</span></div>
											<div>{pct(r.curComm)}{#if r.curCommDerived}<span class="text-gray-400" title="derived from last month's retained ÷ gross">*</span>{/if} comm = {money(r.cur.commission)}</div>
											<div class="font-medium text-gray-900">{money(r.cur.storeRevenue)} / mo</div>
										</td>
										<td class="px-2 py-2 text-right">
											<span class="text-lg font-semibold {r.cur.gapToTarget === 0 ? 'text-emerald-600' : 'text-amber-600'}">{money(r.cur.perSqft)}</span>
											{#if r.cur.gapToTarget && r.cur.gapToTarget > 0}<div class="text-xs text-amber-600">short {money(r.cur.gapToTarget)}</div>{/if}
										</td>
										<td class="px-2 py-2 text-right">
											<input type="number" min="0" step="0.25" class="input w-24 py-0.5 text-right" placeholder={String(applyGlobal ? globalRent : r.curRentPerSqft)} bind:value={ov[r.v.key].rent} on:input={() => (ov = ov)} />
											<div class="text-xs text-gray-500">= {money(r.out.rent)}</div>
											{#if r.rentForTarget !== null}
												<button type="button" class="text-xs text-primary-600 hover:underline" title="Set rent so this booth hits the target at these sales" on:click={() => { ov[r.v.key].rent = String(r.rentForTarget); ov = ov; }}>
													target needs {formatCurrency(r.rentForTarget)}
												</button>
											{/if}
										</td>
										<td class="px-2 py-2 text-right">
											<input type="number" min="0" max="100" step="1" class="input w-20 py-0.5 text-right" placeholder={String(commissionAt(scale, r.rentPerSqft, r.curComm))} bind:value={ov[r.v.key].comm} on:input={() => (ov = ov)} />
											<div class="text-xs text-gray-500">= {money(r.out.commission)}</div>
										</td>
										<td class="px-2 py-2 text-right font-medium text-gray-900">{money(r.out.storeRevenue)}</td>
										<td class="px-2 py-2 text-right">
											<span class={r.out.gapToTarget === 0 ? 'text-emerald-600 font-medium' : 'text-amber-600'}>{money(r.out.perSqft)}</span>
											{#if r.out.gapToTarget && r.out.gapToTarget > 0}<div class="text-xs text-amber-600">short {money(r.out.gapToTarget)}</div>{/if}
										</td>
										<td class="px-2 py-2 text-right font-mono {r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-red-600' : 'text-gray-500'}">{signed(r.delta)}</td>
										<td class="px-2 py-2 text-right whitespace-nowrap">
											{#if r.thresholdSales === null}
												<span class="text-gray-400">—</span>
											{:else}
												<div class="font-medium {r.sales >= r.thresholdSales ? 'text-gray-900' : 'text-amber-600'}">{money(r.thresholdSales)}/mo</div>
												<div class="text-xs text-gray-500">at −{stressPct}%: {r.stressRentIncrease > 0 ? `rent +${formatCurrency(r.stressRentIncrease)}` : 'no increase'}</div>
											{/if}
										</td>
										<td class="px-2 py-2 text-right">
											<button type="button" class="btn-ghost btn-sm" on:click={() => { expanded[r.v.key] = !expanded[r.v.key]; }} aria-label="Toggle history for {r.v.label}">{expanded[r.v.key] ? '▴' : '▾'}</button>
										</td>
									</tr>
									{#if expanded[r.v.key]}
										<tr class="bg-gray-50">
											<td colspan="12" class="px-3 py-2">
												<div class="text-xs text-gray-600 mb-1">
													History (oldest → newest). Vendor keeps {money(r.sales - r.out.commission)} of {money(r.sales)} under the proposal.
													{#if r.breakEven !== null} Break-even vs today: {money(r.breakEven)} in monthly sales.{/if}
												</div>
												<div class="mb-2 p-2 bg-white border border-gray-200 rounded text-xs text-gray-800 flex flex-wrap items-start gap-2">
													<span class="flex-1 min-w-[16rem]"><span class="font-medium">Contract clause:</span> {contractClause(r)}</span>
													<button type="button" class="btn-secondary btn-sm" on:click={() => copyClause(r)}>Copy</button>
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
									<td class="px-2 py-2 text-right">{money(curTotals.storeRevenue)}</td>
									<td class="px-2 py-2 text-right font-semibold">{money(curTotals.perSqft)}</td>
									<td class="px-2 py-2 text-right">{money(newTotals.rent)}</td>
									<td class="px-2 py-2 text-right">{money(newTotals.commission)}</td>
									<td class="px-2 py-2 text-right font-bold">{money(newTotals.storeRevenue)}</td>
									<td class="px-2 py-2 text-right">{money(newTotals.perSqft)}</td>
									<td class="px-2 py-2 text-right font-mono {newTotals.storeRevenue - curTotals.storeRevenue >= 0 ? 'text-emerald-300' : 'text-red-300'}">{signed(round2(newTotals.storeRevenue - curTotals.storeRevenue))}</td>
									<td class="px-2 py-2 text-right text-xs text-gray-300">at −{stressPct}%: +{money(round2(rows.reduce((a, r) => a + r.stressRentIncrease, 0)))}</td>
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
