/**
 * THE DEVELOPMENT TCP LISTENER'S ADDRESS — where `SERVER_TCP_PORT` binds, and
 * whether it speaks HTTPS.
 *
 * WHY A HOST AT ALL (install campaign 3, C3-31). `Bun.serve({ port })` with no
 * `hostname` binds every address (`*:3600`), and a development install also
 * answers with full error details (`DEDALO_DEBUG_API_ERRORS`): on a machine
 * without a firewall the debug listener was open to the whole network while the
 * page said "localhost". The listener now binds `SERVER_TCP_HOST`, default
 * `127.0.0.1` (catalog/server.ts); another machine reaches it only when an
 * operator sets an address on purpose.
 *
 * WHY TLS HERE (TODO-055, design DEV_ROUTE_SERVE §1.2). The developer route
 * issues a certificate from a local authority so the dev listener is a secure
 * context like production (Secure cookies, service workers, clipboard on a LAN
 * address). `SERVER_TCP_TLS_CERT_FILE` + `SERVER_TCP_TLS_KEY_FILE` carry it,
 * BOTH OR NEITHER: a half pair, an unreadable file, a file that is not PEM of
 * the right kind or a key of another certificate is a typed refusal
 * (DevListenerTlsRefusal) the server turns into a boot refusal — never a silent
 * fall back to plain HTTP, which would hand the browser an `http://` origin the
 * Secure session cookie is dropped on.
 *
 * Read here, in src/config, and handed to src/server.ts as plain options so the
 * gate can build them without starting a server. `src/config/` may not import
 * `src/core/`, so the refusal is its own class, not a DedaloError: it never
 * reaches a wire — the server prints it and exits EX_CONFIG.
 * Gates: test/unit/test_tooling_socket_native.test.ts (address),
 * test/unit/dev_listener_tls_native.test.ts (TLS: real handshake, refusals).
 */

import { createPrivateKey, X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SERVER_KEYS } from './catalog/server.ts';
import { devListenerUrl, isLoopbackBind } from './dev_listener_address.ts';
import { readEnv } from './env.ts';
import { readString } from './readers.ts';

/** The certificate pair the dev listener presents (paths as configured). */
export interface DevListenerTlsFiles {
	readonly certFile: string;
	readonly keyFile: string;
}

/** The options the dev listener is started with, plus the line the boot log prints. */
export interface DevTcpListener {
	readonly hostname: string;
	readonly port: number;
	/** The address a browser on this machine opens (`https://` with TLS). */
	readonly url: string;
	/** True when the bind reaches beyond this machine (the boot log says so). */
	readonly networkReachable: boolean;
	/** The certificate pair, or null: plain HTTP. */
	readonly tls: DevListenerTlsFiles | null;
}

/** Why the dev listener's TLS configuration refuses the boot. */
export type DevListenerTlsReason =
	| 'half_pair'
	| 'unreadable'
	| 'not_a_certificate'
	| 'not_a_key'
	| 'key_mismatch';

/**
 * A dev-listener TLS configuration the server must not start with. `message`
 * is the operator's sentence (key + path named); `key`/`path` are for a caller
 * that wants to say more.
 */
export class DevListenerTlsRefusal extends Error {
	constructor(
		readonly reason: DevListenerTlsReason,
		readonly key: string,
		readonly path: string,
		message: string,
	) {
		super(message);
		this.name = 'DevListenerTlsRefusal';
	}
}

/**
 * The exit code of a refused dev-listener boot: EX_CONFIG (78), the code the
 * supervisors are told never to restart (install_state.ts NOT_INSTALLED_EXIT_CODE
 * is the same value for the same reason — a restart cannot fix a config file).
 */
export const DEV_LISTENER_REFUSED_EXIT_CODE = 78;

/** The command the expiry warning names (package.json `tls:renew`). */
export const DEV_TLS_RENEW_COMMAND = 'bun run tls:renew';

/** A certificate this close to its end warns at every boot (the design's 30 days). */
export const DEV_TLS_EXPIRY_WARNING_DAYS = 30;

const CERT_KEY = 'SERVER_TCP_TLS_CERT_FILE';
const KEY_KEY = 'SERVER_TCP_TLS_KEY_FILE';

/** A configured path, or undefined for unset / blank. */
function configuredPath(value: string | undefined): string | undefined {
	const trimmed = value?.trim() ?? '';
	return trimmed === '' ? undefined : trimmed;
}

/**
 * The TLS pair from the two keys: null when neither is set, the pair when both
 * are, a refusal for one without the other.
 */
export function devListenerTlsFiles(
	cert: string | undefined = readEnv('SERVER_TCP_TLS_CERT_FILE'),
	key: string | undefined = readEnv('SERVER_TCP_TLS_KEY_FILE'),
): DevListenerTlsFiles | null {
	const certFile = configuredPath(cert);
	const keyFile = configuredPath(key);
	if (certFile === undefined && keyFile === undefined) return null;
	if (certFile === undefined || keyFile === undefined) {
		const [set, missing, path] =
			certFile === undefined
				? [KEY_KEY, CERT_KEY, keyFile as string]
				: [CERT_KEY, KEY_KEY, certFile];
		throw new DevListenerTlsRefusal(
			'half_pair',
			missing,
			path,
			`${set} is set (${path}) but ${missing} is not: the development listener's certificate and key are set together or not at all. Set ${missing}, or remove ${set} to serve plain HTTP.`,
		);
	}
	return { certFile, keyFile };
}

/**
 * The dev listener's options, or null when `SERVER_TCP_PORT` is unset (the
 * production topology: socket only). Values default to the configuration.
 * Throws DevListenerTlsRefusal on a half TLS pair — only when a listener
 * exists: the pair is resolved AFTER the port check, so a stray TLS line on a
 * socket-only server (production, the updater's smoke boot) is inert, like
 * `SERVER_TCP_HOST`, instead of a no-restart refusal for a listener that never
 * opens. `tls` undefined = read the configuration; null = plain HTTP (pinned).
 */
export function devTcpListener(
	port: string | undefined = readEnv('SERVER_TCP_PORT'),
	host: string = readString('SERVER_TCP_HOST'),
	tlsFiles?: DevListenerTlsFiles | null,
): DevTcpListener | null {
	if (port === undefined || port.trim() === '') return null;
	const tls = tlsFiles === undefined ? devListenerTlsFiles() : tlsFiles;
	// An empty value is the catalog's default, never "every address".
	const hostname = host.trim() === '' ? SERVER_KEYS.SERVER_TCP_HOST.default : host.trim();
	const portNumber = Number(port);
	return {
		hostname,
		port: portNumber,
		url: devListenerUrl(hostname, portNumber, tls !== null),
		networkReachable: !isLoopbackBind(hostname),
		tls,
	};
}

/**
 * THE PLAIN-HTTP PIN for a harness that spawns its OWN server with its own
 * `SERVER_TCP_PORT` and talks `http://` to it (the client suite, the update
 * drill, the update probe). The spawned server's readEnv falls back to
 * `../private/.env`, where a developer-route install keeps its TLS pair: without
 * this pin that server would come up on HTTPS under a runner speaking plain
 * HTTP. An empty process value wins over the file and reads as unset
 * (configuredPath). Gate: test/unit/dev_listener_tls_native.test.ts.
 */
export const PLAIN_HTTP_DEV_LISTENER_ENV: Readonly<Record<string, string>> = Object.freeze({
	[CERT_KEY]: '',
	[KEY_KEY]: '',
});

/** The PEM material Bun.serve is given, plus when the certificate ends. */
export interface DevListenerTlsMaterial {
	readonly cert: string;
	readonly key: string;
	/** The leaf's notAfter. */
	readonly notAfter: Date;
}

/** Read one configured file, or refuse naming the key and the path. */
async function readConfigured(key: string, path: string): Promise<string> {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
		throw new DevListenerTlsRefusal(
			'unreadable',
			key,
			path,
			`${key} names a file this server cannot read (${path}: ${code}). Fix the path or its permissions for the account that runs the server, or remove both SERVER_TCP_TLS_* keys to serve plain HTTP.`,
		);
	}
}

/**
 * Read and check the pair BEFORE the listener binds: readable, a certificate,
 * a private key, and the key OF that certificate. Bun.serve would otherwise
 * fail later and less legibly (or, with lazily-read files, at the first
 * handshake). The leaf's notAfter feeds the expiry warning.
 */
export async function loadDevListenerTls(
	files: DevListenerTlsFiles,
): Promise<DevListenerTlsMaterial> {
	// Async although it runs once at boot: this module is on the served import
	// closure, where a synchronous read is a ledgered stall (sync_io_on_request_path).
	const cert = await readConfigured(CERT_KEY, files.certFile);
	const key = await readConfigured(KEY_KEY, files.keyFile);
	let leaf: X509Certificate;
	try {
		leaf = new X509Certificate(cert);
	} catch {
		throw new DevListenerTlsRefusal(
			'not_a_certificate',
			CERT_KEY,
			files.certFile,
			`${CERT_KEY} (${files.certFile}) is not a PEM certificate.`,
		);
	}
	let privateKey: ReturnType<typeof createPrivateKey>;
	try {
		privateKey = createPrivateKey(key);
	} catch {
		throw new DevListenerTlsRefusal(
			'not_a_key',
			KEY_KEY,
			files.keyFile,
			`${KEY_KEY} (${files.keyFile}) is not a PEM private key.`,
		);
	}
	if (!leaf.checkPrivateKey(privateKey)) {
		throw new DevListenerTlsRefusal(
			'key_mismatch',
			KEY_KEY,
			files.keyFile,
			`${KEY_KEY} (${files.keyFile}) is not the key of the certificate in ${CERT_KEY} (${files.certFile}): the two files are from different issues. Point both keys at the same issue.`,
		);
	}
	return { cert, key, notAfter: new Date(leaf.validTo) };
}

/**
 * The boot warning for a certificate near (or past) its end, else null. A
 * developer machine runs no renewal timer, so the boot log is where the
 * developer learns it — with the command that renews from the same authority
 * (nothing to re-trust).
 */
export function devListenerExpiryWarning(notAfter: Date, now: Date = new Date()): string | null {
	const msLeft = notAfter.getTime() - now.getTime();
	const daysLeft = Math.floor(msLeft / 86_400_000);
	if (daysLeft >= DEV_TLS_EXPIRY_WARNING_DAYS) return null;
	const when =
		msLeft <= 0
			? `EXPIRED on ${notAfter.toISOString().slice(0, 10)} — browsers refuse it`
			: `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${notAfter.toISOString().slice(0, 10)})`;
	return `[server] the dev listener's certificate ${when}. Renew it from the same local authority: ${DEV_TLS_RENEW_COMMAND}`;
}

/**
 * The network-reachability warning, worded for what the listener actually is:
 * a LAN-reachable listener always shows full error details, and says "no TLS"
 * only when that is true. null on loopback.
 */
export function devListenerNetworkWarning(listener: DevTcpListener): string | null {
	if (!listener.networkReachable) return null;
	const transport =
		listener.tls === null
			? 'with full error details and no TLS (plain HTTP: anyone on the path reads the traffic, passwords included)'
			: 'with full error details (over TLS)';
	return `[server] the dev listener is bound to ${listener.hostname} (SERVER_TCP_HOST): other machines can reach it, ${transport}. Use it only on a network you trust.`;
}
