/**
 * The persisted session-event model.
 *
 * A session is a chain of turns; its authoritative history is a JSONL file (one
 * StoredEvent per line) under the site's .builder/sessions/<id>.jsonl. Every event
 * carries a monotonic `seq` and a timestamp, so any consumer can replay from a cursor
 * (`?after=N`) and then live-tail — the SSE endpoint (sse.ts) is exactly that.
 *
 * The body is the union of the drivers' normalized AgentEvent plus two daemon-generated
 * lifecycle markers (turn_start / turn_end) that give a UI its turn boundaries without
 * having to infer them.
 */

import type { AgentEvent } from '../drivers/types';
import type { SessionState } from './manager';

export type SessionEventBody =
  | { type: 'turn_start'; turn: number; prompt: string }
  | AgentEvent
  | { type: 'turn_end'; state: SessionState; resumeToken?: string }
  /**
   * A resume token was DROPPED: it was minted under another agent identity (the epoch moved
   * — LEAD-1b), so the agent state it names is not this identity's. The turn starts fresh.
   */
  | { type: 'resume_unavailable'; reason: 'agent identity migrated' };

export interface StoredEvent {
  seq: number;
  ts: string;
  body: SessionEventBody;
}

/** Session metadata sidecar (.builder/sessions/<id>.meta.json) — the resume anchor. */
export interface SessionMeta {
  session_id: string;
  slug: string;
  driver: 'claude_code' | 'opencode' | 'pi';
  started_at: string;
  turns: number;
  state: SessionState;
  /** Driver-native resume token from the last completed turn, if any. */
  resume_token: string | null;
  /**
   * The agent-identity epoch the session last ran under (AGENT_IDENTITY_EPOCH). A token from
   * another epoch is dropped. Absent on sessions from before LEAD-1b, which count as epoch 0.
   */
  identity_epoch?: number;
  /**
   * The last turn's commit was REFUSED because the daemon was shutting down
   * (`confinement.daemon_stopping`): its work is still in the tree, and the next boot's sweep
   * commits it as a recovery point, then clears this. Absent otherwise.
   */
  recovery_pending?: boolean;
}
