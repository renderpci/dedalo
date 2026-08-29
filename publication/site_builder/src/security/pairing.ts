/**
 * THE PAIRING FINGERPRINT — the one thing this daemon says about itself to a caller that
 * has not proved anything yet, and the whole of what /health discloses about WHO it is.
 *
 * THE FAILURE IT EXISTS FOR. The topology is 1:1 and fixed: one museum, one engine, one
 * site builder. Nothing about that arrangement is self-verifying — the engine's half of it
 * is three lines in a private env file, and an env file is the single most copy-pasted
 * artifact an operator owns. A `../private/.env` carried from museum A to museum B, or a
 * socket path corrected while the token line was left alone, points A's engine at B's
 * daemon. Before this, that was UNDETECTABLE by either side: the token would either work
 * (same fleet, shared token) or fail as a flat 401 that names nothing, and a working
 * mis-pairing means A's curators driving an agent inside B's workspace, spending B's
 * provider budget, publishing onto B's public domain. That is the exact disaster the
 * instance model was built to make impossible, so the pairing must be PROVED rather than
 * assumed.
 *
 * WHAT THE FINGERPRINT PROVES, AND WHAT IT REFUSES TO SAY. It is
 *
 *     sha256("dedalo-site-instance:" + <instance> + "\n" + <SERVICE_TOKEN>)
 *
 * so an engine that recomputes it and gets the same hex knows BOTH that it is talking to
 * the daemon of the instance it thinks it is paired with AND that the two of them hold the
 * same shared bearer — while the hash itself names neither. A caller who cannot already
 * compute it learns exactly one bit ("your guess was wrong"), and cannot even tell WHICH
 * guess was wrong: a wrong instance name, an instance that does not exist on this host and
 * a wrong token all produce the same non-matching hex, so /health is not an enumeration
 * oracle for either half.
 *
 * WHY IT MAY SIT ON THE PUBLIC ROUTE. /health is the one route reachable without the
 * bearer (the engine's ops panel and any watchdog need it), so this value is world-readable
 * to anything that can reach the socket — which, on a provisioned host, is the engine's
 * uid and root, because the socket is 0660 <user>:<engineGroup>. Even so it is a
 * pre-image problem over a ≥32-character random token, not a hint: the token is not
 * guessable and the hash is not reversible.
 *
 * THE SAME RECIPE LIVES ON THE ENGINE'S SIDE, in `src/core/site_builder/pairing.ts` of the
 * Dédalo engine, and the two are held equal by a gate that imports BOTH modules and
 * compares their output (`test/unit/site_builder_pairing_tripwire.test.ts`). That is why
 * this file imports NOTHING: a fingerprint definition that dragged the daemon's config
 * (env files, credential directories, a process.exit on invalid input) into the engine's
 * test process could not be compared at all, and the two sides would be kept in step by
 * hope.
 */

/**
 * The domain-separation prefix. It exists so this hash can never collide with some other
 * sha256 over the same token that a future feature might publish: a bare
 * `sha256(instance + token)` is a value anybody may reproduce for their own purpose, and
 * two protocols sharing one digest is how a proof of one thing becomes a proof of another.
 */
export const PAIRING_FINGERPRINT_PREFIX = 'dedalo-site-instance:';

/**
 * The fingerprint, as lower-case hex.
 *
 * The newline between the instance and the token is not decoration: it is the separator
 * that makes the encoding unambiguous. Without it, instance `ab` + token `cde` and
 * instance `abc` + token `de` would hash identically, and an attacker able to choose one
 * half could shift bytes across the boundary. The instance name is constrained to
 * `[a-z][a-z0-9-]*` (INSTANCE_PATTERN) so it can never contain the separator itself.
 */
export function instanceFingerprint(instance: string, serviceToken: string): string {
  return new Bun.CryptoHasher('sha256')
    .update(`${PAIRING_FINGERPRINT_PREFIX}${instance}\n${serviceToken}`)
    .digest('hex');
}
