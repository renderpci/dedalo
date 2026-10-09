/**
 * The S9 label table (spec S9, §9 provision_selinux): both layouts and every flavour; spec
 * escaping; the import grammar and its mutations; `-d` lines; restorecon targets; the only rule on
 * the home is the exact `-f d` H row; never a rule on `/`, `/home`, `/srv`, `/var/www`; NO rule
 * covers `S/publication_api/v2` or `S/audit` with an httpd-readable type; the disabled-with-store
 * branch; the Remi socket directory is never in the table.
 */
import { describe, expect, test } from 'bun:test';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import {
  DEFAULT_RULE_FACTS,
  EL_DRILL_INPUTS,
  HOME_TRAVERSE_TYPE,
  HTTPD_READABLE_TYPES,
  IMPORT_LINE_PATTERN,
  SELINUX_BOOLEANS,
  SELINUX_TYPES,
  encodeSelinuxState,
  dedicatedBunDir,
  escapeSpec,
  fcontextEntry,
  importLines,
  isHomeLayout,
  labelScope,
  parseSelinuxState,
  portEntry,
  restoreconTargets,
  selinuxPort,
  selinuxRules,
} from '../src/provision/selinux';
import { SELINUX_BOOLEANS as EXEC_BOOLEANS } from '../src/provision/exec_contract';
import type { SelinuxObserved } from '../src/provision/plan';
import { ruleFacts } from '../src/provision/plan';
import { unixDeclaration } from './fixtures/provision_declaration';

const HOME = '/home/museum.example.org';

function homeDecl(flavor: 'debian' | 'el' | 'remi' = 'debian', extra: Partial<HostDeclaration> = {}): HostDeclaration {
  return {
    ...unixDeclaration(),
    agent_dir: `${HOME}/host_agent`,
    state_root: `${HOME}/dedalo`,
    bun_bin: `${HOME}/.bun/bin/bun`,
    site: { domain: 'museum.example.org', fpm: { flavor, version: flavor === 'remi' ? '8.3' : '8.2' } },
    ...extra,
  };
}
function systemDecl(flavor: 'debian' | 'el' | 'remi' = 'el', extra: Partial<HostDeclaration> = {}): HostDeclaration {
  return {
    ...unixDeclaration(),
    web: { server: 'apache', unit: 'httpd' },
    agent_dir: '/opt/dedalo_publication_host/host_agent',
    state_root: '/srv/dedalo_publication_host/test',
    bun_bin: '/opt/dedalo_publication_host/bun/bin/bun',
    site: { domain: 'museum.example.org', fpm: { flavor, version: flavor === 'remi' ? '8.3' : '8.2' } },
    ...extra,
  };
}

const rowsOf = (decl: HostDeclaration, facts = DEFAULT_RULE_FACTS) =>
  selinuxRules(derive(decl), facts).map(r => [r.row, r.fileType, r.type, r.spec] as const);

/** A rule COVERS `path` when it names it, or names an ancestor recursively. */
function covers(rule: { path: string; recursive: boolean }, path: string): boolean {
  return rule.path === path || (rule.recursive && path.startsWith(`${rule.path}/`));
}

describe('the closed sets', () => {
  test('SELINUX_TYPES / HTTPD_READABLE_TYPES / HOME_TRAVERSE_TYPE values; the booleans are the exec set', () => {
    expect([...SELINUX_TYPES]).toEqual([
      'usr_t',
      'bin_t',
      'home_root_t',
      'httpd_sys_content_t',
      'httpd_sys_rw_content_t',
      'httpd_log_t',
      'httpd_config_t',
      'data_home_t',
    ]);
    // data_home_t (the v2 tree under the home layout) is NOT httpd-readable by default (measured
    // RHEL 9.8 sesearch: httpd_t reads it only under httpd_read_user_content, like user_home_t).
    expect(HTTPD_READABLE_TYPES).not.toContain('data_home_t');
    expect([...HTTPD_READABLE_TYPES]).toEqual(['usr_t', 'httpd_sys_content_t', 'httpd_config_t', 'etc_t']);
    expect(HOME_TRAVERSE_TYPE).toBe('home_root_t');
    expect(SELINUX_TYPES).toContain(HOME_TRAVERSE_TYPE);
    expect(SELINUX_BOOLEANS).toBe(EXEC_BOOLEANS);
  });
});

describe('the S9 table', () => {
  test('home layout (Debian apache): H exact, S and S/publication_api search-only, v1 content, rules config, code usr_t, bun bin_t, V (no logs: they are in /var/log/<server>, typed by the policy)', () => {
    expect(isHomeLayout(derive(homeDecl()))).toBe(true);
    expect(rowsOf(homeDecl())).toEqual([
      ['H', 'd', 'home_root_t', '/home/museum\\.example\\.org'],
      ['S', 'd', 'usr_t', '/home/museum\\.example\\.org/dedalo'],
      ['S/publication_api', 'd', 'usr_t', '/home/museum\\.example\\.org/dedalo/publication_api'],
      ['S/publication_api/v1', 'a', 'httpd_sys_content_t', '/home/museum\\.example\\.org/dedalo/publication_api/v1(/.*)?'],
      // systemd (init_t) must read v2.env and the agent's current/scratch links: not under user_home_t.
      ['S/publication_api/v2', 'a', 'data_home_t', '/home/museum\\.example\\.org/dedalo/publication_api/v2(/.*)?'],
      ['S/rules', 'a', 'httpd_config_t', '/home/museum\\.example\\.org/dedalo/rules(/.*)?'],
      ['A', 'a', 'usr_t', '/home/museum\\.example\\.org/host_agent(/.*)?'],
      ['dirname(B)', 'a', 'usr_t', '/home/museum\\.example\\.org/\\.bun/bin(/.*)?'],
      ['B', 'f', 'bin_t', '/home/museum\\.example\\.org/\\.bun/bin/bun'],
      ['V/tmp', 'a', 'httpd_sys_rw_content_t', '/var/lib/dedalo_publication_host/test/v1/tmp(/.*)?'],
      ['V/log', 'a', 'httpd_log_t', '/var/lib/dedalo_publication_host/test/v1/log(/.*)?'],
    ]);
  });

  test('system layout: no H, no H/logs; the rest identical in shape', () => {
    const rows = rowsOf(systemDecl()).map(r => r[0]);
    expect(isHomeLayout(derive(systemDecl()))).toBe(false);
    expect(rows).toEqual(['S', 'S/publication_api', 'S/publication_api/v1', 'S/rules', 'A', 'dirname(B)', 'B', 'V/tmp', 'V/log']);
  });

  test('no site: no V rows; every flavour gives the same table (the FPM socket directory is never ours)', () => {
    expect(rowsOf({ ...unixDeclaration() }).map(r => r[0])).toEqual(['S', 'S/publication_api', 'S/publication_api/v1', 'S/rules', 'A', 'B']);
    expect(rowsOf(systemDecl('remi'))).toEqual(rowsOf(systemDecl('el')));
    expect(rowsOf(homeDecl('remi'))).toEqual(rowsOf(homeDecl('debian')));
    for (const flavor of ['debian', 'el', 'remi'] as const) {
      for (const r of selinuxRules(derive(systemDecl(flavor)))) {
        expect(r.path.startsWith('/var/opt/remi')).toBe(false);
        expect(r.path.startsWith('/run/php')).toBe(false);
      }
    }
  });

  test('the only rule on the home is the exact `-f d` H row (never recursive)', () => {
    const rules = selinuxRules(derive(homeDecl()));
    const onHome = rules.filter(r => covers(r, HOME));
    expect(onHome.map(r => [r.row, r.fileType, r.recursive])).toEqual([['H', 'd', false]]);
    expect(rules.find(r => r.row === 'H')?.spec.endsWith('(/.*)?')).toBe(false);
  });

  test('NO rule covers S/publication_api/v2 or S/audit with an httpd-readable type (both layouts, every option)', () => {
    for (const decl of [homeDecl(), systemDecl(), homeDecl('remi'), { ...unixDeclaration() }]) {
      for (const facts of [DEFAULT_RULE_FACTS, { mediaLabelable: true, sharedMediaAccepted: true, homeTraverseByBoolean: false }]) {
        const layout = derive(decl);
        const secrets = [layout.state.apis.v2.root, layout.state.apis.v2.shared, `${layout.state.apis.v2.shared}/v2.env`, layout.state.audit, layout.state.auditFile];
        for (const r of selinuxRules(layout, facts)) {
          for (const secret of secrets) {
            if (covers(r, secret)) expect(HTTPD_READABLE_TYPES).not.toContain(r.type);
          }
        }
      }
    }
  });

  test('never a rule on /, /home, /srv, /var/www', () => {
    for (const decl of [homeDecl(), systemDecl()]) {
      for (const r of selinuxRules(derive(decl), { mediaLabelable: true, sharedMediaAccepted: true, homeTraverseByBoolean: false })) {
        expect(['/', '/home', '/srv', '/var/www', '/var/www/html']).not.toContain(r.path);
      }
    }
  });

  test('M: copy mode labelled; shared only once accepted; never on an unlabelable (network, no seclabel) mount', () => {
    const copy = systemDecl('el', { media: { mode: 'copy', root: '/srv/pubmedia' } });
    expect(rowsOf(copy).find(r => r[0] === 'M')).toEqual(['M', 'a', 'httpd_sys_content_t', '/srv/pubmedia(/.*)?']);
    expect(rowsOf(copy, { ...DEFAULT_RULE_FACTS, mediaLabelable: false }).find(r => r[0] === 'M')).toBeUndefined();
    const shared = systemDecl();
    expect(rowsOf(shared).find(r => r[0] === 'M')).toBeUndefined();
    expect(rowsOf(shared, { ...DEFAULT_RULE_FACTS, sharedMediaAccepted: true }).find(r => r[0] === 'M')?.[3]).toBe('/mnt/dedalo_media(/.*)?');
  });

  test("shared media is accepted by the declaration's media.selinux_label only (init's selinux.media_access=act)", () => {
    const observed = (state: string | null): SelinuxObserved => ({
      mode: 'enforcing',
      storePresent: true,
      localFcontext: [],
      localPorts: [],
      portTypes: new Map(),
      pending: [],
      state,
      booleans: {},
      mediaLabelable: true,
    });
    const recorded = encodeSelinuxState({ v: 1, fcontext: [{ spec: '/mnt/dedalo_media(/.*)?', fileType: 'a', type: 'httpd_sys_content_t' }], ports: [] });
    const consented = derive(systemDecl('el', { media: { mode: 'shared', root: '/mnt/dedalo_media', selinux_label: true } }));
    expect(consented.media.selinuxLabel).toBe(true);
    expect(ruleFacts(consented, observed(null)).sharedMediaAccepted).toBe(true);
    // Withdrawn: a recorded registration does not keep it (plan then removes the stale rule).
    const plain = derive(systemDecl());
    expect(plain.media.selinuxLabel).toBe(false);
    expect(ruleFacts(plain, observed(recorded)).sharedMediaAccepted).toBe(false);
    // Only shared mode carries the consent; only `true` is a value.
    expect(() => derive(systemDecl('el', { media: { mode: 'copy', root: '/srv/pubmedia', selinux_label: true } }))).toThrow(/media\.selinux_label: only for media\.mode 'shared'/);
    expect(() => derive(systemDecl('el', { media: { mode: 'shared', root: '/mnt/dedalo_media', selinux_label: false as never } }))).toThrow(/must be true or absent/);
  });

  test('nginx conf_d: N httpd_config_t, R usr_t, R/bun bin_t; not on apache or nginx none', () => {
    const decl = systemDecl('el', { web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } });
    expect(rowsOf(decl).filter(r => ['N', 'R', 'R/bun'].includes(r[0]))).toEqual([
      ['N', 'a', 'httpd_config_t', '/var/lib/dedalo_publication_host/_host/nginx_map(/.*)?'],
      ['R', 'a', 'usr_t', '/var/lib/dedalo_publication_host/_host/map_renderer(/.*)?'],
      ['R/bun', 'f', 'bin_t', '/var/lib/dedalo_publication_host/_host/map_renderer/bun'],
    ]);
    expect(rowsOf(systemDecl('el', { web: { server: 'nginx', unit: 'nginx' } })).some(r => r[0] === 'N')).toBe(false);
  });

  test('home traversed by httpd_enable_homedirs instead: no H row', () => {
    expect(rowsOf(homeDecl(), { ...DEFAULT_RULE_FACTS, homeTraverseByBoolean: true }).some(r => r[0] === 'H')).toBe(false);
  });

  test('spec escaping: only `.` is escaped; a path outside the grammar is refused', () => {
    expect(escapeSpec('/home/a.b/c-d_e')).toBe('/home/a\\.b/c-d_e');
    expect(() => escapeSpec("/home/a'b")).toThrow(/clean absolute/);
    expect(() => escapeSpec('/home/../etc')).toThrow(/clean absolute/);
    expect(() => escapeSpec('/home/a b')).toThrow(/clean absolute/);
  });
});

describe('port, restorecon targets, scope', () => {
  test('the v2 port is http_port_t tcp', () => {
    expect(selinuxPort(derive(homeDecl()))).toEqual({ type: 'http_port_t', proto: 'tcp', port: 3100 });
  });

  test('restorecon: H, S, S/publication_api and the exact files without -R; subtrees with -R', () => {
    const targets = restoreconTargets(derive(homeDecl()));
    const byPath = new Map(targets.map(t => [t.path, t.recursive]));
    expect(byPath.get(HOME)).toBe(false);
    expect(byPath.get(`${HOME}/dedalo`)).toBe(false);
    expect(byPath.get(`${HOME}/dedalo/publication_api`)).toBe(false);
    expect(byPath.get(`${HOME}/.bun/bin/bun`)).toBe(false);
    expect(byPath.get(`${HOME}/dedalo/publication_api/v1`)).toBe(true);
    // owner decision 1(c): the site logs are outside the home (/var/log/<server>/<domain>, httpd_log_t by the policy).
    expect(byPath.has(`${HOME}/logs`)).toBe(false);
    expect([...byPath.keys()].some(path => path.startsWith('/var/log/'))).toBe(false);
    expect(new Set(targets.map(t => t.path)).size).toBe(targets.length);
  });

  test('labelScope: enforcing/permissive register and relabel; disabled with a store registers only; else nothing', () => {
    expect(labelScope('enforcing', true)).toEqual({ register: true, relabel: true });
    expect(labelScope('permissive', false)).toEqual({ register: true, relabel: true });
    expect(labelScope('disabled', true)).toEqual({ register: true, relabel: false });
    expect(labelScope('disabled', false)).toEqual({ register: false, relabel: false });
    expect(labelScope('absent', true)).toEqual({ register: false, relabel: false });
  });
});

describe('the import grammar (spec §5.9)', () => {
  const rules = selinuxRules(derive(homeDecl()));

  test('every table rule renders an -a line the closed pattern admits; -d lines first', () => {
    const lines = importLines(rules.map(fcontextEntry), [portEntry(3099)]);
    expect(lines[0]).toBe('port -d -t http_port_t -p tcp 3099');
    expect(lines).toContain("fcontext -a -f a -t httpd_sys_content_t '/home/museum\\.example\\.org/dedalo/publication_api/v1(/.*)?'");
    expect(lines).toContain("fcontext -a -f f -t bin_t '/home/museum\\.example\\.org/\\.bun/bin/bun'");
    expect(lines).toContain("fcontext -a -f d -t home_root_t '/home/museum\\.example\\.org'");
    for (const line of lines) expect(IMPORT_LINE_PATTERN.test(line)).toBe(true);
    expect(importLines([portEntry(3100)])).toEqual(['port -a -t http_port_t -p tcp 3100']);
  });

  test('mutations are refused: a quote in a path, a foreign type, port 0/65536, -f d with (/.*)?, -d with a foreign type, a rule on /home', () => {
    expect(() => importLines([{ kind: 'fcontext', fileType: 'a', type: 'usr_t', spec: "/srv/x'(/.*)?" }])).toThrow(/refusing/);
    expect(() => importLines([{ kind: 'fcontext', fileType: 'a', type: 'shadow_t', spec: '/srv/x(/.*)?' }])).toThrow(/refusing/);
    expect(() => importLines([portEntry(0)])).toThrow(/refusing/);
    expect(() => importLines([portEntry(65536)])).toThrow(/refusing/);
    expect(() => importLines([{ kind: 'port', type: 'ssh_port_t', port: 3100 }])).toThrow(/refusing/);
    expect(() => importLines([{ kind: 'fcontext', fileType: 'd', type: 'usr_t', spec: '/srv/x(/.*)?' }])).toThrow(/exact/);
    expect(() => importLines([], [{ kind: 'fcontext', fileType: 'a', type: 'etc_t', spec: '/srv/x(/.*)?' }])).toThrow(/refusing/);
    expect(() => importLines([{ kind: 'fcontext', fileType: 'a', type: 'usr_t', spec: '/home(/.*)?' }])).toThrow(/refusing a rule on '\/home'/);
    expect(() => importLines([{ kind: 'fcontext', fileType: 'a', type: 'usr_t', spec: '/srv/x(/.*)?\nport -a -t http_port_t -p tcp 1' }])).toThrow(/refusing/);
    expect(importLines([portEntry(65535)])).toEqual(['port -a -t http_port_t -p tcp 65535']);
  });

  test('a relocation / port change: the -d forms of the previous rules', () => {
    const before = selinuxRules(derive(homeDecl())).map(fcontextEntry);
    const lines = importLines([], [...before.slice(0, 2), portEntry(3100)]);
    expect(lines).toEqual([
      "fcontext -d -f d -t home_root_t '/home/museum\\.example\\.org'",
      "fcontext -d -f d -t usr_t '/home/museum\\.example\\.org/dedalo'",
      'port -d -t http_port_t -p tcp 3100',
    ]);
  });
});

describe('selinux.state', () => {
  test('round trip, canonical (sorted), and anything malformed reads as none', () => {
    const body = encodeSelinuxState({ v: 1, fcontext: [{ spec: '/b', fileType: 'a', type: 'usr_t' }, { spec: '/a', fileType: 'd', type: 'usr_t' }], ports: [3100, 3100] });
    expect(parseSelinuxState(body)).toEqual({ v: 1, fcontext: [{ spec: '/a', fileType: 'd', type: 'usr_t' }, { spec: '/b', fileType: 'a', type: 'usr_t' }], ports: [3100] });
    for (const bad of [null, 'x', '{"v":2,"fcontext":[],"ports":[]}', '{"v":1,"fcontext":[{"spec":1}],"ports":[]}', '{"v":1,"fcontext":[],"ports":[0]}']) {
      expect(parseSelinuxState(bad)).toBeNull();
    }
  });
});

describe('system trees are never relabelled', () => {
  test('a bun in a shared bin directory gets only its own bin_t rule, never a usr_t on the directory', () => {
    const rows = rowsOf({ ...unixDeclaration() });
    expect(rows.find(r => r[0] === 'dirname(B)')).toBeUndefined();
    expect(rows.find(r => r[0] === 'B')).toEqual(['B', 'f', 'bin_t', '/usr/local/bin/bun']);
    expect(dedicatedBunDir('/usr/local/bin/bun')).toBeNull();
    expect(dedicatedBunDir('/opt/dedalo_publication_host/bun/bin/bun')).toBe('/opt/dedalo_publication_host/bun/bin');
    expect(dedicatedBunDir('/home/x.org/.dedalo_bun/bin/bun')).toBe('/home/x.org/.dedalo_bun/bin');
  });

  test('a rule on a system tree is refused by the import grammar', () => {
    for (const path of ['/usr/local/bin', '/etc', '/var/lib', '/opt']) {
      expect(() => importLines([{ kind: 'fcontext', fileType: 'a', type: 'usr_t', spec: `${path}(/.*)?` }])).toThrow(/refusing a rule/);
    }
  });
});

describe('EL_DRILL_INPUTS (the EL drill record ratchet input list)', () => {
  test('sorted, unique, package-relative, every entry an existing file, this module and install.sh in', () => {
    expect([...EL_DRILL_INPUTS]).toEqual([...new Set(EL_DRILL_INPUTS)].sort());
    for (const path of EL_DRILL_INPUTS) {
      expect(path.startsWith('/') || path.includes('..')).toBe(false);
      expect(statSync(join(import.meta.dir, '..', path)).isFile()).toBe(true);
    }
    expect(EL_DRILL_INPUTS).toContain('src/provision/selinux.ts');
    expect(EL_DRILL_INPUTS).toContain('deploy/install.sh');
  });
});
