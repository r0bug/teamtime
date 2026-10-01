<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Modal from '$lib/components/Modal.svelte';
	import { notify } from '$lib/notify';
	import type { PageData } from './$types';

	export let data: PageData;

	$: shifts = data.shifts;
	$: myUpcomingShifts = data.myUpcomingShifts;
	$: currentUserId = data.currentUserId;
	$: user = data.user;
	$: isManager = user?.role === 'manager' || user?.role === 'admin';

	// Use the server-provided start date to ensure timezone consistency
	$: startDateFromServer = data.startDate;

	// --- Shift coverage ---
	$: myRequests = data.myRequests ?? [];
	$: lockedShiftIds = new Set(data.lockedShiftIds ?? []);
	$: requestableShifts = myUpcomingShifts.filter((s) => !lockedShiftIds.has(s.id));

	let coverageOpen = false;
	let selectedShiftId = '';
	let requestType = 'sick';
	let reason = '';
	let submitting = false;

	const REASONS = [
		{ value: 'sick', label: "I'm sick" },
		{ value: 'personal', label: 'Personal' },
		{ value: 'appointment', label: 'Appointment' },
		{ value: 'trade', label: 'Want to trade' }
	];

	function openCoverage() {
		// Default to the soonest shift — the common case is today or tomorrow.
		selectedShiftId = requestableShifts[0]?.id ?? '';
		requestType = 'sick';
		reason = '';
		coverageOpen = true;
	}

	$: selectedShift = requestableShifts.find((s) => s.id === selectedShiftId);

	const statusLabel: Record<string, string> = {
		pending_approval: 'Waiting on a manager',
		open: 'Out to the team',
		filled: 'Covered',
		expired: 'Expired — still yours',
		cancelled: 'Cancelled',
		denied: 'Denied'
	};
	const statusClass: Record<string, string> = {
		pending_approval: 'badge-warning',
		open: 'badge-primary',
		filled: 'badge-success',
		expired: 'badge-danger',
		cancelled: 'badge-gray',
		denied: 'badge-gray'
	};

	function shiftLabel(start: string | Date, end: string | Date): string {
		const s = new Date(start);
		return `${s.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'America/Los_Angeles'
		})} ${formatTime(start)}–${formatTime(end)}`;
	}

	const handleCoverage: SubmitFunction = () => {
		submitting = true;
		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'success') {
				const payload = result.data as { message?: string } | undefined;
				notify.success(payload?.message || 'Request sent');
				coverageOpen = false;
			} else if (result.type === 'failure') {
				const payload = result.data as { error?: string } | undefined;
				notify.error(payload?.error || 'Could not send that request');
			}
			await update();
		};
	};

	$: weekStart = (() => {
		// Parse the server-provided Pacific date
		const [year, month, day] = startDateFromServer.split('-').map(Number);
		return new Date(year, month - 1, day);
	})();

	$: weekDays = (() => {
		const days = [];
		for (let i = 0; i < 7; i++) {
			const day = new Date(weekStart);
			day.setDate(weekStart.getDate() + i);
			days.push(day);
		}
		return days;
	})();

	function getShiftsForDay(date: Date) {
		return shifts.filter(shift => {
			const shiftDate = new Date(shift.startTime);
			// Compare dates in Pacific Time
			const shiftDay = shiftDate.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
			const targetDay = date.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
			return shiftDay === targetDay;
		});
	}

	function formatTime(dateStr: string | Date) {
		const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
	}

	// Week navigation must round-trip to the server: the load only queries the
	// requested window, so paging weeks client-side (the old weekOffset
	// approach) showed empty days for any week but the current one.
	function navigateWeek(delta: number) {
		const target = new Date(weekStart);
		target.setDate(target.getDate() + delta * 7);
		const y = target.getFullYear();
		const m = String(target.getMonth() + 1).padStart(2, '0');
		const d = String(target.getDate()).padStart(2, '0');
		goto(`/schedule?start=${y}-${m}-${d}`);
	}

	function goToToday() {
		goto('/schedule');
	}

	function isMyShift(userId: string) {
		return userId === currentUserId;
	}
</script>

<svelte:head>
	<title>Schedule - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">Schedule</h1>
		{#if isManager}
			<a href="/schedule/manage" class="btn-primary">
				Manage Schedule
			</a>
		{/if}
	</div>

	<!-- Week Navigation -->
	<div class="flex items-center justify-between mb-4">
		<button on:click={() => navigateWeek(-1)} class="btn-ghost">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<div class="flex items-center gap-3">
			<h2 class="text-lg font-semibold">
				{weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} -
				{new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
			</h2>
			<button on:click={goToToday} class="btn-ghost btn-sm text-sm">Today</button>
		</div>
		<button on:click={() => navigateWeek(1)} class="btn-ghost">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</button>
	</div>

	<!-- Week View -->
	<div class="grid grid-cols-7 gap-1 lg:gap-2">
		{#each weekDays as day}
			{@const dayShifts = getShiftsForDay(day)}
			{@const isToday = day.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) === new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}
			<div class="min-h-[120px] lg:min-h-[200px]">
				<div class="text-center py-2 font-medium {isToday ? 'bg-primary-100 text-primary-700 rounded-t-lg' : 'bg-gray-100'}">
					<div class="text-xs lg:text-sm">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
					<div class="text-lg lg:text-xl">{day.getDate()}</div>
				</div>
				<div class="bg-white border border-gray-200 rounded-b-lg p-1 lg:p-2 space-y-1 max-h-[300px] overflow-y-auto">
					{#each dayShifts as shift}
						{@const isMine = isMyShift(shift.userId)}
						<div class="{isMine ? 'bg-primary-100 border-primary-600' : 'bg-gray-50 border-gray-300'} border-l-4 p-1 lg:p-2 rounded text-xs lg:text-sm">
							<div class="font-medium truncate {isMine ? 'text-primary-800' : 'text-gray-700'}">
								{shift.userName}
							</div>
							<div class="text-gray-600 truncate">
								{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
							</div>
							{#if shift.locationName}
								<div class="text-gray-500 truncate text-[10px] lg:text-xs">{shift.locationName}</div>
							{/if}
						</div>
					{:else}
						<div class="text-gray-400 text-xs text-center py-2">No shifts</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- Shift coverage -->
	<div class="mt-8 card">
		<div class="card-body">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 class="text-lg font-semibold">Can't work a shift?</h3>
					<p class="text-sm text-gray-600 mt-1">
						Tell us which one and a manager will text the team to find cover.
					</p>
				</div>
				<button
					type="button"
					class="btn-primary touch-target"
					on:click={openCoverage}
					disabled={requestableShifts.length === 0}
				>
					Request coverage
				</button>
			</div>
			{#if requestableShifts.length === 0 && myUpcomingShifts.length > 0}
				<p class="text-sm text-gray-500 mt-3">
					You've already got a request open for all your upcoming shifts.
				</p>
			{:else if myUpcomingShifts.length === 0}
				<p class="text-sm text-gray-500 mt-3">You have no upcoming shifts.</p>
			{/if}

			{#if myRequests.length > 0}
				<div class="mt-4 border-t border-gray-100 pt-4">
					<h4 class="text-sm font-medium text-gray-700 mb-2">My requests</h4>
					<div class="space-y-2">
						{#each myRequests as req (req.id)}
							<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
								<span class="text-gray-900">{shiftLabel(req.startTime, req.endTime)}</span>
								<span class="flex items-center gap-2">
									{#if req.status === 'filled' && req.filledByName}
										<span class="text-gray-500">{req.filledByName} took it</span>
									{/if}
									<span class={statusClass[req.status] ?? 'badge-gray'}>
										{statusLabel[req.status] ?? req.status}
									</span>
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- My Upcoming Shifts List (Mobile Friendly) -->
	<div class="mt-8 lg:hidden">
		<h3 class="text-lg font-semibold mb-4">My Upcoming Shifts</h3>
		<div class="space-y-3">
			{#each myUpcomingShifts as shift}
				<div class="card">
					<div class="card-body">
						<div class="flex justify-between items-start">
							<div>
								<div class="font-medium">
									{new Date(shift.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}
								</div>
								<div class="text-gray-600">
									{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
								</div>
							</div>
							{#if shift.locationName}
								<span class="badge-primary">{shift.locationName}</span>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<p class="text-gray-500 text-center py-4">No upcoming shifts</p>
			{/each}
		</div>
	</div>

	<!-- Legend -->
	<div class="mt-6 flex flex-wrap gap-4 text-sm text-gray-600">
		<div class="flex items-center gap-2">
			<div class="w-4 h-4 bg-primary-100 border-l-4 border-primary-600 rounded"></div>
			<span>My shifts</span>
		</div>
		<div class="flex items-center gap-2">
			<div class="w-4 h-4 bg-gray-50 border-l-4 border-gray-300 rounded"></div>
			<span>Other staff</span>
		</div>
	</div>
</div>

<Modal open={coverageOpen} title="Request coverage" on:close={() => (coverageOpen = false)}>
	<form method="POST" action="?/requestCoverage" use:enhance={handleCoverage} class="space-y-4">
		<div>
			<label class="label" for="coverage-shift">Which shift?</label>
			<select id="coverage-shift" name="shiftId" class="input" bind:value={selectedShiftId} required>
				{#each requestableShifts as shift (shift.id)}
					<option value={shift.id}>
						{shiftLabel(shift.startTime, shift.endTime)}{shift.locationName
							? ` @ ${shift.locationName}`
							: ''}
					</option>
				{/each}
			</select>
		</div>

		<div>
			<span class="label">Why?</span>
			<div class="grid grid-cols-2 gap-2">
				{#each REASONS as option (option.value)}
					<label
						class="flex items-center gap-2 border rounded-lg p-3 touch-target cursor-pointer {requestType ===
						option.value
							? 'border-primary-600 bg-primary-50'
							: 'border-gray-200 hover:bg-gray-50'}"
					>
						<input
							type="radio"
							name="requestType"
							value={option.value}
							bind:group={requestType}
						/>
						<span class="text-sm">{option.label}</span>
					</label>
				{/each}
			</div>
		</div>

		<div>
			<label class="label" for="coverage-reason">Anything the manager should know? (optional)</label>
			<textarea
				id="coverage-reason"
				name="reason"
				rows="2"
				class="input"
				placeholder="Only managers see this"
				bind:value={reason}
			></textarea>
		</div>

		{#if selectedShift}
			<div class="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
				You're asking to be covered for
				<span class="font-medium">{shiftLabel(selectedShift.startTime, selectedShift.endTime)}</span>.
				You stay on the schedule until someone picks it up.
			</div>
		{/if}

		<div class="flex gap-2 justify-end pt-2">
			<button type="button" class="btn-secondary" on:click={() => (coverageOpen = false)}>
				Never mind
			</button>
			<button type="submit" class="btn-primary" disabled={submitting || !selectedShiftId}>
				{submitting ? 'Sending…' : 'Send request'}
			</button>
		</div>
	</form>
</Modal>
