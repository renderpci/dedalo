/**
 * The golden-master RQO corpus.
 *
 * Each case is a named request. The corpus is the executable spec: a component,
 * section, or area is "done" only when its slice here captures byte-green against
 * the TS engine. This file seeds the safe, no-auth bootstrap actions (which prove
 * the capture pipeline end-to-end without a session) and documents how to extend
 * coverage. Instance-specific cases (real section tipos / ids) are layered in from
 * a JSON file via CORPUS_FILE so they need no code change.
 *
 * Coverage axes to expand toward (see plan §Parity verification):
 *   every dd_*_api class · every component model × mode (edit/list/tm/search)
 *   · get_context on/off · default/simple context · multi-lang · ±dataframe
 *   · sections · areas · search · tools · export.
 */

export interface CorpusCase {
  /** Stable, filesystem-safe label; becomes the golden-master filename. */
  label: string;
  /** The request body sent to the API (must include `dd_api` and `action`). */
  rqo: Record<string, unknown>;
  /** True if the request asks for pretty-printed JSON (changes encoder flags). */
  pretty?: boolean;
  /** True if the case needs an authenticated session (skipped when no cookie set). */
  requiresAuth?: boolean;
  /** Free-text note on what this case exercises. */
  note?: string;
}

/** No-auth bootstrap actions — present in dd_manager's CSRF_EXEMPT / no-login lists. */
export const BOOTSTRAP_CORPUS: CorpusCase[] = [
  {
    label: 'bootstrap__get_environment',
    rqo: { dd_api: 'dd_core_api', action: 'get_environment' },
    note: 'page_globals / is_logged state; used by diffusion check_auth',
  },
  {
    label: 'bootstrap__get_login_context',
    rqo: { dd_api: 'dd_core_api', action: 'get_login_context' },
    note: 'login screen context',
  },
  {
    label: 'bootstrap__get_install_context',
    rqo: { dd_api: 'dd_core_api', action: 'get_install_context' },
    note: 'install context (CSRF-exempt)',
  },
  {
    label: 'bootstrap__get_server_ready_status',
    rqo: { dd_api: 'dd_core_api', action: 'get_server_ready_status' },
    note: 'health/readiness',
  },
  {
    label: 'error__unknown_api_class',
    rqo: { dd_api: 'dd_not_a_real_api', action: 'whatever' },
    note: 'router allowlist rejection — error-envelope parity',
  },
  {
    label: 'error__missing_action',
    rqo: { dd_api: 'dd_core_api' },
    note: 'missing-action error-envelope parity',
  },
];

/**
 * Authenticated cases — require a logged-in session. These exercise the
 * build_structure_context / request_config machinery (Phase 2) via
 * get_element_context, plus the logged-in environment. tipos are real ontology
 * nodes from the dev instance (sections cont2/culture1, area numisdata1).
 */
export const AUTHENTICATED_CORPUS: CorpusCase[] = [
  {
    label: 'auth__get_environment',
    rqo: { dd_api: 'dd_core_api', action: 'get_environment' },
    requiresAuth: true,
    note: 'logged-in environment (is_logged=true)',
  },
  {
    label: 'auth__element_context__section_cont2_list',
    rqo: { dd_api: 'dd_core_api', action: 'get_element_context', source: { tipo: 'cont2', model: 'section', mode: 'list' } },
    requiresAuth: true,
    note: 'section structure-context, list mode',
  },
  {
    label: 'auth__element_context__section_culture1_edit',
    rqo: { dd_api: 'dd_core_api', action: 'get_element_context', source: { tipo: 'culture1', model: 'section', mode: 'edit' } },
    requiresAuth: true,
    note: 'section structure-context, edit mode',
  },
  {
    label: 'auth__element_context__section_cont2_simple',
    rqo: { dd_api: 'dd_core_api', action: 'get_element_context', source: { tipo: 'cont2', model: 'section', mode: 'list' }, simple: true },
    requiresAuth: true,
    note: 'simple structure-context variant (no tools/buttons)',
  },
  {
    label: 'auth__element_context__area_numisdata1_list',
    rqo: { dd_api: 'dd_core_api', action: 'get_element_context', source: { tipo: 'numisdata1', model: 'area', mode: 'list' } },
    requiresAuth: true,
    note: 'area structure-context',
  },
];

/** Build the active corpus, merging optional instance-specific cases from a JSON file. */
export async function loadCorpus(
  corpusFile = process.env.CORPUS_FILE,
): Promise<CorpusCase[]> {
  const cases = [...BOOTSTRAP_CORPUS, ...AUTHENTICATED_CORPUS];
  if (corpusFile) {
    const file = Bun.file(corpusFile);
    if (await file.exists()) {
      const extra = (await file.json()) as CorpusCase[];
      cases.push(...extra);
    }
  }
  return cases;
}
