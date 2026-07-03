<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;

	const osList = ['Windows', 'macOS', 'Linux'] as const;
	const osMeta: Record<string, { icon: string; note: string }> = {
		Windows: { icon: '🪟', note: 'Run the installer. If SmartScreen warns, click “More info → Run anyway”.' },
		macOS: { icon: '🍎', note: 'Open the .dmg and drag the app to Applications. Apple Silicon = M1/M2/M3; otherwise use Intel.' },
		Linux: { icon: '🐧', note: '.AppImage runs without installing (chmod +x, then run). .deb / .rpm install system-wide.' }
	};
</script>

<svelte:head><title>Get the App — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<div class="flex items-center gap-3 flex-wrap">
		<h1 class="text-2xl font-bold text-gray-900">Get the label app</h1>
		{#if data.version}
			<span class="badge-primary">v{data.version}</span>
		{/if}
	</div>
	<p class="text-gray-600 text-sm mt-1">
		Install the TeamTime Label app on your computer to create items and print barcode labels on a
		Zebra printer. Download the version for your operating system.
	</p>

	{#if data.count === 0}
		<div class="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-800 text-sm">
			No installers are available yet. Please check back shortly or contact staff.
		</div>
	{:else}
		<div class="mt-6 grid gap-4 md:grid-cols-3">
			{#each osList as os (os)}
				{#if data.byOs[os]?.length}
					<div class="rounded-lg border border-gray-200 bg-white p-4">
						<div class="flex items-center gap-2 mb-3">
							<span class="text-2xl leading-none">{osMeta[os].icon}</span>
							<h2 class="font-semibold text-gray-900">{os}</h2>
						</div>
						<div class="flex flex-col gap-2">
							{#each data.byOs[os] as item (item.file)}
								<a
									class="block rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-3 py-2 text-center"
									href={`/vendor/app/download/${encodeURIComponent(item.file)}`}
									download
								>
									{item.label}
									<span class="opacity-80">· {item.sizeMB} MB</span>
								</a>
							{/each}
						</div>
						<p class="text-xs text-gray-500 mt-3">{osMeta[os].note}</p>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-5">
		<h2 class="font-semibold text-gray-900">First-time setup</h2>
		<ol class="list-decimal list-inside text-sm text-gray-700 mt-2 space-y-1">
			<li>Install and open the app.</li>
			<li>Open <strong>Settings</strong> and confirm the server URL, then choose your printer —
				a <strong>network</strong> Zebra (its IP, port 9100) or an installed <strong>system</strong> printer.</li>
			<li>Click <strong>Test print</strong> to confirm the printer works.</li>
			<li>Sign in with your vendor email and password (the same ones you use here).</li>
			<li>Pick a <strong>label size</strong>, type a description and price, and hit
				<strong>Create &amp; Print</strong>.</li>
		</ol>
	</div>
</div>
