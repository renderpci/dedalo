/**
 * POST /v1/releases/{v1|v2} and POST /v1/releases/{v1|v2}/rollback.
 *
 * Install takes the bundle as the raw request body (application/gzip) and its metadata as
 * headers: X-Release-Id, X-Bundle-Sha256, and the X-Dedalo-Actor (requireActor — the one
 * actor convention on every mutation). Rollback takes the actor header and no body. No route
 * takes a path; the api is fixed per row in router.ts ROUTES, so an unknown api is the
 * router's 404. Validation of the id and sha lives in installRelease (one rule for every caller).
 */

import { ValidationError } from '../errors';
import { installRelease, rollbackRelease } from '../releases/install';
import type { ApiName } from '../releases/ustar';
import { requireActor } from '../security/auth';
import { json } from '../util/response';

const BUNDLE_CONTENT_TYPES = new Set(['application/gzip', 'application/octet-stream']);

export function releaseInstallRoute(api: ApiName) {
  return async (req: Request): Promise<Response> => {
    const actor = requireActor(req);
    const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!BUNDLE_CONTENT_TYPES.has(contentType)) {
      throw new ValidationError('the release bundle must be sent as application/gzip (or application/octet-stream)', 'body_invalid');
    }
    if (req.body === null) {
      throw new ValidationError('the request body must carry the release bundle', 'body_invalid');
    }
    const result = await installRelease({
      api,
      releaseId: req.headers.get('x-release-id') ?? '',
      sha256: req.headers.get('x-bundle-sha256') ?? '',
      actor,
      body: req.body,
    });
    return json(result);
  };
}

export function releaseRollbackRoute(api: ApiName) {
  return async (req: Request): Promise<Response> => {
    const actor = requireActor(req);
    return json(await rollbackRelease(api, actor));
  };
}
