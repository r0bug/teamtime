<script lang="ts">
	import type { PageData } from './$types';
	import NoteCard from '$lib/components/NoteCard.svelte';
	export let data: PageData;

	function fmtMoney(n: number): string {
		return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	function fmtShortDate(yyyyMmDd: string): string {
		try {
			const d = new Date(yyyyMmDd + 'T12:00:00Z');
			return new Intl.DateTimeFormat('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'America/Los_Angeles'
			}).format(d);
		} catch {
			return yyyyMmDd;
		}
	}

	$: stats = data.personalStats;
	$: hasAnyStats = stats && (
		stats.bestDayEver !== null ||
		stats.last30DaysGross > 0 ||
		stats.last30DaysVendorPortion > 0 ||
		stats.mtdGross > 0 ||
		stats.mtdVendorPortion > 0 ||
		stats.longestStreak > 0
	);
</script>

<svelte:head><title>{data.vendor.displayName} — Vendor Portal</title></svelte:head>

<div class="p-4 lg:p-8 max-w-5xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-900">Welcome, {data.vendor.contactName ?? data.vendor.displayName}</h1>
	<p class="text-gray-600 text-sm mt-1">Manage your inventory and view sales from your booth at the shop.</p>

	<!-- Base-item warning -->
	{#if data.baseItemCheck.checkable && !data.baseItemCheck.hasBaseItem}
		<div class="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
			<div class="flex items-start gap-3">
				<div class="text-2xl leading-none">⚠️</div>
				<div class="flex-1">
					<div class="font-semibold text-amber-900">
						Missing your base item: <span class="font-mono">{data.baseItemCheck.expectedName}</span>
					</div>
					<p class="text-sm text-amber-800 mt-1">
						Staff need a catch-all item named <span class="font-mono font-semibold">{data.baseItemCheck.expectedName}</span> to ring up unmarked merchandise from your booth. Submit one from the inventory page so this works at the register.
					</p>
					<a href="/vendor/inventory" class="inline-block mt-2 text-sm font-medium text-amber-900 underline">
						Go to inventory →
					</a>
				</div>
			</div>
		</div>
	{/if}

	<!-- Notes for you -->
	{#if data.notesForYou && data.notesForYou.length > 0}
		<section class="mt-6">
			<div class="card">
				<div class="card-header flex items-center justify-between">
					<h2 class="font-semibold text-gray-900">Notes for You</h2>
					<a href="/vendor/notes" class="text-sm text-primary-600 hover:underline">View all →</a>
				</div>
				<div class="card-body grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
					{#each data.notesForYou as note (note.id)}
						<NoteCard {note} compact forYou={note.recipientUserId === data.user.id} />
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- Your Stats -->
	<section class="mt-6">
		<div class="card">
			<div class="card-header flex items-center justify-between">
				<h2 class="font-semibold text-gray-900">Your Stats</h2>
				<a href="/vendor/leaderboard" class="text-sm text-primary-600 hover:underline">See leaderboard →</a>
			</div>
			<div class="card-body">
				{#if !data.vendor.nrsVendorId || !stats || !hasAnyStats}
					<div class="text-sm text-gray-500">
						Stats appear once your first sales sync from NRS.
					</div>
				{:else}
					<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
						<!-- Best day ever -->
						<div>
							<div class="text-xs text-gray-500 uppercase tracking-wide">🏔️ Best day ever</div>
							{#if stats.bestDayEver}
								<div class="text-2xl font-extrabold text-gray-900 tabular-nums mt-1">{fmtMoney(stats.bestDayEver.gross)}</div>
								<div class="text-xs text-gray-500 mt-0.5 tabular-nums">Yours: {fmtMoney(stats.bestDayEver.vendorPortion)}</div>
								<div class="text-xs text-gray-500 mt-0.5">{fmtShortDate(stats.bestDayEver.date)}</div>
							{:else}
								<div class="text-2xl font-extrabold text-gray-300 mt-1">—</div>
							{/if}
						</div>

						<!-- MTD totals + rank -->
						<div>
							<div class="text-xs text-gray-500 uppercase tracking-wide">📅 Month to date</div>
							<div class="text-2xl font-extrabold text-gray-900 tabular-nums mt-1">{fmtMoney(stats.mtdGross)}</div>
							<div class="text-xs text-gray-500 mt-0.5 tabular-nums">Yours: {fmtMoney(stats.mtdVendorPortion)}</div>
							<div class="text-xs text-gray-500 mt-0.5">
								{#if stats.mtdRank !== null}
									Rank <span class="font-semibold text-gray-700">#{stats.mtdRank}</span> of {stats.totalVendorCount}
								{:else}
									Not yet ranked
								{/if}
							</div>
						</div>

						<!-- Streak -->
						<div>
							<div class="text-xs text-gray-500 uppercase tracking-wide">🔥 Streak</div>
							<div class="text-2xl font-extrabold text-gray-900 tabular-nums mt-1">
								{stats.currentStreak}
								<span class="text-sm font-medium text-gray-500">day{stats.currentStreak === 1 ? '' : 's'}</span>
							</div>
							<div class="text-xs text-gray-500 mt-0.5">Longest ever: {stats.longestStreak}</div>
						</div>

						<!-- Last 30 days -->
						<div>
							<div class="text-xs text-gray-500 uppercase tracking-wide">Last 30 days</div>
							<div class="text-2xl font-extrabold text-gray-900 tabular-nums mt-1">{fmtMoney(stats.last30DaysGross)}</div>
							<div class="text-xs text-gray-500 mt-0.5 tabular-nums">Yours: {fmtMoney(stats.last30DaysVendorPortion)}</div>
							{#if stats.bestWeekEver}
								<div class="text-xs text-gray-500 mt-0.5">Best week: {fmtMoney(stats.bestWeekEver.gross)}</div>
							{:else}
								<div class="text-xs text-gray-500 mt-0.5">&nbsp;</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
		<a href="/vendor/inventory" class="card hover:shadow-md transition-shadow">
			<div class="card-body">
				<div class="text-3xl font-bold text-gray-900">{data.changeCounts.pending}</div>
				<div class="text-sm text-gray-600">Pending inventory changes</div>
				<div class="text-xs text-gray-500 mt-2">Awaiting staff to apply to NRS</div>
			</div>
		</a>
		<a href="/vendor/sales" class="card hover:shadow-md transition-shadow">
			<div class="card-body">
				<div class="text-lg font-semibold text-gray-900">View sales</div>
				<div class="text-sm text-gray-600 mt-2">Recent sales pulled live from NRS</div>
			</div>
		</a>
		<a href="/vendor/profile" class="card hover:shadow-md transition-shadow">
			<div class="card-body">
				<div class="text-lg font-semibold text-gray-900">Account & password</div>
				<div class="text-sm text-gray-600 mt-2">Update your password</div>
			</div>
		</a>
	</div>

	<div class="card mt-6">
		<div class="card-header"><h2 class="font-semibold text-gray-900">Your booth</h2></div>
		<div class="card-body grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
			<div>
				<div class="text-xs text-gray-500">Booth</div>
				<div class="font-medium">{data.vendor.boothNumber ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Inventory prefix</div>
				<div class="font-mono">{data.vendor.inventoryCodePrefix ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Monthly rent</div>
				<div>{data.vendor.monthlyRentCents !== null ? `$${(data.vendor.monthlyRentCents / 100).toFixed(2)}` : '—'}</div>
			</div>
			<div>
				<div class="text-xs text-gray-500">Max discount</div>
				<div>{data.vendor.maxDiscountPercent ?? '—'}{data.vendor.maxDiscountPercent ? '%' : ''}</div>
			</div>
		</div>
	</div>
</div>
