/**
 * THE COMPOSITION GATE — the assertion whose absence let three files describing three
 * different systems sit green beside each other.
 *
 * `src/provision/layout.ts`, `src/provision/schema.ts` and
 * `engineering/SITE_BUILDER_INSTANCES.md` were written in parallel and blind to one
 * another. Each was internally coherent. Together they declared two instance grammars with
 * different length ceilings, two spellings of a site's webspace, two containment
 * predicates, two prefixes (one of them a character too long, which moved the arithmetic),
 * a mode matrix that disagreed with itself about who owned a workspace, and a documented
 * API of twenty functions the code did not export. Every one of those was invisible for
 * the same reason: NOTHING EVER CALLED THEM TOGETHER. `bunx tsc --noEmit` was clean and
 * `bun test` was green, because a file that is never composed with another file cannot
 * disagree with it in a way a compiler can see.
 *
 * So the first test in this file is one line — `derive(parseManifest(doc))` — and it is
 * the most important one. The rest are the specific properties that make the composition
 * mean something:
 *
 *   - EVERY FIELD THE SCHEMA ACCEPTS MOVES A DERIVED VALUE. A field that validates and is
 *     then ignored installs cleanly and diverges at runtime, on a museum's host, with the
 *     declaration on disk saying otherwise. That is the historical defect this subsystem
 *     exists to remove (the unit's ReadWritePaths= that did not follow the installer's
 *     root overrides — a clean install and an EROFS at publish time), rebuilt in
 *     TypeScript. It is asserted here by overriding each field and demanding the derived
 *     value move.
 *   - THE WRITABLE SET COVERS EVERY WRITABLE PATH, over a MATRIX and not one happy case:
 *     roots off their defaults, a webspace outside the webspace base, several sites. One
 *     happy case is exactly what the old unit passed.
 *   - THE MODES ARE THE MODES. The setgid bit is compared as part of the whole number, so
 *     a silent 0o750 where 0o2750 was meant — the difference between a museum's
 *     unpublished drafts being private and being readable by every uid on the host —
 *     reddens rather than looking like a rounding of the same idea.
 *   - THE DOCUMENT AND THE CODE ARE ONE SYSTEM. §2.3's accessors are evaluated, §3's
 *     matrix is compared row for row against MODES, and §2.2's grammars are compared
 *     byte for byte. Both directions, so neither can quietly outgrow the other.
 *
 * Nothing here touches the filesystem beyond READING two committed files. It is a pure
 * gate over pure functions, which is why it can be exhaustive.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_PATHS,
  DEFAULT_REALM,
  INSTANCE_MARKER,
  INSTANCE_PATTERN,
  LIMIT_ENV,
  MAX_INSTANCE_LENGTH,
  MAX_USERNAME_LENGTH,
  MODES,
  SURFACES,
  USER_PREFIX,
  derive,
  pathsOverlap,
  isStrictlyWithin,
  isWritablePath,
  markerContent,
  readWritePaths,
  type InstanceManifest,
} from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { SLUG_PATTERN } from '../src/util/slug';
import { isWithin } from '../src/util/paths';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Fixtures — a valid declaration, and a way to bend exactly one field of it
 * ──────────────────────────────────────────────────────────────────────────────────── */

const PACKAGE_DIR = join(import.meta.dir, '..');
const EXAMPLE_PATH = join(PACKAGE_DIR, 'deploy', 'examples', 'instance.example.json');
const SPEC_PATH = join(PACKAGE_DIR, '..', '..', 'engineering', 'SITE_BUILDER_INSTANCES.md');

function readExample(): Record<string, unknown> {
  return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Record<string, unknown>;
}

/**
 * The smallest declaration that parses. Built here rather than read from the example so a
 * refusal test is about the ONE thing it bends, and so the example file stays free to be
 * a realistic reference rather than a test input with opinions.
 */
function baseDoc(): Record<string, any> {
  return {
    instance: 'gate',
    engine: { private_dir: '/srv/dedalo/gate/private', group: 'dedalo-gate' },
    web: { server: 'nginx', group: 'www-data' },
    publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
    sites: [{ slug: 'one', domain: 'one.example.org' }],
    serving: {
      preprod: { enabled: true, auth: { mode: 'htpasswd', users: [{ name: 'preview', password_file: '/etc/x/PREPROD_PASSWORD' }] } },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
  };
}

/** `baseDoc()` with a deep patch applied — the shape every override test below uses. */
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

/** Parse + derive in one step: the only composition either module supports. */
function layoutFrom(doc: unknown) {
  return derive(parseManifest(doc, { source: 'the gate' }));
}

/** The message of whatever `parseManifest` threw — refusals are asserted by their text. */
function refusal(doc: unknown): string {
  try {
    parseManifest(doc, { source: 'the gate' });
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the declaration to be REFUSED, and it was accepted');
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. The composition itself
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the two modules compose', () => {
  test('derive(parseManifest(the committed example)) succeeds', () => {
    // ONE LINE, and the whole reason this file exists. `deploy/examples/instance.example.json`
    // is committed, so this is also the gate on the example staying valid as the grammar
    // moves — a reference declaration nobody parses is documentation, not a reference.
    const layout = layoutFrom(readExample());
    expect(layout.instance).toBe('example');
    expect(layout.sites).toHaveLength(2);
  });

  test('the identity is derived from the ONE prefix', () => {
    const layout = layoutFrom(baseDoc());
    expect(layout.identity.user).toBe(`${USER_PREFIX}gate`);
    expect(layout.identity.group).toBe(layout.identity.user);
    expect(layout.identity.adopted).toBe(false);
    // The host's own names are echoed, never guessed.
    expect(layout.identity.webGroup).toBe('www-data');
    expect(layout.identity.engineGroup).toBe('dedalo-gate');
  });

  test('the derived layout is frozen all the way down', () => {
    // A layout that could be mutated after readWritePaths() read it would be a
    // confinement set describing a tree that no longer exists.
    const layout = layoutFrom(baseDoc());
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.roots)).toBe(true);
    expect(Object.isFrozen(layout.identity)).toBe(true);
    expect(Object.isFrozen(layout.sites[0])).toBe(true);
    expect(Object.isFrozen(layout.envVars)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. No field validates and then vanishes
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('every field the schema accepts reaches the derived layout', () => {
  test('sites[].webspace pins the webspace, its release stores and its served links', () => {
    const layout = layoutFrom(
      docWith({ sites: [{ slug: 'one', domain: 'one.example.org', webspace: '/srv/legacy/one' }] }),
    );
    const site = layout.sites[0]!;
    expect(site.webspace).toBe('/srv/legacy/one');
    expect(site.releasesDir('prod')).toBe('/srv/legacy/one/.releases/web');
    expect(site.releasesDir('preprod')).toBe('/srv/legacy/one/.releases/pre');
    expect(site.linkPath('prod')).toBe('/srv/legacy/one/web');
    expect(site.linkPath('preprod')).toBe('/srv/legacy/one/pre');
  });

  test('webspace_base moves every site that did NOT pin one, and nothing else', () => {
    const layout = layoutFrom(
      docWith({
        webspace_base: '/srv/www',
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org', webspace: '/srv/legacy/two' },
        ],
      }),
    );
    expect(layout.webspaceBase).toBe('/srv/www');
    expect(layout.sites[0]!.webspace).toBe('/srv/www/one.example.org');
    expect(layout.sites[1]!.webspace).toBe('/srv/legacy/two');
    expect(layout.envVars.WEBSPACE_BASE).toBe('/srv/www');
  });

  test('roots.workspaces / roots.home / roots.audit each move ONE root', () => {
    const layout = layoutFrom(
      docWith({
        roots: {
          workspaces: '/srv/work/gate',
          home: '/srv/agent-home/gate',
          audit: '/srv/audit/gate',
        },
      }),
    );
    expect(layout.roots.workspaces).toBe('/srv/work/gate');
    expect(layout.roots.home).toBe('/srv/agent-home/gate');
    expect(layout.roots.audit).toBe('/srv/audit/gate');
    // The audit FILE follows its directory, or the append-only pair is decorative.
    expect(layout.auditFile).toBe('/srv/audit/gate/audit.jsonl');
    // And the rendered env states what the unit confines — same values, one derivation.
    expect(layout.envVars.SITES_ROOT).toBe('/srv/work/gate');
    expect(layout.envVars.AGENT_HOME).toBe('/srv/agent-home/gate');
    expect(layout.envVars.AUDIT_DIR).toBe('/srv/audit/gate');
  });

  test('paths.state_base moves all three roots together', () => {
    const layout = layoutFrom(docWith({ paths: { state_base: '/srv/state' } }));
    expect(layout.stateDir).toBe('/srv/state/gate');
    expect(layout.roots.workspaces).toBe('/srv/state/gate/workspaces');
    expect(layout.roots.home).toBe('/srv/state/gate/home');
    expect(layout.roots.audit).toBe('/srv/state/gate/audit');
  });

  test('an explicit root beats the base it would otherwise sit under', () => {
    const layout = layoutFrom(
      docWith({ paths: { state_base: '/srv/state' }, roots: { audit: '/srv/audit/gate' } }),
    );
    expect(layout.roots.workspaces).toBe('/srv/state/gate/workspaces');
    expect(layout.roots.audit).toBe('/srv/audit/gate');
  });

  test('paths.config_base / unit_dir / vhost_dir each move their artifacts', () => {
    const layout = layoutFrom(
      docWith({
        paths: {
          config_base: '/srv/etc/instances',
          unit_dir: '/srv/systemd',
          vhost_dir: '/srv/vhosts',
        },
      }),
    );
    expect(layout.configDir).toBe('/srv/etc/instances/gate');
    expect(layout.secretsDir).toBe('/srv/etc/instances/gate/secrets');
    expect(layout.manifestPath).toBe('/srv/etc/instances/gate/instance.json');
    expect(layout.envFile).toBe('/srv/etc/instances/gate/env');
    expect(layout.engineFragment).toBe('/srv/etc/instances/gate/engine.env.fragment');
    expect(layout.htpasswd).toBe('/srv/etc/instances/gate/preprod.htpasswd');
    // The runtime dir is deliberately NOT movable: systemd resolves RuntimeDirectory=
    // under /run only, so an override would leave the unit creating one directory and the
    // daemon binding its socket in another. It stays pinned however the rest moves.
    expect(layout.runtimeDir).toBe('/run/dedalo-sites/gate');
    expect(layout.socketPath).toBe('/run/dedalo-sites/gate/daemon.sock');
    expect(layout.unitPath).toBe(`/srv/systemd/${layout.unitName}`);
    expect(layout.sites[0]!.vhostPaths.prod.startsWith('/srv/vhosts/')).toBe(true);
    expect(layout.sites[0]!.vhostPaths.preprod.startsWith('/srv/vhosts/')).toBe(true);
  });

  test('identity overrides the derived user AND group (the adopt-an-install story)', () => {
    const layout = layoutFrom(docWith({ identity: { user: 'legacy-sites', group: 'legacy-web' } }));
    expect(layout.identity.user).toBe('legacy-sites');
    expect(layout.identity.group).toBe('legacy-web');
    expect(layout.identity.adopted).toBe(true);
  });

  test('web.server picks the vhost flavour AND the default vhost directory', () => {
    const nginx = layoutFrom(docWith({ web: { server: 'nginx' } }));
    const apache = layoutFrom(docWith({ web: { server: 'apache' } }));
    expect(nginx.webServer).toBe('nginx');
    expect(apache.webServer).toBe('apache');
    expect(nginx.sites[0]!.vhostPaths.prod).toContain('/etc/nginx/sites-available/');
    expect(apache.sites[0]!.vhostPaths.prod).toContain('/etc/apache2/sites-available/');
    expect(apache.envVars.DEPLOYMENT_MODE).toBe('apache');
  });

  test('serving.preprod.host_prefix and auth.htpasswd and auth.realm are all honoured', () => {
    const layout = layoutFrom(
      docWith({
        serving: {
          preprod: {
            enabled: true,
            host_prefix: 'draft',
            auth: { mode: 'htpasswd', realm: 'Museum drafts', htpasswd: '/srv/etc/legacy.htpasswd' },
          },
          prod: { tls: { mode: 'none' } },
        },
      }),
    );
    expect(layout.sites[0]!.preprodDomain).toBe('draft.one.example.org');
    expect(layout.htpasswd).toBe('/srv/etc/legacy.htpasswd');
    expect(layout.preprodRealm).toBe('Museum drafts');
  });

  test('publication_api.url and key_path reach the rendered env — the url as a value, the key as a PATH', () => {
    const layout = layoutFrom(
      docWith({
        publication_api: {
          url: 'https://data.example.org/publication/server_api/v2',
          key_path: '/etc/x/secrets/PUBLICATION_API_KEY',
        },
      }),
    );
    expect(layout.envVars.PUBLICATION_API_URL).toBe('https://data.example.org/publication/server_api/v2');
    expect(layout.envVars.PUBLICATION_API_KEY_FILE).toBe('/etc/x/secrets/PUBLICATION_API_KEY');
    // Never the value: the whole credential law in one assertion.
    expect(Object.values(layout.envVars).join('\n')).not.toContain('secret-value');
  });

  test('agent.driver and agent.bins reach the rendered env', () => {
    const layout = layoutFrom(
      docWith({ agent: { driver: 'opencode', bins: { opencode: '/opt/opencode/bin/opencode' } } }),
    );
    expect(layout.envVars.AGENT_DRIVER).toBe('opencode');
    expect(layout.envVars.OPENCODE_BIN).toBe('/opt/opencode/bin/opencode');
  });

  test('secrets become derivable credential paths', () => {
    const layout = layoutFrom(
      docWith({ secrets: { ANTHROPIC_API_KEY: '/etc/x/secrets/ANTHROPIC_API_KEY' } }),
    );
    expect(layout.secrets.ANTHROPIC_API_KEY).toBe('/etc/x/secrets/ANTHROPIC_API_KEY');
    expect(layout.secretPath('ANTHROPIC_API_KEY')).toBe(
      join(layout.secretsDir, 'ANTHROPIC_API_KEY'),
    );
  });

  test('description and resources are carried, not dropped', () => {
    const layout = layoutFrom(
      docWith({ description: 'The reference tenancy', resources: { memory_max: '4G', cpu_quota: '150%' } }),
    );
    expect(layout.description).toBe('The reference tenancy');
    expect(layout.resources.memory_max).toBe('4G');
    expect(layout.resources.cpu_quota).toBe('150%');
  });

  test('ONLY STATED limits are rendered, so src/config.ts keeps owning its seven defaults', () => {
    const stated = layoutFrom(docWith({ limits: { max_sites: 8, releases_retained: 10 } }));
    expect(stated.envVars.MAX_SITES).toBe('8');
    expect(stated.envVars.RELEASES_RETAINED).toBe('10');
    // The five NOT stated must be absent — a rendered default would freeze today's value
    // into every museum's env and quietly take ownership away from config.ts.
    for (const key of Object.values(LIMIT_ENV)) {
      if (key === 'MAX_SITES' || key === 'RELEASES_RETAINED') continue;
      expect(stated.envVars[key]).toBeUndefined();
    }
    const silent = layoutFrom(baseDoc());
    for (const key of Object.values(LIMIT_ENV)) expect(silent.envVars[key]).toBeUndefined();
  });

  test('unstated fields fall back to the layout defaults, and to nothing else', () => {
    const layout = layoutFrom(baseDoc());
    expect(layout.webspaceBase).toBe(DEFAULT_PATHS.webspaceBase);
    expect(layout.configDir).toBe(`${DEFAULT_PATHS.configBase}/gate`);
    expect(layout.stateDir).toBe(`${DEFAULT_PATHS.stateBase}/gate`);
    expect(layout.runtimeDir).toBe(`${DEFAULT_PATHS.runtimeBase}/gate`);
    expect(layout.preprodRealm).toBe(DEFAULT_REALM);
    expect(layout.sites[0]!.preprodDomain).toBe('pre.one.example.org');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. readWritePaths() — asserted over a matrix, because one happy case is what failed
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the unit’s writable set covers everything the daemon writes', () => {
  /**
   * Roots on /srv, a webspace outside /home/www, and one site left on the default base.
   * This is the shape the deleted unit got wrong: it named two literal roots, so an
   * operator who overrode them installed cleanly and got EROFS at publish time.
   */
  const spread = () =>
    layoutFrom(
      docWith({
        webspace_base: '/srv/www',
        roots: { workspaces: '/srv/work/gate', home: '/srv/agent-home/gate', audit: '/srv/audit/gate' },
        sites: [
          { slug: 'one', domain: 'one.example.org' },
          { slug: 'two', domain: 'two.example.org', webspace: '/srv/legacy/two' },
        ],
      }),
    );

  test('every root, the runtime dir and EVERY site webspace are covered', () => {
    const layout = spread();
    const mustBeWritable = [
      layout.roots.workspaces,
      layout.roots.home,
      layout.roots.audit,
      layout.runtimeDir,
      ...layout.sites.map(site => site.webspace),
    ];
    for (const path of mustBeWritable) {
      expect(isWritablePath(layout, path)).toBe(true);
    }
  });

  test('and so is everything the daemon writes INSIDE them', () => {
    const layout = spread();
    const written = [
      layout.auditFile,
      layout.socketPath,
      join(layout.roots.workspaces, 'one', '.builder', 'state.json'),
      join(layout.roots.home, '.claude', 'sessions'),
      ...layout.sites.flatMap(site => [
        ...SURFACES.map(surface => site.releasesDir(surface)),
        ...SURFACES.map(surface => site.linkPath(surface)),
      ]),
    ];
    for (const path of written) {
      expect(isWritablePath(layout, path)).toBe(true);
    }
  });

  test('the ROOT-OWNED paths are deliberately NOT writable', () => {
    // The daemon must be unable to rewrite its own env, read a credential off the disk, or
    // replace one of its own roots. Their absence is a property, not an oversight.
    const layout = spread();
    for (const path of [layout.configDir, layout.secretsDir, layout.envFile, layout.stateDir, layout.unitPath]) {
      expect(isWritablePath(layout, path)).toBe(false);
    }
  });

  test('coverage holds however the declaration is spread across the filesystem', () => {
    // The matrix: each row is a different placement, and every row must be fully covered.
    const placements: { name: string; patch: Record<string, any> }[] = [
      { name: 'all defaults', patch: {} },
      { name: 'state base moved', patch: { paths: { state_base: '/srv/state' } } },
      { name: 'roots moved individually', patch: { roots: { workspaces: '/srv/w', home: '/srv/h', audit: '/srv/a' } } },
      { name: 'webspace base moved', patch: { webspace_base: '/srv/www' } },
      {
        name: 'a webspace outside the base',
        patch: { sites: [{ slug: 'one', domain: 'one.example.org', webspace: '/srv/legacy/one' }] },
      },
      {
        name: 'everything moved at once',
        patch: {
          webspace_base: '/srv/www',
          paths: { state_base: '/srv/state' },
          roots: { audit: '/srv/audit/gate' },
          sites: [
            { slug: 'one', domain: 'one.example.org' },
            { slug: 'two', domain: 'two.example.org', webspace: '/opt/sites/two' },
            { slug: 'three', domain: 'three.example.org' },
          ],
        },
      },
    ];

    for (const { name, patch } of placements) {
      const layout = layoutFrom(docWith(patch));
      const set = readWritePaths(layout);
      const uncovered = [
        layout.roots.workspaces,
        layout.roots.home,
        layout.roots.audit,
        layout.runtimeDir,
        ...layout.sites.map(site => site.webspace),
      ].filter(path => !set.some(root => isWithin(root, path)));
      expect({ placement: name, uncovered }).toEqual({ placement: name, uncovered: [] });
    }
  });

  test('the set is sorted and de-duplicated, so re-ordering sites is not drift', () => {
    const a = readWritePaths(
      layoutFrom(
        docWith({
          sites: [
            { slug: 'one', domain: 'one.example.org' },
            { slug: 'two', domain: 'two.example.org' },
          ],
        }),
      ),
    );
    const b = readWritePaths(
      layoutFrom(
        docWith({
          sites: [
            { slug: 'two', domain: 'two.example.org' },
            { slug: 'one', domain: 'one.example.org' },
          ],
        }),
      ),
    );
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
    expect(new Set(a).size).toBe(a.length);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. The refusals
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the declaration refuses what it must', () => {
  test('an INLINED credential, anywhere in the document', () => {
    // The walk is over the RAW document, so a key the schema never heard of is caught too.
    expect(refusal(docWith({ secrets: { ANTHROPIC_API_KEY: 'sk-ant-not-a-path' } }))).toMatch(
      /names a credential/,
    );
    expect(refusal({ ...baseDoc(), DEPLOY_TOKEN: 'hunter2' })).toMatch(/ROTATE it/);
  });

  test('a RELATIVE path', () => {
    expect(refusal(docWith({ roots: { workspaces: 'var/lib/gate' } }))).toMatch(/must be an ABSOLUTE path/);
    expect(refusal(docWith({ webspace_base: './www' }))).toMatch(/must be an ABSOLUTE path/);
  });

  test('a BARE agent bin — PATH is shared between instances', () => {
    expect(refusal(docWith({ agent: { driver: 'claude_code', bins: { claude_code: 'claude' } } }))).toMatch(
      /ABSOLUTE paths, never bare command names/,
    );
  });

  test('duplicate slugs', () => {
    expect(
      refusal(
        docWith({
          sites: [
            { slug: 'one', domain: 'a.example.org' },
            { slug: 'one', domain: 'b.example.org' },
          ],
        }),
      ),
    ).toMatch(/duplicate slug 'one'/);
  });

  test('duplicate domains', () => {
    expect(
      refusal(
        docWith({
          sites: [
            { slug: 'one', domain: 'a.example.org' },
            { slug: 'two', domain: 'a.example.org' },
          ],
        }),
      ),
    ).toMatch(/duplicate domain 'a.example.org'/);
  });

  test('a realm carrying a QUOTE or a NEWLINE — it is rendered inside quotes, as root', () => {
    const injection = 'x"; } location / { root /etc; } #';
    const withRealm = (realm: string) =>
      docWith({
        serving: {
          preprod: { enabled: true, auth: { mode: 'htpasswd', realm, users: [{ name: 'preview', password_file: '/etc/x/PREPROD_PASSWORD' }] } },
          prod: { tls: { mode: 'none' } },
        },
      });
    expect(refusal(withRealm(injection))).toMatch(/realm is rendered inside quotes/);
    expect(refusal(withRealm('two\nlines'))).toMatch(/realm is rendered inside quotes/);
    expect(refusal(withRealm('back\\slash'))).toMatch(/realm is rendered inside quotes/);
  });

  test('a description carrying a NEWLINE — it is rendered into every artifact header', () => {
    expect(refusal(docWith({ description: 'first\nsecond' }))).toMatch(/single line/);
  });

  test('an account_email that is not a plain address', () => {
    const withEmail = (account_email: string) =>
      docWith({
        serving: {
          preprod: { enabled: false, auth: { mode: 'none' } },
          prod: { tls: { mode: 'letsencrypt', account_email } },
        },
      });
    expect(refusal(withEmail('"ops"@example.org; rm -rf /'))).toMatch(/plain address/);
    expect(refusal(withEmail('ops@example.org\nX'))).toMatch(/plain address/);
    // …and the valid one is accepted, so the grammar is a grammar and not a wall.
    expect(layoutFrom(withEmail('ops@example.org')).serving.prod.tls.mode).toBe('letsencrypt');
  });

  test('a publication_api.url carrying a query, a fragment or a credential', () => {
    for (const url of [
      'https://data.example.org/v2?key=abc',
      'https://data.example.org/v2#frag',
      'https://user:pass@data.example.org/v2',
      'not-a-url',
    ]) {
      expect(refusal(docWith({ publication_api: { url } }))).toMatch(/plain http\(s\) BASE url/);
    }
  });

  test('an UNKNOWN key — a silently dropped `webspacebase` is the whole class of defect', () => {
    expect(refusal({ ...baseDoc(), webspacebase: '/srv/www' })).toMatch(/[Uu]nrecognized|[Uu]nknown/);
  });

  test('a workspace root inside a served tree', () => {
    expect(
      refusal(docWith({ webspace_base: '/srv/www', roots: { workspaces: '/srv/www/work' } })),
    ).toMatch(/never be inside a SERVED tree/);
  });

  test('a DERIVED root inside a served tree — the check the schema alone cannot make', () => {
    // Nothing declared here overlaps: the collision only exists once state_base has had
    // the instance name appended and the three roots hung off it. layout re-runs the
    // predicate over the derived paths for exactly this case.
    expect(() =>
      layoutFrom(docWith({ webspace_base: '/srv/www', paths: { state_base: '/srv/www/state' } })),
    ).toThrow(/overlaps the webspace base/);
  });

  test("the engine's private directory inside anything the service user owns", () => {
    expect(
      refusal(docWith({ engine: { private_dir: '/srv/www/private', group: 'dedalo-gate' }, webspace_base: '/srv/www' })),
    ).toMatch(/must lie OUTSIDE every site-builder root/);
  });

  test('a selected driver with no binary', () => {
    expect(refusal(docWith({ agent: { driver: 'pi', bins: { claude_code: '/usr/local/bin/claude' } } }))).toMatch(
      /no binary is declared for it/,
    );
  });

  test('a preprod surface enabled with htpasswd auth and nobody able to log in', () => {
    expect(
      refusal(
        docWith({
          serving: { preprod: { enabled: true, auth: { mode: 'htpasswd', users: [] } }, prod: { tls: { mode: 'none' } } },
        }),
      ),
    ).toMatch(/locks the museum out of its own drafts/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. The identity arithmetic
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the derived identity cannot exceed the Linux ceiling', () => {
  test('the longest LEGAL instance still fits, with the inequality asserted not assumed', () => {
    const longest = 'a'.repeat(MAX_INSTANCE_LENGTH);
    expect(INSTANCE_PATTERN.test(longest)).toBe(true);
    const layout = layoutFrom(docWith({ instance: longest }));
    expect(layout.identity.user.length).toBeLessThanOrEqual(MAX_USERNAME_LENGTH);
    expect(layout.identity.group.length).toBeLessThanOrEqual(MAX_USERNAME_LENGTH);
    // The relation, not a number: this stays true if the prefix ever changes.
    expect(USER_PREFIX.length + MAX_INSTANCE_LENGTH).toBeLessThanOrEqual(MAX_USERNAME_LENGTH);
  });

  test('one character longer is refused at the DECLARATION, not at useradd', () => {
    expect(refusal(docWith({ instance: 'a'.repeat(MAX_INSTANCE_LENGTH + 1) }))).toMatch(/user-name ceiling/);
  });

  test('an ADOPTED identity is held to the same ceiling the derived form gave for free', () => {
    expect(() =>
      layoutFrom(docWith({ identity: { user: 'x'.repeat(33), group: 'legacy' } })),
    ).toThrow();
    expect(() => layoutFrom(docWith({ identity: { user: 'Legacy', group: 'legacy' } }))).toThrow();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. MODES
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the mode matrix says who, not just how much', () => {
  test('the webspace and its release store are SETGID 2750', () => {
    // Compared as whole numbers on purpose. A silent 0o750 is the difference between a
    // museum's unpublished preprod tree being private and being readable by every uid on
    // the host — including another museum's service user — and between a published site
    // serving and 403-ing, because a release directory that did not inherit the web
    // group is unreadable to the web server.
    expect(MODES.webspace.mode).toBe(0o2750);
    expect(MODES.releases.mode).toBe(0o2750);
    // eslint-disable-next-line no-bitwise -- the setgid bit is the point of the assertion
    expect(MODES.webspace.mode & 0o2000).toBe(0o2000);
    expect(MODES.releases.mode & 0o2000).toBe(0o2000);
    expect(MODES.webspace.group).toBe('webGroup');
    expect(MODES.releases.group).toBe('webGroup');
    expect(MODES.webspace.owner).toBe('user');
  });

  test('the daemon can create a workspace, and cannot replace the root holding its roots', () => {
    expect(MODES.workspaces).toEqual({ owner: 'user', group: 'group', mode: 0o750 });
    expect(MODES.stateDir).toEqual({ owner: 'root', group: 'root', mode: 0o755 });
  });

  test('the audit trail is append-only by OWNERSHIP: root directory, daemon file', () => {
    expect(MODES.auditDir.owner).toBe('root');
    expect(MODES.auditFile.owner).toBe('user');
    expect(MODES.auditFile.mode).toBe(0o640);
  });

  test('the socket is group-owned by the ENGINE, so nothing has to join a group', () => {
    expect(MODES.socket).toEqual({ owner: 'user', group: 'engineGroup', mode: 0o660 });
  });

  test('credentials are root-only, and the config dir is traversable', () => {
    expect(MODES.secret).toEqual({ owner: 'root', group: 'root', mode: 0o600 });
    expect(MODES.secretsDir).toEqual({ owner: 'root', group: 'root', mode: 0o700 });
    expect(MODES.configDir).toEqual({ owner: 'root', group: 'root', mode: 0o755 });
  });

  test('every row is frozen and carries all three facts', () => {
    for (const [key, row] of Object.entries(MODES)) {
      expect({ key, frozen: Object.isFrozen(row) }).toEqual({ key, frozen: true });
      expect(typeof row.mode).toBe('number');
      expect(['root', 'user']).toContain(row.owner);
      expect(['root', 'group', 'webGroup', 'engineGroup']).toContain(row.group);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 7. One owner per grammar
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('nothing is spelled twice', () => {
  test('the schema declares no constant of its own — it imports layout’s', () => {
    const schema = readFileSync(join(PACKAGE_DIR, 'src', 'provision', 'schema.ts'), 'utf8');
    // The literals that were duplicated, each of which had two owners and disagreed.
    for (const literal of ["'dedalo-site-'", "'/home/www'", "'/var/lib/dedalo_sites'", "'/run/dedalo-sites'"]) {
      expect({ literal, found: schema.includes(literal) }).toEqual({ literal, found: false });
    }
    // And the grammars: a second `export const *_PATTERN =` here is a second owner. The
    // credential law is the one exception — nothing is DERIVED from it, so it describes
    // what a declaration may contain rather than what the host layout is.
    const declared = [...schema.matchAll(/^export const (\w*PATTERN)\s*=/gm)].map(m => m[1]);
    expect(declared).toEqual(['CREDENTIAL_NAME_PATTERN']);
  });

  test('layout stays zod-free, so a repo tripwire can render without node_modules', () => {
    const layout = readFileSync(join(PACKAGE_DIR, 'src', 'provision', 'layout.ts'), 'utf8');
    const imports = [...layout.matchAll(/^import[^;]*?from '([^']+)';/gms)].map(m => m[1]!);
    for (const specifier of imports) {
      const local = specifier.startsWith('node:') || specifier.startsWith('.');
      expect({ specifier, local }).toEqual({ specifier, local: true });
    }
    expect(imports).not.toContain('zod');
  });

});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 8. The document and the code are one system
 *
 * engineering/SITE_BUILDER_INSTANCES.md is the permanent definition, and under DEC-12 the
 * checkable parts of it are checked. These are the assertions that would have caught the
 * three specific defects the specification carried: an arithmetic claim that was wrong
 * about a constant's length, a mode matrix that disagreed with the code about ownership,
 * and a table of twenty exported functions that did not exist.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the specification and the code agree', () => {
  const spec = readFileSync(SPEC_PATH, 'utf8');

  /** The rows of the first markdown table whose header contains `marker`. */
  function tableRows(afterHeading: string, headerMarker: string): string[][] {
    const from = spec.indexOf(afterHeading);
    expect(from).toBeGreaterThan(-1);
    const lines = spec.slice(from).split('\n');
    const start = lines.findIndex(line => line.startsWith('|') && line.includes(headerMarker));
    expect(start).toBeGreaterThan(-1);
    const rows: string[][] = [];
    for (const line of lines.slice(start + 2)) {
      if (!line.startsWith('|')) break;
      rows.push(
        line
          .slice(1, line.endsWith('|') ? -1 : undefined)
          .split('|')
          .map(cell => cell.trim()),
      );
    }
    return rows;
  }

  test('§2.2 quotes the code’s instance grammar, byte for byte', () => {
    expect(spec).toContain(`INSTANCE_PATTERN = ${INSTANCE_PATTERN.source}`);
  });

  test('§2.2 quotes the UNCHANGED slug grammar', () => {
    expect(spec).toContain(SLUG_PATTERN.source);
  });

  test('§2.2 states the ceiling as an INEQUALITY and no arithmetic result as a literal', () => {
    // The rule the code asserts at module load, quoted rather than restated.
    expect(spec).toContain('USER_PREFIX.length + MAX_INSTANCE_LENGTH <= 32');
    // And the two forms the earlier prose got wrong — both were sums, and both were
    // unfalsifiable because a sentence carrying a subtraction cannot fail.
    for (const claim of ['13 + 19', '12 + 19', 'prefix is **13**', 'prefix is **12**']) {
      expect({ claim, present: spec.includes(claim) }).toEqual({ claim, present: false });
    }
  });

  test('§2.3 names only accessors that exist, and every one of them', () => {
    const layout = layoutFrom(readExample());
    const rows = tableRows('### 2.3 The derived layout', 'Accessor');
    expect(rows.length).toBeGreaterThan(20);

    const accessors: string[] = [];
    for (const row of rows) {
      const cell = row[1]!;
      const expr = cell.replace(/`/g, '').replace('[n]', '[0]');
      accessors.push(expr);
      // An accessor that does not exist evaluates to undefined; one that is misspelled
      // throws. Both are the failure this table used to be free to have.
      const value = new Function('layout', 'readWritePaths', `return ${expr};`)(layout, readWritePaths);
      expect({ expr, defined: value !== undefined }).toEqual({ expr, defined: true });
      if (typeof value === 'string') {
        expect({ expr, empty: value.length === 0 }).toEqual({ expr, empty: false });
      }
    }

    // The other direction: a property that starts being derived cannot stay undocumented.
    const documented = accessors.join('\n');
    for (const key of Object.keys(layout)) {
      expect({ key, documented: documented.includes(`layout.${key}`) }).toEqual({ key, documented: true });
    }
  });

  test('§3’s matrix is MODES, row for row and in both directions', () => {
    const OWNER: Record<string, string> = { root: 'root', SU: 'user' };
    const GROUP: Record<string, string> = { root: 'root', SG: 'group', WG: 'webGroup', EG: 'engineGroup' };

    const rows = tableRows('## 3. The uid / gid / mode matrix', '`MODES` key');
    const seen = new Set<string>();
    for (const row of rows) {
      const key = row[1]!.replace(/[`*]/g, '');
      // The symlink row names no MODES key: a symlink carries no mode of its own.
      if (key.startsWith('(') || key.startsWith('*(')) continue;
      expect({ key, known: key in MODES }).toEqual({ key, known: true });
      expect({ key, twice: seen.has(key) }).toEqual({ key, twice: false });
      seen.add(key);

      const expected = MODES[key as keyof typeof MODES];
      const owner = OWNER[row[2]!.replace(/[`*]/g, '')];
      const group = GROUP[row[3]!.replace(/[`*]/g, '')];
      const mode = parseInt(row[4]!.replace(/[`*]/g, ''), 8);
      expect({ key, owner, group, mode }).toEqual({
        key,
        owner: expected.owner,
        group: expected.group,
        mode: expected.mode,
      });
    }

    // A MODES key with no row is drift too: a mode nobody documented is a mode nobody
    // reviewed.
    expect([...seen].sort()).toEqual(Object.keys(MODES).sort());
  });

  test('§3 no longer asks the engine user to JOIN a group — nothing joins anything', () => {
    expect(spec).not.toContain('the ENGINE user joins');
    expect(spec).toContain('NOTHING JOINS ANYTHING');
  });

  test('the specification names no path under the internal process directory', () => {
    // The repo-wide law: the internal process directory is gitignored, so no gate, script
    // or permanent definition may read a path under it. The pattern demands a real path
    // SEGMENT after the slash, not the bare directory name and not a placeholder — the
    // document names the directory twice, only to state what does NOT live there, and a
    // looser match would redden on the two sentences that document the rule.
    const offenders = [...spec.matchAll(/rewrite\/[A-Za-z0-9_.-]+/g)].map(m => m[0]);
    expect(offenders).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 9. The committed example is a real declaration
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('deploy/examples/instance.example.json', () => {
  test('is generic — never a real museum’s name, the same law as the engine’s `test` TLD', () => {
    const doc = readExample();
    expect(doc.instance).toBe('example');
    const text = readFileSync(EXAMPLE_PATH, 'utf8');
    for (const real of ['numisdata', 'monedaiberica', 'mdcat', 'museum-a']) {
      expect({ real, present: text.includes(real) }).toEqual({ real, present: false });
    }
  });

  test('exercises the override surface it exists to demonstrate', () => {
    const layout = layoutFrom(readExample());
    // A non-default root…
    expect(layout.roots.audit).toBe('/srv/dedalo_audit/example');
    expect(layout.webspaceBase).toBe('/srv/www');
    // …an explicit webspace outside the base…
    expect(layout.sites[1]!.webspace).toBe('/srv/legacy-www/archive-example');
    expect(isWithin(layout.webspaceBase, layout.sites[1]!.webspace)).toBe(false);
    // …and two sites on different domains.
    expect(layout.sites.map(site => site.domain)).toEqual(['www.example.org', 'archive.example.net']);
    // All of which the unit still confines.
    for (const path of [layout.roots.audit, ...layout.sites.map(site => site.webspace)]) {
      expect(isWritablePath(layout, path)).toBe(true);
    }
  });

  test('carries no credential VALUE, only paths', () => {
    const layout = layoutFrom(readExample());
    for (const value of Object.values(layout.secrets)) expect(value.startsWith('/')).toBe(true);
    expect(layout.envVars.PUBLICATION_API_KEY_FILE?.startsWith('/')).toBe(true);
  });
});

/**
 * The type-level half of the contract. It compiles or it does not — which is the point:
 * `parseManifest` returns exactly what `derive` accepts, and the compiler says so on every
 * build rather than a reader noticing on a good day.
 */
const _composes: (doc: unknown) => ReturnType<typeof derive> = doc => derive(parseManifest(doc));
const _manifestIsShared: (m: InstanceManifest) => InstanceManifest = m => m;
void _composes;
void _manifestIsShared;

/* ────────────────────────────────────────────────────────────────────────────────────
 * The writable set, on its own terms.
 *
 * readWritePaths() becomes ReadWritePaths= — the exact list of places ProtectSystem=strict
 * lets this museum's daemon, and every agent turn it runs, write. Checking roots against
 * webspaces does not catch a webspace that IS the shared base, two sites that overlap, or
 * a control path that lands inside the writable set. Each of the three was accepted by an
 * earlier revision of derive().
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the writable set is sane on its own terms', () => {
  test('a site may not claim the shared webspace base as its own webspace', () => {
    // Accepted once. The unit then carried ReadWritePaths=/home/www and this museum's
    // agent could write every other museum's served tree.
    expect(() =>
      derive(
        parseManifest(
          docWith({
            sites: [{ slug: 'coleccion', domain: 'www.example.org', webspace: '/home/www' }],
          }),
        ),
      ),
    ).toThrow(/webspace base/);
  });

  test('nor a parent of the base', () => {
    expect(() =>
      derive(
        parseManifest(
          docWith({
            sites: [{ slug: 'coleccion', domain: 'www.example.org', webspace: '/home' }],
          }),
        ),
      ),
    ).toThrow(/webspace base/);
  });

  /**
   * These two call derive() DIRECTLY on a hand-built manifest rather than through
   * parseManifest, on purpose. The schema refuses most overlaps over the paths a museum
   * WROTE DOWN, so routing these through it would assert the schema and leave derive()'s
   * own containment loop uncovered — which is exactly what an earlier revision of this
   * file did. derive() is a second entry point in its own right: `provision adopt` builds
   * a manifest from what is already on disk and derives from it without a declaration
   * ever existing, so the last check before a path becomes ReadWritePaths= must hold on
   * its own.
   */
  test('two sites may not resolve to overlapping webspaces (derive, unmediated)', () => {
    expect(() =>
      derive({
        ...baseDoc(),
        sites: [
          { slug: 'one', domain: 'a.example.org', webspace: '/home/www/shared' },
          { slug: 'two', domain: 'b.example.org', webspace: '/home/www/shared/inner' },
        ],
      } as never),
    ).toThrow(/overlaps/);
  });

  test('the agent HOME may not sit inside the workspaces root (derive, unmediated)', () => {
    // ~/.claude — the vendor CLI's cached credentials and session state — inside the git
    // repo the agent commits from is a credential one `git add -A` away from a release.
    expect(() =>
      derive({
        ...baseDoc(),
        roots: { workspaces: '/srv/ws', home: '/srv/ws/home' },
      } as never),
    ).toThrow(/overlaps/);
  });

  test('the config dir may not land inside a writable root', () => {
    // The fatal one: configDir inside roots.workspaces puts secrets/ under
    // ReadWritePaths, so the daemon can read the credentials LoadCredential exists to
    // keep out of its reach.
    expect(() =>
      derive(
        parseManifest(
          docWith({
            roots: { workspaces: '/opt/ws' },
            paths: { config_base: '/opt/ws/cfg' },
          }),
        ),
      ),
    ).toThrow(/secret|config/i);
  });

  test('and the secrets dir is never a writable path, however the declaration is spread', () => {
    const layout = derive(
      parseManifest(docWith({ roots: { workspaces: '/srv/ws' }, paths: { state_base: '/srv/state' } })),
    );
    for (const writable of readWritePaths(layout)) {
      expect(isWithin(writable, layout.secretsDir)).toBe(false);
      expect(isWithin(writable, layout.configDir)).toBe(false);
    }
  });

  test('the runtime directory is pinned under /run and has no override surface', () => {
    // systemd resolves RuntimeDirectory= under /run only. A `paths.runtime_base` knob
    // could only ever diverge from the unit that creates the directory, so it does not
    // exist — and strictObject refuses it rather than ignoring it.
    expect(() => parseManifest(docWith({ paths: { runtime_base: '/srv/run' } }))).toThrow();
    const layout = derive(parseManifest(docWith({ paths: { state_base: '/srv/state' } })));
    expect(layout.runtimeDir.startsWith('/run/')).toBe(true);
    expect(layout.socketPath.startsWith(layout.runtimeDir)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The filesystem root is a path like any other.
 *
 * `pathsOverlap` is the single predicate every containment check in this subsystem is
 * built on. It compared `parent + '/'`, which for `/` asks whether a path begins with
 * `//` — nothing does. So `/` overlapped NOTHING and a declaration naming it as a root or
 * a webspace passed every guard while in fact containing all of them.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('containment holds at the filesystem root', () => {
  test('/ overlaps everything', () => {
    expect(pathsOverlap('/', '/home/www')).toBe(true);
    expect(pathsOverlap('/home/www', '/')).toBe(true);
    expect(pathsOverlap('/', '/')).toBe(true);
  });

  test('/ strictly contains any absolute path, and nothing strictly contains /', () => {
    expect(isStrictlyWithin('/home/www', '/')).toBe(true);
    expect(isStrictlyWithin('/', '/')).toBe(false);
    expect(isStrictlyWithin('/', '/home')).toBe(false);
  });

  test('a sibling prefix is still not containment', () => {
    // The other direction the naive form got right and a careless fix breaks.
    expect(pathsOverlap('/home/www', '/home/www2')).toBe(false);
    expect(isStrictlyWithin('/home/www2', '/home/www')).toBe(false);
  });

  test('derive() refuses / as a root, now that the predicate can see it', () => {
    expect(() => derive({ ...baseDoc(), roots: { workspaces: '/' } } as never)).toThrow();
  });

  test('and refuses / as a site webspace', () => {
    expect(() =>
      derive({
        ...baseDoc(),
        sites: [{ slug: 'one', domain: 'a.example.org', webspace: '/' }],
      } as never),
    ).toThrow();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The preprod password file is never inside a served tree.
 *
 * The dotfile guard only saves a file whose NAME begins with a dot, and an adopted layout
 * may pin the htpasswd anywhere. A password file under a document root is served over HTTP.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the preprod credential is not servable', () => {
  test('an htpasswd inside a site webspace is refused', () => {
    expect(() =>
      derive({
        ...baseDoc(),
        sites: [{ slug: 'one', domain: 'a.example.org', webspace: '/home/www/a' }],
        serving: {
          preprod: {
            enabled: true,
            auth: {
              mode: 'htpasswd',
              htpasswd: '/home/www/a/preprod.htpasswd',
              users: [{ name: 'preview', password_file: '/etc/x/P' }],
            },
          },
          prod: { tls: { mode: 'none' } },
        },
      } as never),
    ).toThrow(/serve it over HTTP/);
  });

  test('the derived default lives under the instance config directory, outside every webspace', () => {
    const layout = derive(parseManifest(readExample()));
    expect(isWithin(layout.configDir, layout.htpasswd)).toBe(true);
    for (const site of layout.sites) {
      expect(pathsOverlap(layout.htpasswd, site.webspace)).toBe(false);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The service group is the instance's own, and nobody else's.
 *
 * The service user gets this group as its PRIMARY group (useradd --gid), and an agent turn
 * runs as that user executing arbitrary generated code. Declaring the host's web group here
 * puts every museum's webspace — 2750 <user>:<webGroup>, group-readable and -writable so the
 * web server can serve it — inside this instance's reach. Both spellings were accepted.
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the service group cannot be borrowed from the host', () => {
  test('it may not be the web server group', () => {
    expect(() =>
      derive({
        ...baseDoc(),
        web: { server: 'nginx', group: 'www-data' },
        identity: { user: 'usr-a', group: 'www-data' },
      } as never),
    ).toThrow(/also web\.group/);
  });

  test('nor the paired engine group', () => {
    expect(() =>
      derive({
        ...baseDoc(),
        engine: { private_dir: '/srv/dedalo/gate/private', group: 'dedalo-gate' },
        identity: { user: 'usr-a', group: 'dedalo-gate' },
      } as never),
    ).toThrow(/also engine\.group/);
  });

  test('an instance-owned group is accepted', () => {
    const layout = derive({ ...baseDoc(), identity: { user: 'usr-a', group: 'grp-a' } } as never);
    expect(layout.identity.group).toBe('grp-a');
    expect(layout.identity.group).not.toBe(layout.identity.webGroup);
    expect(layout.identity.group).not.toBe(layout.identity.engineGroup);
  });
});
