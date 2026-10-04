import { describe, expect, test } from 'bun:test';
import { WEB_CONFIGTEST_BINARY } from '../src/exec';
import type { AgentLayout } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { polkitRenderer } from '../src/provision/render/polkit';
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
      expect(sudoers(layout).body).toContain(`= ${WEB_CONFIGTEST_BINARY[layout.web.server]} -t\n`);
    }
  });

  test('visudo -cf accepts the rendered file, and rejects a broken one (the check is real)', () => {
    const visudo = Bun.which('visudo') ?? '/usr/sbin/visudo';
    const check = (body: string) =>
      Bun.spawnSync([visudo, '-cf', '-'], { stdin: new TextEncoder().encode(body), stdout: 'pipe', stderr: 'pipe' }).exitCode;
    for (const layout of [UNIX, TLS]) expect(check(sudoers(layout).body)).toBe(0);
    expect(check('dedalo-pubhost ALL=(root) NOPASSWD /usr/sbin/nginx -t\n')).not.toBe(0);
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
