<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>Admin Dashboard - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
		<p class="text-gray-600 mt-1">Manage your team and view system statistics</p>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-primary-600">{data.stats.totalUsers}</div>
				<div class="text-sm text-gray-600">Total Users</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-green-600">{data.stats.activeUsers}</div>
				<div class="text-sm text-gray-600">Active Users</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-blue-600">{data.stats.hoursThisWeek}</div>
				<div class="text-sm text-gray-600">Hours This Week</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-purple-600">{data.stats.shiftsThisWeek}</div>
				<div class="text-sm text-gray-600">Shifts This Week</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-orange-600">{data.stats.messagesThisWeek}</div>
				<div class="text-sm text-gray-600">Messages This Week</div>
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
		<a href="/admin/users" class="card hover:shadow-md transition-shadow">
			<div class="card-body flex items-center">
				<div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mr-4">
					<svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">User Management</h3>
					<p class="text-sm text-gray-600">Manage users, roles, and hourly rates</p>
				</div>
			</div>
		</a>

		<a href="/admin/messages" class="card hover:shadow-md transition-shadow">
			<div class="card-body flex items-center">
				<div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
					<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Messages</h3>
					<p class="text-sm text-gray-600">View and send messages</p>
				</div>
			</div>
		</a>

		<a href="/admin/schedule" class="card hover:shadow-md transition-shadow">
			<div class="card-body flex items-center">
				<div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
					<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Schedule</h3>
					<p class="text-sm text-gray-600">Manage and print schedules</p>
				</div>
			</div>
		</a>

		<a href="/admin/export-hours" class="card hover:shadow-md transition-shadow">
			<div class="card-body flex items-center">
				<div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
					<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Export Hours</h3>
					<p class="text-sm text-gray-600">Export time data for payroll</p>
				</div>
			</div>
		</a>

		<a href="/admin/locations" class="card hover:shadow-md transition-shadow">
			<div class="card-body flex items-center">
				<div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
					<svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Locations</h3>
					<p class="text-sm text-gray-600">Manage work locations</p>
				</div>
			</div>
		</a>

		{#if data.isAdmin}
			<a href="/admin/audit-logs" class="card hover:shadow-md transition-shadow border-2 border-yellow-200">
				<div class="card-body flex items-center">
					<div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
						<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
						</svg>
					</div>
					<div>
						<h3 class="font-semibold text-gray-900">Audit Logs</h3>
						<p class="text-sm text-gray-600">View system activity logs</p>
					</div>
				</div>
			</a>

			<a href="/admin/modules" class="card hover:shadow-md transition-shadow border-2 border-yellow-200">
				<div class="card-body flex items-center">
					<div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
						<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
						</svg>
					</div>
					<div>
						<h3 class="font-semibold text-gray-900">System Modules</h3>
						<p class="text-sm text-gray-600">Enable/disable features</p>
					</div>
				</div>
			</a>
		{/if}
	</div>

	<!-- Users Overview -->
	<div class="card">
		<div class="card-header flex justify-between items-center">
			<h2 class="font-semibold">Users Overview</h2>
			<a href="/admin/users" class="text-sm text-primary-600 hover:text-primary-700">View All</a>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hourly Rate</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">2FA</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each data.users as user}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 whitespace-nowrap">
								<span class="font-medium text-gray-900">{user.name}</span>
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
							<td class="px-4 py-3 whitespace-nowrap">
								<span class="px-2 py-1 text-xs font-medium rounded-full capitalize
									{user.role === 'admin' ? 'bg-red-100 text-red-800' :
									 user.role === 'manager' ? 'bg-purple-100 text-purple-800' :
									 user.role === 'purchaser' ? 'bg-blue-100 text-blue-800' :
									 'bg-gray-100 text-gray-800'}">
									{user.role}
								</span>
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
								{user.hourlyRate ? `$${user.hourlyRate}/hr` : '-'}
							</td>
							<td class="px-4 py-3 whitespace-nowrap">
								{#if user.twoFactorEnabled}
									<span class="text-green-600">
										<svg class="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
										</svg>
									</span>
								{:else}
									<span class="text-gray-400">
										<svg class="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
										</svg>
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 whitespace-nowrap">
								<span class="px-2 py-1 text-xs font-medium rounded-full {user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
									{user.isActive ? 'Active' : 'Inactive'}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if data.isAdmin}
		<div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
			<p class="text-sm text-yellow-800">
				<strong>Admin Access:</strong> You have full system access including audit logs, all communications, and module control.
			</p>
		</div>
	{/if}
</div>
