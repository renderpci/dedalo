/**
 * THE ONLY SPAWNER. Every child process the agent starts is one of the five named
 * commands below; no exported function takes a free argv. tests/exec.test.ts fails when
 * any other file under src/ spawns.
 *
 * - ABSOLUTE BINARIES, NEVER A PATH LOOKUP: sudo, systemctl and the configtest binary are
 *   the constants below; PHP_BIN and BUN_BIN are absolute by config law. The sudoers rule
 *   (Task 9) names exactly `SUDO -n WEB_CONFIGTEST_BINARY[server] -t` — the one spelling.
 *   A drill that wants stand-ins puts them AT these paths (Task 11: inside the CI-image
 *   container or a private mount namespace), never earlier on PATH: PATH is not consulted.
 * - A FIXED child environment: nothing of the agent's own environment (its token
 *   included) reaches a child. The v2 scratch boot gets shared/v2.env + HOST/PORT only.
 * - Every path argument is confined by realpath to the agent's own state root; the v2
 *   scratch boot accepts ONLY a directory directly under publication_api/v2/staging/ —
 *   the staged, not-yet-promoted release Task 7 health-checks before the swap.
 * - Short commands are killed after COMMAND_TIMEOUT_MS; their output is capped.
 * - IMPORTING THIS MODULE DOES NOT RESOLVE THE AGENT'S CONFIGURATION: `createExec` takes
 *   it as an argument, and only `realExec()`/`setExecForTests()` load src/config.ts, lazily.
 *   A root-run tool on a host with no agent env file can import the names below.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { AgentConfig } from './config';
import { parseEnvFile } from './env_file';
import { ConflictError, ValidationError } from './errors';
import { PUBLICATION_API_DIR } from './instance/roots';

export type ExecResult = { code: number; stdout: string; stderr: string };

export interface ScratchProcess {
  stop(): Promise<void>;
}

export interface Exec {
  webConfigtest(): Promise<ExecResult>;
  webReload(): Promise<ExecResult>;
  v2Restart(): Promise<ExecResult>;
  phpLint(file: string): Promise<ExecResult>;
  v2ScratchBoot(releaseDir: string, port: number): ScratchProcess;
}

export const SUDO = '/usr/bin/sudo';
export const SYSTEMCTL = '/usr/bin/systemctl';
export const WEB_CONFIGTEST_BINARY = Object.freeze({
  apache: '/usr/sbin/apachectl',
  nginx: '/usr/sbin/nginx',
} as const);

export const CHILD_PATH = '/usr/local/bin:/usr/bin:/bin';
export const COMMAND_TIMEOUT_MS = 60_000;
export const SCRATCH_STOP_GRACE_MS = 10_000;
const OUTPUT_CAP = 64 * 1024;

export interface SpawnOptions {
  readonly cwd?: string;
  readonly env: Record<string, string>;
}

/** HOW a named command is started — the seam a gate replaces to observe argv. */
export interface Spawner {
  run(argv: readonly string[], options: SpawnOptions): Promise<ExecResult>;
  start(argv: readonly string[], options: SpawnOptions): ScratchProcess;
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
  start(argv, options) {
    const child = Bun.spawn([...argv], {
      cwd: options.cwd,
      env: options.env,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'inherit',
    });
    return {
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM');
        const exited = await Promise.race([child.exited.then(() => true), Bun.sleep(SCRATCH_STOP_GRACE_MS).then(() => false)]);
        if (!exited) {
          child.kill('SIGKILL');
          await child.exited;
        }
      },
    };
  },
};

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
    webConfigtest: () => spawner.run([SUDO, '-n', WEB_CONFIGTEST_BINARY[cfg.WEB_SERVER], '-t'], { env: env() }),
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
    v2ScratchBoot: (releaseDir, port) => {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new ValidationError(`v2ScratchBoot refuses port ${port}: expected an integer in 1024-65535.`);
      }
      const v2Root = join(cfg.STATE_ROOT, PUBLICATION_API_DIR, 'v2');
      const staging = realOrRefuse(join(v2Root, 'staging'), 'v2 staging directory');
      const real = realOrRefuse(releaseDir, 'v2 staged release directory');
      if (dirname(real) !== staging || !statSync(real).isDirectory()) {
        throw new ValidationError(
          `v2ScratchBoot refuses '${releaseDir}': it is not a directory directly under ${staging}. ` +
            `Only a staged, not-yet-promoted release is booted on a scratch port.`,
        );
      }
      const envFile = join(v2Root, 'shared', 'v2.env');
      if (!existsSync(envFile)) {
        throw new ConflictError(`The v2 environment file '${envFile}' does not exist; the provisioner renders it.`, 'v2_env_missing');
      }
      const v2Env = parseEnvFile(readFileSync(envFile, 'utf8'), envFile);
      return spawner.start([cfg.BUN_BIN, 'run', 'src/index.ts'], {
        cwd: real,
        env: { PATH: CHILD_PATH, ...v2Env, HOST: '127.0.0.1', PORT: String(port) },
      });
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
