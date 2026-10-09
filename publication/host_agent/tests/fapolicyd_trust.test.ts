/**
 * THE FAPOLICYD TRUST SET (src/provision/fapolicyd_trust.ts) on REAL scratch trees: what one
 * instance asks fapolicyd to trust is DERIVED from its layout — bun_bin, agent_dir, each served
 * API's `current` and the store's `previous` — walked by name, never through a link, and refused
 * whole when a root is a link, a release holds a hard link, or a path cannot be carried. The file
 * rendering, its ownership guard, the daemon wait and the fapolicyd.conf parser are held here too.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExecResult, TrustExec } from '../src/provision/exec_contract';
import {
  TRUST_KIND,
  TRUST_RELEASE_ID,
  commitTrust,
  deriveTrust,
  dumpLists,
  parseTrustResult,
  pendingEntry,
  realTrustIo,
  renderTrustFile,
  renderTrustResult,
  trustFilePath,
  trustFileProblem,
  trustLine,
  trustLinesOf,
  trustRootsOf,
} from '../src/provision/fapolicyd_trust';
import { parseStamp, stamp } from '../src/provision/hash';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { polkitRenderer } from '../src/provision/render/polkit';
import { PENDING_FACTS } from '../src/provision/render/types';
import { FAPOLICYD_DEFAULTS, STRICT_INTEGRITY, parseFapolicydConf } from '../src/provision/init/parse/fapolicyd';
import { RELEASE_ID } from '../src/releases/store';
import { scratchPath } from './fixtures/instance';
import { unixDeclaration, v2OnlySiteDeclaration } from './fixtures/provision_declaration';

const R = scratchPath('fapolicyd_trust');
const BUN = join(R, 'bin', 'bun');
const AGENT = join(R, 'agent');
const STATE = join(R, 'state');
const API = join(STATE, 'publication_api');

afterAll(() => rmSync(R, { recursive: true, force: true }));

function declaration(overrides: Partial<HostDeclaration> = {}): HostDeclaration {
  return { ...unixDeclaration(), agent_dir: AGENT, state_root: STATE, bun_bin: BUN, ...overrides };
}
function layoutOf(decl: HostDeclaration = declaration()): AgentLayout {
  return derive(decl, { fapolicyd: true });
}

function file(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}
function at(path: string, seconds: number): void {
  utimesSync(path, seconds, seconds);
}
const sha = (body: string) => createHash('sha256').update(body).digest('hex');

/** Releases: v1 r_a current (with its D8 link); v2 old (oldest), prev, cur (current). */
function seed(): void {
  rmSync(R, { recursive: true, force: true });
  file(BUN, 'BUN-BINARY');
  file(join(AGENT, 'package.json'), '{"name":"agent"}');
  file(join(AGENT, 'src', 'index.ts'), 'export {};');
  mkdirSync(join(AGENT, 'node_modules', '.bin'), { recursive: true });
  symlinkSync('../zod/bin.js', join(AGENT, 'node_modules', '.bin', 'zod'));
  file(join(AGENT, 'node_modules', 'zod', 'index.js'), 'module.exports = {};');
  // v1: one release, linked config (D8) as install.ts makes it.
  file(join(API, 'v1', 'shared', 'server_config_api.php'), '<?php // secret');
  file(join(API, 'v1', 'releases', '7.0.1_aaaaaaa', 'json', 'index.php'), '<?php echo 1;');
  mkdirSync(join(API, 'v1', 'releases', '7.0.1_aaaaaaa', 'config_api'), { recursive: true });
  symlinkSync(join(API, 'v1', 'shared', 'server_config_api.php'), join(API, 'v1', 'releases', '7.0.1_aaaaaaa', 'config_api', 'server_config_api.php'));
  symlinkSync('releases/7.0.1_aaaaaaa', join(API, 'v1', 'current'));
  // v2: three releases; current = cur; the newest other = prev; old is neither.
  for (const [id, t] of [['2.0.0_0000000', 1000], ['2.0.1_1111111', 2000], ['2.0.2_2222222', 3000]] as const) {
    file(join(API, 'v2', 'releases', id, 'src', 'index.ts'), `// ${id}`);
    file(join(API, 'v2', 'releases', id, 'node_modules', 'dep', 'index.js'), `// dep of ${id}`);
    at(join(API, 'v2', 'releases', id), t);
  }
  symlinkSync('releases/2.0.2_2222222', join(API, 'v2', 'current'));
}

const paths = (layout: AgentLayout = layoutOf()) => {
  const derived = deriveTrust(trustRootsOf(layout), realTrustIo());
  if (derived.kind !== 'ok') throw new Error(`refused: ${derived.reasons.join('; ')}`);
  return derived;
};
/** The release-scoped refusals of an otherwise trusted set; `id` must be out of the set. */
const leftOut = (id: string, layout: AgentLayout = layoutOf()): string => {
  const derived = paths(layout);
  expect(derived.releases.some(release => release.endsWith(`:${id}`))).toBe(false);
  expect(derived.entries.some(entry => entry.path.includes(`/${id}/`))).toBe(false);
  // The code is still trusted.
  expect(derived.entries.some(entry => entry.path === BUN)).toBe(true);
  return derived.refused.join('\n');
};
const refusal = (layout: AgentLayout = layoutOf()): string => {
  const derived = deriveTrust(trustRootsOf(layout), realTrustIo());
  if (derived.kind !== 'refused') throw new Error('expected a refusal');
  return derived.reasons.join('\n');
};

beforeEach(seed);

describe('the trust set is derived, never named', () => {
  test('bun_bin, every regular file of agent_dir, the polkit rule, current + previous of each served API — nothing else', () => {
    const derived = paths();
    expect(derived.entries.map(entry => entry.path)).toEqual(
      [
        BUN,
        layoutOf().polkitPath,
        join(AGENT, 'node_modules', 'zod', 'index.js'),
        join(AGENT, 'package.json'),
        join(AGENT, 'src', 'index.ts'),
        join(API, 'v1', 'releases', '7.0.1_aaaaaaa', 'json', 'index.php'),
        join(API, 'v2', 'releases', '2.0.1_1111111', 'node_modules', 'dep', 'index.js'),
        join(API, 'v2', 'releases', '2.0.1_1111111', 'src', 'index.ts'),
        join(API, 'v2', 'releases', '2.0.2_2222222', 'node_modules', 'dep', 'index.js'),
        join(API, 'v2', 'releases', '2.0.2_2222222', 'src', 'index.ts'),
      ].sort(),
    );
    expect(derived.releases).toEqual(['v1:7.0.1_aaaaaaa', 'v2:2.0.2_2222222', 'v2:2.0.1_1111111']);
    // The D8 config link and node_modules/.bin are links: counted, never trusted, never followed.
    expect(derived.skippedLinks).toBe(2);
    expect(derived.entries.some(entry => entry.path.includes('/shared/'))).toBe(false);
  });

  test('each entry is the file as read: size and sha256', () => {
    const entry = paths().entries.find(row => row.path === BUN);
    expect(entry).toEqual({ path: BUN, size: 'BUN-BINARY'.length, sha256: sha('BUN-BINARY') });
  });

  test('right after a commit the release under test is the previous one: trusted BEFORE it runs, the old previous dropped', () => {
    file(join(API, 'v2', 'releases', '2.0.3_3333333', 'src', 'index.ts'), '// under test');
    at(join(API, 'v2', 'releases', '2.0.3_3333333'), 4000);
    const derived = paths();
    expect(derived.releases).toEqual(['v1:7.0.1_aaaaaaa', 'v2:2.0.2_2222222', 'v2:2.0.3_3333333']);
    expect(derived.entries.some(row => row.path.includes('2.0.1_1111111'))).toBe(false);
  });

  test('a mtime tie picks the greater id, as the store does', () => {
    at(join(API, 'v2', 'releases', '2.0.0_0000000'), 2000);
    expect(paths().releases.at(-1)).toBe('v2:2.0.1_1111111');
  });

  test('nothing installed yet: bun_bin, agent_dir and the polkit rule only', () => {
    rmSync(API, { recursive: true, force: true });
    const derived = paths();
    expect(derived.releases).toEqual([]);
    const polkit = layoutOf().polkitPath;
    expect(derived.entries.every(row => row.path === BUN || row.path === polkit || row.path.startsWith(`${AGENT}/`))).toBe(true);
  });

  test('the polkit rule is trusted by the bytes the provisioner RENDERS, never read from disk (measured, RHEL 10.2: with allow_filesystem_mark = 1 polkitd could not load an untrusted rules file and every reload asked for authentication)', () => {
    const layout = layoutOf();
    const [rendered] = polkitRenderer.render(layout, PENDING_FACTS);
    const entry = paths(layout).entries.find(row => row.path === layout.polkitPath);
    // The file does not exist here (a first apply derives before it writes): still trusted, by content.
    expect(entry).toEqual({ path: layout.polkitPath, size: Buffer.byteLength(rendered?.body ?? ''), sha256: sha(rendered?.body ?? '') });
    // And it names exactly this instance's grant.
    expect(rendered?.body).toContain(`subject.user !== ${JSON.stringify(layout.identity.agentUser)}`);
  });

  test('a v2-only instance trusts no v1 tree, even one left on disk', () => {
    const layout = layoutOf({ ...v2OnlySiteDeclaration(), agent_dir: AGENT, state_root: STATE, bun_bin: BUN });
    expect(paths(layout).releases).toEqual(['v2:2.0.2_2222222', 'v2:2.0.1_1111111']);
  });

  test('nginx conf_d: root map renderer Bun when it is installed', () => {
    const layout = layoutOf(declaration({ web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' }, paths: { host_base: join(R, 'host') } }));
    expect(paths(layout).entries.some(row => row.path === join(R, 'host', 'map_renderer', 'bun'))).toBe(false);
    file(join(R, 'host', 'map_renderer', 'bun'), 'RENDERER-BUN');
    expect(paths(layout).entries.find(row => row.path === join(R, 'host', 'map_renderer', 'bun'))?.sha256).toBe(sha('RENDERER-BUN'));
    // Not this instance's renderer on apache (another instance's apply installed it): never named.
    const apache = layoutOf(declaration({ paths: { host_base: join(R, 'host') } }));
    expect(paths(apache).entries.some(row => row.path.includes('map_renderer'))).toBe(false);
  });

  test('a link inside a tree names nothing outside it: the target is not trusted', () => {
    file(join(R, 'outside', 'evil.ts'), 'evil');
    symlinkSync(join(R, 'outside', 'evil.ts'), join(API, 'v2', 'releases', '2.0.2_2222222', 'src', 'evil.ts'));
    symlinkSync(join(R, 'outside'), join(AGENT, 'src', 'outside'));
    const derived = paths();
    expect(derived.entries.some(row => row.path.includes('evil') || row.path.includes('/outside/'))).toBe(false);
    expect(derived.skippedLinks).toBe(4);
  });
});

describe('the CODE that cannot be verified refuses the WHOLE set (nothing is written)', () => {
  test('bun_bin a link', () => {
    rmSync(BUN);
    symlinkSync('/bin/sh', BUN);
    expect(refusal()).toContain(`bun_bin '${BUN}' is a symlink, not a regular file`);
  });

  test('bun_bin absent', () => {
    rmSync(BUN);
    expect(refusal()).toContain('is absent');
  });

  test('agent_dir a link', () => {
    rmSync(AGENT, { recursive: true, force: true });
    symlinkSync(join(R, 'bin'), AGENT);
    expect(refusal()).toContain(`agent_dir '${AGENT}' is a symlink, not a real directory`);
  });

  test('state_root a link: never followed', () => {
    mkdirSync(join(R, 'elsewhere'), { recursive: true });
    rmSync(STATE, { recursive: true, force: true });
    symlinkSync(join(R, 'elsewhere'), STATE);
    expect(refusal()).toContain(`state_root '${STATE}' is a symlink`);
  });

  test('a path a trust line cannot carry, in the agent tree', () => {
    file(join(AGENT, 'src', 'a b.ts'), 'x');
    expect(refusal()).toContain('has a character a fapolicyd trust line cannot carry');
  });

  test('a fifo or a socket in a tree', () => {
    Bun.spawnSync(['mkfifo', join(AGENT, 'src', 'pipe')]);
    expect(refusal()).toContain('is not a regular file, a directory or a link');
  });

  test('an unlistable directory', () => {
    const io = realTrustIo();
    const derived = deriveTrust(trustRootsOf(layoutOf()), { ...io, readDir: path => (path.endsWith('/src') ? null : io.readDir(path)) });
    expect(derived.kind === 'refused' && derived.reasons.some(reason => reason.includes('cannot be listed'))).toBe(true);
  });

  test('a file that changes or vanishes while it is hashed', () => {
    const io = realTrustIo();
    const derived = deriveTrust(trustRootsOf(layoutOf()), { ...io, hashFile: path => (path === BUN ? null : io.hashFile(path)) });
    expect(derived.kind === 'refused' && derived.reasons.join()).toContain('could not be read whole');
  });
});

describe('a RELEASE that cannot be verified is left out, named — the code and the other releases stay trusted', () => {
  test('a releases directory that is a link: no release of that API', () => {
    rmSync(join(API, 'v2', 'releases'), { recursive: true, force: true });
    mkdirSync(join(R, 'elsewhere'), { recursive: true });
    symlinkSync(join(R, 'elsewhere'), join(API, 'v2', 'releases'));
    const derived = paths();
    expect(derived.releases).toEqual(['v1:7.0.1_aaaaaaa']);
    expect(derived.refused.join()).toContain('the v2 releases');
    expect(derived.refused.join()).toContain('no v2 release is trusted');
  });

  test('a release directory that is a link: current names no real directory', () => {
    rmSync(join(API, 'v2', 'releases', '2.0.2_2222222'), { recursive: true, force: true });
    symlinkSync(join(R, 'outside'), join(API, 'v2', 'releases', '2.0.2_2222222'));
    expect(leftOut('2.0.2_2222222')).toContain('names releases/2.0.2_2222222, which is not a real directory');
  });

  test("current that is not releases/<id>, or not a link (the drill's v1 probe found the first)", () => {
    rmSync(join(API, 'v2', 'current'));
    symlinkSync('../../../outside', join(API, 'v2', 'current'));
    expect(paths().refused.join()).toContain("points at '../../../outside', not releases/<id>");
    rmSync(join(API, 'v2', 'current'));
    symlinkSync('releases/0.0.0_drill00', join(API, 'v2', 'current'));
    expect(paths().refused.join()).toContain('not releases/<id>');
    rmSync(join(API, 'v2', 'current'));
    mkdirSync(join(API, 'v2', 'current'));
    const derived = paths();
    expect(derived.refused.join()).toContain('is a dir, not the release link');
    expect(derived.releases).toEqual(['v1:7.0.1_aaaaaaa']);
  });

  test('a hard-linked file in a release tree (bundles carry none) — but not in the root-owned agent tree', () => {
    file(join(R, 'outside', 'target.js'), 'x');
    linkSync(join(R, 'outside', 'target.js'), join(API, 'v2', 'releases', '2.0.2_2222222', 'src', 'hard.js'));
    const reasons = leftOut('2.0.2_2222222');
    expect(reasons).toContain('is hard-linked (2 links) — a release tree holds none');
    expect(reasons).toContain('v2 release 2.0.2_2222222 is not trusted');
    expect(paths().releases).toEqual(['v1:7.0.1_aaaaaaa', 'v2:2.0.1_1111111']);
    rmSync(join(API, 'v2', 'releases', '2.0.2_2222222', 'src', 'hard.js'));
    linkSync(join(R, 'outside', 'target.js'), join(AGENT, 'node_modules', 'zod', 'hard.js'));
    expect(paths().entries.some(row => row.path.endsWith('zod/hard.js'))).toBe(true);
  });

  test('a path a trust line cannot carry, in a release', () => {
    file(join(API, 'v2', 'releases', '2.0.1_1111111', 'src', 'a b.ts'), 'x');
    expect(leftOut('2.0.1_1111111')).toContain('has a character a fapolicyd trust line cannot carry');
  });
});

describe('the trust file', () => {
  test('stamped for its instance, one sorted `path size sha256` line per entry, comments fapolicyd skips', () => {
    const derived = paths();
    const text = renderTrustFile('test', derived);
    const parsed = parseStamp(text);
    expect(parsed?.kind).toBe(TRUST_KIND);
    expect(parsed?.instance).toBe('test');
    expect(trustLinesOf(text)).toEqual(derived.entries.map(trustLine));
    expect(trustLinesOf(text).every(line => /^\/\S+ \d+ [0-9a-f]{64}$/.test(line))).toBe(true);
    expect(text.split('\n').filter(line => line.startsWith('#')).length).toBeGreaterThan(1);
    expect(trustFilePath('test')).toBe('/etc/fapolicyd/trust.d/dedalo_test');
    expect(layoutOf().trust?.file).toBe(trustFilePath('test'));
  });

  test('ours or refused: no stamp, another instance, another kind, a hand edit', () => {
    const text = renderTrustFile('test', paths());
    expect(trustFileProblem('test', '/t', text)).toBeNull();
    expect(trustFileProblem('test', '/t', null)).toContain('could not be read');
    expect(trustFileProblem('test', '/t', '# AUTOGENERATED FILE VERSION 3\n/x 1 aa\n')).toContain('no stamp');
    expect(trustFileProblem('other', '/t', text)).toContain("stamped for 'test fapolicyd_trust'");
    expect(trustFileProblem('test', '/t', stamp('env', 'test', 'X=1\n'))).toContain("'test env'");
    expect(trustFileProblem('test', '/t', `${text}/etc/shadow 1 ${'0'.repeat(64)}\n`)).toContain('edited by hand');
  });

  test('pendingEntry: the last line the new file adds; null when it only removes', () => {
    const before = renderTrustFile('test', paths());
    file(join(AGENT, 'src', 'zz_new.ts'), 'new');
    const after = renderTrustFile('test', paths());
    expect(pendingEntry(before, after)).toBe(`${join(AGENT, 'src', 'zz_new.ts')} 3 ${sha('new')}`);
    expect(pendingEntry(after, before)).toBeNull();
    expect(pendingEntry(null, before)).toBe(trustLinesOf(before).at(-1) ?? null);
  });

  test('dumpLists reads `filedb <path> <size> <sha>` rows only', () => {
    expect(dumpLists('rpmdb /usr/bin/ls 1 aa\nfiledb /x 2 bb\n', '/x 2 bb')).toBe(true);
    expect(dumpLists('rpmdb /x 2 bb\n', '/x 2 bb')).toBe(false);
    expect(dumpLists('filedb /x 2 bbc\n', '/x 2 bb')).toBe(false);
  });

  test('the result record round-trips; a foreign one is null', () => {
    const result = { v: 1 as const, at: '2026-10-09T00:00:00.000Z', outcome: 'applied' as const, entries: 3, skipped_links: 1, releases: ['v2:2.0.2_2222222'], reasons: [] };
    expect(parseTrustResult(renderTrustResult(result))).toEqual(result);
    expect(parseTrustResult(null)).toBeNull();
    expect(parseTrustResult('{"v":1,"outcome":"pwned"}')).toBeNull();
    expect(parseTrustResult('not json')).toBeNull();
  });

  test('the release id grammar is the store RELEASE_ID, respelled', () => {
    expect(TRUST_RELEASE_ID.source).toBe(RELEASE_ID.source);
  });
});

describe('commitTrust: tell the daemon, then wait until it lists the new file', () => {
  function fakeExec(script: { active?: boolean; update?: number; dumps?: string[] }): TrustExec & { calls: string[] } {
    const dumps = [...(script.dumps ?? [])];
    const calls: string[] = [];
    const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });
    return {
      calls,
      fapolicydActive: () => {
        calls.push('is-active');
        return script.active ?? true;
      },
      fapolicydUpdate: () => {
        calls.push('update');
        return script.update === undefined || script.update === 0 ? ok() : { code: script.update, stdout: '', stderr: 'Unable to open fifo' };
      },
      fapolicydDump: () => {
        calls.push('dump');
        return ok(dumps.shift() ?? '');
      },
      sleep: () => {
        calls.push('sleep');
      },
    };
  }

  test('inactive: no update (the daemon reads trust.d when it starts)', () => {
    const exec = fakeExec({ active: false });
    expect(commitTrust(exec, '/x 1 aa')).toEqual({ kind: 'inactive' });
    expect(exec.calls).toEqual(['is-active']);
  });

  test('waits until the dump lists the pending line', () => {
    const exec = fakeExec({ dumps: ['filedb /old 1 aa\n', 'filedb /old 1 aa\nfiledb /x 1 aa\n'] });
    expect(commitTrust(exec, '/x 1 aa', 1000, 10)).toEqual({ kind: 'loaded' });
    expect(exec.calls).toEqual(['is-active', 'update', 'dump', 'sleep', 'dump']);
  });

  test('nothing added: the update alone', () => {
    const exec = fakeExec({});
    expect(commitTrust(exec, null)).toEqual({ kind: 'loaded' });
    expect(exec.calls).toEqual(['is-active', 'update']);
  });

  test('a failed update, and a daemon that never lists it, fail naming why', () => {
    expect(commitTrust(fakeExec({ update: 6 }), '/x 1 aa')).toEqual({ kind: 'failed', why: 'fapolicyd-cli --update exited 6: Unable to open fifo' });
    const late = commitTrust(fakeExec({}), '/x 1 aa', 30, 10);
    expect(late.kind === 'failed' && late.why).toContain("did not load the new trust file within 30 ms (--dump-db does not list '/x')");
  });
});

describe("fapolicyd.conf (init's host.fapolicyd and host.fapolicyd_integrity)", () => {
  test("the shipped RHEL 9.8 file: rpmdb,file and integrity none; the last assignment wins; comments skipped", () => {
    expect(parseFapolicydConf('permissive = 0\ntrust = rpmdb,file\nintegrity = none\nallow_filesystem_mark = 0\n')).toEqual({ trust: ['rpmdb', 'file'], integrity: 'none', filesystemMark: false });
    expect(parseFapolicydConf('allow_filesystem_mark = 1\n').filesystemMark).toBe(true);
    expect(parseFapolicydConf('allow_filesystem_mark = yes\n').filesystemMark).toBe(false);
    expect(parseFapolicydConf('integrity = none\n# integrity = size\nintegrity = sha256 # strict\n').integrity).toBe('sha256');
    expect(parseFapolicydConf('trust = rpmdb\n').trust).toEqual(['rpmdb']);
    expect(parseFapolicydConf('')).toEqual(FAPOLICYD_DEFAULTS);
    expect(STRICT_INTEGRITY).toContain('sha256');
    expect(STRICT_INTEGRITY).not.toContain('size');
  });
});
