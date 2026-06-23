import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { sendZplToPrinter, parsePrinterTarget } from '../../../tools/label-designer/printer';

describe('printer', () => {
	it('parses host:port', () => {
		expect(parsePrinterTarget('10.0.0.5:9100')).toEqual({ host: '10.0.0.5', port: 9100 });
		expect(parsePrinterTarget('zt230.local')).toEqual({ host: 'zt230.local', port: 9100 });
	});

	it('sends bytes to a TCP listener', async () => {
		const received: Buffer[] = [];
		const srv = createServer((sock) => sock.on('data', (d) => received.push(d)));
		await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
		const port = (srv.address() as any).port;
		await sendZplToPrinter('^XA^XZ', '127.0.0.1', port);
		await new Promise((r) => setTimeout(r, 50));
		srv.close();
		expect(Buffer.concat(received).toString()).toBe('^XA^XZ');
	});

	it('rejects when the host is unreachable', async () => {
		await expect(sendZplToPrinter('^XA^XZ', '127.0.0.1', 1, 300)).rejects.toThrow();
	});
});
