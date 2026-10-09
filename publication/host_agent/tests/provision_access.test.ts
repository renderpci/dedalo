/**
 * "The account that runs it can read and run it" (plan.ts accessRefusals, ./access.ts) and
 * "engine_group is the work system's group" (plan.ts engineGroupRefusal). The predicate is
 * judged exhaustively against the kernel's rule; the plan cases are the operator's real
 * failures (a root-only agent_dir that passed every trust check, then systemd's "Changing to
 * the requested working directory failed: Permission denied"; an engine_group that was the
 * agent's own group, so pairing only ever said "unreachable").
 */
import { describe, expect, test } from 'bun:test';
import type { AccessFacts, Credentials } from '../src/provision/access';
import {
  EXECUTE,
  READ,
  WRITE,
  accessClass,
  accessLetters,
  accountCredentials,
  chmodFix,
  missingAccess,
  permits,
  unitCredentials,
} from '../src/provision/access';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { PlanRefused, accessRefusals, engineGroupRefusal, plan } from '../src/provision/plan';
import type { UnitGroups } from '../src/provision/render/types';
import { PENDING_FACTS } from '../src/provision/render/types';
import { agentUnitGroups, agentUnitRenderer } from '../src/provision/render/unit_agent';
import { v2ScratchUnitRenderer, v2UnitGroups, v2UnitRenderer } from '../src/provision/render/unit_v2';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';
import { FakeHost } from './support/provision_fake_host';

/* ── the predicate ────────────────────────────────────────────────────────────────── */

const OWNER = 1000;
const GROUP = 2000;
const file = (mode: number, uid = OWNER, gid = GROUP): AccessFacts => ({ type: 'file', uid, gid, mode });
const dir = (mode: number, uid = OWNER, gid = GROUP): AccessFacts => ({ type: 'dir', uid, gid, mode });
const asOwner: Credentials = { uid: OWNER, gids: [GROUP] };
const asMember: Credentials = { uid: 3000, gids: [4000, GROUP] };
const asOther: Credentials = { uid: 3000, gids: [4000] };
const asRoot: Credentials = { uid: 0, gids: [0] };

describe('access: the kernel consults exactly one class', () => {
  test('owner → u bits, a member of the owning gid → g bits, anyone else → o bits, uid 0 → root', () => {
    expect(accessClass(file(0o644), asOwner)).toBe('u');
    expect(accessClass(file(0o644), asMember)).toBe('g');
    expect(accessClass(file(0o644), asOther)).toBe('o');
    expect(accessClass(file(0o644), asRoot)).toBe('root');
  });

  test('exhaustive: every mode × every need × each class grants exactly its own three bits', () => {
    for (let mode = 0; mode <= 0o777; mode += 1) {
      for (let need = 0; need <= 0o7; need += 1) {
        for (const [cred, shift] of [
          [asOwner, 6],
          [asMember, 3],
          [asOther, 0],
        ] as const) {
          const granted = (mode >> shift) & 0o7;
          expect(missingAccess(file(mode), cred, need)).toBe(need & ~granted);
          expect(permits(dir(mode), cred, need)).toBe((need & granted) === need);
        }
      }
    }
  });

  test('the narrower class wins even when a wider one would grant: owner of 0077, member of 0707', () => {
    expect(permits(file(0o077), asOwner, READ)).toBe(false);
    expect(permits(file(0o707), asMember, READ)).toBe(false);
    expect(permits(file(0o707), asOther, READ)).toBe(true);
  });

  test('uid 0: reads and traverses anything, executes a file only with some x bit', () => {
    expect(permits(dir(0o000), asRoot, READ | EXECUTE)).toBe(true);
    expect(permits(file(0o000), asRoot, READ | WRITE)).toBe(true);
    expect(missingAccess(file(0o600), asRoot, READ | EXECUTE)).toBe(EXECUTE);
    expect(permits(file(0o001), asRoot, EXECUTE)).toBe(true);
  });

  test('the fix names the class the kernel consults, and only the missing letters', () => {
    expect(chmodFix('/home/site', dir(0o750, 0, 0), asOther, EXECUTE)).toBe('chmod o+x /home/site');
    expect(chmodFix('/x/bun', file(0o700), asMember, READ | EXECUTE)).toBe('chmod g+rx /x/bun');
    expect(chmodFix('/x/bun', file(0o400), asOwner, READ | EXECUTE)).toBe('chmod u+x /x/bun');
    expect(chmodFix('/x/bun', file(0o755), asOther, READ | EXECUTE)).toBeNull();
    expect(chmodFix('/x/bun', file(0o600), asRoot, EXECUTE)).toBe('chmod a+x /x/bun');
    expect(accessLetters(READ | WRITE | EXECUTE)).toBe('rwx');
    expect(accessLetters(0)).toBe('');
  });
});

describe('access: credentials are what the unit gives the process', () => {
  const database = { primary: 990, all: [990, 33, 44] };

  test("a unit with Group=: that gid replaces the primary; SupplementaryGroups= and the database's others join", () => {
    expect(unitCredentials(990, 1000, [991], database)).toEqual({ uid: 990, gids: [1000, 991, 33, 44] });
  });

  test("a unit without Group=: the user's primary gid applies", () => {
    expect(unitCredentials(990, null, [991], database)).toEqual({ uid: 990, gids: [990, 991, 33, 44] });
  });

  test('duplicates collapse', () => {
    expect(unitCredentials(990, 33, [33], database)).toEqual({ uid: 990, gids: [33, 44] });
  });

  test('an account no unit of ours starts (v1): its primary + the database groups', () => {
    expect(accountCredentials(992, { primary: 33, all: [33, 50] })).toEqual({ uid: 992, gids: [33, 50] });
  });
});

describe("access: plan's unit groups ARE the rendered units' Group=/SupplementaryGroups= lines", () => {
  /** What a rendered unit actually says: its Group= (null = absent) and SupplementaryGroups= (space-separated). */
  const parsed = (body: string): UnitGroups => {
    const lines = body.split('\n');
    const values = (key: string) => lines.filter(line => line.startsWith(`${key}=`)).map(line => line.slice(key.length + 1));
    const group = values('Group');
    const supplementary = values('SupplementaryGroups');
    expect(group.length).toBeLessThanOrEqual(1);
    expect(supplementary.length).toBeLessThanOrEqual(1);
    return { group: group[0] ?? null, supplementary: supplementary[0]?.split(/\s+/).filter(Boolean) ?? [] };
  };
  const layouts: [string, AgentLayout][] = [
    ['unix', derive(unixDeclaration())],
    ['tls', derive(tlsDeclaration())],
    // engine_group = v2.group (rule 2 refuses it, but the renderer must still agree with plan)
    ['unix, engine_group = v2.group', derive({ ...unixDeclaration(), engine_group: derive(unixDeclaration()).identity.v2Group })],
  ];

  for (const [name, layout] of layouts) {
    test(`${name}: the agent unit`, () => {
      const [unit] = agentUnitRenderer.render(layout, PENDING_FACTS);
      expect(parsed(unit!.body)).toEqual({ ...agentUnitGroups(layout), supplementary: [...agentUnitGroups(layout).supplementary] });
    });
    test(`${name}: the v2 unit and its scratch template`, () => {
      const expected = { ...v2UnitGroups(layout), supplementary: [...v2UnitGroups(layout).supplementary] };
      for (const renderer of [v2UnitRenderer, v2ScratchUnitRenderer]) {
        const [unit] = renderer.render(layout, PENDING_FACTS);
        expect(parsed(unit!.body)).toEqual(expected);
      }
    });
  }

  test('the values are what the spec states: unix Group=engine_group, tls none; v2 Group=v2.group alone', () => {
    const unix = derive(unixDeclaration());
    expect(agentUnitGroups(unix).group).toBe(unix.identity.engineGroup);
    expect(agentUnitGroups(derive(tlsDeclaration())).group).toBeNull();
    expect(v2UnitGroups(unix)).toEqual({ group: unix.identity.v2Group, supplementary: [] });
  });
});

/* ── the plan ─────────────────────────────────────────────────────────────────────── */

/** The operator's per-site layout: agent checkout, per-site Bun and the state root all under /home/<site>. */
function siteDeclaration(base: HostDeclaration = unixDeclaration()): HostDeclaration {
  return {
    ...base,
    agent_dir: '/home/museum.org/host_agent',
    bun_bin: '/home/museum.org/.bun/bin/bun',
    state_root: '/home/museum.org/publication',
  };
}

const SITE = '/home/museum.org';
const AGENT_DIR = `${SITE}/host_agent`;
const BUN = `${SITE}/.bun/bin/bun`;

function site(base?: HostDeclaration): { l: AgentLayout; host: FakeHost } {
  const l = derive(siteDeclaration(base));
  return { l, host: new FakeHost(l) };
}

function entry(host: FakeHost, path: string) {
  const found = host.entries.get(path);
  if (!found) throw new Error(`fixture: no entry at ${path}`);
  return found;
}

function refusals(l: AgentLayout, host: FakeHost): readonly string[] {
  try {
    plan(l, host.state());
  } catch (error) {
    if (error instanceof PlanRefused) return error.reasons;
    throw error;
  }
  throw new Error('plan did not refuse');
}

const accepted = (l: AgentLayout, host: FakeHost): void => {
  expect(() => plan(l, host.state())).not.toThrow();
};

describe('rule 1: the agent can read its checkout', () => {
  test("the operator's case: host_agent root:root 0750 → refused, naming the account, the path and the fix", () => {
    const { l, host } = site();
    entry(host, AGENT_DIR).mode = 0o750;
    expect(refusals(l, host)).toEqual([
      `'${AGENT_DIR}' is not readable by dedalo-pubhost (the agent) — chmod -R u=rwX,go=rX ${AGENT_DIR}`,
    ]);
    entry(host, AGENT_DIR).mode = 0o755;
    accepted(l, host);
  });

  test('a directory it can read but not enter is named as such', () => {
    const { l, host } = site();
    entry(host, AGENT_DIR).mode = 0o754;
    expect(refusals(l, host)).toEqual([
      `'${AGENT_DIR}' cannot be traversed by dedalo-pubhost (the agent) — chmod -R u=rwX,go=rX ${AGENT_DIR}`,
    ]);
  });

  test('the WHOLE tree is judged: an unreadable file deep in node_modules is refused, with examples and a count', () => {
    const { l, host } = site();
    host.seedDir(`${AGENT_DIR}/node_modules/zod`);
    for (const name of ['a.js', 'b.js', 'c.js', 'd.js']) {
      host.entries.set(`${AGENT_DIR}/node_modules/zod/${name}`, { type: 'file', uid: 0, gid: 0, mode: 0o600, body: '' });
    }
    expect(refusals(l, host)).toEqual([
      `agent_dir '${AGENT_DIR}' holds 4 entries not readable by dedalo-pubhost (the agent) ` +
        `('${AGENT_DIR}/node_modules/zod/a.js', '${AGENT_DIR}/node_modules/zod/b.js', '${AGENT_DIR}/node_modules/zod/c.js', …) — ` +
        `chmod -R u=rwX,go=rX ${AGENT_DIR}`,
    ]);
    for (const name of ['a.js', 'b.js', 'c.js', 'd.js']) entry(host, `${AGENT_DIR}/node_modules/zod/${name}`).mode = 0o644;
    accepted(l, host);
  });

  test('a directory in the tree needs r AND x (a 0644 directory cannot be entered)', () => {
    const { l, host } = site();
    host.seedDir(`${AGENT_DIR}/node_modules`);
    entry(host, `${AGENT_DIR}/node_modules`).mode = 0o644;
    expect(refusals(l, host)).toEqual([
      `agent_dir '${AGENT_DIR}' holds 1 entry not readable by dedalo-pubhost (the agent) ('${AGENT_DIR}/node_modules') — chmod -R u=rwX,go=rX ${AGENT_DIR}`,
    ]);
  });

  test('plan: a symlink entry in the tree is never judged by its own (meaningless) mode', () => {
    // PLAN's half only. That the walk never enters the link is apply.ts walkAgentTree's, held on
    // a real tree in provision_host_io.test.ts (which also holds FakeHost's walk equal to it).
    const { l, host } = site();
    host.entries.set(`${AGENT_DIR}/node_modules`, { type: 'symlink', uid: 0, gid: 0, mode: 0o000, body: '', target: '/etc' });
    accepted(l, host);
  });

  test('an unlistable directory in the tree: REFUSED as a tree not walked whole, never skipped', () => {
    const { l, host } = site();
    host.unlistable.add(`${AGENT_DIR}/src`);
    expect(refusals(l, host)).toEqual([
      `agent_dir '${AGENT_DIR}' could not be walked whole ('${AGENT_DIR}/src' could not be listed (EACCES)) — whether ` +
        'dedalo-pubhost (the agent) can read every file of it is unproven; agent_dir must hold the agent checkout only (src/, node_modules/, package.json…)',
    ]);
  });

  test('past the walk cap: REFUSED, never skipped', () => {
    const { l, host } = site();
    host.agentTreeCap = 2;
    expect(refusals(l, host)).toEqual([
      `agent_dir '${AGENT_DIR}' could not be walked whole (it holds more than 2 entries) — whether dedalo-pubhost ` +
        '(the agent) can read every file of it is unproven; agent_dir must hold the agent checkout only (src/, node_modules/, package.json…)',
    ]);
    host.agentTreeCap = 3; // agent_dir, src/, src/index.ts
    accepted(l, host);
  });

  test('the owner case: the agent owning a file reads it through the OWNER bits only', () => {
    const { l, host } = site();
    const owned = `${AGENT_DIR}/package.json`;
    host.entries.set(owned, { type: 'file', uid: 990, gid: 0, mode: 0o044, body: '' });
    expect(refusals(l, host).join('\n')).toContain(`holds 1 entry not readable by dedalo-pubhost (the agent) ('${owned}')`);
    entry(host, owned).mode = 0o400;
    accepted(l, host);
  });

  test("group-readable: Group= (the engine group, unix) reads it; a group the agent is NOT in does not; the database's membership does", () => {
    const { l, host } = site();
    entry(host, AGENT_DIR).mode = 0o750;
    entry(host, AGENT_DIR).gid = 1000; // the engine group: the unit's Group=
    accepted(l, host);
    entry(host, AGENT_DIR).gid = 33; // www-data: the agent is not in it
    expect(refusals(l, host)).toEqual([
      `'${AGENT_DIR}' is not readable by dedalo-pubhost (the agent) — chmod -R u=rwX,go=rX ${AGENT_DIR}`,
    ]);
    host.accountGroups.set('dedalo-pubhost', { primary: 990, all: [990, 33] }); // usermod -aG www-data
    accepted(l, host);
  });

  test("SupplementaryGroups= counts: a root:<v2 group> 0750 agent_dir is the agent's to read", () => {
    const { l, host } = site();
    entry(host, AGENT_DIR).mode = 0o750;
    entry(host, AGENT_DIR).gid = 991;
    accepted(l, host);
  });

  test("on unix the agent's PRIMARY group does not apply (Group= replaces it); on tls it does", () => {
    const unix = site();
    entry(unix.host, AGENT_DIR).mode = 0o750;
    entry(unix.host, AGENT_DIR).gid = 990;
    expect(refusals(unix.l, unix.host)[0]).toContain('is not readable by dedalo-pubhost (the agent)');
    const tls = site(tlsDeclaration());
    entry(tls.host, AGENT_DIR).mode = 0o750;
    entry(tls.host, AGENT_DIR).gid = 990;
    accepted(tls.l, tls.host);
  });
});

describe('rule 1: the way down, and the pinned runtimes', () => {
  test('Ubuntu home: /home/<site> root 0750 → refused for every account that goes through it; 0751 (traverse only) → ok', () => {
    const { l, host } = site();
    entry(host, SITE).mode = 0o750;
    expect(refusals(l, host)).toEqual([
      `'${SITE}' cannot be traversed by dedalo-pubhost (the agent) — chmod o+x ${SITE}`,
      `'${SITE}' cannot be traversed by dedalo-api-v2 (v2) — chmod o+x ${SITE}`,
      `'${SITE}' cannot be traversed by dedalo-api-v1 (v1) — chmod o+x ${SITE}`,
    ]);
    entry(host, SITE).mode = 0o751;
    accepted(l, host);
  });

  test('a directory above state_root alone is judged for EACH of the agent, v2 and v1 (each leg on its own)', () => {
    const l = derive({ ...siteDeclaration(), state_root: '/srv/pub_only/state' });
    const host = new FakeHost(l);
    entry(host, '/srv/pub_only').mode = 0o700; // only state_root lies below it
    expect(refusals(l, host)).toEqual([
      `'/srv/pub_only' cannot be traversed by dedalo-pubhost (the agent) — chmod o+x /srv/pub_only`,
      `'/srv/pub_only' cannot be traversed by dedalo-api-v2 (v2) — chmod o+x /srv/pub_only`,
      `'/srv/pub_only' cannot be traversed by dedalo-api-v1 (v1) — chmod o+x /srv/pub_only`,
    ]);
    entry(host, '/srv/pub_only').mode = 0o711;
    accepted(l, host);
  });

  test("the operator's real host: home root 0751 (traverse only) + host_agent root:root 0750 → only host_agent is refused", () => {
    const { l, host } = site();
    entry(host, SITE).mode = 0o751;
    entry(host, AGENT_DIR).mode = 0o750;
    expect(refusals(l, host)).toEqual([
      `'${AGENT_DIR}' is not readable by dedalo-pubhost (the agent) — chmod -R u=rwX,go=rX ${AGENT_DIR}`,
    ]);
    entry(host, AGENT_DIR).mode = 0o755; // what chmod -R u=rwX,go=rX gives the directory
    accepted(l, host);
  });

  test('a directory above agent_dir alone (nothing else lies below it) is judged for the agent', () => {
    const l = derive(unixDeclaration()); // agent_dir /opt/dedalo/publication/host_agent
    const host = new FakeHost(l);
    entry(host, '/opt/dedalo').mode = 0o700;
    expect(refusals(l, host)).toEqual([`'/opt/dedalo' cannot be traversed by dedalo-pubhost (the agent) — chmod o+x /opt/dedalo`]);
  });

  test('a group-owned ancestor: the account in that group traverses it, the others are told the class that applies', () => {
    const { l, host } = site();
    entry(host, SITE).mode = 0o750;
    entry(host, SITE).gid = 33; // www-data: v1's primary
    expect(refusals(l, host)).toEqual([
      `'${SITE}' cannot be traversed by dedalo-pubhost (the agent) — chmod o+x ${SITE}`,
      `'${SITE}' cannot be traversed by dedalo-api-v2 (v2) — chmod o+x ${SITE}`,
    ]);
  });

  test('bun_bin not executable by v2 → refused for v2 (it runs v2 and the scratch boot) and the agent', () => {
    const { l, host } = site();
    entry(host, BUN).mode = 0o744;
    expect(refusals(l, host)).toEqual([
      `bun_bin '${BUN}' is not executable by dedalo-pubhost (the agent) — chmod o+x ${BUN}`,
      `bun_bin '${BUN}' is not executable by dedalo-api-v2 (v2) — chmod o+x ${BUN}`,
    ]);
    entry(host, BUN).mode = 0o750;
    entry(host, BUN).gid = 991; // root:<v2 group> 0750: v2 by Group=, the agent by SupplementaryGroups=
    accepted(l, host);
  });

  test('an ancestor of bun_bin only v2 cannot cross is named for v2 alone', () => {
    const { l, host } = site();
    entry(host, `${SITE}/.bun`).mode = 0o750;
    entry(host, `${SITE}/.bun`).gid = 1000; // the engine group: the agent's Group=
    expect(refusals(l, host)).toEqual([`'${SITE}/.bun' cannot be traversed by dedalo-api-v2 (v2) — chmod o+x ${SITE}/.bun`]);
  });

  test('php_bin is judged for the agent (the v1 syntax check), never for v2', () => {
    const { l, host } = site();
    entry(host, l.v1!.phpBin).mode = 0o700;
    expect(refusals(l, host)).toEqual([
      `php_bin '${l.v1!.phpBin}' is not readable and executable by dedalo-pubhost (the agent) — chmod o+rx ${l.v1!.phpBin}`,
    ]);
  });

  test("an account whose groups cannot be read is refused, not assumed", () => {
    const { l, host } = site();
    host.accountGroups.delete('dedalo-api-v1');
    expect(refusals(l, host)).toEqual([
      "the groups of user 'dedalo-api-v1' (v1.user) could not be read (id -G dedalo-api-v1) — this host's user database does not answer",
    ]);
  });

  test("state_root's OWN tree is the provisioner's (MODES): drift there is planned, not refused", () => {
    const { l, host } = site();
    host.seedDir(l.state.root);
    entry(host, l.state.root).mode = 0o700;
    expect(accessRefusals(l, host.state())).toEqual([]);
    expect(plan(l, host.state())).toContainEqual({ op: 'chmod', path: l.state.root, mode: 0o755 });
  });
});

describe("rule 2: engine_group is the work system's group (unix only)", () => {
  const withGroup = (group: string, base: HostDeclaration = unixDeclaration()) => {
    const l = derive({ ...base, engine_group: group });
    return { l, host: new FakeHost(l) };
  };
  const line = (group: string, is: string) =>
    `engine_group '${group}' is ${is} — it must be the work system's group: id -gn <the account that runs Dédalo>`;

  test("the agent's own primary group → refused", () => {
    const { l, host } = withGroup('dedalo-pubhost');
    expect(refusals(l, host)).toEqual([line('dedalo-pubhost', "the agent's own group")]);
  });

  test("the v1 user's primary group → refused", () => {
    const { l, host } = withGroup('www-data');
    expect(refusals(l, host)).toEqual([line('www-data', "the v1 user's group")]);
  });

  test('the v2 group → refused', () => {
    const { l, host } = withGroup('dedalo-api-v2');
    expect(refusals(l, host)).toEqual([line('dedalo-api-v2', 'the v2 group')]);
  });

  test("the v2 user's own primary group (when it is not v2.group) → refused", () => {
    const { l, host } = withGroup('v2own');
    host.groups.set('v2own', 1234);
    host.accountGroups.set('dedalo-api-v2', { primary: 1234, all: [1234, 991] });
    expect(refusals(l, host)).toEqual([line('v2own', "the v2 user's group")]);
  });

  test("the work system's group → ok", () => {
    const { l, host } = withGroup('dedalo');
    accepted(l, host);
    expect(engineGroupRefusal(l, host.state())).toBeNull();
  });

  test('a tls listener has no socket group: rule 2 is not applied', () => {
    const tls = derive(tlsDeclaration());
    const host = new FakeHost(tls);
    accepted(tls, host);
    const forged: AgentLayout = { ...tls, identity: { ...tls.identity, engineGroup: 'dedalo-pubhost' } };
    expect(engineGroupRefusal(forged, host.state())).toBeNull();
    const unix = derive({ ...unixDeclaration(), engine_group: 'dedalo-pubhost' });
    expect(engineGroupRefusal(unix, host.state())).toBe(line('dedalo-pubhost', "the agent's own group"));
  });
});
