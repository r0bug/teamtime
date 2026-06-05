import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		insert: () => ({ values: (vals: any) => ({ returning: () => mockInsert({ vals }) }) }),
		select: () => ({ from: () => ({ where: () => ({ orderBy: () => mockSelect() }) }) }),
		update: () => ({ set: (vals: any) => ({ where: () => ({ returning: () => mockUpdate({ vals }) }) }) })
	},
	vendorPrintJobs: { id: 'id', vendorId: 'vendorId', status: 'status', createdAt: 'createdAt' }
}));

import {
	enqueuePrintJob,
	listQueuedForVendor,
	ackPrintJob,
	PrintQueueError
} from '$lib/server/services/print-queue-service';

describe('print-queue-service', () => {
	beforeEach(() => {
		mockInsert.mockReset();
		mockSelect.mockReset();
		mockUpdate.mockReset();
	});

	it('enqueuePrintJob requires a part number', async () => {
		await expect(enqueuePrintJob({ vendorId: 'v1', partNumber: '   ' })).rejects.toBeInstanceOf(
			PrintQueueError
		);
	});

	it('enqueuePrintJob defaults copies to 1 and source to web_portal', async () => {
		mockInsert.mockResolvedValue([{ id: 'j1' }]);
		await enqueuePrintJob({ vendorId: 'v1', partNumber: 'SR60526001' });
		const { vals } = mockInsert.mock.calls[0][0];
		expect(vals.copies).toBe(1);
		expect(vals.source).toBe('web_portal');
		expect(vals.vendorId).toBe('v1');
	});

	it('enqueuePrintJob clamps non-positive copies to 1 and floors fractional', async () => {
		mockInsert.mockResolvedValue([{ id: 'j1' }]);
		await enqueuePrintJob({ vendorId: 'v1', partNumber: 'SR1', copies: 0 });
		expect(mockInsert.mock.calls[0][0].vals.copies).toBe(1);
		await enqueuePrintJob({ vendorId: 'v1', partNumber: 'SR1', copies: 3.9 });
		expect(mockInsert.mock.calls[1][0].vals.copies).toBe(3);
	});

	it('listQueuedForVendor returns the rows', async () => {
		mockSelect.mockResolvedValue([{ id: 'j1', status: 'queued' }]);
		const rows = await listQueuedForVendor('v1');
		expect(rows).toHaveLength(1);
	});

	it('ackPrintJob rejects an invalid status', async () => {
		await expect(
			ackPrintJob('j1', 'v1', { status: 'bogus' as any })
		).rejects.toBeInstanceOf(PrintQueueError);
	});

	it('ackPrintJob(printed) sets printedAt and clears failureReason', async () => {
		mockUpdate.mockResolvedValue([{ id: 'j1', status: 'printed' }]);
		await ackPrintJob('j1', 'v1', { status: 'printed' });
		const { vals } = mockUpdate.mock.calls[0][0];
		expect(vals.status).toBe('printed');
		expect(vals.printedAt).toBeInstanceOf(Date);
		expect(vals.failureReason).toBeNull();
	});

	it('ackPrintJob(failed) records the reason and leaves printedAt null', async () => {
		mockUpdate.mockResolvedValue([{ id: 'j1', status: 'failed' }]);
		await ackPrintJob('j1', 'v1', { status: 'failed', failureReason: 'out of media' });
		const { vals } = mockUpdate.mock.calls[0][0];
		expect(vals.status).toBe('failed');
		expect(vals.printedAt).toBeNull();
		expect(vals.failureReason).toBe('out of media');
	});

	it('ackPrintJob throws when no row matches (wrong vendor or missing)', async () => {
		mockUpdate.mockResolvedValue([]);
		await expect(ackPrintJob('j1', 'other-vendor', { status: 'printed' })).rejects.toBeInstanceOf(
			PrintQueueError
		);
	});
});
