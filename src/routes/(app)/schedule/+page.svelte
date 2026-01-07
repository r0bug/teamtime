<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: shifts = data.shifts;
	$: myUpcomingShifts = data.myUpcomingShifts;
	$: currentUserId = data.currentUserId;
	$: user = data.user;
	$: isManager = user?.role === 'manager' || user?.role === 'admin';

	// Use the server-provided start date to ensure timezone consistency
	$: startDateFromServer = data.startDate;

	let weekOffset = 0;

	$: weekStart = (() => {
		// Parse the server-provided Pacific date and add week offset
		const [year, month, day] = startDateFromServer.split('-').map(Number);
		const d = new Date(year, month - 1, day);
		d.setDate(d.getDate() + (weekOffset * 7));
		return d;
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

	function navigateWeek(delta: number) {
		weekOffset += delta;
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
		<h2 class="text-lg font-semibold">
			{weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} -
			{new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
		</h2>
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
