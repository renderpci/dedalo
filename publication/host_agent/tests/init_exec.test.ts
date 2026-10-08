/**
 * initExec() — `provision init`'s closed set (spec §2.4): exactly 22 commands, disjoint from
 * provisionExec()'s 24, every argument validated before anything spawns, exact argv through
 * the injected spawner (seam: SyncSpawner + ExecProbe, no real fs, no root). The pairing child
 * gets the token on stdin only, starts with `setsid --wait`, and sees an allowlisted env.
 * Real read-only runs: Linux only (RED there when the tool is missing), skipped on Darwin.
 */
import { describe, expect, test } from 'bun:test';
import type { ExecProbe, ExecResult, SyncSpawnOptions, SyncSpawner } from '../src/exec';
import { COMMAND_TIMEOUT_MS, PAIR_SCRIPT, PROVISION_PATH, initExec, provisionExec, provisionSpawner } from '../src/exec';
import type { PairInvocation } from '../src/provision/exec_contract';
import { CANDIDATE_UNIT_PATTERNS, PAIR_TIMEOUT_MS, UNIT_SHOW_PROPERTIES } from '../src/provision/exec_contract';

function recording(answer: (argv: readonly string[]) => ExecResult = () => ({ code: 0, stdout: '', stderr: '' })) {
  const calls: { argv: readonly string[]; options: SyncSpawnOptions }[] = [];
  const spawner: SyncSpawner = {
    run(argv, options) {
      calls.push({ argv, options });
      return answer(argv);
    },
  };
  return { spawner, calls };
}

type Facts = { type: 'file' | 'dir' | 'symlink' | 'other'; uid: number; mode: number };
const FILE: Facts = { type: 'file', uid: 0, mode: 0o755 };
function probeOf(table: Record<string, Facts>, real: Record<string, string> = {}): ExecProbe {
  return { lstat: path => table[path] ?? null, realpath: path => real[path] ?? null };
}

const DEBIAN = probeOf(
  { '/etc/debian_version': FILE, '/usr/sbin/php-fpm8.4': FILE, '/opt/remi/php82/root/usr/sbin/php-fpm': FILE },
  { '/usr/bin/php': '/usr/bin/php8.4', '/opt/remi/php82/root/usr/bin/php': '/opt/remi/php82/root/usr/bin/php' },
);
const EL = probeOf({ '/usr/sbin/php-fpm': FILE });

const TOKEN = 'A'.repeat(43);
function invocation(overrides: Partial<PairInvocation> = {}): PairInvocation {
  return {
    user: 'dedalo',
    bun: '/home/dedalo/.bun/bin/bun',
    checkout: '/home/dedalo/master_dedalo',
    verb: 'add',
    name: 'test',
    fragment: '/etc/dedalo_publication_host/test/engine.env.fragment',
    dryRun: false,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/dedalo', LC_ALL: 'C', DEDALO_PRIVATE_DIR: '/home/dedalo/private' },
    token: TOKEN,
    ...overrides,
  };
}

test('the closed set: exactly these 22 named commands (spec §2.4)', () => {
  expect(Object.keys(initExec()).sort()).toEqual([
    'apacheModules',
    'apacheVhosts',
    'bunVersion',
    'disableApacheModules',
    'enableApacheModules',
    'fpmDump',
    'groupAdd',
    'groupDb',
    'groupLookup',
    'listCandidateUnits',
    'pairAsEngine',
    'passwdDb',
    'passwdLookup',
    'phpVersion',
    'polkitVersion',
    'setsebool',
    'unameMachine',
    'unitShow',
    'unzipBun',
    'userAddInGroup',
    'userAddOwnGroup',
    'webVersion',
  ]);
});

test('a command lives in exactly one set: initExec and provisionExec are disjoint', () => {
  const provision = new Set(Object.keys(provisionExec()));
  expect(Object.keys(initExec()).filter(name => provision.has(name))).toEqual([]);
  // The three moved in revision 4 are provisionExec's only.
  for (const moved of ['systemdVersion', 'semanagePortList', 'selinuxLabel']) {
    expect(provision.has(moved)).toBe(true);
    expect(Object.keys(initExec())).not.toContain(moved);
  }
  // The account creators and setsebool never in the apply/check set.
  for (const creator of ['groupAdd', 'userAddOwnGroup', 'userAddInGroup', 'setsebool', 'pairAsEngine']) {
    expect(provision.has(creator)).toBe(false);
  }
});

describe('exact argv through the injected spawner', () => {
  test('discovery, accounts, modules, Bun and booleans: fixed PATH, LC_ALL=C, timeout, no stdin', () => {
    const { spawner, calls } = recording();
    const x = initExec(spawner, DEBIAN);
    x.unameMachine();
    x.passwdDb();
    x.groupDb();
    x.passwdLookup('dedalo_pubhost');
    x.groupLookup('dedalo_pubhost');
    x.unitShow('fapolicyd');
    x.listCandidateUnits();
    x.polkitVersion();
    x.apacheVhosts('/usr/sbin/apache2ctl');
    x.apacheModules('/usr/sbin/httpd');
    x.fpmDump('/usr/sbin/php-fpm8.4');
    x.phpVersion('/usr/bin/php');
    x.phpVersion('/opt/remi/php82/root/usr/bin/php');
    x.groupAdd('dedalo_pubhost');
    x.userAddOwnGroup('test_v1', '/usr/sbin/nologin');
    x.userAddInGroup('dedalo-api-v2', 'dedalo-api-v2', '/sbin/nologin');
    x.enableApacheModules(['proxy_fcgi', 'headers']);
    x.disableApacheModules(['headers']);
    x.unzipBun('/var/lib/dedalo_publication_host_init/test/stage/bun/bun-linux-x64.zip', 'bun-linux-x64', '/var/lib/x/bun_extract');
    x.bunVersion('/home/example.org/.bun/bin/bun');
    x.setsebool('httpd_can_network_relay', true);
    x.setsebool('httpd_enable_homedirs', false);
    x.webVersion('/usr/sbin/nginx');
    x.webVersion('/usr/sbin/httpd');
    expect(calls.map(c => c.argv)).toEqual([
      ['uname', '-m'],
      ['getent', 'passwd'],
      ['getent', 'group'],
      ['getent', 'passwd', 'dedalo_pubhost'],
      ['getent', 'group', 'dedalo_pubhost'],
      ['systemctl', 'show', 'fapolicyd.service', ...UNIT_SHOW_PROPERTIES.flatMap(p => ['-p', p])],
      ['systemctl', 'list-units', '--all', '--plain', '--no-legend', '--no-pager', ...CANDIDATE_UNIT_PATTERNS],
      ['pkaction', '--version'],
      ['/usr/sbin/apache2ctl', '-S'],
      ['/usr/sbin/httpd', '-M'],
      ['/usr/sbin/php-fpm8.4', '-tt'],
      ['/usr/bin/php8.4', '-n', '-r', 'echo PHP_VERSION;'],
      ['/opt/remi/php82/root/usr/bin/php', '-n', '-r', 'echo PHP_VERSION;'],
      ['groupadd', '--system', 'dedalo_pubhost'],
      ['useradd', '--system', '--no-create-home', '--shell', '/usr/sbin/nologin', '--user-group', 'test_v1'],
      ['useradd', '--system', '--no-create-home', '--shell', '/sbin/nologin', '-g', 'dedalo-api-v2', 'dedalo-api-v2'],
      ['a2enmod', '-q', 'proxy_fcgi', 'headers'],
      ['a2dismod', '-q', 'headers'],
      [
        'unzip',
        '-q',
        '-o',
        '-j',
        '/var/lib/dedalo_publication_host_init/test/stage/bun/bun-linux-x64.zip',
        'bun-linux-x64/bun',
        '-d',
        '/var/lib/x/bun_extract',
      ],
      ['/home/example.org/.bun/bin/bun', '--version'],
      ['setsebool', '-P', 'httpd_can_network_relay', 'on'],
      ['setsebool', '-P', 'httpd_enable_homedirs', 'off'],
      ['/usr/sbin/nginx', '-v'],
      ['/usr/sbin/httpd', '-v'],
    ]);
    for (const c of calls) {
      expect(c.options).toEqual({ env: { PATH: PROVISION_PATH, LC_ALL: 'C' }, timeoutMs: COMMAND_TIMEOUT_MS });
    }
  });

  test('the unitShow properties include the sandbox values (spec §3.2 hardened hosts)', () => {
    for (const property of ['ProtectHome', 'ProtectSystem', 'InaccessiblePaths', 'ReadOnlyPaths', 'TemporaryFileSystem']) {
      expect(UNIT_SHOW_PROPERTIES).toContain(property as (typeof UNIT_SHOW_PROPERTIES)[number]);
    }
  });

  test('an EL FPM install is a real file too; EL has no a2enmod', () => {
    const { spawner, calls } = recording();
    const x = initExec(spawner, EL);
    x.fpmDump('/usr/sbin/php-fpm');
    expect(calls.map(c => c.argv)).toEqual([['/usr/sbin/php-fpm', '-tt']]);
    expect(() => x.enableApacheModules(['proxy_fcgi'])).toThrow(/Debian family only/);
    expect(() => x.disableApacheModules(['proxy_fcgi'])).toThrow(/Debian family only/);
    expect(calls).toHaveLength(1);
  });
});

describe('pairAsEngine (spec §6 B5)', () => {
  test('setsid first, the token on stdin and never in argv or env, the allowlisted env, cwd = checkout, 120 s', () => {
    const { spawner, calls } = recording();
    initExec(spawner, DEBIAN).pairAsEngine(invocation({ dryRun: true }));
    const call = calls[0];
    expect(call?.argv).toEqual([
      'setsid',
      '--wait',
      'runuser',
      '-u',
      'dedalo',
      '--',
      '/home/dedalo/.bun/bin/bun',
      '--no-install',
      `/home/dedalo/master_dedalo/${PAIR_SCRIPT}`,
      'add',
      'test',
      '--fragment',
      '/etc/dedalo_publication_host/test/engine.env.fragment',
      '--token-stdin',
      '--dry-run',
    ]);
    expect(call?.options.cwd).toBe('/home/dedalo/master_dedalo');
    expect(call?.options.timeoutMs).toBe(PAIR_TIMEOUT_MS);
    expect(new TextDecoder().decode(call?.options.input)).toBe(TOKEN);
    expect(call?.options.env).toEqual(invocation().env);
    expect(JSON.stringify(call?.argv)).not.toContain(TOKEN);
    expect(JSON.stringify(call?.options.env)).not.toContain(TOKEN);
    expect(Object.keys(call?.options.env ?? {})).not.toContain('NODE_ENV');
    calls.length = 0;
    initExec(spawner, DEBIAN).pairAsEngine(invocation({ verb: 'replace' }));
    expect(calls[0]?.argv.slice(9)).toEqual([
      'replace',
      'test',
      '--fragment',
      '/etc/dedalo_publication_host/test/engine.env.fragment',
      '--token-stdin',
    ]);
  });

  test('its stdin is delivered to a real child (a stub echoes the byte count)', () => {
    const counted = provisionSpawner.run(['/bin/sh', '-c', 'wc -c'], {
      env: { PATH: '/usr/bin:/bin' },
      input: new TextEncoder().encode(TOKEN),
      timeoutMs: 10_000,
    });
    expect(counted.code).toBe(0);
    expect(counted.stdout.trim()).toBe(String(TOKEN.length));
  });

  test('every field is validated before anything spawns; a refusal never echoes the token', () => {
    const { spawner, calls } = recording();
    const x = initExec(spawner, DEBIAN);
    const refusals: [Partial<PairInvocation>, RegExp][] = [
      [{ user: 'root' }, /never runs as root/],
      [{ user: 'Bad User' }, /unix account name/],
      [{ bun: 'bun' }, /clean absolute path/],
      [{ checkout: '/home/../etc' }, /clean absolute path/],
      [{ fragment: 'x' }, /clean absolute path/],
      [{ verb: 'remove' as 'add' }, /not add or replace/],
      [{ name: 'pairing_x' }, /pair name/],
      [{ name: 'X' }, /pair name/],
      [{ env: { NODE_ENV: 'production' } }, /may not reach the pairing child/],
      [{ env: { LD_PRELOAD: '/tmp/x.so' } }, /may not reach the pairing child/],
      [{ env: { DEDALO_X: 'a\nb' } }, /NUL or a newline/],
      [{ env: { HOME: 'a\0b' } }, /NUL or a newline/],
      [{ token: 'short' }, /not a service token/],
      [{ token: `${TOKEN}\n` }, /not a service token/],
    ];
    for (const [overrides, pattern] of refusals) {
      let message = '';
      try {
        x.pairAsEngine(invocation(overrides));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(pattern);
      expect(message).not.toContain(TOKEN);
    }
    expect(calls).toEqual([]);
  });
});

test('every other validator refuses its bad inputs before anything spawns', () => {
  const { spawner, calls } = recording();
  const x = initExec(
    spawner,
    probeOf(
      { '/etc/debian_version': FILE, '/usr/sbin/php-fpm8.2': { type: 'symlink', uid: 0, mode: 0o777 } },
      { '/usr/bin/php': '/usr/local/bin/php', '/usr/bin/php9': '/opt/remi/php841/root/usr/bin/php' },
    ),
  );
  expect(() => x.passwdLookup('a;b')).toThrow(/unix account name/);
  expect(() => x.groupLookup('-x')).toThrow(/unix account name/);
  expect(() => x.unitShow('x.service')).toThrow(/bare unit name/);
  expect(() => x.unitShow('-p')).toThrow(/bare unit name/);
  expect(() => x.apacheVhosts('/usr/sbin/apachectl')).toThrow(/not an apache dump binary/);
  expect(() => x.apacheModules('/usr/sbin/nginx')).toThrow(/not an apache dump binary/);
  expect(() => x.fpmDump('/opt/remi/php841/root/usr/sbin/php-fpm')).toThrow(/not a PHP-FPM binary/); // a Remi path with three digits
  expect(() => x.fpmDump('/usr/sbin/php-fpm8.2')).toThrow(/not a real file/);
  expect(() => x.phpVersion('/usr/bin/php')).toThrow(/does not resolve to a PHP CLI/);
  expect(() => x.phpVersion('/usr/bin/php9')).toThrow(/does not resolve to a PHP CLI/);
  expect(() => x.phpVersion('/usr/bin/php8.2')).toThrow(/does not resolve to a PHP CLI/); // unresolvable
  expect(() => x.groupAdd('Root')).toThrow(/unix account name/);
  expect(() => x.userAddOwnGroup('x', '/bin/sh')).toThrow(/not a nologin shell/);
  expect(() => x.userAddInGroup('x', 'g;h', '/usr/sbin/nologin')).toThrow(/unix account name/);
  expect(() => x.enableApacheModules([])).toThrow(/no Apache module/);
  expect(() => x.enableApacheModules(['php8.2'])).toThrow(/not one of the modules/);
  expect(() => x.enableApacheModules(['ssl', 'ssl'])).toThrow(/named twice/);
  expect(() => x.unzipBun('rel.zip', 'bun-linux-x64', '/x')).toThrow(/clean absolute path/);
  expect(() => x.unzipBun('/a.zip', 'bun-darwin-aarch64', '/x')).toThrow(/not a Bun asset/);
  expect(() => x.unzipBun('/a.zip', 'bun-linux-x64', '/x/../y')).toThrow(/clean absolute path/);
  expect(() => x.bunVersion('bun')).toThrow(/clean absolute path/);
  expect(() => x.setsebool('httpd_graceful_shutdown', true)).toThrow(/read, never written/);
  expect(() => x.setsebool('allow_execmem', true)).toThrow(/not one of the SELinux booleans/);
  expect(() => x.setsebool('httpd_use_nfs', 'on' as unknown as boolean)).toThrow(/on or off/);
  expect(() => x.webVersion('/usr/sbin/apachectl')).toThrow(/not a web server binary/);
  expect(calls).toEqual([]);
});

describe('real read-only runs (Linux; RED there when a tool is missing)', () => {
  const linux = process.platform === 'linux';
  test.skipIf(!linux)('uname, getent and systemctl --version answer', () => {
    const x = initExec();
    expect(x.unameMachine().stdout.trim()).toMatch(/^(x86_64|aarch64)$/);
    expect(x.passwdLookup('root').stdout).toStartWith('root:');
    expect(x.passwdLookup('dedalo-no-such-user').code).toBe(2);
    expect(provisionExec().systemdVersion().stdout).toMatch(/^systemd \d+/);
  });

  test.skipIf(!linux)('a setsid --wait child has no controlling terminal (tty_nr 0)', () => {
    const stat = provisionSpawner.run(['setsid', '--wait', 'sh', '-c', 'cat /proc/self/stat'], {
      env: { PATH: PROVISION_PATH },
      timeoutMs: 10_000,
    });
    expect(stat.code).toBe(0);
    // Field 7 (tty_nr), after the parenthesised comm.
    const afterComm = stat.stdout.slice(stat.stdout.lastIndexOf(')') + 2).split(' ');
    expect(afterComm[4]).toBe('0');
  });

  test('a timed-out child is killed and answers 124', () => {
    const slow = provisionSpawner.run(['/bin/sh', '-c', 'sleep 5'], { env: { PATH: '/usr/bin:/bin' }, timeoutMs: 200 });
    expect(slow.code).toBe(124);
    expect(slow.stderr).toContain('timed out');
  });

  test('a missing binary is 127', () => {
    expect(provisionSpawner.run(['/nonexistent/dedalo-no-such-binary'], { env: {} }).code).toBe(127);
  });
});
