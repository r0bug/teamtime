<!--
  WhosWorking.svelte - Dashboard section showing clocked-in and scheduled staff

  Features:
  - Currently clocked-in staff with green indicators
  - Today's scheduled shifts with location info
  - Role-based click handling (manager/admin see details)
  - Mobile-first horizontal chip layout for clocked-in users
-->
<script lang="ts">
	import Avatar from './Avatar.svelte';
	import StaffDetailPanel from './StaffDetailPanel.svelte';

	interface ClockedInUser {
		id: string;
		name: string;
		avatarUrl: string | null;
		clockInTime: string;
		clockInAddress: string | null;
	}

	interface ScheduledUser {
		id: string;
		name: string;
		avatarUrl: string | null;
		shiftStart: string;
		shiftEnd: string;
		locationName: string | null;
		isClockedIn: boolean;
	}

	interface StaffDetails {
		incompleteTasks: Array<{
			id: string;
			title: string;
			priority: string;
			status: string;
		}>;
		clockHistory: Array<{
			clockIn: string;
			clockOut: string | null;
			address: string | null;
		}>;
		pricingDecisions?: Array<{
			id: string;
			itemDescription: string;
			price: string;
			pricedAt: string;
		}>;
		recentMessages?: Array<{
			id: string;
			content: string;
			createdAt: string;
			conversationTitle: string | null;
		}>;
	}

	export let clockedIn: ClockedInUser[] = [];
	export let scheduledToday: ScheduledUser[] = [];
	export let staffDetails: Record<string, StaffDetails> | null = null;
	export let viewerRole: 'admin' | 'manager' | 'purchaser' | 'staff' = 'staff';

	let selectedUserId: string | null = null;
	let selectedUserName: string = '';
	let showPanel = false;

	$: canViewDetails = viewerRole === 'admin' || viewerRole === 'manager';
	$: selectedDetails = selectedUserId && staffDetails ? staffDetails[selectedUserId] : null;

	function formatTime(dateStr: string): string {
		try {
			const date = new Date(dateStr);
			return date.toLocaleTimeString('en-US', {
				timeZone: 'America/Los_Angeles',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
		} catch {
			return '';
		}
	}

	function formatTimeRange(start: string, end: string): string {
		return `${formatTime(start)} - ${formatTime(end)}`;
	}

	function handleUserClick(userId: string, userName: string) {
		if (!canViewDetails) return;
		selectedUserId = userId;
		selectedUserName = userName;
		showPanel = true;
	}

	function closePanel() {
		showPanel = false;
		selectedUserId = null;
	}

	function handleForceClockOut(event: CustomEvent<{ userId: string }>) {
		const { userId } = event.detail;
		// Remove user from clockedIn list
		clockedIn = clockedIn.filter(u => u.id !== userId);
		// Update scheduled user to not be clocked in
		scheduledToday = scheduledToday.map(u =>
			u.id === userId ? { ...u, isClockedIn: false } : u
		);
	}
</script>

<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
	<!-- Header -->
	<div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
		<h3 class="font-semibold text-gray-900 flex items-center gap-2">
			<span class="text-lg">👥</span>
			Who's Working
		</h3>
		{#if clockedIn.length > 0}
			<div class="flex items-center gap-1.5 text-sm text-green-600 font-medium">
				<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
				{clockedIn.length} clocked in
			</div>
		{/if}
	</div>

	<div class="p-4 space-y-4">
		<!-- Currently Clocked In -->
		{#if clockedIn.length > 0}
			<div>
				<h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
					Currently Clocked In
				</h4>
				<div class="flex flex-wrap gap-2">
					{#each clockedIn as user}
						<button
							type="button"
							class="flex items-center gap-2 px-3 py-2 rounded-full bg-green-50 border border-green-200
								   {canViewDetails ? 'hover:bg-green-100 cursor-pointer transition-colors' : 'cursor-default'}"
							on:click={() => handleUserClick(user.id, user.name)}
							disabled={!canViewDetails}
						>
							<div class="relative">
								<Avatar src={user.avatarUrl} name={user.name} size="xs" />
								<span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></span>
							</div>
							<div class="text-left">
								<p class="text-sm font-medium text-gray-900">{user.name.split(' ')[0]}</p>
								<p class="text-xs text-gray-500">Since {formatTime(user.clockInTime)}</p>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<div class="text-center py-3 text-gray-500 text-sm">
				No one clocked in yet today
			</div>
		{/if}

		<!-- Scheduled Today -->
		{#if scheduledToday.length > 0}
			<div>
				<h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
					Scheduled Today
				</h4>
				<div class="space-y-2">
					{#each scheduledToday as user}
						<button
							type="button"
							class="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200
								   {canViewDetails ? 'hover:bg-gray-50 cursor-pointer transition-colors' : 'cursor-default'}
								   {user.isClockedIn ? 'bg-green-50 border-green-200' : 'bg-white'}"
							on:click={() => handleUserClick(user.id, user.name)}
							disabled={!canViewDetails}
						>
							<div class="relative flex-shrink-0">
								<Avatar src={user.avatarUrl} name={user.name} size="sm" />
								{#if user.isClockedIn}
									<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
								{/if}
							</div>
							<div class="flex-1 min-w-0 text-left">
								<div class="flex items-center gap-2">
									<p class="font-medium text-gray-900 truncate">{user.name}</p>
									{#if user.isClockedIn}
										<span class="text-xs text-green-600 font-medium">Working</span>
									{/if}
								</div>
								<p class="text-sm text-gray-500">
									{formatTimeRange(user.shiftStart, user.shiftEnd)}
								</p>
							</div>
							{#if user.locationName}
								<div class="flex-shrink-0 text-right">
									<p class="text-xs text-gray-400">Location</p>
									<p class="text-sm text-gray-600 truncate max-w-[100px]">{user.locationName}</p>
								</div>
							{/if}
							{#if canViewDetails}
								<svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{:else if clockedIn.length === 0}
			<div class="text-center py-3 text-gray-500 text-sm">
				No shifts scheduled for today
			</div>
		{/if}
	</div>
</div>

<!-- Staff Detail Panel -->
{#if showPanel && selectedDetails && selectedUserId}
	<StaffDetailPanel
		userName={selectedUserName}
		userId={selectedUserId}
		details={selectedDetails}
		isAdmin={viewerRole === 'admin'}
		isManager={viewerRole === 'admin' || viewerRole === 'manager'}
		on:close={closePanel}
		on:forceClockOut={handleForceClockOut}
	/>
{/if}
