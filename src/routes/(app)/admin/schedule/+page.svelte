<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let showCreateModal = false;
	let createStep: 1 | 2 = 1; // Step 1: Select days/times, Step 2: Repeat options
	let editingShift: typeof data.shifts[0] | null = null;
	let loading = false;
	let viewMode: 'grid' | 'list' = 'grid';
	let selectedLocation = '';

	// Create shift state
	let createUserId = '';
	let createLocationId = '';
	let createStartTime = '09:00';
	let createEndTime = '17:00';
	let createNotes = '';
	let selectedDays: boolean[] = [false, false, false, false, false, false, false];
	let repeatOption: 'once' | 'future' = 'once';
	let repeatCount = 1;

	// Quick create state
	let quickCreateDate = '';
	let quickCreateHour = 9;

	// Drag state
	let draggedShift: typeof data.shifts[0] | null = null;
	let dragOverCell: string | null = null;

	// Days of week
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function openCreateModal() {
		showCreateModal = true;
		createStep = 1;
		createUserId = '';
		createLocationId = '';
		createStartTime = '09:00';
		createEndTime = '17:00';
		createNotes = '';
		selectedDays = [false, false, false, false, false, false, false];
		repeatOption = 'once';
		repeatCount = 1;
	}

	function closeCreateModal() {
		showCreateModal = false;
		createStep = 1;
		quickCreateDate = '';
	}

	function proceedToStep2() {
		if (!createUserId) {
			alert('Please select an employee');
			return;
		}
		if (!selectedDays.some(d => d)) {
			alert('Please select at least one day');
			return;
		}
		createStep = 2;
	}

	function goBackToStep1() {
		createStep = 1;
	}

	// Get selected day dates for display (using local time)
	function getSelectedDayDates(): { dayIndex: number; date: Date; label: string }[] {
		return weekDates
			.map((date, i) => ({ dayIndex: i, date, label: `${dayShort[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}` }))
			.filter((_, i) => selectedDays[i]);
	}

	// Build form data for bulk creation
	function buildBulkFormData(): FormData {
		const formData = new FormData();
		formData.append('userId', createUserId);
		formData.append('locationId', createLocationId);
		formData.append('startTime', createStartTime);
		formData.append('endTime', createEndTime);
		formData.append('notes', createNotes);
		formData.append('repeatCount', repeatOption === 'future' ? repeatCount.toString() : '1');

		// Add selected day dates
		const selectedDates = weekDates.filter((_, i) => selectedDays[i]).map(d => d.toISOString().split('T')[0]);
		formData.append('dates', JSON.stringify(selectedDates));

		return formData;
	}

	// Hours for the grid (6am - 10pm)
	const hours = Array.from({ length: 17 }, (_, i) => i + 6);

	// Generate week dates in local time (matches /schedule page behavior)
	$: weekDates = Array.from({ length: 7 }, (_, i) => {
		// Parse date components and create in local time to avoid UTC/local mismatch
		const [year, month, day] = data.startDate.split('-').map(Number);
		const d = new Date(year, month - 1, day);
		d.setDate(d.getDate() + i);
		return d;
	});

	// Get store hours for a specific location and day
	function getStoreHoursForDay(dayOfWeek: number, locationId?: string) {
		const hours = data.storeHours.filter(h => {
			if (locationId) {
				return h.dayOfWeek === dayOfWeek && h.locationId === locationId;
			}
			return h.dayOfWeek === dayOfWeek;
		});
		return hours[0];
	}

	// Check if a time slot is within store hours
	function isWithinStoreHours(dayOfWeek: number, hour: number, locationId?: string) {
		const storeHour = getStoreHoursForDay(dayOfWeek, locationId);
		if (!storeHour || storeHour.isClosed) return false;
		if (!storeHour.openTime || !storeHour.closeTime) return false;

		const [openHour] = storeHour.openTime.split(':').map(Number);
		const [closeHour] = storeHour.closeTime.split(':').map(Number);
		return hour >= openHour && hour < closeHour;
	}

	// Helper to get Pacific date string (YYYY-MM-DD)
	function getPacificDateString(date: Date): string {
		return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); // en-CA gives YYYY-MM-DD
	}

	// Get shifts for a specific date (comparing in Pacific time)
	function getShiftsForDate(date: Date) {
		const dateStr = getPacificDateString(date);
		return data.shifts.filter(s => {
			const shiftDateStr = getPacificDateString(new Date(s.startTime));
			return shiftDateStr === dateStr;
		});
	}

	// Get shifts that overlap a specific hour (in Pacific time)
	function getShiftsAtHour(date: Date, hour: number) {
		const shifts = getShiftsForDate(date);
		return shifts.filter(s => {
			const startHour = getPacificHours(new Date(s.startTime));
			const endHour = getPacificHours(new Date(s.endTime));
			return hour >= startHour && hour < endHour;
		});
	}

	// Helper to get hours in Pacific time
	function getPacificHours(date: Date): number {
		const pacificTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
		return pacificTime.getHours() + pacificTime.getMinutes() / 60;
	}

	// Calculate shift position and height in grid (using Pacific time for display)
	function getShiftStyle(shift: typeof data.shifts[0]) {
		const start = new Date(shift.startTime);
		const end = new Date(shift.endTime);
		const startHour = getPacificHours(start);
		const endHour = getPacificHours(end);
		const top = (startHour - 6) * 48; // 48px per hour
		const height = (endHour - startHour) * 48;
		return `top: ${top}px; height: ${height}px;`;
	}

	// Get user color (consistent color per user)
	function getUserColor(userId: string) {
		const colors = [
			'bg-blue-100 border-blue-400 text-blue-800',
			'bg-green-100 border-green-400 text-green-800',
			'bg-purple-100 border-purple-400 text-purple-800',
			'bg-orange-100 border-orange-400 text-orange-800',
			'bg-pink-100 border-pink-400 text-pink-800',
			'bg-cyan-100 border-cyan-400 text-cyan-800',
			'bg-yellow-100 border-yellow-400 text-yellow-800',
			'bg-red-100 border-red-400 text-red-800'
		];
		const index = data.users.findIndex(u => u.id === userId) % colors.length;
		return colors[index >= 0 ? index : 0];
	}

	function formatTime(date: Date | string) {
		const d = new Date(date);
		return d.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'America/Los_Angeles'
		});
	}

	function formatHour(hour: number) {
		if (hour === 0) return '12 AM';
		if (hour === 12) return '12 PM';
		return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
	}

	// Convert UTC date to Pacific datetime-local string (YYYY-MM-DDTHH:MM)
	function toPacificDatetimeLocal(date: Date | string): string {
		const d = new Date(date);
		// Format in Pacific timezone
		const options: Intl.DateTimeFormatOptions = {
			timeZone: 'America/Los_Angeles',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		};
		const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
		const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
		return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
	}

	function printSchedule() {
		window.print();
	}

	function changeWeek(direction: number) {
		const start = new Date(data.startDate);
		start.setDate(start.getDate() + (direction * 7));
		const end = new Date(start);
		end.setDate(start.getDate() + 7);
		const startStr = start.toISOString().split('T')[0];
		const endStr = end.toISOString().split('T')[0];
		goto('/admin/schedule?start=' + startStr + '&end=' + endStr);
	}

	function goToToday() {
		const now = new Date();
		const start = new Date(now);
		start.setDate(now.getDate() - now.getDay());
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setDate(start.getDate() + 7);
		const startStr = start.toISOString().split('T')[0];
		const endStr = end.toISOString().split('T')[0];
		goto('/admin/schedule?start=' + startStr + '&end=' + endStr);
	}

	// Quick create shift at clicked time slot
	function handleCellClick(date: Date, hour: number) {
		const start = new Date(date);
		start.setHours(hour, 0, 0, 0);
		const end = new Date(start);
		end.setHours(hour + 4, 0, 0, 0); // Default 4 hour shift

		quickCreateDate = start.toISOString().slice(0, 16);
		showCreateModal = true;
	}

	// Drag and drop handlers
	function handleDragStart(e: DragEvent, shift: typeof data.shifts[0]) {
		draggedShift = shift;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', shift.id);
		}
	}

	function handleDragOver(e: DragEvent, cellId: string) {
		e.preventDefault();
		dragOverCell = cellId;
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragLeave() {
		dragOverCell = null;
	}

	async function handleDrop(e: DragEvent, date: Date, hour: number) {
		e.preventDefault();
		dragOverCell = null;

		if (!draggedShift) return;

		// Calculate new times
		const originalStart = new Date(draggedShift.startTime);
		const originalEnd = new Date(draggedShift.endTime);
		const duration = originalEnd.getTime() - originalStart.getTime();

		const newStart = new Date(date);
		newStart.setHours(hour, originalStart.getMinutes(), 0, 0);
		const newEnd = new Date(newStart.getTime() + duration);

		// Submit form to update shift
		const formData = new FormData();
		formData.append('shiftId', draggedShift.id);
		formData.append('userId', draggedShift.userId);
		formData.append('locationId', draggedShift.locationId || '');
		formData.append('startTime', newStart.toISOString());
		formData.append('endTime', newEnd.toISOString());
		formData.append('notes', draggedShift.notes || '');

		try {
			const response = await fetch('?/updateShift', {
				method: 'POST',
				body: formData
			});
			if (response.ok) {
				invalidateAll();
			}
		} catch (err) {
			console.error('Failed to update shift:', err);
		}

		draggedShift = null;
	}

	function openEditModal(shift: typeof data.shifts[0]) {
		editingShift = { ...shift };
	}

	// Calculate employee hours from currently displayed shifts (reactive to changes)
	$: displayedShiftsHours = (() => {
		const hours: { [userId: string]: { name: string; hours: number } } = {};
		for (const shift of data.shifts) {
			if (!hours[shift.userId]) {
				hours[shift.userId] = { name: shift.userName, hours: 0 };
			}
			const shiftHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
			hours[shift.userId].hours += shiftHours;
		}
		return Object.entries(hours).map(([userId, d]) => ({ userId, name: d.name, hours: d.hours }));
	})();

	// Combine server-side pay period hours with any changes from displayed shifts
	$: combinedPayPeriodHours = (() => {
		// Start with server-side pay period hours
		const hoursMap: { [userId: string]: { name: string; hours: number } } = {};

		// Add server-calculated pay period hours
		for (const emp of data.employeePayPeriodHours || []) {
			hoursMap[emp.userId] = { name: emp.name, hours: emp.hours };
		}

		return Object.entries(hoursMap).map(([userId, d]) => ({ userId, name: d.name, hours: d.hours })).sort((a, b) => a.name.localeCompare(b.name));
	})();

	function formatHoursMinutes(hours: number) {
		const h = Math.floor(hours);
		const m = Math.round((hours - h) * 60);
		return `${h}h ${m}m`;
	}
</script>

<svelte:head>
	<title>Schedule - TeamTime</title>
	<style>
		@media print {
			.no-print { display: none !important; }
			.print-only { display: block !important; }
			body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
			.card { box-shadow: none; border: 1px solid #ccc; }
			.schedule-grid { font-size: 10px; }
			.shift-block { font-size: 9px; padding: 2px; }
		}
		.schedule-grid {
			display: grid;
			grid-template-columns: 60px repeat(7, 1fr);
		}
		.time-column {
			position: relative;
		}
		.day-column {
			position: relative;
			min-height: 816px; /* 17 hours * 48px */
		}
		.hour-row {
			height: 48px;
			border-bottom: 1px solid #e5e7eb;
		}
		.shift-block {
			position: absolute;
			left: 2px;
			right: 2px;
			border-radius: 4px;
			padding: 4px 6px;
			font-size: 11px;
			border-left: 3px solid;
			cursor: grab;
			overflow: hidden;
			z-index: 10;
		}
		.shift-block:active {
			cursor: grabbing;
		}
		.store-hours-bg {
			background: linear-gradient(to bottom, #ecfdf5, #d1fae5);
		}
		.closed-hours-bg {
			background: #f3f4f6;
		}
		.drag-over {
			background: #dbeafe !important;
			border: 2px dashed #3b82f6;
		}
	</style>
</svelte:head>

<div class="p-4 lg:p-8 max-w-full mx-auto">
	<div class="flex flex-wrap justify-between items-center mb-6 no-print gap-4">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Schedule Management</h1>
			<p class="text-gray-600 mt-1">Create and manage employee schedules</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<!-- View Toggle -->
			<div class="btn-group">
				<button
					on:click={() => viewMode = 'grid'}
					class="px-3 py-2 text-sm border rounded-l-lg {viewMode === 'grid' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}"
				>
					Grid
				</button>
				<button
					on:click={() => viewMode = 'list'}
					class="px-3 py-2 text-sm border rounded-r-lg border-l-0 {viewMode === 'list' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}"
				>
					List
				</button>
			</div>
			<button on:click={printSchedule} class="btn-secondary">
				<svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
				</svg>
				Print
			</button>
			<button on:click={openCreateModal} class="btn-primary">
				+ Add Shift
			</button>
		</div>
	</div>

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4 no-print">
			{form.message}
		</div>
	{/if}

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 no-print">
			{form.error}
		</div>
	{/if}

	<!-- Week Navigation -->
	<div class="flex items-center justify-between mb-4 no-print">
		<button on:click={() => changeWeek(-1)} class="btn-secondary text-sm">
			&larr; Previous
		</button>
		<div class="flex items-center gap-4">
			<span class="text-lg font-semibold">
				{formatDate(data.startDate)} - {formatDate(data.endDate)}
			</span>
			<button on:click={goToToday} class="text-sm text-primary-600 hover:text-primary-700">
				Today
			</button>
		</div>
		<button on:click={() => changeWeek(1)} class="btn-secondary text-sm">
			Next &rarr;
		</button>
	</div>

	<!-- Location Filter -->
	{#if data.locations.length > 0}
		<div class="mb-4 no-print">
			<select bind:value={selectedLocation} class="input max-w-xs">
				<option value="">All Locations</option>
				{#each data.locations as loc}
					<option value={loc.id}>{loc.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Staff Legend -->
	<div class="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-lg no-print">
		<span class="text-sm text-gray-600 font-medium">Staff:</span>
		{#each data.users as user}
			<span class="px-2 py-1 text-xs rounded border {getUserColor(user.id)}">
				{user.name}
			</span>
		{/each}
		<span class="ml-4 px-2 py-1 text-xs rounded store-hours-bg border border-green-300">
			Store Open
		</span>
	</div>

	<!-- Pay Period Hours Legend -->
	{#if data.currentPayPeriod}
		<div class="mb-4 card no-print">
			<div class="p-3 sm:p-4 border-b bg-gray-50 flex items-center justify-between">
				<div class="min-w-0">
					<h3 class="font-semibold text-gray-900 text-sm sm:text-base">Pay Period Hours</h3>
					<p class="text-xs sm:text-sm text-gray-500 truncate">{data.currentPayPeriod.label}</p>
				</div>
				<div class="flex items-center gap-2 flex-shrink-0">
					<span class="text-xs sm:text-sm font-bold text-primary-600">
						{formatHoursMinutes(combinedPayPeriodHours.reduce((sum, e) => sum + e.hours, 0))} total
					</span>
					<a href="/admin/pay-periods" class="hidden sm:inline text-xs text-gray-500 hover:text-primary-600">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</a>
				</div>
			</div>
			{#if combinedPayPeriodHours.length > 0}
				<div class="p-2 sm:p-3">
					<!-- Mobile: Compact horizontal scroll list -->
					<div class="flex gap-2 overflow-x-auto pb-2 sm:hidden">
						{#each combinedPayPeriodHours as emp}
							<div class="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded border text-xs {getUserColor(emp.userId)}">
								<span class="font-medium max-w-[60px] truncate">{emp.name.split(' ')[0]}</span>
								<span class="font-bold">{formatHoursMinutes(emp.hours)}</span>
							</div>
						{/each}
					</div>
					<!-- Desktop: Grid layout -->
					<div class="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
						{#each combinedPayPeriodHours as emp}
							<div class="flex items-center justify-between p-2 rounded-lg border {getUserColor(emp.userId)}">
								<span class="text-sm font-medium truncate mr-2">{emp.name}</span>
								<span class="text-sm font-bold whitespace-nowrap">{formatHoursMinutes(emp.hours)}</span>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="p-3 text-sm text-gray-500 text-center">
					No scheduled shifts in current pay period
				</div>
			{/if}
		</div>
	{/if}

	<!-- Print Header -->
	<div class="hidden print-only mb-4">
		<h2 class="text-xl font-bold text-center">
			Schedule: {formatDate(data.startDate)} - {formatDate(data.endDate)}
		</h2>
	</div>

	{#if viewMode === 'grid'}
		<!-- Graphical Grid View -->
		<div class="card overflow-x-auto">
			<div class="schedule-grid min-w-[900px]">
				<!-- Header Row -->
				<div class="bg-gray-100 border-b border-r p-2 font-medium text-xs text-gray-600"></div>
				{#each weekDates as date, i}
					<div class="bg-gray-100 border-b p-2 text-center">
						<div class="font-medium text-sm">{dayShort[date.getDay()]}</div>
						<div class="text-lg font-bold">{date.getDate()}</div>
					</div>
				{/each}

				<!-- Time rows and day columns -->
				<div class="time-column border-r bg-gray-50">
					{#each hours as hour}
						<div class="hour-row flex items-start justify-end pr-2 text-xs text-gray-500 pt-1">
							{formatHour(hour)}
						</div>
					{/each}
				</div>

				{#each weekDates as date, dayIndex}
					<div
						class="day-column border-r relative"
					>
						<!-- Hour cells with store hours background -->
						{#each hours as hour}
							{@const cellId = `${dayIndex}-${hour}`}
							{@const isOpen = isWithinStoreHours(date.getDay(), hour, selectedLocation || undefined)}
							<div
								class="hour-row cursor-pointer hover:bg-blue-50 transition-colors {isOpen ? 'store-hours-bg' : 'closed-hours-bg'} {dragOverCell === cellId ? 'drag-over' : ''}"
								on:click={() => handleCellClick(date, hour)}
								on:dragover={(e) => handleDragOver(e, cellId)}
								on:dragleave={handleDragLeave}
								on:drop={(e) => handleDrop(e, date, hour)}
								role="button"
								tabindex="0"
								on:keypress={(e) => e.key === 'Enter' && handleCellClick(date, hour)}
							>
							</div>
						{/each}

						<!-- Shift blocks positioned absolutely -->
						{#each getShiftsForDate(date) as shift}
							{#if !selectedLocation || shift.locationId === selectedLocation}
								<div
									class="shift-block {getUserColor(shift.userId)}"
									style={getShiftStyle(shift)}
									draggable="true"
									on:dragstart={(e) => handleDragStart(e, shift)}
									on:click|stopPropagation={() => openEditModal(shift)}
									role="button"
									tabindex="0"
									on:keypress={(e) => e.key === 'Enter' && openEditModal(shift)}
									title="{shift.userName}: {formatTime(shift.startTime)} - {formatTime(shift.endTime)}"
								>
									<div class="font-semibold truncate">{shift.userName}</div>
									<div class="text-[10px] opacity-75">
										{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
									</div>
									{#if shift.locationName}
										<div class="text-[10px] opacity-60 truncate">{shift.locationName}</div>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<!-- Grid View Instructions -->
		<p class="text-xs text-gray-500 mt-2 no-print">
			Click a time slot to create a shift. Drag shifts to reschedule. Click a shift to edit.
		</p>
	{:else}
		<!-- List View -->
		<div class="card">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider no-print">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#if data.shifts.length === 0}
							<tr>
								<td colspan="6" class="px-4 py-8 text-center text-gray-500">
									No shifts scheduled for this week
								</td>
							</tr>
						{:else}
							{#each data.shifts as shift}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 whitespace-nowrap">
										<span class="px-2 py-1 text-xs rounded border {getUserColor(shift.userId)}">
											{shift.userName}
										</span>
									</td>
									<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
										{formatDate(shift.startTime)}
									</td>
									<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
										{formatTime(shift.startTime)} - {formatTime(shift.endTime)}
									</td>
									<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
										{shift.locationName || '-'}
									</td>
									<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
										{shift.notes || '-'}
									</td>
									<td class="px-4 py-3 whitespace-nowrap no-print">
										<button on:click={() => openEditModal(shift)} class="text-primary-600 hover:text-primary-700 text-sm mr-3">
											Edit
										</button>
										<form method="POST" action="?/deleteShift" use:enhance class="inline">
											<input type="hidden" name="shiftId" value={shift.id} />
											<button type="submit" class="text-red-600 hover:text-red-700 text-sm">
												Delete
											</button>
										</form>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<!-- Create Shift Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 no-print">
		<div class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Create Shifts</h2>

				<form method="POST" action="?/createBulkShifts" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						closeCreateModal();
						await update();
					};
				}}>
					<div class="space-y-4">
						<div>
							<label for="userId" class="label">Employee</label>
							<select id="userId" name="userId" bind:value={createUserId} required class="input">
								<option value="">Select employee...</option>
								{#each data.users as user}
									<option value={user.id}>{user.name} ({user.role})</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="locationId" class="label">Location (optional)</label>
							<select id="locationId" name="locationId" bind:value={createLocationId} class="input">
								<option value="">No location</option>
								{#each data.locations as location}
									<option value={location.id}>{location.name}</option>
								{/each}
							</select>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="startTime" class="label">Start Time</label>
								<input type="time" id="startTime" name="startTime" bind:value={createStartTime} class="input" />
							</div>
							<div>
								<label for="endTime" class="label">End Time</label>
								<input type="time" id="endTime" name="endTime" bind:value={createEndTime} class="input" />
							</div>
						</div>

						<!-- Days of the Week -->
						<div>
							<label class="label">Select Days</label>
							<p class="text-xs text-gray-500 mb-2">Week of {formatDate(data.startDate)}</p>
							<div class="grid grid-cols-7 gap-1">
								{#each weekDates as date, i}
									<button
										type="button"
										on:click={() => selectedDays[i] = !selectedDays[i]}
										class="p-2 rounded-lg border text-center transition-colors {selectedDays[i] ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-gray-300 hover:border-primary-400'}"
									>
										<div class="text-xs font-medium">{dayShort[date.getDay()]}</div>
										<div class="text-lg font-bold">{date.getDate()}</div>
									</button>
								{/each}
							</div>
							<!-- Quick select buttons -->
							<div class="flex gap-2 mt-2">
								<button type="button" on:click={() => selectedDays = [false, true, true, true, true, true, false]} class="text-xs text-primary-600 hover:text-primary-700">
									Mon-Fri
								</button>
								<button type="button" on:click={() => selectedDays = [true, true, true, true, true, true, true]} class="text-xs text-primary-600 hover:text-primary-700">
									All Days
								</button>
								<button type="button" on:click={() => selectedDays = [false, false, false, false, false, false, false]} class="text-xs text-gray-600 hover:text-gray-700">
									Clear
								</button>
							</div>
						</div>

						<!-- Hidden dates field -->
						<input type="hidden" name="dates" value={JSON.stringify(weekDates.filter((_, i) => selectedDays[i]).map(d => d.toISOString().split('T')[0]))} />

						<!-- Repeat Toggle -->
						<div class="border-t pt-4">
							<div class="flex items-center justify-between">
								<div>
									<label class="font-medium text-sm">Repeat for future weeks</label>
									<p class="text-xs text-gray-500">Apply same schedule to upcoming weeks</p>
								</div>
								<button
									type="button"
									on:click={() => repeatOption = repeatOption === 'once' ? 'future' : 'once'}
									class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {repeatOption === 'future' ? 'bg-primary-600' : 'bg-gray-200'}"
								>
									<span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {repeatOption === 'future' ? 'translate-x-5' : 'translate-x-0'}" />
								</button>
							</div>

							{#if repeatOption === 'future'}
								<div class="mt-3 flex items-center gap-2">
									<label for="repeatCount" class="text-sm">Number of weeks:</label>
									<select id="repeatCount" name="repeatCount" bind:value={repeatCount} class="input w-24">
										<option value={2}>2</option>
										<option value={3}>3</option>
										<option value={4}>4</option>
										<option value={6}>6</option>
										<option value={8}>8</option>
									</select>
									<span class="text-xs text-gray-500">(including this week)</span>
								</div>
							{:else}
								<input type="hidden" name="repeatCount" value="1" />
							{/if}
						</div>

						<div>
							<label for="notes" class="label">Notes (optional)</label>
							<textarea id="notes" name="notes" bind:value={createNotes} rows="2" class="input"></textarea>
						</div>

						<!-- Summary -->
						{#if selectedDays.some(d => d)}
							<div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
								<span class="font-medium text-blue-800">
									{#if repeatOption === 'future'}
										Creating {selectedDays.filter(d => d).length * repeatCount} shifts
									{:else}
										Creating {selectedDays.filter(d => d).length} shift(s)
									{/if}
								</span>
								<span class="text-blue-600">
									for {getSelectedDayDates().map(d => d.label).join(', ')}
									{#if repeatOption === 'future'}
										(and {repeatCount - 1} more week{repeatCount > 2 ? 's' : ''})
									{/if}
								</span>
							</div>
						{/if}

						<div class="flex space-x-3 pt-4">
							<button type="button" on:click={closeCreateModal} class="btn-secondary flex-1">
								Cancel
							</button>
							<button type="submit" disabled={loading || !createUserId || !selectedDays.some(d => d)} class="btn-primary flex-1">
								{loading ? 'Creating...' : 'Create Shifts'}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Shift Modal -->
{#if editingShift}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 no-print">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6">
				<h2 class="text-xl font-bold mb-4">Edit Shift</h2>
				<form method="POST" action="?/updateShift" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						editingShift = null;
						await update();
					};
				}} class="space-y-4">
					<input type="hidden" name="shiftId" value={editingShift.id} />
					<div>
						<label for="edit-userId" class="label">Employee</label>
						<select id="edit-userId" name="userId" required class="input" value={editingShift.userId}>
							{#each data.users as user}
								<option value={user.id} selected={user.id === editingShift.userId}>{user.name} ({user.role})</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="edit-locationId" class="label">Location (optional)</label>
						<select id="edit-locationId" name="locationId" class="input">
							<option value="">No location</option>
							{#each data.locations as location}
								<option value={location.id} selected={location.id === editingShift.locationId}>{location.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="edit-startTime" class="label">Start Time</label>
						<input
							type="datetime-local"
							id="edit-startTime"
							name="startTime"
							required
							class="input"
							value={toPacificDatetimeLocal(editingShift.startTime)}
						/>
					</div>
					<div>
						<label for="edit-endTime" class="label">End Time</label>
						<input
							type="datetime-local"
							id="edit-endTime"
							name="endTime"
							required
							class="input"
							value={toPacificDatetimeLocal(editingShift.endTime)}
						/>
					</div>
					<div>
						<label for="edit-notes" class="label">Notes (optional)</label>
						<textarea id="edit-notes" name="notes" rows="2" class="input" value={editingShift.notes || ''}></textarea>
					</div>
					<div class="flex space-x-3 pt-4">
						<button type="button" on:click={() => editingShift = null} class="btn-secondary flex-1">
							Cancel
						</button>
						<form method="POST" action="?/deleteShift" use:enhance={() => {
							loading = true;
							return async ({ update }) => {
								loading = false;
								editingShift = null;
								await update();
							};
						}} class="flex-1">
							<input type="hidden" name="shiftId" value={editingShift.id} />
							<button type="submit" class="btn-danger w-full">Delete</button>
						</form>
						<button type="submit" disabled={loading} class="btn-primary flex-1">
							{loading ? 'Saving...' : 'Save'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
