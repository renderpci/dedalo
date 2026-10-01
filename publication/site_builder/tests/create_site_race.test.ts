/**
 * A CREATE NEVER WRITES INTO, NOR ROLLS BACK, A WORKSPACE IT DID NOT MAKE.
 *
 * `createSite` asks "does this site exist?" before its awaits (the domain owner, the
 * confinement admission — systemctl round trips, slow while PID 1 is busy) and reserves the
 * slug only after them. A second create of the same slug that passed the first question while
 * the first create was still scaffolding, and whose awaits outlasted that whole create, got the
 * reservation the first had just released — and then scaffolded over the finished site,
 * rewrote its site.json (another owner, another created_at) and driver record, committed in
 * its repository, and on any later failure `rm -rf`'d it: data loss on a site already
 * answered 201. (Review of 849241714e, S2, three refuters.)
 *
 * The outcome the gates hold: the workspace directory is created EXCLUSIVELY by the request
 * that owns the create, under its reservation — an existing directory (a finished site, or
 * one whose site.json is gone) is refused, typed, before anything is written, and nothing a
 * refused create did not make is ever removed by its rollback.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DRIVER_RECORDS_DIR } from '../src/sites/driver_record';
import { createSite, siteExists } from '../src/sites/workspace';
import { mkdirSharedFresh } from '../src/util/shared_tree';
import { busyReason } from '../src/workspace_activity';
import { provisionSite, resetInstance, roots, workspacePath } from './fixtures/instance';
import { caught, reasonOf, statusOf, sweepScratch } from './support/lead1b_contract';
import { type GatePolicy, lead1bPolicy, waitUntil } from './support/lead1b_host';

const FIRST = { user_id: 7, username: 'first-create' };
const SECOND = { user_id: 99, username: 'second-create' };

beforeEach(resetInstance);
afterAll(resetInstance);

const hosts: GatePolicy[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.standIn.release();
    await host.standIn.close();
  }
  sweepScratch();
});

function driverRecord(slug: string): string | null {
  const path = join(roots.sitesRoot, DRIVER_RECORDS_DIR, `${slug}.json`);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * A host whose PID 1 answers — but only once `open()` is called: every `systemctl` the
 * confinement admission makes waits there. The create holding this policy is PARKED inside
 * `assertConfinementAvailable`, after its existence check and before its reservation.
 */
async function parkedHost(slug: string): Promise<{ host: GatePolicy; parked: () => boolean; open: () => void }> {
  let entered = false;
  let open: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    open = resolve;
  });
  let real: GatePolicy | null = null;
  const host = await lead1bPolicy({
    identities: new Map([[slug, 1]]),
    hostOverrides: {
      systemctl: async (args: readonly string[]) => {
        entered = true;
        await gate;
        return (real as GatePolicy).standIn.systemctl(args);
      },
    },
  });
  real = host;
  hosts.push(host);
  return { host, parked: () => entered, open };
}

describe('createSite — the workspace is made by the create that owns it', () => {
  test('a second create of the same slug, parked in admission while the first completes, is 409 slug_exists and the first site survives intact', async () => {
    const { domain } = await provisionSite('twice');
    const { host, parked, open } = await parkedHost('twice');

    // B passes the existence check (nothing exists yet) and parks in admission.
    const second = caught(() =>
      createSite({ slug: 'twice', name: 'impostor', domain, actor: SECOND, driver: 'pi' }, host.policy as never),
    );
    await waitUntil(parked, 8_000, 'the second create to park in admission');
    expect(siteExists('twice')).toBe(false);

    // A runs the whole create — reserve, scaffold, manifest, git — and releases the slug.
    const first = await createSite({ slug: 'twice', name: 'original', domain, actor: FIRST });
    expect(busyReason('twice')).toBe(null);
    const manifestBefore = readFileSync(workspacePath('twice', 'site.json'), 'utf8');
    const driverBefore = driverRecord('twice');

    // B resumes: the reservation is free again.
    open();
    const refused = await second;

    expect({
      status: statusOf(refused),
      reason: reasonOf(refused),
      exists: siteExists('twice'),
      manifestUnchanged: existsSync(workspacePath('twice', 'site.json'))
        ? readFileSync(workspacePath('twice', 'site.json'), 'utf8') === manifestBefore
        : 'gone',
      owner: first.owner_user_id,
      driverUnchanged: driverRecord('twice') === driverBefore,
      driverPresent: driverBefore !== null,
      gitConnects: host.standIn.connects.length,
      busy: busyReason('twice'),
    }).toEqual({
      status: 409,
      reason: 'slug_exists',
      exists: true,
      manifestUnchanged: true,
      owner: FIRST.user_id,
      driverUnchanged: true,
      driverPresent: true,
      gitConnects: 0,
      busy: null,
    });
  }, 30_000);

  test('a directory already at the slug with no site.json is refused 409 workspace_exists, and nothing in it is touched or removed', async () => {
    const { domain } = await provisionSite('debris');
    // What an interrupted create (a daemon killed mid-scaffold) or a site whose site.json was
    // removed leaves: a workspace directory the daemon cannot prove it is free to reuse.
    mkdirSync(workspacePath('debris'), { recursive: true });
    writeFileSync(workspacePath('debris', 'precious.txt'), 'not this create’s\n');

    const refused = await caught(() => createSite({ slug: 'debris', name: 'debris', domain, actor: FIRST }));

    expect({
      status: statusOf(refused),
      reason: reasonOf(refused),
      precious: existsSync(workspacePath('debris', 'precious.txt'))
        ? readFileSync(workspacePath('debris', 'precious.txt'), 'utf8')
        : 'gone',
      manifest: existsSync(workspacePath('debris', 'site.json')),
      agents: existsSync(workspacePath('debris', 'AGENTS.md')),
      driver: driverRecord('debris'),
      busy: busyReason('debris'),
    }).toEqual({
      status: 409,
      reason: 'workspace_exists',
      precious: 'not this create’s\n',
      manifest: false,
      agents: false,
      driver: null,
      busy: null,
    });
  }, 30_000);
});

describe('mkdirSharedFresh — the claim primitive', () => {
  async function inScratch(body: (dir: string) => Promise<void>): Promise<void> {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'fresh-')));
    const umask = process.umask(0o027);
    try {
      await body(dir);
    } finally {
      process.umask(umask);
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const bits = (path: string) => statSync(path).mode & 0o7777;

  test('creates the path 2770 at every level it made, and answers true once', async () => {
    await inScratch(async dir => {
      const first = await mkdirSharedFresh(dir, join('workspaces', 'site-a'));
      const second = await mkdirSharedFresh(dir, join('workspaces', 'site-a'));
      expect({ first, second, leaf: bits(join(dir, 'workspaces', 'site-a')), parent: bits(join(dir, 'workspaces')) }).toEqual({
        first: true,
        second: false,
        leaf: 0o2770,
        parent: 0o2770,
      });
    });
  });

  test('anything already standing there — a file, a link — answers false and is neither followed nor touched', async () => {
    await inScratch(async dir => {
      writeFileSync(join(dir, 'file'), 'kept');
      mkdirSync(join(dir, 'elsewhere'), { mode: 0o700 });
      symlinkSync(join(dir, 'elsewhere'), join(dir, 'link'));
      const file = await mkdirSharedFresh(dir, 'file');
      const link = await mkdirSharedFresh(dir, 'link');
      expect({
        file,
        link,
        fileBody: readFileSync(join(dir, 'file'), 'utf8'),
        linkStill: lstatSync(join(dir, 'link')).isSymbolicLink(),
        targetMode: bits(join(dir, 'elsewhere')),
      }).toEqual({ file: false, link: false, fileBody: 'kept', linkStill: true, targetMode: 0o700 });
    });
  });

  test('a path through the daemon\'s private state is refused, never created shared', async () => {
    await inScratch(async dir => {
      const refused = await caught(() => mkdirSharedFresh(dir, join('ws', '.builder', 'x')));
      expect({ refused: refused instanceof Error, made: existsSync(join(dir, 'ws')) }).toEqual({ refused: true, made: false });
    });
  });
});
