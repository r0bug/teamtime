<!--
  RecentShoutouts.svelte - Recognition Feed Widget

  Displays a list of recent public shoutouts.
  Can be embedded in dashboard, leaderboard, or other pages.

  Props:
  - limit: Maximum number of shoutouts to show
  - compact: Use compact styling
-->
<script lang="ts">
	import { onMount } from 'svelte';

	export let limit = 5;
	export let compact = false;

	interface ShoutoutWithDetails {
		id: string;
		title: string;
		description: string | null;
		category: string;
		pointsAwarded: number;
		isManagerAward: boolean;
		isAiGenerated: boolean;
		approvedAt: string;
		createdAt: string;
		recipient: { id: string; name: string };
		nominator: { id: string; name: string } | null;
		awardType: {
			id: string;
			name: string;
			icon: string;
			color: string;
		} | null;
	}

	let shoutouts: ShoutoutWithDetails[] = [];
	let loading = true;
	let error = '';

	onMount(async () => {
		try {
			const res = await fetch(`/api/shoutouts?limit=${limit}`);
			if (res.ok) {
				const data = await res.json();
				shoutouts = data.shoutouts;
			} else {
				error = 'Failed to load shoutouts';
			}
		} catch (e) {
			error = 'Failed to load shoutouts';
			console.error(e);
		} finally {
			loading = false;
		}
	});

	function formatTime(dateStr: string): string {
		try {
			const date = new Date(dateStr);
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

	function getNominatorText(shoutout: ShoutoutWithDetails): string {
		if (shoutout.isAiGenerated) return 'Office Manager AI';
		if (shoutout.nominator) return shoutout.nominator.name;
		return 'The team';
	}
</script>

<div class="bg-white rounded-xl border border-gray-200 {compact ? 'p-3' : 'p-4'}">
	<div class="flex items-center justify-between mb-3">
		<h3 class="font-semibold text-gray-900 flex items-center gap-2 {compact ? 'text-sm' : ''}">
			<span class="text-lg">🌟</span>
			Recent Recognition
		</h3>
		{#if shoutouts.length > 0}
			<span class="text-xs text-gray-500">{shoutouts.length} recent</span>
		{/if}
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-6">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500"></div>
		</div>
	{:else if error}
		<p class="text-sm text-gray-500 text-center py-4">{error}</p>
	{:else if shoutouts.length === 0}
		<p class="text-sm text-gray-500 text-center py-4">No recent shoutouts yet</p>
	{:else}
		<div class="space-y-3">
			{#each shoutouts as shoutout}
				<div class="flex items-start gap-3 {compact ? 'py-2' : 'py-2.5'} border-b border-gray-100 last:border-0">
					<!-- Award Icon -->
					<div
						class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
						style="background-color: {shoutout.awardType?.color || '#F59E0B'}20"
					>
						{shoutout.awardType?.icon || '⭐'}
					</div>

					<!-- Content -->
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-1 flex-wrap">
							<span class="font-medium text-gray-900 {compact ? 'text-sm' : ''}">{shoutout.recipient.name}</span>
							<span class="text-gray-400 {compact ? 'text-xs' : 'text-sm'}">received</span>
							<span class="font-medium text-amber-600 {compact ? 'text-sm' : ''}">{shoutout.awardType?.name || 'Shoutout'}</span>
						</div>
						<p class="text-gray-600 {compact ? 'text-xs' : 'text-sm'} mt-0.5 line-clamp-2">
							"{shoutout.title}"
						</p>
						<div class="flex items-center gap-2 mt-1 text-xs text-gray-400">
							<span>from {getNominatorText(shoutout)}</span>
							<span>·</span>
							<span>{formatTime(shoutout.approvedAt || shoutout.createdAt)}</span>
							{#if shoutout.pointsAwarded > 0}
								<span>·</span>
								<span class="text-amber-500 font-medium">+{shoutout.pointsAwarded} pts</span>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
