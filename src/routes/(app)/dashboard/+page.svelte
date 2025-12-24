<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;

	$: user = data.user;
	$: nextShift = data.nextShift;
	$: activeTimeEntry = data.activeTimeEntry;
	$: pendingTasks = data.pendingTasks;
	$: unreadMessages = data.unreadMessages;
	$: dropStats = data.dropStats;
	$: userIsPurchaser = data.userIsPurchaser;
	$: gamification = data.gamification;

	let clockLoading = false;

	function getTierColor(tier: string): string {
		switch (tier) {
			case 'bronze': return 'text-amber-600 bg-amber-100';
			case 'silver': return 'text-gray-500 bg-gray-100';
			case 'gold': return 'text-yellow-600 bg-yellow-100';
			case 'platinum': return 'text-purple-600 bg-purple-100';
			default: return 'text-gray-500 bg-gray-100';
		}
	}
</script>

<svelte:head>
	<title>Dashboard - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<!-- Welcome Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Hello, {user?.name?.split(' ')[0]}</h1>
		<p class="text-gray-600">
			{new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric' })}
		</p>
	</div>

	<!-- Gamification Card -->
	{#if gamification}
		<div class="card mb-6 bg-gradient-to-br from-primary-50 to-blue-50 border-primary-200">
			<div class="card-body">
				<!-- Level & Points -->
				<div class="flex items-center justify-between mb-4">
					<div>
						<div class="flex items-center gap-2">
							<span class="text-2xl font-bold text-primary-700">Level {gamification.level}</span>
							<span class="text-sm font-medium text-primary-600">{gamification.levelName}</span>
						</div>
						<p class="text-sm text-gray-600">{gamification.totalPoints.toLocaleString()} total points</p>
					</div>
					<div class="text-right">
						{#if gamification.currentStreak > 0}
							<div class="flex items-center gap-1 text-orange-600">
								<span class="text-2xl">🔥</span>
								<span class="font-bold">{gamification.currentStreak}</span>
							</div>
							<p class="text-xs text-gray-500">day streak</p>
						{/if}
					</div>
				</div>

				<!-- Level Progress Bar -->
				<div class="mb-4">
					<div class="flex justify-between text-xs text-gray-600 mb-1">
						<span>Progress to Level {gamification.level + 1}</span>
						<span>{gamification.levelProgress}%</span>
					</div>
					<div class="h-2 bg-white rounded-full overflow-hidden shadow-inner">
						<div
							class="h-full bg-gradient-to-r from-primary-500 to-blue-500 transition-all duration-500"
							style="width: {gamification.levelProgress}%"
						></div>
					</div>
				</div>

				<!-- Today's Stats -->
				<div class="grid grid-cols-3 gap-2 text-center">
					<div class="bg-white/60 rounded-lg p-2">
						<p class="text-xl font-bold text-green-600">+{gamification.todayPoints}</p>
						<p class="text-xs text-gray-600">Today</p>
					</div>
					<div class="bg-white/60 rounded-lg p-2">
						<p class="text-xl font-bold text-primary-600">{gamification.weeklyPoints}</p>
						<p class="text-xs text-gray-600">This Week</p>
					</div>
					<a href="/leaderboard" class="bg-white/60 rounded-lg p-2 hover:bg-white/80 transition-colors">
						<p class="text-xl font-bold text-amber-600">#{gamification.position || '-'}</p>
						<p class="text-xs text-gray-600">Rank</p>
					</a>
				</div>

				<!-- Recent Achievements -->
				{#if gamification.recentAchievements && gamification.recentAchievements.length > 0}
					<div class="mt-4 pt-4 border-t border-primary-200">
						<div class="flex items-center justify-between mb-2">
							<p class="text-sm font-medium text-gray-700">Recent Achievements</p>
							<a href="/achievements" class="text-xs text-primary-600 hover:underline">
								{gamification.achievementStats.earned}/{gamification.achievementStats.total}
							</a>
						</div>
						<div class="flex gap-2 flex-wrap">
							{#each gamification.recentAchievements as achievement}
								<span
									class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm {getTierColor(achievement.tier)}"
									title={achievement.name}
								>
									<span>{achievement.icon || '⭐'}</span>
									<span class="font-medium">{achievement.name}</span>
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Mini Leaderboard -->
				{#if gamification.leaderboard && gamification.leaderboard.length > 0}
					<div class="mt-4 pt-4 border-t border-primary-200">
						<div class="flex items-center justify-between mb-2">
							<p class="text-sm font-medium text-gray-700">Weekly Leaders</p>
							<a href="/leaderboard" class="text-xs text-primary-600 hover:underline">View All</a>
						</div>
						<div class="space-y-1">
							{#each gamification.leaderboard.slice(0, 3) as leader, i}
								<div class="flex items-center gap-2 text-sm {leader.userId === user?.id ? 'font-bold text-primary-700' : 'text-gray-700'}">
									<span class="w-5 text-center">
										{#if i === 0}🥇{:else if i === 1}🥈{:else if i === 2}🥉{:else}{i + 1}.{/if}
									</span>
									<span class="flex-1 truncate">{leader.userName}</span>
									<span class="text-gray-500">{leader.points} pts</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Clock In/Out Card -->
	<div class="card mb-6">
		<div class="card-body">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold">Time Clock</h2>
				{#if activeTimeEntry}
					<span class="badge-success">Clocked In</span>
				{:else}
					<span class="badge-gray">Clocked Out</span>
				{/if}
			</div>

			{#if activeTimeEntry}
				<div class="mb-4">
					<p class="text-sm text-gray-600">Started at</p>
					<p class="text-xl font-semibold">
						{new Date(activeTimeEntry.clockIn).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}
					</p>
					{#if activeTimeEntry.clockInAddress}
						<p class="text-sm text-gray-500">{activeTimeEntry.clockInAddress}</p>
					{/if}
				</div>
				<form method="POST" action="/api/clock/out" use:enhance={() => {
					clockLoading = true;
					return async ({ update }) => {
						clockLoading = false;
						await update();
					};
				}}>
					<button type="submit" disabled={clockLoading} class="btn-danger w-full touch-target">
						{clockLoading ? 'Clocking Out...' : 'Clock Out'}
					</button>
				</form>
			{:else}
				{#if nextShift}
					<div class="mb-4">
						<p class="text-sm text-gray-600">Next Shift</p>
						<p class="text-xl font-semibold">
							{new Date(nextShift.startTime).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}
							-
							{new Date(nextShift.endTime).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}
						</p>
						{#if nextShift.location}
							<p class="text-sm text-gray-500">{nextShift.location.name}</p>
						{/if}
					</div>
				{/if}
				<form method="POST" action="/api/clock/in" use:enhance={() => {
					clockLoading = true;
					return async ({ update }) => {
						clockLoading = false;
						await update();
					};
				}}>
					<button type="submit" disabled={clockLoading} class="btn-primary w-full touch-target">
						{clockLoading ? 'Clocking In...' : 'Clock In'}
					</button>
				</form>
			{/if}
		</div>
	</div>

	<!-- Quick Stats Grid -->
	<div class="grid grid-cols-2 gap-4 mb-6">
		<a href="/tasks" class="card hover:shadow-md transition-shadow">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-primary-600">{pendingTasks}</p>
				<p class="text-sm text-gray-600">Pending Tasks</p>
			</div>
		</a>
		<a href="/messages" class="card hover:shadow-md transition-shadow">
			<div class="card-body text-center">
				<p class="text-3xl font-bold text-primary-600">{unreadMessages}</p>
				<p class="text-sm text-gray-600">Unread Messages</p>
			</div>
		</a>
	</div>

	<!-- Inventory Drops Section for Purchasers -->
	{#if userIsPurchaser && dropStats}
		<div class="card mb-6">
			<div class="card-header flex items-center justify-between">
				<h2 class="font-semibold">Inventory Drops</h2>
				<a href="/inventory/drops" class="text-primary-600 text-sm hover:underline">View All</a>
			</div>
			<div class="card-body">
				<div class="grid grid-cols-3 gap-4 text-center">
					<a href="/inventory/drops?status=pending" class="hover:bg-gray-50 rounded-lg p-2 transition-colors">
						<p class="text-2xl font-bold text-amber-600">{dropStats.pendingDrops}</p>
						<p class="text-xs text-gray-600">Pending</p>
					</a>
					<a href="/inventory/drops?status=processing" class="hover:bg-gray-50 rounded-lg p-2 transition-colors">
						<p class="text-2xl font-bold text-blue-600">{dropStats.processingDrops}</p>
						<p class="text-xs text-gray-600">Processing</p>
					</a>
					<div class="p-2">
						<p class="text-2xl font-bold text-green-600">{dropStats.itemsToday}</p>
						<p class="text-xs text-gray-600">Items Today</p>
					</div>
				</div>
				{#if dropStats.pendingDrops > 0}
					<div class="mt-4 pt-4 border-t">
						<a href="/inventory/drops/new" class="btn-primary w-full text-center block">
							<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
							New Drop
						</a>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Quick Actions -->
	<div class="card">
		<div class="card-header">
			<h2 class="font-semibold">Quick Actions</h2>
		</div>
		<div class="divide-y divide-gray-200">
			<a href="/tasks" class="flex items-center justify-between p-4 hover:bg-gray-50">
				<div class="flex items-center">
					<div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
						<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
						</svg>
					</div>
					<span class="font-medium">View Tasks</span>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</a>
			<a href="/schedule" class="flex items-center justify-between p-4 hover:bg-gray-50">
				<div class="flex items-center">
					<div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
						<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<span class="font-medium">View Schedule</span>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</a>
			<a href="/messages" class="flex items-center justify-between p-4 hover:bg-gray-50">
				<div class="flex items-center">
					<div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
						<svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
						</svg>
					</div>
					<span class="font-medium">Messages</span>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</a>
		</div>
	</div>
</div>
