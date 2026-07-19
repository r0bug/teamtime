<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;

	const fmtDate = (d: string | Date | null) =>
		d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
</script>

<svelte:head><title>{data.title} — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<a href="/vendor/newsletters" class="text-sm text-primary-600 hover:underline">← All newsletters</a>
	<article class="mt-3 rounded-lg border border-gray-200 bg-white p-6">
		<h1 class="text-2xl font-bold text-gray-900">{data.title}</h1>
		<p class="text-xs text-gray-500 mt-1">{fmtDate(data.sentAt)}</p>
		<!-- Server-rendered by vendor-newsletter-service; markdown comes from
		     managers, everything else is escaped there. -->
		<div class="mt-4">{@html data.html}</div>
	</article>
</div>
