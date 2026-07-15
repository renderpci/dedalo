/**
 * The durable session log — JSONL events plus a metadata sidecar, per session, under a
 * site's .builder/sessions/ directory.
 *
 * Responsibilities kept here (the manager owns orchestration, this owns persistence):
 *   - append a StoredEvent, allocating its seq (the file is the source of truth for seq;
 *     an in-memory per-session counter caches the next value and is seeded by counting
 *     lines on first touch, so a restart resumes numbering correctly)
 *   - replay events with seq > cursor (the SSE backlog)
 *   - read/write the session meta sidecar (resume token, state, turn count)
 *   - list a site's sessions (the history index)
 *
 * Events are appended before they are fanned to live SSE subscribers (manager.ts), so the
 * log is authoritative: a subscriber can always reconcile against it by seq.
 */

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import type { SessionEventBody, StoredEvent, SessionMeta } from './events';

const nextSeqBySession = new Map<string, number>();

function sessionsDir(slug: string): string {
  return confinedPath(config.SITES_ROOT, slug, '.builder', 'sessions');
}

function logPath(slug: string, sessionId: string): string {
  return join(sessionsDir(slug), `${sessionId}.jsonl`);
}

function metaPath(slug: string, sessionId: string): string {
  return join(sessionsDir(slug), `${sessionId}.meta.json`);
}

async function ensureDir(slug: string): Promise<void> {
  await mkdir(sessionsDir(slug), { recursive: true });
}

/** Seeds the seq counter from the file on first use, then serves it from memory. */
async function nextSeq(slug: string, sessionId: string): Promise<number> {
  const key = `${slug}/${sessionId}`;
  const cached = nextSeqBySession.get(key);
  if (cached !== undefined) {
    nextSeqBySession.set(key, cached + 1);
    return cached;
  }
  let max = -1;
  const path = logPath(slug, sessionId);
  if (existsSync(path)) {
    const text = await readFile(path, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const seq = (JSON.parse(line) as StoredEvent).seq;
        if (typeof seq === 'number' && seq > max) max = seq;
      } catch {
        // skip a corrupt line rather than fail replay
      }
    }
  }
  const start = max + 1;
  nextSeqBySession.set(key, start + 1);
  return start;
}

/** Appends one event, allocating and returning its seq. */
export async function appendEvent(
  slug: string,
  sessionId: string,
  body: SessionEventBody,
): Promise<StoredEvent> {
  await ensureDir(slug);
  const seq = await nextSeq(slug, sessionId);
  const event: StoredEvent = { seq, ts: new Date().toISOString(), body };
  await appendFile(logPath(slug, sessionId), JSON.stringify(event) + '\n', 'utf8');
  return event;
}

/** Replays events with seq strictly greater than `afterSeq`. */
export async function replayEvents(slug: string, sessionId: string, afterSeq: number): Promise<StoredEvent[]> {
  const path = logPath(slug, sessionId);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: StoredEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as StoredEvent;
      if (event.seq > afterSeq) out.push(event);
    } catch {
      // skip corrupt line
    }
  }
  return out;
}

export async function readMeta(slug: string, sessionId: string): Promise<SessionMeta | null> {
  const path = metaPath(slug, sessionId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as SessionMeta;
  } catch {
    return null;
  }
}

/** Atomic meta write (tmp + rename). */
export async function writeMeta(meta: SessionMeta): Promise<void> {
  await ensureDir(meta.slug);
  const target = metaPath(meta.slug, meta.session_id);
  const tmp = target + '.tmp';
  await writeFile(tmp, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  await rename(tmp, target);
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  turns: number;
  state: SessionMeta['state'];
}

/** The session index for a site (newest first), for the history UI. */
export async function listSessions(slug: string): Promise<SessionSummary[]> {
  const dir = sessionsDir(slug);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter(f => f.endsWith('.meta.json'));
  const summaries: SessionSummary[] = [];
  for (const file of files) {
    const sessionId = file.slice(0, -'.meta.json'.length);
    const meta = await readMeta(slug, sessionId);
    if (meta) {
      summaries.push({
        session_id: meta.session_id,
        started_at: meta.started_at,
        turns: meta.turns,
        state: meta.state,
      });
    }
  }
  return summaries.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Lists all session ids across all sites (boot sweep needs this). */
export async function allSessionMetaFiles(): Promise<Array<{ slug: string; sessionId: string }>> {
  const out: Array<{ slug: string; sessionId: string }> = [];
  if (!existsSync(config.SITES_ROOT)) return out;
  const slugs = (await readdir(config.SITES_ROOT, { withFileTypes: true }))
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name);
  for (const slug of slugs) {
    const dir = sessionsDir(slug);
    if (!existsSync(dir)) continue;
    for (const file of await readdir(dir)) {
      if (file.endsWith('.meta.json')) {
        out.push({ slug, sessionId: file.slice(0, -'.meta.json'.length) });
      }
    }
  }
  return out;
}
