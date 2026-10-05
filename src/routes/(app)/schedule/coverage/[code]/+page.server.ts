import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, shiftRequests, shiftRequestRecipients, shiftRequestResponses, users, locations } from '$lib/server/db';
import { and, eq, inArray } from 'drizzle-orm';
import { claimShift, declineRequest, notifyLosers } from '$lib/server/services/shift-coverage-service';
import { createLogger } from '$lib/server/logger';

const log = createLogger('schedule:coverage-claim');

async function loadByCode(code: string) {
	const [row] = await db
		.select({
			id: shiftRequests.id,
			status: shiftRequests.status,
			startTime: shiftRequests.startTime,
			endTime: shiftRequests.endTime,
			respondBy: shiftRequests.respondBy,
			claimCode: shiftRequests.claimCode,
			requestedBy: shiftRequests.requestedBy,
			filledBy: shiftRequests.filledBy,
			locationName: locations.name
		})
		.from(shiftRequests)
		.leftJoin(locations, eq(locations.id, shiftRequests.locationId))
		.where(eq(shiftRequests.claimCode, code.toUpperCase()))
		.limit(1);
	return row;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');

	const request = await loadByCode(params.code);
	if (!request) throw error(404, 'That shift offer was not found');

	// Only people who were actually invited can see or claim it.
	const [invited] = await db
		.select({ id: shiftRequestRecipients.id })
		.from(shiftRequestRecipients)
		.where(
			and(
				eq(shiftRequestRecipients.requestId, request.id),
				eq(shiftRequestRecipients.userId, locals.user.id)
			)
		)
		.limit(1);

	const isManager = locals.user.role === 'admin' || locals.user.role === 'manager';
	if (!invited && !isManager) {
		throw error(403, "You weren't asked to cover this shift");
	}

	const names = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(
			inArray(
				users.id,
				[request.requestedBy, request.filledBy].filter((id): id is string => !!id)
			)
		);
	const nameMap = new Map(names.map((u) => [u.id, u.name]));

	const [myResponse] = await db
		.select({ status: shiftRequestResponses.status })
		.from(shiftRequestResponses)
		.where(
			and(
				eq(shiftRequestResponses.requestId, request.id),
				eq(shiftRequestResponses.userId, locals.user.id)
			)
		)
		.limit(1);

	return {
		request: {
			...request,
			requestedByName: request.requestedBy ? (nameMap.get(request.requestedBy) ?? 'A coworker') : null,
			filledByName: request.filledBy ? (nameMap.get(request.filledBy) ?? 'Someone') : null
		},
		myResponse: myResponse?.status ?? null,
		canClaim: !!invited
	};
};

export const actions: Actions = {
	claim: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const request = await loadByCode(params.code);
		if (!request) return fail(404, { error: 'That shift offer was not found' });

		const outcome = await claimShift({
			requestId: request.id,
			userId: locals.user.id,
			viaSms: false
		});
		if (!outcome.ok) return fail(400, { error: outcome.message });

		notifyLosers(request.id, locals.user.id).catch((err) =>
			log.error({ err, requestId: request.id }, 'Failed to notify non-winners')
		);
		return { success: true, message: "You've got it — it's on your schedule." };
	},

	decline: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const request = await loadByCode(params.code);
		if (!request) return fail(404, { error: 'That shift offer was not found' });

		await declineRequest({ requestId: request.id, userId: locals.user.id, viaSms: false });
		return { success: true, message: 'Thanks for letting us know.' };
	}
};
