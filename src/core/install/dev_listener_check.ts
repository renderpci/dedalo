/**
 * IS THE DEVELOPMENT PORT FREE? — the machine half of the developer listener
 * (design DEV_ROUTE_SERVE §1.1, owner answer D3: port 3500; when it is in use
 * the operator MUST choose another — the next free one is suggested, never
 * chosen silently).
 *
 * WHY HERE AND NOT IN THE PLAN. The plan is pure (answers in, configuration
 * out); whether a port is bound is a fact of THIS machine at THIS moment. So
 * the question is asked where the run asks what it would refuse: the
 * interactive Review (install_session.ts `preflightRefusals`, wired by
 * scripts/install.ts — `install` is not offered while it refuses, and is
 * asked again at the typed yes) and the engine executor's fresh preflight
 * (executor.ts, before anything is written) — ONE function, so a headless run
 * and the screens refuse with the same sentence.
 *
 * HOW. A port is IN USE when a listen on the configured address fails with
 * EADDRINUSE, or when something already ACCEPTS a connection there (a server
 * bound to 127.0.0.1 does not always stop a probe binding 0.0.0.0, and the
 * reverse — the connect closes that gap). Any other listen failure (EACCES on a
 * port below 1024, EADDRNOTAVAIL for an address this machine does not have) is
 * a refusal of its own, named by its code. The probe listener is closed before
 * the answer: nothing stays bound.
 *
 * Gate: test/unit/install_dev_route_listener_native.test.ts.
 */

import { connect, createServer } from 'node:net';
import type { DevCertificatePlan } from './dev_certificate.ts';
import type { DevListenerPlan } from './dev_listener.ts';
import { devAuthorityRefusal } from './dev_tls.ts';

/** A port's state on an address: free, held, or a listen failure's code. */
export type PortState =
	| { readonly kind: 'free' }
	| { readonly kind: 'in_use' }
	| { readonly kind: 'refused'; readonly code: string };

/** How far past a taken port the suggestion looks. */
const SUGGESTION_SPAN = 50;

/** The address a client connects to for a bind on `host` (a wildcard is reached on loopback). */
function connectAddress(host: string): string {
	if (host === '0.0.0.0') return '127.0.0.1';
	if (host === '::') return '::1';
	return host;
}

/** Does a listen on host:port succeed? (EADDRINUSE → in_use, any other code → refused.) */
function tryListen(host: string, port: number): Promise<PortState> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once('error', (error: NodeJS.ErrnoException) => {
			const code = error.code ?? 'unknown error';
			resolve(code === 'EADDRINUSE' ? { kind: 'in_use' } : { kind: 'refused', code });
		});
		try {
			server.listen({ host, port, exclusive: true }, () => {
				server.close(() => resolve({ kind: 'free' }));
			});
		} catch (error) {
			// A synchronous argument refusal (a bad port/host) is a named state too,
			// never an exception escaping the preflight.
			resolve({
				kind: 'refused',
				code: (error as NodeJS.ErrnoException).code ?? 'invalid address',
			});
		}
	});
}

/** Does something accept a connection on host:port right now? */
function accepts(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host: connectAddress(host), port });
		const done = (answer: boolean) => {
			socket.destroy();
			resolve(answer);
		};
		socket.setTimeout(timeoutMs, () => done(false));
		socket.once('connect', () => done(true));
		socket.once('error', () => done(false));
	});
}

/** The state of `port` on `host` (see the header). */
export async function probeListenPort(host: string, port: number): Promise<PortState> {
	const listened = await tryListen(host, port);
	if (listened.kind !== 'free') return listened;
	return (await accepts(host, port)) ? { kind: 'in_use' } : listened;
}

/** The first free port after `port` on `host` (within SUGGESTION_SPAN), or null. */
export async function nextFreePort(
	host: string,
	port: number,
	probe: typeof probeListenPort = probeListenPort,
): Promise<number | null> {
	for (
		let candidate = port + 1;
		candidate <= Math.min(port + SUGGESTION_SPAN, 65535);
		candidate++
	) {
		if ((await probe(host, candidate)).kind === 'free') return candidate;
	}
	return null;
}

/** The refusal when the port is held: named, with the next free one suggested (D3). */
export function devPortInUseRefusal(port: string, host: string, next: number | null): string {
	return `port ${port} (SERVER_TCP_PORT) is already in use on ${host} — another program (a running \`bun run dev\`?) holds it: stop it, or choose another port on the Development server step (--dev-port)${next === null ? '' : `; ${next} is free`}`;
}

/** A TCP port: digits only, 1-65535 (install_validation.ts portError's rule). */
function isTcpPort(value: string): boolean {
	const port = Number(value);
	return /^\d+$/.test(value) && port >= 1 && port <= 65535;
}

/** The refusal when the port is no TCP port at all (never probed). */
export function devPortInvalidRefusal(port: string): string {
	return `the development port '${port}' (SERVER_TCP_PORT) must be an integer 1-65535 — choose another port on the Development server step (--dev-port)`;
}

/** The refusal when the address cannot be bound at all (a privileged port, an address this machine lacks). */
export function devPortBindRefusal(port: string, host: string, code: string): string {
	return `the development listener cannot bind ${host}:${port} (${code}) — choose another port (above 1023) or address on the Development server step (--dev-port / --dev-host)`;
}

/**
 * What the run refuses about the developer listener RIGHT NOW: [] when the
 * plan opens none (every other route) or its port is free on its address —
 * and, under the local CA, an authority already in its directory that was made
 * for other names (dev_tls.ts devAuthorityRefusal: refused before anything is
 * written, never rotated behind the operator's back).
 */
export async function devListenerRefusals(
	listener: Pick<DevListenerPlan, 'host' | 'port'> | null,
	certificate: Pick<DevCertificatePlan, 'dir' | 'names'> | null = null,
	probe: typeof probeListenPort = probeListenPort,
): Promise<string[]> {
	if (listener === null) return [];
	const authority =
		certificate === null ? null : devAuthorityRefusal(certificate.dir, certificate.names);
	const port = await devPortRefusals(listener, probe);
	return authority === null ? port : [...port, authority];
}

/** The port half of devListenerRefusals. */
async function devPortRefusals(
	listener: Pick<DevListenerPlan, 'host' | 'port'>,
	probe: typeof probeListenPort,
): Promise<string[]> {
	// The plan refuses a malformed kept port first (install_validation.ts
	// keptDevListenerProblems); this guard keeps a direct caller from handing
	// the bind NaN, which throws an untyped ERR_SOCKET_BAD_PORT instead of a sentence.
	if (!isTcpPort(listener.port)) return [devPortInvalidRefusal(listener.port)];
	const port = Number(listener.port);
	const state = await probe(listener.host, port);
	if (state.kind === 'free') return [];
	if (state.kind === 'refused')
		return [devPortBindRefusal(listener.port, listener.host, state.code)];
	return [
		devPortInUseRefusal(
			listener.port,
			listener.host,
			await nextFreePort(listener.host, port, probe),
		),
	];
}
