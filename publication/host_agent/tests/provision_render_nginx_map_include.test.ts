/**
 * The provisioned nginx map include (src/provision/render/nginx_map_include.ts, spec §13.6):
 * exact bytes, the `_host` stamp, `appliesTo`, and the zero-match glob.
 */
import { describe, expect, test } from 'bun:test';
import { hasDrifted, parseStamp } from '../src/provision/hash';
import { derive, type HostDeclaration, NGINX_MAP_INCLUDE_PATH } from '../src/provision/layout';
import { nginxMapIncludeBody, nginxMapIncludeRenderer, zeroMatchGlob } from '../src/provision/render/nginx_map_include';
import { PENDING_FACTS } from '../src/provision/render/types';
import { HOST_MAP_FILE } from '../src/rules/host_map';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

const MAP_HOST: HostDeclaration = { ...tlsDeclaration(), web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } };

describe('nginxMapIncludeRenderer', () => {
  test('exact bytes, stamped `_host nginx_map_include`, root 0644 at NGINX_MAP_INCLUDE_PATH', () => {
    const [artifact, ...rest] = nginxMapIncludeRenderer.render(derive(MAP_HOST), PENDING_FACTS);
    expect(rest).toEqual([]);
    const body = [
      '# The Dédalo media map, shared by every publication-host instance on this host.',
      '# Its content is pushed by the work system (apply_rules); until then nothing is defined.',
      'include /var/lib/dedalo_publication_host/_host/nginx_map/dedalo_media_map.nginx.con[f];',
      '',
    ].join('\n');
    const stamp = parseStamp(artifact?.body ?? '');
    expect(stamp).toMatchObject({ kind: 'nginx_map_include', instance: '_host', body });
    expect(artifact?.body.startsWith('# dedalo-provision: _host nginx_map_include ')).toBe(true);
    expect(hasDrifted(artifact?.body ?? '')).toBe(false);
    expect(artifact).toMatchObject({
      kind: 'nginx_map_include',
      path: NGINX_MAP_INCLUDE_PATH,
      owner: 'root',
      group: 'root',
      mode: 0o644,
      effects: ['reload_web'],
      validate: 'web',
      service: null,
      hostWide: true,
    });
  });

  test('the glob names the live map the root renderer writes', () => {
    expect(nginxMapIncludeBody(derive(MAP_HOST))).toContain(`${HOST_MAP_FILE.slice(0, -1)}[${HOST_MAP_FILE.slice(-1)}];`);
  });

  test('host-wide: every instance renders the same bytes; the scratch overrides move both paths', () => {
    const a = nginxMapIncludeRenderer.render(derive(MAP_HOST), PENDING_FACTS)[0]?.body;
    const b = nginxMapIncludeRenderer.render(derive({ ...MAP_HOST, instance: 'other' }), PENDING_FACTS)[0]?.body;
    expect(a).toBe(b);
    const scratch = derive({ ...MAP_HOST, paths: { host_base: '/tmp/h/_host', nginx_conf_d: '/tmp/h/conf.d' } });
    const [artifact] = nginxMapIncludeRenderer.render(scratch, PENDING_FACTS);
    expect(artifact?.path).toBe('/tmp/h/conf.d/dedalo_media_map.conf');
    expect(artifact?.body).toContain('include /tmp/h/_host/nginx_map/dedalo_media_map.nginx.con[f];');
  });

  test('appliesTo: nginx with web.nginx_map conf_d only', () => {
    expect(nginxMapIncludeRenderer.appliesTo?.(derive(MAP_HOST))).toBe(true);
    expect(nginxMapIncludeRenderer.appliesTo?.(derive(tlsDeclaration()))).toBe(false); // nginx, none
    expect(nginxMapIncludeRenderer.appliesTo?.(derive(unixDeclaration()))).toBe(false); // apache
  });

  test('zeroMatchGlob refuses anything but a plain absolute path', () => {
    expect(zeroMatchGlob('/a/b.conf')).toBe('/a/b.con[f]');
    for (const bad of ['a/b.conf', '/a/b c.conf', '/a/b;.conf', '/a/b.con]', '/a/{b}.conf']) {
      expect(() => zeroMatchGlob(bad)).toThrow(/plain absolute path/);
    }
  });
});
