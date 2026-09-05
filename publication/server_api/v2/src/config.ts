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
 *
 * EXPORTED FOR THE TESTS (2026-08-03, zod 3 → 4). zod 4 no longer re-validates a
 * `.default()` value, so a boot that takes every AV_* default — which is what the
 * test process does — stops exercising these checks entirely. Under zod 3 they ran
 * on every boot and the coverage came for free; the guard is unchanged and still
 * rejects (verified), but nothing was TESTING it any more. Asserting on the schema
 * directly is the honest replacement: this grammar is what stands between an
 * operator's env var and an interpolated SQL identifier.
 */
const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const sqlIdentifier = z.string().regex(SQL_IDENTIFIER, 'must be a plain SQL identifier');
export const sqlIdentifierList = z
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

/**
 * A REAL boolean from the environment — `z.coerce.boolean()` is not one.
 *
 * `z.coerce.boolean()` is `Boolean(input)`, and every environment variable is a string:
 * `TRUST_PROXY=false` and `MCP_ENABLED=0` therefore parsed to TRUE. Every mitigation
 * written around those two keys — the deployment guide's standalone recipe, the security
 * page's "set TRUST_PROXY=false", the .env.example line — was inert, which is what made
 * PUB-09 unfixable by configuration rather than merely misconfigured by default.
 *
 * The accepted spellings are the ones an operator actually writes; anything else FAILS THE
 * PROCESS, in keeping with this file's rule. A value nobody can interpret must not be
 * silently read as one of the two things it might have meant — least of all on a key whose
 * wrong side is a rate-limit bypass.
 */
const TRUE_SPELLINGS = new Set(['true', '1', 'yes', 'on']);
const FALSE_SPELLINGS = new Set(['false', '0', 'no', 'off']);

// An env var that is present but EMPTY (`TRUST_PROXY=` in a .env) means "unset" — that is
// what the deployment guide's Default column promises — so it is normalised away before
// the parser sees it, and the key's default (or derivation) applies.
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const envBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value, ctx) => {
    if (typeof value === 'boolean') return value;
    const normalized = value.trim().toLowerCase();
    if (TRUE_SPELLINGS.has(normalized)) return true;
    if (FALSE_SPELLINGS.has(normalized)) return false;
    ctx.addIssue({
      code: 'custom',
      message: `must be one of ${[...TRUE_SPELLINGS, ...FALSE_SPELLINGS].join(', ')} (got "${value}")`,
    });
    return z.NEVER;
  });

/** `envBoolean`, with an absent-or-empty value falling back to `fallback`. */
export const envBooleanDefault = (fallback: boolean) =>
  z.preprocess(emptyToUndefined, envBoolean.default(fallback));

/** `envBoolean`, left undefined when absent or empty (the caller derives the meaning). */
export const envBooleanOptional = z.preprocess(emptyToUndefined, envBoolean.optional());

const envSchema = z.object({
  DEPLOYMENT_MODE: z.enum(['apache', 'nginx', 'standalone']).default('apache'),
  PORT: z.coerce.number().default(3100),
  // Loopback by default: the expected deployment is behind Apache or nginx, so binding
  // 0.0.0.0 would publish the origin alongside the proxy rather than behind it.
  HOST: z.string().default('127.0.0.1'),
  // The subpath the proxy mounts us under; router.ts strips it before matching.
  BASE_PATH: z.string().default('/publication/server_api/v2'),
  // Whether X-Forwarded-For / X-Real-IP may be believed when identifying the caller. The
  // headers are attacker-controlled, so believing them without a proxy in front is a
  // rate-limit bypass, not a rate limit (audit 2026-08-26, PUB-09) — and the rate limiter
  // is the only thing metering an API that is unauthenticated by default.
  //
  // UNSET, it is DERIVED from the deployment: apache/nginx put a proxy in front and rewrite
  // these headers, so they may be believed; `standalone` is directly exposed, so they may
  // not. A blanket `false` default would be no safer and would quietly break the two proxy
  // modes — every caller would collapse onto the proxy's own address, i.e. one global
  // bucket — which is the same failure PUB-09 describes, arrived at from the other side.
  //
  // SET, it is honoured, with one refusal: `standalone` + TRUST_PROXY=true is the exact
  // bypassable configuration, so it needs the explicit acknowledgement below. That is for
  // the real case of a standalone process behind a load balancer someone else operates.
  // See security/client-ip.ts and the cross-field refine under this schema.
  TRUST_PROXY: envBooleanOptional,
  // The opt-in that makes `standalone` + TRUST_PROXY=true bootable. Deliberately a second
  // key rather than a comment: it puts the operator's "yes, a proxy I control is in front
  // of this" in the environment, where it can be read, instead of in a wiki.
  TRUST_PROXY_IN_STANDALONE: envBooleanDefault(false),
  // HOW MANY hops of X-Forwarded-For this deployment's OWN proxies append — the number that
  // turns a spoofable header into an identity.
  //
  // Both shipped configs APPEND rather than overwrite (nginx `$proxy_add_x_forwarded_for`,
  // Apache mod_proxy_http), so the header a request arrives with is
  // `<whatever the client sent>, <what our proxy saw>`: the LEFTMOST entry is attacker text
  // and the RIGHTMOST entries are the ones our own chain wrote. The caller is therefore at
  // `chain.length - TRUSTED_PROXY_HOPS` — 1 for a single Apache/nginx in front (the shipped
  // deployments), 2 when a CDN or load balancer you also control terminates in front of it.
  // Over-declaring is not free: each extra hop hands one more attacker-supplied entry the
  // identity, so this is an exact count of proxies you operate, never a guess.
  TRUSTED_PROXY_HOPS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10).default(1)),
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

  // envBoolean, not z.coerce.boolean(): MCP_ENABLED=false used to parse TRUE, so the
  // documented way to switch the agent surface off did nothing.
  MCP_ENABLED: envBooleanDefault(true),
  MCP_PATH: z.string().default('/mcp'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Fail the process, not the request. Every key above has a default, so reaching here means
// something was set to a value that cannot mean what it was meant to mean — booting anyway
// would serve traffic under a configuration nobody chose. All field errors are reported at
// once so a misconfigured deploy is fixed in one pass, not one restart per typo.
// EXPORTED FOR THE GATES, for the same reason sqlIdentifier is: the cross-field refine
// below decides whether a deployment may believe a spoofable header, and a boot that takes
// the default never exercises it. Asserting on the schema is the only way to prove the
// refusal still refuses.
export const environmentSchema = envSchema.superRefine((env, ctx) => {
  // The cross-field refine PUB-09 asks for. It cannot be a field-level check: whether
  // believing a forwarding header is safe is a fact about the DEPLOYMENT, not about the
  // value. Refusing to boot is the right severity — a server that reads spoofable headers
  // as identity meters nobody, and it would do so silently for the life of the install.
  if (env.DEPLOYMENT_MODE === 'standalone' && env.TRUST_PROXY === true && env.TRUST_PROXY_IN_STANDALONE !== true) {
    ctx.addIssue({
      code: 'custom',
      path: ['TRUST_PROXY'],
      message:
        'TRUST_PROXY=true with DEPLOYMENT_MODE=standalone lets any client forge X-Forwarded-For and get a fresh rate-limit bucket per request. Put the API behind the proxy it claims to be behind (DEPLOYMENT_MODE=apache|nginx), drop TRUST_PROXY, or set TRUST_PROXY_IN_STANDALONE=true to state that a proxy you control terminates every request.',
    });
  }
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

/**
 * The resolved trust decision — the ONE answer to "may this request's forwarding headers be
 * believed", derived once at boot so no caller re-derives it (and none can forget the
 * derivation and read a bare, possibly-undefined `config.TRUST_PROXY`).
 */
export function resolveTrustProxy(mode: string, explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit;
  return mode !== 'standalone';
}

export const trustProxy = resolveTrustProxy(config.DEPLOYMENT_MODE, config.TRUST_PROXY);

/**
 * The number of X-Forwarded-For entries this deployment's own proxies append — the index
 * from the RIGHT at which the caller's address sits. See security/client-ip.ts.
 */
export const trustedProxyHops = config.TRUSTED_PROXY_HOPS;

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
