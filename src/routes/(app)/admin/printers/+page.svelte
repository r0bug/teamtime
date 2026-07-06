<script lang="ts">
	import { enhance } from '$app/forms';
	export let data;
	export let form;

	$: printers = data.printers;
	$: formats = data.formats;
	$: vendors = data.vendors;

	const KINDS = ['shop_network', 'kiosk', 'vendor_byo', 'checked_out'];
	// A printer with a shop network IP is a Shop printer (not loanable); USB = Loaner.
	const isShopPrinter = (addr: string | null | undefined) => /\d+\.\d+\.\d+\.\d+/.test(addr ?? '');
</script>

<svelte:head><title>Printers — TeamTime</title></svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">Printers</h1>
		<a href="/admin/label-formats" class="btn-secondary btn-sm">Label formats →</a>
	</div>
	<p class="mt-1 text-sm text-gray-600">
		The printer registry the label app reads. Each printer's <strong>DPI</strong> and
		<strong>loaded label</strong> drive how tags render and print.
	</p>

	{#if form?.error}
		<p class="badge-danger mt-3 inline-block">{form.error}</p>
	{:else if form?.success}
		<p class="badge-success mt-3 inline-block">Saved.</p>
	{/if}

	<!-- Add printer -->
	<details class="card mt-4">
		<summary class="card-header cursor-pointer font-semibold">➕ Add a printer</summary>
		<div class="card-body">
			<form method="POST" action="?/create" use:enhance class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<label class="label">Friendly name<input class="input" name="name" placeholder="Front Counter Zebra" required /></label>
				<label class="label">Kind
					<select class="input" name="kind">{#each KINDS as k}<option value={k}>{k}</option>{/each}</select>
				</label>
				<label class="label">Network address (host:port)<input class="input" name="networkAddress" placeholder="192.168.88.22:9100" /></label>
				<label class="label">Model<input class="input" name="model" placeholder="Z4MPlus" /></label>
				<label class="label">DPI<input class="input" name="dpi" type="number" min="50" max="1200" placeholder="300" /></label>
				<label class="label">Loaded label
					<select class="input" name="preferredFormatCode">
						<option value="">— none —</option>
						{#each formats as f}<option value={f.code}>{f.name}</option>{/each}
					</select>
				</label>
				<label class="label">Location<input class="input" name="location" placeholder="Shop floor" /></label>
				<label class="label flex items-center gap-2 mt-6"><input type="checkbox" name="active" checked /> Active</label>
				<div class="md:col-span-2"><button class="btn-primary" type="submit">Add printer</button></div>
			</form>
		</div>
	</details>

	<!-- Printer list -->
	<div class="mt-4 space-y-3">
		{#each printers as p (p.id)}
			<div class="card">
				<div class="card-header flex items-center justify-between">
					<div>
						<span class="font-semibold text-gray-900">{p.name}</span>
						{#if !p.active}<span class="badge-gray ml-2">inactive</span>{/if}
						{#if isShopPrinter(p.networkAddress)}<span class="badge-gray ml-2">🏪 Shop</span>{:else}<span class="badge-gray ml-2">🔄 Loaner</span>{/if}
						{#if p.assignedVendorName}<span class="badge-primary ml-2">checked out → {p.assignedVendorName}</span>{/if}
					</div>
					<div class="text-xs text-gray-500">
						{p.dpi ? p.dpi + 'dpi' : 'no dpi'} · {p.preferredFormatName ?? p.preferredFormatCode ?? 'no label'} · {p.networkAddress ?? 'no address'}
					</div>
				</div>
				<div class="card-body space-y-4">
					<!-- Edit -->
					<details>
						<summary class="cursor-pointer text-sm font-medium text-gray-700">Edit</summary>
						<form method="POST" action="?/update" use:enhance class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
							<input type="hidden" name="id" value={p.id} />
							<label class="label">Friendly name<input class="input" name="name" value={p.name} required /></label>
							<label class="label">Kind
								<select class="input" name="kind">{#each KINDS as k}<option value={k} selected={p.kind === k}>{k}</option>{/each}</select>
							</label>
							<label class="label">Network address<input class="input" name="networkAddress" value={p.networkAddress ?? ''} /></label>
							<label class="label">Model<input class="input" name="model" value={p.model ?? ''} /></label>
							<label class="label">DPI<input class="input" name="dpi" type="number" min="50" max="1200" value={p.dpi ?? ''} /></label>
							<label class="label">Loaded label
								<select class="input" name="preferredFormatCode">
									<option value="">— none —</option>
									{#each formats as f}<option value={f.code} selected={p.preferredFormatCode === f.code}>{f.name}</option>{/each}
								</select>
							</label>
							<label class="label">Location<input class="input" name="location" value={p.location ?? ''} /></label>
							<label class="label flex items-center gap-2 mt-6"><input type="checkbox" name="active" checked={p.active} /> Active</label>
							<div class="md:col-span-2"><button class="btn-primary btn-sm" type="submit">Save changes</button></div>
						</form>
					</details>

					<!-- Checkout / check-in -->
					{#if p.assignedVendorId}
						<form method="POST" action="?/checkin" use:enhance class="flex items-center gap-2">
							<input type="hidden" name="id" value={p.id} />
							<span class="text-sm text-gray-600">Checked out to <strong>{p.assignedVendorName}</strong></span>
							<button class="btn-secondary btn-sm" type="submit">Check in (return to pool)</button>
						</form>
					{:else if isShopPrinter(p.networkAddress)}
						<p class="text-sm text-gray-500">🏪 Shop printer — not loanable (network {p.networkAddress}).</p>
					{:else}
						<form method="POST" action="?/checkout" use:enhance class="flex flex-wrap items-end gap-2">
							<input type="hidden" name="id" value={p.id} />
							<label class="label">Loan out to vendor
								<select class="input" name="vendorId" required>
									<option value="">— pick vendor —</option>
									{#each vendors as v}<option value={v.id}>{v.name}</option>{/each}
								</select>
							</label>
							<label class="label">Loaded label
								<select class="input" name="loadedFormatCode" required>
									<option value="">— pick label —</option>
									{#each formats as f}<option value={f.code} selected={p.preferredFormatCode === f.code}>{f.name}</option>{/each}
								</select>
							</label>
							<button class="btn-secondary btn-sm" type="submit">Loan out</button>
						</form>
					{/if}
				</div>
			</div>
		{:else}
			<p class="text-sm text-gray-500">No printers yet — add one above.</p>
		{/each}
	</div>
</div>
