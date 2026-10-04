import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUDIT_DIR,
  AUDIT_FILE_NAME,
  INSTANCE_MARKER,
  PUBLICATION_API_DIR,
  PreflightRefused,
  RULES_DIR,
  STATE_SUBDIRS,
  STATE_TREE_OWNERSHIP,
  auditAncestryProblem,
  bootPreflight,
  markerContent,
  probeAppendOnly,
} from '../src/instance/roots';
import { freshScratch } from './fixtures/instance';

const UID = process.getuid?.() ?? null;

/** A preflight config for a scratch root; the suite's mode unless overridden. */
const cfg = (root: string, instance = 'test') => ({ INSTANCE: instance, STATE_ROOT: root, NODE_ENV: 'test' as const });

/** A complete, valid state root one level below a fresh scratch corner. */
async function validRoot(name: string): Promise<string> {
  const root = join(await freshScratch(name), 'state');
  mkdirSync(root);
  chmodSync(root, 0o755);
  writeFileSync(join(root, INSTANCE_MARKER), markerContent('test'));
  for (const dir of STATE_SUBDIRS) {
    mkdirSync(join(root, dir));
    chmodSync(join(root, dir), 0o755);
  }
  return root;
}

function refusal(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PreflightRefused);
    expect((error as Error).message).toEndWith('Nothing was written.');
    return (error as Error).message;
  }
  throw new Error('expected the preflight to refuse');
}

describe('the naming exports', () => {
  test('roles name the same three strings as STATE_SUBDIRS', () => {
    expect([PUBLICATION_API_DIR, RULES_DIR, AUDIT_DIR]).toEqual([...STATE_SUBDIRS]);
    expect(AUDIT_FILE_NAME).toBe('audit.jsonl');
  });
});

describe('bootPreflight', () => {
  test('passes on a valid root and leaves only the (empty) audit file behind', async () => {
    const root = await validRoot('pf_ok');
    expect(() => bootPreflight(cfg(root))).not.toThrow();
    expect(Bun.file(join(root, AUDIT_DIR, AUDIT_FILE_NAME)).size).toBe(0);
  });

  test('refuses root (uid 0)', async () => {
    const root = await validRoot('pf_uid0');
    expect(refusal(() => bootPreflight(cfg(root), { uid: 0 }))).toContain('uid 0');
  });

  test('refuses a relative, missing, symlinked or non-directory root', async () => {
    expect(refusal(() => bootPreflight(cfg('relative/root')))).toContain('absolute');
    const base = await freshScratch('pf_shape');
    expect(refusal(() => bootPreflight(cfg(join(base, 'missing'))))).toContain('does not exist');
    symlinkSync(await validRoot('pf_link'), join(base, 'link'));
    expect(refusal(() => bootPreflight(cfg(join(base, 'link'))))).toContain('symlink');
    writeFileSync(join(base, 'file'), '');
    expect(refusal(() => bootPreflight(cfg(join(base, 'file'))))).toContain('not a directory');
  });

  test('refuses a root marked for another instance, and an unmarked one', async () => {
    const root = await validRoot('pf_marker');
    expect(refusal(() => bootPreflight(cfg(root, 'other')))).toContain('another instance');
    rmSync(join(root, INSTANCE_MARKER));
    expect(refusal(() => bootPreflight(cfg(root)))).toContain('does not declare itself');
  });

  test('refuses a group- or world-writable root or child', async () => {
    const root = await validRoot('pf_mode');
    chmodSync(root, 0o775);
    expect(refusal(() => bootPreflight(cfg(root)))).toContain('group- or world-writable');
    chmodSync(root, 0o755);
    chmodSync(join(root, RULES_DIR), 0o757);
    expect(refusal(() => bootPreflight(cfg(root)))).toContain(`STATE_ROOT/${RULES_DIR}`);
  });

  test('refuses a root owned by another uid', async () => {
    const root = await validRoot('pf_owner');
    expect(UID).not.toBeNull();
    expect(refusal(() => bootPreflight(cfg(root), { uid: (UID as number) + 1 }))).toContain('wrong user');
  });

  test('refuses a missing child directory', async () => {
    const root = await validRoot('pf_child');
    rmSync(join(root, PUBLICATION_API_DIR), { recursive: true });
    expect(refusal(() => bootPreflight(cfg(root)))).toContain(`STATE_ROOT/${PUBLICATION_API_DIR}`);
  });

  test('refuses an unwritable child (the EROFS shape) and a symlinked audit trail', async () => {
    expect(UID).not.toBe(0); // the suite never runs as root
    const root = await validRoot('pf_write');
    chmodSync(join(root, RULES_DIR), 0o555);
    expect(refusal(() => bootPreflight(cfg(root)))).toContain('not writable');
    chmodSync(join(root, RULES_DIR), 0o755);
    symlinkSync('/etc/hosts', join(root, AUDIT_DIR, AUDIT_FILE_NAME));
    expect(refusal(() => bootPreflight(cfg(root)))).toContain('cannot be appended');
  });
});

describe('the audit trail is append-only by the filesystem (enforce mode)', () => {
  test('enforce is the default outside NODE_ENV=test, and an audit directory the agent owns is refused', async () => {
    const root = await validRoot('pf_audit_dir');
    // The scratch audit/ is owned by the running (non-root) uid: exactly an agent-owned directory.
    expect(refusal(() => bootPreflight({ ...cfg(root), NODE_ENV: 'production' }))).toContain('not root');
  });

  test("the 'suite' audit protection is refused outside NODE_ENV=test", async () => {
    const root = await validRoot('pf_audit_mode');
    expect(
      refusal(() => bootPreflight({ ...cfg(root), NODE_ENV: 'production' }, { auditProtection: 'suite' })),
    ).toContain('NODE_ENV=test');
  });

  test('enforce: a missing, symlinked or truncatable audit file is refused, and none is created or touched', async () => {
    expect(UID).not.toBeNull();
    const root = await validRoot('pf_audit_file');
    // rootUid = the running uid stands in for "audit/ is root-owned" so the FILE checks are reached unprivileged.
    const enforce = { auditProtection: 'enforce' as const, rootUid: UID as number };
    const file = join(root, AUDIT_DIR, AUDIT_FILE_NAME);

    expect(refusal(() => bootPreflight(cfg(root), enforce))).toContain('does not exist');
    expect(existsSync(file)).toBe(false);

    symlinkSync('/etc/hosts', file);
    expect(refusal(() => bootPreflight(cfg(root), enforce))).toContain('not a regular file');
    rmSync(file);

    writeFileSync(file, 'kept\n', { mode: 0o600 });
    expect(probeAppendOnly(file)).toBe('writable');
    expect(refusal(() => bootPreflight(cfg(root), enforce))).toContain('without O_APPEND');
    expect(readFileSync(file, 'utf8')).toBe('kept\n');
  });
});

describe('the audit trail cannot be moved aside (enforce mode): every ancestor is root-owned', () => {
  // Renaming a directory needs write permission only on its PARENT: a root-owned audit/
  // inside an agent-writable STATE_ROOT (or under any agent-writable ancestor) can be
  // renamed aside, trail and all, and a fresh one put in its place.
  type Entry = { uid: number; mode: number; link?: boolean };
  const DIR = 0o040000;
  const LNK = 0o120000;
  function fakeFs(tree: Record<string, Entry>, real: Record<string, string> = {}) {
    return {
      lstat: (path: string) => {
        const e = tree[path];
        if (e === undefined) throw Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' });
        return { uid: e.uid, mode: (e.link ? LNK : DIR) | e.mode, isSymbolicLink: () => e.link === true };
      },
      realpath: (path: string) => real[path] ?? path,
    };
  }
  const safe: Record<string, Entry> = {
    '/': { uid: 0, mode: 0o755 },
    '/var': { uid: 0, mode: 0o755 },
    '/var/lib': { uid: 0, mode: 0o755 },
    '/var/lib/dph': { uid: 0, mode: 0o755 },
    '/var/lib/dph/state': { uid: 0, mode: 0o755 },
  };
  const AUDIT = '/var/lib/dph/state/audit';

  test('a root-owned, non-writable chain passes; a sticky world-writable ancestor is fine', () => {
    expect(auditAncestryProblem(AUDIT, 0, fakeFs(safe))).toBeNull();
    expect(auditAncestryProblem(AUDIT, 0, fakeFs({ ...safe, '/var': { uid: 0, mode: 0o1777 } }))).toBeNull();
  });

  test.each([
    ['an agent-owned STATE_ROOT', '/var/lib/dph/state', { uid: 1001, mode: 0o755 }, 'owned by uid 1001'],
    ['an agent-owned ancestor', '/var/lib/dph', { uid: 1001, mode: 0o755 }, 'owned by uid 1001'],
    ['a group-writable STATE_ROOT', '/var/lib/dph/state', { uid: 0, mode: 0o775 }, 'writable'],
    ['a world-writable ancestor without the sticky bit', '/var', { uid: 0, mode: 0o777 }, 'writable'],
    ['a symlinked ancestor owned by the agent', '/var/lib', { uid: 1001, mode: 0o777, link: true }, 'owned by uid 1001'],
  ])('refuses %s', (_name, path, entry, expected) => {
    const problem = auditAncestryProblem(AUDIT, 0, fakeFs({ ...safe, [path]: entry as Entry }));
    expect(problem).toContain(path);
    expect(problem).toContain(expected);
  });

  test('the REAL chain is walked too: a symlinked ancestor resolving into an agent-owned tree is refused', () => {
    const tree = {
      ...safe,
      '/var/lib': { uid: 0, mode: 0o777, link: true },
      '/home': { uid: 0, mode: 0o755 },
      '/home/agent': { uid: 1001, mode: 0o700 },
      '/home/agent/lib': { uid: 0, mode: 0o755 },
      '/home/agent/lib/dph': { uid: 0, mode: 0o755 },
      '/home/agent/lib/dph/state': { uid: 0, mode: 0o755 },
    };
    const real = { '/var/lib/dph/state': '/home/agent/lib/dph/state' };
    expect(auditAncestryProblem(AUDIT, 0, fakeFs(tree, real))).toContain("'/home/agent' is owned by uid 1001");
  });

  test('bootPreflight enforces it: an append-only trail under a world-writable ancestor is refused', async () => {
    expect(UID).not.toBeNull();
    const corner = await freshScratch('pf_audit_ancestry');
    const root = join(corner, 'state');
    mkdirSync(root);
    chmodSync(root, 0o755);
    writeFileSync(join(root, INSTANCE_MARKER), markerContent('test'));
    for (const dir of STATE_SUBDIRS) {
      mkdirSync(join(root, dir));
      chmodSync(join(root, dir), 0o755);
    }
    writeFileSync(join(root, AUDIT_DIR, AUDIT_FILE_NAME), '', { mode: 0o600 });
    chmodSync(corner, 0o777);
    try {
      const message = refusal(() =>
        bootPreflight(cfg(root), {
          auditProtection: 'enforce',
          rootUid: UID as number,
          // Stands in for chattr +a, which an unprivileged suite cannot set.
          appendOnlyProbe: () => 'append_only',
        }),
      );
      expect(message).toContain('assertAuditTrail');
      expect(message).toContain(`'${corner}'`);
      expect(message).toContain('renamed');
    } finally {
      chmodSync(corner, 0o755);
    }
  });
});

describe('the ownership rule (STATE_TREE_OWNERSHIP), shared with the provisioner', () => {
  test('is the one statement of who owns what in the state tree', () => {
    expect(STATE_TREE_OWNERSHIP).toEqual({
      stateRoot: 'root',
      publicationApi: 'root',
      rules: 'agent',
      audit: 'root',
      auditFile: 'agent',
    });
    expect(Object.isFrozen(STATE_TREE_OWNERSHIP)).toBe(true);
  });

  test('root-owned entries are accepted when owned by root; agent-owned rules/ must be the agent', async () => {
    // rootUid := the test uid stands in for root; uid := another uid plays the agent.
    const root = await validRoot('pf_rootown');
    const message = refusal(() =>
      bootPreflight(cfg(root), { uid: (UID as number) + 1, rootUid: UID as number }),
    );
    // STATE_ROOT and publication_api passed as root-owned; the first refusal is rules/.
    expect(message).toContain(`STATE_ROOT/${RULES_DIR}`);
    expect(message).toContain('wrong user');
  });

  test('publication_api takes no write probe (root-owned on a provisioned host)', async () => {
    const root = await validRoot('pf_apiro');
    chmodSync(join(root, PUBLICATION_API_DIR), 0o555);
    expect(() => bootPreflight(cfg(root))).not.toThrow();
  });
});
