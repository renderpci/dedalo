/**
 * Native handler for the PHP `dd_diffusion_api` class
 * (core/api/v1/common/class.dd_diffusion_api.php) — the diffusion publish/inspect
 * API. A SEPARATE dd_api class; it registers exactly like createOntologyApiHandler.
 *
 * SCOPE (this brick): the DIFFUSION-ONTOLOGY READ actions are served natively,
 * re-derived from the ported OntologyRepository + the flat virtual diffusion tree
 * walk (diffusion_nodes.ts). They read the diffusion ONTOLOGY, never the MariaDB
 * diffusion engine, so they return real data on this machine and are byte-gatable:
 *   - get_ontology_map  : properties->process of a diffusion node (global-admin only).
 *   - get_diffusion_info: the section's diffusion nodes + resolve_levels (CSRF-exempt).
 *   - validate          : per-element diffusion-config checks (global-admin only).
 *     Inspects diffusion-ONTOLOGY STRUCTURE only — model/label/properties + the
 *     section/database virtual-tree relations. It NEVER calls get_ddo_map, dd_object,
 *     the parser/chain processor, or MariaDB (check #5 reads RAW process->ddo_map /
 *     process->parser from the ontology and only asserts their shape), so it is
 *     byte-reproducible from the same ontology layer as get_diffusion_info.
 *
 * DECLINED → proxied to PHP (precise reasons):
 *   - diffuse / rebuild_media_index / get_engine_advisory: these drive the Bun MariaDB
 *     diffusion ENGINE (SQL upserts, media-index marker writes, engine advisories) —
 *     un-ported subsystems behind the Bun-owns-MariaDB boundary → proxy.
 *   - retry_pending_deletions WITHOUT count_only (the real retry): delegates to
 *     diffusion_delete::retry_pending → the MariaDB delete propagation → proxy.
 *
 * SERVED NATIVELY (byte-reproducible):
 *   - retry_pending_deletions WITH options.count_only=true: PHP returns
 *     `{pending: diffusion_delete::count_pending()}` with msg `OK. {n} pending
 *     deletion(s)`. count_pending() is a PURE POSTGRES read — it counts dd1758 rows in
 *     `matrix_activity_diffusion` (a main-DB PG table, NOT MariaDB) whose `relation`
 *     JSONB @> the unpublish_pending locator. No MariaDB / engine is touched. Global-
 *     admin only (PHP security::is_global_admin); the superuser qualifies. The count is
 *     reproduced from the same PG query the matrix_db_manager::search builds.
 *   - validate with a NON-RESOLVABLE requested element_tipo (model null): PHP's
 *     resolve_node_with_alias runs str_contains() on a null model and the global API
 *     exception handler emits a Throwable envelope → proxy reproduces it.
 *   - validate / get_ontology_map for a NON-global-admin request: PHP returns an
 *     "insufficient permissions" envelope from the un-ported permissions boundary;
 *     declining → proxy reproduces it byte-identically (like resolve_section's
 *     superuser gate). Global admins (incl. the superuser) are served natively.
 *
 * The PHP API_ACTIONS allowlist is preserved verbatim so the router's SEC-024 method
 * check matches PHP. get_diffusion_info is in CSRF_EXEMPT_ACTIONS (confirmed by the
 * prior sweep) and get_ontology_map is not — both matched by the router constants.
 */

import type { ApiHandler, ApiResponse, GateSession, RqoLike } from '@dedalo/core-api';
import type { OntologyRepository } from '@dedalo/ontology';
import {
  getSectionDiffusionNodes,
  validateDiffusionElements,
  WalkState,
  type DiffusionWalkConfig,
} from './diffusion_nodes.ts';

/** Anything with a parameterised `query(text, params)` — a Db, DbSession or stub. */
export interface DiffusionQueryer {
  query<T = unknown>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface DiffusionApiHandlerOptions {
  ontology: OntologyRepository;
  /** Diffusion domain + data lang (instance config) for the ontology walk. */
  walkConfig: DiffusionWalkConfig;
  /**
   * PHP DEDALO_DIFFUSION_RESOLVE_LEVELS (diffusion_utils::get_resolve_levels).
   * Catalog default 2; overridable per install. Returned verbatim in get_diffusion_info.
   */
  resolveLevels?: number;
  /**
   * Parameterised PG queryer (a Db) for retry_pending_deletions count_only — the pure
   * PG read against `matrix_activity_diffusion`. Optional: when absent, count_only
   * declines → proxy (the other native actions never touch the DB).
   */
  queryer?: DiffusionQueryer;
}

/**
 * The dd1758 unpublish_pending locator (diffusion_activity_logger constants):
 *   ACTION_TIPO = 'dd1767', ACTION_SECTION_TIPO = 'dd1774', ACTION_UNPUBLISH_PENDING = 3.
 * (!) section_id serialises as a STRING in the relation JSONB, so the containment value
 * must use the string "3" to match (PHP search_pending_rows note).
 */
const PENDING_DELETION_LOCATOR = JSON.stringify({
  dd1767: [{ section_id: '3', section_tipo: 'dd1774' }],
});

/** The dd_diffusion_api API_ACTIONS allowlist (verbatim from PHP, exact order). */
const API_ACTIONS = new Set([
  'diffuse',
  'get_diffusion_info',
  'validate',
  'get_ontology_map',
  'retry_pending_deletions',
  'rebuild_media_index',
  'get_engine_advisory',
]);

type Envelope = ApiResponse;

export function createDiffusionApiHandler(opts: DiffusionApiHandlerOptions): ApiHandler {
  const { ontology, walkConfig } = opts;
  const resolveLevels = opts.resolveLevels ?? 2;
  const queryer = opts.queryer;

  function optionsOf(rqo: RqoLike): Record<string, unknown> {
    const o = (rqo as { options?: unknown }).options;
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  }

  // ──────────────────────────── action builders ─────────────────────────────

  /**
   * get_ontology_map. PHP: `data = $ontology_node->get_properties()->process ?? new stdClass()`.
   * The global-admin permission gate is enforced upstream in canHandleRequest
   * (non-admins → proxy), so dispatch only reproduces the missing-arg + success paths.
   */
  async function doGetOntologyMap(rqo: RqoLike): Promise<Envelope> {
    const options = optionsOf(rqo);
    const diffusionTipo = options['diffusion_tipo'];
    if (typeof diffusionTipo !== 'string' || diffusionTipo === '') {
      return {
        result: false,
        msg: 'Error. Missing diffusion_tipo',
        errors: ['Missing diffusion_tipo'],
      };
    }

    const properties = await ontology.getProperties(diffusionTipo);
    const process =
      properties && typeof properties === 'object'
        ? (properties as Record<string, unknown>)['process']
        : undefined;

    return {
      result: true,
      msg: 'OK. Ontology map retrieved',
      errors: [],
      // PHP `?? new stdClass()` → an empty object when process is absent.
      data: process !== undefined && process !== null ? process : {},
    };
  }

  /**
   * get_diffusion_info. PHP: result = { section_diffusion_nodes, resolve_levels }.
   * The PHP read-permission assert (security::assert_section_permission(…,1)) passes
   * for the superuser (the only natively-served gate here); the walk reads the
   * diffusion ontology only.
   */
  async function doGetDiffusionInfo(rqo: RqoLike): Promise<Envelope> {
    const options = optionsOf(rqo);
    const sectionTipo = options['section_tipo'];
    if (typeof sectionTipo !== 'string' || sectionTipo === '') {
      return {
        result: false,
        msg: 'Error. Request failed [get_diffusion_info]',
        errors: ['Missing section_tipo.'],
      };
    }

    const sectionDiffusionNodes = await getSectionDiffusionNodes(
      ontology,
      walkConfig,
      sectionTipo,
      new WalkState(),
    );

    return {
      result: {
        section_diffusion_nodes: sectionDiffusionNodes,
        resolve_levels: resolveLevels,
      },
      msg: 'Diffusion info retrieved successfully',
      errors: [],
    };
  }

  /**
   * validate. PHP: a per-element list of ontology-structure checks. The global-admin
   * gate + the non-resolvable-element decline live in canHandleRequest, so dispatch
   * only runs the byte-reproducible ontology walk. Returns the `{result, msg, errors,
   * data}` envelope verbatim (the router adds action / csrf_token / debug).
   */
  async function doValidate(rqo: RqoLike): Promise<Envelope> {
    const options = optionsOf(rqo);
    const reqTipo = options['diffusion_element_tipo'];
    const requestedElementTipo =
      typeof reqTipo === 'string' && reqTipo !== '' ? reqTipo : null;

    const result = await validateDiffusionElements(
      ontology,
      walkConfig,
      requestedElementTipo,
      new WalkState(),
    );
    return {
      result: result.result,
      msg: result.msg,
      errors: result.errors,
      data: result.data,
    };
  }

  /**
   * retry_pending_deletions, count_only branch. PHP:
   *   result = { pending: diffusion_delete::count_pending() }
   *   msg    = 'OK. {n} pending deletion(s)'
   * count_pending() counts dd1758 rows in matrix_activity_diffusion whose `relation`
   * JSONB @> the unpublish_pending locator — a pure PG read (matrix_db_manager::search
   * builds `SELECT section_id FROM matrix_activity_diffusion WHERE section_tipo='dd1758'
   * AND relation @> $1`, then count()s the rows). limit is irrelevant to count_pending
   * (it always passes null). The global-admin gate is enforced in canHandleRequest.
   */
  async function doRetryPendingCount(): Promise<Envelope> {
    if (queryer === undefined) {
      // Defensive: the gate already required a queryer for the count_only path.
      return { result: false, msg: 'Error. Request failed [retry_pending_deletions]', errors: ['no queryer'] };
    }
    let pending: number;
    try {
      const rows = await queryer.query<{ n: number | string }>(
        "SELECT count(*) AS n FROM matrix_activity_diffusion WHERE section_tipo = $1 AND relation @> $2::jsonb",
        ['dd1758', PENDING_DELETION_LOCATOR],
      );
      const raw = rows[0]?.n ?? 0;
      pending = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
      if (!Number.isFinite(pending)) pending = 0;
    } catch (e) {
      // PHP catches Throwable into an Error envelope; reproduce a faithful shape.
      const m = e instanceof Error ? e.message : String(e);
      return { result: false, msg: 'Error: ' + m, errors: [m] };
    }
    return {
      result: { pending },
      msg: `OK. ${pending} pending deletion(s)`,
      errors: [],
    };
  }

  // ───────────────────────────────── handler ────────────────────────────────

  return {
    ddApi: 'dd_diffusion_api',
    apiActions: API_ACTIONS,

    async canHandleRequest(rqo: RqoLike, session?: GateSession): Promise<boolean> {
      const action = (rqo as { action?: unknown }).action;
      switch (action) {
        case 'get_diffusion_info':
          // The native walk is byte-reproducible only for the superuser: the PHP
          // read-permission assert always passes for the superuser; a regular user's
          // section permission comes from the un-ported permissions table, so a
          // permission-denied path could differ → proxy when not the superuser.
          return session?.userId === DEDALO_SUPERUSER;
        case 'get_ontology_map':
          // Global-admin only (PHP security::is_global_admin). Non-admins → the PHP
          // insufficient-permissions envelope (un-ported boundary) → proxy.
          return session?.isGlobalAdmin === true;
        case 'validate':
          // Global-admin only (PHP security::is_global_admin). Non-admins → the PHP
          // insufficient-permissions envelope (un-ported boundary) → proxy. validate
          // inspects diffusion-ONTOLOGY structure only (no get_ddo_map / parser /
          // chain processor / MariaDB), so it is byte-reproducible — EXCEPT when a
          // requested element_tipo is not a real ontology node: PHP then runs
          // str_contains() on a null model and the global exception handler emits a
          // Throwable envelope. Decline that case (model null) → proxy reproduces it.
          if (session?.isGlobalAdmin !== true) return false;
          {
            const reqTipo = optionsOf(rqo)['diffusion_element_tipo'];
            if (typeof reqTipo === 'string' && reqTipo !== '') {
              const model = await ontology.getModelByTipo(reqTipo);
              if (model === null) return false; // PHP throws → proxy
            }
          }
          return true;
        case 'retry_pending_deletions':
          // Global-admin only (PHP security::is_global_admin; the superuser qualifies).
          // Non-admins → the PHP insufficient-permissions envelope (un-ported boundary)
          // → proxy. ONLY the count_only=true branch is byte-reproducible: a pure PG
          // read of dd1758 unpublish_pending rows (matrix_activity_diffusion, NOT
          // MariaDB). The real retry (count_only falsy) drives the MariaDB delete
          // propagation → proxy. PHP gates on `count_only === true`, so any non-true
          // value (false / absent / truthy-but-not-true) takes the retry path → proxy.
          if (session?.isGlobalAdmin !== true) return false;
          if (queryer === undefined) return false;
          return optionsOf(rqo)['count_only'] === true;
        // diffuse / rebuild_media_index / get_engine_advisory: engine/MariaDB
        // subsystems → proxy.
        default:
          return false;
      }
    },

    async dispatch(action: string, rqo: RqoLike): Promise<ApiResponse> {
      switch (action) {
        case 'get_ontology_map':
          return doGetOntologyMap(rqo);
        case 'get_diffusion_info':
          return doGetDiffusionInfo(rqo);
        case 'validate':
          return doValidate(rqo);
        case 'retry_pending_deletions':
          return doRetryPendingCount();
        default:
          // Defensive: the router only dispatches when canHandleRequest was true.
          return { result: false, msg: `Error. Request failed [${action}]`, errors: ['not ported'] };
      }
    },
  };
}

/** PHP DEDALO_SUPERUSER sentinel (core/base/dd_tipos.php). */
const DEDALO_SUPERUSER = -1;

/**
 * Build the diffusion walk config + resolve_levels from the instance env, mirroring
 * the PHP diffusion config catalog (core/base/config/catalog/domains/diffusion.php):
 *   - DEDALO_DIFFUSION_DOMAIN          (default 'default')
 *   - DEDALO_DIFFUSION_RESOLVE_LEVELS  (default 2)
 *   - DEDALO_DATA_LANG / _DEFAULT      (related_label + domain-term lang)
 */
export function diffusionConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): { walkConfig: DiffusionWalkConfig; resolveLevels: number } {
  const dataLang = env.DEDALO_DATA_LANG ?? env.DEDALO_DATA_LANG_DEFAULT ?? 'lg-eng';
  const diffusionDomain = env.DEDALO_DIFFUSION_DOMAIN ?? 'default';
  const levelsRaw = env.DEDALO_DIFFUSION_RESOLVE_LEVELS;
  const parsed = levelsRaw !== undefined ? Number.parseInt(levelsRaw, 10) : NaN;
  const resolveLevels = Number.isInteger(parsed) ? parsed : 2;
  return { walkConfig: { diffusionDomain, dataLang }, resolveLevels };
}
