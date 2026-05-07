/**
 * Agreement template service.
 *
 * Templates are reusable agreement documents. Each `code` (slug) can have
 * multiple version rows; only one is active at a time. Editing an active
 * template that already has signed agreements creates a new version row
 * rather than mutating in place — old signed agreements still reference
 * the old template id and keep displaying the body they were signed against
 * via `vendorAgreements.bodySnapshot`.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	agreementTemplates,
	vendorAgreements,
	type AgreementTemplate,
	type NewAgreementTemplate
} from '$lib/server/db/schema';
import { createLogger } from '$lib/server/logger';

const log = createLogger('services:agreement-template');

export interface ExtraField {
	key: string;
	label: string;
	type: 'currency' | 'text' | 'number';
	required: boolean;
}

export async function listTemplates(opts?: {
	includeInactive?: boolean;
	includeArchived?: boolean;
}): Promise<AgreementTemplate[]> {
	const conditions = [];
	if (!opts?.includeInactive) conditions.push(eq(agreementTemplates.isActive, true));
	if (!opts?.includeArchived) conditions.push(sql`${agreementTemplates.archivedAt} IS NULL`);

	return db
		.select()
		.from(agreementTemplates)
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(asc(agreementTemplates.kind), asc(agreementTemplates.title));
}

export async function getTemplate(id: string): Promise<AgreementTemplate | null> {
	const [row] = await db
		.select()
		.from(agreementTemplates)
		.where(eq(agreementTemplates.id, id))
		.limit(1);
	return row ?? null;
}

export async function getActiveTemplateByCode(code: string): Promise<AgreementTemplate | null> {
	const [row] = await db
		.select()
		.from(agreementTemplates)
		.where(and(eq(agreementTemplates.code, code), eq(agreementTemplates.isActive, true)))
		.limit(1);
	return row ?? null;
}

export async function createTemplate(
	input: Pick<NewAgreementTemplate, 'code' | 'title' | 'kind' | 'bodyMarkdown'> & {
		extraFieldsSchema?: ExtraField[];
		createdByUserId?: string;
	}
): Promise<AgreementTemplate> {
	const [row] = await db
		.insert(agreementTemplates)
		.values({
			code: input.code,
			title: input.title,
			kind: input.kind,
			bodyMarkdown: input.bodyMarkdown,
			extraFieldsSchema: input.extraFieldsSchema ?? null,
			createdByUserId: input.createdByUserId ?? null,
			version: 1,
			isActive: true
		})
		.returning();
	log.info({ templateId: row.id, code: row.code }, 'Created agreement template');
	return row;
}

/**
 * Update a template. If any signed agreements reference the existing row,
 * we create a new version (new id, version+1, supersedesId=old, old.isActive=false)
 * to preserve the historical record. Otherwise we mutate in place.
 */
export async function updateTemplate(
	id: string,
	patch: {
		title?: string;
		bodyMarkdown?: string;
		extraFieldsSchema?: ExtraField[] | null;
	},
	editedByUserId?: string
): Promise<AgreementTemplate> {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(agreementTemplates)
			.where(eq(agreementTemplates.id, id))
			.limit(1);
		if (!current) throw new Error(`Template not found: ${id}`);

		const [{ count }] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(vendorAgreements)
			.where(eq(vendorAgreements.templateId, id));

		if (count === 0) {
			const [updated] = await tx
				.update(agreementTemplates)
				.set({
					title: patch.title ?? current.title,
					bodyMarkdown: patch.bodyMarkdown ?? current.bodyMarkdown,
					extraFieldsSchema:
						patch.extraFieldsSchema === undefined ? current.extraFieldsSchema : patch.extraFieldsSchema,
					updatedAt: new Date()
				})
				.where(eq(agreementTemplates.id, id))
				.returning();
			log.info({ templateId: id }, 'Updated template in place (no signed agreements)');
			return updated;
		}

		await tx
			.update(agreementTemplates)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(agreementTemplates.id, id));

		const [next] = await tx
			.insert(agreementTemplates)
			.values({
				code: current.code,
				title: patch.title ?? current.title,
				kind: current.kind,
				bodyMarkdown: patch.bodyMarkdown ?? current.bodyMarkdown,
				extraFieldsSchema:
					patch.extraFieldsSchema === undefined ? current.extraFieldsSchema : patch.extraFieldsSchema,
				version: current.version + 1,
				supersedesId: current.id,
				isActive: true,
				createdByUserId: editedByUserId ?? null
			})
			.returning();

		log.info(
			{ oldTemplateId: id, newTemplateId: next.id, version: next.version },
			'Created new template version (signed agreements exist)'
		);
		return next;
	});
}

export async function archiveTemplate(id: string): Promise<void> {
	await db
		.update(agreementTemplates)
		.set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
		.where(eq(agreementTemplates.id, id));
	log.info({ templateId: id }, 'Archived template');
}
