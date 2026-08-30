/**
 * THE WHOLE OF THE DAEMON'S CONFIGURATION, AND THE ONE PATH IT ARRIVES BY.
 *
 * Same discipline as publication/server_api/v2/src/config.ts, for the same two reasons:
 *
 *   - **Invalid config kills the process** (`process.exit(1)` below) rather than degrading
 *     into a running daemon with a surprising default. A site builder that came up with an
 *     empty SERVICE_TOKEN, or pointing its workspaces at the wrong root, would be worse
 *     than one that never came up.
 *   - **Nothing downstream touches process.env.** Every consumer imports `config`, so the
 *     schema below is the single, complete census of what this service can be tuned with.
 *     That matters doubly here because agent/build children get a CONSTRUCTED environment
 *     (drivers allowlist what they forward) — a stray `process.env` read elsewhere would
 *     blur that boundary.
 *
 * WHAT CHANGED WITH THE INSTANCE MODEL, AND WHY IT HAD TO.
 *
 * This file used to be `envSchema.safeParse(process.env)`: whatever happened to be in the
 * environment, from whatever put it there. That is not a resolution path, it is an
 * accident with three different shapes — a developer's exported shell variables on a
 * laptop, Bun's automatic `.env.test` load in the suite, and systemd's EnvironmentFile on
 * a museum's host. The three disagreed in exactly the way that matters: a fully provisioned
 * instance (`src/provision/`) renders a SECRET-FREE env file and delivers every credential
 * through systemd `LoadCredential=`, and this module knew nothing of `$CREDENTIALS_DIRECTORY`
 * at all. The measured consequence was a converged provision whose daemon could not boot,
 * for want of a SERVICE_TOKEN that was sitting, minted, in a root-owned file three
 * directories away.
 *
 * So the source is now BUILT EXPLICITLY, in one order, everywhere:
 *
 *   1. THE NAMED ENV FILE — `$DEDALO_SITE_ENV_FILE`, else `.env.test` under NODE_ENV=test,
 *      else `.env` beside this package. Parsed here, by this file, rather than trusted to
 *      have been loaded into the environment by something else. A relative path in it
 *      resolves against the FILE's directory, not the process's cwd, so `bun test` from the
 *      repo root and from this package mean the same roots.
 *   2. A SMALL AMBIENT ALLOWLIST (`AMBIENT_KEYS`) — and nothing else from `process.env`.
 *      An operator's stale exported `SITES_ROOT` cannot silently repoint a museum's daemon,
 *      because this module never looks at it.
 *   3. THE CREDENTIALS — every file in `$CREDENTIALS_DIRECTORY`, systemd's per-unit tmpfs.
 *      A credential file WINS over anything the env file or the environment said, because
 *      it is the only one of the three that a service user cannot have written.
 *
 * An UNKNOWN KEY in that built source is a named refusal, not a silent no-op: a generated
 * env file carrying a key this daemon does not read is either a renderer inventing a knob
 * or a daemon that dropped one, and both are things an operator must be told about at boot
 * rather than discover as behaviour that never took effect.
 *
 * LLM provider credentials live ONLY in this schema and in this instance's credential
 * store: they are handed to the agent drivers (src/drivers/) and never to the engine, never
 * into a site workspace, never into a response body.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { parseEnvFile } from './env_file';
import {
  DRIVER_IDS,
  INSTANCE_PATTERN,
  PUBLICATION_API_KEY_FILE_KEY,
  PUBLICATION_API_KEY_KEY,
  SECRET_KEY_PATTERN,
  SERVICE_TOKEN_KEY,
} from './provision/layout';

/** This package's own directory — the anchor for the default env file. */
const PACKAGE_DIR = resolve(import.meta.dir, '..');

/**
 * The env file's directory, filled in before the schema parses anything.
 *
 * A relative root in an env file means "beside the file that declared it". Resolving
 * against `process.cwd()` instead made `.test-tmp/workspaces` mean two different places
 * depending on which directory `bun test` was started from — and a root is what
 * `resetInstance()` and every publish `rm -rf` operate on.
 */
let ENV_FILE_DIR = PACKAGE_DIR;

// Absolute or resolved against the env file's directory, once, so nothing downstream ever
// sees a relative root.
const absolutePath = z.string().transform(value => resolve(ENV_FILE_DIR, value));

const envSchema = z.object({
  /**
   * WHICH MUSEUM THIS PROCESS IS. Required, with no default: one daemon serves exactly one
   * instance, every root it writes to must declare the same name (src/instance/roots.ts),
   * and a default here would be a daemon guessing whose data it is about to touch.
   */
  DEDALO_SITE_INSTANCE: z
    .string()
    .regex(INSTANCE_PATTERN, `DEDALO_SITE_INSTANCE must match ${INSTANCE_PATTERN.source}`),

  DEPLOYMENT_MODE: z.enum(['apache', 'nginx', 'standalone']).default('nginx'),
  /**
   * HOW THE ENGINE REACHES US. A unix socket by default, because that is what the
   * provisioner renders and what the pairing fragment tells the engine to dial: the
   * socket's ownership (0660 <user>:<engine group>) IS the access decision, and no other
   * uid on the host — another museum's service user included — can connect at all.
   * `tcp` exists for a laptop, where there is no systemd to own a runtime directory.
   */
  LISTEN_KIND: z.enum(['unix', 'tcp']).default('unix'),
  /** The socket path. Empty under LISTEN_KIND=tcp; index.ts refuses an empty one otherwise. */
  LISTEN_SOCKET: z.string().default(''),
  PORT: z.coerce.number().default(3200),
  // Loopback by default: a tcp run is a development run, and binding 0.0.0.0 would publish
  // the daemon to the network rather than to the operator's own machine.
  HOST: z.string().default('127.0.0.1'),
  // The subpath the proxy mounts us under; router.ts strips it before matching.
  BASE_PATH: z.string().default('/publication/site_builder'),
  // Defaults to production: the unsafe direction (leaking internal error messages) must be
  // the one you have to ask for.
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  /**
   * The one credential the engine holds. Every request except /health must carry it as
   * `Authorization: Bearer <token>`; the engine is the SOLE client and the sole authorizer.
   *
   * IT IS NOT IN THE RENDERED ENV, BY LAW — that file is group-readable and its whole
   * contents reach every agent child. It arrives as a systemd credential, out of the
   * root-owned 0600 file the provisioner mints, and is read at
   * `$CREDENTIALS_DIRECTORY/SERVICE_TOKEN`. The minimum length is enforced here so a
   * truncated paste fails the boot, not the audit trail.
   */
  SERVICE_TOKEN: z.string().min(32, 'SERVICE_TOKEN must be at least 32 characters'),

  /**
   * THE INSTANCE'S OWN ROOTS. Required, no defaults: under the instance model these are
   * per-museum paths that `src/provision/layout.ts` derives and the unit's ReadWritePaths=
   * confines, so a default here could only be one museum's — or, worse, a path several
   * museums would share.
   */
  SITES_ROOT: absolutePath,
  /** The agent's HOME (`~/.claude` and friends). Never the workspaces root: an agent turn
   *  writes into a workspace, and a HOME inside it is a site able to rewrite the agent's
   *  own configuration. */
  AGENT_HOME: absolutePath,
  /** The audit DIRECTORY. Root-owned; the FILE inside it is the daemon's, which is what
   *  makes the trail append-only in the filesystem rather than by convention. */
  AUDIT_DIR: absolutePath,
  /**
   * The parent of the per-site webspaces the web server serves. Confined by the unit and
   * reported at boot — but NOT a placement rule: a site's webspace is read from the table
   * below, never computed from this base. See SITE_TABLE_FILE.
   */
  WEBSPACE_BASE: absolutePath,

  /**
   * THE SITE TABLE — where this daemon reads every site's placement FROM, instead of
   * deriving it.
   *
   * Required, with no default, exactly like the roots: the file is one museum's, it is
   * rendered into `<configDir>/sites.json` by the provisioner, and a default here would be
   * a daemon guessing which museum's placements to publish against. A run that has not been
   * provisioned (a laptop, the suite) states the path in its own env file and writes the
   * table there — the suite's fixture does precisely that, playing the provisioner with the
   * provisioner's own renderer.
   *
   * The daemon refuses to boot when it is absent, unparseable, hand-edited or stamped for
   * another instance (src/instance/roots.ts → src/sites/site_table.ts): every path it
   * publishes to comes out of this file, so an unreadable one is not a degraded mode.
   */
  SITE_TABLE_FILE: absolutePath,

  /**
   * WHERE A SITE ANSWERS — the two halves of a site's URL that belong to the HOST.
   *
   * There were four keys here until the surfaces became per-site webspace pairs:
   * PREPROD_ROOT / PROD_ROOT (one tree per surface, shared by every site) and
   * PREPROD_BASE_URL / PROD_BASE_URL (one base URL per surface, likewise). All four
   * described a daemon that served `<root>/<slug>/` — a shape the provisioner never
   * builds and no generated vhost ever served. A site now lives in its own webspace
   * (`<WEBSPACE_BASE>/<domain>`, derived in `src/sites/webspace.ts` from the domain in
   * site.json) and answers at its own domain, so its paths and its URL are both facts
   * about the SITE.
   *
   * What is left is the part only the declaration knows: the draft vhost's host prefix,
   * and whether the public vhost terminates TLS. Both are rendered into the env by
   * `layout.ts`; the defaults here are for a hand-run daemon, which has no vhosts at all.
   */
  PREPROD_HOST_PREFIX: z.string().default('pre'),
  PROD_URL_SCHEME: z.enum(['http', 'https']).default('https'),

  // Where the generated sites read their data from: the read-only Publication API v2. Also
  // handed to the agent as its MCP endpoint (<PUBLICATION_API_URL>/mcp) and quoted in the
  // generated AGENTS.md. This is the ONLY data source a site is built against.
  PUBLICATION_API_URL: z.string().min(1, 'PUBLICATION_API_URL is required'),
  // Only needed when the v2 instance has API_KEYS configured (default open). A VALUE, so on
  // a provisioned host it arrives as a credential — never out of the rendered env.
  PUBLICATION_API_KEY: z.string().default(''),
  // The PATH of the file that key lives in, which is all the rendered env may carry. Read
  // only when no credential supplied the value itself (see `layerPublicationApiKeyFile`).
  PUBLICATION_API_KEY_FILE: z.string().default(''),

  // Default agent driver for new sites; site.json may pin a different one per site.
  AGENT_DRIVER: z.enum(DRIVER_IDS).default('claude_code'),
  /**
   * The pinned driver binaries. ABSOLUTE on a provisioned host, and asserted at boot to be
   * root-owned and not group/world-writable (src/instance/roots.ts): a bare `claude` would
   * be resolved off PATH, and PATH is the one thing a compromised agent turn can arrange to
   * control — a cross-instance substitution vector wearing a convenience's clothes. Empty
   * means the driver is unavailable on this host, which is how the suite runs.
   */
  CLAUDE_CODE_BIN: z.string().default(''),
  OPENCODE_BIN: z.string().default(''),
  PI_BIN: z.string().default(''),
  // Anthropic credential for the claude_code driver.
  ANTHROPIC_API_KEY: z.string().default(''),
  // Extra per-driver provider credentials, forwarded ONLY to that driver's child process:
  // comma-separated KEY=VALUE pairs (e.g. "OPENAI_API_KEY=sk-...").
  OPENCODE_ENV: z.string().default(''),
  PI_ENV: z.string().default(''),

  // Limits. MAX_CONCURRENT_SESSIONS is a global semaphore across sites; per site it is
  // always exactly one active turn (sessions/manager.ts).
  MAX_SITES: z.coerce.number().int().min(1).default(20),
  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().min(1).default(2),
  // Wall clock for one agent turn (one CLI invocation). Generous: real build-a-page turns
  // run minutes, but nothing should run forever on an unattended server.
  SESSION_TURN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20 * 60 * 1000),
  INSTALL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5 * 60 * 1000),
  BUILD_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5 * 60 * 1000),
  // Checked before starting a session or build; a workspace over quota refuses new work
  // until someone cleans it up (agents can pull surprisingly heavy node_modules trees).
  SITE_DISK_QUOTA_MB: z.coerce.number().int().min(1).default(1024),
  // Release directories kept per site per surface for rollback.
  RELEASES_RETAINED: z.coerce.number().int().min(1).default(5),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

/** Every key the schema knows — the census an unknown key is refused against. */
const KNOWN_KEYS: readonly string[] = Object.keys(envSchema.shape).sort();

/* ────────────────────────────────────────────────────────────────────────────────────
 * The three sources
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE ONLY KEYS THIS MODULE READS OUT OF THE AMBIENT ENVIRONMENT.
 *
 * Everything else comes from the named env file. The list is short on purpose: each entry
 * is a fact about the RUN rather than about the museum.
 *
 *   - DEDALO_SITE_INSTANCE — the generated unit states it as `Environment=` AFTER its
 *     `EnvironmentFile=`, deliberately, so a stale env file can never tell the daemon it is
 *     a different museum than the unit that started it. Here that promise is kept one step
 *     harder: a disagreement between the two is a REFUSAL, not a silent win, because
 *     everything else in that file (the ROOTS) came from the same stale copy.
 *   - NODE_ENV / LOG_LEVEL — the env file may state them; a laptop and the suite set them
 *     ambiently and the rendered env deliberately does not carry them.
 */
const AMBIENT_KEYS: readonly string[] = ['DEDALO_SITE_INSTANCE', 'NODE_ENV', 'LOG_LEVEL'];

/**
 * Ambient names that are NOT configuration: they say where the configuration is. They must
 * never reach the parse, or `strict()` would refuse them as unknown keys.
 */
const ENV_FILE_VAR = 'DEDALO_SITE_ENV_FILE';
const CREDENTIALS_DIR_VAR = 'CREDENTIALS_DIRECTORY';

/** Where one resolved value came from — reported, never its content. */
export type ValueOrigin = 'env-file' | 'ambient' | 'credential' | 'api-key-file';

export interface ConfigSources {
  /** The env file to parse, or null when there is none to read. */
  readonly envFilePath: string | null;
  /** The ambient environment (`process.env` in the real boot; a literal in a gate). */
  readonly ambient: Record<string, string | undefined>;
  /** `$CREDENTIALS_DIRECTORY`, or null when this run has no credential store. */
  readonly credentialsDir: string | null;
}

/** What the boot actually read, for the preflight and for an operator asking "from where?". */
export interface ConfigSourceReport {
  readonly envFilePath: string | null;
  readonly envFileExists: boolean;
  /** The KEYS the env file stated. Never the values — this is quoted in refusals. */
  readonly envFileKeys: readonly string[];
  readonly credentialsDir: string | null;
  readonly credentialKeys: readonly string[];
  readonly origin: Readonly<Record<string, ValueOrigin>>;
}

/** A refusal raised while building the source. Every one of them names the door. */
class ConfigError extends Error {}

function refuse(message: string): never {
  throw new ConfigError(`${message} Nothing was started and nothing was written.`);
}

/**
 * Which env file this run reads.
 *
 * Named explicitly wherever it can be (`$DEDALO_SITE_ENV_FILE`, which the unit could set on
 * a host that keeps it somewhere unusual); otherwise the one file each context has always
 * meant — `.env.test` under the suite, `.env` beside the package on a laptop. A default
 * that follows NODE_ENV rather than the caller is what makes the suite's file the SAME
 * source the daemon parses, instead of something Bun happened to inject first.
 */
export function defaultEnvFilePath(ambient: Record<string, string | undefined>): string {
  const named = ambient[ENV_FILE_VAR];
  if (named && named.trim()) {
    const path = named.trim();
    if (!isAbsolute(path)) refuse(`${ENV_FILE_VAR}='${path}' must be an absolute path.`);
    return path;
  }
  return join(PACKAGE_DIR, ambient.NODE_ENV === 'test' ? '.env.test' : '.env');
}

/**
 * THE ENV-FILE GRAMMAR LIVES IN `src/env_file.ts`, and is re-exported here.
 *
 * It moved because a THIRD party reads the same bytes: `provision adopt` parses a
 * PRE-instance `.env` to learn what a museum's daemon was configured with, and it cannot
 * import this module to borrow the parser — this one resolves the daemon's configuration at
 * import time and exits the process when it cannot. A second parser of the same grammar
 * would be free to disagree about one escape, which on the adoption path is a SERVICE_TOKEN
 * read wrongly out of the file and an engine that can no longer reach its own site builder.
 *
 * Re-exported rather than merely imported so every existing caller (and the suite) keeps
 * naming one function in one place.
 */
export { parseEnvFile };

/**
 * THE CREDENTIALS, out of systemd's per-unit tmpfs.
 *
 * One file per key, named exactly as the key — which is why `layout.ts` holds credential
 * names to one grammar: the same string is a filename, a `LoadCredential=` id and an
 * environment variable name. Content is trimmed, because a root-owned secret file written
 * by an operator (`printf`, `echo`, an editor) carries a trailing newline far more often
 * than a secret legitimately ends in whitespace.
 *
 * An UNKNOWN key here is refused like an unknown key anywhere else: a declared credential
 * this daemon never reads is a museum believing a provider is configured when nothing will
 * ever use it.
 */
export function readCredentials(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch (error) {
    refuse(
      `The credential directory '${dir}' ($${CREDENTIALS_DIR_VAR}) could not be read ` +
        `(${(error as Error).message}).`,
    );
  }
  for (const name of names) {
    const path = join(dir, name);
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    if (!SECRET_KEY_PATTERN.test(name)) {
      refuse(
        `The credential directory '${dir}' holds '${name}', which is not a usable ` +
          `credential name (${SECRET_KEY_PATTERN.source}).`,
      );
    }
    if (!KNOWN_KEYS.includes(name)) {
      refuse(
        `The credential '${name}' (from '${path}') is not a key this daemon reads. Either ` +
          `the declaration names a credential nothing uses, or a key was renamed and the ` +
          `unit's LoadCredential= line was not. Known keys: ${KNOWN_KEYS.join(', ')}.`,
      );
    }
    out[name] = readFileSync(path, 'utf8').trim();
  }
  return out;
}

/**
 * BUILD THE SOURCE, then validate it. The order of the layers is the security story:
 * a credential file is the only layer a service user cannot have written, so it is last.
 */
export function resolveConfig(sources: ConfigSources): { config: Config; report: ConfigSourceReport } {
  const origin: Record<string, ValueOrigin> = {};
  const values: Record<string, string> = {};

  /* 1. The env file. */
  const envFilePath = sources.envFilePath;
  const envFileExists = envFilePath !== null && existsSync(envFilePath);
  let fileValues: Record<string, string> = {};
  if (envFileExists) {
    try {
      fileValues = parseEnvFile(readFileSync(envFilePath as string, 'utf8'), envFilePath as string);
    } catch (error) {
      // The parser is shared with the provisioner and therefore carries no trailer of its
      // own; this module's voice adds one. See `src/env_file.ts` for why it moved.
      refuse((error as Error).message);
    }
  }
  ENV_FILE_DIR = envFilePath ? dirname(envFilePath) : PACKAGE_DIR;
  for (const [key, value] of Object.entries(fileValues)) {
    values[key] = value;
    origin[key] = 'env-file';
  }

  /* 2. The ambient allowlist — filling what the file did not state. */
  for (const key of AMBIENT_KEYS) {
    const value = sources.ambient[key];
    if (value === undefined || value === '') continue;
    if (key === 'DEDALO_SITE_INSTANCE' && values[key] !== undefined && values[key] !== value) {
      refuse(
        `The instance name disagrees with itself: the environment says ` +
          `'${value}' and '${envFilePath}' says '${values[key]}'. One of them is stale, and ` +
          `the roots this daemon would write to came from the file.`,
      );
    }
    if (values[key] !== undefined) continue;
    values[key] = value;
    origin[key] = 'ambient';
  }

  /* 3. The credentials — they win, and they are the only layer that can. */
  const credentials = sources.credentialsDir ? readCredentials(sources.credentialsDir) : {};
  for (const [key, value] of Object.entries(credentials)) {
    values[key] = value;
    origin[key] = 'credential';
  }

  /* 3b. …and the one indirection the rendered env may legitimately carry: a PATH. */
  const apiKeyFile = values[PUBLICATION_API_KEY_FILE_KEY];
  if (apiKeyFile && !values[PUBLICATION_API_KEY_KEY]) {
    try {
      values[PUBLICATION_API_KEY_KEY] = readFileSync(apiKeyFile, 'utf8').trim();
      origin[PUBLICATION_API_KEY_KEY] = 'api-key-file';
    } catch (error) {
      refuse(
        `${PUBLICATION_API_KEY_FILE_KEY} names '${apiKeyFile}', which this daemon cannot ` +
          `read (${(error as Error).message}). On a provisioned host that file is root-owned ` +
          `0600 and reaches this process as the credential ` +
          `$${CREDENTIALS_DIR_VAR}/${PUBLICATION_API_KEY_KEY} instead — add it to the unit's ` +
          `LoadCredential= lines, or point the key at a file this service user may open.`,
      );
    }
  }

  /* 4. An unknown key is named, not ignored. */
  const unknown = Object.keys(values)
    .filter(key => !KNOWN_KEYS.includes(key))
    .sort();
  if (unknown.length > 0) {
    const where = unknown.map(key => `${key} (${origin[key]})`).join(', ');
    refuse(
      `The configuration names ${unknown.length === 1 ? 'a key' : 'keys'} this daemon does ` +
        `not read: ${where}. A generated env file carrying a key nothing reads is either a ` +
        `renderer inventing a knob or a daemon that dropped one — both are drift, and drift ` +
        `that takes effect silently is the failure this refusal exists to prevent. ` +
        `Known keys: ${KNOWN_KEYS.join(', ')}.`,
    );
  }

  /* 5. The grammar. `strict()` is the backstop behind step 4, never the only check: a zod
   *    'Unrecognized key' names the key and nothing else — not where it came from. */
  const parsed = envSchema.strict().safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    const detail = Object.entries(fields)
      .map(([key, errors]) => `${key}: ${(errors ?? []).join('; ')}`)
      .join('\n  ');
    refuse(
      `The configuration for instance '${values.DEDALO_SITE_INSTANCE ?? '(unnamed)'}' is not ` +
        `valid.\n  ${detail}\nRead from ` +
        `${envFileExists ? `'${envFilePath}'` : `no env file (looked at '${envFilePath}')`}` +
        `${sources.credentialsDir ? ` plus the credentials in '${sources.credentialsDir}'` : ' and no credential directory'}.`,
    );
  }

  const config = Object.freeze(parsed.data);

  return {
    config,
    report: {
      envFilePath,
      envFileExists,
      envFileKeys: Object.keys(fileValues).sort(),
      credentialsDir: sources.credentialsDir,
      credentialKeys: Object.keys(credentials).sort(),
      origin: Object.freeze(origin),
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The boot
 * ──────────────────────────────────────────────────────────────────────────────────── */

function loadOrExit(): { config: Config; report: ConfigSourceReport } {
  const ambient = process.env as Record<string, string | undefined>;
  const credentialsDir = ambient[CREDENTIALS_DIR_VAR]?.trim() || null;
  try {
    return resolveConfig({
      envFilePath: defaultEnvFilePath(ambient),
      ambient,
      credentialsDir,
    });
  } catch (error) {
    // Fail the process, not the request: a misconfigured deploy must not become a daemon
    // answering requests with a surprising default. The message is the whole diagnosis —
    // it names the file, the credential directory and every field at once, so a bad deploy
    // is fixed in one pass rather than one restart per typo.
    console.error(`[config] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const loaded = loadOrExit();

export const config = loaded.config;

/** What the boot read, and from where — keys only, never values. */
export const configSource = Object.freeze(loaded.report);

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';

/** Splits a comma-separated KEY=VALUE env value into a record (driver cred allowlists). */
export function parseEnvPairs(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of value.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

/** Re-exported so a consumer naming the bearer names the same string the layout does. */
export { SERVICE_TOKEN_KEY };
