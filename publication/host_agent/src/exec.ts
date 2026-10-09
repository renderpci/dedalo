/**
 * THE ONLY SPAWNER. Every child process the agent starts is one of the six named
 * commands below; no exported function takes a free argv. tests/exec.test.ts fails when
 * any other file under src/ spawns. Three more closed sets follow, none reached by a route:
 * rendererExec() (the root host-map oneshot, spec §13.5), and the root-run provisioner's
 * provisionExec() and initExec() (src/provision/; contracts in src/provision/exec_contract.ts):
 * same law, their own fixed root PATH.
 *
 * - ABSOLUTE BINARIES, NEVER A PATH LOOKUP: sudo, systemctl and the configtest binary are
 *   the constants below; PHP_BIN is absolute by config law. The sudoers rule
 *   (src/provision/render/) names exactly `SUDO -n <WEB_CONFIGTEST_BIN> -t` — the one spelling; the
 *   binary is the provisioner's pick from the closed WEB_CONFIGTEST_CANDIDATES[server], rechecked here.
 *   A drill that wants stand-ins puts them AT these paths (the live drill: inside the CI-image
 *   container or a private mount namespace), never earlier on PATH: PATH is not consulted.
 * - A FIXED child environment: nothing of the agent's own environment (its token
 *   included) reaches a child.
 * - PUSHED RELEASE CODE NEVER RUNS AS THE AGENT. The v2 scratch boot repoints
 *   `publication_api/v2/scratch` at the release under test and `systemctl start`s the
 *   rendered template instance `<V2_UNIT>-scratch@<port>.service` (polkit: start/stop only,
 *   render/unit_v2.ts): the release runs as the v2 user in v2's sandbox, with v2.env read
 *   by systemd. Never a child of this process — the agent uid owns rules/ (root parses it
 *   at configtest), holds the sudo configtest grant, the TLS key and the bearer; a release
 *   running as it could reach root (spec §2.5). The agent config carries no Bun path at all
 *   (tests/exec.test.ts pins it).
 * - Every path argument is confined by realpath to the agent's own state root; the v2
 *   scratch boot accepts ONLY a directory directly under publication_api/v2/releases/ —
 *   the committed, not-yet-recorded, not-yet-promoted release src/releases/install.ts health-checks before
 *   the swap. Never staging/: it is agent-only (layout.ts MODES), so the v2 user the scratch
 *   unit runs as could not read it.
 * - Short commands are killed after COMMAND_TIMEOUT_MS; their output is capped.
 * - IMPORTING THIS MODULE DOES NOT RESOLVE THE AGENT'S CONFIGURATION: `createExec` takes
 *   it as an argument, and only `realExec()`/`setExecForTests()` load src/config.ts, lazily.
 *   A root-run tool on a host with no agent env file can import the names below.
 */

import { existsSync, lstatSync, realpathSync, renameSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import type { AgentConfig } from './config';
import { ConflictError, HostActionFailedError, ValidationError } from './errors';
import { PUBLICATION_API_DIR } from './instance/roots';
import type {
  ExecResult,
  InitExec,
  PairInvocation,
  ProvisionExec,
  RestoreconTarget,
  SemanageKind,
} from './provision/exec_contract';
import {
  APACHE_MODULES,
  BUN_ASSETS,
  CANDIDATE_UNIT_PATTERNS,
  NOLOGIN_SHELLS,
  PAIR_NAME_PATTERN,
  PAIR_TIMEOUT_MS,
  RETIRED_SUFFIX,
  SELINUX_BOOLEANS,
  SELINUX_READ_ONLY_BOOLEANS,
  UNIT_SHOW_PROPERTIES,
} from './provision/exec_contract';
import {
  ABSOLUTE_PATH_PATTERN,
  APACHE_DUMP_CANDIDATES,
  FPM_BIN_PATTERN,
  HOST_MAP_UNIT,
  PHP_CLI_PATTERN,
  UNIT_NAME_PATTERN,
  UNIX_NAME_PATTERN,
  V2_SCRATCH_TEMPLATE_SUFFIX,
  WEB_CONFIGTEST_CANDIDATES,
  isConfigtestBinary,
} from './provision/layout';

/** The contracts are src/provision/exec_contract.ts's (zero-dependency); re-exported for the existing importers. */
export type { ExecResult, InitExec, PairInvocation, ProvisionExec, RestoreconTarget, SemanageKind };

/** A started scratch unit. stop() is idempotent; a failed stop throws (a release must not keep serving unseen). */
export interface ScratchProcess {
  readonly unit: string;
  stop(): Promise<void>;
}

export interface Exec {
  webConfigtest(): Promise<ExecResult>;
  webReload(): Promise<ExecResult>;
  v2Restart(): Promise<ExecResult>;
  phpLint(file: string): Promise<ExecResult>;
  v2ScratchBoot(releaseDir: string, port: number): Promise<ScratchProcess>;
  /**
   * `systemctl start dedalo-pubhost-map.service` — no argument (spec §13.5): the root oneshot
   * renders the host-wide nginx map from every contribution; polkit grants exactly this pair.
   */
  startHostMap(): Promise<ExecResult>;
}

export const SUDO = '/usr/bin/sudo';
export const SYSTEMCTL = '/usr/bin/systemctl';
/** THE one definition lives in src/provision/layout.ts (the provisioner's trust check and sudoers rule name it). */
export { V2_SCRATCH_TEMPLATE_SUFFIX, WEB_CONFIGTEST_CANDIDATES, isConfigtestBinary };

export const CHILD_PATH = '/usr/local/bin:/usr/bin:/bin';
export const COMMAND_TIMEOUT_MS = 60_000;
const OUTPUT_CAP = 64 * 1024;

export interface SpawnOptions {
  readonly cwd?: string;
  readonly env: Record<string, string>;
}

/** HOW a named command is started — the seam a gate replaces to observe argv. */
export interface Spawner {
  run(argv: readonly string[], options: SpawnOptions): Promise<ExecResult>;
}

function cap(text: string): string {
  return text.length > OUTPUT_CAP ? `${text.slice(0, OUTPUT_CAP)}\n[truncated]` : text;
}

const bunSpawner: Spawner = {
  async run(argv, options) {
    let child: ReturnType<typeof Bun.spawn>;
    try {
      child = Bun.spawn([...argv], {
        cwd: options.cwd,
        env: options.env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: COMMAND_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });
    } catch (error) {
      // ENOENT/EACCES on the binary itself: the shell's "command not found" code.
      return { code: 127, stdout: '', stderr: `${argv[0]}: ${(error as NodeJS.ErrnoException).code ?? String(error)}` };
    }
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout as ReadableStream).text(),
      new Response(child.stderr as ReadableStream).text(),
      child.exited,
    ]);
    return { code, stdout: cap(stdout), stderr: cap(stderr) };
  },
};

/** The symlink under publication_api/v2/ the scratch template unit runs from (layout.ts ApiDirs.scratch). */
export const SCRATCH_LINK = 'scratch';

/** `<V2_UNIT>-scratch@<port>.service` — the one instance name the polkit rule grants start/stop of. */
export function v2ScratchUnit(v2Unit: string, port: number): string {
  return `${v2Unit}${V2_SCRATCH_TEMPLATE_SUFFIX}${port}.service`;
}

function realOrRefuse(path: string, what: string): string {
  try {
    return realpathSync(path);
  } catch {
    throw new ValidationError(`${what} '${path}' does not exist.`);
  }
}

/** The five named commands, bound to one configuration and one spawner. */
export function createExec(cfg: AgentConfig, spawner: Spawner = bunSpawner): Exec {
  const env = (): Record<string, string> => ({ PATH: CHILD_PATH, LANG: 'C' });
  return {
    webConfigtest: () => {
      // config.ts already refuses a binary outside the list; rechecked at the one spawn site.
      if (!isConfigtestBinary(cfg.WEB_SERVER, cfg.WEB_CONFIGTEST_BIN)) {
        throw new Error(`exec: '${cfg.WEB_CONFIGTEST_BIN}' is not a ${cfg.WEB_SERVER} configtest binary`);
      }
      return spawner.run([SUDO, '-n', cfg.WEB_CONFIGTEST_BIN, '-t'], { env: env() });
    },
    webReload: () => spawner.run([SYSTEMCTL, 'reload', cfg.WEB_UNIT], { env: env() }),
    startHostMap: () => spawner.run([SYSTEMCTL, 'start', `${HOST_MAP_UNIT}.service`], { env: env() }),
    v2Restart: () => spawner.run([SYSTEMCTL, 'restart', cfg.V2_UNIT], { env: env() }),
    phpLint: async file => {
      const stateRoot = realOrRefuse(cfg.STATE_ROOT, 'STATE_ROOT');
      const real = realOrRefuse(file, 'phpLint file');
      if (!real.startsWith(stateRoot + sep)) {
        throw new ValidationError(`phpLint refuses '${file}': it is not under STATE_ROOT.`);
      }
      // A v2-only host has no PHP: install.ts refuses a v1 release before any lint (api_not_served).
      if (cfg.PHP_BIN === undefined) throw new Error('exec: phpLint on a host without PHP_BIN (it serves v2 only)');
      return spawner.run([cfg.PHP_BIN, '-l', real], { env: env() });
    },
    v2ScratchBoot: async (releaseDir, port) => {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new ValidationError(`v2ScratchBoot refuses port ${port}: expected an integer in 1024-65535.`);
      }
      const v2Root = join(cfg.STATE_ROOT, PUBLICATION_API_DIR, 'v2');
      const releases = realOrRefuse(join(v2Root, 'releases'), 'v2 releases directory');
      const real = realOrRefuse(releaseDir, 'v2 release directory');
      if (dirname(real) !== releases || !statSync(real).isDirectory()) {
        throw new ValidationError(
          `v2ScratchBoot refuses '${releaseDir}': it is not a directory directly under ${releases}. ` +
            `Only a committed release (releases/<id>) is booted on a scratch port.`,
        );
      }
      const envFile = join(v2Root, 'shared', 'v2.env');
      if (!existsSync(envFile)) {
        throw new ConflictError(`The v2 environment file '${envFile}' does not exist; the provisioner renders it.`, 'v2_env_missing');
      }
      // The template unit runs WorkingDirectory=<v2>/scratch: repoint it atomically.
      const link = join(v2Root, SCRATCH_LINK);
      const next = `${link}.next`;
      rmSync(next, { force: true });
      symlinkSync(real, next);
      renameSync(next, link);
      const unit = v2ScratchUnit(cfg.V2_UNIT, port);
      const started = await spawner.run([SYSTEMCTL, 'start', unit], { env: env() });
      if (started.code !== 0) {
        await spawner.run([SYSTEMCTL, 'stop', unit], { env: env() });
        throw new HostActionFailedError(
          `systemctl start ${unit} exited ${started.code}: ${started.stderr.split('\n')[0] ?? ''}`,
          'scratch_start_failed',
        );
      }
      let stopped = false;
      return {
        unit,
        async stop() {
          if (stopped) return;
          const result = await spawner.run([SYSTEMCTL, 'stop', unit], { env: env() });
          if (result.code !== 0) {
            throw new HostActionFailedError(
              `systemctl stop ${unit} exited ${result.code}: ${result.stderr.split('\n')[0] ?? ''}`,
              'scratch_stop_failed',
            );
          }
          stopped = true;
        },
      };
    },
  };
}

/** The agent's resolved configuration, loaded on first use (see the header). */
function agentConfig(): AgentConfig {
  return (require('./config') as typeof import('./config')).config;
}

export function realExec(): Exec {
  return createExec(agentConfig());
}

let current: Exec | null = null;

/** Whether a test override may be installed under this NODE_ENV. Only 'test'. */
export function execOverrideAllowed(nodeEnv: string): boolean {
  return nodeEnv === 'test';
}

/** Install a stand-in for the suite; returns the restore. Refuses outside NODE_ENV=test. */
export function setExecForTests(standIn: Exec): () => void {
  const nodeEnv = agentConfig().NODE_ENV;
  if (!execOverrideAllowed(nodeEnv)) {
    throw new Error(`setExecForTests refused: NODE_ENV is '${nodeEnv}', not 'test'.`);
  }
  const previous = current;
  current = standIn;
  return () => {
    current = previous;
  };
}

/** The Exec every route uses: the test stand-in when one is installed, else the real one. */
export function exec(): Exec {
  if (current === null) current = realExec();
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// THE ROOT MAP RENDERER'S CLOSED SET (src/rules/host_map_main.ts, spec §13.5). The oneshot
// `dedalo-pubhost-map.service` runs as root with no argument and no environment: its only
// spawns are nginx's own configtest, its reload, the active poll after it and — only when that
// poll finds nginx down after a reload that returned 0 — the restart after the roll back
// (src/rules/txn.ts). No sudo (it is root).
// ─────────────────────────────────────────────────────────────────────────────────────

/** nginx's configtest binary (WEB_CONFIGTEST_CANDIDATES.nginx, the one entry) and its unit on Debian and EL alike. */
export const RENDERER_NGINX_BIN = WEB_CONFIGTEST_CANDIDATES.nginx[0] as string;
export const RENDERER_NGINX_UNIT = 'nginx.service';

export interface RendererExec {
  webConfigtest(): Promise<ExecResult>; // [RENDERER_NGINX_BIN,'-t']
  webReload(): Promise<ExecResult>; //     [SYSTEMCTL,'reload','nginx.service']
  webActive(): Promise<boolean>; //        [SYSTEMCTL,'is-active','--quiet','nginx.service']
  webRestart(): Promise<ExecResult>; //    [SYSTEMCTL,'restart','nginx.service']
  /** The active poll's wait (no spawn). */
  sleep(ms: number): Promise<void>;
}

export function rendererExec(spawner: Spawner = bunSpawner): RendererExec {
  const env = (): Record<string, string> => ({ PATH: CHILD_PATH, LC_ALL: 'C' });
  return Object.freeze({
    webConfigtest: () => spawner.run([RENDERER_NGINX_BIN, '-t'], { env: env() }),
    webReload: () => spawner.run([SYSTEMCTL, 'reload', RENDERER_NGINX_UNIT], { env: env() }),
    webActive: async () => (await spawner.run([SYSTEMCTL, 'is-active', '--quiet', RENDERER_NGINX_UNIT], { env: env() })).code === 0,
    webRestart: () => spawner.run([SYSTEMCTL, 'restart', RENDERER_NGINX_UNIT], { env: env() }),
    sleep: (ms: number) => Bun.sleep(ms),
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────
// THE PROVISIONER'S CLOSED COMMAND SETS (src/provision/). Used only by the root-run CLI; no
// route reaches them. Same law as the agent's set above: named commands, every argument
// validated before anything spawns (a failure throws `exec: …` and spawns nothing), no free
// argv. They never read the agent's config (tests/provision_exec.test.ts imports this module
// with an empty env). The contracts are src/provision/exec_contract.ts's:
//   - provisionExec(): `provision check|apply` (24 commands);
//   - initExec():      `provision init` only (22 commands) — the account creators, a2enmod,
//                      setsebool and the pairing child exist ONLY there.
// ─────────────────────────────────────────────────────────────────────────────────────

/** A fixed PATH: the provisioner runs as root and never inherits one. */
export const PROVISION_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

export interface SyncSpawnOptions {
  readonly cwd?: string;
  readonly env: Readonly<Record<string, string>>;
  /** Bytes for the child's stdin (only pairAsEngine passes any); otherwise stdin is 'ignore'. */
  readonly input?: Uint8Array;
  /**
   * Killed (SIGKILL) after this many ms; the result is then code 124. Both closed sets always
   * pass one (tests/provision_exec.test.ts holds every provisionExec command to it): a command
   * that hangs while init holds the host web lock would otherwise block every agent's map render.
   */
  readonly timeoutMs?: number;
}

/** HOW a provisioner command is started — the seam a gate replaces to observe argv (and stdin). */
export interface SyncSpawner {
  run(argv: readonly string[], options: SyncSpawnOptions): ExecResult;
}

export const provisionSpawner: SyncSpawner = Object.freeze({
  run(argv: readonly string[], options: SyncSpawnOptions): ExecResult {
    try {
      const proc = Bun.spawnSync({
        cmd: [...argv],
        cwd: options.cwd,
        env: { ...options.env },
        stdin: options.input ?? 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs, killSignal: 'SIGKILL' as const }),
      });
      if (proc.exitedDueToTimeout) {
        return { code: 124, stdout: cap(proc.stdout.toString()), stderr: `${argv[0]}: timed out after ${options.timeoutMs} ms` };
      }
      return { code: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
    } catch (error) {
      return { code: 127, stdout: '', stderr: error instanceof Error ? error.message : String(error) };
    }
  },
});

/** What a validator may learn about a path before the spawn — the second seam (lstat, never followed). */
export interface ExecProbe {
  lstat(path: string): { readonly type: 'file' | 'dir' | 'symlink' | 'other'; readonly uid: number; readonly mode: number } | null;
  realpath(path: string): string | null;
}

export const hostProbe: ExecProbe = Object.freeze({
  lstat(path: string) {
    try {
      const stats = lstatSync(path);
      const type = stats.isSymbolicLink() ? 'symlink' : stats.isFile() ? 'file' : stats.isDirectory() ? 'dir' : 'other';
      return { type, uid: stats.uid, mode: stats.mode & 0o7777 } as const;
    } catch {
      return null;
    }
  },
  realpath(path: string): string | null {
    try {
      return realpathSync(path);
    } catch {
      return null;
    }
  },
});

function provisionUnit(unit: string): string {
  if (!UNIT_NAME_PATTERN.test(unit) || unit.endsWith('.service')) {
    throw new Error(`exec: '${unit}' is not a bare unit name (${UNIT_NAME_PATTERN.source})`);
  }
  return `${unit}.service`;
}

function provisionAbsolute(label: string, path: string): string {
  if (!ABSOLUTE_PATH_PATTERN.test(path) || path.split('/').includes('..')) {
    throw new Error(`exec: ${label} '${path}' is not a clean absolute path`);
  }
  return path;
}

function provisionName(name: string): string {
  if (!UNIX_NAME_PATTERN.test(name)) throw new Error(`exec: '${name}' is not a unix account name`);
  return name;
}

function realFile(probe: ExecProbe, label: string, path: string): string {
  if (probe.lstat(path)?.type !== 'file') throw new Error(`exec: ${label} '${path}' is not a real file (lstat, never followed)`);
  return path;
}

function fpmBinary(probe: ExecProbe, bin: string): string {
  if (!FPM_BIN_PATTERN.test(bin)) throw new Error(`exec: '${bin}' is not a PHP-FPM binary (${FPM_BIN_PATTERN.source})`);
  return realFile(probe, 'PHP-FPM binary', bin);
}

function apacheDumpBinary(bin: string): string {
  if (!APACHE_DUMP_CANDIDATES.includes(bin)) {
    throw new Error(`exec: '${bin}' is not an apache dump binary (${APACHE_DUMP_CANDIDATES.join(', ')})`);
  }
  return bin;
}

function nginxBinary(bin: string): string {
  if (!isConfigtestBinary('nginx', bin)) {
    throw new Error(`exec: '${bin}' is not an nginx binary (${WEB_CONFIGTEST_CANDIDATES.nginx.join(', ')})`);
  }
  return bin;
}

function selinuxBoolean(name: string, writable: boolean): string {
  if (!(SELINUX_BOOLEANS as readonly string[]).includes(name)) {
    throw new Error(`exec: '${name}' is not one of the SELinux booleans init reads (${SELINUX_BOOLEANS.join(', ')})`);
  }
  if (writable && (SELINUX_READ_ONLY_BOOLEANS as readonly string[]).includes(name)) {
    throw new Error(`exec: '${name}' is read, never written`);
  }
  return name;
}

/** The SELinux import temp apply writes (spec §5.9): a root-owned regular 0600 file of this one name. */
export const SELINUX_IMPORT_TEMP_NAME = 'selinux.import.dedalo-provision.tmp';

/** Paths for a label command: `min`–`max` clean absolute paths, never '/' itself. */
function labelPaths(label: string, paths: readonly string[], max: number): string[] {
  if (paths.length < 1 || paths.length > max) throw new Error(`exec: ${label} takes 1-${max} paths, got ${paths.length}`);
  return paths.map(path => {
    provisionAbsolute(label, path);
    if (path === '/') throw new Error(`exec: ${label} never names '/'`);
    return path;
  });
}

function joinResults(results: readonly ExecResult[]): ExecResult {
  const failed = results.find(result => result.code !== 0);
  return {
    code: failed?.code ?? 0,
    stdout: results.map(result => result.stdout).join(''),
    stderr: results.map(result => result.stderr).join(''),
  };
}

/**
 * A systemd job (start, restart, reload, daemon-reload). systemd bounds each unit's start and
 * stop by its own TimeoutStartSec/TimeoutStopSec (90 s by default) and a restart is both, so
 * the client gets more than their sum before it is killed: a wedged dbus/polkit, not a slow
 * unit, is what this bound ends.
 */
export const UNIT_JOB_TIMEOUT_MS = 200_000;
/**
 * The SELinux relabel commands (`semanage import`, `restorecon [-R]`): a recursive relabel walks
 * a whole tree (a media root may hold millions of files) and `semanage import` rebuilds the
 * policy, so their bound is long but finite.
 */
export const RELABEL_TIMEOUT_MS = 30 * 60_000;

export function provisionExec(spawner: SyncSpawner = provisionSpawner, probe: ExecProbe = hostProbe): ProvisionExec {
  const run = (argv: readonly string[], timeoutMs: number = COMMAND_TIMEOUT_MS): ExecResult =>
    spawner.run(argv, { env: { PATH: PROVISION_PATH, LC_ALL: 'C' }, timeoutMs });
  return Object.freeze({
    userId(name: string): number | null {
      const result = run(['id', '-u', provisionName(name)]);
      const out = result.stdout.trim();
      return result.code === 0 && /^\d+$/.test(out) ? Number(out) : null;
    },
    groupId(name: string): number | null {
      const result = run(['getent', 'group', provisionName(name)]);
      const gid = result.stdout.split('\n')[0]?.split(':')[2] ?? '';
      return result.code === 0 && /^\d+$/.test(gid) ? Number(gid) : null;
    },
    userGroups(name: string): { primary: number; all: number[] } | null {
      const account = provisionName(name);
      const primary = run(['id', '-g', account]);
      const all = run(['id', '-G', account]);
      const primaryOut = primary.stdout.trim();
      const allOut = all.stdout.trim().split(/\s+/);
      if (primary.code !== 0 || all.code !== 0 || !/^\d+$/.test(primaryOut) || !allOut.every(gid => /^\d+$/.test(gid))) {
        return null;
      }
      return { primary: Number(primaryOut), all: allOut.map(Number) };
    },
    unitState(unit: string): { enabled: boolean; active: boolean } {
      const name = provisionUnit(unit);
      return {
        enabled: run(['systemctl', 'is-enabled', '--quiet', name]).code === 0,
        active: run(['systemctl', 'is-active', '--quiet', name]).code === 0,
      };
    },
    daemonReload: () => run(['systemctl', 'daemon-reload'], UNIT_JOB_TIMEOUT_MS),
    enableUnit: (unit: string) => run(['systemctl', 'enable', provisionUnit(unit)]),
    startUnit: (unit: string) => run(['systemctl', 'start', provisionUnit(unit)], UNIT_JOB_TIMEOUT_MS),
    restartUnit: (unit: string) => run(['systemctl', 'restart', provisionUnit(unit)], UNIT_JOB_TIMEOUT_MS),
    reloadUnit: (unit: string) => run(['systemctl', 'reload', provisionUnit(unit)], UNIT_JOB_TIMEOUT_MS),
    webConfigtest(bin: string, server: 'apache' | 'nginx'): ExecResult {
      if (!isConfigtestBinary(server, bin)) {
        throw new Error(
          `exec: '${bin}' is not a ${server} configtest binary (${WEB_CONFIGTEST_CANDIDATES[server].join(', ')})`,
        );
      }
      return run([bin, '-t']);
    },
    visudoCheck: (file: string) => run(['visudo', '-cf', provisionAbsolute('sudoers candidate', file)]),
    visudoCheckPolicy: () => run(['visudo', '-c']),
    appendOnly: (file: string) => run(['chattr', '+a', provisionAbsolute('append-only target', file)]),
    // ── 14-24 (spec §2.4) ──
    fpmConfigtest: (bin: string) => run([fpmBinary(probe, bin), '-t']),
    apacheIncludes: (bin: string) => run([apacheDumpBinary(bin), '-t', '-D', 'DUMP_INCLUDES']),
    nginxDump: (bin: string) => run([nginxBinary(bin), '-T']),
    selinuxMode: () => run(['getenforce']),
    semanageLocal(kind: SemanageKind): ExecResult {
      if (kind !== 'fcontext' && kind !== 'port') throw new Error(`exec: semanage kind '${String(kind)}' is not fcontext or port`);
      return run(['semanage', kind, '-l', '-C', '-n']);
    },
    semanageImport(file: string): ExecResult {
      provisionAbsolute('semanage import file', file);
      if (basename(file) !== SELINUX_IMPORT_TEMP_NAME) {
        throw new Error(`exec: the semanage import file must be named ${SELINUX_IMPORT_TEMP_NAME}, not '${basename(file)}'`);
      }
      const facts = probe.lstat(file);
      if (facts?.type !== 'file' || facts.uid !== 0 || facts.mode !== 0o600) {
        throw new Error(`exec: the semanage import file '${file}' must be a root-owned regular 0600 file`);
      }
      return run(['semanage', 'import', '-f', file], RELABEL_TIMEOUT_MS);
    },
    restorecon(targets: readonly RestoreconTarget[], dryRun: boolean): ExecResult {
      labelPaths('restorecon', targets.map(target => target.path), 16);
      const flat = targets.filter(target => !target.recursive).map(target => target.path);
      const deep = targets.filter(target => target.recursive).map(target => target.path);
      const calls: string[][] = [];
      if (flat.length > 0) calls.push(['restorecon', ...(dryRun ? ['-n'] : []), '-v', '--', ...flat]);
      if (deep.length > 0) calls.push(['restorecon', '-R', ...(dryRun ? ['-n'] : []), '-v', '--', ...deep]);
      return joinResults(calls.map(argv => run(argv, RELABEL_TIMEOUT_MS)));
    },
    getsebool: (name: string) => run(['getsebool', selinuxBoolean(name, false)]),
    systemdVersion: () => run(['systemctl', '--version']),
    semanagePortList: () => run(['semanage', 'port', '-l', '-n']),
    selinuxLabel: (paths: readonly string[]) => run(['stat', '-c', '%C %n', '--', ...labelPaths('selinuxLabel', paths, 32)]),
    removeTree(path: string): ExecResult {
      provisionAbsolute('retired tree', path);
      if (!basename(path).endsWith(RETIRED_SUFFIX) || basename(path) === RETIRED_SUFFIX || dirname(path) === '/') {
        throw new Error(`exec: removeTree removes only a '<name>${RETIRED_SUFFIX}' directory, not '${path}'`);
      }
      const facts = probe.lstat(path);
      if (facts?.type !== 'dir' || facts.uid !== 0 || facts.mode !== 0o700) {
        throw new Error(`exec: the retired tree '${path}' must be a root-owned 0700 directory (it is made one first)`);
      }
      // GNU rm walks descriptor-relative and never follows a link; --one-file-system stops at a mount.
      return run(['rm', '-rf', '--one-file-system', '--', path], RELABEL_TIMEOUT_MS);
    },
  });
}

/* ── initExec ─────────────────────────────────────────────────────────────────────── */

/** The pairing child's environment (spec §2.4 row 20): nothing else reaches it (NODE_ENV never). */
const PAIR_ENV_KEY = /^(PATH|HOME|LC_ALL|DEDALO_[A-Z0-9_]+)$/;
/** The service token's shape (base64url, layout.ts SERVICE_TOKEN_BYTES → 43 chars). Never echoed. */
const PAIR_TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
/** The pairing script, relative to the work checkout. */
export const PAIR_SCRIPT = 'scripts/publication_host_pair.ts';
/** Debian-family marker: a2enmod/a2dismod exist only there (spec §2.4 rows 16-17). */
const DEBIAN_MARKER = '/etc/debian_version';

function nologinShell(shell: string): string {
  if (!(NOLOGIN_SHELLS as readonly string[]).includes(shell)) {
    throw new Error(`exec: shell '${shell}' is not a nologin shell (${NOLOGIN_SHELLS.join(', ')})`);
  }
  return shell;
}

function apacheModules(probe: ExecProbe, mods: readonly string[]): string[] {
  if (mods.length === 0) throw new Error('exec: no Apache module named');
  if (new Set(mods).size !== mods.length) throw new Error(`exec: an Apache module is named twice (${mods.join(' ')})`);
  for (const mod of mods) {
    if (!(APACHE_MODULES as readonly string[]).includes(mod)) {
      throw new Error(`exec: '${mod}' is not one of the modules init manages (${APACHE_MODULES.join(', ')})`);
    }
  }
  if (probe.lstat(DEBIAN_MARKER)?.type !== 'file') {
    throw new Error('exec: a2enmod/a2dismod exist on the Debian family only; on EL init never edits conf.modules.d');
  }
  return [...mods];
}

function pairArgv(p: PairInvocation): { argv: string[]; env: Record<string, string>; cwd: string } {
  const user = provisionName(p.user);
  if (user === 'root') throw new Error('exec: the pairing child never runs as root');
  const bun = provisionAbsolute('engine bun', p.bun);
  const checkout = provisionAbsolute('engine checkout', p.checkout);
  const fragment = provisionAbsolute('engine fragment', p.fragment);
  if (p.verb !== 'add' && p.verb !== 'replace') throw new Error(`exec: pairing verb '${String(p.verb)}' is not add or replace`);
  if (!PAIR_NAME_PATTERN.test(p.name)) throw new Error(`exec: pair name '${p.name}' must match ${PAIR_NAME_PATTERN.source}`);
  if (!PAIR_TOKEN.test(p.token)) throw new Error('exec: the token is not a service token (its value is never printed)');
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(p.env)) {
    if (!PAIR_ENV_KEY.test(key)) throw new Error(`exec: '${key}' may not reach the pairing child (PATH, HOME, LC_ALL, DEDALO_* only)`);
    if (/[\0\r\n]/.test(value)) throw new Error(`exec: the value of '${key}' holds a NUL or a newline`);
    env[key] = value;
  }
  const argv = [
    'setsid',
    '--wait',
    'runuser',
    '-u',
    user,
    '--',
    bun,
    '--no-install',
    join(checkout, PAIR_SCRIPT),
    p.verb,
    p.name,
    '--fragment',
    fragment,
    '--token-stdin',
    ...(p.dryRun ? ['--dry-run'] : []),
  ];
  return { argv, env, cwd: checkout };
}

export function initExec(spawner: SyncSpawner = provisionSpawner, probe: ExecProbe = hostProbe): InitExec {
  const run = (argv: readonly string[]): ExecResult =>
    spawner.run(argv, { env: { PATH: PROVISION_PATH, LC_ALL: 'C' }, timeoutMs: COMMAND_TIMEOUT_MS });
  /** The ONE runner with stdin: reachable only from pairAsEngine. */
  const runWithInput = (argv: readonly string[], input: Uint8Array, cwd: string, env: Record<string, string>, timeoutMs: number) =>
    spawner.run(argv, { cwd, env, input, timeoutMs });
  return Object.freeze({
    unameMachine: () => run(['uname', '-m']),
    passwdDb: () => run(['getent', 'passwd']),
    groupDb: () => run(['getent', 'group']),
    passwdLookup: (name: string) => run(['getent', 'passwd', provisionName(name)]),
    groupLookup: (name: string) => run(['getent', 'group', provisionName(name)]),
    unitShow: (unit: string) =>
      run(['systemctl', 'show', provisionUnit(unit), ...UNIT_SHOW_PROPERTIES.flatMap(property => ['-p', property])]),
    listCandidateUnits: () =>
      run(['systemctl', 'list-units', '--all', '--plain', '--no-legend', '--no-pager', ...CANDIDATE_UNIT_PATTERNS]),
    polkitVersion: () => run(['pkaction', '--version']),
    apacheVhosts: (bin: string) => run([apacheDumpBinary(bin), '-S']),
    apacheModules: (bin: string) => run([apacheDumpBinary(bin), '-M']),
    fpmDump: (bin: string) => run([fpmBinary(probe, bin), '-tt']),
    phpVersion(bin: string): ExecResult {
      provisionAbsolute('php cli', bin);
      const real = probe.realpath(bin);
      if (real === null || !PHP_CLI_PATTERN.test(real)) {
        throw new Error(`exec: '${bin}' does not resolve to a PHP CLI (${PHP_CLI_PATTERN.source})`);
      }
      return run([real, '-n', '-r', 'echo PHP_VERSION;']);
    },
    groupAdd: (name: string) => run(['groupadd', '--system', provisionName(name)]),
    userAddOwnGroup: (name: string, shell: string) =>
      run(['useradd', '--system', '--no-create-home', '--shell', nologinShell(shell), '--user-group', provisionName(name)]),
    userAddInGroup: (name: string, group: string, shell: string) =>
      run([
        'useradd',
        '--system',
        '--no-create-home',
        '--shell',
        nologinShell(shell),
        '-g',
        provisionName(group),
        provisionName(name),
      ]),
    enableApacheModules: (mods: readonly string[]) => run(['a2enmod', '-q', ...apacheModules(probe, mods)]),
    disableApacheModules: (mods: readonly string[]) => run(['a2dismod', '-q', ...apacheModules(probe, mods)]),
    unzipBun(zip: string, asset: string, dest: string): ExecResult {
      provisionAbsolute('bun archive', zip);
      provisionAbsolute('bun extract directory', dest);
      if (!(BUN_ASSETS as readonly string[]).includes(asset)) {
        throw new Error(`exec: '${asset}' is not a Bun asset (${BUN_ASSETS.join(', ')})`);
      }
      return run(['unzip', '-q', '-o', '-j', zip, `${asset}/bun`, '-d', dest]);
    },
    bunVersion: (bin: string) => run([provisionAbsolute('bun binary', bin), '--version']),
    pairAsEngine(invocation: PairInvocation): ExecResult {
      const { argv, env, cwd } = pairArgv(invocation);
      return runWithInput(argv, new TextEncoder().encode(invocation.token), cwd, env, PAIR_TIMEOUT_MS);
    },
    setsebool: (name: string, value: boolean) => {
      if (typeof value !== 'boolean') throw new Error('exec: a boolean value is on or off');
      return run(['setsebool', '-P', selinuxBoolean(name, true), value ? 'on' : 'off']);
    },
    webVersion(bin: string): ExecResult {
      if (!APACHE_DUMP_CANDIDATES.includes(bin) && !isConfigtestBinary('nginx', bin)) {
        throw new Error(
          `exec: '${bin}' is not a web server binary (${[...APACHE_DUMP_CANDIDATES, ...WEB_CONFIGTEST_CANDIDATES.nginx].join(', ')})`,
        );
      }
      return run([bin, '-v']);
    },
  });
}
