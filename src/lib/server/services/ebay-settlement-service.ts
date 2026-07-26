/**
 * eBay sale settlements — the money logic (fleet Standards §3).
 *
 * Pulls ListFlow's sales feed and computes, per sale line:
 *   basis            = itemPrice * quantity   (pre-tax; shipping + eBay-remitted tax excluded)
 *   consignorAmount  = basis * group.consignorPercent / 100
 *   yfGross          = basis - consignorAmount
 *   lister comp      = commission $ (carved from yfGross, capped at it)
 *                      OR points (via the existing gamification ledger)
 *                      OR none (no ebayListerSettings row — left for review)
 *   yfAmount         = yfGross - commission
 *
 * Settlements snapshot every input; rows recompute only while status is
 * 'pending' — 'approved'/'exported' rows are frozen history. Points are
 * granted exactly once per settlement (pointTransactionId guard) and are
 * never clawed back automatically.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
	db,
	consignors,
	consignmentGroups,
	ebayListerSettings,
	ebaySaleSettlements,
	users
} from '$lib/server/db';
import { getEbaySalesFeed, type EbaySaleRow } from './listflow-client';
import { awardPoints } from './points-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('ebay-settlement');

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SettlementSyncResult {
	pulled: number;
	created: number;
	recomputed: number;
	frozen: number; // approved/exported rows we left alone
	pointsGranted: number;
	unattributed: number;
}

export async function syncEbaySettlements(days = 45): Promise<SettlementSyncResult> {
	const result: SettlementSyncResult = {
		pulled: 0,
		created: 0,
		recomputed: 0,
		frozen: 0,
		pointsGranted: 0,
		unattributed: 0
	};

	const feed = await getEbaySalesFeed(days);
	if (!feed) {
		log.warn('settlement sync skipped: ListFlow unavailable');
		return result;
	}
	result.pulled = feed.sales.length;

	for (const sale of feed.sales) {
		try {
			await settleOne(sale, result);
		} catch (err) {
			log.error(`settlement failed for sale ${sale.id}: ${(err as Error).message}`);
		}
	}

	log.info(
		`settlement sync: ${result.pulled} pulled, ${result.created} created, ${result.recomputed} recomputed, ${result.pointsGranted} points grants`
	);
	return result;
}

async function settleOne(sale: EbaySaleRow, result: SettlementSyncResult): Promise<void> {
	const [existing] = await db
		.select()
		.from(ebaySaleSettlements)
		.where(eq(ebaySaleSettlements.listflowSaleId, sale.id))
		.limit(1);

	if (existing && existing.status !== 'pending') {
		result.frozen++;
		return; // approved/exported = frozen history
	}

	const basis = round2(sale.itemPrice * sale.quantity);

	// ── consignor split ──
	let group: typeof consignmentGroups.$inferSelect | undefined;
	if (sale.consignmentGroupId) {
		[group] = await db
			.select()
			.from(consignmentGroups)
			.where(eq(consignmentGroups.id, sale.consignmentGroupId))
			.limit(1);
		if (!group) {
			log.warn(`sale ${sale.id}: unknown consignmentGroupId ${sale.consignmentGroupId}`);
		}
	}
	const consignorPercent = group ? Number(group.consignorPercent) : 0;
	const consignorAmount = round2((basis * consignorPercent) / 100);
	const yfGross = round2(basis - consignorAmount);

	// ── lister comp ──
	const listerTeamtimeId = sale.listedBy?.teamtimeUserId ?? null;
	let listerUserId: string | null = null;
	let compType: 'commission' | 'points' | 'none' | null = null;
	let commissionPercent: number | null = null;
	let commissionAmount: number | null = null;
	let pointsPerDollar = 0;

	if (listerTeamtimeId) {
		const [listerUser] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, listerTeamtimeId))
			.limit(1);
		if (listerUser) {
			listerUserId = listerUser.id;
			const [settings] = await db
				.select()
				.from(ebayListerSettings)
				.where(and(eq(ebayListerSettings.userId, listerUser.id), eq(ebayListerSettings.isActive, true)))
				.limit(1);
			compType = settings?.compType ?? 'none';
			if (compType === 'commission' && settings?.commissionPercent != null) {
				commissionPercent = Number(settings.commissionPercent);
				commissionAmount = Math.min(round2((basis * commissionPercent) / 100), yfGross);
			}
			if (compType === 'points') {
				pointsPerDollar = Number(settings?.pointsPerDollar ?? 1);
			}
		}
	} else {
		result.unattributed++;
	}

	const yfAmount = round2(yfGross - (commissionAmount ?? 0));
	const payPeriod = sale.soldAt.slice(0, 7); // YYYY-MM

	const values = {
		listflowSaleId: sale.id,
		ebayOrderId: sale.ebayOrderId,
		lineItemId: sale.lineItemId,
		salesRecordNumber: sale.salesRecordNumber,
		account: sale.account,
		title: sale.title,
		sku: sale.sku,
		quantity: sale.quantity,
		basis: String(basis),
		soldAt: new Date(sale.soldAt),
		consignmentGroupId: group?.id ?? null,
		consignorId: group?.consignorId ?? null,
		consignorPercent: group ? String(consignorPercent) : null,
		consignorAmount: group ? String(consignorAmount) : null,
		yfAmount: String(yfAmount),
		listerUserId,
		listerCompType: compType,
		listerCommissionPercent: commissionPercent != null ? String(commissionPercent) : null,
		listerCommissionAmount: commissionAmount != null ? String(commissionAmount) : null,
		computedAt: new Date(),
		updatedAt: new Date(),
		payPeriod
	};

	let settlementId: string;
	let alreadyGrantedPoints = false;
	if (existing) {
		await db.update(ebaySaleSettlements).set(values).where(eq(ebaySaleSettlements.id, existing.id));
		settlementId = existing.id;
		alreadyGrantedPoints = existing.pointTransactionId != null;
		result.recomputed++;
	} else {
		const [row] = await db
			.insert(ebaySaleSettlements)
			.values(values)
			.returning({ id: ebaySaleSettlements.id });
		settlementId = row.id;
		result.created++;
	}

	// ── points grant (once, ever) ──
	if (compType === 'points' && listerUserId && !alreadyGrantedPoints && pointsPerDollar > 0) {
		const pts = Math.round(basis * pointsPerDollar);
		if (pts > 0) {
			const { transaction } = await awardPoints({
				userId: listerUserId,
				basePoints: pts,
				category: 'sales',
				action: 'ebay_sale_listed',
				description: `eBay sale: ${sale.title.slice(0, 80)} ($${basis.toFixed(2)})`,
				sourceType: 'ebay_settlement',
				sourceId: settlementId,
				metadata: { ebayOrderId: sale.ebayOrderId, account: sale.account, basis }
			});
			await db
				.update(ebaySaleSettlements)
				.set({ pointsAwarded: pts, pointTransactionId: transaction.id })
				.where(eq(ebaySaleSettlements.id, settlementId));
			result.pointsGranted++;
		}
	}
}

// ── clerk-facing report: what gets keyed into NRS per pay period ──────────

export interface SettlementReport {
	period: string;
	totals: { basis: number; consignor: number; yf: number; commissions: number; sales: number };
	listers: Array<{
		userId: string;
		name: string;
		compType: string | null;
		salesCount: number;
		basis: number;
		commission: number;
		points: number;
	}>;
	consignorTotals: Array<{
		consignorId: string;
		name: string;
		type: string;
		salesCount: number;
		basis: number;
		amount: number;
	}>;
	pendingCount: number;
}

export async function settlementReport(period: string): Promise<SettlementReport> {
	const rows = await db
		.select({
			s: ebaySaleSettlements,
			listerName: users.name,
			consignorName: consignors.name,
			consignorType: consignors.type
		})
		.from(ebaySaleSettlements)
		.leftJoin(users, eq(ebaySaleSettlements.listerUserId, users.id))
		.leftJoin(consignors, eq(ebaySaleSettlements.consignorId, consignors.id))
		.where(eq(ebaySaleSettlements.payPeriod, period));

	const totals = { basis: 0, consignor: 0, yf: 0, commissions: 0, sales: rows.length };
	const byLister = new Map<string, SettlementReport['listers'][number]>();
	const byConsignor = new Map<string, SettlementReport['consignorTotals'][number]>();
	let pendingCount = 0;

	for (const { s, listerName, consignorName, consignorType } of rows) {
		const basis = Number(s.basis);
		totals.basis += basis;
		totals.consignor += Number(s.consignorAmount ?? 0);
		totals.yf += Number(s.yfAmount);
		totals.commissions += Number(s.listerCommissionAmount ?? 0);
		if (s.status === 'pending') pendingCount++;

		if (s.listerUserId) {
			const l = byLister.get(s.listerUserId) ?? {
				userId: s.listerUserId,
				name: listerName ?? '(unknown)',
				compType: s.listerCompType,
				salesCount: 0,
				basis: 0,
				commission: 0,
				points: 0
			};
			l.salesCount++;
			l.basis = round2(l.basis + basis);
			l.commission = round2(l.commission + Number(s.listerCommissionAmount ?? 0));
			l.points += s.pointsAwarded ?? 0;
			byLister.set(s.listerUserId, l);
		}
		if (s.consignorId) {
			const c = byConsignor.get(s.consignorId) ?? {
				consignorId: s.consignorId,
				name: consignorName ?? '(unknown)',
				type: consignorType ?? 'walkin',
				salesCount: 0,
				basis: 0,
				amount: 0
			};
			c.salesCount++;
			c.basis = round2(c.basis + basis);
			c.amount = round2(c.amount + Number(s.consignorAmount ?? 0));
			byConsignor.set(s.consignorId, c);
		}
	}

	totals.basis = round2(totals.basis);
	totals.consignor = round2(totals.consignor);
	totals.yf = round2(totals.yf);
	totals.commissions = round2(totals.commissions);

	return {
		period,
		totals,
		listers: [...byLister.values()].sort((a, b) => b.commission + b.points - (a.commission + a.points)),
		consignorTotals: [...byConsignor.values()].sort((a, b) => b.amount - a.amount),
		pendingCount
	};
}

/** Approve pending settlements (freeze terms) for a period or explicit ids. */
export async function approveSettlements(opts: { period?: string; ids?: string[] }): Promise<number> {
	const conditions = [eq(ebaySaleSettlements.status, 'pending')];
	if (opts.period) conditions.push(eq(ebaySaleSettlements.payPeriod, opts.period));
	if (opts.ids && opts.ids.length > 0) conditions.push(inArray(ebaySaleSettlements.id, opts.ids));
	const updated = await db
		.update(ebaySaleSettlements)
		.set({ status: 'approved', updatedAt: new Date() })
		.where(and(...conditions))
		.returning({ id: ebaySaleSettlements.id });
	return updated.length;
}

export async function periodsAvailable(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ payPeriod: ebaySaleSettlements.payPeriod })
		.from(ebaySaleSettlements)
		.orderBy(sql`1 desc`);
	return rows.map((r) => r.payPeriod);
}
