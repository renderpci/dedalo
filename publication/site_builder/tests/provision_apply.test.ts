/**
 * THE APPLY GATE — what has to be true of the one module that changes a host.
 *
 * `plan()` decides and `apply()` executes, so the properties below are the executing half,
 * and each of them is a way a museum's site goes down when it is not held:
 *
 *   1. A FULL APPLY REALLY LANDS. Directories exist with the mode and owner §3's matrix
 *      names, every rendered artifact holds exactly the bytes its renderer produced, the
 *      served links point where a publish expects them, and the commands run in the ORDER
 *      the plan gave them — never a sorted one, because the order is where the law lives
 *      (the group before the `useradd --gid` that names it; the config test before the
 *      reload it guards).
 *   2. A SECOND APPLY DOES NOTHING, and it is gated BY COUNTING io CALLS rather than by
 *      reading the report the same code wrote. Zero writes, zero chowns, zero chmods, zero
 *      reloads. A provisioner that reloads a museum's web server on every scheduled run is
 *      one an operator learns to ignore.
 *   3. ONE CHANGED BYTE IS ONE REWRITTEN FILE, named. `check` reports it and writes
 *      nothing; `apply` rewrites exactly it, and SAYS the edit was reverted rather than
 *      reverting it quietly — an artifact that survives a re-render is a second source of
 *      truth, and one that is silently reverted is a second source of truth that wins on
 *      the day nobody is watching.
 *   4. A FAILED CONFIG TEST RELOADS NOTHING. One bad vhost does not take down one site; it
 *      takes down every site the web server serves, this museum's and every other museum's
 *      on the box.
 *   5. A CREDENTIAL IS NEVER INVENTED, NEVER REWRITTEN, AND NEVER PRINTED. A file only an
 *      operator can supply is reported as awaiting and the run writes nothing for it; a
 *      minted token and a hashed password appear in no report, no outcome and no error.
 *
 * HOW THE HOST IS FAKED. Every absolute path in the committed declaration is relocated
 * under a temporary prefix, so `/etc/dedalo_sites/…` becomes `<tmp>/etc/dedalo_sites/…` and
 * the run is a real filesystem exercise of the real code. Two things cannot be real without
 * root, and both are injected rather than skipped: OWNERSHIP (the io seam records what
 * `chown` was asked for and reports it back through `stat`, which is what makes "the second
 * run performs zero mutating calls" a fact about `apply` and not about the machine), and
 * COMMANDS (`exec` is stubbed over a small fake host, so `groupadd` and `systemctl enable`
 * change what the next observation sees, exactly as they would on a real box).
 *
 * The plan is the REAL `plan()`, from a HostState this file observes off the fake host. A
 * plan spelled by hand here would drift from the planner the day it changed, and the
 * idempotence property — the one that makes this tool safe to schedule — is a property of
 * the two modules together or of neither.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  apply,
  check,
  observeHost,
  type ExecResult,
  type PathFacts,
  type ProvisionIo,
} from '../src/provision/apply';
import {
  INSTANCE_MARKER,
  derive,
  markerContent,
  type InstanceLayout,
  type InstanceManifest,
} from '../src/provision/layout';
import {
  changesTheHost,
  observedPaths,
  plan,
  type Action,
  type EntryType,
  type HostState,
  type PathObservation,
} from '../src/provision/plan';
import { renderAll, type Artifact } from '../src/provision/render';
import { parseManifest } from '../src/provision/schema';

/** The one committed declaration. The gate provisions THAT, not a manifest of its own. */
const EXAMPLE = join(import.meta.dir, '..', 'deploy', 'examples', 'instance.example.json');

/** Values that must never reach a report, an outcome or an error. */
const PASSWORD_VALUE = 'zzz-provision-gate-password-zzz';
const CREDENTIAL_VALUE = 'zzz-provision-gate-credential-zzz';
const MINTED_TOKEN = 'zzz-provision-gate-minted-token-zzz';
const HASH_PREFIX = '$2y$fake$';

const temporaryPrefixes: string[] = [];

afterAll(() => {
  for (const prefix of temporaryPrefixes) rmSync(prefix, { recursive: true, force: true });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * A host, under a temporary prefix
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Every absolute path in the declaration, moved under the prefix. Nothing else changes. */
function relocate(value: unknown, prefix: string): unknown {
  if (typeof value === 'string') return value.startsWith('/') ? join(prefix, value) : value;
  if (Array.isArray(value)) return value.map(entry => relocate(entry, prefix));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        relocate(entry, prefix),
      ]),
    );
  }
  return value;
}

/** What the stubbed commands change. A `groupadd` that did not is a plan that repeats. */
interface FakeHost {
  readonly users: Set<string>;
  readonly groups: Set<string>;
  unitEnabled: boolean;
  unitActive: boolean;
}

interface Instance {
  readonly prefix: string;
  readonly layout: InstanceLayout;
  readonly manifest: InstanceManifest;
  readonly artifacts: readonly Artifact[];
  readonly host: FakeHost;
}

/**
 * A synthetic host: the committed declaration, relocated, plus the four `paths` the example
 * leaves at their defaults — they default to real system directories, and a gate that
 * provisioned into `/etc/systemd/system` would be a gate nobody could run twice.
 */
function makeInstance(): Instance {
  const prefix = mkdtempSync(join(tmpdir(), 'dedalo-provision-apply-'));
  temporaryPrefixes.push(prefix);

  const raw = relocate(JSON.parse(readFileSync(EXAMPLE, 'utf8')), prefix) as Record<string, unknown>;
  raw.paths = {
    config_base: join(prefix, 'etc/dedalo_sites/instances'),
    state_base: join(prefix, 'var/lib/dedalo_sites'),
    unit_dir: join(prefix, 'etc/systemd/system'),
    vhost_dir: join(prefix, 'etc/nginx/sites-available'),
  };

  const manifest = parseManifest(raw);
  const layout = derive(manifest);
  return {
    prefix,
    layout,
    manifest,
    artifacts: renderAll(layout, manifest),
    host: { users: new Set(), groups: new Set(), unitEnabled: false, unitActive: false },
  };
}

/** Put a file on the synthetic host with a stated owner, group and mode. */
function plant(
  io: RecordingIo,
  path: string,
  body: string,
  owner: string,
  group: string,
  mode: number,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf8');
  io.access.set(path, { owner, group, mode });
}

/**
 * Every credential the declaration names EXCEPT the shared bearer, which the provisioner
 * mints. A museum places these by hand; a gate that skipped them would only ever exercise
 * the `awaiting` path and would never reach the htpasswd recipe.
 */
function credentialPaths(layout: InstanceLayout): string[] {
  const paths = [
    ...Object.values(layout.secrets),
    ...(layout.serving.preprod.auth?.users ?? []).map(user => user.password_file),
  ];
  const apiKey = layout.envVars.PUBLICATION_API_KEY_FILE;
  if (apiKey) paths.push(apiKey);
  return [...new Set(paths)];
}

function placeCredentials(instance: Instance, io: RecordingIo): void {
  for (const path of credentialPaths(instance.layout)) {
    const isPassword = (instance.layout.serving.preprod.auth?.users ?? []).some(
      user => user.password_file === path,
    );
    plant(io, path, `${isPassword ? PASSWORD_VALUE : CREDENTIAL_VALUE}\n`, 'root', 'root', 0o600);
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The io seam, recording
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface RecordingIo extends ProvisionIo {
  /** How many times each door was opened. The idempotence gate is a row of zeroes here. */
  readonly calls: Record<
    'stat' | 'readFile' | 'mkdir' | 'writeFile' | 'symlink' | 'chown' | 'chmod' | 'exec',
    number
  >;
  /** Every command, verbatim and in order. */
  readonly execLog: string[][];
  /** Every path whose bytes were read — a credential must not appear without a reason. */
  readonly reads: string[];
  /** Ownership and mode, which a suite running as a normal user cannot get from the disk. */
  readonly access: Map<string, { owner: string; group: string; mode: number }>;
}

function entryType(path: string): EntryType {
  const entry = lstatSync(path);
  return entry.isSymbolicLink()
    ? 'symlink'
    : entry.isDirectory()
      ? 'dir'
      : entry.isFile()
        ? 'file'
        : 'other';
}

/**
 * THE FAKE HOST IS ROOTED AT THE PREFIX. The declaration's paths were relocated when the
 * instance was built, but `/run` cannot be: `RuntimeDirectory=` is resolved by systemd under
 * /run and nowhere else, so `layout.ts` refuses to make it a knob (a field whose only legal
 * value is its default is a trap, not an option). The io therefore maps anything outside the
 * prefix INTO it — the runtime directory the plan creates is a real directory in the fake
 * host, and nothing this suite does can touch the real /run.
 */
function makeIo(
  instance: Instance,
  intercept?: (argv: readonly string[]) => ExecResult | null,
): RecordingIo {
  const host = instance.host;
  const on = (path: string): string => onHost(instance, path);
  const access = new Map<string, { owner: string; group: string; mode: number }>();
  const calls = {
    stat: 0,
    readFile: 0,
    mkdir: 0,
    writeFile: 0,
    symlink: 0,
    chown: 0,
    chmod: 0,
    exec: 0,
  };
  const execLog: string[][] = [];
  const reads: string[] = [];

  return {
    calls,
    execLog,
    reads,
    access,
    stat(path: string): PathFacts | null {
      calls.stat += 1;
      const real_path = on(path);
      if (!existsSync(real_path) && !isBrokenLink(real_path)) return null;
      const recorded = access.get(path);
      const real = lstatSync(real_path);
      return {
        type: entryType(real_path),
        // Unrecorded means nobody has chowned it here, which on a real host is root's.
        mode: recorded?.mode ?? real.mode & 0o7777,
        owner: recorded?.owner ?? 'root',
        group: recorded?.group ?? 'root',
      };
    },
    readFile(path: string): string | null {
      calls.readFile += 1;
      reads.push(path);
      try {
        return readFileSync(on(path), 'utf8');
      } catch {
        return null;
      }
    },
    mkdir(path: string): void {
      calls.mkdir += 1;
      mkdirSync(on(path), { recursive: true });
    },
    writeFile(path: string, body: string, mode: number): void {
      calls.writeFile += 1;
      mkdirSync(dirname(on(path)), { recursive: true });
      writeFileSync(on(path), body, 'utf8');
      const recorded = access.get(path);
      access.set(path, { owner: recorded?.owner ?? 'root', group: recorded?.group ?? 'root', mode });
    },
    symlink(path: string, target: string): void {
      calls.symlink += 1;
      symlinkSync(target, on(path));
    },
    chown(path: string, owner: string, group: string): void {
      calls.chown += 1;
      const recorded = access.get(path);
      access.set(path, { owner, group, mode: recorded?.mode ?? lstatSync(on(path)).mode & 0o7777 });
    },
    chmod(path: string, mode: number): void {
      calls.chmod += 1;
      const recorded = access.get(path);
      access.set(path, { owner: recorded?.owner ?? 'root', group: recorded?.group ?? 'root', mode });
    },
    // The two non-deterministic operations, made deterministic. A gate that could predict a
    // real token would be a gate demanding the token be predictable; these stubs exist so
    // the SECRECY can be asserted — the value is written and never reported — without the
    // value ever being random here.
    mintToken(): string {
      return MINTED_TOKEN;
    },
    hashPassword(password: string): string {
      // Derived from the password on purpose: a leak of the plaintext through the hash would
      // then be visible to the secrecy assertions below rather than hidden behind a constant.
      return `${HASH_PREFIX}${password.length}`;
    },
    exec(argv: readonly string[]): ExecResult {
      calls.exec += 1;
      execLog.push([...argv]);
      const forced = intercept?.(argv);
      if (forced) return forced;
      // The fake host CHANGES: a `groupadd` that left the group missing would make every
      // second plan repeat itself, and the idempotence gate would be measuring nothing.
      const line = argv.join(' ');
      if (argv[0] === 'groupadd') host.groups.add(argv[argv.length - 1]!);
      if (argv[0] === 'useradd') host.users.add(argv[argv.length - 1]!);
      if (line.startsWith('systemctl enable')) host.unitEnabled = true;
      if (line.startsWith('systemctl start') || line.startsWith('systemctl restart')) {
        host.unitActive = true;
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  };
}

/** Where a logical host path really lives in this suite: inside the instance's prefix. */
function onHost(instance: Instance, path: string): string {
  return path.startsWith(instance.prefix) ? path : join(instance.prefix, path);
}

/** A symlink whose target does not exist still EXISTS, and `existsSync` says otherwise. */
function isBrokenLink(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Observing the synthetic host
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The same shape `observeHost()` produces, read off the FAKE host: ownership from the io's
 * own record (a suite is not root), and users, groups and unit state from what the stubbed
 * commands did. Content is whitelisted exactly as the real observer whitelists it — the
 * artifacts and the markers, never a credential.
 */
function observe(instance: Instance, io: RecordingIo): HostState {
  const { layout } = instance;
  const contentful = new Set<string>([
    ...instance.artifacts.map(artifact => artifact.path),
    ...[
      layout.roots.workspaces,
      layout.roots.home,
      layout.roots.audit,
      ...layout.sites.map(site => site.webspace),
    ].map(root => join(root, INSTANCE_MARKER)),
  ]);

  const entries: Record<string, PathObservation> = {};
  for (const path of observedPaths(layout)) {
    const facts = io.stat(path);
    if (!facts) continue;
    const real = onHost(instance, path);
    entries[path] = {
      type: facts.type,
      mode: facts.mode,
      owner: facts.owner,
      group: facts.group,
      ...(contentful.has(path) ? { content: readFileSync(real, 'utf8') } : {}),
      ...(facts.type === 'symlink' ? { target: readlinkSync(real) } : {}),
      ...(facts.type === 'dir' ? { empty: readdirSync(real).length === 0 } : {}),
      mtimeMs: lstatSync(real).mtimeMs,
    };
  }

  return {
    users: [...instance.host.users],
    groups: [...instance.host.groups, layout.identity.webGroup, layout.identity.engineGroup],
    entries,
    unitEnabled: instance.host.unitEnabled,
    unitActive: instance.host.unitActive,
    htpasswdUsers: existsSync(onHost(instance, layout.htpasswd))
      ? readFileSync(onHost(instance, layout.htpasswd), 'utf8')
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => line.slice(0, line.indexOf(':')))
      : undefined,
    nologinShell: '/usr/sbin/nologin',
    webServerUnit: 'nginx',
  };
}

/** The io the gates run against: real bytes, recorded ownership, stubbed commands. */
function provision(
  instance: Instance,
  io: RecordingIo,
): { actions: Action[]; report: ReturnType<typeof apply> } {
  const actions = plan(instance.layout, instance.manifest, observe(instance, io));
  return { actions, report: apply(actions, io) };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. A full apply lands
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a full apply against a synthetic host', () => {
  const instance = makeInstance();
  const io = makeIo(instance);
  placeCredentials(instance, io);
  const { actions, report } = provision(instance, io);

  test('every action succeeds', () => {
    // The failing detail, not a bare boolean: a red gate must say WHICH step and WHY, or
    // the next reader has to reproduce it by hand.
    expect(report.failure?.detail ?? null).toBeNull();
    expect(report.ok).toBe(true);
    expect(report.changed).toBe(true);
    expect(report.awaiting).toEqual([]);
  });

  test('every rendered artifact holds exactly the bytes the renderer produced', () => {
    for (const artifact of instance.artifacts) {
      expect(readFileSync(artifact.path, 'utf8')).toBe(artifact.body);
      expect(report.written).toContain(artifact.path);
      expect(io.access.get(artifact.path)).toEqual({
        owner: artifact.owner,
        group: artifact.group,
        mode: artifact.mode,
      });
    }
  });

  test('the webspaces are setgid 2750, owned by the service user and the web group', () => {
    // The one mode in §3 whose bits are load-bearing twice over: without setgid a published
    // release is unreadable by the web server, and with the world bits open every uid on the
    // host can read a museum's UNPUBLISHED preprod tree.
    for (const site of instance.layout.sites) {
      expect(io.access.get(site.webspace)).toEqual({
        owner: instance.layout.identity.user,
        group: instance.layout.identity.webGroup,
        mode: 0o2750,
      });
    }
  });

  test('every root declares itself with a marker naming this instance', () => {
    for (const root of [
      instance.layout.roots.workspaces,
      instance.layout.roots.home,
      instance.layout.roots.audit,
      ...instance.layout.sites.map(site => site.webspace),
    ]) {
      expect(readFileSync(join(root, INSTANCE_MARKER), 'utf8')).toBe(
        markerContent(instance.layout.instance),
      );
    }
  });

  test('the served links exist before the web server is asked to serve them', () => {
    for (const site of instance.layout.sites) {
      for (const surface of ['preprod', 'prod'] as const) {
        const link = site.linkPath(surface);
        expect(lstatSync(link).isSymbolicLink()).toBe(true);
      }
    }
  });

  test('the commands run in the order the plan gave them, never a sorted one', () => {
    const planned = actions
      .filter(action => 'argv' in action)
      .map(action => (action as { argv: readonly string[] }).argv.join(' '));
    expect(io.execLog.map(argv => argv.join(' '))).toEqual(planned);

    // The two orderings that are the point: the group before the useradd that names it with
    // --gid, and the config test immediately before the reload it guards.
    const commands = io.execLog.map(argv => argv.join(' '));
    const groupAt = commands.findIndex(command => command.startsWith('groupadd'));
    const userAt = commands.findIndex(command => command.startsWith('useradd'));
    expect(groupAt).toBeGreaterThanOrEqual(0);
    expect(groupAt).toBeLessThan(userAt);
    expect(commands[userAt]).toContain(`--gid ${instance.layout.identity.group}`);

    const testAt = commands.findIndex(command => command === 'nginx -t');
    const reloadAt = commands.findIndex(command => command.startsWith('systemctl reload'));
    expect(testAt).toBeGreaterThanOrEqual(0);
    expect(reloadAt).toBe(testAt + 1);
  });

  test('the report accounts for every action, in order', () => {
    expect(report.outcomes.length).toBe(actions.length);
    expect(report.outcomes.map(outcome => outcome.action)).toEqual(actions);
  });

  test('no credential value, hash or minted token appears in the report', () => {
    // A report is printed to a terminal and pasted into a ticket. This is the assertion
    // that keeps it safe to do so.
    const printed = JSON.stringify(report);
    expect(printed).not.toContain(CREDENTIAL_VALUE);
    expect(printed).not.toContain(PASSWORD_VALUE);
    expect(printed).not.toContain(MINTED_TOKEN);
    expect(printed).not.toContain(HASH_PREFIX);
  });

  test('the minted bearer token is on disk, 0600 root:root, and nowhere else', () => {
    const tokenPath = instance.layout.secretPath('SERVICE_TOKEN');
    expect(readFileSync(tokenPath, 'utf8')).toBe(`${MINTED_TOKEN}\n`);
    expect(io.access.get(tokenPath)).toEqual({ owner: 'root', group: 'root', mode: 0o600 });
  });

  test('the htpasswd holds a hash and never the password', () => {
    const htpasswd = readFileSync(instance.layout.htpasswd, 'utf8');
    expect(htpasswd).toContain(`preview:${HASH_PREFIX}`);
    expect(htpasswd).not.toContain(PASSWORD_VALUE);
  });

  test('a credential the provisioner did not place is never read for its bytes', () => {
    // The password files ARE read — hashing them is the recipe. Nothing else is.
    const passwords = new Set(
      (instance.layout.serving.preprod.auth?.users ?? []).map(user => user.password_file),
    );
    for (const path of credentialPaths(instance.layout)) {
      if (passwords.has(path)) continue;
      expect(io.reads).not.toContain(path);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. A second apply does nothing — counted, not reported
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a second apply', () => {
  const instance = makeInstance();
  const io = makeIo(instance);
  placeCredentials(instance, io);
  provision(instance, io);

  const before = { ...io.calls };
  const { actions, report } = provision(instance, io);
  const performed = {
    mkdir: io.calls.mkdir - before.mkdir,
    writeFile: io.calls.writeFile - before.writeFile,
    symlink: io.calls.symlink - before.symlink,
    chown: io.calls.chown - before.chown,
    chmod: io.calls.chmod - before.chmod,
    exec: io.calls.exec - before.exec,
  };

  test('the settled host produces a plan that changes nothing', () => {
    expect(actions.filter(changesTheHost)).toEqual([]);
    expect(check(actions).willChange).toBe(false);
  });

  test('performs zero writes, zero chowns, zero chmods and zero commands', () => {
    // Counted, not reported. A report that says "nothing changed" is a claim by the same
    // code that would have done the changing; these six zeroes are a fact.
    expect(performed).toEqual({
      mkdir: 0,
      writeFile: 0,
      symlink: 0,
      chown: 0,
      chmod: 0,
      exec: 0,
    });
    expect(report.written).toEqual([]);
    expect(report.changed).toBe(false);
    expect(report.ok).toBe(true);
  });

  test('the audit trail written since the first run is untouched', () => {
    // The audit FILE is created once and handed over; the daemon appends to it. A
    // provisioner that compared its content would truncate a museum's record of itself.
    writeFileSync(instance.layout.auditFile, '{"event":"a real audit line"}\n', 'utf8');
    provision(instance, io);
    expect(readFileSync(instance.layout.auditFile, 'utf8')).toBe('{"event":"a real audit line"}\n');
  });

  test('the minted bearer token is not re-minted', () => {
    // Re-minting silently breaks the engine pairing the value already serves.
    expect(readFileSync(instance.layout.secretPath('SERVICE_TOKEN'), 'utf8')).toBe(
      `${MINTED_TOKEN}\n`,
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. One changed byte is one rewritten file
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a hand edit in exactly one artifact', () => {
  const instance = makeInstance();
  const io = makeIo(instance);
  placeCredentials(instance, io);
  provision(instance, io);

  const edited = instance.artifacts.find(artifact => artifact.kind === 'env')!;
  writeFileSync(edited.path, `${readFileSync(edited.path, 'utf8')}HAND_EDIT=1\n`, 'utf8');

  const actions = plan(instance.layout, instance.manifest, observe(instance, io));

  test('exactly one file is planned for rewriting, and it is that one', () => {
    const writes = actions.filter(
      action => action.kind === 'file' && action.disposition === 'rewrite',
    );
    expect(writes.length).toBe(1);
    expect((writes[0] as { path: string }).path).toBe(edited.path);
  });

  test('check names it and writes NOTHING', () => {
    const onDisk = readFileSync(edited.path, 'utf8');
    const report = check(actions);

    expect(report.writes.map(entry => entry.path)).toContain(edited.path);
    expect(report.willChange).toBe(true);
    expect(report.awaiting).toEqual([]);
    // The dry run takes no io at all — the signature says so, and the bytes agree.
    expect(readFileSync(edited.path, 'utf8')).toBe(onDisk);
  });

  test('apply rewrites exactly that file, and SAYS the edit was reverted', () => {
    const before = { ...io.calls };
    const report = apply(actions, io);

    expect(io.calls.writeFile - before.writeFile).toBe(1);
    expect(report.written).toEqual([edited.path]);
    expect(readFileSync(edited.path, 'utf8')).toBe(edited.body);

    const outcome = report.outcomes.find(
      entry => entry.action.kind === 'file' && entry.action.path === edited.path,
    )!;
    expect(outcome.status).toBe('done');
    // Reverting in silence is how a second source of truth survives to win later.
    expect(outcome.detail).toContain('hand_edited');
    expect(outcome.detail).toContain(edited.path);
  });

  test('the other artifacts are left byte for byte alone', () => {
    for (const artifact of instance.artifacts) {
      expect(readFileSync(artifact.path, 'utf8')).toBe(artifact.body);
    }
  });
});

describe('an artifact replaced wholesale', () => {
  test('a file with no stamp is reported as unstamped, by name, and re-rendered', () => {
    const instance = makeInstance();
    const io = makeIo(instance);
    placeCredentials(instance, io);
    provision(instance, io);

    const vhost = instance.artifacts.find(artifact => artifact.kind === 'nginx_vhost')!;
    writeFileSync(vhost.path, 'server {\n  # hand written in 2019, nobody remembers why\n}\n');

    const { report } = provision(instance, io);
    const outcome = report.outcomes.find(
      entry => entry.action.kind === 'file' && entry.action.path === vhost.path,
    )!;

    expect(outcome.status).toBe('done');
    expect(outcome.detail).toContain('unstamped');
    expect(readFileSync(vhost.path, 'utf8')).toBe(vhost.body);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. A failed config test reloads nothing
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a failing web-server configuration test', () => {
  const instance = makeInstance();
  const vhost = instance.artifacts.find(artifact => artifact.kind === 'nginx_vhost')!;
  const io = makeIo(instance, argv =>
    argv.join(' ') === 'nginx -t'
      ? { code: 1, stdout: '', stderr: `nginx: [emerg] unexpected "}" in ${vhost.path}:42\n` }
      : null,
  );
  placeCredentials(instance, io);
  const { report } = provision(instance, io);

  test('the run fails at the config test, and the failure names the file', () => {
    expect(report.ok).toBe(false);
    expect(report.failure?.action.kind).toBe('exec');
    expect(report.failure?.detail).toContain('web_configtest');
    expect(report.failure?.detail).toContain(vhost.path);
    expect(report.failure?.detail).toContain('NOTHING was reloaded');
  });

  test('the web server is NOT reloaded', () => {
    expect(io.execLog.map(argv => argv.join(' ')).filter(line => line.includes('reload'))).toEqual([
      'systemctl daemon-reload',
    ]);
  });

  test('everything after the failure is reported as not attempted', () => {
    const after = report.outcomes.slice(
      report.outcomes.findIndex(outcome => outcome === report.failure) + 1,
    );
    expect(after.length).toBeGreaterThan(0);
    for (const outcome of after) {
      expect(outcome.status).toBe('skipped');
      expect(outcome.detail).toContain('not attempted');
    }
  });

  test('what was already written stays written — a failure does not roll back', () => {
    // §4's words: a failure leaves the previous state intact and NAMES the step. Undoing
    // would mean deleting files on a museum's host to recover from a command that failed.
    expect(readFileSync(vhost.path, 'utf8')).toBe(vhost.body);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. A credential only an operator can supply
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a declared credential with no file', () => {
  const instance = makeInstance();
  const io = makeIo(instance);
  // Deliberately NOT placed: this is the museum that has not pasted its provider key yet.
  const { actions, report } = provision(instance, io);

  test('the plan says the file is awaited and apply writes nothing for it', () => {
    const missing = Object.values(instance.layout.secrets);
    expect(missing.length).toBeGreaterThan(0);
    for (const path of missing) {
      expect(report.awaiting).toContain(path);
      expect(existsSync(path)).toBe(false);
    }
  });

  test('it is a skip with a reason, never a silent pass', () => {
    for (const outcome of report.outcomes) {
      if (outcome.action.kind !== 'file' || outcome.action.disposition !== 'awaiting') continue;
      expect(outcome.status).toBe('skipped');
      expect(outcome.detail).toContain('AWAITING AN OPERATOR');
    }
    // `check` says the same thing before anything runs, which is the point of a dry run.
    expect(check(actions).awaiting).toEqual([...report.awaiting]);
  });

  test('the provisioner never invents one', () => {
    for (const path of Object.values(instance.layout.secrets)) {
      expect(io.reads).not.toContain(path);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. The observer
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('observeHost', () => {
  const instance = makeInstance();
  const io = makeIo(instance);
  placeCredentials(instance, io);
  provision(instance, io);

  test('reads the host, and never the bytes of a credential', () => {
    const state = observeHost(instance.layout, instance.manifest);

    // It sees what is there, with the shape `plan()` consumes…
    expect(state.entries[instance.layout.unitPath]?.type).toBe('file');
    expect(state.entries[instance.layout.roots.workspaces]?.type).toBe('dir');
    expect(state.entries[instance.layout.unitPath]?.content).toBe(
      instance.artifacts.find(artifact => artifact.kind === 'unit')!.body,
    );
    expect(state.entries[instance.layout.sites[0]!.linkPath('prod')]?.type).toBe('symlink');

    // …and it declines to look inside a credential file, in any mode, ever.
    const printed = JSON.stringify(state);
    expect(printed).not.toContain(CREDENTIAL_VALUE);
    expect(printed).not.toContain(PASSWORD_VALUE);
    expect(printed).not.toContain(MINTED_TOKEN);
    for (const path of credentialPaths(instance.layout)) {
      expect(state.entries[path]?.content).toBeUndefined();
    }
  });

  test('a path it cannot stat is OMITTED, never reported blank', () => {
    // `PathObservation` says why: a blank observation reads as drift, and "I did not look"
    // must never read as "it was correct".
    const state = observeHost(instance.layout, instance.manifest);
    for (const [path, observation] of Object.entries(state.entries)) {
      expect(existsSync(path) || isBrokenLink(path)).toBe(true);
      expect(observation.mode).toBeGreaterThanOrEqual(0);
      expect(typeof observation.owner).toBe('string');
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE OBSERVER READS EVERY ARTIFACT, BECAUSE ITS LIST IS DERIVED FROM THE RENDERERS.
 *
 * `contentfulPaths()` was a second hand-maintained census of the rendered artifacts,
 * sitting beside RENDERERS — the same two-independent-derivations defect this subsystem
 * exists to delete. It had already drifted: the site table arrived as a sixth artifact and
 * was never added, so `sites.json` — the file that tells the daemon where every museum's
 * webspace is — was written once and then never drift-checked again.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the drift census covers every rendered artifact', () => {
  test('every artifact the renderers produce has its bytes observed', () => {
    const instance = makeInstance();
    const io = makeIo(instance);
    placeCredentials(instance, io);
    provision(instance, io);

    const state = observeHost(instance.layout, instance.manifest);
    for (const artifact of renderAll(instance.layout, instance.manifest)) {
      const observed = state.entries[artifact.path];
      expect({ path: artifact.path, seen: observed?.content !== undefined }).toEqual({
        path: artifact.path,
        seen: true,
      });
    }
  });

  test('the site table specifically is drift-checked like any other artifact', () => {
    // The one that had already slipped through. Named on its own so a future artifact
    // cannot quietly take its place in the general assertion above.
    const instance = makeInstance();
    const io = makeIo(instance);
    placeCredentials(instance, io);
    provision(instance, io);

    const table = renderAll(instance.layout, instance.manifest).find(a => a.path.endsWith('sites.json'));
    expect(table).toBeDefined();
    const state = observeHost(instance.layout, instance.manifest);
    expect(state.entries[table!.path]?.content).toBe(table!.body);
  });
});
