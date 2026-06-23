import { Socket } from 'node:net';

export function parsePrinterTarget(s: string): { host: string; port: number } {
	const [host, port] = s.trim().split(':');
	return { host, port: port ? parseInt(port, 10) : 9100 };
}

/** Send raw ZPL to a Zebra over TCP 9100. Resolves on close, rejects on
 *  connect/timeout error with a host:port-tagged message. */
export function sendZplToPrinter(zpl: string, host: string, port = 9100, timeoutMs = 4000): Promise<void> {
	return new Promise((resolve, reject) => {
		const sock = new Socket();
		let settled = false;
		const fail = (e: Error) => {
			if (settled) return;
			settled = true;
			sock.destroy();
			reject(e);
		};
		sock.setTimeout(timeoutMs, () => fail(new Error(`Printer ${host}:${port} timed out`)));
		sock.on('error', (e) => fail(new Error(`Printer ${host}:${port}: ${e.message}`)));
		sock.connect(port, host, () => {
			sock.write(zpl, () => sock.end());
		});
		sock.on('close', () => {
			if (settled) return;
			settled = true;
			resolve();
		});
	});
}
