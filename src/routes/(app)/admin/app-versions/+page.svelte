<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;

	const osOrder = ['Windows', 'macOS', 'Linux'] as const;
</script>

<svelte:head><title>Label app versions — Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="flex items-center gap-3 flex-wrap">
		<h1 class="text-2xl font-bold text-gray-900">Label app versions</h1>
		{#if data.current.version}
			<span class="badge-primary">current v{data.current.version}</span>
		{/if}
	</div>
	<p class="text-gray-600 text-sm mt-1">
		Older installers are kept in hidden archive folders that vendors can't see. Download a previous
		build here to roll a device back or hand a specific vendor an older version.
	</p>

	<!-- Current -->
	<section class="mt-6">
		<h2 class="font-semibold text-gray-900 mb-2">
			Current{#if data.current.version} — v{data.current.version}{/if}
			<span class="text-sm font-normal text-gray-500">(live on the vendor download page)</span>
		</h2>
		{#if data.current.files.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No installers staged.</div></div>
		{:else}
			<div class="flex flex-col gap-1">
				{#each data.current.files as f (f.file)}
					<a class="text-sm text-primary-600 hover:underline" href={`/vendor/app/download/${encodeURIComponent(f.file)}`} download>
						{f.os} · {f.label} · {f.sizeMB} MB
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Archived -->
	<section class="mt-8">
		<h2 class="font-semibold text-gray-900 mb-2">
			Archived versions <span class="text-sm font-normal text-gray-500">({data.archived.length})</span>
		</h2>
		{#if data.archived.length === 0}
			<div class="card"><div class="card-body text-sm text-gray-500">No archived versions yet.</div></div>
		{:else}
			<div class="flex flex-col gap-4">
				{#each data.archived as v (v.dir)}
					<div class="rounded-lg border border-gray-200 bg-white p-4">
						<h3 class="font-medium text-gray-900 mb-2">v{v.version}</h3>
						<div class="grid gap-1 sm:grid-cols-2">
							{#each osOrder as os (os)}
								{#each v.files.filter((f) => f.os === os) as f (f.file)}
									<a class="text-sm text-primary-600 hover:underline"
										href={`/admin/app-versions/download/${encodeURIComponent(v.dir)}/${encodeURIComponent(f.file)}`}
										download>
										{f.os} · {f.label} · {f.sizeMB} MB
									</a>
								{/each}
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
