/**
 * The whole of the API's configuration: parse the environment once, at import, and hand
 * out a frozen, typed, already-validated object.
 *
 * Two properties are the point of doing it this way:
 *
 *   - **Invalid config kills the process** (process.exit(1) below) rather than degrading
 *     into a running server with a surprising default. A publication API that silently
 *     came up pointing at the wrong database, or with an unparseable rate limit, would be
 *     worse than one that never came up.
 *   - **Nothing downstream touches process.env.** Every consumer imports `config`, so the
 *     schema below is the single, complete census of what this service can be tuned with —
 *     and every value arrives with its type already coerced (env vars are all strings).
 *
 * The derived exports at the bottom (apiKeys, dbNameSet, avSchema) exist so the same
 * splitting/parsing is not re-done per request on a hot path.
 */

import { z } from 'zod';

/**
 * A SQL identifier we are willing to interpolate into a statement. The AV_* keys
 * below name tables/columns that cannot be bound as parameters, so they are
 * validated here, at boot — a bad value fails the process, never a query.
 * Same grammar the query builder enforces for client-supplied identifiers.
 */
const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const sqlIdentifier = z.string().regex(SQL_IDENTIFIER, 'must be a plain SQL identifier');
const sqlIdentifierList = z
  .string()
  .refine(
    value =>
      value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .every(item => SQL_IDENTIFIER.test(item)),
    'must be a comma-separated list of plain SQL identifiers',
  );

const envSchema = z.object({
  DEPLOYMENT_MODE: z.enum(['apache', 'nginx', 'standalone']).default('apache'),
  PORT: z.coerce.number().default(3100),
  // Loopback by default: the expected deployment is behind Apache or nginx, so binding
  // 0.0.0.0 would publish the origin alongside the proxy rather than behind it.
  HOST: z.string().default('127.0.0.1'),
  // The subpath the proxy mounts us under; router.ts strips it before matching.
  BASE_PATH: z.string().default('/publication/server_api/v2'),
  // Whether X-Forwarded-For / X-Real-IP may be believed when identifying the caller. True
  // is right behind a proxy and a rate-limit bypass without one — the headers are
  // attacker-controlled, so a directly-exposed server must set this false (see
  // security/client-ip.ts).
  TRUST_PROXY: z.coerce.boolean().default(true),
  // Defaults to production: the unsafe direction (leaking internal error messages, see
  // middleware/error-handler.ts) must be the one you have to ask for.
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  // Transport: an explicit DB_SOCKET wins; otherwise TCP DB_HOST:DB_PORT.
  DB_SOCKET: z.string().default(''),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  // This API only ever SELECTs. The credential it is given should be unable to do
  // anything else — the read-only grant is the backstop for every other defence here.
  DB_USER: z.string().default('readonly_user'),
  DB_PASSWORD: z.string().default(''),
  // The allowlist of databases this instance will serve, and the ONLY thing standing
  // between a client-supplied `:db` path segment and a connection (db/pool.ts checks
  // dbNameSet). A database absent from this list does not exist as far as the API is
  // concerned.
  DB_NAMES: z.string().default('dedalo_web'),
  // Per database, not in total: pool.ts keeps one pool per database name, because a
  // MariaDB session binds its `database` at connect time.
  DB_POOL_MAX: z.coerce.number().default(10),

  // Seconds. Published data is immutable between diffusion runs, so a shared cache may
  // hold it; 0 switches Cache-Control to no-cache (revalidate every time), which is the
  // escape hatch for a publication that is being actively re-diffused.
  CACHE_MAX_AGE: z.coerce.number().int().min(0).default(60),
  // The per-request bound. Every query runs inside a request, so this is what
  // actually caps a slow statement's blast radius (504 + the connection released).
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(0).default(10000),

  // Empty means the API is OPEN — see isAuthRequired below. That is the intended state for
  // a public publication; listing any key flips the whole surface to key-required.
  API_KEYS: z.string().default(''),
  // Requests per minute per client IP (a token bucket; security/rate-limiter.ts).
  RATE_LIMIT_RPM: z.coerce.number().default(100),
  // Wildcard by default because the dataset is public and meant to be read from browsers.
  // A specific origin additionally turns on Access-Control-Allow-Credentials, which the
  // spec forbids alongside `*` (security/cors.ts).
  CORS_ORIGIN: z.string().default('*'),
  // The only body this API accepts is a /batch envelope of at most MAX_BATCH_QUERIES
  // queries, so 64 KiB is generous; Bun rejects anything larger at the socket.
  MAX_BODY_SIZE: z.coerce.number().default(65536),

  // Prefix prepended to media filenames so responses carry resolvable URLs. The API serves
  // no bytes itself — the media lives wherever the publication's web server puts it.
  MEDIA_BASE_URL: z.string().default('/dedalo/media'),

  // The AV/indexation endpoints (/av-indexation-fragment, /records/:id/av-fragments)
  // join a specific published shape: an interview record, its audiovisual media, its
  // speakers, and the thesauri that index it. The rest of the API is schema-agnostic;
  // these routes cannot be, because the join is the feature. The defaults are the
  // Dédalo oral-history ontology, so a standard publication needs no configuration —
  // a project that published under other names points these at its own tables.
  AV_TABLE: sqlIdentifier.default('interview'),
  AV_MEDIA_TABLE: sqlIdentifier.default('audiovisual'),
  AV_SPEAKER_TABLE: sqlIdentifier.default('informant'),
  AV_TRANSCRIPTION_COLUMN: sqlIdentifier.default('rsc36'),
  AV_VIDEO_COLUMN: sqlIdentifier.default('rsc35'),
  AV_THESAURUS_TABLES: sqlIdentifierList.default('ts_themes,ts_onomastic,ts_chronological'),

  MCP_ENABLED: z.coerce.boolean().default(true),
  MCP_PATH: z.string().default('/mcp'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Fail the process, not the request. Every key above has a default, so reaching here means
// something was set to a value that cannot mean what it was meant to mean — booting anyway
// would serve traffic under a configuration nobody chose. All field errors are reported at
// once so a misconfigured deploy is fixed in one pass, not one restart per typo.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';

/** Splits a comma-separated env value, tolerating whitespace and trailing commas. */
export function parseList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export const apiKeys = parseList(config.API_KEYS);

// No keys configured = no authentication. This is a deliberate default for a public
// dataset, not an oversight: security/auth.ts returns early when the list is empty.
export const isAuthRequired = apiKeys.length > 0;

// A Set because every `:db` route hits this on the request path (db/pool.ts).
export const dbNames = parseList(config.DB_NAMES);
export const dbNameSet = new Set(dbNames);

// The zod schema cannot catch this: DB_NAMES is a non-empty *string* that can still parse
// to an empty list (',' or '   '). An empty allowlist would be a server that can serve no
// database at all, so it dies here for the same reason as any other invalid config.
if (dbNames.length === 0) {
  console.error('Invalid environment variables: DB_NAMES must list at least one database');
  process.exit(1);
}

/** The AV/indexation join shape (see AV_* in the schema above). */
export const avSchema = {
  table: config.AV_TABLE,
  mediaTable: config.AV_MEDIA_TABLE,
  speakerTable: config.AV_SPEAKER_TABLE,
  transcriptionColumn: config.AV_TRANSCRIPTION_COLUMN,
  videoColumn: config.AV_VIDEO_COLUMN,
  thesaurusTables: parseList(config.AV_THESAURUS_TABLES),
} as const;
