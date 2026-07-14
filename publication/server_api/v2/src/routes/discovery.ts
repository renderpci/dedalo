/**
 * Hypermedia entry points: `GET /` and `GET /databases`.
 *
 * These two routes exist so a client can reach every other resource without
 * hardcoding a single path. That matters here because the API is normally
 * mounted under a prefix by the fronting web server (BASE_PATH, default
 * `/publication/server_api/v2`), which the API cannot know a client knows —
 * so every link it emits is BASE_PATH-prefixed and absolute-from-root.
 *
 * `/databases` is also the only place the DB_NAMES allowlist becomes visible:
 * the set it returns is exactly the set of `{db}` path segments the data routes
 * will accept (`assertKnownDb`); anything else is a 404, unlisted and
 * unreachable. Neither route touches the database.
 */

import { config, dbNames } from '../config';
import { json } from '../utils/response';
import { API_VERSION } from '../constants';

export async function handleApiIndex(_req: Request): Promise<Response> {
  const base = config.BASE_PATH;

  return json({
    name: 'Dédalo Publication API',
    version: API_VERSION,
    links: {
      databases: `${base}/databases`,
      docs: `${base}/docs`,
      openapi: `${base}/openapi.yaml`,
      health: `${base}/health`,
    },
  });
}

export async function handleDatabases(_req: Request): Promise<Response> {
  const base = config.BASE_PATH;

  return json({
    data: dbNames.map(name => ({
      name,
      links: {
        tables: `${base}/${name}/tables`,
      },
    })),
  });
}
