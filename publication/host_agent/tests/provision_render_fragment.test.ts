import { describe, expect, test } from 'bun:test';
import type { AgentLayout } from '../src/provision/layout';
import { derive } from '../src/provision/layout';
import {
  agentUrl,
  BUNDLE_PLACEHOLDER,
  ENGINE_KEYS,
  engineFragmentRenderer,
  FINGERPRINT_PENDING,
  renderFacts,
  TOKEN_PLACEHOLDER,
} from '../src/provision/render/engine_fragment';
import type { RenderFacts } from '../src/provision/render/types';
import { PENDING_FACTS } from '../src/provision/render/types';
import { instanceFingerprint, PAIRING_FINGERPRINT_PREFIX } from '../src/security/pairing';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';
import { FIXTURE_FACTS, FIXTURE_TOKEN } from './fixtures/provision_facts';

const UNIX = derive(unixDeclaration());
const TLS = derive(tlsDeclaration());
const fragment = (layout: AgentLayout, facts: RenderFacts = FIXTURE_FACTS) =>
  engineFragmentRenderer.render(layout, facts)[0]!;
const assignments = (body: string): Record<string, string> =>
  Object.fromEntries(
    body
      .split('\n')
      .filter(line => /^[A-Z]/.test(line))
      .map(line => {
        const eq = line.indexOf('=');
        return [line.slice(0, eq), JSON.parse(line.slice(eq + 1)) as string];
      }),
  );

describe('engine fragment', () => {
  test('a stamped root 0644 file at the layout path, no effect, no service', () => {
    const a = fragment(TLS);
    expect([a.path, a.owner, a.group, a.mode]).toEqual([TLS.engineFragmentPath, 'root', 'root', 0o644]);
    expect(a.effects).toEqual([]);
    expect(a.service).toBeNull();
  });

  test('tls: the pairing command\'s keys, the URL, both placeholders, the fingerprint — never the token', () => {
    const body = fragment(TLS).body;
    expect(body).toContain("The work system's pairing command reads exactly these keys");
    expect(body).not.toContain('PROPOSED');
    expect(body).toContain(TLS.engineBundlePath);
    expect(assignments(body)).toEqual({
      [ENGINE_KEYS.instance]: 'test',
      [ENGINE_KEYS.url]: 'https://10.8.0.2:7443/publication/host_agent',
      [ENGINE_KEYS.tlsBundle]: BUNDLE_PLACEHOLDER,
      [ENGINE_KEYS.token]: TOKEN_PLACEHOLDER,
      [ENGINE_KEYS.fingerprint]: instanceFingerprint('test', FIXTURE_TOKEN),
    });
    expect(body).not.toContain(FIXTURE_TOKEN);
  });

  test('unix: the socket, no URL, no bundle, and the engine group named', () => {
    const body = fragment(UNIX).body;
    const env = assignments(body);
    expect(env[ENGINE_KEYS.socket]).toBe('/run/dedalo_publication_host/test/agent.sock');
    expect(env[ENGINE_KEYS.url]).toBeUndefined();
    expect(env[ENGINE_KEYS.tlsBundle]).toBeUndefined();
    expect(body).toContain("group 'dedalo'");
  });

  test("the recipe line is written through the agent's prefix constant, never a literal", () => {
    expect(fragment(TLS).body).toContain(`# sha256('${PAIRING_FINGERPRINT_PREFIX}' + instance + '\\n' + token)`);
  });

  test('no token yet: the fingerprint line says so instead of guessing', () => {
    expect(assignments(fragment(TLS, PENDING_FACTS).body)[ENGINE_KEYS.fingerprint]).toBe(FINGERPRINT_PENDING);
  });

  test('a fingerprint that is not 64 lowercase hex is refused', () => {
    expect(() => engineFragmentRenderer.render(TLS, { fingerprint: 'ABC' })).toThrow(/not 64 lowercase hex/);
  });

  test('agentUrl brackets an IPv6 literal', () => {
    expect(agentUrl('fd00::2', 8471)).toBe('https://[fd00::2]:8471/publication/host_agent');
    expect(agentUrl('agent.pub.example.org', 8471)).toBe('https://agent.pub.example.org:8471/publication/host_agent');
  });
});

describe('renderFacts', () => {
  test('hashes the minted token (trimmed) with the pairing recipe, reading the layout credential path', () => {
    const read: string[] = [];
    const facts = renderFacts(TLS, path => {
      read.push(path);
      return `${FIXTURE_TOKEN}\n`;
    });
    expect(facts).toEqual({ fingerprint: instanceFingerprint('test', FIXTURE_TOKEN) });
    expect(read).toEqual([TLS.serviceTokenPath]);
  });

  test('no token file → pending', () => {
    expect(renderFacts(TLS, () => null)).toEqual({ fingerprint: null });
  });

  test('a short token is refused (the agent would refuse to boot with it)', () => {
    expect(() => renderFacts(TLS, () => 'short')).toThrow(/shorter than 32/);
  });
});
