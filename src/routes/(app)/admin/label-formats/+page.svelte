<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	$: active = data.formats.filter((f) => f.isActive);
	$: archived = data.formats.filter((f) => !f.isActive);

	let editingId: string | null = null;
	let showAdd = false;
	let layout: 'sheet' | 'thermal' = 'sheet';
</script>

<svelte:head><title>Label Formats — TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<div class="mt-2 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Label Formats</h1>
			<p class="text-gray-600 text-sm mt-1">Sheet (Avery-style) and thermal (Zebra) label sizes used across the tag designer + print flows.</p>
		</div>
		<button class="btn btn-primary" on:click={() => (showAdd = !showAdd)}>{showAdd ? 'Cancel' : '+ Add format'}</button>
	</div>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}

	{#if showAdd}
		<form method="POST" action="?/create" use:enhance={() => () => { showAdd = false; }} class="mt-4">
			<div class="card">
				<div class="card-header"><h2 class="font-semibold text-gray-900">New label format</h2></div>
				<div class="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
					<div>
						<label class="label" for="new-code">Code (ID)</label>
						<input id="new-code" name="code" type="text" class="input font-mono" required placeholder="custom_2x1" />
					</div>
					<div class="md:col-span-2">
						<label class="label" for="new-name">Name</label>
						<input id="new-name" name="name" type="text" class="input" required placeholder="Custom 2x1 thermal" />
					</div>
					<div>
						<label class="label" for="new-layout">Layout</label>
						<select id="new-layout" name="layout" class="input" bind:value={layout}>
							<option value="sheet">Sheet (Avery-style)</option>
							<option value="thermal">Thermal (Zebra-style)</option>
						</select>
					</div>
					<div>
						<label class="label" for="new-lw">Label width (in)</label>
						<input id="new-lw" name="labelWidthInches" type="number" step="0.001" class="input" required />
					</div>
					<div>
						<label class="label" for="new-lh">Label height (in)</label>
						<input id="new-lh" name="labelHeightInches" type="number" step="0.001" class="input" required />
					</div>

					{#if layout === 'sheet'}
						<div>
							<label class="label" for="new-pw">Page width (in)</label>
							<input id="new-pw" name="pageWidthInches" type="number" step="0.001" class="input" placeholder="8.5" />
						</div>
						<div>
							<label class="label" for="new-ph">Page height (in)</label>
							<input id="new-ph" name="pageHeightInches" type="number" step="0.001" class="input" placeholder="11" />
						</div>
						<div>
							<label class="label" for="new-cols">Columns</label>
							<input id="new-cols" name="cols" type="number" class="input" placeholder="3" />
						</div>
						<div>
							<label class="label" for="new-rows">Rows</label>
							<input id="new-rows" name="rows" type="number" class="input" placeholder="10" />
						</div>
						<div>
							<label class="label" for="new-mt">Margin top (in)</label>
							<input id="new-mt" name="marginTopInches" type="number" step="0.001" class="input" placeholder="0.5" />
						</div>
						<div>
							<label class="label" for="new-ml">Margin left (in)</label>
							<input id="new-ml" name="marginLeftInches" type="number" step="0.001" class="input" placeholder="0.1875" />
						</div>
						<div>
							<label class="label" for="new-vp">Vertical pitch (in)</label>
							<input id="new-vp" name="verticalPitchInches" type="number" step="0.001" class="input" placeholder="1.0" />
						</div>
						<div>
							<label class="label" for="new-hp">Horizontal pitch (in)</label>
							<input id="new-hp" name="horizontalPitchInches" type="number" step="0.001" class="input" placeholder="2.75" />
						</div>
					{/if}
				</div>
				<div class="card-body border-t border-gray-100 flex justify-end gap-2">
					<button type="button" class="btn btn-secondary" on:click={() => (showAdd = false)}>Cancel</button>
					<button type="submit" class="btn btn-primary">Create format</button>
				</div>
			</div>
		</form>
	{/if}

	<div class="card mt-6 bg-amber-50 border-amber-200">
		<div class="card-body flex items-start gap-3 text-sm">
			<span class="text-2xl leading-none">🦓</span>
			<div class="flex-1">
				<strong class="text-gray-900">Printing to Zebra thermal printers?</strong>
				<p class="text-gray-700 mt-1">Vendors need Zebra's free <strong>Browser Print</strong> helper installed locally. One-time install, signed by Zebra, Mac + Windows.</p>
			</div>
			<a
				href="https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html"
				target="_blank"
				rel="noopener noreferrer"
				class="btn btn-secondary text-sm whitespace-nowrap">
				⬇ Download
			</a>
		</div>
	</div>

	<div class="card mt-6">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Active formats ({active.length})</h2></div>
		<div class="card-body p-0">
			{#if active.length === 0}
				<p class="text-sm text-gray-500 p-4">None.</p>
			{:else}
				<table class="w-full text-sm">
					<thead class="bg-gray-50 text-left">
						<tr>
							<th class="px-4 py-2 font-medium text-gray-700">Code</th>
							<th class="px-4 py-2 font-medium text-gray-700">Name</th>
							<th class="px-4 py-2 font-medium text-gray-700">Layout</th>
							<th class="px-4 py-2 font-medium text-gray-700">Label</th>
							<th class="px-4 py-2 font-medium text-gray-700">Sheet</th>
							<th class="px-4 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						{#each active as f (f.id)}
							<tr>
								<td class="px-4 py-2 font-mono text-xs">{f.code}</td>
								<td class="px-4 py-2">{f.name}</td>
								<td class="px-4 py-2">{f.layout}</td>
								<td class="px-4 py-2 text-xs">{f.labelWidthInches}" × {f.labelHeightInches}"</td>
								<td class="px-4 py-2 text-xs">
									{#if f.layout === 'sheet'}
										{f.cols}×{f.rows} on {f.pageWidthInches}"×{f.pageHeightInches}"
									{:else}
										—
									{/if}
								</td>
								<td class="px-4 py-2 text-right">
									<form method="POST" action="?/archive" use:enhance class="inline">
										<input type="hidden" name="id" value={f.id} />
										<button type="submit" class="text-red-600 hover:underline text-sm">Archive</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>

	{#if archived.length > 0}
		<details class="mt-6">
			<summary class="text-sm text-gray-600 cursor-pointer">Archived ({archived.length})</summary>
			<div class="mt-2 space-y-1">
				{#each archived as f (f.id)}
					<div class="flex items-center justify-between text-sm">
						<span class="text-gray-500"><code class="font-mono">{f.code}</code> — {f.name}</span>
						<form method="POST" action="?/unarchive" use:enhance>
							<input type="hidden" name="id" value={f.id} />
							<button type="submit" class="text-primary-600 hover:underline">Unarchive</button>
						</form>
					</div>
				{/each}
			</div>
		</details>
	{/if}
</div>
