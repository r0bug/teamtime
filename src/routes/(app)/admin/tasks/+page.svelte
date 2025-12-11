<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const triggerTypeLabels: Record<string, string> = {
		clock_in: 'Clock In',
		clock_out: 'Clock Out',
		first_clock_in: 'First Clock-In',
		last_clock_out: 'Last Clock-Out',
		time_into_shift: 'Time Into Shift',
		task_completed: 'Task Completed',
		schedule: 'Scheduled'
	};

	function formatDate(date: Date | string | null): string {
		if (!date) return 'Never';
		const d = new Date(date);
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Task Management - TeamTime</title>
</svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-gray-900">Task Management</h1>
		<p class="text-gray-600 mt-1">Manage task templates and automatic assignment rules</p>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-blue-600">{data.stats.activeTemplates}</div>
				<div class="text-sm text-gray-600">Active Templates</div>
				<div class="text-xs text-gray-400">{data.stats.totalTemplates} total</div>
			</div>
		</div>
		<div class="card">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-purple-600">{data.stats.activeRules}</div>
				<div class="text-sm text-gray-600">Active Rules</div>
				<div class="text-xs text-gray-400">{data.stats.totalRules} total</div>
			</div>
		</div>
		<div class="card col-span-2 lg:col-span-1">
			<div class="card-body text-center">
				<div class="text-3xl font-bold text-green-600">{data.stats.tasksGeneratedToday}</div>
				<div class="text-sm text-gray-600">Tasks Generated Today</div>
				<div class="text-xs text-gray-400">{data.stats.tasksGeneratedThisWeek} this week</div>
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="grid md:grid-cols-2 gap-4 mb-8">
		<a href="/admin/tasks/templates" class="card hover:shadow-md transition-shadow">
			<div class="card-body flex items-center">
				<div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
					<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
					</svg>
				</div>
				<div class="flex-1">
					<h3 class="font-semibold text-gray-900">Task Templates</h3>
					<p class="text-sm text-gray-600">Create and manage reusable task definitions</p>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</div>
		</a>

		<a href="/admin/tasks/rules" class="card hover:shadow-md transition-shadow">
			<div class="card-body flex items-center">
				<div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
					<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</div>
				<div class="flex-1">
					<h3 class="font-semibold text-gray-900">Assignment Rules</h3>
					<p class="text-sm text-gray-600">Configure automatic task creation and assignment</p>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</div>
		</a>
	</div>

	<!-- Recent Templates and Rules -->
	<div class="grid lg:grid-cols-2 gap-6">
		<!-- Recent Templates -->
		<div class="card">
			<div class="card-header flex justify-between items-center">
				<h2 class="font-semibold">Recent Templates</h2>
				<a href="/admin/tasks/templates" class="text-sm text-primary-600 hover:text-primary-700">View All</a>
			</div>
			{#if data.templatesWithRules.length > 0}
				<div class="divide-y divide-gray-200">
					{#each data.templatesWithRules as template}
						<div class="px-4 py-3 hover:bg-gray-50 flex items-center justify-between">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="font-medium text-gray-900 truncate">{template.name}</span>
									{#if template.triggerEvent}
										<span class="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
											{triggerTypeLabels[template.triggerEvent] || template.triggerEvent}
										</span>
									{/if}
								</div>
								<div class="text-sm text-gray-500">
									{template.ruleCount} rule{template.ruleCount !== 1 ? 's' : ''}
								</div>
							</div>
							<span class="px-2 py-1 text-xs font-medium rounded-full {template.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
								{template.isActive ? 'Active' : 'Inactive'}
							</span>
						</div>
					{/each}
				</div>
			{:else}
				<div class="card-body text-center text-gray-500">
					<p>No templates created yet</p>
					<a href="/admin/tasks/templates/new" class="btn btn-primary mt-3">Create Template</a>
				</div>
			{/if}
		</div>

		<!-- Recent Rule Activity -->
		<div class="card">
			<div class="card-header flex justify-between items-center">
				<h2 class="font-semibold">Recent Rule Activity</h2>
				<a href="/admin/tasks/rules" class="text-sm text-primary-600 hover:text-primary-700">View All</a>
			</div>
			{#if data.recentRules.length > 0}
				<div class="divide-y divide-gray-200">
					{#each data.recentRules as rule}
						<div class="px-4 py-3 hover:bg-gray-50">
							<div class="flex items-center justify-between mb-1">
								<span class="font-medium text-gray-900">{rule.name}</span>
								<span class="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">
									{triggerTypeLabels[rule.triggerType] || rule.triggerType}
								</span>
							</div>
							<div class="flex items-center justify-between text-sm text-gray-500">
								<span>Triggered {rule.triggerCount} time{rule.triggerCount !== 1 ? 's' : ''}</span>
								<span>Last: {formatDate(rule.lastTriggeredAt)}</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="card-body text-center text-gray-500">
					<p>No rules created yet</p>
					<a href="/admin/tasks/rules/new" class="btn btn-primary mt-3">Create Rule</a>
				</div>
			{/if}
		</div>
	</div>

	<!-- How It Works -->
	<div class="mt-8 card">
		<div class="card-header">
			<h2 class="font-semibold">How Task Automation Works</h2>
		</div>
		<div class="card-body">
			<div class="grid md:grid-cols-3 gap-6">
				<div class="text-center">
					<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
						<span class="text-xl font-bold text-blue-600">1</span>
					</div>
					<h3 class="font-medium text-gray-900 mb-1">Create Templates</h3>
					<p class="text-sm text-gray-600">Define reusable task templates with requirements like photos or notes</p>
				</div>
				<div class="text-center">
					<div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
						<span class="text-xl font-bold text-purple-600">2</span>
					</div>
					<h3 class="font-medium text-gray-900 mb-1">Configure Rules</h3>
					<p class="text-sm text-gray-600">Set up triggers (clock-in, schedule, etc.) and assignment methods</p>
				</div>
				<div class="text-center">
					<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
						<span class="text-xl font-bold text-green-600">3</span>
					</div>
					<h3 class="font-medium text-gray-900 mb-1">Auto-Assign</h3>
					<p class="text-sm text-gray-600">Tasks are automatically created and assigned when triggers fire</p>
				</div>
			</div>
		</div>
	</div>
</div>
