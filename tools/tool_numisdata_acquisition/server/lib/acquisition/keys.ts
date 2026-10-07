/**
 * Pure key derivations for commit_lots' find-or-create dedup: the advisory-lock key fold for a
 * free-text name, and the normalised per-lot source URL. No I/O, no engine imports - unit-tested
 * directly by test/unit/tool_numisdata_acquisition_keys.test.ts.
 */

/**
 * Letters Postgres's `unaccent` dictionary rewrites that are NOT a base letter plus a combining
 * mark (so NFKD alone leaves them intact): stroke/bar letters, ligatures, sharp s, thorn, dotless i.
 * Lowercase only - the fold lowercases before mapping. Keyed by code point, not literal, so this
 * source stays ASCII (non-ASCII letters are easy to corrupt in transit and some render confusingly).
 */
const UNACCENT_EXTRA: ReadonlyMap<number, string> = new Map([
	[0x00f8, 'o'], // o with stroke
	[0x0142, 'l'], // l with stroke
	[0x0111, 'd'], // d with stroke
	[0x00f0, 'd'], // eth
	[0x00e6, 'ae'], // ae ligature
	[0x0153, 'oe'], // oe ligature
	[0x00df, 'ss'], // sharp s
	[0x00fe, 'th'], // thorn
	[0x0131, 'i'], // dotless i
	[0x0127, 'h'], // h with stroke
	[0x0140, 'l'], // l with middle dot
	[0x0167, 't'], // t with stroke
	[0x0138, 'q'], // kra
	[0x014b, 'n'], // eng
	[0x017f, 's'], // long s
	[0x0133, 'ij'], // ij ligature
	[0x0180, 'b'], // b with stroke
	[0x0188, 'c'], // c with hook
	[0x0192, 'f'], // f with hook
	[0x0268, 'i'], // i with stroke
	[0x0289, 'u'], // u bar
]);

/**
 * Folds a free-text name into an advisory-lock key that is COARSER than the equivalence the
 * engine's `==` search uses. That search compares `f_unaccent(a) = f_unaccent(b)` - accent-folded
 * through Postgres's unaccent dictionary, but CASE-SENSITIVE (builder_string.ts 'exact'). A lock
 * key must never be FINER than the search: two spellings the search treats as the same Entity must
 * take the same lock, or two concurrent commits both miss the lookup and both create. Coarser is
 * always safe (the worst case is two unrelated names serialising on one lock), so this folds case
 * too, maps the unaccent letters NFKD would leave alone or mis-split (UNACCENT_EXTRA), then
 * applies NFKD (compatibility forms: ligature code points, full-width letters) and drops every
 * combining mark. The real
 * correctness guarantee stays the re-check under the lock, through the actual search.
 */
export function foldNameForLock(name: string): string {
	// Map the unaccent letters FIRST, on the lowercased text: NFKD would otherwise split one of
	// them into something unaccent never produces (U+0140 "l with middle dot" -> "l" + U+00B7,
	// and the middle dot is not a combining mark, so it would survive into the key).
	let mapped = '';
	for (const ch of name.trim().toLowerCase()) {
		mapped += UNACCENT_EXTRA.get(ch.codePointAt(0) ?? 0) ?? ch;
	}
	let out = '';
	for (const ch of mapped.normalize('NFKD')) {
		const code = ch.codePointAt(0) ?? 0;
		// Combining Diacritical Marks (U+0300-U+036F) + their Supplement/Extended blocks and the
		// half marks - every mark NFKD split an accented letter into.
		if (
			(code >= 0x0300 && code <= 0x036f) ||
			(code >= 0x1ab0 && code <= 0x1aff) ||
			(code >= 0x1dc0 && code <= 0x1dff) ||
			(code >= 0xfe20 && code <= 0xfe2f)
		) {
			continue;
		}
		out += ch;
	}
	// NFKD can surface an uppercase letter from a compatibility form (e.g. a circled or
	// full-width capital); a final lowercase keeps the key's one invariant: no uppercase survives.
	return out.toLowerCase();
}

/**
 * The per-lot source URL in the one form it is stored and matched in (numisdata275, commit_lots'
 * URL dedup): trimmed, scheme and host lowercased (the URL parser does both, and drops a default
 * port), fragment removed. Path and query are kept verbatim - they are case-sensitive on the
 * source sites. Null when the value is not an absolute http(s) URL, so a malformed or relative
 * value can never become a dedup key.
 */
export function normalizeLotUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	url.hash = '';
	return url.toString();
}
