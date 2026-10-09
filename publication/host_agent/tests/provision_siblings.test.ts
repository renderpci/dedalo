/**
 * siblings.ts — several instances on one host: what one may never share with another.
 * The CLI wiring (reading, parsing, refusing) is held by tests/provision_cli.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import type { HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { anySiblingHomeBound, siblingRefusals } from '../src/provision/siblings';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

/** A sibling with every principal, unit, port and root of its own; `patch` re-shares one. */
function separated(base: HostDeclaration, patch: Partial<HostDeclaration> = {}): HostDeclaration {
  return {
    ...base,
    instance: 'other',
    agent_user: 'pubhost-other',
    state_root: '/srv/pub_other',
    media: { mode: 'shared', root: '/mnt/media_other' },
    v1: { user: 'pool-other' },
    v2: {
      unit: 'api-v2-other',
      user: 'api-v2-other',
      group: 'api-v2-other',
      port: 3999,
      health_url: 'http://127.0.0.1:3999/health',
    },
    ...patch,
  };
}

const judge = (own: HostDeclaration, other: HostDeclaration) =>
  siblingRefusals(derive(own), [{ source: '/etc/dedalo_publication_host/other.json', layout: derive(other) }]);

describe('siblingRefusals', () => {
  test('separated instances coexist; sharing the web server, php, bun, agent code and a shared media root is fine', () => {
    const own = unixDeclaration();
    expect(judge(own, separated(own, { media: own.media }))).toEqual([]);
  });

  test("a user is never shared across roles either: our agent_user as their v2.user is refused", () => {
    const own = unixDeclaration();
    const other = separated(own);
    expect(judge(own, { ...other, v2: { ...other.v2, user: own.agent_user } })).toEqual([
      `agent_user '${own.agent_user}' is that instance's v2.user — also used by instance 'other' (/etc/dedalo_publication_host/other.json); give each instance its own users (one compromised instance must not reach the other)`,
    ]);
  });

  test('tls: the same address and port is refused; another port on the same address is fine', () => {
    const own = tlsDeclaration();
    expect(judge(own, separated(own)).join('\n')).toContain(`listen ${own.listen.kind === 'tls' ? own.listen.host : ''}`);
    const listen = own.listen.kind === 'tls' ? { ...own.listen, port: own.listen.port + 1 } : own.listen;
    expect(judge(own, separated(own, { listen }))).toEqual([]);
  });

  test('a copy-mode media root under the other instance state root, or a state root inside theirs, is refused', () => {
    const own = { ...unixDeclaration(), media: { mode: 'copy' as const, root: '/srv/pub_other/media' } };
    expect(judge(own, separated(own))).toEqual([
      "media.root (copy) '/srv/pub_other/media' overlaps that instance's state_root '/srv/pub_other' — also used by instance 'other' (/etc/dedalo_publication_host/other.json); use separate directories",
    ]);
    const nested = unixDeclaration();
    expect(judge(nested, separated(nested, { state_root: `${nested.state_root}/inner` })).join('\n')).toContain(
      `state_root '${nested.state_root}' overlaps that instance's state_root`,
    );
  });

  test('our v2 unit named like their web unit or their agent unit is refused (it would shadow or control it)', () => {
    const own = unixDeclaration();
    const other = separated(own, { web: { server: 'nginx', unit: 'nginx' } });
    expect(judge({ ...own, v2: { ...own.v2, unit: 'nginx' } }, other).join('\n')).toContain(
      "v2.unit 'nginx' is that instance's web.unit",
    );
    expect(judge({ ...own, v2: { ...own.v2, unit: 'dedalo-publication-host-other' } }, other).join('\n')).toContain(
      "v2.unit 'dedalo-publication-host-other' is that instance's agent unit",
    );
  });

  test('our engine_group as one of their service groups is refused (their code could open our socket)', () => {
    const own = unixDeclaration();
    const other = separated(own);
    expect(judge({ ...own, engine_group: other.v2.group }, other).join('\n')).toContain(
      `engine_group '${other.v2.group}' is one of that instance's service groups`,
    );
    // One work system, one engine group: sharing it is the normal case.
    expect(judge(own, { ...other, engine_group: own.engine_group })).toEqual([]);
  });

  test('a loopback tls listener on their v2 port is refused', () => {
    const own = { ...tlsDeclaration(), listen: { kind: 'tls' as const, host: '127.0.0.1', port: 3999 } };
    expect(judge(own, separated(own, { listen: { kind: 'tls', host: '10.9.0.9', port: 7443 } })).join('\n')).toContain(
      "listen 127.0.0.1:3999 is that instance's v2.port",
    );
  });

  test('segment-wise overlap: a "..x" child segment is inside, a sibling prefix is not', () => {
    const own = unixDeclaration();
    expect(judge(own, separated(own, { state_root: `${own.state_root}/..x` })).join('\n')).toContain('overlaps');
    expect(judge(own, separated(own, { state_root: `${own.state_root}x` }))).toEqual([]);
  });

  test('one pool user for two sites (or mod_php) is refused: it owns, and reads, both v1 configurations', () => {
    const own = unixDeclaration();
    expect(judge(own, separated(own, { v1: own.v1 }))).toEqual([
      `v1.user '${own.v1!.user}' is that instance's v1.user — also used by instance 'other' (/etc/dedalo_publication_host/other.json); run each site's v1 API in its own PHP-FPM pool, under its own user, and declare that user as v1.user`,
    ]);
  });

  test('our v1 user as their agent user is refused', () => {
    const own = unixDeclaration();
    expect(judge(own, separated(own, { agent_user: own.v1!.user })).join('\n')).toContain(
      `v1.user '${own.v1!.user}' is that instance's agent_user`,
    );
  });

  test('our shared (read-only) media root under a tree they write is refused', () => {
    const own = unixDeclaration();
    const other = separated(own, { state_root: '/mnt', media: { mode: 'none' } });
    expect(judge(own, other).join('\n')).toContain(`media.root '${own.media.root}' overlaps that instance's state_root '/mnt'`);
  });

  test("the web server's group shared by every site's pool is NOT a refusal: the v1 user guards the configuration", () => {
    const own = unixDeclaration();
    expect(judge(own, separated(own, { web: own.web }))).toEqual([]);
  });
});

describe('the site block across instances (spec S6)', () => {
  const siteOf = (domain: string, flavor: 'debian' | 'el' | 'remi' = 'debian') => ({ domain, fpm: { flavor, version: '8.4' } });
  const own: HostDeclaration = { ...unixDeclaration(), v1: { user: 'test_v1' }, site: siteOf('a.example.org') };

  test('two sites on one host, each its own: coexist', () => {
    expect(judge(own, separated(own, { site: siteOf('b.example.org') }))).toEqual([]);
  });

  test('the same domain is refused, named', () => {
    const refusals = judge(own, separated(own, { site: siteOf('a.example.org') }));
    expect(refusals.some(line => line.startsWith("site.domain 'a.example.org' — also used by instance 'other'"))).toBe(true);
  });

  test('the same v1Var, pool socket and pool file are refused (a shared paths.v1_var_base / fpm_pool_dir can collide)', () => {
    // derive() names these paths by instance, so two parsed declarations cannot meet here; the rule
    // still holds the line (a hand-edited override, a future flavour). Seam: a sibling layout forged to ours.
    const shared = { paths: { fpm_pool_dir: '/scratch/pool.d', v1_var_base: '/scratch/var' } };
    const a = derive({ ...own, ...shared });
    const b = derive({ ...separated(own, { site: siteOf('b.example.org') }), ...shared });
    const forged = { ...b, site: b.site === null ? null : { ...b.site, v1: a.site?.v1 ?? b.site.v1 } };
    const refusals = siblingRefusals(a, [{ source: '/etc/dedalo_publication_host/other.json', layout: forged }]);
    expect(refusals.some(line => line.includes("the v1 pool directory '/scratch/var/test/v1'"))).toBe(true);
    expect(refusals.some(line => line.includes("the v1 pool socket '/run/php/dedalo-test-v1.sock'"))).toBe(true);
    expect(refusals.some(line => line.includes("the v1 pool file '/scratch/pool.d/dedalo_test_v1.conf'"))).toBe(true);
  });

  test('a sibling without a site never clashes on site fields', () => {
    expect(judge(own, separated(own, { site: undefined }))).toEqual([]);
  });

  test('anySiblingHomeBound: the host-wide ProtectHome fact (spec S10)', () => {
    const home = separated(unixDeclaration(), { state_root: '/home/b.example.org/dedalo' });
    expect(anySiblingHomeBound([{ source: 'x', layout: derive(home) }])).toBe(true);
    expect(anySiblingHomeBound([{ source: 'x', layout: derive(separated(unixDeclaration())) }])).toBe(false);
    expect(anySiblingHomeBound([])).toBe(false);
  });
});
