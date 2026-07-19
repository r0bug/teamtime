<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/notify';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	export let data: PageData;

	type Block = Record<string, any> & { type: string };

	$: newsletter = data.newsletter;
	$: readOnly = newsletter.status !== 'draft';

	// Local editable copy of the blocks; serialized to JSON on save.
	let blocks: Block[] = structuredClone(data.newsletter.blocks as Block[]) ?? [];
	let previewNonce = 0;
	let confirmSend = false;
	let sending = false;
	let testTo = data.myEmail;
	let sendForm: HTMLFormElement;

	const BLOCK_LABELS: Record<string, string> = {
		text: '📝 Text',
		tips: '💡 Tips',
		salesChart: '📊 Sales chart',
		personalStats: '👤 Your numbers (per-vendor)',
		leaderboard: '🏆 Leaderboard',
		shoutouts: '⭐ Shoutouts',
		events: '📅 Events'
	};
	let addType = 'text';

	function newBlock(type: string): Block {
		switch (type) {
			case 'tips': return { type, heading: 'Vendor tool tips', items: [] };
			case 'salesChart': return { type, heading: 'Store sales this period' };
			case 'personalStats': return { type, heading: 'Your numbers' };
			case 'leaderboard': return { type, heading: 'Top vendors', metric: 'gross', limit: 10, showAmounts: true };
			case 'shoutouts': return { type, heading: 'Shoutouts', items: [] };
			case 'events': return { type, heading: 'Upcoming events', items: [] };
			default: return { type: 'text', heading: '', markdown: '' };
		}
	}
	function addBlock() {
		blocks = [...blocks, newBlock(addType)];
	}
	function removeBlock(i: number) {
		blocks = blocks.filter((_, idx) => idx !== i);
	}
	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= blocks.length) return;
		const next = [...blocks];
		[next[i], next[j]] = [next[j], next[i]];
		blocks = next;
	}
	function addItem(i: number, item: unknown) {
		blocks[i].items = [...(blocks[i].items ?? []), item];
		blocks = blocks;
	}
	function removeItem(i: number, j: number) {
		blocks[i].items = blocks[i].items.filter((_: unknown, idx: number) => idx !== j);
		blocks = blocks;
	}

	const fmtDate = (d: string | Date | null) =>
		d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

	function dtLocalValue(d: string | Date | null): string {
		if (!d) return '';
		const dt = new Date(d);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
	}

	function sendResultMessage(data: unknown): string {
		const r = (data as { sendResult?: { sent: number; failed: number; skipped: number } })?.sendResult;
		if (!r) return 'Newsletter sent';
		let msg = `Newsletter sent to ${r.sent} vendors`;
		if (r.failed) msg += ` (${r.failed} failed)`;
		if (r.skipped) msg += `, ${r.skipped} had no email`;
		return msg;
	}
</script>

<svelte:head><title>{newsletter.title} — Newsletter</title></svelte:head>

<div class="p-4 lg:p-8 max-w-7xl mx-auto">
	<div class="flex items-center justify-between flex-wrap gap-2">
		<div>
			<a href="/admin/vendors/newsletters" class="text-sm text-primary-600 hover:underline">← Newsletters</a>
			<h1 class="text-2xl font-bold text-gray-900 mt-1">{newsletter.title}</h1>
			{#if readOnly}
				<p class="text-sm text-gray-600 mt-1">
					<span class="badge-success">Sent {fmtDate(newsletter.sentAt)}</span>
					— sent newsletters are read-only.
				</p>
			{/if}
		</div>
	</div>

	<div class="mt-4 grid lg:grid-cols-2 gap-6">
		<!-- ============ Editor column ============ -->
		<div>
			<form
				method="POST"
				action="?/save"
				use:enhance={() =>
					async ({ result }) => {
						if (result.type === 'success') {
							notify.success('Saved');
							previewNonce++;
							await invalidateAll();
						} else {
							const msg = result.type === 'failure' ? String(result.data?.error ?? '') : '';
							notify.error(msg || 'Could not save');
						}
					}}
			>
				<input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

				<div class="card">
					<div class="card-body flex flex-col gap-3">
						<div class="grid sm:grid-cols-2 gap-3">
							<div>
								<label class="label" for="nlTitle">Title</label>
								<input id="nlTitle" name="title" class="input" required maxlength="150" value={newsletter.title} disabled={readOnly} />
							</div>
							<div>
								<label class="label" for="nlSubject">Email subject (optional, defaults to title)</label>
								<input id="nlSubject" name="subject" class="input" maxlength="150" value={newsletter.subject ?? ''} disabled={readOnly} />
							</div>
							<div>
								<label class="label" for="nlStart">Report period start</label>
								<input id="nlStart" name="periodStart" type="date" class="input" required value={newsletter.periodStart} disabled={readOnly} />
							</div>
							<div>
								<label class="label" for="nlEnd">Report period end</label>
								<input id="nlEnd" name="periodEnd" type="date" class="input" required value={newsletter.periodEnd} disabled={readOnly} />
							</div>
						</div>
						<label class="flex items-center gap-2 text-sm text-gray-700">
							<input type="checkbox" name="publishToPortal" checked={newsletter.publishToPortal} disabled={readOnly} />
							Also publish in the vendor portal after sending
						</label>
						<div class="flex flex-wrap items-end gap-3">
							<div>
								<label class="label" for="nlSchedule">Scheduled send (optional)</label>
								<input id="nlSchedule" name="scheduledSendAt" type="datetime-local" class="input" value={dtLocalValue(newsletter.scheduledSendAt)} disabled={readOnly} />
							</div>
							<div>
								<label class="label" for="nlRecurrence">Repeat</label>
								<select id="nlRecurrence" name="recurrence" class="input" value={newsletter.recurrence ?? ''} disabled={readOnly}>
									<option value="">One-off</option>
									<option value="monthly">Monthly (auto-stages next issue)</option>
								</select>
							</div>
						</div>
						<p class="text-xs text-gray-500">
							The sales chart, leaderboard, and per-vendor stats aggregate over the report period above.
							A scheduled draft is sent automatically (hourly check); monthly recurrence creates next
							month's draft — with the period and schedule shifted — each time an issue goes out.
						</p>
					</div>
				</div>

				<!-- Blocks -->
				<div class="mt-4 flex flex-col gap-3">
					{#each blocks as block, i (i)}
						<div class="card">
							<div class="card-body">
								<div class="flex items-center justify-between gap-2">
									<span class="font-semibold text-sm text-gray-700">{BLOCK_LABELS[block.type] ?? block.type}</span>
									{#if !readOnly}
										<div class="flex gap-1">
											<button type="button" class="btn-ghost btn-sm" title="Move up" disabled={i === 0} on:click={() => move(i, -1)}>↑</button>
											<button type="button" class="btn-ghost btn-sm" title="Move down" disabled={i === blocks.length - 1} on:click={() => move(i, 1)}>↓</button>
											<button type="button" class="btn-ghost btn-sm text-red-600" title="Remove block" on:click={() => removeBlock(i)}>✕</button>
										</div>
									{/if}
								</div>

								<div class="mt-2 flex flex-col gap-2">
									<input class="input" placeholder="Section heading (optional)" bind:value={block.heading} disabled={readOnly} />

									{#if block.type === 'text'}
										<textarea class="input font-mono text-sm" rows="6" placeholder="Markdown supported: **bold**, lists, [links](https://…)" bind:value={block.markdown} disabled={readOnly}></textarea>

									{:else if block.type === 'tips'}
										{#each block.items ?? [] as _, j (j)}
											<div class="flex gap-2">
												<input class="input flex-1" placeholder="A tip about using vendor tools…" bind:value={block.items[j]} disabled={readOnly} />
												{#if !readOnly}<button type="button" class="btn-ghost btn-sm" on:click={() => removeItem(i, j)}>✕</button>{/if}
											</div>
										{/each}
										{#if !readOnly}
											<button type="button" class="btn-secondary btn-sm self-start" on:click={() => addItem(i, '')}>+ Add tip</button>
										{/if}

									{:else if block.type === 'salesChart'}
										<p class="text-xs text-gray-500">Daily store-wide sales bar chart for the report period. Rendered as an image in the email.</p>

									{:else if block.type === 'personalStats'}
										<p class="text-xs text-gray-500">Each vendor sees their own sales, share, rank, and active days for the period. The preview shows example numbers; the portal shows the signed-in vendor's real ones.</p>

									{:else if block.type === 'leaderboard'}
										<div class="flex flex-wrap items-end gap-3">
											<div>
												<span class="label">Metric</span>
												<select class="input" bind:value={block.metric} disabled={readOnly}>
													<option value="gross">Gross sales</option>
													<option value="vendorPortion">Vendor earnings</option>
													<option value="retained">Shop share</option>
												</select>
											</div>
											<div>
												<span class="label">Top N</span>
												<input class="input w-24" type="number" min="3" max="50" bind:value={block.limit} disabled={readOnly} />
											</div>
											<label class="flex items-center gap-2 text-sm text-gray-700 pb-2">
												<input type="checkbox" bind:checked={block.showAmounts} disabled={readOnly} />
												Show dollar amounts
											</label>
										</div>

									{:else if block.type === 'shoutouts'}
										{#each block.items ?? [] as _, j (j)}
											<div class="flex gap-2 items-start">
												<input class="input w-48" placeholder="Vendor / booth" bind:value={block.items[j].name} disabled={readOnly} />
												<input class="input flex-1" placeholder="What they did" bind:value={block.items[j].message} disabled={readOnly} />
												{#if !readOnly}<button type="button" class="btn-ghost btn-sm" on:click={() => removeItem(i, j)}>✕</button>{/if}
											</div>
										{/each}
										{#if !readOnly}
											<button type="button" class="btn-secondary btn-sm self-start" on:click={() => addItem(i, { name: '', message: '' })}>+ Add shoutout</button>
										{/if}

									{:else if block.type === 'events'}
										{#each block.items ?? [] as _, j (j)}
											<div class="flex gap-2 items-start flex-wrap">
												<input class="input w-40" type="date" bind:value={block.items[j].date} disabled={readOnly} />
												<input class="input w-52" placeholder="Event title" bind:value={block.items[j].title} disabled={readOnly} />
												<input class="input flex-1 min-w-40" placeholder="Details (optional)" bind:value={block.items[j].description} disabled={readOnly} />
												{#if !readOnly}<button type="button" class="btn-ghost btn-sm" on:click={() => removeItem(i, j)}>✕</button>{/if}
											</div>
										{/each}
										{#if !readOnly}
											<button type="button" class="btn-secondary btn-sm self-start" on:click={() => addItem(i, { date: '', title: '', description: '' })}>+ Add event</button>
										{/if}
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				{#if !readOnly}
					<div class="mt-4 flex items-center gap-2 flex-wrap">
						<select class="input w-44" bind:value={addType}>
							{#each Object.entries(BLOCK_LABELS) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
						<button type="button" class="btn-secondary" on:click={addBlock}>+ Add block</button>
						<span class="flex-1"></span>
						<button type="submit" class="btn-primary">Save draft</button>
					</div>
				{/if}
			</form>

			{#if !readOnly}
				<!-- Test send + real send -->
				<div class="card mt-4">
					<div class="card-body flex flex-col gap-3">
						<h2 class="font-semibold text-gray-900">Send</h2>
						<form
							method="POST"
							action="?/testSend"
							class="flex gap-2 items-end flex-wrap"
							use:enhance={() =>
								async ({ result }) => {
									if (result.type === 'success') {
										notify.success('Test email sent — save first if you made edits');
									} else {
										const msg = result.type === 'failure' ? String(result.data?.error ?? '') : '';
										notify.error(msg || 'Test send failed');
									}
								}}
						>
							<div class="flex-1 min-w-52">
								<label class="label" for="testTo">Send a test to</label>
								<input id="testTo" name="to" type="email" class="input" bind:value={testTo} />
							</div>
							<button type="submit" class="btn-secondary">Send test</button>
						</form>
						<hr class="border-gray-200" />
						<form
							method="POST"
							action="?/send"
							bind:this={sendForm}
							use:enhance={() => {
								sending = true;
								return async ({ result }) => {
									sending = false;
									confirmSend = false;
									if (result.type === 'success') {
										notify.success(sendResultMessage(result.data));
										await invalidateAll();
									} else {
										const msg = result.type === 'failure' ? String(result.data?.error ?? '') : '';
										notify.error(msg || 'Send failed');
									}
								};
							}}
						>
							<button type="button" class="btn-primary" on:click={() => (confirmSend = true)}>
								📤 Send to all active vendors ({data.recipientCount} email{data.recipientCount === 1 ? '' : 's'})
							</button>
							<p class="text-xs text-gray-500 mt-1">
								Sends the last <strong>saved</strong> version. Save your draft (and ideally send yourself a test) first.
							</p>
						</form>
					</div>
				</div>
			{/if}

			{#if data.sends.length}
				<div class="card mt-4">
					<div class="card-body">
						<h2 class="font-semibold text-gray-900 mb-2">Delivery log</h2>
						<div class="flex flex-col gap-1 max-h-64 overflow-y-auto">
							{#each data.sends as s (s.id)}
								<div class="flex items-center gap-2 text-sm">
									{#if s.status === 'sent'}<span class="badge-success">sent</span>
									{:else if s.status === 'test'}<span class="badge-primary">test</span>
									{:else}<span class="badge-danger">failed</span>{/if}
									<span class="text-gray-700 truncate">{s.email}</span>
									<span class="text-gray-400 text-xs ml-auto whitespace-nowrap">{new Date(s.sentAt).toLocaleString()}</span>
								</div>
								{#if s.error}<p class="text-xs text-red-600 pl-1">{s.error}</p>{/if}
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- ============ Preview column ============ -->
		<div>
			<div class="flex items-center justify-between">
				<h2 class="font-semibold text-gray-900">Email preview <span class="text-xs text-gray-500 font-normal">(last saved version)</span></h2>
				<button type="button" class="btn-ghost btn-sm" on:click={() => previewNonce++}>↻ Refresh</button>
			</div>
			<iframe
				src="/admin/vendors/newsletters/{newsletter.id}/preview?v={previewNonce}"
				title="Newsletter preview"
				class="mt-2 w-full bg-white border border-gray-200 rounded-lg"
				style="height: 80vh;"
			></iframe>
		</div>
	</div>

	<ConfirmDialog
		open={confirmSend}
		title="Email all active vendors?"
		message={`This sends "${newsletter.title}" to ${data.recipientCount} vendor email address${data.recipientCount === 1 ? '' : 'es'} and cannot be undone. The last saved version is what goes out.`}
		confirmLabel="Send newsletter"
		variant="primary"
		loading={sending}
		on:confirm={() => sendForm.requestSubmit()}
		on:cancel={() => (confirmSend = false)}
	/>
</div>
