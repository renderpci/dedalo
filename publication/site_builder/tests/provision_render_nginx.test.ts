/**
 * THE NGINX VHOST GATE — the guarantees, not the formatting.
 *
 * `src/provision/render/nginx.ts` replaces two committed files that were a single wildcard
 * `server{}` per SURFACE for the whole host. Every property asserted below is one those
 * files did not have, and each is written as a property of the RENDERED TEXT rather than a
 * comparison against a golden file: a byte-for-byte fixture would go red on a comment and
 * green on a deleted `deny all`, which is exactly backwards for an artifact whose entire
 * job is to keep a museum's drafts and release store off the public internet.
 *
 * What is actually being defended, in the order the file below asserts it:
 *
 *   - ONE FILE PER SITE PER SURFACE, at the path the LAYOUT derived. The shared wildcard is
 *     the reason one password gated every institution's drafts.
 *   - THE RELEASE STORE IS NOT PUBLIC. `.releases/` is a sibling of the served link, and
 *     every generated vhost denies dotted paths — while still answering `/.well-known/`,
 *     without which the certificate that keeps the site reachable cannot be renewed.
 *   - THE SERVED SYMLINK STILL RESOLVES AND A SMUGGLED ONE DOES NOT. The publish design is
 *     a symlink swap, so `disable_symlinks off` is tempting and was what shipped.
 *   - NO SECRET IN A VHOST. A path, never a value — asserted against the credential VALUES
 *     a declaration's files would hold.
 *   - A MANIFEST STRING CANNOT ESCAPE ITS DIRECTIVE. Asserted through `derive()` directly,
 *     because that is the second entry point the schema does not guard: a `provision adopt`
 *     builds a manifest from what is on disk, and `serving.prod.tls.certificate`,
 *     `serving.aliases` and a site's `webspace` reach the renderer checked for
 *     ABSOLUTENESS and nothing else.
 *   - DERIVE, NEVER RESTATE. Every path in the output moves when the declaration moves it.
 *   - PURE AND STABLE. The provisioner writes on drift; an unstable byte rewrites a
 *     museum's live vhosts on every run and buries the real change in the noise.
 *
 * The last describe block hands the rendered text to the REAL nginx, when the machine has
 * one. A skipped syntax check is not a green one — the assertions above carry the
 * guarantees on their own — but "we believe this is nginx syntax" and "nginx says it is"
 * are different claims, and the quoted location regex, the `from=$document_root` clause and
 * the PCRE lookahead are precisely the three places where the config tokenizer, not the
 * author, has the last word.
 */

import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SURFACES,
  derive,
  isWritablePath,
  type InstanceLayout,
  type InstanceManifest,
  type Surface,
} from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { parseStamp, hasDrifted } from '../src/provision/hash';
import { nginxRenderer } from '../src/provision/render/nginx';
import type { Artifact } from '../src/provision/render/types';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Fixtures
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The smallest declaration that renders two sites' worth of vhosts.
 *
 * Built here as a PLAIN OBJECT and fed to `derive()` directly for most tests, because that
 * is the entry point this renderer must defend on its own account. The schema is exercised
 * separately (`parses the committed example`, below) so both doors are covered.
 */
function baseManifest(patch: Record<string, any> = {}): InstanceManifest {
  return {
    instance: 'gate',
    description: 'The gate instance',
    engine: {
      private_dir: '/srv/dedalo/gate/private',
      group: 'dedalo-gate',
      checkout_dir: '/srv/dedalo/gate/master_dedalo',
      bun_bin: '/srv/dedalo/gate/.bun/bin/bun',
    },
    web: { server: 'nginx', group: 'www-data' },
    publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
    sites: [
      { slug: 'one', domain: 'one.example.org' },
      { slug: 'two', domain: 'two.example.net' },
    ],
    serving: {
      preprod: { enabled: true, auth: { mode: 'htpasswd', realm: 'Gate preprod' } },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code' },
    ...patch,
  } as InstanceManifest;
}

function layoutOf(patch: Record<string, any> = {}): InstanceLayout {
  return derive(baseManifest(patch));
}

function render(layout: InstanceLayout): Artifact[] {
  // The manifest argument is unused by this renderer BY DESIGN — everything with a path, a
  // name or a mode in it has already been derived, and reading it off the manifest instead
  // is how an override reaches one artifact and misses another.
  return nginxRenderer.render(layout, baseManifest());
}

/** The rendered text of one site's one surface. */
function vhost(layout: InstanceLayout, slug: string, surface: Surface): string {
  const site = layout.sites.find(s => s.slug === slug);
  if (!site) throw new Error(`no site '${slug}' in the fixture`);
  const found = render(layout).find(a => a.path === site.vhostPaths[surface]);
  if (!found) throw new Error(`no ${surface} vhost rendered for '${slug}'`);
  return found.body;
}

/** The message of whatever the renderer threw — refusals are asserted by their text. */
function refusal(layout: InstanceLayout): string {
  try {
    render(layout);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the render to be REFUSED, and it produced a vhost');
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. The grain: one file per site per surface, where the layout says
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('one vhost per site per surface', () => {
  test('every rendered path is one the LAYOUT derived — never one the renderer spelled', () => {
    const layout = layoutOf();
    const expected = layout.sites.flatMap(site => SURFACES.map(s => site.vhostPaths[s])).sort();
    expect(render(layout).map(a => a.path).sort()).toEqual(expected);
  });

  test('two sites never share a file', () => {
    // The whole defect of the shipped wildcard vhosts: one server_name, one document root
    // and one auth_basic_user_file for every site on the host.
    const layout = layoutOf();
    const artifacts = render(layout);
    expect(new Set(artifacts.map(a => a.path)).size).toBe(artifacts.length);
    expect(vhost(layout, 'one', 'prod')).not.toContain('two.example.net');
    expect(vhost(layout, 'two', 'prod')).not.toContain('one.example.org');
  });

  test('a disabled draft surface has no file at all', () => {
    // Not "a file that goes unused": an unauthenticated preprod vhost sitting in
    // sites-available is one `include` away from publishing a museum's drafts.
    const layout = layoutOf({
      serving: {
        preprod: { enabled: false, auth: { mode: 'htpasswd' } },
        prod: { tls: { mode: 'none' } },
      },
    });
    const paths = render(layout).map(a => a.path);
    expect(paths).toHaveLength(2);
    for (const site of layout.sites) {
      expect(paths).toContain(site.vhostPaths.prod);
      expect(paths).not.toContain(site.vhostPaths.preprod);
    }
  });

  test('an Apache instance renders no nginx vhost', () => {
    expect(nginxRenderer.appliesTo?.(layoutOf({ web: { server: 'apache', group: 'www-data' } }))).toBe(false);
    expect(nginxRenderer.appliesTo?.(layoutOf())).toBe(true);
  });

  test('every artifact is a hostConfig: root:root 0644, stamped, and self-consistent', () => {
    for (const a of render(layoutOf())) {
      expect(a.kind).toBe('nginx_vhost');
      expect(a.modeKey).toBe('hostConfig');
      expect(a.owner).toBe('root');
      expect(a.group).toBe('root');
      expect(a.mode).toBe(0o644);
      // The stamp is the only thing on the host that tells our bytes from a hand edit.
      expect(parseStamp(a.body)?.instance).toBe('gate');
      expect(hasDrifted(a.body)).toBe(false);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. The document root is the served link, and the unit agrees it is writable
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the document root', () => {
  test('is the site\'s served link for that surface, and nothing above it', () => {
    const layout = layoutOf();
    for (const site of layout.sites) {
      for (const surface of SURFACES) {
        const text = vhost(layout, site.slug, surface);
        expect(text).toContain(`root "${site.linkPath(surface)}";`);
        // Never the webspace itself as a document root: `.releases/` is its child, and
        // serving the parent is how every retained release became publicly fetchable.
        expect(text).not.toContain(`root "${site.webspace}";\n`);
      }
    }
  });

  test('is covered by the writable set the UNIT will grant — one layout, two artifacts', () => {
    // A vhost whose document root the daemon cannot write is a site that can never be
    // published; the two artifacts are generated from the same layout precisely so this
    // cannot drift apart. (ProtectSystem=strict makes the failure an EROFS at publish
    // time — on a museum's live site — rather than an install error.)
    const layout = layoutOf({ webspace_base: '/srv/www' });
    for (const site of layout.sites) {
      for (const surface of SURFACES) {
        expect(isWritablePath(layout, site.linkPath(surface))).toBe(true);
      }
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. The release store is not public
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('every generated vhost denies dotted paths', () => {
  test('the deny rule is in EVERY file, on every surface', () => {
    const layout = layoutOf({ serving: { preprod: { enabled: true, auth: { mode: 'htpasswd' } }, prod: { tls: { mode: 'letsencrypt', account_email: 'ops@example.org' } } } });
    for (const a of render(layout)) {
      expect(a.body).toContain('deny all;');
      expect(a.body).toMatch(/location ~ "\/\\\.\(\?!well-known\/\)" \{/);
    }
  });

  test('the exemption is exactly /.well-known and nothing else', () => {
    // The lookahead is load-bearing: a flat `location ~ /\.` denies the ACME http-01
    // challenge, and a certificate that cannot renew takes the site down three months
    // later, for a reason nobody will connect to this line.
    const text = vhost(layoutOf(), 'one', 'prod');

    // Assert the SEMANTICS, not the spelling. The lookahead shipped once as
    // `(?!well-known)` without the trailing slash, which exempts every path whose dotted
    // segment merely BEGINS with those characters — `/.well-known-backup/`,
    // `/.well-knownish/` — so the deny rule had a hole any attacker could name. Pulling the
    // pattern out and running it against real request paths is the only form of this test
    // that would have caught that.
    const rule = text.match(/location ~ "([^"]+)" \{/);
    expect(rule).not.toBeNull();
    const deny = new RegExp(rule![1]!.replace(/\\\\/g, '\\'));

    // Exempt: the one directory the carve-out exists for.
    expect(deny.test('/.well-known/acme-challenge/token')).toBe(false);
    // Denied: everything else dotted, INCLUDING near-misses on the carve-out.
    expect(deny.test('/.well-known-backup/secrets')).toBe(true);
    expect(deny.test('/.well-knownish/x')).toBe(true);
    expect(deny.test('/.releases/prod/20260101/index.html')).toBe(true);
    expect(deny.test('/.git/config')).toBe(true);
    expect(deny.test('/.env')).toBe(true);
    // Not denied: an ordinary page.
    expect(deny.test('/index.html')).toBe(false);
    expect(text).not.toMatch(/location ~ "?\/\\\." *\{/);
  });

  test('the deny is a REGEX location, which outranks the prefix that would serve the file', () => {
    // nginx picks a matching regex location over `location /` — that precedence IS the
    // guarantee. A deny written as a prefix location would lose to the try_files below it
    // and change nothing at all. (The behaviour itself is asserted against a running nginx
    // in the last block of this file.)
    const text = vhost(layoutOf(), 'one', 'prod');
    expect(text).toMatch(/location ~ "[^"]+" \{\n {8}deny all;/);
    expect(text).toContain('location / {');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. Symlinks: the served link resolves, a smuggled one does not
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the symlink policy', () => {
  test('is if_not_owner from=$document_root in every file, and never off', () => {
    // `off` is what shipped, and it follows an absolute link an agent turn wrote into a
    // workspace and `cp` copied verbatim into a release. `from=$document_root` is what
    // keeps the legitimate release link — which IS the document root — resolving.
    for (const a of render(layoutOf())) {
      expect(a.body).toContain('disable_symlinks if_not_owner from=$document_root;');
      expect(a.body).not.toContain('disable_symlinks off');
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. Preprod is authenticated, unindexed, and per INSTANCE
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the draft surface', () => {
  test('challenges with the PER-INSTANCE htpasswd and the declared realm', () => {
    const layout = layoutOf();
    const text = vhost(layout, 'one', 'preprod');
    expect(text).toContain('auth_basic "Gate preprod";');
    expect(text).toContain(`auth_basic_user_file "${layout.htpasswd}";`);
    // PER INSTANCE, which is the defect being fixed: the shipped file named one
    // /etc/dedalo_sites/preprod.htpasswd for the whole host.
    expect(layout.htpasswd).toContain('/gate/');
    expect(vhost(derive(baseManifest({ instance: 'other' })), 'one', 'preprod')).not.toContain(
      layout.htpasswd,
    );
  });

  test('is never indexed, on every response', () => {
    expect(vhost(layoutOf(), 'one', 'preprod')).toContain(
      'add_header X-Robots-Tag "noindex, nofollow" always;',
    );
  });

  test('an auth mode of "none" renders no challenge AND says so in the file', () => {
    // The declaration is honoured — a validated field the artifact silently overrode would
    // make the declaration a lie — but a museum reading its own vhost must see the choice.
    const text = vhost(
      layoutOf({
        serving: {
          preprod: { enabled: true, auth: { mode: 'none' } },
          prod: { tls: { mode: 'none' } },
        },
      }),
      'one',
      'preprod',
    );
    expect(text).not.toContain('auth_basic_user_file');
    expect(text).toContain('NO AUTHENTICATION');
    expect(text).toContain('add_header X-Robots-Tag "noindex, nofollow" always;');
  });

  test('production carries no authentication at all', () => {
    // A published heritage site is public by intent — that is the whole point of the
    // preprod/prod split, and a stray auth_basic here is a museum's collection offline.
    const layout = layoutOf();
    for (const site of layout.sites) {
      expect(vhost(layout, site.slug, 'prod')).not.toContain('auth_basic');
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. TLS follows the declaration, in all three modes
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the production transport', () => {
  test('mode none serves on port 80 and redirects nowhere', () => {
    const text = vhost(layoutOf(), 'one', 'prod');
    expect(text).not.toContain('ssl_certificate');
    expect(text).not.toContain('return 301');
    expect(text).toContain('listen 80;');
    expect(text).toContain('try_files $uri $uri/ =404;');
  });

  test('mode files renders the DECLARED certificate and key, and redirects port 80', () => {
    const text = vhost(
      layoutOf({
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd' } },
          prod: { tls: { mode: 'files', certificate: '/etc/ssl/one.crt', key: '/etc/ssl/one.key' } },
        },
      }),
      'one',
      'prod',
    );
    expect(text).toContain('ssl_certificate "/etc/ssl/one.crt";');
    expect(text).toContain('ssl_certificate_key "/etc/ssl/one.key";');
    expect(text).toContain('listen 443 ssl;');
    expect(text).toContain('return 301 https://one.example.org$request_uri;');
    // Nothing renews here, so no challenge location is opened.
    expect(text).not.toContain('acme-challenge');
  });

  test('mode letsencrypt serves the http-01 challenge from the WEBSPACE, not the served link', () => {
    // The served link does not exist until something has been published, and the
    // certificate must be obtained before nginx can start with it — so the challenge is
    // rooted at the webspace the provisioner creates.
    const layout = layoutOf({
      serving: {
        preprod: { enabled: true, auth: { mode: 'htpasswd' } },
        prod: { tls: { mode: 'letsencrypt', account_email: 'ops@example.org' } },
      },
    });
    const site = layout.sites[0]!;
    const text = vhost(layout, 'one', 'prod');
    expect(text).toContain('location ^~ /.well-known/acme-challenge/ {');
    expect(text).toContain(`root "${site.webspace}";`);
    expect(text).toContain('ssl_certificate "/etc/letsencrypt/live/one.example.org/fullchain.pem";');
    expect(text).toContain('ssl_certificate_key "/etc/letsencrypt/live/one.example.org/privkey.pem";');
    // The redirect must live INSIDE a location: a server-level `return` runs before
    // location selection and would swallow the challenge, which fails renewal silently.
    const acme = text.indexOf('acme-challenge');
    const redirect = text.indexOf('return 301');
    expect(acme).toBeLessThan(redirect);
    expect(text).not.toMatch(/^ {4}return 301/m);
  });

  test('THE ACME CONTACT REACHES THE FILE — a required field may not validate and vanish', () => {
    // `serving.prod.tls.account_email` is required with `letsencrypt` and was used by
    // nothing at all: it installed cleanly and disappeared, which is the one defect §11
    // names by hand ("no field validates and then vanishes"). This provisioner does not run
    // an ACME client — obtaining a certificate needs DNS that already points here, which no
    // declaration can assert — so what it owes the operator is the address, in the file they
    // open when the certificate is missing.
    const text = vhost(
      layoutOf({
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd' } },
          prod: { tls: { mode: 'letsencrypt', account_email: 'certs@museum.example' } },
        },
      }),
      'one',
      'prod',
    );
    expect(text).toContain('certs@museum.example');
    expect(text).toContain('serving.prod.tls.account_email');
    // …and only where it means something: a museum that terminates TLS elsewhere has no
    // ACME contact and gets no line about one.
    const none = vhost(
      layoutOf({
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd' } },
          prod: { tls: { mode: 'none' } },
        },
      }),
      'one',
      'prod',
    );
    expect(none).not.toContain('account_email');
  });

  test('no HSTS is emitted in any mode', () => {
    // A browser-side latch outliving the declaration that set it: a museum that later
    // moves TLS upstream and declares mode none would be unreachable for the header's
    // remaining lifetime.
    for (const tls of [
      { mode: 'none' },
      { mode: 'files', certificate: '/etc/ssl/one.crt', key: '/etc/ssl/one.key' },
      { mode: 'letsencrypt', account_email: 'ops@example.org' },
    ]) {
      const layout = layoutOf({
        serving: { preprod: { enabled: true, auth: { mode: 'htpasswd' } }, prod: { tls } },
      });
      for (const a of render(layout)) expect(a.body).not.toContain('Strict-Transport-Security');
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 7. Aliases: rendered, sorted, refused when they point nowhere
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('serving.aliases', () => {
  const withAliases = (aliases: Record<string, string>, tls: any = { mode: 'none' }) =>
    layoutOf({
      serving: {
        preprod: { enabled: true, auth: { mode: 'htpasswd' } },
        prod: { tls },
        aliases,
      },
    });

  test('a declared alias becomes a redirect in the OWNING site\'s prod file', () => {
    // A field that validates and is then ignored is the defect this subsystem deletes: the
    // museum would have a hostname that resolves and a vhost that never answers it.
    const layout = withAliases({ 'example.org': 'one' });
    const text = vhost(layout, 'one', 'prod');
    expect(text).toContain('server_name example.org;');
    expect(text).toContain('return 301 http://one.example.org$request_uri;');
    expect(vhost(layout, 'two', 'prod')).not.toContain('example.org;');
    expect(vhost(layout, 'one', 'preprod')).not.toContain('server_name example.org;');
  });

  test('the redirect follows the declared transport', () => {
    const text = vhost(
      withAliases({ 'example.org': 'one' }, { mode: 'files', certificate: '/etc/ssl/c', key: '/etc/ssl/k' }),
      'one',
      'prod',
    );
    expect(text).toContain('return 301 https://one.example.org$request_uri;');
  });

  test('reordering the alias map does not change a byte', () => {
    // Object.entries walks JSON in written order; a provisioner that writes on drift would
    // otherwise rewrite a live vhost over a formatting change in the declaration.
    const a = vhost(withAliases({ 'a.example.org': 'one', 'b.example.org': 'one' }), 'one', 'prod');
    const b = vhost(withAliases({ 'b.example.org': 'one', 'a.example.org': 'one' }), 'one', 'prod');
    expect(a).toBe(b);
  });

  test('an alias naming a site that does not exist is REFUSED, and nothing is rendered', () => {
    expect(refusal(withAliases({ 'example.org': 'ghost' }))).toContain("does not declare");
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 8. No secret, ever
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a vhost names paths and never values', () => {
  test('no credential VALUE, key name or token can appear in a rendered vhost', () => {
    const layout = layoutOf({
      secrets: { ANTHROPIC_API_KEY: '/etc/dedalo_sites/instances/gate/secrets/ANTHROPIC_API_KEY' },
      publication_api: {
        url: 'http://127.0.0.1:3100/publication/server_api/v2',
        key_path: '/etc/dedalo_sites/instances/gate/secrets/PUBLICATION_API_KEY',
      },
      serving: {
        preprod: {
          enabled: true,
          auth: {
            mode: 'htpasswd',
            users: [{ name: 'preview', password_file: '/etc/dedalo_sites/instances/gate/secrets/PREPROD_PASSWORD' }],
          },
        },
        prod: { tls: { mode: 'none' } },
      },
    });
    for (const a of render(layout)) {
      // Not the credential files, not the key names, not a token: the ONE credential a
      // vhost may name is the htpasswd, and it names it as a path the web server reads
      // through its own group.
      for (const forbidden of [
        'ANTHROPIC_API_KEY',
        'PUBLICATION_API_KEY',
        'PREPROD_PASSWORD',
        'SERVICE_TOKEN',
        'LoadCredential',
        'preview',
      ]) {
        expect(a.body).not.toContain(forbidden);
      }
      expect(a.body).not.toContain(layout.secretsDir);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 9. A manifest string cannot escape its directive
 *
 * Every case below goes through `derive()` and NOT through the schema, because that is the
 * door this renderer has to hold on its own: `provision adopt` builds a manifest from what
 * is on disk, and `derive()` checks a webspace, an htpasswd and a certificate path for
 * ABSOLUTENESS and nothing else. Each asserts a REFUSAL — not an escaped rendering — for
 * the reason layout.ts gives about the same strings: escaping is a property two renderers
 * would have to agree on forever, a grammar is a property of the value.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('injection', () => {
  test('a webspace that closes the root directive is refused', () => {
    const evil = '/srv/www/x"; } location / { root /etc; #';
    const message = refusal(
      layoutOf({ sites: [{ slug: 'one', domain: 'one.example.org', webspace: evil }] }),
    );
    expect(message).toContain('document root');
    expect(message).toContain('Nothing was rendered');
  });

  test('a newline in a path cannot open a second directive', () => {
    const evil = '/srv/www/x\nlocation /secret { alias /etc; }';
    expect(
      refusal(layoutOf({ sites: [{ slug: 'one', domain: 'one.example.org', webspace: evil }] })),
    ).toContain('does not match');
  });

  test('an htpasswd path with a quote is refused', () => {
    const message = refusal(
      layoutOf({
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd', htpasswd: '/etc/x"; deny all; #' } },
          prod: { tls: { mode: 'none' } },
        },
      }),
    );
    expect(message).toContain('htpasswd');
  });

  test('a certificate path is refused — the schema never looked at it beyond absoluteness', () => {
    const message = refusal(
      layoutOf({
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd' } },
          prod: {
            tls: { mode: 'files', certificate: '/etc/ssl/c"; return 200 "owned"; #', key: '/etc/ssl/k' },
          },
        },
      }),
    );
    expect(message).toContain('certificate');
  });

  test('an alias hostname is not a place to write a directive', () => {
    const message = refusal(
      layoutOf({
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd' } },
          prod: { tls: { mode: 'none' } },
          aliases: { 'evil.org; } server { listen 80 default_server; root /etc': 'one' },
        },
      }),
    );
    expect(message).toContain('serving.aliases');
  });

  test('a realm that closes its own quote is refused even when derive() let it past', () => {
    // The historical escape, and the reason this renderer re-checks a string layout.ts has
    // already validated: a THIRD entry point (a layout assembled in code) is exactly what
    // `derive()` being the second one predicts.
    const layout = { ...layoutOf(), preprodRealm: 'Drafts"; } location /x { alias /etc; #' };
    expect(refusal(layout as InstanceLayout)).toContain('realm');
  });

  test('a description carrying a newline cannot become a directive in the header comment', () => {
    const layout = { ...layoutOf(), description: 'fine\nserver { listen 80 default_server; }' };
    expect(refusal(layout as InstanceLayout)).toContain('description');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 10. Derive, never restate — and render the same bytes forever
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('every path in the output follows the declaration', () => {
  test('moving the bases moves the vhost, its document root and its htpasswd together', () => {
    const layout = layoutOf({
      webspace_base: '/srv/pages',
      paths: { config_base: '/opt/dedalo_sites/instances', vhost_dir: '/opt/nginx/vhosts' },
    });
    const site = layout.sites[0]!;
    expect(site.vhostPaths.prod.startsWith('/opt/nginx/vhosts/')).toBe(true);
    const text = vhost(layout, 'one', 'prod');
    expect(text).toContain('root "/srv/pages/one.example.org/web";');
    expect(vhost(layout, 'one', 'preprod')).toContain(
      'auth_basic_user_file "/opt/dedalo_sites/instances/gate/preprod.htpasswd";',
    );
    // The defaults must be GONE, not merely overridden somewhere else in the file.
    for (const a of render(layout)) {
      expect(a.body).not.toContain('/home/www');
      expect(a.body).not.toContain('/etc/dedalo_sites');
    }
  });

  test('the preprod host prefix is the declared one', () => {
    const text = vhost(
      layoutOf({
        serving: {
          preprod: { enabled: true, host_prefix: 'draft', auth: { mode: 'htpasswd' } },
          prod: { tls: { mode: 'none' } },
        },
      }),
      'one',
      'preprod',
    );
    expect(text).toContain('server_name draft.one.example.org;');
  });

  test('rendering twice produces identical bytes', () => {
    // Pure by law: the provisioner writes only on drift, so a timestamp, a hostname or an
    // unsorted set here would rewrite a museum's live vhosts on every run.
    const first = render(layoutOf()).map(a => a.body);
    const second = render(layoutOf()).map(a => a.body);
    expect(second).toEqual(first);
  });

  test('the committed example declaration renders through the SCHEMA door too', () => {
    const doc = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'deploy', 'examples', 'instance.example.json'), 'utf8'),
    );
    const layout = derive(parseManifest(doc));
    const artifacts = nginxRenderer.render(layout, parseManifest(doc));
    expect(artifacts).toHaveLength(4);
    for (const a of artifacts) expect(hasDrifted(a.body)).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 11. And nginx itself agrees it is a configuration
 *
 * Skipped when the machine has no nginx — a skipped syntax check is not a green one, and
 * everything above stands on its own. What this adds is the one judgement the assertions
 * cannot make for themselves: the config TOKENIZER, not PCRE and not the author, decides
 * whether `location ~ "/\.(?!well-known)"` and `disable_symlinks if_not_owner
 * from=$document_root` parse. `ssl_certificate` is read at parse time, so the TLS case
 * needs a real certificate — self-signed, thrown away with the directory.
 * ──────────────────────────────────────────────────────────────────────────────────── */

const NGINX = Bun.which('nginx');
const OPENSSL = Bun.which('openssl');

describe.if(NGINX !== null && OPENSSL !== null)('real nginx accepts the rendered vhosts', () => {
  test('nginx -t is successful for every TLS mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dedalo-nginx-'));
    try {
      execFileSync(OPENSSL as string, [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'),
        '-days', '2', '-subj', '/CN=gate',
      ], { stdio: 'ignore' });

      for (const [name, tls] of [
        ['none', { mode: 'none' }],
        ['files', { mode: 'files', certificate: join(dir, 'c.pem'), key: join(dir, 'k.pem') }],
      ] as const) {
        const confDir = join(dir, name);
        mkdirSync(confDir, { recursive: true });
        const layout = layoutOf({
          serving: {
            preprod: { enabled: true, auth: { mode: 'htpasswd', realm: 'Gate preprod' } },
            prod: { tls },
            aliases: { 'example.org': 'one' },
          },
        });
        let n = 0;
        for (const a of render(layout)) writeFileSync(join(confDir, `${n++}.conf`), a.body);

        const main = join(dir, `${name}.conf`);
        // THE PID FILE IS THIS RUN'S OWN. `nginx -t` opens the pid path its configuration
        // names, and without a `pid` directive that is the COMPILED-IN default — so a suite
        // run on a host that actually runs nginx TRUNCATES the live server's pid file, and
        // the next `systemctl reload nginx` on that host finds nothing to signal. A gate
        // that can break the thing it is testing is not a gate.
        // AND THE ACCESS LOG IS THIS RUN'S OWN PROBLEM, not the host's. `nginx -t` OPENS
        // the log paths the configuration names, and with no `access_log` directive that
        // is again the COMPILED-IN default — `/var/log/nginx/access.log` on a Debian
        // package, which is root-owned. The gate passed on a Homebrew nginx (its default
        // lives under the user-writable prefix) and failed on every Linux runner with
        //   nginx: [emerg] open() "/var/log/nginx/access.log" failed (13: Permission denied)
        // reported as a syntax failure, which is the one thing it is not. `-e` already
        // moves the error log; this moves the other one. The live-server block below has
        // always carried `access_log off;` for the same reason -- this is that fix, in the
        // block that was missed.
        writeFileSync(
          main,
          `events {}\npid ${join(dir, `${name}.pid`)};\nhttp {\n  access_log off;\n  include ${confDir}/*.conf;\n}\n`,
        );
        // Throws on a non-zero exit, which is the assertion: nginx -t fails the whole
        // reload, and one bad vhost takes down every site on the host.
        execFileSync(NGINX as string, ['-t', '-c', main, '-p', dir, '-e', join(dir, 'error.log')], {
          stdio: 'pipe',
        });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  /**
   * THE ONE ASSERTION THAT IS NOT ABOUT TEXT.
   *
   * Everything above says the rendered file CONTAINS a deny and a symlink policy. This
   * serves the file and asks nginx what it actually does with a webspace shaped exactly
   * like a real one — a released tree behind the swapped `web` symlink, a dotfile in it, a
   * `.well-known` in it, and an absolute symlink out of it of the kind `cp` copies verbatim
   * out of an agent's workspace. Those four answers are the entire security story of this
   * artifact, and a `toContain` cannot make any of them.
   *
   * The ONLY edit made to the rendered bytes is the listen port: a test cannot bind 80.
   */
  test('a released site serves, its dotfiles do not, and a smuggled symlink is refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dedalo-nginx-serve-'));
    const port = 8000 + (process.pid % 900);
    const main = join(dir, 'nginx.conf');
    let started = false;
    try {
      const layout = layoutOf({
        webspace_base: join(dir, 'www'),
        paths: { state_base: join(dir, 'state'), vhost_dir: join(dir, 'conf') },
        serving: {
          preprod: { enabled: false, auth: { mode: 'htpasswd' } },
          prod: { tls: { mode: 'none' } },
        },
      });
      const site = layout.sites.find(s => s.slug === 'one')!;

      // A webspace as the daemon leaves it: an immutable release, and `web` pointing at it.
      const release = join(site.releasesDir('prod'), 'r1');
      mkdirSync(join(release, '.well-known'), { recursive: true });
      mkdirSync(join(release, 'sub'), { recursive: true });
      writeFileSync(join(release, 'index.html'), 'LIVE\n');
      writeFileSync(join(release, '.env'), 'API_KEY=would-have-been-served\n');
      writeFileSync(join(release, '.well-known', 'x.txt'), 'acme\n');
      // The link `promoteRelease` copies out of a workspace verbatim: absolute, and
      // pointing at something this uid does not own.
      symlinkSync('/etc/hosts', join(release, 'sub', 'leak.txt'));
      symlinkSync(release, site.linkPath('prod'));

      mkdirSync(join(dir, 'conf'), { recursive: true });
      for (const a of render(layout)) {
        // The listen port, and nothing else. Asserted rather than assumed, so a renderer
        // that stopped emitting `listen 80` cannot make this test silently serve nothing.
        expect(a.body).toContain('    listen 80;');
        writeFileSync(
          a.path,
          a.body.replace('    listen 80;', `    listen ${port};`).replace('    listen [::]:80;\n', ''),
        );
      }

      // THE PID FILE IS THIS RUN'S OWN, and it is the reason this block does not leak nginx
      // masters. Without a `pid` directive nginx uses its COMPILED-IN default — one absolute
      // path shared by every process on the machine — so two runs of this gate (or a run
      // beside a real nginx) overwrite each other's, and `-s stop` then signals the wrong
      // pid or none at all, leaving a master bound to this port until somebody notices. A
      // pid inside the temporary directory cannot be shared with anything.
      writeFileSync(
        main,
        `events {}\npid ${join(dir, 'nginx.pid')};\nhttp {\n  access_log off;\n  include ${join(dir, 'conf')}/*.conf;\n}\n`,
      );
      execFileSync(NGINX as string, ['-c', main, '-p', dir, '-e', join(dir, 'error.log')], { stdio: 'pipe' });
      started = true;

      const status = (path: string): number => {
        const out = execFileSync('curl', [
          '-s', '-o', '/dev/null', '-w', '%{http_code}',
          '-H', 'Host: one.example.org', `http://127.0.0.1:${port}${path}`,
        ]);
        return Number(out.toString().trim());
      };

      /**
       * WAIT FOR THE LISTENER, AND SAY SO IF IT NEVER COMES.
       *
       * `nginx -c` returns as soon as the master has forked; the workers bind a moment
       * later. Under an otherwise-idle machine curl wins that race anyway, which is why this
       * read as a stable test — and under a loaded one (the full suite, CI) it does not, and
       * curl's `000` for "could not connect" arrives as a bare `expect(000).toBe(200)` that
       * looks exactly like a vhost that stopped serving. A gate whose failure message
       * accuses the artifact of something the artifact did not do is worse than no gate.
       */
      const deadline = Date.now() + 5000;
      while (status('/index.html') === 0 && Date.now() < deadline) {
        execFileSync('sleep', ['0.05']);
      }
      expect({ listening: status('/index.html') !== 0, port }).toEqual({ listening: true, port });

      // The publish design still works: the served link resolves through the policy.
      expect(status('/index.html')).toBe(200);
      // The dotfiles a build leaves behind do not.
      expect(status('/.env')).toBe(403);
      expect(status('/.git/config')).toBe(403);
      // The one dotted path a public site must answer on still answers.
      expect(status('/.well-known/x.txt')).toBe(200);
      // And a link out of the release is not followed.
      expect(status('/sub/leak.txt')).toBe(404);
    } finally {
      // STOPPED TWO WAYS, because the temporary directory is about to be deleted underneath
      // it. `-s stop` is the polite one and it reads the pid file above; if it fails for any
      // reason the pid is read directly and signalled, so a failure ANYWHERE in this test
      // cannot leave a master process bound to this port for the rest of the session.
      if (started) {
        try {
          execFileSync(NGINX as string, ['-c', main, '-p', dir, '-e', join(dir, 'error.log'), '-s', 'stop'], {
            stdio: 'pipe',
          });
        } catch {
          const pid = Number((readFileSync(join(dir, 'nginx.pid'), 'utf8') || '').trim());
          if (Number.isInteger(pid) && pid > 0) {
            try {
              process.kill(pid, 'SIGTERM');
            } catch {
              // Already gone. Nothing to stop and nothing to say.
            }
          }
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * Preprod authentication fails CLOSED.
 *
 * Both vhost renderers chose their auth block with `mode === 'htpasswd' ? … : no auth`.
 * An `else` is a fail-open default: a mode the renderer has not learned yet — a new one, or
 * a typo that reached derive() through `adopt` rather than through the schema — renders an
 * UNAUTHENTICATED preprod vhost and a comment claiming somebody asked for that.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('an unknown preprod auth mode is refused, never served open', () => {
  test('nginx refuses rather than rendering an unauthenticated draft surface', () => {
    const layout = layoutOf({
      serving: { preprod: { enabled: true, auth: { mode: 'oauth2' } }, prod: { tls: { mode: 'none' } } },
    }) as never;
    expect(() => render(layout)).toThrow(/unknown serving\.preprod\.auth\.mode/);
  });

  test('and the declared modes still render', () => {
    for (const mode of ['htpasswd', 'none'] as const) {
      const layout = layoutOf({
        serving: { preprod: { enabled: true, auth: { mode } }, prod: { tls: { mode: 'none' } } },
      });
      expect(() => render(layout)).not.toThrow();
    }
  });

  test('the htpasswd mode actually emits the auth directives', () => {
    const text = vhost(
      layoutOf({ serving: { preprod: { enabled: true, auth: { mode: 'htpasswd' } }, prod: { tls: { mode: 'none' } } } }),
      'one',
      'preprod',
    );
    expect(text).toContain('auth_basic ');
    expect(text).toContain('auth_basic_user_file ');
  });
});
