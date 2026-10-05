/**
 * GET /v1/media/probe — the media root's measured state (src/media/probe.ts). Read-only, takes
 * no input: the root is the configured MEDIA_ROOT, never a request parameter. A RouteHandler
 * (src/router.ts) that uses neither the request nor its URL.
 */

import { probeMedia } from '../media/probe';
import { json } from '../util/response';

export async function handleMediaProbe(): Promise<Response> {
  return json(await probeMedia());
}
