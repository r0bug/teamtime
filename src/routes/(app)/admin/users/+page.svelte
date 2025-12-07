<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: users = data.users;

	let search = '';
	let roleFilter = 'all';

	$: filteredUsers = users.filter(u => {
		const matchesSearch = !search ||
			u.name.toLowerCase().includes(search.toLowerCase()) ||
			u.email.toLowerCase().includes(search.toLowerCase());
		const matchesRole = roleFilter === 'all' || u.role === roleFilter;
		return matchesSearch && matchesRole;
	});

	function getRoleBadge(role: string) {
		switch (role) {
			case 'manager': return 'badge-primary';
			case 'purchaser': return 'badge-warning';
			default: return 'badge-gray';
		}
	}
</script>

<svelte:head>
	<title>Manage Users - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">Users</h1>
		<a href="/admin/users/new" class="btn-primary">
			<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			Add User
		</a>
	</div>

	<!-- Filters -->
	<div class="flex flex-col lg:flex-row gap-4 mb-6">
		<div class="flex-1">
			<input
				type="search"
				placeholder="Search users..."
				bind:value={search}
				class="input"
			/>
		</div>
		<select bind:value={roleFilter} class="input lg:w-48">
			<option value="all">All Roles</option>
			<option value="manager">Managers</option>
			<option value="purchaser">Purchasers</option>
			<option value="staff">Staff</option>
		</select>
	</div>

	<!-- Users Table -->
	<div class="card overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Email</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Status</th>
						<th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each filteredUsers as user}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-4">
								<div class="flex items-center">
									<div class="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium flex-shrink-0">
										{user.name.charAt(0).toUpperCase()}
									</div>
									<div class="ml-3">
										<div class="font-medium text-gray-900">{user.name}</div>
										<div class="text-sm text-gray-500 lg:hidden">{user.email}</div>
									</div>
								</div>
							</td>
							<td class="px-4 py-4 hidden lg:table-cell text-gray-600">{user.email}</td>
							<td class="px-4 py-4">
								<span class={getRoleBadge(user.role)}>{user.role}</span>
							</td>
							<td class="px-4 py-4 hidden lg:table-cell">
								{#if user.isActive}
									<span class="badge-success">Active</span>
								{:else}
									<span class="badge-danger">Inactive</span>
								{/if}
							</td>
							<td class="px-4 py-4 text-right">
								<a href="/admin/users/{user.id}" class="text-primary-600 hover:text-primary-700">
									Edit
								</a>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="5" class="px-4 py-12 text-center text-gray-500">
								No users found
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
