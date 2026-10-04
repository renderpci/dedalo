/**
 * THE LAYOUT — every path, owner and mode of ONE publication-host agent instance, DERIVED
 * from its declaration (`/etc/dedalo_publication_host/<instance>.json`). Nothing on the
 * host is spelled anywhere else: renderers, plan, apply and the CLI read it from here.
 *
 * Shape copied from publication/site_builder/src/provision/layout.ts (INSTANCE_PATTERN, the
 * MODES matrix, derive()), reduced to one agent and no fleet (D10). Nothing is imported
 * from there: separate deployables.
 *
 * The state-root marker, the state tree's role names and WHO OWNS EACH PART of it are
 * src/instance/roots.ts's (the agent's boot preflight reads the same exports): imported
 * here, never restated. The configtest binary is defined HERE, once; src/exec.ts re-exports
 * it, so the agent's sudo argv, the plan's trust check and the sudoers rule name one path.
 *
 * ZERO-DEPENDENCY (Global Constraints): root-repo tests import this module. node: builtins
 * and ../instance/roots only (itself builtins + one type-only import);
 * tests/provision_zero_dep.test.ts holds both. Written to compile under the engine's
 * `noUncheckedIndexedAccess`.
 */
import { join, normalize } from 'node:path';
import {
  AUDIT_DIR,
  AUDIT_FILE_NAME,
  INSTANCE_MARKER,
  PUBLICATION_API_DIR,
  RULES_DIR,
  STATE_TREE_OWNERSHIP,
  markerContent,
} from '../instance/roots';

export { INSTANCE_MARKER, markerContent };

/* ── grammars ─────────────────────────────────────────────────────────────────────── */

/** Same grammar as AgentConfig.INSTANCE (src/config.ts). Pinned equal by tests/provision_layout.test.ts. */
export const INSTANCE_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;
export const UNIX_NAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;
/** A systemd unit name WITHOUT the `.service` suffix. Same grammar as AgentConfig's UNIT_PATTERN
 *  (WEB_UNIT/V2_UNIT, src/config.ts), pinned equal by tests/provision_layout.test.ts: a unit
 *  derive() accepts is always one the agent's config resolves. */
export const UNIT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@._-]{0,63}$/;
/** Absolute, conservative character set: every path lands unquoted in a unit or sudoers line. */
export const ABSOLUTE_PATH_PATTERN = /^\/[A-Za-z0-9._/-]*$/;
/** A canonical, non-zero IPv4 dotted quad (no DNS name, no leading zeros) — it becomes the server
 *  certificate's SAN and the agent's TLS_HOST, which refuses anything else (Task 1 deviation 1). */
export const LISTEN_HOST_PATTERN =
  /^(?!0\.0\.0\.0$)(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
/** An env key that names a credential. The env file may never carry one (render/env.ts). */
export const SECRET_LOOKING_KEY = /(TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|_KEY)$/;

/* ── constants ────────────────────────────────────────────────────────────────────── */

/** The systemd credential id the agent reads at $CREDENTIALS_DIRECTORY/SERVICE_TOKEN. */
export const SERVICE_TOKEN_CREDENTIAL = 'SERVICE_TOKEN';
/** 32 random bytes → 43 base64url chars (AgentConfig demands ≥ 32). */
export const SERVICE_TOKEN_BYTES = 32;

export const RELEASES_RETAINED_DEFAULT = 3;
export const RELEASES_RETAINED_MIN = 2;
export const RELEASES_RETAINED_MAX = 20;

export type WebServer = 'apache' | 'nginx';
export type MediaMode = 'shared' | 'copy' | 'none';
export type ProvisionApi = 'v1' | 'v2';

/**
 * THE configtest binary per server — the one definition. The agent runs
 * `sudo -n <this> -t` (src/exec.ts re-exports it), the plan requires it root-owned with a
 * root-owned, non-writable ancestry, and the sudoers rule (Task 9) grants exactly it. It is
 * DERIVED, never declared: a declared path could only disagree with the argv sudo sees.
 */
export const WEB_CONFIGTEST_BINARY = Object.freeze({
  apache: '/usr/sbin/apachectl',
  nginx: '/usr/sbin/nginx',
} as const);

export const DEFAULT_PATHS = Object.freeze({
  configBase: '/etc/dedalo_publication_host',
  unitDir: '/etc/systemd/system',
  sudoersDir: '/etc/sudoers.d',
  polkitRulesDir: '/etc/polkit-1/rules.d',
  runtimeBase: '/run/dedalo_publication_host',
});

export const AGENT_UNIT_PREFIX = 'dedalo-publication-host-';
/**
 * The v2 scratch boot's TEMPLATE unit is `<v2.unit>-scratch@.service`; an
 * instance is `<v2.unit>-scratch@<port>.service` (render/unit_v2.ts, the polkit start/stop grant).
 */
export const V2_SCRATCH_TEMPLATE_SUFFIX = '-scratch@';

/* ── the declaration (validated structurally by schema.ts, semantically by derive) ── */

export type DeclaredListen =
  | { readonly kind: 'unix' }
  | { readonly kind: 'tls'; readonly host: string; readonly port: number };

export interface HostDeclaration {
  readonly instance: string;
  readonly listen: DeclaredListen;
  readonly agent_user: string;
  /** Required for a unix listener (socket group, spec §1.1); refused for tls. */
  readonly engine_group?: string;
  /** The checkout of publication/host_agent on this host (the unit's WorkingDirectory). */
  readonly agent_dir: string;
  readonly web: {
    readonly server: WebServer;
    readonly unit: string;
    readonly group: string;
  };
  readonly state_root: string;
  readonly media: { readonly mode: MediaMode; readonly root?: string };
  readonly php_bin: string;
  readonly bun_bin: string;
  readonly v2: {
    readonly unit: string;
    readonly user: string;
    readonly group: string;
    readonly port: number;
    readonly health_url: string;
  };
  readonly releases_retained?: number;
  /** Host-directory overrides. Production omits it; the scratch-root tests use it. */
  readonly paths?: {
    readonly config_base?: string;
    readonly unit_dir?: string;
    readonly sudoers_dir?: string;
    readonly polkit_rules_dir?: string;
  };
}

/* ── the modes matrix: a renderer or the plan names a ROW, never an owner or a number ── */

export type ModeOwner = 'root' | 'agent';
export type ModeGroup = 'root' | 'webGroup' | 'v2Group' | 'engineGroup';

export interface ArtifactMode {
  readonly owner: ModeOwner;
  readonly group: ModeGroup;
  readonly mode: number;
}

function row(owner: ModeOwner, group: ModeGroup, mode: number): ArtifactMode {
  return Object.freeze({ owner, group, mode });
}

/**
 * The state-tree rows take their OWNER from STATE_TREE_OWNERSHIP (instance/roots.ts): the
 * agent's preflight and this matrix cannot disagree about who owns what. No row inside the
 * state tree is group- or world-writable (the preflight refuses that).
 */
export const MODES = Object.freeze({
  configBase: row('root', 'root', 0o755),
  instanceDir: row('root', 'root', 0o755),
  credentialsDir: row('root', 'root', 0o700),
  credential: row('root', 'root', 0o600),
  envFile: row('root', 'root', 0o644),
  tlsDir: row('root', 'root', 0o755),
  tlsPublic: row('root', 'root', 0o644),
  tlsCaKey: row('root', 'root', 0o600),
  tlsServerKey: row('agent', 'root', 0o400),
  engineBundleDir: row('root', 'root', 0o700),
  engineBundleFile: row('root', 'root', 0o600),
  engineFragment: row('root', 'root', 0o644),
  unitFile: row('root', 'root', 0o644),
  sudoers: row('root', 'root', 0o440),
  polkit: row('root', 'root', 0o644),
  stateRoot: row(STATE_TREE_OWNERSHIP.stateRoot, 'root', 0o755),
  marker: row('root', 'root', 0o644),
  publicationApi: row(STATE_TREE_OWNERSHIP.publicationApi, 'root', 0o755),
  apiRoot: row('agent', 'root', 0o755),
  releases: row('agent', 'root', 0o755),
  staging: row('agent', 'root', 0o700),
  v1Shared: row('root', 'webGroup', 0o750),
  v2Shared: row('root', 'v2Group', 0o750),
  rules: row(STATE_TREE_OWNERSHIP.rules, 'root', 0o755),
  audit: row(STATE_TREE_OWNERSHIP.audit, 'root', 0o755),
  // Task 3's audit contract: agent-owned 0600, then append-only (chattr +a — plan.ts/apply.ts).
  auditFile: row(STATE_TREE_OWNERSHIP.auditFile, 'root', 0o600),
  mediaCopy: row('agent', 'root', 0o755),
});

export type ModeKey = keyof typeof MODES;

export interface DirSpec {
  readonly path: string;
  readonly modeKey: ModeKey;
}

/* ── the derived layout ───────────────────────────────────────────────────────────── */

export interface ApiDirs {
  readonly root: string;
  readonly releases: string;
  readonly shared: string;
  readonly staging: string;
  /** The `current` symlink. Created by the agent (store.ts promote), never by the provisioner. */
  readonly current: string;
  /**
   * The `scratch` symlink the v2 scratch template unit runs from. Repointed by the agent before
   * each scratch boot (a release under test), never created by the provisioner.
   */
  readonly scratch: string;
}

export interface UnixListenLayout {
  readonly kind: 'unix';
  /** For the unit's RuntimeDirectory= (relative to /run). */
  readonly runtimeDirectory: string;
  readonly runtimeDir: string;
  readonly socketPath: string;
}

export interface TlsListenLayout {
  readonly kind: 'tls';
  readonly host: string;
  readonly port: number;
}

export interface TlsPaths {
  readonly dir: string;
  readonly caCert: string;
  readonly caKey: string;
  readonly serverCert: string;
  readonly serverKey: string;
  /** The agent pins its OWN CA as the only client CA (D2). */
  readonly clientCa: string;
}

export interface AgentLayout {
  readonly instance: string;
  readonly declarationPath: string;
  readonly listen: UnixListenLayout | TlsListenLayout;
  readonly identity: {
    readonly agentUser: string;
    readonly engineGroup: string | null;
    readonly webGroup: string;
    readonly v2User: string;
    readonly v2Group: string;
    /**
     * The agent unit's SupplementaryGroups= (Task 9 renders exactly this): the agent reads
     * v1/shared (root:webGroup 0750) and v2/shared (root:v2Group 0750) — Task 7 checks and
     * links the v1 config there, Task 3's scratch boot reads v2.env.
     */
    readonly agentSupplementaryGroups: readonly string[];
  };
  readonly web: { readonly server: WebServer; readonly unit: string; readonly configtestBin: string };
  readonly agentDir: string;
  readonly agentEntry: string;
  readonly bunBin: string;
  readonly phpBin: string;
  readonly media: { readonly mode: MediaMode; readonly root: string | null };
  readonly v2: { readonly unit: string; readonly port: number; readonly healthUrl: string };
  readonly releasesRetained: number;
  readonly configBase: string;
  readonly instanceDir: string;
  readonly credentialsDir: string;
  readonly serviceTokenPath: string;
  readonly envFile: string;
  readonly tls: TlsPaths | null;
  readonly engineBundleDir: string;
  /** The engine's client cert + key + CA, one root 0600 file the operator carries (tls.ts). */
  readonly engineBundlePath: string;
  /** What the engine will need to pair (render/engine_fragment.ts); secret-free. */
  readonly engineFragmentPath: string;
  readonly agentUnitName: string;
  readonly agentUnitPath: string;
  readonly v2UnitPath: string;
  /** The v2 scratch boot's template unit, `<v2.unit>-scratch@.service` (render/unit_v2.ts). */
  readonly v2ScratchUnitPath: string;
  readonly sudoersPath: string;
  readonly polkitPath: string;
  readonly state: {
    readonly root: string;
    readonly marker: string;
    readonly publicationApi: string;
    readonly apis: Readonly<Record<ProvisionApi, ApiDirs>>;
    readonly rules: string;
    readonly audit: string;
    /** The agent's append-only trail: created empty, agent-owned, never rewritten. */
    readonly auditFile: string;
  };
  /** Every directory the plan ensures, sorted so a parent precedes its children. */
  readonly directories: readonly DirSpec[];
  /** The agent's env file (Task 1's env-file keys only), rendered by render/env.ts. */
  readonly envVars: Readonly<Record<string, string>>;
}

/* ── errors + helpers ─────────────────────────────────────────────────────────────── */

export class LayoutError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`layout: ${field}: ${message}`);
    this.name = 'LayoutError';
    this.field = field;
  }
}

function matches(pattern: RegExp, field: string, value: unknown): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new LayoutError(field, `'${String(value)}' must match ${pattern.source}`);
  }
  return value;
}

/** Absolute, no `.`/`..` segment, no `//`, no trailing slash (except `/` itself). */
export function cleanAbsolute(field: string, value: unknown): string {
  const path = matches(ABSOLUTE_PATH_PATTERN, field, value);
  const segments = path.split('/');
  if (segments.includes('..') || segments.includes('.')) {
    throw new LayoutError(field, `'${path}' must not contain '.' or '..' segments`);
  }
  const tidy = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (normalize(tidy) !== tidy) {
    throw new LayoutError(field, `'${path}' is not in normal form (repeated '/')`);
  }
  return tidy;
}

export function pathsOverlap(a: string, b: string): boolean {
  if (a === '/' || b === '/') return true;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function unitName(field: string, value: unknown): string {
  const unit = matches(UNIT_NAME_PATTERN, field, value);
  if (unit.endsWith('.service')) {
    throw new LayoutError(field, `'${unit}': name the unit without the '.service' suffix`);
  }
  return unit;
}

function tcpPort(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new LayoutError(field, `'${String(value)}' must be an integer port 1-65535`);
  }
  return value;
}

function healthUrl(value: unknown, port: number): string {
  if (typeof value !== 'string') throw new LayoutError('v2.health_url', 'must be a string');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LayoutError('v2.health_url', `'${value}' is not a URL`);
  }
  if (url.protocol !== 'http:') {
    throw new LayoutError('v2.health_url', 'must be http: — v2 listens on loopback behind the web server');
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new LayoutError('v2.health_url', `host '${url.hostname}' is not loopback`);
  }
  const urlPort = url.port === '' ? 80 : Number(url.port);
  if (urlPort !== port) {
    throw new LayoutError('v2.health_url', `port ${urlPort} disagrees with v2.port ${port}`);
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new LayoutError('v2.health_url', 'must carry no userinfo, query or fragment');
  }
  return url.href;
}

function apiDirs(publicationApi: string, api: ProvisionApi): ApiDirs {
  const root = join(publicationApi, api);
  return Object.freeze({
    root,
    releases: join(root, 'releases'),
    shared: join(root, 'shared'),
    staging: join(root, 'staging'),
    current: join(root, 'current'),
    scratch: join(root, 'scratch'),
  });
}

export function ownerName(layout: AgentLayout, owner: ModeOwner): string {
  return owner === 'root' ? 'root' : layout.identity.agentUser;
}

export function groupName(layout: AgentLayout, group: ModeGroup): string {
  switch (group) {
    case 'root':
      return 'root';
    case 'webGroup':
      return layout.identity.webGroup;
    case 'v2Group':
      return layout.identity.v2Group;
    case 'engineGroup':
      if (layout.identity.engineGroup === null) {
        throw new LayoutError('engine_group', 'a tls instance has no engine group; no artifact may name that row');
      }
      return layout.identity.engineGroup;
    default: {
      const unreachable: never = group;
      throw new Error(`layout: unknown mode group '${String(unreachable)}'`);
    }
  }
}

/* ── derive ───────────────────────────────────────────────────────────────────────── */

export function derive(decl: HostDeclaration): AgentLayout {
  const instance = matches(INSTANCE_PATTERN, 'instance', decl.instance);
  const agentUser = matches(UNIX_NAME_PATTERN, 'agent_user', decl.agent_user);
  const webGroup = matches(UNIX_NAME_PATTERN, 'web.group', decl.web.group);
  const v2User = matches(UNIX_NAME_PATTERN, 'v2.user', decl.v2.user);
  const v2Group = matches(UNIX_NAME_PATTERN, 'v2.group', decl.v2.group);

  const server = decl.web.server;
  if (server !== 'apache' && server !== 'nginx') {
    throw new LayoutError('web.server', `'${String(server)}' must be apache or nginx`);
  }
  const webUnit = unitName('web.unit', decl.web.unit);
  const configtestBin: string = WEB_CONFIGTEST_BINARY[server];

  const agentDir = cleanAbsolute('agent_dir', decl.agent_dir);
  const phpBin = cleanAbsolute('php_bin', decl.php_bin);
  const bunBin = cleanAbsolute('bun_bin', decl.bun_bin);
  const stateRoot = cleanAbsolute('state_root', decl.state_root);
  if (stateRoot === '/') throw new LayoutError('state_root', 'must not be /');

  const paths = decl.paths ?? {};
  const configBase = cleanAbsolute('paths.config_base', paths.config_base ?? DEFAULT_PATHS.configBase);
  const unitDir = cleanAbsolute('paths.unit_dir', paths.unit_dir ?? DEFAULT_PATHS.unitDir);
  const sudoersDir = cleanAbsolute('paths.sudoers_dir', paths.sudoers_dir ?? DEFAULT_PATHS.sudoersDir);
  const polkitRulesDir = cleanAbsolute(
    'paths.polkit_rules_dir',
    paths.polkit_rules_dir ?? DEFAULT_PATHS.polkitRulesDir,
  );

  let listen: UnixListenLayout | TlsListenLayout;
  let engineGroup: string | null;
  if (decl.listen.kind === 'unix') {
    if (decl.engine_group === undefined) {
      throw new LayoutError('engine_group', 'required for a unix listener — the socket is 0660 with this group');
    }
    engineGroup = matches(UNIX_NAME_PATTERN, 'engine_group', decl.engine_group);
    const runtimeDir = join(DEFAULT_PATHS.runtimeBase, instance);
    listen = Object.freeze({
      kind: 'unix',
      runtimeDirectory: `dedalo_publication_host/${instance}`,
      runtimeDir,
      socketPath: join(runtimeDir, 'agent.sock'),
    });
  } else if (decl.listen.kind === 'tls') {
    if (decl.engine_group !== undefined) {
      throw new LayoutError(
        'engine_group',
        'only a unix listener has an engine group; over mTLS the engine is its client certificate',
      );
    }
    engineGroup = null;
    listen = Object.freeze({
      kind: 'tls',
      host: matches(LISTEN_HOST_PATTERN, 'listen.host', decl.listen.host),
      port: tcpPort('listen.port', decl.listen.port),
    });
  } else {
    throw new LayoutError('listen.kind', `'${String((decl.listen as { kind?: unknown }).kind)}' must be unix or tls`);
  }

  const mediaMode = decl.media.mode;
  if (mediaMode !== 'shared' && mediaMode !== 'copy' && mediaMode !== 'none') {
    throw new LayoutError('media.mode', `'${String(mediaMode)}' must be shared, copy or none`);
  }
  let mediaRoot: string | null = null;
  if (mediaMode === 'none') {
    if (decl.media.root !== undefined) throw new LayoutError('media.root', "must be absent when media.mode is 'none'");
  } else {
    if (decl.media.root === undefined) throw new LayoutError('media.root', `required when media.mode is '${mediaMode}'`);
    mediaRoot = cleanAbsolute('media.root', decl.media.root);
  }

  const v2Unit = unitName('v2.unit', decl.v2.unit);
  if (v2Unit === webUnit) throw new LayoutError('v2.unit', 'must differ from web.unit');
  if (v2Unit.includes('@')) {
    throw new LayoutError('v2.unit', `'${v2Unit}': no '@' — the scratch boot's template unit is '<v2.unit>-scratch@.service'`);
  }
  const v2Port = tcpPort('v2.port', decl.v2.port);
  const v2HealthUrl = healthUrl(decl.v2.health_url, v2Port);

  const releasesRetained = decl.releases_retained ?? RELEASES_RETAINED_DEFAULT;
  if (
    !Number.isInteger(releasesRetained) ||
    releasesRetained < RELEASES_RETAINED_MIN ||
    releasesRetained > RELEASES_RETAINED_MAX
  ) {
    throw new LayoutError(
      'releases_retained',
      `'${String(releasesRetained)}' must be an integer ${RELEASES_RETAINED_MIN}-${RELEASES_RETAINED_MAX}`,
    );
  }

  // One root, one owner: no declared tree may contain another.
  const claims: [string, string][] = [
    ['state_root', stateRoot],
    ['paths.config_base', configBase],
    ['agent_dir', agentDir],
    ['paths.unit_dir', unitDir],
    ['paths.sudoers_dir', sudoersDir],
    ['paths.polkit_rules_dir', polkitRulesDir],
  ];
  if (mediaRoot !== null) claims.push(['media.root', mediaRoot]);
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const [fieldA, pathA] = claims[i] as [string, string];
      const [fieldB, pathB] = claims[j] as [string, string];
      if (pathsOverlap(pathA, pathB)) {
        throw new LayoutError(fieldB, `'${pathB}' overlaps ${fieldA} '${pathA}'`);
      }
    }
  }

  const instanceDir = join(configBase, instance);
  const credentialsDir = join(instanceDir, 'credentials');
  const engineBundleDir = join(instanceDir, 'engine_bundle');
  const tlsDir = join(instanceDir, 'tls');
  const tls: TlsPaths | null =
    listen.kind === 'tls'
      ? Object.freeze({
          dir: tlsDir,
          caCert: join(tlsDir, 'ca.pem'),
          caKey: join(tlsDir, 'ca.key'),
          serverCert: join(tlsDir, 'server.pem'),
          serverKey: join(tlsDir, 'server.key'),
          clientCa: join(tlsDir, 'ca.pem'),
        })
      : null;

  const publicationApi = join(stateRoot, PUBLICATION_API_DIR);
  const apis = Object.freeze({ v1: apiDirs(publicationApi, 'v1'), v2: apiDirs(publicationApi, 'v2') });
  const rules = join(stateRoot, RULES_DIR);
  const audit = join(stateRoot, AUDIT_DIR);

  const directories: DirSpec[] = [
    { path: configBase, modeKey: 'configBase' },
    { path: instanceDir, modeKey: 'instanceDir' },
    { path: credentialsDir, modeKey: 'credentialsDir' },
    { path: engineBundleDir, modeKey: 'engineBundleDir' },
    { path: stateRoot, modeKey: 'stateRoot' },
    { path: publicationApi, modeKey: 'publicationApi' },
    { path: rules, modeKey: 'rules' },
    { path: audit, modeKey: 'audit' },
  ];
  if (tls !== null) directories.push({ path: tls.dir, modeKey: 'tlsDir' });
  for (const api of ['v1', 'v2'] as const) {
    const dirs = apis[api];
    directories.push(
      { path: dirs.root, modeKey: 'apiRoot' },
      { path: dirs.releases, modeKey: 'releases' },
      { path: dirs.staging, modeKey: 'staging' },
      { path: dirs.shared, modeKey: api === 'v1' ? 'v1Shared' : 'v2Shared' },
    );
  }
  if (mediaMode === 'copy' && mediaRoot !== null) directories.push({ path: mediaRoot, modeKey: 'mediaCopy' });
  directories.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Task 1's env-file keys (src/config.ts KNOWN_KEYS): the instance key is
  // INSTANCE (= config.INSTANCE); any other spelling is refused as unknown (Task 1 KNOWN_KEYS).
  const envVars: Record<string, string> = {
    INSTANCE: instance,
    NODE_ENV: 'production',
    LISTEN_KIND: listen.kind,
    STATE_ROOT: stateRoot,
    WEB_SERVER: server,
    WEB_UNIT: webUnit,
    MEDIA_MODE: mediaMode,
    PHP_BIN: phpBin,
    BUN_BIN: bunBin,
    V2_UNIT: v2Unit,
    V2_HEALTH_URL: v2HealthUrl,
    RELEASES_RETAINED: String(releasesRetained),
  };
  if (listen.kind === 'unix') {
    envVars.SOCKET_PATH = listen.socketPath;
  } else if (tls !== null) {
    envVars.TLS_HOST = listen.host;
    envVars.TLS_PORT = String(listen.port);
    envVars.TLS_CERT_FILE = tls.serverCert;
    envVars.TLS_KEY_FILE = tls.serverKey;
    envVars.TLS_CLIENT_CA_FILE = tls.clientCa;
  }
  if (mediaRoot !== null) envVars.MEDIA_ROOT = mediaRoot;
  for (const key of Object.keys(envVars)) {
    if (!ENV_KEY_PATTERN.test(key) || SECRET_LOOKING_KEY.test(key)) {
      throw new Error(`layout: env key '${key}' is not a non-credential AgentConfig key`);
    }
  }

  const agentUnitName = `${AGENT_UNIT_PREFIX}${instance}`;
  return Object.freeze({
    instance,
    declarationPath: join(configBase, `${instance}.json`),
    listen,
    identity: Object.freeze({
      agentUser,
      engineGroup,
      webGroup,
      v2User,
      v2Group,
      agentSupplementaryGroups: Object.freeze([...new Set([webGroup, v2Group])]),
    }),
    web: Object.freeze({ server, unit: webUnit, configtestBin }),
    agentDir,
    agentEntry: join(agentDir, 'src', 'index.ts'),
    bunBin,
    phpBin,
    media: Object.freeze({ mode: mediaMode, root: mediaRoot }),
    v2: Object.freeze({ unit: v2Unit, port: v2Port, healthUrl: v2HealthUrl }),
    releasesRetained,
    configBase,
    instanceDir,
    credentialsDir,
    serviceTokenPath: join(credentialsDir, SERVICE_TOKEN_CREDENTIAL),
    envFile: join(instanceDir, 'agent.env'),
    tls,
    engineBundleDir,
    engineBundlePath: join(engineBundleDir, 'engine_bundle.pem'),
    engineFragmentPath: join(instanceDir, 'engine.env.fragment'),
    agentUnitName,
    agentUnitPath: join(unitDir, `${agentUnitName}.service`),
    v2UnitPath: join(unitDir, `${v2Unit}.service`),
    v2ScratchUnitPath: join(unitDir, `${v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}.service`),
    sudoersPath: join(sudoersDir, `dedalo_publication_host_${instance}`),
    polkitPath: join(polkitRulesDir, `60-dedalo-publication-host-${instance}.rules`),
    state: Object.freeze({
      root: stateRoot,
      marker: join(stateRoot, INSTANCE_MARKER),
      publicationApi,
      apis,
      rules,
      audit,
      auditFile: join(audit, AUDIT_FILE_NAME),
    }),
    directories: Object.freeze(directories.map(d => Object.freeze(d))),
    envVars: Object.freeze(envVars),
  });
}
