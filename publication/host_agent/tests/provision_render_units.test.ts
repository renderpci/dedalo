/**
 * The two systemd units, rendered from Task 8's derived layout (the unix/apache and
 * tls/nginx fixture declarations).
 */
import { describe, expect, test } from 'bun:test';
import { CREDENTIAL_KEYS, ENV_FILE_VAR } from '../src/config';
import { parseStamp } from '../src/provision/hash';
import type { AgentLayout } from '../src/provision/layout';
import { derive, LayoutError, SERVICE_TOKEN_CREDENTIAL, SYSTEMD_FLOOR } from '../src/provision/layout';
import {
  AGENT_ENV_FILE_VAR,
  agentUnitGroups,
  agentUnitRenderer,
  NGINX_CONFIGTEST_WRITE_PATHS,
  NNP_IMPLYING_DIRECTIVES,
} from '../src/provision/render/unit_agent';
import { PUBHOST_GROUP } from '../src/provision/layout';
import { SYSTEMD_DIRECTIVE_FLOORS, checkDirectives, floorRow, formOf } from '../src/provision/render/systemd_floors';
import { hostMapUnitRenderer } from '../src/provision/render/host_map_unit';
import { anySiblingHomeBound } from '../src/provision/siblings';
import { ENV_BIN, v2ScratchUnitRenderer, v2UnitRenderer } from '../src/provision/render/unit_v2';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';
import { FIXTURE_FACTS, FIXTURE_TOKEN } from './fixtures/provision_facts';

const UNIX = derive(unixDeclaration());
const TLS = derive(tlsDeclaration());
const directives = (body: string) => body.split('\n').filter(line => /^[A-Za-z]+=/.test(line));
const agentUnit = (layout: AgentLayout) => agentUnitRenderer.render(layout, FIXTURE_FACTS)[0]!;
const v2Unit = (layout: AgentLayout) => v2UnitRenderer.render(layout, FIXTURE_FACTS)[0]!;

describe('agent unit', () => {
  test('one stamped root 0644 unit that reloads systemd, restarts the agent, is enabled and started', () => {
    const a = agentUnit(UNIX);
    expect([a.path, a.owner, a.group, a.mode]).toEqual([
      '/etc/systemd/system/dedalo-publication-host-test.service',
      'root',
      'root',
      0o644,
    ]);
    expect(parseStamp(a.body)?.kind).toBe('unit_agent');
    expect(a.effects).toEqual(['daemon_reload', 'restart_agent']);
    expect(a.service).toEqual({ unit: 'dedalo-publication-host-test', start: true });
    expect(a.validate).toBeNull();
  });

  test('pinned bun, the checkout, the state root writable, the env file NAMED, the token a credential', () => {
    const d = directives(agentUnit(UNIX).body);
    expect(d).toContain('User=dedalo-pubhost');
    expect(d).toContain('WorkingDirectory=/opt/dedalo/publication/host_agent');
    expect(d).toContain('ExecStart=/usr/local/bin/bun run /opt/dedalo/publication/host_agent/src/index.ts');
    expect(d).toContain('ProtectSystem=strict');
    expect(d).toContain('ReadWritePaths=/srv/dedalo_publication');
    expect(d).toContain('Environment=DEDALO_HOST_AGENT_ENV_FILE=/etc/dedalo_publication_host/test/agent.env');
    expect(d).toContain('LoadCredential=SERVICE_TOKEN:/etc/dedalo_publication_host/test/credentials/SERVICE_TOKEN');
    expect(d.filter(line => line.startsWith('EnvironmentFile='))).toEqual([]);
    expect(agentUnit(UNIX).body).not.toContain(FIXTURE_TOKEN);
  });

  test("the names it renders are the agent config's own (Task 1)", () => {
    expect(AGENT_ENV_FILE_VAR).toBe(ENV_FILE_VAR);
    expect([...CREDENTIAL_KEYS]).toEqual([SERVICE_TOKEN_CREDENTIAL]);
  });

  test('NoNewPrivileges=no (sudo is setuid) and NO directive that silently implies it', () => {
    for (const layout of [UNIX, TLS]) {
      const d = directives(agentUnit(layout).body);
      expect(d).toContain('NoNewPrivileges=no');
      for (const name of NNP_IMPLYING_DIRECTIVES) {
        expect(d.filter(line => line.startsWith(`${name}=`))).toEqual([]);
      }
    }
  });

  test('groups: unix → Group= the engine group; the v2 group and dedalo_pubhost are supplementary on both', () => {
    const unix = directives(agentUnit(UNIX).body);
    expect(unix).toContain('Group=dedalo');
    expect(unix).toContain(`SupplementaryGroups=dedalo-api-v2 ${PUBHOST_GROUP}`);
    const tls = directives(agentUnit(TLS).body);
    expect(tls.filter(line => line.startsWith('Group='))).toEqual([]);
    expect(tls).toContain(`SupplementaryGroups=dedalo-api-v2 ${PUBHOST_GROUP}`);
    expect(agentUnitGroups(UNIX).supplementary).toEqual(['dedalo-api-v2', PUBHOST_GROUP]);
  });

  test('nginx gets its configtest write paths; apache does not', () => {
    const nginx = directives(agentUnit(TLS).body);
    for (const path of NGINX_CONFIGTEST_WRITE_PATHS) expect(nginx).toContain(`ReadWritePaths=${path}`);
    expect(directives(agentUnit(UNIX).body).filter(line => line.startsWith('ReadWritePaths='))).toEqual([
      'ReadWritePaths=/srv/dedalo_publication',
    ]);
  });

  test('copy-mode media: the agent may write its media root', () => {
    const copy = derive({ ...unixDeclaration(), media: { mode: 'copy', root: '/srv/pubmedia' } });
    expect(directives(agentUnit(copy).body)).toContain('ReadWritePaths=/srv/pubmedia');
  });

  test("unix listener: RuntimeDirectory= is the layout's nested runtime dir; tls has none", () => {
    const d = directives(agentUnit(UNIX).body);
    expect(d).toContain('RuntimeDirectory=dedalo_publication_host/test');
    expect(d).toContain('RuntimeDirectoryMode=0750');
    expect(agentUnit(TLS).body).not.toContain('RuntimeDirectory=');
  });

  test('a socket outside the runtime directory is refused', () => {
    const moved: AgentLayout = {
      ...UNIX,
      listen: {
        kind: 'unix',
        runtimeDirectory: 'dedalo_publication_host/test',
        runtimeDir: '/run/dedalo_publication_host/test',
        socketPath: '/var/run/x/agent.sock',
      },
    };
    expect(() => agentUnitRenderer.render(moved, FIXTURE_FACTS)).toThrow(
      /not directly inside \/run\/dedalo_publication_host\/test/,
    );
  });

  test('a newline can never reach a unit: derive refuses the path', () => {
    expect(() => derive({ ...unixDeclaration(), state_root: '/srv/x\nExecStartPre=/bin/sh' })).toThrow(LayoutError);
  });

  test('ProtectHome=read-only only when a root lives under /home', () => {
    expect(directives(agentUnit(TLS).body)).toContain('ProtectHome=yes');
    const home = derive({ ...tlsDeclaration(), media: { mode: 'shared', root: '/home/pubmedia' } });
    expect(directives(agentUnit(home).body)).toContain('ProtectHome=read-only');
  });
});

describe('v2 unit', () => {
  test('runs current/ as its own user with shared/v2.env and the full sandbox; enabled, never started here', () => {
    const a = v2Unit(UNIX);
    expect([a.path, a.owner, a.group, a.mode]).toEqual([
      '/etc/systemd/system/dedalo-publication-api-v2.service',
      'root',
      'root',
      0o644,
    ]);
    expect(a.effects).toEqual(['daemon_reload', 'restart_v2']);
    expect(a.service).toEqual({ unit: 'dedalo-publication-api-v2', start: false });
    const d = directives(a.body);
    expect(d).toContain('User=dedalo-api-v2');
    expect(d).toContain('Group=dedalo-api-v2');
    expect(d).toContain('WorkingDirectory=/srv/dedalo_publication/publication_api/v2/current');
    expect(d).toContain('EnvironmentFile=/srv/dedalo_publication/publication_api/v2/shared/v2.env');
    expect(d).toContain('NoNewPrivileges=yes');
    expect(d.filter(line => line.startsWith('ReadWritePaths='))).toEqual([]);
    expect(d.filter(line => line.startsWith('MemoryDenyWriteExecute='))).toEqual([]);
  });

  test('loopback + port are set by env(1) in ExecStart — EnvironmentFile= would beat any Environment=', () => {
    const d = directives(v2Unit(UNIX).body);
    expect(d).toContain(`ExecStart=${ENV_BIN} NODE_ENV=production HOST=127.0.0.1 PORT=3100 /usr/local/bin/bun src/index.ts`);
    expect(d).toContain(`AssertFileIsExecutable=${ENV_BIN}`);
    expect(d.filter(line => line.startsWith('Environment='))).toEqual([]);
  });

  test('v2 sharing the agent user is refused', () => {
    // derive() already refuses it (layout.ts: three distinct users); the renderer's own guard
    // still holds for a layout built any other way.
    const decl = unixDeclaration();
    expect(() => derive({ ...decl, v2: { ...decl.v2, user: decl.agent_user } })).toThrow(/must differ from agent_user/);
    const base = derive(decl);
    const shared: AgentLayout = { ...base, identity: { ...base.identity, v2User: base.identity.agentUser } };
    expect(() => v2UnitRenderer.render(shared, FIXTURE_FACTS)).toThrow(/its own user/);
  });
});

describe('v2 scratch template unit (the scratch boot runs as v2, never as the agent)', () => {
  const scratch = (layout: AgentLayout) => v2ScratchUnitRenderer.render(layout, FIXTURE_FACTS)[0]!;

  test('a root 0644 template that only reloads systemd: never enabled, never started, no [Install]', () => {
    const a = scratch(UNIX);
    expect([a.path, a.owner, a.group, a.mode]).toEqual([
      '/etc/systemd/system/dedalo-publication-api-v2-scratch@.service',
      'root',
      'root',
      0o644,
    ]);
    expect(parseStamp(a.body)?.kind).toBe('v2_scratch_unit');
    expect(a.effects).toEqual(['daemon_reload']);
    expect(a.service).toBeNull();
    expect(a.body).not.toContain('[Install]');
    expect(directives(a.body)).toContain('Restart=no');
  });

  test("v2's user and sandbox, the scratch link, v2.env; no credential, no writable path", () => {
    const d = directives(scratch(UNIX).body);
    expect(d).toContain('User=dedalo-api-v2');
    expect(d).toContain('Group=dedalo-api-v2');
    expect(d).toContain('WorkingDirectory=/srv/dedalo_publication/publication_api/v2/scratch');
    expect(d).toContain('AssertPathIsDirectory=/srv/dedalo_publication/publication_api/v2/scratch');
    expect(d).toContain('EnvironmentFile=/srv/dedalo_publication/publication_api/v2/shared/v2.env');
    expect(d.filter(line => /^(LoadCredential|SetCredential|ReadWritePaths|SupplementaryGroups)/.test(line))).toEqual([]);
    // The SAME sandbox as the v2 unit, line for line.
    const sandbox = (body: string) =>
      directives(body).filter(line => /^(NoNewPrivileges|Protect|Private|Restrict|LockPersonality|UMask)/.test(line));
    expect(sandbox(scratch(UNIX).body)).toEqual(sandbox(v2Unit(UNIX).body));
    expect(sandbox(scratch(UNIX).body)).toContain('NoNewPrivileges=yes');
  });

  test('the port is the instance (%i) and loopback is forced by env(1), not Environment=', () => {
    const d = directives(scratch(UNIX).body);
    expect(d).toContain(`ExecStart=${ENV_BIN} NODE_ENV=production HOST=127.0.0.1 PORT=%i /usr/local/bin/bun src/index.ts`);
    // Never `bun run`: its node shim links in PrivateTmp cost an AVC at every stop (systemd may not unlink tmp_t links).
    expect(d).not.toContain(' run src/index.ts');
    expect(d.filter(line => line.startsWith('Environment='))).toEqual([]);
  });

  test('v2 sharing the agent user is refused', () => {
    // derive() already refuses it (layout.ts: three distinct users); the renderer's own guard
    // still holds for a layout built any other way.
    const decl = unixDeclaration();
    expect(() => derive({ ...decl, v2: { ...decl.v2, user: decl.agent_user } })).toThrow(/must differ from agent_user/);
    const base = derive(decl);
    const shared: AgentLayout = { ...base, identity: { ...base.identity, v2User: base.identity.agentUser } };
    expect(() => v2ScratchUnitRenderer.render(shared, FIXTURE_FACTS)).toThrow(/its own user/);
  });
});

/* ── the systemd profile (spec S10) ──────────────────────────────────────────────────── */

describe('systemd floors (keyed by directive AND value)', () => {
  test('the table dates value-dependent forms per value', () => {
    expect(floorRow('ProtectHome=tmpfs')?.since).toBe(238);
    expect(floorRow('ProtectHome=read-only')?.since).toBe(214);
    expect(floorRow('ProtectSystem=strict')?.since).toBe(232);
    expect(floorRow('ProtectProc=invisible')?.since).toBe(247);
    expect(floorRow('RestrictNamespaces=yes')?.since).toBe(233);
    expect(floorRow('SystemCallFilter=@system-service')?.since).toBe(231);
    expect(floorRow('LoadCredential=X:/y')?.since).toBe(247);
    expect(floorRow('ProtectProc=nonsense')).toBeNull();
    expect(floorRow('NoSuchDirective=1')).toBeNull();
    expect(new Set(SYSTEMD_DIRECTIVE_FLOORS.map(formOf)).size).toBe(SYSTEMD_DIRECTIVE_FLOORS.length);
  });

  test('checkDirectives passes comments and dated forms; refuses an undated one; every dated form is within the floor', () => {
    const lines = ['# c', '[Service]', 'ProtectClock=yes', 'PrivateTmp=yes', 'LoadCredential=X:/y'];
    expect(checkDirectives(lines)).toBe(lines);
    expect(() => checkDirectives(['Bogus=1'])).toThrow(/does not date/);
    expect(SYSTEMD_FLOOR).toBe(247);
    // A form newer than the floor cannot be dated here: the table grows past 247 only by moving SYSTEMD_FLOOR.
    expect(SYSTEMD_DIRECTIVE_FLOORS.every(row => row.since <= SYSTEMD_FLOOR)).toBe(true);
  });

  test('every rendered unit: every directive dated and within the floor, no omitted comment, LoadCredential= carries the token', () => {
    const map = derive({ ...tlsDeclaration(), web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } });
    const bodies = [
      agentUnit(UNIX).body,
      agentUnit(TLS).body,
      v2Unit(UNIX).body,
      v2ScratchUnitRenderer.render(UNIX, FIXTURE_FACTS)[0]!.body,
      hostMapUnitRenderer.render(map, FIXTURE_FACTS)[0]!.body,
    ];
    for (const body of bodies) {
      expect(body).not.toContain('# omitted');
      for (const line of directives(body)) expect(floorRow(line)?.since ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(SYSTEMD_FLOOR);
    }
    expect(directives(v2Unit(UNIX).body)).toContain('ProtectProc=invisible');
    for (const layout of [UNIX, TLS]) {
      const d = directives(agentUnit(layout).body);
      expect(d).toContain(`LoadCredential=${SERVICE_TOKEN_CREDENTIAL}:${layout.serviceTokenPath}`);
      expect(d.filter(line => line.startsWith('ExecStartPre='))).toEqual([]);
    }
  });
});

describe('ProtectHome= is HOST-WIDE (spec S10)', () => {
  test('a system-layout agent unit renders read-only when ANY declaration on the host is home-bound', () => {
    expect(directives(agentUnit(TLS).body)).toContain('ProtectHome=yes');
    expect(directives(agentUnit(derive(tlsDeclaration(), { anyHomeBound: true })).body)).toContain('ProtectHome=read-only');
  });

  test('one home-layout and one system-layout declaration: read-only on BOTH agent units', () => {
    const home = derive({
      ...unixDeclaration(),
      instance: 'home_one',
      state_root: '/home/museum.example.org/dedalo',
      agent_dir: '/home/museum.example.org/host_agent',
      bun_bin: '/home/museum.example.org/.bun/bin/bun',
    });
    const system = derive({ ...tlsDeclaration(), instance: 'system_one' });
    expect(home.homeBound).toBe(true);
    expect(system.homeBound).toBe(false);
    const anyHomeBound = anySiblingHomeBound([{ source: 'a', layout: home }, { source: 'b', layout: system }]);
    for (const decl of [
      { ...unixDeclaration(), instance: 'home_one', state_root: '/home/museum.example.org/dedalo', agent_dir: '/home/museum.example.org/host_agent', bun_bin: '/home/museum.example.org/.bun/bin/bun' },
      { ...tlsDeclaration(), instance: 'system_one' },
    ]) {
      expect(directives(agentUnit(derive(decl, { anyHomeBound })).body)).toContain('ProtectHome=read-only');
    }
  });
});

describe('nginx write paths (spec §5.9)', () => {
  const nginxSite = (extra: Partial<ReturnType<typeof tlsDeclaration>> = {}) =>
    derive({
      ...tlsDeclaration(),
      state_root: '/home/museum.example.org/dedalo',
      site: { domain: 'museum.example.org', fpm: { flavor: 'debian', version: '8.2' } },
      ...extra,
    });

  test('home layout: no <home>/logs (the site logs are under -/var/log/nginx); every declared log dir; conf_d: -<contrib>; never a lock-dir write path', () => {
    const layout = nginxSite({ web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d', log_dirs: ['/var/log/nginx/museum'] } });
    const rw = directives(agentUnit(layout).body).filter(line => line.startsWith('ReadWritePaths='));
    expect(rw).toEqual([
      'ReadWritePaths=/home/museum.example.org/dedalo',
      'ReadWritePaths=-/var/log/nginx',
      'ReadWritePaths=-/var/lib/nginx',
      'ReadWritePaths=-/var/log/nginx/museum',
      'ReadWritePaths=-/var/lib/dedalo_publication_host/_host/nginx_map/contrib',
    ]);
    expect(rw.some(line => line.includes('/locks'))).toBe(false);
  });

  test("web.nginx_map = 'none': no contrib write path; apache: none of the nginx paths", () => {
    const rw = directives(agentUnit(nginxSite()).body).filter(line => line.startsWith('ReadWritePaths='));
    expect(rw.some(line => line.includes('contrib'))).toBe(false);
    const apache = derive({ ...unixDeclaration(), web: { server: 'apache', unit: 'apache2', log_dirs: ['/var/log/apache2'] } });
    expect(directives(agentUnit(apache).body).filter(line => line.startsWith('ReadWritePaths='))).toEqual(['ReadWritePaths=/srv/dedalo_publication']);
  });
});

describe('the host map oneshot (spec §13.5): exact bytes', () => {
  const conf = derive({ ...tlsDeclaration(), web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } });
  test("Bun 1.4 reads `-c <file> <entry>` as the entry <file>: the bunfig goes as --config=, never -c (the init drill's silent no-op)", () => {
    const exec = hostMapUnitRenderer.render(conf, FIXTURE_FACTS)[0]!.body.split('\n').find(line => line.startsWith('ExecStart='))!;
    const argv = exec.slice('ExecStart='.length).split(' ');
    expect(argv).not.toContain('-c');
    expect(argv.filter(arg => arg.startsWith('--config='))).toEqual(['--config=/var/lib/dedalo_publication_host/_host/map_renderer/empty.bunfig.toml']);
    expect(argv.at(-1)).toBe('/var/lib/dedalo_publication_host/_host/map_renderer/src/rules/host_map_main.ts');
  });

  test('247: oneshot as root, the renderer copy, no argument, an empty environment, stamped _host', () => {
    const unit = hostMapUnitRenderer.render(conf, FIXTURE_FACTS)[0]!;
    expect(unit.path).toBe('/etc/systemd/system/dedalo-pubhost-map.service');
    expect(unit.hostWide).toBe(true);
    expect(parseStamp(unit.body)).toMatchObject({ instance: '_host', kind: 'host_map_unit' });
    expect(unit.body.split('\n').slice(1)).toEqual([
      '# Renders the host-wide nginx media map from every instance\'s contribution (root\'s copy in /var/lib/dedalo_publication_host/_host/map_renderer).',
      '# Started by an agent (polkit: start only); never enabled.',
      '[Unit]',
      'Description=Dédalo publication host: render the host-wide nginx media map',
      'After=nginx.service',
      '',
      '[Service]',
      'Type=oneshot',
      'User=root',
      'Group=root',
      'WorkingDirectory=/var/lib/dedalo_publication_host/_host/map_renderer',
      'ExecStart=/var/lib/dedalo_publication_host/_host/map_renderer/bun --no-env-file --no-install --config=/var/lib/dedalo_publication_host/_host/map_renderer/empty.bunfig.toml /var/lib/dedalo_publication_host/_host/map_renderer/src/rules/host_map_main.ts',
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
    ]);
  });

});
