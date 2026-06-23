import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { route } from './router';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'ui/index.html'), 'utf8');
const port = parseInt(process.env.LABEL_DESIGNER_PORT ?? '5599', 10);
// Default to loopback (safe). On a headless fleet box, set LABEL_DESIGNER_HOST
// to the overlay/LAN IP (e.g. 10.42.0.11) to reach it from another machine.
const host = process.env.LABEL_DESIGNER_HOST ?? '127.0.0.1';

async function main() {
	if (process.env.LABEL_DESIGNER_TUNNEL) {
		const { openTunnel } = await import('./tunnel');
		const localPort = parseInt(process.env.DATABASE_URL?.match(/:(\d+)\//)?.[1] ?? '6432', 10);
		await openTunnel(process.env.LABEL_DESIGNER_TUNNEL, localPort);
		console.log(`label-designer: ssh tunnel to ${process.env.LABEL_DESIGNER_TUNNEL} on localhost:${localPort}`);
	}

	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		if (req.method === 'GET' && url.pathname === '/') {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			return res.end(html);
		}
		let body: unknown = undefined;
		if (req.method === 'POST') {
			const chunks: Buffer[] = [];
			for await (const c of req) chunks.push(c as Buffer);
			try {
				body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
			} catch {
				body = {};
			}
		}
		const r = await route({ method: req.method ?? 'GET', path: url.pathname, body });
		if (r.svg !== undefined) {
			res.writeHead(r.status, { 'content-type': 'image/svg+xml' });
			return res.end(r.svg);
		}
		res.writeHead(r.status, { 'content-type': 'application/json' });
		res.end(JSON.stringify(r.json ?? {}));
	});

	server.listen(port, host, () => {
		console.log(`label-designer: http://${host}:${port}`);
	});
}

main().catch((e) => {
	console.error('label-designer failed to start:', e);
	process.exit(1);
});
