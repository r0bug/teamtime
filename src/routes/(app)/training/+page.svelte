<script lang="ts">
	import { onMount } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// Deep link: /training#<slug> scrolls to that resource.
	let selected = '';
	onMount(() => {
		selected = decodeURIComponent(location.hash.slice(1));
		if (selected) document.getElementById(selected)?.scrollIntoView({ behavior: 'smooth' });
	});

	function size(bytes: number): string {
		return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : `${Math.round(bytes / 1024)} KB`;
	}
	const isVideo = (f: string) => /\.(mp4|webm)$/i.test(f);
</script>

<svelte:head>
	<title>Training - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Training</h1>
		<p class="text-gray-600 mt-1 text-sm">
			How-to videos and guides for TeamTime. Staff only — short link: <span class="font-mono">backoffice.yakimafinds.com/TT</span>
		</p>
	</div>

	{#if data.resources.length === 0}
		<EmptyState title="No training resources yet" message="Videos added to the training library will show up here." />
	{:else}
		<div class="space-y-6">
			{#each data.resources as r (r.slug)}
				<div id={r.slug} class="card {selected === r.slug ? 'ring-2 ring-primary-500' : ''}">
					<div class="card-header">
						<h2 class="text-lg font-semibold">{r.title}</h2>
						<div class="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-2">
							{#if r.duration}<span>{r.duration}</span>{/if}
							<span>{size(r.sizeBytes)}</span>
							{#each r.tags as t}<span class="badge-gray">{t}</span>{/each}
						</div>
					</div>
					<div class="card-body space-y-3">
						{#if r.description}<p class="text-sm text-gray-700 whitespace-pre-line">{r.description}</p>{/if}
						{#if isVideo(r.file)}
							<!-- svelte-ignore a11y-media-has-caption -->
							<video
								class="w-full rounded-lg bg-black"
								controls
								preload="metadata"
								poster={r.poster ? `/training/media/${r.poster}` : undefined}
								src={`/training/media/${r.file}`}
							></video>
						{:else}
							<a class="btn-primary btn-sm" href={`/training/media/${r.file}`} target="_blank" rel="noopener">Open {r.file}</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
