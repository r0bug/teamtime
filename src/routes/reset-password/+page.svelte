<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let password = '';
	let confirm = '';
	let loading = false;
</script>

<svelte:head>
	<title>Reset Password - TeamTime</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold text-gray-900">TeamTime</h1>
			<p class="mt-2 text-gray-600">Set a new password</p>
		</div>

		<div class="card">
			<div class="card-body space-y-6">
				{#if form?.success}
					<div class="text-center">
						<div class="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
							<svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
						</div>
						<h2 class="text-xl font-semibold">Password updated</h2>
						<p class="mt-2 text-gray-600 text-sm">You can now sign in with your new password.</p>
						<a href="/login" class="btn-primary w-full touch-target mt-6 inline-block">Go to Login</a>
					</div>
				{:else if !data.valid}
					<div class="text-center">
						<h2 class="text-xl font-semibold">Link expired or invalid</h2>
						<p class="mt-2 text-gray-600 text-sm">
							This reset link is no longer valid. Request a new one and use it within 30 minutes.
						</p>
						<a href="/forgot-password" class="btn-primary w-full touch-target mt-6 inline-block">Request a new link</a>
					</div>
				{:else}
					<h2 class="text-xl font-semibold text-center">Choose a new password</h2>

					{#if form?.error}
						<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
							{form.error}
						</div>
					{/if}

					<form
						method="POST"
						use:enhance={() => {
							loading = true;
							return async ({ update }) => {
								loading = false;
								await update();
							};
						}}
						class="space-y-4"
					>
						<input type="hidden" name="token" value={data.token} />
						<div>
							<label for="password" class="label">New password</label>
							<input
								type="password"
								id="password"
								name="password"
								bind:value={password}
								required
								minlength="8"
								autocomplete="new-password"
								class="input"
								placeholder="At least 8 characters"
							/>
						</div>
						<div>
							<label for="confirm" class="label">Confirm password</label>
							<input
								type="password"
								id="confirm"
								name="confirm"
								bind:value={confirm}
								required
								minlength="8"
								autocomplete="new-password"
								class="input"
							/>
						</div>

						<button type="submit" disabled={loading} class="btn-primary w-full touch-target">
							{loading ? 'Saving...' : 'Set new password'}
						</button>
					</form>
				{/if}
			</div>
		</div>
	</div>
</div>
