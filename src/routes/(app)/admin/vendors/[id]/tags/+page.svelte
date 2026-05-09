<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	const s = data.settings;
	let headerLine = s?.headerLine ?? '';
	let footerLine = s?.footerLine ?? '';
	let includeDescription = s?.includeDescription ?? true;
	let includePartNumber = s?.includePartNumber ?? true;
	let includePrice = s?.includePrice ?? true;
	let includeBarcode = s?.includeBarcode ?? true;
	let preferredFormat = s?.preferredFormat ?? 'avery_5160';
	let fontScale = s?.fontScale ?? 'medium';
	let zebraDpi = s?.zebraDpi ?? 203;
	let barcodeSymbology = s?.barcodeSymbology ?? 'code_128';

	let previewSvg = data.initialPreviewSvg;
	let previewBusy = false;
	let debounceHandle: ReturnType<typeof setTimeout> | null = null;

	$: selectedFormat = data.formats.find((f) => f.code === preferredFormat) ?? null;
	$: isThermal = selectedFormat?.layout === 'thermal';
	$: void [
		headerLine,
		footerLine,
		includeDescription,
		includePartNumber,
		includePrice,
		includeBarcode,
		barcodeSymbology,
		preferredFormat,
		fontScale,
		zebraDpi
	], schedulePreview();

	function schedulePreview() {
		if (debounceHandle) clearTimeout(debounceHandle);
		debounceHandle = setTimeout(refreshPreview, 200);
	}

	async function refreshPreview() {
		previewBusy = true;
		try {
			const r = await fetch('/api/admin/tag-preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vendorDisplayName: data.vendor.displayName,
					settings: {
						headerLine: headerLine || null,
						footerLine: footerLine || null,
						includeDescription,
						includePartNumber,
						includePrice,
						includeBarcode,
						barcodeSymbology,
						preferredFormat,
						fontScale,
						zebraDpi
					},
					item: {
						partNumber: data.samplePartNumber,
						name: 'Vintage Pyrex Bowl',
						description: 'Cinderella mixing bowl, mid-century',
						priceCents: 2499
					}
				})
			});
			const j = await r.json();
			previewSvg = j.svg;
		} finally {
			previewBusy = false;
		}
	}
</script>

<svelte:head><title>Tag Designer — {data.vendor.displayName}</title></svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<a href={`/admin/vendors/${data.vendor.id}`} class="text-sm text-primary-600 hover:underline">← Back to vendor</a>
	<h1 class="text-2xl font-bold text-gray-900 mt-2">Tag Designer — {data.vendor.displayName}</h1>
	<p class="text-sm text-gray-600 mt-1">Configure what prints on this vendor's barcode tags. Live preview to the right.</p>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">Saved.</div>
	{/if}

	<div class="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Form -->
		<form method="POST" action="?/save" use:enhance class="space-y-4">
			<div class="card">
				<div class="card-header"><h2 class="font-semibold text-gray-900">Tag content</h2></div>
				<div class="card-body space-y-3">
					<div>
						<label class="label" for="headerLine">Header line</label>
						<input id="headerLine" name="headerLine" type="text" class="input" bind:value={headerLine} placeholder={data.vendor.displayName} />
						<p class="text-xs text-gray-500 mt-1">Top of the tag. Default: vendor name "{data.vendor.displayName}".</p>
					</div>
					<div>
						<label class="label" for="footerLine">Footer line</label>
						<input id="footerLine" name="footerLine" type="text" class="input" bind:value={footerLine} placeholder="(optional)" />
						<p class="text-xs text-gray-500 mt-1">Optional bottom text — phone, "Thank you", anything.</p>
					</div>

					<div class="grid grid-cols-2 gap-2 pt-2">
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" name="includeBarcode" bind:checked={includeBarcode} />
							Barcode
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" name="includePartNumber" bind:checked={includePartNumber} />
							Part number text
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" name="includeDescription" bind:checked={includeDescription} />
							Item name / description
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" name="includePrice" bind:checked={includePrice} />
							Price
						</label>
					</div>

					{#if includeBarcode}
						<div class="pt-2 border-t border-gray-100">
							<label class="label" for="barcodeSymbology">Barcode type</label>
							<select id="barcodeSymbology" name="barcodeSymbology" class="input" bind:value={barcodeSymbology}>
								<option value="code_128">Code 128 — 1D linear (universal scanner support)</option>
								<option value="datamatrix">Data Matrix — 2D square (~3× more compact, needs imaging scanner)</option>
							</select>
							<p class="text-xs text-gray-500 mt-1">
								Use Data Matrix for tiny labels (jewelry barbells, small books). Confirm your POS scanner reads 2D first.
							</p>
						</div>
					{/if}
				</div>
			</div>

			<div class="card">
				<div class="card-header"><h2 class="font-semibold text-gray-900">Format</h2></div>
				<div class="card-body grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label class="label" for="preferredFormat">Tag format</label>
						<select id="preferredFormat" name="preferredFormat" class="input" bind:value={preferredFormat}>
							{#each data.formats as f (f.id)}
								<option value={f.code}>{f.name}</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">Need a different size? <a href="/admin/label-formats" class="text-primary-600 hover:underline">Add it under Label Formats</a>.</p>
					</div>
					<div>
						<label class="label" for="fontScale">Font scale</label>
						<select id="fontScale" name="fontScale" class="input" bind:value={fontScale}>
							<option value="small">Small (more text fits)</option>
							<option value="medium">Medium</option>
							<option value="large">Large (easier to read at distance)</option>
						</select>
					</div>
					{#if isThermal}
						<div>
							<label class="label" for="zebraDpi">Zebra printer DPI</label>
							<select id="zebraDpi" name="zebraDpi" class="input" bind:value={zebraDpi}>
								<option value={203}>203 dpi (most common)</option>
								<option value={300}>300 dpi</option>
							</select>
						</div>
					{:else}
						<input type="hidden" name="zebraDpi" value={zebraDpi} />
					{/if}
				</div>
			</div>

			<div class="flex justify-end">
				<button type="submit" class="btn btn-primary">Save Settings</button>
			</div>
		</form>

		<!-- Live preview + Zebra helper -->
		<div class="space-y-4 sticky top-4 self-start">
			<div class="card">
				<div class="card-header flex items-center justify-between">
					<h2 class="font-semibold text-gray-900">Live preview</h2>
					{#if previewBusy}<span class="text-xs text-gray-500">rendering…</span>{/if}
				</div>
				<div class="card-body bg-gray-50 flex items-center justify-center p-8 min-h-[280px]">
					{@html previewSvg}
				</div>
				<div class="card-body border-t border-gray-100 text-xs text-gray-500">
					Sample data:
					<code class="font-mono">{data.samplePartNumber}</code>
					— "Vintage Pyrex Bowl" — $24.99.
					Real items use their own values.
				</div>
			</div>

			{#if isThermal}
				<div class="card">
					<div class="card-header">
						<h2 class="font-semibold text-gray-900">🦓 Zebra Browser Print</h2>
					</div>
					<div class="card-body text-sm space-y-2">
						<p class="text-gray-700">To print to a Zebra thermal printer, install Zebra's free <strong>Browser Print</strong> helper once:</p>
						<a
							href="https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html"
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-secondary block text-center w-full">
							⬇ Download Zebra Browser Print
						</a>
						<p class="text-xs text-gray-500">Mac + Windows. Free, signed by Zebra. After install, our portal sends ZPL to <code>localhost:9101</code>.</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
