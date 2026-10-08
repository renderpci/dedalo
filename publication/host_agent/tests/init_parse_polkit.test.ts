/**
 * parse/polkit.ts — `pkaction --version` (captured on every OS: 0.105 Ubuntu 22.04, 0.117 EL 9,
 * 122 Debian 12, 124 Ubuntu 24.04, 125 EL 10, 126 Debian 13, 127 Ubuntu 26.04).
 */
import { describe, expect, test } from 'bun:test';
import { POLKIT_JS_FLOOR, POLKIT_UNIT, dbusActivatesUnit, parsePolkitVersion, polkitState } from '../src/provision/init/parse/polkit';
import { parseUnitShow } from '../src/provision/init/parse/systemd';
import { fixture } from './fixtures/init/load';

describe('polkit', () => {
  const captured: [string, number][] = [
    ['ubuntu2204', 105],
    ['rocky9', 117],
    ['alma9', 117],
    ['debian12', 122],
    ['ubuntu2404', 124],
    ['rocky10', 125],
    ['alma10', 125],
    ['debian13', 126],
    ['ubuntu2604', 127],
  ];
  for (const [host, version] of captured) {
    test(`captured ${host} → ${version}`, () => expect(parsePolkitVersion(fixture(`captured/${host}/pkaction_version.txt`))).toBe(version));
  }

  test('the JavaScript-rules floor puts 0.105 below and 0.117 above', () => {
    expect(POLKIT_JS_FLOOR).toBe(106);
    expect(parsePolkitVersion('pkaction version 0.105') as number).toBeLessThan(POLKIT_JS_FLOOR);
    expect(parsePolkitVersion('pkaction version 0.117') as number).toBeGreaterThanOrEqual(POLKIT_JS_FLOOR);
  });

  test('bare numbers and garbage', () => {
    expect(parsePolkitVersion('124')).toBe(124);
    expect(parsePolkitVersion('0.105\n')).toBe(105);
    expect(parsePolkitVersion('')).toBeNull();
    expect(parsePolkitVersion('pkaction: command not found')).toBeNull();
  });
});

/* ── whether polkit answers: D-Bus activation (an idle host's polkit is not running) ── */


describe('polkit state', () => {
  for (const host of ['debian13', 'ubuntu2604']) {
    test(`captured ${host}, systemd PID 1, before any request: not listed, static, inactive → activatable`, () => {
      const show = parseUnitShow(fixture(`captured/${host}/systemctl_show_polkit.txt`));
      expect(show.get('ActiveState')).toBe('inactive');
      expect(show.get('UnitFileState')).toBe('static');
      expect(dbusActivatesUnit(fixture(`captured/${host}/dbus_polkit.service`), POLKIT_UNIT)).toBe(true);
      expect(polkitState(false, show, fixture(`captured/${host}/dbus_polkit.service`))).toBe('activatable');
    });
  }

  test('running, masked, no activation file, an activation file for another unit', () => {
    const show = parseUnitShow(fixture('captured/debian13/systemctl_show_polkit.txt'));
    const dbus = fixture('captured/debian13/dbus_polkit.service');
    expect(polkitState(true, new Map(), null)).toBe('running');
    expect(polkitState(false, new Map([['ActiveState', 'active']]), null)).toBe('running');
    expect(polkitState(false, new Map([['LoadState', 'masked'], ['UnitFileState', 'masked']]), dbus)).toBe('masked');
    expect(polkitState(false, show, null)).toBe('not_activatable');
    expect(polkitState(false, new Map([['LoadState', 'not-found']]), dbus)).toBe('not_activatable');
    expect(polkitState(false, show, dbus.replace('SystemdService=polkit.service', 'SystemdService=other.service'))).toBe('not_activatable');
    // Only the [D-BUS Service] section counts; a comment does not.
    expect(dbusActivatesUnit('[Other]\nSystemdService=polkit.service\n', POLKIT_UNIT)).toBe(false);
    expect(dbusActivatesUnit('[D-BUS Service]\n# SystemdService=polkit.service\n', POLKIT_UNIT)).toBe(false);
  });
});
