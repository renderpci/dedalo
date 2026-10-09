/**
 * parse/sudoers.ts — whether the policy the installed sudo reads includes the drop-in directory (spec §3.2 row sudo,
 * §4.3 host.sudo). Captured: Debian's `@includedir`, EL's `#includedir`, Ubuntu 26.04's sudo-rs; typed: an /etc/sudoers-rs.
 */
import { expect, test } from 'bun:test';
import type { SudoersFile } from '../src/provision/init/parse/sudoers';
import { SUDOERS, SUDOERS_RS, hasIncludedir, includedFiles, parseIncludeLine, policyIncludesDir, sudoersFileProblem, sudoFlavor, sudoPolicyFile } from '../src/provision/init/parse/sudoers';
import { fixture } from './fixtures/init/load';

test('Debian 12 (captured) uses @includedir; EL 9 and 10 (captured) #includedir', () => {
  expect(hasIncludedir(fixture('captured/debian12/sudoers'), '/etc/sudoers.d')).toBe(true);
  expect(hasIncludedir(fixture('captured/rocky9/sudoers'), '/etc/sudoers.d')).toBe(true);
  expect(hasIncludedir(fixture('captured/rocky10/sudoers'), '/etc/sudoers.d/')).toBe(true);
});

test('absent, another directory, and the comment forms sudo ignores', () => {
  expect(hasIncludedir('root ALL=(ALL:ALL) ALL\n', '/etc/sudoers.d')).toBe(false);
  expect(hasIncludedir('#includedir /etc/other.d\n', '/etc/sudoers.d')).toBe(false);
  expect(hasIncludedir('##includedir /etc/sudoers.d\n', '/etc/sudoers.d')).toBe(false);
  expect(hasIncludedir('# includedir /etc/sudoers.d\n', '/etc/sudoers.d')).toBe(false);
  expect(hasIncludedir('  #includedir /etc/sudoers.d/\r\n', '/etc/sudoers.d')).toBe(true);
});

/** Each text as a root:root 0440 file (what the stock packages ship). */
function rootFiles(files: Map<string, string>, facts: Record<string, Partial<SudoersFile>> = {}): (path: string) => SudoersFile | null {
  return path => {
    const text = files.get(path);
    return text === undefined ? null : { text, uid: 0, gid: 0, mode: 0o440, ...facts[path] };
  };
}

/* ── which policy file the installed sudo reads (sudo-rs: /etc/sudoers-rs first) ── */


test('the flavor from realpath(/usr/bin/sudo): Ubuntu 26.04 sudo-rs (captured) vs classic sudo', () => {
  expect(sudoFlavor(fixture('captured/ubuntu2604_sudo_rs/realpath.txt').trim())).toBe('sudo-rs');
  expect(sudoFlavor('/usr/bin/sudo-rs')).toBe('sudo-rs');
  // The drill image's `apt install sudo` on 26.04 points the alternative at sudo.ws; EL and Debian: the binary itself.
  expect(sudoFlavor('/usr/bin/sudo.ws')).toBe('sudo');
  expect(sudoFlavor('/usr/bin/sudo')).toBe('sudo');
  expect(sudoFlavor(null)).toBe('sudo');
});

test('sudo-rs reads /etc/sudoers-rs when it exists, else /etc/sudoers; classic sudo never reads it', () => {
  const has = (path: string) => path === SUDOERS_RS || path === SUDOERS;
  expect(sudoPolicyFile('sudo-rs', has)).toBe(SUDOERS_RS);
  expect(sudoPolicyFile('sudo-rs', path => path === SUDOERS)).toBe(SUDOERS);
  expect(sudoPolicyFile('sudo', has)).toBe(SUDOERS);
});

test("the policy walk: sudo-rs's own file without the include is NOT policy for sudoers.d, though /etc/sudoers says it is", () => {
  const files = new Map<string, string>([
    [SUDOERS, fixture('captured/ubuntu2604_sudo_rs/sudoers')],
    [SUDOERS_RS, fixture('typed/sudo/sudoers-rs')],
  ]);
  const read = rootFiles(files);
  expect(policyIncludesDir(SUDOERS, read, '/etc/sudoers.d')).toEqual({ present: true, includes: true, skipped: [] });
  expect(policyIncludesDir(SUDOERS_RS, read, '/etc/sudoers.d')).toEqual({ present: true, includes: false, skipped: [] });
  expect(policyIncludesDir('/etc/absent', read, '/etc/sudoers.d')).toEqual({ present: false, includes: false, skipped: [] });
});

test('an include reached through a relative @include, each file once (a cycle ends)', () => {
  const files = new Map<string, string>([
    [SUDOERS_RS, fixture('typed/sudo/sudoers-rs_include')],
    ['/etc/sudoers-rs.local', fixture('typed/sudo/sudoers-rs.local')],
    ['/etc/a', '#include /etc/b\n'],
    ['/etc/b', '@include /etc/a\n'],
  ]);
  const read = rootFiles(files);
  expect(includedFiles(fixture('typed/sudo/sudoers-rs_include'), SUDOERS_RS)).toEqual(['/etc/sudoers-rs.local']);
  expect(policyIncludesDir(SUDOERS_RS, read, '/etc/sudoers.d')).toEqual({ present: true, includes: true, skipped: [] });
  expect(policyIncludesDir('/etc/a', read, '/etc/sudoers.d')).toEqual({ present: true, includes: false, skipped: [] });
  // `##include` is a comment.
  expect(includedFiles('##include /etc/x\n# include /etc/y\n', SUDOERS)).toEqual([]);
});

/* ── review S3-3: sudo's own file rule, and the include forms ── */

test("sudo's file rule: an included file not root's, or group/other-writable, is NOT followed — and is reported", () => {
  const files = new Map<string, string>([
    [SUDOERS, '@include /etc/sudoers.local\n'],
    ['/etc/sudoers.local', '@includedir /etc/sudoers.d\n'],
  ]);
  expect(policyIncludesDir(SUDOERS, rootFiles(files), '/etc/sudoers.d').includes).toBe(true);
  for (const [facts, reason] of [
    [{ uid: 1000 }, 'owned by uid 1000, not root'],
    [{ mode: 0o460 }, 'mode 0460 is group- or world-writable'],
    [{ mode: 0o442 }, 'mode 0442 is group- or world-writable'],
  ] as const) {
    const walk = policyIncludesDir(SUDOERS, rootFiles(files, { '/etc/sudoers.local': facts }), '/etc/sudoers.d');
    expect(walk.includes).toBe(false);
    expect(walk.skipped).toEqual([{ path: '/etc/sudoers.local', reason: expect.stringContaining(reason) }]);
  }
  // The policy file itself is judged alike (sudo refuses to run on it).
  expect(policyIncludesDir(SUDOERS, rootFiles(files, { [SUDOERS]: { mode: 0o666 } }), '/etc/sudoers.d')).toMatchObject({ present: true, includes: false });
  expect(sudoersFileProblem({ uid: 0, mode: 0o440 })).toBeNull();
  expect(sudoersFileProblem({ uid: 0, mode: 0o640 })).toBeNull();
});

test('the include forms sudo accepts: quoted (with escapes), backslash-escaped spaces; %h is never followed', () => {
  expect(parseIncludeLine('@include "/etc/sudo ers.local"')).toEqual({ kind: 'include', path: '/etc/sudo ers.local', hostDependent: false });
  expect(parseIncludeLine('@include "/etc/a\\"b"')).toEqual({ kind: 'include', path: '/etc/a"b', hostDependent: false });
  expect(parseIncludeLine('#include /etc/sudo\\ ers.local')).toEqual({ kind: 'include', path: '/etc/sudo ers.local', hostDependent: false });
  expect(parseIncludeLine('@includedir "/etc/sudoers.d"')).toEqual({ kind: 'includedir', path: '/etc/sudoers.d', hostDependent: false });
  expect(parseIncludeLine('#include /etc/sudoers.%h')).toEqual({ kind: 'include', path: '/etc/sudoers.%h', hostDependent: true });
  expect(parseIncludeLine('#include /etc/100%%')).toEqual({ kind: 'include', path: '/etc/100%', hostDependent: false });
  // Not directives: an unterminated quote, trailing words, the comment forms.
  expect(parseIncludeLine('@include "/etc/x')).toBeNull();
  expect(parseIncludeLine('@include /etc/x y')).toBeNull();
  expect(parseIncludeLine('## include /etc/x')).toBeNull();
  expect(hasIncludedir('@includedir "/etc/sudoers.d/"\n', '/etc/sudoers.d')).toBe(true);
  const files = new Map<string, string>([
    [SUDOERS, '@include "/etc/sudo ers.local"\n#include /etc/sudoers.%h\n'],
    ['/etc/sudo ers.local', '#includedir /etc/other.d\n'],
  ]);
  expect(policyIncludesDir(SUDOERS, rootFiles(files), '/etc/sudoers.d')).toEqual({
    present: true,
    includes: false,
    skipped: [{ path: '/etc/sudoers.%h', reason: 'its name holds %h (the host name): not followed' }],
  });
  files.set('/etc/sudo ers.local', '@includedir /etc/sudoers.d\n');
  expect(policyIncludesDir(SUDOERS, rootFiles(files), '/etc/sudoers.d').includes).toBe(true);
});
