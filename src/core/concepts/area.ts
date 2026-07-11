/**
 * AREA — the non-data grouping definition (spec engineering/AREA_SPEC.md §1-2).
 *
 * An area is an ontology `model` that groups sections (the main data
 * definitions) or other areas; together the areas describe the shape of the
 * cultural-heritage organization (tangible, intangible, activities, …). An area
 * has a `tipo` but NO `section_id` and NO matrix row: `get_section_id()` is a
 * null shim, `get_matrix_table_from_tipo()` is null for area models. All areas
 * extend the PHP `area_common` base.
 *
 * PHP reference: core/area/class.area.php, core/area_common/class.area_common.php,
 * area tipo constants in core/base/dd_tipos.php.
 *
 * Contract highlights the rewrite MUST preserve:
 * - The area family partitions by BEHAVIOR, not by whether the class body is
 *   empty. `area` (the plain grouper, 71 live nodes) and the seven "no special
 *   behavior" stubs (root/admin/activity/resource/tool/publication/development)
 *   all render the DASHBOARD (statistics of the sections inside — §4). The two
 *   tree areas (thesaurus, ontology) render the ts_object hierarchy (§5).
 *   area_maintenance is its own widget dashboard (done; boundary only).
 * - The walk that finds "the sections inside" (PHP area::get_areas /
 *   area_common::get_dashboard_child_sections) INCLUDES area/section/section_tool
 *   and NEVER descends login/tools/section_list/filter (the deliberate `modelo`
 *   typo in the PHP property name is not significant here).
 * - The menu root order is a FIXED model order (PHP get_ar_root_area_tipos) and
 *   still carries `area_graph` even though the rewrite drops area_graph as a
 *   behavior (dead — user decision): the live menu emits its root, so menu
 *   parity requires it. That is why MENU_ROOT_MODEL_ORDER (menu ordering) and
 *   AREA_MODELS (behavior-carrying set) are DIFFERENT lists.
 *
 * WHERE THE ENGINE LIVES: this module is the PURE contract (model taxonomy,
 * walk-filter sets, tipo constants, predicates). The I/O-bearing resolvers live
 * in src/core/area/ (tree.ts, read.ts, and — Phase B — dashboard.ts), dispatched
 * through src/core/area/registry.ts. Kill every `startsWith('area')` sniff in
 * favor of isAreaModel() / areaBehaviorOf() so the taxonomy has ONE home.
 */

/** How an area model resolves its `read` payload. */
export type AreaBehavior = 'dashboard' | 'tree' | 'maintenance';

/**
 * The canonical set of area MODELS the rewrite covers, by behavior. This is the
 * single source of truth for "what is an area model" (spec §12 gate 6):
 * area_publication is present; area_graph is deliberately ABSENT (dead — it has
 * no behavior resolver and a read of it is ledgered/refused, not dashboarded).
 * area_maintenance is present but its behavior is owned by the widget subsystem.
 */
const AREA_BEHAVIOR: ReadonlyMap<string, AreaBehavior> = new Map<string, AreaBehavior>([
	// plain grouper + the seven no-special-behavior stubs → the dashboard
	['area', 'dashboard'],
	['area_root', 'dashboard'],
	['area_admin', 'dashboard'],
	['area_activity', 'dashboard'],
	['area_resource', 'dashboard'],
	['area_tool', 'dashboard'],
	['area_publication', 'dashboard'],
	['area_development', 'dashboard'],
	// tree areas (ts_object hierarchy)
	['area_thesaurus', 'tree'],
	['area_ontology', 'tree'],
	// widget dashboard (separate subsystem)
	['area_maintenance', 'maintenance'],
]);

/** The behavior-carrying area models (area_graph excluded — see module doc). */
export const AREA_MODELS: ReadonlySet<string> = new Set(AREA_BEHAVIOR.keys());

/**
 * Whether a model is an area model. Matches every real area model ('area' and
 * 'area_*') — behavior-identical to the former `startsWith('area')` sniffs on
 * real ontology data, without matching hypothetical non-area 'area…' strings.
 */
export function isAreaModel(model: string): boolean {
	return model === 'area' || model.startsWith('area_');
}

/**
 * The behavior resolver key for an area model, or null for area models the
 * rewrite does not cover as areas (e.g. area_graph — dead). Callers that need a
 * behavior for an UNKNOWN area model should treat null as "uncovered scope"
 * (fail loud / ledger), never silently dashboard it.
 */
export function areaBehaviorOf(model: string): AreaBehavior | null {
	return AREA_BEHAVIOR.get(model) ?? null;
}

/**
 * Area root models in the exact MENU order (PHP get_ar_root_area_tipos). Carries
 * area_graph for live menu parity even though the rewrite drops it as a behavior
 * (see module doc). Consumed only by the menu walk.
 */
export const MENU_ROOT_MODEL_ORDER: readonly string[] = [
	'area_root',
	'area_activity',
	'area_resource',
	'area_tool',
	'area_thesaurus',
	'area_graph',
	'area_admin',
	'area_maintenance',
	'area_development',
	'area_ontology',
];

/** Models a menu/dashboard descendant may have (PHP area::$ar_children_include_model_name). */
export const AREA_CHILD_INCLUDE_MODELS: ReadonlySet<string> = new Set([
	'area',
	'section',
	'section_tool',
]);

/** Models never walked into as area children (PHP area::$ar_children_exclude_modelo_name). */
export const AREA_CHILD_EXCLUDE_MODELS: ReadonlySet<string> = new Set([
	'login',
	'tools',
	'section_list',
	'filter',
]);

/**
 * The dashboard section walk excludes section_tool on TOP of the menu exclude
 * set (PHP get_dashboard_child_sections exclude list) — the dashboard counts
 * plain data sections, not tool faces. Menu items keep section_tool (they become
 * navigable tool deep links).
 */
export const DASHBOARD_CHILD_EXCLUDE_MODELS: ReadonlySet<string> = new Set([
	...AREA_CHILD_EXCLUDE_MODELS,
	'section_tool',
]);

// --- area tipo constants (core/base/dd_tipos.php + resolved-by-model) --------
export const AREA_ROOT_TIPO = 'dd242';
export const AREA_ADMIN_TIPO = 'dd207';
export const AREA_ACTIVITY_TIPO = 'dd69';
export const AREA_PUBLICATION_TIPO = 'dd222';
export const AREA_RESOURCE_TIPO = 'dd14';
export const AREA_TOOL_TIPO = 'dd35';
export const AREA_THESAURUS_TIPO = 'dd100';
export const AREA_ONTOLOGY_TIPO = 'dd5';
export const AREA_DEVELOPMENT_TIPO = 'dd770';
export const AREA_MAINTENANCE_TIPO = 'dd88';
