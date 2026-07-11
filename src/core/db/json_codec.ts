/**
 * json_codec — THE single chokepoint for matrix JSONB writes (plan A5.2).
 *
 * Why this exists: both servers write the same jsonb columns and must stay
 * byte-compatible (spec §2.2). PostgreSQL jsonb canonicalizes on parse (key
 * order, whitespace, string escapes), so byte-compat reduces to SEMANTIC
 * equality of what each server sends. The hazards are the values where
 * JavaScript and PHP disagree semantically:
 *
 *  1. int vs float — PHP json_encode(5.0) emits "5.0"; JS has one number type
 *     and JSON.stringify(5.0) emits "5". jsonb PRESERVES the distinction
 *     ("5.0"::jsonb::text = '5.0'). Investigated 2026-07-01 on the live
 *     dedalo_mib_v7: floats are pervasive (143k rows in matrix.number, geo,
 *     misc) but ZERO trailing-zero floats exist in the whole matrix table —
 *     app data enters via the JS client, which already normalizes 5.0 → 5.
 *     The idempotence gate in test/unit/json_codec_roundtrip.test.ts monitors
 *     this against real rows; if a x.0 float ever appears, encoding must grow
 *     a lossless-number representation (fail loudly, don't guess).
 *
 *  2. [] vs {} — PHP's empty array is ambiguous (encodes as []); JS is
 *     explicit (array → [], object → {}). This codec preserves the JS
 *     distinction verbatim. When porting PHP code that builds data, mind
 *     which one PHP actually emitted (probe: zero "{}" occurrences in
 *     matrix.data/relation as of 2026-07-01).
 *
 *  3. undefined / NaN / Infinity / functions — representable in JS, not in
 *     JSON. PHP json_encode FAILS on NaN/INF; JSON.stringify silently turns
 *     them into null and silently DROPS undefined object properties. Silent
 *     data loss is unacceptable in a write path, so encodeForJsonb REJECTS
 *     all of them loudly.
 *
 * PHP reference: core/db/class.json_handler.php (encode with
 * JSON_UNESCAPED_UNICODE — escape flags are irrelevant post-jsonb-parse) and
 * class.matrix_db_manager.php update() (values bound as JSON text params).
 */

/**
 * Branded type for pre-encoded JSON text that must pass through UNTOUCHED
 * (e.g. the raw ::text of a column we read and did not modify). Passing raw
 * text instead of re-encoding parsed values is the lossless path and is
 * always preferred when the value was not changed.
 */
export type RawJsonText = string & { readonly __brand: 'RawJsonText' };

/** Mark a string as raw JSON text (caller asserts it came from jsonb::text or this codec). */
export function asRawJsonText(jsonText: string): RawJsonText {
	return jsonText as RawJsonText;
}

/**
 * Walk a value and throw on anything JSON cannot represent faithfully.
 * `path` accumulates a human-readable location for the error message.
 */
function assertJsonSafe(value: unknown, path: string): void {
	if (value === null) return;
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return;
		case 'number':
			if (!Number.isFinite(value)) {
				throw new Error(`json_codec: non-finite number at ${path} (NaN/Infinity are not JSON)`);
			}
			return;
		case 'undefined':
			throw new Error(
				`json_codec: undefined at ${path} — JSON.stringify would silently drop it; use null or omit the key explicitly`,
			);
		case 'function':
		case 'symbol':
		case 'bigint':
			throw new Error(`json_codec: unencodable ${typeof value} at ${path}`);
		case 'object': {
			if (Array.isArray(value)) {
				value.forEach((item, index) => {
					// Sparse/undefined array slots become null silently — reject.
					if (item === undefined) {
						throw new Error(`json_codec: undefined array item at ${path}[${index}]`);
					}
					assertJsonSafe(item, `${path}[${index}]`);
				});
				return;
			}
			for (const [key, entry] of Object.entries(value)) {
				if (entry === undefined) {
					throw new Error(
						`json_codec: undefined property at ${path}.${key} — JSON.stringify would silently drop the key`,
					);
				}
				assertJsonSafe(entry, `${path}.${key}`);
			}
			return;
		}
	}
}

/**
 * Encode a value for a matrix jsonb column write.
 * Returns compact JSON text to be bound as a query parameter (Postgres parses
 * it into jsonb, exactly like the PHP path binds json_encode output).
 */
export function encodeForJsonb(value: unknown): RawJsonText {
	if (value === undefined) {
		throw new Error(
			"json_codec: cannot encode undefined — use null for SQL NULL via the write API's null handling",
		);
	}
	assertJsonSafe(value, '$');
	return JSON.stringify(value) as RawJsonText;
}

/** Parse jsonb text back into a JS value (thin wrapper kept for symmetry/auditability). */
export function decodeFromJsonb(jsonText: string): unknown {
	return JSON.parse(jsonText);
}
