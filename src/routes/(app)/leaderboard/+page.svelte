<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/stores';

	export let data: PageData;

	$: period = data.period;
	$: leaderboard = data.leaderboard;
	$: userPosition = data.userPosition;
	$: currentUser = data.currentUser;

	function getRankDisplay(rank: number): string {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return `${rank}`;
	}

	function getRankClass(rank: number): string {
		if (rank === 1) return 'bg-yellow-50 border-yellow-200';
		if (rank === 2) return 'bg-gray-50 border-gray-200';
		if (rank === 3) return 'bg-orange-50 border-orange-200';
		return 'bg-white border-gray-100';
	}
</script>

<svelte:head>
	<title>Leaderboard - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-2xl mx-auto">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Leaderboard</h1>
		<p class="text-gray-600">See how you stack up against your teammates</p>
	</div>

	<!-- Period Selector -->
	<div class="flex gap-2 mb-6">
		<a
			href="/leaderboard?period=weekly"
			class="flex-1 py-2 px-4 text-center rounded-lg transition-colors {period === 'weekly' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			This Week
		</a>
		<a
			href="/leaderboard?period=monthly"
			class="flex-1 py-2 px-4 text-center rounded-lg transition-colors {period === 'monthly' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			This Month
		</a>
	</div>

	<!-- Your Position Card -->
	<div class="card mb-6 bg-gradient-to-r from-primary-500 to-blue-500 text-white">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm opacity-80">Your Rank</p>
					<p class="text-4xl font-bold">#{userPosition}</p>
					<p class="text-sm opacity-80">of {data.totalParticipants} participants</p>
				</div>
				<div class="text-right">
					<p class="text-3xl font-bold">{currentUser.points}</p>
					<p class="text-sm opacity-80">{period === 'weekly' ? 'this week' : 'this month'}</p>
					{#if currentUser.streak > 0}
						<div class="flex items-center justify-end gap-1 mt-2">
							<span>🔥</span>
							<span class="font-medium">{currentUser.streak} day streak</span>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Leaderboard List -->
	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold">Rankings</h2>
		</div>
		<div class="divide-y divide-gray-100">
			{#each leaderboard as entry, i}
				{@const rank = i + 1}
				<div
					class="flex items-center p-4 {getRankClass(rank)} {entry.userId === currentUser.id ? 'ring-2 ring-primary-500 ring-inset' : ''}"
				>
					<!-- Rank -->
					<div class="w-12 text-center">
						<span class="text-2xl {rank <= 3 ? '' : 'text-gray-500 text-lg font-medium'}">
							{getRankDisplay(rank)}
						</span>
					</div>

					<!-- User Info -->
					<div class="flex-1 min-w-0 ml-2">
						<p class="font-medium text-gray-900 truncate {entry.userId === currentUser.id ? 'text-primary-700' : ''}">
							{entry.userName}
							{#if entry.userId === currentUser.id}
								<span class="text-xs text-primary-500">(You)</span>
							{/if}
						</p>
						<div class="flex items-center gap-2 text-sm text-gray-500">
							<span>Level {entry.level}</span>
							{#if entry.streak > 0}
								<span class="flex items-center gap-1">
									<span class="text-orange-500">🔥</span>
									{entry.streak}
								</span>
							{/if}
						</div>
					</div>

					<!-- Points -->
					<div class="text-right">
						<p class="text-xl font-bold text-gray-900">{entry.points}</p>
						<p class="text-xs text-gray-500">points</p>
					</div>
				</div>
			{:else}
				<div class="p-8 text-center text-gray-500">
					<p>No leaderboard data yet.</p>
					<p class="text-sm">Start earning points to appear on the leaderboard!</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- How to Earn Points -->
	<div class="mt-6 card">
		<div class="card-header">
			<h2 class="font-semibold">How to Earn Points</h2>
		</div>
		<div class="card-body">
			<div class="space-y-3 text-sm">
				<div class="flex justify-between">
					<span class="text-gray-600">Clock in on time</span>
					<span class="font-medium text-green-600">+10-15 pts</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600">Complete a task</span>
					<span class="font-medium text-green-600">+20-35 pts</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600">Submit pricing decision</span>
					<span class="font-medium text-green-600">+10 pts</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600">Excellent pricing grade</span>
					<span class="font-medium text-green-600">+25 pts</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600">Maintain a streak</span>
					<span class="font-medium text-green-600">1.1x - 1.5x multiplier</span>
				</div>
				<div class="flex justify-between text-red-600">
					<span>Clock in late</span>
					<span class="font-medium">-5 to -20 pts</span>
				</div>
				<div class="flex justify-between text-red-600">
					<span>Miss a task</span>
					<span class="font-medium">-20 pts</span>
				</div>
			</div>
		</div>
	</div>
</div>
