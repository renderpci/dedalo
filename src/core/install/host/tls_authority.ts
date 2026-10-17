/**
 * AN INSTALL OVER A LOCAL CA THAT IS ALREADY THERE (2026-10-16) — both routes'
 * issue of the local certificate authority (production host_tls, docker
 * stack_tls) is SKIPPED when the authority and the site certificate already
 * exist in the certificate directory: a re-run never rotates an authority
 * every staff computer trusts. So before that skip, the authority is compared
 * with the answers, ONE rule for both routes (their preflights refuse with
 * the same sentence, before anything is built; the TLS steps again, for a
 * resume days later):
 *
 *  - made for OTHER addresses (its `dedalo-local-ca.names`, written by
 *    deploy/dedalo-tls-rotate.sh, differs from server_name + tls_extra_names):
 *    REFUSED — the authority is name-constrained, it cannot certify the new
 *    list, and the skipped issue would leave a certificate the browsers reject
 *    for every new address;
 *  - with NO names list (made before 2026-10-16: single-tier, UNCONSTRAINED):
 *      native — REFUSED: never adopted silently (an unconstrained key every
 *        workstation trusts is the OPS-01 harm class), and its renewal timer
 *        (`--mode renew` with no --host) would fail every day for want of names;
 *      docker — kept working, as the generator's own contract promises
 *        (engineering/PRODUCTION.md §13.2), but ONLY while its site certificate
 *        names every answered address (read from the certificate, not
 *        assumed); otherwise refused the same way.
 *
 * Each refusal names the rotation command (a new authority for exactly the
 * answered addresses; every staff computer then trusts it) or the other way
 * out. PURE over the given fs.
 */

import { X509Certificate } from 'node:crypto';
import type { HostFs } from './fs.ts';

/** Where an install's local CA lives and how it is rotated there. */
export interface AuthoritySite {
	/** The certificate directory (production: /opt/dedalo/instances/<i>/tls; docker: <checkout>/deploy/certs). */
	readonly dir: string;
	/** Which route's rule applies to an authority with no names list. */
	readonly route: 'native' | 'docker';
	/** The rotate command for the answered addresses (told in the refusal). */
	readonly rotate: string;
}

/** The authority staff computers trust (the generator's name for it). */
export function authorityFile(dir: string): string {
	return `${dir}/dedalo-local-ca.pem`;
}

/** The addresses the generator records the authority was constrained to. */
export function authorityNamesFile(dir: string): string {
	return `${dir}/dedalo-local-ca.names`;
}

/** The SAN entries of the site certificate (its first PEM block), lower-cased; null when unreadable. */
function leafNames(pem: string | null): string[] | null {
	if (pem === null) return null;
	try {
		const san = new X509Certificate(pem).subjectAltName ?? '';
		return san
			.split(',')
			.map((entry) =>
				entry
					.trim()
					.replace(/^(DNS|IP Address):/, '')
					.toLowerCase(),
			)
			.filter((entry) => entry !== '');
	} catch {
		return null;
	}
}

/** A pre-names-list authority: native refuses it; docker keeps it while its certificate covers the answers. */
function legacyConflict(
	fs: Pick<HostFs, 'readText'>,
	site: AuthoritySite,
	wanted: readonly string[],
): string | null {
	const fullchain = `${site.dir}/fullchain.pem`;
	if (site.route === 'native') {
		return `${site.dir} already holds a local certificate authority made before 2026-10-16 — UNCONSTRAINED (its key could sign a certificate for any site, on every computer that trusts it) and without the names list its renewal needs; it is never adopted silently. Rotate it (${site.rotate}; every staff computer then trusts the new one and deletes the old), or remove the directory, then --resume`;
	}
	const named = leafNames(fs.readText(fullchain));
	const missing = named === null ? [...wanted] : wanted.filter((name) => !named.includes(name));
	if (missing.length === 0) return null;
	return `${site.dir} already holds a local certificate authority (made before 2026-10-16) whose certificate ${fullchain} does not name ${missing.join(', ')} — the install would skip the issue and browsers would reject those addresses. Rotate it (${site.rotate}; every staff computer then trusts the new one), or answer the addresses it names, then run this again`;
}

/** The refusal of an authority already in `site.dir` that cannot serve `wanted`, or null. */
export function authorityConflict(
	fs: Pick<HostFs, 'readText' | 'exists'>,
	site: AuthoritySite,
	wanted: readonly string[],
): string | null {
	if (!fs.exists(authorityFile(site.dir))) return null;
	const text = fs.readText(authorityNamesFile(site.dir));
	if (text === null) return legacyConflict(fs, site, wanted);
	const recorded = text
		.split('\n')
		.map((line) => line.trim().toLowerCase())
		.filter((line) => line !== '');
	const same = recorded.length === wanted.length && wanted.every((name) => recorded.includes(name));
	if (same) return null;
	return `${site.dir} already holds a local certificate authority for ${recorded.join(', ')} — not for ${wanted.join(', ')}; it cannot certify other addresses. Rotate it (${site.rotate}; every staff computer then trusts the new one), or answer its addresses, then ${site.route === 'native' ? '--resume' : 'run this again'}`;
}
