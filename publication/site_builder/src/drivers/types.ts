/**
 * The AgentDriver abstraction — the seam that makes the coding agent pluggable.
 *
 * Every supported agent (Claude Code, OpenCode, Pi) is a CLI subprocess, and every driver
 * presents the same three things to the daemon: whether its binary is present and usable
 * (detect), what it can do (capabilities), and how to run one turn (startTurn) whose
 * output is normalized to the common AgentEvent stream. The session manager talks only to
 * this interface, so adding an agent is adding a file under drivers/ and one registry
 * line — no change to sessions, routes or the SSE contract.
 *
 * All drivers spawn with a CONSTRUCTED environment (SessionStartOptions.env): the daemon
 * decides exactly which keys a coding agent may see. Spreading process.env would hand the
 * agent the daemon's SERVICE_TOKEN and every provider key — the whole point of the
 * per-driver env allowlist is to prevent that.
 */

export type DriverId = 'claude_code' | 'opencode' | 'pi';

export interface DriverInfo {
  id: DriverId;
  binPath: string;
  version: string;
}

export interface DriverCapabilities {
  /** Native session continuation (a resume token threads turns into a conversation). */
  resume: boolean;
  /** Can attach a Streamable-HTTP MCP server (the publication API /mcp endpoint). */
  mcpHttp: boolean;
  /** Emits structured file-change events (else the daemon derives them from git status). */
  reportsFileChanges: boolean;
}

/** The normalized event stream every driver's output is mapped onto. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; summary: string }
  | { type: 'file_change'; files: string[] }
  | { type: 'result'; ok: true; resumeToken?: string; costUsd?: number; durationMs: number }
  | { type: 'error'; message: string; retriable: boolean };

export interface McpAttachment {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

export interface SessionStartOptions {
  /** Absolute site workspace directory = the child's cwd. */
  workspace: string;
  prompt: string;
  /** Driver-native session id from a prior turn, to continue the conversation. */
  resumeToken?: string;
  mcp: McpAttachment;
  /** The child's COMPLETE environment — an explicit allowlist, never process.env. */
  env: Record<string, string>;
  timeoutMs: number;
}

export interface AgentProcess {
  readonly pid: number;
  /** Normalized events; the driver parses its native stdout into these. */
  events: AsyncIterable<AgentEvent>;
  /** SIGINT, then SIGKILL after a grace period. */
  interrupt(): Promise<void>;
}

export interface AgentDriver {
  readonly id: DriverId;
  readonly capabilities: DriverCapabilities;
  /** Returns null when the binary is absent or its version is outside the tested range. */
  detect(): Promise<DriverInfo | null>;
  startTurn(opts: SessionStartOptions): AgentProcess;
}
