<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: withdrawals = data.withdrawals;
	$: user = data.user;

	function getStatusColor(status: string) {
		switch (status) {
			case 'fully_spent': return 'badge-success';
			case 'partially_assigned': return 'badge-warning';
			default: return 'badge-gray';
		}
	}

	function formatCurrency(amount: string | number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));
	}

	function getTotalWithdrawn() {
		return withdrawals.reduce((sum, w) => sum + Number(w.amount), 0);
	}

	function countByStatus(status: string) {
		return withdrawals.filter(w => w.status === status).length;
	}
</script>

<svelte:head>
	<title>Expenses - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">Expenses</h1>
		<a href="/expenses/withdrawals/new" class="btn-primary">
			<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			Log Withdrawal
		</a>
	</div>

	<!-- Quick Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl font-bold text-gray-900">
					{formatCurrency(getTotalWithdrawn())}
				</p>
				<p class="text-sm text-gray-600">Total Withdrawn</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl font-bold text-green-600">
					{countByStatus('fully_spent')}
				</p>
				<p class="text-sm text-gray-600">Fully Accounted</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl font-bold text-yellow-600">
					{countByStatus('partially_assigned')}
				</p>
				<p class="text-sm text-gray-600">Partial</p>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<p class="text-2xl font-bold text-gray-600">
					{countByStatus('unassigned')}
				</p>
				<p class="text-sm text-gray-600">Unassigned</p>
			</div>
		</div>
	</div>

	<!-- Withdrawals List -->
	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold">ATM Withdrawals</h2>
		</div>
		<div class="divide-y">
			{#each withdrawals as withdrawal}
				<a href="/expenses/withdrawals/{withdrawal.id}" class="flex items-center justify-between p-4 hover:bg-gray-50">
					<div>
						<div class="font-semibold">{formatCurrency(withdrawal.amount)}</div>
						<div class="text-sm text-gray-600">
							{new Date(withdrawal.withdrawnAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
						</div>
						{#if withdrawal.address}
							<div class="text-xs text-gray-500">{withdrawal.address}</div>
						{/if}
					</div>
					<div class="flex items-center gap-2">
						<span class={getStatusColor(withdrawal.status)}>
							{withdrawal.status.replace('_', ' ')}
						</span>
						<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</div>
				</a>
			{:else}
				<div class="text-center py-12">
					<p class="text-gray-600">No withdrawals recorded</p>
					<a href="/expenses/withdrawals/new" class="btn-primary mt-4">Log Your First Withdrawal</a>
				</div>
			{/each}
		</div>
	</div>

	<!-- Purchase Requests Link -->
	<div class="mt-6">
		<a href="/purchase-requests" class="card block hover:shadow-md transition-shadow">
			<div class="card-body flex items-center justify-between">
				<div>
					<h3 class="font-semibold">Purchase Requests</h3>
					<p class="text-sm text-gray-600">View and manage purchase approval requests</p>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</div>
		</a>
	</div>
</div>
