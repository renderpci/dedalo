/**
 * THE DAEMON'S STATE SURVIVES A POWER CUT — and a record that did not is SAID, never re-guessed.
 *
 * `writeFilePrivateAtomic` / `writeFileSharedAtomic` (`src/util/shared_tree.ts`) wrote a tmp
 * sibling and renamed it over the target with no fsync of either the file or its directory.
 * `rename` is atomic against a PROCESS death, not against a power cut or a kernel crash: on
 * ext4/XFS with delayed allocation a NEW inode renamed into place and never synced comes back
 * zero-length. The driver record (`sites/driver_record.ts`) is a new inode written through that
 * door, and it is DELIBERATELY fail-closed: an empty one was read '' (not null), so the boot
 * seeder skipped it as "already seeded", and every driver-less session of the site was refused
 * 503 on every boot, with nothing said at boot. (Review of LEAD-1b, S2, three refuters.)
 *
 * The outcomes held here, through a page-cache model driven by the real calls
 * (`tests/support/power_cut_model.ts`):
 *   - what the atomic doors write — and the directories the private/shared doors create on the
 *     way — survives a power cut;
 *   - a present-but-unreadable driver record is REFUSED at boot, by name, and LEFT AS IT IS: it
 *     is never re-seeded from `site.json`, which the agent can rewrite (re-seeding a torn record
 *     from it would hand the driver choice back to the run the record exists to exclude).
 */

import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { join } from 'node:path';
import { DRIVER_RECORDS_DIR, seedDriverRecords, writeSiteDriver } from '../src/sites/driver_record';
import {
  mkdirPrivate,
  mkdirShared,
  mkdirSharedFresh,
  writeFilePrivate,
  writeFilePrivateAtomic,
  writeFileSharedAtomic,
} from '../src/util/shared_tree';
import { resetInstance, roots } from './fixtures/instance';
import { startPowerCutModel } from './support/power_cut_model';

beforeEach(resetInstance);
afterAll(resetInstance);

const recordOf = (slug: string) => join(roots.sitesRoot, DRIVER_RECORDS_DIR, `${slug}.json`);

describe('the power-cut model discriminates (control)', () => {
  test('write + rename with no sync does NOT survive; synced file + synced directory does', async () => {
    const root = roots.sitesRoot;
    const model = await startPowerCutModel(root);
    try {
      const bare = await fsp.open(join(root, 'bare.tmp'), 'w');
      await bare.writeFile('x');
      await bare.close();
      await fsp.rename(join(root, 'bare.tmp'), join(root, 'bare'));
      const synced = await fsp.open(join(root, 'synced.tmp'), 'w');
      await synced.writeFile('x');
      await synced.sync();
      await synced.close();
      await fsp.rename(join(root, 'synced.tmp'), join(root, 'synced'));
      // bytes durable, entry not yet: the rename is lost
      expect(model.survives(join(root, 'synced'))).toBe(false);
      const dir = await fsp.open(root, 'r');
      await dir.sync();
      await dir.close();
      expect({
        bare: model.survives(join(root, 'bare')),
        synced: model.survives(join(root, 'synced')),
        why: model.explain(join(root, 'bare')),
      }).toEqual({ bare: false, synced: true, why: expect.stringContaining('never synced') });
    } finally {
      model.restore();
    }
  });
});

describe('the atomic doors are power-cut durable', () => {
  test('a NEW driver record (fresh .driver_records directory) survives', async () => {
    const model = await startPowerCutModel(roots.sitesRoot);
    try {
      await writeSiteDriver('durable-new', 'claude_code');
      expect(model.explain(recordOf('durable-new'))).toBe('');
      expect(model.seen.renames).toBeGreaterThan(0);
    } finally {
      model.restore();
    }
  });

  test('a private file REPLACED atomically (the session meta / build record shape) survives', async () => {
    await mkdirShared(roots.sitesRoot, 'ws');
    await mkdirPrivate(roots.sitesRoot, join('ws', '.builder', 'sessions'));
    const meta = join('ws', '.builder', 'sessions', 's.meta.json');
    await writeFilePrivate(roots.sitesRoot, meta, '{"state":"idle"}');
    const model = await startPowerCutModel(roots.sitesRoot);
    try {
      await writeFilePrivateAtomic(roots.sitesRoot, meta, '{"state":"running","recovery_pending":true}');
      expect(model.explain(join(roots.sitesRoot, meta))).toBe('');
    } finally {
      model.restore();
    }
  });

  test('a shared file written atomically into NEW directories (site.json into a fresh workspace) survives', async () => {
    const model = await startPowerCutModel(roots.sitesRoot);
    try {
      expect(await mkdirSharedFresh(roots.sitesRoot, 'fresh')).toBe(true);
      await mkdirShared(roots.sitesRoot, join('fresh', 'a', 'b'));
      await writeFileSharedAtomic(roots.sitesRoot, join('fresh', 'a', 'b', 'site.json'), '{"name":"x"}');
      expect(model.explain(join(roots.sitesRoot, 'fresh', 'a', 'b', 'site.json'))).toBe('');
      expect(model.explain(join(roots.sitesRoot, 'fresh'))).toBe('');
    } finally {
      model.restore();
    }
  });
});

describe('a torn driver record is SAID at boot and never re-seeded', () => {
  for (const [label, body] of [
    ['empty (the delayed-allocation signature)', ''],
    ['unparseable', '{"driv'],
    ['a driver this daemon does not know', '{"driver":"nope"}\n'],
  ] as const) {
    test(`${label}: refused by name, left byte-identical; a sibling with no record is still seeded`, async () => {
      // Both sites carry the daemon's own first record — the source a seed would read.
      for (const slug of ['torn', 'absent']) {
        await mkdirShared(roots.sitesRoot, slug);
        await mkdirPrivate(roots.sitesRoot, join(slug, '.builder'));
        await writeFilePrivate(roots.sitesRoot, join(slug, '.builder', 'driver.json'), '{"driver":"claude_code"}');
      }
      await mkdirPrivate(roots.sitesRoot, DRIVER_RECORDS_DIR);
      writeFileSync(recordOf('torn'), body, { mode: 0o600 });
      const said: string[] = [];
      const errors = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        said.push(args.map(String).join(' '));
      });
      let outcome: Awaited<ReturnType<typeof seedDriverRecords>>;
      try {
        outcome = await seedDriverRecords(['torn', 'absent']);
      } finally {
        errors.mockRestore();
      }
      expect({
        seeded: outcome.seeded,
        refused: outcome.refused.map(r => r.slug),
        reasonNamesIt: outcome.refused[0]?.reason.includes('unreadable') ?? false,
        said: said.some(line => line.includes("'torn'") && line.includes('unreadable')),
        tornLeftAsIs: readFileSync(recordOf('torn'), 'utf8') === body,
        absentSeeded: existsSync(recordOf('absent')),
      }).toEqual({
        seeded: ['absent'],
        refused: ['torn'],
        reasonNamesIt: true,
        said: true,
        tornLeftAsIs: true,
        absentSeeded: true,
      });
    });
  }
});
