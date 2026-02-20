<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let activeTab: 'overview' | 'delivery' | 'replies' | 'scheduled' = 'overview';

	let testPhone = '';
	let testResult: { success: boolean; sid?: string; error?: string } | null = null;
	let testLoading = false;

	async function sendTestSMS() {
		if (!testPhone.trim()) return;
		testLoading = true;
		testResult = null;

		try {
			const res = await fetch('/api/sms/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone: testPhone })
			});
			testResult = await res.json();
		} catch (err) {
			testResult = { success: false, error: 'Network error' };
		} finally {
			testLoading = false;
		}
	}

	function statusColor(status: string): string {
		switch (status) {
			case 'delivered': case 'completed': return 'bg-green-100 text-green-800';
			case 'sent': case 'queued': case 'pending': return 'bg-yellow-100 text-yellow-800';
			case 'running': return 'bg-blue-100 text-blue-800';
			case 'failed': case 'undelivered': return 'bg-red-100 text-red-800';
			case 'received': return 'bg-blue-100 text-blue-800';
			case 'opt_out': return 'bg-red-100 text-red-800';
			case 'cancelled': return 'bg-gray-100 text-gray-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function formatDate(d: string | Date | null): string {
		if (!d) return '-';
		return new Date(d).toLocaleString();
	}

	function getPayloadSummary(payload: Record<string, unknown> | null): string {
		if (!payload) return '-';
		if (payload.toAllStaff) return 'All Staff';
		if (payload.toPhone) return String(payload.toPhone);
		if (payload.toUserId) return `User: ${String(payload.toUserId).slice(0, 8)}...`;
		return '-';
	}

	$: totalOutbound = Object.values(data.deliveryStats).reduce((a, b) => a + b, 0);
	$: deliveredCount = data.deliveryStats['delivered'] || 0;
	$: failedCount = (data.deliveryStats['failed'] || 0) + (data.deliveryStats['undelivered'] || 0);
	$: deliveryRate = totalOutbound > 0 ? Math.round((deliveredCount / totalOutbound) * 100) : 0;
</script>

<svelte:head>
	<title>SMS Dashboard - TeamTime Admin</title>
</svelte:head>

<div class="p-4 lg:p-8">
	<div class="max-w-5xl mx-auto">
		<h1 class="text-2xl font-bold mb-6">SMS Dashboard</h1>

		<!-- Tab Navigation -->
		<div class="border-b border-gray-200 mb-6">
			<nav class="flex space-x-8">
				{#each [
					{ id: 'overview', label: 'Overview' },
					{ id: 'delivery', label: 'Delivery Tracking' },
					{ id: 'replies', label: `Replies & Opt-outs` },
					{ id: 'scheduled', label: 'Scheduled Jobs' }
				] as tab}
					<button
						on:click={() => activeTab = tab.id}
						class="py-3 px-1 border-b-2 text-sm font-medium transition-colors {activeTab === tab.id
							? 'border-primary-500 text-primary-600'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
					>
						{tab.label}
						{#if tab.id === 'replies' && data.optOutCount > 0}
							<span class="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-red-100 text-red-700">{data.optOutCount}</span>
						{/if}
					</button>
				{/each}
			</nav>
		</div>

		<!-- Overview Tab -->
		{#if activeTab === 'overview'}
			<!-- Configuration Status -->
			<div class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-lg font-semibold mb-4">Configuration Status</h2>
				<div class="flex items-center gap-3 mb-4">
					{#if data.configured}
						<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
							<svg class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
							</svg>
							Twilio Configured
						</span>
					{:else}
						<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
							<svg class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
							</svg>
							Not Configured
						</span>
						<p class="text-sm text-gray-500">Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env</p>
					{/if}
				</div>

				<!-- Quick Stats -->
				{#if totalOutbound > 0}
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
						<div class="text-center p-3 bg-gray-50 rounded-lg">
							<div class="text-2xl font-bold">{totalOutbound}</div>
							<div class="text-xs text-gray-500">Total Sent</div>
						</div>
						<div class="text-center p-3 bg-green-50 rounded-lg">
							<div class="text-2xl font-bold text-green-700">{deliveredCount}</div>
							<div class="text-xs text-gray-500">Delivered</div>
						</div>
						<div class="text-center p-3 {failedCount > 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-lg">
							<div class="text-2xl font-bold {failedCount > 0 ? 'text-red-700' : ''}">{failedCount}</div>
							<div class="text-xs text-gray-500">Failed</div>
						</div>
						<div class="text-center p-3 bg-blue-50 rounded-lg">
							<div class="text-2xl font-bold text-blue-700">{deliveryRate}%</div>
							<div class="text-xs text-gray-500">Delivery Rate</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Send Test SMS -->
			{#if data.configured}
				<div class="bg-white rounded-lg shadow p-6 mb-6">
					<h2 class="text-lg font-semibold mb-4">Send Test SMS</h2>
					<div class="flex gap-3">
						<input
							type="tel"
							bind:value={testPhone}
							placeholder="(555) 123-4567 or +15551234567"
							class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
						/>
						<button
							on:click={sendTestSMS}
							disabled={testLoading || !testPhone.trim()}
							class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{testLoading ? 'Sending...' : 'Send Test'}
						</button>
					</div>

					{#if testResult}
						<div class="mt-3 p-3 rounded-lg text-sm {testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}">
							{#if testResult.success}
								Test SMS sent! (SID: {testResult.sid})
							{:else}
								Failed: {testResult.error}
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Staff Phone Coverage -->
			<div class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-lg font-semibold mb-4">Staff Phone Coverage</h2>
				<div class="grid grid-cols-3 gap-4 mb-4">
					<div class="text-center p-3 bg-gray-50 rounded-lg">
						<div class="text-2xl font-bold">{data.staffCoverage.total}</div>
						<div class="text-xs text-gray-500">Total Active</div>
					</div>
					<div class="text-center p-3 bg-green-50 rounded-lg">
						<div class="text-2xl font-bold text-green-700">{data.staffCoverage.withPhone}</div>
						<div class="text-xs text-gray-500">With Phone</div>
					</div>
					<div class="text-center p-3 {data.staffCoverage.withoutPhone > 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-lg">
						<div class="text-2xl font-bold {data.staffCoverage.withoutPhone > 0 ? 'text-red-700' : ''}">{data.staffCoverage.withoutPhone}</div>
						<div class="text-xs text-gray-500">Missing Phone</div>
					</div>
				</div>

				{#if data.staffCoverage.missingPhones.length > 0}
					<div class="border-t pt-3">
						<p class="text-sm font-medium text-gray-700 mb-2">Staff missing phone numbers:</p>
						<div class="flex flex-wrap gap-2">
							{#each data.staffCoverage.missingPhones as staff}
								<a
									href="/admin/users?edit={staff.id}"
									class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200"
								>
									{staff.name}
								</a>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Opt-out Warning -->
			{#if data.optOutCount > 0}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
					<div class="flex items-center">
						<svg class="w-5 h-5 text-red-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
						<span class="text-sm font-medium text-red-800">
							{data.optOutCount} user{data.optOutCount > 1 ? 's have' : ' has'} opted out of SMS (sent STOP).
							<button on:click={() => activeTab = 'replies'} class="underline">View details</button>
						</span>
					</div>
				</div>
			{/if}
		{/if}

		<!-- Delivery Tracking Tab -->
		{#if activeTab === 'delivery'}
			<!-- Delivery Stats -->
			<div class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-lg font-semibold mb-4">Delivery Statistics</h2>
				<div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
					{#each ['queued', 'sent', 'delivered', 'undelivered', 'failed'] as status}
						<div class="text-center p-3 bg-gray-50 rounded-lg">
							<div class="text-xl font-bold">{data.deliveryStats[status] || 0}</div>
							<div class="text-xs text-gray-500 capitalize">{status}</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Delivery Log -->
			<div class="bg-white rounded-lg shadow p-6">
				<h2 class="text-lg font-semibold mb-4">Outbound Message Log</h2>

				{#if data.deliveryLog.length === 0}
					<p class="text-sm text-gray-500">No outbound messages logged yet. Messages will appear here after the APP_URL environment variable is set and SMS are sent.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-gray-500 border-b">
									<th class="pb-2 pr-4">Status</th>
									<th class="pb-2 pr-4">Recipient</th>
									<th class="pb-2 pr-4">Message</th>
									<th class="pb-2 pr-4">Sent</th>
									<th class="pb-2 pr-4">Updated</th>
									<th class="pb-2">Error</th>
								</tr>
							</thead>
							<tbody>
								{#each data.deliveryLog as msg}
									<tr class="border-b border-gray-100">
										<td class="py-2 pr-4">
											<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium {statusColor(msg.status)}">
												{msg.status}
											</span>
										</td>
										<td class="py-2 pr-4 whitespace-nowrap">
											{#if msg.userName}
												<span class="font-medium">{msg.userName}</span>
												<span class="text-gray-400 text-xs block">{msg.toNumber}</span>
											{:else}
												{msg.toNumber}
											{/if}
										</td>
										<td class="py-2 pr-4 max-w-[250px] truncate text-gray-600" title={msg.body || ''}>
											{msg.body || '-'}
										</td>
										<td class="py-2 pr-4 whitespace-nowrap text-gray-500 text-xs">{formatDate(msg.createdAt)}</td>
										<td class="py-2 pr-4 whitespace-nowrap text-gray-500 text-xs">{formatDate(msg.statusUpdatedAt)}</td>
										<td class="py-2 text-xs">
											{#if msg.errorCode || msg.errorMessage}
												<span class="text-red-600" title="{msg.errorCode}: {msg.errorMessage}">
													{msg.errorCode || ''} {msg.errorMessage ? msg.errorMessage.slice(0, 30) : ''}
												</span>
											{:else}
												-
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Replies & Opt-outs Tab -->
		{#if activeTab === 'replies'}
			{#if data.optOutCount > 0}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
					<p class="text-sm text-red-800">
						<strong>{data.optOutCount}</strong> opt-out{data.optOutCount > 1 ? 's' : ''} received.
						Twilio automatically blocks future messages to opted-out numbers.
						Users can text START to re-subscribe.
					</p>
				</div>
			{/if}

			<div class="bg-white rounded-lg shadow p-6">
				<h2 class="text-lg font-semibold mb-4">Inbound Messages</h2>

				{#if data.inboundMessages.length === 0}
					<p class="text-sm text-gray-500">No inbound messages yet. Replies will appear here once the Twilio webhook is configured.</p>
					<div class="mt-4 p-4 bg-blue-50 rounded-lg">
						<p class="text-sm text-blue-800 font-medium mb-2">Twilio Webhook Setup Required</p>
						<p class="text-sm text-blue-700">
							Set your Twilio phone number's webhook URL to receive inbound messages.
							See the setup instructions below the dashboard.
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-gray-500 border-b">
									<th class="pb-2 pr-4">Type</th>
									<th class="pb-2 pr-4">From</th>
									<th class="pb-2 pr-4">Message</th>
									<th class="pb-2">Received</th>
								</tr>
							</thead>
							<tbody>
								{#each data.inboundMessages as msg}
									<tr class="border-b border-gray-100">
										<td class="py-2 pr-4">
											<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium {statusColor(msg.status)}">
												{msg.status === 'opt_out' ? 'OPT-OUT' : 'Reply'}
											</span>
										</td>
										<td class="py-2 pr-4 whitespace-nowrap">
											{#if msg.userName}
												<span class="font-medium">{msg.userName}</span>
												<span class="text-gray-400 text-xs block">{msg.fromNumber}</span>
											{:else}
												{msg.fromNumber}
											{/if}
										</td>
										<td class="py-2 pr-4 max-w-[300px]">
											<span class="{msg.status === 'opt_out' ? 'text-red-600 font-medium' : 'text-gray-700'}">
												{msg.body || '-'}
											</span>
										</td>
										<td class="py-2 whitespace-nowrap text-gray-500 text-xs">{formatDate(msg.createdAt)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Scheduled Jobs Tab -->
		{#if activeTab === 'scheduled'}
			<div class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-lg font-semibold mb-4">SMS Job Queue</h2>
				<div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
					{#each ['pending', 'running', 'completed', 'failed', 'cancelled'] as status}
						<div class="text-center p-3 bg-gray-50 rounded-lg">
							<div class="text-xl font-bold">{data.stats[status] || 0}</div>
							<div class="text-xs text-gray-500 capitalize">{status}</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="bg-white rounded-lg shadow p-6">
				<h2 class="text-lg font-semibold mb-4">Scheduled SMS History</h2>

				{#if data.recentJobs.length === 0}
					<p class="text-sm text-gray-500">No scheduled SMS jobs found.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr class="text-left text-gray-500 border-b">
									<th class="pb-2 pr-4">Status</th>
									<th class="pb-2 pr-4">Recipient</th>
									<th class="pb-2 pr-4">Message</th>
									<th class="pb-2 pr-4">Scheduled</th>
									<th class="pb-2 pr-4">Completed</th>
									<th class="pb-2">Result</th>
								</tr>
							</thead>
							<tbody>
								{#each data.recentJobs as job}
									<tr class="border-b border-gray-100">
										<td class="py-2 pr-4">
											<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium {statusColor(job.status)}">
												{job.status}
											</span>
										</td>
										<td class="py-2 pr-4 whitespace-nowrap">{getPayloadSummary(job.payload)}</td>
										<td class="py-2 pr-4 max-w-[200px] truncate" title={job.payload?.message ? String(job.payload.message) : ''}>
											{job.payload?.message || '-'}
										</td>
										<td class="py-2 pr-4 whitespace-nowrap text-gray-500 text-xs">{formatDate(job.runAt)}</td>
										<td class="py-2 pr-4 whitespace-nowrap text-gray-500 text-xs">{formatDate(job.completedAt)}</td>
										<td class="py-2 text-xs">
											{#if job.error}
												<span class="text-red-600" title={job.error}>{job.error.slice(0, 40)}{job.error.length > 40 ? '...' : ''}</span>
											{:else if job.result?.success}
												<span class="text-green-600">Sent</span>
											{:else}
												-
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Twilio Setup Instructions (always visible at bottom) -->
		<div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mt-8">
			<h2 class="text-lg font-semibold mb-3">Twilio Console Setup</h2>
			<p class="text-sm text-gray-600 mb-4">To enable delivery tracking and inbound replies, configure these in your Twilio console:</p>

			<div class="space-y-4">
				<div>
					<h3 class="text-sm font-medium text-gray-800 mb-1">1. Set APP_URL environment variable</h3>
					<p class="text-sm text-gray-600">Add to your .env file:</p>
					<code class="block mt-1 p-2 bg-white rounded border text-xs font-mono">APP_URL=https://your-domain.com</code>
				</div>

				<div>
					<h3 class="text-sm font-medium text-gray-800 mb-1">2. Configure Inbound SMS Webhook (for replies)</h3>
					<ol class="text-sm text-gray-600 list-decimal list-inside space-y-1">
						<li>Go to <strong>Twilio Console</strong> &gt; Phone Numbers &gt; Manage &gt; Active Numbers</li>
						<li>Click your TeamTime phone number</li>
						<li>Under <strong>"Messaging Configuration"</strong>, find <strong>"A message comes in"</strong></li>
						<li>Set to <strong>Webhook</strong>, URL: <code class="px-1 py-0.5 bg-white rounded border text-xs">https://your-domain.com/api/sms/webhook/inbound</code></li>
						<li>Method: <strong>HTTP POST</strong></li>
						<li>Click <strong>Save configuration</strong></li>
					</ol>
				</div>

				<div>
					<h3 class="text-sm font-medium text-gray-800 mb-1">3. Delivery status callbacks (automatic)</h3>
					<p class="text-sm text-gray-600">
						Once APP_URL is set, delivery status callbacks are automatically included with each outbound SMS.
						No additional Twilio configuration needed.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
