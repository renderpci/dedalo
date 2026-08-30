/**
 * THE AUDIT TRAIL — where it lives, and that losing a line never fails the user's action.
 *
 * Two properties in this file beyond the read/filter behaviour, both stated in
 * `src/audit.ts`'s own header and neither held before now:
 *
 *   1. THE TRAIL LIVES IN THE INSTANCE'S OWN, ROOT-OWNED AUDIT ROOT — never inside the
 *      workspaces root. That is the WHOLE of the append-only story: unlink and rename are
 *      permissions on the DIRECTORY, so a root-owned directory holding a daemon-owned file
 *      is a record this process can add to and cannot erase. Under the old
 *      `SITES_ROOT/.audit` placement the daemon owned the directory too, and a compromised
 *      agent turn — which runs as exactly this uid — could delete the record of itself.
 *      The provisioner's mode matrix pins auditDir/auditFile; nothing pinned which config
 *      key `audit.ts` actually writes to, and repointing it at SITES_ROOT left the suite
 *      green.
 *   2. AUDIT NEVER THROWS INTO THE REQUEST PATH. Losing the line is bad; silently failing
 *      a publish AFTER it already happened is worse. Making the catch rethrow left the
 *      suite green too.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resetInstance, roots } from './fixtures/instance';
import { audit, readAudit } from '../src/audit';

/** Every regular file under `dir`, recursively — the walk both placement checks use. */
function filesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

/**
 * WHERE THE DAEMON ITSELF PUTS THE FILE — asked of `audit()`, never spelled here.
 *
 * A test that named `audit.jsonl` would be a second census of the filename, which is the
 * defect this subsystem exists to delete. So one line is written and the file that appeared
 * under the audit root is the answer.
 */
async function readAuditFilePath(): Promise<string> {
  await audit({ actor: { user_id: 0, username: 'probe' }, action: 'probe', site: null });
  const found = filesUnder(roots.auditDir).filter(path => holdsTheLine(path, null));
  if (found.length !== 1) {
    throw new Error(`expected exactly one audit file under the audit root, found ${found.length}`);
  }
  return found[0] as string;
}

/** Does this file hold an audit line about `site`? */
function holdsTheLine(path: string, site: string | null): boolean {
  try {
    return readFileSync(path, 'utf8').includes(site === null ? '"site":null' : `"site":"${site}"`);
  } catch {
    return false;
  }
}

beforeEach(resetInstance);
afterEach(resetInstance);

describe('audit log', () => {
  test('appends entries and reads them back newest-first with a site filter', async () => {
    await audit({ actor: { user_id: 1, username: 'a' }, action: 'create_site', site: 'one' });
    await audit({ actor: { user_id: 2, username: 'b' }, action: 'build', site: 'two' });
    await audit({ actor: { user_id: 1, username: 'a' }, action: 'publish', site: 'one', detail: { release: 'r1' } });

    const all = await readAudit();
    expect(all.length).toBe(3);
    // Newest first.
    expect(all[0].action).toBe('publish');

    const forOne = await readAudit({ site: 'one' });
    expect(forOne.length).toBe(2);
    expect(forOne.every(e => e.site === 'one')).toBe(true);

    const limited = await readAudit({ limit: 1 });
    expect(limited.length).toBe(1);
    expect(limited[0].action).toBe('publish');
  });

  test('reading an absent log returns empty', async () => {
    expect(await readAudit()).toEqual([]);
  });

  test('the line lands in the AUDIT root, and nothing is written into the workspaces root', async () => {
    await audit({ actor: { user_id: 3, username: 'c' }, action: 'publish', site: 'placed' });

    // Found by WALKING both roots rather than by naming a path: the assertion is "which
    // root holds it", so a test that spelled the filename would still pass if the daemon
    // wrote the same name in the wrong tree.
    const inAudit = filesUnder(roots.auditDir).filter(path => holdsTheLine(path, 'placed'));
    const inWorkspaces = filesUnder(roots.sitesRoot).filter(path => holdsTheLine(path, 'placed'));

    expect({ inAudit: inAudit.length, inWorkspaces: inWorkspaces.length }).toEqual({
      inAudit: 1,
      inWorkspaces: 0,
    });
    // And the reader finds the same line — the two ends agree on one path.
    expect((await readAudit({ site: 'placed' }))[0]?.action).toBe('publish');
  });

  test('a trail that cannot be written loses the line and never fails the action', async () => {
    // The disk-full / permission-slip shape, built as the one thing this process really
    // cannot append to: a DIRECTORY standing where the audit file goes. The root itself
    // stays an ordinary marked directory, so a crash here cannot leave the scratch tree in
    // a state the reset refuses to clean. The mutation this refuses is a
    // `catch { throw error; }`, which turns every successful publish, build and delete into
    // a 500 after the effect already landed.
    const auditFile = await readAuditFilePath();
    await rm(auditFile, { recursive: true, force: true });
    await mkdir(auditFile, { recursive: true });

    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      await audit({ actor: { user_id: 4, username: 'd' }, action: 'publish', site: 'unwritable' });
    } finally {
      console.error = originalError;
      await rm(auditFile, { recursive: true, force: true });
    }

    // It did not throw — and it was LOUD about it, which is what the header calls the
    // tripwire. A silent swallow would be the other half of this failure.
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('FAILED to persist audit line');
  });
});
