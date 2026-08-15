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
 */
export type ErrorEnvelopeKind = 'error' | 'ok' | 'not_an_envelope' | 'php_fault_not_reproduced';

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
	if (body === null || typeof body !== 'object' || Array.isArray(body) || !('result' in body)) {
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
