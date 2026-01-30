<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: achievements = data.achievements;
	$: byCategory = data.byCategory;
	$: stats = data.stats;
	$: userStats = data.userStats;
	$: pricingStats = data.pricingStats;
	$: recentGrades = data.recentGrades;

	function getTierColor(tier: string): string {
		switch (tier) {
			case 'bronze': return 'from-amber-600 to-amber-400 text-white';
			case 'silver': return 'from-gray-400 to-gray-300 text-gray-800';
			case 'gold': return 'from-yellow-500 to-yellow-300 text-yellow-900';
			case 'platinum': return 'from-purple-600 to-purple-400 text-white';
			default: return 'from-gray-400 to-gray-300 text-gray-800';
		}
	}

	function getTierBorder(tier: string): string {
		switch (tier) {
			case 'bronze': return 'border-amber-400';
			case 'silver': return 'border-gray-300';
			case 'gold': return 'border-yellow-400';
			case 'platinum': return 'border-purple-400';
			default: return 'border-gray-300';
		}
	}

	function getCategoryLabel(category: string): string {
		switch (category) {
			case 'attendance': return 'Attendance';
			case 'task': return 'Tasks';
			case 'pricing': return 'Pricing';
			case 'sales': return 'Sales';
			case 'bonus': return 'Special';
			default: return category.charAt(0).toUpperCase() + category.slice(1);
		}
	}

	function getCategoryIcon(category: string): string {
		switch (category) {
			case 'attendance': return '⏰';
			case 'task': return '✅';
			case 'pricing': return '💰';
			case 'sales': return '📈';
			case 'bonus': return '⭐';
			default: return '🏆';
		}
	}

	function formatDate(date: Date | string | null): string {
		if (!date) return '';
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString('en-US', {
			timeZone: 'America/Los_Angeles',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getGradeColor(grade: number): string {
		if (grade >= 4.5) return 'text-green-600';
		if (grade >= 3.5) return 'text-blue-600';
		if (grade >= 2.5) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getGradeBgColor(grade: number): string {
		if (grade >= 4.5) return 'bg-green-100 text-green-800';
		if (grade >= 3.5) return 'bg-blue-100 text-blue-800';
		if (grade >= 2.5) return 'bg-yellow-100 text-yellow-800';
		return 'bg-red-100 text-red-800';
	}

	function getGradeLabel(grade: number): string {
		if (grade >= 4.5) return 'Excellent';
		if (grade >= 3.5) return 'Good';
		if (grade >= 2.5) return 'Acceptable';
		return 'Needs Improvement';
	}

	function renderStars(rating: number): string {
		return '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
	}

	const categoryOrder = ['attendance', 'task', 'pricing', 'sales', 'bonus'];
	$: sortedCategories = Object.keys(byCategory).sort((a, b) => {
		return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
	});
</script>

<svelte:head>
	<title>Achievements - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-4xl mx-auto">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Achievements</h1>
		<p class="text-gray-600">Track your progress and unlock badges</p>
	</div>

	<!-- Stats Overview -->
	<div class="card mb-6 bg-gradient-to-r from-primary-500 to-blue-500 text-white">
		<div class="card-body">
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
				<div>
					<p class="text-3xl font-bold">{stats.earned}</p>
					<p class="text-sm opacity-80">Earned</p>
				</div>
				<div>
					<p class="text-3xl font-bold">{stats.total}</p>
					<p class="text-sm opacity-80">Total</p>
				</div>
				<div>
					<p class="text-3xl font-bold">{Math.round((stats.earned / stats.total) * 100)}%</p>
					<p class="text-sm opacity-80">Complete</p>
				</div>
				<div>
					<p class="text-3xl font-bold">+{userStats.totalPoints}</p>
					<p class="text-sm opacity-80">Points Earned</p>
				</div>
			</div>

			<!-- Progress Bar -->
			<div class="mt-4">
				<div class="h-3 bg-white/30 rounded-full overflow-hidden">
					<div
						class="h-full bg-white transition-all duration-500"
						style="width: {(stats.earned / stats.total) * 100}%"
					></div>
				</div>
			</div>
		</div>
	</div>

	<!-- User Stats Card -->
	<div class="card mb-6">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-gray-600">Your Level</p>
					<p class="text-2xl font-bold text-primary-700">Level {userStats.level} - {userStats.levelName}</p>
				</div>
				<div class="text-right">
					<p class="text-sm text-gray-600">Total Points</p>
					<p class="text-2xl font-bold text-gray-900">{userStats.totalPoints.toLocaleString()}</p>
				</div>
			</div>
			{#if userStats.currentStreak > 0}
				<div class="mt-4 pt-4 border-t flex items-center gap-2">
					<span class="text-2xl">🔥</span>
					<span class="font-medium text-orange-600">{userStats.currentStreak} day streak</span>
					{#if userStats.longestStreak > userStats.currentStreak}
						<span class="text-gray-500 text-sm">(Best: {userStats.longestStreak} days)</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Pricing Performance Section -->
	{#if pricingStats.totalGraded > 0}
		<div class="card mb-6">
			<div class="card-header flex items-center gap-2">
				<span class="text-xl">💰</span>
				<h2 class="font-semibold">Pricing Performance</h2>
			</div>
			<div class="card-body">
				<!-- Overview Stats -->
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
					<div class="text-center p-3 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold {getGradeColor(pricingStats.averageGrade)}">{pricingStats.averageGrade}</p>
						<p class="text-xs text-gray-500">Avg Grade</p>
					</div>
					<div class="text-center p-3 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-gray-900">{pricingStats.totalGraded}</p>
						<p class="text-xs text-gray-500">Graded</p>
					</div>
					<div class="text-center p-3 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold {pricingStats.totalPoints >= 0 ? 'text-green-600' : 'text-red-600'}">
							{pricingStats.totalPoints >= 0 ? '+' : ''}{pricingStats.totalPoints}
						</p>
						<p class="text-xs text-gray-500">Points</p>
					</div>
					<div class="text-center p-3 bg-gray-50 rounded-lg">
						<p class="text-2xl font-bold text-green-600">{pricingStats.excellent}</p>
						<p class="text-xs text-gray-500">Excellent</p>
					</div>
				</div>

				<!-- Grade Distribution -->
				<div class="mb-6">
					<h3 class="text-sm font-medium text-gray-600 mb-3">Grade Distribution</h3>
					<div class="flex gap-1 h-4 rounded-full overflow-hidden bg-gray-200">
						{#if pricingStats.excellent > 0}
							<div
								class="bg-green-500 transition-all"
								style="width: {(pricingStats.excellent / pricingStats.totalGraded) * 100}%"
								title="{pricingStats.excellent} Excellent"
							></div>
						{/if}
						{#if pricingStats.good > 0}
							<div
								class="bg-blue-500 transition-all"
								style="width: {(pricingStats.good / pricingStats.totalGraded) * 100}%"
								title="{pricingStats.good} Good"
							></div>
						{/if}
						{#if pricingStats.acceptable > 0}
							<div
								class="bg-yellow-500 transition-all"
								style="width: {(pricingStats.acceptable / pricingStats.totalGraded) * 100}%"
								title="{pricingStats.acceptable} Acceptable"
							></div>
						{/if}
						{#if pricingStats.needsImprovement > 0}
							<div
								class="bg-red-500 transition-all"
								style="width: {(pricingStats.needsImprovement / pricingStats.totalGraded) * 100}%"
								title="{pricingStats.needsImprovement} Needs Improvement"
							></div>
						{/if}
					</div>
					<div class="flex justify-between text-xs text-gray-500 mt-2">
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-green-500"></span>
							Excellent ({pricingStats.excellent})
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-blue-500"></span>
							Good ({pricingStats.good})
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-yellow-500"></span>
							Acceptable ({pricingStats.acceptable})
						</div>
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full bg-red-500"></span>
							Needs Work ({pricingStats.needsImprovement})
						</div>
					</div>
				</div>

				<!-- Category Averages -->
				<div class="mb-6">
					<h3 class="text-sm font-medium text-gray-600 mb-3">Category Averages</h3>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Price Accuracy</span>
							<span class="text-amber-500 tracking-wider">{renderStars(pricingStats.avgPriceAccuracy)}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Justification Quality</span>
							<span class="text-amber-500 tracking-wider">{renderStars(pricingStats.avgJustificationQuality)}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Photo Quality</span>
							<span class="text-amber-500 tracking-wider">{renderStars(pricingStats.avgPhotoQuality)}</span>
						</div>
					</div>
				</div>

				<!-- Recent Grades -->
				{#if recentGrades.length > 0}
					<div>
						<h3 class="text-sm font-medium text-gray-600 mb-3">Recent Grades</h3>
						<div class="space-y-2">
							{#each recentGrades as grade}
								<a
									href="/pricing/{grade.pricingDecisionId}"
									class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
								>
									<div class="min-w-0 flex-1">
										<p class="font-medium text-gray-900 truncate">{grade.itemDescription}</p>
										<p class="text-xs text-gray-500">{formatDate(grade.gradedAt)}</p>
									</div>
									<div class="flex items-center gap-3 ml-3">
										<span class="px-2 py-0.5 text-sm font-medium rounded-full {getGradeBgColor(parseFloat(grade.overallGrade))}">
											{grade.overallGrade}
										</span>
										<span class="text-sm font-medium {grade.pointsAwarded >= 0 ? 'text-green-600' : 'text-red-600'}">
											{grade.pointsAwarded >= 0 ? '+' : ''}{grade.pointsAwarded}
										</span>
									</div>
								</a>
							{/each}
						</div>
						<a href="/pricing" class="block text-center text-sm text-primary-600 hover:text-primary-700 mt-3">
							View all pricing history →
						</a>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Achievements by Category -->
	{#each sortedCategories as category}
		{@const categoryAchievements = byCategory[category]}
		{@const earnedInCategory = categoryAchievements.filter(a => a.earnedAt).length}
		<div class="card mb-6">
			<div class="card-header flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="text-xl">{getCategoryIcon(category)}</span>
					<h2 class="font-semibold">{getCategoryLabel(category)}</h2>
				</div>
				<span class="text-sm text-gray-500">{earnedInCategory}/{categoryAchievements.length}</span>
			</div>
			<div class="card-body">
				<div class="grid gap-4 sm:grid-cols-2">
					{#each categoryAchievements as achievement}
						<div
							class="relative p-4 rounded-lg border-2 transition-all {achievement.earnedAt
								? `${getTierBorder(achievement.tier)} bg-white shadow-sm`
								: 'border-gray-200 bg-gray-50 opacity-60'}"
						>
							<!-- Tier Badge -->
							<div
								class="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r {getTierColor(achievement.tier)}"
							>
								{achievement.tier.toUpperCase()}
							</div>

							<div class="flex items-start gap-3">
								<!-- Icon -->
								<div
									class="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl {achievement.earnedAt
										? 'bg-gradient-to-br ' + getTierColor(achievement.tier)
										: 'bg-gray-200'}"
								>
									{#if achievement.earnedAt}
										{achievement.icon || '🏆'}
									{:else}
										<span class="text-gray-400">🔒</span>
									{/if}
								</div>

								<!-- Content -->
								<div class="flex-1 min-w-0">
									<h3 class="font-semibold text-gray-900 {!achievement.earnedAt ? 'text-gray-500' : ''}">
										{achievement.name}
									</h3>
									<p class="text-sm text-gray-600 mt-0.5">
										{achievement.description}
									</p>
									<div class="flex items-center gap-2 mt-2 text-xs">
										<span class="font-medium text-green-600">+{achievement.pointReward} pts</span>
										{#if achievement.earnedAt}
											<span class="text-gray-400">•</span>
											<span class="text-gray-500">Earned {formatDate(achievement.earnedAt)}</span>
										{/if}
									</div>
								</div>
							</div>

							<!-- Earned checkmark -->
							{#if achievement.earnedAt}
								<div class="absolute bottom-2 right-2 text-green-500">
									<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
									</svg>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/each}

	<!-- Empty State -->
	{#if Object.keys(byCategory).length === 0}
		<div class="card">
			<div class="card-body text-center py-12">
				<p class="text-4xl mb-4">🏆</p>
				<p class="text-gray-600">No achievements available yet.</p>
				<p class="text-sm text-gray-500 mt-2">Check back later!</p>
			</div>
		</div>
	{/if}

	<!-- Tips -->
	<div class="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
		<h3 class="font-semibold text-blue-900 mb-2">Tips for Earning Achievements</h3>
		<ul class="text-sm text-blue-800 space-y-1">
			<li>• Clock in on time every day to build your streak</li>
			<li>• Complete tasks before their due date for bonus points</li>
			<li>• Add detailed notes and photos to your work</li>
			<li>• Aim for excellent grades on your pricing decisions</li>
		</ul>
	</div>
</div>
