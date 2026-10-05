<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { notify } from '$lib/notify';
	import type { PageData } from './$types';

	export let data: PageData;

	$: req = data.request;
	let submitting = false;

	function fmt(start: string | Date, end: string | Date): string {
		const s = new Date(start);
		const e = new Date(end);
		const t = (d: Date) =>
			d.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				timeZone: 'America/Los_Angeles'
			});
		return `${s.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			timeZone: 'America/Los_Angeles'
		})}, ${t(s)}–${t(e)}`;
	}

	const handle: SubmitFunction = () => {
		submitting = true;
		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'success') {
				const payload = result.data as { message?: string } | undefined;
				notify.success(payload?.message || 'Done');
			} else if (result.type === 'failure') {
				const payload = result.data as { error?: string } | undefined;
				notify.error(payload?.error || 'Something went wrong');
			}
			await update();
		};
	};
</script>

<svelte:head><title>Cover a shift</title></svelte:head>

<div class="max-w-lg mx-auto">
	<div class="card">
		<div class="card-header">
			<h1 class="text-xl font-bold text-gray-900">Cover a shift</h1>
			{#if req.requestedByName}
				<p class="text-sm text-gray-600 mt-1">{req.requestedByName} can't work this one.</p>
			{/if}
		</div>
		<div class="card-body space-y-4">
			<div>
				<div class="text-lg font-semibold text-gray-900">{fmt(req.startTime, req.endTime)}</div>
				{#if req.locationName}
					<div class="text-gray-600">{req.locationName}</div>
				{/if}
			</div>

			{#if req.status === 'filled'}
				<div class="bg-gray-50 rounded-lg p-4 text-center">
					<p class="font-medium text-gray-900">
						{req.filledByName ? `${req.filledByName} picked this up.` : 'This shift is covered.'}
					</p>
				</div>
			{:else if req.status !== 'open'}
				<div class="bg-gray-50 rounded-lg p-4 text-center">
					<p class="font-medium text-gray-900">This offer is closed ({req.status}).</p>
				</div>
			{:else if data.myResponse === 'declined'}
				<div class="bg-gray-50 rounded-lg p-4 text-center">
					<p class="text-gray-700">You passed on this one.</p>
				</div>
			{:else if !data.canClaim}
				<p class="text-sm text-gray-500">You're viewing this as a manager — only invited staff can claim.</p>
			{:else}
				<p class="text-sm text-gray-600">First to claim gets it.</p>
				<div class="flex gap-2">
					<form method="POST" action="?/claim" use:enhance={handle} class="flex-1">
						<button type="submit" class="btn-primary w-full touch-target" disabled={submitting}>
							{submitting ? 'Claiming…' : "I'll take it"}
						</button>
					</form>
					<form method="POST" action="?/decline" use:enhance={handle}>
						<button type="submit" class="btn-secondary touch-target" disabled={submitting}>
							Can't
						</button>
					</form>
				</div>
			{/if}

			<a href="/schedule" class="block text-center text-sm text-primary-600 hover:text-primary-700">
				Back to schedule
			</a>
		</div>
	</div>
</div>
