import { eq, asc } from 'drizzle-orm';
import { db, kitProfiles, vendors } from '$lib/server/db';

/**
 * Printer registry (read-only for now). Printers are configured in `kit_profiles`
 * — a shop-commissioned kit has ownerType='shop' + a kitId label; a BYO vendor
 * printer has ownerType='vendor_byo'. This is the "database printers" list the
 * staff Labels & Tags hub shows; the standalone label app (which owns the actual
 * printer connectivity) is the consumer that will eventually drive selection.
 */
export async function listPrinters() {
	return db
		.select({
			id: kitProfiles.id,
			kitId: kitProfiles.kitId,
			ownerType: kitProfiles.ownerType,
			vendorId: kitProfiles.vendorId,
			vendorName: vendors.displayName,
			printerModel: kitProfiles.printerModel,
			printerDpi: kitProfiles.printerDpi,
			commandLang: kitProfiles.commandLang,
			backend: kitProfiles.backend,
			mediaSensor: kitProfiles.mediaSensor,
			mediaType: kitProfiles.mediaType,
			preferredFormatCode: kitProfiles.preferredFormatCode,
			updatedAt: kitProfiles.updatedAt
		})
		.from(kitProfiles)
		.leftJoin(vendors, eq(vendors.id, kitProfiles.vendorId))
		.orderBy(asc(kitProfiles.ownerType), asc(kitProfiles.kitId));
}
