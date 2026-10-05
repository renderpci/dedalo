/**
 * The provisioner's declaration fixtures — pure data, instance `test`. Paths are the
 * production defaults; pure tests never touch them (the real-fs gate overrides them into
 * `.test-tmp/`, see tests/provision_host_io.test.ts). The configtest binary is not declared:
 * it is derived (layout.ts WEB_CONFIGTEST_BINARY).
 */
import type { HostDeclaration } from '../../src/provision/layout';

export function unixDeclaration(): HostDeclaration {
  return {
    instance: 'test',
    listen: { kind: 'unix' },
    agent_user: 'dedalo-pubhost',
    engine_group: 'dedalo',
    agent_dir: '/opt/dedalo/publication/host_agent',
    web: { server: 'apache', unit: 'apache2', group: 'www-data' },
    state_root: '/srv/dedalo_publication',
    media: { mode: 'shared', root: '/mnt/dedalo_media' },
    php_bin: '/usr/bin/php',
    bun_bin: '/usr/local/bin/bun',
    v2: {
      unit: 'dedalo-publication-api-v2',
      user: 'dedalo-api-v2',
      group: 'dedalo-api-v2',
      port: 3100,
      health_url: 'http://127.0.0.1:3100/dedalo/publication/server_api/v2/health',
    },
  };
}

export function tlsDeclaration(): HostDeclaration {
  const { engine_group: _dropped, ...rest } = unixDeclaration();
  return {
    ...rest,
    listen: { kind: 'tls', host: '10.8.0.2', port: 7443 },
    web: { server: 'nginx', unit: 'nginx', group: 'www-data' },
  };
}
