<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let loading = false;
	let pin = data.suggestedPin;
</script>

<svelte:head>
	<title>Add User - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/admin/users" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">Add New User</h1>
		</div>

		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
				{form.error}
			</div>
		{/if}

		<div class="card">
			<div class="card-body">
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-6"
				>
					<div class="grid gap-6 lg:grid-cols-2">
						<div>
							<label for="name" class="label">Full Name *</label>
							<input
								type="text"
								id="name"
								name="name"
								required
								class="input"
								placeholder="John Doe"
							/>
						</div>

						<div>
							<label for="username" class="label">Username *</label>
							<input
								type="text"
								id="username"
								name="username"
								required
								pattern="[a-z0-9_]+"
								class="input"
								placeholder="johndoe"
							/>
							<p class="text-xs text-gray-500 mt-1">Lowercase letters, numbers, underscores only</p>
						</div>

						<div>
							<label for="email" class="label">Email *</label>
							<input
								type="email"
								id="email"
								name="email"
								required
								class="input"
								placeholder="john@example.com"
							/>
						</div>

						<div>
							<label for="phone" class="label">Phone</label>
							<input
								type="tel"
								id="phone"
								name="phone"
								class="input"
								placeholder="+1 (555) 123-4567"
							/>
						</div>

						<div>
							<label for="role" class="label">Role *</label>
							<select id="role" name="role" required class="input">
								<option value="staff">Staff</option>
								<option value="purchaser">Purchaser</option>
								<option value="manager">Manager</option>
							</select>
						</div>

						<div>
							<label for="pin" class="label">PIN *</label>
							<input
								type="text"
								id="pin"
								name="pin"
								required
								pattern="\d{4,8}"
								inputmode="numeric"
								bind:value={pin}
								class="input font-mono tracking-widest"
								placeholder="1234"
							/>
							<p class="text-xs text-gray-500 mt-1">4-8 digit PIN for login</p>
						</div>
					</div>

					<div class="flex gap-4 pt-4">
						<a href="/admin/users" class="btn-ghost flex-1 text-center">
							Cancel
						</a>
						<button
							type="submit"
							disabled={loading}
							class="btn-primary flex-1"
						>
							{#if loading}
								<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Creating...
							{:else}
								Create User
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
