/**
 * parseDeclaration: strict structure (zod) then derive's laws, one DeclarationError naming
 * every issue.
 */
import { describe, expect, test } from 'bun:test';
import { DeclarationError, parseDeclaration } from '../src/provision/schema';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

function issues(raw: unknown): string[] {
  try {
    parseDeclaration(raw, '/etc/dedalo_publication_host/test.json');
  } catch (error) {
    if (error instanceof DeclarationError) return error.issues.map(issue => issue.path);
    throw error;
  }
  throw new Error('parseDeclaration accepted the declaration');
}

describe('parseDeclaration', () => {
  test('accepts the unix and tls fixtures and derives their layout', () => {
    expect(parseDeclaration(unixDeclaration(), 'x').layout.listen.kind).toBe('unix');
    expect(parseDeclaration(tlsDeclaration(), 'x').layout.listen.kind).toBe('tls');
  });

  test('unknown keys are refused at every level', () => {
    expect(issues({ ...unixDeclaration(), extra: 1 })).toEqual(['(root)']);
    const decl = unixDeclaration();
    expect(issues({ ...decl, web: { ...decl.web, reload: 'x' } })).toEqual(['web']);
    expect(issues({ ...decl, listen: { kind: 'unix', socket: '/tmp/x.sock' } })).toEqual(['listen']);
  });

  test('the configtest binary is derived: declaring one is an unknown key', () => {
    const decl = unixDeclaration();
    expect(issues({ ...decl, web: { ...decl.web, configtest_bin: '/usr/local/sbin/apachectl' } })).toEqual(['web']);
  });

  test('every structural issue is listed, not just the first', () => {
    const paths = issues({ ...unixDeclaration(), agent_user: 'Root', php_bin: 'php', listen: { kind: 'udp' } });
    expect(paths).toContain('agent_user');
    expect(paths).toContain('php_bin');
    expect(paths).toContain('listen.kind');
  });

  test('a tls port out of range and a non-integer v2 port are refused', () => {
    const decl = tlsDeclaration();
    expect(issues({ ...decl, listen: { kind: 'tls', host: '10.8.0.2', port: 70000 } })).toEqual(['listen.port']);
    expect(issues({ ...decl, v2: { ...decl.v2, port: 3100.5 } })).toEqual(['v2.port']);
  });

  test("derive's cross-field laws surface as a DeclarationError with the field", () => {
    const { engine_group: _dropped, ...noGroup } = unixDeclaration();
    expect(issues(noGroup)).toEqual(['engine_group']);
  });

  test('the message names the file and each issue on its own line', () => {
    try {
      parseDeclaration({}, '/etc/dedalo_publication_host/test.json');
      throw new Error('accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(DeclarationError);
      const message = (error as Error).message;
      expect(message.split('\n')[0]).toBe("declaration '/etc/dedalo_publication_host/test.json' refused:");
      expect(message).toContain('  - instance:');
    }
  });
});
