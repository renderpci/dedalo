/**
 * Read-side port of the diffusion ONTOLOGY walk used by
 * `dd_diffusion_api::get_diffusion_info` (core/api/v1/common/class.dd_diffusion_api.php)
 * → `diffusion_utils::get_section_diffusion_nodes` (diffusion/class.diffusion_utils.php).
 *
 * This is the FLAT VIRTUAL DIFFUSION TREE: starting from the configured diffusion
 * domain node, it walks the diffusion ontology resolving `*_alias` nodes to their
 * real targets (and merging the real subtree), tracking which real nodes are
 * "consumed" by an alias so their naked branch is suppressed. Each visited node
 * becomes a virtual node (vnode) carrying its alias-aware parent path. The public
 * entry `getSectionDiffusionNodes` then keeps only the vnodes whose `related`
 * section relation (own, else the resolved real node's) targets the requested
 * section_tipo, and shapes each into the node payload the tool_diffusion UI reads.
 *
 * It reads ONLY from the ported OntologyRepository (labels, models, parent/children,
 * recursive children, relations) — there is no un-ported sub-piece — so it is fully
 * byte-reproducible against live PHP for the diffusion domain configured on the
 * instance.
 *
 * NB: PHP `diffusion_utils` memoises the virtual tree in a request-scoped static.
 * Here the equivalent memo lives on the per-call `WalkState` (no module-global
 * mutable state), mirroring the PHP statics minus the cross-request leak.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import { DEDALO_STRUCTURE_LANG } from '@dedalo/ontology';

/** PHP `DEDALO_DIFFUSION_TIPO` (core/base/dd_tipos.php). */
export const DEDALO_DIFFUSION_TIPO = 'dd1190';

/** A node in the alias-aware parent path of a vnode (PHP `$path_item`). */
export interface DiffusionParent {
  tipo: string;
  model: string | null;
  label: string | null;
  /** Present only for diffusion_element / diffusion_element_alias (the diffusion type). */
  type?: string;
}

/** A child field node descriptor (PHP `$ar_children[] = (object)[…]`). */
export interface DiffusionChild {
  tipo: string;
  model: string | null;
  label: string | null;
  related_tipo: string | null;
  related_model: string | null;
  related_label: string | null;
}

/** One matched diffusion node (PHP `$source_elements[]` item). */
export interface SectionDiffusionNode {
  tipo: string;
  model: string | null;
  label: string | null;
  parents: DiffusionParent[];
  children: DiffusionChild[];
}

/** Resolution of a node under the alias contract (PHP `resolve_node_with_alias`). */
interface ResolvedNode {
  tipo: string;
  label: string | null;
  model: string | null;
  real_tipo: string | null;
  is_alias: boolean;
  /** Effective properties: alias own, else inherited from the real node. */
  properties: Record<string, unknown> | null;
}

/** A fully-resolved virtual node (PHP `$vnode`). */
interface VNode {
  tipo: string;
  model: string | null;
  label: string | null;
  real_tipo: string | null;
  parents: DiffusionParent[];
  children_tipos: string[];
}

/** Config the walk needs that is NOT in the ontology (instance config). */
export interface DiffusionWalkConfig {
  /** PHP DEDALO_DIFFUSION_DOMAIN — the active publication domain term (e.g. 'numisdata_mib'). */
  diffusionDomain: string;
  /** PHP DEDALO_DATA_LANG — used for related_label + the domain-term match. */
  dataLang: string;
}

/** Per-call accumulator that replaces the PHP request-scoped statics. */
class WalkState {
  virtualTree: VNode[] | null = null;
}

const ALIAS_SUFFIX = '_alias';

function isAliasModel(model: string | null): boolean {
  return model !== null && model.includes(ALIAS_SUFFIX);
}

/**
 * PHP `resolve_alias_target`: resolve a single alias node to its immediate target
 * via the `related` relation filtered by the de-aliased model name.
 */
async function resolveAliasTarget(
  ontology: OntologyRepository,
  aliasTipo: string,
): Promise<string | null> {
  const model = await ontology.getModelByTipo(aliasTipo);
  if (!isAliasModel(model)) return null;
  const targetModel = (model as string).replace(ALIAS_SUFFIX, '');
  const resolved = await getArTipoByModelAndRelation(ontology, aliasTipo, targetModel, 'related', false);
  return resolved[0] ?? null;
}

/** PHP `resolve_alias_recursive`: follow alias→alias chains to the final real tipo. */
async function resolveAliasRecursive(
  ontology: OntologyRepository,
  tipo: string,
  maxDepth = 10,
): Promise<string | null> {
  if (maxDepth <= 0) return null;
  const resolvedTipo = await resolveAliasTarget(ontology, tipo);
  if (resolvedTipo === null) return null;
  const resolvedModel = await ontology.getModelByTipo(resolvedTipo);
  if (isAliasModel(resolvedModel)) {
    return resolveAliasRecursive(ontology, resolvedTipo, maxDepth - 1);
  }
  return resolvedTipo;
}

/**
 * PHP `ontology_node::get_ar_tipo_by_model_and_relation`: tipos reachable from
 * `tipo` via the relation type, filtered by model name (substring unless
 * `searchExact`). Only the relation types the diffusion walk needs are supported.
 */
async function getArTipoByModelAndRelation(
  ontology: OntologyRepository,
  tipo: string,
  modelName: string,
  relationType: 'children' | 'children_recursive' | 'related',
  searchExact: boolean,
): Promise<string[]> {
  if (!tipo) return [];

  let targets: string[] = [];
  switch (relationType) {
    case 'children':
      targets = await ontology.getChildren(tipo);
      break;
    case 'children_recursive':
      targets = await ontology.getRecursiveChildren(tipo);
      break;
    case 'related':
      targets = (await ontology.getRelationTipos(tipo)) ?? [];
      break;
  }

  const out: string[] = [];
  for (const t of targets) {
    const m = await ontology.getModelByTipo(t);
    if (!m) continue;
    if (searchExact ? m === modelName : m.includes(modelName)) out.push(t);
  }
  return out;
}

/**
 * PHP `resolve_node_with_alias`. For the walk we only need tipo/label/model/
 * real_tipo/is_alias (not the merged properties). Label uses STRUCTURE_LANG with
 * NO fallback, matching the PHP `get_term_by_tipo($tipo, STRUCTURE_LANG, true, false)`.
 */
async function resolveNodeWithAlias(
  ontology: OntologyRepository,
  tipo: string,
): Promise<ResolvedNode> {
  const model = await ontology.getModelByTipo(tipo);
  const isAlias = isAliasModel(model);
  let label = await ontology.getLabel(tipo, DEDALO_STRUCTURE_LANG, null, false);

  let realTipo: string | null = null;
  let properties: Record<string, unknown> | null = null;
  if (isAlias) {
    realTipo = await resolveAliasRecursive(ontology, tipo);
    if (realTipo !== null) {
      // Alias own properties first; inherit from the real node when the alias has none.
      const aliasProps = await ontology.getProperties(tipo);
      if (!aliasProps || Object.keys(aliasProps).length === 0) {
        properties = (await ontology.getProperties(realTipo)) as Record<string, unknown> | null;
      } else {
        properties = aliasProps as Record<string, unknown>;
      }
    }
  } else {
    properties = (await ontology.getProperties(tipo)) as Record<string, unknown> | null;
  }

  // PHP fallback label: wrap the with-fallback term in <em>…</em> when empty.
  if (!label) {
    const fb = await ontology.getLabel(tipo, DEDALO_STRUCTURE_LANG, null, true);
    label = '<em>' + (fb ?? '') + '</em>';
  }

  return { tipo, label, model, real_tipo: realTipo, is_alias: isAlias, properties };
}

/** PHP `get_diffusion_domain_tipo`. */
async function getDiffusionDomainTipo(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
): Promise<string | null> {
  const domainTipos = await getArTipoByModelAndRelation(
    ontology,
    DEDALO_DIFFUSION_TIPO,
    'diffusion_domain',
    'children',
    false,
  );
  for (const domainTipo of domainTipos) {
    // PHP compares get_term_by_tipo($tipo) (DEDALO_DATA_LANG, fallback) to the domain.
    const term = await ontology.getLabel(domainTipo, config.dataLang, [], true);
    if (term === config.diffusionDomain) return domainTipo;
  }
  return null;
}

/**
 * PHP `walk_virtual_diffusion_tree`: recursive alias-aware descent building the
 * flat virtual-node list with parent paths.
 */
async function walkVirtualDiffusionTree(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
  currentTipo: string,
  path: DiffusionParent[],
  allVirtualNodes: VNode[],
  consumedByAlias: Set<string>,
): Promise<void> {
  const resolved = await resolveNodeWithAlias(ontology, currentTipo);

  if (!resolved.is_alias && consumedByAlias.has(currentTipo)) {
    // Real node consumed by an alias elsewhere → skip this raw branch.
    return;
  }

  // Merge recursive children (alias own + real non-overridden, deduped by label).
  const ownChildren = await ontology.getRecursiveChildren(currentTipo);
  const realChildren =
    resolved.is_alias && resolved.real_tipo !== null
      ? await ontology.getRecursiveChildren(resolved.real_tipo)
      : [];

  // PHP keys the dedup by get_term_by_tipo($child_tipo) (DEDALO_DATA_LANG, fallback).
  const mergedChildrenTipos: string[] = [];
  const labelsSeen = new Set<string>();
  for (const childTipo of ownChildren) {
    const label = (await ontology.getLabel(childTipo, config.dataLang, [], true)) ?? '';
    labelsSeen.add(label);
    mergedChildrenTipos.push(childTipo);
  }
  for (const childTipo of realChildren) {
    const label = (await ontology.getLabel(childTipo, config.dataLang, [], true)) ?? '';
    if (!labelsSeen.has(label)) mergedChildrenTipos.push(childTipo);
  }

  allVirtualNodes.push({
    tipo: resolved.tipo,
    model: resolved.model,
    label: resolved.label,
    real_tipo: resolved.real_tipo,
    parents: path,
    children_tipos: mergedChildrenTipos,
  });

  // Build this node's path item (prepended for descendants).
  const pathItem: DiffusionParent = {
    tipo: resolved.tipo,
    model: resolved.model,
    label: resolved.label,
  };
  if (resolved.model === 'diffusion_element' || resolved.model === 'diffusion_element_alias') {
    const type = readDiffusionType(resolved.properties);
    pathItem.type = type ?? 'unknown';
  }
  const newPath: DiffusionParent[] = [pathItem, ...path];

  // Recurse into direct children (own + real, deduped by tipo).
  let childrenTipos = await ontology.getChildren(currentTipo);
  if (resolved.is_alias && resolved.real_tipo) {
    const realDirect = await ontology.getChildren(resolved.real_tipo);
    childrenTipos = [...childrenTipos, ...realDirect];
  }
  const uniqueChildren = [...new Set(childrenTipos)];
  for (const childTipo of uniqueChildren) {
    await walkVirtualDiffusionTree(ontology, config, childTipo, newPath, allVirtualNodes, consumedByAlias);
  }
}

/** Read properties->diffusion->type defensively (PHP `$resolved->properties->diffusion->type`). */
function readDiffusionType(props: unknown): string | null {
  if (!props || typeof props !== 'object') return null;
  const diffusion = (props as Record<string, unknown>)['diffusion'];
  if (!diffusion || typeof diffusion !== 'object') return null;
  const type = (diffusion as Record<string, unknown>)['type'];
  return typeof type === 'string' ? type : null;
}

/** PHP `get_virtual_diffusion_tree` (memoised per WalkState). */
async function getVirtualDiffusionTree(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
  state: WalkState,
): Promise<VNode[]> {
  if (state.virtualTree !== null) return state.virtualTree;

  const domainTipo = await getDiffusionDomainTipo(ontology, config);
  if (domainTipo === null) {
    state.virtualTree = [];
    return state.virtualTree;
  }

  // 1. Find all real tipos consumed by an alias within the domain.
  const mainNodes = await ontology.getRecursiveChildren(domainTipo);
  const consumedByAlias = new Set<string>();
  for (const nodeTipo of mainNodes) {
    const model = await ontology.getModelByTipo(nodeTipo);
    if (isAliasModel(model)) {
      const realTipo = await resolveAliasRecursive(ontology, nodeTipo);
      if (realTipo) consumedByAlias.add(realTipo);
    }
  }

  // 2. Walk top-down.
  const allVirtualNodes: VNode[] = [];
  await walkVirtualDiffusionTree(ontology, config, domainTipo, [], allVirtualNodes, consumedByAlias);

  state.virtualTree = allVirtualNodes;
  return allVirtualNodes;
}

/**
 * PHP `diffusion_utils::get_section_diffusion_nodes`. Walks the flat virtual
 * diffusion tree and returns every vnode whose `related` section relation (own,
 * else the resolved real node's) targets `sectionTipo`, shaped as the UI payload.
 *
 * Vnodes are NOT deduplicated: the same real tipo reached through two distinct
 * alias paths legitimately appears twice (with different parent chains) — matching
 * PHP byte-for-byte.
 */
export async function getSectionDiffusionNodes(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
  sectionTipo: string,
  state: WalkState = new WalkState(),
): Promise<SectionDiffusionNode[]> {
  const allVirtualNodes = await getVirtualDiffusionTree(ontology, config, state);

  const out: SectionDiffusionNode[] = [];
  for (const vnode of allVirtualNodes) {
    let relatedSections = await getArTipoByModelAndRelation(ontology, vnode.tipo, 'section', 'related', true);
    if (relatedSections.length === 0 && vnode.real_tipo) {
      relatedSections = await getArTipoByModelAndRelation(ontology, vnode.real_tipo, 'section', 'related', true);
    }

    if (relatedSections.length === 0 || !relatedSections.includes(sectionTipo)) continue;

    const children: DiffusionChild[] = [];
    for (const childTipo of vnode.children_tipos) {
      // PHP child label: $child_node->get_term($child_tipo) — the tipo is passed as
      // the lang arg (always absent) so it falls back to STRUCTURE_LANG / any.
      const childLabel = await ontology.getLabel(childTipo, childTipo, [], true);
      const relationTipos = (await ontology.getRelationTipos(childTipo)) ?? [];
      const relationTipo = relationTipos[0] ?? null;
      children.push({
        tipo: childTipo,
        model: await ontology.getModelByTipo(childTipo),
        label: childLabel,
        related_tipo: relationTipo,
        related_model: relationTipo ? await ontology.getModelByTipo(relationTipo) : null,
        related_label: relationTipo ? await ontology.getLabel(relationTipo, config.dataLang, [], true) : null,
      });
    }

    out.push({
      tipo: vnode.tipo,
      model: vnode.model,
      label: vnode.label,
      parents: vnode.parents,
      children,
    });
  }

  return out;
}

// ───────────────────────────── validate (read-side) ──────────────────────────
//
// Port of the ONTOLOGY-only parts of `dd_diffusion_api::validate`
// (core/api/v1/common/class.dd_diffusion_api.php) + the diffusion_utils helpers it
// drives. validate inspects DIFFUSION-ONTOLOGY STRUCTURE only — it never calls
// get_ddo_map, dd_object, the parser/chain processor, or MariaDB. Every check reads
// raw ontology_node data (model, label, properties, related/children relations), so
// it is byte-reproducible from the ported OntologyRepository, exactly like the
// get_diffusion_info walk above.
//
// The one PHP path that is NOT reproducible is a non-resolvable requested tipo:
// PHP's resolve_node_with_alias runs `str_contains($model, '_alias')` on a null
// model and the global API exception handler returns a Throwable envelope. The
// handler gate declines (→ proxy) when the requested element model is null, so this
// native path is only entered for resolvable tipos.

const KNOWN_DIFFUSION_TYPES = ['sql', 'rdf', 'xml', 'socrata', 'markdown'] as const;

/** One check result (PHP `(object)['check','result','msg']`). */
export interface DiffusionCheck {
  check: string;
  result: boolean;
  msg: string;
}

/** One validated element (PHP `$data[]` item). */
export interface DiffusionValidateElement {
  element_tipo: string;
  label: string | null;
  type: string | null;
  result: boolean;
  checks: DiffusionCheck[];
}

/** The validate response payload (PHP `$response`). */
export interface DiffusionValidateResult {
  result: boolean;
  msg: string;
  errors: string[];
  data: DiffusionValidateElement[];
}

/** PHP `to_string()` for the scalars validate feeds it: null → '', else String(). */
function toStringPhp(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/** Read `properties->diffusion->service_name` defensively. */
function readServiceName(props: unknown): string | null {
  if (!props || typeof props !== 'object') return null;
  const diffusion = (props as Record<string, unknown>)['diffusion'];
  if (!diffusion || typeof diffusion !== 'object') return null;
  const sn = (diffusion as Record<string, unknown>)['service_name'];
  return typeof sn === 'string' ? sn : null;
}

/**
 * PHP `diffusion_utils::get_related_section_tipo`: the first `section`-model node
 * related to `tipo`; for an alias node, de-aliases via the `related` relation
 * (de-aliased model) and recurses.
 */
async function getRelatedSectionTipo(
  ontology: OntologyRepository,
  tipo: string,
): Promise<string | null> {
  const sections = await getArTipoByModelAndRelation(ontology, tipo, 'section', 'related', true);
  if (sections.length > 0) return sections[0]!;

  const model = await ontology.getModelByTipo(tipo);
  if (isAliasModel(model)) {
    const searchModel = (model as string).replace(ALIAS_SUFFIX, '');
    const related = await getArTipoByModelAndRelation(ontology, tipo, searchModel, 'related', true);
    const relatedTipo = related[0] ?? null;
    if (relatedTipo === null) return null;
    return getRelatedSectionTipo(ontology, relatedTipo);
  }
  return null;
}

/**
 * PHP `diffusion_utils::element_path_matches`: whether a virtual-tree path item is
 * the given diffusion element (direct tipo match, or alias path item whose resolved
 * real tipo matches).
 */
async function elementPathMatches(
  ontology: OntologyRepository,
  pathItem: DiffusionParent,
  elementTipo: string,
): Promise<boolean> {
  if (pathItem.model !== 'diffusion_element' && pathItem.model !== 'diffusion_element_alias') {
    return false;
  }
  if (pathItem.tipo === elementTipo) return true;
  if (pathItem.model === 'diffusion_element_alias') {
    const realTipo = await resolveAliasRecursive(ontology, pathItem.tipo);
    if (realTipo === elementTipo) return true;
  }
  return false;
}

/**
 * PHP `diffusion_utils::get_diffusion_sections_from_diffusion_element`: every section
 * tipo targeted by a diffusion element, walking the flat virtual tree, keeping nodes
 * whose parent path contains the element, in first-seen order (no duplicates).
 */
async function getDiffusionSectionsFromElement(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
  state: WalkState,
  elementTipo: string,
): Promise<string[]> {
  const tree = await getVirtualDiffusionTree(ontology, config, state);
  const out: string[] = [];
  for (const vnode of tree) {
    let inElement = false;
    for (const pathItem of vnode.parents) {
      if (await elementPathMatches(ontology, pathItem, elementTipo)) {
        inElement = true;
        break;
      }
    }
    if (!inElement) continue;

    let related = await getRelatedSectionTipo(ontology, vnode.tipo);
    if (!related && vnode.real_tipo) {
      related = await getRelatedSectionTipo(ontology, vnode.real_tipo);
    }
    if (related && !out.includes(related)) out.push(related);
  }
  return out;
}

/**
 * PHP `diffusion_utils::get_database_name_for_element`: the label of the first
 * `database`/`database_alias` virtual node whose parent path contains the element.
 */
async function getDatabaseNameForElement(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
  state: WalkState,
  elementTipo: string,
): Promise<string | null> {
  const tree = await getVirtualDiffusionTree(ontology, config, state);
  for (const vnode of tree) {
    if (vnode.model !== 'database' && vnode.model !== 'database_alias') continue;
    for (const pathItem of vnode.parents) {
      if (await elementPathMatches(ontology, pathItem, elementTipo)) {
        return vnode.label;
      }
    }
  }
  return null;
}

/**
 * PHP `diffusion_utils::get_section_node_for_element`: the section diffusion node of
 * `elementTipo` for `sectionTipo` — the first node whose FIRST element-model path
 * item matches the element. Mirrors the PHP `break` after the first element item.
 */
async function getSectionNodeForElement(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
  state: WalkState,
  elementTipo: string,
  sectionTipo: string,
): Promise<SectionDiffusionNode | null> {
  const nodes = await getSectionDiffusionNodes(ontology, config, sectionTipo, state);
  for (const node of nodes) {
    for (const pathItem of node.parents) {
      if (pathItem.model !== 'diffusion_element' && pathItem.model !== 'diffusion_element_alias') {
        continue;
      }
      if (await elementPathMatches(ontology, pathItem, elementTipo)) return node;
      break; // first element item decides this node's element
    }
  }
  return null;
}

/**
 * PHP `diffusion_utils::get_diffusion_map` element collection (the no-arg validate
 * scope). Walks the diffusion domain → groups → elements (alias-resolved first, then
 * direct), de-duplicated by element_tipo in first-insertion order. sql/socrata
 * elements with NO resolvable database (real or via database_alias) are skipped,
 * exactly like PHP. The connection_status (MariaDB) branch is never taken here.
 */
async function getDiffusionMapElementTipos(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
): Promise<string[]> {
  // Locate the diffusion domain by term (PHP get_diffusion_map domain match).
  const domainTipos = await getArTipoByModelAndRelation(
    ontology,
    DEDALO_DIFFUSION_TIPO,
    'diffusion_domain',
    'children',
    false,
  );
  let domainTipo: string | null = null;
  for (const t of domainTipos) {
    // PHP: get_term_by_tipo($tipo, STRUCTURE_LANG, true, false) (no fallback).
    const name = await ontology.getLabel(t, DEDALO_STRUCTURE_LANG, null, false);
    if (name === config.diffusionDomain) {
      domainTipo = t;
      break;
    }
  }
  if (domainTipo === null) return [];

  const orderedTipos: string[] = [];
  const seen = new Set<string>();
  const typesWithDatabase = new Set(['sql', 'socrata']);

  const groups = await getArTipoByModelAndRelation(ontology, domainTipo, 'diffusion_group', 'children', true);
  for (const groupTipo of groups) {
    // 1. alias elements → resolved real diffusion_element tipos
    const aliasTipos = await getArTipoByModelAndRelation(
      ontology,
      groupTipo,
      'diffusion_element_alias',
      'children',
      true,
    );
    const resolvedElements: string[] = [];
    for (const aliasTipo of aliasTipos) {
      const real = await getArTipoByModelAndRelation(ontology, aliasTipo, 'diffusion_element', 'related', false);
      const realTipo = real[0] ?? null;
      if (realTipo) resolvedElements.push(realTipo);
    }

    // 2. direct diffusion_element children
    const directElements = await getArTipoByModelAndRelation(
      ontology,
      groupTipo,
      'diffusion_element',
      'children',
      true,
    );

    // 3. merge (alias-resolved first, then direct)
    for (const elementTipo of [...resolvedElements, ...directElements]) {
      const props = await ontology.getProperties(elementTipo);
      const type = readDiffusionType(props);

      if (type !== null && typesWithDatabase.has(type)) {
        // require a resolvable database (real, or via database_alias) — else skip
        const directDb = await getArTipoByModelAndRelation(ontology, elementTipo, 'database', 'children', true);
        let dbTipo = directDb[0] ?? null;
        if (!dbTipo) {
          const dbAlias = await getArTipoByModelAndRelation(ontology, elementTipo, 'database_alias', 'children', true);
          const dbAliasTipo = dbAlias[0] ?? null;
          if (!dbAliasTipo) continue;
          const realDb = await getArTipoByModelAndRelation(ontology, dbAliasTipo, 'database', 'related', false);
          dbTipo = realDb[0] ?? null;
          if (!dbTipo) continue;
        }
      }

      // PHP keys by element_tipo (last write wins on value, first insertion order kept).
      if (!seen.has(elementTipo)) {
        seen.add(elementTipo);
        orderedTipos.push(elementTipo);
      }
    }
  }

  return orderedTipos;
}

/**
 * Port of `dd_diffusion_api::validate`. Scope: a single requested element_tipo, or —
 * when none is given — every element in the diffusion map (no-arg variant). Reads the
 * diffusion ontology only; byte-reproducible against live PHP.
 *
 * Caller MUST gate: only invoke for a resolvable requested element (model !== null)
 * and for global admins; otherwise proxy (PHP throws / returns a permission envelope).
 */
export async function validateDiffusionElements(
  ontology: OntologyRepository,
  config: DiffusionWalkConfig,
  requestedElementTipo: string | null,
  state: WalkState = new WalkState(),
): Promise<DiffusionValidateResult> {
  const arElementTipo: string[] = requestedElementTipo
    ? [requestedElementTipo]
    : await getDiffusionMapElementTipos(ontology, config);

  const data: DiffusionValidateElement[] = [];
  let invalidCount = 0;

  for (const elementTipo of arElementTipo) {
    const checks: DiffusionCheck[] = [];
    const addCheck = (check: string, result: boolean, msg: string): boolean => {
      checks.push({ check, result, msg });
      return result;
    };

    // 1. element resolvable
    const resolved = await resolveNodeWithAlias(ontology, elementTipo);
    const isElement = resolved.model === 'diffusion_element' || resolved.model === 'diffusion_element_alias';
    addCheck(
      'element_resolvable',
      isElement,
      isElement
        ? `Element '${elementTipo}' resolved (model: ${resolved.model})`
        : `Tipo '${elementTipo}' is not a diffusion_element (model: ${toStringPhp(resolved.model)})`,
    );

    // 2. diffusion type
    const type = readDiffusionType(resolved.properties);
    const typeKnown = type !== null && (KNOWN_DIFFUSION_TYPES as readonly string[]).includes(type);
    addCheck(
      'diffusion_type',
      typeKnown,
      typeKnown
        ? `Diffusion type: '${type}'`
        : `Missing or unknown properties->diffusion->type: ${toStringPhp(type)} (expected one of: ${KNOWN_DIFFUSION_TYPES.join(', ')})`,
    );

    // 3. targeted sections
    const arSections = isElement
      ? await getDiffusionSectionsFromElement(ontology, config, state, elementTipo)
      : [];
    addCheck(
      'target_sections',
      arSections.length > 0,
      arSections.length > 0
        ? `${arSections.length} section(s) targeted: ${arSections.join(', ')}`
        : 'No sections targeted by this element (check table/owl:Class section relations)',
    );

    // 4. type-specific checks
    if (type === 'sql' || type === 'socrata') {
      const databaseName = await getDatabaseNameForElement(ontology, config, state, elementTipo);
      addCheck(
        'database',
        !!databaseName,
        databaseName
          ? `Database: '${databaseName}'`
          : 'Unable to resolve database name (define a database or database_alias child)',
      );
    }
    if (type === 'rdf' || type === 'xml' || type === 'markdown') {
      const serviceName = readServiceName(resolved.properties);
      addCheck(
        'service_name',
        !!serviceName,
        serviceName
          ? `Service name: '${serviceName}'`
          : `Missing properties->diffusion->service_name (required for ${type.toUpperCase()} file paths)`,
      );
    }

    // 5. field nodes: ddo_map shape + parser fn strings (raw properties only)
    for (const sectionTipo of arSections) {
      const sectionNode = await getSectionNodeForElement(ontology, config, state, elementTipo, sectionTipo);
      for (const child of sectionNode?.children ?? []) {
        const childProps = await ontology.getProperties(child.tipo);
        if (!childProps || Object.keys(childProps).length === 0) continue;

        const process = (childProps as Record<string, unknown>)['process'];
        const processObj = process && typeof process === 'object' ? (process as Record<string, unknown>) : null;

        // ddo_map must be an array of objects when defined
        if (processObj && 'ddo_map' in processObj && !Array.isArray(processObj['ddo_map'])) {
          addCheck('ddo_map', false, `Field '${child.tipo}' (${child.label}): process->ddo_map is not an array`);
        }

        // parser entries must carry a 'class::method' fn
        const parser = processObj ? processObj['parser'] : undefined;
        if (parser !== null && parser !== undefined) {
          const arParser = Array.isArray(parser) ? parser : [parser];
          for (const parserItem of arParser) {
            const fn =
              parserItem && typeof parserItem === 'object'
                ? (parserItem as Record<string, unknown>)['fn']
                : null;
            if (typeof fn !== 'string' || fn === '' || !fn.includes('::')) {
              addCheck(
                'parser_fn',
                false,
                `Field '${child.tipo}' (${child.label}): invalid parser fn ${toStringPhp(fn)} (expected 'class::method')`,
              );
            }
          }
        }
      }
    }

    // element result: false if ANY check failed
    let elementResult = true;
    for (const check of checks) {
      if (check.result === false) {
        elementResult = false;
        break;
      }
    }
    if (!elementResult) invalidCount++;

    data.push({
      element_tipo: elementTipo,
      label: resolved.label,
      type,
      result: elementResult,
      checks,
    });
  }

  const msg =
    invalidCount === 0
      ? `OK. ${data.length} element(s) validated without issues`
      : `Warning. ${invalidCount} of ${data.length} element(s) have configuration issues`;

  return { result: true, msg, errors: [], data };
}

export { WalkState };
