/**
 * Read-only client for ListFlow's machine-to-machine API.
 *
 * Contract v2 (unified suite): ListFlow owns the eBay sales LEDGER and lister
 * attribution; TeamTime owns the money logic (consignor/YF/lister splits —
 * see ebay-settlement-service). The feed carries teamtimeUserId + consignment
 * group per sale; the old commission mirror endpoints are retired.
 *
 * Uses dynamic env so builds don't bake (or require) the values: callers
 * render an "unavailable" state when LISTFLOW_URL/SECRET are unset or
 * ListFlow is unreachable.
 */
import { env } from '$env/dynamic/private';
import { createLogger } from '$lib/server/logger';

const log = createLogger('listflow-client');

export interface EbaySaleRow {
	id: string;
	ebayOrderId: string;
	lineItemId: string;
	salesRecordNumber: string | null;
	account: string;
	title: string;
	sku: string | null;
	locationCode: string | null;
	quantity: number;
	itemPrice: number;
	shippingPrice: number | null;
	taxAmount: number | null;
	totalPrice: number;
	fees: number | null;
	refunds: number | null;
	promoted: boolean;
	currency: string;
	soldAt: string;
	attributionStatus: 'PENDING' | 'ATTRIBUTED' | 'HOUSE';
	listedBy: { id: string; name: string; teamtimeUserId: string | null } | null;
	consignmentGroupId: string | null;
}

export interface EbaySalesFeed {
	generatedAt: string;
	days: number;
	sales: EbaySaleRow[];
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

export async function getEbaySalesFeed(days = 30): Promise<EbaySalesFeed | null> {
	return listflowFetch<EbaySalesFeed>(`/api/v1/sales/feed?days=${days}`);
}
