<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;

	const fmtDate = (d: string | Date | null) =>
		d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
	const fmtShort = (d: string) =>
		new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

<svelte:head><title>Newsletters — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-900">Newsletters</h1>
	<p class="text-gray-600 text-sm mt-1">
		Periodic roundups from the shop — sales trends, the vendor leaderboard, shoutouts, tips, and
		upcoming events. Day-to-day notices are on the
		<a href="/vendor/news" class="text-primary-600 hover:underline">News</a> page.
	</p>

	<div class="mt-6 flex flex-col gap-3">
		{#each data.newsletters as n (n.id)}
			<a href="/vendor/newsletters/{n.id}" class="rounded-lg border border-gray-200 bg-white p-5 hover:border-primary-300 hover:shadow-sm transition">
				<h2 class="font-semibold text-gray-900">📰 {n.title}</h2>
				<p class="text-xs text-gray-500 mt-1">
					{fmtDate(n.sentAt)} · covers {fmtShort(n.periodStart)} – {fmtShort(n.periodEnd)}
				</p>
			</a>
		{:else}
			<div class="rounded-md border border-gray-200 bg-white p-6 text-center text-gray-500 text-sm">
				No newsletters yet — the first one will land here (and in your email).
			</div>
		{/each}
	</div>
</div>
