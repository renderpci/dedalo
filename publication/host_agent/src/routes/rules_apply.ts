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
import { readJsonObject } from '../util/body';
import { json } from '../util/response';

/** A 256 KiB include JSON-escapes to at most a few times its size; 1 MiB bounds the read. */
const MAX_BODY_BYTES = 1024 * 1024;

export async function handleRulesApply(req: Request, _url: URL): Promise<Response> {
  const actor = requireActor(req);
  const body = await readJsonObject(req, MAX_BODY_BYTES);
  const { server, text, hash } = body;
  if (server !== 'apache' && server !== 'nginx') {
    throw new ValidationError('server must be "apache" or "nginx"', 'body_invalid');
  }
  if (typeof text !== 'string') throw new ValidationError('text must be a string', 'body_invalid');
  if (typeof hash !== 'string') throw new ValidationError('hash must be a string', 'body_invalid');
  return json(await applyRules({ server, text, hash, actor }));
}
