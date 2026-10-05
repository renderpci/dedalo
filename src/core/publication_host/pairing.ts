/**
 * THE PUBLICATION-HOST PAIRING RECIPE — engine side.
 *
 * The work engine controls a publication agent on another host (or a local socket) and must
 * PROVE it is talking to the agent it is paired with before it sends a bearer, an actor or a
 * release (engineering/PUBLICATION_HOST_SPEC.md §2 rule 3). The agent publishes, on its one
 * unauthenticated route (`GET /health`, field `instance_fingerprint`),
 *
 *     sha256('dedalo-publication-host:' + <instance> + '\n' + <shared token>)
 *
 * and the engine recomputes it from its own configuration. Equal hex proves BOTH halves —
 * identity and credential — while disclosing neither: a wrong instance, an unknown instance
 * and a wrong token all give one indistinguishable mismatch.
 *
 * DOMAIN SEPARATION. The prefix is NOT the site builder's `dedalo-site-instance:`
 * (src/core/site_builder/pairing.ts): one proof must never be valid for the other protocol,
 * even for an operator who reused an instance name and a token across both.
 *
 * THE RECIPE IS SPELLED TWICE — here and in `publication/host_agent/src/security/pairing.ts`
 * — because the two are separate deployables sharing no module. Both import NOTHING, so
 * `test/unit/publication_host_pairing_tripwire.test.ts` RUNS both side by side and refuses
 * a third spelling anywhere in the tree. Every other consumer (the phase-3 client, drills)
 * imports this module.
 */

export const PUBLICATION_HOST_FINGERPRINT_PREFIX = 'dedalo-publication-host:';

/** The only shape a fingerprint has: 64 lowercase hex. */
const FINGERPRINT_SHAPE = /^[0-9a-f]{64}$/;

function isFingerprint(value: unknown): value is string {
	return typeof value === 'string' && FINGERPRINT_SHAPE.test(value);
}

export function publicationHostFingerprint(instance: string, token: string): string {
	return new Bun.CryptoHasher('sha256')
		.update(`${PUBLICATION_HOST_FINGERPRINT_PREFIX}${instance}\n${token}`)
		.digest('hex');
}

/**
 * True only when `published` is exactly `expected`, both 64 lowercase hex. Anything else —
 * an absent field, a non-string, upper case, a wrong length — is a MISMATCH, never a pass:
 * "publish nothing and be trusted" is a downgrade any wrong agent could take.
 *
 * Constant time over the 64 characters (an XOR accumulator, no early exit), so the compare
 * leaks nothing about how much of a guess was right. Import-free by design: no
 * `node:crypto` `timingSafeEqual`, because this file must load anywhere the agent's copy does.
 */
export function publicationHostFingerprintMatches(expected: string, published: unknown): boolean {
	if (!isFingerprint(expected) || !isFingerprint(published)) return false;
	let diff = 0;
	for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ published.charCodeAt(i);
	return diff === 0;
}
