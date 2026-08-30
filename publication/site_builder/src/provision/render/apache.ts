/**
 * THE APACHE VHOSTS — one file per site per surface.
 *
 * The Apache twin of ./nginx.ts. Two renderers rather than one with a flag: the two
 * directive languages disagree about quoting, about how a directory is opened for symlink
 * following, and about where authorization is declared, and a renderer that abstracted over
 * both would be a third grammar neither server speaks. What the two DO share is not a
 * template but a set of GUARANTEES, and those are named here one by one so a reader can
 * check them against the nginx module directive by directive:
 *
 *   1. ONE FILE PER SITE PER SURFACE, at `site.vhostPaths[surface]`. A vhost carries one
 *      ServerName, one DocumentRoot and one TLS block; two sites in one file share all
 *      three. The committed `apache/dedalo_sites.conf` this replaces was a single vhost
 *      per surface for the whole host — which is why every museum's drafts sat behind one
 *      shared password and why adding a site meant hand-editing a root-owned file.
 *   2. THE DOCUMENT ROOT IS `site.linkPath(surface)` — the served symlink the daemon swaps
 *      atomically. Never a release directory (they are immutable and are pruned), never a
 *      workspace (it holds the git history, node_modules and the agent's tree), never the
 *      webspace itself (`.releases` sits there as a sibling).
 *   3. SYMLINKS ARE FOLLOWED ONLY WHEN THEY LEAD WHERE THEY SHOULD.
 *      `-FollowSymLinks +SymLinksIfOwnerMatch`: the served link and the release tree behind
 *      it are both the service user's, so the swap keeps working — while a symlink an agent
 *      turn wrote into a site's build output, pointing at /etc or at another museum's
 *      webspace, is NOT followed, because those are owned by somebody else. The old file
 *      said a bare `Options FollowSymLinks`, which follows anything anywhere.
 *   4. NO .htaccess, EVER (`AllowOverride None`). The served tree is written by an agent
 *      turn. With overrides on, a file the agent dropped in the document root would be
 *      web-server CONFIGURATION — it could re-enable symlink following, re-open directory
 *      listings, or lift the auth on the very surface it sits in.
 *   5. DOTFILES ARE DENIED, `.releases` included, with ONE exception carved out on
 *      purpose: `/.well-known/`. See `dotfileGuards()` — a blanket dotfile deny silently
 *      breaks every ACME http-01 challenge on the host, which is the same defect as
 *      "TLS never renews" wearing a security rule's clothes.
 *   6. PREPROD IS AUTHENTICATED AND UNINDEXABLE; PROD IS PUBLIC AND HAS NO AUTH AT ALL.
 *      Heritage sites are public by intent; drafts are not, and must not be crawled even
 *      from behind the challenge.
 *   7. EVERY STRING THAT REACHES A DIRECTIVE IS CHECKED HERE, on this module's own
 *      account. `derive()` is a second entry point — `provision adopt` builds a manifest
 *      from what is on disk, with no declaration ever validated — and `AuthName` is
 *      exactly the injection vector `auth_basic` is: one unescaped quote closes the
 *      directive and the rest of the value is configuration, in a file Apache reads as
 *      root. Every check below REFUSES rather than escapes, for the reason layout.ts gives
 *      about the realm: escaping is a per-renderer property two renderers would have to
 *      agree on forever, and a grammar is a property of the value itself.
 *
 * PURE AND ZERO-DEP, like every module on this path: no filesystem, no clock, no
 * `process.env`, and no import but `node:` builtins and dependency-free siblings. A
 * repo-side tripwire renders these WITHOUT the daemon's node_modules, so importing
 * `../schema` (and with it zod) would break the gate that keeps the committed artifacts
 * honest. Everything the vhosts need is already on the layout — `layout.serving` is echoed
 * there for precisely this reason.
 *
 * WHAT THIS RENDERER DELIBERATELY DOES NOT OWN. A `letsencrypt` declaration names no
 * certificate path — the schema refuses one (`tls.mode !== 'files'` with a certificate is
 * "a file that names a certificate nobody serves"). So this module does not invent
 * `/etc/letsencrypt/live/<domain>/…`: that is the ACME client's own convention, the
 * fifteenth path literal in a subsystem whose entire point is that paths have one owner,
 * and it would have to be spelled identically in the nginx renderer forever. The ACME
 * client writes its own companion vhost (certbot's `…-le-ssl.conf`), which this
 * provisioner neither stamps nor overwrites; what THIS file owes such a site is a
 * reachable `/.well-known/acme-challenge/` and a header comment saying so out loud, so an
 * operator reading the file learns where the TLS half lives instead of discovering that
 * there isn't one. The seam for changing that is `layout.ts`: the day a certificate path
 * is DERIVED, both renderers read it from there and neither guesses.
 */

import {
  DESCRIPTION_PATTERN,
  DOMAIN_PATTERN,
  EMAIL_PATTERN,
  INSTANCE_PATTERN,
  REALM_PATTERN,
  SURFACES,
  type InstanceLayout,
  type ManifestServing,
  type SiteLayout,
  type Surface,
} from '../layout';
import { SLUG_PATTERN } from '../../util/slug';
import type { Renderer } from './types';
import { artifact } from './types';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The grammars of everything this module writes into a directive
 *
 * A second checkpoint, not a duplicate one: the SCHEMA validates a declaration, and this
 * validates the strings a LAYOUT actually hands over — which is a different set on an
 * adopted host, where no declaration was ever parsed. Each refusal names the value, the
 * directive it was heading for and the consequence, because the operator reading it is
 * holding a manifest, not this file.
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A path this module may write inside a quoted directive argument.
 *
 * Absolute, and free of everything that ends the argument early or means something else to
 * Apache's config parser: a double quote closes the string, a backslash escapes inside a
 * quoted string, `$` opens `${VAR}` substitution, and a control character (a newline above
 * all) turns the remainder of the value into the next directive. Paths reaching here are
 * derived — but `sites[].webspace`, `serving.preprod.auth.htpasswd` and the TLS pair are
 * operator-declared strings that `derive()` only ever checked for being ABSOLUTE.
 */
const DIRECTIVE_PATH_PATTERN = /^\/[^\x00-\x1f\x7f"\\$%]*$/;

/**
 * A path segment beginning with a dot, anywhere in a served path.
 *
 * Refused for the document root and its webspace because of the dotfile guard below: that
 * guard matches the FILESYSTEM path Apache walks, so a webspace under `/srv/.data` would
 * make the site's every request match "a dot segment" and be denied — a 403 on the whole
 * museum, produced by the rule that exists to protect it. Anchoring the guard to the
 * document root instead would mean regex-escaping a path into a `DirectoryMatch`, which is
 * a strictly worse trade: one more grammar to get right, in the one directive whose
 * failure mode is silent over-serving.
 */
const DOT_SEGMENT_PATTERN = /(^|\/)\./;

/** Refuse a value that does not match its grammar, naming what it would have become. */
function assertGrammar(pattern: RegExp, label: string, value: string, consequence: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(
      `apache: refusing to render ${label} '${value}' — it must match ${pattern.source}. ` +
        `${consequence} Nothing was rendered.`,
    );
  }
  return value;
}

/**
 * A checked, QUOTED directive argument.
 *
 * Quoted uniformly even where Apache would accept the bare word, so there is one rule to
 * audit ("everything interpolated is inside quotes, and nothing inside quotes can close
 * them") rather than a per-directive judgement about which arguments happen to be safe
 * unquoted today.
 */
function quoted(value: string): string {
  return `"${value}"`;
}

/** A path, checked and quoted. */
function pathArg(label: string, value: string): string {
  assertGrammar(
    DIRECTIVE_PATH_PATTERN,
    label,
    value,
    `It is written inside a quoted Apache directive argument, where a quote or a backslash ` +
      `ends the argument early, '$' opens a variable substitution and a newline starts a new ` +
      `directive — in a root-owned file the web server parses as root.`,
  );
  return quoted(value);
}

/** A hostname, checked and quoted. */
function hostArg(label: string, value: string): string {
  assertGrammar(
    DOMAIN_PATTERN,
    label,
    value,
    `It becomes this vhost's ServerName, and a hostname that can hold a quote or a space ` +
      `can hold a directive.`,
  );
  return quoted(value);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Line building
 * ──────────────────────────────────────────────────────────────────────────────────── */

const INDENT = '    ';

/** An Apache container section, with its contents indented one level. */
function section(open: string, inner: readonly string[], close: string): string[] {
  return [open, ...inner.map(line => (line === '' ? '' : INDENT + line)), close];
}

/** A `# ` comment, or a bare `#` for a blank comment line. */
function comment(text: string): string {
  return text ? `# ${text}` : '#';
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The guarantees, one function each
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE ACCESS POLICY of the served tree — the block that decides everything a request may
 * reach, and the one an operator should read first.
 *
 * Scoped to the WEBSPACE and not to the document root, because Apache checks the symlink
 * options while walking each path component: the component that is the served symlink
 * (`pre` / `web`) lives IN the webspace, so a block scoped one level deeper would leave the
 * link itself governed by whatever the host's `<Directory />` default says — on Debian, a
 * bare `Options FollowSymLinks`, i.e. exactly the policy this renderer exists to narrow.
 * Scoping at the webspace also covers the release tree the link resolves into, which is
 * the same museum's and nobody else's.
 *
 * Inside a `<VirtualHost>`, so it applies to THIS surface only. The preprod and prod files
 * both name the same webspace directory, and they must not merge: prod would inherit
 * preprod's challenge, or — much worse, and this is the bug in the committed
 * `apache/dedalo_sites.conf` — preprod would inherit prod's `Require all granted`.
 */
function accessPolicy(layout: InstanceLayout, site: SiteLayout, surface: Surface): string[] {
  // An unrecognised mode must never resolve to `false` here: that renders an
  // UNAUTHENTICATED preprod vhost, i.e. publishes a museum's unpublished drafts, as the
  // DEFAULT for a mode this renderer has not learned yet (a new one, or a typo that
  // reached derive() through `adopt` rather than through the schema). Refuse instead.
  const preprodAuthMode = layout.serving.preprod.auth.mode;
  if (surface === 'preprod' && preprodAuthMode !== 'htpasswd' && preprodAuthMode !== 'none') {
    throw new Error(
      `render/apache: unknown serving.preprod.auth.mode '${String(preprodAuthMode)}' for ` +
        `site '${site.slug}'. Refusing to render a preprod vhost rather than default to ` +
        `serving unpublished drafts without authentication. Nothing was rendered.`,
    );
  }
  const authenticated = surface === 'preprod' && preprodAuthMode === 'htpasswd';

  const inner: string[] = [
    comment('The served link and the release tree behind it are the service user\'s; a symlink'),
    comment('an agent turn wrote into a build, pointing anywhere else on this host, is not.'),
    'Options -Indexes -Includes -ExecCGI -FollowSymLinks +SymLinksIfOwnerMatch',
    comment('The tree is written by an agent turn. An .htaccess in it would be CONFIGURATION:'),
    comment('symlink following back on, listings back on, or the auth below lifted.'),
    'AllowOverride None',
    'DirectoryIndex index.html',
    '',
  ];

  if (authenticated) {
    // NO `Require all granted` HERE, AND THAT IS THE POINT. Apache 2.4 wraps the Require
    // directives of one section in an implicit <RequireAny>, so `Require all granted`
    // beside `Require valid-user` means access is granted when EITHER succeeds — i.e. the
    // password is decorative. The file this renderer replaces
    // (apache/dedalo_sites.conf:19-21) said both, in the preprod block, which made every
    // museum's drafts public to anyone who knew the hostname while the config read as
    // though it were protecting them.
    inner.push(
      comment('DRAFTS ARE BEHIND A CHALLENGE. One `Require`, deliberately: Apache wraps the'),
      comment('directives of a section in an implicit <RequireAny>, so a `Require all granted`'),
      comment('beside this line would make the password decorative — the defect in the'),
      comment('hand-written config this file replaces.'),
      'AuthType Basic',
      'AuthBasicProvider file',
      `AuthName ${quoted(assertRealm(layout))}`,
      `AuthUserFile ${pathArg('the preprod htpasswd', layout.htpasswd)}`,
      'Require valid-user',
    );
  } else if (surface === 'preprod') {
    inner.push(
      comment('serving.preprod.auth.mode is "none": this museum has DECLARED its draft surface'),
      comment('open. The X-Robots-Tag above is then the only thing between a draft and a'),
      comment('crawler. Set the mode to "htpasswd" to put it behind a challenge.'),
      'Require all granted',
    );
  } else {
    inner.push(
      comment('Production heritage sites are public by intent.'),
      'Require all granted',
    );
  }

  return section(`<Directory ${pathArg(`site '${site.slug}'s webspace`, site.webspace)}>`, inner, '</Directory>');
}

/**
 * DOTFILES ARE NOT SERVED — and `/.well-known/` is, on purpose.
 *
 * `.releases` is already outside the document root (it is a SIBLING of the served link, not
 * a child), so this is defence in depth for the dotfiles a site's own build output carries:
 * a `.git` an agent committed into the output, a `.env` it wrote while experimenting, a
 * `.builder` state file, an editor's `.swp`. None of that is protected by being
 * uninteresting.
 *
 * TWO directives because Apache asks two different questions. `<DirectoryMatch>` matches
 * the DIRECTORY path Apache walked, which is what closes `/.git/config`;
 * `<FilesMatch "^\.">` matches the basename, which is what closes `/.env` in a directory
 * that is not itself hidden. Either alone leaves the other case served.
 *
 * THE CARVE-OUT IS LOAD-BEARING. `/.well-known/` is the standard public directory
 * (RFC 8615) and it is where an ACME http-01 challenge is answered. A blanket dotfile deny
 * is the reason certificates silently stop renewing on hosts that have one — the site keeps
 * working for sixty days and then does not, with nothing in the configuration hinting at
 * the connection. The lookahead is deliberately tight: it requires the trailing slash, so
 * `/.well-knownish/` is still denied.
 *
 * Merge order makes the deny win: Apache applies `<Directory>` first, then
 * `<DirectoryMatch>`, then `<Files>`/`<FilesMatch>`, and a `Require` in the later section
 * replaces the authorization of the earlier one — including the `Require valid-user` above.
 */
function dotfileGuards(): string[] {
  return [
    comment('Dotfiles are not served: a .git an agent committed into the build output, a .env it'),
    comment('wrote while experimenting, an editor swapfile. (.releases is already outside the'),
    comment('document root — it is a SIBLING of the served link — so this is defence in depth.)'),
    comment('/.well-known/ is exempt BY DESIGN: it is the standard public directory and it is'),
    comment('where the ACME http-01 challenge is answered. A blanket deny here is why'),
    comment('certificates stop renewing sixty days after somebody adds one.'),
    ...section('<DirectoryMatch "/\\.(?!well-known/)">', ['Require all denied'], '</DirectoryMatch>'),
    ...section('<FilesMatch "^\\.">', ['Require all denied'], '</FilesMatch>'),
  ];
}

/**
 * The realm, re-checked here. It is interpolated between two double quotes in `AuthName`,
 * which is the same shape — and the same exposure — as nginx's `auth_basic "…";`.
 */
function assertRealm(layout: InstanceLayout): string {
  return assertGrammar(
    REALM_PATTERN,
    'the preprod realm',
    layout.preprodRealm,
    `It is rendered between the quotes of AuthName, so a quote closes the directive and ` +
      `everything after it is configuration of the declaration author's choosing.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The vhosts
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** One serving `<VirtualHost>`: a host, a port, a document root and the policy above. */
function servingVhost(
  layout: InstanceLayout,
  site: SiteLayout,
  surface: Surface,
  port: 80 | 443,
  tls?: { certificate: string; key: string },
): string[] {
  const host = surface === 'preprod' ? site.preprodDomain : site.domain;
  const inner: string[] = [
    `ServerName ${hostArg(`site '${site.slug}'s ${surface} hostname`, host)}`,
    `DocumentRoot ${pathArg(`site '${site.slug}'s ${surface} document root`, site.linkPath(surface))}`,
    '',
  ];

  if (tls) {
    inner.push(
      comment('mod_ssl and the declared material. Both paths are the declaration\'s: a certificate'),
      comment('Apache cannot open is a startup failure, which `apachectl configtest` reports'),
      comment('before the provisioner ever reloads — the loud failure is the correct one here.'),
      'SSLEngine on',
      `SSLCertificateFile ${pathArg('serving.prod.tls.certificate', tls.certificate)}`,
      `SSLCertificateKeyFile ${pathArg('serving.prod.tls.key', tls.key)}`,
      '',
    );
  }

  if (surface === 'preprod') {
    // `always`, so the header is on the 401 challenge and on every error page too — not
    // only on a 200 that a crawler may never be given. Unguarded by <IfModule>: on a host
    // without mod_headers this is a configtest failure the provisioner sees, whereas an
    // <IfModule> wrapper would silently drop the one thing keeping a museum's unfinished
    // work out of a search index.
    inner.push(
      comment('Drafts are never indexable, challenge or no challenge.'),
      'Header always set X-Robots-Tag "noindex, nofollow, noarchive"',
      '',
    );
  }

  inner.push(...accessPolicy(layout, site, surface), '', ...dotfileGuards());

  return section(`<VirtualHost *:${port}>`, inner, '</VirtualHost>');
}

/** The plain-HTTP vhost that exists only to move visitors to the TLS one. */
function redirectToHttpsVhost(site: SiteLayout): string[] {
  const host = hostArg(`site '${site.slug}'s production hostname`, site.domain);
  return section(
    '<VirtualHost *:80>',
    [
      `ServerName ${host}`,
      comment('Nothing is served over plain HTTP once a certificate is declared.'),
      `Redirect permanent "/" ${quoted(`https://${site.domain}/`)}`,
    ],
    '</VirtualHost>',
  );
}

/**
 * The alias vhosts: an extra hostname this museum owns, REDIRECTED to the site's canonical
 * domain rather than serving it a second time.
 *
 * A redirect and not a `ServerAlias` because the declaration says redirect
 * (`serving.aliases` maps a hostname to "the slug of the site it redirects to"), and
 * because two hostnames serving one document root is two canonical URLs for one heritage
 * record — which is a citation problem, not only an SEO one.
 *
 * Rendered ONLY into the production file: a draft surface has no public alias, and putting
 * one there would publish the preprod hostname of a site whose whole point is not being
 * public yet.
 */
function aliasVhosts(layout: InstanceLayout, site: SiteLayout, scheme: 'http' | 'https'): string[] {
  const aliases = aliasesFor(layout, site);
  if (aliases.length === 0) return [];

  const lines: string[] = [];
  for (const alias of aliases) {
    lines.push(
      '',
      comment(`Alias '${alias}' → site '${site.slug}'.`),
      ...section(
        '<VirtualHost *:80>',
        [
          `ServerName ${hostArg(`serving.aliases['${alias}']`, alias)}`,
          `Redirect permanent "/" ${quoted(`${scheme}://${site.domain}/`)}`,
        ],
        '</VirtualHost>',
      ),
    );
  }
  return lines;
}

/**
 * This site's aliases, SORTED — the bytes must be a pure function of the SET, or an
 * operator reordering the map in instance.json reads as drift and the provisioner rewrites
 * a live vhost over nothing at all. (`readWritePaths()` sorts for the same reason.)
 */
function aliasesFor(layout: InstanceLayout, site: SiteLayout): string[] {
  const aliases = layout.serving.aliases ?? {};
  return Object.entries(aliases)
    .filter(([, slug]) => slug === site.slug)
    .map(([alias]) => alias)
    .sort();
}

/**
 * EVERY ALIAS MUST NAME A SITE THAT EXISTS, AND MUST NOT NAME A HOSTNAME ALREADY SERVED.
 *
 * An alias pointing at a slug this instance does not have would otherwise be rendered
 * nowhere: the declaration says a hostname is handled, the host handles nothing, and the
 * only symptom is a domain that does not resolve to the museum. And an alias equal to a
 * site's own domain (or its preprod hostname) is a SECOND vhost claiming a ServerName
 * Apache already has — the first block wins, silently, and which one is first depends on
 * the order `sites-enabled` happens to be read in.
 */
function assertAliasesAreCoherent(layout: InstanceLayout): void {
  const bySlug = new Set(layout.sites.map(site => site.slug));
  const served = new Map<string, string>();
  for (const site of layout.sites) {
    served.set(site.domain, `site '${site.slug}'s production hostname`);
    served.set(site.preprodDomain, `site '${site.slug}'s preprod hostname`);
  }

  for (const [alias, slug] of Object.entries(layout.serving.aliases ?? {})) {
    assertGrammar(
      DOMAIN_PATTERN,
      `serving.aliases['${alias}']`,
      alias,
      `It becomes a vhost's ServerName.`,
    );
    assertGrammar(
      SLUG_PATTERN,
      `the target of serving.aliases['${alias}']`,
      slug,
      `An alias names the SLUG of the site it redirects to.`,
    );
    if (!bySlug.has(slug)) {
      throw new Error(
        `apache: serving.aliases['${alias}'] redirects to site '${slug}', which this instance ` +
          `does not declare. The alias would be rendered into no file at all — the declaration ` +
          `would say the hostname is handled and the host would handle nothing. Nothing was ` +
          `rendered.`,
      );
    }
    const collision = served.get(alias);
    if (collision) {
      throw new Error(
        `apache: serving.aliases['${alias}'] is also ${collision}. Two vhosts claiming one ` +
          `ServerName is not a merge — Apache serves the first one it read, and which that is ` +
          `depends on the order of sites-enabled. Nothing was rendered.`,
      );
    }
  }
}

/**
 * The webspace and the served link must be free of dot segments — see DOT_SEGMENT_PATTERN
 * for why the dotfile guard makes this a correctness requirement and not a style rule.
 */
function assertServedPathsAreGuardable(site: SiteLayout, surface: Surface): void {
  for (const [label, value] of [
    [`site '${site.slug}'s webspace`, site.webspace],
    [`site '${site.slug}'s ${surface} document root`, site.linkPath(surface)],
  ] as const) {
    if (DOT_SEGMENT_PATTERN.test(value)) {
      throw new Error(
        `apache: ${label} is '${value}', which contains a path segment beginning with a dot. ` +
          `The generated dotfile guard matches the filesystem path Apache walks, so every ` +
          `request to this site would be denied by the rule that exists to protect it. Move ` +
          `the webspace out of the hidden directory. Nothing was rendered.`,
      );
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The file
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** The operator-facing header: what this file is, whose it is, and what it serves. */
function header(layout: InstanceLayout, site: SiteLayout, surface: Surface, tlsNote: string[]): string[] {
  const description = layout.description
    ? assertGrammar(
        DESCRIPTION_PATTERN,
        'the instance description',
        layout.description,
        `It is written into this file's header, where a newline would make the second line of ` +
          `a description the first line of a directive.`,
      )
    : '';

  return [
    comment(`GENERATED by the Dédalo site-builder provisioner (src/provision/render/apache.ts).`),
    comment(''),
    comment(`DO NOT EDIT. The stamp on the first line is the hash of everything below it, so the`),
    comment(`next \`provision check\` reports a hand edit rather than silently overwriting it —`),
    comment(`and \`provision apply\` will refuse to touch this file until the edit is resolved.`),
    comment(`Change instance.json and re-run the provisioner instead.`),
    comment(''),
    comment(`instance : ${assertGrammar(INSTANCE_PATTERN, 'the instance name', layout.instance, 'It names the file\'s owner in the stamp.')}`),
    ...(description ? [comment(`about    : ${description}`)] : []),
    comment(`site     : ${assertGrammar(SLUG_PATTERN, 'the site slug', site.slug, 'It names the site this file serves.')}`),
    comment(`surface  : ${surface}`),
    ...tlsNote.map(comment),
    comment(''),
  ];
}

/** One rendered file, from its header down. */
function renderVhostFile(layout: InstanceLayout, site: SiteLayout, surface: Surface): string {
  assertServedPathsAreGuardable(site, surface);

  const lines: string[] = [];

  if (surface === 'preprod') {
    lines.push(
      ...header(layout, site, surface, [
        '',
        'This is the DRAFT surface: behind a challenge (unless the declaration says otherwise)',
        'and never indexable. It has no TLS block — the declaration states TLS for production',
        'only — so the Basic credential travels in the clear on a plain-HTTP host.',
      ]),
      ...servingVhost(layout, site, surface, 80),
    );
    return `${lines.join('\n')}\n`;
  }

  const tls = layout.serving.prod.tls;
  const mode = tls.mode;

  if (mode === 'files') {
    lines.push(
      ...header(layout, site, surface, [
        '',
        'TLS from the declared certificate and key. Plain HTTP redirects; nothing is served',
        'over it.',
      ]),
      ...redirectToHttpsVhost(site),
      '',
      ...servingVhost(layout, site, surface, 443, {
        certificate: requireTlsPath(tls, 'certificate'),
        key: requireTlsPath(tls, 'key'),
      }),
      ...aliasVhosts(layout, site, 'https'),
    );
    return `${lines.join('\n')}\n`;
  }

  if (mode === 'letsencrypt') {
    lines.push(
      ...header(layout, site, surface, [
        '',
        'TLS is the ACME CLIENT\'S: the declaration names no certificate path (the schema',
        'refuses one for this mode), so this provisioner does not invent one and does not own',
        'the HTTPS vhost. certbot writes its own companion file beside this one; that file is',
        'unstamped and is never touched here. What this file owes it is a reachable',
        '/.well-known/acme-challenge/ — see the dotfile guard, whose carve-out is exactly that.',
        ...acmeContact(tls),
      ]),
      ...servingVhost(layout, site, surface, 80),
      ...aliasVhosts(layout, site, 'http'),
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    ...header(layout, site, surface, [
      '',
      'serving.prod.tls.mode is "none": this museum terminates TLS somewhere else, or has',
      'declared that it does not want it. Plain HTTP is served here as declared.',
    ]),
    ...servingVhost(layout, site, surface, 80),
    ...aliasVhosts(layout, site, 'http'),
  );
  return `${lines.join('\n')}\n`;
}

/**
 * THE ACME CONTACT, WRITTEN WHERE THE OPERATOR WILL LOOK FOR IT.
 *
 * `serving.prod.tls.account_email` is required with `letsencrypt` and was, until 2026-08-30,
 * validated and then used by nothing at all — a field that installs cleanly and vanishes,
 * which is the defect §11 forbids in as many words. This provisioner does not run an ACME
 * client and should not: obtaining a certificate needs the DNS to already point here, which
 * no declaration can assert. What it can do is put the address in the file the operator
 * opens when a certificate is missing, in the command they are about to type.
 */
function acmeContact(tls: ManifestServing['prod']['tls']): string[] {
  if (!tls.account_email) return [];
  return [
    'The declared contact for that certificate — serving.prod.tls.account_email — is:',
    `    ${assertGrammar(EMAIL_PATTERN, 'serving.prod.tls.account_email', tls.account_email, 'It is written verbatim into this file’s header.')}`,
  ];
}

/**
 * The declared certificate or key, or a refusal.
 *
 * The schema already requires both under `mode: 'files'`. Re-checked because an adopted
 * manifest never met the schema, and because the alternative — rendering `SSLEngine on`
 * with no certificate — is an Apache that will not start, i.e. every OTHER museum on the
 * host offline too, from one incomplete declaration.
 */
function requireTlsPath(tls: ManifestServing['prod']['tls'], field: 'certificate' | 'key'): string {
  const value = tls[field];
  if (!value) {
    throw new Error(
      `apache: serving.prod.tls.mode is 'files' but no ${field} is declared. Rendering ` +
        `SSLEngine on without one is an Apache that refuses to start — taking every other ` +
        `museum's vhost on this host down with it. Nothing was rendered.`,
    );
  }
  return value;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The renderer
 * ──────────────────────────────────────────────────────────────────────────────────── */

export const apacheRenderer: Renderer = {
  kind: 'apache_vhost',

  /** One web server per host: this renderer is silent on an nginx instance. */
  appliesTo(layout) {
    return layout.webServer === 'apache';
  },

  render(layout) {
    // Checked ONCE, over the whole instance, before any file is built: an alias is a fact
    // about the set of sites, and a per-site check could only ever see its own site.
    assertAliasesAreCoherent(layout);

    return layout.sites.flatMap(site =>
      SURFACES.filter(
        // A disabled draft surface has no vhost at all — an unauthenticated preprod file
        // that merely goes unused is one `include` away from publishing a museum's drafts.
        surface => surface !== 'preprod' || layout.serving.preprod.enabled,
      ).map(surface =>
        artifact(layout, {
          kind: 'apache_vhost',
          path: site.vhostPaths[surface],
          mode: 'hostConfig',
          body: renderVhostFile(layout, site, surface),
        }),
      ),
    );
  },
};
