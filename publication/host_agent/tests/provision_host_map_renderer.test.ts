/**
 * ROOT'S HOST-MAP RENDERER COPY (src/provision/host_map_renderer.ts, render/host_map_unit.ts) —
 * what `provision apply` copies into HOST_MAP_RENDERER_DIR, the never-downgrade rule, and the
 * oneshot unit that runs it.
 *
 * THE CLOSURE GATE: the copy is exactly the files src/rules/host_map_main.ts reaches through
 * VALUE imports (static `import`/`export … from`, dynamic `import()`, `require()`), computed here
 * from the sources and held EQUAL to MAP_RENDERER_FILES. src/config.ts (zod, the agent's env) and
 * every package import must stay OUTSIDE it: root's oneshot has no env file and no node_modules.
 * Type-only imports are erased at runtime and excepted. ONE named exemption: src/exec.ts's lazy
 * `require('./config')` inside agentConfig(), reached only by realExec()/setExecForTests() —
 * never by rendererExec(), the only part of exec.ts the renderer calls.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { derive, HOST_MAP_RENDERER_DIR, type HostDeclaration, SYSTEMD_FLOOR } from '../src/provision/layout';
import {
  IDENTITIES_FILE,
  MAP_GRAMMAR,
  MAP_RENDERER_BUN,
  MAP_RENDERER_BUNFIG,
  MAP_RENDERER_ENTRY,
  MAP_RENDERER_FILES,
  parseRendererVersion,
  rendererDigest,
  rendererInstallDecision,
  renderIdentities,
  renderRendererVersion,
} from '../src/provision/host_map_renderer';
import { hostMapUnitBody, hostMapUnitPath, hostMapUnitRenderer } from '../src/provision/render/host_map_unit';
import { floorRow } from '../src/provision/render/systemd_floors';
import { PENDING_FACTS } from '../src/provision/render/types';
import { MAP_GRAMMAR as DIRECTIVES_GRAMMAR } from '../src/rules/directives';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

const PACKAGE = join(import.meta.dir, '..');
const D1 = '1'.repeat(64);
const D2 = '2'.repeat(64);

/* ── the closure ──────────────────────────────────────────────────────────────────── */

const STATIC = /^\s*(?:import|export)\b([^'"]*?)from\s+['"]([^'"]+)['"]/gm;
const BARE = /^\s*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
/** The named exemption (see the header): file → specifier. */
const LAZY_EXEMPT: Readonly<Record<string, string>> = { 'src/exec.ts': './config' };

function typeOnly(clause: string): boolean {
  if (/^\s*type\b/.test(clause)) return true;
  const named = /\{([^}]*)\}/.exec(clause);
  if (named === null || /^\s*\w/.test(clause.replace(/\{[^}]*\}/, '').replace(/,/g, ''))) return false;
  const members = (named[1] ?? '').split(',').map(m => m.trim()).filter(Boolean);
  return members.length > 0 && members.every(m => m.startsWith('type '));
}

function valueSpecifiers(file: string, source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(STATIC)) if (!typeOnly(m[1] ?? '')) out.push(m[2] ?? '');
  for (const m of source.matchAll(BARE)) out.push(m[1] ?? '');
  for (const m of source.matchAll(DYNAMIC)) if (LAZY_EXEMPT[file] !== m[1]) out.push(m[1] ?? '');
  return out;
}

function closure(entry: string): { files: string[]; packages: string[] } {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of valueSpecifiers(file, readFileSync(join(PACKAGE, file), 'utf8'))) {
      if (spec.startsWith('node:') || spec.startsWith('bun:')) continue;
      if (!spec.startsWith('.')) {
        packages.add(`${file} → ${spec}`);
        continue;
      }
      const target = relative(PACKAGE, resolve(dirname(join(PACKAGE, file)), spec));
      queue.push(target.endsWith('.ts') || target.endsWith('.json') ? target : `${target}.ts`);
    }
  }
  return { files: [...seen].sort(), packages: [...packages].sort() };
}

describe('the renderer closure', () => {
  test('MAP_RENDERER_FILES is exactly the value-import closure of host_map_main.ts', () => {
    expect(MAP_RENDERER_FILES).toContain(MAP_RENDERER_ENTRY);
    expect(closure(MAP_RENDERER_ENTRY).files).toEqual([...MAP_RENDERER_FILES]);
    expect([...MAP_RENDERER_FILES]).toEqual([...MAP_RENDERER_FILES].sort());
  });

  test('src/config.ts and every package import stay outside it', () => {
    const { files, packages } = closure(MAP_RENDERER_ENTRY);
    expect(files).not.toContain('src/config.ts');
    expect(files.filter(file => file.endsWith('.json'))).toEqual([]);
    expect(packages).toEqual([]);
  });

  test('the gate sees what it must (anti-vacuity): type-only and the lazy exemption are the only skips', () => {
    expect(typeOnly(' type { A } ')).toBe(true);
    expect(typeOnly(' { type A, type B } ')).toBe(true);
    expect(typeOnly(' { type A, B } ')).toBe(false);
    expect(typeOnly(' X, { type A } ')).toBe(false);
    // config.ts IS reached by the agent's own entry: the walker follows real imports.
    expect(closure('src/rules/map.ts').files).toContain('src/config.ts');
    expect(closure('src/rules/map.ts').packages).toContain('src/config.ts → zod');
    expect(readFileSync(join(PACKAGE, 'src/exec.ts'), 'utf8')).toContain("require('./config')");
    expect(valueSpecifiers('src/other.ts', "const c = require('./config');")).toEqual(['./config']);
  });
});

/* ── the version record and the install decision ──────────────────────────────────── */

describe('rendererInstallDecision (never downgrade)', () => {
  test('absent, higher, equal-different, equal-same, lower', () => {
    const own = { grammar: 2, digest: D1 };
    expect(rendererInstallDecision(null, own)).toEqual({ install: true, why: 'absent' });
    expect(rendererInstallDecision({ grammar: 1, digest: D1 }, own)).toEqual({ install: true, why: 'newer' });
    expect(rendererInstallDecision({ grammar: 2, digest: D2 }, own)).toEqual({ install: true, why: 'digest' });
    expect(rendererInstallDecision({ grammar: 2, digest: D1 }, own)).toEqual({ install: false, why: 'same' });
    expect(rendererInstallDecision({ grammar: 3, digest: D2 }, own)).toEqual({ install: false, why: 'older' });
  });

  test('MAP_GRAMMAR is the grammar module\'s', () => {
    expect(MAP_GRAMMAR).toBe(DIRECTIVES_GRAMMAR);
  });

  test('VERSION round-trips; anything malformed reads as absent', () => {
    const version = { grammar: MAP_GRAMMAR, digest: D1, from: 'alpha' };
    expect(parseRendererVersion(renderRendererVersion(version))).toEqual(version);
    expect(renderRendererVersion(version)).toBe(`{"digest":"${D1}","from":"alpha","grammar":${MAP_GRAMMAR}}\n`);
    for (const text of [null, 'x', 'null', '{"grammar":0,"digest":"x","from":"a"}', `{"grammar":1,"digest":"${D1}","from":"A"}`, `{"grammar":1,"digest":"zz","from":"alpha"}`]) {
      expect(parseRendererVersion(text)).toBeNull();
    }
    expect(() => renderRendererVersion({ ...version, grammar: 0 })).toThrow(/positive/);
    expect(() => renderRendererVersion({ ...version, digest: 'x' })).toThrow(/hex/);
    expect(() => renderRendererVersion({ ...version, from: '../x' })).toThrow(/instance/);
  });

  test('the digest depends on every path and byte, not on the order given', () => {
    const a = { path: 'src/a.ts', bytes: new TextEncoder().encode('a') };
    const b = { path: 'src/b.ts', bytes: new TextEncoder().encode('b') };
    expect(rendererDigest([a, b])).toBe(rendererDigest([b, a]));
    expect(rendererDigest([a, b])).not.toBe(rendererDigest([a, { ...b, bytes: new TextEncoder().encode('B') }]));
    expect(rendererDigest([a, b])).not.toBe(rendererDigest([a, { ...b, path: 'src/c.ts' }]));
  });

  test('identities.json: sorted, canonical; a bad name or uid refuses', () => {
    expect(IDENTITIES_FILE).toBe('identities.json');
    expect(renderIdentities({ beta: 1002, alpha: 1001 })).toBe('{\n  "alpha": 1001,\n  "beta": 1002\n}\n');
    expect(() => renderIdentities({ Alpha: 1 })).toThrow(/instance name/);
    expect(() => renderIdentities({ alpha: -1 })).toThrow(/not a uid/);
  });
});

/* ── the oneshot unit ─────────────────────────────────────────────────────────────── */

const MAP_HOST: HostDeclaration = { ...tlsDeclaration(), web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } };

describe('hostMapUnitRenderer', () => {
  test('the exact bytes', () => {
    const layout = derive(MAP_HOST);
    const [artifact, ...rest] = hostMapUnitRenderer.render(layout, PENDING_FACTS);
    expect(rest).toEqual([]);
    const dir = HOST_MAP_RENDERER_DIR;
    expect(artifact?.body).toBe(
      [
        `# dedalo-provision: _host host_map_unit ${artifact?.body.split('\n')[0]?.split(' ').at(-1)}`,
        `# Renders the host-wide nginx media map from every instance's contribution (root's copy in ${dir}).`,
        '# Started by an agent (polkit: start only); never enabled.',
        '[Unit]',
        'Description=Dédalo publication host: render the host-wide nginx media map',
        'After=nginx.service',
        '',
        '[Service]',
        'Type=oneshot',
        'User=root',
        'Group=root',
        `WorkingDirectory=${dir}`,
        `ExecStart=${dir}/${MAP_RENDERER_BUN} --no-env-file --no-install --config=${dir}/${MAP_RENDERER_BUNFIG} ${dir}/${MAP_RENDERER_ENTRY}`,
        'Environment=',
        'UMask=0022',
        'NoNewPrivileges=yes',
        'PrivateTmp=yes',
        'ProtectSystem=full',
        'ProtectHome=read-only',
        'ProtectKernelTunables=yes',
        'ProtectKernelModules=yes',
        'ProtectControlGroups=yes',
        'RestrictRealtime=yes',
        'RestrictSUIDSGID=yes',
        'LockPersonality=yes',
        'StandardOutput=journal',
        'StandardError=journal',
        'SyslogIdentifier=dedalo-pubhost-map',
        '',
      ].join('\n'),
    );
    expect(artifact).toMatchObject({
      kind: 'host_map_unit',
      path: '/etc/systemd/system/dedalo-pubhost-map.service',
      owner: 'root',
      group: 'root',
      mode: 0o644,
      effects: ['daemon_reload'],
      validate: null,
      service: null,
      hostWide: true,
    });
  });

  test('every directive is dated and within SYSTEMD_FLOOR; nothing is omitted', () => {
    const body = hostMapUnitBody(derive(MAP_HOST));
    expect(body).toContain('RestrictSUIDSGID=yes');
    expect(body).not.toContain('# omitted');
    for (const line of body.split('\n').filter(entry => /^[A-Za-z]+=/.test(entry))) expect(floorRow(line)?.since ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(SYSTEMD_FLOOR);
  });

  test('host-wide: two instances render the same bytes; only nginx conf_d hosts get it', () => {
    const a = hostMapUnitRenderer.render(derive(MAP_HOST), PENDING_FACTS)[0]?.body;
    const b = hostMapUnitRenderer.render(derive({ ...MAP_HOST, instance: 'other' }), PENDING_FACTS)[0]?.body;
    expect(a).toBe(b);
    expect(hostMapUnitRenderer.appliesTo?.(derive(MAP_HOST))).toBe(true);
    expect(hostMapUnitRenderer.appliesTo?.(derive(tlsDeclaration()))).toBe(false);
    expect(hostMapUnitRenderer.appliesTo?.(derive(unixDeclaration()))).toBe(false);
    expect(hostMapUnitPath(derive({ ...MAP_HOST, paths: { unit_dir: '/tmp/units' } }))).toBe('/tmp/units/dedalo-pubhost-map.service');
  });
});
