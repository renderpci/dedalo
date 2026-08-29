/**
 * THE APACHE VHOST GATE — the guarantees, never the formatting.
 *
 * Every assertion below is a property an operator or a visitor could feel: what the web
 * server will HAND OUT, what it will REFUSE, what it will not start over, and what it will
 * never contain. None of them is "the file looks like this" — a renderer is free to
 * reword a comment or reorder a block, and a gate that reddened on that would be a gate
 * people learn to update without reading.
 *
 * The properties, and the failure each one is standing in front of:
 *
 *   - ONE FILE PER SITE PER SURFACE. The committed `apache/dedalo_sites.conf` was one
 *     vhost for the whole host, so every museum's drafts sat behind one shared password.
 *   - THE DOCUMENT ROOT IS THE DERIVED SERVED LINK, and no rendered byte names a state
 *     root or the paired engine's private directory. A vhost that served a workspace would
 *     publish the git history, the agent's tree and whatever it pasted there.
 *   - DOTFILES ARE DENIED — asserted by EXECUTING the rendered regexes against real paths
 *     (`.git`, `.env`, `.releases`), not by matching the directive's text. And
 *     `/.well-known/acme-challenge/` is NOT denied, because a blanket dotfile rule is the
 *     reason certificates silently stop renewing.
 *   - PREPROD IS ACTUALLY AUTHENTICATED. The file this replaces put `Require all granted`
 *     beside `Require valid-user`; Apache wraps a section's Require directives in an
 *     implicit <RequireAny>, so the password was decorative and the drafts were public.
 *     That exact byte sequence is the thing this gate refuses.
 *   - NOTHING A MANIFEST STRING CAN SAY ESCAPES ITS DIRECTIVE. A realm, a hostname, a
 *     document root and a certificate path are each poisoned with a quote, a backslash and
 *     a newline, and the renderer must REFUSE — not escape, not render.
 *   - NO SECRET, EVER: no credential path, no reviewer's password file, no key. A vhost may
 *     name the htpasswd it authenticates against and nothing else.
 *   - THE BYTES ARE A PURE FUNCTION OF THE LAYOUT. Same layout, same bytes; a reordered
 *     alias map, same bytes. The provisioner writes only on drift, so instability here
 *     rewrites a museum's live vhosts on every run and buries the real change in noise.
 *
 * The gate builds its layouts through `derive(parseManifest(...))` — the only composition
 * either module supports — and calls `apacheRenderer.render()` DIRECTLY rather than
 * `renderAll()`, so it stays a test of this renderer and not of its four siblings.
 */

import { describe, expect, test } from 'bun:test';
import {
  MODES,
  SURFACES,
  derive,
  type InstanceLayout,
  type InstanceManifest,
  type SiteLayout,
} from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { hasDrifted, parseStamp } from '../src/provision/hash';
import { apacheRenderer } from '../src/provision/render/apache';
import type { Artifact } from '../src/provision/render/types';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Fixtures
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The smallest APACHE declaration that parses. One site, drafts on, no TLS. */
function baseDoc(): Record<string, any> {
  return {
    instance: 'gate',
    engine: { private_dir: '/srv/dedalo/gate/private', group: 'dedalo-gate' },
    web: { server: 'apache', group: 'www-data' },
    publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
    sites: [{ slug: 'one', domain: 'one.example.org' }],
    serving: {
      preprod: {
        enabled: true,
        auth: {
          mode: 'htpasswd',
          realm: 'Gate preprod',
          users: [{ name: 'preview', password_file: '/etc/dedalo_gate/PREPROD_PASSWORD' }],
        },
      },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
  };
}

/** `baseDoc()` with a shallow-merged patch — the shape every case below uses. */
function docWith(patch: Record<string, any>): Record<string, any> {
  const doc = baseDoc();
  for (const [key, value] of Object.entries(patch)) {
    doc[key] =
      value !== null && typeof value === 'object' && !Array.isArray(value) && typeof doc[key] === 'object'
        ? { ...doc[key], ...value }
        : value;
  }
  return doc;
}

function layoutFrom(doc: unknown): InstanceLayout {
  return derive(parseManifest(doc, { source: 'the apache gate' }));
}

/**
 * The manifest argument, deliberately EMPTY.
 *
 * `Renderer.render` is handed both, and the law is "reach for the layout first: anything
 * with a path, a name, an owner or a mode has already been derived, and reading it off the
 * manifest instead is how an override reaches one artifact and misses another". Passing
 * nothing at all is how this gate holds the renderer to that — if it ever starts reading a
 * declaration behind the layout's back, every case in this file breaks at once.
 */
const NO_MANIFEST = {} as InstanceManifest;

function render(layout: InstanceLayout): Artifact[] {
  return apacheRenderer.render(layout, NO_MANIFEST);
}

/** The one artifact for a site + surface, found by its DERIVED path. */
function fileFor(layout: InstanceLayout, site: SiteLayout, surface: 'preprod' | 'prod'): string {
  const found = render(layout).find(a => a.path === site.vhostPaths[surface]);
  if (!found) throw new Error(`no apache artifact was rendered at ${site.vhostPaths[surface]}`);
  return found.body;
}

/** A frozen layout with one field bent — the shape every injection case needs. */
function poison(layout: InstanceLayout, patch: Partial<Record<keyof InstanceLayout, unknown>>): InstanceLayout {
  return { ...layout, ...patch } as InstanceLayout;
}

/** The same, for one site: the spread keeps `linkPath`/`releasesDir` (own properties). */
function poisonSite(layout: InstanceLayout, patch: Record<string, unknown>): InstanceLayout {
  const site = { ...layout.sites[0]!, ...patch } as SiteLayout;
  return poison(layout, { sites: Object.freeze([site]) });
}

/** Every value of a repeated directive, in file order. */
function directiveValues(body: string, directive: string): string[] {
  const pattern = new RegExp(`^\\s*${directive}\\s+"([^"]*)"`, 'gm');
  return [...body.matchAll(pattern)].map(m => m[1]!);
}

/** The lines of `body` that are not comments and not blank — the DIRECTIVES. */
function directiveLines(body: string): string[] {
  return body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'));
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. The grain: one file per site per surface, at the derived path
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the grain', () => {
  test('one artifact per site per surface, each at its DERIVED vhost path', () => {
    // The defect this replaces was ONE vhost for the whole host: adding a museum meant
    // hand-editing a root-owned file, and every museum's drafts shared one password.
    const layout = layoutFrom(
      docWith({
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org' },
        ],
      }),
    );
    const artifacts = render(layout);
    expect(artifacts).toHaveLength(4);

    const expected = layout.sites.flatMap(site => SURFACES.map(surface => site.vhostPaths[surface]));
    expect([...artifacts.map(a => a.path)].sort()).toEqual([...expected].sort());
  });

  test('every artifact is a hostConfig: root:root 0644, and stamped as an apache_vhost', () => {
    const layout = layoutFrom(baseDoc());
    for (const produced of render(layout)) {
      expect(produced.kind).toBe('apache_vhost');
      expect(produced.modeKey).toBe('hostConfig');
      expect(produced.owner).toBe('root');
      expect(produced.group).toBe('root');
      expect(produced.mode).toBe(MODES.hostConfig.mode);

      // The stamp reads back and agrees with its own body: the whole basis on which a
      // later run tells our bytes from an operator's hand edit.
      const parsed = parseStamp(produced.body);
      expect(parsed?.kind).toBe('apache_vhost');
      expect(parsed?.instance).toBe(layout.instance);
      expect(hasDrifted(produced.body)).toBe(false);
    }
  });

  test('this renderer is SILENT on an nginx host, and speaks on an apache one', () => {
    expect(apacheRenderer.appliesTo?.(layoutFrom(docWith({ web: { server: 'nginx' } })))).toBe(false);
    expect(apacheRenderer.appliesTo?.(layoutFrom(baseDoc()))).toBe(true);
  });

  test('a disabled draft surface produces NO preprod file at all', () => {
    // Not an unauthenticated file that merely goes unused: that is one `include` away
    // from publishing a museum's drafts.
    const layout = layoutFrom(
      docWith({
        serving: { preprod: { enabled: false, auth: { mode: 'none' } }, prod: { tls: { mode: 'none' } } },
      }),
    );
    const paths = render(layout).map(a => a.path);
    expect(paths).toEqual([layout.sites[0]!.vhostPaths.prod]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. What is served, and what is never named
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the document root is the derived served link, and nothing else is reachable', () => {
  test('every DocumentRoot equals site.linkPath(surface)', () => {
    const layout = layoutFrom(
      docWith({
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org', webspace: '/srv/legacy/two' },
        ],
      }),
    );
    for (const site of layout.sites) {
      for (const surface of SURFACES) {
        const roots = directiveValues(fileFor(layout, site, surface), 'DocumentRoot');
        expect(roots.length).toBeGreaterThan(0);
        for (const root of roots) expect(root).toBe(site.linkPath(surface));
      }
    }
  });

  test('the ACCESS POLICY is scoped to the webspace — so the served SYMLINK is governed too', () => {
    // Apache checks the symlink options while walking each path component. A <Directory>
    // scoped to the document root would leave the `pre`/`web` link itself governed by the
    // host's <Directory /> default — on Debian a bare `Options FollowSymLinks`, which is
    // the policy this renderer exists to narrow.
    const layout = layoutFrom(baseDoc());
    const site = layout.sites[0]!;
    for (const surface of SURFACES) {
      const dirs = directiveValues(fileFor(layout, site, surface), '<Directory');
      expect(dirs).toContain(site.webspace);
    }
  });

  test('NO rendered byte names a state root, the engine private dir, or a release store', () => {
    // A vhost that served a workspace would publish the git history (every revision the
    // agent ever produced), its node_modules and the daemon's private .builder state; one
    // that served a release store would serve rolled-back bytes and preprod drafts from
    // the production host.
    const layout = layoutFrom(
      docWith({ roots: { audit: '/srv/audit/gate' }, sites: [{ slug: 'one', domain: 'one.example.org' }] }),
    );
    const site = layout.sites[0]!;
    const forbidden = [
      layout.roots.workspaces,
      layout.roots.home,
      layout.roots.audit,
      layout.auditFile,
      layout.enginePrivateDir,
      layout.secretsDir,
      site.releasesDir('preprod'),
      site.releasesDir('prod'),
    ];
    for (const produced of render(layout)) {
      for (const path of forbidden) expect(produced.body).not.toContain(path);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. The symlink policy and the .htaccess ban
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the served tree cannot reconfigure the web server, and cannot point off it', () => {
  test('symlinks are followed only when owner-matched, and never blanket-followed', () => {
    // The daemon swaps a link it owns into a release tree it owns, so publishing keeps
    // working; a symlink an agent turn wrote into a build, pointing at /etc or at another
    // museum's webspace, is owned by somebody else and is NOT followed.
    const layout = layoutFrom(baseDoc());
    for (const produced of render(layout)) {
      const options = directiveLines(produced.body).filter(line => line.startsWith('Options '));
      expect(options.length).toBeGreaterThan(0);
      for (const line of options) {
        expect(line).toContain('-FollowSymLinks');
        expect(line).toContain('+SymLinksIfOwnerMatch');
        // A bare `FollowSymLinks` (the old committed config's whole symlink policy)
        // follows anything anywhere. The '-' prefix must be there.
        expect(line).not.toMatch(/(^|\s)\+?FollowSymLinks/);
        expect(line).toContain('-Indexes');
      }
    }
  });

  test('.htaccess is off everywhere: AllowOverride None, never anything else', () => {
    // The served tree is written by an agent turn. With overrides on, a file the agent
    // dropped into the document root would be web-server CONFIGURATION — symlink
    // following back on, listings back on, or the auth below lifted.
    const layout = layoutFrom(baseDoc());
    for (const produced of render(layout)) {
      const overrides = directiveLines(produced.body).filter(line => line.startsWith('AllowOverride'));
      expect(overrides.length).toBeGreaterThan(0);
      for (const line of overrides) expect(line).toBe('AllowOverride None');
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. Dotfiles — asserted by RUNNING the rendered rules
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('dotfiles are denied, and /.well-known/ is not', () => {
  /** The rendered guard, as executable rules rather than as text. */
  function guards(body: string): { directory: RegExp; file: RegExp; denies: (path: string) => boolean } {
    const dir = /<DirectoryMatch\s+"([^"]+)">\s*\n\s*Require all denied/.exec(body);
    const file = /<FilesMatch\s+"([^"]+)">\s*\n\s*Require all denied/.exec(body);
    if (!dir || !file) throw new Error('the rendered vhost carries no dotfile deny');
    const directory = new RegExp(dir[1]!);
    const fileRe = new RegExp(file[1]!);
    return {
      directory,
      file: fileRe,
      // What Apache asks: DirectoryMatch against the walked directory path, FilesMatch
      // against the basename. Either one denying is a denial.
      denies(path: string): boolean {
        const cut = path.lastIndexOf('/');
        return directory.test(path.slice(0, cut)) || fileRe.test(path.slice(cut + 1));
      },
    };
  }

  test('a .git, a .env, an editor swapfile and .releases are all denied', () => {
    const layout = layoutFrom(baseDoc());
    const site = layout.sites[0]!;
    for (const surface of SURFACES) {
      const root = site.linkPath(surface);
      const g = guards(fileFor(layout, site, surface));
      expect(g.denies(`${root}/.git/config`)).toBe(true);
      expect(g.denies(`${root}/.env`)).toBe(true);
      expect(g.denies(`${root}/.index.html.swp`)).toBe(true);
      expect(g.denies(`${site.webspace}/.releases/web/20260101/index.html`)).toBe(true);
      expect(g.denies(`${root}/.well-knownish/leak`)).toBe(true);
    }
  });

  test('an ACME http-01 challenge is NOT denied — the carve-out is exact', () => {
    // A blanket dotfile deny is the reason certificates silently stop renewing: the site
    // keeps working for sixty days and then does not, with nothing in the configuration
    // hinting at the connection.
    const layout = layoutFrom(baseDoc());
    const site = layout.sites[0]!;
    for (const surface of SURFACES) {
      const root = site.linkPath(surface);
      const g = guards(fileFor(layout, site, surface));
      expect(g.denies(`${root}/.well-known/acme-challenge/tokenvalue`)).toBe(false);
    }
  });

  test('ordinary content is served', () => {
    const layout = layoutFrom(baseDoc());
    const site = layout.sites[0]!;
    const g = guards(fileFor(layout, site, 'prod'));
    expect(g.denies(`${site.linkPath('prod')}/index.html`)).toBe(false);
    expect(g.denies(`${site.linkPath('prod')}/assets/img/coin.v2.jpg`)).toBe(false);
  });

  test('a webspace under a hidden directory is REFUSED, not silently 403ed', () => {
    // The guard matches the filesystem path Apache walks, so a webspace under /srv/.data
    // would make every request to the site match "a dot segment". A museum whose whole
    // site 403s must not be the way that is discovered.
    const layout = layoutFrom(
      docWith({ sites: [{ slug: 'one', domain: 'one.example.org', webspace: '/srv/.data/one' }] }),
    );
    expect(() => render(layout)).toThrow(/segment beginning with a dot/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. Preprod is authenticated; prod is public
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the draft surface', () => {
  test('is behind Basic auth against the PER-INSTANCE htpasswd, with the declared realm', () => {
    const layout = layoutFrom(baseDoc());
    const body = fileFor(layout, layout.sites[0]!, 'preprod');
    const lines = directiveLines(body);
    expect(lines).toContain('AuthType Basic');
    expect(lines).toContain('Require valid-user');
    expect(directiveValues(body, 'AuthUserFile')).toEqual([layout.htpasswd]);
    expect(directiveValues(body, 'AuthName')).toEqual([layout.preprodRealm]);
    expect(layout.preprodRealm).toBe('Gate preprod');
  });

  test('carries NO `Require all granted` — the implicit <RequireAny> auth bypass', () => {
    // THE BUG IN THE FILE THIS REPLACES (apache/dedalo_sites.conf:19-21): Apache 2.4 wraps
    // the Require directives of a section in an implicit <RequireAny>, so
    // `Require all granted` beside `Require valid-user` grants access when EITHER
    // succeeds. The config read as though it protected the drafts; it published them.
    //
    // Asserted over the DIRECTIVES and not over the file's text: the rendered comment says
    // the words out loud so the next reader of the vhost knows why the line is missing, and
    // a gate that grepped the whole file would forbid explaining itself.
    const layout = layoutFrom(baseDoc());
    const body = fileFor(layout, layout.sites[0]!, 'preprod');
    for (const line of directiveLines(body)) expect(line).not.toMatch(/Require\s+all\s+granted/);
  });

  test('is never indexable, on the challenge as well as on a 200', () => {
    const layout = layoutFrom(baseDoc());
    const body = fileFor(layout, layout.sites[0]!, 'preprod');
    const header = directiveLines(body).find(line => line.startsWith('Header '));
    expect(header).toBeDefined();
    expect(header).toContain('always');
    expect(header).toContain('X-Robots-Tag');
    expect(header).toContain('noindex');
    // Unguarded by <IfModule>: on a host without mod_headers this must be a configtest
    // failure the provisioner sees, not a silently dropped noindex.
    expect(body).not.toContain('IfModule');
  });

  test('an explicitly OPEN draft surface authenticates nobody and still says noindex', () => {
    // `auth.mode: 'none'` is a stated decision (the schema gives the switch no default),
    // so it renders — but it may not quietly keep the auth directives around either.
    const layout = layoutFrom(
      docWith({
        serving: { preprod: { enabled: true, auth: { mode: 'none' } }, prod: { tls: { mode: 'none' } } },
      }),
    );
    const body = fileFor(layout, layout.sites[0]!, 'preprod');
    expect(body).not.toContain('AuthType');
    expect(body).not.toContain('AuthUserFile');
    expect(body).toContain('Require all granted');
    expect(body).toContain('X-Robots-Tag');
  });
});

describe('the production surface', () => {
  test('has no authentication of any kind, and no noindex', () => {
    // Heritage sites are public by intent — a challenge on production is a museum's
    // collection unreachable, which is the failure this project exists to prevent.
    const layout = layoutFrom(baseDoc());
    const body = fileFor(layout, layout.sites[0]!, 'prod');
    expect(body).not.toContain('AuthType');
    expect(body).not.toContain('AuthUserFile');
    expect(body).not.toContain('valid-user');
    expect(body).not.toContain(layout.htpasswd);
    expect(body).not.toContain('X-Robots-Tag');
  });

  test('serves the production hostname; the draft file serves the prefixed one', () => {
    const layout = layoutFrom(baseDoc());
    const site = layout.sites[0]!;
    expect(directiveValues(fileFor(layout, site, 'prod'), 'ServerName')).toContain(site.domain);
    const draft = directiveValues(fileFor(layout, site, 'preprod'), 'ServerName');
    expect(draft).toEqual([site.preprodDomain]);
    expect(draft).not.toContain(site.domain);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. TLS — what is rendered, and what is deliberately not invented
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('TLS follows the declaration and never guesses a path', () => {
  test("mode 'files' serves 443 from the declared pair and redirects 80", () => {
    const layout = layoutFrom(
      docWith({
        serving: {
          preprod: baseDoc().serving.preprod,
          prod: { tls: { mode: 'files', certificate: '/etc/ssl/one.pem', key: '/etc/ssl/one.key' } },
        },
      }),
    );
    const body = fileFor(layout, layout.sites[0]!, 'prod');
    expect(body).toContain('<VirtualHost *:443>');
    expect(directiveValues(body, 'SSLCertificateFile')).toEqual(['/etc/ssl/one.pem']);
    expect(directiveValues(body, 'SSLCertificateKeyFile')).toEqual(['/etc/ssl/one.key']);
    expect(body).toContain(`Redirect permanent "/" "https://${layout.sites[0]!.domain}/"`);
    // The plain-HTTP vhost redirects and serves nothing.
    const httpBlock = body.slice(body.indexOf('<VirtualHost *:80>'), body.indexOf('</VirtualHost>'));
    expect(httpBlock).not.toContain('DocumentRoot');
  });

  test("mode 'letsencrypt' invents NO certificate path and does not redirect into a void", () => {
    // The schema refuses a declared certificate for this mode, so there is no path to
    // read. Rendering /etc/letsencrypt/live/<domain>/… would be a second owner of a
    // foreign convention, spelled identically in two renderers forever; redirecting to a
    // port nothing listens on would take the site down until the first certificate lands.
    const layout = layoutFrom(
      docWith({
        serving: {
          preprod: baseDoc().serving.preprod,
          prod: { tls: { mode: 'letsencrypt', account_email: 'ops@example.org' } },
        },
      }),
    );
    const body = fileFor(layout, layout.sites[0]!, 'prod');
    expect(body).not.toContain('/etc/letsencrypt');
    expect(body).not.toContain('SSLCertificateFile');
    expect(body).not.toContain('Redirect permanent');
    expect(body).toContain('DocumentRoot');
    // And it owes the ACME client a reachable challenge path — asserted for real in §4.
    expect(body).toContain('well-known');
  });

  test("mode 'none' serves plain HTTP and mentions no TLS at all", () => {
    const body = fileFor(layoutFrom(baseDoc()), layoutFrom(baseDoc()).sites[0]!, 'prod');
    expect(body).toContain('<VirtualHost *:80>');
    expect(body).not.toContain('SSLEngine');
    expect(body).not.toContain('443');
  });

  test("a 'files' declaration missing its key is REFUSED, not rendered half-built", () => {
    // `SSLEngine on` without a certificate is an Apache that will not start — taking every
    // OTHER museum's vhost on the host down with it.
    const layout = layoutFrom(baseDoc());
    const broken = poison(layout, {
      serving: { ...layout.serving, prod: { tls: { mode: 'files', certificate: '/etc/ssl/one.pem' } } },
    });
    expect(() => render(broken)).toThrow(/no key is declared/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 7. Aliases
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('aliases redirect, and cannot go nowhere or collide', () => {
  function withAliases(aliases: Record<string, string>): InstanceLayout {
    const doc = baseDoc();
    doc.serving.aliases = aliases;
    return layoutFrom(doc);
  }

  test('an alias becomes a redirect vhost in the PRODUCTION file only', () => {
    const layout = withAliases({ 'example.org': 'one' });
    const site = layout.sites[0]!;
    const prod = fileFor(layout, site, 'prod');
    expect(directiveValues(prod, 'ServerName')).toContain('example.org');
    expect(prod).toContain(`Redirect permanent "/" "http://${site.domain}/"`);
    // A draft surface has no public alias; rendering one there would publish the preprod
    // hostname of a site whose whole point is not being public yet.
    const draft = fileFor(layout, site, 'preprod');
    expect(directiveValues(draft, 'ServerName')).toEqual([site.preprodDomain]);
    expect(directiveLines(draft).some(line => line.startsWith('Redirect'))).toBe(false);
  });

  test('an alias pointing at a site this instance does not declare is REFUSED', () => {
    // It would otherwise be rendered into no file at all: the declaration says the
    // hostname is handled and the host handles nothing.
    const layout = layoutFrom(baseDoc());
    const broken = poison(layout, { serving: { ...layout.serving, aliases: { 'example.org': 'ghost' } } });
    expect(() => render(broken)).toThrow(/does not declare/);
  });

  test("an alias equal to a site's own hostname is REFUSED", () => {
    // Two vhosts claiming one ServerName is not a merge: Apache serves the first it read,
    // and which that is depends on the order of sites-enabled.
    const layout = layoutFrom(baseDoc());
    for (const host of [layout.sites[0]!.domain, layout.sites[0]!.preprodDomain]) {
      const broken = poison(layout, { serving: { ...layout.serving, aliases: { [host]: 'one' } } });
      expect(() => render(broken)).toThrow(/ServerName/);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 8. Injection — every string that reaches a directive
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('nothing a manifest string can say escapes its directive', () => {
  // Each of these lands inside a pair of double quotes in a file the web server parses as
  // ROOT. `derive()` is a second entry point — `provision adopt` builds a manifest from
  // what is on disk, with no declaration ever validated — so the renderer must refuse on
  // its own account rather than trusting the schema upstream.
  const POISONS = [
    '"',
    '\\',
    '\n',
    '"\nRequire all granted',
    'x" \n<Directory "/">\n  Require all granted\n</Directory>\n<Directory "x',
    '${APACHE_LOG_DIR}',
  ];

  test('the REALM cannot close AuthName', () => {
    const layout = layoutFrom(baseDoc());
    for (const poisonValue of POISONS) {
      const broken = poison(layout, { preprodRealm: `Museum ${poisonValue}` });
      expect(() => render(broken)).toThrow(/preprod realm/);
    }
  });

  test('a HOSTNAME cannot close ServerName', () => {
    const layout = layoutFrom(baseDoc());
    for (const poisonValue of POISONS) {
      expect(() => render(poisonSite(layout, { domain: `bad${poisonValue}.example.org` }))).toThrow();
      expect(() => render(poisonSite(layout, { preprodDomain: `bad${poisonValue}.example.org` }))).toThrow();
    }
  });

  test('a DOCUMENT ROOT or webspace cannot close its directive', () => {
    const layout = layoutFrom(baseDoc());
    for (const poisonValue of POISONS) {
      expect(() => render(poisonSite(layout, { webspace: `/srv/www/bad${poisonValue}` }))).toThrow();
      expect(() =>
        render(poisonSite(layout, { linkPath: () => `/srv/www/bad${poisonValue}/web` })),
      ).toThrow();
    }
  });

  test('the HTPASSWD path cannot close AuthUserFile', () => {
    const layout = layoutFrom(baseDoc());
    for (const poisonValue of POISONS) {
      expect(() => render(poison(layout, { htpasswd: `/etc/x${poisonValue}` }))).toThrow();
    }
    // …and a relative one is refused too: it is not a path this layout could have derived.
    expect(() => render(poison(layout, { htpasswd: 'preprod.htpasswd' }))).toThrow();
  });

  test('a CERTIFICATE path cannot close SSLCertificateFile', () => {
    const layout = layoutFrom(baseDoc());
    for (const poisonValue of POISONS) {
      const broken = poison(layout, {
        serving: {
          ...layout.serving,
          prod: { tls: { mode: 'files', certificate: `/etc/ssl/x${poisonValue}.pem`, key: '/etc/ssl/x.key' } },
        },
      });
      expect(() => render(broken)).toThrow();
    }
  });

  test('the DESCRIPTION cannot become a second line of directives', () => {
    const layout = layoutFrom(baseDoc());
    expect(() => render(poison(layout, { description: 'fine\nRequire all granted' }))).toThrow(
      /description/,
    );
  });

  test('a REFUSAL renders nothing at all — no partial file escapes', () => {
    // The refusals above are thrown from inside a flatMap over the sites, so a two-site
    // instance must not come back with the good site's vhosts and a swallowed error.
    const layout = layoutFrom(
      docWith({
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org' },
        ],
      }),
    );
    const broken = poison(layout, { preprodRealm: 'Museum "' });
    expect(() => render(broken)).toThrow();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 9. No secret, ever
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('a vhost carries no credential', () => {
  test('no secret key, no secret path, no reviewer password file, no API key path', () => {
    // The vhost may name the htpasswd it authenticates AGAINST — a path, and the one the
    // provisioner generates — and nothing else. Everything else reaches the daemon through
    // systemd LoadCredential, from root-owned 0600 files.
    const doc = docWith({
      publication_api: {
        url: 'http://127.0.0.1:3100/publication/server_api/v2',
        key_path: '/etc/dedalo_sites/instances/gate/secrets/PUBLICATION_API_KEY',
      },
    });
    doc.secrets = { ANTHROPIC_API_KEY: '/etc/dedalo_sites/instances/gate/secrets/ANTHROPIC_API_KEY' };
    const layout = layoutFrom(doc);

    const forbidden = [
      ...Object.keys(layout.secrets),
      ...Object.values(layout.secrets),
      layout.secretsDir,
      '/etc/dedalo_gate/PREPROD_PASSWORD',
      'PUBLICATION_API_KEY',
      'LoadCredential',
    ];
    for (const produced of render(layout)) {
      for (const needle of forbidden) expect(produced.body).not.toContain(needle);
      // The one path a vhost legitimately names.
      if (produced.path.endsWith('-pre.conf')) expect(produced.body).toContain(layout.htpasswd);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 10. Purity — the property the write-only-on-drift provisioner rests on
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the bytes are a pure function of the layout', () => {
  test('rendering twice gives identical bytes', () => {
    const layout = layoutFrom(baseDoc());
    expect(render(layout).map(a => a.body)).toEqual(render(layout).map(a => a.body));
  });

  test('reordering the alias map does not move a byte', () => {
    // An operator tidying instance.json must not read as drift and rewrite a museum's
    // live vhosts over nothing at all.
    const forwards = baseDoc();
    forwards.serving.aliases = { 'a.example.org': 'one', 'z.example.org': 'one' };
    const backwards = baseDoc();
    backwards.serving.aliases = { 'z.example.org': 'one', 'a.example.org': 'one' };
    expect(render(layoutFrom(forwards)).map(a => a.body)).toEqual(
      render(layoutFrom(backwards)).map(a => a.body),
    );
  });

  test('the same DECLARATION derived twice gives the same bytes', () => {
    expect(render(layoutFrom(baseDoc())).map(a => a.body)).toEqual(
      render(layoutFrom(baseDoc())).map(a => a.body),
    );
  });
});
