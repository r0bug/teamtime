import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { NRS_API_KEY: 'test-key', NRS_STORE_ID: '20' } }));

import {
	saveVendorMeta,
	rentCentsFromMeta,
	metaText,
	listVendorMetadataDefs,
	NRS_VENDOR_META
} from '$lib/server/services/nrs-api-client';

const baseVendor = {
	vendorId: 17009, companyId: 102, vendorCode: 'SR', address: '---', address2: '', address3: '', city: '---', state: '',
	zipCode: '---', country: 'United States of America', countryCode: 'US', countryCode3: 'USA', contact: 'Storlie',
	email: '---', phone: '---', fax: '', fedid: '', require1099: false, nameFor1099: '', ourAccountNumber: '',
	minimumOrderValue: 0, notes: 'Johns Stuff', vendorNumber: '0', portalAccess: false,
	meta13: 0, meta72: null, meta73: null, meta74: true
};

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[];
let nrsState: Record<string, unknown>;

function installFetch() {
	calls = [];
	nrsState = { ...baseVendor };
	vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
		calls.push({ url, body });
		const respond = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
		if (url.endsWith('/vendor/get')) return respond({ get: { ...nrsState } });
		if (url.endsWith('/vendor/save')) {
			// Mimic NRS: missing keys become blank — the bug saveVendorMeta must avoid.
			nrsState = { ...body, country: body!.country ?? false };
			return respond({ saved: body!.vendorId });
		}
		if (url.endsWith('/metadata/list')) return respond({ list: [{ metadataId: 'meta13', name: 'Booth Rent' }] });
		return respond({ err: { num: 100, msg: 'No Response' } });
	}));
}

beforeEach(installFetch);
afterEach(() => vi.unstubAllGlobals());

describe('rentCentsFromMeta / metaText', () => {
	it('converts dollars to cents and treats 0/blank as unset', () => {
		expect(rentCentsFromMeta({ meta13: 175 })).toBe(17500);
		expect(rentCentsFromMeta({ meta13: 43.5 })).toBe(4350);
		expect(rentCentsFromMeta({ meta13: 0 })).toBeNull();
		expect(rentCentsFromMeta(null)).toBeNull();
		expect(metaText('')).toBeNull();
		expect(metaText(null)).toBeNull();
		expect(metaText('Booth A')).toBe('Booth A');
	});
});

describe('listVendorMetadataDefs', () => {
	it('returns the metadata field definitions', async () => {
		const defs = await listVendorMetadataDefs();
		expect(defs).toEqual([{ metadataId: 'meta13', name: 'Booth Rent' }]);
		expect(NRS_VENDOR_META.boothRent).toBe('meta13');
	});
});

describe('saveVendorMeta', () => {
	it('merges the patch into the full current record so partial saves never blank fields', async () => {
		const r = await saveVendorMeta(17009, { meta13: 175, meta72: 'Booth #1' });
		const save = calls.find((c) => c.url.endsWith('/vendor/save'))!;
		expect(save.body).toMatchObject({ vendorId: 17009, country: 'United States of America', notes: 'Johns Stuff', meta13: 175, meta72: 'Booth #1' });
		// null text metas are sent as '' (NRS ignores null)
		expect(save.body!.meta73).toBe('');
		expect(r.saved).toBe(true);
		expect(r.detail.country).toBe('United States of America');
		expect(r.detail.meta13).toBe(175);
	});

	it('normalizes null/false patch values', async () => {
		await saveVendorMeta(17009, { meta72: null, meta73: null, meta74: false, meta13: 0 });
		const save = calls.find((c) => c.url.endsWith('/vendor/save'))!;
		expect(save.body).toMatchObject({ meta72: '', meta73: '', meta74: false, meta13: 0 });
	});

	it('throws when NRS does not confirm the save', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			if (url.endsWith('/vendor/get')) return new Response(JSON.stringify({ get: { ...baseVendor } }));
			return new Response(JSON.stringify({ saved: 0 }));
		}));
		await expect(saveVendorMeta(17009, { meta13: 5 })).rejects.toThrow(/did not confirm/);
	});

	it('throws when the vendor does not exist', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ err: { num: 201, msg: 'No Data Received' } }))));
		await expect(saveVendorMeta(1, { meta13: 5 })).rejects.toThrow(/not found/);
	});
});
