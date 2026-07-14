/**
 * Client-facing diffusion info + advisory + retry (the remaining
 * dd_diffusion_api actions the copied tool needs to RENDER its panels —
 * DIFFUSION_SPEC §2.3 action-set completeness).
 *
 * - get_diffusion_info ......... PHP dd_diffusion_api::get_diffusion_info
 *   (:355): { section_diffusion_nodes[], resolve_levels } — one accordion
 *   panel per node. Node shape per diffusion_utils::get_section_diffusion_nodes:
 *   { tipo, model, label, parents[], children[] } with per-child related
 *   info. The old Bun engine additionally stamped per-node readiness; we
 *   stamp `connection_status` from the NATIVE writer registry (a format we
 *   serve → 'ok'; not yet served → 'unavailable' — honest, never silent).
 * - get_engine_advisory ........ PHP dd_diffusion_api::get_engine_advisory
 *   (:1779): the client reads the body TOP-LEVEL ({state,title,checks,...},
 *   tool_diffusion.js:476-487). Natively there is no separate engine process
 *   — state reflects the in-process subsystem (job tables + target DB pool).
 * - retry_pending_deletions .... wraps the native retryPendingDiffusion()
 *   (dd1758 unpublish_pending rows, DIFFU-08 flip-in-place).
 */

import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { buildVirtualDiffusionTree, termLabelOf } from '../plan/virtual_tree.ts';
import type { VirtualTreeNode } from '../plan/virtual_tree.ts';
import { WRITER_REGISTRY } from '../writers/registry.ts';

/** One child field descriptor (PHP get_section_diffusion_nodes children map). */
interface DiffusionNodeChild {
	tipo: string;
	model: string | null;
	label: string | null;
	related_tipo: string | null;
	related_model: string | null;
	related_label: string | null;
}

/** One accordion panel descriptor for the tool. */
export interface SectionDiffusionNode {
	tipo: string;
	model: string;
	label: string | null;
	parents: { tipo: string; model: string }[];
	children: DiffusionNodeChild[];
	/** Element output format resolved from the parents path (native addition
	 * the old Bun enrichment also injected — the client shows readiness). */
	type: string | null;
	connection_status: 'ok' | 'unavailable';
}

/** Diffusion format type of the element that owns `node` (nearest in path). */
function elementTypeOf(
	node: VirtualTreeNode,
	elementTypesByTipo: Map<string, string>,
): string | null {
	for (const pathItem of node.parents) {
		if (pathItem.model === 'diffusion_element' || pathItem.model === 'diffusion_element_alias') {
			return elementTypesByTipo.get(pathItem.tipo) ?? null;
		}
	}
	return null;
}

/** PHP get_diffusion_info result payload for one section. */
export async function buildDiffusionInfo(sectionTipo: string): Promise<{
	section_diffusion_nodes: SectionDiffusionNode[];
	resolve_levels: number;
}> {
	const resolveLevels = Math.max(0, Number(readString('DEDALO_DIFFUSION_RESOLVE_LEVELS')) || 2);
	const tree = await buildVirtualDiffusionTree();
	if (tree === null) {
		return { section_diffusion_nodes: [], resolve_levels: resolveLevels };
	}

	// Element tipo → declared output type (properties->diffusion->type).
	const elementTypesByTipo = new Map<string, string>();
	for (const node of tree.nodes) {
		if (node.model === 'diffusion_element' || node.model === 'diffusion_element_alias') {
			const declared = (node.properties as { diffusion?: { type?: unknown } } | null)?.diffusion
				?.type;
			if (typeof declared === 'string') elementTypesByTipo.set(node.tipo, declared);
		}
	}

	const items: SectionDiffusionNode[] = [];
	const seenTipos = new Set<string>();
	for (const node of tree.nodes) {
		if (!node.relatedSections.includes(sectionTipo)) continue;
		// A node reachable through two element paths would panel twice —
		// one panel per node tipo (first path wins, PHP walk order).
		if (seenTipos.has(node.tipo)) continue;
		seenTipos.add(node.tipo);
		const children: DiffusionNodeChild[] = [];
		for (const childTipo of node.childrenTipos) {
			const childNode = await tree.index.nodeOf(childTipo);
			const relatedTipo = (await tree.index.relationTipos(childTipo))[0] ?? null;
			const relatedNode = relatedTipo === null ? null : await tree.index.nodeOf(relatedTipo);
			children.push({
				tipo: childTipo,
				model: childNode?.model ?? null,
				label: termLabelOf(childNode),
				related_tipo: relatedTipo,
				related_model: relatedNode?.model ?? null,
				related_label: termLabelOf(relatedNode),
			});
		}
		const type = elementTypeOf(node, elementTypesByTipo);
		items.push({
			tipo: node.tipo,
			model: node.model,
			label: node.label,
			parents: node.parents.map((item) => ({ tipo: item.tipo, model: item.model })),
			children,
			type,
			connection_status: type !== null && WRITER_REGISTRY.has(type) ? 'ok' : 'unavailable',
		});
	}
	return { section_diffusion_nodes: items, resolve_levels: resolveLevels };
}

/** Native subsystem advisory (client-top-level shape, PHP :1779 contract). */
export function buildEngineAdvisory(isAdmin: boolean): Record<string, unknown> {
	// The data plane is in-process + spawned runners over the durable queue —
	// there is no separate engine to be "down". Target-DB failures surface
	// per-run (loud open() errors) and per-panel (connection_status).
	return {
		result: true,
		state: 'ok',
		is_admin: isAdmin,
		recovered: false,
		title: 'Diffusion ready (native engine)',
		cause: '',
		steps: [],
		actions: [],
		checks: {
			engine: 'native',
			formats: [...WRITER_REGISTRY.keys()],
		},
		service_cmd_configured: false,
		log_tail: null,
	};
}

/**
 * Facade re-export for the INSTALL wizard's test_diffusion_connection step
 * (DEC-19): core/install/db_probe.ts reaches MariaDB ONLY through this facade
 * (boundary_seam rule), never the mariadb internals directly. The probe opens a
 * throwaway connection from posted credentials and closes it immediately.
 */
export async function probeDiffusionConnection(creds: {
	host: string;
	port: number;
	socket?: string;
	database: string;
	username: string;
	password: string;
}): Promise<{ result: boolean; msg: string }> {
	const { probeAdhocMariadbConnection } = await import('../targets/mariadb/db.ts');
	return probeAdhocMariadbConnection(creds);
}
