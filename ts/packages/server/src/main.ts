#!/usr/bin/env bun
/**
 * Bun.serve entrypoint for the TS core.
 *
 * Natively serves the ported slices (currently dd_core_api `read`/get_value for
 * component_input_text), and transparently proxies everything else to PHP — a
 * byte-faithful incremental cutover. Authenticated native actions validate the
 * browser session via the PHP bridge (see session_bridge.ts).
 *
 *   DEDALO_PHP_API_URL=http://localhost:8080/v7_dev/core/api/v1/json/ \
 *   DEDALO_HOSTNAME_CONN=/tmp DEDALO_DB_PORT_CONN=5432 DEDALO_DATABASE_CONN=… \
 *   DEDALO_USERNAME_CONN=… DEDALO_PASSWORD_CONN=… \
 *   DEDALO_DATA_LANG_DEFAULT=lg-spa DEDALO_PROJECTS_DEFAULT_LANGS='[…]' \
 *   PORT=3000 bun run src/main.ts
 */
import { ApiRegistry } from '@dedalo/core-api';
import { Db, MatrixDbManager, connectionConfigFromEnv } from '@dedalo/db';
import { OntologyRepository } from '@dedalo/ontology';
import {
  createCoreApiReadHandler,
  createTsApiHandler,
  createUtilsApiHandler,
  createOntologyApiHandler,
  createDiffusionApiHandler,
  diffusionConfigFromEnv,
  createToolsApiHandler,
  createAgentApiHandler,
  createComponentMediaApiHandlers,
  makeLlmMapLoaderFromEnv,
  versionConfigFromEnv,
  langConfigFromEnv,
  contextConfigFromEnv,
  mediaConfigFromEnv,
  mediaPathConfigFromEnv,
  loadRegisteredToolsFromEnv,
  loadLabelsCacheFromEnv,
  SUPPORTED_GET_VALUE_MODELS,
} from '@dedalo/components';
import { buildFetchHandler } from './server.ts';

const phpApiUrl = process.env.DEDALO_PHP_API_URL;
if (!phpApiUrl) {
  console.error('DEDALO_PHP_API_URL is required (the live PHP JSON API for the proxy fallback + session bridge).');
  process.exit(1);
}
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

// Derive DEDALO_ROOT_WEB (PHP computes it from the request path; it is NOT in
// private/.env) from the PHP API URL when not explicitly set: strip the
// '/core/api/v1/json/' suffix. This keeps tool css/icon URLs install-correct
// (e.g. '/v7_dev/tools/…') without a manual env var.
if (!process.env.DEDALO_ROOT_WEB) {
  try {
    const path = new URL(phpApiUrl).pathname.replace(/\/+$/, '');
    const rootWeb = path.replace(/\/core\/api\/v1\/json$/, '');
    if (rootWeb && rootWeb !== path) process.env.DEDALO_ROOT_WEB = rootWeb;
  } catch {
    /* leave unset → contextConfig default */
  }
}

const registry = new ApiRegistry();

// Wire native handlers when the DB is configured. Without it, the server is a
// pure proxy (still fully functional, just nothing served natively yet).
if (process.env.DEDALO_DATABASE_CONN) {
  const db = Db.create(connectionConfigFromEnv(process.env));
  const ontology = new OntologyRepository(db);
  const matrix = new MatrixDbManager(db);
  const langConfig = langConfigFromEnv(process.env);
  const contextConfig = contextConfigFromEnv(process.env);
  // Per-instance media config (DEDALO_IMAGE_* from the install .env, overriding
  // the PHP catalog defaults). Frozen, process-global — threaded into the read
  // handler for the component_image LIST element (get_list_value filter).
  const mediaConfig = mediaConfigFromEnv(process.env);
  // Per-instance media PATH/URL config (DEDALO_MEDIA_URL/PATH + protocol/host + media
  // folders) — the path layer behind dd_agent_api::get_media_url (URL construction +
  // the max_items_folder shard + the on-disk file-exists stat).
  const mediaPathConfig = mediaPathConfigFromEnv(process.env);
  // Install-time registered-tools cache (name→CachedSimpleTool). The
  // AUTHORITATIVE source for the section/area tool SET — membership, order,
  // affected_models/affected_tipos, the show_in_*/requirement flags AND each
  // tool's `properties` (e.g. tool_print's FLAT shape) — exactly the object PHP's
  // get_all_registered_tools() serves. Required for SECTION-list
  // get_element_context to be served natively; when the cache file is not found
  // the section-list path declines → proxies to PHP.
  const toolProperties = await loadRegisteredToolsFromEnv(process.env);
  // UI-labels cache (application lang, superuser -1 file) — drives the SEARCH-mode
  // element context's search_options_title (label::get_label operator tooltips).
  // When the file is not found the search-mode element declines → proxies to PHP.
  const labelsCache = await loadLabelsCacheFromEnv(process.env);
  // Surface the resolved instance config at boot so a missing var (which would
  // otherwise produce silently wrong-language labels or wrong tool URLs) is
  // visible immediately. These MUST match the PHP install (lg-spa / /v7_dev here).
  console.log(
    `Instance config: applicationLang=${contextConfig.applicationLang} dataLang=${langConfig.dataLang} ` +
      `toolsUrl=${contextConfig.toolsUrl} projectLangs=${langConfig.allLangs.length} ` +
      `toolPropertiesCache=${toolProperties ? `${toolProperties.size} tools` : 'NOT FOUND (section-list → proxy)'} ` +
      `labelsCache=${labelsCache ? `${labelsCache.size} labels` : 'NOT FOUND (search-mode element → proxy)'}`,
  );
  // The handler resolves each section's matrix table per request (matrix /
  // matrix_test / …) from the ontology — no fixed table. The Db doubles as the
  // search queryer for component_relation_children (its get_data is a SQL search)
  // and as the tools-registry queryer for get_element_context.
  registry.register(
    createCoreApiReadHandler({
      matrix,
      ontology,
      langConfig,
      searchQueryer: db,
      contextConfig,
      mediaConfig,
      toolsQueryer: db,
      // The pool, for the `save` action to reserve a per-request write connection.
      db,
      ...(toolProperties ? { toolProperties } : {}),
      ...(labelsCache ? { labelsCache } : {}),
    }),
  );

  // dd_ts_api: the thesaurus-tree write API (separate dd_api class). Currently serves
  // only `add_child` for supported tree sections; everything else proxies to PHP.
  registry.register(
    createTsApiHandler({
      db,
      ontology,
      langConfig,
      searchQueryer: db,
    }),
  );

  // dd_utils_api: the cross-cutting infra/utility API (separate dd_api class).
  // Natively serves the two byte-reproducible READ/INFO actions:
  //   - get_login_context   (production shape: no dev/demo/SAML info entries)
  //   - get_install_context (INSTALLED state only: DEDALO_INSTALL_STATUS='installed')
  // Everything else (get_system_info, convert_search_object_to_sql_query, and all
  // session-mutating / auth-sensitive / filesystem actions) proxies to PHP.
  const versionConfig = versionConfigFromEnv(process.env);
  registry.register(
    createUtilsApiHandler({
      ontology,
      db,
      langConfig,
      contextConfig,
      versionConfig,
      ...(process.env.DEDALO_INSTALL_STATUS
        ? { installStatus: process.env.DEDALO_INSTALL_STATUS }
        : {}),
    }),
  );

  // dd_ontology_api: the ontology-read API (separate dd_api class). Natively serves
  // the byte-reproducible reads (get_node, resolve_term, search, get_glossary, and
  // resolve_section/resolve_path/get_glossary-section|path when reproducible),
  // re-derived from the ontology + the dd_ontology search SQL. resolve_section is
  // superuser-only (permission filtering needs the un-ported permissions table);
  // virtual sections and int-target portals decline → proxy.
  registry.register(
    createOntologyApiHandler({
      ontology,
      db,
    }),
  );

  // dd_diffusion_api: the diffusion publish/inspect API (separate dd_api class).
  // Natively serves the two DIFFUSION-ONTOLOGY READ actions — get_ontology_map
  // (a node's properties->process; global-admin only) and get_diffusion_info (the
  // section's diffusion nodes from the flat virtual diffusion tree walk +
  // resolve_levels; superuser only, CSRF-exempt) — PLUS retry_pending_deletions with
  // count_only=true (a pure PG count of dd1758 unpublish_pending rows; global-admin
  // only). The MariaDB/engine actions (diffuse / rebuild_media_index /
  // get_engine_advisory, the real retry without count_only) decline → proxy. The walk
  // reads the diffusion ontology rooted at DEDALO_DIFFUSION_DOMAIN.
  const { walkConfig: diffusionWalkConfig, resolveLevels: diffusionResolveLevels } =
    diffusionConfigFromEnv(process.env);
  registry.register(
    createDiffusionApiHandler({
      ontology,
      walkConfig: diffusionWalkConfig,
      resolveLevels: diffusionResolveLevels,
      // The Db, for retry_pending_deletions count_only — a pure PG read of dd1758
      // unpublish_pending rows in matrix_activity_diffusion (NOT MariaDB).
      queryer: db,
    }),
  );

  // dd_tools_api: the tools subsystem HTTP API (separate dd_api class). Natively
  // serves ONLY user_tools for the SUPERUSER — the full registered-tools list,
  // re-derived from the ported tools registry (matrix_tools) + the install-time
  // registered-tools properties cache, rendered with the same buildToolDdo() as
  // get_element_context. Non-superuser user_tools (needs the un-ported security
  // profile) and ALL tool_request sub-actions (file-generating / mutating /
  // un-ported subsystems behind un-ported permission gates) decline → proxy.
  registry.register(
    createToolsApiHandler({
      ontology,
      toolsQueryer: db,
      contextConfig,
      ...(toolProperties ? { toolProperties } : {}),
    }),
  );

  // dd_agent_api: the LLM/agent-facing view API (separate dd_api class). Natively
  // serves only the two byte-reproducible views — count_records (no-filter, tipo-form,
  // real section; wraps the ported search count) and list_sections_index (read from
  // the ontology_llm_map.json artifact) — for the superuser — PLUS get_media_url for
  // a tipo-shaped component_image on a real section (the ported media_path layer:
  // URL construction + max_items_folder shard + a Bun file-exists stat). describe_section
  // / get_section_map / read_record_view / search_records_view / set_field_by_label,
  // the filter/human-name/virtual count cases, and the non-image / sibling-shard /
  // external-source / non-default-quality media cases all need un-ported subsystems →
  // proxy. The LLM-map loader resolves the artifact from
  // DEDALO_ONTOLOGY_IO_DIR (+ DEDALO_VERSION); when absent, list_sections_index proxies.
  const llmMapLoader = makeLlmMapLoaderFromEnv(process.env);
  registry.register(
    createAgentApiHandler({
      ontology,
      searchQueryer: db,
      matrix,
      langConfig,
      mediaConfig,
      mediaPathConfig,
      ...(llmMapLoader ? { llmMapLoader } : {}),
    }),
  );

  // COMPONENT-MEDIA dd_*_api classes (av / portal / text_area / 3d). These document
  // the API surface in the registry (verbatim PHP API_ACTIONS allowlists) but own NO
  // request: every component-media action needs an un-ported subsystem
  // (ffmpeg/ffprobe, filesystem writes, the thesaurus/SQO resolvers, or a component
  // write/Save), so each canHandleRequest declines → the edge proxies to PHP
  // byte-identically. Registered for explicitness/parity; they serve nothing natively.
  for (const handler of createComponentMediaApiHandlers()) {
    registry.register(handler);
  }
}

const fetch = buildFetchHandler({ phpApiUrl, registry });
const server = Bun.serve({ port, fetch, idleTimeout: 130 });

console.log(`Dédalo TS core listening on http://localhost:${server.port} (proxy → ${phpApiUrl})`);
console.log(
  registry.ddApis().length === 0
    ? 'Native handlers: none (full proxy)'
    : `Native handlers: ${registry.ddApis().join(', ')} (intra-action: read/get_value→{${[...SUPPORTED_GET_VALUE_MODELS].join(', ')}}; else proxy)`,
);
