<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let editingUser: typeof data.users[0] | null = null;
	let loading = false;
	let resetPinUser: { id: string; name: string } | null = null;
	let resetPinValue = '';
	let newPinDisplay: { userName: string; pin: string } | null = null;
	let setPasswordUser: { id: string; name: string } | null = null;
	let passwordValue = '';
	let passwordSuccess: { userName: string } | null = null;

	function openEditModal(user: typeof data.users[0]) {
		editingUser = { ...user };
	}

	function closeEditModal() {
		editingUser = null;
	}

	function openResetPinModal(user: typeof data.users[0]) {
		resetPinUser = { id: user.id, name: user.name };
		// Generate a random 6-digit PIN as default
		resetPinValue = Math.floor(100000 + Math.random() * 900000).toString();
	}

	function closeResetPinModal() {
		resetPinUser = null;
		resetPinValue = '';
	}

	function generateRandomPin() {
		resetPinValue = Math.floor(100000 + Math.random() * 900000).toString();
	}

	function closeNewPinModal() {
		newPinDisplay = null;
	}

	function openSetPasswordModal(user: typeof data.users[0]) {
		setPasswordUser = { id: user.id, name: user.name };
		passwordValue = '';
	}

	function closeSetPasswordModal() {
		setPasswordUser = null;
		passwordValue = '';
	}

	function closePasswordSuccessModal() {
		passwordSuccess = null;
	}

	$: pinIsValid = /^\d{4,8}$/.test(resetPinValue);
	$: passwordIsValid = passwordValue.length >= 8;
</script>

<svelte:head>
	<title>User Management - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex justify-between items-center mb-6">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">User Management</h1>
			<p class="text-gray-600 mt-1">Manage users, roles, and hourly rates</p>
		</div>
		<button
			on:click={() => showCreateModal = true}
			class="btn-primary"
		>
			+ Add User
		</button>
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

	<!-- Users Table -->
	<div class="card">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
						{#if data.showLaborCost}
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" title="Rounded overhead cost per hour (pay + employer match)">Labor Cost</th>
						{/if}
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">2FA</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each data.users as user}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{user.name}</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
							<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{user.username}</td>
							<td class="px-4 py-3 whitespace-nowrap">
								<span class="px-2 py-1 text-xs font-medium rounded-full capitalize
									{user.role === 'admin' ? 'bg-red-100 text-red-800' :
									 user.role === 'manager' ? 'bg-purple-100 text-purple-800' :
									 user.role === 'purchaser' ? 'bg-blue-100 text-blue-800' :
									 'bg-gray-100 text-gray-800'}">
									{user.role}
								</span>
							</td>
							{#if data.showLaborCost}
								<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
									{user.hourlyRate ? `$${user.hourlyRate}/hr` : '-'}
								</td>
							{/if}
							<td class="px-4 py-3 whitespace-nowrap">
								{#if data.isAdmin}
									<form method="POST" action="?/toggleTwoFactor" use:enhance class="inline">
										<input type="hidden" name="userId" value={user.id} />
										<input type="hidden" name="enabled" value={!user.twoFactorEnabled} />
										<button
											type="submit"
											class="text-sm {user.twoFactorEnabled ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}"
											title={user.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
										>
											{#if user.twoFactorEnabled}
												<svg class="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
												</svg>
											{:else}
												<svg class="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
												</svg>
											{/if}
										</button>
									</form>
								{:else}
									<span class="{user.twoFactorEnabled ? 'text-green-600' : 'text-gray-400'}">
										{user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 whitespace-nowrap">
								<span class="px-2 py-1 text-xs font-medium rounded-full {user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
									{user.isActive ? 'Active' : 'Inactive'}
								</span>
							</td>
							<td class="px-4 py-3 whitespace-nowrap space-x-2">
								<button
									on:click={() => openEditModal(user)}
									class="text-primary-600 hover:text-primary-700 text-sm font-medium"
								>
									Edit
								</button>
								{#if data.canResetPins}
									<button
										type="button"
										on:click={() => openResetPinModal(user)}
										class="text-orange-600 hover:text-orange-700 text-sm font-medium"
									>
										Reset PIN
									</button>
								{/if}
								{#if !data.pinOnlyLogin}
									<button
										type="button"
										on:click={() => openSetPasswordModal(user)}
										class="text-purple-600 hover:text-purple-700 text-sm font-medium"
									>
										Set Password
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Create User Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Create New User</h2>
				<form method="POST" action="?/createUser" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						showCreateModal = false;
						await update();
					};
				}} class="space-y-4">
					<div>
						<label for="name" class="label">Name</label>
						<input type="text" id="name" name="name" required class="input" />
					</div>
					<div>
						<label for="email" class="label">Email</label>
						<input type="email" id="email" name="email" required class="input" />
					</div>
					<div>
						<label for="username" class="label">Username</label>
						<input type="text" id="username" name="username" required class="input" />
					</div>
					<div>
						<label for="phone" class="label">Phone</label>
						<input type="tel" id="phone" name="phone" class="input" />
					</div>
					<div>
						<label for="role" class="label">Role</label>
						<select id="role" name="role" class="input">
							<option value="staff">Staff</option>
							<option value="purchaser">Purchaser</option>
							<option value="manager">Manager</option>
							{#if data.isAdmin}
								<option value="admin">Admin</option>
							{/if}
						</select>
					</div>
					<div>
						<label for="hourlyRate" class="label">Labor Cost ($/hr)</label>
						<input type="number" id="hourlyRate" name="hourlyRate" step="1" min="0" class="input" placeholder="0" />
						<p class="text-xs text-gray-500 mt-1">Rounded overhead cost (pay + employer match)</p>
					</div>
					<div>
						<label for="pin" class="label">PIN (4-8 digits)</label>
						<input type="password" id="pin" name="pin" required inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" class="input" />
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={() => showCreateModal = false} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Creating...' : 'Create User'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Edit User Modal -->
{#if editingUser}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Edit User</h2>
				<form method="POST" action="?/updateUser" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						editingUser = null;
						await update();
					};
				}} class="space-y-4">
					<input type="hidden" name="userId" value={editingUser.id} />
					<div>
						<label for="edit-name" class="label">Name</label>
						<input type="text" id="edit-name" name="name" bind:value={editingUser.name} required class="input" />
					</div>
					<div>
						<label for="edit-email" class="label">Email</label>
						<input type="email" id="edit-email" name="email" bind:value={editingUser.email} required class="input" />
					</div>
					<div>
						<label for="edit-phone" class="label">Phone</label>
						<input type="tel" id="edit-phone" name="phone" bind:value={editingUser.phone} class="input" />
					</div>
					<div>
						<label for="edit-role" class="label">Role</label>
						<select id="edit-role" name="role" bind:value={editingUser.role} class="input">
							<option value="staff">Staff</option>
							<option value="purchaser">Purchaser</option>
							<option value="manager">Manager</option>
							{#if data.isAdmin}
								<option value="admin">Admin</option>
							{/if}
						</select>
					</div>
					<div>
						<label for="edit-hourlyRate" class="label">Labor Cost ($/hr)</label>
						<input type="number" id="edit-hourlyRate" name="hourlyRate" bind:value={editingUser.hourlyRate} step="1" min="0" class="input" placeholder="0" />
						<p class="text-xs text-gray-500 mt-1">Rounded overhead cost (pay + employer match)</p>
					</div>
					<div>
						<label class="flex items-center">
							<input type="checkbox" name="isActive" value="true" checked={editingUser.isActive} class="mr-2" />
							<span>Active</span>
						</label>
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={closeEditModal} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Saving...' : 'Save Changes'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Reset PIN Modal -->
{#if resetPinUser}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-sm w-full">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-2">Reset PIN</h2>
				<p class="text-sm text-gray-600 mb-4">Set a new PIN for <strong>{resetPinUser.name}</strong></p>

				<form method="POST" action="?/resetPin" use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'success') {
							newPinDisplay = { userName: resetPinUser?.name || 'User', pin: resetPinValue };
							closeResetPinModal();
						}
						await update();
					};
				}}>
					<input type="hidden" name="userId" value={resetPinUser.id} />

					<div class="mb-4">
						<label for="newPin" class="label">New PIN (4-8 digits)</label>
						<div class="flex space-x-2">
							<input
								type="text"
								id="newPin"
								name="pin"
								bind:value={resetPinValue}
								inputmode="numeric"
								pattern="[0-9]*"
								minlength="4"
								maxlength="8"
								class="input flex-1 text-center text-2xl font-mono tracking-widest"
								placeholder="123456"
							/>
							<button
								type="button"
								on:click={generateRandomPin}
								class="btn-secondary px-3"
								title="Generate random PIN"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
								</svg>
							</button>
						</div>
						{#if resetPinValue && !pinIsValid}
							<p class="text-red-500 text-xs mt-1">PIN must be 4-8 digits</p>
						{/if}
					</div>

					<div class="flex space-x-3">
						<button type="button" on:click={closeResetPinModal} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading || !pinIsValid} class="btn-primary flex-1">
							{loading ? 'Saving...' : 'Save PIN'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- PIN Success Modal -->
{#if newPinDisplay}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-sm w-full">
			<div class="p-6 text-center">
				<div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
					<svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">PIN Updated Successfully</h3>
				<p class="text-sm text-gray-500 mb-4">New PIN for {newPinDisplay.userName}:</p>
				<div class="bg-gray-100 rounded-lg p-4 mb-4">
					<p class="text-3xl font-mono font-bold text-gray-900 tracking-widest">{newPinDisplay.pin}</p>
				</div>
				<p class="text-xs text-gray-500 mb-4">
					Please share this PIN with the user securely.
				</p>
				<button
					on:click={closeNewPinModal}
					class="btn-primary w-full"
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Set Password Modal -->
{#if setPasswordUser}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-sm w-full">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-2">Set Password</h2>
				<p class="text-sm text-gray-600 mb-4">Set a password for <strong>{setPasswordUser.name}</strong></p>

				<form method="POST" action="?/setPassword" use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'success') {
							passwordSuccess = { userName: setPasswordUser?.name || 'User' };
							closeSetPasswordModal();
						}
						await update();
					};
				}}>
					<input type="hidden" name="userId" value={setPasswordUser.id} />

					<div class="mb-4">
						<label for="password" class="label">New Password (min 8 characters)</label>
						<input
							type="password"
							id="password"
							name="password"
							bind:value={passwordValue}
							minlength="8"
							class="input"
							placeholder="Enter password"
						/>
						{#if passwordValue && !passwordIsValid}
							<p class="text-red-500 text-xs mt-1">Password must be at least 8 characters</p>
						{/if}
					</div>

					<div class="flex space-x-3">
						<button type="button" on:click={closeSetPasswordModal} class="btn-secondary flex-1">
							Cancel
						</button>
						<button type="submit" disabled={loading || !passwordIsValid} class="btn-primary flex-1">
							{loading ? 'Saving...' : 'Save Password'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Password Success Modal -->
{#if passwordSuccess}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-sm w-full">
			<div class="p-6 text-center">
				<div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
					<svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">Password Set Successfully</h3>
				<p class="text-sm text-gray-500 mb-4">
					Password has been set for {passwordSuccess.userName}. They can now log in with their password.
				</p>
				<button
					on:click={closePasswordSuccessModal}
					class="btn-primary w-full"
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}
