<script lang="ts">
	export let data;

	function formatDate(date: string) {
		return new Date(date).toLocaleString();
	}

	function truncate(text: string, length: number = 100) {
		if (!text) return '';
		return text.length > length ? text.slice(0, length) + '...' : text;
	}
</script>

<svelte:head>
	<title>All Communications - Admin</title>
</svelte:head>

<div class="p-4 lg:p-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">All Communications</h1>
		<p class="text-gray-600">View all conversations and messages across the system</p>
	</div>

	<div class="bg-white rounded-xl shadow-sm border overflow-hidden">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Conversation
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Participants
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Messages
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Last Message
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Last Activity
						</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each data.conversations as conv}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3">
								<div class="flex items-center gap-2">
									<span class="px-2 py-0.5 text-xs rounded-full
										{conv.type === 'broadcast' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}
									">
										{conv.type}
									</span>
									<span class="text-sm font-medium text-gray-900">
										{conv.title || 'Direct Message'}
									</span>
								</div>
								<div class="text-xs text-gray-500 mt-1">
									Created by: {conv.creatorName || 'Unknown'}
								</div>
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap gap-1 max-w-xs">
									{#each conv.participants.slice(0, 3) as participant}
										<span class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
											{participant.userName || participant.userEmail}
										</span>
									{/each}
									{#if conv.participants.length > 3}
										<span class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
											+{conv.participants.length - 3} more
										</span>
									{/if}
								</div>
							</td>
							<td class="px-4 py-3 text-sm text-gray-600">
								{conv.messageCount}
							</td>
							<td class="px-4 py-3">
								{#if conv.lastMessage}
									<div class="text-sm text-gray-900">
										<span class="font-medium">{conv.lastMessage.senderName || 'Unknown'}:</span>
									</div>
									<div class="text-xs text-gray-500 max-w-xs">
										{truncate(conv.lastMessage.content, 50)}
									</div>
								{:else}
									<span class="text-gray-400 text-sm">No messages</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm text-gray-500">
								{formatDate(conv.updatedAt)}
							</td>
							<td class="px-4 py-3">
								<a
									href="/admin/communications/{conv.id}"
									class="text-blue-600 hover:text-blue-800 text-sm font-medium"
								>
									View All
								</a>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6" class="px-4 py-8 text-center text-gray-500">
								No conversations found
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
				{#if data.conversations.length === 50}
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
