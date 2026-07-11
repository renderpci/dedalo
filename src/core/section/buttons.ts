/**
 * Section BUTTONS context (SECTION_SPEC §9).
 *
 * A section's action definitions — its ontology button_* children in order,
 * gated by permission and the disable/exclude rules, emitted as {typo,type,
 * tipo,model,label} DDOs. Extracted from resolve/structure_context.ts into the
 * section module home.
 *
 * PHP reference: common::get_buttons_context (class.common.php:4179-4326).
 * Per-button ACL: get_permissions(sectionTipo, buttonTipo) < 2 → skip (:4206);
 * properties.disable === true → skip (:4225); button_import excluded.
 */

import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { labelByTipo } from '../ontology/labels.ts';
import { getModelByTipo, getNode } from '../ontology/resolver.ts';
import { type Principal, getPermissions } from '../security/permissions.ts';

/** One emitted button DDO (PHP dd_object type='button'). */
export interface ButtonContext {
	typo: string;
	type: string;
	tipo: string;
	model: string;
	label: string | null;
}

/** Models excluded from the button context (PHP common::$ar_temp_exclude_models subset). */
const BUTTON_EXCLUDE_MODELS: ReadonlySet<string> = new Set(['button_import']);

/**
 * Ontology-derived caches for the section-context stamp (run on start + every
 * section read). Raw button rows per sectionTipo — permission filtering and
 * the disable check stay per-request downstream, so the rows are user-free.
 * relation_list resolution caches the null result too (a section WITHOUT a
 * relation_list child used to cost 2 queries on every stamp).
 */
const buttonRowsCache = createOntologyCache<string, { tipo: string; model: string }[]>();
const relationListTipoCache = createOntologyCache<string, string | null>();

export function clearSectionButtonsCache(): void {
	buttonRowsCache.clear();
	relationListTipoCache.clear();
}
registerOntologyCacheClearer(clearSectionButtonsCache);

/** A parent node's ordered raw button_* child rows (READ-ONLY, ontology order). */
async function readButtonRows(parent: string): Promise<{ tipo: string; model: string }[]> {
	return (await sql`
		SELECT tipo, model FROM dd_ontology
		WHERE parent = ${parent} AND model LIKE 'button_%'
		ORDER BY order_number NULLS LAST, tipo
	`) as { tipo: string; model: string }[];
}

/**
 * A section's ordered raw button_* child rows (READ-ONLY — shared cache
 * entry). Exported for the hub-completion identity probe
 * (test/unit/ontology_cache_hub_completion.test.ts); the production caller is
 * buildSectionButtons below.
 *
 * VIRTUAL-AWARE (PHP section::get_section_buttons_tipo, class.section.php:1121-1196):
 * a virtual section (its node's relations[0].tipo → a real section) INHERITS the
 * real section's button_* children, THEN appends its OWN, both filtered by the
 * tipos named in its FIRST exclude_elements child. A plain `WHERE parent = tipo`
 * query returns nothing for a virtual section whose only children are
 * section_list/exclude_elements (e.g. dd1244 → dd623 would lose button_new +
 * button_delete), which is why the buttons never rendered.
 */
export async function sectionButtonRows(
	sectionTipo: string,
): Promise<{ tipo: string; model: string }[]> {
	const cached = buttonRowsCache.get(sectionTipo);
	if (cached !== undefined) return cached;

	const ownRows = await readButtonRows(sectionTipo);

	// Resolve the real section (relations[0].tipo of model 'section'); non-virtual
	// sections resolve to themselves and take their own buttons unchanged (mirrors
	// section::get_section_real_tipo_static + resolveVirtualEditScope).
	const nodeRows = (await sql`
		SELECT relations FROM dd_ontology WHERE tipo = ${sectionTipo} LIMIT 1
	`) as { relations: { tipo?: unknown }[] | null }[];
	const candidate = nodeRows[0]?.relations?.[0]?.tipo;
	const realTipo =
		typeof candidate === 'string' &&
		candidate !== sectionTipo &&
		(await getModelByTipo(candidate)) === 'section'
			? candidate
			: null;

	let rows: { tipo: string; model: string }[];
	if (realTipo === null) {
		rows = ownRows;
	} else {
		// Excluded tipos: the FIRST exclude_elements child's relation nodes (PHP [0]).
		// Absent exclude_elements → nothing filtered (PHP logs a warning, continues).
		const exRows = (await sql`
			SELECT relations FROM dd_ontology
			WHERE parent = ${sectionTipo} AND model = 'exclude_elements'
			ORDER BY order_number NULLS LAST, id LIMIT 1
		`) as { relations: { tipo?: unknown }[] | null }[];
		const excluded = new Set<string>();
		for (const rel of exRows[0]?.relations ?? []) {
			if (typeof rel?.tipo === 'string') excluded.add(rel.tipo);
		}
		// Real section's buttons first, then the virtual section's own additions
		// (PHP [...children_real_tipos, ...children_virtual_tipos]); both filtered.
		// A button tipo has one parent, so the concat can't collide — no dedup.
		rows = [...(await readButtonRows(realTipo)), ...ownRows].filter((r) => !excluded.has(r.tipo));
	}

	buttonRowsCache.set(sectionTipo, rows);
	return rows;
}

/**
 * Build a section's button context. `principal`, when supplied, gates each
 * button by the real per-button ACL get_permissions(sectionTipo, buttonTipo) < 2
 * (PHP :4206). When only `callerPermissions` is available (legacy path), the
 * caller-level cap is used as a proxy — exact for the admin path, over-permissive
 * for non-admins (the §9 defect the Phase B principal wiring removes).
 */
export async function buildSectionButtons(
	sectionTipo: string,
	callerPermissions: number,
	principal?: Principal,
): Promise<ButtonContext[]> {
	// No principal: fall back to the caller-cap proxy (admin path exact).
	if (principal === undefined && callerPermissions < 2) return [];
	const rows = await sectionButtonRows(sectionTipo);
	const buttons: ButtonContext[] = [];
	for (const row of rows) {
		if (BUTTON_EXCLUDE_MODELS.has(row.model)) continue;
		// Per-button ACL (PHP :4206): with a principal, the real grant on this
		// button; without one, the caller cap (already checked >= 2 above).
		if (principal !== undefined) {
			const buttonPermission = await getPermissions(principal, sectionTipo, row.tipo);
			if (buttonPermission < 2) continue;
		}
		const node = await getNode(row.tipo);
		if ((node?.properties as { disable?: boolean } | null)?.disable === true) continue;
		buttons.push({
			typo: 'ddo',
			type: 'button',
			tipo: row.tipo,
			model: row.model,
			label: await labelByTipo(row.tipo),
		});
	}
	return buttons;
}

/**
 * A section's relation_list child tipo (PHP config.relation_list_tipo,
 * class.common.php:2094). PHP resolves it with resolve_virtual=true
 * (get_ar_children_tipo_by_model_name_in_section), so a VIRTUAL section
 * (relations[0].tipo → real section) inherits the real section's relation_list
 * node — e.g. rsc167 (virtual of rsc2) resolves rsc17 under rsc2.
 */
export async function sectionRelationListTipo(sectionTipo: string): Promise<string | null> {
	// has() (not get()) — a resolved NULL is a valid cached value here.
	if (relationListTipoCache.has(sectionTipo)) {
		return relationListTipoCache.get(sectionTipo) ?? null;
	}
	const read = async (parent: string) =>
		(await sql`
			SELECT tipo FROM dd_ontology WHERE parent = ${parent} AND model = 'relation_list' LIMIT 1
		`) as { tipo: string }[];
	let rows = await read(sectionTipo);
	if (rows.length === 0) {
		// virtual section: its node's relations[0].tipo points at the real section
		const nodeRows = (await sql`
			SELECT relations FROM dd_ontology WHERE tipo = ${sectionTipo} LIMIT 1
		`) as { relations: { tipo?: unknown }[] | null }[];
		const real = nodeRows[0]?.relations?.[0]?.tipo;
		if (typeof real === 'string') rows = await read(real);
	}
	const resolved = rows[0]?.tipo ?? null;
	relationListTipoCache.set(sectionTipo, resolved);
	return resolved;
}
