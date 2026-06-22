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
  langConfigFromEnv,
  contextConfigFromEnv,
  mediaConfigFromEnv,
  loadToolPropertiesFromEnv,
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
  // Install-time registered-tools cache (name→properties). Drives each tool
  // DDO's `properties` field byte-faithfully (e.g. tool_print's FLAT shape).
  // Required for SECTION-list get_element_context to be served natively; when
  // the cache file is not found the section-list path declines → proxies to PHP.
  const toolProperties = await loadToolPropertiesFromEnv(process.env);
  // Surface the resolved instance config at boot so a missing var (which would
  // otherwise produce silently wrong-language labels or wrong tool URLs) is
  // visible immediately. These MUST match the PHP install (lg-spa / /v7_dev here).
  console.log(
    `Instance config: applicationLang=${contextConfig.applicationLang} dataLang=${langConfig.dataLang} ` +
      `toolsUrl=${contextConfig.toolsUrl} projectLangs=${langConfig.allLangs.length} ` +
      `toolPropertiesCache=${toolProperties ? `${toolProperties.size} tools` : 'NOT FOUND (section-list → proxy)'}`,
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
    }),
  );
}

const fetch = buildFetchHandler({ phpApiUrl, registry });
const server = Bun.serve({ port, fetch, idleTimeout: 130 });

console.log(`Dédalo TS core listening on http://localhost:${server.port} (proxy → ${phpApiUrl})`);
console.log(
  registry.ddApis().length === 0
    ? 'Native handlers: none (full proxy)'
    : `Native handlers: ${registry.ddApis().join(', ')} (intra-action: read/get_value→{${[...SUPPORTED_GET_VALUE_MODELS].join(', ')}}; else proxy)`,
);
