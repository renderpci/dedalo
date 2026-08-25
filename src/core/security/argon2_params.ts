/**
 * THE ONE ARGON2 COST DEFINITION.
 *
 * Every password this system stores — user passwords (dd133), the root password an
 * installer sets, the password-reset code, the suite's own credential, and the decoy
 * hash login spends on its failure paths — is produced with THESE parameters, from this
 * constant, imported. A cost that is chosen per call site is a cost that drifts per call
 * site, and the drift is invisible: a weaker hash looks exactly like a stronger one.
 *
 * WHY EXPLICIT AT ALL. Every site used to pass `{ algorithm: 'argon2id' }` and inherit
 * whatever the runtime chose. That is not a defensible position for a system whose data
 * outlives its dependencies: the cost of a heritage archive's password hashes would then
 * be a property of whichever Bun version happened to be installed the day each account
 * was created, changing silently under a runtime upgrade in either direction, with
 * nothing in the repo recording what was actually used.
 *
 * THE VALUES. m=65536 KiB (64 MiB), t=3, p=1. Measured on this project's pinned runtime:
 * ~90 ms per hash. Above the OWASP interactive floor for Argon2id (m=19456, t=2, p=1) on
 * the memory axis — memory is the axis that costs a GPU attacker most — and one
 * iteration above the runtime's own default (m=65536, t=2, p=1), which is what this
 * pins rather than inherits. p=1 deliberately: a Dédalo host also runs Postgres and
 * ImageMagick/ffmpeg conversions, and parallelism here buys an attacker with dedicated
 * hardware more than it buys a curator logging in. Peak memory is bounded by the login
 * throttle, not by concurrency.
 *
 * RAISING THEM LATER is a one-line change here: `needsPasswordRehash` compares a stored
 * hash against this constant, and the next successful login of each account rewrites it.
 * That is why the comparison is UPGRADE-ONLY — a stored hash that is already stronger
 * than the constant (a PHP-era `password_hash(PASSWORD_ARGON2ID)` used m=65536, t=4)
 * must never be rewritten downwards.
 */

/** The parameters every `Bun.password.hash` call in this codebase must pass. */
export const ARGON2_OPTIONS = {
	algorithm: 'argon2id',
	/** KiB. The axis that costs a GPU attacker most. */
	memoryCost: 65_536,
	/** Iterations over that memory. */
	timeCost: 3,
} as const;

/** The parameters as a PHC fragment, for gates and for `needsPasswordRehash`. */
const TARGET = { memoryCost: ARGON2_OPTIONS.memoryCost, timeCost: ARGON2_OPTIONS.timeCost };

/** The `m=`/`t=` a PHC string declares, or null when it is not a parseable Argon2 hash. */
function parseArgon2Cost(hash: string): { memoryCost: number; timeCost: number } | null {
	// $argon2id$v=19$m=65536,t=3,p=1$<salt>$<digest>
	const match = /^\$argon2(?:id|i|d)\$v=\d+\$m=(\d+),t=(\d+)/.exec(hash);
	if (match?.[1] === undefined || match[2] === undefined) return null;
	return { memoryCost: Number(match[1]), timeCost: Number(match[2]) };
}

/**
 * Should this stored hash be rewritten at the next successful verify?
 *
 * UPGRADE-ONLY, in both directions of that phrase: true only when the stored cost is
 * BELOW the current target on some axis, and never for a hash that is stronger. A
 * downgrade would be a silent security regression performed by a routine login, and the
 * hashes it would hit are precisely the PHP-era ones (m=65536, t=4) an install carries
 * from before the rewrite.
 *
 * A hash this cannot parse is left alone: not knowing its cost is not a reason to
 * rewrite a credential.
 */
export function needsPasswordRehash(hash: unknown): boolean {
	if (typeof hash !== 'string' || !hash.startsWith('$argon2')) return false;
	const current = parseArgon2Cost(hash);
	if (current === null) return false;
	return current.memoryCost < TARGET.memoryCost || current.timeCost < TARGET.timeCost;
}
