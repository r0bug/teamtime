<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	// Tabs
	let activeTab: 'matrix' | 'types' | 'discovery' | 'migration' = 'matrix';

	// Migration state
	let migrationLoading = false;
	let migrationResult: { success: boolean; message: string } | null = null;

	async function runMigration() {
		migrationLoading = true;
		migrationResult = null;
		try {
			const res = await fetch('/api/admin/access-control/migrate', { method: 'POST' });
			const json = await res.json();
			if (json.success) {
				migrationResult = { success: true, message: `Migrated ${json.migratedCount} users. Batch: ${json.batchId}` };
				// Refresh page data
				location.reload();
			} else {
				migrationResult = { success: false, message: json.error || 'Migration failed' };
			}
		} catch (e) {
			migrationResult = { success: false, message: 'Network error' };
		}
		migrationLoading = false;
	}

	async function revertToDefault() {
		if (!confirm('This will reset ALL users to the default user type. Continue?')) return;
		migrationLoading = true;
		migrationResult = null;
		try {
			const res = await fetch('/api/admin/access-control/revert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'revert_to_default' })
			});
			const json = await res.json();
			if (json.success) {
				migrationResult = { success: true, message: `Reset ${json.revertedCount} users to default` };
				location.reload();
			} else {
				migrationResult = { success: false, message: json.error || 'Revert failed' };
			}
		} catch (e) {
			migrationResult = { success: false, message: 'Network error' };
		}
		migrationLoading = false;
	}

	async function revertBatch(batchId: string) {
		if (!confirm(`Revert migration batch ${batchId}?`)) return;
		migrationLoading = true;
		migrationResult = null;
		try {
			const res = await fetch('/api/admin/access-control/revert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'revert_batch', batchId })
			});
			const json = await res.json();
			if (json.success) {
				migrationResult = { success: true, message: `Reverted ${json.revertedCount} users` };
				location.reload();
			} else {
				migrationResult = { success: false, message: json.error || 'Revert failed' };
			}
		} catch (e) {
			migrationResult = { success: false, message: 'Network error' };
		}
		migrationLoading = false;
	}

	async function setDefaultUserType(userTypeId: string | null) {
		try {
			const res = await fetch('/api/admin/settings/default-user-type', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userTypeId })
			});
			const json = await res.json();
			if (json.success) {
				migrationResult = { success: true, message: 'Default user type updated' };
				location.reload();
			} else {
				migrationResult = { success: false, message: json.error || 'Failed to update' };
			}
		} catch (e) {
			migrationResult = { success: false, message: 'Network error' };
		}
	}

	// Modal state
	let showTypeModal = false;
	let editingType: typeof data.userTypes[0] | null = null;

	// New/edit type form
	let typeName = '';
	let typeDescription = '';
	let typeBasedOnRole: string = '';
	let typePriority = 50;
	let typeColor = '#6B7280';
	let typeIsActive = true;

	// Filter state
	let selectedModule = 'all';
	let showOnlyGranted = false;

	function openNewTypeModal() {
		editingType = null;
		typeName = '';
		typeDescription = '';
		typeBasedOnRole = '';
		typePriority = 50;
		typeColor = '#6B7280';
		typeIsActive = true;
		showTypeModal = true;
	}

	function openEditTypeModal(type: typeof data.userTypes[0]) {
		editingType = type;
		typeName = type.name;
		typeDescription = type.description || '';
		typeBasedOnRole = type.basedOnRole || '';
		typePriority = type.priority;
		typeColor = type.color || '#6B7280';
		typeIsActive = type.isActive;
		showTypeModal = true;
	}

	function closeModal() {
		showTypeModal = false;
		editingType = null;
	}

	// Get unique modules
	$: modules = [...new Set(data.permissions.map(p => p.module))].sort();

	// Filter permissions
	$: filteredPermissions = data.permissions.filter(p => {
		if (selectedModule !== 'all' && p.module !== selectedModule) return false;
		return true;
	});

	// Get permission state for a user type
	function getPermState(userTypeId: string, permissionId: string): 'granted' | 'denied' | 'none' {
		const typePerms = data.matrix[userTypeId];
		if (!typePerms) return 'none';
		const granted = typePerms[permissionId];
		if (granted === true) return 'granted';
		if (granted === false) return 'denied';
		return 'none';
	}

	function getNextAction(current: 'granted' | 'denied' | 'none'): 'grant' | 'deny' | 'remove' {
		if (current === 'none') return 'grant';
		if (current === 'granted') return 'deny';
		return 'remove';
	}

	function getPermButtonClass(state: 'granted' | 'denied' | 'none'): string {
		if (state === 'granted') return 'bg-green-500 hover:bg-red-400';
		if (state === 'denied') return 'bg-red-500 hover:bg-gray-300';
		return 'bg-gray-200 hover:bg-green-400';
	}

	function getPermButtonTitle(state: 'granted' | 'denied' | 'none'): string {
		if (state === 'granted') return 'Click to deny';
		if (state === 'denied') return 'Click to remove override';
		return 'Click to grant';
	}
</script>

<svelte:head>
	<title>Access Control - Admin Settings</title>
</svelte:head>

<div class="p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="mb-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold text-gray-900">Access Control</h1>
					<p class="text-gray-600 mt-1">Manage user types and granular permissions</p>
				</div>
				<a href="/admin/settings" class="text-sm text-primary-600 hover:text-primary-700">
					Back to Settings
				</a>
			</div>
		</div>

		<!-- Status message -->
		{#if form?.success}
			<div class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
				{form.message || 'Action completed successfully'}
			</div>
		{/if}
		{#if form?.error}
			<div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
				{form.error}
			</div>
		{/if}

		<!-- Tabs -->
		<div class="border-b border-gray-200 mb-6">
			<nav class="-mb-px flex space-x-8">
				<button
					on:click={() => activeTab = 'matrix'}
					class="py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'matrix' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Permission Matrix
				</button>
				<button
					on:click={() => activeTab = 'types'}
					class="py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'types' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					User Types ({data.userTypes.length})
				</button>
				<button
					on:click={() => activeTab = 'discovery'}
					class="py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'discovery' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Route Discovery
				</button>
				<button
					on:click={() => activeTab = 'migration'}
					class="py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'migration' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Migration
					{#if data.migrationStatus?.unmigatedUsers > 0}
						<span class="ml-1 px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">{data.migrationStatus.unmigatedUsers}</span>
					{/if}
				</button>
			</nav>
		</div>

		<!-- Permission Matrix Tab -->
		{#if activeTab === 'matrix'}
			<div class="bg-white rounded-lg shadow-sm border overflow-hidden">
				<!-- Filter bar -->
				<div class="p-4 border-b bg-gray-50 flex items-center gap-4">
					<div>
						<label for="module" class="block text-xs font-medium text-gray-600 mb-1">Module</label>
						<select
							id="module"
							bind:value={selectedModule}
							class="block rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
						>
							<option value="all">All Modules</option>
							{#each modules as mod}
								<option value={mod}>{mod}</option>
							{/each}
						</select>
					</div>
					<div class="text-sm text-gray-500 ml-auto">
						{filteredPermissions.length} permissions
					</div>
				</div>

				<!-- Matrix table -->
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
									Permission
								</th>
								{#each data.userTypes as userType}
									<th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
										<div class="flex flex-col items-center">
											<span class="inline-block w-3 h-3 rounded-full mb-1" style="background-color: {userType.color}"></span>
											<span>{userType.name}</span>
											{#if userType.isSystem}
												<span class="text-xxs text-gray-400">(system)</span>
											{/if}
										</div>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-200">
							{#each filteredPermissions as permission}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-2 text-sm sticky left-0 bg-white z-10">
										<div class="font-medium text-gray-900">{permission.name}</div>
										<div class="text-xs text-gray-500">
											{permission.routePattern}{permission.actionName ? ` : ${permission.actionName}` : ''}
										</div>
										<div class="text-xxs text-gray-400">{permission.module}</div>
									</td>
									{#each data.userTypes as userType}
										{@const state = getPermState(userType.id, permission.id)}
										<td class="px-3 py-2 text-center">
											<form method="POST" action="?/togglePermission" use:enhance>
												<input type="hidden" name="userTypeId" value={userType.id} />
												<input type="hidden" name="permissionId" value={permission.id} />
												<input type="hidden" name="action" value={getNextAction(state)} />
												<button
													type="submit"
													class="w-8 h-8 rounded-full transition-colors {getPermButtonClass(state)}"
													title={getPermButtonTitle(state)}
												>
													{#if state === 'granted'}
														<svg class="w-4 h-4 mx-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
														</svg>
													{:else if state === 'denied'}
														<svg class="w-4 h-4 mx-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
														</svg>
													{:else}
														<span class="text-gray-400">-</span>
													{/if}
												</button>
											</form>
										</td>
									{/each}
								</tr>
							{/each}

							{#if filteredPermissions.length === 0}
								<tr>
									<td colspan={data.userTypes.length + 1} class="px-4 py-8 text-center text-gray-500">
										No permissions found. Use Route Discovery to sync permissions from your routes.
									</td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>

				<div class="p-4 border-t bg-gray-50 text-sm text-gray-600">
					<div class="flex items-center gap-4">
						<span class="flex items-center gap-1">
							<span class="w-4 h-4 rounded-full bg-green-500"></span> Granted
						</span>
						<span class="flex items-center gap-1">
							<span class="w-4 h-4 rounded-full bg-red-500"></span> Denied
						</span>
						<span class="flex items-center gap-1">
							<span class="w-4 h-4 rounded-full bg-gray-200"></span> No override (uses role fallback)
						</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- User Types Tab -->
		{#if activeTab === 'types'}
			<div class="space-y-4">
				<div class="flex justify-between items-center">
					<div class="text-sm text-gray-600">
						Manage custom user types for granular access control
					</div>
					<div class="flex gap-2">
						<form method="POST" action="?/seedTypes" use:enhance>
							<button
								type="submit"
								class="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
							>
								Seed System Types
							</button>
						</form>
						<button
							on:click={openNewTypeModal}
							class="px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors"
						>
							Add User Type
						</button>
					</div>
				</div>

				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each data.userTypes as userType}
						<div class="bg-white rounded-lg shadow-sm border p-4">
							<div class="flex items-start justify-between">
								<div class="flex items-center gap-3">
									<span
										class="w-4 h-4 rounded-full"
										style="background-color: {userType.color}"
									></span>
									<div>
										<h3 class="font-medium text-gray-900">{userType.name}</h3>
										{#if userType.basedOnRole}
											<span class="text-xs text-gray-500">Based on: {userType.basedOnRole}</span>
										{/if}
									</div>
								</div>
								<div class="flex items-center gap-2">
									{#if userType.isSystem}
										<span class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">System</span>
									{/if}
									{#if !userType.isActive}
										<span class="px-2 py-1 text-xs bg-red-100 text-red-600 rounded">Inactive</span>
									{/if}
								</div>
							</div>

							{#if userType.description}
								<p class="mt-2 text-sm text-gray-600">{userType.description}</p>
							{/if}

							<div class="mt-4 flex items-center justify-between">
								<span class="text-xs text-gray-500">
									Priority: {userType.priority}
								</span>
								<div class="flex gap-2">
									<button
										on:click={() => openEditTypeModal(userType)}
										class="text-sm text-primary-600 hover:text-primary-700"
									>
										Edit
									</button>
									{#if !userType.isSystem}
										<form method="POST" action="?/deleteUserType" use:enhance>
											<input type="hidden" name="id" value={userType.id} />
											<button
												type="submit"
												class="text-sm text-red-600 hover:text-red-700"
												onclick="return confirm('Delete this user type?')"
											>
												Delete
											</button>
										</form>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					{#if data.userTypes.length === 0}
						<div class="col-span-full p-8 text-center text-gray-500 bg-white rounded-lg border">
							No user types defined. Click "Seed System Types" to create the default types.
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Route Discovery Tab -->
		{#if activeTab === 'discovery'}
			<div class="space-y-6">
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<div class="flex items-center justify-between mb-4">
						<div>
							<h3 class="font-medium text-gray-900">Route Discovery</h3>
							<p class="text-sm text-gray-600">Scan your routes to discover pages and form actions</p>
						</div>
						<form method="POST" action="?/syncRoutes" use:enhance>
							<button
								type="submit"
								class="px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors"
							>
								Sync Routes
							</button>
						</form>
					</div>

					<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
						<div class="p-4 bg-gray-50 rounded-lg">
							<div class="text-2xl font-bold text-gray-900">{data.discoverySummary.totalRoutes}</div>
							<div class="text-sm text-gray-600">Total Routes</div>
						</div>
						<div class="p-4 bg-gray-50 rounded-lg">
							<div class="text-2xl font-bold text-gray-900">{data.discoverySummary.totalActions}</div>
							<div class="text-sm text-gray-600">Total Actions</div>
						</div>
						<div class="p-4 bg-gray-50 rounded-lg">
							<div class="text-2xl font-bold text-gray-900">{data.permissions.length}</div>
							<div class="text-sm text-gray-600">Permissions in DB</div>
						</div>
					</div>
				</div>

				<div class="bg-white rounded-lg shadow-sm border p-6">
					<h3 class="font-medium text-gray-900 mb-4">By Module</h3>
					<div class="space-y-2">
						{#each Object.entries(data.discoverySummary.byModule) as [mod, stats]}
							<div class="flex items-center justify-between py-2 border-b last:border-0">
								<span class="font-medium text-gray-700">{mod}</span>
								<span class="text-sm text-gray-500">
									{stats.routes} routes, {stats.actions} actions
								</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Migration Tab -->
		{#if activeTab === 'migration'}
			<div class="space-y-6">
				<!-- Migration Result Alert -->
				{#if migrationResult}
					<div class="p-4 rounded-lg {migrationResult.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}">
						{migrationResult.message}
					</div>
				{/if}

				<!-- Migration Status Card -->
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<h3 class="font-medium text-gray-900 mb-4">Migration Status</h3>

					{#if data.migrationStatus}
						<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
							<div class="p-4 bg-gray-50 rounded-lg">
								<div class="text-2xl font-bold text-gray-900">{data.migrationStatus.totalUsers}</div>
								<div class="text-sm text-gray-600">Total Users</div>
							</div>
							<div class="p-4 bg-green-50 rounded-lg">
								<div class="text-2xl font-bold text-green-700">{data.migrationStatus.migratedUsers}</div>
								<div class="text-sm text-green-600">Migrated</div>
							</div>
							<div class="p-4 bg-yellow-50 rounded-lg">
								<div class="text-2xl font-bold text-yellow-700">{data.migrationStatus.unmigatedUsers}</div>
								<div class="text-sm text-yellow-600">Pending</div>
							</div>
							<div class="p-4 rounded-lg {data.migrationStatus.status === 'completed' ? 'bg-green-50' : data.migrationStatus.status === 'error' ? 'bg-red-50' : 'bg-gray-50'}">
								<div class="text-lg font-bold capitalize {data.migrationStatus.status === 'completed' ? 'text-green-700' : data.migrationStatus.status === 'error' ? 'text-red-700' : 'text-gray-700'}">
									{data.migrationStatus.status}
								</div>
								<div class="text-sm text-gray-600">Status</div>
							</div>
						</div>

						<div class="flex flex-wrap gap-3">
							<button
								on:click={runMigration}
								disabled={migrationLoading || data.migrationStatus.unmigatedUsers === 0}
								class="px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{migrationLoading ? 'Running...' : 'Migrate All Users'}
							</button>
							<button
								on:click={revertToDefault}
								disabled={migrationLoading}
								class="px-4 py-2 text-sm bg-yellow-600 text-white hover:bg-yellow-700 rounded-lg transition-colors disabled:opacity-50"
							>
								Revert to Default
							</button>
						</div>
					{:else}
						<p class="text-gray-500">Loading migration status...</p>
					{/if}
				</div>

				<!-- Default User Type Setting -->
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<h3 class="font-medium text-gray-900 mb-4">Default User Type</h3>
					<p class="text-sm text-gray-600 mb-4">
						The default user type is assigned to new users and used as the target for "Revert to Default".
					</p>

					<div class="flex items-center gap-4">
						<select
							class="block rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
							value={data.defaultUserTypeId || ''}
							on:change={(e) => setDefaultUserType(e.currentTarget.value || null)}
						>
							<option value="">None (use legacy role fallback)</option>
							{#each data.userTypes as userType}
								<option value={userType.id}>
									{userType.name}
									{#if userType.isSystem}(System){/if}
								</option>
							{/each}
						</select>
						{#if data.defaultUserTypeId}
							{@const defaultType = data.userTypes.find(t => t.id === data.defaultUserTypeId)}
							{#if defaultType}
								<span class="inline-flex items-center gap-2 text-sm text-gray-600">
									<span class="w-3 h-3 rounded-full" style="background-color: {defaultType.color}"></span>
									{defaultType.name}
								</span>
							{/if}
						{/if}
					</div>
				</div>

				<!-- Recent Migration Batches -->
				{#if data.migrationBatches && data.migrationBatches.length > 0}
					<div class="bg-white rounded-lg shadow-sm border p-6">
						<h3 class="font-medium text-gray-900 mb-4">Recent Migration Batches</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch ID</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Users</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reverted</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200">
									{#each data.migrationBatches as batch}
										<tr class="hover:bg-gray-50">
											<td class="px-4 py-3 text-sm text-gray-900 font-mono">{batch.batchId.substring(0, 20)}...</td>
											<td class="px-4 py-3 text-sm text-gray-600">{new Date(batch.migratedAt).toLocaleString()}</td>
											<td class="px-4 py-3 text-sm text-gray-600">{batch.userCount}</td>
											<td class="px-4 py-3 text-sm text-gray-600">
								 				{batch.revertedCount} / {batch.userCount}
											</td>
											<td class="px-4 py-3">
												{#if batch.revertedCount < batch.userCount}
													<button
														on:click={() => revertBatch(batch.batchId)}
														disabled={migrationLoading}
														class="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
													>
														Revert
													</button>
												{:else}
													<span class="text-sm text-gray-400">Fully reverted</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}

				<!-- Migration Instructions -->
				<div class="bg-blue-50 border border-blue-200 rounded-lg p-6">
					<h3 class="font-medium text-blue-900 mb-2">Migration Guide</h3>
					<ol class="list-decimal list-inside space-y-2 text-sm text-blue-800">
						<li>First, use "Seed System Types" in the User Types tab to create Admin, Manager, Purchaser, and Staff user types</li>
						<li>Click "Migrate All Users" to assign users to user types based on their legacy roles</li>
						<li>All migrations are recorded and can be reverted if needed</li>
						<li>Set a "Default User Type" for new user registration and the "Revert to Default" action</li>
						<li>System user types are marked as templates and cannot be deleted</li>
					</ol>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- User Type Modal -->
{#if showTypeModal}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={closeModal}>
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" on:click|stopPropagation>
			<form method="POST" action="?/saveUserType" use:enhance on:submit={closeModal}>
				<div class="p-6">
					<h2 class="text-lg font-semibold text-gray-900 mb-4">
						{editingType ? 'Edit User Type' : 'New User Type'}
					</h2>

					{#if editingType}
						<input type="hidden" name="id" value={editingType.id} />
					{/if}

					<div class="space-y-4">
						<div>
							<label for="typeName" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
							<input
								type="text"
								id="typeName"
								name="name"
								bind:value={typeName}
								required
								class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
							/>
						</div>

						<div>
							<label for="typeDescription" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
							<textarea
								id="typeDescription"
								name="description"
								bind:value={typeDescription}
								rows="2"
								class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
							></textarea>
						</div>

						<div>
							<label for="typeBasedOnRole" class="block text-sm font-medium text-gray-700 mb-1">Based On Role (fallback)</label>
							<select
								id="typeBasedOnRole"
								name="basedOnRole"
								bind:value={typeBasedOnRole}
								class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
							>
								<option value="">None (uses user's direct role)</option>
								<option value="admin">Admin</option>
								<option value="manager">Manager</option>
								<option value="purchaser">Purchaser</option>
								<option value="staff">Staff</option>
							</select>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="typePriority" class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
								<input
									type="number"
									id="typePriority"
									name="priority"
									bind:value={typePriority}
									min="1"
									max="100"
									class="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
								/>
							</div>
							<div>
								<label for="typeColor" class="block text-sm font-medium text-gray-700 mb-1">Color</label>
								<input
									type="color"
									id="typeColor"
									name="color"
									bind:value={typeColor}
									class="block w-full h-10 rounded-md border-gray-300 shadow-sm"
								/>
							</div>
						</div>

						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								id="typeIsActive"
								name="isActive"
								value="true"
								checked={typeIsActive}
								on:change={(e) => typeIsActive = e.currentTarget.checked}
								class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
							/>
							<label for="typeIsActive" class="text-sm text-gray-700">Active</label>
						</div>
					</div>
				</div>

				<div class="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
					<button
						type="button"
						on:click={closeModal}
						class="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors"
					>
						{editingType ? 'Save Changes' : 'Create User Type'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.text-xxs {
		font-size: 0.65rem;
	}
</style>
