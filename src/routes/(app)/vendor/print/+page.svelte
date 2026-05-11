<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	type Item = (typeof data.items)[number];

	let formatCode = data.preferredFormatCode;
	let startPosition = 1;
	let copiesEach = 1;
	let selected: Record<string, boolean> = {};
	let copiesByPart: Record<string, number> = {};
	let sheetHtml: string | null = null;
	let busy = false;
	let errorMessage: string | null = null;

	let iframeEl: HTMLIFrameElement | null = null;

	$: selectedFormat = data.sheetFormats.find((f) => f.code === formatCode) ?? data.sheetFormats[0];
	$: cols = selectedFormat?.cols ?? 3;
	$: rows = selectedFormat?.rows ?? 10;
	$: totalCells = cols * rows;
	$: selectedItems = data.items.filter((it) => selected[it.partNumber]);
	$: queueLength = selectedItems.reduce((s, it) => s + (copiesByPart[it.partNumber] ?? copiesEach), 0);

	function toggleAll(on: boolean) {
		selected = data.items.reduce<Record<string, boolean>>((acc, it) => {
			acc[it.partNumber] = on;
			return acc;
		}, {});
	}

	async function generate() {
		errorMessage = null;
		if (selectedItems.length === 0) {
			errorMessage = 'Select at least one item.';
			return;
		}
		if (!selectedFormat) {
			errorMessage = 'Pick a sheet format.';
			return;
		}
		busy = true;
		try {
			const items = selectedItems.map((it) => ({
				partNumber: it.partNumber,
				copies: copiesByPart[it.partNumber] ?? copiesEach
			}));
			const r = await fetch('/api/vendor/tag-sheet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					formatCode,
					startPosition,
					items
				})
			});
			if (!r.ok) {
				const msg = await r.text().catch(() => r.statusText);
				throw new Error(msg);
			}
			sheetHtml = await r.text();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to render sheet';
			sheetHtml = null;
		} finally {
			busy = false;
		}
	}

	function printNow() {
		if (!iframeEl?.contentWindow) return;
		iframeEl.contentWindow.focus();
		iframeEl.contentWindow.print();
	}

	function priceLabel(it: Item): string {
		return it.priceCents !== null && it.priceCents !== undefined
			? `$${(it.priceCents / 100).toFixed(2)}`
			: '—';
	}
</script>

<svelte:head><title>Print Tags — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<a href="/vendor/inventory" class="text-sm text-primary-600 hover:underline">← Back to inventory</a>
	<h1 class="text-2xl font-bold text-gray-900 mt-2">Print tags on a sheet</h1>
	<p class="text-sm text-gray-600 mt-1">Pick which items to tag, choose your sheet format, and where on the sheet to start (in case the first labels are already used). The browser's print dialog handles the rest — works with any regular printer that takes 8.5×11" paper.</p>

	{#if errorMessage}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{errorMessage}</div>
	{/if}

	<div class="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Left col: items to print -->
		<div class="lg:col-span-2 space-y-4">
			<div class="card">
				<div class="card-header flex items-center justify-between flex-wrap gap-2">
					<div>
						<h2 class="font-semibold text-gray-900">Items ({selectedItems.length} of {data.items.length} selected)</h2>
						<p class="text-xs text-gray-500 mt-1">Showing your most recent inventory submissions.</p>
					</div>
					<div class="flex gap-2 text-sm">
						<button type="button" class="text-primary-600 hover:underline" on:click={() => toggleAll(true)}>Select all</button>
						<span class="text-gray-300">|</span>
						<button type="button" class="text-primary-600 hover:underline" on:click={() => toggleAll(false)}>Clear</button>
					</div>
				</div>
				<div class="card-body p-0 max-h-[480px] overflow-auto">
					{#if data.items.length === 0}
						<p class="text-sm text-gray-500 p-4">No items yet. Add some via the <a class="text-primary-600 hover:underline" href="/vendor/inventory">Make a tag</a> form.</p>
					{:else}
						<table class="min-w-full text-sm">
							<thead class="bg-gray-50 text-left sticky top-0">
								<tr>
									<th class="px-3 py-2 w-8"></th>
									<th class="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Part #</th>
									<th class="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Name</th>
									<th class="px-3 py-2 font-medium text-gray-700 text-right whitespace-nowrap">Price</th>
									<th class="px-3 py-2 font-medium text-gray-700 w-20">Copies</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each data.items as it (it.partNumber)}
									<tr class:bg-primary-50={selected[it.partNumber]}>
										<td class="px-3 py-2"><input type="checkbox" bind:checked={selected[it.partNumber]} /></td>
										<td class="px-3 py-2 font-mono text-xs">{it.partNumber}</td>
										<td class="px-3 py-2">{it.name ?? '—'}</td>
										<td class="px-3 py-2 text-right tabular-nums">{priceLabel(it)}</td>
										<td class="px-3 py-2">
											<input
												type="number"
												min="1"
												max="50"
												class="input text-sm w-16 px-2 py-1"
												placeholder={String(copiesEach)}
												bind:value={copiesByPart[it.partNumber]}
												disabled={!selected[it.partNumber]} />
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			</div>

			{#if sheetHtml}
				<div class="card">
					<div class="card-header flex items-center justify-between">
						<h2 class="font-semibold text-gray-900">Preview</h2>
						<button type="button" class="btn btn-primary" on:click={printNow}>🖨 Print</button>
					</div>
					<div class="card-body bg-gray-100 p-4 flex justify-center overflow-auto">
						<iframe
							bind:this={iframeEl}
							srcdoc={sheetHtml}
							title="Sheet preview"
							class="bg-white shadow"
							style="width: {selectedFormat?.pageWidthInches ?? 8.5}in; height: {selectedFormat?.pageHeightInches ?? 11}in; max-width: 100%; border: 0;"></iframe>
					</div>
				</div>
			{/if}
		</div>

		<!-- Right col: settings -->
		<div class="space-y-4">
			<div class="card">
				<div class="card-header"><h2 class="font-semibold text-gray-900">Sheet format</h2></div>
				<div class="card-body space-y-3">
					<div>
						<label class="label" for="format">Format</label>
						{#if data.sheetFormats.length === 0}
							<p class="text-sm text-amber-700">No sheet formats configured. Ask staff to set one up.</p>
						{:else}
							<select id="format" class="input" bind:value={formatCode}>
								{#each data.sheetFormats as f (f.id)}
									<option value={f.code}>{f.name}</option>
								{/each}
							</select>
						{/if}
						{#if selectedFormat}
							<p class="text-xs text-gray-500 mt-1">
								{selectedFormat.cols}×{selectedFormat.rows} on {selectedFormat.pageWidthInches}"×{selectedFormat.pageHeightInches}" — labels {selectedFormat.labelWidthInches}"×{selectedFormat.labelHeightInches}"
							</p>
						{/if}
					</div>

					<div>
						<label class="label" for="copies">Default copies per item</label>
						<input
							id="copies"
							type="number"
							min="1"
							max="50"
							class="input"
							bind:value={copiesEach} />
						<p class="text-xs text-gray-500 mt-1">Per-row override available in the table.</p>
					</div>
				</div>
			</div>

			<div class="card">
				<div class="card-header">
					<h2 class="font-semibold text-gray-900">Start position</h2>
					<p class="text-xs text-gray-500 mt-1">First {startPosition - 1} cell{startPosition === 2 ? '' : 's'} stays blank — useful when the top of your sheet is already used.</p>
				</div>
				<div class="card-body">
					{#if selectedFormat}
						<div class="grid gap-1" style="grid-template-columns: repeat({cols}, minmax(0, 1fr));">
							{#each Array(totalCells) as _, i}
								{@const pos = i + 1}
								{@const isStart = pos === startPosition}
								{@const beforeStart = pos < startPosition}
								<button
									type="button"
									class="aspect-[2/1] text-[10px] border rounded transition {isStart ? 'bg-primary-600 text-white border-primary-700' : beforeStart ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-primary-50'}"
									on:click={() => (startPosition = pos)}>
									{pos}
								</button>
							{/each}
						</div>
						<p class="text-xs text-gray-600 mt-2">Starting at cell <strong>{startPosition}</strong>. {totalCells - startPosition + 1} cells available; you have {queueLength} tag{queueLength === 1 ? '' : 's'} to print.</p>
						{#if queueLength > totalCells - startPosition + 1}
							<p class="text-xs text-amber-700 mt-1">⚠ Not enough cells for all selected tags. {queueLength - (totalCells - startPosition + 1)} won't fit.</p>
						{/if}
					{/if}
				</div>
			</div>

			<button
				type="button"
				class="btn btn-primary w-full"
				on:click={generate}
				disabled={busy || selectedItems.length === 0 || data.sheetFormats.length === 0}>
				{busy ? 'Generating…' : 'Generate sheet preview'}
			</button>
		</div>
	</div>
</div>
