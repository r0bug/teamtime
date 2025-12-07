<script lang="ts">
	export let data;

	function formatDate(date: string) {
		return new Date(date).toLocaleString();
	}

	function formatJson(obj: unknown) {
		if (!obj) return '-';
		try {
			return JSON.stringify(obj, null, 2);
		} catch {
			return String(obj);
		}
	}
</script>

<svelte:head>
	<title>Audit Logs - Admin</title>
</svelte:head>

<div class="p-4 lg:p-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Audit Logs</h1>
		<p class="text-gray-600">View all system activity and access logs</p>
	</div>

	<div class="bg-white rounded-xl shadow-sm border overflow-hidden">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Time
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							User
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Action
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Entity
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							IP Address
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Details
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each data.logs as log}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
								{formatDate(log.createdAt)}
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm">
								{#if log.userName}
									<span class="text-gray-900">{log.userName}</span>
									<span class="text-gray-500 text-xs block">{log.userEmail}</span>
								{:else}
									<span class="text-gray-400">System</span>
								{/if}
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm">
								<span class="px-2 py-1 rounded-full text-xs font-medium
									{log.action.includes('create') ? 'bg-green-100 text-green-800' : ''}
									{log.action.includes('update') ? 'bg-blue-100 text-blue-800' : ''}
									{log.action.includes('delete') ? 'bg-red-100 text-red-800' : ''}
									{log.action.includes('login') ? 'bg-purple-100 text-purple-800' : ''}
								">
									{log.action}
								</span>
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
								{log.entityType}
								{#if log.entityId}
									<span class="text-gray-400 text-xs">({log.entityId.slice(0, 8)}...)</span>
								{/if}
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
								{log.ipAddress || '-'}
							</td>
							<td class="px-4 py-3 text-sm">
								{#if log.beforeData || log.afterData}
									<details class="cursor-pointer">
										<summary class="text-blue-600 hover:text-blue-800">View changes</summary>
										<div class="mt-2 text-xs bg-gray-50 rounded p-2 max-w-md overflow-auto">
											{#if log.beforeData}
												<div class="mb-2">
													<span class="font-semibold text-red-600">Before:</span>
													<pre class="whitespace-pre-wrap">{formatJson(log.beforeData)}</pre>
												</div>
											{/if}
											{#if log.afterData}
												<div>
													<span class="font-semibold text-green-600">After:</span>
													<pre class="whitespace-pre-wrap">{formatJson(log.afterData)}</pre>
												</div>
											{/if}
										</div>
									</details>
								{:else}
									<span class="text-gray-400">-</span>
								{/if}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="px-4 py-8 text-center text-gray-500">
								No audit logs found
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		<div class="bg-gray-50 px-4 py-3 flex items-center justify-between border-t">
			<div class="flex gap-2">
				{#if data.page > 1}
					<a
						href="?page={data.page - 1}"
						class="px-3 py-1 bg-white border rounded hover:bg-gray-50"
					>
						Previous
					</a>
				{/if}
				<span class="px-3 py-1 text-gray-600">Page {data.page}</span>
				{#if data.logs.length === 50}
					<a
						href="?page={data.page + 1}"
						class="px-3 py-1 bg-white border rounded hover:bg-gray-50"
					>
						Next
					</a>
				{/if}
			</div>
		</div>
	</div>
</div>
