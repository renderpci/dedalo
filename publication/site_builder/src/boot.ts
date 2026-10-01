/**
 * THE BOOT ORDER, as a function a gate can hold (LEAD-1b, spec §2.4).
 *
 *   1. PREFLIGHT — prove whose roots these are before anything is written (instance/roots.ts).
 *   1b. PROBE THE AGENT CLI — ask the installed Claude Code binary which flags it lists, and SAY
 *      so when one a turn needs is missing (drivers/claude_code.ts bootProbeClaudeCli): every
 *      Claude Code turn is then refused, typed, per request. Never stops the boot (another
 *      driver may run), never writes.
 *   1c. PROBE THE HOST'S CONFINEMENT — every reason this host cannot run a confined run through
 *      a door (PID 1 below the floor or unreadable, AGENT_IDENTITIES empty, an identity that does
 *      not resolve or is in the wrong groups, the daemon not in a private group, an untrustworthy
 *      shim or runtime…), SAID at boot (drivers/confinement.ts bootConfinementProblems). Each
 *      run asks again and refuses; this makes a misprovisioned host a boot line instead of a
 *      host that boots green and fails its first request. Never stops the boot, never writes.
 *   2. RECONCILE — ask PID 1 whether any agent run of this museum's site identities is still
 *      alive (a killed daemon's `BindsTo=` stop that has not finished, a unit that will not
 *      die), and QUARANTINE any identity that is — rebuilt from PID 1's state, never from
 *      memory (`drivers/confinement.ts` reconcileAgentUnits).
 *   3. SWEEP — seed the driver record of a site from before it (sites/driver_record.ts), then
 *      mark sessions a dead process left 'running' as interrupted and commit their owed
 *      work as a recovery point (sessions/manager.ts sweepOnBoot). AFTER the reconciliation:
 *      the recovery commit runs git as the site's identity, which must be proved idle first.
 *   4. LISTEN — only now may a request start anything.
 *
 * It exists as its own module because `index.ts` is the process entry (top-level await, a
 * server bound at import) and cannot be imported by a gate. So the STEPS THEMSELVES live here
 * too (`daemonBootSteps`, `daemonShutdownSteps`): what the reconcile step reconciles and what the
 * shutdown refuses first are outcomes a gate runs against a stand-in PID 1, and `index.ts` only
 * hands over what it alone owns (the preflight, the sweep, the listener, the drain).
 */

import { bootConfinementProblems, type ConfinementPolicy, reconcileAgentUnits, stopOpeningRuns } from './drivers/confinement';

export interface BootSteps {
  readonly preflight: () => void | Promise<void>;
  /** Optional: the agent-CLI probe (absent in a gate that does not state one). */
  readonly probeAgentCli?: () => void | Promise<void>;
  /** Optional: the host's confinement probe (absent in a gate that does not state one). */
  readonly probeConfinement?: () => void | Promise<void>;
  readonly reconcileAgentUnits: () => void | Promise<void>;
  readonly sweepOnBoot: () => void | Promise<void>;
  readonly listen: () => void | Promise<void>;
}

/** Run the boot steps in THE order. A step that throws stops the boot there. */
export async function bootSequence(steps: BootSteps): Promise<void> {
  await steps.preflight();
  await steps.probeAgentCli?.();
  await steps.probeConfinement?.();
  await steps.reconcileAgentUnits();
  await steps.sweepOnBoot();
  await steps.listen();
}

/** What `index.ts` alone owns; everything else about the boot is decided here. */
export interface DaemonBootDeps {
  /** The confinement policy PID 1 is asked about (production: `policyFromConfig()`). */
  readonly policy: () => ConfinementPolicy;
  readonly preflight: () => void | Promise<void>;
  readonly sweepOnBoot: () => Promise<void>;
  readonly listen: () => void | Promise<void>;
  /**
   * The agent-CLI probe: the problems that refuse every turn of the configured CLI (empty =
   * runnable). Production: `bootProbeClaudeCli`.
   */
  readonly probeAgentCli?: () => Promise<readonly string[]>;
  /**
   * The host's confinement problems (empty = every door can run). Default: the confinement's own
   * questions of `policy()` (`bootConfinementProblems`).
   */
  readonly probeConfinement?: () => Promise<readonly string[]>;
  /** Where a failed step is reported (production: console.error). */
  readonly report?: (message: string, error: unknown) => void;
}

/**
 * THE DAEMON'S BOOT STEPS. Reconcile asks PID 1 about THIS policy's identities — a run a killed
 * daemon left alive is stopped, or quarantines its site, before the sweep's recovery commit
 * runs git as that site. Neither reconcile nor the sweep stops the boot when it fails: a site
 * that could not be proved idle is refused per run, not by refusing to listen.
 */
export function daemonBootSteps(deps: DaemonBootDeps): BootSteps {
  const report = deps.report ?? ((message: string, error: unknown) => console.error(message, error));
  const probe = deps.probeAgentCli;
  return {
    preflight: deps.preflight,
    ...(probe
      ? {
          probeAgentCli: async () => {
            try {
              const problems = await probe();
              if (problems.length > 0) {
                report('[boot] the agent CLI cannot run a turn; every turn of it will be refused (confinement.agent_cli_unsupported):', problems.join(' '));
              }
            } catch (error) {
              report('[boot] the agent CLI probe failed; every turn re-probes and refuses on failure:', error);
            }
          },
        }
      : {}),
    probeConfinement: async () => {
      try {
        const problems = await (deps.probeConfinement ?? (() => bootConfinementProblems(deps.policy())))();
        if (problems.length > 0) {
          report('[boot] this host cannot run a confined agent run; every run will be refused (confinement_unavailable):', problems.join(' '));
        }
      } catch (error) {
        report('[boot] the confinement probe failed; every run asks again and refuses on failure:', error);
      }
    },
    reconcileAgentUnits: async () => {
      try {
        await reconcileAgentUnits(deps.policy());
      } catch (error) {
        report('[boot] agent unit reconciliation failed:', error);
      }
    },
    sweepOnBoot: async () => {
      try {
        await deps.sweepOnBoot();
      } catch (error) {
        report('[boot] session sweep failed:', error);
      }
    },
    listen: deps.listen,
  };
}

/**
 * THE SHUTDOWN ORDER.
 *
 *   1. REFUSE NEW RUNS — synchronously, before anything awaits: from here no confined run
 *      connects, because a socket-activated start of an agent unit (`BindsTo=` the daemon)
 *      would cancel the daemon's own stop job (drivers/confinement.ts stopOpeningRuns).
 *   2. DRAIN — in-flight requests and SSE streams finish within the grace.
 *   3. INTERRUPT — whatever still runs is marked interrupted, never left 'running'.
 *   4. CLEAN UP — the socket, the exit.
 */
export interface ShutdownSteps {
  readonly refuseNewRuns: () => void;
  readonly drain: () => Promise<void>;
  readonly interrupt: () => Promise<void>;
  readonly cleanup: () => void | Promise<void>;
}

/** Run the shutdown steps in THE order. */
export async function shutdownSequence(steps: ShutdownSteps): Promise<void> {
  steps.refuseNewRuns();
  await steps.drain();
  await steps.interrupt();
  await steps.cleanup();
}

/** The daemon's shutdown steps: its refusal is the confinement's, for THIS policy. */
export function daemonShutdownSteps(deps: {
  readonly policy: () => ConfinementPolicy;
  readonly drain: () => Promise<void>;
  readonly interrupt: () => Promise<void>;
  readonly cleanup: () => void | Promise<void>;
}): ShutdownSteps {
  return {
    refuseNewRuns: () => stopOpeningRuns(deps.policy()),
    drain: deps.drain,
    interrupt: deps.interrupt,
    cleanup: deps.cleanup,
  };
}
