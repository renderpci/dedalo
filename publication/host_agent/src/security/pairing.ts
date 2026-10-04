/**
 * THE PAIRING FINGERPRINT — the one thing this agent says about itself to a caller that has
 * not proved anything yet, and the whole of what `GET /health` discloses about WHO it is
 * (field `instance_fingerprint`). The instance NAME is never published.
 *
 *     sha256('dedalo-publication-host:' + <INSTANCE> + '\n' + <SERVICE_TOKEN>)
 *
 * An engine that recomputes it and gets the same hex knows it reached the agent of the
 * instance it is paired with AND that both hold the same bearer — while the hash names
 * neither. A wrong instance, an unknown instance and a wrong token all produce the same
 * kind of non-matching hex, so /health is not an enumeration oracle for either half.
 *
 * COPIED FROM publication/site_builder/src/security/pairing.ts (2026-10-03). One change:
 * the prefix is `dedalo-publication-host:`, not `dedalo-site-instance:` — domain
 * separation, so a site-builder proof is never a publication-host proof (plan D3).
 *
 * IMPORT-FREE ON PURPOSE. The engine spells the same recipe in
 * src/core/publication_host/pairing.ts; the root gate
 * test/unit/publication_host_pairing_tripwire.test.ts imports BOTH and compares their
 * output, which is only possible while this file pulls in no config, no zod, no package.
 */

export const PAIRING_FINGERPRINT_PREFIX = 'dedalo-publication-host:';

export function instanceFingerprint(instance: string, token: string): string {
  return new Bun.CryptoHasher('sha256')
    .update(`${PAIRING_FINGERPRINT_PREFIX}${instance}\n${token}`)
    .digest('hex');
}
