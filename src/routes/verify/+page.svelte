<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let code = '';
	let loading = false;
</script>

<svelte:head>
	<title>Verify - TeamTime</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold text-gray-900">TeamTime</h1>
			<p class="mt-2 text-gray-600">Two-Factor Verification</p>
		</div>

		<div class="card">
			<div class="card-body space-y-6">
				<div class="text-center">
					<div class="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
						<svg class="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
						</svg>
					</div>
					<h2 class="text-xl font-semibold">Check Your Email</h2>
					<p class="mt-2 text-gray-600 text-sm">
						We sent a verification code to<br />
						<span class="font-medium">{data.email}</span>
					</p>
				</div>

				{#if form?.error}
					<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
						{form.error}
					</div>
				{/if}

				<form
					method="POST"
					action="?/verify"
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
						<label for="code" class="label">Verification Code</label>
						<input
							type="text"
							id="code"
							name="code"
							bind:value={code}
							required
							inputmode="numeric"
							pattern="[0-9]*"
							maxlength="6"
							autocomplete="one-time-code"
							class="input text-center text-2xl tracking-widest"
							placeholder="000000"
						/>
					</div>

					<button
						type="submit"
						disabled={loading || code.length !== 6}
						class="btn-primary w-full touch-target"
					>
						{#if loading}
							<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Verifying...
						{:else}
							Verify
						{/if}
					</button>
				</form>

				<div class="flex justify-between text-sm">
					<a href="/login" class="text-gray-600 hover:text-gray-900">
						Back to Login
					</a>
					<form method="POST" action="?/resend" use:enhance>
						<button type="submit" class="text-primary-600 hover:text-primary-700">
							Resend Code
						</button>
					</form>
				</div>
			</div>
		</div>
	</div>
</div>
