/**
 * ONTOLOGY LLM MAP builder (PHP ontology_data_io::export_llm_map, the map-
 * BUILDING half). Emits the flat, multilingual section → fields map that
 * agent/MCP tooling loads for O(1) section/field lookup without touching the
 * database:
 *
 *   [{ tipo, label: {lg-eng: …, lg-spa: …},
 *      fields: [{tipo, label, type, target?}] }, …]
 *
 * It REUSES the live MCP discovery machinery (SIMPLIFIED_TYPE_MAP,
 * sectionFieldNodes, linkTargetSections — PHP agent_view_builder::
 * section_label_map semantics: EXCLUDED_MODELS filtering, simplified types,
 * best-effort single link target), so the exported map exactly reflects what
 * the agent can address at query time.
 *
 * This module lives NEXT TO discovery.ts (src/ai) rather than in
 * core/ontology because the dependency direction is ai → core; the core-side
 * caller (core/ontology/data_io.ts exportLlmMap) reaches it through a lazy
 * import (engineering/CONVENTIONS.md §2 rationale 2 — sanctioned boundary seam into
 * the optional ai subsystem).
 *
 * PHP catch-and-continue parity: one broken section never aborts the whole
 * map — it is collected in `skipped` and building continues.
 */

import { config } from '../../../config/config.ts';
import { listSectionNodes } from '../../../core/ontology/resolver.ts';
import type { OntologySubtreeNode } from '../../../core/ontology/resolver.ts';
import {
	LINK_TARGET_MODELS,
	SIMPLIFIED_TYPE_MAP,
	linkTargetSections,
	sectionFieldNodes,
} from './discovery.ts';

/** One field entry of the LLM map (PHP export_llm_map field shape). */
export interface LlmMapField {
	tipo: string;
	/** Multilingual term object (all languages at once, PHP get_term_data). */
	label: Record<string, string>;
	/** Simplified type: text | html | number | date | geo | link | media | misc. */
	type: string;
	/** Best-effort link target hint — only one target listed (PHP parity). */
	target?: string;
}

/** One section entry of the LLM map. */
export interface LlmMapSection {
	tipo: string;
	label: Record<string, string>;
	fields: LlmMapField[];
}

/**
 * Injectable seams for fixture tests (production callers pass nothing). The
 * defaults are the live discovery/resolver implementations.
 */
export interface LlmMapDeps {
	listSectionNodes: () => Promise<{ tipo: string; term: Record<string, string> | null }[]>;
	sectionFieldNodes: (sectionTipo: string) => Promise<OntologySubtreeNode[]>;
	linkTargetSections: (
		componentTipo: string,
		sectionTipo: string,
		lang: string,
	) => Promise<string[]>;
}

/**
 * Build the LLM map for every dd_ontology node of model 'section'
 * (PHP dd_ontology_db_manager::search(['model'=>'section']) census).
 * Per-section failures are skipped and collected (PHP \Throwable catch).
 */
export async function buildLlmMap(
	deps: Partial<LlmMapDeps> = {},
): Promise<{ map: LlmMapSection[]; skipped: string[] }> {
	const listSections = deps.listSectionNodes ?? listSectionNodes;
	const fieldNodes = deps.sectionFieldNodes ?? sectionFieldNodes;
	const targetSections = deps.linkTargetSections ?? linkTargetSections;
	// PHP drives the field list with DEDALO_DATA_LANG (only the link-target
	// resolution is lang-parameterized; labels carry ALL languages regardless).
	const lang = config.menu.dataLang;

	const map: LlmMapSection[] = [];
	const skipped: string[] = [];
	for (const sectionNode of await listSections()) {
		try {
			const fields: LlmMapField[] = [];
			for (const node of await fieldNodes(sectionNode.tipo)) {
				const model = typeof node.model === 'string' ? node.model : '';
				const field: LlmMapField = {
					tipo: node.tipo,
					label: node.term ?? {},
					type: SIMPLIFIED_TYPE_MAP[model] ?? 'text',
				};
				if (LINK_TARGET_MODELS.has(model)) {
					// Best-effort; only one target listed (PHP first_target_section_tipo).
					const target = (await targetSections(node.tipo, sectionNode.tipo, lang))[0];
					if (target !== undefined) {
						field.target = target;
					}
				}
				fields.push(field);
			}
			map.push({
				tipo: sectionNode.tipo,
				label: sectionNode.term ?? {},
				fields,
			});
		} catch (error) {
			// Skip the failing section but keep building the rest (PHP parity).
			skipped.push(sectionNode.tipo);
			console.error(`[llm_map] Skipped section '${sectionNode.tipo}': ${(error as Error).message}`);
		}
	}
	return { map, skipped };
}
