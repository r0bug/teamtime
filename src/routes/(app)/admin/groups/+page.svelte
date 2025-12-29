<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let editingGroup: typeof data.groups[0] | null = null;
	let managingMembersGroup: typeof data.groups[0] | null = null;
	let groupMembers: Array<{
		userId: string;
		name: string;
		email: string;
		role: string;
		isAutoAssigned: boolean;
	}> = [];
	let loading = false;
	let loadingMembers = false;

	// New group form
	let newGroupName = '';
	let newGroupDescription = '';
	let newGroupColor = '#6B7280';
	let selectedMemberIds: string[] = [];

	function openEditModal(group: typeof data.groups[0]) {
		editingGroup = { ...group };
	}

	function closeEditModal() {
		editingGroup = null;
	}

	async function openMembersModal(group: typeof data.groups[0]) {
		managingMembersGroup = group;
		loadingMembers = true;

		// Fetch members via API
		try {
			const response = await fetch(`/api/groups/${group.id}/members`);
			const data = await response.json();
			groupMembers = data.members || [];
		} catch (e) {
			console.error('Failed to load members', e);
			groupMembers = [];
		}
		loadingMembers = false;
	}

	function closeMembersModal() {
		managingMembersGroup = null;
		groupMembers = [];
	}

	function resetCreateForm() {
		newGroupName = '';
		newGroupDescription = '';
		newGroupColor = '#6B7280';
		selectedMemberIds = [];
		showCreateModal = false;
	}

	function toggleMemberSelection(userId: string) {
		if (selectedMemberIds.includes(userId)) {
			selectedMemberIds = selectedMemberIds.filter(id => id !== userId);
		} else {
			selectedMemberIds = [...selectedMemberIds, userId];
		}
	}

	function isMember(userId: string): boolean {
		return groupMembers.some(m => m.userId === userId);
	}
</script>

<svelte:head>
	<title>Group Management - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex justify-between items-center mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Group Management</h1>
			<p class="text-gray-600 mt-1">Manage group chats and membership</p>
		</div>
		<div class="flex gap-2">
			<form method="POST" action="?/syncGroups" use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}>
				<button type="submit" class="btn-secondary" disabled={loading}>
					{loading ? 'Syncing...' : 'Sync User Types'}
				</button>
			</form>
			<button
				on:click={() => showCreateModal = true}
				class="btn-primary"
			>
				+ Create Group
			</button>
		</div>
	</div>

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.message}
		</div>
	{/if}

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
			{form.error}
		</div>
	{/if}

	<!-- Groups Table -->
	<div class="card">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each data.groups as group}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 whitespace-nowrap">
								<div class="flex items-center gap-3">
									<div
										class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
										style="background-color: {group.color || '#6B7280'}"
									>
										{group.name.charAt(0).toUpperCase()}
									</div>
									<div>
										<div class="font-medium text-gray-900">{group.name}</div>
										{#if group.description}
											<div class="text-xs text-gray-500">{group.description}</div>
										{/if}
									</div>
								</div>
							</td>
							<td class="px-4 py-3 whitespace-nowrap">
								{#if group.isAutoSynced}
									<span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
										Auto ({group.linkedUserType?.name || 'User Type'})
									</span>
								{:else}
									<span class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
										Custom
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
								{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
							</td>
							<td class="px-4 py-3 whitespace-nowrap">
								<span class="px-2 py-1 text-xs font-medium rounded-full {group.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
									{group.isActive ? 'Active' : 'Inactive'}
								</span>
							</td>
							<td class="px-4 py-3 whitespace-nowrap space-x-2">
								<button
									on:click={() => openMembersModal(group)}
									class="text-primary-600 hover:text-primary-700 text-sm"
								>
									Members
								</button>
								<button
									on:click={() => openEditModal(group)}
									class="text-primary-600 hover:text-primary-700 text-sm"
								>
									Edit
								</button>
								<a
									href="/messages/{group.conversationId}"
									class="text-green-600 hover:text-green-700 text-sm"
								>
									View Chat
								</a>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="5" class="px-4 py-8 text-center text-gray-500">
								No groups yet. Click "Sync User Types" to create groups from user types, or create a custom group.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Create Group Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<h2 class="text-xl font-semibold mb-4">Create Custom Group</h2>
				<form method="POST" action="?/createGroup" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						resetCreateForm();
						await update();
					};
				}} class="space-y-4">
					<div>
						<label for="name" class="label">Group Name</label>
						<input
							type="text"
							id="name"
							name="name"
							bind:value={newGroupName}
							required
							class="input"
							placeholder="e.g., Sales Team"
						/>
					</div>

					<div>
						<label for="description" class="label">Description</label>
						<textarea
							id="description"
							name="description"
							bind:value={newGroupDescription}
							class="input"
							rows="2"
							placeholder="Optional description"
						></textarea>
					</div>

					<div>
						<label for="color" class="label">Color</label>
						<div class="flex items-center gap-2">
							<input
								type="color"
								id="color"
								name="color"
								bind:value={newGroupColor}
								class="w-10 h-10 rounded cursor-pointer"
							/>
							<span class="text-sm text-gray-500">{newGroupColor}</span>
						</div>
					</div>

					<div>
						<label class="label">Select Members</label>
						<div class="border rounded-lg max-h-48 overflow-y-auto">
							{#each data.users as user}
								<label class="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
									<input
										type="checkbox"
										name="memberIds"
										value={user.id}
										checked={selectedMemberIds.includes(user.id)}
										on:change={() => toggleMemberSelection(user.id)}
										class="mr-3"
									/>
									<span class="text-sm">{user.name}</span>
									<span class="text-xs text-gray-500 ml-2">({user.role})</span>
								</label>
							{/each}
						</div>
						<p class="text-xs text-gray-500 mt-1">{selectedMemberIds.length} selected</p>
					</div>

					<div class="flex justify-end gap-2 pt-4">
						<button type="button" on:click={resetCreateForm} class="btn-secondary">
							Cancel
						</button>
						<button type="submit" class="btn-primary" disabled={loading || !newGroupName.trim()}>
							{loading ? 'Creating...' : 'Create Group'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Group Modal -->
{#if editingGroup}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-lg w-full">
			<div class="p-6">
				<h2 class="text-xl font-semibold mb-4">Edit Group</h2>
				<form method="POST" action="?/updateGroup" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						closeEditModal();
						await update();
					};
				}} class="space-y-4">
					<input type="hidden" name="groupId" value={editingGroup.id} />

					<div>
						<label for="edit-name" class="label">Group Name</label>
						<input
							type="text"
							id="edit-name"
							name="name"
							bind:value={editingGroup.name}
							class="input"
							disabled={editingGroup.isAutoSynced}
						/>
						{#if editingGroup.isAutoSynced}
							<p class="text-xs text-gray-500 mt-1">Name cannot be changed for auto-synced groups</p>
						{/if}
					</div>

					<div>
						<label for="edit-description" class="label">Description</label>
						<textarea
							id="edit-description"
							name="description"
							bind:value={editingGroup.description}
							class="input"
							rows="2"
						></textarea>
					</div>

					<div>
						<label for="edit-color" class="label">Color</label>
						<div class="flex items-center gap-2">
							<input
								type="color"
								id="edit-color"
								name="color"
								bind:value={editingGroup.color}
								class="w-10 h-10 rounded cursor-pointer"
							/>
							<span class="text-sm text-gray-500">{editingGroup.color}</span>
						</div>
					</div>

					<div>
						<label class="flex items-center">
							<input
								type="checkbox"
								name="isActive"
								value="true"
								checked={editingGroup.isActive}
								class="mr-2"
							/>
							<span>Active</span>
						</label>
					</div>

					<div class="flex justify-end gap-2 pt-4">
						<button type="button" on:click={closeEditModal} class="btn-secondary">
							Cancel
						</button>
						<button type="submit" class="btn-primary" disabled={loading}>
							{loading ? 'Saving...' : 'Save Changes'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Manage Members Modal -->
{#if managingMembersGroup}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<div class="flex justify-between items-center mb-4">
					<h2 class="text-xl font-semibold">Members of {managingMembersGroup.name}</h2>
					<button on:click={closeMembersModal} class="text-gray-500 hover:text-gray-700">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{#if managingMembersGroup.isAutoSynced}
					<div class="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm mb-4">
						This group is auto-synced with a user type. Members are automatically added/removed based on their user type assignment.
					</div>
				{/if}

				{#if loadingMembers}
					<div class="text-center py-8 text-gray-500">Loading members...</div>
				{:else}
					<!-- Current Members -->
					<div class="mb-6">
						<h3 class="font-medium text-gray-700 mb-2">Current Members ({groupMembers.length})</h3>
						{#if groupMembers.length > 0}
							<div class="border rounded-lg divide-y">
								{#each groupMembers as member}
									<div class="flex items-center justify-between px-4 py-3">
										<div>
											<div class="font-medium">{member.name}</div>
											<div class="text-sm text-gray-500">{member.email}</div>
										</div>
										<div class="flex items-center gap-4">
											<span class="text-xs text-gray-500">
												{member.isAutoAssigned ? 'Auto-assigned' : 'Manually added'}
											</span>
											<form method="POST" action="?/removeMember" use:enhance={() => {
												return async ({ update }) => {
													await update();
													// Refresh members list
													await openMembersModal(managingMembersGroup);
												};
											}}>
												<input type="hidden" name="groupId" value={managingMembersGroup.id} />
												<input type="hidden" name="userId" value={member.userId} />
												<button type="submit" class="text-red-600 hover:text-red-700 text-sm">
													Remove
												</button>
											</form>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-gray-500 text-sm">No members yet</p>
						{/if}
					</div>

					<!-- Add Member -->
					<div>
						<h3 class="font-medium text-gray-700 mb-2">Add Member</h3>
						<form method="POST" action="?/addMember" use:enhance={() => {
							return async ({ update }) => {
								await update();
								// Refresh members list
								await openMembersModal(managingMembersGroup);
							};
						}} class="flex gap-2">
							<input type="hidden" name="groupId" value={managingMembersGroup.id} />
							<select name="userId" class="input flex-1">
								<option value="">Select a user...</option>
								{#each data.users.filter(u => !isMember(u.id)) as user}
									<option value={user.id}>{user.name} ({user.role})</option>
								{/each}
							</select>
							<button type="submit" class="btn-primary">Add</button>
						</form>
					</div>
				{/if}

				<div class="flex justify-end mt-6">
					<button on:click={closeMembersModal} class="btn-secondary">Close</button>
				</div>
			</div>
		</div>
	</div>
{/if}
