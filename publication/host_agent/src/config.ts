/**
 * THE WHOLE OF THE AGENT'S CONFIGURATION, AND THE ONE PATH IT ARRIVES BY.
 *
 * Shape and discipline follow publication/site_builder/src/config.ts (no code is imported
 * from it — separate deployables):
 *
 *   - Invalid config kills the process (`process.exit(1)` in loadOrExit) instead of
 *     degrading into a running agent with a surprising default.
 *   - Nothing else in src/ reads the process environment (tests/process_env_tripwire.test.ts).
 *
 * THE KEYS ARE THE AgentConfig FIELD NAMES — one spelling from the env file to the object.
 * The provisioner (Tasks 8/9) and the live drill (Task 11) render exactly these.
 *
 * THE SOURCE IS BUILT EXPLICITLY, in one order, everywhere:
 *
 *   1. THE NAMED ENV FILE — `$DEDALO_HOST_AGENT_ENV_FILE` (absolute; the agent unit sets it).
 *      Unset: `.env.test` in the package dir under NODE_ENV=test — ONLY in a checkout whose
 *      `.test-tmp/` declares itself the suite's (TEST_SCRATCH_MARKER: a real directory owned
 *      by this uid holding a real instance marker, planted by tests/preload.ts before any
 *      test module loads) — and a REFUSAL otherwise. A production agent never falls back to
 *      a file inside its own code checkout, which whoever owns the checkout controls; and a
 *      DEPLOYED checkout never boots in test mode from the committed `.env.test` (public
 *      dummy token, unscrubbed 5xx detail), whatever NODE_ENV a hand start passes: the
 *      provisioner refuses an agent_dir holding `.test-tmp/` (src/provision/plan.ts), and a
 *      provisioned agent_dir is root-owned, so the agent cannot plant one. A missing file is
 *      a refusal. Relative paths in the file resolve against the file's own directory.
 *   2. THE AMBIENT ALLOWLIST — NODE_ENV, LOG_LEVEL, filling only what the file did not
 *      state. Every other ambient variable is ignored (an instance name or a token in the
 *      process environment is not a source). Test mode is NEVER ambient: NODE_ENV=test
 *      relaxes the credential law, so only the env file may state it — an ambient `test`
 *      over a file silent on NODE_ENV is a refusal, not a fill.
 *   3. THE CREDENTIALS — `$CREDENTIALS_DIRECTORY/SERVICE_TOKEN` (systemd LoadCredential=)
 *      WINS over the file. Any other file in that directory is refused by name. Outside
 *      NODE_ENV=test the env file may not carry SERVICE_TOKEN at all: the file is 0640 with
 *      the agent's group (the engine's, on a unix-socket host), the credential is root 0600.
 *
 * Then: an unknown key is refused by name, the grammar is strict zod, and the cross-field
 * laws hold — a `tls` listener has its host, port, cert, key AND client CA (mTLS fails
 * closed at config, not at a handshake) and binds ONE interface named by a canonical IP
 * literal, never a hostname or a wildcard in any spelling (tlsHostProblem; spec §2.2, the
 * channel is private); a `unix` listener has its socket and
 * no TLS key; plain TCP does not exist; MEDIA_ROOT is required unless MEDIA_MODE=none and
 * absent when it is; the media root and the state root never contain each other.
 *
 * Every refusal is ONE line and never quotes a value.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { parseEnvFile } from './env_file';
import { INSTANCE_MARKER } from './instance/roots';

const PACKAGE_DIR = resolve(import.meta.dir, '..');

/** The suite's scratch tree inside a package checkout (tests/fixtures/instance.ts SCRATCH_DIR_NAME). */
export const TEST_SCRATCH_DIR = '.test-tmp';
/** What declares a checkout the suite's: `<package>/.test-tmp/<INSTANCE_MARKER>` (tests/preload.ts plants it). */
export const TEST_SCRATCH_MARKER = join(TEST_SCRATCH_DIR, INSTANCE_MARKER);

/** The ambient variable naming the env file (an absolute path). The agent unit sets it (Task 9). */
export const ENV_FILE_VAR = 'DEDALO_HOST_AGENT_ENV_FILE';
/** systemd's credential directory variable. */
export const CREDENTIALS_DIR_VAR = 'CREDENTIALS_DIRECTORY';
/** The ONLY ambient variables that may reach the configuration. */
export const AMBIENT_KEYS: readonly string[] = Object.freeze(['NODE_ENV', 'LOG_LEVEL']);
/** The ONLY keys that may arrive as a credential file. */
export const CREDENTIAL_KEYS: readonly string[] = Object.freeze(['SERVICE_TOKEN']);

/** An instance name: it ends up in unit and user names, so it is narrow. */
export const INSTANCE_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;
/** A systemd unit name as it appears in a closed argv (no `.service` needed, no spaces, no slash). */
export const UNIT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@._-]{0,63}$/;
/** sun_path is 104 bytes on macOS, 108 on Linux; 103 + NUL fits both. */
export const SOCKET_PATH_MAX_BYTES = 103;

const TLS_KEYS = ['TLS_HOST', 'TLS_PORT', 'TLS_CERT_FILE', 'TLS_KEY_FILE', 'TLS_CLIENT_CA_FILE'] as const;
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'localhost']);

export interface AgentConfig {
  INSTANCE: string;
  NODE_ENV: 'production' | 'test';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  LISTEN_KIND: 'unix' | 'tls';
  SOCKET_PATH?: string;
  TLS_HOST?: string;
  TLS_PORT?: number;
  TLS_CERT_FILE?: string;
  TLS_KEY_FILE?: string;
  TLS_CLIENT_CA_FILE?: string;
  SERVICE_TOKEN: string;
  STATE_ROOT: string;
  WEB_SERVER: 'apache' | 'nginx';
  WEB_UNIT: string;
  MEDIA_MODE: 'shared' | 'copy' | 'none';
  MEDIA_ROOT?: string;
  PHP_BIN: string;
  BUN_BIN: string;
  V2_UNIT: string;
  V2_HEALTH_URL: string;
  RELEASES_RETAINED: number;
  MAX_BUNDLE_BYTES: number;
  MAX_BUNDLE_ENTRIES: number;
}

export interface ConfigSources {
  /** The env file to parse (absolute). It must exist. */
  readonly envFilePath: string;
  /** The ambient environment; only AMBIENT_KEYS are read from it. */
  readonly ambient: Readonly<Record<string, string | undefined>>;
  /** `$CREDENTIALS_DIRECTORY`, or null when the process has none. */
  readonly credentialsDir: string | null;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function refuse(message: string): never {
  throw new ConfigError(`${message} Nothing was started.`);
}

function isLoopbackHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname);
}

/** Expand an IPv6 literal (isIP === 6) into its 8 hextets; an embedded dotted quad becomes 2 hextets. */
function ipv6Hextets(address: string): number[] {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  const tail = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split('::') as [string, string | undefined];
  const parse = (part: string) => (part === '' ? [] : part.split(':').map(h => Number.parseInt(h, 16)));
  const left = parse(head);
  if (rest === undefined) return left;
  const right = parse(rest);
  return [...left, ...new Array(8 - left.length - right.length).fill(0), ...right];
}

/**
 * Why TLS_HOST is NOT a bindable private address. Anything that is not an IP literal in
 * canonical form is refused: a hostname resolves wherever DNS (or the resolver's legacy
 * numeric forms — `0`, `0.0`, `0x0`, `00.0.0.0`) says, and Bun binds those on EVERY
 * interface. Among literals: `*`, the unspecified address in any family/spelling, and every
 * IPv6 form embedding an IPv4 address (::ffff:a.b.c.d mapped, ::a.b.c.d compatible — write
 * the IPv4 address itself; ::ffff:0.0.0.0 and ::0.0.0.0 bind every interface). null = valid.
 */
export function tlsHostProblem(host: string): string | null {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const family = isIP(bare);
  if (family === 0) return 'not an IP literal';
  if (family === 4) {
    if (bare !== host) return 'not an IP literal';
    const octets = bare.split('.');
    if (octets.every(octet => Number(octet) === 0)) return 'the unspecified address';
    if (octets.some(octet => String(Number(octet)) !== octet)) return 'not a canonical dotted quad';
    return null;
  }
  const hextets = ipv6Hextets(bare);
  if (hextets.length !== 8 || hextets.some(h => !Number.isInteger(h) || h < 0 || h > 0xffff)) {
    return 'not an IP literal';
  }
  if (hextets.every(h => h === 0)) return 'the unspecified address';
  const top80Zero = hextets.slice(0, 5).every(h => h === 0);
  if (top80Zero && hextets[5] === 0xffff) return 'an IPv4-mapped IPv6 address';
  const isLoopback = top80Zero && hextets[5] === 0 && hextets[6] === 0 && hextets[7] === 1;
  if (top80Zero && hextets[5] === 0 && !isLoopback) return 'an IPv4-compatible IPv6 address';
  return null;
}

/** A bind address meaning "every interface" — or one that may: anything tlsHostProblem refuses. */
export function isUnspecifiedHost(host: string): boolean {
  return tlsHostProblem(host) !== null;
}

function within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** The env-file grammar, keyed by AgentConfig field. Paths resolve against `baseDir` (the env file's dir). */
function envObject(baseDir: string) {
  const path = z.string().transform(value => resolve(baseDir, value));
  const bin = (key: string) =>
    z.string().refine(isAbsolute, `${key} must be an absolute path (the agent never searches PATH)`);
  const unit = (key: string) => z.string().regex(UNIT_PATTERN, `${key} must match ${UNIT_PATTERN.source}`);
  return z.strictObject({
    INSTANCE: z.string().regex(INSTANCE_PATTERN, `INSTANCE must match ${INSTANCE_PATTERN.source}`),
    NODE_ENV: z.enum(['production', 'test']).default('production'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    LISTEN_KIND: z.enum(['unix', 'tls'], { error: 'LISTEN_KIND must be unix or tls (plain TCP does not exist)' }),
    SOCKET_PATH: path.optional(),
    TLS_HOST: z
      .string()
      .refine(
        host => tlsHostProblem(host) === null,
        'TLS_HOST must name one interface as a canonical IP literal (a private address), never a hostname, ' +
          'a wildcard such as 0.0.0.0 or ::, or an IPv6 form embedding an IPv4 address',
      )
      .optional(),
    TLS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    TLS_CERT_FILE: path.optional(),
    TLS_KEY_FILE: path.optional(),
    TLS_CLIENT_CA_FILE: path.optional(),
    SERVICE_TOKEN: z.string().min(32, 'SERVICE_TOKEN must be at least 32 characters'),
    STATE_ROOT: path,
    WEB_SERVER: z.enum(['apache', 'nginx']),
    WEB_UNIT: unit('WEB_UNIT'),
    MEDIA_MODE: z.enum(['shared', 'copy', 'none']),
    MEDIA_ROOT: path.optional(),
    PHP_BIN: bin('PHP_BIN'),
    BUN_BIN: bin('BUN_BIN'),
    V2_UNIT: unit('V2_UNIT'),
    V2_HEALTH_URL: z
      .string()
      .refine(isLoopbackHttpUrl, 'V2_HEALTH_URL must be an http:// URL on 127.0.0.1, [::1] or localhost'),
    RELEASES_RETAINED: z.coerce.number().int().min(2).default(3),
    MAX_BUNDLE_BYTES: z.coerce.number().int().min(1).default(268435456),
    MAX_BUNDLE_ENTRIES: z.coerce.number().int().min(1).default(200000),
  });
}

type EnvValues = z.infer<ReturnType<typeof envObject>>;

/** Every key the env file / ambient / credential layers may carry = the AgentConfig field names. */
export const KNOWN_KEYS: readonly string[] = Object.freeze(Object.keys(envObject(PACKAGE_DIR).shape).sort());

function envSchema(baseDir: string) {
  return envObject(baseDir).superRefine((v, ctx) => {
    const issue = (key: string, message: string) => ctx.addIssue({ code: 'custom', path: [key], message });
    if (v.LISTEN_KIND === 'tls') {
      for (const key of TLS_KEYS) {
        if (v[key] === undefined) issue(key, `${key} is required when LISTEN_KIND=tls`);
      }
      if (v.SOCKET_PATH !== undefined) issue('SOCKET_PATH', 'SOCKET_PATH is set but LISTEN_KIND=tls');
    } else {
      if (v.SOCKET_PATH === undefined) issue('SOCKET_PATH', 'SOCKET_PATH is required when LISTEN_KIND=unix');
      else if (Buffer.byteLength(v.SOCKET_PATH) > SOCKET_PATH_MAX_BYTES) {
        issue('SOCKET_PATH', `SOCKET_PATH resolves to more than ${SOCKET_PATH_MAX_BYTES} bytes (sun_path limit)`);
      }
      for (const key of TLS_KEYS) {
        if (v[key] !== undefined) issue(key, `${key} is set but LISTEN_KIND=unix`);
      }
    }
    if (v.MEDIA_MODE === 'none') {
      if (v.MEDIA_ROOT !== undefined) issue('MEDIA_ROOT', 'MEDIA_ROOT is set but MEDIA_MODE=none');
    } else if (v.MEDIA_ROOT === undefined) {
      issue('MEDIA_ROOT', `MEDIA_ROOT is required when MEDIA_MODE=${v.MEDIA_MODE}`);
    } else if (within(v.STATE_ROOT, v.MEDIA_ROOT) || within(v.MEDIA_ROOT, v.STATE_ROOT)) {
      issue('MEDIA_ROOT', 'MEDIA_ROOT and STATE_ROOT must not contain each other');
    }
  });
}

function toAgentConfig(v: EnvValues): AgentConfig {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v)) {
    if (value !== undefined) out[key] = value;
  }
  return Object.freeze(out) as unknown as AgentConfig;
}

/**
 * Why `packageDir` is NOT a checkout the suite declared, or null when it is: `.test-tmp/` a
 * real directory owned by this uid, holding a real (not linked) marker naming an instance.
 */
export function testScratchProblem(packageDir: string): string | null {
  const dir = join(packageDir, TEST_SCRATCH_DIR);
  const marker = join(packageDir, TEST_SCRATCH_MARKER);
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  try {
    const st = lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) return `'${TEST_SCRATCH_DIR}' is not a real directory`;
    if (uid !== null && st.uid !== uid) return `'${TEST_SCRATCH_DIR}' is not owned by this process`;
  } catch {
    return `there is no '${TEST_SCRATCH_DIR}' scratch tree`;
  }
  try {
    const st = lstatSync(marker);
    if (st.isSymbolicLink() || !st.isFile()) return `'${TEST_SCRATCH_MARKER}' is not a regular file`;
    if (!/^[a-z][a-z0-9_]{1,31}\n$/.test(readFileSync(marker, 'utf8'))) return `'${TEST_SCRATCH_MARKER}' names no instance`;
  } catch {
    return `'${TEST_SCRATCH_MARKER}' is missing`;
  }
  return null;
}

/**
 * The env file this process reads: `$DEDALO_HOST_AGENT_ENV_FILE` (absolute), else — under
 * NODE_ENV=test, in a checkout the suite declared (testScratchProblem) — the package's
 * `.env.test`. Anything else REFUSES: no package-dir `.env` fallback exists. `packageDir`
 * is injectable for the gate only.
 */
export function defaultEnvFilePath(
  ambient: Readonly<Record<string, string | undefined>>,
  packageDir: string = PACKAGE_DIR,
): string {
  const named = ambient[ENV_FILE_VAR]?.trim();
  if (named) {
    if (!isAbsolute(named)) refuse(`${ENV_FILE_VAR} must be an absolute path.`);
    return named;
  }
  if (ambient.NODE_ENV === 'test') {
    const problem = testScratchProblem(packageDir);
    if (problem !== null) {
      refuse(
        `NODE_ENV=test without ${ENV_FILE_VAR}: the committed .env.test is read only in a checkout the ` +
          `suite declared, and here ${problem} (bun test plants it via tests/preload.ts). A deployed ` +
          `agent never runs in test mode; name its env file with ${ENV_FILE_VAR}.`,
      );
    }
    return join(packageDir, '.env.test');
  }
  refuse(
    `${ENV_FILE_VAR} is not set. Outside NODE_ENV=test the agent reads only the env file its unit ` +
      `names (the provisioner renders it); it never falls back to a file in its own directory.`,
  );
}

/** Read `$CREDENTIALS_DIRECTORY`: only CREDENTIAL_KEYS, every other regular file refused by name. */
export function readCredentials(dir: string): Record<string, string> {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    refuse(`The credential directory '${dir}' ($${CREDENTIALS_DIR_VAR}) could not be read.`);
  }
  const out: Record<string, string> = {};
  for (const name of names) {
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    if (!CREDENTIAL_KEYS.includes(name)) {
      refuse(`The credential '${name}' in '${dir}' is not one this agent reads (known: ${CREDENTIAL_KEYS.join(', ')}).`);
    }
    out[name] = readFileSync(path, 'utf8').trim();
  }
  return out;
}

function describeIssue(issue: z.core.$ZodIssue, values: Record<string, string>): string {
  const key = issue.path.map(String).join('.') || '(config)';
  // Absence is "required" whatever zod's code (an enum reports a missing value as invalid_value);
  // a cross-field (custom) issue keeps its own message, which names the condition.
  if (issue.code !== 'custom' && issue.path.length > 0 && values[key] === undefined) return `${key} is required`;
  return issue.message.startsWith(key) ? issue.message : `${key}: ${issue.message}`;
}

/** Resolve the configuration from explicit sources. PURE apart from reading the named files. THROWS ConfigError. */
export function resolveConfig(sources: ConfigSources): AgentConfig {
  const values: Record<string, string> = {};
  const origin: Record<string, string> = {};

  /* 1. The env file. */
  const { envFilePath } = sources;
  if (!existsSync(envFilePath)) refuse(`No env file at '${envFilePath}'.`);
  let fileValues: Record<string, string>;
  try {
    fileValues = parseEnvFile(readFileSync(envFilePath, 'utf8'), envFilePath);
  } catch (error) {
    refuse((error as Error).message);
  }
  for (const [key, value] of Object.entries(fileValues)) {
    values[key] = value;
    origin[key] = 'env-file';
  }

  /* 2. The ambient allowlist — only where the file is silent. */
  for (const key of AMBIENT_KEYS) {
    const value = sources.ambient[key];
    if (value === undefined || value === '') continue;
    if (values[key] !== undefined && values[key] !== '') continue;
    if (key === 'NODE_ENV' && value !== 'production' && value !== 'test') {
      refuse(
        `NODE_ENV='${value}' is not a mode of this agent: it runs as 'production' (the default) or ` +
          `'test', and test mode may come only from the env file '${envFilePath}'. Unset the ` +
          `ambient NODE_ENV or set it to production.`,
      );
    }
    if (key === 'NODE_ENV' && value === 'test') {
      refuse(
        `NODE_ENV=test may come only from the env file '${envFilePath}' (test mode relaxes the ` +
          `credential law); the ambient environment may fill only NODE_ENV=production.`,
      );
    }
    values[key] = value;
    origin[key] = 'ambient';
  }

  /* 3. The credentials — they win. */
  const credentials = sources.credentialsDir ? readCredentials(sources.credentialsDir) : {};
  for (const [key, value] of Object.entries(credentials)) {
    values[key] = value;
    origin[key] = 'credential';
  }

  /* 4. An unknown key is named, not ignored. */
  const unknown = Object.keys(values).filter(key => !KNOWN_KEYS.includes(key)).sort();
  if (unknown.length > 0) {
    refuse(`Unknown configuration key(s): ${unknown.map(key => `${key} (${origin[key]})`).join(', ')}.`);
  }

  /* 5. The credential law: outside NODE_ENV=test the env file never carries the bearer. */
  if (values.NODE_ENV !== 'test' && (fileValues.SERVICE_TOKEN ?? '') !== '') {
    refuse(
      `SERVICE_TOKEN is set in the env file '${envFilePath}' outside NODE_ENV=test. A host receives it ` +
        `only as a systemd credential (LoadCredential=SERVICE_TOKEN:<root-only file>, read from ` +
        `$${CREDENTIALS_DIR_VAR}); remove it from the env file.`,
    );
  }

  /* 6. An empty value is an unset value (`TLS_HOST=` in a rendered file means "not this kind"). */
  for (const key of Object.keys(values)) {
    if (values[key] === '') delete values[key];
  }

  /* 7. The grammar and the cross-field laws. */
  const parsed = envSchema(dirname(envFilePath)).safeParse(values);
  if (!parsed.success) {
    refuse(`Invalid configuration in '${envFilePath}': ${parsed.error.issues.map(i => describeIssue(i, values)).join('; ')}.`);
  }
  return toAgentConfig(parsed.data);
}

function loadOrExit(): AgentConfig {
  const ambient = process.env as Record<string, string | undefined>;
  try {
    return resolveConfig({
      envFilePath: defaultEnvFilePath(ambient),
      ambient,
      credentialsDir: ambient[CREDENTIALS_DIR_VAR]?.trim() || null,
    });
  } catch (error) {
    console.error(`[config] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/** The agent's configuration, resolved once at import. */
export const config: AgentConfig = loadOrExit();
