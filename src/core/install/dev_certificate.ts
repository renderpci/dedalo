/**
 * THE DEVELOPER CERTIFICATE, AS THE PLAN DECIDES IT (TODO-055; design
 * DEV_ROUTE_SERVE §1.2) — which names the developer listener's local authority
 * is made for, and which binds it cannot serve. The PLAN half only: pure over
 * the listener plus one injectable machine fact (this machine's IPv4 network
 * addresses). It sits on the plan's import closure (install_plan.ts), so it
 * imports nothing that runs anything; the issue, renewal and trust live in
 * dev_tls.ts / dev_trust.ts, imported lazily by the step runs.
 *
 * THE NAMES. `localhost` (the subject: every loopback bind is opened by that
 * name — dev_listener_address.ts devListenerUrl) and `127.0.0.1`, plus, when
 * the listener is opened to the network (§1.1): the one IPv4 address it binds,
 * or — bound to every address (0.0.0.0 / ::) — this machine's own IPv4 network
 * addresses at the moment of the plan (link-local 169.254/16 left out: never
 * the address another machine types).
 *
 * IPV6, RESOLVED HONESTLY (the design listed `::1`; it is NOT in the list):
 *  - the ONE generator (deploy/dedalo-tls-rotate.sh) REFUSES IPv6 deliberately
 *    — the authority's IP constraint is written per address family, and its
 *    gate asserts an IPv6 leaf is rejected (tls_local_ca_native A): supporting
 *    it is a change to the shared generator and both production routes, not a
 *    developer-route tweak;
 *  - `::1` is never NEEDED: a loopback bind (127.0.0.1, ::1, localhost) is
 *    opened as https://localhost:<port>/, and the leaf names `localhost`
 *    whichever family the browser connects over — an IP SAN only matters for a
 *    URL that types the address;
 *  - so the plan REFUSES the one case that would need it — a specific
 *    non-loopback IPv6 bind under the local CA (its URL types the address, and
 *    no certificate this authority issues can name it) — and NOTES the other:
 *    a `::` bind certifies the IPv4 addresses only.
 *
 * Gate: test/unit/install_dev_tls_native.test.ts.
 */

import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { DEV_TLS_CERT_NAME, DEV_TLS_KEY_NAME, type DevListenerPlan } from './dev_listener.ts';

/** The authority a browser trusts (deploy/dedalo-tls-rotate.sh CA_CRT). */
export const DEV_CA_NAME = 'dedalo-local-ca.pem';
/** The names every developer certificate carries, the subject first. */
export const DEV_LOOPBACK_NAMES: readonly string[] = Object.freeze(['localhost', '127.0.0.1']);
/** The developer certificate a plan issues (or renews): where, for which names. */
export interface DevCertificatePlan {
	/** `<private>/tls`: the generator's --dir. */
	readonly dir: string;
	/** The authority a browser trusts (dedalo-local-ca.pem). */
	readonly caFile: string;
	/** The names the authority and the leaf are made for, in --host order. */
	readonly names: readonly string[];
	/** What the operator should know (an IPv6 address left out, no network address found). */
	readonly notes: readonly string[];
	/** Refusals of the answers (an IPv6 address the local CA cannot certify), tagged dev_host. */
	readonly errors: readonly { readonly key: 'dev_host'; readonly message: string }[];
}

/** A wildcard bind: every address of the machine. */
function isWildcard(host: string): boolean {
	return host === '0.0.0.0' || host === '::';
}

/** A loopback bind (opened by the name localhost). */
function isLoopback(host: string): boolean {
	return host === 'localhost' || host === '::1' || host === '127.0.0.1';
}

/**
 * This machine's IPv4 network addresses (not loopback, not link-local), sorted:
 * what another machine on the LAN types. `interfaces` is injectable for gates.
 */
export function machineIpv4Addresses(
	interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string[] {
	const addresses = Object.values(interfaces)
		.flatMap((list) => list ?? [])
		.filter((item) => item.family === 'IPv4' && !item.internal)
		.map((item) => item.address)
		.filter((address) => !address.startsWith('169.254.'));
	return [...new Set(addresses)].sort();
}

/** Does `listener` present the generator's pair in `dir` (local_ca, or a kept pair there)? */
export function usesDevLocalCa(
	listener: Pick<DevListenerPlan, 'tls'> | null,
	dir: string,
): boolean {
	const tls = listener?.tls ?? null;
	return (
		tls !== null &&
		tls.certFile === join(dir, DEV_TLS_CERT_NAME) &&
		tls.keyFile === join(dir, DEV_TLS_KEY_NAME)
	);
}

/**
 * The names a listener bound to `host` needs certified (see the header), with
 * the notes and refusals the address family forces. `lan` = this machine's
 * IPv4 network addresses (read only for a wildcard bind).
 */
export function devCertificateNames(
	host: string,
	lan: () => readonly string[] = machineIpv4Addresses,
): Pick<DevCertificatePlan, 'names' | 'notes' | 'errors'> {
	if (isWildcard(host)) return wildcardNames(host, lan());
	if (isLoopback(host)) return { names: [...DEV_LOOPBACK_NAMES], notes: [], errors: [] };
	if (isIP(host) === 6) {
		return {
			names: [...DEV_LOOPBACK_NAMES],
			notes: [],
			errors: [
				{
					key: 'dev_host',
					message: `dev_host '${host}' is an IPv6 address: the local CA cannot certify it (its authority constrains IPv4 only — deploy/dedalo-tls-rotate.sh), and the address is what the browser would type — bind 127.0.0.1, 0.0.0.0 or an IPv4 address, or choose tls_mode files / none`,
				},
			],
		};
	}
	return { names: withNames(DEV_LOOPBACK_NAMES, [host]), notes: [], errors: [] };
}

/** `base` then each of `extra` not already in it, in order. */
function withNames(base: readonly string[], extra: readonly string[]): string[] {
	return [...new Set([...base, ...extra])];
}

/** A wildcard bind (0.0.0.0 / ::): this machine's IPv4 network addresses, and what that leaves out. */
function wildcardNames(
	host: string,
	addresses: readonly string[],
): Pick<DevCertificatePlan, 'names' | 'notes' | 'errors'> {
	const notes = [
		addresses.length === 0
			? `the development certificate names localhost and 127.0.0.1 only: this machine has no IPv4 network address now — other machines would be refused; bind one address (--dev-host) once it has one`
			: `the development certificate also names ${addresses.join(', ')} (this machine's IPv4 network addresses now); an address it gets later needs a new authority`,
	];
	if (host === '::') {
		notes.push(
			'IPv6 addresses are not certified: the local CA constrains IPv4 only (deploy/dedalo-tls-rotate.sh) — other machines open it by an IPv4 address',
		);
	}
	return { names: withNames(DEV_LOOPBACK_NAMES, addresses), notes, errors: [] };
}

/**
 * The developer certificate of a plan's listener, or null when it presents no
 * generator pair (another route, `none`, `files`, a kept pair elsewhere).
 */
export function devCertificatePlan(
	listener: Pick<DevListenerPlan, 'tls' | 'host'> | null,
	dir: string,
	lan: () => readonly string[] = machineIpv4Addresses,
): DevCertificatePlan | null {
	if (listener === null || !usesDevLocalCa(listener, dir)) return null;
	return { dir, caFile: join(dir, DEV_CA_NAME), ...devCertificateNames(listener.host, lan) };
}

/**
 * What the Review says the trust step will do on `platform` — the elevation
 * the operator will be asked for, stated BEFORE it is asked (§1.2).
 */
export function devTrustReviewText(platform: NodeJS.Platform, euid: number | null): string {
	if (platform === 'darwin') {
		return 'trusted in your login keychain — macOS asks your password in a system dialog (cancel = not trusted yet; the install goes on)';
	}
	if (platform === 'linux') {
		return euid === 0
			? 'trusted in the system store (update-ca-certificates / update-ca-trust, as root)'
			: 'trusted in the system store — sudo asks your password for that one command (copy + update-ca-certificates / update-ca-trust); cancel = not trusted yet, the install goes on';
	}
	return `not trusted automatically on ${platform} — the installer prints the manual step`;
}
