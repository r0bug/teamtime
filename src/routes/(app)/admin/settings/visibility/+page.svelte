<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;
	export let form: ActionData;

	// Tabs
	let activeTab: 'presets' | 'rules' | 'groups' | 'grants' = 'presets';

	// Category display names
	const categoryNames: Record<string, string> = {
		tasks: 'Tasks',
		messages: 'Messages',
		schedule: 'Schedules',
		attendance: 'Attendance',
		users: 'User Directory',
		pricing: 'Pricing',
		expenses: 'Expenses'
	};

	// Group type options
	const groupTypes = [
		{ value: 'team', label: 'Team' },
		{ value: 'store', label: 'Store' },
		{ value: 'department', label: 'Department' },
		{ value: 'custom', label: 'Custom' }
	];

	// Modal state for creating groups
	let showCreateGroupModal = false;
	let newGroupName = '';
	let newGroupType: 'team' | 'store' | 'department' | 'custom' = 'team';
	let newGroupDescription = '';
	let selectedMemberIds: string[] = [];

	// Modal state for granting visibility
	let showGrantModal = false;
	let grantUserId = '';
	let grantCategory = 'tasks';
	let grantTargetType: 'user' | 'group' | 'role' = 'user';
	let grantTargetUserId = '';
	let grantTargetGroupId = '';
	let grantTargetRole = '';
	let grantReason = '';

	// Expanded group for member management
	let expandedGroupId: string | null = null;
	let addingMemberToGroupId: string | null = null;
	let newMemberUserId = '';

	// Success/error messages
	$: successMessage = form?.success ? (form as { message?: string }).message || 'Operation successful' : null;
	$: errorMessage = (form as { error?: string })?.error || null;

	function toggleMember(userId: string) {
		if (selectedMemberIds.includes(userId)) {
			selectedMemberIds = selectedMemberIds.filter(id => id !== userId);
		} else {
			selectedMemberIds = [...selectedMemberIds, userId];
		}
	}

	function resetCreateGroupModal() {
		showCreateGroupModal = false;
		newGroupName = '';
		newGroupType = 'team';
		newGroupDescription = '';
		selectedMemberIds = [];
	}

	function resetGrantModal() {
		showGrantModal = false;
		grantUserId = '';
		grantCategory = 'tasks';
		grantTargetType = 'user';
		grantTargetUserId = '';
		grantTargetGroupId = '';
		grantTargetRole = '';
		grantReason = '';
	}
</script>

<svelte:head>
	<title>Data Visibility Settings | Admin</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-4">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Data Visibility Settings</h1>
			<p class="text-gray-600 dark:text-gray-400 mt-1">Control what data users can see in the application and AI context</p>
		</div>
		<a href="/admin/settings" class="text-blue-600 dark:text-blue-400 hover:underline">
			&larr; Back to Settings
		</a>
	</div>

	{#if successMessage}
		<div class="bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-300 px-4 py-3 rounded mb-4">
			{successMessage}
		</div>
	{/if}

	{#if errorMessage}
		<div class="bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
			{errorMessage}
		</div>
	{/if}

	<!-- Tabs -->
	<div class="border-b border-gray-200 dark:border-gray-700 mb-6">
		<nav class="flex space-x-4">
			{#each [
				{ id: 'presets', label: 'Quick Setup' },
				{ id: 'rules', label: 'Visibility Rules' },
				{ id: 'groups', label: 'Custom Groups' },
				{ id: 'grants', label: 'User Grants' }
			] as tab}
				<button
					on:click={() => activeTab = tab.id}
					class="px-4 py-2 font-medium text-sm border-b-2 transition-colors {activeTab === tab.id
						? 'border-blue-500 text-blue-600 dark:text-blue-400'
						: 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Quick Setup (Presets) Tab -->
	{#if activeTab === 'presets'}
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
			<h2 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Quick Setup Presets</h2>
			<p class="text-gray-600 dark:text-gray-400 mb-6">
				Choose a preset to quickly configure visibility rules for common scenarios.
			</p>

			<div class="grid gap-4 md:grid-cols-3">
				{#each data.presets as preset}
					<div class="border dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
						<h3 class="font-semibold text-gray-900 dark:text-white mb-2">{preset.name}</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{preset.description}</p>
						<form method="POST" action="?/applyPreset" use:enhance={() => {
							return async ({ result, update }) => {
								await update();
								if (result.type === 'success') {
									invalidateAll();
								}
							};
						}}>
							<input type="hidden" name="presetId" value={preset.id} />
							<button
								type="submit"
								class="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
							>
								Apply Preset
							</button>
						</form>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Visibility Rules Tab -->
	{#if activeTab === 'rules'}
		<div class="space-y-6">
			{#each Object.entries(data.rulesByCategory) as [category, rules]}
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h2 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
						{categoryNames[category] || category} Visibility
					</h2>
					<div class="space-y-3">
						{#each rules as rule}
							<div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
								<div class="flex-1">
									<div class="font-medium text-gray-900 dark:text-white">{rule.name}</div>
									<div class="text-sm text-gray-500 dark:text-gray-400">{rule.description}</div>
								</div>
								<form method="POST" action="?/toggleRule" use:enhance>
									<input type="hidden" name="ruleKey" value={rule.ruleKey} />
									<input type="hidden" name="isEnabled" value={!rule.isEnabled} />
									<button
										type="submit"
										class="relative w-12 h-6 rounded-full transition-colors {rule.isEnabled
											? 'bg-green-500'
											: 'bg-gray-300 dark:bg-gray-600'}"
									>
										<span
											class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform {rule.isEnabled
												? 'translate-x-6'
												: 'translate-x-0'}"
										></span>
									</button>
								</form>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Custom Groups Tab -->
	{#if activeTab === 'groups'}
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Custom Groups</h2>
				<button
					on:click={() => showCreateGroupModal = true}
					class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
				>
					+ Create Group
				</button>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-6">
				Create groups to allow team members to see each other's data.
			</p>

			{#if data.groups.length === 0}
				<div class="text-center py-8 text-gray-500 dark:text-gray-400">
					No groups created yet. Create a group to get started.
				</div>
			{:else}
				<div class="space-y-4">
					{#each data.groups as group}
						<div class="border dark:border-gray-700 rounded-lg overflow-hidden">
							<button
								on:click={() => expandedGroupId = expandedGroupId === group.id ? null : group.id}
								class="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
							>
								<div class="flex items-center space-x-3">
									<span class="text-2xl">
										{#if group.groupType === 'store'}
											&#127978;
										{:else if group.groupType === 'department'}
											&#127970;
										{:else if group.groupType === 'team'}
											&#128101;
										{:else}
											&#128193;
										{/if}
									</span>
									<div class="text-left">
										<div class="font-semibold text-gray-900 dark:text-white">{group.name}</div>
										<div class="text-sm text-gray-500 dark:text-gray-400">
											{group.groupType} | {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
										</div>
									</div>
								</div>
								<svg
									class="w-5 h-5 text-gray-400 transition-transform {expandedGroupId === group.id ? 'rotate-180' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>

							{#if expandedGroupId === group.id}
								<div class="border-t dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/30">
									<h4 class="font-medium text-gray-900 dark:text-white mb-3">Members</h4>
									<div class="space-y-2 mb-4">
										{#each group.members as member}
											<div class="flex items-center justify-between py-2 px-3 bg-white dark:bg-gray-800 rounded">
												<div>
													<span class="text-gray-900 dark:text-white">{member.name}</span>
													{#if member.isLeader}
														<span class="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded">
															Leader
														</span>
													{/if}
												</div>
												<form method="POST" action="?/removeUserFromGroup" use:enhance={() => {
													return async ({ update }) => {
														await update();
														invalidateAll();
													};
												}}>
													<input type="hidden" name="userId" value={member.userId} />
													<input type="hidden" name="groupId" value={group.id} />
													<button
														type="submit"
														class="text-red-600 hover:text-red-800 text-sm"
													>
														Remove
													</button>
												</form>
											</div>
										{/each}
									</div>

									<!-- Add member -->
									{#if addingMemberToGroupId === group.id}
										<form
											method="POST"
											action="?/addUserToGroup"
											class="flex items-center space-x-2"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													addingMemberToGroupId = null;
													newMemberUserId = '';
													invalidateAll();
												};
											}}
										>
											<input type="hidden" name="groupId" value={group.id} />
											<select
												name="userId"
												bind:value={newMemberUserId}
												class="flex-1 border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
											>
												<option value="">Select user...</option>
												{#each data.allUsers.filter(u => !group.members.some(m => m.userId === u.id)) as user}
													<option value={user.id}>{user.name} ({user.role})</option>
												{/each}
											</select>
											<label class="flex items-center space-x-1 text-sm">
												<input type="checkbox" name="isLeader" value="true" />
												<span class="text-gray-700 dark:text-gray-300">Leader</span>
											</label>
											<button
												type="submit"
												class="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
											>
												Add
											</button>
											<button
												type="button"
												on:click={() => addingMemberToGroupId = null}
												class="px-3 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white rounded text-sm"
											>
												Cancel
											</button>
										</form>
									{:else}
										<button
											on:click={() => addingMemberToGroupId = group.id}
											class="text-blue-600 dark:text-blue-400 text-sm hover:underline"
										>
											+ Add Member
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- User Grants Tab -->
	{#if activeTab === 'grants'}
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">User Visibility Grants</h2>
				<button
					on:click={() => showGrantModal = true}
					class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
				>
					+ Grant Access
				</button>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-6">
				Grant specific users visibility to other users' data, groups, or roles.
			</p>

			<div class="text-center py-8 text-gray-500 dark:text-gray-400">
				User grants will be listed here once created. Use the button above to grant visibility access.
			</div>
		</div>
	{/if}
</div>

<!-- Create Group Modal -->
{#if showCreateGroupModal}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={resetCreateGroupModal}>
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" on:click|stopPropagation>
			<h2 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Create Visibility Group</h2>
			<form
				method="POST"
				action="?/createGroup"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							resetCreateGroupModal();
							invalidateAll();
						}
					};
				}}
			>
				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Group Name
						</label>
						<input
							type="text"
							name="name"
							bind:value={newGroupName}
							required
							class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
							placeholder="e.g., Downtown Store Team"
						/>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Group Type
						</label>
						<select
							name="groupType"
							bind:value={newGroupType}
							class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
						>
							{#each groupTypes as type}
								<option value={type.value}>{type.label}</option>
							{/each}
						</select>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Description (optional)
						</label>
						<textarea
							name="description"
							bind:value={newGroupDescription}
							rows="2"
							class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
							placeholder="Brief description of this group"
						></textarea>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Initial Members
						</label>
						<div class="max-h-48 overflow-y-auto border dark:border-gray-600 rounded p-2">
							{#each data.allUsers as user}
								<label class="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
									<input
										type="checkbox"
										name="memberIds"
										value={user.id}
										checked={selectedMemberIds.includes(user.id)}
										on:change={() => toggleMember(user.id)}
										class="mr-3"
									/>
									<span class="text-gray-900 dark:text-white">{user.name}</span>
									<span class="ml-2 text-sm text-gray-500 dark:text-gray-400">({user.role})</span>
								</label>
							{/each}
						</div>
					</div>
				</div>

				<div class="flex justify-end space-x-3 mt-6">
					<button
						type="button"
						on:click={resetCreateGroupModal}
						class="px-4 py-2 border dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						Create Group
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Grant Visibility Modal -->
{#if showGrantModal}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" on:click={resetGrantModal}>
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" on:click|stopPropagation>
			<h2 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Grant Visibility Access</h2>
			<form
				method="POST"
				action="?/grantVisibility"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							resetGrantModal();
							invalidateAll();
						}
					};
				}}
			>
				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Grant Visibility To
						</label>
						<select
							name="userId"
							bind:value={grantUserId}
							required
							class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
						>
							<option value="">Select user...</option>
							{#each data.allUsers as user}
								<option value={user.id}>{user.name} ({user.role})</option>
							{/each}
						</select>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Data Category
						</label>
						<select
							name="dataCategory"
							bind:value={grantCategory}
							class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
						>
							{#each Object.entries(categoryNames) as [value, label]}
								<option {value}>{label}</option>
							{/each}
						</select>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Can See Data From
						</label>
						<div class="flex space-x-4 mb-2">
							<label class="flex items-center">
								<input type="radio" bind:group={grantTargetType} value="user" class="mr-2" />
								<span class="text-gray-700 dark:text-gray-300">Specific User</span>
							</label>
							<label class="flex items-center">
								<input type="radio" bind:group={grantTargetType} value="group" class="mr-2" />
								<span class="text-gray-700 dark:text-gray-300">Group</span>
							</label>
							<label class="flex items-center">
								<input type="radio" bind:group={grantTargetType} value="role" class="mr-2" />
								<span class="text-gray-700 dark:text-gray-300">Role</span>
							</label>
						</div>

						{#if grantTargetType === 'user'}
							<select
								name="targetUserId"
								bind:value={grantTargetUserId}
								class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
							>
								<option value="">Select user...</option>
								{#each data.allUsers as user}
									<option value={user.id}>{user.name} ({user.role})</option>
								{/each}
							</select>
						{:else if grantTargetType === 'group'}
							<select
								name="targetGroupId"
								bind:value={grantTargetGroupId}
								class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
							>
								<option value="">Select group...</option>
								{#each data.groups as group}
									<option value={group.id}>{group.name}</option>
								{/each}
							</select>
						{:else}
							<select
								name="targetRole"
								bind:value={grantTargetRole}
								class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
							>
								<option value="">Select role...</option>
								<option value="staff">Staff</option>
								<option value="purchaser">Purchaser</option>
								<option value="manager">Manager</option>
							</select>
						{/if}
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Reason (optional)
						</label>
						<textarea
							name="reason"
							bind:value={grantReason}
							rows="2"
							class="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
							placeholder="Why is this access being granted?"
						></textarea>
					</div>
				</div>

				<div class="flex justify-end space-x-3 mt-6">
					<button
						type="button"
						on:click={resetGrantModal}
						class="px-4 py-2 border dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						Grant Access
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
