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
  HOST: z.string().default('127.0.0.1'),
  BASE_PATH: z.string().default('/publication/server_api/v2'),
  TRUST_PROXY: z.coerce.boolean().default(true),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  // Transport: an explicit DB_SOCKET wins; otherwise TCP DB_HOST:DB_PORT.
  DB_SOCKET: z.string().default(''),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('readonly_user'),
  DB_PASSWORD: z.string().default(''),
  DB_NAMES: z.string().default('dedalo_web'),
  DB_POOL_MAX: z.coerce.number().default(10),

  CACHE_MAX_AGE: z.coerce.number().int().min(0).default(60),
  // The per-request bound. Every query runs inside a request, so this is what
  // actually caps a slow statement's blast radius (504 + the connection released).
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(0).default(10000),

  API_KEYS: z.string().default(''),
  RATE_LIMIT_RPM: z.coerce.number().default(100),
  CORS_ORIGIN: z.string().default('*'),
  MAX_BODY_SIZE: z.coerce.number().default(65536),

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

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';

export function parseList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export const apiKeys = parseList(config.API_KEYS);

export const isAuthRequired = apiKeys.length > 0;

export const dbNames = parseList(config.DB_NAMES);
export const dbNameSet = new Set(dbNames);

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
