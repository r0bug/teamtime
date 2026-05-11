<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	type Vendor = (typeof data.vendors)[number];
	type Format = (typeof data.formats)[number];

	interface Row {
		key: number;
		vendorId: string;
		description: string;
		priceDollars: string; // string for tidy form binding; coerced server-side
		copies: number;
	}

	interface GeneratedRow {
		rowIndex: number;
		changeId: string;
		partNumber: string;
		vendorId: string;
		description: string;
		priceCents: number;
		copies: number;
	}

	const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

	let formatCode = data.defaultFormatCode;
	let startPosition = 1;
	let monthCode = MONTH_CODES[new Date().getMonth()];

	let keySeq = 1;
	function newRow(): Row {
		return { key: keySeq++, vendorId: '', description: '', priceDollars: '', copies: 1 };
	}

	let rows: Row[] = [newRow(), newRow(), newRow()];
	let lastVendorPicked = '';

	let busy = false;
	let errorMessage: string | null = null;
	let generated: GeneratedRow[] = [];
	let sheetHtml: string | null = null;
	let iframeEl: HTMLIFrameElement | null = null;

	$: sheetFormats = data.formats.filter((f: Format) => f.layout === 'sheet');
	$: selectedFormat = sheetFormats.find((f) => f.code === formatCode) ?? sheetFormats[0];
	$: cols = selectedFormat?.cols ?? 3;
	$: rowsPerSheet = selectedFormat?.rows ?? 10;
	$: totalCells = cols * rowsPerSheet;
	$: vendorById = new Map(data.vendors.map((v: Vendor) => [v.id, v]));
	$: hasIncomplete = rows.some(
		(r) => r.vendorId && r.description.trim() && r.priceDollars.trim() === ''
	);
	$: readyRows = rows.filter(
		(r) => r.vendorId && r.description.trim() && r.priceDollars.trim() !== ''
	);
	$: totalCopies = readyRows.reduce((sum, r) => sum + Math.max(1, r.copies | 0), 0);

	function addRow() {
		const r = newRow();
		if (lastVendorPicked) r.vendorId = lastVendorPicked;
		rows = [...rows, r];
	}

	function removeRow(key: number) {
		rows = rows.filter((r) => r.key !== key);
		if (rows.length === 0) rows = [newRow()];
	}

	function onVendorChange(r: Row) {
		if (r.vendorId) lastVendorPicked = r.vendorId;
	}

	function reset() {
		rows = [newRow(), newRow(), newRow()];
		generated = [];
		sheetHtml = null;
		errorMessage = null;
	}

	async function generate() {
		errorMessage = null;
		if (readyRows.length === 0) {
			errorMessage = 'Add at least one row with vendor, description, and price.';
			return;
		}
		busy = true;
		try {
			// 1) Mint part numbers + create pending changes.
			const genResp = await fetch('/api/admin/bulk-tags/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					rows: readyRows.map((r) => ({
						vendorId: r.vendorId,
						description: r.description.trim(),
						priceDollars: parseFloat(r.priceDollars),
						copies: Math.max(1, Math.min(r.copies | 0, 100))
					}))
				})
			});
			if (!genResp.ok) {
				const msg = await genResp.text().catch(() => genResp.statusText);
				throw new Error(msg);
			}
			const genData = (await genResp.json()) as { generated: GeneratedRow[] };
			generated = genData.generated;

			// 2) Render the sheet for the just-created items.
			const sheetResp = await fetch('/api/admin/bulk-tags/sheet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					formatCode,
					startPosition,
					monthCode,
					items: generated.map((g) => ({
						partNumber: g.partNumber,
						vendorId: g.vendorId,
						description: g.description,
						priceCents: g.priceCents,
						copies: g.copies
					}))
				})
			});
			if (!sheetResp.ok) {
				const msg = await sheetResp.text().catch(() => sheetResp.statusText);
				throw new Error(msg);
			}
			sheetHtml = await sheetResp.text();

			// Defer print until iframe has loaded the HTML.
			queueMicrotask(() => {
				if (iframeEl?.contentWindow) {
					setTimeout(() => iframeEl?.contentWindow?.focus(), 300);
				}
			});
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			busy = false;
		}
	}

	function printSheet() {
		if (iframeEl?.contentWindow) {
			iframeEl.contentWindow.focus();
			iframeEl.contentWindow.print();
		}
	}

	function downloadCsvZip() {
		if (generated.length === 0) return;
		const ids = generated.map((g) => g.changeId).join(',');
		const url = `/api/admin/bulk-tags/csv-zip?changeIds=${encodeURIComponent(ids)}`;
		window.location.href = url;
	}

	function dollars(cents: number): string {
		return `$${(cents / 100).toFixed(2)}`;
	}

	function vendorName(id: string): string {
		return vendorById.get(id)?.displayName ?? '—';
	}
</script>

<svelte:head><title>Bulk Tag Designer — TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<div class="mt-2 flex items-center justify-between flex-wrap gap-3">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Bulk Tag Designer</h1>
			<p class="text-gray-600 text-sm mt-1">Create labels across many vendors at once. Part numbers are minted using each vendor's daily counter; rows are queued as pending inventory changes and emit one CSV per vendor for NRS Import.</p>
		</div>
	</div>

	{#if errorMessage}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
			{errorMessage}
		</div>
	{/if}

	<div class="card mt-4">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Sheet settings</h2></div>
		<div class="card-body grid grid-cols-1 md:grid-cols-4 gap-3">
			<div>
				<label class="label" for="format">Label format</label>
				<select id="format" class="input" bind:value={formatCode}>
					{#each sheetFormats as f}
						<option value={f.code}>{f.name}</option>
					{/each}
				</select>
				<p class="text-xs text-gray-500 mt-1">{cols}×{rowsPerSheet} = {totalCells} cells / sheet</p>
			</div>
			<div>
				<label class="label" for="start">Start at cell #</label>
				<input id="start" type="number" min="1" max={totalCells} class="input" bind:value={startPosition} />
				<p class="text-xs text-gray-500 mt-1">Skip used cells from a partial sheet.</p>
			</div>
			<div>
				<label class="label" for="month">Month code badge</label>
				<select id="month" class="input" bind:value={monthCode}>
					{#each MONTH_CODES as m}
						<option value={m}>{m}</option>
					{/each}
				</select>
				<p class="text-xs text-gray-500 mt-1">Bold corner badge on every tag.</p>
			</div>
			<div class="flex items-end">
				<div class="text-sm text-gray-700">
					<div><strong>{readyRows.length}</strong> row{readyRows.length === 1 ? '' : 's'} ready</div>
					<div class="text-xs text-gray-500">{totalCopies} label{totalCopies === 1 ? '' : 's'} total</div>
				</div>
			</div>
		</div>
	</div>

	<div class="card mt-4">
		<div class="card-header flex items-center justify-between">
			<h2 class="font-semibold text-gray-900">Items</h2>
			<button class="btn btn-secondary text-sm" on:click={addRow}>+ Add row</button>
		</div>
		<div class="card-body p-0 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-gray-50 text-left">
					<tr>
						<th class="px-3 py-2 font-medium text-gray-700 w-12">#</th>
						<th class="px-3 py-2 font-medium text-gray-700">Description</th>
						<th class="px-3 py-2 font-medium text-gray-700 w-32">Price</th>
						<th class="px-3 py-2 font-medium text-gray-700 w-56">Vendor</th>
						<th class="px-3 py-2 font-medium text-gray-700 w-20">Copies</th>
						<th class="px-3 py-2 w-8"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each rows as r, i (r.key)}
						<tr>
							<td class="px-3 py-2 text-gray-500">{i + 1}</td>
							<td class="px-3 py-2">
								<input type="text" class="input" placeholder="Walnut chair" bind:value={r.description} />
							</td>
							<td class="px-3 py-2">
								<input type="number" step="0.01" min="0" class="input" placeholder="0.00" bind:value={r.priceDollars} />
							</td>
							<td class="px-3 py-2">
								<select class="input" bind:value={r.vendorId} on:change={() => onVendorChange(r)}>
									<option value="">— choose vendor —</option>
									{#each data.vendors as v}
										<option value={v.id}>{v.displayName} ({v.inventoryCodePrefix})</option>
									{/each}
								</select>
							</td>
							<td class="px-3 py-2">
								<input type="number" min="1" max="100" class="input" bind:value={r.copies} />
							</td>
							<td class="px-3 py-2 text-right">
								<button type="button" class="text-red-600 hover:underline text-sm" on:click={() => removeRow(r.key)} aria-label="Remove row">✕</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if hasIncomplete}
				<p class="text-xs text-amber-700 px-4 py-2 bg-amber-50 border-t border-amber-200">Some rows have description but no price — they'll be skipped.</p>
			{/if}
		</div>
		<div class="card-body border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
			<div class="text-xs text-gray-500">
				Part numbers are minted on submit and cannot be reused. Cancel a row in Changes Queue if you need to back it out.
			</div>
			<div class="flex gap-2">
				<button type="button" class="btn btn-secondary" on:click={reset} disabled={busy}>Reset</button>
				<button type="button" class="btn btn-primary" on:click={generate} disabled={busy || readyRows.length === 0}>
					{busy ? 'Generating…' : `Generate ${readyRows.length} row${readyRows.length === 1 ? '' : 's'}`}
				</button>
			</div>
		</div>
	</div>

	{#if generated.length > 0}
		<div class="card mt-6">
			<div class="card-header flex items-center justify-between flex-wrap gap-2">
				<h2 class="font-semibold text-gray-900">Generated ({generated.length})</h2>
				<div class="flex gap-2">
					<button class="btn btn-secondary" on:click={printSheet}>🖨 Print sheet</button>
					<button class="btn btn-primary" on:click={downloadCsvZip}>⬇ Download CSV zip</button>
				</div>
			</div>
			<div class="card-body p-0">
				<table class="w-full text-sm">
					<thead class="bg-gray-50 text-left">
						<tr>
							<th class="px-3 py-2 font-medium text-gray-700">Part #</th>
							<th class="px-3 py-2 font-medium text-gray-700">Vendor</th>
							<th class="px-3 py-2 font-medium text-gray-700">Description</th>
							<th class="px-3 py-2 font-medium text-gray-700">Price</th>
							<th class="px-3 py-2 font-medium text-gray-700">Copies</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						{#each generated as g}
							<tr>
								<td class="px-3 py-2 font-mono text-xs">{g.partNumber}</td>
								<td class="px-3 py-2">{vendorName(g.vendorId)}</td>
								<td class="px-3 py-2">{g.description}</td>
								<td class="px-3 py-2">{dollars(g.priceCents)}</td>
								<td class="px-3 py-2">{g.copies}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	{#if sheetHtml}
		<div class="card mt-6">
			<div class="card-header flex items-center justify-between">
				<h2 class="font-semibold text-gray-900">Print preview</h2>
				<button class="btn btn-secondary text-sm" on:click={printSheet}>🖨 Print</button>
			</div>
			<div class="card-body">
				<iframe
					bind:this={iframeEl}
					srcdoc={sheetHtml}
					title="Tag sheet preview"
					class="w-full bg-white border border-gray-200 rounded"
					style="height: 1100px;"
				></iframe>
			</div>
		</div>
	{/if}
</div>
