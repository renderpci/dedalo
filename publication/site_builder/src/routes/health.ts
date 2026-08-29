/**
 * GET /health — liveness, a driver-availability summary, and the PAIRING FINGERPRINT. The
 * one unauthenticated route: the engine's ops widget and any watchdog need to reach it
 * without the bearer token.
 *
 * It discloses no site data and no config secret. `instance_fingerprint` is the one field
 * that says anything about WHO this daemon is, and it says it in a form only a caller who
 * already holds the same instance name and the same SERVICE_TOKEN can read — see
 * src/security/pairing.ts for what it proves and why it is safe here. The instance NAME is
 * deliberately not in this body: a paired engine does not need to be told it, and an
 * unpaired caller must not be handed it.
 */

import { json } from '../util/response';
import { detectDrivers } from '../drivers/registry';
import { config } from '../config';
import { instanceFingerprint } from '../security/pairing';

export async function handleHealth(): Promise<Response> {
  const drivers = await detectDrivers();
  return json({
    status: 'ok',
    service: 'dedalo-site-builder',
    drivers,
    // The engine recomputes this from its own DEDALO_SITE_BUILDER_INSTANCE +
    // DEDALO_SITE_BUILDER_TOKEN and REFUSES to send anything if it differs, so a
    // copy-pasted env file that points one museum's engine at another museum's daemon
    // fails at the door instead of publishing into the wrong site tree.
    instance_fingerprint: instanceFingerprint(config.DEDALO_SITE_INSTANCE, config.SERVICE_TOKEN),
  });
}
