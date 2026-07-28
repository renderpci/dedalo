/**
 * tool_export.get_export_grid — the flat export table (PHP tool_export +
 * export_tabulator NDJSON protocol: meta/col/row/end lines, three data
 * formats, breakdown explosion, streaming/buffered duality).
 *
 * The build lives ENTIRELY in the unified diffusion export engine
 * (src/diffusion/export/ — DIFFUSION_PLAN D8/P6): shared plan compiler +
 * resolver atom entry point + the export_tabulator placement port. This
 * handler is the tools-registry facade only.
 *
 * History: an in-file legacy walker (behind an env kill-switch) coexisted
 * here through the P6 migration; it was DELETED 2026-07-08 when the
 * deep-breakdown rebuild made the unified engine the single implementation
 * (the legacy math mis-placed multi-hop grid_value atoms — see
 * test/parity/tool_export_breakdown_differential.test.ts, the oracle gate
 * that pinned the rebuild).
 */

import { getNode } from '../../../src/core/ontology/resolver.ts';
import { getParentTipo } from '../../../src/core/relations/children.ts';
import { buildRequestConfigForElement } from '../../../src/core/relations/request_config/build.ts';
import { extractSqoSectionTipos } from '../../../src/core/relations/request_config/explicit.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';
import { exportGridUnified } from '../../../src/diffusion/export/index.ts';

/**
 * Build the export grid through the unified engine (see module doc).
 *
 * GATE (SEC-024 §9.2, PHP tool_export::get_export_grid): the declarative module
 * gate asserts read on `options.section_tipo` only. PHP ALSO runs
 * `assert_section_array_permission($sqo->section_tipo, 1)` — the SQO carries its
 * own section list and it does not have to be the one that passed the first
 * gate, so exporting a section the caller cannot read was one options key away.
 * The assembler's principal scoping is the per-record projects filter (dd170),
 * a different boundary from the dd774 section grant, so it does not cover this.
 */
export async function toolExportGetExportGrid(context: ToolActionContext): Promise<ToolResponse> {
	const sqoSections = (context.options.sqo as { section_tipo?: unknown } | undefined)?.section_tipo;
	const targets = Array.isArray(sqoSections)
		? sqoSections
		: sqoSections === undefined || sqoSections === null
			? []
			: [sqoSections];
	for (const target of targets) {
		const sectionTipo = typeof target === 'string' ? target : '';
		if (
			sectionTipo === '' ||
			(await getPermissions(context.principal, sectionTipo, sectionTipo)) < 1
		) {
			return {
				result: false,
				msg: 'Error. Insufficient permissions on an sqo section target',
				errors: ['unauthorized'],
			};
		}
	}
	return exportGridUnified(context);
}

/**
 * tool_export.components_with_parent — which of the given relation components
 * point at a section that has a component_relation_parent (i.e. whose targets
 * can carry an ancestor chain). Powers the client's per-column "parents"
 * checkbox visibility (WC-049: the checkbox only renders when the column's
 * target section is hierarchical). Target sections resolve through the SAME
 * request-config builder the datalist uses (explicit configs, hierarchy_types,
 * 'self', implicit ontology relations); a component with ANY hierarchical
 * target answers true. Pure ontology lookup — no record data leaves the server.
 *
 * options.components: [{ tipo, section_tipo }] — the component and its OWNER
 * section ('self' targets resolve against it). Result: { [tipo]: boolean }.
 */
export async function toolExportComponentsWithParent(
	context: ToolActionContext,
): Promise<ToolResponse> {
	const raw = context.options.components;
	const components = Array.isArray(raw)
		? raw.filter(
				(entry): entry is { tipo: string; section_tipo: string } =>
					entry !== null &&
					typeof entry === 'object' &&
					typeof (entry as { tipo?: unknown }).tipo === 'string' &&
					typeof (entry as { section_tipo?: unknown }).section_tipo === 'string',
			)
		: [];
	if (components.length === 0) {
		return { result: false, msg: 'Error. Missing components', errors: ['invalid_request'] };
	}
	const result: Record<string, boolean> = {};
	for (const component of components) {
		if (result[component.tipo] !== undefined) continue;
		const node = await getNode(component.tipo);
		const config = await buildRequestConfigForElement(node?.properties ?? null, {
			ownerTipo: component.tipo,
			ownerSectionTipo: component.section_tipo,
			mode: 'list',
			ownerIsSection: false,
		});
		const targetSections = extractSqoSectionTipos(config[0]);
		let hasParent = false;
		for (const target of targetSections) {
			if ((await getParentTipo(target)) !== null) {
				hasParent = true;
				break;
			}
		}
		result[component.tipo] = hasParent;
	}
	return { result, msg: 'OK. Request done', errors: [] };
}
