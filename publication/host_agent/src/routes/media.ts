/**
 * The copy-mode media routes (spec §6): PUT /v1/media/file, POST /v1/media/delete,
 * POST /v1/media/mark, GET /v1/media/manifest. Each is a FACTORY over a CopyTarget (the
 * configured one in router.ts ROUTES; a scratch copy target in tests, because the suite's
 * own agent is MEDIA_MODE=shared). Order in every handler: media mode (409) → actor
 * (mutations, 400) → body/headers → the command (src/media/copy.ts), which owns every rule.
 *
 * PUT carries its path in the QUERY (`?path=`) and its metadata in headers (X-Sha256,
 * X-Size, X-Dedalo-Actor), because the body is the raw file stream. The path is the only
 * free value any agent route takes; src/media/grammar.ts + copy.ts confine it under
 * MEDIA_ROOT.
 */

import {
  type CopyTarget,
  MANIFEST_DEFAULT_LIMIT,
  configuredCopyTarget,
  deleteMediaFiles,
  markKey,
  mediaManifest,
  putMediaFile,
  requireCopyRoot,
} from '../media/copy';
import { requireActor } from '../security/auth';
import { readJsonObject } from '../util/body';
import { json } from '../util/response';

/** 1000 paths of at most 1024 bytes, JSON-escaped, fit with room. */
export const MAX_DELETE_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_MARK_BODY_BYTES = 4096;

const DECIMAL = /^[0-9]{1,16}$/;

/** A plain decimal, or NaN (which the command refuses as 400 body_invalid). */
function decimal(value: string | null): number {
  return value !== null && DECIMAL.test(value) ? Number(value) : Number.NaN;
}

export function mediaPutRoute(target: CopyTarget = configuredCopyTarget()) {
  return async (req: Request, url: URL): Promise<Response> => {
    requireCopyRoot(target);
    const actor = requireActor(req);
    return json(
      await putMediaFile(target, {
        path: url.searchParams.get('path') ?? '',
        sha256: req.headers.get('x-sha256') ?? '',
        size: decimal(req.headers.get('x-size')),
        actor,
        body: req.body,
      }),
    );
  };
}

export function mediaDeleteRoute(target: CopyTarget = configuredCopyTarget()) {
  return async (req: Request): Promise<Response> => {
    requireCopyRoot(target);
    const actor = requireActor(req);
    const body = await readJsonObject(req, MAX_DELETE_BODY_BYTES);
    return json(await deleteMediaFiles(target, body.paths, actor));
  };
}

export function mediaMarkRoute(target: CopyTarget = configuredCopyTarget()) {
  return async (req: Request): Promise<Response> => {
    requireCopyRoot(target);
    const actor = requireActor(req);
    const body = await readJsonObject(req, MAX_MARK_BODY_BYTES);
    return json(await markKey(target, body.key, body.published, actor));
  };
}

export function mediaManifestRoute(target: CopyTarget = configuredCopyTarget()) {
  return async (_req: Request, url: URL): Promise<Response> => {
    requireCopyRoot(target);
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? MANIFEST_DEFAULT_LIMIT : decimal(rawLimit);
    return json(await mediaManifest(target, url.searchParams.get('cursor'), limit));
  };
}
