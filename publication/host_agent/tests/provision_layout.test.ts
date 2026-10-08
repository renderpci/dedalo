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
  APACHE_DUMP_CANDIDATES,
  BUN_KERNEL_FLOOR,
  DECLARATION_KEY_ORDER,
  FPM_BIN_PATTERN,
  FPM_FLAVORS,
  HOME_ROOT_MODE,
  HOST_BASE,
  HOST_LOCKS_DIR,
  HOST_MAP_RENDERER_DIR,
  HOST_MAP_UNIT,
  HOST_NGINX_CONTRIB_DIR,
  HOST_NGINX_MAP_DIR,
  INSTANCE_MARKER,
  INSTANCE_PATTERN,
  LayoutError,
  MODES,
  NGINX_FLOOR,
  NGINX_MAP_INCLUDE_PATH,
  PHP_CLI_PATTERN,
  PUBHOST_GROUP,
  SYSTEMD_FLOOR,
  V1_PHP_FLOOR,
  FORBIDDEN_V1_USERS,
  canonicalDeclaration,
  fpmLayout,
  webUserFor,
  inferLayout,
  layoutPaths,
  SECRET_LOOKING_KEY,
  UNIT_NAME_PATTERN,
  WEB_CONFIGTEST_CANDIDATES,
  derive,
  groupName,
  markerContent,
  ownerName,
  pickConfigtestBinary,
  pathsOverlap,
  webLogBase,
} from '../src/provision/layout';
import { HOST_LOCK_FILES } from '../src/provision/layout';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

/** A home-layout site declaration (decision B): apache, Debian FPM 8.4. */
function siteDeclaration(overrides: Partial<HostDeclaration> = {}): HostDeclaration {
  return {
    ...unixDeclaration(),
    agent_dir: '/home/example.org/host_agent',
    state_root: '/home/example.org/dedalo',
    bun_bin: '/home/example.org/.bun/bin/bun',
    v1: { user: 'test_v1' },
    media: { mode: 'none' },
    site: { domain: 'example.org', fpm: { flavor: 'debian', version: '8.4' } },
    ...overrides,
  };
}

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
      V2_HEALTH_URL: 'http://127.0.0.1:3100/health',
      RELEASES_RETAINED: '3',
    });
    for (const key of Object.keys(layout.envVars)) expect(SECRET_LOOKING_KEY.test(key)).toBe(false);
  });

  test('owners and groups resolve from the declaration; the agent joins the v2 group only', () => {
    expect(ownerName(layout, 'agent')).toBe('dedalo-pubhost');
    expect(groupName(layout, 'v2Group')).toBe('dedalo-api-v2');
    expect(groupName(layout, 'engineGroup')).toBe('dedalo');
    expect(layout.identity.v1User).toBe('dedalo-api-v1');
    // No web/v1 group: the agent never reads the v1 configuration (v1/shared is root:root 0711).
    expect(layout.identity.agentSupplementaryGroups).toEqual(['dedalo-api-v2']);
    expect(MODES.v1Shared).toEqual({ owner: 'root', group: 'root', mode: 0o711 });
  });

  test('agent, v1 and v2 are three distinct users, none of them root', () => {
    const d = unixDeclaration();
    expect(() => derive({ ...d, v1: { user: d.agent_user } })).toThrow(/v1\.user: must differ from agent_user/);
    expect(() => derive({ ...d, v2: { ...d.v2, user: d.v1.user } })).toThrow(/v2\.user: must differ from v1\.user/);
    expect(() => derive({ ...d, v2: { ...d.v2, user: d.agent_user } })).toThrow(/v2\.user: must differ from agent_user/);
    expect(() => derive({ ...d, v1: { user: 'root' } })).toThrow(/v1\.user: must not be root/);
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

describe('provision init constants (spec §2.2)', () => {
  test('the host-wide paths and names', () => {
    expect(HOST_BASE).toBe('/var/lib/dedalo_publication_host/_host');
    expect([HOST_LOCKS_DIR, HOST_NGINX_MAP_DIR, HOST_NGINX_CONTRIB_DIR, HOST_MAP_RENDERER_DIR]).toEqual([
      '/var/lib/dedalo_publication_host/_host/locks',
      '/var/lib/dedalo_publication_host/_host/nginx_map',
      '/var/lib/dedalo_publication_host/_host/nginx_map/contrib',
      '/var/lib/dedalo_publication_host/_host/map_renderer',
    ]);
    expect([HOST_MAP_UNIT, PUBHOST_GROUP, NGINX_MAP_INCLUDE_PATH]).toEqual([
      'dedalo-pubhost-map',
      'dedalo_pubhost',
      '/etc/nginx/conf.d/dedalo_media_map.conf',
    ]);
    expect(HOST_LOCK_FILES).toEqual({ provision: 'provision.lock', web: 'web.lock' });
    // '_host' can never be an instance: no collision with <V1_VAR_BASE>/<instance>.
    expect(INSTANCE_PATTERN.test('_host')).toBe(false);
  });

  test('the floors and the home mode (decision B; owner question 1 pending)', () => {
    expect(HOME_ROOT_MODE).toBe(0o755);
    expect([BUN_KERNEL_FLOOR, V1_PHP_FLOOR, NGINX_FLOOR]).toEqual(['5.1', '8.1', '1.14']);
    expect(SYSTEMD_FLOOR).toBe(247);
    expect(APACHE_DUMP_CANDIDATES).toEqual(['/usr/sbin/apache2ctl', '/usr/sbin/httpd']);
  });

  test('FPM_BIN_PATTERN and PHP_CLI_PATTERN: the three flavours, nothing else', () => {
    for (const bin of ['/usr/sbin/php-fpm8.2', '/usr/sbin/php-fpm', '/opt/remi/php84/root/usr/sbin/php-fpm']) {
      expect(FPM_BIN_PATTERN.test(bin)).toBe(true);
    }
    for (const bin of ['/usr/local/sbin/php-fpm', '/opt/remi/php841/root/usr/sbin/php-fpm', '/usr/sbin/php-fpm8', '/usr/sbin/php-fpm8.2 ']) {
      expect(FPM_BIN_PATTERN.test(bin)).toBe(false);
    }
    for (const cli of ['/usr/bin/php8.4', '/usr/bin/php', '/opt/remi/php82/root/usr/bin/php']) expect(PHP_CLI_PATTERN.test(cli)).toBe(true);
    for (const cli of ['/usr/local/bin/php', '/usr/bin/php8', '/opt/remi/php8/root/usr/bin/php']) expect(PHP_CLI_PATTERN.test(cli)).toBe(false);
  });

  test('the new MODES rows (spec §5, §7, §13.2)', () => {
    expect(MODES.hostLocks).toEqual({ owner: 'root', group: 'pubhost', mode: 0o750 });
    expect(MODES.hostNginxMap).toEqual({ owner: 'root', group: 'root', mode: 0o755 });
    expect(MODES.hostNginxContrib).toEqual({ owner: 'root', group: 'pubhost', mode: 0o3770 });
    expect(MODES.hostMapRenderer).toEqual({ owner: 'root', group: 'root', mode: 0o755 });
    expect(MODES.hostWebLock).toEqual({ owner: 'root', group: 'pubhost', mode: 0o640 });
    expect(MODES.hostProvisionLock).toEqual({ owner: 'root', group: 'root', mode: 0o600 });
    expect(MODES.v2Env).toEqual({ owner: 'root', group: 'v2Group', mode: 0o640 });
    expect(MODES.v1Config).toEqual({ owner: 'v1', group: 'root', mode: 0o400 });
    expect(MODES.initState).toEqual({ owner: 'root', group: 'root', mode: 0o700 });
    expect(MODES.journal).toEqual({ owner: 'root', group: 'root', mode: 0o600 });
    for (const key of ['webInclude', 'fpmPool', 'nginxMapInclude'] as const) {
      expect(MODES[key]).toEqual({ owner: 'root', group: 'root', mode: 0o644 });
    }
  });

  test("ModeOwner 'v1' and ModeGroup 'pubhost' resolve", () => {
    const layout = derive(siteDeclaration());
    expect(ownerName(layout, 'v1')).toBe('test_v1');
    expect(ownerName(layout, 'root')).toBe('root');
    expect(groupName(layout, 'pubhost')).toBe('dedalo_pubhost');
    expect(() => ownerName(layout, 'nobody' as 'root')).toThrow(/unknown mode owner/);
  });
});

describe('derive — the site block (spec S5, S6)', () => {
  test('a declaration without a site has no site, nginx_map none, the default host paths', () => {
    const layout = derive(unixDeclaration());
    expect(layout.site).toBeNull();
    expect(layout.web.nginxMap).toBe('none');
    expect(layout.web.logDirs).toEqual([]);
    expect(layout.host).toEqual({
      base: HOST_BASE,
      locksDir: HOST_LOCKS_DIR,
      provisionLock: `${HOST_LOCKS_DIR}/provision.lock`,
      webLock: `${HOST_LOCKS_DIR}/web.lock`,
      nginxMapDir: HOST_NGINX_MAP_DIR,
      nginxContribDir: HOST_NGINX_CONTRIB_DIR,
      mapRendererDir: HOST_MAP_RENDERER_DIR,
      nginxConfD: '/etc/nginx/conf.d',
      nginxMapInclude: NGINX_MAP_INCLUDE_PATH,
    });
  });

  test.each([
    [
      'debian',
      'apache',
      {
        pool: 'dedalo_test_v1',
        poolFile: '/etc/php/8.4/fpm/pool.d/dedalo_test_v1.conf',
        unit: 'php8.4-fpm',
        bin: '/usr/sbin/php-fpm8.4',
        cli: '/usr/bin/php8.4',
        listen: '/run/php/dedalo-test-v1.sock',
        webUser: 'www-data',
      },
    ],
    [
      'el',
      'apache',
      {
        pool: 'dedalo_test_v1',
        poolFile: '/etc/php-fpm.d/dedalo_test_v1.conf',
        unit: 'php-fpm',
        bin: '/usr/sbin/php-fpm',
        cli: '/usr/bin/php',
        listen: '/run/php-fpm/dedalo-test-v1.sock',
        webUser: 'apache',
      },
    ],
    [
      'remi',
      'nginx',
      {
        pool: 'dedalo_test_v1',
        poolFile: '/etc/opt/remi/php84/php-fpm.d/dedalo_test_v1.conf',
        unit: 'php84-php-fpm',
        bin: '/opt/remi/php84/root/usr/sbin/php-fpm',
        cli: '/opt/remi/php84/root/usr/bin/php',
        listen: '/var/opt/remi/php84/run/php-fpm/dedalo-test-v1.sock',
        webUser: 'nginx',
      },
    ],
  ] as const)('the S5 table: %s on %s', (flavor, server, expected) => {
    const layout = derive(
      siteDeclaration({
        web: { server, unit: server === 'apache' ? 'httpd' : 'nginx' },
        site: { domain: 'example.org', fpm: { flavor, version: '8.4' } },
      }),
    );
    expect(layout.site?.fpm).toEqual({ flavor, version: '8.4', ...expected });
  });

  test('the derived site: home, the web logs OUTSIDE it, api paths, v1Var, protectHome', () => {
    const layout = derive(siteDeclaration());
    expect(layout.site).toMatchObject({
      domain: 'example.org',
      home: '/home/example.org',
      webLogsDir: '/var/log/apache2/example.org',
      apiPaths: { v1: '/dedalo/publication/server_api/v1', v2: '/dedalo/publication/server_api/v2' },
      v1Var: {
        root: '/var/lib/dedalo_publication_host/test/v1',
        tmp: '/var/lib/dedalo_publication_host/test/v1/tmp',
        log: '/var/lib/dedalo_publication_host/test/v1/log',
      },
    });
    expect(layout.homeBound).toBe(true);
    expect(layout.protectHome).toBe('read-only');
  });

  test("owner decision 1(c): the site's web logs are the distribution's log dir per site; the logrotate file is per instance", () => {
    const site = (server: 'apache' | 'nginx', flavor: 'debian' | 'el' | 'remi') =>
      derive(siteDeclaration({ web: { server, unit: server === 'nginx' ? 'nginx' : flavor === 'debian' ? 'apache2' : 'httpd' }, site: { domain: 'example.org', fpm: { flavor, version: '8.4' } } }));
    expect(site('apache', 'debian').site?.webLogsDir).toBe('/var/log/apache2/example.org');
    expect(site('apache', 'el').site?.webLogsDir).toBe('/var/log/httpd/example.org');
    expect(site('apache', 'remi').site?.webLogsDir).toBe('/var/log/httpd/example.org');
    expect(site('nginx', 'debian').site?.webLogsDir).toBe('/var/log/nginx/example.org');
    expect(site('nginx', 'el').site?.webLogsDir).toBe('/var/log/nginx/example.org');
    expect(webLogBase('apache', 'debian')).toBe('/var/log/apache2');
    expect(derive(siteDeclaration()).logrotatePath).toBe('/etc/logrotate.d/dedalo_test_web');
    const scratch = derive(siteDeclaration({ paths: { web_log_base: '/scratch/log', logrotate_dir: '/scratch/logrotate.d' } }));
    expect(scratch.site?.webLogsDir).toBe('/scratch/log/example.org');
    expect(scratch.logrotatePath).toBe('/scratch/logrotate.d/dedalo_test_web');
    expect(() => derive(siteDeclaration({ paths: { web_log_base: '/' } }))).toThrow('paths.web_log_base');
  });

  test('ProtectHome= is host-wide (spec S10): a home-bound sibling makes a system-layout instance read-only', () => {
    expect(derive(unixDeclaration()).protectHome).toBe('yes');
    expect(derive(unixDeclaration(), { anyHomeBound: true }).protectHome).toBe('read-only');
    expect(derive(unixDeclaration()).homeBound).toBe(false);
  });

  test('the scratch-root overrides repoint the host tree, the pool dir and v1Var', () => {
    const layout = derive(
      siteDeclaration({
        paths: { host_base: '/scratch/_host', nginx_conf_d: '/scratch/conf.d', fpm_pool_dir: '/scratch/pool.d', v1_var_base: '/scratch/var' },
      }),
    );
    expect(layout.host.webLock).toBe('/scratch/_host/locks/web.lock');
    expect(layout.host.nginxMapInclude).toBe('/scratch/conf.d/dedalo_media_map.conf');
    expect(layout.site?.fpm.poolFile).toBe('/scratch/pool.d/dedalo_test_v1.conf');
    expect(layout.site?.v1Var.root).toBe('/scratch/var/test/v1');
  });

  test('declared site home and api paths; nginx conf_d; log dirs', () => {
    const layout = derive(
      siteDeclaration({
        web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d', log_dirs: ['/var/log/nginx/example'] },
        site: {
          domain: 'example.org',
          home: '/srv/sites/example.org',
          api_paths: { v1: '/api/v1', v2: '/api/v2' },
          fpm: { flavor: 'debian', version: '8.2' },
        },
      }),
    );
    expect(layout.site?.home).toBe('/srv/sites/example.org');
    expect(layout.site?.apiPaths).toEqual({ v1: '/api/v1', v2: '/api/v2' });
    expect(layout.web.nginxMap).toBe('conf_d');
    expect(layout.web.logDirs).toEqual(['/var/log/nginx/example']);
  });

  test.each([
    [{ site: { domain: 'Example.org', fpm: { flavor: 'debian', version: '8.4' } } }, 'site.domain'],
    [{ site: { domain: 'example.org\nx', fpm: { flavor: 'debian', version: '8.4' } } }, 'site.domain'],
    [{ site: { domain: 'localhost', fpm: { flavor: 'debian', version: '8.4' } } }, 'site.domain'],
    [{ site: { domain: 'example.org', home: '/home', fpm: { flavor: 'debian', version: '8.4' } } }, 'site.home'],
    [{ site: { domain: 'example.org', home: '/var/www', fpm: { flavor: 'debian', version: '8.4' } } }, 'site.home'],
    [{ site: { domain: 'example.org', home: '/home/../etc', fpm: { flavor: 'debian', version: '8.4' } } }, 'site.home'],
    [{ site: { domain: 'example.org', fpm: { flavor: 'debian', version: '8' } } }, 'site.fpm.version'],
    [{ site: { domain: 'example.org', fpm: { flavor: 'debian', version: '7.2' } } }, 'site.fpm.version'],
    [{ site: { domain: 'example.org', fpm: { flavor: 'debian', version: '8.0' } } }, 'site.fpm.version'],
    [{ site: { domain: 'example.org', fpm: { flavor: 'remi', version: '8.10' } } }, 'site.fpm.version'],
    [{ site: { domain: 'example.org', fpm: { flavor: 'scl', version: '8.4' } } }, 'site.fpm.flavor'],
    [{ site: { domain: 'example.org', api_paths: { v1: '/a/../b', v2: '/v2' }, fpm: { flavor: 'el', version: '8.4' } } }, 'site.api_paths.v1'],
    [{ site: { domain: 'example.org', api_paths: { v1: '/v1/', v2: '/v2' }, fpm: { flavor: 'el', version: '8.4' } } }, 'site.api_paths.v1'],
    [{ site: { domain: 'example.org', api_paths: { v1: '/api', v2: '/api/v2' }, fpm: { flavor: 'el', version: '8.4' } } }, 'site.api_paths.v2'],
    [{ v1: { user: 'www-data' } }, 'v1.user'],
    [{ v1: { user: 'nobody' } }, 'v1.user'],
    [{ web: { server: 'apache', unit: 'apache2', nginx_map: 'conf_d' } }, 'web.nginx_map'],
    [{ web: { server: 'nginx', unit: 'nginx', nginx_map: 'yes' as 'none' } }, 'web.nginx_map'],
    [{ web: { server: 'nginx', unit: 'nginx', log_dirs: ['/var/log/x', '/var/log/x'] } }, 'web.log_dirs'],
    [{ web: { server: 'nginx', unit: 'nginx', log_dirs: ['/'] } }, 'web.log_dirs'],
    [{ web: { server: 'nginx', unit: 'nginx', log_dirs: ['relative'] } }, 'web.log_dirs.0'],
    [{ paths: { host_base: '/' } }, 'paths.host_base'],
    [{ paths: { v1_var_base: '/' } }, 'paths.v1_var_base'],
    [{ state_root: '/var/lib/dedalo_publication_host/_host/x' }, 'paths.host_base'],
    [{ state_root: '/var/lib/dedalo_publication_host/test' }, 'site.v1Var'],
  ] as const)('refused: %p → %s', (overrides, field) => {
    expect(refusedField(siteDeclaration(overrides as Partial<HostDeclaration>))).toBe(field);
  });

  test('v1.user is never a web or catch-all account, with or without a site; every derived web user is in that set', () => {
    for (const user of FORBIDDEN_V1_USERS) {
      expect(refusedField({ ...unixDeclaration(), v1: { user } })).toBe('v1.user');
    }
    for (const flavor of FPM_FLAVORS) {
      for (const server of ['apache', 'nginx'] as const) expect(FORBIDDEN_V1_USERS).toContain(webUserFor(flavor, server));
    }
  });

  test('the web user of the flavour is never v1.user (EL apache / nginx)', () => {
    expect(
      refusedField(
        siteDeclaration({ web: { server: 'nginx', unit: 'nginx' }, v1: { user: 'nginx' }, site: { domain: 'example.org', fpm: { flavor: 'el', version: '8.4' } } }),
      ),
    ).toBe('v1.user');
  });

  test('fpmLayout repeats the table for any instance; FPM_FLAVORS is the closed set', () => {
    expect(FPM_FLAVORS).toEqual(['debian', 'el', 'remi']);
    expect(fpmLayout('museum', 'el', '8.1', 'nginx').listen).toBe('/run/php-fpm/dedalo-museum-v1.sock');
  });
});

describe('layoutPaths / inferLayout (spec S6)', () => {
  test('the two path columns', () => {
    expect(layoutPaths('home', 'test', '/home/example.org')).toEqual({
      state_root: '/home/example.org/dedalo',
      agent_dir: '/home/example.org/host_agent',
      bun_bin: '/home/example.org/.bun/bin/bun',
    });
    expect(layoutPaths('system', 'test', null)).toEqual({
      state_root: '/srv/dedalo_publication_host/test',
      agent_dir: '/opt/dedalo_publication_host/host_agent',
      bun_bin: '/opt/dedalo_publication_host/bun/bin/bun',
    });
    expect(() => layoutPaths('home', 'test', null)).toThrow(/needs a site/);
  });

  test('home when all three paths are the home column (or a relocated name), else system; no site → system', () => {
    expect(inferLayout(siteDeclaration())).toBe('home');
    expect(inferLayout(siteDeclaration({ bun_bin: '/home/example.org/.dedalo_bun/bin/bun', agent_dir: '/home/example.org/dedalo_host_agent' }))).toBe('home');
    expect(inferLayout(siteDeclaration({ state_root: '/home/example.org/dedalo_publication' }))).toBe('home');
    expect(inferLayout(siteDeclaration({ bun_bin: '/opt/dedalo_publication_host/bun/bin/bun' }))).toBe('system');
    expect(inferLayout(unixDeclaration())).toBe('system');
    const declaredHome = siteDeclaration({
      site: { domain: 'example.org', home: '/srv/sites/ex', fpm: { flavor: 'debian', version: '8.4' } },
      ...{ state_root: '/srv/sites/ex/dedalo', agent_dir: '/srv/sites/ex/host_agent', bun_bin: '/srv/sites/ex/.bun/bin/bun' },
    });
    expect(inferLayout(declaredHome)).toBe('home');
  });
});

describe('canonicalDeclaration (spec §2.2): the one body writer', () => {
  test('two-space JSON, keys in DECLARATION_KEY_ORDER, a trailing newline; idempotent', () => {
    // Every key in REVERSE order, nested blocks too.
    const reversed = (value: unknown): unknown =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reversed(child)]))
        : value;
    const scrambled = reversed(siteDeclaration()) as HostDeclaration;
    expect(Object.keys(scrambled)[0]).not.toBe('instance');
    const body = canonicalDeclaration(scrambled);
    expect(body.endsWith('}\n')).toBe(true);
    expect(body.split('\n')[1]).toBe('  "instance": "test",');
    const keys = Object.keys(JSON.parse(body));
    expect(keys).toEqual(Object.keys(DECLARATION_KEY_ORDER).filter(key => keys.includes(key)));
    expect(Object.keys(JSON.parse(body).site)).toEqual(['domain', 'fpm']);
    expect(Object.keys(JSON.parse(body).site.fpm)).toEqual(['flavor', 'version']);
    expect(canonicalDeclaration(JSON.parse(body))).toBe(body);
    expect(JSON.parse(body)).toEqual(scrambled);
  });

  test('an unknown key throws, never dropped', () => {
    expect(() => canonicalDeclaration({ ...unixDeclaration(), extra: 1 } as HostDeclaration)).toThrow(/extra: is not a declaration key/);
    const decl = unixDeclaration();
    expect(() => canonicalDeclaration({ ...decl, web: { ...decl.web, reload: 'x' } } as HostDeclaration)).toThrow(/web\.reload/);
  });

  test('arrays keep their order', () => {
    const body = canonicalDeclaration(siteDeclaration({ web: { server: 'nginx', unit: 'nginx', log_dirs: ['/b', '/a'] } }));
    expect(JSON.parse(body).web.log_dirs).toEqual(['/b', '/a']);
  });
});
