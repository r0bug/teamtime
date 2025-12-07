<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: shifts = data.shifts;
	$: user = data.user;
	$: isManager = user?.role === 'manager';

	let currentDate = new Date();

	$: weekStart = (() => {
		const d = new Date(currentDate);
		d.setDate(d.getDate() - d.getDay());
		d.setHours(0, 0, 0, 0);
		return d;
	})();

	$: weekDays = (() => {
		const days = [];
		const start = weekStart;
		for (let i = 0; i < 7; i++) {
			const day = new Date(start);
			day.setDate(day.getDate() + i);
			days.push(day);
		}
		return days;
	})();

	function getShiftsForDay(date: Date) {
		return shifts.filter(shift => {
			const shiftDate = new Date(shift.startTime);
			return shiftDate.toDateString() === date.toDateString();
		});
	}

	function formatTime(dateStr: string | Date) {
		const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function navigateWeek(delta: number) {
		const newDate = new Date(currentDate);
		newDate.setDate(newDate.getDate() + delta * 7);
		currentDate = newDate;
	}

	function getUpcomingShifts() {
		return shifts.filter(s => new Date(s.startTime) >= new Date()).slice(0, 5);
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
			{@const isToday = day.toDateString() === new Date().toDateString()}
			<div class="min-h-[120px] lg:min-h-[200px]">
				<div class="text-center py-2 font-medium {isToday ? 'bg-primary-100 text-primary-700 rounded-t-lg' : 'bg-gray-100'}">
					<div class="text-xs lg:text-sm">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
					<div class="text-lg lg:text-xl">{day.getDate()}</div>
				</div>
				<div class="bg-white border border-gray-200 rounded-b-lg p-1 lg:p-2 space-y-1">
					{#each dayShifts as shift}
						<div class="bg-primary-50 border-l-4 border-primary-500 p-1 lg:p-2 rounded text-xs lg:text-sm">
							<div class="font-medium truncate">
								{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
							</div>
							{#if shift.location}
								<div class="text-gray-500 truncate">{shift.location.name}</div>
							{/if}
						</div>
					{:else}
						<div class="text-gray-400 text-xs text-center py-2">No shifts</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- Upcoming Shifts List (Mobile Friendly) -->
	<div class="mt-8 lg:hidden">
		<h3 class="text-lg font-semibold mb-4">Upcoming Shifts</h3>
		<div class="space-y-3">
			{#each getUpcomingShifts() as shift}
				<div class="card">
					<div class="card-body">
						<div class="flex justify-between items-start">
							<div>
								<div class="font-medium">
									{new Date(shift.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
								</div>
								<div class="text-gray-600">
									{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
								</div>
							</div>
							{#if shift.location}
								<span class="badge-primary">{shift.location.name}</span>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<p class="text-gray-500 text-center py-4">No upcoming shifts</p>
			{/each}
		</div>
	</div>
</div>
