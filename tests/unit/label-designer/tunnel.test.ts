import { describe, it, expect } from 'vitest';
import { buildTunnelArgs } from '../../../tools/label-designer/tunnel';

describe('buildTunnelArgs', () => {
	it('forwards localPort to remote 5432 by default', () => {
		expect(buildTunnelArgs('backoffice', 6432)).toEqual(['-fN', '-L', '6432:localhost:5432', 'backoffice']);
	});
	it('honors a custom remote port', () => {
		expect(buildTunnelArgs('hairydel', 6500, 5433)).toEqual(['-fN', '-L', '6500:localhost:5433', 'hairydel']);
	});
});
