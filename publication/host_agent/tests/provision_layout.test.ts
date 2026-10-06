/**
 * derive(): every path/owner/mode comes from the declaration; cross-field laws refuse; the
 * marker, the role names and the state-tree ownership come from src/instance/roots.ts.
 */
import { describe, expect, test } from 'bun:test';
import { INSTANCE_PATTERN as CONFIG_INSTANCE_PATTERN, UNIT_PATTERN as CONFIG_UNIT_PATTERN } from '../src/config';
import { WEB_CONFIGTEST_CANDIDATES as EXEC_CONFIGTEST_CANDIDATES } from '../src/exec';
import {
  INSTANCE_MARKER as ROOTS_MARKER,
  STATE_TREE_OWNERSHIP,
  markerContent as rootsMarkerContent,
} from '../src/instance/roots';
import type { HostDeclaration } from '../src/provision/layout';
import {
  INSTANCE_MARKER,
  INSTANCE_PATTERN,
  LayoutError,
  MODES,
  SECRET_LOOKING_KEY,
  UNIT_NAME_PATTERN,
  WEB_CONFIGTEST_CANDIDATES,
  derive,
  groupName,
  markerContent,
  ownerName,
  pickConfigtestBinary,
  pathsOverlap,
} from '../src/provision/layout';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

function refusedField(decl: HostDeclaration): string {
  try {
    derive(decl);
  } catch (error) {
    if (error instanceof LayoutError) return error.field;
    throw error;
  }
  throw new Error('derive accepted the declaration');
}

describe('one definition of every shared name', () => {
  test('the instance grammar is AgentConfig.INSTANCE', () => {
    expect(INSTANCE_PATTERN.source).toBe('^[a-z][a-z0-9_]{1,31}$');
    expect(INSTANCE_PATTERN.source).toBe(CONFIG_INSTANCE_PATTERN.source);
  });

  test("the unit grammar is AgentConfig WEB_UNIT/V2_UNIT's: a derived unit always resolves", () => {
    expect(UNIT_NAME_PATTERN.source).toBe(CONFIG_UNIT_PATTERN.source);
  });

  test('the audit file is agent-owned 0600 (Task 3: append-only by chattr +a, never group-readable)', () => {
    expect(MODES.auditFile).toEqual({ owner: 'agent', group: 'root', mode: 0o600 });
    expect(MODES.audit).toEqual({ owner: 'root', group: 'root', mode: 0o755 });
  });

  test('the marker is instance/roots.ts\' own export, not a restated literal', () => {
    expect(INSTANCE_MARKER).toBe(ROOTS_MARKER);
    expect(markerContent).toBe(rootsMarkerContent);
  });

  test('the configtest candidates are the list exec.ts checks against', () => {
    expect(WEB_CONFIGTEST_CANDIDATES).toBe(EXEC_CONFIGTEST_CANDIDATES);
    expect(WEB_CONFIGTEST_CANDIDATES).toEqual({
      apache: ['/usr/sbin/apache2ctl', '/usr/sbin/apachectl'],
      nginx: ['/usr/sbin/nginx'],
    });
  });

  test('the pick is the first candidate that is a real file on the host (Ubuntu: apachectl is a symlink)', () => {
    const real = (...files: string[]) => (path: string) => files.includes(path);
    // Debian/Ubuntu: apache2ctl real, apachectl -> apache2ctl (lstat: not a regular file).
    expect(derive(unixDeclaration(), { isRealFile: real('/usr/sbin/apache2ctl') }).web.configtestBin).toBe('/usr/sbin/apache2ctl');
    // RHEL/upstream: only apachectl, real.
    const rhel = derive(unixDeclaration(), { isRealFile: real('/usr/sbin/apachectl') });
    expect(rhel.web.configtestBin).toBe('/usr/sbin/apachectl');
    expect(rhel.envVars.WEB_CONFIGTEST_BIN).toBe('/usr/sbin/apachectl');
    // Neither: the first candidate stands, for the plan to refuse by name.
    expect(derive(unixDeclaration(), { isRealFile: real() }).web.configtestBin).toBe('/usr/sbin/apache2ctl');
    // A real file OUTSIDE the list never wins.
    expect(pickConfigtestBinary('apache', real('/opt/evil/apachectl'))).toBe('/usr/sbin/apache2ctl');
  });

  test('MODES owns the state tree exactly as STATE_TREE_OWNERSHIP says', () => {
    for (const [key, owner] of Object.entries(STATE_TREE_OWNERSHIP)) {
      expect(MODES[key as keyof typeof STATE_TREE_OWNERSHIP].owner).toBe(owner);
    }
    for (const key of Object.keys(STATE_TREE_OWNERSHIP) as (keyof typeof STATE_TREE_OWNERSHIP)[]) {
      expect(MODES[key].mode & 0o022).toBe(0);
    }
  });
});

describe('derive — unix instance', () => {
  const layout = derive(unixDeclaration());

  test('config, credential, env and unit paths', () => {
    expect(layout.declarationPath).toBe('/etc/dedalo_publication_host/test.json');
    expect(layout.instanceDir).toBe('/etc/dedalo_publication_host/test');
    expect(layout.serviceTokenPath).toBe('/etc/dedalo_publication_host/test/credentials/SERVICE_TOKEN');
    expect(layout.envFile).toBe('/etc/dedalo_publication_host/test/agent.env');
    expect(layout.agentUnitName).toBe('dedalo-publication-host-test');
    expect(layout.agentUnitPath).toBe('/etc/systemd/system/dedalo-publication-host-test.service');
    expect(layout.v2UnitPath).toBe('/etc/systemd/system/dedalo-publication-api-v2.service');
    expect(layout.v2ScratchUnitPath).toBe('/etc/systemd/system/dedalo-publication-api-v2-scratch@.service');
    expect(layout.sudoersPath).toBe('/etc/sudoers.d/dedalo_publication_host_test');
    expect(layout.polkitPath).toBe('/etc/polkit-1/rules.d/60-dedalo-publication-host-test.rules');
    expect(layout.agentEntry).toBe('/opt/dedalo/publication/host_agent/src/index.ts');
    expect(layout.web.configtestBin).toBe('/usr/sbin/apache2ctl');
    expect(layout.tls).toBeNull();
  });

  test('engine fragment and engine bundle paths', () => {
    expect(layout.engineFragmentPath).toBe('/etc/dedalo_publication_host/test/engine.env.fragment');
    expect(layout.engineBundlePath).toBe('/etc/dedalo_publication_host/test/engine_bundle/engine_bundle.pem');
  });

  test('unix listener: socket under the instance runtime dir', () => {
    expect(layout.listen).toEqual({
      kind: 'unix',
      runtimeDirectory: 'dedalo_publication_host/test',
      runtimeDir: '/run/dedalo_publication_host/test',
      socketPath: '/run/dedalo_publication_host/test/agent.sock',
    });
  });

  test('state tree matches store.ts apiLayout, rules/apply.ts and audit.ts', () => {
    expect(layout.state.marker).toBe(`/srv/dedalo_publication/${INSTANCE_MARKER}`);
    expect(layout.state.apis.v2).toEqual({
      root: '/srv/dedalo_publication/publication_api/v2',
      releases: '/srv/dedalo_publication/publication_api/v2/releases',
      shared: '/srv/dedalo_publication/publication_api/v2/shared',
      staging: '/srv/dedalo_publication/publication_api/v2/staging',
      current: '/srv/dedalo_publication/publication_api/v2/current',
      scratch: '/srv/dedalo_publication/publication_api/v2/scratch',
    });
    expect(layout.state.rules).toBe('/srv/dedalo_publication/rules');
    expect(layout.state.audit).toBe('/srv/dedalo_publication/audit');
    expect(layout.state.auditFile).toBe('/srv/dedalo_publication/audit/audit.jsonl');
  });

  test('directories: parents first, each a MODES row, no current symlink, no shared media root', () => {
    const paths = layout.directories.map(dir => dir.path);
    expect(paths).toEqual([...paths].sort());
    for (const dir of layout.directories) expect(MODES[dir.modeKey]).toBeDefined();
    expect(paths).not.toContain(layout.state.apis.v1.current);
    expect(paths).not.toContain('/mnt/dedalo_media');
    expect(layout.directories.find(dir => dir.path === layout.state.apis.v1.shared)?.modeKey).toBe('v1Shared');
    expect(layout.directories.find(dir => dir.path === layout.state.root)?.modeKey).toBe('stateRoot');
  });

  test('envVars are Task 1\'s env-file keys (INSTANCE = the AgentConfig field), never a credential', () => {
    expect(layout.envVars).toEqual({
      INSTANCE: 'test',
      NODE_ENV: 'production',
      LISTEN_KIND: 'unix',
      SOCKET_PATH: '/run/dedalo_publication_host/test/agent.sock',
      STATE_ROOT: '/srv/dedalo_publication',
      WEB_SERVER: 'apache',
      WEB_UNIT: 'apache2',
      WEB_CONFIGTEST_BIN: '/usr/sbin/apache2ctl',
      MEDIA_MODE: 'shared',
      MEDIA_ROOT: '/mnt/dedalo_media',
      PHP_BIN: '/usr/bin/php',
      V2_UNIT: 'dedalo-publication-api-v2',
      V2_HEALTH_URL: 'http://127.0.0.1:3100/dedalo/publication/server_api/v2/health',
      RELEASES_RETAINED: '3',
    });
    for (const key of Object.keys(layout.envVars)) expect(SECRET_LOOKING_KEY.test(key)).toBe(false);
  });

  test('owners and groups resolve from the declaration; the agent joins both shared groups', () => {
    expect(ownerName(layout, 'agent')).toBe('dedalo-pubhost');
    expect(groupName(layout, 'v1Group')).toBe('www-data');
    expect(groupName(layout, 'v2Group')).toBe('dedalo-api-v2');
    expect(groupName(layout, 'engineGroup')).toBe('dedalo');
    expect(layout.identity.agentSupplementaryGroups).toEqual(['www-data', 'dedalo-api-v2']);
    const same = unixDeclaration();
    expect(
      derive({ ...same, v2: { ...same.v2, group: 'www-data' } }).identity.agentSupplementaryGroups,
    ).toEqual(['www-data']);
  });
});

describe('derive — tls instance', () => {
  const layout = derive(tlsDeclaration());

  test('tls paths, env and the nginx configtest binary', () => {
    expect(layout.tls?.serverKey).toBe('/etc/dedalo_publication_host/test/tls/server.key');
    expect(layout.tls?.clientCa).toBe(layout.tls?.caCert);
    expect(layout.envVars.TLS_HOST).toBe('10.8.0.2');
    expect(layout.envVars.TLS_PORT).toBe('7443');
    expect(layout.envVars.TLS_KEY_FILE).toBe('/etc/dedalo_publication_host/test/tls/server.key');
    expect(layout.envVars.SOCKET_PATH).toBeUndefined();
    expect(layout.web.configtestBin).toBe('/usr/sbin/nginx');
    expect(layout.directories.some(dir => dir.modeKey === 'tlsDir')).toBe(true);
  });

  test('a tls instance has no engine group row', () => {
    expect(() => groupName(layout, 'engineGroup')).toThrow(LayoutError);
  });
});

describe('derive — refusals name the field', () => {
  test('engine_group: required for unix, refused for tls', () => {
    const { engine_group: _dropped, ...noGroup } = unixDeclaration();
    expect(refusedField(noGroup)).toBe('engine_group');
    expect(refusedField({ ...tlsDeclaration(), engine_group: 'dedalo' })).toBe('engine_group');
  });

  test('health url: loopback, http, same port, no query', () => {
    const decl = unixDeclaration();
    const withUrl = (health_url: string): HostDeclaration => ({ ...decl, v2: { ...decl.v2, health_url } });
    expect(refusedField(withUrl('http://10.0.0.1:3100/h'))).toBe('v2.health_url');
    expect(refusedField(withUrl('https://127.0.0.1:3100/h'))).toBe('v2.health_url');
    expect(refusedField(withUrl('http://127.0.0.1:3101/h'))).toBe('v2.health_url');
    expect(refusedField(withUrl('http://127.0.0.1:3100/h?x=1'))).toBe('v2.health_url');
  });

  test('media root: required unless none, absent when none', () => {
    const decl = unixDeclaration();
    expect(refusedField({ ...decl, media: { mode: 'none', root: '/mnt/x' } })).toBe('media.root');
    expect(refusedField({ ...decl, media: { mode: 'copy' } })).toBe('media.root');
  });

  test('paths: absolute, clean, never overlapping', () => {
    expect(refusedField({ ...unixDeclaration(), state_root: 'srv/x' })).toBe('state_root');
    expect(refusedField({ ...unixDeclaration(), state_root: '/srv/../etc' })).toBe('state_root');
    expect(refusedField({ ...unixDeclaration(), state_root: '/' })).toBe('state_root');
    expect(refusedField({ ...unixDeclaration(), state_root: '/etc/dedalo_publication_host/x' })).toBe(
      'paths.config_base',
    );
    expect(refusedField({ ...unixDeclaration(), media: { mode: 'shared', root: '/srv/dedalo_publication/m' } })).toBe(
      'media.root',
    );
  });

  test('units: bare names, v2 distinct from web', () => {
    const decl = unixDeclaration();
    expect(refusedField({ ...decl, v2: { ...decl.v2, unit: 'x.service' } })).toBe('v2.unit');
    expect(refusedField({ ...decl, v2: { ...decl.v2, unit: 'apache2' } })).toBe('v2.unit');
    expect(refusedField({ ...decl, v2: { ...decl.v2, unit: 'api@v2' } })).toBe('v2.unit'); // the scratch template would be malformed
  });

  test('releases_retained bounds', () => {
    expect(refusedField({ ...unixDeclaration(), releases_retained: 1 })).toBe('releases_retained');
    expect(derive({ ...unixDeclaration(), releases_retained: 5 }).envVars.RELEASES_RETAINED).toBe('5');
  });
});

test('pathsOverlap', () => {
  expect(pathsOverlap('/a', '/a/b')).toBe(true);
  expect(pathsOverlap('/a/b', '/a')).toBe(true);
  expect(pathsOverlap('/a', '/ab')).toBe(false);
  expect(pathsOverlap('/', '/x')).toBe(true);
});
