<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function getActionColor(action: string) {
		if (action.includes('create') || action.includes('insert')) return 'bg-green-100 text-green-800';
		if (action.includes('update') || action.includes('edit')) return 'bg-blue-100 text-blue-800';
		if (action.includes('delete') || action.includes('remove')) return 'bg-red-100 text-red-800';
		return 'bg-gray-100 text-gray-800';
	}

	function changePage(newPage: number) {
		goto('/admin/audit-logs?page=' + newPage);
	}
</script>

<svelte:head>
	<title>Audit Logs - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Audit Logs</h1>
		<p class="text-gray-600 mt-1">View system activity and changes</p>
	</div>

	<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
		<p class="text-sm text-yellow-800">
			<strong>Admin Only:</strong> This page shows all system activities including logins, data changes, and security events.
		</p>
	</div>

	<div class="card">
		<div class="card-header flex justify-between items-center">
			<h2 class="font-semibold">Activity Log</h2>
			<span class="text-sm text-gray-500">{data.totalCount} total entries</span>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if data.logs.length === 0}
						<tr>
							<td colspan="6" class="px-4 py-8 text-center text-gray-500">
								No audit logs found
							</td>
						</tr>
					{:else}
						{#each data.logs as log}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{formatDate(log.createdAt)}
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
									{#if log.userName}
										<div class="text-sm font-medium text-gray-900">{log.userName}</div>
										<div class="text-xs text-gray-500">{log.userEmail}</div>
									{:else}
										<span class="text-gray-400">System</span>
									{/if}
								</td>
								<td class="px-4 py-3 whitespace-nowrap">
									<span class="px-2 py-1 text-xs font-medium rounded-full {getActionColor(log.action)}">
										{log.action}
									</span>
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									<div>{log.entityType}</div>
									{#if log.entityId}
										<div class="text-xs text-gray-400 font-mono">{log.entityId.substring(0, 8)}...</div>
									{/if}
								</td>
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-mono">
									{log.ipAddress || '-'}
								</td>
								<td class="px-4 py-3 text-sm text-gray-600">
									{#if log.beforeData || log.afterData}
										<button class="text-primary-600 hover:text-primary-700 text-xs">
											View Changes
										</button>
									{:else}
										-
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if data.totalPages > 1}
			<div class="card-footer flex items-center justify-between">
				<div class="text-sm text-gray-500">
					Page {data.page} of {data.totalPages}
				</div>
				<div class="flex space-x-2">
					<button
						on:click={() => changePage(data.page - 1)}
						disabled={data.page <= 1}
						class="btn-secondary text-sm disabled:opacity-50"
					>
						Previous
					</button>
					<button
						on:click={() => changePage(data.page + 1)}
						disabled={data.page >= data.totalPages}
						class="btn-secondary text-sm disabled:opacity-50"
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
