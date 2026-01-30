<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	export let data;

	$: pendingShoutouts = data.pendingShoutouts;
	$: recentShoutouts = data.recentShoutouts;
	$: awardTypes = data.awardTypes;

	let processingId: string | null = null;
	let rejectReason = '';
	let showRejectModal = false;
	let rejectingId: string | null = null;

	function formatTime(dateInput: Date | string): string {
		try {
			const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
			const now = new Date();
			const diff = now.getTime() - date.getTime();
			const seconds = Math.floor(diff / 1000);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);

			if (seconds < 60) return 'just now';
			if (minutes < 60) return `${minutes}m ago`;
			if (hours < 24) return `${hours}h ago`;
			if (days === 1) return 'yesterday';
			if (days < 7) return `${days}d ago`;
			return date.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' });
		} catch {
			return '';
		}
	}

	async function approveShoutout(id: string) {
		processingId = id;
		try {
			const res = await fetch(`/api/shoutouts/${id}/approve`, { method: 'POST' });
			if (res.ok) {
				await invalidateAll();
			} else {
				const data = await res.json();
				alert(data.message || 'Failed to approve');
			}
		} catch (e) {
			console.error(e);
			alert('Failed to approve shoutout');
		} finally {
			processingId = null;
		}
	}

	function openRejectModal(id: string) {
		rejectingId = id;
		rejectReason = '';
		showRejectModal = true;
	}

	async function confirmReject() {
		if (!rejectingId) return;
		processingId = rejectingId;
		try {
			const res = await fetch(`/api/shoutouts/${rejectingId}/reject`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason: rejectReason.trim() || undefined })
			});
			if (res.ok) {
				showRejectModal = false;
				rejectingId = null;
				await invalidateAll();
			} else {
				const data = await res.json();
				alert(data.message || 'Failed to reject');
			}
		} catch (e) {
			console.error(e);
			alert('Failed to reject shoutout');
		} finally {
			processingId = null;
		}
	}

	function getNominatorText(shoutout: typeof pendingShoutouts[0]): string {
		if (shoutout.nominator) return shoutout.nominator.name;
		return 'System';
	}
</script>

<svelte:head>
	<title>Shoutouts - TeamTime Admin</title>
</svelte:head>

<div class="max-w-4xl mx-auto p-4 space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Recognition & Shoutouts</h1>
			<p class="text-gray-600 mt-1">Approve peer nominations and manage recognition</p>
		</div>
		<div class="flex items-center gap-2">
			{#if pendingShoutouts.length > 0}
				<span class="px-2.5 py-1 text-sm font-medium bg-amber-100 text-amber-800 rounded-full">
					{pendingShoutouts.length} pending
				</span>
			{/if}
		</div>
	</div>

	<!-- Pending Approvals Section -->
	<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
		<div class="px-4 py-3 bg-amber-50 border-b border-amber-100">
			<h2 class="font-semibold text-gray-900 flex items-center gap-2">
				<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				Pending Approvals
			</h2>
		</div>

		{#if pendingShoutouts.length === 0}
			<div class="p-8 text-center text-gray-500">
				<svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<p>No pending shoutouts to review</p>
			</div>
		{:else}
			<div class="divide-y divide-gray-100">
				{#each pendingShoutouts as shoutout}
					<div class="p-4 hover:bg-gray-50 transition-colors">
						<div class="flex items-start gap-4">
							<!-- Award Icon -->
							<div
								class="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
								style="background-color: {shoutout.awardType?.color || '#F59E0B'}20"
							>
								{shoutout.awardType?.icon || '⭐'}
							</div>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-medium text-amber-600">{getNominatorText(shoutout)}</span>
									<span class="text-gray-400">wants to recognize</span>
									<span class="font-medium text-gray-900">{shoutout.recipient.name}</span>
								</div>
								<div class="mt-1">
									<span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
										{shoutout.awardType?.name || 'Shoutout'} · +{shoutout.awardType?.points || 25} pts
									</span>
								</div>
								<p class="mt-2 text-gray-700">"{shoutout.title}"</p>
								{#if shoutout.description}
									<p class="mt-1 text-sm text-gray-500">{shoutout.description}</p>
								{/if}
								<p class="mt-2 text-xs text-gray-400">Submitted {formatTime(shoutout.createdAt)}</p>
							</div>

							<!-- Actions -->
							<div class="flex items-center gap-2">
								<button
									on:click={() => approveShoutout(shoutout.id)}
									disabled={processingId === shoutout.id}
									class="px-3 py-1.5 text-sm font-medium text-white bg-green-500 hover:bg-green-600
										rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
								>
									{#if processingId === shoutout.id}
										<div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
									{:else}
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
									Approve
								</button>
								<button
									on:click={() => openRejectModal(shoutout.id)}
									disabled={processingId === shoutout.id}
									class="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50
										rounded-lg transition-colors border border-red-200 disabled:opacity-50"
								>
									Reject
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Recent Shoutouts Section -->
	<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
		<div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
			<h2 class="font-semibold text-gray-900 flex items-center gap-2">
				<span class="text-lg">🌟</span>
				Recent Recognition
			</h2>
		</div>

		{#if recentShoutouts.length === 0}
			<div class="p-8 text-center text-gray-500">
				<p>No approved shoutouts yet</p>
			</div>
		{:else}
			<div class="divide-y divide-gray-100">
				{#each recentShoutouts as shoutout}
					<div class="p-4">
						<div class="flex items-start gap-3">
							<div
								class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg"
								style="background-color: {shoutout.awardType?.color || '#F59E0B'}20"
							>
								{shoutout.awardType?.icon || '⭐'}
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-1 flex-wrap text-sm">
									<span class="font-medium text-gray-900">{shoutout.recipient.name}</span>
									<span class="text-gray-400">received</span>
									<span class="font-medium text-amber-600">{shoutout.awardType?.name || 'Shoutout'}</span>
									<span class="text-gray-400">from</span>
									<span class="text-gray-600">{shoutout.nominator?.name || 'System'}</span>
								</div>
								<p class="text-sm text-gray-600 mt-0.5">"{shoutout.title}"</p>
								<div class="flex items-center gap-2 mt-1 text-xs text-gray-400">
									<span>{formatTime(shoutout.approvedAt || shoutout.createdAt)}</span>
									<span>·</span>
									<span class="text-amber-500 font-medium">+{shoutout.pointsAwarded} pts</span>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Award Types Section -->
	<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
		<div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
			<h2 class="font-semibold text-gray-900 flex items-center gap-2">
				<svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
				</svg>
				Award Types
			</h2>
		</div>

		<div class="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
			{#each awardTypes as award}
				<div class="p-3 rounded-lg border border-gray-200 text-center">
					<div class="text-2xl mb-1">{award.icon}</div>
					<div class="font-medium text-sm text-gray-900">{award.name}</div>
					<div class="text-xs text-amber-600">+{award.points} pts</div>
					{#if award.managerOnly}
						<div class="mt-1 text-xs text-purple-600 font-medium">Manager only</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- Reject Modal -->
{#if showRejectModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
		<div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
			<h3 class="text-lg font-semibold text-gray-900 mb-4">Reject Shoutout</h3>
			<div class="mb-4">
				<label for="reject-reason" class="block text-sm font-medium text-gray-700 mb-1">
					Reason (optional)
				</label>
				<textarea
					id="reject-reason"
					bind:value={rejectReason}
					rows="3"
					placeholder="Why is this shoutout being rejected?"
					class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500
						focus:border-red-500 text-sm"
				></textarea>
			</div>
			<div class="flex justify-end gap-2">
				<button
					on:click={() => { showRejectModal = false; rejectingId = null; }}
					class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
				>
					Cancel
				</button>
				<button
					on:click={confirmReject}
					disabled={processingId === rejectingId}
					class="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600
						rounded-lg disabled:opacity-50 flex items-center gap-2"
				>
					{#if processingId === rejectingId}
						<div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
					{/if}
					Reject
				</button>
			</div>
		</div>
	</div>
{/if}
