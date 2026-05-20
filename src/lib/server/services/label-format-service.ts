/**
 * Label format CRUD. Each row defines a tag size — sheet (Avery-style with
 * cols/rows/pitch) or thermal (continuous roll, just label dimensions).
 *
 * The hardcoded enum that used to live on `vendor_tag_settings` is gone;
 * label_formats.code is now the canonical reference. Seed migrations populate
 * the 5 originals (avery_5160 / 5163 / 5167, zebra_2x1 / 4x2).
 */

import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db, labelFormats } from '$lib/server/db';
import type { LabelFormat, NewLabelFormat } from '$lib/server/db/schema';

export type LabelLayout = 'sheet' | 'thermal';

export interface LabelFormatInput {
	code: string;
	name: string;
	layout: LabelLayout;
	labelWidthInches: number;
	labelHeightInches: number;
	pageWidthInches?: number | null;
	pageHeightInches?: number | null;
	cols?: number | null;
	rows?: number | null;
	marginTopInches?: number | null;
	marginLeftInches?: number | null;
	verticalPitchInches?: number | null;
	horizontalPitchInches?: number | null;
	mediaShape?: 'rectangle' | 'barbell' | 'circle' | 'custom';
	shapeDimsJson?: Record<string, unknown> | null;
	mediaSensor?: 'gap' | 'mark' | 'continuous' | null;
	category?: 'thermal' | 'sheet';
	manufacturer?: 'zebra' | 'avery' | 'custom';
	partNumber?: string | null;
	dpi?: number | null;
}

export class LabelFormatError extends Error {}

export async function listFormats(opts?: { includeInactive?: boolean }): Promise<LabelFormat[]> {
	const conds = [];
	if (!opts?.includeInactive) conds.push(eq(labelFormats.isActive, true));
	return db
		.select()
		.from(labelFormats)
		.where(conds.length ? and(...conds) : undefined)
		.orderBy(asc(labelFormats.layout), asc(labelFormats.name));
}

export async function getFormat(id: string): Promise<LabelFormat | null> {
	const [row] = await db.select().from(labelFormats).where(eq(labelFormats.id, id)).limit(1);
	return row ?? null;
}

export async function getFormatByCode(code: string): Promise<LabelFormat | null> {
	const [row] = await db.select().from(labelFormats).where(eq(labelFormats.code, code)).limit(1);
	return row ?? null;
}

function validate(input: LabelFormatInput): void {
	if (!input.code || !/^[a-z0-9_]{2,32}$/.test(input.code)) {
		throw new LabelFormatError('Code must be 2-32 chars, lowercase letters / digits / underscores');
	}
	if (!input.name?.trim()) throw new LabelFormatError('Name is required');
	if (input.layout !== 'sheet' && input.layout !== 'thermal') {
		throw new LabelFormatError('Layout must be sheet or thermal');
	}
	if (input.labelWidthInches <= 0 || input.labelHeightInches <= 0) {
		throw new LabelFormatError('Label width/height must be > 0');
	}
	if (input.layout === 'sheet') {
		if (!input.pageWidthInches || !input.pageHeightInches) {
			throw new LabelFormatError('Sheet layout needs page width + height');
		}
		if (!input.cols || !input.rows) {
			throw new LabelFormatError('Sheet layout needs cols + rows');
		}
	}
}

function toRow(input: LabelFormatInput): Partial<NewLabelFormat> {
	return {
		code: input.code,
		name: input.name.trim(),
		layout: input.layout,
		labelWidthInches: String(input.labelWidthInches),
		labelHeightInches: String(input.labelHeightInches),
		pageWidthInches: input.pageWidthInches != null ? String(input.pageWidthInches) : null,
		pageHeightInches: input.pageHeightInches != null ? String(input.pageHeightInches) : null,
		cols: input.cols ?? null,
		rows: input.rows ?? null,
		marginTopInches: input.marginTopInches != null ? String(input.marginTopInches) : null,
		marginLeftInches: input.marginLeftInches != null ? String(input.marginLeftInches) : null,
		verticalPitchInches: input.verticalPitchInches != null ? String(input.verticalPitchInches) : null,
		horizontalPitchInches: input.horizontalPitchInches != null ? String(input.horizontalPitchInches) : null,
		mediaShape: input.mediaShape ?? 'rectangle',
		shapeDimsJson: input.shapeDimsJson ?? null,
		mediaSensor: input.mediaSensor ?? null,
		category: input.category ?? (input.layout as 'thermal' | 'sheet'),
		manufacturer: input.manufacturer ?? 'custom',
		partNumber: input.partNumber ?? null,
		dpi: input.dpi ?? null
	};
}

export async function createFormat(input: LabelFormatInput): Promise<LabelFormat> {
	validate(input);
	const existing = await getFormatByCode(input.code);
	if (existing) throw new LabelFormatError(`Code "${input.code}" is already in use`);
	const [row] = await db
		.insert(labelFormats)
		.values(toRow(input) as NewLabelFormat)
		.returning();
	return row;
}

export async function updateFormat(id: string, input: LabelFormatInput): Promise<LabelFormat> {
	validate(input);
	// Prevent code collisions on rename
	const conflict = await db
		.select({ id: labelFormats.id })
		.from(labelFormats)
		.where(and(eq(labelFormats.code, input.code), sql`${labelFormats.id} <> ${id}`))
		.limit(1);
	if (conflict.length > 0) throw new LabelFormatError(`Code "${input.code}" is already in use`);
	const [row] = await db
		.update(labelFormats)
		.set({ ...toRow(input), version: sql`${labelFormats.version} + 1`, updatedAt: new Date() })
		.where(eq(labelFormats.id, id))
		.returning();
	if (!row) throw new LabelFormatError('Format not found');
	return row;
}

export async function archiveFormat(id: string): Promise<void> {
	await db
		.update(labelFormats)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(labelFormats.id, id));
}

export async function unarchiveFormat(id: string): Promise<void> {
	await db
		.update(labelFormats)
		.set({ isActive: true, updatedAt: new Date() })
		.where(eq(labelFormats.id, id));
}

export async function listFormatsModifiedSince(sinceVersion: number) {
	return db
		.select()
		.from(labelFormats)
		.where(gt(labelFormats.version, sinceVersion))
		.orderBy(asc(labelFormats.version));
}
