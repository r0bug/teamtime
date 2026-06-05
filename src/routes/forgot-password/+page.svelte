<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	export let form: ActionData;

	let email = '';
	let loading = false;
</script>

<svelte:head>
	<title>Forgot Password - TeamTime</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold text-gray-900">TeamTime</h1>
			<p class="mt-2 text-gray-600">Reset Your Password</p>
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
						<h2 class="text-xl font-semibold">Check your phone &amp; email</h2>
						<p class="mt-2 text-gray-600 text-sm">
							If an account exists for that email, we've texted and emailed a link to reset your password. It expires in 30 minutes.
						</p>
					</div>
				{:else}
					<h2 class="text-xl font-semibold text-center">Forgot your password?</h2>
					<p class="text-gray-600 text-sm text-center">
						Enter your email and we'll text and email you a link to set a new password.
					</p>

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
						<div>
							<label for="email" class="label">Email Address</label>
							<input
								type="email"
								id="email"
								name="email"
								bind:value={email}
								required
								autocomplete="email"
								class="input"
								placeholder="you@example.com"
							/>
						</div>

						<button type="submit" disabled={loading} class="btn-primary w-full touch-target">
							{loading ? 'Sending...' : 'Send Reset Link'}
						</button>
					</form>
				{/if}

				<div class="text-center">
					<a href="/login" class="text-sm text-primary-600 hover:text-primary-700">Back to Login</a>
				</div>
			</div>
		</div>
	</div>
</div>
