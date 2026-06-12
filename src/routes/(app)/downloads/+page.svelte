<script lang="ts">
	import {
		DESKTOP_LABEL_APP_VERSION,
		DESKTOP_LABEL_APP_DOWNLOADS
	} from '$lib/utils/desktop-label-app';
</script>

<svelte:head>
	<title>Downloads — TeamTime</title>
</svelte:head>

<div class="max-w-3xl mx-auto px-4 py-8">
	<h1 class="text-2xl font-bold text-gray-900">Downloads</h1>
	<p class="mt-1 text-sm text-gray-600">Desktop tools for TeamTime.</p>

	<section class="mt-6">
		<div class="card">
			<div class="card-header">
				<h2 class="font-semibold text-gray-900">
					🏷️ Yakima Label — desktop label printer
					<span class="badge-gray ml-2">v{DESKTOP_LABEL_APP_VERSION} · testing</span>
				</h2>
				<p class="text-xs text-gray-500 mt-1">
					Add items and print Zebra tags from your own computer. Vendors print their web-queued
					tags at home; managers run store mode to print any vendor's queue on a shared station.
				</p>
			</div>
			<div class="card-body space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					{#each Object.values(DESKTOP_LABEL_APP_DOWNLOADS) as build (build.url)}
						<div class="border border-gray-200 rounded-lg p-4">
							<div class="font-medium text-gray-900">{build.label}</div>
							<p class="text-xs text-gray-500 mt-1">{build.notes}</p>
							<a href={build.url} download class="btn btn-primary btn-sm mt-3 inline-block">
								⬇ Download
							</a>
						</div>
					{/each}
				</div>

				<div class="text-sm text-gray-700 space-y-2">
					<h3 class="font-semibold text-gray-900">Setup notes</h3>
					<ul class="list-disc pl-5 space-y-1">
						<li>Sign in with your TeamTime email and password.</li>
						<li>
							<strong>Windows:</strong> SmartScreen may warn because the app is unsigned — choose
							“More info → Run anyway”. The Zebra must be installed as a normal Windows printer
							(ZDesigner driver).
						</li>
						<li>
							<strong>Linux:</strong> after downloading, run
							<code class="font-mono text-xs">chmod +x</code> on the file. USB access needs a udev
							rule:
							<code class="font-mono text-xs block mt-1 bg-gray-50 p-2 rounded"
								>SUBSYSTEM=="usb", ATTRS{'{'}idVendor{'}'}=="0a5f", MODE="0660", GROUP="plugdev"</code
							>
							saved as <code class="font-mono text-xs">/etc/udev/rules.d/99-zebra.rules</code>, then
							reload udev and make sure your user is in the
							<code class="font-mono text-xs">plugdev</code> group.
						</li>
						<li>
							No printer attached? The app still works — tags stay queued and anything “printed”
							in dry-run mode is logged, so it's safe to explore.
						</li>
					</ul>
				</div>
			</div>
		</div>
	</section>
</div>
