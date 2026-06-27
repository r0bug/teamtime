import { asc, eq } from 'drizzle-orm';
import { db, printers, vendors } from '$lib/server/db';

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
