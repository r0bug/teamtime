<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	type ExtraField = { key: string; label: string; type: 'currency' | 'text' | 'number'; required: boolean };

	let title = data.template.title;
	let bodyMarkdown = data.template.bodyMarkdown;
	let extras: ExtraField[] = (data.template.extraFieldsSchema ?? []).map((f) => ({ ...f }));

	function addExtra() {
		extras = [...extras, { key: '', label: '', type: 'text', required: false }];
	}
	function removeExtra(i: number) {
		extras = extras.filter((_, idx) => idx !== i);
	}
</script>

<svelte:head><title>Edit {data.template.title} - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<a href="/admin/vendor-agreements/templates" class="text-sm text-primary-600 hover:underline">← Back to templates</a>
	<div class="mt-2 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">{data.template.title}</h1>
			<p class="text-sm text-gray-600 mt-1">
				<span class="font-mono">{data.template.code}</span> · v{data.template.version} ·
				{data.template.kind} ·
				{data.template.archivedAt ? 'archived' : data.template.isActive ? 'active' : 'superseded'}
			</p>
		</div>
	</div>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form && 'success' in form && form.success}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
			Saved. If signed agreements existed, a new version was created.
		</div>
	{/if}

	{#if !data.template.isActive && !data.template.archivedAt}
		<div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-sm">
			This is a superseded version — kept for historical reference. Newer versions of <span class="font-mono">{data.template.code}</span> may exist.
		</div>
	{/if}

	<form method="POST" action="?/update" use:enhance class="mt-6 space-y-6">
		<div class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Basics</h2></div>
			<div class="card-body space-y-4">
				<div>
					<label class="label" for="title">Title</label>
					<input id="title" name="title" type="text" class="input" bind:value={title} required />
				</div>
			</div>
		</div>

		<div class="card">
			<div class="card-header">
				<h2 class="font-semibold text-gray-900">Body (Markdown)</h2>
				<p class="text-xs text-gray-500 mt-1">If signed agreements already reference this template, saving will create a new version. Old signed records keep showing the body they were signed against.</p>
			</div>
			<div class="card-body">
				<textarea name="bodyMarkdown" rows="14" class="input font-mono text-sm" bind:value={bodyMarkdown} required></textarea>
			</div>
		</div>

		<div class="card">
			<div class="card-header flex items-center justify-between">
				<h2 class="font-semibold text-gray-900">Extra fields</h2>
				<button type="button" class="btn btn-secondary text-sm" on:click={addExtra}>+ Add field</button>
			</div>
			<div class="card-body space-y-3">
				{#each extras as f, i (i)}
					<div class="grid grid-cols-12 gap-2 items-end">
						<div class="col-span-3">
							<label class="label text-xs">Key</label>
							<input name="extra_key" type="text" class="input font-mono text-sm" bind:value={f.key} />
						</div>
						<div class="col-span-4">
							<label class="label text-xs">Label</label>
							<input name="extra_label" type="text" class="input text-sm" bind:value={f.label} />
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

		<div class="flex items-center justify-end gap-2">
			<button type="submit" class="btn btn-primary">Save Changes</button>
		</div>
	</form>

	<form method="POST" action="?/archive" use:enhance class="mt-6">
		<button type="submit" class="btn btn-danger text-sm">Archive Template</button>
	</form>
</div>
