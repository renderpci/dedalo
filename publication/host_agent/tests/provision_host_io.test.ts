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
import { INSTANCE_MARKER, WEB_CONFIGTEST_BINARY, derive } from '../src/provision/layout';
import type { Action } from '../src/provision/plan';
import { RENDERERS, plan as planWith } from '../src/provision/plan';
import type { Renderer } from '../src/provision/render/types';
import { PENDING_FACTS } from '../src/provision/render/types';
import { sudoersRenderer } from '../src/provision/render/sudoers';
import { unixDeclaration } from './fixtures/provision_declaration';

const uid = process.getuid?.() ?? 0;
const gid = process.getgid?.() ?? 0;
const ok = { code: 0, stdout: '', stderr: '' };
/** What the stub's `chattr +a` sealed; the paired probe reports exactly these. */
const sealed = new Set<string>();

/** Stateful units: once Task 9's units are rendered, a second plan must see the first apply's enable/start. */
const units = new Map<string, { enabled: boolean; active: boolean }>();
const unitOf = (unit: string) => units.get(unit) ?? { enabled: false, active: false };

const stubExec: ProvisionExec = {
  userId: () => uid,
  groupId: () => gid,
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
          sudoersRenderer.render({ ...l, web: { ...l.web, configtestBin: WEB_CONFIGTEST_BINARY[l.web.server] } }, facts),
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
    },
  });
  // The configtest binary is derived (/usr/sbin/...), the one host fact a scratch tree cannot
  // own; it alone is pointed into the scratch tree.
  layout = { ...derived, web: { ...derived.web, configtestBin: join(SCRATCH, 'bin/apachectl') } };
  // …which the real sudoers renderer refuses: the scratch gate's renderers stand in (above).
  expect(() => sudoersRenderer.render(layout, PENDING_FACTS)).toThrow(/is not '\/usr\/sbin\/apachectl'/);
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe('hostIo + observeHost on a real tree', () => {
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
    expect(statSync(layout.state.apis.v1.shared).mode & 0o7777).toBe(0o750);
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
