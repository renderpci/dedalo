/**
 * The audit trail — an append-only NDJSON log of every mutation, plus a journald echo.
 *
 * The daemon trusts the engine's authorization decisions (security/auth.ts), so the
 * audit log is the record of WHO did WHAT: it is the only place a "user X published site
 * Y" fact is durably kept. One JSON object per line under
 * SITES_ROOT/.audit/audit.jsonl; the file is created on first write. Reads (the
 * GET /v1/audit endpoint) tail this file — see routes/audit in P4.
 *
 * Append-only is enforced by convention here (we only ever open with append), not by the
 * filesystem; the ops guidance is to keep the .audit directory owned such that the
 * daemon can append but not truncate.
 */

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config';
import type { Actor } from './security/auth';

export interface AuditEntry {
  /** ISO timestamp, stamped at write time. */
  ts: string;
  actor: Actor;
  /** A stable verb: 'create_site', 'delete_site', 'session_start', 'build', 'publish', … */
  action: string;
  /** The site slug this concerns, or null for instance-level actions. */
  site: string | null;
  /** Free-form structured detail (build id, release, note, …). */
  detail?: Record<string, unknown>;
}

function auditPath(): string {
  return join(config.SITES_ROOT, '.audit', 'audit.jsonl');
}

// Recursive mkdir is idempotent and cheap; do it every write rather than caching "exists",
// so the log survives its directory being (re)created underneath the process.
async function ensureAuditDir(): Promise<void> {
  await mkdir(join(config.SITES_ROOT, '.audit'), { recursive: true });
}

/**
 * Records one mutation. Never throws into the request path: an audit write that fails
 * (disk full, permissions) is logged loudly but must not turn a successful publish into
 * a 500 — losing the audit line is bad, silently failing the user's action after the
 * effect already happened is worse. The loud console line is the tripwire.
 */
export async function audit(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
  const line: AuditEntry = { ts: new Date().toISOString(), ...entry };
  const serialized = JSON.stringify(line);
  // journald echo (systemd captures stdout) — one grep-able line regardless of the file.
  console.log(`[audit] ${serialized}`);
  try {
    await ensureAuditDir();
    await appendFile(auditPath(), serialized + '\n', 'utf8');
  } catch (error) {
    console.error('[audit] FAILED to persist audit line — investigate:', error);
  }
}

/**
 * Reads the tail of the audit log, newest first. Optionally filtered to one site. The
 * whole file is read and the last `limit` matching lines returned — fine at this service's
 * scale (an audit line per mutation, tens of sites); a rotating reader is a later concern.
 */
export async function readAudit(options: { site?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const path = auditPath();
  if (!existsSync(path)) return [];
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
  const text = await readFile(path, 'utf8');
  const entries: AuditEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as AuditEntry;
      if (options.site && entry.site !== options.site) continue;
      entries.push(entry);
    } catch {
      // skip a corrupt line
    }
  }
  return entries.reverse().slice(0, limit);
}
