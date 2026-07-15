/**
 * GET /health — liveness plus a driver-availability summary. The one unauthenticated
 * route: the engine's ops widget and any watchdog need to reach it without the bearer
 * token, and it discloses nothing sensitive (no site data, no config secrets).
 */

import { json } from '../util/response';
import { detectDrivers } from '../drivers/registry';

export async function handleHealth(): Promise<Response> {
  const drivers = await detectDrivers();
  return json({
    status: 'ok',
    service: 'dedalo-site-builder',
    drivers,
  });
}
