<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	export let data: PageData;

	$: selectedUserId = $page.url.searchParams.get('userId') || '';
	$: activityType = data.activityType;

	function selectUser(event: Event) {
		const userId = (event.target as HTMLSelectElement).value;
		if (userId) {
			goto(`/admin/user-activity?userId=${userId}&type=${activityType}`);
		} else {
			goto('/admin/user-activity');
		}
	}

	function selectType(type: string) {
		if (selectedUserId) {
			goto(`/admin/user-activity?userId=${selectedUserId}&type=${type}`);
		}
	}

	function changePage(newPage: number) {
		goto(`/admin/user-activity?userId=${selectedUserId}&type=${activityType}&page=${newPage}`);
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
	}

	function formatRelativeTime(date: Date | string) {
		const now = new Date();
		const d = new Date(date);
		const diffMs = now.getTime() - d.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return formatDate(date);
	}

	function getActivityIcon(type: string) {
		switch (type) {
			case 'time_entry': return { icon: '🕐', color: 'bg-blue-100 text-blue-600' };
			case 'task_completion': return { icon: '✓', color: 'bg-green-100 text-green-600' };
			case 'pricing_decision': return { icon: '$', color: 'bg-yellow-100 text-yellow-600' };
			case 'message': return { icon: '💬', color: 'bg-purple-100 text-purple-600' };
			case 'points': return { icon: '★', color: 'bg-amber-100 text-amber-600' };
			case 'audit': return { icon: '📋', color: 'bg-gray-100 text-gray-600' };
			default: return { icon: '•', color: 'bg-gray-100 text-gray-600' };
		}
	}

	function getActivityBadge(type: string) {
		switch (type) {
			case 'time_entry': return 'bg-blue-100 text-blue-800';
			case 'task_completion': return 'bg-green-100 text-green-800';
			case 'pricing_decision': return 'bg-yellow-100 text-yellow-800';
			case 'message': return 'bg-purple-100 text-purple-800';
			case 'points': return 'bg-amber-100 text-amber-800';
			case 'audit': return 'bg-gray-100 text-gray-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	const activityTypes = [
		{ value: 'all', label: 'All Activity' },
		{ value: 'time', label: 'Time Entries' },
		{ value: 'tasks', label: 'Tasks' },
		{ value: 'pricing', label: 'Pricing' },
		{ value: 'messages', label: 'Messages' },
		{ value: 'points', label: 'Points' },
		{ value: 'audit', label: 'Audit Logs' }
	];
</script>

<svelte:head>
	<title>User Activity - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-6xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">User Activity Log</h1>
		<p class="text-gray-600 mt-1">View detailed activity history for any user</p>
	</div>

	<!-- User Selector -->
	<div class="card mb-6">
		<div class="card-body">
			<label for="userSelect" class="label mb-2">Select User</label>
			<select
				id="userSelect"
				class="input max-w-md"
				value={selectedUserId}
				on:change={selectUser}
			>
				<option value="">-- Select a user --</option>
				{#each data.users as user}
					<option value={user.id}>
						{user.name} ({user.email}) - {user.role}
					</option>
				{/each}
			</select>
		</div>
	</div>

	{#if data.selectedUser}
		<!-- User Info Card -->
		<div class="card mb-6">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">{data.selectedUser.name}</h2>
						<p class="text-gray-500">{data.selectedUser.email}</p>
					</div>
					<span class="badge-primary capitalize">{data.selectedUser.role}</span>
				</div>
			</div>
		</div>

		<!-- Activity Type Tabs -->
		<div class="flex flex-wrap gap-2 mb-6">
			{#each activityTypes as type}
				<button
					on:click={() => selectType(type.value)}
					class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
						{activityType === type.value
							? 'bg-primary-600 text-white'
							: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
				>
					{type.label}
				</button>
			{/each}
		</div>

		<!-- Activity List -->
		<div class="card">
			<div class="card-header flex justify-between items-center">
				<h3 class="font-semibold">Activity Timeline</h3>
				{#if data.totalCount > 0}
					<span class="text-sm text-gray-500">
						{data.totalCount} {activityType === 'all' ? 'recent entries' : 'total entries'}
					</span>
				{/if}
			</div>

			{#if data.activities.length === 0}
				<div class="card-body text-center py-12">
					<div class="text-4xl mb-4">📭</div>
					<p class="text-gray-500">No activity found for this user</p>
					{#if activityType !== 'all'}
						<button
							on:click={() => selectType('all')}
							class="text-primary-600 hover:underline mt-2"
						>
							View all activity types
						</button>
					{/if}
				</div>
			{:else}
				<div class="divide-y divide-gray-100">
					{#each data.activities as activity}
						{@const iconData = getActivityIcon(activity.type)}
						<div class="p-4 hover:bg-gray-50 transition-colors">
							<div class="flex gap-4">
								<!-- Icon -->
								<div class="flex-shrink-0">
									<div class="w-10 h-10 rounded-full {iconData.color} flex items-center justify-center font-semibold">
										{iconData.icon}
									</div>
								</div>

								<!-- Content -->
								<div class="flex-1 min-w-0">
									<div class="flex items-start justify-between gap-2">
										<div>
											<span class="font-medium text-gray-900">{activity.action}</span>
											<span class="mx-2 text-gray-300">•</span>
											<span class="text-xs px-2 py-0.5 rounded-full {getActivityBadge(activity.type)}">
												{activity.type.replace('_', ' ')}
											</span>
										</div>
										<div class="text-sm text-gray-500 whitespace-nowrap" title={formatDate(activity.createdAt)}>
											{formatRelativeTime(activity.createdAt)}
										</div>
									</div>
									<p class="text-gray-600 mt-1 text-sm truncate">{activity.description}</p>

									{#if activity.details}
										<div class="mt-2 text-xs text-gray-400">
											{#if activity.type === 'time_entry' && activity.details.clockIn}
												<span>In: {formatDate(String(activity.details.clockIn))}</span>
												{#if activity.details.clockOut}
													<span class="mx-2">|</span>
													<span>Out: {formatDate(String(activity.details.clockOut))}</span>
												{/if}
											{/if}
											{#if activity.type === 'points' && activity.details.category}
												<span class="capitalize">{activity.details.category}</span>
											{/if}
											{#if activity.type === 'audit' && activity.details.ip}
												<span>IP: {activity.details.ip}</span>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Pagination -->
				{#if data.totalPages > 1}
					<div class="card-footer flex items-center justify-between">
						<div class="text-sm text-gray-500">
							Page {data.page} of {data.totalPages}
						</div>
						<div class="flex gap-2">
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
			{/if}
		</div>
	{:else}
		<!-- No user selected state -->
		<div class="card">
			<div class="card-body text-center py-12">
				<div class="text-4xl mb-4">👤</div>
				<p class="text-gray-500">Select a user above to view their activity log</p>
			</div>
		</div>
	{/if}
</div>
