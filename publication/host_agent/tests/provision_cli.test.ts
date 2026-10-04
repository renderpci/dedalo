/**
 * The CLI: arguments, exit codes (OK 0, DRIFT 1, USAGE 2, REFUSED 3, FAILED 4) and the
 * secret guard. Every host effect is injected — nothing here touches a real host.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ProvisionDeps } from '../src/provision/cli';
import { EXIT, hostDeps, parseArgs, run, secretShapedAssignment } from '../src/provision/cli';
import type { HostDeclaration } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import { ENGINE_KEYS, TOKEN_PLACEHOLDER } from '../src/provision/render/engine_fragment';
import { TLS_VALIDITY } from '../src/provision/tls';
import { instanceFingerprint } from '../src/security/pairing';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';
import { FAKE_TOKEN, FakeHost } from './support/provision_fake_host';

const DEFAULT_SOURCE = '/etc/dedalo_publication_host/test.json';

interface Harness {
  readonly deps: ProvisionDeps;
  readonly host: FakeHost;
  readonly out: string[];
  readonly err: string[];
  readonly reads: string[];
}

function harness(
  options: { root?: boolean; text?: string | null; declaration?: HostDeclaration; clock?: { now: Date } } = {},
): Harness {
  const clock = options.clock ?? { now: new Date('2026-10-03T12:00:00Z') };
  const declaration = options.declaration ?? unixDeclaration();
  const host = new FakeHost(derive(declaration));
  const reads: string[] = [];
  const text = options.text === undefined ? JSON.stringify(declaration) : options.text;
  return {
    host,
    out: [],
    err: [],
    reads,
    deps: {
      readDeclaration: path => {
        reads.push(path);
        return text;
      },
      isRoot: () => options.root ?? true,
      observeHost: () => host.state(),
      io: () => host,
      readRootFile: path => host.body(path) ?? null,
      now: () => clock.now,
    },
  };
}

function exec(h: Harness, argv: string[]): number {
  return run(argv, { deps: h.deps, out: line => h.out.push(line), err: line => h.err.push(line) });
}

describe('arguments → USAGE (2)', () => {
  for (const argv of [[], ['render'], ['deploy', 'test'], ['check', 'Test'], ['check', 'test', 'extra'], ['check', 'test', '--force'], ['check', 'test', '--declaration']]) {
    test(JSON.stringify(argv), () => {
      const h = harness();
      expect(exec(h, argv)).toBe(EXIT.USAGE);
      expect(h.err.at(-1)).toContain('exit: 0 ok');
      expect(h.reads).toEqual([]);
    });
  }

  test('parseArgs: default and explicit declaration', () => {
    expect(parseArgs(['check', 'test'])).toEqual({ verb: 'check', instance: 'test', declaration: null });
    expect(parseArgs(['apply', 'test', '--declaration', '/tmp/d.json'])).toEqual({
      verb: 'apply',
      instance: 'test',
      declaration: '/tmp/d.json',
    });
  });
});

describe('declaration → REFUSED (3)', () => {
  test('reads the default path', () => {
    const h = harness();
    exec(h, ['render', 'test']);
    expect(h.reads).toEqual([DEFAULT_SOURCE]);
  });

  test('absent, not JSON, malformed, or naming another instance', () => {
    expect(exec(harness({ text: null }), ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(exec(harness({ text: '{' }), ['check', 'test'])).toBe(EXIT.REFUSED);
    const malformed = harness({ text: JSON.stringify({ ...unixDeclaration(), extra: true }) });
    expect(exec(malformed, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(malformed.err.join('\n')).toContain('refused');
    const other = harness({ text: JSON.stringify({ ...unixDeclaration(), instance: 'other' }) });
    expect(exec(other, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(other.err.join('\n')).toContain("declares instance 'other'");
  });

  test('check and apply refuse without root; render does not need it', () => {
    expect(exec(harness({ root: false }), ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(exec(harness({ root: false }), ['apply', 'test'])).toBe(EXIT.REFUSED);
    expect(exec(harness({ root: false }), ['render', 'test'])).toBe(EXIT.OK);
  });

  test('a plan refusal (hand-edited artifact) is REFUSED and names it', () => {
    const h = harness();
    exec(h, ['apply', 'test']);
    const l = derive(unixDeclaration());
    const env = h.host.entries.get(l.envFile);
    if (!env) throw new Error('fixture');
    env.body += 'EXTRA="1"\n';
    expect(exec(h, ['check', 'test'])).toBe(EXIT.REFUSED);
    expect(h.err.join('\n')).toContain('edited by hand');
  });
});

describe('render / check / apply', () => {
  test('render prints every artifact with its stamp and passes the secret guard', () => {
    const h = harness();
    expect(exec(h, ['render', 'test'])).toBe(EXIT.OK);
    expect(h.out[0]).toBe('=== /etc/dedalo_publication_host/test/agent.env (env, root:root 0644)');
    expect(h.out[1]).toMatch(/^# dedalo-provision: test env [0-9a-f]{64}$/);
    expect(h.out).toContain('STATE_ROOT="/srv/dedalo_publication"');
    expect(h.out).toContain('INSTANCE="test"');
  });

  test('check on a fresh host → DRIFT (1), writes nothing', () => {
    const h = harness();
    expect(exec(h, ['check', 'test'])).toBe(EXIT.DRIFT);
    expect(h.out.at(-1)).toMatch(/action\(s\) would change instance 'test'/);
    expect(h.host.mutations).toBe(0);
  });

  test('apply → OK (0); then check → OK (0) and a second apply writes nothing', () => {
    const h = harness();
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    expect(h.out.at(-1)).toBe("provision: instance 'test' converged (11 file(s) written)");
    const after = h.host.mutations;
    expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    expect(h.host.mutations).toBe(after);
  });

  test('apply that fails → FAILED (4) and names the action', () => {
    const h = harness();
    exec(h, ['apply', 'test']);
    const l = derive(unixDeclaration());
    const env = h.host.entries.get(l.envFile);
    if (!env) throw new Error('fixture');
    env.mode = 0o600;
    h.host.chmod = () => {
      throw new Error('EPERM: operation not permitted');
    };
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.FAILED);
    expect(h.err.join('\n')).toContain(`[failed] chmod 0644 ${l.envFile}: EPERM`);
  });
});

describe('the secret guard', () => {
  test('render prints the engine fragment, token placeholder included: the guard knows it is not a value', () => {
    const h = harness();
    expect(exec(h, ['render', 'test'])).toBe(EXIT.OK);
    expect(h.out).toContain(`${ENGINE_KEYS.token}="${TOKEN_PLACEHOLDER}"`);
    expect(secretShapedAssignment(`${ENGINE_KEYS.token}="${TOKEN_PLACEHOLDER}"`)).toBeNull();
  });

  test('secretShapedAssignment', () => {
    expect(secretShapedAssignment('SERVICE_TOKEN="0123456789abcdef0123456789abcdef"')).toBe('SERVICE_TOKEN');
    expect(secretShapedAssignment('would: x API_KEY=abcdefghijk')).toBe('API_KEY');
    expect(secretShapedAssignment('TLS_KEY_FILE="/etc/dedalo_publication_host/test/tls/server.key"')).toBeNull();
    expect(secretShapedAssignment('SERVICE_TOKEN=short')).toBeNull();
    expect(secretShapedAssignment('STATE_ROOT="/srv/x"')).toBeNull();
  });

  test('an error carrying a credential-shaped assignment is refused, the value never printed', () => {
    const h = harness();
    h.deps.observeHost = () => {
      throw new Error('boom SERVICE_TOKEN=0123456789abcdef0123456789abcdef');
    };
    expect(exec(h, ['check', 'test'])).toBe(EXIT.REFUSED);
    const printed = [...h.out, ...h.err].join('\n');
    expect(printed).toContain("assigns 'SERVICE_TOKEN' a value");
    expect(printed).not.toContain('0123456789abcdef');
  });
});

describe('hostDeps (the real world, read-only parts)', () => {
  test('reads a declaration file, answers null for a missing one, and is not root in the suite', () => {
    const deps = hostDeps();
    expect(deps.readDeclaration(join(import.meta.dir, 'fixtures', 'provision_declaration.ts'))).toContain('unixDeclaration');
    expect(deps.readDeclaration('/nonexistent/dedalo_publication_host/test.json')).toBeNull();
    expect(deps.isRoot()).toBe(false);
    expect(typeof deps.io().mkdir).toBe('function');
  });

  test('with no sinks given, a usage error goes to the console and still exits USAGE', () => {
    expect(run(['render'])).toBe(EXIT.USAGE);
  });
});

describe('apply converges in one run', () => {
  test('the token minted by this apply reaches the engine fragment in the same run; check is then clean', () => {
    const h = harness();
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    const l = derive(unixDeclaration());
    expect(h.host.body(l.engineFragmentPath)).toContain(
      `${ENGINE_KEYS.fingerprint}="${instanceFingerprint('test', FAKE_TOKEN)}"`,
    );
    expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
  });

  test('tls: check names what it would issue; apply issues before any unit starts; a second apply writes nothing', () => {
    const h = harness({ declaration: tlsDeclaration() });
    const l = derive(tlsDeclaration());
    expect(exec(h, ['check', 'test'])).toBe(EXIT.DRIFT);
    expect(h.out).toContain('would: issue the ca certificate (tls)');
    expect(h.host.mutations).toBe(0);

    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    expect(h.out.some(line => line.startsWith('tls: issued [ca, server, client]'))).toBe(true);
    for (const path of [l.tls!.caCert, l.tls!.serverCert, l.tls!.serverKey, l.engineBundlePath]) {
      expect(h.host.body(path)).toContain('-----BEGIN');
    }
    expect(h.host.entries.get(l.tls!.serverKey)).toMatchObject({ uid: 990, gid: 0, mode: 0o400 });
    const caWritten = h.host.calls.indexOf(`rename ${l.tls!.caKey}`);
    expect(caWritten).toBeGreaterThan(-1);
    expect(caWritten).toBeLessThan(h.host.calls.indexOf('start dedalo-publication-host-test'));

    expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
    const before = h.host.mutations;
    expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
    expect(h.host.mutations).toBe(before);
  });

  describe('reissued tls restarts the RUNNING agent (boot.ts loads TLS once)', () => {
    const AGENT = 'dedalo-publication-host-test';
    const DAY = 86_400_000;
    const restarts = (h: Harness) => h.host.calls.filter(call => call === `restart ${AGENT}`).length;

    function converged(): { h: Harness; clock: { now: Date }; l: ReturnType<typeof derive> } {
      const clock = { now: new Date('2026-10-03T12:00:00Z') };
      const h = harness({ declaration: tlsDeclaration(), clock });
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(h.host.units.get(AGENT)?.active).toBe(true);
      expect(restarts(h)).toBe(0); // a first run STARTS the unit after issuance: no restart
      return { h, clock, l: derive(tlsDeclaration()) };
    }

    test('a leaf renewal inside its window: check names the restart, apply restarts exactly once, then clean', () => {
      const { h, clock } = converged();
      clock.now = new Date(clock.now.getTime() + (TLS_VALIDITY.leafDays - TLS_VALIDITY.leafRenewDays + 1) * DAY);
      h.out.length = 0;
      expect(exec(h, ['check', 'test'])).toBe(EXIT.DRIFT);
      expect(h.out).toContain(`would: systemctl restart ${AGENT} (the reissued tls material)`);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(1);
      expect(exec(h, ['check', 'test'])).toBe(EXIT.OK);
    });

    test('a CA rotation (operator deleted tls/ca.*) restarts the agent; the restart comes after the writes', () => {
      const { h, l } = converged();
      h.host.entries.delete(l.tls!.caCert);
      h.host.entries.delete(l.tls!.caKey);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(1);
      expect(h.host.calls.lastIndexOf(`rename ${l.tls!.serverKey}`)).toBeLessThan(h.host.calls.indexOf(`restart ${AGENT}`));
    });

    test('a client-only reissue does not restart (the agent trusts the CA, not the leaf)', () => {
      const { h, l } = converged();
      h.host.entries.delete(l.engineBundlePath);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(0);
    });

    test('an inactive agent is left to its start, not restarted', () => {
      const { h, l } = converged();
      h.host.units.set(AGENT, { enabled: true, active: false });
      h.host.entries.delete(l.tls!.serverCert);
      expect(exec(h, ['apply', 'test'])).toBe(EXIT.OK);
      expect(restarts(h)).toBe(0);
      expect(h.host.calls.filter(call => call === `start ${AGENT}`).length).toBe(2);
    });
  });
});
