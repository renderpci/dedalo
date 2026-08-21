/**
 * Response normalization for parity diffing.
 *
 * RULE (plan A5.5 — harness honesty): this file starts EMPTY of cleverness.
 * Every stripped field requires a written justification here; anything not
 * listed is compared byte-for-byte. Over-normalization hides real regressions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * option (a); ledgered in engineering/wire_contract/ entry WC-001).
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

/**
 * DELIBERATE WIRE DIVERGENCE — section_id INT-CANONICAL
 * (WC-2026-08-10-section-id-int-canonical; the WC-001 gate-side-transform
 * pattern — the frozen fixtures are NOT edited).
 *
 * The TS engine now emits record addresses as INTS where the frozen PHP
 * fixtures carry numeric STRINGS ('7'). This transform maps every
 * address-shaped key whose value is a STRICT-NUMERIC NO-LEADING-ZERO string
 * to its int twin, at any depth, so the diff compares VALUE identity while
 * every other byte stays verbatim. What it deliberately does NOT touch:
 *   - non-numeric values (synthetic 'search_1' tokens, external 'Q42');
 *   - leading-zero strings (external zenon ids — a transform that converted
 *     them would hide a real corruption);
 *   - booleans/null (some fixtures carry parent_section_id: false);
 *   - any key not in the address set.
 *
 * TWO-SIDED during the expand window (applied to fixture AND live payload —
 * old-shape data replayed through new code can still emit either form at
 * unswept depths). The contraction release (plan P6) flips it FIXTURE-SIDE
 * ONLY, so a server regression re-emitting '7' reddens parity again.
 */
const SECTION_ID_ADDRESS_KEYS: ReadonlySet<string> = new Set([
	'section_id',
	'parent_section_id',
	'row_section_id',
	'section_id_key',
	'target_section_id',
	'created_section_id',
	// The tree-area boot payload's typology address (src/core/area/tree.ts
	// canonicalizes it with canonicalizeStoredSectionId, exactly like a
	// section_id) — same law, different field name.
	'typology_section_id',
]);
const STRICT_NUMERIC_ADDRESS = /^(-?[1-9][0-9]*|0)$/;

export function normalizeSectionIdTypes<T>(value: T): T {
	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) {
			return node.map(walk);
		}
		if (node !== null && typeof node === 'object') {
			const out: Record<string, unknown> = {};
			for (const [key, entry] of Object.entries(node)) {
				if (
					SECTION_ID_ADDRESS_KEYS.has(key) &&
					typeof entry === 'string' &&
					STRICT_NUMERIC_ADDRESS.test(entry) &&
					Number.isSafeInteger(Number(entry))
				) {
					out[key] = Number(entry);
				} else {
					out[key] = walk(entry);
				}
			}
			return out;
		}
		return node;
	};
	return walk(value) as T;
}

/**
 * DELIBERATE WIRE DIVERGENCE — ERROR ENVELOPE v2 (the WC-001 gate-side
 * transform pattern; the frozen fixtures are NOT edited — a re-harvest is
 * impossible by definition, see engineering/ORACLE_HARVEST.md).
 *
 * The frozen PHP store speaks the dd_manager envelope
 * `{result, msg, errors, …}` (an error is `result:false` + free English/
 * Spanish `msg` + `errors:[token]`). The TS engine's v2 envelope is
 * `{ok:true, data}` / `{ok:false, error:{code, details?, …}}` (plan §1.2:
 * `error.code` is a registry code, the human text is label-driven and NOT a
 * wire fact). Comparing raw bytes across that seam is impossible, so this
 * transform PROJECTS a frozen PHP body onto the v2 fields a gate may compare:
 *
 *   success (`result` !== false) → `{ok:true, data:<frozen result>}`;
 *   error   (`result` === false) → `{ok:false, error:{code, details?}}`.
 *
 * What keeps it honest (the "starts EMPTY of cleverness" rule):
 *   - TOP-LEVEL ONLY, never recursive. widgets_differential.json carries a
 *     nested `connection_status:{result:false,msg}` payload (a diffusion
 *     element's DB probe) — that is DATA, not an envelope, and stays verbatim
 *     inside `data`. A dd_manager error envelope ALWAYS carries an `errors`
 *     key (8/8 frozen bodies); a `result:false` object without one is
 *     therefore `not_an_envelope`, matched:false — a gate asserting
 *     matched===true reddens instead of quietly passing.
 *   - The error mapping is a TOTAL, EXPLICIT table keyed by the exact frozen
 *     `(msg, errors)` pair (FROZEN_ERROR_BODIES). A `result:false` envelope
 *     that is not in the table THROWS: nothing is inferred from text, so a new
 *     or drifted frozen error can never be silently "classified".
 *   - `php_fault_not_reproduced` = the frozen body is a PHP CRASH surfaced
 *     through dd_manager's Throwable catch (`Call to a member function … on
 *     false`, a null-typed argument). TS does not reproduce PHP faults; those
 *     gates assert nothing about the error today and this transform adds
 *     nothing (matched:true so the gate's totality assertion holds,
 *     projection:null so no equality can be built on it).
 *   - `details` carries only typed scalars derived from the frozen text
 *     (delete_children_guard: the refused ids), never the text itself.
 *
 * Every caller MUST assert `matched === true` (the get_widget_data
 * `stripStateTotalItems` anti-vacuity pattern) — a transform that no-ops is
 * how a divergence becomes a regression the day the shape moves.
 *
 * FIXTURE-SIDE ONLY (P4, 2026-08-16 — the compat mirror is gone from the TS
 * wire, WC-2026-08-16-error-envelope-compat-removal): this transform is applied
 * to FROZEN PHP bodies and never to a TS body. A TS body carries `ok` and no
 * `result`; handed one, the transform REFUSES it (`kind:'ts_body_refused'`,
 * matched:false) instead of projecting — so a server regression back to the
 * `result:false` prose (which would make a TS body look adoptable) reddens the
 * gate that fed it, and a gate that mistakenly projects the TS side reddens
 * on `matched`. test/parity/error_envelope_transform.test.ts pins both.
 */
export type ErrorEnvelopeKind =
	| 'error'
	| 'ok'
	| 'not_an_envelope'
	| 'php_fault_not_reproduced'
	| 'ts_body_refused';

export interface AdoptedErrorEnvelope {
	matched: boolean;
	kind: ErrorEnvelopeKind;
	/** `{ok:true,data}` | `{ok:false,error:{code,details?}}` | null (fault / not an envelope). */
	projection: unknown;
}

export interface FrozenErrorBodyEntry {
	/** Which harvest gate file carries this body (documentation + totality test). */
	gate: string;
	/** Exact frozen `msg` (string; get_widget_data emits a string ARRAY). */
	msg: unknown;
	/** Exact frozen `errors`. */
	errors: unknown;
	kind: 'error' | 'php_fault_not_reproduced';
	/** v2 registry code (plan §4); absent for php faults. */
	code?: string;
	/** Typed scalars derived from the frozen text; absent when there are none. */
	details?: Record<string, unknown>;
}

/**
 * The refused ids of a delete_children_guard body — parsed, not hand-typed:
 * PHP prints the skipped ids as a pretty JSON array after `not deleted: ` and
 * repeats each as `record not deleted: <id>` in `errors`. Both sources must
 * agree, or the table is built on a body this parser does not understand.
 * Ids are INTS (WC-2026-08-10-section-id-int-canonical: TS addresses are ints
 * on the wire; the frozen text carries them as strings).
 */
function parseNotDeletedIds(msg: string, errors: readonly string[]): number[] {
	const marker = 'not deleted: ';
	const at = msg.indexOf(marker);
	if (at < 0) throw new Error(`delete_children_guard: no "${marker}" in frozen msg: ${msg}`);
	const fromMsg = (JSON.parse(msg.slice(at + marker.length)) as string[]).map((id) => Number(id));
	const fromErrors = errors
		.map((entry) => /^record not deleted: (\d+)$/.exec(entry)?.[1])
		.filter((id): id is string => id !== undefined)
		.map(Number);
	if (JSON.stringify(fromMsg) !== JSON.stringify(fromErrors)) {
		throw new Error(
			`delete_children_guard: msg ids ${JSON.stringify(fromMsg)} != errors ids ${JSON.stringify(fromErrors)}`,
		);
	}
	return fromMsg;
}

const DELETE_CHILDREN_GUARD_MSG =
	'Error. Request failed. [4] Some records were not deleted: [\n    "1363"\n]';
const DELETE_CHILDREN_GUARD_ERRORS = [
	'Se ha omitido la eliminación del registro actual porque tiene hijos : 1363 [1364]',
	'record not deleted: 1363',
];

/**
 * THE TOTAL TABLE — every root `result:false` body in
 * test/parity/fixtures/oracle_harvest/ (8 bodies, 7 files; pinned by
 * test/parity/error_envelope_transform.test.ts). Adding a frozen error body
 * without a row here throws at classification time.
 */
export const FROZEN_ERROR_BODIES: readonly FrozenErrorBodyEntry[] = [
	{
		gate: 'section_terms_differential',
		msg: 'Error. Invalid or empty locators',
		errors: ['bad_locators'],
		kind: 'error',
		code: 'section.bad_locators',
	},
	{
		gate: 'indexation_grid_differential',
		msg: 'Error. Request failed Trigger Error: (get_indexation_grid) Empty source properties (section_tipo, section_id, tipo are mandatory)',
		errors: ['invalid rqo source'],
		kind: 'error',
		code: 'request.invalid_source',
	},
	{
		// PHP: `Empty widget_obj for widget <name>` — the widget NAME is not
		// defined on the component (unknown widget_name).
		gate: 'get_widget_data_differential',
		msg: [' Empty widget_obj for widget no_such_widget'],
		errors: [],
		kind: 'error',
		code: 'widget.not_defined',
	},
	{
		// PHP: `Empty defined widgets for <model> : <label> [<tipo>]` — the
		// component defines NO widgets at all (widgets-less tipo).
		gate: 'get_widget_data_differential',
		msg: [' Empty defined widgets for dd_component_info : Nombre [rsc85] '],
		errors: [],
		kind: 'error',
		code: 'widget.empty',
	},
	{
		gate: 'delete_children_guard_differential',
		msg: DELETE_CHILDREN_GUARD_MSG,
		errors: DELETE_CHILDREN_GUARD_ERRORS,
		kind: 'error',
		code: 'record.delete_children_refused',
		details: {
			not_deleted: parseNotDeletedIds(DELETE_CHILDREN_GUARD_MSG, DELETE_CHILDREN_GUARD_ERRORS),
		},
	},
	{
		// PHP TypeError inside component_relation_index (null section_id).
		gate: 'relation_corpus_config',
		msg: 'Throwable Exception when calling Dédalo API: \n  locator::set_section_id(): Argument #1 ($value) must be of type string|int, null given, called in v7_php_frozen/master_dedalo/core/component_relation_index/class.component_relation_index.php on line 878',
		errors: ['An unexpected error occurred'],
		kind: 'php_fault_not_reproduced',
	},
	{
		// PHP fatal building a section context on a tipo with no section_list.
		gate: 'section_list_css_differential',
		msg: 'Throwable Exception when calling Dédalo API: \n  Call to a member function get_json() on false',
		errors: ['An unexpected error occurred'],
		kind: 'php_fault_not_reproduced',
	},
	{
		// PHP fatal building a section on a non-section tipo (tool start).
		gate: 'section_tool_start_differential',
		msg: 'Throwable Exception when calling Dédalo API: \n  Call to a member function set_lang() on false',
		errors: ['An unexpected error occurred'],
		kind: 'php_fault_not_reproduced',
	},
];

/** Exact-pair key: the frozen `(msg, errors)` bytes, nothing looser. */
function frozenErrorBodyKey(msg: unknown, errors: unknown): string {
	return JSON.stringify([msg ?? null, errors ?? null]);
}

const FROZEN_ERROR_BODY_INDEX: ReadonlyMap<string, FrozenErrorBodyEntry> = (() => {
	const index = new Map<string, FrozenErrorBodyEntry>();
	for (const entry of FROZEN_ERROR_BODIES) {
		const key = frozenErrorBodyKey(entry.msg, entry.errors);
		if (index.has(key)) throw new Error(`FROZEN_ERROR_BODIES: duplicate row ${key}`);
		index.set(key, entry);
	}
	return index;
})();

export function adoptErrorEnvelopeV2(body: unknown): AdoptedErrorEnvelope {
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		return { matched: false, kind: 'not_an_envelope', projection: null };
	}
	// A TS envelope v2 body (`ok` present) is never adopted: the transform is
	// fixture-side only. A body carrying BOTH `ok` and `result` is a converter
	// regression (the compat mirror came back) — refused the same way.
	if ('ok' in body) {
		return { matched: false, kind: 'ts_body_refused', projection: null };
	}
	if (!('result' in body)) {
		return { matched: false, kind: 'not_an_envelope', projection: null };
	}
	const envelope = body as { result: unknown; msg?: unknown; errors?: unknown };
	if (envelope.result !== false) {
		return { matched: true, kind: 'ok', projection: { ok: true, data: envelope.result } };
	}
	if (!('errors' in envelope)) {
		// `result:false` without `errors` is a nested payload (connection_status),
		// never a dd_manager error envelope.
		return { matched: false, kind: 'not_an_envelope', projection: null };
	}
	const entry = FROZEN_ERROR_BODY_INDEX.get(frozenErrorBodyKey(envelope.msg, envelope.errors));
	if (entry === undefined) {
		throw new Error(
			`unclassified frozen error body: ${JSON.stringify({ msg: envelope.msg, errors: envelope.errors })}`,
		);
	}
	if (entry.kind === 'php_fault_not_reproduced') {
		return { matched: true, kind: 'php_fault_not_reproduced', projection: null };
	}
	const error: { code: string; details?: Record<string, unknown> } = { code: entry.code as string };
	if (entry.details !== undefined) error.details = structuredClone(entry.details);
	return { matched: true, kind: 'error', projection: { ok: false, error } };
}

// ---------------------------------------------------------------------------
// THE TEST-TLD REPLAY SEAM (generic-`test`-TLD migration, phase 4)
// WC-2026-08-19-test-tld-replay — the WC-001 gate-side-transform pattern:
// the frozen store bytes are NOT edited and never can be (a re-harvest is
// impossible by definition, engineering/ORACLE_HARVEST.md). The FIXTURE side
// is read through the committed clone map instead, so a gate can be written
// entirely in generic `test`-TLD terms and still be compared against the
// install-term interaction PHP actually answered.
// ---------------------------------------------------------------------------

const TEST_DATA_DIR = join(import.meta.dir, '..', '..', 'src', 'core', 'test_data');

/**
 * A tipo token: lowercase TLD letters + digits, greedy on BOTH sides, so
 * `numisdata60` is one token and never `numisdata6` + `0`. This is the same
 * grammar the census uses (scripts/lib/tld_census.ts).
 */
const TIPO_TOKEN = /[a-z]+[0-9]+/g;

/** The ontology TLDs every installation ships (plan decision 1, minus `test*`). */
const ALLOWED_TLDS: ReadonlySet<string> = new Set([
	'dd',
	'rsc',
	'hierarchy',
	'ontology',
	'ontologytype',
	'lg',
]);

interface TipoMapFile {
	map: Record<string, { target: string; reason: string }>;
}
interface IdMapFile {
	pairs: Record<string, { section_tipo: string; section_id: number; kept: boolean }>;
}

export interface TestTldMap {
	/** `<tipo>` → its clone. */
	flat: ReadonlyMap<string, string>;
	/** `<section>@<tipo>` → its clone (a component tipo inside a SYNTHETIC twin). */
	scoped: ReadonlyMap<string, string>;
	/** The section tipos that scope a lookup (the `<section>` half above). */
	scopes: ReadonlySet<string>;
	/** clone → source tipo (the map is bijective; asserted at load). */
	inverse: ReadonlyMap<string, string>;
	/** Source TLDs of the clone set that are NOT install-invariant — the refusal set. */
	installTlds: ReadonlySet<string>;
	/** `<section_tipo>_<section_id>` → the corpus pair (MANY map to themselves). */
	ids: ReadonlyMap<string, { section_tipo: string; section_id: number }>;
	/** The same pairs, keyed by the TEST address (for unmapRqo). */
	inverseIds: ReadonlyMap<string, { section_tipo: string; section_id: number }>;
}

const tldOf = (token: string): string => token.replace(/[0-9]+$/, '');

let cachedMap: TestTldMap | null = null;

/**
 * Load the two COMMITTED sources of the seam — never a third:
 *   src/core/test_data/test_tld_tipo_map.json      (append-only, bijective)
 *   src/core/test_data/test_corpus/id_map.json     (derived with the corpus)
 * Cached per process: both files are immutable inputs, and this is a fixture
 * door, never a request path (the §4 isolation tripwire scans src/ only).
 */
export function testTldMap(): TestTldMap {
	if (cachedMap) return cachedMap;
	const tipoMap = JSON.parse(
		readFileSync(join(TEST_DATA_DIR, 'test_tld_tipo_map.json'), 'utf8'),
	) as TipoMapFile;
	const idMap = JSON.parse(
		readFileSync(join(TEST_DATA_DIR, 'test_corpus', 'id_map.json'), 'utf8'),
	) as IdMapFile;

	const flat = new Map<string, string>();
	const scoped = new Map<string, string>();
	const scopes = new Set<string>();
	const inverse = new Map<string, string>();
	const installTlds = new Set<string>();
	for (const [key, entry] of Object.entries(tipoMap.map)) {
		const at = key.indexOf('@');
		const source = at < 0 ? key : key.slice(at + 1);
		if (at >= 0) {
			scoped.set(key, entry.target);
			scopes.add(key.slice(0, at));
		} else {
			flat.set(key, entry.target);
		}
		if (inverse.has(entry.target)) {
			throw new Error(
				`test_tld_tipo_map is not bijective: '${entry.target}' is the clone of both ` +
					`'${inverse.get(entry.target)}' and '${source}'`,
			);
		}
		inverse.set(entry.target, source);
		const tld = tldOf(source);
		if (!ALLOWED_TLDS.has(tld)) installTlds.add(tld);
	}

	const ids = new Map<string, { section_tipo: string; section_id: number }>();
	const inverseIds = new Map<string, { section_tipo: string; section_id: number }>();
	for (const [key, pair] of Object.entries(idMap.pairs)) {
		const at = key.lastIndexOf('_');
		ids.set(key, { section_tipo: pair.section_tipo, section_id: pair.section_id });
		inverseIds.set(`${pair.section_tipo}_${pair.section_id}`, {
			section_tipo: key.slice(0, at),
			section_id: Number(key.slice(at + 1)),
		});
	}

	cachedMap = { flat, scoped, scopes, inverse, installTlds, ids, inverseIds };
	return cachedMap;
}

/* --------------------------------------------------------- the walk itself */

export interface TipoIdRewrites {
	/** Tipo tokens rewritten (keys + values + tokens embedded in a longer string). */
	tipos: number;
	/** section_id values RESOLVED through the corpus id map — identity pairs INCLUDED. */
	ids: number;
}

export type TipoIdMapKind =
	| 'adopted'
	| 'ts_body_refused'
	| 'install_tipo_left'
	| 'id_map_conflict'
	| 'key_collision'
	| 'uncloned_token_absent';

export interface AdoptedTipoIdMap<T> {
	/** The frozen body expressed in test-TLD terms (a deep copy; the input is untouched). */
	body: T;
	matched: boolean;
	kind: TipoIdMapKind;
	rewrites: TipoIdRewrites;
	/** The install tokens that survived the walk and are NOT declared (kind='install_tipo_left'). */
	leftovers: string[];
	/** Human coordinates for a refusal. */
	detail: string | null;
}

export interface UnclonedToken {
	/** The install token, exactly. */
	token: string;
	/** Why the clone has no twin for it, and what the gate does about it instead. */
	reason: string;
}

/**
 * INSTALL TOKENS THE CLONE DELIBERATELY HAS NO TWIN FOR — per gate, declared,
 * and EXERCISED. The closure that built the `test` TLD stops at the section
 * root, so a frozen body can still name the install node ABOVE it (the area
 * that parents the section). That is a fact about where the clone was cut, not
 * a surface the map missed, and it must not be able to hide: a token listed
 * here is tolerated by the leftover scan, and `adoptTipoIdMap` REFUSES when a
 * declared token is NOT in the body (the `stripCorpusScaleFields` anti-vacuity
 * pattern — a declaration that matches nothing is a stale exemption).
 *
 * A gate that declares one owes either an EXPLICIT assertion about the field
 * carrying it (see context_differential's clone-root block) or a written reason
 * why that field is outside what it compares. Tolerating the token is never the
 * same as quietly not comparing the field.
 */
export const UNCLONED_TOKENS: Record<string, readonly UnclonedToken[]> = {
	read_differential: [
		{
			token: 'numisdata1',
			reason:
				"The install AREA node above the cloned section, carried by context[0].parent_grouper of the same response. This gate compares data[] only — the context shape is context_differential's subject, and that gate asserts both sides of this seam explicitly.",
		},
	],
	context_differential: [
		{
			token: 'numisdata1',
			reason:
				"The install AREA node that parents numisdata6. The clone root testmint1 is parented by its own TLD root (testmint0), so the section entry's parent_grouper cannot be mapped — the gate asserts BOTH values explicitly instead of comparing them.",
		},
	],
};

/** Address keys whose value is a record id, and the sibling that names its section. */
const ID_KEYS_BY_SECTION_KEY: ReadonlyMap<string, readonly string[]> = new Map([
	['section_tipo', ['section_id', 'row_section_id']],
	['parent_section_tipo', ['parent_section_id']],
	['target_section_tipo', ['target_section_id']],
]);

/**
 * ADOPT THE TEST-TLD TERMS — rewrite one FROZEN PHP body from the install's
 * ontology into the generic `test` TLD, through the committed clone map.
 *
 * THE RULES, exactly (each one exists because a body broke without it):
 *
 *  1. KEYS AND VALUES ALIKE. A tipo is a key as often as it is a value — the
 *     `ddo_map`/`relation`/`meta` column maps are KEYED by component tipo, and
 *     the `css` block is keyed by a selector built from one. Both sides walk.
 *  2. EMBEDDED TOKENS. Every `[a-z]+[0-9]+` occurrence inside a longer string
 *     is rewritten in place (`rsc29_rsc170_5.jpg`, `numisdata6_numisdata16`,
 *     `.numisdata16 .wrapper`), so a media path or a compound id stays an
 *     address instead of becoming half-translated prose.
 *  3. SECTION-SCOPED COMPONENT TIPOS. A synthetic thesaurus twin's components
 *     are cloned PER SECTION (`cult1@hierarchy40` → `testcult1020`), because
 *     twenty-two sections were twinned from the SAME `hierarchy20` subtree. A
 *     flat token rewrite is therefore WRONG: the scope decides. The scope of an
 *     object is its own `section_tipo` when that names a scoped section,
 *     otherwise NOTHING when it names some other section (an inner `rsc205`
 *     item must not inherit the outer `cult1` scope), otherwise the enclosing
 *     object's scope.
 *  4. `section_id` ONLY NEXT TO ITS `section_tipo`. Ids are rewritten through
 *     the CORPUS id map, never through arithmetic, and only for an id key whose
 *     section-naming sibling is present in the same object. MANY pairs map to
 *     THEMSELVES (a seed-shipped section keeps its ids; the derive kept the
 *     source id of every cloned record too — 1080/1080 pairs today), so
 *     `rewrites.ids` counts RESOLUTIONS, not changes: an anti-vacuity check
 *     that demanded a changed id would demand a corpus accident.
 *  5. REFUSALS (matched:false, the `adoptErrorEnvelopeV2` precedent):
 *       - a TS-shaped body (`ok` present) — this transform is FIXTURE-SIDE
 *         ONLY; projecting the TS side would compare the engine with itself;
 *       - a body still carrying a clone-set install token after the walk
 *         (`install_tipo_left` + the tokens) — the map missed a surface;
 *       - an id pair whose corpus section disagrees with the rewritten
 *         `section_tipo` (`id_map_conflict`) — two sources of truth;
 *       - two source keys colliding on one rewritten key (`key_collision`).
 *     Every caller MUST assert `matched === true`.
 *
 * The leftover scan reads object KEYS and WHITESPACE-FREE string values only:
 * an address never contains a space, and free PHP prose (Spanish record text,
 * HTML) must not be able to redden a gate by accident.
 */
export function adoptTipoIdMap<T>(frozenBody: T, gate: string): AdoptedTipoIdMap<T> {
	const map = testTldMap();
	const rewrites: TipoIdRewrites = { tipos: 0, ids: 0 };
	const refuse = (kind: TipoIdMapKind, detail: string): AdoptedTipoIdMap<T> => ({
		body: frozenBody,
		matched: false,
		kind,
		rewrites,
		leftovers: [],
		detail: `${gate}: ${detail}`,
	});

	if (frozenBody !== null && typeof frozenBody === 'object' && !Array.isArray(frozenBody)) {
		if ('ok' in (frozenBody as Record<string, unknown>)) {
			return refuse(
				'ts_body_refused',
				'the body carries `ok` — adoptTipoIdMap is applied to FROZEN PHP bodies only',
			);
		}
	}

	let conflict: string | null = null;
	let collision: string | null = null;

	const rewriteToken = (token: string, scope: string | null): string | null => {
		if (scope !== null) {
			const scopedTarget = map.scoped.get(`${scope}@${token}`);
			if (scopedTarget !== undefined) return scopedTarget;
		}
		return map.flat.get(token) ?? null;
	};

	const rewriteString = (value: string, scope: string | null): string =>
		value.replace(TIPO_TOKEN, (token) => {
			const target = rewriteToken(token, scope);
			if (target === null) return token;
			rewrites.tipos += 1;
			return target;
		});

	const scopeOf = (node: Record<string, unknown>, inherited: string | null): string | null => {
		const raw = node.section_tipo;
		const name =
			typeof raw === 'string'
				? raw
				: Array.isArray(raw) && typeof raw[0] === 'string'
					? (raw[0] as string)
					: null;
		if (name === null) return inherited;
		return map.scopes.has(name) ? name : null;
	};

	const walk = (node: unknown, scope: string | null): unknown => {
		if (typeof node === 'string') return rewriteString(node, scope);
		if (Array.isArray(node)) return node.map((entry) => walk(entry, scope));
		if (node === null || typeof node !== 'object') return node;

		const source = node as Record<string, unknown>;
		const innerScope = scopeOf(source, scope);
		// The ids are resolved from the RAW (install-term) siblings, before any
		// rewrite touches them.
		const remappedIds = new Map<string, string | number>();
		for (const [sectionKey, idKeys] of ID_KEYS_BY_SECTION_KEY) {
			const rawSection = source[sectionKey];
			if (typeof rawSection !== 'string') continue;
			for (const idKey of idKeys) {
				const rawId = source[idKey];
				if (typeof rawId !== 'string' && typeof rawId !== 'number') continue;
				const pair = map.ids.get(`${rawSection}_${String(rawId)}`);
				if (pair === undefined) continue;
				const expectedSection = rewriteToken(rawSection, scope) ?? rawSection;
				if (pair.section_tipo !== expectedSection) {
					conflict ??= `id map pair '${rawSection}_${String(rawId)}' lands in '${pair.section_tipo}' but '${sectionKey}' rewrites to '${expectedSection}'`;
					continue;
				}
				// Preserve the JSON TYPE of the frozen value: a frozen address is a
				// numeric STRING in some bodies and an int in others, and the
				// string→int adoption is a DIFFERENT, separately-justified
				// transform (normalizeSectionIdTypes /
				// WC-2026-08-10-section-id-int-canonical). This one only changes
				// WHICH record is addressed.
				remappedIds.set(
					idKey,
					typeof rawId === 'string' ? String(pair.section_id) : pair.section_id,
				);
				rewrites.ids += 1;
			}
		}

		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(source)) {
			const newKey = rewriteString(key, innerScope);
			if (newKey !== key && Object.hasOwn(out, newKey)) {
				collision ??= `key '${key}' rewrites to '${newKey}', which the same object already carries`;
			}
			const remapped = remappedIds.get(key);
			out[newKey] = remapped !== undefined ? remapped : walk(entry, innerScope);
		}
		return out;
	};

	const body = walk(frozenBody, null) as T;
	if (conflict !== null) return refuse('id_map_conflict', conflict);
	if (collision !== null) return refuse('key_collision', collision);

	const declared = UNCLONED_TOKENS[gate] ?? [];
	const present = new Set(installTokensIn(body, map.installTlds));
	for (const entry of declared) {
		if (!present.has(entry.token)) {
			return refuse(
				'uncloned_token_absent',
				`declares uncloned token '${entry.token}', which the body does not carry. A declaration that matches nothing is a stale exemption.`,
			);
		}
		present.delete(entry.token);
	}
	const leftovers = [...present];
	if (leftovers.length > 0) {
		return {
			body,
			matched: false,
			kind: 'install_tipo_left',
			rewrites,
			leftovers,
			detail: `${gate}: ${leftovers.length} install token(s) survived the walk: ${leftovers.slice(0, 12).join(', ')}`,
		};
	}
	return { body, matched: true, kind: 'adopted', rewrites, leftovers: [], detail: null };
}

/**
 * Every clone-set install token left in a value, sorted and deduped. Reads
 * object KEYS and whitespace-free string values only (rule 5's scan).
 */
export function installTokensIn(
	value: unknown,
	installTlds: ReadonlySet<string> = testTldMap().installTlds,
): string[] {
	const found = new Set<string>();
	const scan = (text: string): void => {
		for (const token of text.match(TIPO_TOKEN) ?? []) {
			if (installTlds.has(tldOf(token))) found.add(token);
		}
	};
	const walk = (node: unknown): void => {
		if (typeof node === 'string') {
			if (!/\s/.test(node)) scan(node);
			return;
		}
		if (Array.isArray(node)) {
			for (const entry of node) walk(entry);
			return;
		}
		if (node === null || typeof node !== 'object') return;
		for (const [key, entry] of Object.entries(node)) {
			scan(key);
			walk(entry);
		}
	};
	walk(value);
	return [...found].sort();
}

/**
 * THE REQUEST SIDE — rewrite an RQO written in generic `test`-TLD terms BACK
 * into the install terms the frozen interaction was recorded under, so
 * `hashRequest` still finds it (wired into `lookupInteraction`).
 *
 * It is the exact inverse of `adoptTipoIdMap`'s token rule, and deliberately
 * NOT its inverse for anything else: an RQO is small, flat and authored by the
 * gate, so the scope machinery is unnecessary (the map is bijective — a clone
 * token names its source with no context). A token that is not a clone is left
 * verbatim, which is why running every already-install-term gate through this
 * function changes nothing: clone targets all live in a `test*` TLD, and the
 * hand-authored `test` nodes are all below the `test1000` allocation band.
 *
 * Ids travel through the corpus id map the same way, PRESERVING the JSON type
 * of the value the gate wrote (PHP recorded `section_id` as a string in some
 * requests and as an int in others; the hash is type-sensitive, so the gate
 * still writes the shape the frozen request used).
 */
export function unmapRqo(
	rqo: Record<string, unknown>,
	map: TestTldMap = testTldMap(),
): Record<string, unknown> {
	const unmapString = (value: string): string =>
		value.replace(TIPO_TOKEN, (token) => map.inverse.get(token) ?? token);

	const walk = (node: unknown): unknown => {
		if (typeof node === 'string') return unmapString(node);
		if (Array.isArray(node)) return node.map(walk);
		if (node === null || typeof node !== 'object') return node;
		const source = node as Record<string, unknown>;
		const sourceIds = new Map<string, string | number>();
		for (const [sectionKey, idKeys] of ID_KEYS_BY_SECTION_KEY) {
			const testSection = source[sectionKey];
			if (typeof testSection !== 'string') continue;
			for (const idKey of idKeys) {
				const testId = source[idKey];
				if (typeof testId !== 'string' && typeof testId !== 'number') continue;
				const pair = map.inverseIds.get(`${testSection}_${String(testId)}`);
				if (pair === undefined) continue;
				sourceIds.set(
					idKey,
					typeof testId === 'string' ? String(pair.section_id) : pair.section_id,
				);
			}
		}
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(source)) {
			const sourceId = sourceIds.get(key);
			out[unmapString(key)] = sourceId !== undefined ? sourceId : walk(entry);
		}
		return out;
	};
	return walk(rqo) as Record<string, unknown>;
}

/* ------------------------------------------------- corpus-scale projections */

export interface CorpusScaleField {
	/**
	 * Dot path, relative to the value the GATE passes (an item array, a body,
	 * a single item). A numeric segment indexes an array; `*` is every element
	 * of an array and every value of an object.
	 */
	path: string;
	/** Why this number is a function of records the corpus deliberately does not hold. */
	reason: string;
}

/**
 * NUMBERS THE REDUCED CORPUS CANNOT REPRODUCE — the B-class projection, one
 * entry per gate, every field justified in writing.
 *
 * The bar is deliberately high: a value belongs here ONLY when it counts rows
 * the corpus does not hold by design (an UNFILTERED total over the whole
 * install, a deep offset into it). A FILTERED search keeps its `total`
 * verbatim — that number is a fact about the situation the gate built, and
 * stripping it would delete the assertion.
 *
 * `stripCorpusScaleFields` REFUSES a path that is not present (the
 * `stripStateTotalItems` anti-vacuity pattern): a projection that silently
 * matches nothing is how a gate stops asserting what it claims to assert.
 */
export const CORPUS_SCALE_FIELDS: Record<string, readonly CorpusScaleField[]> = {
	relation_index_get_data_differential: [
		{
			path: '0.pagination.total',
			reason:
				'The inverse index counts EVERY record in the install that points at the term (1647 rsc205 rows); the corpus holds the FIVE the frozen pages actually revealed and materialized as inverse edges (derive_test_corpus.ts, audited as `inverse_edges[]` on rsc205/37,42,44,69,74). 5 ≠ 1647 by design — a corpus that held all 1647 would be the install. The paged item sequence itself — which is what this gate is about — is compared verbatim, and the non-empty floor above proves the index resolves.',
		},
	],
};

/** Resolve a dot path to its {parent, key} sites (no key existence check). */
function resolveScalePath(
	root: unknown,
	path: string,
): { parent: Record<string, unknown>; key: string }[] {
	const segments = path.split('.');
	let nodes: unknown[] = [root];
	for (const segment of segments.slice(0, -1)) {
		const next: unknown[] = [];
		for (const node of nodes) {
			if (node === null || typeof node !== 'object') continue;
			if (segment === '*') {
				next.push(...Object.values(node as Record<string, unknown>));
			} else {
				next.push((node as Record<string, unknown>)[segment]);
			}
		}
		nodes = next.filter((node) => node !== undefined);
	}
	const leaf = segments[segments.length - 1] as string;
	const sites: { parent: Record<string, unknown>; key: string }[] = [];
	for (const node of nodes) {
		if (node === null || typeof node !== 'object' || Array.isArray(node)) continue;
		sites.push({ parent: node as Record<string, unknown>, key: leaf });
	}
	return sites;
}

/**
 * Delete each declared corpus-scale field from a DEEP COPY of `value`, for the
 * gate named. Applied to BOTH sides of the diff (the engine emits the same
 * number over the reduced corpus — a different one, but present). Throws when
 * a declared path resolves to no site, or to a site that does not carry the
 * key: the declaration is then describing a body that no longer exists.
 */
export function stripCorpusScaleFields<T>(value: T, gate: string): T {
	const fields = CORPUS_SCALE_FIELDS[gate];
	if (fields === undefined || fields.length === 0) {
		throw new Error(
			`stripCorpusScaleFields: gate '${gate}' declares no corpus-scale fields — do not call it.`,
		);
	}
	const clone = structuredClone(value);
	for (const field of fields) {
		const sites = resolveScalePath(clone, field.path).filter((site) =>
			Object.hasOwn(site.parent, site.key),
		);
		if (sites.length === 0) {
			throw new Error(
				`stripCorpusScaleFields: gate '${gate}' declares '${field.path}', which is not present in the value handed to it. A projection that strips nothing asserts nothing.`,
			);
		}
		for (const site of sites) delete site.parent[site.key];
	}
	return clone;
}
