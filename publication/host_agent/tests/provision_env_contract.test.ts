/**
 * THE RENDERED ENV + THE CREDENTIAL MUST BOOT THE AGENT'S OWN CONFIG. A renderer that emits a
 * key the config does not know (src/config.ts refuses unknown keys by name) or misses one it
 * requires is a host that provisions cleanly and then refuses to start. This proves the two
 * agree through resolveConfig itself, for both listener kinds, nothing re-implemented.
 */
import { afterAll, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREDENTIAL_KEYS, KNOWN_KEYS, resolveConfig } from '../src/config';
import type { HostDeclaration } from '../src/provision/layout';
import { derive, SERVICE_TOKEN_CREDENTIAL } from '../src/provision/layout';
import { envRenderer } from '../src/provision/render/env';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';
import { scratchPath } from './fixtures/instance';
import { FIXTURE_FACTS, FIXTURE_TOKEN } from './fixtures/provision_facts';

const GATE = scratchPath('provision_env_contract');

afterAll(() => rmSync(GATE, { recursive: true, force: true }));

function resolveRendered(name: string, declaration: HostDeclaration) {
  const dir = join(GATE, name);
  mkdirSync(join(dir, 'credentials'), { recursive: true });
  const layout = derive(declaration);
  const [env] = envRenderer.render(layout, FIXTURE_FACTS);
  writeFileSync(join(dir, 'agent.env'), env?.body ?? '');
  writeFileSync(join(dir, 'credentials', SERVICE_TOKEN_CREDENTIAL), `${FIXTURE_TOKEN}\n`);
  const cfg = resolveConfig({
    envFilePath: join(dir, 'agent.env'),
    ambient: {},
    credentialsDir: join(dir, 'credentials'),
  });
  return { layout, cfg };
}

test('every rendered key is one the config knows; the credential id is the config key', () => {
  for (const declaration of [unixDeclaration(), tlsDeclaration()]) {
    expect(Object.keys(derive(declaration).envVars).filter(key => !KNOWN_KEYS.includes(key))).toEqual([]);
  }
  expect([...CREDENTIAL_KEYS]).toEqual([SERVICE_TOKEN_CREDENTIAL]);
});

test('unix: the rendered env + the SERVICE_TOKEN credential resolve through resolveConfig', () => {
  const { cfg } = resolveRendered('unix', unixDeclaration());
  expect(cfg).toMatchObject({
    INSTANCE: 'test',
    NODE_ENV: 'production',
    LISTEN_KIND: 'unix',
    SOCKET_PATH: '/run/dedalo_publication_host/test/agent.sock',
    SERVICE_TOKEN: FIXTURE_TOKEN,
    STATE_ROOT: '/srv/dedalo_publication',
    WEB_SERVER: 'apache',
    WEB_UNIT: 'apache2',
    MEDIA_MODE: 'shared',
    MEDIA_ROOT: '/mnt/dedalo_media',
    PHP_BIN: '/usr/bin/php',
    BUN_BIN: '/usr/local/bin/bun',
    V2_UNIT: 'dedalo-publication-api-v2',
    V2_HEALTH_URL: 'http://127.0.0.1:3100/dedalo/publication/server_api/v2/health',
    RELEASES_RETAINED: 3,
  });
});

test('tls: every TLS_* key resolves to the layout paths', () => {
  const { layout, cfg } = resolveRendered('tls', tlsDeclaration());
  expect(cfg).toMatchObject({
    INSTANCE: 'test',
    LISTEN_KIND: 'tls',
    TLS_HOST: '10.8.0.2',
    TLS_PORT: 7443,
    TLS_CERT_FILE: layout.tls?.serverCert,
    TLS_KEY_FILE: layout.tls?.serverKey,
    TLS_CLIENT_CA_FILE: layout.tls?.clientCa,
    WEB_SERVER: 'nginx',
  });
  expect(cfg.SOCKET_PATH).toBeUndefined();
});
