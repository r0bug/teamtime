import { asc, eq } from 'drizzle-orm';
import { db, printers, vendors } from '$lib/server/db';
import type { NewPrinter } from '$lib/server/db';
import { getFormatByCode } from './label-format-service';

/**
 * Managed printer registry (read-only for now) — the `printers` table: shop /
 * network printers, the YF kiosk, and checked-out vendor units. This is the
 * "database printers" list the staff Labels & Tags hub shows, and the standalone
 * label app reads it (GET /api/printers) to know where it can print. Printer
 * selection + connectivity live in the app; this table is the catalog.
 *
 * (kit_profiles remains the separate per-vendor desktop-app kit CONFIG.)
 */
export async function listPrinters() {
	return db
		.select({
			id: printers.id,
			name: printers.name,
			kind: printers.kind,
			model: printers.model,
			dpi: printers.dpi,
			networkAddress: printers.networkAddress,
			macAddress: printers.macAddress,
			serial: printers.serial,
			location: printers.location,
			assignedVendorId: printers.assignedVendorId,
			assignedVendorName: vendors.displayName,
			commandLang: printers.commandLang,
			preferredFormatCode: printers.preferredFormatCode,
			lastSeenAt: printers.lastSeenAt,
			active: printers.active,
			updatedAt: printers.updatedAt
		})
		.from(printers)
		.leftJoin(vendors, eq(vendors.id, printers.assignedVendorId))
		.orderBy(asc(printers.kind), asc(printers.name));
}

export interface PrinterReport {
	/** Natural key for a shared/network printer, e.g. "192.168.88.22:9100". */
	networkAddress: string;
	model?: string | null;
	dpi?: number | null;
	serial?: string | null;
	/** false = probed but unreachable; lastSeenAt is only advanced when online. */
	online?: boolean;
}

/**
 * Upsert a printer keyed by its network address — the Print Bridge's
 * discovery/heartbeat. Keeps the registry's identity (model, dpi) and liveness
 * (lastSeenAt) current. Matches an existing row by networkAddress and only
 * overwrites the identity fields the report actually carries (so a manual rename,
 * checkout, or loaded-format choice is preserved). Inserts a shop_network row
 * when none exists. Returns { id, created }.
 */
export async function reportPrinter(r: PrinterReport): Promise<{ id: string; created: boolean }> {
	const address = r.networkAddress.trim();
	if (!address) throw new Error('networkAddress required');
	const now = new Date();
	const seenAt = r.online === false ? undefined : now;

	const [existing] = await db
		.select({ id: printers.id })
		.from(printers)
		.where(eq(printers.networkAddress, address))
		.limit(1);

	if (existing) {
		const patch: Partial<NewPrinter> = { updatedAt: now };
		if (r.model != null) patch.model = r.model;
		if (r.dpi != null) patch.dpi = r.dpi;
		if (r.serial != null) patch.serial = r.serial;
		if (seenAt) patch.lastSeenAt = seenAt;
		await db.update(printers).set(patch).where(eq(printers.id, existing.id));
		return { id: existing.id, created: false };
	}

	const [row] = await db
		.insert(printers)
		.values({
			name: r.model ? `${r.model} (${address})` : address,
			kind: 'shop_network',
			model: r.model ?? null,
			dpi: r.dpi ?? null,
			serial: r.serial ?? null,
			networkAddress: address,
			lastSeenAt: seenAt ?? null,
			active: true
		})
		.returning({ id: printers.id });
	return { id: row.id, created: true };
}

export class PrinterCheckoutError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
		this.name = 'PrinterCheckoutError';
	}
}

/**
 * Check a printer out to a vendor and record which label format is currently
 * loaded on it. Sets kind='checked_out'. The loaded format must be a known,
 * active, thermal format — it's what drives correct rendering on this unit.
 */
export async function checkoutPrinter(
	printerId: string,
	opts: { vendorId: string; loadedFormatCode: string }
): Promise<void> {
	const [printer] = await db
		.select({ id: printers.id })
		.from(printers)
		.where(eq(printers.id, printerId))
		.limit(1);
	if (!printer) throw new PrinterCheckoutError('Printer not found', 404);

	const [vendor] = await db
		.select({ id: vendors.id })
		.from(vendors)
		.where(eq(vendors.id, opts.vendorId))
		.limit(1);
	if (!vendor) throw new PrinterCheckoutError('Vendor not found', 404);

	const fmt = await getFormatByCode(opts.loadedFormatCode);
	if (!fmt || !fmt.isActive) {
		throw new PrinterCheckoutError(`Unknown label format: ${opts.loadedFormatCode}`);
	}
	if (fmt.category !== 'thermal') {
		throw new PrinterCheckoutError(`Format ${opts.loadedFormatCode} is not a thermal format`);
	}

	await db
		.update(printers)
		.set({
			kind: 'checked_out',
			assignedVendorId: opts.vendorId,
			preferredFormatCode: opts.loadedFormatCode,
			updatedAt: new Date()
		})
		.where(eq(printers.id, printerId));
}

/** Return a checked-out printer to the shared pool (clears the vendor assignment). */
export async function returnPrinter(printerId: string): Promise<void> {
	const [printer] = await db
		.select({ id: printers.id })
		.from(printers)
		.where(eq(printers.id, printerId))
		.limit(1);
	if (!printer) throw new PrinterCheckoutError('Printer not found', 404);
	await db
		.update(printers)
		.set({ assignedVendorId: null, updatedAt: new Date() })
		.where(eq(printers.id, printerId));
}
