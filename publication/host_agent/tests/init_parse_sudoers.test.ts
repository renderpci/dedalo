/**
 * parse/sudoers.ts — whether the policy the installed sudo reads includes the drop-in directory (spec §3.2 row sudo,
 * §4.3 host.sudo). Captured: Debian's `@includedir`, EL's `#includedir`, Ubuntu 26.04's sudo-rs; typed: an /etc/sudoers-rs.
 */
import { expect, test } from 'bun:test';
import { SUDOERS, SUDOERS_RS, hasIncludedir, includedFiles, policyIncludesDir, sudoFlavor, sudoPolicyFile } from '../src/provision/init/parse/sudoers';
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
  const read = (path: string) => files.get(path) ?? null;
  expect(policyIncludesDir(SUDOERS, read, '/etc/sudoers.d')).toEqual({ present: true, includes: true });
  expect(policyIncludesDir(SUDOERS_RS, read, '/etc/sudoers.d')).toEqual({ present: true, includes: false });
  expect(policyIncludesDir('/etc/absent', read, '/etc/sudoers.d')).toEqual({ present: false, includes: false });
});

test('an include reached through a relative @include, each file once (a cycle ends)', () => {
  const files = new Map<string, string>([
    [SUDOERS_RS, fixture('typed/sudo/sudoers-rs_include')],
    ['/etc/sudoers-rs.local', fixture('typed/sudo/sudoers-rs.local')],
    ['/etc/a', '#include /etc/b\n'],
    ['/etc/b', '@include /etc/a\n'],
  ]);
  const read = (path: string) => files.get(path) ?? null;
  expect(includedFiles(fixture('typed/sudo/sudoers-rs_include'), SUDOERS_RS)).toEqual(['/etc/sudoers-rs.local']);
  expect(policyIncludesDir(SUDOERS_RS, read, '/etc/sudoers.d')).toEqual({ present: true, includes: true });
  expect(policyIncludesDir('/etc/a', read, '/etc/sudoers.d')).toEqual({ present: true, includes: false });
  // `##include` is a comment.
  expect(includedFiles('##include /etc/x\n# include /etc/y\n', SUDOERS)).toEqual([]);
});
