/**
 * THE BOOT ORDER, as a function a gate can hold (LEAD-1b, spec §2.4).
 *
 *   1. PREFLIGHT — prove whose roots these are before anything is written (instance/roots.ts).
 *   1a. CLAIM THE INSTANCE — prove this process is the one that may act for it, before anything
 *      that stops a unit or writes: the listen target must not already be served
 *      (instance/listen_target.ts), and under `systemd_scope` PID 1 must name this process as the
 *      daemon unit's main process (drivers/confinement.ts daemonClaimProblem). A second process
 *      of the instance (a hand run as the service user beside the unit's daemon) used to reach
 *      step 2 — which STOPS live runs through a grant that cannot tell the two apart — and the
 *      sweep, which rewrote the serving daemon's sessions, before listen noticed. A claim that
 *      fails STOPS the boot (`refuse`, then a throw): nothing stopped, swept or written.
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

import { bootConfinementProblems, type ConfinementPolicy, daemonClaimProblem, reconcileAgentUnits, stopOpeningRuns } from './drivers/confinement';
import { type ListenTarget, listenTargetHeld } from './instance/listen_target';

export interface BootSteps {
  readonly preflight: () => void | Promise<void>;
  /** The instance claim: throws (stopping the boot) when this process may not act for it. */
  readonly claimInstance: () => void | Promise<void>;
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
  await steps.claimInstance();
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
  /** Where `listen` will bind — the claim asks whether something already answers there. */
  readonly listenTarget: () => ListenTarget;
  /**
   * How a refused claim is said before the boot stops (production: one line and exit 1, the
   * preflight's shape). Whatever it does, the step then throws: a refused claim never continues.
   */
  readonly refuse?: (message: string) => void;
  /** This process, as PID 1 would name it (default `process.pid`; a gate's seam). */
  readonly pid?: number;
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
 * THE DAEMON'S BOOT STEPS. The claim comes first and is the one step besides the preflight that
 * STOPS the boot: a listen target already served, or (systemd_scope) a PID 1 that does not name
 * this process the daemon unit's main process — or cannot say — refuses before anything is
 * stopped or swept. Reconcile asks PID 1 about THIS policy's identities — a run a killed
 * daemon left alive is stopped, or quarantines its site, before the sweep's recovery commit
 * runs git as that site. Neither reconcile nor the sweep stops the boot when it fails: a site
 * that could not be proved idle is refused per run, not by refusing to listen.
 */
export function daemonBootSteps(deps: DaemonBootDeps): BootSteps {
  const report = deps.report ?? ((message: string, error: unknown) => console.error(message, error));
  const probe = deps.probeAgentCli;
  // ONE POLICY FOR THE WHOLE BOOT — its value, or its failure. The claim and the reconcile must be
  // about the same policy: a policy the claim could not build is one no later step can stop a
  // unit with either (each meets the same remembered throw), which is why the claim may skip PID
  // 1's half then and still never let a unit be stopped unclaimed.
  let remembered: { readonly policy: ConfinementPolicy } | { readonly error: unknown } | null = null;
  const policy = (): ConfinementPolicy => {
    if (remembered === null) {
      try {
        remembered = { policy: deps.policy() };
      } catch (error) {
        remembered = { error };
      }
    }
    if ('error' in remembered) throw remembered.error;
    return remembered.policy;
  };
  return {
    preflight: deps.preflight,
    claimInstance: async () => {
      const problems: string[] = [];
      const held = await listenTargetHeld(deps.listenTarget());
      if (held) problems.push(`${held} — the instance is already being served by another process.`);
      let claimed: ConfinementPolicy | null = null;
      try {
        claimed = policy();
      } catch {
        // Reported by the probe and the reconcile steps, which meet the same failure: no unit is
        // stopped under a policy that cannot be built.
      }
      if (claimed) {
        const pid1 = await daemonClaimProblem(claimed, deps.pid ?? process.pid);
        if (pid1) problems.push(pid1);
      }
      if (problems.length === 0) return;
      const message =
        `[claim] this process may not act for the instance: ${problems.join(' ')} Two daemons on one ` +
        `instance would stop each other's agent runs and both write its sessions. Nothing was ` +
        `stopped, swept or written.`;
      deps.refuse?.(message);
      throw new Error(message);
    },
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
        const problems = await (deps.probeConfinement ?? (() => bootConfinementProblems(policy())))();
        if (problems.length > 0) {
          report('[boot] this host cannot run a confined agent run; every run will be refused (confinement_unavailable):', problems.join(' '));
        }
      } catch (error) {
        report('[boot] the confinement probe failed; every run asks again and refuses on failure:', error);
      }
    },
    reconcileAgentUnits: async () => {
      try {
        await reconcileAgentUnits(policy());
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
