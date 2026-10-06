/**
 * THE ONLY SPAWNER. Every child process the agent starts is one of the five named
 * commands below; no exported function takes a free argv. tests/exec.test.ts fails when
 * any other file under src/ spawns. A SECOND closed set, provisionExec() at the end, is the
 * root-run provisioner's (src/provision/): same law, its own fixed root PATH, never reached by a route.
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

import { existsSync, realpathSync, renameSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { AgentConfig } from './config';
import { ConflictError, HostActionFailedError, ValidationError } from './errors';
import { PUBLICATION_API_DIR } from './instance/roots';
import {
  ABSOLUTE_PATH_PATTERN,
  UNIT_NAME_PATTERN,
  UNIX_NAME_PATTERN,
  V2_SCRATCH_TEMPLATE_SUFFIX,
  WEB_CONFIGTEST_CANDIDATES,
  isConfigtestBinary,
} from './provision/layout';

export type ExecResult = { code: number; stdout: string; stderr: string };

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
    v2Restart: () => spawner.run([SYSTEMCTL, 'restart', cfg.V2_UNIT], { env: env() }),
    phpLint: async file => {
      const stateRoot = realOrRefuse(cfg.STATE_ROOT, 'STATE_ROOT');
      const real = realOrRefuse(file, 'phpLint file');
      if (!real.startsWith(stateRoot + sep)) {
        throw new ValidationError(`phpLint refuses '${file}': it is not under STATE_ROOT.`);
      }
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
// THE PROVISIONER'S CLOSED COMMAND SET (src/provision/). Used only by the root-run CLI
// (src/provision/apply.ts); no route reaches it. Same law as the agent's set above: named
// commands, every argument validated before anything spawns, no free argv. It never reads
// the agent's config (tests/provision_exec.test.ts imports this module with an empty env).
// ─────────────────────────────────────────────────────────────────────────────────────

/** A fixed PATH: the provisioner runs as root and never inherits one. */
const PROVISION_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

export interface ProvisionExec {
  userId(name: string): number | null; //               ['id','-u',name]
  groupId(name: string): number | null; //              ['getent','group',name]
  unitState(unit: string): { enabled: boolean; active: boolean }; // is-enabled / is-active --quiet
  daemonReload(): ExecResult; //                         ['systemctl','daemon-reload']
  enableUnit(unit: string): ExecResult; //               ['systemctl','enable',<unit>.service]
  startUnit(unit: string): ExecResult; //                ['systemctl','start',<unit>.service]
  restartUnit(unit: string): ExecResult; //              ['systemctl','restart',<unit>.service]
  reloadUnit(unit: string): ExecResult; //               ['systemctl','reload',<unit>.service]
  webConfigtest(bin: string, server: 'apache' | 'nginx'): ExecResult; // [<a WEB_CONFIGTEST_CANDIDATES[server] entry>,'-t']
  visudoCheck(file: string): ExecResult; //              ['visudo','-cf',file]
  visudoCheckPolicy(): ExecResult; //                    ['visudo','-c'] — the whole policy, includes and all
  /** The audit contract (src/instance/roots.ts): the trail is append-only by the kernel (FS_APPEND_FL). */
  appendOnly(file: string): ExecResult; //               ['chattr','+a',file]
}

function provisionRun(argv: readonly string[]): ExecResult {
  try {
    const proc = Bun.spawnSync({
      cmd: [...argv],
      env: { PATH: PROVISION_PATH, LC_ALL: 'C' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return { code: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  } catch (error) {
    return { code: 127, stdout: '', stderr: error instanceof Error ? error.message : String(error) };
  }
}

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

export function provisionExec(): ProvisionExec {
  return Object.freeze({
    userId(name: string): number | null {
      const result = provisionRun(['id', '-u', provisionName(name)]);
      const out = result.stdout.trim();
      return result.code === 0 && /^\d+$/.test(out) ? Number(out) : null;
    },
    groupId(name: string): number | null {
      const result = provisionRun(['getent', 'group', provisionName(name)]);
      const gid = result.stdout.split('\n')[0]?.split(':')[2] ?? '';
      return result.code === 0 && /^\d+$/.test(gid) ? Number(gid) : null;
    },
    unitState(unit: string): { enabled: boolean; active: boolean } {
      const name = provisionUnit(unit);
      return {
        enabled: provisionRun(['systemctl', 'is-enabled', '--quiet', name]).code === 0,
        active: provisionRun(['systemctl', 'is-active', '--quiet', name]).code === 0,
      };
    },
    daemonReload: () => provisionRun(['systemctl', 'daemon-reload']),
    enableUnit: (unit: string) => provisionRun(['systemctl', 'enable', provisionUnit(unit)]),
    startUnit: (unit: string) => provisionRun(['systemctl', 'start', provisionUnit(unit)]),
    restartUnit: (unit: string) => provisionRun(['systemctl', 'restart', provisionUnit(unit)]),
    reloadUnit: (unit: string) => provisionRun(['systemctl', 'reload', provisionUnit(unit)]),
    webConfigtest(bin: string, server: 'apache' | 'nginx'): ExecResult {
      if (!isConfigtestBinary(server, bin)) {
        throw new Error(
          `exec: '${bin}' is not a ${server} configtest binary (${WEB_CONFIGTEST_CANDIDATES[server].join(', ')})`,
        );
      }
      return provisionRun([bin, '-t']);
    },
    visudoCheck: (file: string) => provisionRun(['visudo', '-cf', provisionAbsolute('sudoers candidate', file)]),
    visudoCheckPolicy: () => provisionRun(['visudo', '-c']),
    appendOnly: (file: string) => provisionRun(['chattr', '+a', provisionAbsolute('append-only target', file)]),
  });
}
