/**
 * Native handler for the PHP `dd_utils_api` class
 * (core/api/v1/common/class.dd_utils_api.php) — the cross-cutting infrastructure
 * / utility API. This is a SEPARATE dd_api class from dd_core_api; it registers
 * exactly like createCoreApiReadHandler / createTsApiHandler.
 *
 * SCOPE (this brick): the two byte-reproducible READ/INFO actions are served
 * natively, and only for the reproducible shape:
 *   - get_login_context   → the login dd_object context (config + ontology reads),
 *                           gated to the PRODUCTION shape (no dev db_user / demo /
 *                           SAML info entries).
 *   - get_install_context → the INSTALLED-state install dd_object (empty
 *                           properties); the not-installed branch (server_info)
 *                           is host/runtime volatile → declined.
 *
 * DECLINED → proxied to PHP (precise reasons):
 *   - get_system_info — returns PHP `ini_get` / `sys_get_temp_dir` / `fileperms`
 *     introspection of the PHP process (post_max_size, upload_tmp_dir, session
 *     cache expiry, fileperms, …). These are properties of the PHP runtime, not
 *     derivable from the TS engine's config → proxy.
 *   - convert_search_object_to_sql_query — the SQL STRING is deterministic, but
 *     the response ALWAYS embeds `db_data`: the full raw matrix rows of every
 *     match (verbatim JSONB incl. volatile modified_date), megabytes of live
 *     mutable data that cannot be byte-reproduced without re-serializing every
 *     JSONB column exactly as PHP's pg driver does. A partial response would
 *     diverge from PHP's full envelope → proxy. (The search SQL builders DO NOT
 *     map onto this path 1:1 anyway: it projects ALL 12 matrix columns + a
 *     `-- default order` debug comment, vs the read path's sections-forced empty
 *     projection.)
 *   - login / quit / change_lang / request_password_reset / confirm_password_reset
 *     / install / upload / … — session-mutating, auth-sensitive or
 *     filesystem/process actions: NEVER ported here → proxy.
 *
 * The PHP API_ACTIONS allowlist is preserved verbatim so the router's SEC-024
 * method check matches PHP; canHandleRequest accepts ONLY the two reproducible
 * actions (and only their reproducible shape), declining everything else → proxy.
 */

import type { ApiHandler, ApiResponse, RqoLike } from '@dedalo/core-api';
import type { OntologyRepository } from '@dedalo/ontology';
import type { LangConfig } from './lang_config.ts';
import type { ContextConfig } from './component_element_context.ts';
import {
  buildLoginContextResponse,
  buildInstallContextResponse,
  type UtilsQueryer,
  type UtilsVersionConfig,
} from './utils_api_context.ts';

export interface UtilsApiHandlerOptions {
  ontology: OntologyRepository;
  /** Parameterised queryer for the matrix_updates data-version read. */
  db: UtilsQueryer;
  langConfig: LangConfig;
  contextConfig: ContextConfig;
  /** DEDALO_ENTITY / DEDALO_VERSION / DEDALO_BUILD (install version.inc). */
  versionConfig: UtilsVersionConfig;
  /**
   * DEDALO_INSTALL_STATUS. The install context is reproducible (empty properties)
   * ONLY when this is exactly 'installed'; otherwise the not-installed server_info
   * branch fires → decline (proxy). Undefined ⇒ never serve install context.
   */
  installStatus?: string;
  /**
   * True when SAML_CONFIG is defined+active for this install. PHP appends a
   * saml_config info flag in that case (not reproduced) → decline get_login_context.
   * Default false (this install has no SAML).
   */
  samlActive?: boolean;
}

/** The dd_utils_api API_ACTIONS allowlist (verbatim from PHP, exact order). */
const API_ACTIONS = new Set([
  'get_login_context',
  'get_install_context',
  'get_system_info',
  'convert_search_object_to_sql_query',
  'change_lang',
  'login',
  'quit',
  'request_password_reset',
  'confirm_password_reset',
  'install',
  'upload',
  'join_chunked_files_uploaded',
  'list_uploaded_files',
  'delete_uploaded_file',
  'update_lock_components_state',
  'get_lock_status',
  'get_dedalo_files',
  'get_process_status',
  'get_process_status_poll',
  'stop_process',
  'get_server_ready_status',
  'get_ontology_update_info',
  'get_code_update_info',
]);

export function createUtilsApiHandler(opts: UtilsApiHandlerOptions): ApiHandler {
  /**
   * get_login_context is reproducible only in the PRODUCTION shape: PHP appends
   * extra info entries for DEDALO_ENTITY==='development' (db_user) /
   * 'dedalo_demo' (demo_user) and a saml_config flag for active SAML. None are
   * reproduced → decline (proxy) when any would fire.
   */
  function canHandleLoginContext(): boolean {
    const entity = opts.versionConfig.entity;
    if (entity === 'development' || entity === 'dedalo_demo') return false;
    if (opts.samlActive === true) return false;
    return true;
  }

  /** get_install_context is reproducible only in the installed (empty-props) state. */
  function canHandleInstallContext(): boolean {
    return opts.installStatus === 'installed';
  }

  return {
    ddApi: 'dd_utils_api',
    apiActions: API_ACTIONS,

    canHandleRequest(rqo: RqoLike): boolean {
      const action = (rqo as { action?: unknown }).action;
      if (action === 'get_login_context') return canHandleLoginContext();
      if (action === 'get_install_context') return canHandleInstallContext();
      // get_system_info, convert_search_object_to_sql_query, and every session-
      // mutating / auth-sensitive / filesystem action are proxied to PHP.
      return false;
    },

    async dispatch(action: string, _rqo: RqoLike): Promise<ApiResponse> {
      if (action === 'get_login_context') {
        const r = await buildLoginContextResponse(
          opts.ontology,
          opts.db,
          opts.versionConfig,
          opts.contextConfig.applicationLang,
          opts.langConfig.dataLang,
        );
        return { result: r.result, msg: r.msg, errors: r.errors };
      }

      if (action === 'get_install_context') {
        const r = buildInstallContextResponse(opts.langConfig.dataLang);
        return { result: r.result, msg: r.msg };
      }

      // Defensive: the router only dispatches when canHandleRequest was true.
      return { result: false, msg: `Error. Request failed [${action}]`, errors: ['not ported'] };
    },
  };
}

/** Build a UtilsVersionConfig from a Dédalo-style env map (version.inc + entity). */
export function versionConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): UtilsVersionConfig {
  const entity = env.DEDALO_ENTITY ?? '';
  // DEDALO_VERSION = '7.0.0' + (DEVELOPMENT_SERVER ? '.dev' : '') — core/base/version.inc.
  let version = env.DEDALO_VERSION ?? '7.0.0';
  if (!env.DEDALO_VERSION && env.DEVELOPMENT_SERVER === 'true') version += '.dev';
  const build = env.DEDALO_BUILD ?? '2026-03-14T13:52:19+02:00';
  return { entity, version, build };
}
