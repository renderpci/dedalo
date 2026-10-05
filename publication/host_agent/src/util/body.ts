/**
 * Capped request-body reads — moved from src/routes/rules_apply.ts when the copy-mode media
 * routes (src/routes/media.ts) became the second JSON-body caller. One reader, so
 * the cap and the UTF-8 / JSON-object rules cannot drift between routes. Every refusal is a
 * 400 `body_invalid`; an oversize body is never buffered whole.
 */

import { ValidationError } from '../errors';

export async function readJsonObject(req: Request, cap: number): Promise<Record<string, unknown>> {
  const raw = await readCapped(req, cap);
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
export async function readCapped(req: Request, cap: number): Promise<Uint8Array> {
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
