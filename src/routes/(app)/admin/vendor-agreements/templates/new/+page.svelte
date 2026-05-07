<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	export let form: ActionData;

	type ExtraField = { key: string; label: string; type: 'currency' | 'text' | 'number'; required: boolean };
	let extras: ExtraField[] = [];
	function addExtra() {
		extras = [...extras, { key: '', label: '', type: 'text', required: false }];
	}
	function removeExtra(i: number) {
		extras = extras.filter((_, idx) => idx !== i);
	}
</script>

<svelte:head><title>New Agreement Template - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<a href="/admin/vendor-agreements/templates" class="text-sm text-primary-600 hover:underline">← Back to templates</a>
	<h1 class="text-2xl font-bold text-gray-900 mt-2">New Agreement Template</h1>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="mt-6 space-y-6">
		<div class="card">
			<div class="card-header">
				<h2 class="font-semibold text-gray-900">Basics</h2>
			</div>
			<div class="card-body space-y-4">
				<div>
					<label class="label" for="title">Title</label>
					<input id="title" name="title" type="text" class="input" required placeholder="Consignment Vendor Agreement" />
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="label" for="code">Code</label>
						<input id="code" name="code" type="text" class="input font-mono" required placeholder="consignment-vendor" />
						<p class="text-xs text-gray-500 mt-1">Stable slug. Reuse the same code across versions of one document.</p>
					</div>
					<div>
						<label class="label" for="kind">Kind</label>
						<select id="kind" name="kind" class="input" required>
							<option value="primary">Primary (one per vendor)</option>
							<option value="addon">Add-On (stackable)</option>
						</select>
					</div>
				</div>
			</div>
		</div>

		<div class="card">
			<div class="card-header">
				<h2 class="font-semibold text-gray-900">Body (Markdown)</h2>
				<p class="text-xs text-gray-500 mt-1">The full text the vendor sees and signs.</p>
			</div>
			<div class="card-body">
				<textarea name="bodyMarkdown" rows="14" class="input font-mono text-sm" required></textarea>
			</div>
		</div>

		<div class="card">
			<div class="card-header flex items-center justify-between">
				<div>
					<h2 class="font-semibold text-gray-900">Extra fields collected at signing (optional)</h2>
					<p class="text-xs text-gray-500 mt-1">e.g. monthly shelf fee for an add-on agreement.</p>
				</div>
				<button type="button" class="btn btn-secondary text-sm" on:click={addExtra}>+ Add field</button>
			</div>
			<div class="card-body space-y-3">
				{#each extras as f, i (i)}
					<div class="grid grid-cols-12 gap-2 items-end">
						<div class="col-span-3">
							<label class="label text-xs">Key</label>
							<input name="extra_key" type="text" class="input font-mono text-sm" bind:value={f.key} placeholder="monthlyShelfFee" />
						</div>
						<div class="col-span-4">
							<label class="label text-xs">Label</label>
							<input name="extra_label" type="text" class="input text-sm" bind:value={f.label} placeholder="Monthly Shelf Fee" />
						</div>
						<div class="col-span-2">
							<label class="label text-xs">Type</label>
							<select name="extra_type" class="input text-sm" bind:value={f.type}>
								<option value="text">Text</option>
								<option value="number">Number</option>
								<option value="currency">Currency</option>
							</select>
						</div>
						<div class="col-span-2 flex items-center pb-2">
							<label class="text-xs flex items-center gap-1">
								<input name="extra_required" type="checkbox" value="true" bind:checked={f.required} />
								Required
							</label>
						</div>
						<div class="col-span-1 text-right">
							<button type="button" class="text-red-600 text-sm" on:click={() => removeExtra(i)}>×</button>
						</div>
					</div>
				{:else}
					<p class="text-sm text-gray-500">None.</p>
				{/each}
			</div>
		</div>

		<div class="flex justify-end gap-2">
			<a href="/admin/vendor-agreements/templates" class="btn btn-secondary">Cancel</a>
			<button type="submit" class="btn btn-primary">Create Template</button>
		</div>
	</form>
</div>
