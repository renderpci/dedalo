/**
 * Session routes — start a turn, list sessions, stream events (SSE), send a follow-up,
 * stop.
 *
 * Every mutating route validates its actor and writes an audit line; the stream and list
 * routes are reads. The SSE route is the one handler that returns a streaming Response
 * rather than JSON (sessions/sse.ts).
 */

import { json } from '../util/response';
import { requireActor } from '../security/auth';
import { NotFoundError, ValidationError } from '../errors';
import { audit } from '../audit';
import { siteExists } from '../sites/workspace';
import { listSessions, readMeta } from '../sessions/store';
import { startSession, sendMessage, stopSession, slugForSession } from '../sessions/manager';
import { sessionEventStream } from '../sessions/sse';

export async function handleStartSession(req: Request, params: Record<string, string>): Promise<Response> {
  const slug = params.slug;
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);
  const prompt = String(body.prompt ?? '');
  const driver = normalizeDriver(body.driver);

  const result = await startSession(slug, prompt, driver);
  await audit({ actor, action: 'session_start', site: slug, detail: { session_id: result.session_id } });
  return json(result, 201);
}

export async function handleListSessions(_req: Request, params: Record<string, string>): Promise<Response> {
  const slug = params.slug;
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  return json({ data: await listSessions(slug) });
}

export async function handleSessionEvents(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const sessionId = params.id;
  const slug = await slugForSession(sessionId);
  if (!slug) throw new NotFoundError(`No session '${sessionId}'`);
  const afterRaw = url.searchParams.get('after');
  const after = afterRaw !== null ? Number(afterRaw) : -1;
  if (!Number.isFinite(after)) throw new ValidationError('after must be a number');
  return sessionEventStream(slug, sessionId, after);
}

export async function handleSessionMessage(req: Request, params: Record<string, string>): Promise<Response> {
  const sessionId = params.id;
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);
  const message = String(body.message ?? '');

  await sendMessage(sessionId, message);
  const slug = await slugForSession(sessionId);
  await audit({ actor, action: 'session_message', site: slug, detail: { session_id: sessionId } });
  return json({ session_id: sessionId, accepted: true });
}

export async function handleSessionStop(req: Request, params: Record<string, string>): Promise<Response> {
  const sessionId = params.id;
  const body = (await readJson(req)) as Record<string, unknown>;
  const actor = requireActor(body);

  await stopSession(sessionId);
  const slug = await slugForSession(sessionId);
  await audit({ actor, action: 'session_stop', site: slug, detail: { session_id: sessionId } });
  return json({ session_id: sessionId, stopped: true });
}

// --- helpers ---

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

function normalizeDriver(value: unknown): 'claude_code' | 'opencode' | 'pi' | undefined {
  if (value === 'claude_code' || value === 'opencode' || value === 'pi') return value;
  return undefined;
}

// readMeta re-export kept close so future handlers can surface a single session's meta.
export { readMeta };
