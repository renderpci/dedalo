/**
 * Response normalization for parity diffing.
 *
 * RULE (plan A5.5 — harness honesty): this file starts EMPTY of cleverness.
 * Every stripped field requires a written justification here; anything not
 * listed is compared byte-for-byte. Over-normalization hides real regressions.
 */

/**
 * Top-level fields removed before diffing, with justification:
 *
 * - csrf_token       : per-session random token; differs on every session by design.
 * - dedalo_last_error: transient server-side error surface, not part of the data contract.
 */
const VOLATILE_TOP_LEVEL_FIELDS = ['csrf_token', 'dedalo_last_error'] as const;

/**
 * Keys removed RECURSIVELY at any depth, with justification:
 *
 * - debug: PHP dev-mode diagnostics ({exec_time, memory_usage, sqo…}) attached
 *   per response AND per resolved row. Pure wall-clock/heap noise — verified
 *   2026-07-01: two live replays of the same read RQO differed ONLY in these
 *   blocks. Absent entirely when the PHP server runs in production mode.
 */
const VOLATILE_RECURSIVE_KEYS = ['debug'] as const;

function stripVolatileKeysRecursive(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripVolatileKeysRecursive);
	}
	if (value !== null && typeof value === 'object') {
		const cleaned: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			if ((VOLATILE_RECURSIVE_KEYS as readonly string[]).includes(key)) {
				continue;
			}
			cleaned[key] = stripVolatileKeysRecursive(entry);
		}
		return cleaned;
	}
	return value;
}

/** Deep-clone a JSON value while dropping the justified volatile fields. */
export function normalizeApiResponse<T>(responseBody: T): T {
	const clone = stripVolatileKeysRecursive(responseBody) as Record<string, unknown>;
	for (const field of VOLATILE_TOP_LEVEL_FIELDS) {
		delete clone[field];
	}
	return clone as T;
}

/**
 * DELIBERATE WIRE DIVERGENCE — the `entries` empty contract (DEC-02, adopted
 * option (a); ledgered in engineering/WIRE_CONTRACT.md entry WC-001).
 *
 * For an EMPTY component value PHP emits `entries: null`; the TS engine emits
 * `entries: []` (commit 589deae — the byte-identical client's lifecycle code
 * requires an array). Per DEC-02 the client is the real spec at this seam, so
 * the parity gates assert the ADOPTED `[]` contract: apply this to the PHP
 * response before diffing. It rewrites ONLY a PRESENT `entries: null` to `[]`
 * (any depth); every other byte is still compared verbatim, so a real
 * regression (missing/extra/misordered entries) cannot hide behind it.
 */
export function adoptEntriesArrayContract<T>(value: T): T {
	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) {
			return node.map(walk);
		}
		if (node !== null && typeof node === 'object') {
			const out: Record<string, unknown> = {};
			for (const [key, entry] of Object.entries(node)) {
				out[key] = key === 'entries' && entry === null ? [] : walk(entry);
			}
			return out;
		}
		return node;
	};
	return walk(value) as T;
}
