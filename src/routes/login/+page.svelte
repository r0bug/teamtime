<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let email = '';
	let pin = '';
	let password = '';
	let loading = false;

	// Mode comes from URL — `?as=staff` or `?as=vendor`. Empty = picker view.
	$: mode = $page.url.searchParams.get('as');
	$: siteTitle = data.siteTitle || 'TeamTime';

	function pickMode(m: 'staff' | 'vendor') {
		const url = new URL($page.url);
		url.searchParams.set('as', m);
		goto(url, { replaceState: false, keepFocus: false });
	}

	function backToPicker() {
		const url = new URL($page.url);
		url.searchParams.delete('as');
		goto(url, { replaceState: false, keepFocus: false });
	}
</script>

<svelte:head>
	<title>Sign in — {siteTitle}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold text-gray-900">{siteTitle}</h1>
			<p class="mt-2 text-gray-600">Mobile Workforce Operations</p>
		</div>

		{#if !mode}
			<!-- Picker view -->
			<div class="card">
				<div class="card-body space-y-4 p-6">
					<h2 class="text-xl font-semibold text-center">Sign in</h2>
					<p class="text-sm text-gray-600 text-center">Pick how you'll be signing in.</p>

					<button
						type="button"
						on:click={() => pickMode('staff')}
						class="w-full flex items-center justify-between p-4 rounded-lg border-2 border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition group touch-target"
					>
						<div class="text-left">
							<div class="text-base font-semibold text-gray-900 group-hover:text-primary-700">Staff</div>
							<div class="text-xs text-gray-500 mt-0.5">Email + PIN</div>
						</div>
						<svg class="w-5 h-5 text-gray-400 group-hover:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
					</button>

					<button
						type="button"
						on:click={() => pickMode('vendor')}
						class="w-full flex items-center justify-between p-4 rounded-lg border-2 border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition group touch-target"
					>
						<div class="text-left">
							<div class="text-base font-semibold text-gray-900 group-hover:text-primary-700">Vendor</div>
							<div class="text-xs text-gray-500 mt-0.5">Email + password</div>
						</div>
						<svg class="w-5 h-5 text-gray-400 group-hover:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
					</button>
				</div>
			</div>
		{:else}
			<!-- Login form (staff or vendor) -->
			<div class="card">
				<div class="card-body space-y-6 p-6">
					<div class="flex items-center justify-between">
						<button type="button" on:click={backToPicker} class="text-sm text-gray-500 hover:text-gray-700">
							← Back
						</button>
						<h2 class="text-xl font-semibold">
							{mode === 'staff' ? 'Staff sign in' : 'Vendor sign in'}
						</h2>
						<span class="w-12"></span>
					</div>

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
							<label for="email" class="label">Email address</label>
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

						{#if mode === 'staff'}
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
								<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Signing in...
							{:else}
								Sign in
							{/if}
						</button>
					</form>

					<div class="text-center">
						{#if mode === 'staff'}
							<a href="/forgot-pin" class="text-sm text-primary-600 hover:text-primary-700">Forgot your PIN?</a>
						{:else}
							<a href="/forgot-password" class="text-sm text-primary-600 hover:text-primary-700">Forgot your password?</a>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<p class="text-center text-sm text-gray-500">
			Need help? Contact your administrator.
		</p>

		<p class="text-center text-xs text-gray-400 mt-4">
			<a href="/privacy" class="hover:text-gray-600 underline">Privacy Policy</a>
			<span class="mx-2">|</span>
			<a href="/terms" class="hover:text-gray-600 underline">Terms of Service</a>
		</p>
	</div>
</div>
