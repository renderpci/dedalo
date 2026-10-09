/**
 * The web include (spec S4, §5.9): Apache (Debian and EL — they differ only in the socket) and
 * nginx; the v1 handler INSIDE `<If>` with `\.ph(?:ar|p|tml)$` (every name a captured distribution handler
 * claims, a stemless `.php` included); mod_php's engine off
 * in the v1 tree; the media rules first; the v2 loopback proxy; every value re-checked.
 */
import { describe, expect, test } from 'bun:test';
import { RULES_FILE_PREFIX } from '../src/rules/apply';
import { parseStamp } from '../src/provision/hash';
import type { AgentLayout, HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import {
  MEDIA_RULES_FILE_PREFIX,
  PHP_HANDLER_PATTERN,
  apacheWebInclude,
  nginxWebInclude,
  webIncludePath,
  webIncludeRenderer,
  zeroMatchGlob,
} from '../src/provision/render/web_include';
import { PENDING_FACTS } from '../src/provision/render/types';
import { parsePhpConf } from '../src/provision/init/parse/apache';
import { fixture } from './fixtures/init/load';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

function site(base: HostDeclaration, flavor: 'debian' | 'el' | 'remi', version = '8.2'): HostDeclaration {
  return { ...base, site: { domain: 'museum.example.org', fpm: { flavor, version } } };
}

const DEBIAN = derive(site(unixDeclaration(), 'debian'));
const EL = derive(site({ ...unixDeclaration(), web: { server: 'apache', unit: 'httpd' } }, 'el'));
const REMI = derive(site({ ...unixDeclaration(), web: { server: 'apache', unit: 'httpd' } }, 'remi', '8.3'));
const NGINX = derive(site(tlsDeclaration(), 'debian'));

const render = (layout: AgentLayout) => webIncludeRenderer.render(layout, PENDING_FACTS)[0]!;

describe('the artifact', () => {
  test('stamped root 0644 at <configBase>/<instance>/web.<server>.conf, reload_web, validator web', () => {
    const a = render(DEBIAN);
    expect([a.kind, a.path, a.owner, a.group, a.mode]).toEqual(['web_include', '/etc/dedalo_publication_host/test/web.apache.conf', 'root', 'root', 0o644]);
    expect(webIncludePath(NGINX)).toBe('/etc/dedalo_publication_host/test/web.nginx.conf');
    expect(a.effects).toEqual(['reload_web']);
    expect(a.validate).toBe('web');
    expect(a.hostWide).toBe(false);
    expect(parseStamp(a.body)).toMatchObject({ kind: 'web_include', instance: 'test' });
  });

  test('applies only with a site', () => {
    expect(webIncludeRenderer.appliesTo?.(derive(unixDeclaration()))).toBe(false);
    expect(webIncludeRenderer.appliesTo?.(DEBIAN)).toBe(true);
    expect(() => apacheWebInclude(derive(unixDeclaration()))).toThrow(/no site/);
  });

  test("the media-rules file name is the agent's own (src/rules/apply.ts)", () => {
    expect(MEDIA_RULES_FILE_PREFIX).toBe(RULES_FILE_PREFIX);
  });
});

describe('Apache', () => {
  const body = apacheWebInclude(DEBIAN);
  const lines = body.split('\n').map(line => line.trim());

  test('media rules first (optional), then v1 alias + directory, then the v2 proxy', () => {
    const at = (needle: string) => lines.findIndex(line => line.startsWith(needle));
    expect(lines).toContain('IncludeOptional /srv/dedalo_publication/rules/dedalo_media_publication.apache.conf');
    expect(lines).toContain('Alias /dedalo/publication/server_api/v1 /srv/dedalo_publication/publication_api/v1/current');
    expect(lines).toContain('<Directory /srv/dedalo_publication/publication_api/v1>');
    expect(lines).toContain('<Location /dedalo/publication/server_api/v2/>');
    expect(lines).toContain('ProxyPass        http://127.0.0.1:3100/');
    expect(lines).toContain('ProxyPassReverse http://127.0.0.1:3100/');
    expect(at('IncludeOptional')).toBeLessThan(at('Alias'));
    expect(at('Alias')).toBeLessThan(at('<Location'));
    for (const directive of ['Options FollowSymLinks', 'AllowOverride None', 'Require all granted']) expect(lines).toContain(directive);
  });

  test('the handler is INSIDE <If "-f %{REQUEST_FILENAME}"> inside the superset FilesMatch (EL php.conf merges last)', () => {
    const files = lines.indexOf(`<FilesMatch "${PHP_HANDLER_PATTERN}">`);
    const ifAt = lines.indexOf('<If "-f %{REQUEST_FILENAME}">');
    const handler = lines.findIndex(line => line.startsWith('SetHandler'));
    const endIf = lines.indexOf('</If>');
    const endFiles = lines.indexOf('</FilesMatch>');
    expect(PHP_HANDLER_PATTERN).toBe('\\.ph(?:ar|p|tml)$');
    expect(files).toBeGreaterThan(-1);
    expect(files < ifAt && ifAt < handler && handler < endIf && endIf < endFiles).toBe(true);
    expect(lines[handler]).toBe('SetHandler "proxy:unix:/run/php/dedalo-test-v1.sock|fcgi://localhost"');
    expect(lines.filter(line => line.startsWith('SetHandler'))).toHaveLength(1);
    const pattern = new RegExp(PHP_HANDLER_PATTERN);
    for (const name of ['a.php', 'a.phar', 'a.phtml', '.php', '.phar', '.phtml']) expect(pattern.test(name)).toBe(true);
    for (const name of ['a.html', 'a.php.txt', 'a.phps']) expect(pattern.test(name)).toBe(false);
  });

  test('a TRUE superset: every name any captured distribution PHP handler claims is ours in the v1 tree', () => {
    const handlers = [
      ...['debian12', 'debian13', 'ubuntu2404', 'ubuntu2604'].map(host => `captured/${host}/apache_php_fpm.conf`),
      ...['rocky9', 'alma9', 'rocky10', 'alma10', 'rocky9_php82', 'rocky10_prefork_remi'].map(host => `captured/${host}/php.conf`),
    ];
    const ours = new RegExp(PHP_HANDLER_PATTERN);
    const names = ['a.php', 'a.phar', 'a.phtml', 'a.php5', '.php', '.phar', '.phtml', 'php', 'a.phps', 'a.inc', 'x.php.bak'];
    const patterns = handlers.map(file => parsePhpConf(fixture(file), file)?.pattern).filter((p): p is string => p !== undefined);
    expect(patterns).toContain('\\.(php|phar)$'); // EL: unanchored — claims a stemless `.php`
    expect(patterns).toContain('\\.ph(?:ar|p|tml)$'); // Ubuntu 26.04: the same
    for (const theirs of patterns) {
      for (const name of names) if (new RegExp(theirs).test(name)) expect(`${name} ${ours.test(name)}`).toBe(`${name} true`);
    }
  });

  test('mod_php never runs a v1 file: engine off in the tree, guarded by <IfModule>', () => {
    for (const module of ['php_module', 'php7_module']) {
      const at = lines.indexOf(`<IfModule ${module}>`);
      expect(at).toBeGreaterThan(-1);
      expect(lines[at + 1]).toBe('php_admin_flag engine off');
      expect(lines[at + 2]).toBe('</IfModule>');
    }
  });

  test('the same text serves Debian and EL: only the socket path differs', () => {
    const swap = (text: string, from: AgentLayout) => text.split(from.site?.v1?.fpm.listen ?? '?').join('<SOCKET>');
    expect(swap(apacheWebInclude(EL), EL)).toBe(swap(body, DEBIAN));
    expect(swap(apacheWebInclude(REMI), REMI)).toBe(swap(body, DEBIAN));
    expect(apacheWebInclude(EL)).toContain('proxy:unix:/run/php-fpm/dedalo-test-v1.sock|fcgi://localhost');
    expect(apacheWebInclude(REMI)).toContain('proxy:unix:/var/opt/remi/php83/run/php-fpm/dedalo-test-v1.sock|fcgi://localhost');
  });

  test('declared API paths are used', () => {
    const custom = derive({
      ...unixDeclaration(),
      site: { domain: 'museum.example.org', api_paths: { v1: '/api/v1', v2: '/api/v2' }, fpm: { flavor: 'debian', version: '8.2' } },
    });
    const text = apacheWebInclude(custom);
    expect(text).toContain('Alias /api/v1 ');
    expect(text).toContain('<Location /api/v2/>');
  });
});

describe('nginx', () => {
  const body = nginxWebInclude(NGINX);
  const lines = body.split('\n').map(line => line.trim());

  test('the media rules through a zero-match glob, v1 ^~ with a nested handler, v2 proxied with its headers', () => {
    expect(lines).toContain('include /srv/dedalo_publication/rules/dedalo_media_publication.nginx.con[f];');
    expect(zeroMatchGlob('/a/b.conf')).toBe('/a/b.con[f]');
    expect(lines).toContain('location ^~ /dedalo/publication/server_api/v1/ {');
    expect(lines).toContain('alias /srv/dedalo_publication/publication_api/v1/current/;');
    expect(lines).toContain(`location ~ ${PHP_HANDLER_PATTERN} {`);
    expect(lines).toContain('fastcgi_param SCRIPT_FILENAME $request_filename;');
    expect(lines).toContain('fastcgi_pass unix:/run/php/dedalo-test-v1.sock;');
    expect(lines).toContain('location /dedalo/publication/server_api/v2/ {');
    expect(lines).toContain('proxy_pass http://127.0.0.1:3100/;');
    for (const header of ['Host $host', 'X-Forwarded-For $proxy_add_x_forwarded_for', 'X-Forwarded-Proto $scheme']) {
      expect(lines).toContain(`proxy_set_header ${header};`);
    }
  });

  test('balanced braces (the block nests)', () => {
    expect((body.match(/\{/g) ?? []).length).toBe((body.match(/\}/g) ?? []).length);
  });
});

describe('grammar re-check (every interpolated value)', () => {
  test('a newline or a `..` in a path never reaches the include', () => {
    const bad = (patch: (l: AgentLayout) => AgentLayout) => () => apacheWebInclude(patch(DEBIAN));
    const site = DEBIAN.site!;
    const v1 = site.v1!;
    expect(bad(l => ({ ...l, site: { ...site, v1: { ...v1, apiPath: '/x\nAlias / /' } } }))).toThrow(/site.api_paths.v1/);
    expect(bad(l => ({ ...l, site: { ...site, v2ApiPath: '/x\nAlias / /' } }))).toThrow(/site.api_paths.v2/);
    expect(bad(l => ({ ...l, site: { ...site, v1: { ...v1, fpm: { ...v1.fpm, listen: '/run/../x.sock' } } } }))).toThrow(/site.fpm.listen/);
    expect(bad(l => ({ ...l, state: { ...l.state, rules: '/srv/x y' } }))).toThrow(/rules directory/);
    expect(bad(l => ({ ...l, v2: { ...l.v2, port: 0 } }))).toThrow(/not a port/);
  });
});
