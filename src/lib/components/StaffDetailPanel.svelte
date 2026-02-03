<!--
  StaffDetailPanel.svelte - Slide-over panel showing staff member details

  Features:
  - Clock history (recent entries)
  - Incomplete tasks with priority indicators
  - Admin-only: pricing decisions and recent messages
  - Mobile-friendly slide-from-right animation
-->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	const dispatch = createEventDispatcher<{ close: void; forceClockOut: { userId: string } }>();

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

	export let userName: string;
	export let userId: string;
	export let details: StaffDetails;
	export let isAdmin: boolean = false;
	export let isManager: boolean = false;

	let mounted = false;
	let forceClockOutLoading = false;
	let showForceClockOutConfirm = false;
	let forceClockOutError: string | null = null;
	let forceClockOutSuccess = false;

	// Check if user is currently clocked in (first entry has no clockOut)
	$: isClockedIn = details.clockHistory.length > 0 && details.clockHistory[0].clockOut === null;

	onMount(() => {
		mounted = true;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = '';
		};
	});

	function close() {
		dispatch('close');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	function formatDateTime(dateStr: string): string {
		try {
			const date = new Date(dateStr);
			return date.toLocaleString('en-US', {
				timeZone: 'America/Los_Angeles',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
		} catch {
			return '';
		}
	}

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

	function formatDuration(clockIn: string, clockOut: string | null): string {
		if (!clockOut) return 'In progress';
		try {
			const start = new Date(clockIn);
			const end = new Date(clockOut);
			const diffMs = end.getTime() - start.getTime();
			const hours = Math.floor(diffMs / (1000 * 60 * 60));
			const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
			if (hours > 0) {
				return `${hours}h ${minutes}m`;
			}
			return `${minutes}m`;
		} catch {
			return '';
		}
	}

	function getPriorityColor(priority: string): string {
		switch (priority) {
			case 'urgent': return 'bg-red-100 text-red-700';
			case 'high': return 'bg-orange-100 text-orange-700';
			case 'medium': return 'bg-yellow-100 text-yellow-700';
			case 'low': return 'bg-gray-100 text-gray-600';
			default: return 'bg-gray-100 text-gray-600';
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'in_progress': return 'bg-blue-100 text-blue-700';
			case 'not_started': return 'bg-gray-100 text-gray-600';
			default: return 'bg-gray-100 text-gray-600';
		}
	}

	async function handleForceClockOut() {
		forceClockOutLoading = true;
		forceClockOutError = null;

		try {
			const response = await fetch('/api/clock/force-out', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId })
			});

			const data = await response.json();

			if (!response.ok) {
				forceClockOutError = data.error || 'Failed to force clock out';
				return;
			}

			forceClockOutSuccess = true;
			showForceClockOutConfirm = false;

			// Update local state to show user as clocked out
			if (details.clockHistory.length > 0 && details.clockHistory[0].clockOut === null) {
				details.clockHistory[0].clockOut = new Date().toISOString();
			}

			// Notify parent to refresh data
			dispatch('forceClockOut', { userId });

			// Reset success after a delay
			setTimeout(() => {
				forceClockOutSuccess = false;
			}, 3000);
		} catch (err) {
			forceClockOutError = err instanceof Error ? err.message : 'Network error';
		} finally {
			forceClockOutLoading = false;
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Backdrop -->
{#if mounted}
	<div
		class="fixed inset-0 bg-black/50 z-40"
		transition:fade={{ duration: 200 }}
		on:click={close}
		on:keydown={(e) => e.key === 'Enter' && close()}
		role="button"
		tabindex="0"
		aria-label="Close panel"
	></div>

	<!-- Panel -->
	<div
		class="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col"
		transition:fly={{ x: 400, duration: 300 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
			<h2 class="text-lg font-semibold text-gray-900">{userName}</h2>
			<button
				type="button"
				class="p-2 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors"
				on:click={close}
				aria-label="Close"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-4 space-y-6">
			<!-- Force Clock Out Button (Manager/Admin only, when user is clocked in) -->
			{#if isManager && isClockedIn}
				<section class="bg-amber-50 border border-amber-200 rounded-lg p-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-amber-600">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
								</svg>
							</span>
							<div>
								<p class="text-sm font-medium text-amber-800">User is currently clocked in</p>
								<p class="text-xs text-amber-600">You can force clock them out if needed</p>
							</div>
						</div>
						<button
							type="button"
							class="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
							on:click={() => { showForceClockOutConfirm = true; }}
							disabled={forceClockOutLoading}
						>
							Force Clock Out
						</button>
					</div>

					{#if forceClockOutSuccess}
						<div class="mt-3 p-2 bg-green-100 border border-green-200 rounded text-sm text-green-700">
							Successfully clocked out {userName}
						</div>
					{/if}

					{#if forceClockOutError}
						<div class="mt-3 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
							{forceClockOutError}
						</div>
					{/if}
				</section>
			{/if}

			<!-- Clock History -->
			<section>
				<h3 class="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					Recent Clock History
				</h3>
				{#if details.clockHistory.length > 0}
					<div class="space-y-2">
						{#each details.clockHistory as entry}
							<div class="p-3 rounded-lg bg-gray-50 border border-gray-100">
								<div class="flex items-center justify-between mb-1">
									<span class="text-sm font-medium text-gray-900">
										{formatTime(entry.clockIn)}
										{#if entry.clockOut}
											<span class="text-gray-400 mx-1">→</span>
											{formatTime(entry.clockOut)}
										{:else}
											<span class="ml-2 text-xs text-green-600 font-medium">Active</span>
										{/if}
									</span>
									<span class="text-xs text-gray-500">
										{formatDuration(entry.clockIn, entry.clockOut)}
									</span>
								</div>
								{#if entry.address}
									<p class="text-xs text-gray-500 truncate">{entry.address}</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-gray-500 text-center py-3">No recent clock entries</p>
				{/if}
			</section>

			<!-- Incomplete Tasks -->
			<section>
				<h3 class="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
					</svg>
					Incomplete Tasks
					{#if details.incompleteTasks.length > 0}
						<span class="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full">
							{details.incompleteTasks.length}
						</span>
					{/if}
				</h3>
				{#if details.incompleteTasks.length > 0}
					<div class="space-y-2">
						{#each details.incompleteTasks as task}
							<div class="p-3 rounded-lg border border-gray-200 bg-white">
								<div class="flex items-start gap-2">
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium text-gray-900 line-clamp-2">{task.title}</p>
									</div>
								</div>
								<div class="flex items-center gap-2 mt-2">
									<span class="text-xs px-2 py-0.5 rounded-full {getPriorityColor(task.priority)}">
										{task.priority}
									</span>
									<span class="text-xs px-2 py-0.5 rounded-full {getStatusColor(task.status)}">
										{task.status === 'in_progress' ? 'In Progress' : 'Not Started'}
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-gray-500 text-center py-3">No incomplete tasks</p>
				{/if}
			</section>

			<!-- Admin-only: Pricing Decisions -->
			{#if isAdmin && details.pricingDecisions}
				<section>
					<h3 class="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						Recent Pricing Decisions
					</h3>
					{#if details.pricingDecisions.length > 0}
						<div class="space-y-2">
							{#each details.pricingDecisions as decision}
								<div class="p-3 rounded-lg bg-blue-50 border border-blue-100">
									<div class="flex items-start justify-between gap-2">
										<p class="text-sm text-gray-900 line-clamp-2 flex-1">{decision.itemDescription}</p>
										<span class="text-sm font-semibold text-green-700 flex-shrink-0">
											${parseFloat(decision.price).toFixed(2)}
										</span>
									</div>
									<p class="text-xs text-gray-500 mt-1">{formatDateTime(decision.pricedAt)}</p>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-gray-500 text-center py-3">No recent pricing decisions</p>
					{/if}
				</section>
			{/if}

			<!-- Admin-only: Recent Messages -->
			{#if isAdmin && details.recentMessages}
				<section>
					<h3 class="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
						</svg>
						Recent Messages
					</h3>
					{#if details.recentMessages.length > 0}
						<div class="space-y-2">
							{#each details.recentMessages as message}
								<div class="p-3 rounded-lg bg-purple-50 border border-purple-100">
									{#if message.conversationTitle}
										<p class="text-xs font-medium text-purple-600 mb-1">{message.conversationTitle}</p>
									{/if}
									<p class="text-sm text-gray-900 line-clamp-2">{message.content}</p>
									<p class="text-xs text-gray-500 mt-1">{formatDateTime(message.createdAt)}</p>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-gray-500 text-center py-3">No recent messages</p>
					{/if}
				</section>
			{/if}
		</div>
	</div>
{/if}

<!-- Force Clock Out Confirmation Modal -->
{#if showForceClockOutConfirm}
	<div
		class="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
		transition:fade={{ duration: 150 }}
		on:click|self={() => { showForceClockOutConfirm = false; }}
		on:keydown={(e) => { if (e.key === 'Escape') showForceClockOutConfirm = false; }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-title"
	>
		<div
			class="bg-white rounded-xl shadow-2xl w-full max-w-sm"
			transition:fly={{ y: 20, duration: 200 }}
		>
			<div class="p-4 border-b border-gray-200">
				<h3 id="confirm-title" class="text-lg font-semibold text-gray-900">
					Force Clock Out?
				</h3>
			</div>
			<div class="p-4">
				<p class="text-sm text-gray-600 mb-4">
					This will immediately clock out <strong>{userName}</strong> and:
				</p>
				<ul class="text-sm text-gray-600 space-y-2 mb-4">
					<li class="flex items-start gap-2">
						<span class="text-amber-500 mt-0.5">
							<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
							</svg>
						</span>
						<span>Send them an SMS notification</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-red-500 mt-0.5">
							<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
							</svg>
						</span>
						<span>Deduct 15 points from their score</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-orange-500 mt-0.5">
							<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
								<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
								<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
							</svg>
						</span>
						<span>Record a warning (2 in 30 days = demerit)</span>
					</li>
				</ul>
			</div>
			<div class="flex gap-3 p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
				<button
					type="button"
					class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
					on:click={() => { showForceClockOutConfirm = false; }}
					disabled={forceClockOutLoading}
				>
					Cancel
				</button>
				<button
					type="button"
					class="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
					on:click={handleForceClockOut}
					disabled={forceClockOutLoading}
				>
					{#if forceClockOutLoading}
						<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Processing...
					{:else}
						Force Clock Out
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
