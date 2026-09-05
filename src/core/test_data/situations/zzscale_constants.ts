/**
 * THE MUSEUM-SCALE SCRATCH CORPUS — the DB-FREE constants.
 *
 * Split from `zzscale_corpus.ts` for the reason `synthetic_hierarchy_constants.ts`
 * is split from its fixture: a consumer that only needs to NAME the TLD, an id
 * or a volume number must not bind a database connection at import.
 * `zzscale_corpus.ts` imports `situation.ts`, which imports `postgres.ts` at
 * module scope and freezes the pool on whatever `DB_NAME` says at that instant.
 * Everything below is plain data — importable from a pure scan, a script, or a
 * gate that never touches Postgres.
 *
 * WHY THE CORPUS EXISTS. Five measured budget/behaviour questions have no
 * repro on the suite database because the suite database has no SHAPE big or
 * odd enough to ask them, and the only corpora that did were one install's
 * records (the generic-`test`-TLD law forbids asserting against those):
 *
 *   - a WIDE node — a parent holding hundreds of direct children — so
 *     `getChildren`'s ordering branch (children.ts `orderChildHits`, which is
 *     one record read PER CHILD) is entered with a cost worth bounding;
 *   - a DEEP subtree — ~1,200 descendants at depth 3 — so
 *     `getChildrenRecursive`'s per-level fan-out is measurable;
 *   - a POLY-HIERARCHY island — a term with TWO parents — the shape a plain
 *     thesaurus twin cannot express, and the exact shape that makes the
 *     by-VALUE `visited` map of `getChildrenRecursive` re-walk a node once per
 *     path (`getChildrenRecursiveBatch` shares the set instead);
 *   - dd96 INDEXATION locators — the suite holds ZERO, so
 *     `builder_relation_index`'s only shape (`{type:'dd96', section_tipo}`)
 *     has never been exercised against real rows here;
 *   - a STRING DISTRIBUTION that includes every regex metacharacter
 *     `builders/types.ts`'s REGEX_META class names, so the search-store LIKE
 *     pre-filter's false-negative guard has values to be wrong about.
 *
 * NOT A RESIDENT FIXTURE. The suite database does not carry this corpus. A
 * corpus that lives in the fixture can be resized under a budget ceiling, and
 * a ceiling over a resizable corpus is not a ratchet — it is a number that
 * moves with the thing it measures. Each consuming gate BUILDS it
 * (`ensureZzScaleCorpus`) and TEARS IT DOWN (`dropZzScaleCorpus`, whose return
 * value is the residue, asserted 0).
 *
 * EVERY NUMBER HERE IS ARITHMETIC, NOT A GUESS, and every number is FIXED —
 * there is no resize parameter and no env knob, for the reason above.
 */

/** The reserved scratch TLD (situation.ts RESERVED_TLD = /^zz[a-z]*$/). */
export const ZZSCALE_TLD = 'zzscale';

/** The one ordinary section (model `section`, stored in matrix_test). */
export const ZZSCALE_SECTION = 'zzscale1';
/** The term component — carries the string distribution. */
export const ZZSCALE_TERM_COMPONENT = 'zzscale2';
/** component_relation_parent — the UPWARD link; children are its inverse. */
export const ZZSCALE_PARENT_COMPONENT = 'zzscale3';
/** component_relation_children — the node getChildren dispatches on. */
export const ZZSCALE_CHILDREN_COMPONENT = 'zzscale4';
/** component_number — the per-parent sibling ORDER value (id_key paired). */
export const ZZSCALE_ORDER_COMPONENT = 'zzscale5';
/** component_portal — the OWNER of the dd96 indexation locators. */
export const ZZSCALE_INDEX_OWNER_COMPONENT = 'zzscale6';
/** section_list — list columns (a render budget needs columns to render). */
export const ZZSCALE_SECTION_LIST = 'zzscale7';
/** section_map — where `thesaurus.order` lives (getChildren's ordering branch). */
export const ZZSCALE_SECTION_MAP = 'zzscale8';

/** DEDALO_RELATION_TYPE_PARENT_TIPO — the stored upward link type. */
export const ZZSCALE_PARENT_RELATION_TYPE = 'dd47';
/** DEDALO_RELATION_TYPE_INDEX_TIPO — the indexation link type. */
export const ZZSCALE_INDEX_RELATION_TYPE = 'dd96';

// ─────────────────────────────────────────────────────────────────────────────
// THE ID LAYOUT. Ids are contiguous from 1 with no holes, and each SHAPE has
// exactly ONE addressable owner band — a gate names the band, never a magic id.
// ─────────────────────────────────────────────────────────────────────────────

/** The tree root. Parentless; every tree record below descends from it. */
export const ZZSCALE_ROOT_ID = 1;

/** Depth 1: ids 2..11 — ten children of the root. */
export const ZZSCALE_LEVEL1_FIRST_ID = 2;
export const ZZSCALE_LEVEL1_LAST_ID = 11;

/**
 * The WIDE parent — the first depth-1 node. It alone holds the whole depth-2
 * band, so `getChildren` on it enters `orderChildHits` with 440 children and
 * pays 440 per-child record reads. 440 >= the 400-child floor the budget gates
 * were specified against, with margin.
 */
export const ZZSCALE_WIDE_PARENT_ID = ZZSCALE_LEVEL1_FIRST_ID;

/** Depth 2: ids 12..451 — ALL 440 of them children of the wide parent. */
export const ZZSCALE_LEVEL2_FIRST_ID = 12;
export const ZZSCALE_LEVEL2_LAST_ID = 451;
/** 451 - 12 + 1 = 440 direct children under one node. */
export const ZZSCALE_WIDE_CHILD_COUNT = ZZSCALE_LEVEL2_LAST_ID - ZZSCALE_LEVEL2_FIRST_ID + 1;

/**
 * Depth 3: ids 452..1200 — 749 leaves spread round-robin over the depth-2
 * band, so no depth-2 node is itself wide and the depth is genuinely 3.
 */
export const ZZSCALE_LEVEL3_FIRST_ID = 452;
export const ZZSCALE_LEVEL3_LAST_ID = 1200;

/** The last id belonging to the tree. Root + 10 + 440 + 749 = 1,200 records. */
export const ZZSCALE_TREE_LAST_ID = ZZSCALE_LEVEL3_LAST_ID;
/** Descendants of the root: 1,200 - 1 = 1,199 (~1,200, at depth 3). */
export const ZZSCALE_ROOT_DESCENDANT_COUNT = ZZSCALE_TREE_LAST_ID - ZZSCALE_ROOT_ID;

/**
 * THE POLY-HIERARCHY ISLAND — three records, DISJOINT from the tree (both
 * parents are parentless), so it can never perturb the tree's counts. The
 * child declares BOTH parents, which is what makes it reachable twice.
 */
export const ZZSCALE_POLY_PARENT_A_ID = 1201;
export const ZZSCALE_POLY_PARENT_B_ID = 1202;
export const ZZSCALE_POLY_CHILD_ID = 1203;
/** The child's parent-link item ids — the id_key each order value pairs with. */
export const ZZSCALE_POLY_ID_KEY_A = 1;
export const ZZSCALE_POLY_ID_KEY_B = 2;
/** The child's order value under each parent (distinct, so the pairing shows). */
export const ZZSCALE_POLY_ORDER_A = 11;
export const ZZSCALE_POLY_ORDER_B = 22;

/**
 * REGEX METACHARACTERS — the class `src/core/search/builders/types.ts` declares
 * as REGEX_META and the SQL function `f_regex_literal` escapes. A `q` carrying
 * any of these is a PATTERN to Postgres unless it is escaped, so the corpus
 * carries one VALUE per character and the gate re-derives this list FROM that
 * source file: a character added there without a value here goes red.
 *
 * It is the class a curator TYPES, not the class Postgres compiles: the
 * unaccent dictionary expands 143 further characters INTO metacharacters, and
 * that (database-derived) census lives in search_literal_native, which also
 * reaches every value below through its unaccent PRE-IMAGE.
 */
export const ZZSCALE_REGEX_META_CHARS: readonly string[] = [
	'.',
	'*',
	'+',
	'?',
	'[',
	']',
	'{',
	'}',
	'(',
	')',
	'|',
	'\\',
	'^',
	'$',
];

/** The exact/contains probe pair: contains-count 2, exact-count 1. */
export const ZZSCALE_EXACT_TERM = 'Denarius';
export const ZZSCALE_CONTAINS_TERM = 'Denarius [sic]';

/**
 * The metacharacter values' stem. It shares no substring with the Denarius
 * pair, so neither census can contaminate the other. One value per character:
 * `Sestertius<char>mark`.
 */
export const ZZSCALE_META_STEM = 'Sestertius';
export const ZZSCALE_META_SUFFIX = 'mark';

/** One metacharacter value — a pure function of the character. */
export function zzScaleMetaValue(char: string): string {
	return `${ZZSCALE_META_STEM}${char}${ZZSCALE_META_SUFFIX}`;
}

/**
 * THE STRING DISTRIBUTION, in id order from ZZSCALE_STRING_FIRST_ID: the two
 * Denarius values then one value per metacharacter. 2 + 14 = 16 records.
 */
export const ZZSCALE_STRING_VALUES: readonly string[] = [
	ZZSCALE_EXACT_TERM,
	ZZSCALE_CONTAINS_TERM,
	...ZZSCALE_REGEX_META_CHARS.map(zzScaleMetaValue),
];

/** ids 1204..1219 — the distribution's own band, one value each. */
export const ZZSCALE_STRING_FIRST_ID = 1204;
export const ZZSCALE_STRING_LAST_ID = ZZSCALE_STRING_FIRST_ID + ZZSCALE_STRING_VALUES.length - 1;

/**
 * THE TWO-LOCATOR RECORD (id 1220) — one owner holding BOTH dd96 indexation
 * locators, which is at once the corpus's whole indexation census (exactly two
 * locators, where the suite held zero) and the deterministic-SORT probe: they
 * are STORED in descending target order, so a consumer that emits them
 * ascending has demonstrably sorted rather than echoed the storage order.
 */
export const ZZSCALE_INDEX_OWNER_ID = 1220;
/** Stored order — deliberately NOT ascending. */
export const ZZSCALE_INDEX_TARGET_IDS: readonly number[] = [
	ZZSCALE_WIDE_PARENT_ID,
	ZZSCALE_ROOT_ID,
];

/** Every record the corpus creates: 1..1220, contiguous. */
export const ZZSCALE_TOTAL_RECORDS = ZZSCALE_INDEX_OWNER_ID;

/**
 * The per-parent sibling ORDER value of a tree record — a pure function of the
 * id, strictly DECREASING in it. Within any sibling group that inverts id
 * order, so an ordering assertion cannot pass by accident on rows that arrive
 * in id order anyway (which is exactly what `findChildHits` returns).
 */
export function zzScaleOrderValue(sectionId: number): number {
	return ZZSCALE_TOTAL_RECORDS - sectionId;
}

/**
 * The tree's id bands, each with the parent every id inside it takes. DECLARED
 * rather than branched: the shape is a table, and a table is read once per
 * lookup instead of re-stating the band arithmetic at every level.
 */
const ZZSCALE_TREE_BANDS: readonly {
	first: number;
	last: number;
	parentOf: (sectionId: number) => number;
}[] = [
	{
		first: ZZSCALE_LEVEL1_FIRST_ID,
		last: ZZSCALE_LEVEL1_LAST_ID,
		parentOf: () => ZZSCALE_ROOT_ID,
	},
	{
		first: ZZSCALE_LEVEL2_FIRST_ID,
		last: ZZSCALE_LEVEL2_LAST_ID,
		parentOf: () => ZZSCALE_WIDE_PARENT_ID,
	},
	{
		first: ZZSCALE_LEVEL3_FIRST_ID,
		last: ZZSCALE_LEVEL3_LAST_ID,
		// Round-robin over the depth-2 band: every depth-2 node gets 1 or 2
		// leaves, so depth 3 exists everywhere and nothing but the wide parent
		// is wide.
		parentOf: (sectionId) =>
			ZZSCALE_LEVEL2_FIRST_ID + ((sectionId - ZZSCALE_LEVEL3_FIRST_ID) % ZZSCALE_WIDE_CHILD_COUNT),
	},
];

/**
 * The tree parent of a record id, or null when the record is parentless.
 *
 * Root, the poly island's two parents, the string band and the index owner are
 * parentless BY CONSTRUCTION — they fall in no band, and each shape owns its
 * ids, so none of them can move another shape's counts.
 */
export function zzScaleParentIdOf(sectionId: number): number | null {
	const band = ZZSCALE_TREE_BANDS.find((b) => sectionId >= b.first && sectionId <= b.last);
	return band ? band.parentOf(sectionId) : null;
}

/**
 * The shared prefix of every tree/island record's term. Exported because the
 * TLD's literals have exactly ONE owner (scratch_tld_uniqueness_tripwire): a
 * gate searching this corpus asks for the prefix, it does not spell it.
 */
export const ZZSCALE_TERM_PREFIX = 'zzscale record';

/** The generic term text of a tree/island record — contaminates no census. */
export function zzScaleTermOf(sectionId: number): string {
	return `${ZZSCALE_TERM_PREFIX} ${sectionId}`;
}
