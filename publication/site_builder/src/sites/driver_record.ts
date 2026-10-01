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
 * WHERE IT LIVES — and why not `.builder/`, where it was first put. `<slug>/.builder/driver.json`
 * was the daemon's own 0600 inode, but INSIDE the workspace: 2770 with no sticky bit, and the
 * `ReadWritePaths=` of every build and git unit. A same-parent rename needs no write permission
 * on the renamed directory itself, so a build's `postinstall` (or a git hook) could
 * `mv .builder .x`; the record then read ENOENT, the session fell back to `AGENT_DRIVER`, and on
 * an opencode-default instance a claude_code site ran opencode — loading the plugin the same run
 * planted. So the record is `<SITES_ROOT>/.driver_records/<slug>.json`: `SITES_ROOT` itself is
 * READ-ONLY in every agent unit (`ProtectSystem=strict`; only `<SITES_ROOT>/<slug>` is writable),
 * the directory is the daemon's 0700 and the file its 0600 inode, written and read through the
 * `shared_tree` doors (`O_NOFOLLOW` chain, own-inode reader). No run can rename, replace or
 * unlink it. (The slug grammar has no dot, and `listSlugs` / the session sweep skip dot-names.)
 *
 * AN ABSENT RECORD IS REFUSED, never defaulted (503, `ConfinementUnavailableError`): a fallback
 * to the instance default silently changed the driver of every site whose record was missing.
 * A site from before the record has none, so the daemon's BOOT seeds it, once
 * (`seedDriverRecords`, from `sessions/manager.ts sweepOnBoot`, after the reconcile proved the
 * site's runs dead): from the daemon's own `.builder/driver.json` if it is there (the first
 * record's place), else from `site.json` — the authority such a site HAD, so a legacy site keeps
 * its driver instead of silently switching. `createSite` writes the record BEFORE `site.json`,
 * so a site that exists has one; from then on `site.json`'s `driver` is the display copy and
 * decides nothing.
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import type { DriverId } from '../drivers/types';
import { ConfinementUnavailableError } from '../errors';
import { DRIVER_IDS } from '../provision/layout';
import { confinedPath } from '../util/paths';
import { readFilePrivate, writeFilePrivateAtomic, mkdirPrivate } from '../util/shared_tree';
import { isValidSlug } from '../util/slug';
import { readManifest } from './manifest';

/** The daemon's records directory, directly under `SITES_ROOT` (read-only to every run). */
export const DRIVER_RECORDS_DIR = '.driver_records';

function recordPath(slug: string): string {
  if (!isValidSlug(slug)) throw new Error(`driver_record: '${slug}' is not a site slug.`);
  return join(DRIVER_RECORDS_DIR, `${slug}.json`);
}

/** Where the first record lived (inside the workspace) — read only to seed a site that has none. */
const workspaceRecordPath = (slug: string) => join(slug, '.builder', 'driver.json');

function parseDriver(raw: string): DriverId | null {
  let driver: unknown;
  try {
    driver = (JSON.parse(raw) as { driver?: unknown }).driver;
  } catch {
    return null;
  }
  return typeof driver === 'string' && (DRIVER_IDS as readonly string[]).includes(driver) ? (driver as DriverId) : null;
}

/** Record the site's driver (at create, BEFORE its site.json exists). */
export async function writeSiteDriver(slug: string, driver: DriverId): Promise<void> {
  const path = recordPath(slug);
  await mkdirPrivate(config.SITES_ROOT, DRIVER_RECORDS_DIR);
  await writeFilePrivateAtomic(config.SITES_ROOT, path, `${JSON.stringify({ driver })}\n`);
}

/** Forget the site's record (its delete, or a create rolled back). Absent is fine. */
export async function removeSiteDriver(slug: string): Promise<void> {
  // `rm` unlinks the final name and never follows it; the directory above is the daemon's,
  // under a root no run can write.
  await rm(confinedPath(config.SITES_ROOT, recordPath(slug)), { force: true });
}

/** The driver a session of `slug` runs when the request names none. Absent → REFUSED. */
export async function readSiteDriver(slug: string): Promise<DriverId> {
  const raw = await readFilePrivate(config.SITES_ROOT, recordPath(slug));
  if (raw === null) {
    throw new ConfinementUnavailableError(
      `site '${slug}' has no driver record (${DRIVER_RECORDS_DIR}/${slug}.json under SITES_ROOT), ` +
        `so which agent may run on it is unknown; refusing rather than falling back to the ` +
        `instance default. A site from before the record is seeded at the daemon's boot — ` +
        `restart it — or start the session naming its driver.`,
    );
  }
  const driver = parseDriver(raw);
  if (driver === null) {
    throw new ConfinementUnavailableError(
      `site '${slug}': the daemon's driver record (${DRIVER_RECORDS_DIR}/${slug}.json) is unreadable; refusing to guess a driver ` +
        `(the boot names it; an operator restores or removes it).`,
    );
  }
  return driver;
}

/** A site the boot could not give a usable record, and why — said, and returned to the caller. */
export interface SeedRefusal {
  slug: string;
  reason: string;
}

/**
 * SEED the record of every site that has none — at boot, never per request. One site's failure
 * (a planted `.builder/driver.json`, an unreadable `site.json`) is said and skipped: that site then
 * refuses every driver-less session until an operator acts, which is the fail-closed answer; the
 * others are seeded.
 *
 * A record that is PRESENT BUT UNREADABLE (empty — what a power cut leaves of a new inode renamed
 * into place before its bytes reached the disk, the writers now sync but older records were not —
 * unparseable, or naming no known driver) is NOT absent and is NOT re-seeded: the only source a
 * seed could fall back to for a site that already had a record is `site.json`, which the agent
 * can rewrite, so re-seeding from it would hand the driver choice to the run the record exists
 * to exclude. It is REFUSED BY NAME here, so the operator learns it at boot instead of through a
 * 503 per session, and it is left exactly as it is (the evidence).
 */
export async function seedDriverRecords(slugs: readonly string[]): Promise<{ seeded: string[]; refused: SeedRefusal[] }> {
  const seeded: string[] = [];
  const refused: SeedRefusal[] = [];
  for (const slug of slugs) {
    try {
      const present = await readFilePrivate(config.SITES_ROOT, recordPath(slug));
      if (present !== null) {
        if (parseDriver(present) !== null) continue;
        const reason =
          `its driver record (${DRIVER_RECORDS_DIR}/${slug}.json under SITES_ROOT, ${Buffer.byteLength(present)} bytes) ` +
          `is present but unreadable${present.length === 0 ? ' (empty: a write a power cut tore)' : ''}; it is NOT ` +
          `re-seeded (site.json is agent-writable) and its driver-less sessions are refused. ` +
          `An operator restores it ({"driver":"<id>"}) or removes it to re-seed it from the site's own records.`;
        refused.push({ slug, reason });
        console.error(`[boot] driver record of '${slug}': ${reason}`);
        continue;
      }
      // The daemon's OWN first record, if it is still where it was put (an agent-authored or
      // linked one is thrown by the own-inode reader, never read).
      const own = await readFilePrivate(config.SITES_ROOT, workspaceRecordPath(slug));
      let driver: DriverId | null;
      if (own !== null) {
        driver = parseDriver(own);
        if (driver === null) throw new Error(`its .builder/driver.json is unreadable`);
      } else {
        driver = (await readManifest(slug)).driver;
      }
      await writeSiteDriver(slug, driver);
      seeded.push(slug);
    } catch (error) {
      refused.push({ slug, reason: error instanceof Error ? error.message : String(error) });
      console.error(
        `[boot] the driver record of '${slug}' could not be seeded; its driver-less sessions are refused until it is:`,
        error,
      );
    }
  }
  return { seeded, refused };
}
