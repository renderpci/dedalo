/**
 * provisionExec(): importable without the agent's environment, and every argument is
 * validated BEFORE anything spawns. The configtest binary is layout.ts's one definition.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ExecProbe, ExecResult, SyncSpawnOptions, SyncSpawner } from '../src/exec';
import {
  COMMAND_TIMEOUT_MS,
  PROVISION_PATH,
  RELABEL_TIMEOUT_MS,
  SELINUX_IMPORT_TEMP_NAME,
  UNIT_JOB_TIMEOUT_MS,
  WEB_CONFIGTEST_CANDIDATES,
  provisionExec,
} from '../src/exec';
import { SELINUX_BOOLEANS } from '../src/provision/exec_contract';
import { WEB_CONFIGTEST_CANDIDATES as LAYOUT_CONFIGTEST_CANDIDATES } from '../src/provision/layout';

const PACKAGE_ROOT = join(import.meta.dir, '..');

describe('provisionExec', () => {
  test('src/exec.ts imports with an EMPTY environment (it must not resolve the agent config)', () => {
    const proc = Bun.spawnSync({
      cmd: [process.execPath, '-e', "const m = await import('./src/exec.ts'); console.log(typeof m.provisionExec);"],
      cwd: PACKAGE_ROOT,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(proc.stderr.toString()).toBe('');
    expect(proc.stdout.toString().trim()).toBe('function');
    expect(proc.exitCode).toBe(0);
  });

  test("exec.ts's WEB_CONFIGTEST_CANDIDATES IS layout.ts's (one object, not two equal ones)", () => {
    expect(WEB_CONFIGTEST_CANDIDATES).toBe(LAYOUT_CONFIGTEST_CANDIDATES);
  });

  test('unit names are bare and grammatical', () => {
    const exec = provisionExec();
    expect(() => exec.enableUnit('a;reboot')).toThrow(/not a bare unit name/);
    expect(() => exec.startUnit('x.service')).toThrow(/not a bare unit name/);
    expect(() => exec.restartUnit('')).toThrow(/not a bare unit name/);
    expect(() => exec.reloadUnit('-H host')).toThrow(/not a bare unit name/);
    expect(() => exec.unitState('../x')).toThrow(/not a bare unit name/);
  });

  test('the configtest binary is exactly the one for its server', () => {
    const exec = provisionExec();
    expect(() => exec.webConfigtest('apachectl', 'apache')).toThrow(
      /not a apache configtest binary \(\/usr\/sbin\/apache2ctl, \/usr\/sbin\/apachectl\)/,
    );
    expect(() => exec.webConfigtest('/usr/sbin/nginx', 'apache')).toThrow(/not a apache configtest binary/);
    expect(() => exec.webConfigtest('/usr/local/sbin/nginx', 'nginx')).toThrow(/not a nginx configtest binary \(\/usr\/sbin\/nginx\)/);
  });

  test('account names and the visudo candidate are validated', () => {
    const exec = provisionExec();
    expect(() => exec.userId('root;id')).toThrow(/unix account name/);
    expect(() => exec.groupId('-x')).toThrow(/unix account name/);
    expect(() => exec.userGroups('-G')).toThrow(/unix account name/);
    expect(() => exec.userGroups('a b')).toThrow(/unix account name/);
    expect(() => exec.visudoCheck('relative/file')).toThrow(/clean absolute path/);
    expect(() => exec.appendOnly('relative/audit.jsonl')).toThrow(/clean absolute path/);
    expect(() => exec.appendOnly('/srv/../etc/passwd')).toThrow(/clean absolute path/);
  });

  test('read-only lookups answer without privileges', () => {
    const exec = provisionExec();
    expect(exec.userId('root')).toBe(0);
    expect(exec.userId('dedalo-no-such-user')).toBeNull();
    expect(exec.groupId('dedalo-no-such-group')).toBeNull();
    const rootGroups = exec.userGroups('root');
    expect(rootGroups?.primary).toBe(0);
    expect(rootGroups?.all).toContain(0);
    expect(exec.userGroups('dedalo-no-such-user')).toBeNull();
    expect(exec.unitState('dedalo-no-such-unit')).toEqual({ enabled: false, active: false });
  });
});

test('the closed set: exactly these 24 named commands, nothing else (spec §2.4)', () => {
  expect(Object.keys(provisionExec()).sort()).toEqual([
    'apacheIncludes',
    'appendOnly',
    'daemonReload',
    'enableUnit',
    'fpmConfigtest',
    'getsebool',
    'groupId',
    'nginxDump',
    'reloadUnit',
    'restartUnit',
    'restorecon',
    'selinuxLabel',
    'selinuxMode',
    'semanageImport',
    'semanageLocal',
    'semanagePortList',
    'startUnit',
    'systemdVersion',
    'unitState',
    'userGroups',
    'userId',
    'visudoCheck',
    'visudoCheckPolicy',
    'webConfigtest',
  ]);
});

/** Records argv; answers 0 (or `answer(argv)`). */
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
/** A probe over a literal table: what lstat would say, never the real disk. */
function probeOf(table: Record<string, Facts>, real: Record<string, string> = {}): ExecProbe {
  return { lstat: path => table[path] ?? null, realpath: path => real[path] ?? null };
}

const ROOT_FILE: Facts = { type: 'file', uid: 0, mode: 0o755 };
const IMPORT = `/etc/dedalo_publication_host/test/${SELINUX_IMPORT_TEMP_NAME}`;

describe('provisionExec 14-24 (spec §2.4): argv through the injected spawner', () => {
  test('each command spawns exactly its argv, with the fixed root PATH and no stdin', () => {
    const { spawner, calls } = recording();
    const x = provisionExec(
      spawner,
      probeOf({
        '/usr/sbin/php-fpm8.2': ROOT_FILE,
        '/opt/remi/php84/root/usr/sbin/php-fpm': ROOT_FILE,
        [IMPORT]: { type: 'file', uid: 0, mode: 0o600 },
      }),
    );
    x.fpmConfigtest('/usr/sbin/php-fpm8.2');
    x.fpmConfigtest('/opt/remi/php84/root/usr/sbin/php-fpm');
    x.apacheIncludes('/usr/sbin/httpd');
    x.apacheIncludes('/usr/sbin/apache2ctl');
    x.nginxDump('/usr/sbin/nginx');
    x.selinuxMode();
    x.semanageLocal('fcontext');
    x.semanageLocal('port');
    x.semanageImport(IMPORT);
    x.getsebool('httpd_graceful_shutdown');
    x.systemdVersion();
    x.semanagePortList();
    x.selinuxLabel(['/home/example.org', '/home']);
    expect(calls.map(c => c.argv)).toEqual([
      ['/usr/sbin/php-fpm8.2', '-t'],
      ['/opt/remi/php84/root/usr/sbin/php-fpm', '-t'],
      ['/usr/sbin/httpd', '-t', '-D', 'DUMP_INCLUDES'],
      ['/usr/sbin/apache2ctl', '-t', '-D', 'DUMP_INCLUDES'],
      ['/usr/sbin/nginx', '-T'],
      ['getenforce'],
      ['semanage', 'fcontext', '-l', '-C', '-n'],
      ['semanage', 'port', '-l', '-C', '-n'],
      ['semanage', 'import', '-f', IMPORT],
      ['getsebool', 'httpd_graceful_shutdown'],
      ['systemctl', '--version'],
      ['semanage', 'port', '-l', '-n'],
      ['stat', '-c', '%C %n', '--', '/home/example.org', '/home'],
    ]);
    for (const c of calls) {
      expect(c.options.env).toEqual({ PATH: PROVISION_PATH, LC_ALL: 'C' });
      expect(c.options.input).toBeUndefined();
    }
  });

  test('EVERY command spawns with a finite timeout: init calls them while it holds the host web lock', () => {
    const { spawner, calls } = recording(argv => ({ code: 0, stdout: argv[0] === 'getent' ? 'g:x:5:\n' : '1\n', stderr: '' }));
    const x = provisionExec(
      spawner,
      probeOf({ '/usr/sbin/php-fpm8.2': ROOT_FILE, [IMPORT]: { type: 'file', uid: 0, mode: 0o600 } }),
    );
    const invoke: Record<keyof typeof x, () => unknown> = {
      userId: () => x.userId('dedalo'),
      groupId: () => x.groupId('dedalo'),
      userGroups: () => x.userGroups('dedalo'),
      unitState: () => x.unitState('nginx'),
      daemonReload: () => x.daemonReload(),
      enableUnit: () => x.enableUnit('nginx'),
      startUnit: () => x.startUnit('nginx'),
      restartUnit: () => x.restartUnit('nginx'),
      reloadUnit: () => x.reloadUnit('nginx'),
      webConfigtest: () => x.webConfigtest(WEB_CONFIGTEST_CANDIDATES.nginx[0] as string, 'nginx'),
      visudoCheck: () => x.visudoCheck('/etc/sudoers.d/x'),
      visudoCheckPolicy: () => x.visudoCheckPolicy(),
      appendOnly: () => x.appendOnly('/var/log/x'),
      fpmConfigtest: () => x.fpmConfigtest('/usr/sbin/php-fpm8.2'),
      apacheIncludes: () => x.apacheIncludes('/usr/sbin/httpd'),
      nginxDump: () => x.nginxDump('/usr/sbin/nginx'),
      selinuxMode: () => x.selinuxMode(),
      semanageLocal: () => x.semanageLocal('port'),
      semanageImport: () => x.semanageImport(IMPORT),
      restorecon: () => x.restorecon([{ path: '/srv/a', recursive: false }, { path: '/srv/b', recursive: true }], false),
      getsebool: () => x.getsebool('httpd_graceful_shutdown'),
      systemdVersion: () => x.systemdVersion(),
      semanagePortList: () => x.semanagePortList(),
      selinuxLabel: () => x.selinuxLabel(['/srv']),
    };
    const expected = (argv: readonly string[]): number =>
      argv[0] === 'systemctl' && ['start', 'restart', 'reload', 'daemon-reload'].includes(argv[1] as string)
        ? UNIT_JOB_TIMEOUT_MS
        : argv[0] === 'restorecon' || (argv[0] === 'semanage' && argv[1] === 'import')
          ? RELABEL_TIMEOUT_MS
          : COMMAND_TIMEOUT_MS;
    for (const [name, call] of Object.entries(invoke)) {
      calls.length = 0;
      call();
      expect(calls.length, name).toBeGreaterThan(0);
      for (const c of calls) expect(c.options.timeoutMs, `${name}: ${c.argv.join(' ')}`).toBe(expected(c.argv));
    }
    expect(COMMAND_TIMEOUT_MS).toBeLessThan(UNIT_JOB_TIMEOUT_MS);
    expect(UNIT_JOB_TIMEOUT_MS).toBeLessThan(RELABEL_TIMEOUT_MS);
  });

  test('restorecon: one call per recursive value, -n only on a dry run, results joined', () => {
    const { spawner, calls } = recording(argv =>
      argv.includes('-R') ? { code: 1, stdout: 'deep\n', stderr: 'e' } : { code: 0, stdout: 'flat\n', stderr: '' },
    );
    const x = provisionExec(spawner, probeOf({}));
    const targets = [
      { path: '/home/example.org', recursive: false },
      { path: '/home/example.org/dedalo/publication_api/v1', recursive: true },
      { path: '/home/example.org/dedalo', recursive: false },
    ];
    const dry = x.restorecon(targets, true);
    expect(calls.map(c => c.argv)).toEqual([
      ['restorecon', '-n', '-v', '--', '/home/example.org', '/home/example.org/dedalo'],
      ['restorecon', '-R', '-n', '-v', '--', '/home/example.org/dedalo/publication_api/v1'],
    ]);
    expect(dry).toEqual({ code: 1, stdout: 'flat\ndeep\n', stderr: 'e' });
    calls.length = 0;
    x.restorecon([{ path: '/srv/x', recursive: false }], false);
    expect(calls.map(c => c.argv)).toEqual([['restorecon', '-v', '--', '/srv/x']]);
  });

  test('every validator refuses before anything spawns', () => {
    const { spawner, calls } = recording();
    const x = provisionExec(
      spawner,
      probeOf({
        '/usr/sbin/php-fpm8.2': { type: 'symlink', uid: 0, mode: 0o777 },
        [IMPORT]: { type: 'file', uid: 0, mode: 0o644 },
        '/etc/x/selinux.import.dedalo-provision.tmp': { type: 'file', uid: 1000, mode: 0o600 },
      }),
    );
    expect(() => x.fpmConfigtest('/usr/local/sbin/php-fpm')).toThrow(/not a PHP-FPM binary/);
    expect(() => x.fpmConfigtest('/opt/remi/php841/root/usr/sbin/php-fpm')).toThrow(/not a PHP-FPM binary/);
    expect(() => x.fpmConfigtest('/usr/sbin/php-fpm8.2')).toThrow(/not a real file/);
    expect(() => x.fpmConfigtest('/usr/sbin/php-fpm8.4')).toThrow(/not a real file/);
    expect(() => x.apacheIncludes('/usr/sbin/apachectl')).toThrow(/not an apache dump binary/);
    expect(() => x.nginxDump('/usr/local/sbin/nginx')).toThrow(/not an nginx binary/);
    expect(() => x.semanageLocal('module' as 'port')).toThrow(/not fcontext or port/);
    expect(() => x.semanageImport('/etc/x/other.tmp')).toThrow(/must be named/);
    expect(() => x.semanageImport(IMPORT)).toThrow(/root-owned regular 0600/);
    expect(() => x.semanageImport('/etc/x/selinux.import.dedalo-provision.tmp')).toThrow(/root-owned regular 0600/);
    expect(() => x.semanageImport('relative/selinux.import.dedalo-provision.tmp')).toThrow(/clean absolute path/);
    expect(() => x.restorecon([], false)).toThrow(/1-16 paths/);
    expect(() => x.restorecon(Array.from({ length: 17 }, (_, i) => ({ path: `/srv/${i}`, recursive: true })), false)).toThrow(
      /1-16 paths/,
    );
    expect(() => x.restorecon([{ path: '/srv/../etc', recursive: true }], false)).toThrow(/clean absolute path/);
    expect(() => x.restorecon([{ path: '/', recursive: true }], false)).toThrow(/never names '\/'/);
    expect(() => x.restorecon([{ path: "/srv/a'b", recursive: false }], false)).toThrow(/clean absolute path/);
    expect(() => x.getsebool('allow_execmem')).toThrow(/not one of the SELinux booleans/);
    expect(() => x.selinuxLabel([])).toThrow(/1-32 paths/);
    expect(() => x.selinuxLabel(Array.from({ length: 33 }, (_, i) => `/srv/${i}`))).toThrow(/1-32 paths/);
    expect(() => x.selinuxLabel(['-Z'])).toThrow(/clean absolute path/);
    expect(calls).toEqual([]);
  });
});

test("the SELinux booleans are exec_contract's closed set (selinux.ts re-exports it)", () => {
  expect([...SELINUX_BOOLEANS]).toEqual([...SELINUX_BOOLEANS].sort());
  expect(SELINUX_BOOLEANS).toContain('httpd_graceful_shutdown');
});
