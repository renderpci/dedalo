/**
 * provisionExec(): importable without the agent's environment, and every argument is
 * validated BEFORE anything spawns. The configtest binary is layout.ts's one definition.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { WEB_CONFIGTEST_CANDIDATES, provisionExec } from '../src/exec';
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

test('the closed set: exactly these named commands, nothing else', () => {
  expect(Object.keys(provisionExec()).sort()).toEqual([
    'appendOnly',
    'daemonReload',
    'enableUnit',
    'groupId',
    'reloadUnit',
    'restartUnit',
    'startUnit',
    'unitState',
    'userGroups',
    'userId',
    'visudoCheck',
    'visudoCheckPolicy',
    'webConfigtest',
  ]);
});
