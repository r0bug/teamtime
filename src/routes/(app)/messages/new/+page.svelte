<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let loading = false;
	let isBroadcast = false;
	let selectedUser = data.preselectedUserId || '';
</script>

<svelte:head>
	<title>New Message - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-2xl mx-auto">
		<div class="flex items-center gap-4 mb-6">
			<a href="/messages" class="btn-ghost p-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">New Message</h1>
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
					<div class="flex items-center gap-4">
						<label class="flex items-center gap-2">
							<input
								type="radio"
								name="messageType"
								value="direct"
								checked={!isBroadcast}
								on:change={() => isBroadcast = false}
								class="w-4 h-4"
							/>
							<span>Direct Message</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="radio"
								name="messageType"
								value="broadcast"
								checked={isBroadcast}
								on:change={() => isBroadcast = true}
								class="w-4 h-4"
							/>
							<span>Broadcast to All</span>
						</label>
					</div>

					{#if isBroadcast}
						<input type="hidden" name="isBroadcast" value="on" />
						<div>
							<label for="title" class="label">Broadcast Title</label>
							<input
								type="text"
								id="title"
								name="title"
								class="input"
								placeholder="e.g., Team Announcement"
							/>
						</div>
					{:else}
						<div>
							<label for="recipientId" class="label">Recipient *</label>
							<select id="recipientId" name="recipientId" required class="input" bind:value={selectedUser}>
								<option value="">Select recipient...</option>
								{#each data.users as user}
									<option value={user.id}>{user.name} ({user.role})</option>
								{/each}
							</select>
						</div>
					{/if}

					<div>
						<label for="content" class="label">Message *</label>
						<textarea
							id="content"
							name="content"
							rows="4"
							required
							class="input"
							placeholder="Type your message..."
						></textarea>
					</div>

					<div class="flex gap-4 pt-4">
						<a href="/messages" class="btn-ghost flex-1 text-center">Cancel</a>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{#if loading}
								Sending...
							{:else}
								Send Message
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
