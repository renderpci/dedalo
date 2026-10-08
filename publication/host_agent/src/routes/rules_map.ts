/**
 * POST /v1/rules/map — `rules.map {text, hash}` (spec §13.4): this instance's contribution
 * to the host-wide nginx media map.
 *
 * Same auth as rules.apply: the bearer (router), the actor in `X-Dedalo-Actor`. The handler
 * checks the BODY SHAPE only (a capped read, UTF-8 JSON, the two string fields). Every rule
 * about the map itself (server, NGINX_MAP_MODE, size, NUL, stamp, the map grammar, one
 * envelope, the contribution, root's renderer) lives in src/rules/map.ts, which audits each
 * outcome.
 */

import { ValidationError } from '../errors';
import { applyMap } from '../rules/map';
import { requireActor } from '../security/auth';
import { readJsonObject } from '../util/body';
import { json } from '../util/response';

/** A 64 KiB map JSON-escapes to a few times its size; 512 KiB bounds the read. */
const MAX_BODY_BYTES = 512 * 1024;

export async function handleRulesMap(req: Request, _url: URL): Promise<Response> {
  const actor = requireActor(req);
  const body = await readJsonObject(req, MAX_BODY_BYTES);
  const { text, hash } = body;
  if (typeof text !== 'string') throw new ValidationError('text must be a string', 'body_invalid');
  if (typeof hash !== 'string') throw new ValidationError('hash must be a string', 'body_invalid');
  return json(await applyMap({ text, hash, actor }));
}
