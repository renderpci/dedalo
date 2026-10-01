/**
 * LEAD-1b G2 (commit C3) — THE HOST LEDGER IS VERIFIED, NEVER TRUSTED.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * ALLOCATION FROM /etc/passwd (spec §2.1). An unlocked `dedalo-a-<inst>_<k>` whose GECOS names
 * a declared slug is that site's identity; a locked one is retired and its ordinal is never
 * handed out again. A NEW slug gets max(every k, retired included) + 1. And every existing
 * account is PROVED, not assumed: today `plan.ts` skips `useradd` for any name that exists,
 * whatever its gid, groups or uid — so an account planted before the provisioner ran (a
 * shared uid, a foreign member in its private group) would become a site's identity by
 * coincidence of name.
 *
 * Written red-first against 75ccb35a38 (the pre-LEAD-1b HEAD); parked as `.gate.ts` until
 * the implementation it gates landed, and renamed into the suite by that same change.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { apply, type ExecResult, type PathFacts, type ProvisionIo } from '../src/provision/apply';
import { derive, markerContent, type InstanceLayout, type InstanceManifest } from '../src/provision/layout';
import { type Action, type HostState, markedRoots, markerPath, observedPaths, plan } from '../src/provision/plan';
import { ledgerOrdinals } from '../src/provision/identities';
import { removalPlan } from '../src/provision/remove';
import { renderAll } from '../src/provision/render';
import { parseManifest } from '../src/provision/schema';
import { caught, gateManifestDoc, identityName, loadRule, type AgentLedger, type LedgerAccount, type LedgerGroup } from './support/lead1b_contract';
import { type FakeAccount, fakeLedger, useraddAccount, usermodAccount } from './support/fake_accounts';

const prefixes: string[] = [];
afterAll(() => {
  for (const prefix of prefixes) rmSync(prefix, { recursive: true, force: true });
});

const INSTANCE = 'museo';
const SVC = `dedalo-site-${INSTANCE}`;
const LEGACY = `dedalo-agent-${INSTANCE}`;
const SVC_UID = 990;
const INSTANCE_GID = 990;

/** Site k's identity (the leaf's spelling, or the spec's while the leaf is absent — G1 owns that red). */
function identity(k: number): Promise<string> {
  return identityName(INSTANCE, k);
}

/** Every command a plan contains, as argv arrays, in plan order. */
function commandsOf(actions: readonly Action[]): string[][] {
  return actions.filter(action => 'argv' in action).map(action => [...(action as { argv: readonly string[] }).argv]);
}

function literalBody(action: Action): string | null {
  return action.kind === 'file' && action.content.source === 'literal' ? action.content.body : null;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * G2 — allocation, verified
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G2 — the host ledger decides every site’s ordinal, and every account in it is proved', () => {
  /**
   * The ledger the spec's G2 row describes: alpha(1), bravo(2), charlie (RETIRED: locked,
   * k=3), delta(4) active; the declaration now says alpha, bravo, echo — delta removed,
   * echo added.
   */
  async function ledger(patch: (accounts: LedgerAccount[], groups: LedgerGroup[]) => void = () => {}): Promise<AgentLedger> {
    const accounts: LedgerAccount[] = [
      { name: SVC, uid: SVC_UID, gid: INSTANCE_GID, gecos: `Dedalo site builder instance ${INSTANCE}`, retired: false },
      { name: LEGACY, uid: 991, gid: INSTANCE_GID, gecos: `Dedalo site builder instance ${INSTANCE}`, retired: false },
    ];
    const groups: LedgerGroup[] = [{ name: SVC, gid: INSTANCE_GID, members: [] }];
    for (const [k, slug, retired] of [
      [1, 'alpha', false],
      [2, 'bravo', false],
      [3, 'charlie', true],
      [4, 'delta', false],
    ] as const) {
      const name = await identity(k);
      accounts.push({ name, uid: 1000 + k, gid: INSTANCE_GID, gecos: `dedalo site ${slug}`, retired });
      groups.push({ name, gid: 2000 + k, members: [SVC, name] });
    }
    patch(accounts, groups);
    return { accounts, groups };
  }

  function hostFrom(agentLedger: AgentLedger): HostState {
    return {
      users: agentLedger.accounts.map(account => account.name),
      groups: [...agentLedger.groups.map(group => group.name), 'www-data', `dedalo-${INSTANCE}`],
      entries: {},
      unitEnabled: true,
      unitActive: true,
      // CONTRACT (spec §2.1 / §2.2): the ledger, and PID 1's release the units render for.
      agentLedger,
      pid1Version: 255,
    } as unknown as HostState;
  }

  function declared(slugs: readonly string[]): { layout: InstanceLayout; manifest: InstanceManifest } {
    const manifest = parseManifest(gateManifestDoc(INSTANCE, slugs), { source: 'G2' });
    return { layout: derive(manifest), manifest };
  }

  test('kept ordinals stay; a new slug gets max(k)+1 = 5, never the retired 3; the removed site is LOCKED', async () => {
    const { layout, manifest } = declared(['alpha', 'bravo', 'echo']);
    const actions = plan(layout, manifest, hostFrom(await ledger()));
    const commands = commandsOf(actions).map(argv => argv.join(' '));
    const [id1, id2, id3, id4, id5] = await Promise.all([1, 2, 3, 4, 5].map(identity));

    // The new site: its private group, then the account (primary = the instance group,
    // supplementary = its private group, GECOS naming the slug), then the service user joins.
    const groupAt = commands.findIndex(line => /^groupadd\b/.test(line) && line.endsWith(` ${id5}`));
    const userAt = commands.findIndex(line => /^useradd\b/.test(line) && line.endsWith(` ${id5}`));
    const joinAt = commands.findIndex(line => line === `gpasswd -a ${SVC} ${id5}`);
    expect({ groupAt: groupAt >= 0, userAt: userAt >= 0, joinAt: joinAt >= 0 }).toEqual({ groupAt: true, userAt: true, joinAt: true });
    expect(groupAt < userAt && userAt < joinAt).toBe(true);
    const useradd = commandsOf(actions).find(argv => argv[0] === 'useradd' && argv[argv.length - 1] === id5) as string[];
    const flag = (name: string) => useradd[useradd.indexOf(name) + 1];
    expect({ gid: flag('--gid'), groups: flag('--groups'), home: flag('--home-dir'), comment: flag('--comment'), system: useradd.includes('--system') }).toEqual({
      gid: SVC,
      groups: id5,
      home: '/nonexistent',
      comment: 'dedalo site echo',
      system: true,
    });

    // Nothing re-creates a kept identity, and nothing hands out the retired ordinal.
    for (const kept of [id1, id2]) expect(commands.filter(line => /^(useradd|groupadd)\b/.test(line) && line.endsWith(` ${kept}`))).toEqual([]);
    expect(commands.filter(line => line.includes(id3 as string))).toEqual([]);

    // The removed site's identity is locked — never deleted, its ordinal never reused.
    expect(commands.some(line => /^usermod\b/.test(line) && line.includes('--lock') && line.endsWith(` ${id4}`))).toBe(true);
    expect(commands.filter(line => /^(userdel|groupdel|deluser|delgroup)\b/.test(line))).toEqual([]);

    // And what root renders binds each slug to its ledger ordinal.
    const units = actions.map(literalBody).filter((body): body is string => body !== null && body.includes('DEDALO_UNIT_WORKDIR='));
    const userOf = (slug: string) => [
      ...new Set(
        units
          .filter(body => body.includes(`DEDALO_UNIT_WORKDIR=${join(layout.roots.workspaces, slug)}`))
          .flatMap(body => (body.match(/^User=(.*)$/m) ?? []).slice(1)),
      ),
    ];
    expect({ alpha: userOf('alpha'), bravo: userOf('bravo'), echo: userOf('echo'), delta: userOf('delta') }).toEqual({
      alpha: [id1],
      bravo: [id2],
      echo: [id5],
      delta: [],
    });
  });

  for (const [what, patch, mentions] of [
    [
      'an identity whose primary gid is not the instance group',
      (accounts: LedgerAccount[]) => {
        const at = accounts.findIndex(account => account.name.endsWith('_1'));
        accounts[at] = { ...(accounts[at] as LedgerAccount), gid: 4242 };
      },
      '_1',
    ],
    [
      'an identity that is not in its own private group',
      (_accounts: LedgerAccount[], groups: LedgerGroup[]) => {
        const at = groups.findIndex(group => group.name.endsWith('_2'));
        groups[at] = { ...(groups[at] as LedgerGroup), members: [SVC] };
      },
      '_2',
    ],
    [
      'two identities sharing one uid',
      (accounts: LedgerAccount[]) => {
        const at = accounts.findIndex(account => account.name.endsWith('_2'));
        accounts[at] = { ...(accounts[at] as LedgerAccount), uid: 1001 };
      },
      '1001',
    ],
    [
      'an identity whose uid is the service user’s',
      (accounts: LedgerAccount[]) => {
        const at = accounts.findIndex(account => account.name.endsWith('_1'));
        accounts[at] = { ...(accounts[at] as LedgerAccount), uid: SVC_UID };
      },
      '_1',
    ],
    [
      'an identity whose uid is root',
      (accounts: LedgerAccount[]) => {
        const at = accounts.findIndex(account => account.name.endsWith('_2'));
        accounts[at] = { ...(accounts[at] as LedgerAccount), uid: 0 };
      },
      '_2',
    ],
    [
      'a foreign member in a private group',
      (_accounts: LedgerAccount[], groups: LedgerGroup[]) => {
        const at = groups.findIndex(group => group.name.endsWith('_1'));
        groups[at] = { ...(groups[at] as LedgerGroup), members: [...(groups[at] as LedgerGroup).members, 'mallory'] };
      },
      'mallory',
    ],
  ] as const) {
    test(`REFUSED: ${what}`, async () => {
      const { layout, manifest } = declared(['alpha', 'bravo', 'echo']);
      // The control: the same ledger, unpatched, plans.
      const unpatched = await ledger();
      expect(() => plan(layout, manifest, hostFrom(unpatched))).not.toThrow();
      const refused = await caught(async () => plan(layout, manifest, hostFrom(await ledger(patch as never))));
      expect(String((refused as Error).message)).toContain(mentions);
      expect(String((refused as Error).message)).not.toContain('LEAD-1b gate: expected a refusal');
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G2 — HOST-WIDE: no other principal shares an identity's uid or a private gid; an
 * interrupted apply's orphan group is adopted; the system id budget is checked first
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G2 host-wide — the ledger is proved against EVERY account and group, and an interrupted apply does not wedge the next', () => {
  const layoutOf = (instance: string, slugs: readonly string[]) => {
    const manifest = parseManifest(gateManifestDoc(instance, slugs), { source: 'G2 host-wide' });
    return { layout: derive(manifest), manifest };
  };
  const svcOf = (instance: string) => `dedalo-site-${instance}`;
  const hostWith = (agentLedger: AgentLedger, names: { users: string[]; groups: string[] }): HostState =>
    ({ users: names.users, groups: [...names.groups, 'www-data'], entries: {}, unitEnabled: true, unitActive: true, agentLedger, pid1Version: 255 }) as unknown as HostState;

  /** One museum with sites alpha (1) and bravo (2), as `useradd` left them, plus whatever `extra` the host holds. */
  async function museum(instance: string, uidBase: number, gidBase: number): Promise<{ accounts: FakeAccount[]; groups: LedgerGroup[] }> {
    const svc = svcOf(instance);
    const accounts: FakeAccount[] = [useraddAccount(svc, uidBase, gidBase, `Dedalo site builder instance ${instance}`)];
    const groups: LedgerGroup[] = [{ name: svc, gid: gidBase, members: [] }];
    for (const [k, slug] of [
      [1, 'alpha'],
      [2, 'bravo'],
    ] as const) {
      const name = await identityName(instance, k);
      accounts.push(useraddAccount(name, uidBase + k, gidBase, `dedalo site ${slug}`));
      groups.push({ name, gid: gidBase + 100 + k, members: [svc, name] });
    }
    return { accounts, groups };
  }

  function planFor(instance: string, slugs: readonly string[], accounts: FakeAccount[], groups: LedgerGroup[], loginDefs?: string): Action[] {
    const { layout, manifest } = layoutOf(instance, slugs);
    const ledger = fakeLedger(layout, accounts, groups, { loginDefs });
    return plan(layout, manifest, hostWith(ledger, { users: accounts.map(account => account.name), groups: groups.map(group => group.name) }));
  }

  test('control: one museum, a clean host (root, nobody, another museum with ids of its own) plans', async () => {
    const a = await museum('museo', 900, 900);
    const b = await museum('museob', 800, 800);
    const accounts = [useraddAccount('root', 0, 0, 'root'), useraddAccount('nobody', 65534, 65534, 'nobody'), ...a.accounts, ...b.accounts];
    const groups = [{ name: 'root', gid: 0, members: [] }, ...a.groups, ...b.groups];
    expect(() => planFor('museo', ['alpha', 'bravo'], accounts, groups)).not.toThrow();
    expect(() => planFor('museob', ['alpha', 'bravo'], accounts, groups)).not.toThrow();
  });

  test('FLEET: another museum’s identity holding this museum’s site-1 uid (a merged/restored /etc/passwd) refuses BOTH museums’ plans, naming both accounts', async () => {
    const a = await museum('museo', 900, 900);
    const b = await museum('museob', 800, 800);
    const [a1, b1] = await Promise.all([identityName('museo', 1), identityName('museob', 1)]);
    // museob's site 1 got museo's site-1 uid.
    const bAccounts = b.accounts.map(account => (account.name === b1 ? { ...account, uid: 901 } : account));
    const accounts = [...a.accounts, ...bAccounts];
    const groups = [...a.groups, ...b.groups];
    const refusedA = await caught(async () => planFor('museo', ['alpha', 'bravo'], accounts, groups));
    const refusedB = await caught(async () => planFor('museob', ['alpha', 'bravo'], accounts, groups));
    expect({
      a: String((refusedA as Error).message).includes(`'${a1}' has uid 901, which '${b1}' also holds`),
      b: String((refusedB as Error).message).includes(`'${b1}' has uid 901, which '${a1}' also holds`),
    }).toEqual({ a: true, b: true });
  });

  test('REFUSED: any other account holding an identity’s uid (nobody, an LDAP entry, `usermod -o -u`)', async () => {
    const a = await museum('museo', 900, 900);
    const id2 = await identityName('museo', 2);
    const accounts = [...a.accounts, useraddAccount('ldapuser', 902, 5000, 'someone')];
    const refused = await caught(async () => planFor('museo', ['alpha', 'bravo'], accounts, a.groups));
    expect(String((refused as Error).message)).toContain(`'${id2}' has uid 902, which 'ldapuser' also holds`);
  });

  test('REFUSED: any other group holding a private gid (another museum’s, a hand-made one, a sibling site’s)', async () => {
    const a = await museum('museo', 900, 900);
    const [id1, id2] = await Promise.all([identityName('museo', 1), identityName('museo', 2)]);
    const staff = await caught(async () => planFor('museo', ['alpha', 'bravo'], a.accounts, [...a.groups, { name: 'staff', gid: 1001, members: ['mallory'] }]));
    expect(String((staff as Error).message)).toContain(`the private group '${id1}' has gid 1001, which 'staff' also has`);
    const siblings = a.groups.map(group => (group.name === id2 ? { ...group, gid: 1001 } : group));
    const sibling = await caught(async () => planFor('museo', ['alpha', 'bravo'], a.accounts, siblings));
    expect(String((sibling as Error).message)).toContain(`which '${id2}' also has`);
  });

  test('REFUSED: an identity listed in ANY group beyond its own private group (another museum’s instance group, adm, shadow) — a run carries every group of its identity', async () => {
    // Round 5: the ledger kept only this instance's groups, so a `usermod -aG adm` (or a merged
    // /etc/group) never reached the plan — and PID 1's initgroups under User= hands the run that
    // group: the host journal, /etc/shadow, another museum's 2770 drafts.
    const a = await museum('museo', 900, 900);
    const b = await museum('museob', 800, 800);
    const [id1, id2] = await Promise.all([identityName('museo', 1), identityName('museo', 2)]);
    const accounts = [...a.accounts, ...b.accounts];
    const withExtra = (extra: LedgerGroup[]) => [...a.groups, ...b.groups, ...extra];
    const adm = await caught(async () => planFor('museo', ['alpha', 'bravo'], accounts, withExtra([{ name: 'adm', gid: 4, members: ['syslog', id1] }])));
    expect(String((adm as Error).message)).toContain(`'${id1}' is a member of 'adm'`);
    // Another museum's INSTANCE group (its drafts are 2770 to it).
    const foreign = b.groups.map(group => (group.name === svcOf('museob') ? { ...group, members: [id2] } : group));
    const cross = await caught(async () => planFor('museo', ['alpha', 'bravo'], accounts, [...a.groups, ...foreign]));
    expect(String((cross as Error).message)).toContain(`'${id2}' is a member of '${svcOf('museob')}'`);
    // A sibling site's PRIVATE group (the per-site boundary) is refused too — as a foreign member there.
    const sibling = a.groups.map(group => (group.name === id2 ? { ...group, members: [...group.members, id1] } : group));
    expect(String(((await caught(async () => planFor('museo', ['alpha', 'bravo'], accounts, [...sibling, ...b.groups]))) as Error).message)).toContain(`'${id1}' is a member of '${id2}'`);
    // CONTROL: listed in its OWN instance group (its primary anyway) plans.
    const own = a.groups.map(group => (group.name === svcOf('museo') ? { ...group, members: [id1] } : group));
    expect(() => planFor('museo', ['alpha', 'bravo'], accounts, [...own, ...b.groups])).not.toThrow();
  });

  test('REFUSED: an account whose PRIMARY gid is a private group’s (a restored passwd line, an LDAP gidNumber) — the membership no group line lists', async () => {
    const a = await museum('museo', 900, 900);
    const [id1, id2] = await Promise.all([identityName('museo', 1), identityName('museo', 2)]);
    // `getent group` lists this group's members as exactly [svc, id1]: only passwd field 4 says otherwise.
    const accounts = [...a.accounts, useraddAccount('ldapuser', 5555, 1001, 'someone')];
    const refused = await caught(async () => planFor('museo', ['alpha', 'bravo'], accounts, a.groups));
    expect(String((refused as Error).message)).toContain(`the private group '${id1}' (gid 1001) is the PRIMARY group of 'ldapuser'`);
    // The same account with a primary gid of its own is nobody's concern (the control).
    expect(() => planFor('museo', ['alpha', 'bravo'], [...a.accounts, useraddAccount('ldapuser', 5555, 5000, 'someone')], a.groups)).not.toThrow();
    // A sibling site's identity with this site's private group as its primary is refused too.
    const sibling = a.accounts.map(account => (account.name === id2 ? { ...account, gid: 1001 } : account));
    const refusedSibling = await caught(async () => planFor('museo', ['alpha', 'bravo'], sibling, a.groups));
    expect(String((refusedSibling as Error).message)).toContain(`the private group '${id1}' (gid 1001) is the PRIMARY group of '${id2}'`);
  });

  test('AN INTERRUPTED APPLY (groupadd ran, useradd did not): the orphan private group is ADOPTED — no groupadd for it, and its useradd and membership still follow', async () => {
    const a = await museum('museo', 900, 900);
    const id3 = await identityName('museo', 3);
    // `groupadd --system dedalo-a-museo_3` succeeded; `useradd … dedalo-a-museo_3` failed.
    const groups = [...a.groups, { name: id3, gid: 1003, members: [] }];
    const commands = commandsOf(planFor('museo', ['alpha', 'bravo', 'charlie'], a.accounts, groups)).map(argv => argv.join(' '));
    const userAt = commands.findIndex(line => /^useradd\b/.test(line) && line.endsWith(` ${id3}`));
    const joinAt = commands.findIndex(line => line === `gpasswd -a ${svcOf('museo')} ${id3}`);
    expect({
      groupadd: commands.filter(line => line === `groupadd --system ${id3}`),
      useradd: userAt >= 0,
      joins: joinAt > userAt,
      supplementary: commands[userAt]?.includes(`--groups ${id3}`),
    }).toEqual({ groupadd: [], useradd: true, joins: true, supplementary: true });
    // Control: without the orphan, the group IS created first.
    const clean = commandsOf(planFor('museo', ['alpha', 'bravo', 'charlie'], a.accounts, a.groups)).map(argv => argv.join(' '));
    expect(clean.filter(line => line === `groupadd --system ${id3}`).length).toBe(1);
  });

  test('an orphan group is adopted only when it is safe: with a foreign member, or the instance group’s gid, it is REFUSED', async () => {
    const a = await museum('museo', 900, 900);
    const id3 = await identityName('museo', 3);
    const foreign = await caught(async () => planFor('museo', ['alpha', 'bravo', 'charlie'], a.accounts, [...a.groups, { name: id3, gid: 1003, members: ['mallory'] }]));
    expect(String((foreign as Error).message)).toContain('mallory');
    const shared = await caught(async () => planFor('museo', ['alpha', 'bravo', 'charlie'], a.accounts, [...a.groups, { name: id3, gid: 900, members: [] }]));
    expect(String((shared as Error).message)).toContain(`the group '${id3}' has no account and the instance group's gid 900`);
  });

  test('THE ID BUDGET is refused BEFORE any groupadd: two new sites and one free SYS_UID → no plan, naming login.defs', async () => {
    const a = await museum('museo', 900, 900);
    // SYS_UID 900..903: 900 (svc), 901, 902 (identities) held — one free; two new sites need two.
    const tight = 'SYS_UID_MIN 900\nSYS_UID_MAX 903\nSYS_GID_MIN 900\nSYS_GID_MAX 1200\n';
    const refused = await caught(async () => planFor('museo', ['alpha', 'bravo', 'charlie', 'delta'], a.accounts, a.groups, tight));
    expect(String((refused as Error).message)).toMatch(/2 system uid\(s\) are needed and SYS_UID_MIN\.\.SYS_UID_MAX \(900\.\.903\) has 1 free.*login\.defs/);
    // Control: one new site fits; so do two in a wider range.
    expect(() => planFor('museo', ['alpha', 'bravo', 'charlie'], a.accounts, a.groups, tight)).not.toThrow();
    expect(() => planFor('museo', ['alpha', 'bravo', 'charlie', 'delta'], a.accounts, a.groups, 'SYS_UID_MIN 900\nSYS_UID_MAX 999\n')).not.toThrow();
    // …and the gid side the same way.
    const gidTight = 'SYS_GID_MIN 900\nSYS_GID_MAX 900\n';
    const noGid = await caught(async () => planFor('museo', ['alpha', 'bravo', 'charlie'], a.accounts, a.groups, gidTight));
    expect(String((noGid as Error).message)).toMatch(/1 system gid\(s\) are needed and SYS_GID_MIN\.\.SYS_GID_MAX \(900\.\.900\) has 0 free/);
  });

  test('login.defs: shadow-utils’ defaults where it is silent (101 .. UID_MIN-1), its values where it speaks, comments ignored', async () => {
    const { parseLoginDefs } = await import('../src/provision/identities');
    expect(parseLoginDefs(null)).toEqual({ uidMin: 101, uidMax: 999, gidMin: 101, gidMax: 999 });
    expect(parseLoginDefs('# SYS_UID_MIN 5\nUID_MIN 2000\nSYS_GID_MIN  300 # a comment\nSYS_GID_MAX 400')).toEqual({ uidMin: 101, uidMax: 1999, gidMin: 300, gidMax: 400 });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G18 — a synthetic host, recorded
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface FakeHost {
  readonly accounts: Map<string, FakeAccount>;
  readonly groups: Map<string, LedgerGroup>;
  unitEnabled: boolean;
  unitActive: boolean;
  readonly enabledSockets: Set<string>;
  nextUid: number;
  nextGid: number;
  /** Accounts with a process still running (what `pgrep -U` finds). */
  liveUids?: Set<string>;
}

interface Op {
  readonly op: string;
  readonly args: readonly unknown[];
}

interface Synthetic {
  readonly prefix: string;
  readonly layout: InstanceLayout;
  readonly manifest: InstanceManifest;
  readonly host: FakeHost;
  readonly ops: Op[];
  readonly access: Map<string, { owner: string; group: string; mode: number }>;
  io: ProvisionIo;
}

function relocate(value: unknown, prefix: string): unknown {
  if (typeof value === 'string') return value.startsWith('/') ? join(prefix, value) : value;
  if (Array.isArray(value)) return value.map(entry => relocate(entry, prefix));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, relocate(entry, prefix)]));
  }
  return value;
}

function declare(prefix: string, slugs: readonly string[]): { layout: InstanceLayout; manifest: InstanceManifest } {
  const raw = relocate(gateManifestDoc(INSTANCE, slugs), prefix) as Record<string, any>;
  raw.webspace_base = join(prefix, 'srv/www');
  raw.paths = {
    config_base: join(prefix, 'etc/dedalo_sites/instances'),
    state_base: join(prefix, 'var/lib/dedalo_sites'),
    unit_dir: join(prefix, 'etc/systemd/system'),
    vhost_dir: join(prefix, 'etc/nginx/sites-available'),
    polkit_rules_dir: join(prefix, 'etc/polkit-1/rules.d'),
    tmpfiles_dir: join(prefix, 'etc/tmpfiles.d'),
  };
  const manifest = parseManifest(raw, { source: 'G18' });
  return { layout: derive(manifest), manifest };
}

function onHost(prefix: string, path: string): string {
  return path.startsWith(prefix) ? path : join(prefix, path);
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at >= 0 ? argv[at + 1] : undefined;
}

/**
 * THE IO, RECORDED — every door in one ordered log. Doors the gate does not know yet (a new
 * io method LEAD-1b adds, e.g. to archive or unlink) are recorded and, for the three
 * obvious spellings, performed; anything else throws naming itself, so the harness is
 * extended here rather than silently skipping an effect.
 */
function makeIo(s: Omit<Synthetic, 'io'>): ProvisionIo {
  const on = (path: string) => onHost(s.prefix, path);
  const record = (op: string, ...args: unknown[]) => s.ops.push({ op, args });
  const base: Record<string, (...args: any[]) => unknown> = {
    stat(path: string): PathFacts | null {
      const real = on(path);
      let entry;
      try {
        entry = lstatSync(real);
      } catch {
        return null;
      }
      const recorded = s.access.get(path);
      return {
        type: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other',
        mode: recorded?.mode ?? entry.mode & 0o7777,
        owner: recorded?.owner ?? 'root',
        group: recorded?.group ?? 'root',
      };
    },
    readFile(path: string): string | null {
      try {
        return readFileSync(on(path), 'utf8');
      } catch {
        return null;
      }
    },
    mkdir(path: string): void {
      record('mkdir', path);
      mkdirSync(on(path), { recursive: true });
    },
    writeFile(path: string, body: string, mode: number): void {
      record('writeFile', path);
      mkdirSync(dirname(on(path)), { recursive: true });
      writeFileSync(on(path), body, 'utf8');
      const recorded = s.access.get(path);
      s.access.set(path, { owner: recorded?.owner ?? 'root', group: recorded?.group ?? 'root', mode });
    },
    symlink(path: string, target: string): void {
      record('symlink', path, target);
      symlinkSync(target, on(path));
    },
    chown(path: string, owner: string, group: string): void {
      record('chown', path, owner, group);
      const recorded = s.access.get(path);
      s.access.set(path, { owner, group, mode: recorded?.mode ?? lstatSync(on(path)).mode & 0o7777 });
    },
    chmod(path: string, mode: number): void {
      record('chmod', path, mode);
      const recorded = s.access.get(path);
      s.access.set(path, { owner: recorded?.owner ?? 'root', group: recorded?.group ?? 'root', mode });
    },
    rename(from: string, to: string): void {
      record('rename', from, to);
      mkdirSync(dirname(on(to)), { recursive: true });
      renameSync(on(from), on(to));
    },
    unlink(path: string): void {
      record('unlink', path);
      rmSync(on(path), { force: true });
    },
    mintToken: () => 'zzz-minted-zzz',
    hashPassword: (password: string) => `$2y$fake$${password.length}`,
    exec(argv: readonly string[]): ExecResult {
      record('exec', [...argv]);
      const host = s.host;
      const name = argv[argv.length - 1] as string;
      if (argv[0] === 'groupadd') host.groups.set(name, { name, gid: host.nextGid++, members: [] });
      if (argv[0] === 'useradd') {
        const primary = host.groups.get(flagValue(argv, '--gid') ?? '');
        host.accounts.set(name, useraddAccount(name, host.nextUid++, primary?.gid ?? -1, flagValue(argv, '--comment') ?? ''));
        for (const extra of (flagValue(argv, '--groups') ?? '').split(',').filter(Boolean)) {
          const group = host.groups.get(extra);
          if (group) host.groups.set(extra, { ...group, members: [...group.members, name] });
        }
      }
      if (argv[0] === 'gpasswd' && argv[1] === '-a') {
        const group = host.groups.get(argv[3] as string);
        if (group && !group.members.includes(argv[2] as string)) host.groups.set(group.name, { ...group, members: [...group.members, argv[2] as string] });
      }
      if (argv[0] === 'usermod') {
        const account = host.accounts.get(name);
        if (account) host.accounts.set(name, usermodAccount(account, argv));
      }
      // `pgrep -U <owner>`: 1 = no process of that uid is left (the quiesce proof).
      if (argv[0] === 'pgrep') return { code: host.liveUids?.has(name) ? 0 : 1, stdout: '', stderr: '' };
      if (argv[0] === 'systemctl') {
        const verb = argv.find((arg, index) => index > 0 && !arg.startsWith('-')) ?? '';
        const units = argv.slice(argv.indexOf(verb) + 1).filter(arg => !arg.startsWith('-'));
        const daemon = units.includes(s.layout.unitName);
        if (verb === 'enable' && daemon) host.unitEnabled = true;
        if ((verb === 'start' || verb === 'restart') && daemon) host.unitActive = true;
        if (verb === 'enable' && argv.includes('--now') && daemon) host.unitActive = true;
        if (verb === 'stop' && daemon) host.unitActive = false;
        for (const unit of units) {
          if (!unit.endsWith('.socket')) continue;
          if (verb === 'enable') host.enabledSockets.add(unit);
          if (verb === 'disable') host.enabledSockets.delete(unit);
        }
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  return new Proxy(base, {
    get(target, key) {
      if (typeof key !== 'string' || key in target) return (target as Record<string, unknown>)[key as string];
      if (key === 'then') return undefined;
      return (...args: unknown[]) => {
        record(key, ...args);
        if (key === 'remove' || key === 'rm') {
          rmSync(on(args[0] as string), { recursive: true, force: true });
          return;
        }
        if (key === 'move' || key === 'archive') {
          mkdirSync(dirname(on(args[1] as string)), { recursive: true });
          renameSync(on(args[0] as string), on(args[1] as string));
          return;
        }
        throw new Error(`LEAD-1b G18 harness: apply used an io door the gate does not model: '${key}'. Add it to makeIo().`);
      };
    },
  }) as unknown as ProvisionIo;
}

function observe(s: Synthetic): HostState {
  const entries: HostState['entries'] = {};
  const secretsDir = s.layout.secretsDir;
  const agentLedger = fakeLedger(s.layout, s.host.accounts.values(), s.host.groups.values());
  // As the real observer does: the agent-unit paths of every ordinal the ledger binds.
  for (const path of observedPaths(s.layout, s.manifest, ledgerOrdinals(s.layout, agentLedger))) {
    const facts = s.io.stat(path);
    if (!facts) continue;
    const real = onHost(s.prefix, path);
    (entries as Record<string, unknown>)[path] = {
      type: facts.type,
      mode: facts.mode,
      owner: facts.owner,
      group: facts.group,
      ...(facts.type === 'file' && !path.startsWith(`${secretsDir}/`) ? { content: readFileSync(real, 'utf8') } : {}),
      ...(facts.type === 'symlink' ? { target: readlinkSync(real) } : {}),
      ...(facts.type === 'dir' ? { empty: readdirSync(real).length === 0 } : {}),
      mtimeMs: lstatSync(real).mtimeMs,
    };
  }
  return {
    users: [...s.host.accounts.keys()],
    groups: [...s.host.groups.keys(), 'www-data', `dedalo-${INSTANCE}`],
    entries,
    unitEnabled: s.host.unitEnabled,
    unitActive: s.host.unitActive,
    agentLedger,
    pid1Version: 255,
    enabledSockets: [...s.host.enabledSockets],
  } as unknown as HostState;
}

function synthetic(slugs: readonly string[], prefix = mkdtempSync(join(tmpdir(), 'l1b-g18-'))): Synthetic {
  if (!prefixes.includes(prefix)) prefixes.push(prefix);
  const { layout, manifest } = declare(prefix, slugs);
  const s: Omit<Synthetic, 'io'> = {
    prefix,
    layout,
    manifest,
    host: {
      accounts: new Map(),
      groups: new Map(),
      unitEnabled: false,
      unitActive: false,
      enabledSockets: new Set(),
      nextUid: 1000,
      nextGid: 2000,
    },
    ops: [],
    access: new Map(),
  };
  return Object.assign(s, { io: makeIo(s) }) as Synthetic;
}

/** A host as a pre-LEAD-1b `provision apply` left it: both accounts, a running daemon, a used agent HOME. */
function legacyHost(s: Synthetic): void {
  s.host.groups.set(SVC, { name: SVC, gid: INSTANCE_GID, members: [] });
  s.host.accounts.set(SVC, useraddAccount(SVC, SVC_UID, INSTANCE_GID, `Dedalo site builder instance ${INSTANCE}`));
  s.host.accounts.set(LEGACY, useraddAccount(LEGACY, 991, INSTANCE_GID, `Dedalo site builder instance ${INSTANCE}`));
  s.host.unitEnabled = true;
  s.host.unitActive = true;
  // The legacy agent HOME, with a plant in it — the shared cross-site channel LEAD-1b retires.
  const home = onHost(s.prefix, s.layout.roots.home);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'settings.json'), '{"hooks":{"planted":true}}\n');
  s.access.set(s.layout.roots.home, { owner: SVC, group: SVC, mode: 0o2770 });
  // Every root a previous apply created carries its marker (§5) — else plan() refuses it.
  for (const root of markedRoots(s.layout)) {
    mkdirSync(onHost(s.prefix, root), { recursive: true });
    writeFileSync(onHost(s.prefix, markerPath(root)), markerContent(INSTANCE));
  }
}

const execs = (s: Synthetic) => s.ops.map((op, index) => ({ op, index })).filter(({ op }) => op.op === 'exec');
const argvOf = (op: Op) => (op.args[0] as string[]).join(' ');
const firstIndex = (s: Synthetic, predicate: (op: Op) => boolean) => s.ops.findIndex(predicate);
const lastIndex = (s: Synthetic, predicate: (op: Op) => boolean) => {
  for (let i = s.ops.length - 1; i >= 0; i--) if (predicate(s.ops[i] as Op)) return i;
  return -1;
};
const isExec = (pattern: RegExp) => (op: Op) => op.op === 'exec' && pattern.test(argvOf(op));
const writes = (path: string) => (op: Op) => op.op === 'writeFile' && op.args[0] === path;

function runApply(s: Synthetic): void {
  const actions = plan(s.layout, s.manifest, observe(s));
  const report = apply(actions, s.io);
  if (!report.ok) throw new Error(`apply failed: ${report.failure?.detail ?? '(no detail)'}`);
}

function agentUnitWrites(s: Synthetic): number[] {
  const unitDir = dirname(s.layout.unitPath);
  return s.ops
    .map((op, index) => ({ op, index }))
    .filter(({ op }) => op.op === 'writeFile' && dirname(op.args[0] as string) === unitDir && (op.args[0] as string).startsWith(`${unitDir}/${s.layout.agentUnitPrefix}`))
    .map(({ index }) => index);
}


/* ────────────────────────────────────────────────────────────────────────────────────
 * G2 — RETIRED is the shadow EXPIRY, read off the databases' own text
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G2 — the ledger reads retirement from the shadow expiry, never the password lock', () => {
  const layoutOf = (slugs: readonly string[]) => derive(parseManifest(gateManifestDoc(INSTANCE, slugs), { source: 'G2 parse' }));

  test('real `getent` lines: a freshly useradd’ed identity (password `!`) is ACTIVE; `usermod --lock --expiredate 1` RETIRES it', async () => {
    const { parseAgentLedger } = await import('../src/provision/identities');
    const layout = layoutOf(['alpha', 'bravo', 'charlie']);
    const [id1, id2, id3] = await Promise.all([1, 2, 3].map(identity));
    const ledger = parseAgentLedger(layout, {
      passwd: [
        `${id1}:x:1001:990:dedalo site alpha:/nonexistent:/usr/sbin/nologin`,
        `${id2}:x:1002:990:dedalo site bravo:/nonexistent:/usr/sbin/nologin`,
        `${id3}:x:1003:990:dedalo site charlie:/nonexistent:/usr/sbin/nologin`,
        `root:x:0:0:root:/root:/bin/bash`,
      ].join('\n'),
      shadow: [
        // useradd --system, no -p: the `!` password, no aging, no expiry.
        `${id1}:!:20000::::::`,
        // After `usermod --lock --expiredate 1`: the lock doubles the `!`, the expiry is day 1.
        `${id2}:!!:20000:::::1:`,
        // Locked by hand (`passwd -l`), NOT expired: not the provisioner's retirement.
        `${id3}:!*:20000::::::`,
      ].join('\n'),
      group: '',
    });
    expect(Object.fromEntries(ledger.accounts.map(account => [account.name, account.retired]))).toEqual({ [id1]: false, [id2]: true, [id3]: false });
  });

  test('a shadow entry that cannot be read is neither: the plan REFUSES and says to run as root', async () => {
    const layout = layoutOf(['alpha']);
    const manifest = parseManifest(gateManifestDoc(INSTANCE, ['alpha']), { source: 'G2 parse' });
    const id1 = await identity(1);
    const groups = [
      { name: SVC, gid: INSTANCE_GID, members: [] },
      { name: id1, gid: 2001, members: [SVC, id1] },
    ];
    const accounts = [useraddAccount(SVC, SVC_UID, INSTANCE_GID, 'svc'), useraddAccount(id1, 1001, INSTANCE_GID, 'dedalo site alpha')];
    const host = (shadow: boolean) =>
      ({
        users: [SVC, id1],
        groups: [SVC, id1, 'www-data'],
        entries: {},
        unitEnabled: true,
        unitActive: true,
        agentLedger: fakeLedger(layout, accounts, groups, { shadow }),
        pid1Version: 255,
      }) as unknown as HostState;
    expect(() => plan(layout, manifest, host(true))).not.toThrow();
    const refused = await caught(async () => plan(layout, manifest, host(false)));
    expect(String((refused as Error).message)).toMatch(new RegExp(`'${id1}''s shadow entry could not be read.*run as root`));
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G19 (plan) — the epoch moves EXACTLY when an identity changed under a site, from host state
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G19 plan — the resume epoch and the re-ownership are decided from the HOST, not from what this run creates', () => {
  const declaredWith = (slugs: readonly string[]) => {
    const manifest = parseManifest(gateManifestDoc(INSTANCE, slugs), { source: 'G19 plan' });
    return { layout: derive(manifest), manifest };
  };

  /** alpha(1), bravo(2) active; charlie's first incarnation (3) retired; the legacy agent retired unless `legacy`. */
  async function hostWith(
    layout: InstanceLayout,
    options: { env?: { identities?: Record<string, number>; epoch?: number } | null; legacyActive?: boolean; extra?: Array<[number, string, boolean]> },
  ): Promise<HostState> {
    const accounts: LedgerAccount[] = [
      { name: SVC, uid: SVC_UID, gid: INSTANCE_GID, gecos: 'svc', retired: false },
      { name: LEGACY, uid: 991, gid: INSTANCE_GID, gecos: 'legacy', retired: !options.legacyActive },
    ];
    const groups: LedgerGroup[] = [{ name: SVC, gid: INSTANCE_GID, members: [] }];
    for (const [k, slug, retired] of [[1, 'alpha', false], [2, 'bravo', false], [3, 'charlie', true], ...(options.extra ?? [])] as Array<[number, string, boolean]>) {
      const name = await identity(k);
      accounts.push({ name, uid: 1000 + k, gid: INSTANCE_GID, gecos: `dedalo site ${slug}`, retired });
      if (!retired) groups.push({ name, gid: 2000 + k, members: [SVC, name] });
    }
    const entries: Record<string, unknown> = {};
    if (options.env) {
      const lines = [
        ...(options.env.identities ? [`AGENT_IDENTITIES=${JSON.stringify(JSON.stringify(options.env.identities))}`] : []),
        ...(options.env.epoch !== undefined ? [`AGENT_IDENTITY_EPOCH="${options.env.epoch}"`] : []),
      ];
      entries[layout.envFile] = { type: 'file', mode: 0o640, owner: 'root', group: SVC, content: `${lines.join('\n')}\n` };
    }
    return {
      users: accounts.map(account => account.name),
      groups: [...groups.map(group => group.name), 'www-data'],
      entries,
      unitEnabled: true,
      unitActive: true,
      agentLedger: { accounts, groups },
      pid1Version: 255,
    } as unknown as HostState;
  }

  async function decided(slugs: readonly string[], options: Parameters<typeof hostWith>[1]) {
    const { agentPlan } = await import('../src/provision/plan');
    const { layout, manifest } = declaredWith(slugs);
    const host = await hostWith(layout, options);
    const agents = agentPlan(layout, host);
    const envBody = plan(layout, manifest, host)
      .filter(action => action.kind === 'file' && action.path === layout.envFile)
      .map(literalBody)[0];
    return {
      epoch: agents.facts.identityEpoch,
      normalise: agents.normalise.map(site => `${site.slug}<-${site.from.join(',')}`),
      renderedEpoch: envBody ? /^AGENT_IDENTITY_EPOCH="?(\d+)"?$/m.exec(envBody)?.[1] : undefined,
    };
  }

  test('(a) nothing changed, env at 3: the epoch STAYS 3, nothing is re-owned', async () => {
    expect(await decided(['alpha', 'bravo'], { env: { identities: { alpha: 1, bravo: 2 }, epoch: 3 } })).toMatchObject({ epoch: 3, normalise: [] });
  });

  test('(b) a MIGRATION from an env already at N >= 1 (the legacy agent still active): N + 1, every site re-owned from it', async () => {
    const result = await decided(['alpha', 'bravo'], { env: { identities: { alpha: 1, bravo: 2 }, epoch: 3 }, legacyActive: true });
    expect(result).toEqual({ epoch: 4, normalise: [`alpha<-${LEGACY}`, `bravo<-${LEGACY}`], renderedEpoch: '4' });
  });

  test('(c) a RE-DECLARED slug (retired incarnation 3) at N = 3: a new ordinal, N + 1, its workspace re-owned from the retired uid', async () => {
    const id3 = await identity(3);
    const result = await decided(['alpha', 'bravo', 'charlie'], { env: { identities: { alpha: 1, bravo: 2 }, epoch: 3 } });
    expect(result).toEqual({ epoch: 4, normalise: [`charlie<-${[LEGACY, id3].sort().join(',')}`], renderedEpoch: '4' });
  });

  test('(d) CRASH-CONSISTENT: the apply that created charlie’s new identity (4) died before the env was written — the next plan still bumps and re-owns', async () => {
    // The ledger already holds the new, ACTIVE account: this plan creates nothing, and yet
    // charlie's identity changed under it since the env last said so.
    const id3 = await identity(3);
    const result = await decided(['alpha', 'bravo', 'charlie'], { env: { identities: { alpha: 1, bravo: 2 }, epoch: 3 }, extra: [[4, 'charlie', false]] });
    expect(result).toEqual({ epoch: 4, normalise: [`charlie<-${[LEGACY, id3].sort().join(',')}`], renderedEpoch: '4' });
    // And once the env says charlie = 4, it settles.
    expect(await decided(['alpha', 'bravo', 'charlie'], { env: { identities: { alpha: 1, bravo: 2, charlie: 4 }, epoch: 4 }, extra: [[4, 'charlie', false]] })).toMatchObject({
      epoch: 4,
      normalise: [],
    });
  });

  test('(e) an env that binds a site to ANOTHER ordinal than the ledger: N + 1, re-owned from that ordinal’s identity', async () => {
    const id3 = await identity(3);
    const result = await decided(['alpha', 'bravo'], { env: { identities: { alpha: 1, bravo: 3 }, epoch: 5 } });
    expect(result).toEqual({ epoch: 6, normalise: [`bravo<-${[LEGACY, id3].sort().join(',')}`], renderedEpoch: '6' });
  });

  test('control: a pre-LEAD-1b env (no AGENT_IDENTITIES, no epoch) on a host with nothing to migrate: epoch 1, nothing re-owned', async () => {
    expect(await decided(['alpha', 'bravo'], { env: { epoch: undefined } })).toMatchObject({ epoch: 1, normalise: [] });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The agent units' ExecStart must be what the daemon's own runtime and shim resolve to
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G9 (plan half) — a runtime or checkout declared through a symlink is refused, naming the path to declare', () => {
  test('observeHost reads realpath; the plan refuses a declared path that is not its own realpath; the resolved one plans', async () => {
    const { resolvedExecPaths } = await import('../src/provision/apply');
    const { SHIM_RELATIVE } = await import('../src/provision/render/agent_units');
    // The scratch root itself resolved: macOS's tmpdir lives behind /var -> /private/var.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'l1b-exec-')));
    prefixes.push(root);
    const realBin = join(root, 'opt', 'bun', 'bin', 'bun');
    mkdirSync(dirname(realBin), { recursive: true });
    writeFileSync(realBin, '#!/bin/sh\n', { mode: 0o755 });
    const linkBin = join(root, 'usr', 'local', 'bin', 'bun');
    mkdirSync(dirname(linkBin), { recursive: true });
    symlinkSync(realBin, linkBin);
    const realCheckout = join(root, 'releases', 'v1', 'master_dedalo');
    const shim = join(realCheckout, 'publication', 'site_builder', SHIM_RELATIVE);
    mkdirSync(dirname(shim), { recursive: true });
    writeFileSync(shim, '// shim\n');
    const linkCheckout = join(root, 'current');
    symlinkSync(join(root, 'releases', 'v1'), linkCheckout);

    const declaredAt = (bun: string, checkout: string) => {
      const doc = gateManifestDoc(INSTANCE, ['alpha']);
      doc.engine.bun_bin = bun;
      doc.engine.checkout_dir = checkout;
      const manifest = parseManifest(doc, { source: 'G9 plan' });
      return { layout: derive(manifest), manifest };
    };
    const hostOf = (layout: InstanceLayout) =>
      ({ users: [], groups: [], entries: {}, unitEnabled: false, unitActive: false, pid1Version: 255, resolvedPaths: resolvedExecPaths(layout) }) as unknown as HostState;

    // Control: the resolved paths plan.
    const good = declaredAt(realBin, realCheckout);
    expect(() => plan(good.layout, good.manifest, hostOf(good.layout))).not.toThrow();
    for (const [what, bun, checkout, named] of [
      ['a symlinked bun', linkBin, realCheckout, realBin],
      ['a checkout through a symlinked release directory', realBin, join(linkCheckout, 'master_dedalo'), shim],
    ] as const) {
      const bad = declaredAt(bun, checkout);
      const refused = await caught(async () => plan(bad.layout, bad.manifest, hostOf(bad.layout)));
      expect({ what, named: String((refused as Error).message).includes(named), says: /Declare the resolved path/.test(String((refused as Error).message)) }).toEqual({
        what,
        named: true,
        says: true,
      });
    }
  });
});
