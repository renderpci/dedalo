/**
 * A REAL mTLS LISTENER ON LOOPBACK, with a private CA generated here by the openssl CLI:
 * a client certificate from the pinned CA is served, no certificate and a certificate
 * from another CA are refused at the TLS layer — before any HTTP byte.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AgentServer, startServer } from '../src/boot';
import { config } from '../src/config';
import { BASE_PATH, routeRequest } from '../src/router';
import { freshScratch } from './fixtures/instance';

let dir = '';
let server: AgentServer;

function openssl(args: string[]): void {
  const result = Bun.spawnSync(['openssl', ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`openssl ${args[0]} failed: ${result.stderr.toString()}`);
}

function issueCa(name: string): void {
  writeFileSync(
    join(dir, `${name}.cnf`),
    `[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = ${name}\n[v3_ca]\nbasicConstraints = critical,CA:TRUE\nkeyUsage = critical,keyCertSign,cRLSign\nsubjectKeyIdentifier = hash\n`,
  );
  openssl(['req', '-x509', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.crt`, '-days', '2', '-config', `${name}.cnf`, '-extensions', 'v3_ca']);
}

function issueLeaf(name: string, ca: string, extensions: string): void {
  writeFileSync(join(dir, `${name}.cnf`), `[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = ${name}\n`);
  writeFileSync(join(dir, `${name}.ext`), `[ext]\n${extensions}\n`);
  openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-config', `${name}.cnf`]);
  const serial = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('hex')}`;
  openssl(['x509', '-req', '-in', `${name}.csr`, '-CA', `${ca}.crt`, '-CAkey', `${ca}.key`, '-set_serial', serial, '-out', `${name}.crt`, '-days', '2', '-extfile', `${name}.ext`, '-extensions', 'ext']);
  chmodSync(join(dir, `${name}.key`), 0o600);
}

const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const url = () => `https://127.0.0.1:${server.port}${BASE_PATH}/health`;

beforeAll(async () => {
  dir = await freshScratch('mtls');
  issueCa('ca');
  issueCa('rogue_ca');
  issueLeaf('server', 'ca', 'basicConstraints = CA:FALSE\nkeyUsage = critical,digitalSignature,keyEncipherment\nextendedKeyUsage = serverAuth\nsubjectAltName = IP:127.0.0.1');
  issueLeaf('client', 'ca', 'basicConstraints = CA:FALSE\nkeyUsage = critical,digitalSignature\nextendedKeyUsage = clientAuth');
  issueLeaf('rogue', 'rogue_ca', 'basicConstraints = CA:FALSE\nkeyUsage = critical,digitalSignature\nextendedKeyUsage = clientAuth');
  server = startServer(
    {
      ...config,
      LISTEN_KIND: 'tls',
      TLS_HOST: '127.0.0.1',
      TLS_PORT: 0,
      TLS_CERT_FILE: join(dir, 'server.crt'),
      TLS_KEY_FILE: join(dir, 'server.key'),
      TLS_CLIENT_CA_FILE: join(dir, 'ca.crt'),
    },
    routeRequest,
  );
});

afterAll(() => {
  server?.stop(true);
});

describe('mTLS listener', () => {
  test('a client certificate from the pinned CA is served', async () => {
    const res = await fetch(url(), { tls: { ca: read('ca.crt'), cert: read('client.crt'), key: read('client.key') } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('ok');
  });

  test('no client certificate is refused at the TLS layer', async () => {
    await expect(fetch(url(), { tls: { ca: read('ca.crt') } })).rejects.toThrow();
  });

  test('a client certificate from another CA is refused at the TLS layer', async () => {
    await expect(fetch(url(), { tls: { ca: read('ca.crt'), cert: read('rogue.crt'), key: read('rogue.key') } })).rejects.toThrow();
  });

  test('the bearer still applies behind mTLS: protected routes are 401 without it', async () => {
    const res = await fetch(`https://127.0.0.1:${server.port}${BASE_PATH}/v1/status`, {
      tls: { ca: read('ca.crt'), cert: read('client.crt'), key: read('client.key') },
    });
    expect(res.status).toBe(401);
  });
});
