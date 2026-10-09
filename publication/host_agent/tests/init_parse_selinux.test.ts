/**
 * parse/selinux.ts — the SELinux discovery parsers (spec §3.2, S9). The port list and the Remi
 * equivalences are CAPTURED from the EL policy stores (captured/rocky9, alma9, rocky10, alma10); enforcing
 * mode, local rules, labels and restorecon -n are typed (no SELinux kernel in a container).
 */
import { describe, expect, test } from 'bun:test';
import {
  parseGetenforce,
  parseGetsebool,
  parseRestoreconDryRun,
  parseSelinuxConfig,
  parseSelinuxContext,
  parseSemanageFcontextLocal,
  parseSemanagePorts,
  parseStatContext,
  singlePorts,
  tcpPortTypes,
} from '../src/provision/init/parse/selinux';
import { fixture } from './fixtures/init/load';

const ok = (stdout: string, code = 0, stderr = '') => ({ code, stdout, stderr });

describe('mode and config', () => {
  test('getenforce: absent (127), Disabled (captured), Permissive, Enforcing', () => {
    expect(parseGetenforce(ok('', 127))).toBe('absent');
    expect(parseGetenforce(ok(fixture('captured/rocky9/getenforce.txt')))).toBe('disabled');
    expect(parseGetenforce(ok(fixture('typed/selinux/getenforce_permissive.txt')))).toBe('permissive');
    expect(parseGetenforce(ok(fixture('typed/selinux/getenforce_enforcing.txt')))).toBe('enforcing');
    expect(parseGetenforce(ok(fixture('typed/selinux/getenforce_disabled.txt')))).toBe('disabled');
  });

  test('getenforce: an unknown word or a failure throws (never a guessed mode)', () => {
    expect(() => parseGetenforce(ok('Strict\n'))).toThrow('unknown mode');
    expect(() => parseGetenforce(ok('', 1, 'getenforce: boom'))).toThrow('exited 1');
  });

  test('selinux config: targeted (captured), mls, missing keys, a hostile type', () => {
    expect(parseSelinuxConfig(fixture('captured/rocky9/selinux_config'))).toEqual({ selinux: 'enforcing', type: 'targeted' });
    expect(parseSelinuxConfig(fixture('captured/rocky10/selinux_config'))).toEqual({ selinux: 'enforcing', type: 'targeted' });
    expect(parseSelinuxConfig(fixture('typed/selinux/config_mls'))).toEqual({ selinux: 'enforcing', type: 'mls' });
    expect(parseSelinuxConfig('')).toEqual({ selinux: null, type: null });
    expect(parseSelinuxConfig('SELINUX=weird\nSELINUXTYPE="targeted" # comment\n')).toEqual({ selinux: null, type: 'targeted' });
    expect(() => parseSelinuxConfig('SELINUXTYPE=../../etc\n')).toThrow('not a policy name');
  });

  test('contexts: the unconfined root and sysadm_t; NUL-terminated; malformed is null', () => {
    expect(parseSelinuxContext(fixture('typed/selinux/attr_current_unconfined'))).toEqual({
      user: 'unconfined_u',
      role: 'unconfined_r',
      type: 'unconfined_t',
      level: 's0-s0:c0.c1023',
    });
    expect(parseSelinuxContext(fixture('typed/selinux/attr_current_sysadm'))?.type).toBe('sysadm_t');
    expect(parseSelinuxContext('"system_u:object_r:httpd_sys_content_t:s0"')?.type).toBe('httpd_sys_content_t');
    expect(parseSelinuxContext('system_u:object_r:usr_t')?.level).toBe('');
    expect(parseSelinuxContext('kernel')).toBeNull();
    expect(parseSelinuxContext('')).toBeNull();
  });
});

describe('local rules and ports', () => {
  test('fcontext -l -C: none; ours (with -f d, -f f and `all files`, the trailing space every real line ends with); Remi equivalences (captured)', () => {
    expect(parseSemanageFcontextLocal(fixture('typed/selinux/fcontext_local_none.txt'))).toEqual({ rules: [], equivalences: [] });
    const ours = parseSemanageFcontextLocal(fixture('typed/selinux/fcontext_local_ours.txt'));
    expect(ours.rules[0]).toEqual({ spec: '/home/museum\\.org', fileType: 'd', type: 'home_root_t' });
    expect(ours.rules.find(rule => rule.spec.endsWith('/bun'))).toEqual({ spec: '/home/museum\\.org/\\.bun/bin/bun', fileType: 'f', type: 'bin_t' });
    expect(ours.rules.filter(rule => rule.fileType === 'a').length).toBe(7);
    // The v2 tree is data_home_t (row S/publication_api/v2); the site logs live outside the home (no home logs rule).
    expect(ours.rules).toContainEqual({ spec: '/home/museum\\.org/dedalo/publication_api/v2(/.*)?', fileType: 'a', type: 'data_home_t' });
    expect(ours.rules.some(rule => rule.spec.startsWith('/home/') && rule.type === 'httpd_log_t')).toBe(false);
    // A spec longer than semanage's 50-column field is followed by ONE space (`%-50s %-18s %s `).
    expect(ours.rules.at(-2)).toEqual({ spec: '/var/lib/dedalo_publication_host/museum_org/v1/tmp(/.*)?', fileType: 'a', type: 'httpd_sys_rw_content_t' });
    expect(ours.rules.at(-1)).toEqual({ spec: '/var/lib/dedalo_publication_host/museum_org/v1/log(/.*)?', fileType: 'a', type: 'httpd_log_t' });
    expect(ours.equivalences).toEqual([
      { path: '/var/opt/remi/php82', target: '/var' },
      { path: '/etc/opt/remi/php82', target: '/etc' },
    ]);
    const remi = parseSemanageFcontextLocal(fixture('captured/rocky9/semanage_fcontext_l_C_remi.txt'));
    expect(remi.rules).toEqual([]);
    expect(remi.equivalences).toContainEqual({ path: '/var/opt/remi/php82', target: '/var' });
    expect(remi.equivalences).toContainEqual({ path: '/opt/remi/php84/root', target: '/' });
    expect(parseSemanageFcontextLocal(fixture('captured/rocky9/semanage_fcontext_l_C.txt')).rules).toEqual([]);
  });

  test('an operator rule on our spec with another type, and a <<None>> rule, are read as such', () => {
    const operator = parseSemanageFcontextLocal(fixture('typed/selinux/fcontext_local_operator.txt'));
    expect(operator.rules).toEqual([
      { spec: '/home/museum\\.org/dedalo/publication_api/v1(/.*)?', fileType: 'a', type: 'public_content_t' },
      { spec: '/srv/media(/.*)?', fileType: 'a', type: '<<None>>' },
    ]);
  });

  test('a malformed fcontext line throws (a half-read list would hide a clash)', () => {
    expect(() => parseSemanageFcontextLocal('/x\n')).toThrow('not <spec> <file type> <context>');
    expect(() => parseSemanageFcontextLocal('/x  some files  system_u:object_r:usr_t:s0\n')).toThrow('no known file type');
    expect(() => parseSemanageFcontextLocal('/x y  all files  system_u:object_r:usr_t:s0\n')).toThrow('not <spec> <file type> <context>');
    expect(() => parseSemanageFcontextLocal('all files  system_u:object_r:usr_t:s0\n')).toThrow('no known file type');
    expect(() => parseSemanageFcontextLocal('/x  all files  garbage\n')).toThrow('malformed context');
    expect(parseSemanageFcontextLocal('SELinux Local fcontext Equivalence\n').equivalences).toEqual([]);
  });

  for (const host of ['rocky9', 'alma9', 'rocky10', 'alma10']) {
    test(`port types (captured ${host}): 8443 and 9000 are http_port_t, 3306 mysqld_port_t, 8080 http_cache_port_t, 3100 untyped`, () => {
      const types = tcpPortTypes(parseSemanagePorts(fixture(`captured/${host}/semanage_port_l.txt`)));
      expect(types.get(8443)).toBe('http_port_t');
      expect(types.get(9000)).toBe('http_port_t');
      expect(types.get(80)).toBe('http_port_t');
      expect(types.get(3306)).toBe('mysqld_port_t');
      expect(types.get(8080)).toBe('http_cache_port_t');
      // 3100 lies only inside unreserved_port_t's 1024-32767 range: no exact definition collides.
      expect(types.has(3100)).toBe(false);
      expect(types.size).toBeGreaterThan(300);
    });
  }

  test('the full list puts a type\'s LOCAL ports first, newest first (captured EL 10 with ours): each still maps to its type', () => {
    const line = 'http_port_t                    tcp      3104, 3103, 3102, 3101, 3100, 80, 81, 443, 488, 8008, 8009, 8443, 9000\n';
    const types = tcpPortTypes(parseSemanagePorts(line));
    expect([...types.keys()]).toEqual([3104, 3103, 3102, 3101, 3100, 80, 81, 443, 488, 8008, 8009, 8443, 9000]);
    expect([...types.values()].every(type => type === 'http_port_t')).toBe(true);
  });

  test('ranges are kept by parseSemanagePorts and left out of the exact map', () => {
    const rows = parseSemanagePorts('unreserved_port_t              tcp      61000-65535, 1024-32767\nhttp_port_t   tcp   80, 443\n');
    expect(rows).toContainEqual({ type: 'unreserved_port_t', proto: 'tcp', from: 1024, to: 32767 });
    expect([...tcpPortTypes(rows).keys()]).toEqual([80, 443]);
    expect(tcpPortTypes(parseSemanagePorts('http_port_t   udp   80\n')).size).toBe(0);
  });

  test('local ports: ours are single ports (five instances 3100-3104, comma-listed as -C prints them); an empty list (captured) is empty; a local range throws', () => {
    expect(singlePorts(parseSemanagePorts(fixture('typed/selinux/port_local_ours.txt')))).toEqual(
      [3100, 3101, 3102, 3103, 3104].map(port => ({ type: 'http_port_t', proto: 'tcp', port })),
    );
    expect(singlePorts(parseSemanagePorts(fixture('captured/rocky9/semanage_port_l_C.txt')))).toEqual([]);
    expect(() => singlePorts(parseSemanagePorts('http_port_t tcp 3100-3101\n'))).toThrow('is a range');
  });

  test('malformed port lines and impossible ports throw', () => {
    expect(() => parseSemanagePorts('http_port_t\n')).toThrow('not <type> <proto> <ports>');
    expect(() => parseSemanagePorts('http_port_t tcp 0\n')).toThrow('outside 1-65535');
    expect(() => parseSemanagePorts('http_port_t tcp 65536\n')).toThrow('outside 1-65535');
    expect(() => parseSemanagePorts('http_port_t tcp 90-80\n')).toThrow('runs backwards');
    expect(() => parseSemanagePorts('http_port_t tcp eighty\n')).toThrow('not a number');
    expect(parseSemanagePorts('SELinux Port Type              Proto    Port Number\n')).toEqual([]);
  });
});

describe('booleans, labels, pending relabels', () => {
  test('getsebool on, off, and a boolean the policy does not know (exit 1) → null', () => {
    expect(parseGetsebool('httpd_can_network_relay', ok(fixture('typed/selinux/getsebool_on.txt')))).toBe(true);
    expect(parseGetsebool('httpd_enable_homedirs', ok(fixture('typed/selinux/getsebool_off.txt')))).toBe(false);
    expect(parseGetsebool('httpd_unknown_bool', ok('', 1, fixture('typed/selinux/getsebool_unknown_stderr.txt')))).toBeNull();
  });

  test('getsebool answering for another boolean, garbage, or another failure throws', () => {
    expect(() => parseGetsebool('httpd_use_nfs', ok('httpd_use_cifs --> on\n'))).toThrow("answered for 'httpd_use_cifs'");
    expect(() => parseGetsebool('httpd_use_nfs', ok('on\n'))).toThrow('not <name> --> on|off');
    expect(() => parseGetsebool('httpd_use_nfs', ok('', 2, 'permission denied'))).toThrow('exited 2');
  });

  test('stat %C: home dir, a right and a broken Remi socket dir, media, an unlabelled path', () => {
    const labels = parseStatContext(fixture('typed/selinux/stat_labels.txt'));
    expect(labels.get('/home/museum.org')).toBe('user_home_dir_t');
    expect(labels.get('/var/opt/remi/php82/run/php-fpm')).toBe('httpd_var_run_t');
    expect(labels.get('/var/opt/remi/php84/run/php-fpm')).toBe('var_t');
    expect(labels.get('/srv/media')).toBe('httpd_sys_content_t');
    expect(labels.get('/mnt/unlabelled')).toBe('?');
    expect(() => parseStatContext('no-path-here\n')).toThrow('not <context> <path>');
    expect(() => parseStatContext('bogus /x\n')).toThrow('malformed context');
  });

  test('restorecon -n -v: the modern and the legacy line; anything else throws', () => {
    expect(parseRestoreconDryRun(fixture('typed/selinux/restorecon_n.txt'))).toEqual([
      { path: '/home/museum.org', from: 'user_home_dir_t', to: 'home_root_t' },
      { path: '/home/museum.org/dedalo/publication_api/v1', from: 'user_home_t', to: 'httpd_sys_content_t' },
    ]);
    expect(parseRestoreconDryRun(fixture('typed/selinux/restorecon_n_legacy.txt'))).toEqual([
      { path: '/srv/dedalo_publication_host/museum_org', from: 'var_t', to: 'usr_t' },
    ]);
    expect(parseRestoreconDryRun('')).toEqual([]);
    expect(() => parseRestoreconDryRun('restorecon: lstat(/x) failed: No such file or directory\n')).toThrow('not a pending relabel');
  });
});
