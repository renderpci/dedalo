/**
 * web_reference.ts — the S4 proof that the operator's vhost reference is LOADED, from the
 * server's own dump (Apache DUMP_INCLUDES, nginx -T), and the include path / nginx glob both
 * init and the web include renderer use.
 */
import { expect, test } from 'bun:test';
import { DEFAULT_PATHS, derive } from '../src/provision/layout';
import { webIncludePath, webReferenceInclude, webReferencePresent } from '../src/provision/web_reference';
import { fixture } from './fixtures/init/load';

const APACHE_INCLUDE = '/etc/dedalo_publication_host/museum_org/web.apache.conf';

test('Apache: present in DUMP_INCLUDES (typed); absent from a captured host without it', () => {
  expect(webReferencePresent('apache', fixture('typed/apache/dump_includes_reference.txt'), APACHE_INCLUDE)).toBe(true);
  expect(webReferencePresent('apache', fixture('captured/rocky9/apache_includes.txt'), APACHE_INCLUDE)).toBe(false);
  // A path merely mentioned elsewhere (or a prefix of it) is not loaded.
  expect(webReferencePresent('apache', fixture('typed/apache/dump_includes_reference.txt'), '/etc/dedalo_publication_host/museum_org/web.apache')).toBe(false);
});

test('nginx: the loaded file appears as a `# configuration file` header; a reference line alone is not proof', () => {
  const loaded = `${fixture('typed/nginx/nginx_T_typed.txt')}# configuration file /etc/dedalo_publication_host/museum_org/web.nginx.conf:\nlocation ^~ /x/ { }\n`;
  expect(webReferencePresent('nginx', loaded, '/etc/dedalo_publication_host/museum_org/web.nginx.conf')).toBe(true);
  // The typed dump holds our zero-match `include …web.nginx.con[f];` line, but no such file was loaded.
  expect(webReferencePresent('nginx', fixture('typed/nginx/nginx_T_typed.txt'), '/etc/dedalo_publication_host/museum_org/web.nginx.conf')).toBe(false);
  expect(webReferencePresent('nginx', fixture('captured/rocky9/nginx_T.txt'), '/etc/nginx/conf.d/php-fpm.conf')).toBe(true);
});

test('the include path and the zero-match nginx glob', () => {
  expect(webIncludePath(DEFAULT_PATHS.configBase, 'museum_org', 'apache')).toBe(APACHE_INCLUDE);
  expect(webReferenceInclude('/etc/dedalo_publication_host', 'museum_org')).toBe('/etc/dedalo_publication_host/museum_org/web.nginx.con[f]');
});

test('the include path lives in the instance config dir derive() names', () => {
  const layout = derive({
    instance: 'museum_org',
    listen: { kind: 'unix' },
    agent_user: 'museum_org_agent',
    engine_group: 'dedalo',
    agent_dir: '/opt/dedalo_publication_host/host_agent',
    web: { server: 'apache', unit: 'apache2' },
    v1: { user: 'museum_org_v1' },
    state_root: '/srv/dedalo_publication_host/museum_org',
    media: { mode: 'none' },
    php_bin: '/usr/bin/php',
    bun_bin: '/opt/dedalo_publication_host/bun/bin/bun',
    v2: { unit: 'museum_org_v2', user: 'museum_org_v2', group: 'museum_org_v2', port: 3100, health_url: 'http://127.0.0.1:3100/health' },
  });
  expect(webIncludePath(layout.configBase, layout.instance, 'apache')).toBe(`${layout.instanceDir}/web.apache.conf`);
});
