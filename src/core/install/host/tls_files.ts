/**
 * THE INSTITUTION'S OWN CERTIFICATE, CHECKED BEFORE USE (terminal installer
 * phase 4, 2026-10-12; owner decision round 2 #3): the fullchain must name
 * the address the site serves, must not be expired (a warning under 30 days),
 * and the key must be ITS key. Checked in TypeScript (node:crypto
 * X509Certificate) — never by running openssl on a path — and the files are
 * never copied or modified: the site file points at them where they are.
 *
 * PURE over the two texts and a clock.
 */

import { createPrivateKey, X509Certificate } from 'node:crypto';

export interface TlsFileVerdict {
	/** Blocking: the run refuses with these sentences. */
	problems: string[];
	warnings: string[];
	/** The leaf's expiry (ISO), when it parsed. */
	validTo: string | null;
}

const DAY_MS = 24 * 3600 * 1000;

/** The FIRST certificate of a PEM bundle (the leaf of a fullchain), or null. */
function leafOf(pem: string): X509Certificate | null {
	const block = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(pem)?.[0];
	if (block === undefined) return null;
	try {
		return new X509Certificate(block);
	} catch {
		return null;
	}
}

/** The private key, or null when the text is not one. */
function keyOf(pem: string): ReturnType<typeof createPrivateKey> | null {
	try {
		return createPrivateKey(pem);
	} catch {
		return null;
	}
}

/** Expiry problems/warnings of a parsed leaf. */
function expiryVerdict(leaf: X509Certificate, now: number, verdict: TlsFileVerdict): void {
	const expires = Date.parse(leaf.validTo);
	verdict.validTo = new Date(expires).toISOString();
	if (expires <= now) {
		verdict.problems.push(`the certificate expired on ${verdict.validTo}`);
	} else if (expires - now < 30 * DAY_MS) {
		verdict.warnings.push(`the certificate expires on ${verdict.validTo} (under 30 days)`);
	}
	if (Date.parse(leaf.validFrom) > now) {
		verdict.problems.push(`the certificate is not valid before ${leaf.validFrom}`);
	}
}

/** The parsed leaf and key, each refused in words when missing. */
function parsedPair(
	certPem: string | null,
	keyPem: string | null,
	verdict: TlsFileVerdict,
): { leaf: X509Certificate | null; key: ReturnType<typeof createPrivateKey> | null } {
	const leaf = leafOf(certPem ?? '');
	const key = keyOf(keyPem ?? '');
	if (leaf === null) {
		verdict.problems.push('the certificate file is missing or holds no PEM certificate');
	}
	if (key === null) verdict.problems.push('the key file is missing or is not a private key');
	return { leaf, key };
}

/** The address and the key pairing of a parsed leaf. */
function nameAndKeyVerdict(
	leaf: X509Certificate,
	key: ReturnType<typeof createPrivateKey> | null,
	serverName: string,
	verdict: TlsFileVerdict,
): void {
	if (leaf.checkHost(serverName) === undefined) {
		verdict.problems.push(
			`the certificate does not name ${serverName} (subject ${leaf.subject.replace(/\n/g, ', ')})`,
		);
	}
	if (key !== null && !leaf.checkPrivateKey(key)) {
		verdict.problems.push('the key does not belong to the certificate');
	}
}

/**
 * The verdict on a fullchain + key for `serverName` at `now` (ms). Never
 * throws: an unreadable text is a problem sentence (never the parser's raw
 * text — it can quote key material).
 */
export function checkCertificateFiles(
	certPem: string | null,
	keyPem: string | null,
	serverName: string,
	now: number,
): TlsFileVerdict {
	const verdict: TlsFileVerdict = { problems: [], warnings: [], validTo: null };
	const { leaf, key } = parsedPair(certPem, keyPem, verdict);
	if (leaf === null) return verdict;
	nameAndKeyVerdict(leaf, key, serverName, verdict);
	expiryVerdict(leaf, now, verdict);
	return verdict;
}
