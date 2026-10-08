import { describe, expect, test } from 'bun:test';
import type { AgentLayout } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { grantsHostMap, HOST_MAP_SERVICE, polkitRenderer } from '../src/provision/render/polkit';
import { sudoersAlias, sudoersRenderer } from '../src/provision/render/sudoers';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';
import { FIXTURE_FACTS } from './fixtures/provision_facts';

const UNIX = derive(unixDeclaration());
const TLS = derive(tlsDeclaration());
const sudoers = (layout: AgentLayout) => sudoersRenderer.render(layout, FIXTURE_FACTS)[0]!;

describe('sudoers', () => {
  test('exactly one argv, NOPASSWD, root 0440, validated by apply', () => {
    const a = sudoers(TLS);
    expect([a.path, a.owner, a.group, a.mode]).toEqual(['/etc/sudoers.d/dedalo_publication_host_test', 'root', 'root', 0o440]);
    expect(a.validate).toBe('sudoers');
    expect(a.body.split('\n').filter(line => line && !line.startsWith('#'))).toEqual([
      `Cmnd_Alias ${sudoersAlias('test')} = /usr/sbin/nginx -t`,
      `dedalo-pubhost ALL=(root) NOPASSWD: ${sudoersAlias('test')}`,
    ]);
  });

  test('the rule names exactly the argv src/exec.ts runs (no drift between the grant and the caller)', () => {
    for (const layout of [UNIX, TLS]) {
      expect(sudoers(layout).body).toContain(`= ${layout.envVars.WEB_CONFIGTEST_BIN} -t\n`);
      expect(layout.envVars.WEB_CONFIGTEST_BIN).toBe(layout.web.configtestBin);
    }
  });

  /**
   * sudo's OWN parser, two doors: `cvtsudoers` (sudo package, Linux) parses without asking who
   * runs it; `visudo -cf -` refuses a uid with no passwd entry ("you do not exist in the passwd
   * database") — and the CI job runs as BARE uid 1001 (ci/compose.yml). macOS ships visudo only.
   * Neither present = the spawn throws = RED, never a skip.
   */
  const sudoersParser = (): string[] => {
    const cvt = Bun.which('cvtsudoers');
    return cvt ? [cvt, '-c', '/dev/null', '-f', 'sudoers', '-'] : [Bun.which('visudo') ?? '/usr/sbin/visudo', '-cf', '-'];
  };

  test("sudo's parser accepts the rendered file, and rejects a broken one (the check is real)", () => {
    const argv = sudoersParser();
    const check = (body: string) =>
      Bun.spawnSync(argv, { stdin: new TextEncoder().encode(body), stdout: 'pipe', stderr: 'pipe' }).exitCode;
    for (const layout of [UNIX, TLS]) expect(check(sudoers(layout).body)).toBe(0);
    expect(check('dedalo-pubhost ALL=(root) NOPASSWD /usr/sbin/nginx -t\n')).not.toBe(0);
  });

  test('the configtest binary must be EXACTLY a listed candidate — a same-named binary elsewhere is refused', () => {
    for (const bin of ['/opt/evil/apachectl', '/usr/local/sbin/apachectl', '/usr/sbin/nginx', '/usr/sbin/apachectl ']) {
      const moved: AgentLayout = { ...UNIX, web: { ...UNIX.web, configtestBin: bin } };
      expect(() => sudoersRenderer.render(moved, FIXTURE_FACTS)).toThrow(/is not one of \/usr\/sbin\/apache2ctl, \/usr\/sbin\/apachectl/);
    }
  });

  test('the grant and the agent env name the SAME candidate — a listed binary the env does not name is refused', () => {
    const split: AgentLayout = { ...UNIX, web: { ...UNIX.web, configtestBin: '/usr/sbin/apachectl' } };
    expect(UNIX.envVars.WEB_CONFIGTEST_BIN).toBe('/usr/sbin/apache2ctl');
    expect(() => sudoersRenderer.render(split, FIXTURE_FACTS)).toThrow(/not the binary the agent env names/);
  });

  test('a file name #includedir would skip is refused', () => {
    const dotted: AgentLayout = { ...UNIX, sudoersPath: '/etc/sudoers.d/dedalo.pubhost' };
    expect(() => sudoersRenderer.render(dotted, FIXTURE_FACTS)).toThrow(/#includedir skips/);
  });
});

/** Evaluate the rendered rule with a stand-in `polkit` object: the decision, not the text. */
function decide(body: string, user: string, actionId: string, unit: string, verb: string): string {
  const holder: { rule?: (action: unknown, subject: unknown) => string } = {};
  const polkit = {
    Result: { YES: 'yes', NO: 'no', NOT_HANDLED: 'not_handled' },
    addRule: (fn: (action: unknown, subject: unknown) => string) => {
      holder.rule = fn;
    },
  };
  new Function('polkit', body)(polkit);
  const action = { id: actionId, lookup: (k: string) => (k === 'unit' ? unit : k === 'verb' ? verb : undefined) };
  return holder.rule!(action, { user });
}

describe('polkit', () => {
  const body = polkitRenderer.render(UNIX, FIXTURE_FACTS)[0]!.body;
  const M = 'org.freedesktop.systemd1.manage-units';
  const U = 'dedalo-pubhost';

  test('YES for exactly: reload the web unit, restart the v2 unit — as the agent user', () => {
    expect(decide(body, U, M, 'apache2.service', 'reload')).toBe('yes');
    expect(decide(body, U, M, 'dedalo-publication-api-v2.service', 'restart')).toBe('yes');
  });

  test('everything else falls through (NOT_HANDLED, never YES)', () => {
    expect(decide(body, U, M, 'apache2.service', 'restart')).toBe('not_handled');
    expect(decide(body, U, M, 'apache2.service', 'stop')).toBe('not_handled');
    expect(decide(body, U, M, 'dedalo-publication-api-v2.service', 'stop')).toBe('not_handled');
    expect(decide(body, U, M, 'dedalo-publication-host-test.service', 'restart')).toBe('not_handled');
    expect(decide(body, U, M, 'sshd.service', 'reload')).toBe('not_handled');
    expect(decide(body, 'www-data', M, 'apache2.service', 'reload')).toBe('not_handled');
    expect(decide(body, U, 'org.freedesktop.login1.reboot', 'apache2.service', 'reload')).toBe('not_handled');
  });

  test('YES for start/stop of a v2 scratch instance on a port 1024-65535 — and nothing near it', () => {
    const S = 'dedalo-publication-api-v2-scratch@';
    for (const verb of ['start', 'stop']) {
      expect(decide(body, U, M, `${S}1024.service`, verb)).toBe('yes');
      expect(decide(body, U, M, `${S}49152.service`, verb)).toBe('yes');
      expect(decide(body, U, M, `${S}65535.service`, verb)).toBe('yes');
    }
    for (const unit of [
      `${S}1023.service`, // privileged
      `${S}65536.service`,
      `${S}999.service`, // 3 digits
      `${S}123456.service`, // 6 digits
      `${S}01024.service`, // leading zero
      `${S}.service`, // the template itself
      `${S}4000.service.bak`,
      `x${S}4000.service`, // another prefix
      `${S}4000xservice`,
      `dedalo-publication-api-v2-scratch@4000.socket`,
      `dedalo-publication-api-v2Xscratch@4000.service`,
      `dedalo-publication-host-test-scratch@4000.service`,
    ]) {
      expect(decide(body, U, M, unit, 'start')).toBe('not_handled');
    }
    for (const verb of ['restart', 'reload', 'enable', 'kill', 'reload-or-restart']) {
      expect(decide(body, U, M, `${S}4000.service`, verb)).toBe('not_handled');
    }
    expect(decide(body, 'www-data', M, `${S}4000.service`, 'start')).toBe('not_handled');
    expect(decide(body, U, 'org.freedesktop.systemd1.manage-unit-files', `${S}4000.service`, 'start')).toBe('not_handled');
  });

  test('a v2 unit name with a regex metacharacter is matched literally', () => {
    const dotted = polkitRenderer.render({ ...UNIX, v2: { ...UNIX.v2, unit: 'api.v2' } }, FIXTURE_FACTS)[0]!.body;
    expect(decide(dotted, U, M, 'api.v2-scratch@4000.service', 'start')).toBe('yes');
    expect(decide(dotted, U, M, 'apiXv2-scratch@4000.service', 'start')).toBe('not_handled');
  });

  test('stamped with // (the file is JavaScript), 0644 root, at the layout path', () => {
    const a = polkitRenderer.render(UNIX, FIXTURE_FACTS)[0]!;
    expect(a.body.startsWith('// dedalo-provision: test polkit ')).toBe(true);
    expect([a.path, a.owner, a.group, a.mode]).toEqual([UNIX.polkitPath, 'root', 'root', 0o644]);
  });

  test('a rules file name polkitd would not load is refused', () => {
    const bad: AgentLayout = { ...UNIX, polkitPath: '/etc/polkit-1/rules.d/dedalo.conf' };
    expect(() => polkitRenderer.render(bad, FIXTURE_FACTS)).toThrow(/NN-<name>\.rules/);
  });
});

describe('polkit: the host-map pair (spec §13.5)', () => {
  const M = 'org.freedesktop.systemd1.manage-units';
  const U = 'dedalo-pubhost';
  const MAP_HOST = derive({ ...tlsDeclaration(), web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' } });
  const mapBody = polkitRenderer.render(MAP_HOST, FIXTURE_FACTS)[0]!.body;

  test('on an nginx conf_d host: YES for exactly (dedalo-pubhost-map.service, start), as the agent user', () => {
    expect(HOST_MAP_SERVICE).toBe('dedalo-pubhost-map.service');
    expect(grantsHostMap(MAP_HOST)).toBe(true);
    expect(decide(mapBody, U, M, 'dedalo-pubhost-map.service', 'start')).toBe('yes');
    for (const verb of ['stop', 'restart', 'reload', 'enable', 'kill']) {
      expect(decide(mapBody, U, M, 'dedalo-pubhost-map.service', verb)).toBe('not_handled');
    }
    expect(decide(mapBody, 'www-data', M, 'dedalo-pubhost-map.service', 'start')).toBe('not_handled');
    expect(decide(mapBody, U, M, 'dedalo-pubhost-map@x.service', 'start')).toBe('not_handled');
    expect(mapBody).toContain('; start dedalo-pubhost-map.service. Nothing else.');
  });

  test('the earlier grants are unchanged on that host', () => {
    expect(decide(mapBody, U, M, 'nginx.service', 'reload')).toBe('yes');
    expect(decide(mapBody, U, M, 'dedalo-publication-api-v2.service', 'restart')).toBe('yes');
  });

  test('no pair on apache, nor on an nginx host whose map is placed by hand (none)', () => {
    for (const layout of [UNIX, TLS]) {
      expect(grantsHostMap(layout)).toBe(false);
      const body = polkitRenderer.render(layout, FIXTURE_FACTS)[0]!.body;
      expect(body).not.toContain('dedalo-pubhost-map');
      expect(decide(body, U, M, 'dedalo-pubhost-map.service', 'start')).toBe('not_handled');
    }
  });
});
