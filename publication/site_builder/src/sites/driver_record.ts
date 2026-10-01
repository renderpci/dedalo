/**
 * WHICH AGENT DRIVER A SITE'S SESSIONS RUN — the DAEMON's record, never the agent's.
 *
 * It used to be read from `site.json`, which is SHARED (0660, the instance group): the agent
 * may rewrite it, and the schema — not the owner — is all that file trusts (`manifest.ts`).
 * A Claude Code turn's Write tool (or a build's `postinstall`) could therefore set
 * `"driver":"opencode"` and plant `.opencode/plugin/x.js`; the next session started without an
 * explicit driver ran opencode, which auto-loads project plugins — arbitrary code in the TURN
 * unit, with its provider key and the MCP gate, around every PLANT closure the Claude Code
 * driver states (`drivers/claude_code.ts`).
 *
 * So the choice made at `createSite` is ALSO written here, under `.builder/` through the
 * private writer (0600, the daemon's own inode), and read back only through the
 * `requireOwn` reader: a link, a second name, or a file the agent authored in its place is
 * REFUSED (thrown), never read. An ABSENT record — a site created before this record existed,
 * or one whose `.builder/driver.json` the agent unlinked — falls back to the instance default
 * (`AGENT_DRIVER`, root's configuration), never to `site.json`.
 *
 * `site.json`'s `driver` stays as the display copy; nothing decides anything from it.
 */

import { join } from 'node:path';
import { config } from '../config';
import type { DriverId } from '../drivers/types';
import { DRIVER_IDS } from '../provision/layout';
import { readFilePrivate, writeFilePrivate } from '../util/shared_tree';

const recordPath = (slug: string) => join(slug, '.builder', 'driver.json');

/** Record the site's driver (at create). `.builder/` must exist (`mkdirPrivate`). */
export async function writeSiteDriver(slug: string, driver: DriverId): Promise<void> {
  await writeFilePrivate(config.SITES_ROOT, recordPath(slug), `${JSON.stringify({ driver })}\n`);
}

/** The driver a session of `slug` runs when the request names none. */
export async function readSiteDriver(slug: string): Promise<DriverId> {
  const raw = await readFilePrivate(config.SITES_ROOT, recordPath(slug));
  if (raw === null) return config.AGENT_DRIVER;
  let driver: unknown;
  try {
    driver = (JSON.parse(raw) as { driver?: unknown }).driver;
  } catch {
    driver = undefined;
  }
  if (typeof driver !== 'string' || !(DRIVER_IDS as readonly string[]).includes(driver)) {
    throw new Error(`site '${slug}': the daemon's driver record (.builder/driver.json) is unreadable; refusing to guess a driver.`);
  }
  return driver as DriverId;
}
