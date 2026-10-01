import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, shiftRequests, shiftRequestRecipients, shiftRequestResponses, users, locations } from '$lib/server/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
	getEligibleStaff,
	broadcastRequest,
	claimShift,
	notifyLosers,
	getCoverageSettings,
	buildBroadcastMessage,
	defaultDeadline
} from '$lib/server/services/shift-coverage-service';
import { toPacificDatetimeLocal } from '$lib/server/utils/timezone';
import { createLogger } from '$lib/server/logger';

const log = createLogger('admin:shift-coverage');

function requireManager(locals: App.Locals) {
	if (!locals.user) throw redirect(302, '/login');
	if (locals.user.role !== 'admin' && locals.user.role !== 'manager') {
		throw error(403, 'Access denied');
	}
	return locals.user;
}

async function loadRequests(statuses: ('pending_approval' | 'open' | 'filled' | 'expired' | 'cancelled' | 'denied')[]) {
	return db
		.select({
			id: shiftRequests.id,
			shiftId: shiftRequests.shiftId,
			title: shiftRequests.title,
			status: shiftRequests.status,
			requestType: shiftRequests.requestType,
			reason: shiftRequests.reason,
			startTime: shiftRequests.startTime,
			endTime: shiftRequests.endTime,
			claimCode: shiftRequests.claimCode,
			respondBy: shiftRequests.respondBy,
			broadcastAt: shiftRequests.broadcastAt,
			filledAt: shiftRequests.filledAt,
			autoApply: shiftRequests.autoApply,
			managerNote: shiftRequests.managerNote,
			createdAt: shiftRequests.createdAt,
			requestedById: shiftRequests.requestedBy,
			filledById: shiftRequests.filledBy,
			locationName: locations.name
		})
		.from(shiftRequests)
		.leftJoin(locations, eq(locations.id, shiftRequests.locationId))
		.where(inArray(shiftRequests.status, statuses))
		.orderBy(shiftRequests.startTime);
}

export const load: PageServerLoad = async ({ locals }) => {
	requireManager(locals);

	const settings = await getCoverageSettings();

	const [pending, open, recent] = await Promise.all([
		loadRequests(['pending_approval']),
		loadRequests(['open']),
		db
			.select({
				id: shiftRequests.id,
				title: shiftRequests.title,
				status: shiftRequests.status,
				startTime: shiftRequests.startTime,
				endTime: shiftRequests.endTime,
				filledAt: shiftRequests.filledAt,
				requestedById: shiftRequests.requestedBy,
				filledById: shiftRequests.filledBy,
				locationName: locations.name
			})
			.from(shiftRequests)
			.leftJoin(locations, eq(locations.id, shiftRequests.locationId))
			.where(inArray(shiftRequests.status, ['filled', 'expired', 'cancelled', 'denied']))
			.orderBy(desc(shiftRequests.updatedAt))
			.limit(20)
	]);

	// Resolve names in one pass rather than joining users twice per row.
	const userIds = [
		...new Set(
			[...pending, ...open, ...recent].flatMap((r) => [r.requestedById, r.filledById].filter(Boolean))
		)
	] as string[];
	const nameRows = userIds.length
		? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
		: [];
	const names = new Map(nameRows.map((u) => [u.id, u.name]));
	const withNames = <T extends { requestedById: string | null; filledById: string | null }>(rows: T[]) =>
		rows.map((r) => ({
			...r,
			requestedByName: r.requestedById ? (names.get(r.requestedById) ?? 'Unknown') : null,
			filledByName: r.filledById ? (names.get(r.filledById) ?? 'Unknown') : null
		}));

	// Eligible-staff list for each request awaiting a decision.
	const candidates: Record<string, Awaited<ReturnType<typeof getEligibleStaff>>> = {};
	const previews: Record<string, string> = {};
	const defaultRespondBy: Record<string, string> = {};
	for (const req of pending) {
		defaultRespondBy[req.id] = toPacificDatetimeLocal(
			req.respondBy ?? defaultDeadline(new Date(req.startTime), settings.deadlineHours)
		);
		candidates[req.id] = await getEligibleStaff({
			id: req.id,
			startTime: new Date(req.startTime),
			endTime: new Date(req.endTime),
			requestedBy: req.requestedById
		});
		previews[req.id] = buildBroadcastMessage({
			start: new Date(req.startTime),
			end: new Date(req.endTime),
			locationName: req.locationName,
			claimCode: req.claimCode ?? '????',
			includeCode: false
		});
	}

	// Response + delivery tallies for everything already out for coverage.
	const openIds = open.map((r) => r.id);
	const recipients = openIds.length
		? await db
				.select({
					requestId: shiftRequestRecipients.requestId,
					userId: shiftRequestRecipients.userId,
					name: users.name,
					deliveryStatus: shiftRequestRecipients.deliveryStatus,
					errorMessage: shiftRequestRecipients.errorMessage
				})
				.from(shiftRequestRecipients)
				.innerJoin(users, eq(users.id, shiftRequestRecipients.userId))
				.where(inArray(shiftRequestRecipients.requestId, openIds))
		: [];
	const responses = openIds.length
		? await db
				.select({
					requestId: shiftRequestResponses.requestId,
					userId: shiftRequestResponses.userId,
					status: shiftRequestResponses.status
				})
				.from(shiftRequestResponses)
				.where(inArray(shiftRequestResponses.requestId, openIds))
		: [];

	// Staff with no phone can't be reached at all — surface it once, up top.
	// Derived from the candidate lists already computed above.
	const phoneless = Object.values(candidates)
		.flat()
		.filter((c) => c.hardBlocks.some((b) => b.includes('No phone')))
		.map((c) => c.name);

	return {
		settings,
		pending: withNames(pending),
		open: withNames(open),
		recent: withNames(recent),
		candidates,
		previews,
		recipients,
		responses,
		phoneless: [...new Set(phoneless)],
		defaultRespondBy
	};
};

export const actions: Actions = {
	broadcast: async ({ locals, request }) => {
		const user = requireManager(locals);
		const form = await request.formData();
		const requestId = form.get('requestId')?.toString();
		const message = form.get('message')?.toString()?.trim();
		const respondByRaw = form.get('respondBy')?.toString();
		const userIds = form.getAll('userIds').map((v) => v.toString());

		if (!requestId) return fail(400, { error: 'Missing request' });
		if (userIds.length === 0) return fail(400, { error: 'Select at least one person to text' });

		try {
			const result = await broadcastRequest({
				requestId,
				userIds,
				actorId: user.id,
				message: message || undefined,
				respondBy: respondByRaw ? new Date(respondByRaw) : undefined
			});
			const parts = [`Texted ${result.sent}`];
			if (result.failed) parts.push(`${result.failed} failed`);
			if (result.skipped) parts.push(`${result.skipped} skipped`);
			return { success: true, message: parts.join(', ') };
		} catch (err) {
			log.error({ err, requestId }, 'Broadcast failed');
			return fail(400, { error: err instanceof Error ? err.message : 'Broadcast failed' });
		}
	},

	deny: async ({ locals, request }) => {
		const user = requireManager(locals);
		const form = await request.formData();
		const requestId = form.get('requestId')?.toString();
		const note = form.get('note')?.toString()?.trim();
		if (!requestId) return fail(400, { error: 'Missing request' });

		await db
			.update(shiftRequests)
			.set({ status: 'denied', managerNote: note || null, updatedAt: new Date() })
			.where(and(eq(shiftRequests.id, requestId), eq(shiftRequests.status, 'pending_approval')));
		log.info({ requestId, by: user.id }, 'Coverage request denied');
		return { success: true, message: 'Request denied.' };
	},

	cancel: async ({ locals, request }) => {
		requireManager(locals);
		const form = await request.formData();
		const requestId = form.get('requestId')?.toString();
		if (!requestId) return fail(400, { error: 'Missing request' });

		await db
			.update(shiftRequests)
			.set({ status: 'cancelled', updatedAt: new Date() })
			.where(and(eq(shiftRequests.id, requestId), inArray(shiftRequests.status, ['open', 'pending_approval'])));
		return { success: true, message: 'Request cancelled.' };
	},

	assign: async ({ locals, request }) => {
		const user = requireManager(locals);
		const form = await request.formData();
		const requestId = form.get('requestId')?.toString();
		const userId = form.get('userId')?.toString();
		if (!requestId || !userId) return fail(400, { error: 'Missing request or user' });

		// Manual assignment goes through the same race-safe claim path, so a
		// manager assigning at the same moment someone texts YES can't
		// double-book the shift. requireRecipient is off here on purpose: a
		// manager may hand the shift to anyone, including people who were never
		// in the broadcast. Self-service claims keep the check (see claimShift).
		const outcome = await claimShift({
			requestId,
			userId,
			viaSms: false,
			requireRecipient: false
		});
		if (!outcome.ok) return fail(400, { error: outcome.message });

		notifyLosers(requestId, userId).catch((err) =>
			log.error({ err, requestId }, 'Failed to notify non-winners')
		);
		log.info({ requestId, userId, by: user.id }, 'Coverage request assigned manually');
		return { success: true, message: 'Assigned.' };
	}
};
