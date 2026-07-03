<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;

	const fmtDate = (d: string | Date) =>
		new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
</script>

<svelte:head><title>News — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-900">News &amp; updates</h1>
	<p class="text-gray-600 text-sm mt-1">
		Announcements from the Yakima Finds team — printer issues, app updates, store changes, and
		anything else vendors should know.
	</p>

	<div class="mt-6 flex flex-col gap-4">
		{#each data.announcements as a (a.id)}
			<article class="rounded-lg border bg-white p-5 {a.pinned ? 'border-amber-300' : 'border-gray-200'}">
				<div class="flex items-center gap-2 flex-wrap">
					{#if a.pinned}<span class="badge-warning">Important</span>{/if}
					<h2 class="font-semibold text-gray-900">{a.title}</h2>
				</div>
				<p class="text-xs text-gray-500 mt-1">{fmtDate(a.publishedAt)}</p>
				<p class="text-sm text-gray-700 mt-3 whitespace-pre-line">{a.body}</p>
			</article>
		{:else}
			<div class="rounded-md border border-gray-200 bg-white p-6 text-center text-gray-500 text-sm">
				No announcements right now — you're all caught up.
			</div>
		{/each}
	</div>
</div>
