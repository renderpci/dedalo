/**
 * Shared contracts for the per-component SQL fragment builders — the TS
 * re-expression of PHP's resolve_query_object_sql() (spec §3.3 conform phase).
 *
 * A builder receives one conformed filter LEAF plus its resolved context and
 * returns:
 *   - false                → leaf contributes nothing (dropped by the parser)
 *   - a Fragment           → SQL sentence with named _Q1_ tokens + values
 *   - a CompoundFragment   → $and/$or of sub-results (q_split fan-out,
 *                            section_id between, relation_search wrapping)
 *
 * SECURITY INVARIANT: every identifier interpolated into a sentence (alias,
 * column, tipo, lang) MUST have passed the identifier gate before the builder
 * runs. Builders interpolate only context fields, never raw leaf input;
 * comparison VALUES always travel as _Q_ tokens → bound parameters. jsonpath
 * literals cannot carry binds, so values embedded there (date times, jsonpath
 * filters) are built from validated/derived data only.
 */

/** Resolved context for one leaf (everything already gate-validated). */
export interface BuilderContext {
	/** Table alias in the current query (e.g. 'oh1', 'mix'). */
	alias: string;
	/** Matrix jsonb column for the component's model (e.g. 'string'). */
	column: string;
	/** The component tipo being searched (e.g. 'oh62'). */
	tipo: string;
	/** The leaf path step's section tipo ('' when the step omits it) — the
	 * children builder resolves its paired parent against it; the index
	 * builder scopes the dd96 reference scan by it. */
	sectionTipo: string;
	/** Physical table (needed by self-join shapes). */
	table: string;
	/** Effective language for the comparison ('lg-*' or 'all'). */
	lang: string;
	/** Whether the component data is language-translatable. */
	translatable: boolean;
	/** The component model (dispatch key). */
	model: string;
	/**
	 * string-column leaves only: the physical table is COVERED by the
	 * matrix_search_values per-value store (its sync trigger exists — see
	 * search_store.ts), so builder_string may prepend its trigram-served
	 * contains pre-filter. Absent/false → the builder emits its exact classic
	 * SQL (byte-identical, store-less behavior).
	 */
	searchStoreCovered?: boolean;
}

/** A resolved SQL fragment: sentence with _Q1_-style tokens + their values. */
export interface Fragment {
	kind: 'fragment';
	sentence: string;
	/** token → value; insertion order must match token order in the sentence. */
	tokenValues: Record<string, unknown>;
}

/** A boolean grouping of sub-results (resolved recursively by the parser). */
export interface CompoundFragment {
	kind: 'compound';
	op: '$and' | '$or';
	items: BuilderResult[];
}

export type BuilderResult = false | Fragment | CompoundFragment;

export function fragment(sentence: string, tokenValues: Record<string, unknown> = {}): Fragment {
	return { kind: 'fragment', sentence, tokenValues };
}

export function compound(op: '$and' | '$or', items: BuilderResult[]): CompoundFragment {
	return { kind: 'compound', op, items };
}

/**
 * Normalize a q payload to a plain string (PHP extract_normalized_q):
 * unwraps [scalar] and [{value:…}] shapes. Returns null when q is absent.
 */
export function extractNormalizedQ(q: unknown): string | null {
	let value = q;
	if (Array.isArray(value)) {
		value = value[0];
	}
	if (value !== null && typeof value === 'object' && 'value' in (value as object)) {
		value = (value as { value: unknown }).value;
	}
	if (value === undefined || value === null) {
		return null;
	}
	return String(value);
}

/**
 * Split a q string into search tokens (PHP split_search_terms): operators and
 * wildcards are glued to their word, then whitespace-split.
 */
export function splitSearchTerms(q: string): string[] {
	const compacted = q.replace(/(!=|==|!!|!\*|=|-)\s+/g, '$1').replace(/\s+(\*)/g, '$1');
	return compacted.split(/\s/).filter((token) => token.length > 0);
}

/** PHP search::is_literal — q wrapped in single quotes means exact match. */
export function isLiteralQ(q: string): boolean {
	return q.length >= 2 && q.startsWith("'") && q.endsWith("'");
}
