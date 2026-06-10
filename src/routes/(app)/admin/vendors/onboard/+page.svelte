<script lang="ts">
	import { enhance } from '$app/forms';
	import { notify } from '$lib/notify';
	import type { PageData } from './$types';

	export let data: PageData;

	// Step 1 — vendor & contact
	let displayName = '';
	let contactName = '';
	let contactEmail = '';
	let contactPhone = '';
	let addressLine1 = '';
	let addressLine2 = '';
	let city = '';
	let state = 'WA';
	let zip = '';

	// Step 2 — booth & contract terms
	let boothNumber = '';
	let boothSizeSqft = '';
	let monthlyRent = '';
	let customCabinetRent = '';
	let standardDiscountPercent = '';
	let maxDiscountPercent = '';
	let preferredPayoutMethod = '';
	let startDate = '';
	let notes = '';

	let step = 1;
	let submitting = false;

	$: rentNum = parseFloat(monthlyRent) || 0;
	$: cabinetNum = parseFloat(customCabinetRent) || 0;
	$: stepOneValid = displayName.trim().length > 0;

	function next() {
		if (step === 1 && !stepOneValid) {
			notify.error('Vendor name is required');
			return;
		}
		step = Math.min(3, step + 1);
	}
	function back() {
		step = Math.max(1, step - 1);
	}

	const payoutMethods = ['Check', 'Direct deposit', 'Venmo', 'CashApp', 'PayPal'];
</script>

<svelte:head><title>Onboard vendor · TeamTime</title></svelte:head>

<div class="max-w-3xl mx-auto p-4">
	<div class="mb-4">
		<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Vendors</a>
		<h1 class="text-xl font-semibold text-gray-900 mt-1">Onboard a vendor</h1>
		<p class="text-sm text-gray-500">
			Collect the consignment details, generate the contract to print and sign, then a task
			walks you through adding the vendor in NRS.
		</p>
	</div>

	<!-- Stepper -->
	<ol class="flex items-center gap-2 mb-6 text-sm">
		{#each [{ n: 1, label: 'Vendor & contact' }, { n: 2, label: 'Booth & terms' }, { n: 3, label: 'Review' }] as s}
			<li class="flex items-center gap-2">
				<span
					class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
						{step >= s.n ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}"
				>{s.n}</span>
				<span class="{step === s.n ? 'font-semibold text-gray-900' : 'text-gray-500'}">{s.label}</span>
				{#if s.n < 3}<span class="text-gray-300 mx-1">—</span>{/if}
			</li>
		{/each}
	</ol>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			submitting = true;
			return async ({ update, result }) => {
				submitting = false;
				if (result.type === 'failure') {
					notify.error(String(result.data?.error ?? 'Failed to onboard vendor'));
				}
				await update();
			};
		}}
	>
		<!-- Step 1 -->
		<div class="card {step === 1 ? '' : 'hidden'}">
			<div class="card-header"><h2 class="font-semibold">Vendor &amp; contact</h2></div>
			<div class="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div class="sm:col-span-2">
					<label class="label" for="displayName">Vendor / business name *</label>
					<input id="displayName" name="displayName" class="input" bind:value={displayName} required />
				</div>
				<div>
					<label class="label" for="contactName">Contact name</label>
					<input id="contactName" name="contactName" class="input" bind:value={contactName} />
				</div>
				<div>
					<label class="label" for="contactPhone">Phone</label>
					<input id="contactPhone" name="contactPhone" class="input" bind:value={contactPhone} />
				</div>
				<div class="sm:col-span-2">
					<label class="label" for="contactEmail">Email</label>
					<input id="contactEmail" name="contactEmail" type="email" class="input" bind:value={contactEmail} />
				</div>
				<div class="sm:col-span-2">
					<label class="label" for="addressLine1">Address</label>
					<input id="addressLine1" name="addressLine1" class="input" bind:value={addressLine1} />
				</div>
				<div class="sm:col-span-2">
					<input name="addressLine2" class="input" placeholder="Address line 2 (optional)" bind:value={addressLine2} />
				</div>
				<div>
					<label class="label" for="city">City</label>
					<input id="city" name="city" class="input" bind:value={city} />
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="label" for="state">State</label>
						<input id="state" name="state" class="input" bind:value={state} />
					</div>
					<div>
						<label class="label" for="zip">Zip</label>
						<input id="zip" name="zip" class="input" bind:value={zip} />
					</div>
				</div>
			</div>
		</div>

		<!-- Step 2 -->
		<div class="card {step === 2 ? '' : 'hidden'}">
			<div class="card-header"><h2 class="font-semibold">Booth &amp; contract terms</h2></div>
			<div class="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label class="label" for="boothNumber">Booth number</label>
					<input id="boothNumber" name="boothNumber" class="input" bind:value={boothNumber} />
				</div>
				<div>
					<label class="label" for="boothSizeSqft">Booth size (sq ft)</label>
					<input id="boothSizeSqft" name="boothSizeSqft" type="number" min="0" class="input" bind:value={boothSizeSqft} />
				</div>
				<div>
					<label class="label" for="monthlyRent">Monthly rent ($)</label>
					<input id="monthlyRent" name="monthlyRent" type="number" min="0" step="0.01" class="input" bind:value={monthlyRent} placeholder="$1/sq ft/mo" />
				</div>
				<div>
					<label class="label" for="customCabinetRent">Custom cabinet rent ($/mo)</label>
					<input id="customCabinetRent" name="customCabinetRent" type="number" min="0" step="0.01" class="input" bind:value={customCabinetRent} />
				</div>
				<div>
					<label class="label" for="standardDiscountPercent">Standard discount (%)</label>
					<input id="standardDiscountPercent" name="standardDiscountPercent" type="number" min="0" max="100" class="input" bind:value={standardDiscountPercent} placeholder="0" />
				</div>
				<div>
					<label class="label" for="maxDiscountPercent">Max discount (%)</label>
					<input id="maxDiscountPercent" name="maxDiscountPercent" type="number" min="0" max="100" step="0.01" class="input" bind:value={maxDiscountPercent} />
				</div>
				<div>
					<label class="label" for="preferredPayoutMethod">Preferred payout method</label>
					<select id="preferredPayoutMethod" name="preferredPayoutMethod" class="input" bind:value={preferredPayoutMethod}>
						<option value="">— choose —</option>
						{#each payoutMethods as m}<option value={m}>{m}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for="startDate">Start date</label>
					<input id="startDate" name="startDate" type="date" class="input" bind:value={startDate} />
				</div>
				<div class="sm:col-span-2">
					<label class="label" for="notes">Notes</label>
					<textarea id="notes" name="notes" class="input" rows="2" bind:value={notes}></textarea>
				</div>
				<p class="sm:col-span-2 text-xs text-gray-500">
					Commission per the standard contract: {data.boothCommissionPercent}% on booth rentals,
					{data.individualCommissionPercent}% on individual items. Cash payout is not offered.
				</p>
			</div>
		</div>

		<!-- Step 3 — review -->
		<div class="card {step === 3 ? '' : 'hidden'}">
			<div class="card-header"><h2 class="font-semibold">Review the completed contract</h2></div>
			<div class="card-body space-y-4">
				<p class="text-sm text-gray-600">
					Confirm the details below. Creating the vendor records a Consignment Agreement with
					these terms (paper-original-on-file), opens an NRS data-entry task, then drops you on
					the vendor page where you can print the contract and upload the signed copy.
				</p>
				<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Vendor</dt><dd class="font-medium text-right">{displayName || '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Contact</dt><dd class="text-right">{contactName || '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Phone</dt><dd class="text-right">{contactPhone || '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Email</dt><dd class="text-right truncate">{contactEmail || '—'}</dd></div>
					<div class="flex justify-between border-b py-1 sm:col-span-2"><dt class="text-gray-500">Address</dt><dd class="text-right">{[addressLine1, addressLine2, city, state, zip].filter(Boolean).join(', ') || '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Booth</dt><dd class="text-right">{boothNumber || '—'}{boothSizeSqft ? ` · ${boothSizeSqft} sq ft` : ''}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Monthly rent</dt><dd class="text-right">{rentNum ? `$${rentNum.toFixed(2)}` : '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Cabinet rent</dt><dd class="text-right">{cabinetNum ? `$${cabinetNum.toFixed(2)}/mo` : '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Standard discount</dt><dd class="text-right">{standardDiscountPercent ? `${standardDiscountPercent}%` : '0%'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Max discount</dt><dd class="text-right">{maxDiscountPercent ? `${maxDiscountPercent}%` : '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Payout</dt><dd class="text-right">{preferredPayoutMethod || '—'}</dd></div>
					<div class="flex justify-between border-b py-1"><dt class="text-gray-500">Start date</dt><dd class="text-right">{startDate || '—'}</dd></div>
				</dl>
			</div>
		</div>

		<!-- Nav -->
		<div class="flex items-center justify-between mt-4">
			<button type="button" class="btn-secondary" on:click={back} disabled={step === 1}>Back</button>
			{#if step < 3}
				<button type="button" class="btn-primary" on:click={next}>Continue</button>
			{:else}
				<button type="submit" class="btn-primary" disabled={submitting || !stepOneValid}>
					{submitting ? 'Creating…' : 'Create vendor & contract'}
				</button>
			{/if}
		</div>
	</form>
</div>
