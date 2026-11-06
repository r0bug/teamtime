import { describe, it, expect, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: {} }));
import { parseRange, isSafeFileName, mimeFor } from './training-resources';

describe('parseRange', () => {
	it('serves whole file without a header', () => expect(parseRange(null, 100)).toBeNull());
	it('parses open and closed ranges', () => {
		expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
		expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
		expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
	});
	it('parses suffix ranges', () => expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 }));
	it('rejects unsatisfiable or malformed ranges', () => {
		expect(parseRange('bytes=100-', 100)).toBe('invalid');
		expect(parseRange('bytes=5-2', 100)).toBe('invalid');
		expect(parseRange('bytes=-', 100)).toBe('invalid');
		expect(parseRange('items=0-1', 100)).toBe('invalid');
	});
});

describe('isSafeFileName', () => {
	it('allows plain names', () => expect(isSafeFileName('floorplan-tour.mp4')).toBe(true));
	it('blocks traversal, dirs, dotfiles and the manifest', () => {
		for (const n of ['../x.mp4', 'a/b.mp4', '.env', 'manifest.json', '', 'a..b']) expect(isSafeFileName(n)).toBe(false);
	});
	it('maps mime types', () => expect(mimeFor('x.MP4')).toBe('video/mp4'));
});
