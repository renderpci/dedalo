/**
 * The CLI: arguments, exit codes (OK 0, DRIFT 1, USAGE 2, REFUSED 3, FAILED 4) and the
 * secret guard. Every host effect is injected — nothing here touches a real host.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ProvisionDeps } from '../src/provision/cli';
import { EXIT, hostDeps, parseArgs, run, secretShapedAssignment } from '../src/provision/cli';
import { derive } from '../src/provision/layout';
import { unixDeclaration } from './fixtures/provision_declaration';
import { FakeHost } from './support/provision_fake_host';

const DEFAULT_SOURCE = '/etc/dedalo_publication_host/test.json';

interface Harness {
  readonly deps: ProvisionDeps;
  readonly host: FakeHost;
  readonly out: string[];
  readonly err: string[];
  readonly reads: string[];
}

function harness(options: { root?: boolean; text?: string | null } = {}): Harness {
  const host = new FakeHost(derive(unixDeclaration()));
  const reads: string[] = [];
  const text = options.text === undefined ? JSON.stringify(unixDeclaration()) : options.text;
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
    expect(h.out.at(-1)).toBe("provision: instance 'test' converged (4 file(s) written)");
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
