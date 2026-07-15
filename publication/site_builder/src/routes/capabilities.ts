/**
 * GET /v1/capabilities — what this daemon can do right now: which drivers are usable,
 * which templates are available, and the operative limits. The engine calls this to
 * render the create-site form honestly (only offer drivers that will actually work).
 */

import { json } from '../util/response';
import { config } from '../config';
import { detectDrivers } from '../drivers/registry';
import { listTemplates } from '../sites/template';

export async function handleCapabilities(): Promise<Response> {
  const [drivers, templates] = await Promise.all([detectDrivers(), listTemplates()]);
  return json({
    drivers,
    default_driver: config.AGENT_DRIVER,
    templates,
    limits: {
      max_sites: config.MAX_SITES,
      max_concurrent_sessions: config.MAX_CONCURRENT_SESSIONS,
      site_disk_quota_mb: config.SITE_DISK_QUOTA_MB,
    },
  });
}
