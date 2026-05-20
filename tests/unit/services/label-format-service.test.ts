import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
const mockSelectModified = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		update: () => ({ set: (vals: any) => ({ where: () => ({ returning: () => mockUpdate(vals) }) }) }),
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => mockSelectModified(),
					limit: () => Promise.resolve([])
				})
			})
		})
	},
	labelFormats: { id: 'id', version: 'version', updatedAt: 'updatedAt' }
}));

import { updateFormat, listFormatsModifiedSince } from '$lib/server/services/label-format-service';

describe('label-format-service version semantics', () => {
	beforeEach(() => { mockUpdate.mockReset(); mockSelectModified.mockReset(); });

	it('updateFormat bumps version via SQL increment, not a fixed value', async () => {
		mockUpdate.mockResolvedValue([{ id: 'f1', version: 2 }]);
		await updateFormat('f1', { code: 'xx', name: 'X', layout: 'thermal', labelWidthInches: 1, labelHeightInches: 1 } as any);
		const args = mockUpdate.mock.calls[0][0];
		// `version` is set via a SQL expression (drizzle `sql` template), not a literal number
		expect(JSON.stringify(args.version)).toMatch(/version.*\+.*1|\+\s*1/);
		expect(args.updatedAt).toBeInstanceOf(Date);
	});

	it('listFormatsModifiedSince returns rows with version greater than cursor', async () => {
		mockSelectModified.mockResolvedValue([{ id: 'f1', version: 5 }, { id: 'f2', version: 7 }]);
		const rows = await listFormatsModifiedSince(3);
		expect(rows).toHaveLength(2);
		expect(rows[0].version).toBe(5);
	});
});
