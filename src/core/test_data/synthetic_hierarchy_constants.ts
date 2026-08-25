/**
 * SYNTHETIC HIERARCHY FIXTURE — the DB-FREE constants.
 *
 * Split from `synthetic_hierarchy_fixture.ts` for the same reason
 * `test_database_marker_constants.ts` exists: `scripts/lib/hierarchy_allowlist.ts`
 * must name these TLDs while staying a PURE filesystem module —
 * `scripts/test_db_setup.ts` imports the allowlist STATICALLY, BEFORE its env
 * repoint, and the fixture module itself imports config/postgres at module
 * scope, which would freeze the connection on the APPLICATION database. So the
 * names live here, importable from both sides, and the DB-touching fixture
 * imports them like everyone else.
 *
 * WHY THESE TLDs EXIST AT ALL (measured 2026-08-25). The suite fixture used to
 * import real geographic thesauri — Spain's 69,889 toponymy records, France's
 * 41,212, ~140k rows across the derived allowlist — and component/search gates
 * asserted against one install's actual geography, in direct violation of the
 * generic-`test`-TLD law (AGENTS.md hard rules). Dropping four whole countries
 * (it, ma, pt, tn — 103,536 rows) broke NOTHING: the records' CONTENT was never
 * what those gates tested. The two synthetic hierarchies below replace them:
 * generic-namespace TLDs (they pass generic_tld_tripwire's test* family),
 * activated through the engine's own `activateHierarchy` door, populated with
 * GENERATED, deterministic records shaped by the consumer census — row volume,
 * term-text distribution, registry pairing — and nothing an install owns.
 *
 * WHAT THIS FILE DOES NOT PROVE: these are names, not guarantees. The fixture
 * module (`synthetic_hierarchy_fixture.ts`) is what builds, guards
 * (assertTestDatabase) and tears down the data; the allowlist merely admits the
 * TLD heads into the suite-fixture data law (generic_tld_tripwire data side).
 */

/**
 * Hierarchy A — the WORKHORSE (replaces the Spain-hierarchy roles; the tipo itself is deliberately not spelled here — the hierarchy allowlist scan counts comments). Its terms section
 * `testgeoa1` carries the volume corpus (ids contiguous from 1; id 1 is the
 * root the AUTHZ-05 probe reads); its model twin `testgeoa2` holds only the
 * engine-minted model root, so the id band datalist gates seed (941001+) and
 * everything below 941000 stays free.
 */
export const SYNTHETIC_HIERARCHY_A_TLD = 'testgeoa';

/**
 * Hierarchy B — the SECOND OWNER (replaces the France-hierarchy roles): a distinct
 * activated hierarchy with a DISTINCT model twin, ~10 records — existence and
 * registry pairing are all its consumers (datalist cache-key, model-section
 * resolution) need.
 */
export const SYNTHETIC_HIERARCHY_B_TLD = 'testgeob';

/** Both synthetic TLDs, the shape the hierarchy allowlist consumes. */
export const SYNTHETIC_HIERARCHY_TLDS: readonly string[] = [
	SYNTHETIC_HIERARCHY_A_TLD,
	SYNTHETIC_HIERARCHY_B_TLD,
];

/**
 * The exact-vs-contains probe names (search_string_equal_operator's contract):
 * each has exactly ONE record named precisely this (a branch term) and hundreds
 * of leaf terms CONTAINING it — so exact-unaccent-match count >= 1 and
 * contains-count is STRICTLY greater, with the contains corpus in the hundreds
 * (the volume rows double as it, preserving the migrated gate's original
 * ">1000 contains-matches" point at fixture scale). The gate re-derives its
 * ground truth in-test; these names only guarantee the distribution exists.
 */
export const SYNTHETIC_PROBE_TERMS: readonly string[] = ['Ea', 'Ye', 'Ibi'];

/**
 * The volume floor for hierarchy A's terms section. Arithmetic, not a guess:
 * search_late_row_lookup pages at offset SEARCH_LATE_ROW_LOOKUP_OFFSET
 * (default 1000) + 200 with limit 25 and asserts a NON-EMPTY page, so one
 * section needs >= 1,226 rows; 1,300 gives margin. The fixture derives the
 * REAL count from the live config default at seed time
 * (`syntheticHierarchyARowCount()`), so a raised default cannot silently
 * starve the paging gate — this constant is only the floor beneath it.
 */
export const SYNTHETIC_VOLUME_FLOOR = 1300;

/** Hierarchy B's total term rows (root included) — existence, not volume. */
export const SYNTHETIC_B_ROW_COUNT = 10;
