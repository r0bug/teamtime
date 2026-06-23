import { spawn } from 'node:child_process';

/** ssh args to forward `localPort` on this box to `remotePort` on `sshHost`. */
export function buildTunnelArgs(sshHost: string, localPort: number, remotePort = 5432): string[] {
	return ['-fN', '-L', `${localPort}:localhost:${remotePort}`, sshHost];
}

/** Open an SSH tunnel for reaching a localhost-bound remote Postgres. Returns a
 *  closer. Relies on existing passwordless SSH (e.g. robug -> backoffice). */
export async function openTunnel(sshHost: string, localPort: number): Promise<() => void> {
	const child = spawn('ssh', buildTunnelArgs(sshHost, localPort), { stdio: 'ignore' });
	await new Promise((r) => setTimeout(r, 800));
	return () => {
		try {
			child.kill();
		} catch {
			/* ignore */
		}
	};
}
