/**
 * Vendor newsletters — block-composed staff→vendor mailings.
 *
 * A newsletter is an ordered list of typed blocks (markdown text, tips,
 * store sales chart, leaderboard, shoutouts, events) plus a reporting window
 * that the data-driven blocks aggregate over. Rendering happens here, server
 * side, for two targets:
 *
 *   - 'portal': shown at /vendor/newsletters/[id] (inline SVG chart is fine)
 *   - 'email':  sent to every active vendor with a contact email. Email
 *     clients strip SVG, so the chart is rasterized to PNG with sharp and
 *     embedded as a cid: attachment (data: URI for browser previews).
 *
 * Sales figures come from `salesSnapshots.vendors[]` (the hourly NRS import),
 * same as the vendor leaderboard — never from live NRS calls, so rendering a
 * preview can't hammer the POS API.
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { Marked } from 'marked';
import sharp from 'sharp';
import { db } from '$lib/server/db';
import {
	salesSnapshots,
	vendorNewsletters,
	vendorNewsletterSends,
	vendors,
	type VendorNewsletter
} from '$lib/server/db/schema';
import {
	computeLeaderboard,
	type LeaderboardMetric
} from '$lib/server/services/vendor-leaderboard-service';
import { sendEmail } from '$lib/server/email';
import { createLogger } from '$lib/server/logger';

const log = createLogger('service:vendor-newsletter');

// ---------------------------------------------------------------------------
// Block model

export interface TextBlock {
	type: 'text';
	heading?: string;
	markdown: string;
}
/** Callout list — "how to use your vendor tools" tips. */
export interface TipsBlock {
	type: 'tips';
	heading?: string;
	items: string[];
}
/** Store-wide daily sales bar chart over the newsletter's period. */
export interface SalesChartBlock {
	type: 'salesChart';
	heading?: string;
}
export interface LeaderboardBlock {
	type: 'leaderboard';
	heading?: string;
	metric: LeaderboardMetric;
	limit: number;
	/** Show dollar amounts (portal already exposes them) or ranks only. */
	showAmounts: boolean;
}
export interface ShoutoutsBlock {
	type: 'shoutouts';
	heading?: string;
	items: { name: string; message: string }[];
}
export interface EventsBlock {
	type: 'events';
	heading?: string;
	items: { date: string; title: string; description?: string }[];
}

export type NewsletterBlock =
	| TextBlock
	| TipsBlock
	| SalesChartBlock
	| LeaderboardBlock
	| ShoutoutsBlock
	| EventsBlock;

export const BLOCK_TYPES = ['text', 'tips', 'salesChart', 'leaderboard', 'shoutouts', 'events'] as const;

/** Starter layout for a fresh draft — one of everything, in a sensible order. */
export function starterBlocks(): NewsletterBlock[] {
	return [
		{ type: 'text', heading: 'From the shop', markdown: '' },
		{ type: 'salesChart', heading: 'Store sales this period' },
		{ type: 'leaderboard', heading: 'Top vendors', metric: 'gross', limit: 10, showAmounts: true },
		{ type: 'shoutouts', heading: 'Shoutouts', items: [] },
		{ type: 'tips', heading: 'Vendor tool tips', items: [] },
		{ type: 'events', heading: 'Upcoming events', items: [] }
	];
}

/**
 * Coerce untrusted JSON (editor form post, old DB rows) into well-formed
 * blocks. Unknown types and malformed entries are dropped rather than
 * throwing — a half-broken saved draft should still open in the editor.
 */
export function normalizeBlocks(raw: unknown): NewsletterBlock[] {
	if (!Array.isArray(raw)) return [];
	const out: NewsletterBlock[] = [];
	for (const b of raw) {
		if (!b || typeof b !== 'object') continue;
		const heading = typeof b.heading === 'string' && b.heading.trim() ? b.heading.trim() : undefined;
		switch (b.type) {
			case 'text':
				out.push({ type: 'text', heading, markdown: typeof b.markdown === 'string' ? b.markdown : '' });
				break;
			case 'tips':
				out.push({ type: 'tips', heading, items: strList(b.items) });
				break;
			case 'salesChart':
				out.push({ type: 'salesChart', heading });
				break;
			case 'leaderboard': {
				const metric: LeaderboardMetric = ['gross', 'vendorPortion', 'retained'].includes(b.metric)
					? b.metric
					: 'gross';
				const limit = Math.min(50, Math.max(3, parseInt(b.limit, 10) || 10));
				out.push({ type: 'leaderboard', heading, metric, limit, showAmounts: b.showAmounts !== false });
				break;
			}
			case 'shoutouts':
				out.push({
					type: 'shoutouts',
					heading,
					items: objList(b.items)
						.map((i) => ({ name: str(i.name), message: str(i.message) }))
						.filter((i) => i.name || i.message)
				});
				break;
			case 'events':
				out.push({
					type: 'events',
					heading,
					items: objList(b.items)
						.map((i) => ({ date: str(i.date), title: str(i.title), description: str(i.description) || undefined }))
						.filter((i) => i.title)
				});
				break;
		}
	}
	return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] =>
	Array.isArray(v) ? v.map(str).filter(Boolean) : [];
const objList = (v: unknown): Record<string, unknown>[] =>
	Array.isArray(v) ? v.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object') : [];

// ---------------------------------------------------------------------------
// CRUD

export function listNewsletters(): Promise<VendorNewsletter[]> {
	return db.select().from(vendorNewsletters).orderBy(desc(vendorNewsletters.createdAt));
}

export async function getNewsletter(id: string): Promise<VendorNewsletter | null> {
	const [row] = await db.select().from(vendorNewsletters).where(eq(vendorNewsletters.id, id));
	return row ?? null;
}

/** Sent + portal-published newsletters, for the vendor-facing list. */
export function listPortalNewsletters(): Promise<VendorNewsletter[]> {
	return db
		.select()
		.from(vendorNewsletters)
		.where(and(eq(vendorNewsletters.status, 'sent'), eq(vendorNewsletters.publishToPortal, true)))
		.orderBy(desc(vendorNewsletters.sentAt));
}

export interface SaveNewsletterInput {
	id?: string | null;
	title: string;
	subject: string | null;
	periodStart: string; // YYYY-MM-DD
	periodEnd: string;
	publishToPortal: boolean;
	blocks: NewsletterBlock[];
}

export async function saveNewsletter(input: SaveNewsletterInput, actorId: string): Promise<VendorNewsletter> {
	if (input.id) {
		const [row] = await db
			.update(vendorNewsletters)
			.set({
				title: input.title,
				subject: input.subject,
				periodStart: input.periodStart,
				periodEnd: input.periodEnd,
				publishToPortal: input.publishToPortal,
				blocks: input.blocks,
				updatedAt: new Date()
			})
			.where(and(eq(vendorNewsletters.id, input.id), eq(vendorNewsletters.status, 'draft')))
			.returning();
		if (!row) throw new Error('Newsletter not found or already sent');
		return row;
	}
	const [row] = await db
		.insert(vendorNewsletters)
		.values({
			title: input.title,
			subject: input.subject,
			periodStart: input.periodStart,
			periodEnd: input.periodEnd,
			publishToPortal: input.publishToPortal,
			blocks: input.blocks,
			createdBy: actorId
		})
		.returning();
	return row;
}

export async function deleteDraft(id: string): Promise<boolean> {
	const rows = await db
		.delete(vendorNewsletters)
		.where(and(eq(vendorNewsletters.id, id), eq(vendorNewsletters.status, 'draft')))
		.returning({ id: vendorNewsletters.id });
	return rows.length > 0;
}

export function listSends(newsletterId: string) {
	return db
		.select()
		.from(vendorNewsletterSends)
		.where(eq(vendorNewsletterSends.newsletterId, newsletterId))
		.orderBy(desc(vendorNewsletterSends.sentAt));
}

// ---------------------------------------------------------------------------
// Sales data for chart blocks

interface SnapshotVendor {
	total_sales: number;
	vendor_amount: number;
	retained_amount: number;
}

/**
 * Store-wide daily gross totals from salesSnapshots. Mirrors the leaderboard
 * service's dedup rule: multiple snapshots for one date → latest wins.
 */
export async function getDailyStoreTotals(
	startDate: string,
	endDate: string
): Promise<{ date: string; total: number }[]> {
	const snapshots = await db
		.select({
			vendors: salesSnapshots.vendors,
			saleDate: sql<string>`TO_CHAR(${salesSnapshots.saleDate}, 'YYYY-MM-DD')`
		})
		.from(salesSnapshots)
		.where(and(gte(salesSnapshots.saleDate, startDate), lte(salesSnapshots.saleDate, endDate)))
		.orderBy(salesSnapshots.saleDate);

	const latestByDate = new Map<string, SnapshotVendor[]>();
	for (const s of snapshots) latestByDate.set(s.saleDate, s.vendors as SnapshotVendor[]);

	return Array.from(latestByDate.entries())
		.map(([date, dayVendors]) => ({
			date,
			total: Math.round(dayVendors.reduce((sum, v) => sum + (v.total_sales ?? 0), 0) * 100) / 100
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Rendering

export type RenderTarget = 'portal' | 'email';

export interface RenderedNewsletter {
	/** Blocks-only body HTML. Email senders wrap it with {@link wrapEmail}. */
	html: string;
	/** PNG chart to attach as cid:sales-chart when target='email'. */
	chartPng: Buffer | null;
}

const marked = new Marked();
marked.setOptions({ breaks: true, gfm: true });

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function fmtMoney(n: number): string {
	return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
	const d = new Date(iso + 'T00:00:00');
	return isNaN(d.getTime())
		? escapeHtml(iso)
		: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const METRIC_LABEL: Record<LeaderboardMetric, string> = {
	gross: 'Gross sales',
	vendorPortion: 'Vendor earnings',
	retained: 'Shop share'
};

/**
 * Render a newsletter's blocks to HTML.
 *
 * `chartMode` decides how a salesChart block is emitted:
 *   - 'svg'  → inline SVG (portal pages)
 *   - 'cid'  → <img src="cid:sales-chart"> (real email; caller attaches chartPng)
 *   - 'data' → <img src="data:..."> (browser preview of the email)
 */
export async function renderNewsletter(
	newsletter: VendorNewsletter,
	target: RenderTarget,
	opts: { chartMode?: 'svg' | 'cid' | 'data' } = {}
): Promise<RenderedNewsletter> {
	const blocks = normalizeBlocks(newsletter.blocks);
	const chartMode = opts.chartMode ?? (target === 'portal' ? 'svg' : 'cid');
	const period = { start: newsletter.periodStart, end: newsletter.periodEnd };

	// Fetch data once even if a block type appears twice.
	const needsChart = blocks.some((b) => b.type === 'salesChart');
	const lbBlock = blocks.find((b): b is LeaderboardBlock => b.type === 'leaderboard');

	const [daily, leaderboard] = await Promise.all([
		needsChart ? getDailyStoreTotals(period.start, period.end) : Promise.resolve([]),
		lbBlock
			? computeLeaderboard({
					startDate: period.start,
					endDate: period.end,
					metric: lbBlock.metric,
					includePriorPeriod: true,
					limit: lbBlock.limit
				})
			: Promise.resolve(null)
	]);

	let chartPng: Buffer | null = null;
	let chartSrcHtml = '';
	if (needsChart && daily.length) {
		const svg = buildSalesChartSvg(daily);
		if (chartMode === 'svg') {
			chartSrcHtml = svg;
		} else {
			chartPng = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
			const src =
				chartMode === 'data' ? `data:image/png;base64,${chartPng.toString('base64')}` : 'cid:sales-chart';
			chartSrcHtml = `<img src="${src}" alt="Daily store sales" style="width:100%;max-width:600px;height:auto;border:0;" />`;
		}
	}

	const parts: string[] = [];
	for (const block of blocks) {
		const heading = block.heading
			? `<h2 style="font-size:18px;color:#1f2937;margin:28px 0 10px;border-bottom:2px solid #2563eb;padding-bottom:4px;">${escapeHtml(block.heading)}</h2>`
			: '';
		switch (block.type) {
			case 'text': {
				if (!block.markdown.trim()) break;
				const html = await marked.parse(block.markdown);
				parts.push(`${heading}<div style="font-size:14px;color:#374151;line-height:1.6;">${html}</div>`);
				break;
			}
			case 'tips': {
				if (!block.items.length) break;
				const lis = block.items
					.map(
						(t) =>
							`<li style="margin:6px 0;font-size:14px;color:#374151;line-height:1.5;">💡 ${escapeHtml(t)}</li>`
					)
					.join('');
				parts.push(
					`${heading}<div style="background:#eff6ff;border-radius:8px;padding:12px 16px;"><ul style="margin:0;padding-left:4px;list-style:none;">${lis}</ul></div>`
				);
				break;
			}
			case 'salesChart': {
				if (!chartSrcHtml) break;
				parts.push(`${heading}${chartSrcHtml}
					<p style="font-size:12px;color:#6b7280;margin:4px 0 0;">Daily store-wide sales, ${fmtDate(period.start)} – ${fmtDate(period.end)}</p>`);
				break;
			}
			case 'leaderboard': {
				if (!leaderboard || !leaderboard.rows.length) break;
				const rowsHtml = leaderboard.rows
					.map((r) => {
						const name = escapeHtml(r.displayName || r.nrsVendorName);
						const booth = r.boothNumber ? ` <span style="color:#9ca3af;">· booth ${escapeHtml(r.boothNumber)}</span>` : '';
						const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}.`;
						const value = block.showAmounts
							? metricAmount(r, block.metric)
							: r.deltaPercent !== null
								? `${r.deltaPercent >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(r.deltaPercent))}%`
								: '';
						const delta =
							block.showAmounts && r.deltaPercent !== null
								? ` <span style="color:${r.deltaPercent >= 0 ? '#059669' : '#dc2626'};font-size:12px;">${r.deltaPercent >= 0 ? '▲' : '▼'}${Math.abs(Math.round(r.deltaPercent))}%</span>`
								: '';
						return `<tr>
							<td style="padding:6px 8px;font-size:14px;color:#374151;white-space:nowrap;">${medal}</td>
							<td style="padding:6px 8px;font-size:14px;color:#1f2937;width:100%;">${name}${booth}</td>
							<td style="padding:6px 8px;font-size:14px;color:#1f2937;text-align:right;white-space:nowrap;">${value}${delta}</td>
						</tr>`;
					})
					.join('');
				parts.push(`${heading}
					<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;">
						<tr><td colspan="3" style="padding:8px;font-size:12px;color:#6b7280;">${METRIC_LABEL[block.metric]}, ${fmtDate(period.start)} – ${fmtDate(period.end)}</td></tr>
						${rowsHtml}
					</table>`);
				break;
			}
			case 'shoutouts': {
				if (!block.items.length) break;
				const items = block.items
					.map(
						(s) => `<div style="background:#fefce8;border-left:4px solid #eab308;border-radius:4px;padding:10px 14px;margin:8px 0;">
							<div style="font-weight:bold;font-size:14px;color:#1f2937;">⭐ ${escapeHtml(s.name)}</div>
							<div style="font-size:14px;color:#374151;margin-top:2px;">${escapeHtml(s.message)}</div>
						</div>`
					)
					.join('');
				parts.push(`${heading}${items}`);
				break;
			}
			case 'events': {
				if (!block.items.length) break;
				const items = block.items
					.map(
						(e) => `<tr>
							<td style="padding:6px 10px 6px 0;font-size:13px;color:#2563eb;font-weight:bold;white-space:nowrap;vertical-align:top;">${e.date ? fmtDate(e.date) : ''}</td>
							<td style="padding:6px 0;font-size:14px;color:#1f2937;"><strong>${escapeHtml(e.title)}</strong>${e.description ? `<br/><span style="color:#6b7280;font-size:13px;">${escapeHtml(e.description)}</span>` : ''}</td>
						</tr>`
					)
					.join('');
				parts.push(`${heading}<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table>`);
				break;
			}
		}
	}

	return { html: parts.join('\n'), chartPng };
}

function metricAmount(
	r: { totalGross: number; totalVendorPortion: number; totalRetained: number },
	metric: LeaderboardMetric
): string {
	switch (metric) {
		case 'gross': return fmtMoney(r.totalGross);
		case 'vendorPortion': return fmtMoney(r.totalVendorPortion);
		case 'retained': return fmtMoney(r.totalRetained);
	}
}

/** Same visual language as SalesOverTimeChart.svelte, standalone for email. */
function buildSalesChartSvg(data: { date: string; total: number }[]): string {
	const width = 600;
	const height = 220;
	const chartH = height - 40;
	const max = Math.max(...data.map((d) => d.total), 1);
	const barW = Math.max(2, Math.min(40, width / data.length - 2));
	const bars = data
		.map((d, i) => {
			const x = (i + 0.5) * (width / data.length) - barW / 2;
			const h = (d.total / max) * (chartH - 20);
			return `<rect x="${x.toFixed(1)}" y="${(chartH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="#2563eb" rx="1"/>`;
		})
		.join('');
	const grid = [0.25, 0.5, 0.75, 1]
		.map((f) => `<line x1="0" x2="${width}" y1="${chartH - chartH * f}" y2="${chartH - chartH * f}" stroke="#e5e7eb" stroke-width="1"/>`)
		.join('');
	const maxLabel = max >= 1000 ? `$${(max / 1000).toFixed(1)}k` : `$${max.toFixed(0)}`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
		<rect width="${width}" height="${height}" fill="#ffffff"/>
		${grid}${bars}
		<text x="4" y="14" font-family="sans-serif" font-size="12" fill="#9ca3af">${maxLabel}</text>
		<text x="4" y="${height - 8}" font-family="sans-serif" font-size="12" fill="#6b7280">${data[0]?.date ?? ''}</text>
		<text x="${width - 4}" y="${height - 8}" font-family="sans-serif" font-size="12" fill="#6b7280" text-anchor="end">${data[data.length - 1]?.date ?? ''}</text>
	</svg>`;
}

/** Wrap rendered blocks in the branded email shell. Also used by the admin preview. */
export function wrapEmail(title: string, bodyHtml: string, greeting?: string): string {
	return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; background:#ffffff; padding: 8px 16px 24px;">
		<h1 style="color: #2563eb; font-size: 22px; margin: 16px 0 4px;">${escapeHtml(title)}</h1>
		<p style="color:#6b7280;font-size:13px;margin:0 0 8px;">Yakima Finds — Vendor Newsletter</p>
		${greeting ? `<p style="font-size:14px;color:#374151;">${escapeHtml(greeting)}</p>` : ''}
		${bodyHtml}
		<p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px;">
			You're receiving this because you're a Yakima Finds vendor. Questions? Just reply, or stop by the counter.<br/>— The Yakima Finds team
		</p>
	</div>`;
}

// ---------------------------------------------------------------------------
// Sending

export interface SendResult {
	sent: number;
	failed: number;
	skipped: number; // active vendors without a contact email
}

/**
 * Email the newsletter to every active vendor with a contact email, record a
 * send row per recipient, then mark the newsletter sent. Rendering (and the
 * chart PNG) is done once; only the greeting varies per vendor.
 */
export async function sendNewsletterToVendors(
	newsletter: VendorNewsletter,
	actorId: string
): Promise<SendResult> {
	const rendered = await renderNewsletter(newsletter, 'email', { chartMode: 'cid' });
	const subject = newsletter.subject?.trim() || newsletter.title;

	const recipients = await db
		.select({
			id: vendors.id,
			displayName: vendors.displayName,
			contactName: vendors.contactName,
			contactEmail: vendors.contactEmail
		})
		.from(vendors)
		.where(eq(vendors.status, 'active'));

	const result: SendResult = { sent: 0, failed: 0, skipped: 0 };
	const seenEmails = new Set<string>();

	for (const v of recipients) {
		const email = v.contactEmail?.trim().toLowerCase();
		if (!email) {
			result.skipped++;
			continue;
		}
		if (seenEmails.has(email)) continue; // shared inbox across booths — send once
		seenEmails.add(email);

		const greeting = `Hi ${v.contactName || v.displayName},`;
		const ok = await sendEmail({
			to: email,
			subject,
			html: wrapEmail(newsletter.title, rendered.html, greeting),
			attachments: rendered.chartPng
				? [{ filename: 'sales-chart.png', content: rendered.chartPng, cid: 'sales-chart' }]
				: undefined
		});
		await db.insert(vendorNewsletterSends).values({
			newsletterId: newsletter.id,
			vendorId: v.id,
			email,
			status: ok ? 'sent' : 'failed',
			error: ok ? null : 'sendEmail returned false (see server log)'
		});
		if (ok) result.sent++;
		else result.failed++;
	}

	await db
		.update(vendorNewsletters)
		.set({ status: 'sent', sentAt: new Date(), sentByUserId: actorId, updatedAt: new Date() })
		.where(eq(vendorNewsletters.id, newsletter.id));

	log.info({ newsletterId: newsletter.id, ...result }, 'Vendor newsletter sent');
	return result;
}

/** One-off test delivery to an arbitrary address. Doesn't change status. */
export async function sendNewsletterTest(newsletter: VendorNewsletter, to: string): Promise<boolean> {
	const rendered = await renderNewsletter(newsletter, 'email', { chartMode: 'cid' });
	const subject = `[TEST] ${newsletter.subject?.trim() || newsletter.title}`;
	const ok = await sendEmail({
		to,
		subject,
		html: wrapEmail(newsletter.title, rendered.html),
		attachments: rendered.chartPng
			? [{ filename: 'sales-chart.png', content: rendered.chartPng, cid: 'sales-chart' }]
			: undefined
	});
	await db.insert(vendorNewsletterSends).values({
		newsletterId: newsletter.id,
		vendorId: null,
		email: to,
		status: ok ? 'test' : 'failed',
		error: ok ? null : 'sendEmail returned false (see server log)'
	});
	return ok;
}
