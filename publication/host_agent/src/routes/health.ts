/**
 * GET /health — liveness and the PAIRING FINGERPRINT. The one unauthenticated route.
 *
 * Shape copied from publication/site_builder/src/routes/health.ts, minus its driver probe.
 * The body names neither the instance nor the token: `instance_fingerprint` is readable
 * only by a caller that already holds both (src/security/pairing.ts). No version either —
 * that is `GET /v1/status`, behind the bearer.
 */

import { config } from '../config';
import { instanceFingerprint } from '../security/pairing';
import { json } from '../util/response';

export const SERVICE_NAME = 'dedalo-publication-host-agent';

export function handleHealth(): Response {
  return json({
    status: 'ok',
    service: SERVICE_NAME,
    instance_fingerprint: instanceFingerprint(config.INSTANCE, config.SERVICE_TOKEN),
  });
}
