/**
 * THE FRONTIER — one shape for every ACL check at a section boundary
 * (SEC-01 / SEC-02 / DIFF-C, class closed 2026-08-28).
 *
 * A FRONTIER CROSSING is any read of another section's records reached from a
 * record the caller already holds: a search path hop (`LEFT JOIN LATERAL` over
 * a stored locator), an export ddo path hop (resolveRecordAtoms walking the
 * stored `relation` slice), a diffusion frontier drain (the queued related
 * records processBatch reads and PUBLISHES). Four such doors were found in one
 * audit round, two were fixed with two different shapes, and a class review
 * showed a fourth nobody had named. This module exists so a FIFTH door cannot
 * invent a sixth shape.
 *
 * ── THE FOUR PROPERTIES, decided ONCE ───────────────────────────────────────
 *
 *  1. WHERE THE CHECK LIVES — here. A crossing site never re-decides the rule;
 *     it builds a {@link FrontierScope} once per request/run and asks this
 *     module per step. The site owns only what it does with the answer.
 *
 *  2. WHAT IT IS KEYED ON — two independent keys, both required:
 *       • the RECORD key: may the caller read THIS record? (projects
 *         containment + the dd478 allow-list). In SQL that is the assembler's
 *         own predicate emitted into the hop's ON clause; out of SQL it is
 *         {@link frontierRecordAllowed}, which runs the same assembler through
 *         security/record_scope.ts. ONE rule, never a second copy.
 *       • the COMPONENT key: may the caller read THIS component of THAT
 *         section? — {@link frontierComponentAllowed}, whose one predicate is
 *         `ddoIsAuthorized`, under the exemptions declared below.
 *
 *  3. WHAT IT DOES ON REFUSAL — THE REFUSAL LAW, one line per surface. Written
 *     down here because the next implementer will look here first:
 *
 *       SEARCH    answers so that HIT and MISS are identical — the leaf becomes
 *                 `1=0`, the order entry is dropped to the section_id default.
 *                 The oracle stays closed: a refusal that is distinguishable
 *                 from a miss is itself the leak (begins-with / ends-with /
 *                 contains / `==` walk a hidden value out character by
 *                 character).
 *       EXPORT    THROWS `perm.denied`. An export is a deliverable; a silently
 *                 short cell is a corrupted one, and a heritage archive cannot
 *                 carry a column that is complete for one operator and quietly
 *                 truncated for another.
 *       DIFFUSION DROPS the row and leaves a ledger line. The published target
 *                 is public; a record the enqueuing principal may not read must
 *                 not be pushed there by them, and the run must still finish.
 *
 *     And in EVERY case the refusal is LOUD: {@link noteFrontierRefusal} writes
 *     a named operator log line and records a request-scoped notice. AGENTS.md
 *     forbids a silent narrowing even when the narrowing is correct — this
 *     programme has already shipped one (a search that answered `ok:true` with
 *     an empty set and a shrunken full_count, and a sort that silently became
 *     section_id).
 *
 *  4. WHAT IT RETURNS — a boolean, never a thrown error and never a narrowed
 *     value. The predicate answers the question; the SURFACE applies its law.
 *     Mixing the two is how one site ended up throwing where another dropped.
 *
 * ── THE EXEMPTIONS, and why refusing them was the OVER-REFUSAL ──────────────
 *
 * The component key over-refused on first landing (measured 2026-08-28, suite
 * database, a real non-admin principal built by the gate): the ORDER path of
 * EVERY `component_filter` column is engine-minted as
 * `[self, dd156@dd153]` (search/order_path.ts, PHP
 * component_filter::get_order_path) and `component_select_lang`'s as
 * `[self, hierarchy25@lg1]`. No profile in any install grants `dd153_dd156`
 * or `lg1_hierarchy25` — those sections are ENGINE INFRASTRUCTURE, not
 * curator-configured — so the grant resolved false and the sort silently
 * degraded to `section_id ASC` for every non-admin.
 *
 * The engine already declares those sections globally visible, and says so in
 * the RECORD half: `buildProjectsFilter` returns '' for
 * `config.features.filterSectionTipo` (dd153) "because projects are globally
 * visible", and {@link FRONTIER_VISIBLE_TABLES} exempts the shared
 * vocabulary/infrastructure tables outright. A component gate that refuses the
 * very targets the record gate exempts is not caution, it is a contradiction.
 * So the component key skips exactly the sections the record key already
 * declares ungated — no more.
 *
 * TWO SECTIONS ARE DELIBERATELY *NOT* EXEMPT, though `buildProjectsFilter`
 * names them:
 *   • dd234 (PROFILES). Its record exemption exists so a user can read the
 *     profile that grants them anything — a read of their OWN rights. It is not
 *     a licence to FILTER on dd774, the grant matrix itself, which would make
 *     "who holds what" searchable by anyone.
 *   • dd128 (USERS). `buildUsersProjectsFilter` is a RESTRICTION, not an
 *     exemption — it returns a predicate, never ''.
 *
 * ── WHAT THIS MODULE IS NOT ─────────────────────────────────────────────────
 *
 * Two neighbours answer a DIFFERENT question and answer it MORE STRICTLY. Both
 * are fail-closed, so neither is a hole — and both are ledgered rather than
 * silently widened from here:
 *
 *   - `relations/request_config/implicit.ts` filterAuthorizedRelated decides
 *     which ddos a widget may RENDER. It holds no exemption, so a non-admin's
 *     component_filter widget shows no project name today.
 *   - tool_export's GATE B (`diffusion/export/grid.ts`) decides whether the
 *     caller may ASK for a declared column, before any crossing happens. It
 *     keeps the bare `getPermissions >= 1`: the exemptions here exist for hops
 *     the ENGINE mints — a component_filter's sort path into the projects
 *     section, which no profile grants and which the caller never typed — not
 *     for a column a user declared. Reconciling the two would WIDEN the export,
 *     which is a decision, not a cleanup.
 *
 * Both are listed in the shrink-only census in
 * `test/unit/frontier_class_native.test.ts`.
 */

import { config } from '../../config/config.ts';
import { ddoIsAuthorized, type Principal } from './permissions.ts';
import { currentRequestContext } from './request_context.ts';

/** The three surfaces the refusal law is written for (property 3). */
export type FrontierSurface = 'search' | 'export' | 'diffusion';

/**
 * The per-request/per-run authorization scope a crossing site builds ONCE and
 * threads through. An ABSENT principal means an INTERNAL resolution (unit
 * harnesses, background warmups, the order-path/datalist self-builds) — the
 * posture `buildSearchSql`, `ddoIsAuthorized` and `buildUserRecordsFilter`
 * already take for a caller-less read: nothing to gate.
 */
export interface FrontierScope {
	/** The requesting principal; undefined = internal, nothing to gate. */
	readonly principal?: Principal;
	/** Which refusal law applies (property 3). */
	readonly surface: FrontierSurface;
	/** The concrete door, for the log line: 'search.filter', 'tool_export', … */
	readonly door: string;
}

/** ONE step of a crossing: the (section, component) pair about to be read. */
export interface FrontierStep {
	/** The step's DECLARED section — authoritative, as it already is for the
	 * table, the component model and the data column. */
	readonly sectionTipo: string;
	/** The component read THROUGH this step; absent = no component read here. */
	readonly componentTipo?: string;
	/** The step's matrix table when the caller already resolved it (search,
	 * diffusion). Absent is fine — the exemption then falls back to the
	 * section-tipo arm only. */
	readonly table?: string;
	/** The crossed record, when the site addresses one (export, diffusion). */
	readonly sectionId?: number | string;
}

/**
 * THE SEARCH SURFACE'S scope: a {@link FrontierScope} plus the RECORD key
 * expressed in SQL. The assembler builds the predicate (projects containment +
 * the dd478 allow-list, under its own exemptions) and the conform stage emits
 * it into each hop's ON clause — never into the WHERE.
 *
 * ON, NOT WHERE, and this is load-bearing: in the ON clause an unreadable
 * target simply does not join, so the alias is NULL and the leaf reads exactly
 * as it does for a record that holds no such relation at all; the main row
 * keeps its LEFT JOIN semantics and a negating leaf ($not/$nand/$nor) stays
 * sound. In the WHERE the same predicate would turn the LEFT JOIN into an inner
 * one and DROP main rows — a behaviour change AND an oracle in the opposite
 * direction.
 *
 * Returns '' when the hop's section is not gated for this caller; the hop then
 * joins byte-identically to the pre-ACL shape.
 */
export interface SqlFrontierScope extends FrontierScope {
	recordPredicate(step: { sectionTipo: string; table: string; alias: string }): Promise<string>;
}

/**
 * THE GLOBALLY-VISIBLE FRONTIER TABLES — the shared vocabulary/infrastructure
 * tables that carry NO project locators, so no caller's project scope can say
 * anything about their rows (PHP search::$ar_tables_skip_projects,
 * class.search.php:115 — set_up() auto-sets skip_projects_filter for them).
 * Gating them would blank the whole surface for every non-admin: the rule was
 * LATENT in TS until getComponentFilterTipo gained the virtual→real fallback
 * (2026-07-19), when hierarchy sections resolved a component_filter through
 * their real section and non-admin thesaurus searches returned EMPTY (caught
 * 2026-07-20 while chasing an autocomplete regression).
 *
 * IT LIVES HERE, not in the assembler, because the frontier's COMPONENT key
 * must read the SAME declaration the RECORD key does — a component gate that
 * refuses the very targets the record gate exempts is the over-refusal that
 * killed every non-admin's component_filter sort. `sql_assembler.ts` builds its
 * `PROJECTS_FILTER_EXEMPT_TABLES` FROM this set; there is no second list.
 *
 * ONE TABLE OF THE PHP SET IS NOT NAMED HERE: the per-user activity-stats
 * table. It is a subsystem-owned family (sql_confinement_tripwire T4, owner
 * `src/core/area_maintenance/user_stats.ts`) and naming it outside its owner is
 * itself a violation; it is also unreachable as a frontier — no stored locator
 * points into it — so the frontier has nothing to exempt. The assembler adds it
 * to ITS set, at the one call site that needs it, and the class gate asserts
 * the two sets differ by exactly one entry so neither can drift unnoticed.
 */
export const FRONTIER_VISIBLE_TABLES: ReadonlySet<string> = new Set([
	'matrix_list',
	'matrix_dd',
	'matrix_hierarchy',
	'matrix_hierarchy_main',
	'matrix_langs',
	'matrix_tools',
	'matrix_notes',
]);

/**
 * Path steps that address the ROW, not a component's data: the `section_id`
 * pseudo-tipo PHP's ontology_utils::check_active_tld allowlists for SQO paths,
 * and the structural columns an ORDER path may name directly. They carry no
 * ACL grant (there is no `<section>_section_id` row in any profile matrix), and
 * what they expose — record identity — is exactly what the RECORD key governs.
 * Gating them on a component grant would refuse every legitimate
 * `filter_by_list` / hierarchy-terms path instead of protecting anything.
 */
export const IDENTITY_PATH_TIPOS: ReadonlySet<string> = new Set([
	'section_id',
	'section_tipo',
	'id',
]);

/**
 * THE ONE READING OF A DECLARED (section, component) FIELD — the normalizer
 * every frontier site must use before it authorizes or resolves anything.
 *
 * It exists because a declared tipo arrives in more shapes than a string: the
 * export's ddo path segments, a client ddo's `section_tipo`, an SQO path step.
 * `ddoIsAuthorized` and `section/read.ts`'s record guard both read a ONE-ELEMENT
 * array as that element; a gate that read the raw field instead SKIPPED every
 * non-string shape while its consumers resolved them anyway, which is how
 * SEC-01 re-opened TOOLS-02 (`['test3']` satisfied the record guard and defeated
 * the gate). So there is now one reading, and it lives here rather than as a
 * private helper at each door.
 *
 * NULL = UNRESOLVABLE, and the caller must REFUSE rather than skip:
 *   - absent, null, a non-string, an empty string, an empty array;
 *   - a MULTI-ELEMENT array. `['a','b']` names no ONE pair, and the consumers
 *     disagree about which half wins — the record guard takes `[0]`, and
 *     nothing stops a future reader taking `.at(-1)`. Authorizing `a` while the
 *     walk resolves `b` is the S1 itself, so the AMBIGUITY is refused, not
 *     resolved. It refuses no lawful traffic: every producer in the tree (the
 *     client's calculate_component_path, export presets, the frozen tool_export
 *     parity fixtures) emits a plain non-empty string.
 */
/** A tipo is a non-empty string; anything else declares nothing. */
function nonEmptyTipo(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

export function resolveDeclaredTipo(value: unknown): string | null {
	// A LIST declares one tipo only when it holds exactly one: a multi-element
	// array names several sections, and picking any single element of it (the
	// first, the last) is the shape that re-opened SEC-01.
	if (Array.isArray(value)) return value.length === 1 ? nonEmptyTipo(value[0]) : null;
	return nonEmptyTipo(value);
}

/**
 * True when the engine itself declares this section globally visible — i.e.
 * the RECORD key emits no predicate for it BY DECLARATION (not because the
 * caller happens to be an admin). See the exemption note in the module header
 * for why dd234 and dd128 are excluded.
 */
export function frontierSectionIsGloballyVisible(sectionTipo: string, table?: string): boolean {
	if (table !== undefined && FRONTIER_VISIBLE_TABLES.has(table)) return true;
	// PHP `case DEDALO_FILTER_SECTION_TIPO_DEFAULT` — projects are globally visible.
	return sectionTipo === config.features.filterSectionTipo;
}

/**
 * THE ONE COMPONENT PREDICATE at every frontier (property 2). `ddoIsAuthorized`
 * is its only decision — the same predicate `section/read.ts`
 * buildStructureContextEntries and `filterAuthorizedRelated` run when they
 * decide whether the caller could legitimately BUILD this path at all.
 *
 * Never throws: the surface applies the law (property 4).
 */
export async function frontierComponentAllowed(
	scope: FrontierScope,
	step: FrontierStep,
): Promise<boolean> {
	if (scope.principal === undefined) return true; // internal resolution
	const componentTipo = step.componentTipo;
	if (componentTipo === undefined || componentTipo === '') return true; // no data read here
	if (IDENTITY_PATH_TIPOS.has(componentTipo)) return true;
	if (frontierSectionIsGloballyVisible(step.sectionTipo, step.table)) return true;
	return ddoIsAuthorized(scope.principal, step.sectionTipo, componentTipo);
}

/**
 * THE ONE RECORD PREDICATE for crossings that address a record OUTSIDE SQL
 * (export atoms, the diffusion frontier drain). It runs
 * `security/record_scope.ts principalCanAccessRecord`, which runs the REAL
 * assembler with the principal attached — so the per-record answer can never
 * drift from what the list shows (that drift is
 * WC-2026-08-09-users-section-record-scope's whole subject).
 *
 * The search surface does NOT call this: it emits the assembler's predicate
 * into the hop's ON clause instead, which is the same rule expressed in SQL and
 * costs no extra query.
 *
 * Dynamic import: record_scope → sql_assembler → conform → this module would be
 * a static cycle (import_scc_tripwire).
 */
export async function frontierRecordAllowed(
	scope: FrontierScope,
	sectionTipo: string,
	sectionId: number | string,
): Promise<boolean> {
	if (scope.principal === undefined) return true; // internal resolution
	if (scope.principal.isGlobalAdmin) return true;
	const numeric = Number(sectionId);
	if (!Number.isInteger(numeric)) return false; // no addressable record — fail closed
	// THROUGH filterLocatorsInScope, not principalCanAccessRecord directly: a
	// crossing arrives as a stored LOCATOR, and that door already carries the two
	// carve-outs a locator needs and a bare record probe does not —
	//   - a locator with no (section_tipo, section_id) identity scopes nothing;
	//   - the ROOT USER locator (dd128/-1) resolves to a LABEL only, and PHP
	//     resolves it for any caller with section permission, so an activity /
	//     "who" chip renders. Record access to it stays blocked by the
	//     assembler's own `section_id > 0`.
	// A frontier that re-derived those would refuse lawful traffic — an export
	// of any authored column would die for every non-admin — which is the defect
	// this class has already produced once in the opposite direction.
	const { filterLocatorsInScope } = await import('./record_scope.ts');
	const kept = await filterLocatorsInScope(
		[{ section_tipo: sectionTipo, section_id: numeric }],
		scope.principal,
		config.usersSectionTipo,
	);
	return kept.length > 0;
}

/** One recorded refusal — the operator-facing fact behind a narrowed answer. */
export interface FrontierRefusal {
	readonly surface: FrontierSurface;
	readonly door: string;
	readonly sectionTipo: string;
	readonly componentTipo?: string;
	readonly sectionId?: number | string;
	/** 'component' = no read grant; 'record' = outside the caller's scope. */
	readonly key: 'component' | 'record';
}

/**
 * MAKE THE REFUSAL LOUD (AGENTS.md: never silently narrow scope).
 *
 * Two channels, because they serve two readers:
 *   • a NAMED operator log line (`[frontier] REFUSED …`), which carries the
 *     coordinates — grep-able, and the only place the detail may appear
 *     (`perm.out_of_scope` declares no `details_keys`, so naming a hidden
 *     record's section/id on the wire is not available to it, and inventing
 *     one would be an undeclared wire change);
 *   • a REQUEST-SCOPED record, accumulated on the request context so the
 *     envelope layer can emit `notices:[{code:'perm.out_of_scope'…}]` beside
 *     `ok:true`. The accumulator lives on the ALS-scoped RequestContext object
 *     — one object per request, so it is bleed-safe by construction and needs
 *     no module state.
 *
 * Outside a request scope (a unit harness, a background job) only the log line
 * fires, exactly as `currentRequestId()` degrades to ''.
 */
export function noteFrontierRefusal(scope: FrontierScope, refusal: FrontierRefusal): void {
	const where = `${refusal.sectionTipo}${refusal.componentTipo === undefined ? '' : `.${refusal.componentTipo}`}${refusal.sectionId === undefined ? '' : `#${refusal.sectionId}`}`;
	const who = scope.principal === undefined ? 'internal' : `user ${scope.principal.userId}`;
	console.warn(
		`[frontier] REFUSED ${refusal.surface}/${refusal.door}: ${who} has no ${refusal.key} access to ${where} — the answer is narrowed, not complete`,
	);
	const context = currentRequestContext();
	if (context === undefined) return;
	if (context.frontierRefusals === undefined) context.frontierRefusals = [];
	context.frontierRefusals.push(refusal);
}

/**
 * The request's recorded refusals, for the envelope layer. Empty when nothing
 * was narrowed — a caller may then omit `notices` entirely.
 */
export function currentFrontierRefusals(): readonly FrontierRefusal[] {
	return currentRequestContext()?.frontierRefusals ?? [];
}

/**
 * The `notices[]` entry a narrowed answer must carry. ONE notice per request
 * however many crossings were refused: the count is itself an existence oracle
 * over records the caller may not see (the same reason
 * `scopeInverseReferenceHits` refuses to report "n hidden").
 *
 * `perm.out_of_scope` — "The record is out of the user scope" — is the registry
 * code that already states this fact; it declares no `details_keys`, so the
 * notice carries none (the log line carries the coordinates).
 */
export function frontierRefusalNotice():
	| { code: 'perm.out_of_scope'; label_key: string; retryable: false }
	| undefined {
	if (currentFrontierRefusals().length === 0) return undefined;
	return {
		code: 'perm.out_of_scope',
		label_key: 'error_perm_out_of_scope',
		retryable: false,
	};
}
