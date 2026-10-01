/**
 * OPENCODE FAILS CLOSED UNDER `systemd_scope` (LEAD-1b round-5 S2).
 *
 * The PLANT closure (claude_turn_plant.test.ts) exists for `claude_code` only: its argv names
 * every configuration source, its `--help` is probed, its prompt is `--`-terminated. The
 * `opencode` driver has none of that — project `opencode.json` / `.opencode/` plugins and
 * HOME's `~/.config/opencode` all load, and its prompt is positional — so a build's
 * postinstall could plant a plugin the NEXT turn runs as the site identity, despite
 * `bash: deny`. LEAD-1b_SPEC §0.3 records it as "Still open"; until it closes, a confined
 * host REFUSES the driver, typed (503 `confinement.agent_cli_unsupported`), at every door a
 * turn passes: availability (detect), admission (admit, before the manager reserves
 * anything) and the turn's own setup (nothing written, nothing spawned).
 */

import { describe, expect, test } from 'bun:test';
import { assertOpencodeConfinable, opencodeDriver, opencodeTurnSetup } from '../src/drivers/opencode';
import { ConfinementRefusedError } from '../src/errors';

function refusalOf(thunk: () => unknown): unknown {
  try {
    thunk();
  } catch (error) {
    return error;
  }
  return null;
}

describe('opencode under systemd_scope — refused, typed, at every door', () => {
  test('the refusal: systemd_scope → 503 confinement.agent_cli_unsupported naming the open closure; none → admitted', () => {
    const refusal = refusalOf(() => assertOpencodeConfinable('systemd_scope')) as ConfinementRefusedError;
    expect(refusal).toBeInstanceOf(ConfinementRefusedError);
    expect({ status: refusal.status, code: refusal.code, reason: (refusal as { extensions?: { reason?: string } }).extensions?.reason }).toEqual({
      status: 503,
      code: 'agent_cli_unsupported',
      reason: 'confinement.agent_cli_unsupported',
    });
    expect(refusal.message).toContain('.opencode');
    expect(refusalOf(() => assertOpencodeConfinable('none'))).toBeNull();
  });

  test('admission: the driver HAS an admit() and it asks the refusal (the manager calls it before any reservation)', async () => {
    expect(typeof opencodeDriver.admit).toBe('function');
    const { config } = await import('../src/config');
    const answer = await (opencodeDriver.admit as () => Promise<void>)().then(
      () => null,
      error => error,
    );
    if (config.AGENT_CONFINEMENT === 'systemd_scope') expect(answer).toBeInstanceOf(ConfinementRefusedError);
    else expect(answer).toBeNull();
  });

  test('availability: detect() reports the driver unavailable under systemd_scope — whatever the binary', async () => {
    expect(await opencodeDriver.detect.call(null)).toBeNull(); // no OPENCODE_BIN in the suite: null either way
    const { detectOpencode } = await import('../src/drivers/opencode');
    let probed = 0;
    const probe = async () => {
      probed++;
      return { exitCode: 0, stdout: 'opencode 0.9.1\n' };
    };
    expect(await detectOpencode({ bin: '/opt/opencode', mode: 'systemd_scope', run: probe })).toBeNull();
    expect(probed).toBe(0);
    expect(await detectOpencode({ bin: '/opt/opencode', mode: 'none', run: probe })).toEqual({ id: 'opencode', binPath: '/opt/opencode', version: '0.9.1' });
  });

  test('the turn’s setup refuses FIRST under systemd_scope: no opencode.json written, no argv returned', async () => {
    let wrote = 0;
    const setup = opencodeTurnSetup({ prompt: 'hello', workspace: '/nonexistent/ws', mcp: { name: 'x', url: 'http://127.0.0.1:1/' } } as never, {
      mode: 'systemd_scope',
      writeConfig: async () => {
        wrote++;
        return '/nonexistent/ws/opencode.json';
      },
    });
    await expect(setup()).rejects.toBeInstanceOf(ConfinementRefusedError);
    expect(wrote).toBe(0);
    const plan = await opencodeTurnSetup({ prompt: 'hello', workspace: '/nonexistent/ws', mcp: { name: 'x', url: 'http://127.0.0.1:1/' } } as never, {
      mode: 'none',
      bin: '/opt/opencode',
      writeConfig: async () => {
        wrote++;
        return '/nonexistent/ws/opencode.json';
      },
    })();
    expect(wrote).toBe(1);
    expect(plan.argv).toEqual(['/opt/opencode', 'run', 'hello', '--format', 'json']);
  });
});
