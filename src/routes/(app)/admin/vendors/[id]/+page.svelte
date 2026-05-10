<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import SignatureCapture from '$lib/components/SignatureCapture.svelte';
	import SalesOverTimeChart from '$lib/components/SalesOverTimeChart.svelte';
	import TopItemsBarChart from '$lib/components/TopItemsBarChart.svelte';

	export let data: PageData;
	export let form: ActionData;

	type Tab = 'overview' | 'agreements' | 'sales' | 'notes';
	let tab: Tab = 'overview';

	const tabDefs: { id: Tab; label: string }[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'agreements', label: 'Agreements' },
		{ id: 'sales', label: 'Sales & Performance' },
		{ id: 'notes', label: 'Notes' }
	];

	const rangeDefs: { id: '7d' | '30d' | '90d' | 'ytd'; label: string }[] = [
		{ id: '7d', label: '7 days' },
		{ id: '30d', label: '30 days' },
		{ id: '90d', label: '90 days' },
		{ id: 'ytd', label: 'YTD' }
	];

	$: signedCount = data.agreements.filter((a) => a.status === 'signed').length;

	// ── Overview form state ────────────────────────────────────────
	let monthlyRentDollars = data.vendor.monthlyRentCents !== null ? (data.vendor.monthlyRentCents / 100).toFixed(2) : '';

	// ── Onboarding form state ──────────────────────────────────────
	let inventoryCodePrefix = data.vendor.inventoryCodePrefix ?? '';
	let selectedGroupIds = new Set(data.vendorGroupIds);
	function toggleGroup(id: string) {
		if (selectedGroupIds.has(id)) selectedGroupIds.delete(id);
		else selectedGroupIds.add(id);
		selectedGroupIds = new Set(selectedGroupIds);
	}

	// ── Portal section state ──────────────────────────────────────
	let portalEmail = data.vendor.contactEmail ?? '';
	let portalContactName = data.vendor.contactName ?? data.vendor.displayName;
	let portalPassword = '';
	let resetPasswordValue = '';

	// ── Signature modal state ─────────────────────────────────────
	let signOpen = false;
	let signTemplateId = '';
	let signedByName = '';
	let paperOriginal = false;
	let signatureRef: SignatureCapture | null = null;
	let signatureNonEmpty = false;
	let extraValues: Record<string, string> = {};

	$: selectedTemplate = data.availableTemplates.find((t) => t.id === signTemplateId) ?? null;

	function openSignModal(initialTemplateId?: string) {
		signTemplateId = initialTemplateId ?? data.availableTemplates[0]?.id ?? '';
		signedByName = data.vendor.contactName ?? data.vendor.displayName;
		paperOriginal = false;
		extraValues = {};
		signatureNonEmpty = false;
		signOpen = true;
	}

	function closeSignModal() {
		signOpen = false;
		signatureRef?.clear();
	}

	const onSignSubmit: SubmitFunction = ({ formData, cancel }) => {
		if (!paperOriginal) {
			const url = signatureRef?.toDataUrl();
			if (!url) {
				alert('Please capture a signature, or check "paper original on file".');
				cancel();
				return;
			}
			formData.set('signatureDataUrl', url);
		}
		formData.set('paperOriginalOnFile', paperOriginal ? 'true' : 'false');
		return ({ result, update }) => {
			update();
			if (result.type === 'success') {
				closeSignModal();
			}
		};
	};

	// ── Sales tab state ───────────────────────────────────────────
	type Range = '7d' | '30d' | '90d' | 'ytd';
	let salesRange: Range = '30d';
	let salesLoading = false;
	let salesError = '';
	let salesSummary: {
		totalGross: number;
		totalVendor: number;
		totalRetained: number;
		transactionCount: number;
		avgTransaction: number;
	} | null = null;
	let salesByDay: { date: string; total: number }[] = [];
	let topItems: { label: string; value: number }[] = [];
	let priorTotalGross: number | null = null;

	function dateRange(range: Range): { start: string; end: string; priorStart: string; priorEnd: string } {
		const today = new Date();
		const end = today.toISOString().slice(0, 10);
		const start = new Date(today);
		const ytd = new Date(today.getUTCFullYear(), 0, 1);
		switch (range) {
			case '7d': start.setUTCDate(start.getUTCDate() - 6); break;
			case '30d': start.setUTCDate(start.getUTCDate() - 29); break;
			case '90d': start.setUTCDate(start.getUTCDate() - 89); break;
			case 'ytd': start.setTime(ytd.getTime()); break;
		}
		const startStr = start.toISOString().slice(0, 10);

		// prior period of same length immediately before start
		const lengthMs = today.getTime() - start.getTime();
		const priorEndDt = new Date(start.getTime() - 24 * 60 * 60 * 1000);
		const priorStartDt = new Date(priorEndDt.getTime() - lengthMs);
		return {
			start: startStr,
			end,
			priorStart: priorStartDt.toISOString().slice(0, 10),
			priorEnd: priorEndDt.toISOString().slice(0, 10)
		};
	}

	async function loadSales() {
		if (!data.vendor.nrsVendorId) return;
		salesLoading = true;
		salesError = '';
		try {
			const r = dateRange(salesRange);
			const [cur, prior] = await Promise.all([
				fetch(`/api/vendors/${data.vendor.id}/nrs-sales?start=${r.start}&end=${r.end}`).then((res) => res.json()),
				fetch(`/api/vendors/${data.vendor.id}/nrs-sales?start=${r.priorStart}&end=${r.priorEnd}`).then((res) => res.json())
			]);
			if (cur.message) throw new Error(cur.message);

			salesSummary = cur.summary;
			priorTotalGross = prior.summary?.totalGross ?? 0;

			// Bucket by day
			const byDay = new Map<string, number>();
			for (let d = new Date(r.start); d <= new Date(r.end); d.setUTCDate(d.getUTCDate() + 1)) {
				byDay.set(d.toISOString().slice(0, 10), 0);
			}
			for (const rec of cur.records as Array<{ invoiceDate: string; totalPrice: number }>) {
				const k = rec.invoiceDate.slice(0, 10);
				byDay.set(k, (byDay.get(k) ?? 0) + (rec.totalPrice ?? 0));
			}
			salesByDay = Array.from(byDay.entries()).map(([date, total]) => ({ date, total }));

			// Top items by gross
			const byItem = new Map<string, number>();
			for (const rec of cur.records as Array<{ partName: string | null; itemDescription: string; totalPrice: number }>) {
				const label = rec.partName || rec.itemDescription || 'Unnamed';
				byItem.set(label, (byItem.get(label) ?? 0) + (rec.totalPrice ?? 0));
			}
			topItems = Array.from(byItem.entries()).map(([label, value]) => ({ label, value }));
		} catch (err) {
			salesError = err instanceof Error ? err.message : 'Failed to load sales';
		} finally {
			salesLoading = false;
		}
	}

	$: if (tab === 'sales' && data.vendor.nrsVendorId) {
		// reload on range change
		loadSales();
	}

	$: deltaPercent = (() => {
		if (priorTotalGross === null || !salesSummary) return null;
		if (priorTotalGross === 0) return salesSummary.totalGross > 0 ? 100 : 0;
		return ((salesSummary.totalGross - priorTotalGross) / priorTotalGross) * 100;
	})();

	function formatCurrency(n: number): string {
		return `$${n.toFixed(2)}`;
	}
</script>

<svelte:head><title>{data.vendor.displayName} - TeamTime Vendors</title></svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<div class="mt-2 flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">{data.vendor.displayName}</h1>
			<p class="text-sm text-gray-600 mt-1">
				{#if data.vendor.boothNumber}Booth {data.vendor.boothNumber} · {/if}
				{#if data.vendor.nrsVendorId}NRS #{data.vendor.nrsVendorId} · {/if}
				<span class="text-xs px-2 py-0.5 rounded-full {data.vendor.status === 'active' ? 'bg-green-100 text-green-700' : data.vendor.status === 'inactive' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}">{data.vendor.status}</span>
			</p>
		</div>
		<div class="flex gap-2">
			<a href={`/admin/vendors/${data.vendor.id}/tags`} class="btn btn-secondary">🏷 Tag Designer</a>
			<button class="btn btn-primary" on:click={() => openSignModal()} disabled={data.availableTemplates.length === 0}>
				+ Capture Signature
			</button>
		</div>
	</div>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}
	{#if form && 'success' in form && form.success === 'updateTerms'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">Vendor updated.</div>
	{/if}
	{#if form && 'success' in form && form.success === 'signAgreement'}
		<div class="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">Agreement signed.</div>
	{/if}

	<!-- Tabs -->
	<div class="mt-6 border-b border-gray-200">
		<nav class="flex gap-6 -mb-px text-sm">
			{#each tabDefs as t}
				<button class="py-3 border-b-2 {tab === t.id ? 'border-primary-600 text-primary-600 font-semibold' : 'border-transparent text-gray-600'}" on:click={() => (tab = t.id)}>
					{t.label}{t.id === 'agreements' ? ` (${signedCount})` : ''}
				</button>
			{/each}
		</nav>
	</div>

	<!-- OVERVIEW -->
	{#if tab === 'overview'}
		<form method="POST" action="?/updateTerms" use:enhance class="mt-6 space-y-6">
			<div class="card">
				<div class="card-header"><h2 class="font-semibold text-gray-900">Identity & Contact</h2></div>
				<div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="md:col-span-2">
						<label class="label" for="displayName">Display name</label>
						<input id="displayName" name="displayName" type="text" class="input" value={data.vendor.displayName} required />
					</div>
					<div>
						<label class="label" for="contactName">Contact name</label>
						<input id="contactName" name="contactName" type="text" class="input" value={data.vendor.contactName ?? ''} />
					</div>
					<div>
						<label class="label" for="contactPhone">Phone</label>
						<input id="contactPhone" name="contactPhone" type="tel" class="input" value={data.vendor.contactPhone ?? ''} />
					</div>
					<div class="md:col-span-2">
						<label class="label" for="contactEmail">Email</label>
						<input id="contactEmail" name="contactEmail" type="email" class="input" value={data.vendor.contactEmail ?? ''} />
					</div>
					<div class="md:col-span-2">
						<label class="label" for="addressLine1">Address line 1</label>
						<input id="addressLine1" name="addressLine1" type="text" class="input" value={data.vendor.addressLine1 ?? ''} />
					</div>
					<div class="md:col-span-2">
						<label class="label" for="addressLine2">Address line 2</label>
						<input id="addressLine2" name="addressLine2" type="text" class="input" value={data.vendor.addressLine2 ?? ''} />
					</div>
					<div>
						<label class="label" for="city">City</label>
						<input id="city" name="city" type="text" class="input" value={data.vendor.city ?? ''} />
					</div>
					<div>
						<label class="label" for="state">State</label>
						<input id="state" name="state" type="text" class="input" value={data.vendor.state ?? ''} maxlength="2" />
					</div>
					<div>
						<label class="label" for="zip">ZIP</label>
						<input id="zip" name="zip" type="text" class="input" value={data.vendor.zip ?? ''} />
					</div>
					<div>
						<label class="label" for="nrsVendorId">NRS Vendor ID</label>
						<input id="nrsVendorId" name="nrsVendorId" type="number" class="input" value={data.vendor.nrsVendorId ?? ''} />
					</div>
				</div>
			</div>

			<div class="card">
				<div class="card-header"><h2 class="font-semibold text-gray-900">Contract terms</h2></div>
				<div class="card-body grid grid-cols-1 md:grid-cols-3 gap-4">
					<div>
						<label class="label" for="boothNumber">Booth #</label>
						<input id="boothNumber" name="boothNumber" type="text" class="input" value={data.vendor.boothNumber ?? ''} />
					</div>
					<div>
						<label class="label" for="monthlyRentDollars">Monthly rent ($)</label>
						<input id="monthlyRentDollars" name="monthlyRentDollars" type="number" step="0.01" class="input" bind:value={monthlyRentDollars} />
					</div>
					<div>
						<label class="label" for="maxDiscountPercent">Max discount (%)</label>
						<input id="maxDiscountPercent" name="maxDiscountPercent" type="number" step="0.01" class="input" value={data.vendor.maxDiscountPercent ?? ''} />
					</div>
					<div>
						<label class="label" for="vendorPaymentPercent">Vendor payment % (NRS)</label>
						<input id="vendorPaymentPercent" name="vendorPaymentPercent" type="number" step="0.01" class="input" value={data.vendor.vendorPaymentPercent ?? ''} placeholder="e.g. 87.00" />
						<p class="text-xs text-gray-500 mt-1">% the vendor receives. Shop's commission = 100 − this.</p>
					</div>
					<div>
						<label class="label" for="status">Status</label>
						<select id="status" name="status" class="input" value={data.vendor.status}>
							<option value="inactive">Inactive</option>
							<option value="active">Active</option>
							<option value="terminated">Terminated</option>
						</select>
					</div>
					<div>
						<label class="label" for="startDate">Start date</label>
						<input id="startDate" name="startDate" type="date" class="input" value={data.vendor.startDate ?? ''} />
					</div>
					<div>
						<label class="label" for="endDate">End date</label>
						<input id="endDate" name="endDate" type="date" class="input" value={data.vendor.endDate ?? ''} />
					</div>
				</div>
			</div>

			<div class="card">
				<div class="card-header"><h2 class="font-semibold text-gray-900">Notes</h2></div>
				<div class="card-body">
					<textarea name="notes" rows="3" class="input">{data.vendor.notes ?? ''}</textarea>
				</div>
			</div>

			<div class="flex justify-end">
				<button type="submit" class="btn btn-primary">Save Changes</button>
			</div>
		</form>

		<!-- Onboarding & Portal -->
		<form method="POST" action="?/updateOnboarding" use:enhance class="mt-6 space-y-4" id="portal-section">
			<div class="card">
				<div class="card-header">
					<h2 class="font-semibold text-gray-900">Onboarding</h2>
					<p class="text-xs text-gray-500 mt-1">Inventory code prefix and reporting group memberships.</p>
				</div>
				<div class="card-body space-y-4">
					<div>
						<label class="label" for="inventoryCodePrefix">Inventory code prefix (NRS)</label>
						<input
							id="inventoryCodePrefix"
							name="inventoryCodePrefix"
							type="text"
							class="input font-mono uppercase max-w-xs"
							maxlength="8"
							pattern={'[A-Za-z0-9]{2,6}'}
							placeholder="SR"
							bind:value={inventoryCodePrefix}
						/>
						<p class="text-xs text-gray-500 mt-1">2–6 letters or digits. All this vendor's NRS item codes start with this (e.g. <code>SR</code> → <code>SR00212</code>).</p>
					</div>

					<div>
						<label class="label">Reporting groups</label>
						{#if data.allGroups.length === 0}
							<p class="text-sm text-gray-500">No groups yet. <a class="text-primary-600 hover:underline" href="/admin/vendor-groups">Create one →</a></p>
						{:else}
							<div class="flex flex-wrap gap-2">
								{#each data.allGroups as g (g.id)}
									{@const checked = selectedGroupIds.has(g.id)}
									<label
										class="inline-flex items-center gap-2 px-3 py-1 rounded-full border cursor-pointer text-sm"
										style={checked ? `background:${g.color}; border-color:${g.color}; color:white;` : ''}
									>
										<input
											type="checkbox"
											name="groupId"
											value={g.id}
											checked={checked}
											on:change={() => toggleGroup(g.id)}
											class="hidden"
										/>
										{g.name}
									</label>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div class="card-body border-t border-gray-100 flex justify-end">
					<button type="submit" class="btn btn-primary">Save Onboarding</button>
				</div>
			</div>
		</form>

		<div class="card mt-4">
			<div class="card-header">
				<h2 class="font-semibold text-gray-900">Portal Access</h2>
				<p class="text-xs text-gray-500 mt-1">Lets the vendor sign in at <code>/login</code> with email + password to manage their NRS inventory.</p>
			</div>
			<div class="card-body space-y-4">
				{#if data.vendor.portalEnabled && data.vendor.userId}
					<div class="p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
						Portal access is <strong>enabled</strong>. Linked to user <code>{data.vendor.userId}</code>.
					</div>

					<form method="POST" action="?/resetPortalPassword" use:enhance class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
						<div class="md:col-span-2">
							<label class="label" for="resetPassword">New password</label>
							<input id="resetPassword" name="password" type="password" class="input" minlength="8" bind:value={resetPasswordValue} required />
						</div>
						<button type="submit" class="btn btn-secondary">Reset password</button>
					</form>

					<form method="POST" action="?/disablePortal" use:enhance>
						<button type="submit" class="btn btn-danger text-sm">Disable portal access</button>
						<span class="text-xs text-gray-500 ml-2">Deactivates the vendor's user account.</span>
					</form>
				{:else}
					<form method="POST" action="?/enablePortal" use:enhance class="space-y-4">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label class="label" for="portalEmail">Login email</label>
								<input id="portalEmail" name="email" type="email" class="input" required bind:value={portalEmail} />
							</div>
							<div>
								<label class="label" for="portalContactName">Contact name (account name)</label>
								<input id="portalContactName" name="contactName" type="text" class="input" required bind:value={portalContactName} />
							</div>
							<div class="md:col-span-2">
								<label class="label" for="portalPassword">Initial password</label>
								<input id="portalPassword" name="password" type="password" class="input" minlength="8" required bind:value={portalPassword} />
								<p class="text-xs text-gray-500 mt-1">Vendor signs in with this. They can change it from their portal profile.</p>
							</div>
						</div>
						<div class="flex justify-end">
							<button type="submit" class="btn btn-primary">Enable Portal Access</button>
						</div>
					</form>
				{/if}
			</div>
		</div>

		<form method="POST" action="?/markOnboardingComplete" use:enhance class="mt-4 flex items-center justify-between">
			<p class="text-sm text-gray-600">
				Onboarding status: <strong>{data.vendor.onboardingComplete ? 'complete' : 'in progress'}</strong>
			</p>
			<input type="hidden" name="complete" value={data.vendor.onboardingComplete ? 'false' : 'true'} />
			<button type="submit" class="btn btn-secondary text-sm">
				{data.vendor.onboardingComplete ? 'Reopen onboarding' : 'Mark onboarding complete'}
			</button>
		</form>
	{/if}

	<!-- AGREEMENTS -->
	{#if tab === 'agreements'}
		<div class="mt-6 space-y-4">
			{#each data.agreements.filter((a) => a.status === 'signed') as a (a.id)}
				<div class="card">
					<div class="card-header flex items-center justify-between">
						<div>
							<h3 class="font-semibold text-gray-900">{a.template.title}</h3>
							<p class="text-xs text-gray-500">
								{a.template.kind} · v{a.templateVersion} · signed {new Date(a.signedAt).toLocaleDateString()} by {a.signedByName}
							</p>
						</div>
						{#if a.paperOriginalOnFile}
							<span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">paper original on file</span>
						{/if}
					</div>
					<div class="card-body">
						{#if a.signatureDataUrl}
							<img src={a.signatureDataUrl} alt="Signature" class="border rounded bg-white max-h-32" />
						{/if}
						<details class="mt-3">
							<summary class="text-sm text-primary-600 cursor-pointer">View body & terms snapshot</summary>
							<div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
								<pre class="whitespace-pre-wrap bg-gray-50 p-3 rounded border text-xs font-mono max-h-64 overflow-auto">{a.bodySnapshot}</pre>
								<div class="bg-gray-50 p-3 rounded border text-xs">
									<div><strong>Booth:</strong> {a.termsSnapshot.boothNumber ?? '—'}</div>
									<div><strong>Monthly rent:</strong> {a.termsSnapshot.monthlyRentCents !== null ? `$${((a.termsSnapshot.monthlyRentCents ?? 0) / 100).toFixed(2)}` : '—'}</div>
									<div><strong>Max discount:</strong> {a.termsSnapshot.maxDiscountPercent ?? '—'}{a.termsSnapshot.maxDiscountPercent ? '%' : ''}</div>
									{#if a.termsSnapshot.extraFieldValues}
										<div class="mt-2 pt-2 border-t border-gray-200">
											{#each Object.entries(a.termsSnapshot.extraFieldValues) as [k, v]}
												<div><strong>{k}:</strong> {v}</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</details>
					</div>
				</div>
			{:else}
				<div class="card"><div class="card-body text-sm text-gray-500">No signed agreements yet.</div></div>
			{/each}

			{#if data.agreements.some((a) => a.status === 'voided')}
				<details class="mt-6">
					<summary class="text-sm text-gray-600 cursor-pointer">Voided / superseded ({data.agreements.filter((a) => a.status === 'voided').length})</summary>
					<div class="mt-2 space-y-2">
						{#each data.agreements.filter((a) => a.status === 'voided') as a (a.id)}
							<div class="card opacity-75">
								<div class="card-body text-sm">
									<div class="flex items-center justify-between">
										<span>{a.template.title} <span class="text-xs text-gray-400">v{a.templateVersion}</span></span>
										<span class="text-xs text-gray-500">{a.voidedReason} · {a.voidedAt ? new Date(a.voidedAt).toLocaleDateString() : ''}</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</details>
			{/if}
		</div>
	{/if}

	<!-- SALES & PERFORMANCE -->
	{#if tab === 'sales'}
		<div class="mt-6 space-y-4">
			{#if !data.vendor.nrsVendorId}
				<div class="card"><div class="card-body text-sm text-gray-500">
					This vendor isn't linked to NRS yet. Add an NRS Vendor ID on the Overview tab to see live sales.
				</div></div>
			{:else}
				<div class="flex items-center gap-2">
					{#each rangeDefs as r}
						<button class="px-3 py-1 text-sm rounded border {salesRange === r.id ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}" on:click={() => (salesRange = r.id)}>
							{r.label}
						</button>
					{/each}
				</div>

				{#if salesError}
					<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{salesError}</div>
				{/if}

				{#if salesLoading}
					<div class="card"><div class="card-body text-sm text-gray-500">Loading from NRS…</div></div>
				{:else if salesSummary}
					<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
						<div class="card"><div class="card-body text-center">
							<div class="text-2xl font-bold text-gray-900">{formatCurrency(salesSummary.totalGross)}</div>
							<div class="text-xs text-gray-600">Gross</div>
							{#if deltaPercent !== null}
								<div class="text-xs mt-1 {deltaPercent >= 0 ? 'text-green-600' : 'text-red-600'}">
									{deltaPercent >= 0 ? '↑' : '↓'} {Math.abs(deltaPercent).toFixed(1)}% vs prior
								</div>
							{/if}
						</div></div>
						<div class="card"><div class="card-body text-center">
							<div class="text-2xl font-bold text-emerald-600">{formatCurrency(salesSummary.totalVendor)}</div>
							<div class="text-xs text-gray-600">Vendor portion</div>
						</div></div>
						<div class="card"><div class="card-body text-center">
							<div class="text-2xl font-bold text-blue-600">{formatCurrency(salesSummary.totalRetained)}</div>
							<div class="text-xs text-gray-600">Retained</div>
						</div></div>
						<div class="card"><div class="card-body text-center">
							<div class="text-2xl font-bold text-gray-900">{salesSummary.transactionCount}</div>
							<div class="text-xs text-gray-600">Transactions</div>
						</div></div>
						<div class="card"><div class="card-body text-center">
							<div class="text-2xl font-bold text-gray-900">{formatCurrency(salesSummary.avgTransaction)}</div>
							<div class="text-xs text-gray-600">Avg transaction</div>
						</div></div>
					</div>

					<div class="card">
						<div class="card-header"><h3 class="font-semibold text-gray-900">Sales over time</h3></div>
						<div class="card-body">
							<SalesOverTimeChart data={salesByDay} />
						</div>
					</div>

					<div class="card">
						<div class="card-header"><h3 class="font-semibold text-gray-900">Top items by revenue</h3></div>
						<div class="card-body">
							<TopItemsBarChart items={topItems} />
						</div>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- NOTES -->
	{#if tab === 'notes'}
		<div class="mt-6">
			<div class="card">
				<div class="card-body">
					{#if data.vendor.notes}
						<p class="text-sm text-gray-700 whitespace-pre-wrap">{data.vendor.notes}</p>
					{:else}
						<p class="text-sm text-gray-500">No notes. Edit on the Overview tab.</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- SIGNATURE MODAL -->
{#if signOpen}
	<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
		<div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
			<div class="p-4 border-b border-gray-200 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Sign Agreement</h2>
				<button class="text-gray-400 hover:text-gray-600 text-2xl leading-none" on:click={closeSignModal}>×</button>
			</div>
			<form method="POST" action="?/signAgreement" use:enhance={onSignSubmit} class="p-4 space-y-4">
				{#if data.availableTemplates.length === 0}
					<p class="text-sm text-gray-500">All active templates are already signed for this vendor.</p>
				{:else}
					<div>
						<label class="label" for="templateId">Agreement</label>
						<select id="templateId" name="templateId" class="input" bind:value={signTemplateId} required>
							{#each data.availableTemplates as t (t.id)}
								<option value={t.id}>{t.title} ({t.kind})</option>
							{/each}
						</select>
					</div>

					{#if selectedTemplate}
						<div>
							<label class="label">Terms</label>
							<div class="bg-gray-50 border rounded p-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs font-mono">{selectedTemplate.bodyMarkdown}</div>
							<p class="text-xs text-gray-500 mt-1">Signed against: rent ${monthlyRentDollars || '0.00'}/mo · max discount {data.vendor.maxDiscountPercent ?? '—'}% · booth {data.vendor.boothNumber ?? '—'}</p>
						</div>

						{#if selectedTemplate.extraFieldsSchema && selectedTemplate.extraFieldsSchema.length > 0}
							<div class="space-y-2">
								<label class="label">Additional fields</label>
								{#each selectedTemplate.extraFieldsSchema as f}
									<div>
										<label class="text-xs text-gray-600" for={`extra_${f.key}`}>{f.label}{f.required ? ' *' : ''}</label>
										{#if f.type === 'currency' || f.type === 'number'}
											<input
												id={`extra_${f.key}`}
												name={`extra_field_${f.key}`}
												type="number"
												step={f.type === 'currency' ? '0.01' : 'any'}
												required={f.required}
												class="input"
												bind:value={extraValues[f.key]}
											/>
										{:else}
											<input
												id={`extra_${f.key}`}
												name={`extra_field_${f.key}`}
												type="text"
												required={f.required}
												class="input"
												bind:value={extraValues[f.key]}
											/>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					{/if}

					<div>
						<label class="label" for="signedByName">Signed by (printed name)</label>
						<input id="signedByName" name="signedByName" type="text" class="input" bind:value={signedByName} required />
					</div>

					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={paperOriginal} />
						Paper original on file (no on-screen signature)
					</label>

					{#if !paperOriginal}
						<div>
							<label class="label">Signature</label>
							<SignatureCapture bind:this={signatureRef} on:change={(e) => (signatureNonEmpty = !e.detail.isEmpty)} />
							<button type="button" class="text-xs text-gray-600 mt-1" on:click={() => signatureRef?.clear()}>Clear</button>
						</div>
					{/if}

					<div class="flex justify-end gap-2 pt-2 border-t border-gray-200">
						<button type="button" class="btn btn-secondary" on:click={closeSignModal}>Cancel</button>
						<button type="submit" class="btn btn-primary" disabled={!paperOriginal && !signatureNonEmpty}>Sign Agreement</button>
					</div>
				{/if}
			</form>
		</div>
	</div>
{/if}
