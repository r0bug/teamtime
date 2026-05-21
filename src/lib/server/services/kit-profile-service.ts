import { and, eq } from 'drizzle-orm';
import { db, kitProfiles } from '$lib/server/db';

export class KitProfileError extends Error {}

const VALID_BACKENDS = ['linux_usb', 'win_usb', 'win_spooler'] as const;
const VALID_COMMAND_LANGS = ['zpl2', 'epl', 'cpcl'] as const;
const VALID_SENSORS = ['gap', 'mark', 'continuous'] as const;
const VALID_MEDIA_TYPES = ['direct_thermal', 'transfer'] as const;
const VALID_OWNER_TYPES = ['shop', 'vendor_byo'] as const;

export interface KitProfileInput {
	kitId?: string | null;
	ownerType?: typeof VALID_OWNER_TYPES[number];
	printerModel: string;
	printerDpi: number;
	labelWidthDots: number;
	labelHeightDots: number;
	commandLang?: typeof VALID_COMMAND_LANGS[number];
	mediaSensor?: typeof VALID_SENSORS[number];
	mediaType?: typeof VALID_MEDIA_TYPES[number];
	backend: typeof VALID_BACKENDS[number];
	preferredFormatCode?: string | null;
}

function validate(input: KitProfileInput): void {
	if (!input.printerModel?.trim()) throw new KitProfileError('printerModel required');
	if (!Number.isFinite(input.printerDpi) || input.printerDpi <= 0) throw new KitProfileError('printerDpi must be positive');
	if (input.labelWidthDots <= 0 || input.labelHeightDots <= 0) throw new KitProfileError('label dims must be positive');
	if (!VALID_BACKENDS.includes(input.backend)) throw new KitProfileError(`backend must be one of ${VALID_BACKENDS.join(', ')}`);
	if (input.commandLang && !VALID_COMMAND_LANGS.includes(input.commandLang)) throw new KitProfileError('invalid commandLang');
	if (input.mediaSensor && !VALID_SENSORS.includes(input.mediaSensor)) throw new KitProfileError('invalid mediaSensor');
	if (input.mediaType && !VALID_MEDIA_TYPES.includes(input.mediaType)) throw new KitProfileError('invalid mediaType');
	if (input.ownerType && !VALID_OWNER_TYPES.includes(input.ownerType)) throw new KitProfileError('invalid ownerType');
}

export async function getKitProfileForVendor(vendorId: string, kitId: string | null = null) {
	const conditions = kitId
		? and(eq(kitProfiles.vendorId, vendorId), eq(kitProfiles.kitId, kitId))
		: eq(kitProfiles.vendorId, vendorId);
	const [row] = await db.select().from(kitProfiles).where(conditions).limit(1);
	return row ?? null;
}

export async function upsertKitProfile(vendorId: string, input: KitProfileInput) {
	validate(input);
	const values = {
		vendorId,
		kitId: input.kitId ?? null,
		ownerType: input.ownerType ?? 'vendor_byo',
		printerModel: input.printerModel.trim(),
		printerDpi: input.printerDpi,
		labelWidthDots: input.labelWidthDots,
		labelHeightDots: input.labelHeightDots,
		commandLang: input.commandLang ?? 'zpl2',
		mediaSensor: input.mediaSensor ?? 'gap',
		mediaType: input.mediaType ?? 'direct_thermal',
		backend: input.backend,
		preferredFormatCode: input.preferredFormatCode ?? null,
		updatedAt: new Date()
	};
	const [row] = await db
		.insert(kitProfiles)
		.values(values)
		.onConflictDoUpdate({
			target: [kitProfiles.vendorId, kitProfiles.kitId],
			set: {
				ownerType: values.ownerType,
				printerModel: values.printerModel,
				printerDpi: values.printerDpi,
				labelWidthDots: values.labelWidthDots,
				labelHeightDots: values.labelHeightDots,
				commandLang: values.commandLang,
				mediaSensor: values.mediaSensor,
				mediaType: values.mediaType,
				backend: values.backend,
				preferredFormatCode: values.preferredFormatCode,
				updatedAt: values.updatedAt
			}
		})
		.returning();
	return row;
}
