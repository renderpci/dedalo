/**
 * THE NGINX VHOSTS — one file per site per surface.
 *
 * WHAT THIS REPLACES, AND WHY THE GRAIN CHANGED.
 * The committed `nginx/dedalo_sites_prod.conf` and `nginx/dedalo_sites_preprod.conf` were
 * TWO files for the WHOLE HOST: one wildcard `server{}` per surface, rooted at a single
 * `PREPROD_ROOT`/`PROD_ROOT`, with every site a directory underneath. That shape is three
 * defects wearing one convenience:
 *
 *   - ONE PASSWORD FOR EVERY MUSEUM. A single `auth_basic_user_file` at
 *     `/etc/dedalo_sites/preprod.htpasswd` gated every institution's unpublished drafts
 *     behind one credential. The htpasswd is now PER INSTANCE (`layout.htpasswd`) because
 *     the vhost that names it is per instance too.
 *   - THE RELEASE STORE WAS PUBLIC. `.releases/` is a SIBLING of `web`/`pre` inside the
 *     webspace, and those files served the webspace's PARENT with no dotfile rule at all,
 *     so every retained release of every site — including preprod drafts sitting on the
 *     production host — was fetchable by anyone who guessed a path. Hence the deny rule
 *     below, and hence `root` pointing at the SERVED LINK rather than at any ancestor of it.
 *   - `disable_symlinks off` FOLLOWED ANYTHING. The daemon's whole publish design is a
 *     symlink swap, so symlinks must be followed — but an agent turn writes arbitrary
 *     files into a workspace, `promoteRelease` copies that tree with `cp` (which does NOT
 *     dereference), and an absolute `link -> /etc/shadow` that survives the copy was, with
 *     `off`, simply served. See the policy note on `disable_symlinks` below.
 *
 * ONE VHOST PER SITE PER SURFACE, at `site.vhostPaths[surface]`, because a vhost carries
 * ONE `server_name`, ONE document root and ONE TLS block — two sites in one file share all
 * three, which is how a shared wildcard becomes a shared password.
 *
 * THE LAW THIS FILE OBEYS (see ./types.ts for the full statement):
 * PURE — `(layout) => Artifact[]`, no filesystem, no clock, no environment; the provisioner
 * writes only on drift, so an unstable byte here rewrites a museum's live vhosts on every
 * run. DERIVE, NEVER RESTATE — every path, name and mode comes from `layout`; the only
 * literal paths below are `/etc/letsencrypt/live/...`, which is the ACME CLIENT's naming
 * convention and not ours (and is keyed by a domain we do derive). NO SECRET, EVER — a
 * vhost names the htpasswd's PATH and a certificate's PATH, never a credential.
 *
 * REFUSE, DO NOT ESCAPE. Every manifest string that reaches a directive is checked against
 * a grammar here and the render is ABANDONED if it does not match, rather than quoted into
 * submission. Two reasons, both from layout.ts, which reaches the same conclusion about the
 * same strings: escaping is a per-renderer property that the nginx and the Apache renderer
 * would have to agree on forever, while a grammar is a property of the value itself; and a
 * value that needs escaping to be safe in a root-owned config is a value nobody meant to
 * write. This is NOT delegation to the schema — `derive()` is a second entry point (a
 * `provision adopt` builds a manifest from what is on disk, with no declaration ever
 * validated), and `serving.prod.tls.certificate`, `serving.aliases` and `layout.htpasswd`
 * reach this file having been checked for ABSOLUTENESS and nothing else. A realm, a
 * certificate path or an alias hostname carrying a quote and a newline is one string away
 * from an attacker-chosen `location` block in a file nginx reads as root.
 *
 * WHAT THE PROVISIONER STILL OWES THIS FILE. Two orderings a pure renderer cannot enforce:
 * the webspace and the served links must EXIST before nginx is reloaded, and under
 * `tls.mode: letsencrypt` the certificate must be OBTAINED before the reload (the port-80
 * server below serves the http-01 challenge from the webspace, which the provisioner
 * creates, precisely so that can happen on a host with nothing published yet). `nginx -t`
 * before `reload`, always: one bad vhost takes down every site on the host, not just this
 * museum's.
 */

import { DESCRIPTION_PATTERN, DOMAIN_PATTERN, EMAIL_PATTERN, REALM_PATTERN, SURFACES } from '../layout';
import type { InstanceLayout, SiteLayout, Surface } from '../layout';
import type { Artifact, Renderer } from './types';
import { artifact } from './types';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The grammars this renderer refuses on its own account
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A path that may be written into an nginx directive.
 *
 * DELIBERATELY NARROWER THAN THE SCHEMA'S. `absolutePathSchema` asks for absolute, no `..`
 * and not `/` — a path containing a double quote, a `$`, a `;` or a newline satisfies all
 * three, and `derive()` only ever calls `resolve()` on it. So `root
 * /home/www/x"; } location / { root /etc; #` is a declaration that parses, derives and,
 * without this pattern, RENDERS. Everything that could terminate a directive, open a block,
 * introduce a comment, expand a variable or continue onto a second line is absent from this
 * allowlist, which is what makes the quoting below belt-and-braces rather than the defence.
 */
const NGINX_PATH_PATTERN = /^\/[A-Za-z0-9._+@~-]+(\/[A-Za-z0-9._+@~-]+)*$/;

/**
 * Where an ACME client keeps the certificate it obtained for a name.
 *
 * The one literal path in this file, and it is not ours to derive: it is certbot's own
 * convention (`/etc/letsencrypt/live/<name>/{fullchain,privkey}.pem`), the same way
 * `/home/www` in layout.ts is a host convention older than this project. What IS derived is
 * the name it is keyed by — the site's domain — so a renamed site moves its certificate
 * paths with it. Stated here once rather than twice inside the renderer for the same reason
 * everything else in this subsystem has one owner.
 */
const ACME_LIVE_DIR = '/etc/letsencrypt/live';

/**
 * THE ACME CONTACT, WRITTEN WHERE THE OPERATOR WILL LOOK FOR IT.
 *
 * `serving.prod.tls.account_email` is required with `letsencrypt` and was, until 2026-08-30,
 * validated and then used by nothing at all — a field that installs cleanly and vanishes,
 * which is the defect §11 forbids in as many words ("no field validates and then vanishes").
 * This provisioner does not run an ACME client and should not: obtaining a certificate needs
 * the DNS to already point here, and that is not a fact a declaration can assert. What it
 * can do is put the address in the file the operator opens when a certificate is missing, in
 * the command they are about to type.
 */
function acmeContact(tls: { readonly mode: string; readonly account_email?: string }): string[] {
  if (tls.mode !== 'letsencrypt' || !tls.account_email) return [];
  return [
    `# The certificate is the ACME CLIENT's to obtain; this provisioner never runs one (the`,
    `# DNS must already point here, which no declaration can assert). The declared contact`,
    `# for it — serving.prod.tls.account_email — is:`,
    `#     ${required('serving.prod.tls.account_email', tls.account_email, EMAIL_PATTERN)}`,
  ];
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Refusals
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Check a string against its grammar, or abandon the render.
 *
 * The message names the FIELD and says what the value would have become, because the
 * operator reading it is holding a declaration, not this file: "the realm is invalid" sends
 * them to a regex, "this realm would close its own quote inside auth_basic" sends them to
 * the line they wrote.
 */
function required(label: string, value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(
      `render/nginx: ${label} is '${String(value)}', which does not match ` +
        `${pattern.source}. It would be written verbatim into a root-owned nginx ` +
        `configuration, where a quote, a semicolon, a brace or a newline ends the ` +
        `directive and begins one nobody declared. Nothing was rendered.`,
    );
  }
  return value;
}

/**
 * A path, as a QUOTED nginx value.
 *
 * Quoted even though the grammar above already excludes every character quoting would
 * protect against: the two defences are independent, and the day somebody widens the
 * pattern to admit a space (a museum whose webspaces live under `/home/www/Museo Nacional`
 * is not an absurd host), the quotes are already there. `$` is absent from the grammar, so
 * the quotes cannot themselves introduce variable expansion.
 */
function pathValue(label: string, value: string): string {
  return `"${required(label, value, NGINX_PATH_PATTERN)}"`;
}

/** A hostname, as a bare nginx value. Same grammar the schema and layout.ts both use. */
function hostValue(label: string, value: string): string {
  return required(label, value, DOMAIN_PATTERN);
}

/** A line of generated header comment: one line, no control characters, ever. */
function commentValue(label: string, value: string): string {
  return required(label, value, DESCRIPTION_PATTERN);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The shared pieces of a served server{} block
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE DOTFILE DENY.
 *
 * `.releases/` is already outside every document root (it is a SIBLING of `web` and `pre`),
 * so this is defence in depth — for a site's own build output, which routinely carries
 * `.env`, `.git`, `.DS_Store` and whatever an agent left behind, and for the day a webspace
 * layout changes underneath a vhost nobody re-read.
 *
 * The negative lookahead is load-bearing and not decoration: `/.well-known/` is the one
 * dotted path a public site must answer on — ACME http-01 renews the certificate through
 * it, and `security.txt` lives there — so a flat `location ~ /\.` would deny the renewal
 * that keeps the site reachable at all.
 *
 * QUOTED, because an nginx location regex that is not quoted is parsed by the config
 * tokenizer first, and the tokenizer has opinions about braces and semicolons that PCRE
 * does not share. This project has already paid for that lesson once, in the engine's
 * generated media-protection rules.
 */
const DENY_DOTFILES = [
  '    location ~ "/\\.(?!well-known/)" {',
  '        deny all;',
  '    }',
];

/**
 * THE SYMLINK POLICY, and the whole reason for the `from=` clause.
 *
 * `if_not_owner` refuses to follow a symlink whose owner differs from the owner of its
 * target. That is exactly the shape of the attack the publish path admits: an agent turn
 * writes `link -> /etc/passwd` into a workspace, `promoteRelease` copies the tree with
 * `cp` (which copies the LINK, not its target), and the link lands inside a release that
 * is about to be served. The link is owned by the service user; anything worth stealing is
 * not; nginx refuses.
 *
 * `from=$document_root` is what keeps the legitimate design working. The document root IS
 * a symlink — `web` and `pre` point into `.releases/<id>/`, and swapping them atomically is
 * how a publish avoids a reload — and nginx checks only the path components AFTER the
 * `from=` prefix. So the served link is followed unconditionally (it is the prefix), and
 * every component beneath it is checked. Without the clause the very link this subsystem
 * swaps would be the first thing refused; with `off`, nothing is checked at all, which is
 * what the files this renderer replaces did.
 */
const SYMLINK_POLICY = '    disable_symlinks if_not_owner from=$document_root;';

/** The static-site body: serve the file, then the directory index, then 404. */
const SERVE_STATIC = [
  '    location / {',
  '        try_files $uri $uri/ =404;',
  '    }',
];

/**
 * The generated header. It names the DECLARATION rather than describing the file, because
 * the only useful thing to tell an operator holding a generated vhost is where the truth
 * lives — and that the stamp on the line above turns an edit here into a refusal rather
 * than a silent overwrite.
 */
function header(layout: InstanceLayout, site: SiteLayout, surface: Surface): string[] {
  const lines = [
    `# GENERATED — do not edit.`,
    `#`,
    `# instance '${layout.instance}', site '${site.slug}', ${surface} surface.`,
    `# Rendered from ${commentValue('the manifest path', layout.manifestPath)}`,
    `# by publication/site_builder/src/provision/render/nginx.ts. Every value below is`,
    `# derived from that declaration: change the declaration and re-run the provisioner.`,
    `# An edit here disagrees with the stamp above and is refused as a hand edit, not`,
    `# silently overwritten — which also means it is never applied.`,
  ];
  if (layout.description) {
    lines.push(`#`, `# ${commentValue('description', layout.description)}`);
  }
  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The preprod vhost — drafts, authenticated and unindexed
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE DRAFT SURFACE. Not public, never indexed, and HTTP only — see the transport note.
 *
 * Authentication is the museum's declared `serving.preprod.auth.mode`, not this renderer's
 * assumption. `htpasswd` renders the per-INSTANCE file; `none` renders the site
 * unauthenticated and SAYS SO in the file, loudly, because a security switch that the
 * declaration set to off and the artifact quietly re-enabled would make the declaration a
 * lie — and one that set it off while the artifact said nothing would make the vhost one.
 * The schema requires both `enabled` and `auth.mode` for the same reason: a draft surface
 * is authenticated or it is not, and neither may be true by omission.
 *
 * `X-Robots-Tag` is rendered WHATEVER the auth mode, with `always` so it survives the 401
 * as well as the 200: keeping drafts out of a search index is a different guarantee from
 * keeping them behind a password, and the museum only declared a choice about the second.
 *
 * TRANSPORT — A STATED RESIDUAL. This vhost listens on port 80 only, so basic-auth
 * credentials cross the network in the clear. It is not an oversight and it is not this
 * renderer's to fix: the declaration states ONE certificate, under `serving.prod.tls`, for
 * the PRODUCTION name. Serving `<prefix>.<domain>` under a certificate issued for
 * `<domain>` presents a name-mismatched certificate — a browser interstitial on every
 * review, which teaches a museum's reviewers to click through warnings. The honest fix is a
 * preprod TLS declaration in the grammar; until there is one, this file states the fact
 * rather than papering over it.
 */
function preprodVhost(layout: InstanceLayout, site: SiteLayout): string[] {
  const auth = layout.serving.preprod.auth;
  const lines = [
    ...header(layout, site, 'preprod'),
    `#`,
    `# The DRAFT surface: not public, never indexed. Served over plain HTTP — the`,
    `# declaration states a certificate for the production name only (see nginx.ts).`,
    ``,
    'server {',
    '    listen 80;',
    '    listen [::]:80;',
    `    server_name ${hostValue(`site '${site.slug}' preprod host`, site.preprodDomain)};`,
    ``,
    `    root ${pathValue(`site '${site.slug}' preprod document root`, site.linkPath('preprod'))};`,
    '    index index.html;',
    ``,
    SYMLINK_POLICY,
    ``,
    '    # Drafts stay out of every index, on every response — 401 and 404 included.',
    '    add_header X-Robots-Tag "noindex, nofollow" always;',
    ``,
  ];

  if (auth.mode === 'htpasswd') {
    lines.push(
      '    # PER INSTANCE — one museum, one credential file. The web server reads it',
      '    # through its own group; nobody is added to anybody.',
      `    auth_basic ${quotedRealm(layout)};`,
      `    auth_basic_user_file ${pathValue('serving.preprod.auth.htpasswd', layout.htpasswd)};`,
      ``,
    );
  } else if (auth.mode === 'none') {
    lines.push(
      '    # NO AUTHENTICATION. serving.preprod.auth.mode is declared as "none", so this',
      '    # museum\'s unpublished drafts are readable by anyone who knows the hostname.',
      '    # The noindex header above is all that stands between them and a crawler.',
      ``,
    );
  } else {
    // An `else` that renders an UNAUTHENTICATED preprod vhost is a fail-open default: a
    // mode this renderer has not learned yet — a new one, a typo that reached derive()
    // through `adopt` rather than through the schema — would publish a museum's drafts and
    // say in a comment that somebody asked for that. Refuse instead: nothing is rendered,
    // and the operator is told which mode and which site.
    throw new Error(
      `render/nginx: unknown serving.preprod.auth.mode '${String(auth.mode)}' for site ` +
        `'${site.slug}'. Refusing to render a preprod vhost rather than default to serving ` +
        `unpublished drafts without authentication. Nothing was rendered.`,
    );
  }

  lines.push(...DENY_DOTFILES, ``, ...SERVE_STATIC, '}');
  return lines;
}

/**
 * The Basic realm, quoted. Re-checked against layout's own REALM_PATTERN rather than
 * trusted from `layout.preprodRealm`: `derive()` validates it, but `derive()` is not the
 * only door — and this is the exact string whose escape historically closed its quote and
 * opened a `location` block of the declaration author's choosing.
 */
function quotedRealm(layout: InstanceLayout): string {
  return `"${required('serving.preprod.auth.realm', layout.preprodRealm, REALM_PATTERN)}"`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The production vhost — public by intent, TLS as declared
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE PUBLIC SURFACE. No authentication: a published heritage site is public by intent,
 * and that is the whole point of the preprod/prod split.
 *
 * TLS follows the declaration exactly, and the three modes are three different FILES:
 *
 *   - `letsencrypt` — a port-80 server that serves the http-01 challenge and redirects
 *     everything else, plus a 443 server reading certbot's `live/<domain>/` pair.
 *   - `files` — the same two servers, with the declared certificate and key, and no ACME
 *     location (nothing renews here).
 *   - `none` — ONE port-80 server that actually serves the site. The museum said TLS
 *     terminates elsewhere (an upstream proxy, a CDN); rendering a redirect to a port
 *     nothing listens on would take the site down in the name of security.
 *
 * NO HSTS, deliberately. `Strict-Transport-Security` is a commitment made to every visitor's
 * browser that outlives the file that made it: a museum that later moves TLS upstream and
 * re-declares `mode: none` would find its site unreachable for the remaining lifetime of a
 * header nobody can recall. This artifact is regenerated from a declaration operators are
 * meant to change; a browser-side latch is not.
 *
 * NO HTTP/2, and this one is a version problem rather than a judgement. The directive
 * changed spelling mid-life (`listen 443 ssl http2` before nginx 1.25.1, `http2 on;` after),
 * the two are mutually exclusive, and a pure renderer cannot know which nginx a museum's
 * host runs. A wrong guess is not a slow site — it is `nginx -t` failing and EVERY site on
 * that host staying down through the reload. HTTP/1.1 over TLS serves a static site
 * correctly everywhere; an operator whose host is new enough can enable HTTP/2 once, at the
 * `http {}` level, where it applies to every vhost and is not overwritten by this renderer.
 */
function prodVhost(layout: InstanceLayout, site: SiteLayout): string[] {
  const tls = layout.serving.prod.tls;
  const domain = hostValue(`site '${site.slug}' domain`, site.domain);
  const docRoot = pathValue(
    `site '${site.slug}' production document root`,
    site.linkPath('prod'),
  );
  const lines = [...header(layout, site, 'prod'), `#`];

  switch (tls.mode) {
    case 'none': {
      lines.push(
        `# TLS is declared as terminating ELSEWHERE (serving.prod.tls.mode: none), so this`,
        `# server answers on port 80 and does not redirect: the redirect target would be a`,
        `# port this host was never told to listen on.`,
        ``,
        ...servedServer(domain, docRoot, ['    listen 80;', '    listen [::]:80;']),
      );
      break;
    }
    case 'letsencrypt':
    case 'files': {
      const [certificate, key] =
        tls.mode === 'letsencrypt'
          ? [`${ACME_LIVE_DIR}/${site.domain}/fullchain.pem`, `${ACME_LIVE_DIR}/${site.domain}/privkey.pem`]
          : [tls.certificate as string, tls.key as string];

      lines.push(
        `# TLS terminates here (serving.prod.tls.mode: ${tls.mode}). Port 80 redirects.`,
        ...acmeContact(tls),
        ``,
        'server {',
        '    listen 80;',
        '    listen [::]:80;',
        `    server_name ${domain};`,
        ``,
      );

      if (tls.mode === 'letsencrypt') {
        lines.push(
          '    # ACME http-01. Rooted at the WEBSPACE and not at the served link, because',
          '    # the link does not exist until something has been published — and the',
          '    # certificate has to be obtained before that, or nginx has nothing to start',
          '    # with. `^~` outranks the dotfile regex below, and the webspace itself is',
          '    # reachable through this prefix and no other.',
          '    location ^~ /.well-known/acme-challenge/ {',
          `        root ${pathValue(`site '${site.slug}' webspace`, site.webspace)};`,
          '    }',
          ``,
        );
      }

      lines.push(
        '    # The redirect lives in a location and not at server level: a server-level',
        '    # `return` runs before location selection and would swallow the challenge above.',
        '    location / {',
        `        return 301 https://${domain}$request_uri;`,
        '    }',
        '}',
        ``,
        ...servedServer(
          domain,
          docRoot,
          ['    listen 443 ssl;', '    listen [::]:443 ssl;'],
          [
            `    ssl_certificate ${pathValue('serving.prod.tls.certificate', certificate)};`,
            `    ssl_certificate_key ${pathValue('serving.prod.tls.key', key)};`,
            '    ssl_protocols TLSv1.2 TLSv1.3;',
            '    ssl_session_timeout 1d;',
          ],
        ),
      );
      break;
    }
    default: {
      // Exhaustiveness as a compile error: a fourth TLS mode added to the grammar must be
      // rendered HERE in the same commit. The alternative is a mode that parses, derives,
      // and silently produces a vhost with no TLS at all.
      const unreachable: never = tls.mode;
      throw new Error(`render/nginx: unknown serving.prod.tls.mode '${String(unreachable)}'`);
    }
  }

  lines.push(...aliasServers(layout, site, domain));
  return lines;
}

/**
 * The server{} block that actually serves the site — everything but its listeners and its
 * transport settings, which are the only two things the three TLS modes disagree about.
 *
 * The order is the one an operator reads a vhost in: which port, which name, how the
 * transport is secured, then what is served. Nothing below this line varies by mode, which
 * is the point — the dotfile deny, the symlink policy and the try_files chain are the same
 * guarantees on every surface of every site, and a mode that could vary them would be a
 * mode that could drop one.
 */
function servedServer(
  domain: string,
  docRoot: string,
  listeners: readonly string[],
  transport: readonly string[] = [],
): string[] {
  return [
    'server {',
    ...listeners,
    `    server_name ${domain};`,
    ...(transport.length > 0 ? ['', ...transport] : []),
    ``,
    `    root ${docRoot};`,
    '    index index.html;',
    ``,
    SYMLINK_POLICY,
    ``,
    ...DENY_DOTFILES,
    ``,
    ...SERVE_STATIC,
    '}',
  ];
}

/**
 * THE ALIASES — extra hostnames that belong to this site, as redirects to its canonical one.
 *
 * They are rendered because a declared field that nothing reads is the defect this whole
 * subsystem exists to delete: `serving.aliases` validates, the schema checks that every
 * target is a declared slug, and a museum that wrote `example.org -> collection` and got
 * nothing would have a hostname that resolves, a vhost that never answers it, and a
 * declaration on disk saying otherwise.
 *
 * They live in the OWNING SITE'S prod file — not a file of their own — because an alias has
 * no document root, no TLS and no life independent of the site it points at: removing the
 * site must remove its aliases in the same write, and a separate file is a separate write
 * that can be forgotten. This does not break "one vhost per site per surface": the block
 * below is not a second vhost for the site, it is the alias's own server, whose entire
 * content is the sentence "this name belongs somewhere else".
 *
 * PORT 80 ONLY, and that is a stated limit. An alias reached over https would need a
 * certificate for the ALIAS's name; the declaration states one certificate, for the
 * canonical name. Answering on 443 with it means every visitor sees a name-mismatch
 * interstitial, which is strictly worse than a name that does not answer — the first
 * teaches people to click through certificate warnings, the second is a DNS record the
 * operator can see is incomplete.
 *
 * SORTED BY HOSTNAME, because `Object.entries` walks a JSON object in the order it was
 * written: an operator reordering the alias map would otherwise change these bytes, and a
 * provisioner that writes on drift would rewrite a live vhost over a formatting change.
 */
function aliasServers(layout: InstanceLayout, site: SiteLayout, domain: string): string[] {
  const scheme = layout.serving.prod.tls.mode === 'none' ? 'http' : 'https';
  const aliases = Object.entries(layout.serving.aliases ?? {})
    .filter(([, slug]) => slug === site.slug)
    .map(([alias]) => alias)
    .sort();

  const lines: string[] = [];
  for (const alias of aliases) {
    lines.push(
      ``,
      `# Alias of site '${site.slug}'. Port 80 only — see nginx.ts on why an alias is not`,
      `# served under the canonical name's certificate.`,
      'server {',
      '    listen 80;',
      '    listen [::]:80;',
      `    server_name ${hostValue(`serving.aliases['${alias}']`, alias)};`,
      ``,
      '    location / {',
      `        return 301 ${scheme}://${domain}$request_uri;`,
      '    }',
      '}',
    );
  }
  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The renderer
 * ──────────────────────────────────────────────────────────────────────────────────── */

export const nginxRenderer: Renderer = {
  kind: 'nginx_vhost',

  /** One web server per host: this renderer is silent on an Apache instance. */
  appliesTo(layout) {
    return layout.webServer === 'nginx';
  },

  render(layout): Artifact[] {
    // An alias whose target is not a declared site would silently render nothing — a
    // hostname the museum believes it published and no server_name anywhere. The schema
    // catches it; `derive()` does not, and an adopted manifest never met the schema. So the
    // census runs here, before a single byte, and abandons the whole render rather than
    // producing a set that is quietly incomplete.
    assertEveryAliasHasASite(layout);

    return layout.sites.flatMap(site =>
      SURFACES.filter(
        // A disabled draft surface has no vhost at all — an unauthenticated preprod file
        // that merely goes unused is one `include` away from publishing a museum's drafts.
        surface => surface !== 'preprod' || layout.serving.preprod.enabled,
      ).map(surface =>
        artifact(layout, {
          kind: 'nginx_vhost',
          path: site.vhostPaths[surface],
          mode: 'hostConfig',
          body: `${(surface === 'preprod' ? preprodVhost(layout, site) : prodVhost(layout, site)).join('\n')}\n`,
        }),
      ),
    );
  },
};

function assertEveryAliasHasASite(layout: InstanceLayout): void {
  const slugs = new Set(layout.sites.map(site => site.slug));
  for (const [alias, slug] of Object.entries(layout.serving.aliases ?? {})) {
    if (!slugs.has(slug)) {
      throw new Error(
        `render/nginx: serving.aliases['${alias}'] names the site '${slug}', which this ` +
          `instance does not declare. The alias would resolve in DNS and answer nowhere. ` +
          `Nothing was rendered.`,
      );
    }
  }
}
