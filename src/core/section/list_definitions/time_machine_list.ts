/**
 * time_machine_list (SECTION_SPEC §7.4) — the inspector time-machine ACCESS
 * permission target. It has NO rendering resolver: it is a permission-flag node
 * whose grant governs whether the record-history (time machine) list is
 * accessible in the INSPECTOR — explicitly distinct from tool_time_machine
 * access (granted through the tools-profile system).
 *
 * PHP reference: the node participates in the component_security_access
 * permission tree (component_security_access.php:502,:885). The user's
 * permission level on the section's time_machine_list tipo governs access.
 *
 * SCOPE: TS has no component_security_access editor yet (LEDGERED), but the
 * runtime enforcement — gate the inspector TM read on the caller's permission
 * for the time_machine_list tipo — is implemented here and wired into the TM
 * read path. section_list is EXCLUDED from the permission tree (PHP :543);
 * time_machine_list and relation_list are INCLUDED (PHP :502).
 */

import { getPermissions, type Principal } from '../../security/permissions.ts';
import { findSectionChildByModel } from './node_find.ts';

/**
 * The CALLER SECTION a Time Machine read is scoped to, or null when the read is
 * unscoped (the bare dd15 browse). Derived from the SQO, which is where the real
 * target lives today: the client pins `source.section_tipo` to 'dd15' and puts
 * the actual section in the SQO — so reading `source.section_tipo` gates dd15
 * against itself and evaluates nothing (WC-2026-08-14-tm-scope-server-owned).
 *
 * Two SQO surfaces carry it, matching buildTmWhere's own precedence:
 *   1. `filter_by_locators` — the per-record / per-component history;
 *   2. a `tipo` COLUMN filter — the record-snapshot list, whose q IS the caller
 *      section tipo.
 * Neither present ⇒ the bare browse ⇒ null (and the floor stays admin-only).
 *
 * Mixed locators are refused rather than reduced: a read spanning two sections
 * cannot be authorized by one section's grant, and silently taking the first
 * would authorize the rest. Returning null makes it admin-only — fail-closed.
 */
export function resolveTimeMachineScopeSection(sqo: Record<string, unknown> | undefined): {
	sectionTipo: string | null;
	mixed: boolean;
} {
	if (sqo === undefined) return { sectionTipo: null, mixed: false };
	const fromLocators = scopeFromLocators(sqo);
	if (fromLocators !== null) return fromLocators;
	return { sectionTipo: scopeFromTipoFilter(sqo), mixed: false };
}

/**
 * The per-record / per-component surface: `filter_by_locators`. Null when the
 * SQO carries none, so the caller falls through to the next surface.
 *
 * Mixed sections are refused rather than reduced: a read spanning two sections
 * cannot be authorized by one section's grant, and silently taking the first
 * would authorize the rest.
 */
function scopeFromLocators(
	sqo: Record<string, unknown>,
): { sectionTipo: string | null; mixed: boolean } | null {
	const locators = sqo.filter_by_locators;
	if (!Array.isArray(locators) || locators.length === 0) return null;
	const tipos = locatorSectionTipos(locators);
	if (tipos.size > 1) return { sectionTipo: null, mixed: true };
	const [only] = tipos;
	return { sectionTipo: only ?? null, mixed: false };
}

/** The DISTINCT, non-empty `section_tipo` values a locator array addresses. */
function locatorSectionTipos(locators: readonly unknown[]): Set<string> {
	const tipos = new Set<string>();
	for (const locator of locators) {
		const tipo = (locator as { section_tipo?: unknown } | null)?.section_tipo;
		if (typeof tipo === 'string' && tipo !== '') tipos.add(tipo);
	}
	return tipos;
}

/**
 * The record-snapshot list surface: a `tipo` COLUMN filter whose q IS the caller
 * section tipo. Null when absent — the bare browse.
 */
function scopeFromTipoFilter(sqo: Record<string, unknown>): string | null {
	const filter = sqo.filter as { $and?: { q?: unknown; column_name?: unknown }[] } | undefined;
	const clause = filter?.$and?.find((entry) => entry?.column_name === 'tipo');
	const q = clause?.q;
	return typeof q === 'string' && q !== '' ? q : null;
}

/** A section's time_machine_list child tipo (virtual-aware), or null. */
export async function getTimeMachineListTipo(sectionTipo: string): Promise<string | null> {
	const node = await findSectionChildByModel(sectionTipo, 'time_machine_list');
	return node?.tipo ?? null;
}

/**
 * Whether `principal` may access the inspector time machine of `sectionTipo`
 * (PHP: the grant on the time_machine_list tipo, >= 1 = read the history).
 * When the section declares no time_machine_list node the target is absent, so
 * access falls back to global-admin only (fail-closed — a non-admin cannot see
 * record history the ontology never granted).
 */
export async function canAccessTimeMachineList(
	principal: Principal,
	sectionTipo: string,
): Promise<boolean> {
	if (principal.isGlobalAdmin) return true;
	const tipo = await getTimeMachineListTipo(sectionTipo);
	if (tipo === null) return false;
	const level = await getPermissions(principal, sectionTipo, tipo);
	return level >= 1;
}

// ---------------------------------------------------------------------------
// THE COLUMN AUTHORITY (WC-2026-08-14-tm-scope-server-owned)
// ---------------------------------------------------------------------------

/**
 * The dd15 META columns every Time Machine surface shows, in display order.
 * Kept here rather than in the client because a list whose columns are chosen
 * by the caller is not a permission boundary — it is a suggestion the server
 * used to mirror back (see the WC entry).
 */
const TM_META_COLUMNS: readonly string[] = [
	'dd1371', // Process (bulk_process_id)
	'dd559', // When    (timestamp)
	'dd578', // Who     (user portal → dd128)
	'dd577', // What    (the changed component tipo, «term» [tipo])
];

/** The TM annotation column (a note record in rsc832, keyed by the TM row id). */
const TM_NOTES_COLUMN = 'rsc329';
/** The raw snapshot column — debug only (WC-037). */
const TM_RAW_VALUE_COLUMN = 'dd1574';

/** What a Time Machine read is scoped to. Mirrors buildTmWhere's own surfaces. */
export type TimeMachineScopeKind =
	/** the inspector's RECORD-history block — a trimmed record surface */
	| 'inspector_record'
	/** the inspector's COMPONENT-history block — a trimmed component surface */
	| 'inspector_component'
	/** the bare dd15 browse — every section's history at once (global admin only) */
	| 'browse'
	/** one record's whole history (the inspector's record block, a dd_grid caller) */
	| 'record'
	/** ONE component of one record (the tool opened on a component) */
	| 'component'
	/** the record-SNAPSHOT list: whole-record saves of one section (the tool opened on a section) */
	| 'snapshot';

/**
 * The SURFACES a caller may name. The client says WHICH BLOCK it is rendering —
 * never which columns it wants: the columns stay a server decision, so this adds
 * no new way for a caller to widen its own list. An unknown value is ignored
 * (the scope falls back to the SQO-derived kind), never trusted.
 */
const NAMEABLE_SURFACES: ReadonlySet<string> = new Set(['inspector_record', 'inspector_component']);

export interface TimeMachineScope {
	readonly kind: TimeMachineScopeKind;
	/** The CALLER section — absent only for 'browse'. */
	readonly sectionTipo: string | null;
	/** The component tipo, for 'component' scope. */
	readonly tipo?: string;
}

/** One emitted column descriptor (the shape the client's columns_map consumes). */
export interface TimeMachineColumn {
	readonly tipo: string;
	readonly view: string | null;
}

/**
 * The columns a Time Machine surface shows, DERIVED from its authorised scope.
 *
 * This replaces `service_time_machine.build_request_config()`, which hand-built
 * the same list client-side and had the server mirror it back. The four shapes
 * below are exactly the four that function produced; deriving them here is what
 * lets an ordinary `section` instance render a history list, because a section
 * takes its columns from the section CONTEXT and cannot carry a caller-supplied
 * ddo_map.
 *
 * `null` = "no server opinion": the bare browse falls through to dd15's own
 * ontology `section_list`, exactly as any other section does.
 */
export async function tmListColumns(scope: TimeMachineScope): Promise<TimeMachineColumn[] | null> {
	const builder = SURFACE_COLUMNS[scope.kind];
	return builder === undefined ? null : builder(scope);
}

/** The meta block, as emitted columns. */
const metaColumns = (): TimeMachineColumn[] =>
	TM_META_COLUMNS.map((tipo) => ({ tipo, view: 'mini' }));

/** The component's own value column, when the scope names one. */
const componentColumn = (scope: TimeMachineScope): TimeMachineColumn[] =>
	typeof scope.tipo === 'string' && scope.tipo !== '' ? [{ tipo: scope.tipo, view: 'text' }] : [];

/**
 * One builder per surface. A new Time Machine surface is a new entry here and
 * nothing else — which is the point of moving this off the client, where every
 * caller assembled its own list and no two agreed.
 *
 * 'browse' is ABSENT on purpose: no server opinion, so dd15 falls back to its own
 * ontology `section_list` exactly like any other section.
 */
const SURFACE_COLUMNS: Partial<
	Record<
		TimeMachineScopeKind,
		(scope: TimeMachineScope) => TimeMachineColumn[] | Promise<TimeMachineColumn[]>
	>
> = {
	// The tool opened on a COMPONENT: meta, the annotation, the value itself.
	// `view:'text'` is the flat inline preview a history row wants, not the
	// click-to-edit default.
	component: (scope) => [
		...metaColumns(),
		{ tipo: TM_NOTES_COLUMN, view: 'note' },
		...componentColumn(scope),
	],

	// One record's whole history.
	record: () => [...metaColumns(), { tipo: TM_NOTES_COLUMN, view: 'note' }],

	// The tool opened on a SECTION: whole-record snapshots, so the caller
	// section's OWN list columns follow the meta block. Derived from that
	// section's ontology, never from anything the client sent.
	snapshot: async (scope) => {
		const columns = metaColumns();
		if (scope.sectionTipo === null) return columns;
		const { deriveSectionDdoMap } = await import('../read.ts');
		const own = await deriveSectionDdoMap(scope.sectionTipo, scope.sectionTipo, 'list');
		for (const ddo of own as { tipo?: unknown; view?: unknown }[]) {
			if (typeof ddo.tipo !== 'string') continue;
			columns.push({ tipo: ddo.tipo, view: typeof ddo.view === 'string' ? ddo.view : 'text' });
		}
		return columns;
	},

	// The inspector's two blocks are NARROWER — a side panel a few columns wide.
	// Process (dd1371) is dropped from both; the component block also drops What
	// (dd577), because every row in it is the same component. These reproduce
	// exactly what the inspector used to build client-side through
	// `ignore_columns`, so porting it changed no pixels.
	inspector_record: () => [
		{ tipo: 'dd559', view: 'mini' },
		{ tipo: 'dd578', view: 'mini' },
		{ tipo: 'dd577', view: 'mini' },
		{ tipo: TM_RAW_VALUE_COLUMN, view: 'mini' },
	],
	inspector_component: (scope) => [
		{ tipo: 'dd559', view: 'mini' },
		{ tipo: 'dd578', view: 'mini' },
		...componentColumn(scope),
		{ tipo: TM_NOTES_COLUMN, view: 'note' },
	],
};

/**
 * The scope a Time Machine READ is for, derived from the SQO it already carries.
 *
 * Deliberately derived rather than taken as a new client field: the SQO is the
 * thing the read is actually executed against (buildTmWhere reads the same three
 * surfaces), so deriving keeps the columns and the WHERE from ever disagreeing —
 * which is precisely the class of bug that let the client show one section's
 * columns over another section's rows.
 */
export function resolveTimeMachineScope(
	sqo: Record<string, unknown> | undefined,
	options: { surface?: unknown } = {},
): TimeMachineScope {
	const sectionTipo = resolveTimeMachineScopeSection(sqo).sectionTipo;
	if (sectionTipo === null) return { kind: 'browse', sectionTipo: null };

	const componentTipo = locatorComponentTipo(sqo);
	// A NAMED surface only ever narrows within the scope the SQO already proves.
	// It cannot reach another section's history, and it cannot add a column.
	const named = namedSurface(options.surface);
	const derived: TimeMachineScopeKind =
		componentTipo !== null ? 'component' : hasLocators(sqo) ? 'record' : 'snapshot';

	return {
		kind: named ?? derived,
		sectionTipo,
		...(componentTipo !== null ? { tipo: componentTipo } : {}),
	};
}

/** Whether the SQO scopes by locators at all (the per-record surfaces). */
function hasLocators(sqo: Record<string, unknown> | undefined): boolean {
	return Array.isArray(sqo?.filter_by_locators) && sqo.filter_by_locators.length > 0;
}

/** The component tipo a locator names, or null when the scope is record-wide. */
function locatorComponentTipo(sqo: Record<string, unknown> | undefined): string | null {
	const locators = sqo?.filter_by_locators;
	if (!Array.isArray(locators)) return null;
	const tipo = (locators[0] as { tipo?: unknown } | undefined)?.tipo;
	return typeof tipo === 'string' && tipo !== '' ? tipo : null;
}

/** A caller-named surface, or null when it names nothing recognised. */
function namedSurface(surface: unknown): TimeMachineScopeKind | null {
	return typeof surface === 'string' && NAMEABLE_SURFACES.has(surface)
		? (surface as TimeMachineScopeKind)
		: null;
}
