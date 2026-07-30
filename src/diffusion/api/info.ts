/**
 * Client-facing diffusion info + advisory + retry (the remaining
 * dd_diffusion_api actions the copied tool needs to RENDER its panels —
 * DIFFUSION_SPEC §2.3 action-set completeness).
 *
 * - get_diffusion_info ......... PHP dd_diffusion_api::get_diffusion_info
 *   (:355): { section_diffusion_nodes[], resolve_levels } — one accordion
 *   panel per node. Node shape per diffusion_utils::get_section_diffusion_nodes:
 *   { tipo, model, label, parents[], children[] } with per-child related
 *   info. The old Bun engine additionally stamped per-node readiness; we stamp
 *   `connection_status` as the PHP object contract
 *   (diffusion_utils::get_connection_status :971, WC-065): a REAL reachability
 *   verdict `{result, msg}` for elements whose target is a MariaDB database,
 *   and `null` for every other format — the client then omits the row entirely
 *   (render_tool_diffusion.js:594-611). A failed probe is a rendered
 *   `result:false`, never a thrown panel.
 * - get_engine_advisory ........ PHP dd_diffusion_api::get_engine_advisory
 *   (:1779): the client reads the body TOP-LEVEL ({state,title,checks,...},
 *   tool_diffusion.js:476-487). Natively there is no separate engine process
 *   — state reflects the in-process subsystem (job tables + target DB pool).
 * - retry_pending_deletions .... wraps the native retryPendingDiffusion()
 *   (dd1758 unpublish_pending rows, DIFFU-08 flip-in-place).
 */

import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { isMariadbTargetFormat } from '../plan/formats.ts';
import { requireSqlIdentifier } from '../plan/identifier.ts';
import {
	buildVirtualDiffusionTree,
	getDatabaseNameForElement,
	termLabelOf,
} from '../plan/virtual_tree.ts';
import type { VirtualPathItem, VirtualTreeNode } from '../plan/virtual_tree.ts';
import { getTargetDatabaseStatus } from '../targets/mariadb/db.ts';
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

/**
 * Target-database readiness for one panel — the EXACT object the client reads
 * (`.result` → css class, `.msg` → text). PHP get_connection_status :971.
 */
export interface DiffusionConnectionStatus {
	result: boolean;
	msg: string;
}

/** One accordion panel descriptor for the tool. */
export interface SectionDiffusionNode {
	tipo: string;
	model: string;
	label: string | null;
	/** The oracle's path items — `label` IS the panel header (WC-066). */
	parents: { tipo: string; model: string; label: string | null; type?: string }[];
	children: DiffusionNodeChild[];
	/** Element output format resolved from the parents path (native addition
	 * the old Bun enrichment also injected — the client shows readiness). */
	type: string | null;
	/** `{result,msg}` for a MariaDB target; null otherwise (row omitted). */
	connection_status: DiffusionConnectionStatus | null;
}

/** The oracle's verbatim verdict strings (class.diffusion_utils.php:984/:988). */
const MSG_DATABASE_NOT_READY = 'Database is NOT ready (missing or engine unreachable).';

/**
 * One `parents[]` entry as it goes on the wire (WC-066). PHP put the whole
 * path item there (`$item->parents = $vnode->parents`, :265), built as
 * `{tipo, model, label}` plus `type` ONLY on a diffusion_element(_alias)
 * (:345-352). The client depends on both extra fields: `label` IS the
 * accordion panel header (render_tool_diffusion.js:493) and the group key
 * (:462); `type` feeds the per-format switch (:842).
 *
 * `realTipo` is deliberately NOT emitted — a TS-only alias-resolution memo
 * the oracle never had; the client has no use for it.
 */
export function toWirePathItem(item: VirtualPathItem): {
	tipo: string;
	model: string;
	label: string | null;
	type?: string;
} {
	const wire: { tipo: string; model: string; label: string | null; type?: string } = {
		tipo: item.tipo,
		model: item.model,
		label: item.label,
	};
	// Present exactly when the builder stamped it (element models only) — it
	// already applied PHP's `?? 'unknown'` fallback, so never re-default here.
	if (item.type !== undefined) wire.type = item.type;
	return wire;
}

/** The diffusion element that owns `node` (nearest in the parents path). */
function elementOf(
	node: VirtualTreeNode,
	elementTypesByTipo: Map<string, string>,
): { tipo: string; type: string | null } | null {
	for (const pathItem of node.parents) {
		if (pathItem.model === 'diffusion_element' || pathItem.model === 'diffusion_element_alias') {
			return { tipo: pathItem.tipo, type: elementTypesByTipo.get(pathItem.tipo) ?? null };
		}
	}
	return null;
}

/**
 * One panel's connection_status (WC-065). `null` whenever the element does not
 * publish into a MariaDB database — PHP's `default: // ignore` (:1002), which
 * makes the client omit the whole row rather than report a meaningless verdict.
 *
 * NEVER throws and never propagates: an unresolvable database name or a failed
 * probe is exactly PHP's result:false case (it logged logger::WARNING and
 * returned the object so the panel still rendered, :991-996). A throw here
 * would blank the entire accordion.
 *
 * `database` arrives as the RAW ontology label (getDatabaseNameForElement →
 * node.label, institution-editable). It MUST pass the same requireSqlIdentifier
 * chokepoint the publish plan uses (compile.ts:576) and the delete map uses
 * (diffusion_map.ts:488) — that helper NORMALIZES (lowercase, non-[a-z0-9_] →
 * '_'), so probing the raw label would address a DIFFERENT database than the
 * one actually written to: a label like `Web MDCAT` publishes to `web_mdcat`
 * and would be reported "NOT ready" while perfectly healthy. This is the
 * raw-vs-sanitized drift DIFF-A removed on the delete path
 * (src/core/db/sql_identifier.ts:5-16) — one producer, no second name.
 *
 * The prober is injectable so the shape gate runs without MariaDB.
 */
export async function connectionStatusForElement(
	type: string | null,
	database: string | null,
	nodeTipo: string,
	probe: (database: string) => Promise<DiffusionConnectionStatus> = getTargetDatabaseStatus,
): Promise<DiffusionConnectionStatus | null> {
	if (!isMariadbTargetFormat(type)) return null;
	if (database === null || database === '') {
		console.warn(
			`[diffusion] no target database resolved for connection_status [node ${nodeTipo}, type ${type}]`,
		);
		return { result: false, msg: MSG_DATABASE_NOT_READY };
	}
	// Inside the try: requireSqlIdentifier THROWS on a label that cannot yield a
	// valid identifier, and that must degrade to a rendered result:false too.
	try {
		return await probe(requireSqlIdentifier(database, 'database'));
	} catch (error) {
		console.warn(
			`[diffusion] connection_status probe failed [node ${nodeTipo}, database ${database}]`,
			error,
		);
		return { result: false, msg: MSG_DATABASE_NOT_READY };
	}
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
		const element = elementOf(node, elementTypesByTipo);
		const type = element?.type ?? null;
		// The verdict is memoized per database in the mariadb layer, so N panels
		// over the same target cost ONE round-trip.
		const connectionStatus = await connectionStatusForElement(
			type,
			element === null ? null : getDatabaseNameForElement(tree, element.tipo),
			node.tipo,
		);
		items.push({
			tipo: node.tipo,
			model: node.model,
			label: node.label,
			parents: node.parents.map(toWirePathItem),
			children,
			type,
			connection_status: connectionStatus,
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
