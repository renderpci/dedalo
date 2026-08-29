/**
 * THE UNIT RENDERER'S GATE — the guarantees, never the formatting.
 *
 * `src/provision/render/unit.ts` replaces two files that stated the same facts and
 * disagreed: `install.sh` hardcoded the service identity, `deploy/dedalo-site-builder.service`
 * hardcoded it AGAIN, and the unit's `ReadWritePaths=` named two roots that did not follow
 * the installer's overrides — a clean install, and EROFS on a museum's site the first time
 * it published. So this file asserts PROPERTIES of the rendered text, not its shape: that
 * the identity is the layout's, that the writable set is exactly `readWritePaths()`, that a
 * credential value cannot appear, and that no string from a declaration can escape the
 * directive it lands in. A test that pinned the byte layout would go red on every comment
 * improvement and green on every one of the defects above.
 *
 * The injection tests deliberately bend a DERIVED layout rather than a declaration. The
 * schema refuses most of these strings, but `derive()` is a second entry point (a
 * `provision adopt` builds a manifest from what is on disk, validated by nothing) and —
 * sharper — `derive()` passes `resources` through UNVALIDATED, so a `memory_max` carrying a
 * newline reaches a root-installed unit having been checked by exactly one file that this
 * path does not go through. Bending the layout is how those tests ask the renderer, and not
 * the schema, the question.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InstanceLayout, InstanceManifest } from '../src/provision/layout';
import { MODES, derive, isWritablePath, readWritePaths } from '../src/provision/layout';
import { parseManifest } from '../src/provision/schema';
import { unitRenderer } from '../src/provision/render/unit';

/* ────────────────────────────────────────────────────────────────────────────────────
 * Fixtures
 * ──────────────────────────────────────────────────────────────────────────────────── */

const PACKAGE_DIR = join(import.meta.dir, '..');
const EXAMPLE_PATH = join(PACKAGE_DIR, 'deploy', 'examples', 'instance.example.json');

/** The smallest declaration that parses — the same shape tests/provision.test.ts uses. */
function baseDoc(): Record<string, any> {
  return {
    instance: 'gate',
    engine: { private_dir: '/srv/dedalo/gate/private', group: 'dedalo-gate' },
    web: { server: 'nginx', group: 'www-data' },
    publication_api: { url: 'http://127.0.0.1:3100/publication/server_api/v2' },
    sites: [{ slug: 'one', domain: 'one.example.org' }],
    serving: {
      preprod: {
        enabled: true,
        auth: { mode: 'htpasswd', users: [{ name: 'preview', password_file: '/etc/x/PREPROD_PASSWORD' }] },
      },
      prod: { tls: { mode: 'none' } },
    },
    agent: { driver: 'claude_code', bins: { claude_code: '/usr/local/bin/claude' } },
  };
}

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

function manifestFrom(doc: unknown): InstanceManifest {
  return parseManifest(doc, { source: 'the unit gate' });
}

/** Parse → derive → render, the only composition the provisioner ever performs. */
function renderFrom(doc: unknown) {
  const manifest = manifestFrom(doc);
  const layout = derive(manifest);
  const artifacts = unitRenderer.render(layout, manifest);
  return { manifest, layout, artifacts, body: artifacts[0]!.body };
}

function bodyOf(doc: unknown): string {
  return renderFrom(doc).body;
}

/**
 * Render from a layout that has been BENT past the schema — the only way to ask this
 * renderer whether it defends itself, rather than asking the grammar upstream of it.
 */
function renderBent(doc: Record<string, any>, bend: Partial<Record<string, unknown>>): () => unknown {
  const manifest = manifestFrom(doc);
  const layout = { ...derive(manifest), ...bend } as unknown as InstanceLayout;
  return () => unitRenderer.render(layout, manifest);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * Reading a unit file the way systemd does
 * ──────────────────────────────────────────────────────────────────────────────────── */

interface Directive {
  readonly section: string;
  readonly key: string;
  readonly value: string;
}

/** Every KEY=VALUE line, with the section it is in. Comments (the stamp included) drop. */
function directivesOf(body: string): Directive[] {
  const out: Directive[] = [];
  let section = '';
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      continue;
    }
    const eq = line.indexOf('=');
    expect(eq).toBeGreaterThan(0);
    out.push({ section, key: line.slice(0, eq), value: line.slice(eq + 1) });
  }
  return out;
}

function valuesOf(body: string, key: string): string[] {
  return directivesOf(body)
    .filter(directive => directive.key === key)
    .map(directive => directive.value);
}

function valueOf(body: string, key: string): string {
  const values = valuesOf(body, key);
  expect(values).toHaveLength(1);
  return values[0]!;
}

/** systemd's octal spelling, computed in the TEST from the matrix — never a typed number. */
function octal(mode: number): string {
  return `0${(mode & 0o7777).toString(8).padStart(3, '0')}`;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. The artifact itself
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the artifact', () => {
  test('one unit per instance, at the derived path, with the matrix row that says so', () => {
    const { layout, artifacts } = renderFrom(baseDoc());
    expect(artifacts).toHaveLength(1);
    const unit = artifacts[0]!;
    expect(unit.kind).toBe('unit');
    expect(unit.path).toBe(layout.unitPath);
    // The mode is NOT asserted as a number: it is asserted to be the row of the matrix
    // the renderer claimed, so a change to §3 moves the expectation with it.
    expect(unit.modeKey).toBe('hostConfig');
    expect(unit.mode).toBe(MODES.hostConfig.mode);
    expect(unit.owner).toBe('root');
    expect(unit.group).toBe('root');
  });

  test('the committed example renders', () => {
    // The example is the reference declaration; a renderer it cannot render is a reference
    // nobody can follow.
    const doc = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
    expect(bodyOf(doc)).toContain('[Service]');
  });

  test('the file is stamped, and the stamp is the first line', () => {
    const body = bodyOf(baseDoc());
    expect(body.split('\n')[0]).toMatch(/^# dedalo-provision: gate unit [0-9a-f]{64}$/);
    expect(body.endsWith('\n')).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. Defect 1 — the identity, stated once
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the identity comes from the layout', () => {
  test('User= and Group= are the derived identity, exactly once each', () => {
    const { layout, body } = renderFrom(baseDoc());
    expect(valueOf(body, 'User')).toBe(layout.identity.user);
    expect(valueOf(body, 'Group')).toBe(layout.identity.group);
  });

  test('an ADOPTED identity moves both, and the derived name appears nowhere', () => {
    const doc = docWith({ identity: { user: 'museum-svc', group: 'museum-grp' } });
    const { layout, body } = renderFrom(doc);
    expect(layout.identity.adopted).toBe(true);
    expect(valueOf(body, 'User')).toBe('museum-svc');
    expect(valueOf(body, 'Group')).toBe('museum-grp');
    // The whole defect was an identity that could be overridden in one file and not the
    // other; the derived spelling must not survive anywhere in the rendered unit.
    expect(body).not.toContain('dedalo-site-gate');
  });

  test('none of the deleted unit’s hardcoded facts survive', () => {
    const body = bodyOf(baseDoc());
    for (const literal of ['User=dedalo-sites', 'Group=dedalo-sites', '/var/www/dedalo_sites']) {
      expect(body).not.toContain(literal);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 3. Defect 2 — the writable set follows the roots
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('ReadWritePaths= is readWritePaths(layout)', () => {
  test('one entry per line, in the layout’s order, and nothing else', () => {
    const { layout, body } = renderFrom(baseDoc());
    expect(valuesOf(body, 'ReadWritePaths')).toEqual(readWritePaths(layout));
  });

  test('every root the daemon writes is covered, wherever an override put it', () => {
    // Two overrides at once — a moved audit root and a site whose webspace is outside the
    // shared base — because that is the exact shape the deleted unit got wrong: the
    // install succeeded and the daemon hit a read-only filesystem at publish time.
    const doc = docWith({
      paths: { state_base: '/srv/state' },
      roots: { audit: '/srv/audit/gate' },
      webspace_base: '/srv/www',
      sites: [
        { slug: 'one', domain: 'one.example.org' },
        { slug: 'two', domain: 'two.example.org', webspace: '/srv/legacy/two' },
      ],
    });
    const { layout, body } = renderFrom(doc);
    const declared = valuesOf(body, 'ReadWritePaths');

    for (const path of [
      layout.roots.workspaces,
      layout.roots.home,
      layout.roots.audit,
      layout.runtimeDir,
      ...layout.sites.map(site => site.webspace),
    ]) {
      expect(declared).toContain(path);
      // Asked the way the provisioner asks it, so "the unit permits this write" and "the
      // daemon permits this write" stay one question with one answer.
      expect(isWritablePath(layout, join(path, 'a-file'))).toBe(true);
    }
    expect(declared).toContain('/srv/legacy/two');
    expect(declared).toContain('/srv/audit/gate');
  });

  test('the control paths are NOT writable — the daemon cannot rewrite its own config', () => {
    const { layout, body } = renderFrom(baseDoc());
    const declared = valuesOf(body, 'ReadWritePaths');
    for (const control of [layout.configDir, layout.secretsDir, layout.envFile, layout.stateDir]) {
      expect(declared).not.toContain(control);
      expect(isWritablePath(layout, control)).toBe(false);
    }
  });

  test('adding a site adds its webspace', () => {
    const one = valuesOf(bodyOf(baseDoc()), 'ReadWritePaths');
    const two = valuesOf(
      bodyOf(
        docWith({
          sites: [
            { slug: 'one', domain: 'one.example.org' },
            { slug: 'two', domain: 'two.example.org' },
          ],
        }),
      ),
      'ReadWritePaths',
    );
    expect(two.length).toBe(one.length + 1);
    expect(two).toContain('/home/www/two.example.org');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 4. No secret, ever
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('credentials reach the process only through LoadCredential=', () => {
  const withSecrets = () =>
    docWith({
      secrets: {
        ANTHROPIC_API_KEY: '/etc/dedalo_sites/instances/gate/secrets/ANTHROPIC_API_KEY',
        OPENAI_API_KEY: '/etc/dedalo_sites/instances/gate/secrets/OPENAI_API_KEY',
      },
    });

  test('one LoadCredential per declared secret, key:path, sorted', () => {
    const { layout, body } = renderFrom(withSecrets());
    expect(valuesOf(body, 'LoadCredential')).toEqual([
      `ANTHROPIC_API_KEY:${layout.secrets.ANTHROPIC_API_KEY}`,
      `OPENAI_API_KEY:${layout.secrets.OPENAI_API_KEY}`,
    ]);
  });

  test('a declared key appears ONLY inside a LoadCredential directive', () => {
    const body = bodyOf(withSecrets());
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
      for (const directive of directivesOf(body)) {
        if (directive.value.includes(key) || directive.key.includes(key)) {
          expect(directive.key).toBe('LoadCredential');
        }
      }
    }
  });

  test('the only Environment= is the instance name, and SetCredential= never appears', () => {
    const body = bodyOf(withSecrets());
    // Environment= is where a provider key would end up if anyone ever "simplified" this
    // renderer, and it is world-readable through /proc/<pid>/environ. SetCredential=
    // embeds a literal VALUE in the unit file and is the same defect wearing systemd's
    // own credential vocabulary.
    expect(valuesOf(body, 'Environment')).toEqual(['DEDALO_SITE_INSTANCE=gate']);
    expect(valuesOf(body, 'SetCredential')).toEqual([]);
    expect(valuesOf(body, 'PassEnvironment')).toEqual([]);
  });

  test('the env file is named, and it is the rendered one', () => {
    const { layout, body } = renderFrom(baseDoc());
    expect(valueOf(body, 'EnvironmentFile')).toBe(layout.envFile);
  });

  test('a credential path carrying the directive’s own separator is refused', () => {
    // LoadCredential= splits on the FIRST colon; a path holding one would silently load a
    // different file, or none.
    const manifest = manifestFrom(baseDoc());
    const layout = derive(manifest);
    const bent = { ...layout, secrets: { KEY: '/etc/secrets/a:b' } } as unknown as InstanceLayout;
    expect(() => unitRenderer.render(bent, manifest)).toThrow(/colon/i);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 5. Nothing escapes its directive
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('no declared string can escape the directive it lands in', () => {
  test('a newline in the description is refused, not truncated', () => {
    // Refused twice over — by layout's DESCRIPTION_PATTERN, re-checked here, and by the
    // free-text escaper behind it. Which one speaks is not the guarantee; that the second
    // line of a description can never become the first line of a directive is.
    expect(renderBent(baseDoc(), { description: 'ok\nExecStartPre=/bin/rm -rf /' })).toThrow(
      /description[\s\S]*Nothing was rendered/,
    );
    // The escaper on its own, reached through a value no grammar upstream constrains.
    expect(renderBent(baseDoc(), { instance: 'gate\nExecStartPre=/bin/sh' })).toThrow(
      /control character or newline/,
    );
  });

  test('a newline in a rendered PATH is refused', () => {
    expect(renderBent(baseDoc(), { envFile: '/etc/x/env\nExecStartPre=/bin/sh -c evil' })).toThrow(
      /whitespace|absolute/,
    );
    expect(renderBent(baseDoc(), { manifestPath: '/etc/x/a b.json' })).toThrow(/whitespace/);
  });

  test('a resources value is checked HERE — derive() never looks at it', () => {
    // The load-bearing one. `derive()` copies `resources` through untouched, so the schema
    // is the only thing that has ever read these strings, and `provision adopt` does not
    // go through the schema. Without this check the line below is a root-installed unit
    // that runs a command of the declaration author's choosing before the daemon starts.
    const manifest = manifestFrom(baseDoc());
    const layout = derive(manifest);
    const evil = { ...layout, resources: { memory_max: '4G\nExecStartPre=/bin/sh -c evil' } };
    expect(() => unitRenderer.render(evil as unknown as InstanceLayout, manifest)).toThrow(
      /does not match/,
    );

    for (const resources of [
      { cpu_quota: '150' },
      { memory_high: '4 G' },
      { tasks_max: 0 },
      { tasks_max: 1.5 },
      { tasks_max: '64' },
    ]) {
      expect(() =>
        unitRenderer.render({ ...layout, resources } as unknown as InstanceLayout, manifest),
      ).toThrow();
    }
  });

  test('a declared resource cap that IS well formed is rendered', () => {
    const body = bodyOf(
      docWith({ resources: { memory_max: '4G', memory_high: '3G', cpu_quota: '150%', tasks_max: 512 } }),
    );
    expect(valueOf(body, 'MemoryHigh')).toBe('3G');
    expect(valueOf(body, 'MemoryMax')).toBe('4G');
    expect(valueOf(body, 'CPUQuota')).toBe('150%');
    expect(valueOf(body, 'TasksMax')).toBe('512');
  });

  test('an identity that is not a unix name is refused', () => {
    expect(renderBent(baseDoc(), { identity: { user: 'root x', group: 'g', webGroup: 'w', engineGroup: 'e' } })).toThrow(
      /does not match/,
    );
  });

  test('% is escaped — systemd expands specifiers, and a museum may write "100%"', () => {
    const body = bodyOf(docWith({ description: '100% of the collection' }));
    // Rendered as %%, which systemd reads back as one literal '%'. Unescaped, '%o' and
    // friends would expand into the museum's own header.
    expect(body).toContain('100%% of the collection');
    expect(body).not.toContain('100% of');
  });

  test('an absolute RuntimeDirectory= is refused', () => {
    // systemd resolves RuntimeDirectory= under /run and refuses a leading slash; the
    // failure would otherwise be a unit that will not start, naming a path nobody wrote.
    expect(renderBent(baseDoc(), { runtimeDirectory: '/run/dedalo-sites/gate' })).toThrow(/relative/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 6. Confinement, supervision, and the journal
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the unit confines and supervises the daemon', () => {
  test('the hardening the daemon’s threat model requires', () => {
    const body = bodyOf(baseDoc());
    expect(valueOf(body, 'NoNewPrivileges')).toBe('yes');
    expect(valueOf(body, 'ProtectSystem')).toBe('strict');
    expect(valueOf(body, 'ProtectHome')).toBe('yes');
    expect(valueOf(body, 'PrivateTmp')).toBe('yes');
  });

  test('UMask and RuntimeDirectoryMode come from the ownership matrix', () => {
    const body = bodyOf(baseDoc());
    // Computed here from MODES, so a change to §3's webspace row moves the unit and this
    // expectation together — and a renderer that typed 0027 by hand goes red.
    expect(valueOf(body, 'UMask')).toBe(octal(0o777 & ~(MODES.webspace.mode & 0o777)));
    expect(valueOf(body, 'RuntimeDirectoryMode')).toBe(octal(MODES.runtimeDir.mode));
  });

  test('RuntimeDirectory= is the layout’s, and relative to /run', () => {
    const { layout, body } = renderFrom(baseDoc());
    const value = valueOf(body, 'RuntimeDirectory');
    expect(value).toBe(layout.runtimeDirectory);
    expect(value.startsWith('/')).toBe(false);
    expect(layout.runtimeDir.endsWith(value)).toBe(true);
  });

  test('the engine’s supervision decisions are inherited, not reinvented', () => {
    const body = bodyOf(baseDoc());
    expect(valueOf(body, 'Restart')).toBe('always');
    expect(valueOf(body, 'RestartSec')).toBe('3');
    expect(valueOf(body, 'KillSignal')).toBe('SIGTERM');
    expect(Number(valueOf(body, 'TimeoutStopSec'))).toBeGreaterThanOrEqual(30);
    // The crash-loop budget: 5 starts per 5 minutes, never systemd's 5-per-10s default,
    // which a RestartSec=3 cadence trips on a planned restart.
    expect(valueOf(body, 'StartLimitIntervalSec')).toBe('300');
    expect(valueOf(body, 'StartLimitBurst')).toBe('5');
  });

  test('the [Unit]-only directives are in [Unit] — where systemd reads them', () => {
    // A misfiled StartLimitIntervalSec= is not an error: systemd warns and IGNORES it, so
    // the crash-loop budget silently reverts to the default this unit exists to widen.
    // The same is true of Assert*, which would stop guarding the ExecStart path at all.
    const byKey = new Map(directivesOf(bodyOf(baseDoc())).map(d => [d.key, d.section]));
    for (const key of [
      'Description',
      'Documentation',
      'After',
      'StartLimitIntervalSec',
      'StartLimitBurst',
      'AssertPathIsDirectory',
      'AssertFileIsExecutable',
    ]) {
      expect(byKey.get(key)).toBe('Unit');
    }
    for (const key of ['User', 'Group', 'ExecStart', 'ReadWritePaths', 'LoadCredential', 'UMask']) {
      expect(byKey.get(key) ?? 'Service').toBe('Service');
    }
    expect(byKey.get('WantedBy')).toBe('Install');
  });

  test('the journal identity is per INSTANCE, and the rate limit is per unit', () => {
    const mine = valueOf(bodyOf(baseDoc()), 'SyslogIdentifier');
    const other = valueOf(bodyOf(docWith({ instance: 'other' })), 'SyslogIdentifier');
    expect(mine).toContain('gate');
    expect(mine).not.toBe(other);
    // Per-unit, so one chatty museum spends its OWN budget instead of evicting another
    // museum's audit lines from a shared one.
    expect(Number(valuesOf(bodyOf(baseDoc()), 'LogRateLimitBurst')[0])).toBeGreaterThan(0);
    expect(valuesOf(bodyOf(baseDoc()), 'LogRateLimitIntervalSec')).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 7. The daemon's own code and runtime
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('WorkingDirectory= and ExecStart=', () => {
  test('both are absolute, and the entry point is the daemon’s', () => {
    const body = bodyOf(baseDoc());
    expect(valueOf(body, 'WorkingDirectory').startsWith('/')).toBe(true);
    const exec = valueOf(body, 'ExecStart');
    expect(exec.startsWith('/')).toBe(true);
    expect(exec.endsWith(' run src/index.ts')).toBe(true);
    // The PINNED binary, never a floating `bun` on PATH: a stray `bun upgrade` must not be
    // able to change a museum's production runtime.
    expect(exec.split(' ')[0]).not.toBe('bun');
  });

  test('a declaration that states the tree and the runtime is honoured', () => {
    // The two fields the grammar owes this renderer. Built by hand, because the schema
    // does not accept them yet — the day it does, this test stops being the only caller.
    const manifest = manifestFrom(baseDoc());
    const declared = {
      ...manifest,
      engine: { ...manifest.engine, checkout_dir: '/opt/museum/code', bun_bin: '/opt/museum/bun' },
    } as unknown as InstanceManifest;
    const body = unitRenderer.render(derive(declared), declared)[0]!.body;
    expect(valueOf(body, 'WorkingDirectory')).toBe('/opt/museum/code/publication/site_builder');
    expect(valueOf(body, 'ExecStart')).toBe('/opt/museum/bun run src/index.ts');
    expect(valueOf(body, 'AssertFileIsExecutable')).toBe('/opt/museum/bun');
    expect(body).not.toContain('INFERRED');
  });

  test('half a declaration is refused', () => {
    const manifest = manifestFrom(baseDoc());
    const half = {
      ...manifest,
      engine: { ...manifest.engine, checkout_dir: '/opt/museum/code' },
    } as unknown as InstanceManifest;
    expect(() => unitRenderer.render(derive(half), half)).toThrow(/only one of/);
  });

  test('the daemon may NOT write its own code or runtime', () => {
    // Every agent turn runs as the service user with this writable set. A checkout inside
    // one of those roots means a generated build script can rewrite the daemon, and the
    // next restart executes it.
    const manifest = manifestFrom(baseDoc());
    const declared = {
      ...manifest,
      engine: { ...manifest.engine, checkout_dir: '/opt/museum/code', bun_bin: '/opt/museum/bun' },
    } as unknown as InstanceManifest;
    const layout = derive(declared);
    for (const bend of [
      { roots: { ...layout.roots, workspaces: '/opt/museum/code' } },
      { roots: { ...layout.roots, workspaces: '/opt/museum/code/publication' } },
      { roots: { ...layout.roots, home: '/opt/museum' } },
    ]) {
      expect(() =>
        unitRenderer.render({ ...layout, ...bend } as unknown as InstanceLayout, declared),
      ).toThrow(/overlaps the writable path/);
    }
  });

  test('the rendered tree is outside the rendered writable set', () => {
    const { layout, body } = renderFrom(baseDoc());
    expect(isWritablePath(layout, valueOf(body, 'WorkingDirectory'))).toBe(false);
    expect(isWritablePath(layout, valueOf(body, 'ExecStart').split(' ')[0]!)).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 8. Purity — the provisioner writes only on drift
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the same declaration renders the same bytes', () => {
  test('twice in a row', () => {
    expect(bodyOf(baseDoc())).toBe(bodyOf(baseDoc()));
  });

  test('re-ordering the sites in instance.json changes nothing', () => {
    // Not tidiness: the provisioner writes only on drift, so an unstable rendering
    // rewrites a museum's live unit on every run and buries the real change in noise.
    const forwards = docWith({
      sites: [
        { slug: 'one', domain: 'one.example.org' },
        { slug: 'two', domain: 'two.example.org' },
      ],
    });
    const backwards = docWith({
      sites: [
        { slug: 'two', domain: 'two.example.org' },
        { slug: 'one', domain: 'one.example.org' },
      ],
    });
    expect(bodyOf(backwards)).toBe(bodyOf(forwards));
  });

  test('re-ordering the secrets changes nothing', () => {
    const a = docWith({ secrets: { A_KEY: '/etc/s/A_KEY', B_KEY: '/etc/s/B_KEY' } });
    const b = docWith({ secrets: { B_KEY: '/etc/s/B_KEY', A_KEY: '/etc/s/A_KEY' } });
    expect(bodyOf(b)).toBe(bodyOf(a));
  });
});
