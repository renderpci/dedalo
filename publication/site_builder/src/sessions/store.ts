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
import { readdir } from 'node:fs/promises';
import { confinedPath } from '../util/paths';
import {
  appendFilePrivate,
  mkdirPrivate,
  readdirShared,
  readFilePrivate,
  relativeUnderRoot,
  writeFilePrivateAtomic,
} from '../util/shared_tree';
import { config } from '../config';
import type { SessionEventBody, StoredEvent, SessionMeta } from './events';

const nextSeqBySession = new Map<string, number>();

function sessionsDir(slug: string): string {
  return confinedPath(config.SITES_ROOT, slug, '.builder', 'sessions');
}

/**
 * THE SAME PATH, RELATIVE TO `SITES_ROOT` — which is what the FD-BASED WRITERS take.
 *
 * Every write below used to be a path-based `mkdir`/`appendFile`/`writeFile`+`rename` on a
 * `confinedPath`, and `confinedPath` is LEXICAL: it proves a spelling and knows nothing
 * about the inode. `.builder/` sits inside a workspace the agent can write, so a turn that
 * replaced it with a link had this daemon write the session transcript — its own prompts,
 * the turn's output — wherever the link pointed, as the daemon's uid. The writers in
 * `util/shared_tree.ts` take a TRUSTED ROOT and walk everything under it `O_NOFOLLOW`, so
 * the same plant is a refusal instead. The confinement of the caller-supplied session id is
 * unchanged and still happens first, on the absolute path.
 */
function underSitesRoot(absolute: string): string {
  return relativeUnderRoot(config.SITES_ROOT, absolute);
}

/*
 * AND THE READS GO THE SAME WAY, which the first repair did not do.
 *
 * A transcript is READ back on every SSE reconnect and a meta sidecar on every message. Both
 * were `readFile(confinedPath(...))`, so the same replaced `.builder/` that the writers now
 * refuse would have had this daemon open a planted `<id>.jsonl -> <the instance .env>` as
 * ITSELF and hand it to the museum's user as session history. `readFilePrivate` /
 * `readdirShared` walk the chain `O_NOFOLLOW` and additionally refuse an inode this daemon
 * does not own, because a session transcript it replays as its own record of a turn must be
 * one it wrote.
 */

/**
 * A SESSION ID IS CALLER DATA TOO, SO ITS PATH IS CONFINED LIKE THE SLUG'S.
 *
 * `sessionsDir` confines the slug; joining the id onto the result undid that, exactly as
 * it did for the build id (`build/builder.ts`). The router decodes each URL segment, so an
 * id spelling a traversal chain would resolve outside the sessions directory. The law is
 * `confinedPath`, never `join` — and it covers the LAST segment.
 *
 * Both throw on an escaping id: a writer must never write outside. The two READ doors
 * translate the throw into the same answer an unknown id already gets.
 */
function logPath(slug: string, sessionId: string): string {
  return confinedPath(sessionsDir(slug), `${sessionId}.jsonl`);
}

function metaPath(slug: string, sessionId: string): string {
  return confinedPath(sessionsDir(slug), `${sessionId}.meta.json`);
}

/** The confined path for a caller-supplied session id, or null when the id escapes. */
function pathForCallerId(build: () => string): string | null {
  try {
    return build();
  } catch {
    return null;
  }
}

async function ensureDir(slug: string): Promise<void> {
  // 0700 at every level it creates: the sessions log is the daemon's, inside the daemon's
  // `.builder/`, in a tree the agent may otherwise write.
  await mkdirPrivate(config.SITES_ROOT, underSitesRoot(sessionsDir(slug)));
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
  const text = await readFilePrivate(config.SITES_ROOT, underSitesRoot(logPath(slug, sessionId)));
  if (text !== null) {
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
  await appendFilePrivate(
    config.SITES_ROOT,
    underSitesRoot(logPath(slug, sessionId)),
    JSON.stringify(event) + '\n',
  );
  return event;
}

/** Replays events with seq strictly greater than `afterSeq`. */
export async function replayEvents(slug: string, sessionId: string, afterSeq: number): Promise<StoredEvent[]> {
  const path = pathForCallerId(() => logPath(slug, sessionId));
  if (path === null) return [];
  const text = await readFilePrivate(config.SITES_ROOT, underSitesRoot(path));
  if (text === null) return [];
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
  const path = pathForCallerId(() => metaPath(slug, sessionId));
  if (path === null) return null;
  const text = await readFilePrivate(config.SITES_ROOT, underSitesRoot(path));
  if (text === null) return null;
  try {
    return JSON.parse(text) as SessionMeta;
  } catch {
    return null;
  }
}

/**
 * The meta sidecar, written 0600 ATOMICALLY through the FD-based writer.
 *
 * The tmp sibling is kept — what had to change is not that there IS one but that it was
 * created by PATH. A tmp in a directory the agent can replace is the `site.json.tmp` plant;
 * a tmp written through `writeFilePrivateAtomic` is opened `O_NOFOLLOW`, refused if it has a
 * second name or another owner, and then `rename`d — this daemon's own inode carried over
 * the target. And the atomicity is load-bearing here: `readMeta` runs on every message and a
 * torn read is "no session", while a death inside the window would leave a 'running' session
 * that `sweepOnBoot` can never mark interrupted.
 */
export async function writeMeta(meta: SessionMeta): Promise<void> {
  await ensureDir(meta.slug);
  await writeFilePrivateAtomic(
    config.SITES_ROOT,
    underSitesRoot(metaPath(meta.slug, meta.session_id)),
    JSON.stringify(meta, null, 2) + '\n',
  );
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  turns: number;
  state: SessionMeta['state'];
}

/** The session index for a site (newest first), for the history UI. */
export async function listSessions(slug: string): Promise<SessionSummary[]> {
  const names = await readdirShared(config.SITES_ROOT, underSitesRoot(sessionsDir(slug)));
  if (names === null) return [];
  const files = names.filter(f => f.endsWith('.meta.json'));
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
    const names = await readdirShared(config.SITES_ROOT, underSitesRoot(sessionsDir(slug)));
    if (names === null) continue;
    for (const file of names) {
      if (file.endsWith('.meta.json')) {
        out.push({ slug, sessionId: file.slice(0, -'.meta.json'.length) });
      }
    }
  }
  return out;
}
