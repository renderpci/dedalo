/**
 * CANONICAL JSON — the ONE structural-equality / digest form of a JSON value.
 *
 * Keys sorted at every depth (UTF-16 code-unit order, `Array.prototype.sort`'s
 * default), no whitespace, and otherwise EXACTLY `JSON.stringify`'s semantics:
 * `toJSON` is honoured (a Date becomes its ISO string), an `undefined` object
 * property is omitted, an `undefined` array slot is `null`. So two values that
 * store as the same jsonb (key order aside) have the same canonical text, and a
 * digest over it is a digest over the structure, not over one serializer's
 * habits.
 *
 * ONE DELIBERATE EXTENSION: a top-level `undefined` — which `JSON.stringify`
 * answers with `undefined`, not a string — is the literal `'undefined'`. The
 * undo log uses `undefined` for "the key is ABSENT" (time_machine.ts
 * recordBulkPair), and an absent key must never compare equal to a stored
 * `null` or `[]`.
 *
 * WHY ONE MODULE (2026-09-27, bulk-revert undo log). Three private copies
 * existed — the CSV append merge (append_merge.ts), the agent change-plan hash
 * (ai/agent/change_plan.ts) and the archive digest (archive/manifest.ts) — each
 * with its own edge semantics (undefined properties, Date, top-level undefined).
 * On JSON-derived values, which is every value they are ever given, all three
 * produce the same text as this one; they now import it, so the undo log's
 * no-op test, the append merge's identity test and the two digests cannot
 * drift into three notions of "the same value".
 *
 * (!) The archive digest is a PERSISTED FORMAT (engineering/ARCHIVE_FORMAT.md
 * `ontology.digest`): changing the output of this function for any JSON value
 * breaks the verification of every archive already written. It is pinned by
 * test/unit/canonical_json.test.ts.
 */

/** The deterministic text of `value` — see the module header for the exact rules. */
export function canonicalJson(value: unknown): string {
	return emitCanonical(value, '') ?? 'undefined';
}

/** Structural equality over canonical text (key order never matters). */
export function canonicalEquals(left: unknown, right: unknown): boolean {
	return canonicalJson(left) === canonicalJson(right);
}

/**
 * The canonical text EMITTED DIRECTLY from the sorted key list — never by
 * re-materializing a sorted object and handing it to `JSON.stringify`: a JS
 * object enumerates integer-like keys (`"9"`, `"10"`) first, in numeric order,
 * whatever order they were inserted in, so a rebuilt object cannot carry
 * `["$and","10","9","a"]` in that order (2026-09-27 review finding — the
 * archive digest is a persisted format). `undefined` answers "omit me" (an
 * object property) exactly as `JSON.stringify` does; an array slot turns it
 * into `null`.
 */
function emitCanonical(input: unknown, key: string): string | undefined {
	const value = applyToJson(input, key);
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (isBoxedPrimitive(value)) return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((item, index) => emitCanonical(item, String(index)) ?? 'null').join(',')}]`;
	}
	return emitObject(value as Record<string, unknown>);
}

function emitObject(source: Record<string, unknown>): string {
	const members: string[] = [];
	for (const name of Object.keys(source).sort()) {
		const text = emitCanonical(source[name], name);
		if (text !== undefined) members.push(`${JSON.stringify(name)}:${text}`);
	}
	return `{${members.join(',')}}`;
}

/** `new Number(1)` / `new String('x')` / `new Boolean(true)` — JSON.stringify unwraps them. */
function isBoxedPrimitive(value: object): boolean {
	return value instanceof Number || value instanceof String || value instanceof Boolean;
}

/** `value.toJSON(key)` when the value defines one — exactly where JSON.stringify calls it. */
function applyToJson(value: unknown, key: string): unknown {
	if (value === null || typeof value !== 'object') return value;
	const toJSON = (value as { toJSON?: unknown }).toJSON;
	return typeof toJSON === 'function' ? toJSON.call(value, key) : value;
}
