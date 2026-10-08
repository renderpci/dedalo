/**
 * parse/systemd.ts — `systemctl --version` (captured on
 * every OS), `systemctl show` (sandbox properties, ExecStart, Environment), `list-units`, and
 * the S6/§4.3 host.unit_sandbox judgement (typed: a container has no PID 1).
 */
import { describe, expect, test } from 'bun:test';
import { UNIT_SHOW_PROPERTIES } from '../src/provision/exec_contract';
import {
  parseEnvironmentProp,
  parseExecStart,
  parseSystemdVersion,
  parseUnitList,
  parseUnitShow,
  sandboxHides,
  unitSandbox,
} from '../src/provision/init/parse/systemd';
import { fixture } from './fixtures/init/load';

const show = (name: string) => parseUnitShow(fixture(`typed/systemd/${name}`));

describe('systemctl --version', () => {
  const versions: [string, number][] = [
    ['captured/rocky9/systemctl_version.txt', 252],
    ['captured/alma9/systemctl_version.txt', 252],
    ['captured/rocky10/systemctl_version.txt', 257],
    ['captured/alma10/systemctl_version.txt', 257],
    ['captured/debian12/systemctl_version.txt', 252],
    ['captured/ubuntu2404/systemctl_version.txt', 255],
    ['captured/debian13/systemctl_version.txt', 257],
    ['captured/ubuntu2604/systemctl_version.txt', 259],
    ['typed/systemd/systemctl_version_237.txt', 237],
  ];
  for (const [path, version] of versions) test(`${path} → ${version}`, () => expect(parseSystemdVersion(fixture(path))).toBe(version));

  test('the EL form with its parenthesised release, and garbage', () => {
    expect(parseSystemdVersion('systemd 257 (257-23.el10_2.2.rocky.0.1-gb237c67)\n+PAM')).toBe(257);
    expect(parseSystemdVersion('bash: systemctl: command not found')).toBeNull();
  });
});

describe('systemctl show', () => {
  test('fapolicyd: not-found, inactive, active', () => {
    expect(show('show_fapolicyd_notfound.txt').get('LoadState')).toBe('not-found');
    expect(show('show_fapolicyd_inactive.txt').get('ActiveState')).toBe('inactive');
    expect(show('show_fapolicyd_active.txt').get('ActiveState')).toBe('active');
  });

  test('a value containing `=` is kept whole; a line without `=` throws', () => {
    expect(parseUnitShow('Environment=A=1 B=2\n').get('Environment')).toBe('A=1 B=2');
    expect(() => parseUnitShow('garbage\n')).toThrow('not <Property>=<value>');
  });

  test('the sandbox: defaults; ProtectHome=yes from a drop-in; InaccessiblePaths=-/home; ReadOnlyPaths; TemporaryFileSystem=/home:ro', () => {
    expect(unitSandbox(show('show_web_default.txt'))).toEqual({ protectHome: 'no', protectSystem: 'no', inaccessible: [], readOnly: [], tmpfs: [] });
    const dropin = show('show_web_protecthome_dropin.txt');
    expect(unitSandbox(dropin).protectHome).toBe('yes');
    expect(dropin.get('DropInPaths')).toBe('/etc/systemd/system/httpd.service.d/hardening.conf');
    expect(unitSandbox(show('show_web_inaccessible_home.txt')).inaccessible).toEqual(['/home']);
    expect(unitSandbox(show('show_fpm_readonly_varlib.txt'))).toMatchObject({ protectHome: 'read-only', readOnly: ['/var/lib'] });
    expect(unitSandbox(show('show_fpm_tmpfs_home.txt'))).toMatchObject({ tmpfs: ['/home'], protectSystem: 'strict' });
    expect(unitSandbox(new Map())).toEqual({ protectHome: 'no', protectSystem: 'no', inaccessible: [], readOnly: [], tmpfs: [] });
  });

  test('UNIT_SHOW_PROPERTIES carries every sandbox property unitSandbox reads', () => {
    for (const property of ['ProtectHome', 'ProtectSystem', 'InaccessiblePaths', 'ReadOnlyPaths', 'TemporaryFileSystem', 'DropInPaths']) {
      expect(UNIT_SHOW_PROPERTIES).toContain(property as never);
    }
  });
});

describe('sandboxHides (host.unit_sandbox, S6)', () => {
  const home = '/home/museum.org/dedalo';
  test("Ubuntu 26.04's stock apache2.service (captured): ProtectHome=read-only, ProtectSystem=full — the home is readable, never writable", () => {
    const apache = unitSandbox(parseUnitShow(fixture('captured/ubuntu2604/systemctl_show_apache2.txt')));
    expect(apache).toMatchObject({ protectHome: 'read-only', protectSystem: 'full', readOnly: [], tmpfs: [] });
    expect(apache.inaccessible).toEqual(['/boot', '/root', '/etc/sudoers', '/etc/sudoers.d', '/etc/ssh', '/etc/apt', '/etc/.git', '/etc/.svn']);
    expect(sandboxHides(apache, home)).toEqual([]);
    expect(sandboxHides(apache, '/var/lib/dedalo_publication_host/museum_org')).toEqual([]);
    expect(sandboxHides(apache, '/home/museum.org/logs', true)).toEqual(['ProtectHome=read-only makes /home/museum.org/logs read-only']);
    const fpm = unitSandbox(parseUnitShow(fixture('captured/ubuntu2604/systemctl_show_php8.5-fpm.txt')));
    expect(fpm).toEqual({ protectHome: 'no', protectSystem: 'no', inaccessible: [], readOnly: [], tmpfs: [] });
  });

  test('ProtectHome=yes|tmpfs hides a home path, not a /srv one', () => {
    expect(sandboxHides(unitSandbox(show('show_web_protecthome_dropin.txt')), home)).toEqual([`ProtectHome=yes hides ${home}`]);
    expect(sandboxHides(unitSandbox(show('show_web_protecthome_dropin.txt')), '/srv/dedalo_publication_host/x')).toEqual([]);
    expect(sandboxHides({ protectHome: 'tmpfs', protectSystem: 'no', inaccessible: [], readOnly: [], tmpfs: [] }, '/root/x')).toHaveLength(1);
  });

  test('InaccessiblePaths= and TemporaryFileSystem= cover their subtree, segment-wise', () => {
    expect(sandboxHides(unitSandbox(show('show_web_inaccessible_home.txt')), home)).toEqual([`InaccessiblePaths=/home hides ${home}`]);
    expect(sandboxHides(unitSandbox(show('show_web_inaccessible_home.txt')), '/homes/x')).toEqual([]);
    expect(sandboxHides(unitSandbox(show('show_fpm_tmpfs_home.txt')), home)).toEqual([`TemporaryFileSystem=/home empties ${home}`]);
  });

  test('a write needs more: ReadOnlyPaths, ProtectHome=read-only, ProtectSystem=strict', () => {
    const fpm = unitSandbox(show('show_fpm_readonly_varlib.txt'));
    const v1Var = '/var/lib/dedalo_publication_host/museum_org/v1/tmp';
    expect(sandboxHides(fpm, v1Var)).toEqual([]);
    expect(sandboxHides(fpm, v1Var, true)).toEqual([`ReadOnlyPaths=/var/lib makes ${v1Var} read-only`]);
    expect(sandboxHides(fpm, '/home/x/logs', true)).toEqual(['ProtectHome=read-only makes /home/x/logs read-only']);
    expect(sandboxHides(unitSandbox(show('show_fpm_tmpfs_home.txt')), '/var/lib/x', true)).toEqual(['ProtectSystem=strict makes /var/lib/x read-only']);
  });
});

describe('ExecStart, Environment, list-units', () => {
  test('a single work unit: bun path and argv; Environment with a quoted value', () => {
    const unit = show('show_dedalo_ts.txt');
    const [command] = parseExecStart(unit.get('ExecStart') ?? '');
    expect(command).toEqual({ path: '/home/dedalo/.bun/bin/bun', argv: ['/home/dedalo/.bun/bin/bun', 'run', 'src/server.ts'] });
    expect(parseEnvironmentProp(unit.get('Environment') ?? '')).toEqual({
      NODE_ENV: 'production',
      DEDALO_PRIVATE_DIR: '/home/dedalo/v7/private',
      DEDALO_DB_PASSWORD: 'hunter2hunter2',
      DEDALO_SITE_TITLE: 'Museo de prueba',
    });
  });

  test('a template instance with User from a drop-in and an EnvironmentFile', () => {
    const unit = show('show_dedalo_ts_at_site.txt');
    expect(unit.get('User')).toBe('dedalo_site');
    expect(unit.get('DropInPaths')).toContain('dedalo-ts@site.service.d');
    expect(parseEnvironmentProp(unit.get('Environment') ?? '')).toEqual({});
    expect(unit.get('EnvironmentFiles')).toContain('/srv/dedalo/site/private/.env');
  });

  test('several ExecStart records; a record without path= throws; escapes in quoted env', () => {
    expect(parseExecStart('{ path=/a ; argv[]=/a x } ; { path=/b ; argv[]=/b }').map(entry => entry.path)).toEqual(['/a', '/b']);
    expect(parseExecStart('')).toEqual([]);
    expect(() => parseExecStart('{ argv[]=/a }')).toThrow('no path=');
    expect(parseEnvironmentProp('"A=say \\"hi\\""')).toEqual({ A: 'say "hi"' });
    expect(() => parseEnvironmentProp('NOEQUALS')).toThrow('not NAME=value');
  });

  test('list-units: EL, Debian with a not-found nginx, a ● glyph, none', () => {
    const el = parseUnitList(fixture('typed/systemd/list_units_el9.txt'));
    expect(el.map(unit => unit.unit)).toContain('php82-php-fpm.service');
    expect(el.find(unit => unit.unit === 'php84-php-fpm.service')).toEqual({ unit: 'php84-php-fpm.service', load: 'loaded', active: 'inactive', sub: 'dead' });
    expect(parseUnitList(fixture('typed/systemd/list_units_debian_apache.txt')).find(unit => unit.unit === 'nginx.service')?.load).toBe('not-found');
    expect(parseUnitList(fixture('typed/systemd/list_units_debian_nginx.txt'))[0]).toMatchObject({ unit: 'apache2.service', load: 'not-found' });
    expect(parseUnitList(fixture('typed/systemd/list_units_none.txt'))).toEqual([]);
    expect(() => parseUnitList('x.service loaded\n')).toThrow('fewer than 4 fields');
  });
});
