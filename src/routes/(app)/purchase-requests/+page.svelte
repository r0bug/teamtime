<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: requests = data.requests;
	$: isManager = data.isManager;

	let showCreateModal = false;
	let showDecideModal = false;
	let selectedRequest: typeof requests[0] | null = null;
	let loading = false;
	let statusFilter = 'all';

	$: filteredRequests = requests.filter(r => statusFilter === 'all' || r.status === statusFilter);

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'approved': return 'badge-success';
			case 'denied': return 'badge-danger';
			default: return 'badge-warning';
		}
	}

	function openDecideModal(request: typeof requests[0]) {
		selectedRequest = request;
		showDecideModal = true;
	}
</script>

<svelte:head>
	<title>Purchase Requests - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">Purchase Requests</h1>
		<button on:click={() => showCreateModal = true} class="btn-primary">
			New Request
		</button>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
			{form.created ? 'Request submitted successfully' : 'Decision saved'}
		</div>
	{/if}

	<!-- Filter -->
	<div class="mb-4">
		<select bind:value={statusFilter} class="input w-48">
			<option value="all">All Requests</option>
			<option value="pending">Pending</option>
			<option value="approved">Approved</option>
			<option value="denied">Denied</option>
		</select>
	</div>

	<!-- Requests List -->
	<div class="space-y-4">
		{#each filteredRequests as request}
			<div class="card">
				<div class="card-body">
					<div class="flex justify-between items-start">
						<div class="flex-1">
							<div class="flex items-center gap-3 mb-2">
								<span class={getStatusClass(request.status)}>{request.status}</span>
								<span class="text-lg font-semibold">${request.proposedPrice}</span>
							</div>
							<p class="font-medium">{request.description}</p>
							{#if request.sellerInfo}
								<p class="text-sm text-gray-600">Seller: {request.sellerInfo}</p>
							{/if}
							<div class="text-xs text-gray-500 mt-2">
								{#if isManager}
									Requested by {request.requesterName} on {formatDate(request.createdAt)}
								{:else}
									Submitted on {formatDate(request.createdAt)}
								{/if}
							</div>
							{#if request.decisionNotes}
								<div class="mt-2 p-2 bg-gray-50 rounded text-sm">
									<span class="font-medium">Decision notes:</span> {request.decisionNotes}
								</div>
							{/if}
						</div>
						{#if isManager && request.status === 'pending'}
							<button on:click={() => openDecideModal(request)} class="btn-ghost text-sm">
								Review
							</button>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="card">
				<div class="card-body text-center text-gray-500 py-8">
					No purchase requests found
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Create Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg max-w-md w-full p-6">
			<h3 class="text-lg font-semibold mb-4">New Purchase Request</h3>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showCreateModal = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="description" class="label">What do you need to purchase? *</label>
					<textarea
						id="description"
						name="description"
						rows="3"
						required
						class="input"
						placeholder="Describe the item/service..."
					></textarea>
				</div>

				<div>
					<label for="proposedPrice" class="label">Proposed Price *</label>
					<div class="relative">
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
						<input
							type="number"
							id="proposedPrice"
							name="proposedPrice"
							required
							step="0.01"
							min="0.01"
							class="input pl-8"
							placeholder="0.00"
						/>
					</div>
				</div>

				<div>
					<label for="sellerInfo" class="label">Seller/Vendor Info</label>
					<input
						type="text"
						id="sellerInfo"
						name="sellerInfo"
						class="input"
						placeholder="e.g., Amazon, local store..."
					/>
				</div>

				<div class="flex gap-4 pt-4">
					<button type="button" on:click={() => showCreateModal = false} class="btn-ghost flex-1">Cancel</button>
					<button type="submit" disabled={loading} class="btn-primary flex-1">
						{loading ? 'Submitting...' : 'Submit Request'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Decide Modal -->
{#if showDecideModal && selectedRequest}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg max-w-md w-full p-6">
			<h3 class="text-lg font-semibold mb-4">Review Request</h3>
			<div class="bg-gray-50 p-3 rounded-lg mb-4">
				<p class="font-medium">{selectedRequest.description}</p>
				<p class="text-lg font-semibold text-primary-600">${selectedRequest.proposedPrice}</p>
				{#if selectedRequest.sellerInfo}
					<p class="text-sm text-gray-600">Seller: {selectedRequest.sellerInfo}</p>
				{/if}
			</div>
			<form
				method="POST"
				action="?/decide"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showDecideModal = false;
						selectedRequest = null;
						await update();
					};
				}}
				class="space-y-4"
			>
				<input type="hidden" name="requestId" value={selectedRequest.id} />

				<div>
					<label for="decisionNotes" class="label">Notes (optional)</label>
					<textarea
						id="decisionNotes"
						name="decisionNotes"
						rows="2"
						class="input"
						placeholder="Any notes about your decision..."
					></textarea>
				</div>

				<div class="flex gap-4 pt-4">
					<button type="button" on:click={() => { showDecideModal = false; selectedRequest = null; }} class="btn-ghost flex-1">Cancel</button>
					<button type="submit" name="decision" value="denied" disabled={loading} class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex-1">
						Deny
					</button>
					<button type="submit" name="decision" value="approved" disabled={loading} class="btn-primary flex-1">
						Approve
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
