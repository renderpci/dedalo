/**
 * parseDeclaration: strict structure (zod) then derive's laws, one DeclarationError naming
 * every issue.
 */
import { describe, expect, test } from 'bun:test';
import type { HostDeclaration } from '../src/provision/layout';
import { FPM_FLAVORS, OS_FAMILIES, canonicalDeclaration as layoutCanonical } from '../src/provision/layout';
import {
  DECLARATION_KEY_ORDER,
  DeclarationError,
  canonicalDeclaration,
  declarationSchema,
  inferLayout,
  parseDeclaration,
} from '../src/provision/schema';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

function issues(raw: unknown): string[] {
  try {
    parseDeclaration(raw, '/etc/dedalo_publication_host/test.json');
  } catch (error) {
    if (error instanceof DeclarationError) return error.issues.map(issue => issue.path);
    throw error;
  }
  throw new Error('parseDeclaration accepted the declaration');
}

describe('parseDeclaration', () => {
  test('accepts the unix and tls fixtures and derives their layout', () => {
    expect(parseDeclaration(unixDeclaration(), 'x').layout.listen.kind).toBe('unix');
    expect(parseDeclaration(tlsDeclaration(), 'x').layout.listen.kind).toBe('tls');
  });

  test('unknown keys are refused at every level', () => {
    expect(issues({ ...unixDeclaration(), extra: 1 })).toEqual(['(root)']);
    const decl = unixDeclaration();
    expect(issues({ ...decl, web: { ...decl.web, reload: 'x' } })).toEqual(['web']);
    expect(issues({ ...decl, listen: { kind: 'unix', socket: '/tmp/x.sock' } })).toEqual(['listen']);
  });

  test('the configtest binary is derived: declaring one is an unknown key', () => {
    const decl = unixDeclaration();
    expect(issues({ ...decl, web: { ...decl.web, configtest_bin: '/usr/local/sbin/apachectl' } })).toEqual(['web']);
  });

  test('every structural issue is listed, not just the first', () => {
    const paths = issues({ ...unixDeclaration(), agent_user: 'Root', php_bin: 'php', listen: { kind: 'udp' } });
    expect(paths).toContain('agent_user');
    expect(paths).toContain('php_bin');
    expect(paths).toContain('listen.kind');
  });

  test('a tls port out of range and a non-integer v2 port are refused', () => {
    const decl = tlsDeclaration();
    expect(issues({ ...decl, listen: { kind: 'tls', host: '10.8.0.2', port: 70000 } })).toEqual(['listen.port']);
    expect(issues({ ...decl, v2: { ...decl.v2, port: 3100.5 } })).toEqual(['v2.port']);
  });

  test("derive's cross-field laws surface as a DeclarationError with the field", () => {
    const { engine_group: _dropped, ...noGroup } = unixDeclaration();
    expect(issues(noGroup)).toEqual(['engine_group']);
  });

  test('the message names the file and each issue on its own line', () => {
    try {
      parseDeclaration({}, '/etc/dedalo_publication_host/test.json');
      throw new Error('accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(DeclarationError);
      const message = (error as Error).message;
      expect(message.split('\n')[0]).toBe("declaration '/etc/dedalo_publication_host/test.json' refused:");
      expect(message).toContain('  - instance:');
    }
  });
});

/** A home-layout site declaration (decision B). */
function site(overrides: Partial<HostDeclaration> = {}): HostDeclaration {
  return {
    ...unixDeclaration(),
    agent_dir: '/home/example.org/host_agent',
    state_root: '/home/example.org/dedalo',
    bun_bin: '/home/example.org/.bun/bin/bun',
    v1: { user: 'test_v1' },
    media: { mode: 'none' },
    site: { domain: 'example.org', fpm: { flavor: 'remi', version: '8.4' } },
    ...overrides,
  };
}

describe('provision init fields (spec S6, S10, §2.2, §13.6)', () => {
  test('a site declaration parses; every old declaration still does (its bytes and meaning unchanged)', () => {
    const { layout } = parseDeclaration(site(), 'x');
    expect(layout.site?.v1?.fpm.unit).toBe('php84-php-fpm');
    expect(parseDeclaration(unixDeclaration(), 'x').layout.site).toBeNull();
  });

  test('the new optional fields parse', () => {
    const decl = site({
      web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d', log_dirs: ['/home/example.org/logs'] },
      paths: { host_base: '/scratch/_host', nginx_conf_d: '/scratch/conf.d', fpm_pool_dir: '/scratch/pool.d', v1_var_base: '/scratch/var' },
    });
    const { layout } = parseDeclaration(decl, 'x');
    expect([layout.web.nginxMap, layout.host.base]).toEqual(['conf_d', '/scratch/_host']);
  });

  test('structure is strict in every new block', () => {
    const decl = site();
    expect(issues({ ...decl, site: { ...decl.site, extra: 1 } })).toEqual(['site']);
    expect(issues({ ...decl, site: { domain: 'example.org', fpm: { flavor: 'debian', version: '8.4', pool: 'x' } } })).toEqual(['site.fpm']);
    expect(issues({ ...decl, site: { domain: 'example.org', fpm: { flavor: 'debian' } } })).toEqual(['site.fpm.version']);
    expect(issues({ ...decl, site: { domain: 'EXAMPLE', fpm: { flavor: 'debian', version: '8.4' } } })).toEqual(['site.domain']);
    expect(issues({ ...decl, site: { domain: 'example.org', fpm: { flavor: 'scl', version: '8.4' } } })).toEqual(['site.fpm.flavor']);
    // One systemd profile (S10): the field is gone, and a declaration naming it is refused.
    expect(issues({ ...decl, systemd_floor: 247 })).toEqual(['(root)']);
    expect(issues({ ...decl, web: { server: 'nginx', unit: 'nginx', nginx_map: 'http' } })).toEqual(['web.nginx_map']);
    expect(issues({ ...decl, web: { server: 'nginx', unit: 'nginx', log_dirs: ['relative'] } })).toEqual(['web.log_dirs.0']);
    expect(issues({ ...decl, paths: { selinux_dir: '/x' } })).toEqual(['paths']);
    // derive's laws surface with their field.
    expect(issues({ ...decl, site: { domain: 'example.org', fpm: { flavor: 'debian', version: '7.4' } } })).toEqual(['site.fpm.version']);
    // media.selinux_label (init's selinux.media_access=act): only `true`, only with shared media.
    expect(parseDeclaration({ ...decl, media: { mode: 'shared', root: '/mnt/dedalo_media', selinux_label: true } }, 'x').layout.media.selinuxLabel).toBe(true);
    expect(issues({ ...decl, media: { mode: 'shared', root: '/mnt/dedalo_media', selinux_label: false } })).toEqual(['media.selinux_label']);
    expect(issues({ ...decl, media: { mode: 'copy', root: '/srv/pubmedia', selinux_label: true } })).toEqual(['media.selinux_label']);
  });

  test('the schema enums are the layout constants', () => {
    const shape = declarationSchema.shape;
    const siteShape = shape.site.unwrap().shape;
    expect(siteShape.fpm.unwrap().shape.flavor.options).toEqual([...FPM_FLAVORS]);
    expect(siteShape.os_family.unwrap().options).toEqual([...OS_FAMILIES]);
    expect('systemd_floor' in shape).toBe(false);
  });

  test("DECLARATION_KEY_ORDER is the zod shapes' order, recursively (one key order, two declarations of it)", () => {
    type Shape = Record<string, unknown>;
    const unwrap = (schema: unknown): unknown => {
      let current = schema as { def?: { type?: string }; unwrap?: () => unknown; options?: unknown[] };
      while (current.def?.type === 'optional') current = current.unwrap?.() as typeof current;
      return current;
    };
    const orderOf = (schema: unknown): unknown => {
      const node = unwrap(schema) as { def?: { type?: string }; shape?: Shape; options?: { shape: Shape }[] };
      if (node.def?.type === 'object' && node.shape) {
        return Object.fromEntries(Object.entries(node.shape).map(([key, child]) => [key, orderOf(child)]));
      }
      if (node.def?.type === 'union' && node.options?.every(option => (option as { shape?: Shape }).shape)) {
        // The listen union: every option's keys, first appearance order.
        const keys: string[] = [];
        for (const option of node.options) for (const key of Object.keys(option.shape)) if (!keys.includes(key)) keys.push(key);
        return Object.fromEntries(keys.map(key => [key, null]));
      }
      return null;
    };
    const fromZod = orderOf(declarationSchema);
    const json = (value: unknown) => JSON.stringify(value);
    expect(json(fromZod)).toBe(json(DECLARATION_KEY_ORDER));
  });

  test('canonicalDeclaration / inferLayout are layout.ts\'s, re-exported', () => {
    expect(canonicalDeclaration).toBe(layoutCanonical);
    expect(inferLayout(site())).toBe('home');
    const body = canonicalDeclaration(parseDeclaration(JSON.parse(JSON.stringify(site())), 'x').declaration);
    expect(parseDeclaration(JSON.parse(body), 'x').declaration).toEqual(site());
  });
});
