import { describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BootRefused,
  MTLS_VERIFY,
  bootSequence,
  claimListenTarget,
  drainServer,
  listenTarget,
  serveOptions,
  startServer,
} from '../src/boot';
import { config } from '../src/config';
import { MODES } from '../src/provision/layout';
import { BASE_PATH, routeRequest } from '../src/router';
import { freshScratch } from './fixtures/instance';

function unixCfg(socket: string) {
  return { ...config, LISTEN_KIND: 'unix' as const, SOCKET_PATH: socket };
}

describe('bootSequence', () => {
  test('runs preflight → claim → listen, and a throwing step stops the boot there', async () => {
    const calls: string[] = [];
    await bootSequence({
      preflight: () => void calls.push('preflight'),
      claimListenTarget: () => void calls.push('claim'),
      listen: () => void calls.push('listen'),
    });
    expect(calls).toEqual(['preflight', 'claim', 'listen']);

    const stopped: string[] = [];
    await expect(
      bootSequence({
        preflight: () => {
          throw new Error('refused');
        },
        claimListenTarget: () => void stopped.push('claim'),
        listen: () => void stopped.push('listen'),
      }),
    ).rejects.toThrow('refused');
    expect(stopped).toEqual([]);
  });
});

describe('the unix listener', () => {
  test('binds, chmods 0660 and serves the router', async () => {
    const socket = join(await freshScratch('unix'), 'a.sock');
    const server = startServer(unixCfg(socket), routeRequest);
    try {
      expect(lstatSync(socket).mode & 0o777).toBe(0o660);
      const res = await fetch(`http://localhost${BASE_PATH}/health`, { unix: socket });
      expect(res.status).toBe(200);
    } finally {
      server.stop(true);
    }
  });

  test('claim: a live socket is refused, a corpse is removed, a non-socket file is refused', async () => {
    const dir = await freshScratch('claim');
    const live = join(dir, 'l.sock');
    const server = startServer(unixCfg(live), () => new Response('live'));
    try {
      await expect(claimListenTarget({ kind: 'unix', path: live })).rejects.toBeInstanceOf(BootRefused);
    } finally {
      server.stop(true);
    }

    const corpse = join(dir, 'c.sock');
    const child = Bun.spawn([process.execPath, '-e', `Bun.serve({ unix: ${JSON.stringify(corpse)}, fetch: () => new Response('') }); setInterval(() => {}, 1000);`]);
    for (let i = 0; i < 100 && !existsSync(corpse); i++) await Bun.sleep(20);
    child.kill('SIGKILL');
    await child.exited;
    expect(lstatSync(corpse).isSocket()).toBe(true);
    await claimListenTarget({ kind: 'unix', path: corpse });
    expect(existsSync(corpse)).toBe(false);

    const plain = join(dir, 'p.sock');
    writeFileSync(plain, 'not a socket');
    await expect(claimListenTarget({ kind: 'unix', path: plain })).rejects.toThrow('is not a socket');
    expect(existsSync(plain)).toBe(true);

    await claimListenTarget({ kind: 'unix', path: join(dir, 'free.sock') }); // nothing there: free
  });

  test('claim: a held tcp port is refused', async () => {
    const held = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') });
    try {
      await expect(claimListenTarget({ kind: 'tcp', hostname: '127.0.0.1', port: held.port as number })).rejects.toBeInstanceOf(BootRefused);
    } finally {
      held.stop(true);
    }
  });

  test('drain waits for an in-flight request, then stops', async () => {
    const socket = join(await freshScratch('drain'), 'd.sock');
    const server = startServer(unixCfg(socket), async () => {
      await Bun.sleep(300);
      return new Response('done');
    });
    const inFlight = fetch('http://localhost/x', { unix: socket });
    await Bun.sleep(50);
    expect(await drainServer(server, 5_000)).toBe(0);
    expect(await (await inFlight).text()).toBe('done');
  });
});

describe('listen configuration refusals', () => {
  test('unix without SOCKET_PATH, tls without host/port, an unknown kind', () => {
    expect(() => listenTarget({ ...config, LISTEN_KIND: 'unix', SOCKET_PATH: undefined })).toThrow(BootRefused);
    expect(() => listenTarget({ ...config, LISTEN_KIND: 'tls', TLS_HOST: undefined, TLS_PORT: 9443 })).toThrow(BootRefused);
    expect(() => listenTarget({ ...config, LISTEN_KIND: 'tcp' as unknown as 'tls' })).toThrow("LISTEN_KIND 'tcp'");
  });

  test('the client-verification flags are constants', () => {
    expect(MTLS_VERIFY).toEqual({ requestCert: true, rejectUnauthorized: true });
    expect(Object.isFrozen(MTLS_VERIFY)).toBe(true);
  });

  test('tls with any of cert/key/ca missing, unreadable or not PEM refuses to boot', async () => {
    const dir = await freshScratch('tlsbad');
    const pem = (label: string) => `-----BEGIN ${label}-----\nAAAA\n-----END ${label}-----\n`;
    const cert = join(dir, 'c.crt');
    const key = join(dir, 'k.key');
    const ca = join(dir, 'ca.crt');
    writeFileSync(cert, pem('CERTIFICATE'));
    writeFileSync(key, pem('PRIVATE KEY'), { mode: 0o600 });
    writeFileSync(ca, pem('CERTIFICATE'));
    const base = { ...config, LISTEN_KIND: 'tls' as const, TLS_HOST: '127.0.0.1', TLS_PORT: 0, TLS_CERT_FILE: cert, TLS_KEY_FILE: key, TLS_CLIENT_CA_FILE: ca };
    const handler = () => new Response('');

    expect(() => serveOptions({ ...base, TLS_CLIENT_CA_FILE: undefined }, handler)).toThrow('TLS_CLIENT_CA_FILE is empty');
    expect(() => serveOptions({ ...base, TLS_CLIENT_CA_FILE: join(dir, 'missing.crt') }, handler)).toThrow('TLS_CLIENT_CA_FILE');
    expect(() => serveOptions({ ...base, TLS_CERT_FILE: join(dir, 'missing.crt') }, handler)).toThrow('TLS_CERT_FILE');
    expect(() => serveOptions({ ...base, TLS_KEY_FILE: join(dir, 'missing.key') }, handler)).toThrow('TLS_KEY_FILE');
    writeFileSync(join(dir, 'junk'), 'not pem');
    expect(() => serveOptions({ ...base, TLS_CLIENT_CA_FILE: join(dir, 'junk') }, handler)).toThrow('not a PEM');
    const openKey = join(dir, 'open.key');
    writeFileSync(openKey, pem('PRIVATE KEY'), { mode: 0o644 });
    expect(() => serveOptions({ ...base, TLS_KEY_FILE: openKey }, handler)).toThrow('world-accessible');
    // the refusal names the mode the provisioner actually writes (MODES.tlsServerKey), which it accepts
    expect(() => serveOptions({ ...base, TLS_KEY_FILE: openKey }, handler)).toThrow(
      `expected no world bits (provisioned: 0${MODES.tlsServerKey.mode.toString(8)})`,
    );
    const provisionedKey = join(dir, 'provisioned.key');
    writeFileSync(provisionedKey, pem('PRIVATE KEY'), { mode: MODES.tlsServerKey.mode });
    expect(() => serveOptions({ ...base, TLS_KEY_FILE: provisionedKey }, handler)).not.toThrow();

    const options = serveOptions(base, handler) as unknown as { tls: Record<string, unknown>; hostname: string };
    expect(options.hostname).toBe('127.0.0.1');
    expect(options.tls.requestCert).toBe(true);
    expect(options.tls.rejectUnauthorized).toBe(true);
    expect(options.tls.ca).toBe(pem('CERTIFICATE'));
  });
});
