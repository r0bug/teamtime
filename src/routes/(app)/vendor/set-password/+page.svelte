<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let form: ActionData;
</script>

<svelte:head><title>Set your password — Vendor Portal</title></svelte:head>

<div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
	<div class="card w-full max-w-md">
		<div class="card-body space-y-4">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Set your password</h1>
				<p class="text-sm text-gray-600 mt-1">
					You signed in with a temporary password. Choose a new one before continuing.
				</p>
			</div>

			{#if form?.error}
				<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
					{form.error}
				</div>
			{/if}

			<form method="POST" use:enhance class="space-y-3">
				<div>
					<label class="label" for="password">New password</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
						class="input w-full"
					/>
					<p class="text-xs text-gray-500 mt-1">At least 8 characters.</p>
				</div>
				<div>
					<label class="label" for="confirm">Confirm password</label>
					<input
						id="confirm"
						name="confirm"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
						class="input w-full"
					/>
				</div>
				<button type="submit" class="btn btn-primary w-full">Save and continue</button>
			</form>
		</div>
	</div>
</div>
