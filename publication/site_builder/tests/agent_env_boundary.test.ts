/**
 * THE AGENT-SECRETS BOUNDARY — the KEY SET of every child environment this daemon creates.
 *
 * The sibling gate (`tests/agent_boundary.test.ts`) holds HOME and the API key in git. This
 * one holds the rest of the same boundary, and it is the half that was stated everywhere
 * and enforced nowhere: `src/util/spawn.ts`, `src/drivers/process.ts` and
 * `src/drivers/types.ts` each say the child environment is CONSTRUCTED and never inherited,
 * and `src/sessions/manager.ts` calls its own assembly "the agent-secrets boundary".
 * Measured before this file existed: making `spawn.ts` spread `process.env`, making
 * `drivers/process.ts` spread it, and adding `SERVICE_TOKEN` to the manager's allowlist
 * each left the suite at 699 pass / 0 fail. Any one of them hands a coding agent the bearer
 * that IS the engine↔daemon capability, `$CREDENTIALS_DIRECTORY`, and every provider key.
 *
 * BEHAVIOURAL AT EVERY DOOR THAT CAN BE. Two of the three assertions read the environment a
 * REAL child process received — `/usr/bin/env` prints its own — and the third reads the
 * options the manager actually handed a driver. Nothing here greps a source file for
 * `process.env`: a merge introduced through a helper, a default parameter or a wrapper
 * would satisfy any such grep and fail every assertion below.
 *
 * WHY THE SET AND NOT A DENYLIST. "The canary is absent" passes on a machine where the
 * canary happens not to be exported; an exact set comparison refuses an inherited
 * environment whatever it holds.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { provisionSite, resetInstance } from './fixtures/instance';
import { createSite } from '../src/sites/workspace';
import { runBinary } from '../src/util/spawn';
import { config } from '../src/config';
import { __setTestDriver } from '../src/drivers/registry';
import { spawnAgentProcess } from '../src/drivers/process';
import { startSession } from '../src/sessions/manager';
import type { AgentDriver, AgentProcess, DriverId, SessionStartOptions } from '../src/drivers/types';

const ACTOR = { user_id: 11, username: 'boundary-tester' };

beforeEach(resetInstance);
afterEach(async () => {
  for (const id of ['claude_code', 'opencode', 'pi'] as const) __setTestDriver(id, null);
  await resetInstance();
});

/**
 * THE HALF THIS FILE USED TO NAME AND NOT HOLD.
 *
 * The header above says an agent turn runs arbitrary generated code as this instance's
 * unix user. The defence against that is not one variable: it is that the child's
 * environment is CONSTRUCTED rather than inherited — `spawn.ts`, `drivers/process.ts` and
 * the session manager each say so — and until this section existed, only `HOME` was held.
 * Measured: making `src/util/spawn.ts` spread `process.env`, making `drivers/process.ts`
 * spread it, and adding `SERVICE_TOKEN` to the manager's own allowlist each left the suite
 * green. Any one of them hands a coding agent the bearer that IS the engine↔daemon
 * capability, `$CREDENTIALS_DIRECTORY`, and every provider key at once.
 *
 * So the assertions below are about the KEY SET, and they are BEHAVIOURAL at every door
 * that can be: two of them read the environment a real child process actually received
 * (`/usr/bin/env` prints its own), and the third reads the options the manager hands a
 * driver. Nothing here greps a source file for `process.env`.
 */
describe('the child environment is CONSTRUCTED, never inherited', () => {
  /** Names no lawful child may ever carry, planted in THIS process before each spawn. */
  const CANARIES = {
    SERVICE_TOKEN: 'the-engine-daemon-capability',
    CREDENTIALS_DIRECTORY: '/run/credentials/dedalo-site-test.service',
    ANTHROPIC_API_KEY: 'sk-ant-canary',
    PUBLICATION_API_KEY: 'publication-canary',
    AWS_SECRET_ACCESS_KEY: 'aws-canary',
  } as const;

  function plantCanaries(): void {
    for (const [key, value] of Object.entries(CANARIES)) process.env[key] = value;
  }
  function clearCanaries(): void {
    for (const key of Object.keys(CANARIES)) delete process.env[key];
  }

  /** The key set a child really saw, read out of `/usr/bin/env`'s own stdout. */
  function keysOf(stdout: string): string[] {
    return stdout
      .split('\n')
      .filter(line => line.includes('='))
      .map(line => line.slice(0, line.indexOf('=')))
      .sort();
  }

  test('runBinary hands the child EXACTLY the keys it was passed, and no others', async () => {
    plantCanaries();
    try {
      const result = await runBinary(['/usr/bin/env'], {
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: '/tmp' },
        timeoutMs: 30_000,
      });
      expect(result.exitCode).toBe(0);
      // EXACTLY — not "does not contain the canaries". A set comparison is what refuses a
      // merge over process.env: an inherited environment fails here whatever it happens to
      // hold on the machine running the suite.
      expect(keysOf(result.stdout)).toEqual(['HOME', 'PATH']);
    } finally {
      clearCanaries();
    }
  });

  test('an empty allowlist really means an empty environment', async () => {
    plantCanaries();
    try {
      // `env` is optional in SpawnOptions and defaults to `{}`. That default is the one
      // most likely to be "fixed" into a process.env spread by someone who reads it as an
      // oversight, so it is asserted as the deliberate thing it is.
      const result = await runBinary(['/usr/bin/env'], { timeoutMs: 30_000 });
      expect(result.exitCode).toBe(0);
      expect(keysOf(result.stdout)).toEqual([]);
    } finally {
      clearCanaries();
    }
  });

  test('the agent-process supervisor spawns with the driver allowlist and nothing more', async () => {
    plantCanaries();
    try {
      const seen: string[] = [];
      const process_ = spawnAgentProcess(
        {
          workspace: '/tmp',
          prompt: 'irrelevant',
          mcp: { name: 'x', url: 'http://x/mcp' },
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: '/tmp', DRIVER_ONLY: 'yes' },
          timeoutMs: 30_000,
        },
        async () => ({
          argv: ['/usr/bin/env'],
          parseLine: (line: string) => (line.includes('=') ? [{ type: 'text', text: line }] : []),
        }),
      );
      for await (const event of process_.events) {
        if (event.type === 'text') seen.push(event.text);
      }
      expect(keysOf(seen.join('\n'))).toEqual(['DRIVER_ONLY', 'HOME', 'PATH']);
    } finally {
      clearCanaries();
    }
  });

  /**
   * THE MANAGER'S OWN ALLOWLIST — the list `buildStartOptions` builds, read off the options
   * a driver was actually handed.
   *
   * Two properties in one: the SET is closed (the daemon's own secrets are not in it), and
   * a provider credential is scoped to ITS OWN driver. The second is what makes the three
   * drivers separate trust domains rather than three names for one environment.
   */
  describe('the session manager hands a driver a closed, per-driver allowlist', () => {
    /** Captures the SessionStartOptions a turn was started with, then ends the turn. */
    function capturingDriver(id: DriverId, sink: { env?: Record<string, string> }): AgentDriver {
      return {
        id,
        capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
        async detect() {
          return { id, binPath: 'fake', version: '1.0.0' };
        },
        startTurn(start: SessionStartOptions): AgentProcess {
          sink.env = { ...start.env };
          return {
            pid: 1,
            events: (async function* () {
              yield { type: 'result', ok: true, durationMs: 1 } as const;
            })(),
            async interrupt() {},
          };
        },
      };
    }

    async function envHandedTo(driver: DriverId, slug: string): Promise<Record<string, string>> {
      const sink: { env?: Record<string, string> } = {};
      __setTestDriver(driver, capturingDriver(driver, sink));
      try {
        const { domain } = await provisionSite(slug);
        await createSite({ slug, name: slug, domain, actor: ACTOR, driver });
        await startSession(slug, 'write a page', driver);
        // The turn is detached; the capture happens inside startTurn, which the manager
        // awaits before returning the session id.
        expect(sink.env).toBeDefined();
        return sink.env as Record<string, string>;
      } finally {
        __setTestDriver(driver, null);
      }
    }

    test('no daemon secret reaches a turn, whichever driver runs it', async () => {
      plantCanaries();
      try {
        for (const driver of ['claude_code', 'opencode', 'pi'] as const) {
          const env = await envHandedTo(driver, `boundary-${driver.replace(/_/g, '-')}`);
          // The daemon's own capability and the systemd credential store: never, on any
          // driver, under any configuration.
          expect({ driver, keys: Object.keys(env).sort() }).toEqual({
            driver,
            keys: expectedKeysFor(driver),
          });
          await resetInstance();
        }
      } finally {
        clearCanaries();
      }
    });

    /**
     * What each driver may carry. PATH and HOME always; a provider key ONLY for the driver
     * whose credential it is. Derived from the config the suite is running under rather
     * than hardcoded, so this reads as the rule and not as a snapshot: with no provider
     * key configured the expectation is the two base keys, which is the suite's own case.
     */
    function expectedKeysFor(driver: DriverId): string[] {
      const keys = ['HOME', 'PATH'];
      if (driver === 'claude_code' && config.ANTHROPIC_API_KEY) keys.push('ANTHROPIC_API_KEY');
      if (driver === 'opencode') keys.push(...Object.keys(parseEnvPairsForTest(config.OPENCODE_ENV)));
      if (driver === 'pi') keys.push(...Object.keys(parseEnvPairsForTest(config.PI_ENV)));
      return keys.sort();
    }

    /** The manager's own `KEY=value,KEY=value` reading, spelled once here for the census. */
    function parseEnvPairsForTest(value: string | undefined): Record<string, string> {
      const out: Record<string, string> = {};
      for (const pair of (value ?? '').split(',')) {
        const eq = pair.indexOf('=');
        if (eq <= 0) continue;
        out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
      return out;
    }

    test("a provider credential goes to ITS driver's turn and to no other", async () => {
      // The scoping is the property: `if (driver === 'claude_code' && ANTHROPIC_API_KEY)`.
      // Dropping the driver test forwards Anthropic's key to opencode and pi as well —
      // three separate providers reading one museum's Anthropic credential. `.env.test`
      // carries a placeholder for each provider precisely so this has a positive case:
      // with them all empty the assertion would hold against code that forwarded
      // everything to everyone.
      expect(config.ANTHROPIC_API_KEY).not.toBe('');
      {
        const claude = await envHandedTo('claude_code', 'scoped-claude');
        expect(claude.ANTHROPIC_API_KEY).toBe(config.ANTHROPIC_API_KEY);
        await resetInstance();

        for (const other of ['opencode', 'pi'] as const) {
          const env = await envHandedTo(other, `scoped-${other}`);
          expect({ driver: other, carriesAnthropic: 'ANTHROPIC_API_KEY' in env }).toEqual({
            driver: other,
            carriesAnthropic: false,
          });
          await resetInstance();
        }
      }
    });
  });
});
