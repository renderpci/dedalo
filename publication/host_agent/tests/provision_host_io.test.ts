/**
 * The REAL filesystem doors (hostIo + observeHost) through a full plan → apply → observe →
 * plan cycle, unprivileged, inside a scratch root under .test-tmp/ that is the trust root
 * (the ancestry ABOVE it — the developer's checkout — is not the provisioner's to judge).
 * Every account resolves to the running user, so "root-owned" = owned by this uid and
 * fchown is a no-op the kernel allows; units and commands are stubbed — no systemctl, no
 * sudo. Then:
 *   - the AGENT'S OWN boot preflight accepts the provisioned tree (one ownership rule, two
 *     readers: STATE_TREE_OWNERSHIP);
 *   - a symlink planted between plan and apply — at the leaf, and at the parent — makes
 *     apply refuse, and the link's target keeps its mode;
 *   - the append-only seal goes through the stub (an unprivileged gate cannot set
 *     FS_APPEND_FL); observeHost's probe is paired with it, and the real door refuses a link.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ProvisionExec } from '../src/exec';
import { bootPreflight } from '../src/instance/roots';
import { apply, hostIo, observeHost } from '../src/provision/apply';
import { parseStamp } from '../src/provision/hash';
import type { AgentLayout } from '../src/provision/layout';
import { INSTANCE_MARKER, WEB_CONFIGTEST_CANDIDATES, derive } from '../src/provision/layout';
import type { Action } from '../src/provision/plan';
import { RENDERERS, plan as planWith } from '../src/provision/plan';
import type { Renderer } from '../src/provision/render/types';
import { PENDING_FACTS } from '../src/provision/render/types';
import { sudoersRenderer } from '../src/provision/render/sudoers';
import { unixDeclaration } from './fixtures/provision_declaration';
import { FakeHost } from './support/provision_fake_host';

const uid = process.getuid?.() ?? 0;
const gid = process.getgid?.() ?? 0;
const ok = { code: 0, stdout: '', stderr: '' };
const OWN_PRIMARY_GID = 0x7ffffffe;
/** What the stub's `chattr +a` sealed; the paired probe reports exactly these. */
const sealed = new Set<string>();

/** Stateful units: once Task 9's units are rendered, a second plan must see the first apply's enable/start. */
const units = new Map<string, { enabled: boolean; active: boolean }>();
const unitOf = (unit: string) => units.get(unit) ?? { enabled: false, active: false };

const stubExec: ProvisionExec = {
  userId: () => uid,
  groupId: () => gid,
  // Every group name resolves to this process's gid, so each account's OWN primary group must be
  // another (unused) gid: one the engine group could equal is plan's engine_group refusal.
  userGroups: () => ({ primary: OWN_PRIMARY_GID, all: [OWN_PRIMARY_GID] }),
  unitState: unit => unitOf(unit),
  daemonReload: () => ok,
  enableUnit: unit => {
    units.set(unit, { ...unitOf(unit), enabled: true });
    return ok;
  },
  startUnit: unit => {
    units.set(unit, { ...unitOf(unit), active: true });
    return ok;
  },
  restartUnit: () => ok,
  reloadUnit: () => ok,
  webConfigtest: () => ok,
  visudoCheck: () => ok,
  visudoCheckPolicy: () => ok,
  appendOnly: file => {
    sealed.add(file);
    return ok;
  },
  // spec §2.4's read-only additions: this unix/apache declaration has no site, no nginx map and no
  // SELinux (getenforce absent = 127), so observeHost only asks the systemd version.
  fpmConfigtest: () => ok,
  apacheIncludes: () => ok,
  nginxDump: () => ok,
  selinuxMode: () => ({ code: 127, stdout: '', stderr: 'getenforce: not found' }),
  semanageLocal: () => ok,
  semanageImport: () => ok,
  restorecon: () => ok,
  getsebool: () => ok,
  systemdVersion: () => ({ code: 0, stdout: 'systemd 252 (252.33-1)\n', stderr: '' }),
  semanagePortList: () => ok,
  selinuxLabel: () => ok,
};
const appendOnlyProbe = (path: string): string => (sealed.has(path) ? 'append_only' : 'writable');

let SCRATCH = '';
let layout: AgentLayout;

/** Every directory under `dir` to 0755: the scratch tree must not inherit a group-writable umask. */
function chmodTree(dir: string): void {
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) chmodTree(join(dir, entry.name));
  }
}

/**
 * The configtest binary is pointed into the scratch tree (below), but the real sudoers renderer
 * grants ONLY the canonical path: this gate substitutes it with one rendering the canonical
 * layout's grant, so the production guard is not loosened for a test.
 */
const SCRATCH_RENDERERS: readonly Renderer[] = RENDERERS.map(renderer =>
  renderer.kind !== 'sudoers'
    ? renderer
    : {
        kind: 'sudoers',
        render: (l, facts) =>
          sudoersRenderer.render({ ...l, web: { ...l.web, configtestBin: l.envVars.WEB_CONFIGTEST_BIN ?? '' } }, facts),
      },
);
const plan = (l: AgentLayout, host: ReturnType<typeof observeHost>): Action[] => planWith(l, host, PENDING_FACTS, SCRATCH_RENDERERS);
const observe = () => observeHost(layout, stubExec, { trustRoot: SCRATCH, appendOnlyProbe, renderers: SCRATCH_RENDERERS });
const io = () => hostIo(stubExec, { trustRoot: SCRATCH });

beforeAll(() => {
  const scratch = join(import.meta.dir, '..', '.test-tmp', 'provision_host_io');
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  SCRATCH = realpathSync(scratch);
  writeFileSync(join(SCRATCH, INSTANCE_MARKER), 'test\n');
  for (const dir of ['etc', 'etc/systemd/system', 'etc/sudoers.d', 'etc/polkit-1/rules.d', 'srv', 'bin', 'opt/host_agent/src']) {
    mkdirSync(join(SCRATCH, dir), { recursive: true });
  }
  chmodTree(SCRATCH);
  for (const bin of ['apachectl', 'php', 'bun']) {
    writeFileSync(join(SCRATCH, 'bin', bin), '');
    chmodSync(join(SCRATCH, 'bin', bin), 0o755);
  }
  writeFileSync(join(SCRATCH, 'opt/host_agent/src/index.ts'), '');
  chmodSync(join(SCRATCH, 'opt/host_agent/src/index.ts'), 0o644);
  const derived = derive({
    ...unixDeclaration(),
    agent_dir: join(SCRATCH, 'opt/host_agent'),
    state_root: join(SCRATCH, 'srv/pub'),
    media: { mode: 'copy', root: join(SCRATCH, 'srv/media') },
    php_bin: join(SCRATCH, 'bin/php'),
    bun_bin: join(SCRATCH, 'bin/bun'),
    paths: {
      config_base: join(SCRATCH, 'etc/dedalo_publication_host'),
      unit_dir: join(SCRATCH, 'etc/systemd/system'),
      sudoers_dir: join(SCRATCH, 'etc/sudoers.d'),
      polkit_rules_dir: join(SCRATCH, 'etc/polkit-1/rules.d'),
      // The host-wide base (spec S11) — every plan creates it and its locks: inside the trust root.
      host_base: join(SCRATCH, 'var/lib/dedalo_publication_host/_host'),
    },
  });
  // The configtest binary is derived (/usr/sbin/...), the one host fact a scratch tree cannot
  // own; it alone is pointed into the scratch tree.
  layout = { ...derived, web: { ...derived.web, configtestBin: join(SCRATCH, 'bin/apachectl') } };
  // …which the real sudoers renderer refuses: the scratch gate's renderers stand in (above).
  expect(() => sudoersRenderer.render(layout, PENDING_FACTS)).toThrow(/is not one of \/usr\/sbin\/apache2ctl, \/usr\/sbin\/apachectl/);
  expect(WEB_CONFIGTEST_CANDIDATES.apache).toContain(derived.web.configtestBin);
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe('hostIo + observeHost on a real tree', () => {
  test('a symlinked runtime is observed with its resolved target (the refusal names what to declare)', () => {
    const real = join(SCRATCH, 'bin/php');
    const link = join(SCRATCH, 'bin/php-link');
    const dangling = join(SCRATCH, 'bin/bun-dangling');
    symlinkSync(real, link);
    symlinkSync(join(SCRATCH, 'bin/absent'), dangling);
    try {
      const state = observeHost({ ...layout, phpBin: link, bunBin: dangling }, stubExec, {
        trustRoot: SCRATCH,
        appendOnlyProbe,
        renderers: SCRATCH_RENDERERS,
      });
      expect(state.paths.get(link)).toMatchObject({ type: 'symlink', target: realpathSync(real) });
      expect(state.paths.get(dangling)?.type).toBe('symlink');
      expect(state.paths.get(dangling)?.target).toBeUndefined();
      expect(state.paths.get(real)?.target).toBeUndefined();
    } finally {
      rmSync(link);
      rmSync(dangling);
    }
  });

  test('converges, then observes itself as converged', () => {
    expect(readFileSync(join(SCRATCH, INSTANCE_MARKER), 'utf8')).toBe('test\n');
    const first = plan(layout, observe());
    expect(first.length).toBeGreaterThan(0);
    const report = apply(first, io());
    expect(report.failure).toBeNull();
    expect(plan(layout, observe())).toEqual([]);
  });

  test('modes are what MODES says, not what the umask left', () => {
    expect(statSync(layout.credentialsDir).mode & 0o7777).toBe(0o700);
    expect(statSync(layout.serviceTokenPath).mode & 0o7777).toBe(0o600);
    expect(statSync(layout.envFile).mode & 0o7777).toBe(0o644);
    expect(statSync(layout.state.apis.v1.shared).mode & 0o7777).toBe(0o711);
    expect(statSync(layout.state.audit).mode & 0o7777).toBe(0o755);
    expect(statSync(layout.state.auditFile).mode & 0o7777).toBe(0o600);
    expect([...sealed]).toEqual([layout.state.auditFile]);
    expect(statSync(join(SCRATCH, 'srv/media')).mode & 0o7777).toBe(0o755);
  });

  test('the token is 43 base64url chars, the env file carries our stamp, the audit log is empty', () => {
    expect(readFileSync(layout.serviceTokenPath, 'utf8')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(parseStamp(readFileSync(layout.envFile, 'utf8'))?.kind).toBe('env');
    expect(readFileSync(layout.state.marker, 'utf8')).toBe('test\n');
    expect(readFileSync(layout.state.auditFile, 'utf8')).toBe('');
  });

  test("the agent's own boot preflight accepts the provisioned tree (one ownership rule, two readers)", () => {
    expect(() =>
      bootPreflight({ INSTANCE: 'test', STATE_ROOT: layout.state.root, NODE_ENV: 'test' }, { uid, rootUid: uid }),
    ).not.toThrow();
  });

  test('observeHost never reads the credential', () => {
    expect(observe().contents.has(layout.serviceTokenPath)).toBe(false);
  });

  test('observeHost sees a test scratch tree in agent_dir, and plan refuses it', () => {
    const scratchTree = join(layout.agentDir, '.test-tmp');
    mkdirSync(scratchTree);
    try {
      expect(() => plan(layout, observe())).toThrow(/test scratch tree/);
    } finally {
      rmSync(scratchTree, { recursive: true, force: true });
    }
    expect(plan(layout, observe())).toEqual([]);
  });

  test('observeHost sees a development dependency in agent_dir/node_modules (scoped too), and plan refuses it', () => {
    const modules = join(layout.agentDir, 'node_modules');
    mkdirSync(join(modules, 'zod'), { recursive: true });
    try {
      expect(plan(layout, observe())).toEqual([]); // a runtime dependency is expected there
      for (const name of ['typescript', '@types/bun']) {
        mkdirSync(join(modules, name), { recursive: true });
        try {
          expect(() => plan(layout, observe())).toThrow(/development dependencies/);
        } finally {
          rmSync(join(modules, name), { recursive: true, force: true });
        }
      }
    } finally {
      rmSync(modules, { recursive: true, force: true });
    }
    expect(plan(layout, observe())).toEqual([]);
  });

  test("observeHost walks agent_dir's whole tree, and plan refuses a file the agent cannot read (owner bits: every account is this uid)", () => {
    const tree = observe().agentTree;
    expect(tree.incomplete).toBeNull();
    expect(tree.paths[0]).toBe(layout.agentDir);
    expect(tree.paths).toContain(layout.agentEntry);
    const deep = join(layout.agentDir, 'node_modules', 'zod', 'index.js');
    mkdirSync(join(layout.agentDir, 'node_modules', 'zod'), { recursive: true });
    chmodTree(join(layout.agentDir, 'node_modules'));
    writeFileSync(deep, '');
    chmodSync(deep, 0o044); // group/other may read; the OWNER — this uid, every account here — may not
    try {
      expect(() => plan(layout, observe())).toThrow(
        `agent_dir '${layout.agentDir}' holds 1 entry not readable by dedalo-pubhost (the agent) ('${deep}')`,
      );
      chmodSync(deep, 0o444);
      expect(plan(layout, observe())).toEqual([]);
    } finally {
      rmSync(join(layout.agentDir, 'node_modules'), { recursive: true, force: true });
    }
  });

  test('the walk never leaves the tree through a symlink, and past its cap it REFUSES', () => {
    const link = join(layout.agentDir, 'outside');
    symlinkSync(join(SCRATCH, 'srv'), link);
    try {
      const state = observe();
      expect(state.agentTree.paths).toContain(link);
      expect(state.paths.get(link)?.type).toBe('symlink');
      expect(state.agentTree.paths.some(path => path.startsWith(`${link}/`))).toBe(false);
      expect(plan(layout, state)).toEqual([]);
    } finally {
      unlinkSync(link);
    }
    const capped = observeHost(layout, stubExec, { trustRoot: SCRATCH, appendOnlyProbe, renderers: SCRATCH_RENDERERS, agentTreeCap: 2 });
    expect(capped.agentTree.incomplete).toBe('it holds more than 2 entries');
    expect(() => plan(layout, capped)).toThrow(/could not be walked whole \(it holds more than 2 entries\)/);
  });

  // Root lists anything, so as uid 0 the directory below IS listable and the branch cannot be built.
  test.if(uid !== 0)('a directory in agent_dir that readdir cannot list STOPS the walk and plan REFUSES (non-root only: root lists anything)', () => {
    const locked = join(layout.agentDir, 'locked');
    mkdirSync(join(locked, 'inner'), { recursive: true });
    chmodSync(locked, 0o000);
    try {
      const state = observe();
      expect(state.agentTree.incomplete).toBe(`'${locked}' could not be listed (EACCES)`);
      expect(state.agentTree.paths).toContain(locked);
      expect(() => plan(layout, state)).toThrow(
        `agent_dir '${layout.agentDir}' could not be walked whole ('${locked}' could not be listed (EACCES))`,
      );
    } finally {
      chmodSync(locked, 0o755);
      rmSync(locked, { recursive: true, force: true });
    }
  });

  test.if(uid !== 0)("FakeHost's walk (the plan gates' host) is EQUAL to walkAgentTree on the same real tree: order, links, cap, unlistable", () => {
    // One tree built twice: on disk, and as FakeHost entries. Same answer at every cap.
    const extra = join(layout.agentDir, 'node_modules');
    const outside = join(SCRATCH, 'walk_link_target');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'behind_the_link.js'), '');
    const spec: [string, 'dir' | 'file' | 'symlink'][] = [
      ['node_modules', 'dir'],
      ['node_modules/b', 'dir'],
      ['node_modules/b/index.js', 'file'],
      ['node_modules/a.js', 'file'],
      ['node_modules/link', 'symlink'],
      ['node_modules/c', 'dir'],
      ['node_modules/c/d', 'dir'],
      ['node_modules/c/d/e.js', 'file'],
    ];
    for (const [rel, type] of spec) {
      const path = join(layout.agentDir, rel);
      if (type === 'dir') mkdirSync(path, { recursive: true });
      else if (type === 'file') writeFileSync(path, '');
      else symlinkSync(outside, path);
    }
    chmodTree(extra);
    try {
      const fakeFor = () => {
        const fake = new FakeHost(layout);
        for (const path of [...fake.entries.keys()]) {
          if (path === layout.agentDir || path.startsWith(`${layout.agentDir}/`)) fake.entries.delete(path);
        }
        // Everything the namespace shows below agent_dir, from disk — INCLUDING what is reachable
        // through the link (as `<link>/<name>`), so a walk that entered links would list it.
        const real = (path: string): void => {
          const stats = lstatSync(path);
          const type = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'dir' : 'file';
          fake.entries.set(path, { type, uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o7777, body: '' });
          if (type === 'dir' || (type === 'symlink' && statSync(path).isDirectory())) {
            for (const name of readdirSync(path)) real(join(path, name));
          }
        };
        real(layout.agentDir);
        return fake;
      };
      const full = observe().agentTree;
      for (const cap of [1, 2, 3, 5, 8, full.paths.length, full.paths.length + 1]) {
        const fake = fakeFor();
        fake.agentTreeCap = cap;
        const viaReal = observeHost(layout, stubExec, { trustRoot: SCRATCH, appendOnlyProbe, renderers: SCRATCH_RENDERERS, agentTreeCap: cap });
        expect(fake.state().agentTree).toEqual(viaReal.agentTree);
      }
      const fake = fakeFor();
      const lockedDir = join(extra, 'c');
      fake.unlistable.add(lockedDir);
      chmodSync(lockedDir, 0o000);
      try {
        expect(fake.state().agentTree).toEqual(observe().agentTree);
      } finally {
        chmodSync(lockedDir, 0o755);
      }
    } finally {
      rmSync(extra, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('observeHost asks the user database for each account (id -g / id -G)', () => {
    const groups = observe().accountGroups;
    expect([...groups.keys()].sort()).toEqual(['dedalo-api-v1', 'dedalo-api-v2', 'dedalo-pubhost']);
    expect(groups.get('dedalo-pubhost')).toEqual({ primary: OWN_PRIMARY_GID, all: [OWN_PRIMARY_GID] });
  });
});

describe('root never follows a link planted between plan and apply', () => {
  test('at the leaf: a symlink in place of releases/ — refused, the target keeps its mode', () => {
    const releases = layout.state.apis.v1.releases;
    chmodSync(releases, 0o700);
    const actions = plan(layout, observe());
    expect(actions).toEqual([{ op: 'chmod', path: releases, mode: 0o755 }]);

    const victim = join(SCRATCH, 'victim_file');
    writeFileSync(victim, 'secret');
    chmodSync(victim, 0o600);
    renameSync(releases, `${releases}.moved`);
    symlinkSync(victim, releases);
    try {
      const report = apply(actions, io());
      expect(report.ok).toBe(false);
      expect(report.failure?.detail).toContain('is a symbolic link');
      expect(statSync(victim).mode & 0o777).toBe(0o600);
    } finally {
      unlinkSync(releases);
      renameSync(`${releases}.moved`, releases);
      rmSync(victim, { force: true });
      chmodSync(releases, 0o755);
    }
  });

  test('the append-only seal: a symlink in place of the audit trail — refused, chattr never runs', () => {
    const audit = layout.state.auditFile;
    sealed.delete(audit);
    const actions = plan(layout, observe());
    expect(actions).toEqual([{ op: 'append-only', path: audit }]);

    const victim = join(SCRATCH, 'victim_trail');
    writeFileSync(victim, '');
    renameSync(audit, `${audit}.moved`);
    symlinkSync(victim, audit);
    try {
      const report = apply(actions, io());
      expect(report.ok).toBe(false);
      expect(report.failure?.detail).toContain('is a symbolic link');
      expect(sealed.has(audit)).toBe(false);
    } finally {
      unlinkSync(audit);
      renameSync(`${audit}.moved`, audit);
      rmSync(victim, { force: true });
    }
    expect(apply(plan(layout, observe()), io()).ok).toBe(true);
    expect(plan(layout, observe())).toEqual([]);
  });

  test('at the parent: a symlink in place of publication_api/v1 — refused before anything is opened', () => {
    const apiRoot = layout.state.apis.v1.root;
    const releases = layout.state.apis.v1.releases;
    chmodSync(releases, 0o700);
    const actions = plan(layout, observe());
    expect(actions).toEqual([{ op: 'chmod', path: releases, mode: 0o755 }]);

    renameSync(apiRoot, `${apiRoot}.moved`);
    symlinkSync(`${apiRoot}.moved`, apiRoot);
    try {
      const report = apply(actions, io());
      expect(report.ok).toBe(false);
      expect(report.failure?.detail).toContain(`'${apiRoot}' is not a real directory`);
      expect(statSync(join(`${apiRoot}.moved`, 'releases')).mode & 0o777).toBe(0o700);
    } finally {
      unlinkSync(apiRoot);
      renameSync(`${apiRoot}.moved`, apiRoot);
      chmodSync(releases, 0o755);
    }
    expect(plan(layout, observe())).toEqual([]);
  });
});

/*
 * RULE 1'S ONE EXCEPTION (apply.ts pinnedParentOf): the directory doors on a path whose GRANDPARENT
 * is untrusted and whose parent is root's — the site's web log directory under Ubuntu's rsyslog
 * /var/log (root:syslog 0775). Modelled with a world-writable grandparent (trustProblem treats a
 * foreign owner alike; a non-root gate cannot create one).
 */
describe('the directory doors pin the parent under an untrusted grandparent', () => {
  const tree = () => {
    const grandparent = join(SCRATCH, 'pin', 'var_log');
    const parent = join(grandparent, 'apache2');
    rmSync(join(SCRATCH, 'pin'), { recursive: true, force: true });
    mkdirSync(parent, { recursive: true });
    chmodSync(join(SCRATCH, 'pin'), 0o755);
    chmodSync(grandparent, 0o777);
    chmodSync(parent, 0o750);
    return { grandparent, parent, site: join(parent, 'museum.example.org') };
  };

  test('mkdir, chown and chmod land by name in the pinned parent; the working directory is restored', () => {
    const { site } = tree();
    const cwd = process.cwd();
    io().mkdir(site, 0o700);
    io().chmod(site, 0o755);
    io().chown(site, uid, process.getgid?.() ?? 0);
    expect(statSync(site).isDirectory()).toBe(true);
    expect(statSync(site).mode & 0o777).toBe(0o755);
    expect(process.cwd()).toBe(cwd);
  });

  test('a parent swapped for a link, or one others may write, is refused and nothing is created', () => {
    const { grandparent, parent } = tree();
    const elsewhere = join(SCRATCH, 'pin', 'elsewhere');
    mkdirSync(elsewhere);
    rmSync(parent, { recursive: true });
    symlinkSync(elsewhere, parent);
    expect(() => io().mkdir(join(parent, 'museum.example.org'), 0o755)).toThrow('without following a link');
    expect(readdirSync(elsewhere)).toEqual([]);
    unlinkSync(parent);
    mkdirSync(parent);
    chmodSync(parent, 0o777);
    expect(() => io().mkdir(join(parent, 'museum.example.org'), 0o755)).toThrow('group- or world-writable');
    expect(readdirSync(parent)).toEqual([]);
    // Above the grandparent, rule 1 whole: an untrusted great-grandparent is refused.
    chmodSync(parent, 0o755);
    chmodSync(join(SCRATCH, 'pin'), 0o777);
    expect(() => io().mkdir(join(parent, 'x', 'y'), 0o755)).toThrow('group- or world-writable');
    chmodSync(join(SCRATCH, 'pin'), 0o755);
    expect(grandparent).toContain('var_log');
  });
});
