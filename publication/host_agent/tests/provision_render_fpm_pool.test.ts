/**
 * The dedicated v1 pool (spec S5, decision A): three flavours (Debian, EL AppStream, Remi SCL),
 * the derived web user as the socket's owner, v1.user as the pool user, its own socket, open_basedir
 * and temp directory; INI injection refused (a newline in a value, `]`, a `..` home).
 */
import { describe, expect, test } from 'bun:test';
import { parseStamp } from '../src/provision/hash';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { derive, LayoutError } from '../src/provision/layout';
import { POOL_EXTENSIONS, fpmPoolBody, fpmPoolRenderer } from '../src/provision/render/fpm_pool';
import { PENDING_FACTS } from '../src/provision/render/types';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

function withSite(base: HostDeclaration, flavor: 'debian' | 'el' | 'remi', version: string, unit = base.web.unit): HostDeclaration {
  return { ...base, web: { ...base.web, unit }, site: { domain: 'museum.example.org', fpm: { flavor, version } } };
}

const DEBIAN = derive(withSite(unixDeclaration(), 'debian', '8.2'));
const EL = derive(withSite(unixDeclaration(), 'el', '8.1', 'httpd'));
const REMI = derive(withSite(unixDeclaration(), 'remi', '8.3', 'httpd'));
const EL_NGINX = derive(withSite(tlsDeclaration(), 'el', '8.2'));

const pool = (layout: AgentLayout) => fpmPoolRenderer.render(layout, PENDING_FACTS)[0]!;
const keys = (body: string) =>
  Object.fromEntries(
    body
      .split('\n')
      .filter(line => line.includes(' = '))
      .map(line => line.split(' = ') as [string, string]),
  );

describe('the artifact', () => {
  test('stamped with `;`, root 0644 at the flavour pool file, reload_fpm, validator fpm', () => {
    const a = pool(DEBIAN);
    expect([a.kind, a.path, a.owner, a.group, a.mode]).toEqual(['fpm_pool', '/etc/php/8.2/fpm/pool.d/dedalo_test_v1.conf', 'root', 'root', 0o644]);
    expect(a.body.startsWith('; dedalo-provision: test fpm_pool ')).toBe(true);
    expect(parseStamp(a.body)).toMatchObject({ kind: 'fpm_pool', instance: 'test' });
    expect(a.effects).toEqual(['reload_fpm']);
    expect(a.validate).toBe('fpm');
    expect(fpmPoolRenderer.appliesTo?.(derive(unixDeclaration()))).toBe(false);
    expect(() => fpmPoolBody(derive(unixDeclaration()))).toThrow(/no site/);
  });

  test('the three flavours: pool file, socket; the derived web user owns the socket', () => {
    expect([pool(EL).path, keys(pool(EL).body).listen, keys(pool(EL).body)['listen.owner']]).toEqual([
      '/etc/php-fpm.d/dedalo_test_v1.conf',
      '/run/php-fpm/dedalo-test-v1.sock',
      'apache',
    ]);
    expect([pool(REMI).path, keys(pool(REMI).body).listen, keys(pool(REMI).body)['listen.owner']]).toEqual([
      '/etc/opt/remi/php83/php-fpm.d/dedalo_test_v1.conf',
      '/var/opt/remi/php83/run/php-fpm/dedalo-test-v1.sock',
      'apache',
    ]);
    expect(keys(pool(EL_NGINX).body)['listen.owner']).toBe('nginx');
    expect(keys(pool(DEBIAN).body)['listen.owner']).toBe('www-data');
    for (const layout of [DEBIAN, EL, REMI, EL_NGINX]) {
      const k = keys(pool(layout).body);
      expect(k['listen.group']).toBe(k['listen.owner']);
    }
  });
});

describe('the pool body (spec §5.9)', () => {
  const k = keys(pool(DEBIAN).body);
  test('its own section, user, socket, ondemand, chdir, open_basedir and temp/log in v1Var', () => {
    expect(pool(DEBIAN).body).toContain('\n[dedalo_test_v1]\n');
    expect(k).toMatchObject({
      user: 'dedalo-api-v1',
      listen: '/run/php/dedalo-test-v1.sock',
      'listen.mode': '0660',
      pm: 'ondemand',
      'pm.max_children': '5',
      chdir: '/srv/dedalo_publication/publication_api/v1',
      'php_admin_value[open_basedir]': '/srv/dedalo_publication/publication_api/v1/:/var/lib/dedalo_publication_host/test/v1/tmp/',
      'php_admin_value[upload_tmp_dir]': '/var/lib/dedalo_publication_host/test/v1/tmp',
      'php_admin_value[session.save_path]': '/var/lib/dedalo_publication_host/test/v1/tmp',
      'php_admin_value[sys_temp_dir]': '/var/lib/dedalo_publication_host/test/v1/tmp',
      'php_admin_flag[log_errors]': 'on',
      'php_admin_value[error_log]': '/var/lib/dedalo_publication_host/test/v1/log/error.log',
    });
    expect(k.group).toBeUndefined();
  });

  test("security.limit_extensions is exactly the web include's handler set", () => {
    expect(k['security.limit_extensions']).toBe(POOL_EXTENSIONS.join(' '));
    expect([...POOL_EXTENSIONS]).toEqual(['.php', '.phar', '.phtml']);
  });

  test('never a web or catch-all account as the pool user (derive refuses it)', () => {
    for (const user of ['www-data', 'apache', 'nginx', 'www', 'nobody']) {
      expect(() => derive({ ...withSite(unixDeclaration(), 'debian', '8.2'), v1: { user } })).toThrow(LayoutError);
    }
  });
});

describe('INI injection (grammar mutations)', () => {
  const site = DEBIAN.site!;
  const bad = (patch: (l: AgentLayout) => AgentLayout) => () => fpmPoolBody(patch(DEBIAN));
  test('a newline, a `]` or a `..` in any interpolated value is refused', () => {
    expect(bad(l => ({ ...l, identity: { ...l.identity, v1User: 'v1\nuser = root' } }))).toThrow(/v1.user/);
    expect(bad(l => ({ ...l, site: { ...site, fpm: { ...site.fpm, pool: 'dedalo_test_v1]\n[www' } } }))).toThrow(/pool name/);
    expect(bad(l => ({ ...l, site: { ...site, v1Var: { ...site.v1Var, tmp: '/var/../etc' } } }))).toThrow(/tmp directory/);
    expect(bad(l => ({ ...l, site: { ...site, fpm: { ...site.fpm, webUser: 'www-data]' } } }))).toThrow(/webUser/);
    expect(() => derive({ ...unixDeclaration(), site: { domain: 'museum\n.example.org', fpm: { flavor: 'debian', version: '8.2' } } })).toThrow(
      LayoutError,
    );
    expect(() => derive({ ...unixDeclaration(), site: { domain: 'museum.example.org', home: '/home/../etc', fpm: { flavor: 'debian', version: '8.2' } } })).toThrow(
      LayoutError,
    );
  });
});
