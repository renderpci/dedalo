/**
 * THE STREAM DOOR'S VOCABULARY (WIRE-MAP, 2026-10-11) — what an agent turn's error event, and the
 * SSE responder's own error frame, may say. A REASON, never a sentence.
 *
 * Before: every error a turn produced was the daemon's prose — `setup failed: <message>`,
 * `confinement refused: <the whole refusal>`, the agent's stderr tail, `turn timed out` — stored in
 * the session's durable log and relayed byte-for-byte to the browser, which printed it. The control
 * door (problem+json) already carried a machine `reason` the engine maps onto a registered code
 * with a label; the stream door carried none, so a turn's refusal had no code, no label and no
 * retryable flag, and the daemon's sentence (paths, uids, an agent CLI's stderr) became the
 * browser's error text.
 *
 * Now:
 *   - every error EVENT carries a `reason` from `TURN_EVENT_REASONS`: the refusal's own
 *     `DaemonReason` when the thrown value has one (`reasonOf`), else the supervisor's fault for
 *     the step that failed (`TURN_FAULT_REASONS`). It has NO `message`: the detail goes to the
 *     daemon's log (`turnErrorEvent`), never into the session log;
 *   - the one exception is labelled as what it is: an agent that exited non-zero carries its
 *     stderr tail as `agent_output` (the AGENT's words, bounded), never as the error's text;
 *   - the SSE responder's replay failure is a frame with `reason: 'replay_failed'`
 *     (`STREAM_FRAME_REASONS`, `sessions/sse.ts`).
 *
 * The engine maps every entry of `TURN_ERROR_REASONS` onto a registered `site_builder.*` code
 * (tools/tool_sitebuilder/server/wire.ts `TURN_EVENT_REASON_CODES`, typed exhaustive over
 * `TurnErrorReason` by a type-only import, gated set-equal to this list), and `TURN_ERROR_RETRIABLE`
 * is gated equal to that code's registry `retryable` — one table, two deployables, no drift.
 * Contract: engineering/wire_contract/WC-2026-10-11-site-builder-turn-error-frames.md.
 */

import { DAEMON_REASONS, type DaemonReason, reasonOf } from '../errors';

/**
 * The supervisor's OWN faults (`drivers/process.ts`, `sessions/manager.ts`): no daemon class raises
 * them; they name the step of a turn that failed.
 *
 *  - `turn_timeout` — the turn (or its setup) outlived its deadline;
 *  - `turn_interrupted` — stopped on request (the session's stop, the daemon's shutdown), before
 *    the agent started or while it ran — never reported as the exit the stop caused;
 *  - `turn_setup_failed` — the driver's setup threw something with no reason of its own (an
 *    unreadable brief, a file the setup could not write);
 *  - `turn_unit_lost` — the confined run ended with no exit status of record;
 *  - `turn_agent_killed` — the agent was killed by a signal;
 *  - `turn_agent_exited` — the agent exited non-zero (its stderr tail rides as `agent_output`);
 *  - `turn_failed` — anything else that broke a running turn (reading its output, persisting it).
 */
export const TURN_FAULT_REASONS = Object.freeze([
  'turn_timeout',
  'turn_interrupted',
  'turn_setup_failed',
  'turn_unit_lost',
  'turn_agent_killed',
  'turn_agent_exited',
  'turn_failed',
] as const);

export type TurnFault = (typeof TURN_FAULT_REASONS)[number];

/** The SSE responder's own frame (`sessions/sse.ts`): the stored log could not be replayed. */
export const STREAM_FRAME_REASONS = Object.freeze(['replay_failed'] as const);

export type StreamFrameReason = (typeof STREAM_FRAME_REASONS)[number];

/** What an error EVENT (stored in the session log) may carry. */
export type TurnEventReason = DaemonReason | TurnFault;

/** Everything the stream door may say: the events' reasons and the responder's frame. */
export type TurnErrorReason = TurnEventReason | StreamFrameReason;

/** The runtime list the engine's stream map is gated set-equal to. */
export const TURN_ERROR_REASONS: readonly TurnErrorReason[] = Object.freeze([
  ...DAEMON_REASONS,
  ...TURN_FAULT_REASONS,
  ...STREAM_FRAME_REASONS,
]);

/**
 * THE DAEMON'S ONE RETRIABLE TABLE — equal, reason for reason, to the registry `retryable` of the
 * code the engine maps the reason to (gated: test/unit/tool_sitebuilder_stream_codes.test.ts). It
 * clears by itself (busy, capacity, a restart, a deadline) → true; someone must act → false.
 */
export const TURN_ERROR_RETRIABLE: Readonly<Record<TurnErrorReason, boolean>> = Object.freeze({
  session_running: true,
  build_running: true,
  site_initializing: true,
  site_recovering: true,
  git_running: true,
  site_deleting: true,
  slug_exists: false,
  workspace_exists: false,
  domain_taken: false,
  webspace_unavailable: false,
  no_build: false,
  not_running: false,
  max_sites: false,
  disk_quota: false,
  max_concurrent_sessions: true,
  confinement_unavailable: false,
  'confinement.site_busy': true,
  'confinement.identity_missing': false,
  'confinement.identity_quarantined': true,
  'confinement.unit_refused': false,
  'confinement.unit_nonconformant': false,
  'confinement.daemon_stopping': true,
  'confinement.agent_cli_unsupported': false,
  'confinement.agent_cli_unproved': true,
  turn_timeout: true,
  turn_interrupted: true,
  turn_setup_failed: false,
  turn_unit_lost: true,
  turn_agent_killed: true,
  turn_agent_exited: false,
  turn_failed: true,
  replay_failed: false,
});

/** How much of an agent's stderr tail rides an error event, labelled `agent_output`. */
export const AGENT_OUTPUT_MAX_CHARS = 500;

/** An error event: a reason and its retriable flag — never a sentence. */
export type TurnErrorEvent =
  | { type: 'error'; reason: Exclude<TurnEventReason, 'turn_agent_exited'>; retriable: boolean }
  | { type: 'error'; reason: 'turn_agent_exited'; retriable: false; agent_output: string };

/** The error event of a supervisor fault that carries no thrown value (a deadline, an interrupt). */
export function turnFault(reason: Exclude<TurnFault, 'turn_agent_exited'>): TurnErrorEvent {
  return { type: 'error', reason, retriable: TURN_ERROR_RETRIABLE[reason] };
}

/**
 * THE ONE CONSTRUCTOR OF AN ERROR EVENT FROM A THROWN VALUE: its listed reason when it has one,
 * else `fallback` (the step that failed). The thrown value's sentence is written to the daemon's
 * LOG, here and only here — the event that is stored and relayed carries none of it.
 */
export function turnErrorEvent(error: unknown, fallback: Exclude<TurnFault, 'turn_agent_exited'>, context = ''): TurnErrorEvent {
  const reason = reasonOf(error) ?? fallback;
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[agent] turn error${context ? ` (${context})` : ''} → ${reason}: ${detail}`);
  return { type: 'error', reason, retriable: TURN_ERROR_RETRIABLE[reason] };
}

/** An agent that exited non-zero: its stderr tail, bounded, labelled as the agent's own output. */
export function agentExitedEvent(stderrTail: string): TurnErrorEvent {
  return {
    type: 'error',
    reason: 'turn_agent_exited',
    retriable: false,
    agent_output: stderrTail.trim().slice(-AGENT_OUTPUT_MAX_CHARS),
  };
}
