/**
 * parse/fpm.ts — PHP-FPM installs and pools (spec §3.2 row FPM; S5). Captured: Debian 8.2
 * (Debian 12), 8.4 (Debian 13) and 8.5 (Ubuntu 26.04), EL 9 AppStream 8.0 and the 8.2 stream, EL 10 AppStream 8.3
 * (no streams), Remi php82 + php84 beside AppStream (Rocky 9 and 10). Typed: a site pool with paths under the home,
 * a pool with an env[] secret, a failed -tt.
 */
import { describe, expect, test } from 'bun:test';
import { FPM_BIN_PATTERN, PHP_CLI_PATTERN } from '../src/provision/layout';
import {
  POOL_PATH_KEYS,
  fpmFlavors,
  isPhpCliPath,
  minorOf,
  parseFpmTT,
  parsePhpVersion,
  parsePoolSections,
} from '../src/provision/init/parse/fpm';
import { fixture } from './fixtures/init/load';

describe('-tt', () => {
  const captured: [string, string, string][] = [
    ['captured/debian12/fpm_tt.txt', 'www-data', '/run/php/php8.2-fpm.sock'],
    ['captured/debian13/fpm_tt.txt', 'www-data', '/run/php/php8.4-fpm.sock'],
    ['captured/ubuntu2604/fpm_tt.txt', 'www-data', '/run/php/php8.5-fpm.sock'],
    ['captured/rocky9/fpm_tt.txt', 'apache', '/run/php-fpm/www.sock'],
    ['captured/rocky9/remi82_fpm_tt.txt', 'apache', '/var/opt/remi/php82/run/php-fpm/www.sock'],
    ['captured/rocky10/fpm_tt.txt', 'apache', '/run/php-fpm/www.sock'],
    ['captured/alma10/fpm_tt.txt', 'apache', '/run/php-fpm/www.sock'],
    ['captured/rocky10/remi82_fpm_tt.txt', 'apache', '/var/opt/remi/php82/run/php-fpm/www.sock'],
  ];
  for (const [path, user, listen] of captured) {
    test(`${path}: one pool www, ${user}, ${listen}`, () => {
      const pools = parseFpmTT(fixture(path), new Map([['www', '/pool/www.conf']]));
      expect(pools).toHaveLength(1);
      expect(pools[0]).toMatchObject({ name: 'www', file: '/pool/www.conf', user, listen });
    });
  }

  test("a site pool: its path values are kept (home.root's pool facts); `undefined` is dropped", () => {
    const pools = parseFpmTT(fixture('typed/fpm/fpm_tt_site.txt'), new Map([['museum_org', '/etc/php-fpm.d/site.conf']]));
    expect(pools.map(pool => pool.name)).toEqual(['museum_org', 'www']);
    expect(pools[0]?.values).toEqual({
      chdir: '/home/museum.org/httpdocs',
      'php_admin_value[error_log]': '/home/museum.org/logs/php_error.log',
      'php_admin_value[session.save_path]': '/var/lib/php/session',
    });
    expect(pools[1]?.file).toBe('');
  });

  test('NO CREDENTIAL IN FACTS: env[…] and any non-path value are never kept', () => {
    const pools = parseFpmTT(fixture('typed/fpm/fpm_tt_site.txt'));
    expect(JSON.stringify(pools)).not.toContain('not-a-real-secret');
    for (const pool of pools) for (const key of Object.keys(pool.values)) expect(POOL_PATH_KEYS).toContain(key);
  });

  test('a failed -tt throws with its error line; the [General] section is not a pool', () => {
    expect(() => parseFpmTT(fixture('typed/fpm/fpm_tt_failed.txt'))).toThrow("unknown entry 'usr'");
    expect(parseFpmTT('NOTICE: [General]\nNOTICE: \tx = 1\nNOTICE: configuration file /x test is successful\n')).toEqual([]);
  });

  test('pool files: section names only (comments and [global] skipped)', () => {
    expect(parsePoolSections(fixture('typed/fpm/pool_site.conf'))).toEqual(['museum_org']);
    expect(parsePoolSections(fixture('typed/fpm/pool_www.conf'))).toEqual(['www']);
    expect(parsePoolSections('[global]\npid = x\n')).toEqual([]);
  });
});

describe('installs (fpmFlavors)', () => {
  const files = (paths: string[]) => (path: string) => paths.includes(path);

  test('Debian 8.2 + 8.4 side by side (a /etc/php/<v> without its binary is not an install)', () => {
    const found = fpmFlavors({
      debianVersions: ['8.4', '8.2', '7.4', 'mods-available'],
      remiNames: [],
      isRealFile: files(['/usr/sbin/php-fpm8.2', '/usr/sbin/php-fpm8.4']),
    });
    expect(found.map(install => [install.flavor, install.version])).toEqual([
      ['debian', '8.2'],
      ['debian', '8.4'],
    ]);
    expect(found[0]).toEqual({
      flavor: 'debian',
      version: '8.2',
      bin: '/usr/sbin/php-fpm8.2',
      unit: 'php8.2-fpm',
      poolDir: '/etc/php/8.2/fpm/pool.d',
      socketDir: '/run/php',
      cli: '/usr/bin/php8.2',
    });
  });

  for (const host of ['rocky9', 'rocky10']) {
    test(`captured ${host}: AppStream beside Remi php82 + php84 (ls /etc/opt/remi)`, () => {
      const remiNames = fixture(`captured/${host}/ls_etc_opt_remi.txt`).trim().split('\n');
      const found = fpmFlavors({
        debianVersions: [],
        remiNames,
        isRealFile: files(['/usr/sbin/php-fpm', '/opt/remi/php82/root/usr/sbin/php-fpm', '/opt/remi/php84/root/usr/sbin/php-fpm']),
      });
      expect(found.map(install => `${install.flavor}:${install.version}`)).toEqual(['el:', 'remi:8.2', 'remi:8.4']);
      expect(found[0]).toMatchObject({ unit: 'php-fpm', poolDir: '/etc/php-fpm.d', socketDir: '/run/php-fpm', cli: '/usr/bin/php' });
      expect(found[1]).toMatchObject({
        unit: 'php82-php-fpm',
        bin: '/opt/remi/php82/root/usr/sbin/php-fpm',
        poolDir: '/etc/opt/remi/php82/php-fpm.d',
        socketDir: '/var/opt/remi/php82/run/php-fpm',
        cli: '/opt/remi/php82/root/usr/bin/php',
      });
      for (const install of found) {
        expect(FPM_BIN_PATTERN.test(install.bin)).toBe(true);
        expect(PHP_CLI_PATTERN.test(install.cli)).toBe(true);
      }
    });
  }

  test('nothing installed; a php<NNN> directory name is not Remi', () => {
    expect(fpmFlavors({ debianVersions: [], remiNames: ['php820', 'php8'], isRealFile: () => false })).toEqual([]);
    expect(fpmFlavors({ debianVersions: [], remiNames: ['php820'], isRealFile: () => true }).map(install => install.flavor)).toEqual(['el']);
  });
});

describe('versions', () => {
  test('captured CLI versions: 8.2.34, 8.4.26, 8.0.30 (EL 9), 8.2 (EL 9 stream), 8.3.33 (EL 10), 8.5.4 (Ubuntu 26.04), Ubuntu suffix', () => {
    expect(parsePhpVersion(fixture('captured/debian12/php_version.txt'))).toBe('8.2.34');
    expect(minorOf(parsePhpVersion(fixture('captured/debian13/php_version.txt')) ?? '')).toBe('8.4');
    expect(minorOf(parsePhpVersion(fixture('captured/rocky9/php_version.txt')) ?? '')).toBe('8.0');
    expect(minorOf(parsePhpVersion(fixture('captured/rocky9_php82/php_version.txt')) ?? '')).toBe('8.2');
    expect(parsePhpVersion(fixture('captured/rocky10/php_version.txt'))).toBe('8.3.33');
    expect(minorOf(parsePhpVersion(fixture('captured/rocky10/remi84_php_version.txt')) ?? '')).toBe('8.4');
    expect(minorOf(parsePhpVersion(fixture('captured/rocky9/remi84_php_version.txt')) ?? '')).toBe('8.4');
    expect(parsePhpVersion(fixture('captured/ubuntu2204/php_version.txt'))).toBe('8.1.2-1ubuntu2.26');
    expect(parsePhpVersion(fixture('captured/ubuntu2604/php_version.txt'))).toBe('8.5.4');
    expect(fixture('captured/ubuntu2604/ls_etc_php.txt').trim()).toBe('8.5');
    expect(parsePhpVersion('PHP Warning: x')).toBeNull();
    expect(minorOf('x')).toBe('');
  });

  test('isPhpCliPath follows PHP_CLI_PATTERN', () => {
    expect(isPhpCliPath('/usr/bin/php8.2')).toBe(true);
    expect(isPhpCliPath('/opt/remi/php82/root/usr/bin/php')).toBe(true);
    expect(isPhpCliPath('/etc/alternatives/php')).toBe(false);
  });
});
