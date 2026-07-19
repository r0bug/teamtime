/**
 * Unit tests for the vendor newsletter service's pure parts (block
 * normalization, starter layout, module surface). Rendering/sending are
 * DB+SMTP-backed and follow the same smoke-test-only convention as
 * vendor-service.test.ts until a DB-mock pattern exists.
 */

import { describe, it, expect, vi } from 'vitest';

// The service imports sendEmail, whose $env/static/private SMTP keys may not
// be defined in a test .env — stub the whole email module out.
vi.mock('$lib/server/email', () => ({
	sendEmail: vi.fn(async () => true)
}));

describe('vendor-newsletter-service', () => {
	it('exports the expected public surface', async () => {
		const mod = await import('$lib/server/services/vendor-newsletter-service');
		expect(typeof mod.listNewsletters).toBe('function');
		expect(typeof mod.getNewsletter).toBe('function');
		expect(typeof mod.listPortalNewsletters).toBe('function');
		expect(typeof mod.saveNewsletter).toBe('function');
		expect(typeof mod.deleteDraft).toBe('function');
		expect(typeof mod.renderNewsletter).toBe('function');
		expect(typeof mod.wrapEmail).toBe('function');
		expect(typeof mod.sendNewsletterToVendors).toBe('function');
		expect(typeof mod.sendNewsletterTest).toBe('function');
	});

	it('starterBlocks covers every block type once', async () => {
		const { starterBlocks, BLOCK_TYPES } = await import(
			'$lib/server/services/vendor-newsletter-service'
		);
		const types = starterBlocks().map((b) => b.type);
		expect([...types].sort()).toEqual([...BLOCK_TYPES].sort());
	});

	describe('normalizeBlocks', () => {
		it('drops garbage and unknown types, keeps valid blocks', async () => {
			const { normalizeBlocks } = await import('$lib/server/services/vendor-newsletter-service');
			const out = normalizeBlocks([
				null,
				42,
				{ type: 'bogus' },
				{ type: 'text', markdown: 'hello', heading: '  From the shop  ' },
				{ type: 'salesChart' },
				{ type: 'personalStats', heading: 'Your numbers' }
			]);
			expect(out).toEqual([
				{ type: 'text', heading: 'From the shop', markdown: 'hello' },
				{ type: 'salesChart', heading: undefined },
				{ type: 'personalStats', heading: 'Your numbers' }
			]);
		});

		it('returns [] for non-array input', async () => {
			const { normalizeBlocks } = await import('$lib/server/services/vendor-newsletter-service');
			expect(normalizeBlocks(null)).toEqual([]);
			expect(normalizeBlocks('x')).toEqual([]);
			expect(normalizeBlocks({})).toEqual([]);
		});

		it('clamps leaderboard limit and defaults bad metrics', async () => {
			const { normalizeBlocks } = await import('$lib/server/services/vendor-newsletter-service');
			const [lb] = normalizeBlocks([
				{ type: 'leaderboard', metric: 'nonsense', limit: 9999, showAmounts: false }
			]);
			expect(lb).toEqual({
				type: 'leaderboard',
				heading: undefined,
				metric: 'gross',
				limit: 50,
				showAmounts: false
			});
		});

		it('filters empty items from tips/shoutouts/events', async () => {
			const { normalizeBlocks } = await import('$lib/server/services/vendor-newsletter-service');
			const out = normalizeBlocks([
				{ type: 'tips', items: ['  ', 'real tip', 7] },
				{ type: 'shoutouts', items: [{ name: '', message: '' }, { name: 'Booth 12', message: 'Record week!' }] },
				{ type: 'events', items: [{ date: '2026-08-01', title: '' }, { date: '2026-08-01', title: 'Sidewalk sale' }] }
			]);
			expect(out[0]).toMatchObject({ items: ['real tip'] });
			expect(out[1]).toMatchObject({ items: [{ name: 'Booth 12', message: 'Record week!' }] });
			expect(out[2]).toMatchObject({ items: [{ date: '2026-08-01', title: 'Sidewalk sale' }] });
		});
	});

	it('wrapEmail escapes the title and includes the greeting', async () => {
		const { wrapEmail } = await import('$lib/server/services/vendor-newsletter-service');
		const html = wrapEmail('July <Roundup>', '<p>body</p>', 'Hi Pat,');
		expect(html).toContain('July &lt;Roundup&gt;');
		expect(html).toContain('Hi Pat,');
		expect(html).toContain('<p>body</p>');
	});
});
