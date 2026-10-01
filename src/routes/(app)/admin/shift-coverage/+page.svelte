<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { notify } from '$lib/notify';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	$: pending = data.pending;
	$: openRequests = data.open;
	$: recent = data.recent;

	// Per-request UI state
	let selected: Record<string, Set<string>> = {};
	let messages: Record<string, string> = {};
	let deadlines: Record<string, string> = {};
	let denyingId: string | null = null;
	let cancellingId: string | null = null;
	let submitting = false;
	let denyForm: HTMLFormElement | undefined;
	let cancelForm: HTMLFormElement | undefined;

	// Seed selections with everyone eligible, once per request.
	$: for (const req of pending) {
		if (!(req.id in selected)) {
			selected[req.id] = new Set(
				(data.candidates[req.id] ?? []).filter((c) => c.eligible).map((c) => c.userId)
			);
		}
		if (!(req.id in messages)) messages[req.id] = data.previews[req.id] ?? '';
		if (!(req.id in deadlines)) deadlines[req.id] = data.defaultRespondBy[req.id] ?? '';
	}

	function toggle(requestId: string, userId: string) {
		const set = new Set(selected[requestId] ?? []);
		if (set.has(userId)) set.delete(userId);
		else set.add(userId);
		selected = { ...selected, [requestId]: set };
	}

	function selectAll(requestId: string, eligible: boolean) {
		const set = eligible
			? new Set((data.candidates[requestId] ?? []).filter((c) => c.eligible).map((c) => c.userId))
			: new Set<string>();
		selected = { ...selected, [requestId]: set };
	}

	// twilio.ts prepends this to every outbound message, so it counts toward
	// the segment total the manager is deciding about.
	const SMS_HEADER = 'Yakima Finds Communiqué: ';
	function segments(body: string): number {
		const len = SMS_HEADER.length + body.length;
		return len === 0 ? 0 : len <= 160 ? 1 : Math.ceil(len / 153);
	}

	function countdown(iso: string | Date | null): string {
		if (!iso) return '—';
		const ms = new Date(iso).getTime() - Date.now();
		if (ms <= 0) return 'now';
		const hours = Math.floor(ms / 3_600_000);
		const mins = Math.floor((ms % 3_600_000) / 60_000);
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	}

	function fmt(start: string | Date, end: string | Date): string {
		const s = new Date(start);
		const e = new Date(end);
		const day = s.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'numeric',
			day: 'numeric',
			timeZone: 'America/Los_Angeles'
		});
		const t = (d: Date) =>
			d.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				timeZone: 'America/Los_Angeles'
			});
		return `${day} ${t(s)}–${t(e)}`;
	}

	const typeLabel: Record<string, string> = {
		sick: 'Sick',
		personal: 'Personal',
		appointment: 'Appointment',
		trade: 'Trade',
		open_shift: 'Open shift'
	};

	function tallyFor(requestId: string) {
		const invited = data.recipients.filter((r) => r.requestId === requestId);
		const replies = data.responses.filter((r) => r.requestId === requestId);
		return {
			invited,
			accepted: replies.filter((r) => r.status === 'accepted').length,
			declined: replies.filter((r) => r.status === 'declined').length,
			replied: replies.length,
			failed: invited.filter((r) => r.deliveryStatus === 'failed' || r.deliveryStatus === 'skipped')
		};
	}

	const handleResult: SubmitFunction = () => {
		submitting = true;
		return async ({ result, update }) => {
			submitting = false;
			denyingId = null;
			cancellingId = null;
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

<svelte:head><title>Shift Coverage — Admin</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">Shift Coverage</h1>
		<p class="text-sm text-gray-500 mt-1">
			Review call-outs, pick who to text, and track who picked up the shift.
		</p>
	</div>

	{#if data.phoneless.length > 0}
		<div class="card border-l-4 border-yellow-400">
			<div class="card-body">
				<p class="text-sm text-gray-700">
					<span class="font-medium">Unreachable staff:</span>
					{data.phoneless.join(', ')} — no phone number on file, so they can't be texted for coverage.
					<a href="/admin/users" class="text-primary-600 hover:text-primary-700">Add numbers</a>
				</p>
			</div>
		</div>
	{/if}

	<!-- ================= NEEDS ACTION ================= -->
	<section>
		<h2 class="text-lg font-semibold text-gray-900 mb-3">
			Needs action
			{#if pending.length}<span class="badge-warning ml-2">{pending.length}</span>{/if}
		</h2>

		{#if pending.length === 0}
			<EmptyState title="Nothing waiting" message="No one has called out. New requests show up here." />
		{:else}
			<div class="space-y-4">
				{#each pending as req (req.id)}
					{@const candidates = data.candidates[req.id] ?? []}
					{@const chosen = selected[req.id] ?? new Set()}
					<div class="card">
						<div class="card-header flex flex-wrap items-start justify-between gap-2">
							<div>
								<div class="flex items-center gap-2">
									<span class="badge-gray">{typeLabel[req.requestType] ?? req.requestType}</span>
									<span class="font-semibold text-gray-900">{fmt(req.startTime, req.endTime)}</span>
									{#if req.locationName}<span class="text-sm text-gray-500">@ {req.locationName}</span>{/if}
								</div>
								<p class="text-sm text-gray-600 mt-1">
									{req.requestedByName ?? 'Someone'} can't work this shift
								</p>
								{#if req.reason}
									<p class="text-sm text-gray-500 mt-1 italic">"{req.reason}"</p>
								{/if}
							</div>
							<div class="text-right">
								<div class="text-xs uppercase tracking-wide text-gray-400">Starts in</div>
								<div class="text-lg font-semibold text-gray-900">{countdown(req.startTime)}</div>
							</div>
						</div>

						<form method="POST" action="?/broadcast" use:enhance={handleResult} class="card-body space-y-4">
							<input type="hidden" name="requestId" value={req.id} />

							<!-- Eligible staff selector -->
							<div>
								<div class="flex items-center justify-between mb-2">
									<span class="label mb-0">Who should we text?</span>
									<div class="flex gap-2 text-sm">
										<button type="button" class="btn-ghost btn-sm" on:click={() => selectAll(req.id, true)}>
											All eligible
										</button>
										<button type="button" class="btn-ghost btn-sm" on:click={() => selectAll(req.id, false)}>
											None
										</button>
									</div>
								</div>

								<div class="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
									{#each candidates as c (c.userId)}
										<label
											class="flex items-start gap-3 p-3 touch-target {c.eligible
												? 'hover:bg-gray-50 cursor-pointer'
												: 'bg-gray-50 opacity-60 cursor-not-allowed'}"
										>
											<input
												type="checkbox"
												name="userIds"
												value={c.userId}
												disabled={!c.eligible}
												checked={chosen.has(c.userId)}
												on:change={() => toggle(req.id, c.userId)}
												class="mt-0.5"
											/>
											<span class="flex-1 min-w-0">
												<span class="font-medium text-gray-900">{c.name}</span>
												{#if c.hardBlocks.length}
													<span class="block text-xs text-red-600 mt-0.5">
														{c.hardBlocks.join(' · ')}
													</span>
												{/if}
												{#if c.warnings.length}
													<span class="block text-xs text-yellow-700 mt-0.5">
														{c.warnings.join(' · ')}
													</span>
												{/if}
											</span>
										</label>
									{:else}
										<p class="p-3 text-sm text-gray-500">No other staff to ask.</p>
									{/each}
								</div>
							</div>

							<!-- Message + deadline -->
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="label" for="msg-{req.id}">Message</label>
									<textarea
										id="msg-{req.id}"
										name="message"
										rows="3"
										class="input"
										bind:value={messages[req.id]}
									></textarea>
									<p class="text-xs text-gray-500 mt-1">
										{SMS_HEADER.length + (messages[req.id]?.length ?? 0)} chars ·
										{segments(messages[req.id] ?? '')} segment(s) ·
										{chosen.size} recipient(s)
										<span class="text-gray-400">(header included)</span>
									</p>
								</div>
								<div>
									<label class="label" for="deadline-{req.id}">Replies close</label>
									<input
										id="deadline-{req.id}"
										type="datetime-local"
										name="respondBy"
										class="input"
										bind:value={deadlines[req.id]}
									/>
									<p class="text-xs text-gray-500 mt-1">
										Code <span class="font-mono">{req.claimCode ?? '—'}</span> · first reply wins
									</p>
								</div>
							</div>

							<div class="flex flex-wrap gap-2">
								<button type="submit" class="btn-primary" disabled={submitting || chosen.size === 0}>
									Send to {chosen.size} staff
								</button>
								<button type="button" class="btn-secondary" on:click={() => (denyingId = req.id)}>
									Deny
								</button>
							</div>
						</form>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- ================= OUT FOR COVERAGE ================= -->
	<section>
		<h2 class="text-lg font-semibold text-gray-900 mb-3">Out for coverage</h2>

		{#if openRequests.length === 0}
			<EmptyState title="Nothing pending" message="Requests you've texted out will appear here." />
		{:else}
			<div class="space-y-4">
				{#each openRequests as req (req.id)}
					{@const tally = tallyFor(req.id)}
					<div class="card">
						<div class="card-header flex flex-wrap items-start justify-between gap-2">
							<div>
								<span class="font-semibold text-gray-900">{fmt(req.startTime, req.endTime)}</span>
								{#if req.locationName}<span class="text-sm text-gray-500 ml-1">@ {req.locationName}</span>{/if}
								<p class="text-sm text-gray-600 mt-1">
									For {req.requestedByName ?? 'someone'} · code
									<span class="font-mono">{req.claimCode}</span>
								</p>
							</div>
							<div class="text-right text-sm">
								<div class="text-gray-900 font-medium">
									{tally.replied} of {tally.invited.length} replied
								</div>
								<div class="text-gray-500">closes in {countdown(req.respondBy)}</div>
							</div>
						</div>
						<div class="card-body space-y-3">
							{#if tally.failed.length}
								<p class="text-sm text-red-600">
									Couldn't reach: {tally.failed.map((f) => f.name).join(', ')}
								</p>
							{/if}

							<div class="flex flex-wrap gap-2">
								{#each tally.invited as r (r.userId)}
									{@const reply = data.responses.find(
										(x) => x.requestId === req.id && x.userId === r.userId
									)}
									<span
										class="badge-{reply?.status === 'accepted'
											? 'success'
											: reply?.status === 'declined'
												? 'gray'
												: r.deliveryStatus === 'sent'
													? 'primary'
													: 'danger'}"
									>
										{r.name}{reply?.status === 'declined' ? ' · passed' : ''}
									</span>
								{/each}
							</div>

							<div class="flex flex-wrap gap-2 pt-1">
								<form method="POST" action="?/assign" use:enhance={handleResult} class="flex gap-2">
									<input type="hidden" name="requestId" value={req.id} />
									<select name="userId" class="input py-1" required>
										<option value="">Assign directly…</option>
										{#each tally.invited as r (r.userId)}
											<option value={r.userId}>{r.name}</option>
										{/each}
									</select>
									<button type="submit" class="btn-secondary btn-sm" disabled={submitting}>Assign</button>
								</form>
								<button type="button" class="btn-ghost btn-sm" on:click={() => (cancellingId = req.id)}>
									Cancel request
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- ================= RECENT ================= -->
	<section>
		<h2 class="text-lg font-semibold text-gray-900 mb-3">Recent</h2>
		{#if recent.length === 0}
			<EmptyState title="Nothing yet" message="Resolved requests show up here." />
		{:else}
			<div class="card">
				<div class="divide-y divide-gray-100">
					{#each recent as req (req.id)}
						<div class="flex flex-wrap items-center justify-between gap-2 p-3">
							<div>
								<span class="font-medium text-gray-900">{fmt(req.startTime, req.endTime)}</span>
								{#if req.locationName}<span class="text-sm text-gray-500 ml-1">@ {req.locationName}</span>{/if}
								<p class="text-sm text-gray-500">
									{req.requestedByName ?? 'Someone'}
									{#if req.filledByName}→ covered by {req.filledByName}{/if}
								</p>
							</div>
							<StatusBadge status={req.status} />
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>
</div>

<!-- Hidden forms so the confirm dialogs go through use:enhance like every
     other mutation on this page, rather than a full-page DOM submit. -->
<form method="POST" action="?/deny" use:enhance={handleResult} bind:this={denyForm} class="hidden">
	<input type="hidden" name="requestId" value={denyingId ?? ''} />
</form>
<form method="POST" action="?/cancel" use:enhance={handleResult} bind:this={cancelForm} class="hidden">
	<input type="hidden" name="requestId" value={cancellingId ?? ''} />
</form>

<ConfirmDialog
	open={denyingId !== null}
	title="Deny this request?"
	message="The staff member will still be on the schedule for that shift."
	confirmLabel="Deny"
	on:cancel={() => (denyingId = null)}
	on:confirm={() => denyForm?.requestSubmit()}
/>

<ConfirmDialog
	open={cancellingId !== null}
	title="Cancel this request?"
	message="Staff who were texted won't be notified automatically."
	confirmLabel="Cancel request"
	on:cancel={() => (cancellingId = null)}
	on:confirm={() => cancelForm?.requestSubmit()}
/>
