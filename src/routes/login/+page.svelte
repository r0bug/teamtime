<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let email = '';
	let pin = '';
	let password = '';
	let loading = false;

	$: pinOnlyLogin = data.pinOnlyLogin;
	$: siteTitle = data.siteTitle || 'TeamTime';
</script>

<svelte:head>
	<title>Login - {siteTitle}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold text-gray-900">{siteTitle}</h1>
			<p class="mt-2 text-gray-600">Mobile Workforce Operations</p>
		</div>

		<div class="card">
			<div class="card-body space-y-6">
				<h2 class="text-xl font-semibold text-center">Sign In</h2>

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

					{#if pinOnlyLogin}
						<div>
							<label for="pin" class="label">PIN</label>
							<input
								type="password"
								id="pin"
								name="pin"
								bind:value={pin}
								required
								inputmode="numeric"
								pattern="[0-9]*"
								minlength="4"
								maxlength="8"
								autocomplete="current-password"
								class="input"
								placeholder="Enter your PIN"
							/>
						</div>
					{:else}
						<div>
							<label for="password" class="label">Password</label>
							<input
								type="password"
								id="password"
								name="password"
								bind:value={password}
								required
								autocomplete="current-password"
								class="input"
								placeholder="Enter your password"
							/>
						</div>
					{/if}

					<button
						type="submit"
						disabled={loading}
						class="btn-primary w-full touch-target"
					>
						{#if loading}
							<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Signing in...
						{:else}
							Sign In
						{/if}
					</button>
				</form>

				{#if pinOnlyLogin}
					<div class="text-center">
						<a href="/forgot-pin" class="text-sm text-primary-600 hover:text-primary-700">
							Forgot your PIN?
						</a>
					</div>
				{:else}
					<div class="text-center">
						<a href="/forgot-password" class="text-sm text-primary-600 hover:text-primary-700">
							Forgot your password?
						</a>
					</div>
				{/if}
			</div>
		</div>

		<p class="text-center text-sm text-gray-500">
			Need help? Contact your administrator.
		</p>
	</div>
</div>
