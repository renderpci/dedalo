/**
 * THE DEVELOPMENT TCP LISTENER'S ADDRESS — where `SERVER_TCP_PORT` binds.
 *
 * WHY A HOST AT ALL (install campaign 3, C3-31). `Bun.serve({ port })` with no
 * `hostname` binds every address (`*:3600`), and a development install also
 * answers with full error details (`DEDALO_DEBUG_API_ERRORS`): on a machine
 * without a firewall the debug listener was open to the whole network while the
 * page said "localhost". The listener now binds `SERVER_TCP_HOST`, default
 * `127.0.0.1` (catalog/server.ts); another machine reaches it only when an
 * operator sets an address on purpose.
 *
 * Read here, in src/config, and handed to src/server.ts as plain options so the
 * gate can build them without starting a server.
 * Gate: test/unit/test_tooling_socket_native.test.ts.
 */

import { SERVER_KEYS } from './catalog/server.ts';
import { readEnv } from './env.ts';
import { readString } from './readers.ts';

/** The options the dev listener is started with, plus the line the boot log prints. */
export interface DevTcpListener {
	readonly hostname: string;
	readonly port: number;
	/** The address a browser on this machine opens. */
	readonly url: string;
	/** True when the bind reaches beyond this machine (the boot log says so). */
	readonly networkReachable: boolean;
}

const LOOPBACK: ReadonlySet<string> = new Set(['127.0.0.1', '::1', 'localhost']);
const WILDCARD: ReadonlySet<string> = new Set(['0.0.0.0', '::']);

/** The host a URL names: a wildcard or loopback bind is opened as localhost. */
function urlHost(hostname: string): string {
	if (LOOPBACK.has(hostname) || WILDCARD.has(hostname)) return 'localhost';
	return hostname.includes(':') ? `[${hostname}]` : hostname;
}

/**
 * The dev listener's options, or null when `SERVER_TCP_PORT` is unset (the
 * production topology: socket only). Values default to the configuration.
 */
export function devTcpListener(
	port: string | undefined = readEnv('SERVER_TCP_PORT'),
	host: string = readString('SERVER_TCP_HOST'),
): DevTcpListener | null {
	if (port === undefined || port.trim() === '') return null;
	// An empty value is the catalog's default, never "every address".
	const hostname = host.trim() === '' ? SERVER_KEYS.SERVER_TCP_HOST.default : host.trim();
	const portNumber = Number(port);
	return {
		hostname,
		port: portNumber,
		url: `http://${urlHost(hostname)}:${portNumber}/dedalo/core/page/`,
		networkReachable: !LOOPBACK.has(hostname),
	};
}
