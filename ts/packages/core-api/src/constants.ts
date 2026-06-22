/**
 * The router allowlists, ported VERBATIM from core/api/v1/common/class.dd_manager.php.
 * Any drift here is a security or parity bug — keep these in exact sync with PHP.
 */

/** dd_manager $allowed_api_classes (SEC-024) — the only routable handler classes. */
export const ALLOWED_API_CLASSES: ReadonlySet<string> = new Set([
  'dd_core_api',
  'dd_area_maintenance_api',
  'dd_utils_api',
  'dd_ontology_api',
  'dd_agent_api',
  'dd_diffusion_api',
  'dd_tools_api',
  'dd_ts_api',
  'dd_component_portal_api',
  'dd_component_text_area_api',
  'dd_component_av_api',
  'dd_component_3d_api',
  'dd_mcp_api',
  'dd_component_info',
  'dd_rag_api',
]);

/** dd_manager $no_login_needed_actions — actions callable without authentication. */
export const NO_LOGIN_NEEDED_ACTIONS: ReadonlySet<string> = new Set([
  'start',
  'change_lang',
  'login',
  'get_login_context',
  'install',
  'get_install_context',
  'get_environment',
  'get_ontology_update_info',
  'get_code_update_info',
  'get_server_ready_status',
  'request_password_reset',
  'confirm_password_reset',
]);

/** dd_manager CSRF_EXEMPT_ACTIONS — actions invokable before a CSRF token exists. */
export const CSRF_EXEMPT_ACTIONS: ReadonlySet<string> = new Set([
  'start',
  'get_environment',
  'get_login_context',
  'get_install_context',
  'get_server_ready_status',
  'get_ontology_update_info',
  'get_code_update_info',
  'get_diffusion_info',
  'get_dedalo_files',
  'read_raw',
  'request_password_reset',
  'confirm_password_reset',
]);

/** The default dd_api when the request omits it (dd_manager: `$rqo->dd_api ?? 'dd_core_api'`). */
export const DEFAULT_DD_API = 'dd_core_api';

/** The maintenance-area tipo whose write permission (≥2) gates dd_area_maintenance_api. */
export const AREA_MAINTENANCE_DD_API = 'dd_area_maintenance_api';
