/**
 * The media-include directive allowlist (src/rules/directives.ts), branch by branch. The
 * proof that every include the ENGINE renders passes is the root tripwire
 * test/unit/publication_host_rules_allowlist_tripwire.test.ts; this file holds each refusal.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type RulesServer, refuseDirectives } from '../src/rules/directives';

const ROOT = '/srv/media';

/** The refusal's `why` for one line placed after a stamp line (so the offending line is 2). */
function why(server: RulesServer, body: string, root: string | null = ROOT): string | null {
  const refused = refuseDirectives(server, `# config-hash: x\n${body}\n`, root);
  return refused === null ? null : `${refused.line}:${refused.directive}: ${refused.why}`;
}

describe('apache', () => {
  test('the shape phase 1 renders is accepted', () => {
    const include = [
      `Alias /dedalo/media "${ROOT}"`,
      `<Directory "${ROOT}">`,
      '\tAllowOverride None',
      '\tRequire all granted',
      '<FilesMatch "(?i)\\.(phps?|phtml)$">',
      '\tSetHandler none',
      '</FilesMatch>',
      '<IfModule mod_rewrite.c>',
      'RewriteEngine On',
      'RewriteRule (?i)\\.(cgi|pl)$ - [R=404,L]',
      '</IfModule>',
      '<IfModule !mod_headers.c>',
      '\t<If "%{REQUEST_URI} =~ m#^/dedalo/media/x\\.svg$#">',
      '\t\tRequire all denied',
      '\t</If>',
      '</IfModule>',
      'Header always set Content-Security-Policy "default-src \'none\'; sandbox"',
      'Options -Indexes -ExecCGI',
      'AddHandler default-handler .php .phtml',
      `RewriteCond "${ROOT}/.publication/pub/$1_$2" -f`,
      'RewriteRule ^(image/thumb)/[^/]*_([a-z0-9]+)_([0-9]+)\\.jpg$ - [L]',
      'RewriteRule ^ - [R=404,L]',
      '</Directory>',
    ].join('\n');
    expect(why('apache', include)).toBeNull();
  });

  test.each([
    ['LoadModule evil_module /srv/media/evil.so', "2:LoadModule: not a directive the media include may carry"],
    ['Include /srv/media/x.conf', "2:Include: not a directive the media include may carry"],
    ['IncludeOptional /etc/apache2/*.conf', "2:IncludeOptional: not a directive the media include may carry"],
    ['ErrorLog "|/bin/sh -c id"', '2:ErrorLog: a value starting with | (a piped program) is never accepted'],
    ['CustomLog /srv/media/log common', "2:CustomLog: not a directive the media include may carry"],
    ['SetEnv X 1', "2:SetEnv: not a directive the media include may carry"],
    ['Alias /x "/etc"', "2:Alias: path '/etc' is outside MEDIA_ROOT"],
    ['Alias /x', '2:Alias: takes a URL and a path'],
    ['Alias /x "/srv/media/../etc"', "2:Alias: path '/srv/media/../etc' has a '.' or '..' segment"],
    ['AllowOverride All', "2:AllowOverride: only 'AllowOverride None'"],
    ['Require ip 10.0.0.1', "2:Require: only 'Require all granted|denied'"],
    ['SetHandler cgi-script', "2:SetHandler: only 'SetHandler none'"],
    ['AddHandler cgi-script .jpg', "2:AddHandler: only 'AddHandler default-handler <ext>...'"],
    ['Options +ExecCGI', '2:Options: only negative options (-Indexes, -ExecCGI)'],
    ['Header set', '2:Header: takes an action and a header'],
    ['RewriteEngine maybe', "2:RewriteEngine: only 'RewriteEngine On|Off'"],
    ['RewriteCond a b [X]', '2:RewriteCond: a test string, a pattern and [NC,OR] flags only'],
    ['RewriteRule ^ http://x/ [P]', "2:RewriteRule: substitution '-' and [L,NC,R=404] flags only (no proxy, no redirect target)"],
    ['RewriteRule ^ - [E=X:1]', "2:RewriteRule: substitution '-' and [L,NC,R=404] flags only (no proxy, no redirect target)"],
    ['<Directory "/etc">\n</Directory>', "2:Directory: path '/etc' is outside MEDIA_ROOT"],
    ['<IfModule evil>\n</IfModule>', '2:IfModule: takes one [!]mod_<name>.c'],
    ['<FilesMatch a b>\n</FilesMatch>', '2:FilesMatch: takes one pattern'],
    ['<VirtualHost *:80>\n</VirtualHost>', '2:VirtualHost: not a section the media include may carry'],
    ['<IfModule mod_x.c', '2:<IfModule mod_x.c: unterminated section'],
    ['</Directory>', '2:</Directory>: unbalanced section'],
    ['<IfModule mod_x.c>', '3:<ifmodule>: unclosed section'],
    ['Require all granted \\', '2:(continuation): line continuations are not accepted'],
    ['Header set X "unclosed', '2:Header set X "unclosed: unbalanced quote'],
  ])('%s', (body, expected) => {
    expect(why('apache', body)).toBe(expected);
  });

  test('no MEDIA_ROOT: no path may be named', () => {
    expect(why('apache', 'Alias /x "/srv/media"', null)).toBe(
      '2:Alias: this host has no MEDIA_ROOT, so the include may name no path',
    );
  });
});

describe('nginx', () => {
  test('the shape phase 1 renders is accepted', () => {
    const include = [
      'location ^~ /dedalo/media/ {',
      '\tlocation ^~ /dedalo/media/.publication/ { deny all; return 404; }',
      '\tlocation ~* ^/dedalo/media/.+\\.(php|cgi)$ {',
      '\t\tdeny all;',
      '\t\treturn 404;',
      '\t}',
      '\tlocation ~ "^/dedalo/media/(?<dd_path>image/thumb/[^/]*_(?<dd_s>[a-z0-9]+)_(?<dd_i>[0-9]+)\\.jpg$)" {',
      `\t\tif (!-f ${ROOT}/.publication/pub/\${dd_s}_\${dd_i}) { return 404; }`,
      `\t\talias ${ROOT}/$dd_path;`,
      '\t\tadd_header X-Content-Type-Options "nosniff" always;',
      "\t\tadd_header Content-Security-Policy 'default-src \\'none\\'' always;",
      "\t\tmp4;   # '?start=' clipping",
      '\t}',
      '\treturn 404;',
      '}',
    ].join('\n');
    expect(why('nginx', include)).toBeNull();
  });

  test.each([
    ['load_module /srv/media/evil.so;', '2:load_module: not a directive the media include may carry'],
    ['include /srv/media/x.conf;', '2:include: not a directive the media include may carry'],
    ['error_log /etc/cron.d/x;', '2:error_log: not a directive the media include may carry'],
    ['location / { access_log /tmp/x; }', '2:access_log: not a directive the media include may carry'],
    ['location / { proxy_pass http://x; }', '2:proxy_pass: not a directive the media include may carry'],
    ['location / { root /; }', '2:root: not a directive the media include may carry'],
    ['location / { alias /etc/; }', "2:alias: path '/etc/' is outside MEDIA_ROOT"],
    ['location / { alias a b; }', '2:alias: takes one path'],
    ['location / { return 301 http://x; }', '2:return: only a status code'],
    ['location / { deny 10.0.0.1; }', "2:deny: only 'deny all'"],
    ['location / { add_header X; }', '2:add_header: name value [always]'],
    ['location / { mp4 on; }', '2:mp4: takes no argument'],
    ['location { }', '2:location: takes [modifier] uri'],
    ['location / { if { } }', '2:if: takes a condition'],
    ['location /;', '2:location: must open a block'],
    ['location / { deny all { } }', '2:deny: must not open a block'],
    ['location / { return 404;', '2:{: unclosed block'],
    ['}', '2:}: unbalanced block'],
    ['location / { return 404 }', '2:}: unbalanced block'],
    ['location / { ; }', '2:;: empty statement'],
    ['return 404', '2:return: statement without ;'],
    ['add_header X "unclosed;', '2:(quote): unbalanced quote'],
    ['deny ${x', '2:(variable): unterminated ${variable}'],
  ])('%s', (body, expected) => {
    expect(why('nginx', body)).toBe(expected);
  });

  test('no MEDIA_ROOT: no path may be named', () => {
    expect(why('nginx', 'location / { alias /srv/media/; }', null)).toBe(
      '2:alias: this host has no MEDIA_ROOT, so the include may name no path',
    );
  });
});

test('the module imports nothing (the root tripwire loads it)', () => {
  const source = readFileSync(join(import.meta.dir, '..', 'src', 'rules', 'directives.ts'), 'utf8');
  expect(source).not.toMatch(/^\s*import\b/m);
});

/* ── the host-wide nginx map grammar (spec §13.3) ─────────────────────────────────── */

import {
  contributionOf,
  envelopePcre,
  envelopeProblem,
  isMapRefusal,
  judgeContribution,
  MAP_GRAMMAR,
  NGINX_MAP_PINS,
  parseNginxMap,
  stampedHash,
} from '../src/rules/directives';
import { renderHostMap } from '../src/rules/host_map';

const MH = 'd'.repeat(64);
const MH2 = 'e'.repeat(64);
const PINS = NGINX_MAP_PINS[0];

/** A buildNginxMap()-shaped text, rendered through the root renderer (its byte-equality to the engine is the root native gate). */
function engineMap(mediaDir = 'media', folder = 'image', hash = MH): string {
  return renderHostMap([{ hash, envelope: envelopePcre(mediaDir, folder), pinsId: 'pins-1' }]).text;
}

/** The refusal as `line:directive: why`, or null when parsed. */
function mapWhy(text: string): string | null {
  const parsed = parseNginxMap(text);
  return isMapRefusal(parsed) ? `${parsed.line}:${parsed.directive}: ${parsed.why}` : null;
}

/** The engine's text with one line replaced (exact match required, so a stale fixture is red). */
function swap(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

/** The engine map as it stood when this grammar was written (TEMPLATE_VERSION 4), byte for byte. */
const LITERAL_ENGINE_MAP = [
  '# Dédalo media access control — GENERATED by src/core/media/protection.ts.',
  '# Include this in the http{} context (a map cannot live inside server{}).',
  `# config-hash: ${MH}`,
  '# It sanitizes the auth cookie to hex-only before it is used in a file path,',
  '# and classifies the URI for the MEDIA-03 response headers.',
  'map $cookie_dedalo_media_auth $dedalo_auth_key {',
  '\t"~^(?<h>[a-f0-9]{128})$"  $h;',
  '\tdefault                   "_invalid_";',
  '}',
  '',
  '# MEDIA-03: the ENVELOPE pattern must come FIRST — nginx map regexes are tested in',
  '# order and an envelope is also an `.svg`. Getting this order wrong sends every',
  '# server-generated envelope down the attachment branch and blanks the edit view.',
  'map $uri $dedalo_svg_disposition {',
  '\t"~^/dedalo/media/image/(?:[^/]+/)*svg/(?:[^/]+/)*[^/]+\\.svg$"  "";',
  '\t"~\\.(?:svg|xml|xsl|xslt)$"  "attachment";',
  '\tdefault                    "";',
  '}',
  '',
  'map $uri $dedalo_svg_csp {',
  `\t"~^/dedalo/media/image/(?:[^/]+/)*svg/(?:[^/]+/)*[^/]+\\.svg$"  "${PINS?.envelopeCsp}";`,
  '\t"~\\.(?:svg|xml|xsl|xslt)$"  "default-src \'none\'; sandbox";',
  '\tdefault                    "";',
  '}',
  '',
].join('\n');

describe('parseNginxMap — accepts the engine shape', () => {
  test('the literal engine map parses: hash, its one envelope, the pin set', () => {
    expect(LITERAL_ENGINE_MAP).toBe(engineMap());
    expect(parseNginxMap(LITERAL_ENGINE_MAP)).toEqual({
      hash: MH,
      envelopes: ['^/dedalo/media/image/(?:[^/]+/)*svg/(?:[^/]+/)*[^/]+\\.svg$'],
      pinsId: 'pins-1',
    });
  });

  for (const [mediaDir, folder] of [
    ['media', 'image'],
    ['dedalo_media', 'img'],
    ['media.v7', 'image-2'],
    ['m', 'x_y.z'],
  ] as const) {
    test(`mediaDir '${mediaDir}', image folder '${folder}'`, () => {
      const parsed = parseNginxMap(engineMap(mediaDir, folder));
      expect(isMapRefusal(parsed)).toBe(false);
      expect(parsed).toMatchObject({ envelopes: [envelopePcre(mediaDir, folder)], pinsId: 'pins-1' });
    });
  }

  test('several envelopes (a host file) parse in file order; whitespace between words is free; CR refused', () => {
    const host = renderHostMap([
      { hash: MH, envelope: envelopePcre('a', 'image'), pinsId: 'pins-1' },
      { hash: MH2, envelope: envelopePcre('b', 'image'), pinsId: 'pins-1' },
    ]).text;
    expect(parseNginxMap(host)).toMatchObject({ envelopes: [envelopePcre('a', 'image'), envelopePcre('b', 'image')] });
    const spaced = swap(LITERAL_ENGINE_MAP, 'map $uri $dedalo_svg_csp {', 'map   $uri\t$dedalo_svg_csp{');
    expect(mapWhy(spaced)).toBeNull();
    expect(mapWhy(LITERAL_ENGINE_MAP.replace(/\n/g, '\r\n'))).toMatch(/carriage return/);
  });

  test('MAP_GRAMMAR is the highest pin-set grammar; the stamp reader is shared with rules.apply', () => {
    expect(MAP_GRAMMAR).toBe(Math.max(...NGINX_MAP_PINS.map(p => p.grammar)));
    expect(stampedHash(LITERAL_ENGINE_MAP)).toBe(MH);
  });
});

describe('parseNginxMap — refuses, naming the line', () => {
  const cases: [string, string, string, RegExp][] = [
    ['a second auth value', '\tdefault                   "_invalid_";', '\t"~^x$"  $h;\n\tdefault  "_invalid_";', /^8:"~\^x\$": the auth map takes exactly/],
    ['a changed auth regex', '\t"~^(?<h>[a-f0-9]{128})$"  $h;', '\t"~^(?<h>.*)$"  $h;', /^7:.*the auth map takes exactly/],
    ['an auth value other than $h', '\t"~^(?<h>[a-f0-9]{128})$"  $h;', '\t"~^(?<h>[a-f0-9]{128})$"  $uri;', /^7:.*not a map entry/],
    ['a changed auth default', '\tdefault                   "_invalid_";', '\tdefault  "";', /auth map's default/],
    ['include', '}\n\n# MEDIA-03', '}\ninclude /etc/passwd;\n# MEDIA-03', /^10:include: expected 'map \$uri \$dedalo_svg_disposition \{'/],
    ['hostnames', 'map $uri $dedalo_svg_csp {', 'map $uri $dedalo_svg_csp {\n\thostnames;', /^21:hostnames;: not a map entry/],
    ['volatile', 'map $uri $dedalo_svg_disposition {', 'map $uri $dedalo_svg_disposition {\n\tvolatile;', /^15:volatile;: not a map entry/],
    ['another source variable', 'map $uri $dedalo_svg_csp {', 'map $request_uri $dedalo_svg_csp {', /expected 'map \$uri \$dedalo_svg_csp \{'/],
    ['an unpinned CSP', "\"default-src 'none'; sandbox\";", '"default-src *";', /^22:.*an unpinned CSP value/],
    ['an unpinned disposition', '"attachment";', '"inline";', /not an admitted pin set/],
    ['an envelope segment with /', '^/dedalo/media/image/', '^/dedalo/media/a/b/image/', /^15:.*envelope entry: not the image-envelope pattern/],
    ['an envelope segment with )', '^/dedalo/media/image/', '^/dedalo/media)/image/', /envelope entry: not the image-envelope pattern/],
    ['an unescaped . in a segment', '^/dedalo/media/image/', '^/dedalo/med.a/image/', /envelope entry: not the image-envelope pattern/],
    ['an unquoted pattern', '\t"~\\.(?:svg|xml|xsl|xslt)$"  "attachment";', '\t~\\.(?:svg|xml|xsl|xslt)$  "attachment";', /^16:.*not a map entry/],
    ['a missing default', '\t"~\\.(?:svg|xml|xsl|xslt)$"  "attachment";\n\tdefault                    "";\n', '\t"~\\.(?:svg|xml|xsl|xslt)$"  "attachment";\n', /^17:}: not a map entry/],
    ['a non-empty default', '\t"~\\.(?:svg|xml|xsl|xslt)$"  "attachment";\n\tdefault                    "";', '\t"~\\.(?:svg|xml|xsl|xslt)$"  "attachment";\n\tdefault  "attachment";', /disposition default/],
    ['a piped value', '"attachment";', '"|/bin/sh";', /not an admitted pin set/],
    ['a variable in a value', `"${PINS?.envelopeCsp}";`, '"$http_x";', /unpinned CSP value/],
    ['no stamp', `# config-hash: ${MH}\n`, '', /^1:# config-hash: the map must carry exactly one/],
  ];
  for (const [name, from, to, expected] of cases) {
    test(name, () => {
      expect(mapWhy(swap(LITERAL_ENGINE_MAP, from, to))).toMatch(expected);
    });
  }

  test('envelope order differing between the two SVG maps', () => {
    const host = renderHostMap([
      { hash: MH, envelope: envelopePcre('a', 'image'), pinsId: 'pins-1' },
      { hash: MH2, envelope: envelopePcre('b', 'image'), pinsId: 'pins-1' },
    ]).text;
    const lines = host.split('\n');
    const csp = lines.findIndex(line => line.startsWith('map $uri $dedalo_svg_csp'));
    [lines[csp + 1], lines[csp + 2]] = [lines[csp + 2] as string, lines[csp + 1] as string];
    expect(mapWhy(lines.join('\n'))).toMatch(/same patterns in the same order/);
  });

  test('a duplicate envelope, a CSP map with fewer entries, a NUL byte, an unclosed block', () => {
    const env = '\t"~^/dedalo/media/image/(?:[^/]+/)*svg/(?:[^/]+/)*[^/]+\\.svg$"  "";';
    expect(mapWhy(swap(LITERAL_ENGINE_MAP, env, `${env}\n${env}`))).toMatch(/duplicate envelope/);
    const cspEnv = LITERAL_ENGINE_MAP.split('\n')[20] as string;
    expect(mapWhy(swap(LITERAL_ENGINE_MAP, `${cspEnv}\n`, ''))).toMatch(/same entries as the disposition map/);
    expect(mapWhy(`${LITERAL_ENGINE_MAP}#\0`)).toMatch(/NUL/);
    expect(mapWhy(LITERAL_ENGINE_MAP.slice(0, LITERAL_ENGINE_MAP.lastIndexOf('}')))).toMatch(/^24:\(end\): expected '\}'/);
    expect(mapWhy(LITERAL_ENGINE_MAP.slice(0, LITERAL_ENGINE_MAP.lastIndexOf('\tdefault')))).toMatch(/unclosed map block/);
    expect(mapWhy(swap(LITERAL_ENGINE_MAP, '\t"~\\.(?:svg|xml|xsl|xslt)$"  "attachment";\n', ''))).toMatch(
      /one or more envelope entries, then the quarantine entry/,
    );
  });

  test('an extra map (a fourth variable) after the three blocks', () => {
    expect(mapWhy(`${LITERAL_ENGINE_MAP}map $uri $dedalo_x {\n\tdefault "";\n}\n`)).toMatch(/^25:map: nothing may follow the three map blocks/);
  });

  test('a second stamp in the leading block, or a stamp outside it', () => {
    expect(mapWhy(swap(LITERAL_ENGINE_MAP, `# config-hash: ${MH}`, `# config-hash: ${MH}\n# config-hash: ${MH2}`))).toMatch(/exactly one/);
    expect(mapWhy(`\n${LITERAL_ENGINE_MAP}`)).toMatch(/exactly one/);
  });
});

describe('envelopeProblem', () => {
  test('a template match, segment length and dot-only segments', () => {
    expect(envelopeProblem(envelopePcre('media', 'image'))).toBeNull();
    expect(envelopeProblem(envelopePcre('x'.repeat(64), 'image'))).toBeNull();
    expect(envelopeProblem(envelopePcre('x'.repeat(65), 'image'))).toMatch(/longer than 64/);
    expect(envelopeProblem(envelopePcre('..', 'image'))).toMatch(/'\.' or '\.\.'/);
    expect(envelopeProblem(`${envelopePcre('media', 'image')}x`)).toMatch(/not the image-envelope pattern/);
  });
});

describe('the contribution: exactly one envelope', () => {
  test('a push with one envelope makes a contribution; two are refused as a contribution', () => {
    const one = parseNginxMap(LITERAL_ENGINE_MAP);
    if (isMapRefusal(one)) throw new Error('fixture refused');
    expect(contributionOf(one, 'alpha')).toEqual({
      v: 1,
      grammar: 1,
      instance: 'alpha',
      hash: MH,
      envelope: envelopePcre('media', 'image'),
      pinsId: 'pins-1',
    });
    const two = parseNginxMap(
      renderHostMap([
        { hash: MH, envelope: envelopePcre('a', 'image'), pinsId: 'pins-1' },
        { hash: MH, envelope: envelopePcre('b', 'image'), pinsId: 'pins-1' },
      ]).text,
    );
    if (isMapRefusal(two)) throw new Error('fixture refused');
    expect(contributionOf(two, 'alpha')).toBe('a contribution carries one envelope');
    expect(contributionOf({ ...one, pinsId: 'pins-99' }, 'alpha')).toBe('an unknown pin set');
  });

  test('judgeContribution: valid, newer (grammar or pins), and every malformed field', () => {
    const good = { v: 1, grammar: 1, instance: 'alpha', hash: MH, envelope: envelopePcre('media', 'image'), pinsId: 'pins-1' };
    expect(judgeContribution(good, 'alpha')).toEqual({ ok: true, contribution: { ...good, v: 1 } } as never);
    expect(judgeContribution({ ...good, grammar: MAP_GRAMMAR + 1 }, 'alpha')).toEqual({
      ok: false,
      newer: true,
      grammar: MAP_GRAMMAR + 1,
      pinsId: 'pins-1',
    });
    // A newer grammar is judged before the shape: a future contribution may carry new keys.
    expect(judgeContribution({ grammar: 2, pinsId: 'pins-2', future: true }, 'alpha')).toMatchObject({ newer: true });
    expect(judgeContribution({ ...good, pinsId: 'pins-2' }, 'alpha')).toMatchObject({ ok: false, newer: true });
    const bad: [unknown, RegExp][] = [
      [null, /not a JSON object/],
      [[], /not a JSON object/],
      [{ ...good, grammar: 0 }, /positive integer/],
      [{ ...good, pinsId: 'P!' }, /pinsId is malformed/],
      [{ ...good, extra: 1 }, /unexpected or missing keys/],
      [{ ...good, v: 2 }, /v is not 1/],
      [{ ...good, instance: 'beta' }, /does not name its own file/],
      [{ ...good, hash: 'x' }, /64 lowercase hex/],
      [{ ...good, envelope: 7 }, /not a string/],
      [{ ...good, envelope: '^/etc/passwd$' }, /envelope: not the image-envelope pattern/],
    ];
    for (const [value, why] of bad) {
      const verdict = judgeContribution(value, 'alpha');
      expect(verdict.ok).toBe(false);
      expect(!verdict.ok && !verdict.newer ? verdict.why : '').toMatch(why);
    }
  });
});
