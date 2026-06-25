/**
 * Native handler for the PHP `dd_ts_api` class (core/api/v1/common/class.dd_ts_api.php)
 * — the thesaurus-tree write/read API. This is a SEPARATE dd_api class from
 * dd_core_api; it registers exactly like createCoreApiReadHandler.
 *
 * SCOPE (incremental cutover): the WRITE actions `add_child`, `update_parent_data`
 * and `save_order` are served natively, and ONLY for a supported NON-ontology tree
 * section whose section_map carries the full thesaurus block (component_number order +
 * component_relation_parent parent + is_descriptor/is_indexable radio_buttons).
 *
 * The two READS (`get_node_data`, `get_children_data`) are served natively for the
 * byte-reproducible cases (ts_node_data.ts): the ddo_map element walk (term / icon /
 * link_children), the term value, is_indexable, the permission elements (fixed 3 for a
 * superuser), and the component_relation_index `count_result`.
 *
 * COUNT_RESULT NON-DETERMINISM (re-examined): the index icon's count_result embeds a
 * generated SQL string + timing — but those live ONLY under `count_result.debug`
 * (search::count() writes them under `if(SHOW_DEBUG)`, keyed `debug`). The parity
 * differ drops `debug` at ANY depth, so the surviving contract is the DETERMINISTIC
 * `count_result = { total, totals_group:[{key,value,label}] }` (an integer total +
 * per-section_tipo counts + their term labels). Verified live: two identical PHP calls
 * produce byte-different raw bytes (the timing) that the differ normalises to EQUAL.
 *
 * The gate (canHandleNodeRead) accepts only a SUPERUSER session + a section whose
 * thesaurus map + section_list_thesaurus ddo_map resolve to PORTED elements only; the
 * un-ported `img` (component_svg) element, the relation_index `show_data`
 * (children-recursive) count, the model-view variant, the ontology/hierarchy roots, the
 * direct-children list mode and the paginated-children slice all DECLINE → proxy to PHP.
 *
 * The PHP API_ACTIONS allowlist is preserved verbatim so the router's SEC-024 method
 * check matches PHP; the three writes are dispatched here when the gate accepts,
 * everything else is listed (so the action is "valid") but declined → proxied.
 */

import type { ApiHandler, ApiResponse, RqoLike } from '@dedalo/core-api';
import type { Db } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { SearchQueryer } from '@dedalo/search';
import { tryCtx } from '@dedalo/runtime';
import type { LangConfig } from './lang_config.ts';
import {
  addChild,
  UnsupportedAddChild,
  type AddChildSource,
} from './add_child.ts';
import {
  updateParentData,
  UnsupportedUpdateParent,
  type UpdateParentSource,
} from './update_parent_data.ts';
import { saveOrder, UnsupportedSaveOrder, type SaveOrderSource } from './save_order.ts';
import { resolveThesaurusOrderMap } from './ts_order_common.ts';
import {
  getNodeData,
  getChildrenData,
  UnsupportedNodeRead,
  type NodeData,
  type NodeDataDeps,
} from './ts_node_data.ts';
import type { GateSession } from '@dedalo/core-api';

export interface TsApiHandlerOptions {
  db: Db;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  /** SQL queryer for the existing-descriptor-children count (set_child_order). */
  searchQueryer: SearchQueryer;
}

/** The dd_ts_api API_ACTIONS allowlist (verbatim from PHP). */
const API_ACTIONS = new Set([
  'get_node_data',
  'get_children_data',
  'add_child',
  'update_parent_data',
  'save_order',
]);

export function createTsApiHandler(opts: TsApiHandlerOptions): ApiHandler {
  /**
   * canHandleRequest for `add_child` — accept only a supported tree section. The
   * cheap structural checks live here; the deep ontology resolution (section_map +
   * dato_default) is re-derived statelessly inside addChild (which declines via
   * UnsupportedAddChild → a failed envelope; the gate keeps that off the dispatch
   * path for the common cases).
   */
  async function canHandleAddChild(rqo: RqoLike): Promise<boolean> {
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source) return false;
    const sectionTipo = source['section_tipo'];
    const sectionId = source['section_id'];
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return false;
    if (typeof sectionId !== 'string' && typeof sectionId !== 'number') return false;
    const parentId = Number.parseInt(String(sectionId), 10);
    if (!Number.isInteger(parentId) || parentId <= 0) return false;

    // ONTOLOGY sections (section_id===0 path / TLD copy) are NOT reproduced → decline.
    // get_section_id_from_tipo(section_tipo) === '0' for ontology tipos; detect via the
    // ontology node's is_main flag + the absence of a real numeric record id is hard to
    // probe cheaply, so we rely on the section_map resolution: an ontology section's
    // section_map differs. We instead resolve the thesaurus map + the relation_parent
    // model here; a missing/declined shape → false (proxy).
    const childTipos = await opts.ontology.getChildren(sectionTipo);
    let sectionMapTipo: string | null = null;
    for (const childTipo of childTipos) {
      if ((await opts.ontology.getModelByTipo(childTipo)) === 'section_map') {
        sectionMapTipo = childTipo;
        break;
      }
    }
    if (sectionMapTipo === null) return false;
    const props = await opts.ontology.getProperties(sectionMapTipo);
    const thesaurus = props?.['thesaurus'];
    if (thesaurus === null || typeof thesaurus !== 'object') return false;
    const th = thesaurus as Record<string, unknown>;
    const isDescriptor = th['is_descriptor'];
    const isIndexable = th['is_indexable'];
    const order = th['order'];
    const parent = th['parent'];
    if (
      typeof isDescriptor !== 'string' ||
      typeof isIndexable !== 'string' ||
      typeof order !== 'string' ||
      typeof parent !== 'string'
    ) {
      return false;
    }
    // The parent component must be a component_relation_parent; the descriptor/indexable
    // must be radio_button with a si_no default; the order must be a component_number.
    if ((await opts.ontology.getModelByTipo(parent)) !== 'component_relation_parent') return false;
    if ((await opts.ontology.getModelByTipo(order)) !== 'component_number') return false;
    for (const compTipo of [isDescriptor, isIndexable]) {
      if ((await opts.ontology.getModelByTipo(compTipo)) !== 'component_radio_button') return false;
      const cprops = await opts.ontology.getProperties(compTipo);
      const def = cprops?.['dato_default'];
      if (!Array.isArray(def) || def.length !== 1) return false;
      const first = def[0] as Record<string, unknown> | null;
      if (!first || first['section_tipo'] !== 'dd64') return false;
    }
    return true;
  }

  /**
   * canHandleRequest for the order-based writes (update_parent_data / save_order). Both
   * need the section's thesaurus order map (order component_number + relation_parent +
   * is_descriptor) to resolve, and a present source. The deep per-tipo model checks run
   * statelessly inside the op (declining via the Unsupported* error → a failed envelope);
   * the gate keeps the common cases off the dispatch path. Ontology sections (whose
   * thesaurus map differs / is absent) are declined here → proxied.
   */
  async function canHandleOrderWrite(rqo: RqoLike): Promise<boolean> {
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source) return false;
    const sectionTipo = source['section_tipo'];
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return false;
    const map = await resolveThesaurusOrderMap(opts.ontology, sectionTipo);
    if (map === null) return false;
    // the parent must be a component_relation_parent and order a component_number.
    if ((await opts.ontology.getModelByTipo(map.parent)) !== 'component_relation_parent') return false;
    if ((await opts.ontology.getModelByTipo(map.order)) !== 'component_number') return false;
    return true;
  }

  /** Build the node-read deps bag from the handler options + session. */
  function nodeReadDeps(isSuperuser: boolean): NodeDataDeps {
    return {
      db: opts.db,
      ontology: opts.ontology,
      langConfig: opts.langConfig,
      searchQueryer: opts.db,
      isSuperuser,
    };
  }

  /**
   * canHandleRequest for the READS (get_node_data / get_children_data). Accept only the
   * byte-reproducible cases: a SUPERUSER session (permissions fixed at 3) + a present
   * source with a section_tipo whose thesaurus map + section_list_thesaurus ddo_map
   * resolve to ported elements only (term / icon / link_children; the img/component_svg
   * element and the relation_index `show_data` children-recursive count are NOT ported).
   * The deep per-element reproduction runs in dispatch and declines via UnsupportedNodeRead
   * → a failed envelope; the gate keeps the common (un-reproducible) sections off the
   * dispatch path so they proxy to PHP. The volatile count_result SQL/timing lives under
   * count_result.debug (dropped by the parity differ), so the count contract is byte-green.
   */
  async function canHandleNodeRead(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.isGlobalAdmin !== true || session.userId === null) return false;
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source) return false;
    const sectionTipo = source['section_tipo'];
    const sectionIdRaw = source['section_id'];
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return false;
    if (typeof sectionIdRaw !== 'string' && typeof sectionIdRaw !== 'number') return false;
    const sectionId = Number.parseInt(String(sectionIdRaw), 10);
    if (!Number.isInteger(sectionId) || sectionId <= 0) return false;

    // get_children_data: a children_tipo of model component_relation_children is required.
    if ((rqo as { action?: unknown }).action === 'get_children_data') {
      const childrenTipo = source['children_tipo'];
      if (typeof childrenTipo !== 'string' || childrenTipo === '') return false;
      const children = source['children'];
      if (children !== undefined && children !== null) return false; // direct-list mode → proxy
      // A non-default pagination slice (offset>0 / explicit total beyond limit) is not ported.
      const options = (rqo as { options?: Record<string, unknown> }).options;
      const pagination = options?.['pagination'];
      if (pagination !== undefined && pagination !== null) return false; // explicit pagination → proxy
    }
    // Model-view (thesaurus_view_mode=model) is not reproduced.
    const options = (rqo as { options?: Record<string, unknown> }).options;
    const viewMode = options?.['thesaurus_view_mode'];
    if (viewMode !== undefined && viewMode !== 'default') return false;

    // Probe reproducibility WITHOUT touching the DB rows: a thesaurus map must resolve and
    // the section_list_thesaurus ddo_map must be all-ported (term/icon/link_children, no
    // img/show_data). Run a cheap dry build of the node and decline on UnsupportedNodeRead.
    try {
      await getNodeData({ section_tipo: sectionTipo, section_id: sectionId }, nodeReadDeps(true));
      return true;
    } catch (err) {
      if (err instanceof UnsupportedNodeRead) return false;
      // An unexpected error at gate time → decline (proxy) rather than 500.
      return false;
    }
  }

  return {
    ddApi: 'dd_ts_api',
    apiActions: API_ACTIONS,

    async canHandleRequest(rqo: RqoLike, session?: GateSession): Promise<boolean> {
      const action = (rqo as { action?: unknown }).action;
      if (action === 'add_child') return canHandleAddChild(rqo);
      if (action === 'update_parent_data' || action === 'save_order') {
        return canHandleOrderWrite(rqo);
      }
      if (action === 'get_node_data' || action === 'get_children_data') {
        return canHandleNodeRead(rqo, session);
      }
      return false;
    },

    async dispatch(action: string, rqo: RqoLike): Promise<ApiResponse> {
      const session = tryCtx()?.session;
      const sessionInfo = {
        userId: session?.userId ?? null,
        isGlobalAdmin: session?.isGlobalAdmin ?? false,
      };

      if (action === 'add_child') {
        const source = (rqo as { source?: AddChildSource }).source;
        if (!source || typeof source.section_tipo !== 'string') {
          return { result: false, msg: 'Error. Request failed [add_child]', errors: ['missing source'] };
        }
        try {
          const { result, msg, errors } = await addChild(
            { source },
            {
              db: opts.db,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              searchQueryer: opts.searchQueryer,
              session: sessionInfo,
            },
          );
          return { result, msg, errors };
        } catch (err) {
          if (err instanceof UnsupportedAddChild) {
            return { result: false, msg: 'Error. Request failed [add_child]', errors: [err.message] };
          }
          throw err;
        }
      }

      if (action === 'update_parent_data') {
        const source = (rqo as { source?: UpdateParentSource }).source;
        if (!source || typeof source.section_tipo !== 'string') {
          return { result: false, msg: 'Error. Request failed', errors: ['missing source'] };
        }
        try {
          const { result, msg, errors } = await updateParentData(source, {
            db: opts.db,
            ontology: opts.ontology,
            session: sessionInfo,
          });
          return { result, msg, errors };
        } catch (err) {
          if (err instanceof UnsupportedUpdateParent) {
            return { result: false, msg: 'Error. Request failed', errors: [err.message] };
          }
          throw err;
        }
      }

      if (action === 'save_order') {
        const source = (rqo as { source?: SaveOrderSource }).source;
        if (!source || typeof source.section_tipo !== 'string' || !Array.isArray(source.ar_locators)) {
          return { result: false, msg: 'Error. Request failed', errors: ['missing source'] };
        }
        try {
          const { result, msg, errors } = await saveOrder(source, {
            db: opts.db,
            ontology: opts.ontology,
            session: sessionInfo,
          });
          return { result, msg, errors };
        } catch (err) {
          if (err instanceof UnsupportedSaveOrder) {
            return { result: false, msg: 'Error. Request failed', errors: [err.message] };
          }
          throw err;
        }
      }

      if (action === 'get_node_data') {
        const source = (rqo as { source?: Record<string, unknown> }).source;
        const sectionTipo = source?.['section_tipo'];
        const sectionId = Number.parseInt(String(source?.['section_id']), 10);
        if (typeof sectionTipo !== 'string' || !Number.isInteger(sectionId)) {
          return {
            result: false,
            msg: 'Invalid request. Source data is missing.',
            errors: ['Missing source property in the request object.'],
          };
        }
        try {
          const node: NodeData = await getNodeData(
            { section_tipo: sectionTipo, section_id: sectionId },
            nodeReadDeps(sessionInfo.isGlobalAdmin),
          );
          return {
            result: node,
            msg: 'OK. get_node_data request done successfully',
            errors: [],
          };
        } catch (err) {
          if (err instanceof UnsupportedNodeRead) {
            return { result: false, msg: 'Error. Request failed', errors: [err.message] };
          }
          throw err;
        }
      }

      if (action === 'get_children_data') {
        const source = (rqo as { source?: Record<string, unknown> }).source;
        const sectionTipo = source?.['section_tipo'];
        const sectionId = Number.parseInt(String(source?.['section_id']), 10);
        const childrenTipo = source?.['children_tipo'];
        if (
          typeof sectionTipo !== 'string' ||
          !Number.isInteger(sectionId) ||
          typeof childrenTipo !== 'string'
        ) {
          return {
            result: false,
            msg: 'Invalid request. Source data is missing.',
            errors: ['Missing source property in the request object.'],
          };
        }
        const options = (rqo as { options?: Record<string, unknown> }).options;
        const pagination = (options?.['pagination'] ?? null) as
          | { limit?: number; offset?: number; total?: number }
          | null;
        try {
          const result = await getChildrenData(
            { section_tipo: sectionTipo, section_id: sectionId },
            childrenTipo,
            pagination,
            300, // default_limit (dd_ts_api::get_children_data)
            nodeReadDeps(sessionInfo.isGlobalAdmin),
          );
          return { result, msg: 'OK. Request done successfully', errors: [] };
        } catch (err) {
          if (err instanceof UnsupportedNodeRead) {
            return { result: false, msg: 'Error. Request failed', errors: [err.message] };
          }
          throw err;
        }
      }

      // Defensive: the router only dispatches when canHandleRequest was true.
      return { result: false, msg: `Error. Request failed [${action}]`, errors: ['not ported'] };
    },
  };
}
