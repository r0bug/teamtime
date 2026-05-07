<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	export let form: ActionData;
</script>

<svelte:head><title>New Vendor - TeamTime Admin</title></svelte:head>

<div class="p-4 lg:p-8 max-w-3xl mx-auto">
	<a href="/admin/vendors" class="text-sm text-primary-600 hover:underline">← Back to vendors</a>
	<h1 class="text-2xl font-bold text-gray-900 mt-2">New Vendor</h1>

	{#if form?.error}
		<div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="mt-6 space-y-6">
		<div class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Identity</h2></div>
			<div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="md:col-span-2">
					<label class="label" for="displayName">Vendor name *</label>
					<input id="displayName" name="displayName" type="text" class="input" required placeholder="Acme Antiques" />
				</div>
				<div>
					<label class="label" for="nrsVendorId">NRS Vendor ID</label>
					<input id="nrsVendorId" name="nrsVendorId" type="number" class="input" placeholder="Optional — links to NRS sales" />
				</div>
				<div>
					<label class="label" for="status">Status</label>
					<select id="status" name="status" class="input">
						<option value="inactive">Inactive</option>
						<option value="active">Active</option>
						<option value="terminated">Terminated</option>
					</select>
				</div>
			</div>
		</div>

		<div class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Contact</h2></div>
			<div class="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label class="label" for="contactName">Contact name</label>
					<input id="contactName" name="contactName" type="text" class="input" />
				</div>
				<div>
					<label class="label" for="contactPhone">Phone</label>
					<input id="contactPhone" name="contactPhone" type="tel" class="input" />
				</div>
				<div class="md:col-span-2">
					<label class="label" for="contactEmail">Email</label>
					<input id="contactEmail" name="contactEmail" type="email" class="input" />
				</div>
				<div class="md:col-span-2">
					<label class="label" for="addressLine1">Address line 1</label>
					<input id="addressLine1" name="addressLine1" type="text" class="input" />
				</div>
				<div class="md:col-span-2">
					<label class="label" for="addressLine2">Address line 2</label>
					<input id="addressLine2" name="addressLine2" type="text" class="input" />
				</div>
				<div>
					<label class="label" for="city">City</label>
					<input id="city" name="city" type="text" class="input" />
				</div>
				<div>
					<label class="label" for="state">State</label>
					<input id="state" name="state" type="text" class="input" maxlength="2" />
				</div>
				<div>
					<label class="label" for="zip">ZIP</label>
					<input id="zip" name="zip" type="text" class="input" />
				</div>
			</div>
		</div>

		<div class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Contract terms</h2></div>
			<div class="card-body grid grid-cols-1 md:grid-cols-3 gap-4">
				<div>
					<label class="label" for="boothNumber">Booth #</label>
					<input id="boothNumber" name="boothNumber" type="text" class="input" />
				</div>
				<div>
					<label class="label" for="monthlyRentDollars">Monthly rent ($)</label>
					<input id="monthlyRentDollars" name="monthlyRentDollars" type="number" step="0.01" class="input" />
				</div>
				<div>
					<label class="label" for="maxDiscountPercent">Max discount (%)</label>
					<input id="maxDiscountPercent" name="maxDiscountPercent" type="number" step="0.01" class="input" />
				</div>
				<div>
					<label class="label" for="startDate">Start date</label>
					<input id="startDate" name="startDate" type="date" class="input" />
				</div>
				<div>
					<label class="label" for="endDate">End date</label>
					<input id="endDate" name="endDate" type="date" class="input" />
				</div>
			</div>
		</div>

		<div class="card">
			<div class="card-header"><h2 class="font-semibold text-gray-900">Notes</h2></div>
			<div class="card-body">
				<textarea name="notes" rows="3" class="input"></textarea>
			</div>
		</div>

		<div class="flex justify-end gap-2">
			<a href="/admin/vendors" class="btn btn-secondary">Cancel</a>
			<button type="submit" class="btn btn-primary">Create Vendor</button>
		</div>
	</form>
</div>
