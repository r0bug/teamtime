import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isManager } from '$lib/server/auth/roles';
import { signAgreement, getVendorAgreements } from '$lib/server/services/vendor-service';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');
	const agreements = await getVendorAgreements(params.id);
	return json({ agreements });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!isManager(locals.user)) throw error(403, 'Forbidden');

	const body = await request.json();
	if (!body.templateId || typeof body.templateId !== 'string') {
		throw error(400, 'templateId is required');
	}
	if (!body.signedByName || typeof body.signedByName !== 'string') {
		throw error(400, 'signedByName is required');
	}

	const paperOriginalOnFile = body.paperOriginalOnFile === true;
	const signatureDataUrl =
		typeof body.signatureDataUrl === 'string' && body.signatureDataUrl.startsWith('data:image/')
			? body.signatureDataUrl
			: null;

	if (!paperOriginalOnFile && !signatureDataUrl) {
		throw error(400, 'Either signatureDataUrl or paperOriginalOnFile is required');
	}

	const agreement = await signAgreement({
		vendorId: params.id,
		templateId: body.templateId,
		signedByName: body.signedByName,
		signatureDataUrl,
		paperOriginalOnFile,
		extraFieldValues: body.extraFieldValues ?? undefined,
		witnessedByUserId: locals.user!.id
	});

	return json({ agreement }, { status: 201 });
};
