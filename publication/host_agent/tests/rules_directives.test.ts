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
