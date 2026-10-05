/**
 * The two systemd units, rendered from Task 8's derived layout (the unix/apache and
 * tls/nginx fixture declarations).
 */
import { describe, expect, test } from 'bun:test';
import { CREDENTIAL_KEYS, ENV_FILE_VAR } from '../src/config';
import { parseStamp } from '../src/provision/hash';
import type { AgentLayout } from '../src/provision/layout';
import { derive, LayoutError, SERVICE_TOKEN_CREDENTIAL } from '../src/provision/layout';
import {
  AGENT_ENV_FILE_VAR,
  agentUnitRenderer,
  NGINX_CONFIGTEST_WRITE_PATHS,
  NNP_IMPLYING_DIRECTIVES,
} from '../src/provision/render/unit_agent';
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

  test('groups: unix → Group= the engine group; the web and v2 groups are supplementary on both', () => {
    const unix = directives(agentUnit(UNIX).body);
    expect(unix).toContain('Group=dedalo');
    expect(unix).toContain('SupplementaryGroups=www-data dedalo-api-v2');
    const tls = directives(agentUnit(TLS).body);
    expect(tls.filter(line => line.startsWith('Group='))).toEqual([]);
    expect(tls).toContain('SupplementaryGroups=www-data dedalo-api-v2');
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
    expect(d).toContain(`ExecStart=${ENV_BIN} NODE_ENV=production HOST=127.0.0.1 PORT=3100 /usr/local/bin/bun run src/index.ts`);
    expect(d).toContain(`AssertFileIsExecutable=${ENV_BIN}`);
    expect(d.filter(line => line.startsWith('Environment='))).toEqual([]);
  });

  test('v2 sharing the agent user is refused', () => {
    const decl = unixDeclaration();
    const shared = derive({ ...decl, v2: { ...decl.v2, user: decl.agent_user } });
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
    expect(d).toContain(`ExecStart=${ENV_BIN} NODE_ENV=production HOST=127.0.0.1 PORT=%i /usr/local/bin/bun run src/index.ts`);
    expect(d.filter(line => line.startsWith('Environment='))).toEqual([]);
  });

  test('v2 sharing the agent user is refused', () => {
    const decl = unixDeclaration();
    const shared = derive({ ...decl, v2: { ...decl.v2, user: decl.agent_user } });
    expect(() => v2ScratchUnitRenderer.render(shared, FIXTURE_FACTS)).toThrow(/its own user/);
  });
});
