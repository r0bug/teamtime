/**
 * Read-only client for ListFlow's machine-to-machine API (eBay sales +
 * listing-agent commissions). ListFlow is the system of record; TeamTime only
 * displays. Uses dynamic env so builds don't bake (or require) the values:
 * pages render an "unavailable" state when LISTFLOW_URL/SECRET are unset or
 * ListFlow is unreachable.
 */
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';

const log = createLogger('listflow-client');

export interface EbaySaleRow {
	id: string;
	ebayOrderId: string;
	title: string;
	quantity: number;
	itemPrice: number;
	shippingPrice: number | null;
	totalPrice: number;
	buyerUsername: string | null;
	soldAt: string;
	imageUrl: string | null;
	account: string;
	attributionStatus: 'PENDING' | 'ATTRIBUTED' | 'HOUSE';
	commission: {
		amount: number;
		basis: number;
		rateType: 'PERCENT' | 'FLAT';
		rateValue: number;
		status: 'PENDING' | 'PAID';
		agent: { id: string; name: string; teamtimeUserId: string | null };
	} | null;
}

export interface EbaySalesFeed {
	sales: EbaySaleRow[];
	pagination: { page: number; limit: number; total: number; pages: number };
}

export interface CommissionPayrollAgent {
	agentId: string;
	teamtimeUserId: string | null;
	name: string;
	salesCount: number;
	totalCommission: number;
	unpaid: number;
}

async function listflowFetch<T>(path: string): Promise<T | null> {
	const baseUrl = env.LISTFLOW_URL;
	const secret = env.LISTFLOW_API_SECRET;
	if (!baseUrl || !secret) {
		log.warn('LISTFLOW_URL / LISTFLOW_API_SECRET not configured');
		return null;
	}
	try {
		const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
			headers: { Authorization: `Bearer ${secret}` },
			signal: AbortSignal.timeout(8000)
		});
		if (!response.ok) {
			log.warn(`ListFlow ${path} -> HTTP ${response.status}`);
			return null;
		}
		return (await response.json()) as T;
	} catch (err) {
		log.warn(`ListFlow ${path} unreachable: ${(err as Error).message}`);
		return null;
	}
}

export async function getEbaySalesFeed(params: {
	from?: string;
	to?: string;
	page?: number;
	limit?: number;
}): Promise<EbaySalesFeed | null> {
	const qs = new URLSearchParams();
	if (params.from) qs.set('from', params.from);
	if (params.to) qs.set('to', params.to);
	if (params.page) qs.set('page', String(params.page));
	if (params.limit) qs.set('limit', String(params.limit));
	return listflowFetch<EbaySalesFeed>(`/api/v1/sales/feed?${qs.toString()}`);
}

export async function getCommissionPayroll(
	from?: string,
	to?: string
): Promise<CommissionPayrollAgent[] | null> {
	const qs = new URLSearchParams();
	if (from) qs.set('from', from);
	if (to) qs.set('to', to);
	const data = await listflowFetch<{ agents: CommissionPayrollAgent[] }>(
		`/api/v1/commissions/payroll?${qs.toString()}`
	);
	return data?.agents ?? null;
}
