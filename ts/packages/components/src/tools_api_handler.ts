/**
 * Native handler for the PHP `dd_tools_api` class
 * (core/api/v1/common/class.dd_tools_api.php) — the tools subsystem HTTP API. A
 * SEPARATE dd_api class; it registers exactly like createOntologyApiHandler.
 *
 * PHP exposes exactly two API_ACTIONS:
 *   - user_tools   : list the tools the logged user is authorised for (each as a
 *                    tool DDO / "simple context"), optionally name-filtered.
 *   - tool_request : a generic secure dispatcher that loads a tool class and runs
 *                    one of its `API_ACTIONS` methods (export grids, csv import,
 *                    translations, time-machine mutations, …).
 *
 * SERVED NATIVELY (byte-reproducible):
 *   - user_tools, SUPERUSER ONLY. For the superuser tool_common::get_user_tools()
 *     returns the FULL registered-tools set with no per-profile filtering, which
 *     this module re-derives from the already-ported tools registry
 *     (getRegisteredTools, reading the dd1324 matrix_tools table + the install-time
 *     registered-tools properties cache) and renders with the SAME buildToolDdo()
 *     used by get_element_context. user_tools does NOT apply the component/section
 *     get_tools() filter and passes no tool_config, so the simple-context shape is
 *     fully determined by the registry + cache. The optional
 *     options.ar_requested_tools name-filter is reproduced verbatim.
 *
 * DECLINED → proxied to PHP (precise reasons):
 *   - user_tools for a NON-superuser. PHP filters the registered tools by the
 *     user's security profile (DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO via
 *     security::get_user_profile → component_security_tools data) — the un-ported
 *     permissions subsystem. Without it the per-user tool set cannot be
 *     byte-reproduced → proxy when userId !== -1 (and when the session is missing).
 *   - tool_request, ALWAYS. Every callable sub-action across the user's tools is
 *     either FILE-GENERATING / MUTATING or depends on an un-ported subsystem, and
 *     each is gated by security::assert_section_permission (un-ported permissions):
 *       · tool_export::get_export_grid       — serialises the whole records
 *         selection through the un-ported search/export engine (+ read perms).
 *       · tool_import_dedalo_csv::get_csv_files / get_section_components_list /
 *         process_uploaded_file / import_files / delete_csv_file — read/write the
 *         per-user import DIRECTORY (filesystem state) and/or walk virtual sections
 *         (resolve_virtual recursion is un-ported) behind read perms.
 *       · tool_lang::automatic_translation   — LLM call + data writes.
 *       · tool_time_machine::apply_value / bulk_revert_process — record mutations
 *         (declarative tipo/section min_level=2 permission gate).
 *     None is a pure ontology/registry READ → all decline → proxy. (tool_print,
 *     tool_indexation, tool_diffusion, tool_user_admin declare empty API_ACTIONS:
 *     no callable sub-action at all → the dispatcher errors → proxy.)
 *
 * Router gating: neither action is in dd_manager's no_login_needed_actions or
 * CSRF_EXEMPT_ACTIONS, so both require login + CSRF exactly like PHP — preserved by
 * keeping the API_ACTIONS allowlist verbatim (the router enforces login/CSRF before
 * dispatch). The PHP pseudo-error envelopes ('unauthorized_method' /
 * 'permissions_denied' / signature_mismatch) live entirely inside tool_request,
 * which we never serve → no native reproduction needed.
 *
 * No module-global mutable state: the registry rows are read per request via the
 * injected queryer; the tool-properties map + context config are injected.
 */

import type { ApiHandler, ApiResponse, GateSession, RqoLike } from '@dedalo/core-api';
import type { OntologyRepository } from '@dedalo/ontology';
import { buildToolDdo, type ContextConfig } from './component_element_context.ts';
import { getRegisteredTools, type ToolsQueryer } from './tools_registry.ts';
import type { ToolPropertiesMap } from './tool_properties_cache.ts';

/** PHP DEDALO_SUPERUSER sentinel (core/base/dd_tipos.php). */
const DEDALO_SUPERUSER = -1;

/** The dd_tools_api API_ACTIONS allowlist (verbatim from PHP, exact order). */
const API_ACTIONS = new Set(['user_tools', 'tool_request']);

export interface ToolsApiHandlerOptions {
  ontology: OntologyRepository;
  /** Parameterised queryer for the dd1324 registry reads (the Db). */
  toolsQueryer: ToolsQueryer;
  /** Per-instance context config (application lang + tools URL) for the tool DDOs. */
  contextConfig: ContextConfig;
  /** Install-time registered-tools properties map; drives each DDO `properties`. */
  toolProperties?: ToolPropertiesMap;
}

function ok(result: unknown): ApiResponse {
  // PHP user_tools: result = array, msg = 'OK…' (errors always empty here),
  // errors = []. Key order matches PHP's stdClass build (result, msg, errors).
  return { result, msg: 'OK. Request done successfully', errors: [] };
}

export function createToolsApiHandler(opts: ToolsApiHandlerOptions): ApiHandler {
  const { ontology, toolsQueryer, contextConfig, toolProperties } = opts;

  /** Read the source.ar_requested_tools name filter (PHP options.ar_requested_tools). */
  function requestedToolsOf(rqo: RqoLike): string[] | null {
    const options = (rqo as { options?: unknown }).options;
    if (!options || typeof options !== 'object') return null;
    const ar = (options as { ar_requested_tools?: unknown }).ar_requested_tools;
    if (!Array.isArray(ar)) return null;
    return ar.filter((x): x is string => typeof x === 'string');
  }

  async function doUserTools(rqo: RqoLike): Promise<ApiResponse> {
    const requested = requestedToolsOf(rqo);

    // Superuser: get_user_tools() returns ALL registered tools, in section_id
    // order — exactly what getRegisteredTools yields.
    const tools = await getRegisteredTools(toolsQueryer, ontology, toolProperties);

    const result: Record<string, unknown>[] = [];
    for (const tool of tools) {
      // PHP filter: when ar_requested_tools is non-empty, skip names not in it.
      if (requested && requested.length > 0 && !requested.includes(tool.name)) continue;
      // user_tools passes NO tool_config → the plain simple-context shape.
      result.push(buildToolDdo(tool, contextConfig));
    }

    return ok(result);
  }

  return {
    ddApi: 'dd_tools_api',
    apiActions: API_ACTIONS,

    async canHandleRequest(rqo: RqoLike, session?: GateSession): Promise<boolean> {
      const action = (rqo as { action?: unknown }).action;
      switch (action) {
        case 'user_tools':
          // Byte-reproducible only for the superuser (no per-profile filtering).
          return session !== undefined && session.userId === DEDALO_SUPERUSER;
        case 'tool_request':
          // Every callable sub-action is file-generating / mutating / un-ported
          // subsystem behind un-ported permission gates → always proxy.
          return false;
        default:
          return false;
      }
    },

    async dispatch(action: string, rqo: RqoLike): Promise<ApiResponse> {
      switch (action) {
        case 'user_tools':
          return doUserTools(rqo);
        default:
          // Defensive: the router only dispatches when canHandleRequest was true.
          return { result: false, msg: `Error. Request failed [${action}]`, errors: ['not ported'] };
      }
    },
  };
}
