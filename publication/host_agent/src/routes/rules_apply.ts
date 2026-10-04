/**
 * POST /v1/rules/apply — `rules.apply {server, text, hash}` (spec §6).
 *
 * The actor rides the `X-Dedalo-Actor` header (src/security/auth.ts requireActor), like
 * every mutating route. The handler checks the BODY SHAPE only (a capped read, UTF-8 JSON,
 * the three field types). Every rule about the include itself (server, size, NUL, stamp,
 * directive allowlist, the transaction) lives in src/rules/apply.ts, which audits each
 * outcome. The bearer is checked by the router before this runs.
 */

import { ValidationError } from '../errors';
import { applyRules } from '../rules/apply';
import { requireActor } from '../security/auth';
import { json } from '../util/response';

/** A 256 KiB include JSON-escapes to at most a few times its size; 1 MiB bounds the read. */
const MAX_BODY_BYTES = 1024 * 1024;

export async function handleRulesApply(req: Request, _url: URL): Promise<Response> {
  const actor = requireActor(req);
  const body = await readJsonObject(req);
  const { server, text, hash } = body;
  if (server !== 'apache' && server !== 'nginx') {
    throw new ValidationError('server must be "apache" or "nginx"', 'body_invalid');
  }
  if (typeof text !== 'string') throw new ValidationError('text must be a string', 'body_invalid');
  if (typeof hash !== 'string') throw new ValidationError('hash must be a string', 'body_invalid');
  return json(await applyRules({ server, text, hash, actor }));
}

async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const raw = await readCapped(req, MAX_BODY_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw new ValidationError('request body must be valid UTF-8 JSON', 'body_invalid');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('request body must be a JSON object', 'body_invalid');
  }
  return parsed as Record<string, unknown>;
}

/** Reads the body and stops at `cap` bytes, so an oversize body is never buffered whole. */
async function readCapped(req: Request, cap: number): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new ValidationError(`request body exceeds ${cap} bytes`, 'body_invalid');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
