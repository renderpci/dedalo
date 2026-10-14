/**
 * DOES THIS MACHINE TRUST THE INSTITUTION'S CERTIFICATE CHAIN? (campaign 3
 * C3-13, 2026-10-13) — the installer's last step probes the site with this
 * machine's curl, which verifies the chain against the SYSTEM trust store. A
 * certificate from an internal CA the host does not trust failed that probe
 * after about 90 seconds, as "expected 200, got 000", indistinguishable from a
 * broken proxy. This check refuses it at the System check instead, naming the
 * issuer and how to make the host trust it.
 *
 * Pure TypeScript over the PEM texts (node:crypto X509Certificate, the
 * tls_files.ts rule — never openssl on a path), the anchors read from the
 * distribution's CA bundle — the file curl and OpenSSL read, NOT the runtime's
 * bundled store (`tls.rootCertificates` is Mozilla's list, and a CA the
 * operator added with update-ca-certificates / update-ca-trust is not in it).
 * The walk: from the leaf, through the chain's own certificates, until a
 * certificate is one of the anchors or is issued (and signed) by one.
 *
 * PURE.
 */

import { X509Certificate } from 'node:crypto';

/** The system CA bundles, by family (Debian/Ubuntu, the RHEL family, macOS/Alpine). */
export const SYSTEM_CA_BUNDLES: readonly string[] = Object.freeze([
	'/etc/ssl/certs/ca-certificates.crt',
	'/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
	'/etc/ssl/cert.pem',
]);

/** Every certificate of a PEM text (unparsable blocks skipped). */
export function pemCertificates(pem: string): X509Certificate[] {
	const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
	return blocks.flatMap((block) => {
		try {
			return [new X509Certificate(block)];
		} catch {
			return [];
		}
	});
}

/** Did `issuer` issue AND sign `cert`? */
function issuedBy(cert: X509Certificate, issuer: X509Certificate): boolean {
	return cert.checkIssued(issuer) && cert.verify(issuer.publicKey);
}

/** Is `cert` an anchor, or issued by one? */
function anchored(cert: X509Certificate, anchors: readonly X509Certificate[]): boolean {
	return anchors.some(
		(anchor) => anchor.fingerprint256 === cert.fingerprint256 || issuedBy(cert, anchor),
	);
}

/** The chain certificate (other than `cert`) that issued `cert`, or null. */
function chainIssuer(
	cert: X509Certificate,
	chain: readonly X509Certificate[],
): X509Certificate | null {
	return chain.find((other) => other !== cert && issuedBy(cert, other)) ?? null;
}

/** An X.509 name on one line (`CN=Museo CA, O=Museo`). */
function oneLine(name: string): string {
	return name.split('\n').filter(Boolean).join(', ');
}

/**
 * Where the chain stops: null when an anchor vouches for it, else the issuer
 * name of the last certificate the walk reached (a self-signed root: its own).
 */
export function untrustedIssuer(
	chain: readonly X509Certificate[],
	anchors: readonly X509Certificate[],
): string | null {
	let current = chain[0];
	for (let hops = 0; current !== undefined && hops <= chain.length; hops++) {
		if (anchored(current, anchors)) return null;
		const next = chainIssuer(current, chain);
		if (next === null) return oneLine(current.issuer);
		current = next;
	}
	return current === undefined ? 'no certificate' : oneLine(current.issuer);
}

/** How to make this machine trust a CA, per family. */
export const TRUST_CA_HOWTO =
	'install that CA on this machine (Debian/Ubuntu: copy it to /usr/local/share/ca-certificates/<name>.crt, then sudo update-ca-certificates; RHEL family: copy it to /etc/pki/ca-trust/source/anchors/, then sudo update-ca-trust), then run this again';

/**
 * The verdict on a fullchain against the bundles' texts: a problem sentence,
 * a warning (no bundle to check against), or nothing.
 */
export function chainTrustVerdict(
	fullchainPem: string | null,
	bundleTexts: readonly (string | null)[],
): { problem: string | null; warning: string | null } {
	const bundles = bundleTexts.filter((text): text is string => text !== null);
	if (bundles.length === 0) {
		return {
			problem: null,
			warning: `no system CA bundle found (${SYSTEM_CA_BUNDLES.join(', ')}) — the certificate chain was not checked against this machine's trust store`,
		};
	}
	const chain = pemCertificates(fullchainPem ?? '');
	if (chain.length === 0) return { problem: null, warning: null };
	const issuer = untrustedIssuer(chain, bundles.flatMap(pemCertificates));
	return issuer === null
		? { problem: null, warning: null }
		: {
				problem: `its chain ends at ${issuer}, which this machine does not trust — the install's last check (and any browser without that CA) would fail: ${TRUST_CA_HOWTO}`,
				warning: null,
			};
}
