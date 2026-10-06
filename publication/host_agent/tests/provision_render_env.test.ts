/**
 * The env renderer: stamped, root:root 0644, exactly layout.envVars, read back identically
 * by the agent's own env-file parser AND resolved by the agent's own config (resolveConfig),
 * every key a Task 1 env-file key, and no credential ever.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWN_KEYS, resolveConfig } from '../src/config';
import { parseEnvFile } from '../src/env_file';
import { hasDrifted, parseStamp } from '../src/provision/hash';
import { derive } from '../src/provision/layout';
import { envAssignment, envRenderer, renderEnvBody } from '../src/provision/render/env';
import { PENDING_FACTS } from '../src/provision/render/types';
import { scratchPath } from './fixtures/instance';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

describe('envRenderer', () => {
  for (const [name, decl] of [
    ['unix', unixDeclaration()],
    ['tls', tlsDeclaration()],
  ] as const) {
    test(`${name}: one stamped artifact at layout.envFile`, () => {
      const layout = derive(decl);
      const [artifact, ...rest] = envRenderer.render(layout, PENDING_FACTS);
      expect(rest).toHaveLength(0);
      expect(artifact?.path).toBe(layout.envFile);
      expect(artifact?.owner).toBe('root');
      expect(artifact?.group).toBe('root');
      expect(artifact?.mode).toBe(0o644);
      expect(artifact?.effects).toEqual(['restart_agent']);
      expect(artifact?.validate).toBeNull();
      expect(artifact?.service).toBeNull();
      const parsed = parseStamp(artifact?.body ?? '');
      expect(parsed?.kind).toBe('env');
      expect(parsed?.instance).toBe('test');
      expect(hasDrifted(artifact?.body ?? '')).toBe(false);
    });

    test(`${name}: the agent's env parser reads back exactly layout.envVars`, () => {
      const layout = derive(decl);
      expect(parseEnvFile(renderEnvBody(layout), layout.envFile)).toEqual({ ...layout.envVars });
    });

    test(`${name}: every rendered key is one of the config's KNOWN_KEYS (INSTANCE = the AgentConfig field)`, () => {
      const layout = derive(decl);
      for (const key of Object.keys(layout.envVars)) expect(KNOWN_KEYS).toContain(key);
      expect(Object.keys(layout.envVars)).toContain('INSTANCE');
      expect(Object.keys(layout.envVars).filter(key => key.endsWith('_INSTANCE'))).toEqual([]);
    });

    test(`${name}: the rendered file + the credential resolve through the agent's own resolveConfig`, () => {
      const layout = derive(decl);
      const dir = scratchPath(`provision_env_contract_${name}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(join(dir, 'credentials'), { recursive: true });
      try {
        writeFileSync(join(dir, 'agent.env'), envRenderer.render(layout, PENDING_FACTS)[0]?.body ?? '');
        writeFileSync(join(dir, 'credentials', 'SERVICE_TOKEN'), `${'t'.repeat(43)}\n`);
        const resolved = resolveConfig({
          envFilePath: join(dir, 'agent.env'),
          ambient: {},
          credentialsDir: join(dir, 'credentials'),
        });
        expect(resolved).toMatchObject({
          INSTANCE: 'test',
          NODE_ENV: 'production',
          LISTEN_KIND: layout.listen.kind,
          STATE_ROOT: layout.state.root,
          WEB_SERVER: layout.web.server,
          WEB_UNIT: layout.web.unit,
          WEB_CONFIGTEST_BIN: layout.web.configtestBin,
          MEDIA_MODE: layout.media.mode,
          MEDIA_ROOT: layout.media.root ?? undefined,
          PHP_BIN: layout.phpBin,
          V2_UNIT: layout.v2.unit,
          V2_HEALTH_URL: layout.v2.healthUrl,
          RELEASES_RETAINED: 3,
          SERVICE_TOKEN: 't'.repeat(43),
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  test('is pure: same layout, same bytes', () => {
    expect(renderEnvBody(derive(unixDeclaration()))).toBe(renderEnvBody(derive(unixDeclaration())));
  });

  test('no SERVICE_TOKEN assignment, only the credential file is named', () => {
    const body = renderEnvBody(derive(unixDeclaration()));
    expect(body).not.toMatch(/^SERVICE_TOKEN=/m);
    expect(body).toContain('/etc/dedalo_publication_host/test/credentials/SERVICE_TOKEN');
  });
});

describe('envAssignment refuses rather than escapes', () => {
  test('credential-named keys', () => {
    expect(() => envAssignment('SERVICE_TOKEN', 'x')).toThrow(/credential/);
    expect(() => envAssignment('TLS_KEY', '/x')).toThrow(/credential/);
  });
  test('control characters and shell expansion', () => {
    expect(() => envAssignment('STATE_ROOT', '/a\nINJECTED=1')).toThrow(/control character/);
    expect(() => envAssignment('STATE_ROOT', '/a$HOME')).toThrow(/'\$'/);
    expect(() => envAssignment('STATE_ROOT', '/a`id`')).toThrow(/backtick/);
  });
  test('quotes and backslashes are escaped', () => {
    expect(envAssignment('V2_HEALTH_URL', 'a"b\\c')).toBe('V2_HEALTH_URL="a\\"b\\\\c"');
  });
});
