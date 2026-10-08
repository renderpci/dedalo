/**
 * parse/accounts.ts — passwd/group (getent), nsswitch, sssd's domains, the engine group's sole
 * member (spec §3.2 rows NSS and Accounts; §4.3 host.nss, account.engine_group). The getent
 * dumps and nsswitch.conf are captured (Debian files+systemd; EL 9 authselect `sss files systemd`;
 * EL 10 without sssd: `files systemd`, group `files [SUCCESS=merge] systemd`).
 */
import { describe, expect, test } from 'bun:test';
import { nssFilesOnly, parseGroup, parseNsswitch, parsePasswd, soleMemberProblem, sssdHasDomains } from '../src/provision/init/parse/accounts';
import { fixture } from './fixtures/init/load';

describe('passwd and group', () => {
  for (const host of ['debian12', 'rocky9', 'rocky10', 'ubuntu2404', 'ubuntu2604']) {
    test(`captured ${host}: root is uid 0, the web account is there`, () => {
      const users = parsePasswd(fixture(`captured/${host}/getent_passwd.txt`));
      const groups = parseGroup(fixture(`captured/${host}/getent_group.txt`));
      expect(users[0]).toMatchObject({ name: 'root', uid: 0, gid: 0, home: '/root' });
      const web = host.startsWith('rocky') ? 'apache' : 'www-data';
      expect(users.some(user => user.name === web)).toBe(true);
      expect(groups.find(group => group.name === 'root')).toMatchObject({ gid: 0 });
    });
  }

  test('supplementary members are split; an empty member list is empty', () => {
    const groups = parseGroup(fixture('typed/accounts/group_members.txt'));
    expect(groups.find(group => group.name === 'engine_shared')?.members).toEqual(['dedalo', 'www-data']);
    expect(groups.find(group => group.name === 'engine_empty')?.members).toEqual([]);
  });

  test('a short line or a non-numeric id throws (a half-read database is not a database)', () => {
    expect(() => parsePasswd('root:x:0:0:root:/root\n')).toThrow('6 fields, not 7');
    expect(() => parsePasswd('root:x:zero:0:root:/root:/bin/sh\n')).toThrow("id 'zero'");
    expect(() => parseGroup('root:x:0\n')).toThrow('3 fields, not 4');
    expect(parsePasswd('# comment\n\n')).toEqual([]);
  });
});

describe('NSS (host.nss)', () => {
  test('Debian (captured): files systemd → files-only', () => {
    const sources = parseNsswitch(fixture('captured/debian12/nsswitch.conf'));
    expect(sources).toEqual({ passwd: ['files', 'systemd'], group: ['files', 'systemd'] });
    expect(nssFilesOnly(sources.passwd, false)).toBe(true);
  });

  test('EL authselect (captured): sss files systemd → files-only only while sssd has no domain', () => {
    const sources = parseNsswitch(fixture('captured/rocky9/nsswitch.conf'));
    expect(sources.passwd).toEqual(['sss', 'files', 'systemd']);
    expect(nssFilesOnly(sources.passwd, sssdHasDomains(fixture('typed/accounts/sssd_no_domains.conf')))).toBe(true);
    expect(nssFilesOnly(sources.passwd, sssdHasDomains(fixture('typed/accounts/sssd_domains.conf')))).toBe(false);
  });

  test('EL 10 (captured, no sssd): files systemd, the [SUCCESS=merge] action dropped → files-only', () => {
    const sources = parseNsswitch(fixture('captured/rocky10/nsswitch.conf'));
    expect(sources).toEqual({ passwd: ['files', 'systemd'], group: ['files', 'systemd'] });
    expect(nssFilesOnly(sources.group, false)).toBe(true);
  });

  test('ldap is never files-only; [STATUS=action] items are dropped; a missing line is files', () => {
    const sources = parseNsswitch(fixture('typed/accounts/nsswitch_ldap.conf'));
    expect(sources.passwd).toEqual(['files', 'ldap']);
    expect(nssFilesOnly(sources.passwd, false)).toBe(false);
    expect(parseNsswitch('hosts: files dns\n')).toEqual({ passwd: ['files'], group: ['files'] });
    expect(nssFilesOnly(['compat'], true)).toBe(true);
  });

  test('sssd: a domains= line, or any [domain/…] section, counts; commented and empty do not', () => {
    expect(sssdHasDomains(fixture('typed/accounts/sssd_no_domains.conf'))).toBe(false);
    expect(sssdHasDomains(fixture('typed/accounts/sssd_domains.conf'))).toBe(true);
    expect(sssdHasDomains(fixture('typed/accounts/sssd_section_only.conf'))).toBe(true);
    expect(sssdHasDomains('[sssd]\ndomains =\n')).toBe(false);
    expect(sssdHasDomains('[nss]\ndomains = x\n')).toBe(false);
    expect(sssdHasDomains('')).toBe(false);
  });
});

describe('the engine group holds the work system alone', () => {
  const users = parsePasswd(fixture('typed/accounts/passwd_members.txt'));
  const groups = parseGroup(fixture('typed/accounts/group_members.txt'));

  test('primary-only and supplementary-only sole membership pass', () => {
    // `dedalo` group: dedalo's primary — but intruder (gid 1001) shares it.
    expect(soleMemberProblem('engine_alone', 'dedalo', users, groups)).toBeNull();
  });

  test('a primary co-member, a supplementary co-member, a missing user, a missing group', () => {
    expect(soleMemberProblem('dedalo', 'dedalo', users, groups)).toContain("also held by 'intruder'");
    expect(soleMemberProblem('engine_shared', 'dedalo', users, groups)).toContain("'www-data'");
    expect(soleMemberProblem('engine_empty', 'dedalo', users, groups)).toContain("is not in group 'engine_empty'");
    expect(soleMemberProblem('nope', 'dedalo', users, groups)).toContain("group 'nope' does not exist");
    expect(soleMemberProblem('dedalo', 'dedalo', users, groups)).toContain("awk -F: '$4 == 1001");
  });
});
