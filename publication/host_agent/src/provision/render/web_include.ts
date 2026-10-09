/**
 * THE WEB INCLUDE (spec S4) — `<configBase>/<instance>/web.<server>.conf`, the one file the
 * operator's vhost references (init's stamped `IncludeOptional`, nginx: a zero-match glob include),
 * so a removed instance never breaks the web server. It maps the instance into the site: the
 * agent's media rules, the v1 API (its own FPM pool, decision A — only when the declaration has the
 * v1 block: a v2-only instance's include carries no Alias and no PHP handler) and the v2 API
 * (loopback proxy).
 * Effect `reload_web`, validator `web`: apply.ts renames it into place under the host web lock,
 * runs the server's configtest, restores the previous bytes on failure, and reloads only after a
 * passing configtest (with the post-reload active poll).
 *
 * ROOT-RENDERED, NOT AGENT-PUSHED: this file is the provisioner's (root renders it from the
 * declaration), so src/rules/directives.ts refuseDirectives — the allowlist for the agent-pushed
 * media include — does not apply; every interpolated value is grammar-checked again here.
 *
 * APACHE. The v1 handler sits INSIDE `<If "-f %{REQUEST_FILENAME}">`: EL's conf.d/php.conf sends
 * `.php` to its www pool server-wide from a `<FilesMatch \.(php|phar)$>` (captured: EL 9, EL 10,
 * Remi — none uses an `<If>`), and `<FilesMatch>` merges AFTER `<Directory>`, so a SetHandler set
 * directly in our `<Directory>` would lose to it. `<If>` sections merge LAST: ours wins in the v1
 * tree (the EL drill's claim under EL 9's and EL 10's php.conf).
 * THE PATTERN `\.ph(?:ar|p|tml)$` is the union of every distribution handler the v1 tree can meet
 * (captured): Debian 12/13 and Ubuntu 24.04 `.+\.ph(?:ar|p|tml)$`, Ubuntu 26.04 `\.ph(?:ar|p|tml)$`,
 * EL's php.conf `\.(php|phar)$` (unanchored). The last two also claim a file NAMED `.php`/`.phar`
 * (no stem), which a `.+`-anchored pattern would leave to the site's www pool — so the pattern has no
 * `.+`: every name another handler claims is ours in the v1 tree, and no PHP-ish file there reaches
 * the website's pool (decision A). mod_php's engine is switched off in the tree (Debian mod_php, Remi's
 * php<NN>-php under EL prefork): guarded by `<IfModule>`, so the same bytes serve a host without mod_php — a renderer is
 * a pure function of the declaration and never depends on a discovered module list. The same text
 * serves Debian and EL; the families differ only in the socket path (layout.ts fpmLayout).
 *
 * nginx. The v1 location is `^~` (no regex location of the site's can take it) with a nested
 * handler location for the same pattern; nginx has no optional include, so the
 * media rules are included through a one-character class glob that matches zero files until the
 * agent writes them.
 *
 * PURE, ZERO-DEPENDENCY.
 */
import { join } from 'node:path';
import type { AgentLayout, WebServer } from '../layout';
import { ABSOLUTE_PATH_PATTERN, API_PATH_PATTERN } from '../layout';
import type { Artifact, RenderFacts, Renderer } from './types';
import { artifact } from './types';

/** src/rules/apply.ts RULES_FILE_PREFIX (that module reads the agent config; tests hold the two equal). */
export const MEDIA_RULES_FILE_PREFIX = 'dedalo_media_publication';

/** The include's path for this instance and server. */
export function webIncludePath(layout: AgentLayout, server: WebServer = layout.web.server): string {
  return join(layout.instanceDir, `web.${server}.conf`);
}

/** nginx accepts a glob matching zero files where it refuses a missing file: the last character as a class. */
export function zeroMatchGlob(path: string): string {
  return `${path.slice(0, -1)}[${path.slice(-1)}]`;
}

/** The v1 handler's file pattern — matches every name Debian's, Ubuntu's and EL's PHP handlers claim (a stemless `.php` included). */
export const PHP_HANDLER_PATTERN = '\\.ph(?:ar|p|tml)$';

function checked(field: string, pattern: RegExp, value: string): string {
  if (!pattern.test(value) || value.split('/').includes('..')) {
    throw new Error(`render(web_include): ${field} '${value}' does not match ${pattern.source}. Nothing was rendered.`);
  }
  return value;
}

function values(layout: AgentLayout) {
  const site = layout.site;
  if (site === null) throw new Error('render(web_include): the declaration has no site. Nothing was rendered.');
  const v2Port = layout.v2.port;
  if (!Number.isInteger(v2Port) || v2Port < 1 || v2Port > 65535) {
    throw new Error(`render(web_include): v2.port '${v2Port}' is not a port. Nothing was rendered.`);
  }
  if ((site.v1 === null) !== (layout.v1 === null)) {
    throw new Error('render(web_include): the site and the instance disagree about v1. Nothing was rendered.');
  }
  // null on a v2-only instance: the include then carries the v2 proxy only — no Alias, no handler.
  const v1 =
    site.v1 === null || layout.v1 === null
      ? null
      : {
          root: checked('the v1 root', ABSOLUTE_PATH_PATTERN, layout.v1.dirs.root),
          current: checked('the v1 current link', ABSOLUTE_PATH_PATTERN, layout.v1.dirs.current),
          path: checked('site.api_paths.v1', API_PATH_PATTERN, site.v1.apiPath),
          listen: checked('site.fpm.listen', ABSOLUTE_PATH_PATTERN, site.v1.fpm.listen),
        };
  return {
    rules: checked('the rules directory', ABSOLUTE_PATH_PATTERN, layout.state.rules),
    v1,
    v2Path: checked('site.api_paths.v2', API_PATH_PATTERN, site.v2ApiPath),
    v2Port,
  };
}

function apacheV1(v1: { root: string; current: string; path: string; listen: string }): string[] {
  return [
    '# Publication API v1, in its OWN PHP-FPM pool (never the site\'s).',
    `Alias ${v1.path} ${v1.current}`,
    `<Directory ${v1.root}>`,
    '    Options FollowSymLinks',
    '    AllowOverride None',
    '    Require all granted',
    '    # mod_php (Debian, EL prefork) never runs a v1 file as the web user.',
    '    <IfModule php_module>',
    '        php_admin_flag engine off',
    '    </IfModule>',
    '    <IfModule php7_module>',
    '        php_admin_flag engine off',
    '    </IfModule>',
    "    # Inside <If>: <If> merges after the server-wide FilesMatch section of EL's php.conf, so ours wins here.",
    `    <FilesMatch "${PHP_HANDLER_PATTERN}">`,
    '        <If "-f %{REQUEST_FILENAME}">',
    `            SetHandler "proxy:unix:${v1.listen}|fcgi://localhost"`,
    '        </If>',
    '    </FilesMatch>',
    '</Directory>',
    '',
  ];
}

function nginxV1(v1: { current: string; path: string; listen: string }): string[] {
  return [
    "# Publication API v1, in its OWN PHP-FPM pool (never the site's). ^~: no regex location of the site takes it.",
    `location ^~ ${v1.path}/ {`,
    `    alias ${v1.current}/;`,
    `    location ~ ${PHP_HANDLER_PATTERN} {`,
    '        include fastcgi_params;',
    '        fastcgi_param SCRIPT_FILENAME $request_filename;',
    `        fastcgi_pass unix:${v1.listen};`,
    '    }',
    '}',
    '',
  ];
}

const HEADER = (layout: AgentLayout, comment: string): string[] => [
  `${comment} GENERATED by publication/host_agent/src/provision/render/web_include.ts — do NOT edit.`,
  `${comment} Derived from ${layout.declarationPath}; referenced once from the site's vhost (provision init).`,
];

export function apacheWebInclude(layout: AgentLayout): string {
  const v = values(layout);
  return [
    ...HEADER(layout, '#'),
    '',
    "# The agent's media rules: before any other /dedalo alias. Absent until the first push.",
    `IncludeOptional ${v.rules}/${MEDIA_RULES_FILE_PREFIX}.apache.conf`,
    '',
    ...(v.v1 === null ? [] : apacheV1(v.v1)),
    `# Publication API v2, on 127.0.0.1:${v.v2Port}.`,
    `<Location ${v.v2Path}/>`,
    `    ProxyPass        http://127.0.0.1:${v.v2Port}/`,
    `    ProxyPassReverse http://127.0.0.1:${v.v2Port}/`,
    '</Location>',
    '',
  ].join('\n');
}

export function nginxWebInclude(layout: AgentLayout): string {
  const v = values(layout);
  return [
    ...HEADER(layout, '#'),
    '',
    "# The agent's media rules (a zero-match glob until the first push: nginx has no optional include).",
    `include ${zeroMatchGlob(`${v.rules}/${MEDIA_RULES_FILE_PREFIX}.nginx.conf`)};`,
    '',
    ...(v.v1 === null ? [] : nginxV1(v.v1)),
    `# Publication API v2, on 127.0.0.1:${v.v2Port}.`,
    `location ${v.v2Path}/ {`,
    `    proxy_pass http://127.0.0.1:${v.v2Port}/;`,
    '    proxy_set_header Host $host;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Proto $scheme;',
    '}',
    '',
  ].join('\n');
}

export const webIncludeRenderer: Renderer = {
  kind: 'web_include',
  appliesTo: layout => layout.site !== null,
  render(layout: AgentLayout, _facts: RenderFacts): Artifact[] {
    const body = layout.web.server === 'apache' ? apacheWebInclude(layout) : nginxWebInclude(layout);
    return [
      artifact(layout, {
        kind: 'web_include',
        path: webIncludePath(layout),
        mode: 'webInclude',
        body,
        effects: ['reload_web'],
        validate: 'web',
      }),
    ];
  },
};
