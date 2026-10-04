import { describe, expect, test } from 'bun:test';
import { X509Certificate } from 'node:crypto';
import { derive } from '../src/provision/layout';
import { ensureTls, parseEngineBundle, TLS_VALIDITY, type TlsIo } from '../src/provision/tls';
import { tlsDeclaration, unixDeclaration } from './fixtures/provision_declaration';

const DAY = 86_400_000;
const T0 = new Date('2026-10-03T12:00:00Z');

interface Entry {
  body: string;
  owner: string;
  group: string;
  mode: number;
}

function memoryIo() {
  const files = new Map<string, Entry>();
  let writes = 0;
  const io: TlsIo = {
    readFile: path => files.get(path)?.body ?? null,
    writeFile: (path, body, owner, group, mode) => {
      writes++;
      files.set(path, { body, owner, group, mode });
    },
  };
  return { io, files, writes: () => writes };
}

const layout = derive(tlsDeclaration());
const tls = layout.tls!;

describe('ensureTls', () => {
  test("first run issues CA, server, client with Task 8's MODES rows", () => {
    const m = memoryIo();
    const report = ensureTls(layout, m.io, T0);
    expect(report.issued).toEqual(['ca', 'server', 'client']);
    expect(report.engineBundleChanged).toBe(true);
    const access = (path: string) => {
      const e = m.files.get(path)!;
      return [e.owner, e.group, e.mode];
    };
    expect(access(tls.caKey)).toEqual(['root', 'root', 0o600]);
    expect(access(tls.caCert)).toEqual(['root', 'root', 0o644]);
    expect(access(tls.serverKey)).toEqual(['dedalo-pubhost', 'root', 0o400]);
    expect(access(tls.serverCert)).toEqual(['root', 'root', 0o644]);
    expect(access(layout.engineBundlePath)).toEqual(['root', 'root', 0o600]);
    expect(tls.clientCa).toBe(tls.caCert);
  });

  test('certificates: the CA is a CA; server SAN = the declared address; both leaves chain to it', () => {
    const m = memoryIo();
    ensureTls(layout, m.io, T0);
    const ca = new X509Certificate(m.files.get(tls.caCert)!.body);
    const server = new X509Certificate(m.files.get(tls.serverCert)!.body);
    const bundle = parseEngineBundle(m.files.get(layout.engineBundlePath)!.body)!;
    const client = new X509Certificate(bundle.certPem);
    expect(ca.ca).toBe(true);
    expect(server.ca).toBe(false);
    expect(server.subjectAltName).toBe('IP Address:10.8.0.2');
    expect(server.checkIssued(ca) && server.verify(ca.publicKey)).toBe(true);
    expect(client.checkIssued(ca) && client.verify(ca.publicKey)).toBe(true);
    expect(bundle.caPem).toBe(m.files.get(tls.caCert)!.body);
    expect(server.validToDate.getTime()).toBe(T0.getTime() + TLS_VALIDITY.leafDays * DAY);
  });

  test('a second run writes NOTHING', () => {
    const m = memoryIo();
    ensureTls(layout, m.io, T0);
    const before = m.writes();
    const report = ensureTls(layout, m.io, new Date(T0.getTime() + DAY));
    expect(report.issued).toEqual([]);
    expect(report.engineBundleChanged).toBe(false);
    expect(m.writes()).toBe(before);
  });

  test('inside the leaf renewal window: server + client reissued, CA kept', () => {
    const m = memoryIo();
    ensureTls(layout, m.io, T0);
    const caBefore = m.files.get(tls.caCert)!.body;
    const later = new Date(T0.getTime() + (TLS_VALIDITY.leafDays - TLS_VALIDITY.leafRenewDays + 1) * DAY);
    const report = ensureTls(layout, m.io, later);
    expect(report.issued).toEqual(['server', 'client']);
    expect(report.engineBundleChanged).toBe(true);
    expect(m.files.get(tls.caCert)!.body).toBe(caBefore);
  });

  test('inside the CA renewal window: everything reissued', () => {
    const m = memoryIo();
    ensureTls(layout, m.io, T0);
    const later = new Date(T0.getTime() + (TLS_VALIDITY.caDays - TLS_VALIDITY.caRenewDays + 1) * DAY);
    expect(ensureTls(layout, m.io, later).issued).toEqual(['ca', 'server', 'client']);
  });

  test('a changed listen address reissues ONLY the server certificate', () => {
    const m = memoryIo();
    ensureTls(layout, m.io, T0);
    const moved = derive({ ...tlsDeclaration(), listen: { kind: 'tls', host: '10.8.0.9', port: 7443 } });
    const report = ensureTls(moved, m.io, T0);
    expect(report.issued).toEqual(['server']);
    expect(report.engineBundleChanged).toBe(false);
    expect(new X509Certificate(m.files.get(tls.serverCert)!.body).subjectAltName).toBe('IP Address:10.8.0.9');
  });

  test('a server key that no longer matches its certificate is reissued', () => {
    const m = memoryIo();
    ensureTls(layout, m.io, T0);
    const other = memoryIo();
    ensureTls(layout, other.io, T0);
    m.files.get(tls.serverKey)!.body = other.files.get(tls.serverKey)!.body;
    expect(ensureTls(layout, m.io, T0).issued).toEqual(['server']);
  });

  test('a unix listener has no TLS material', () => {
    const m = memoryIo();
    expect(ensureTls(derive(unixDeclaration()), m.io, T0)).toEqual({
      applicable: false,
      issued: [],
      engineBundleChanged: false,
      caFingerprint: null,
    });
    expect(m.files.size).toBe(0);
  });
});

describe('the issued material works on a real mTLS handshake', () => {
  test('engine bundle → 200; no client cert, a rogue CA, the server cert as client, a wrong server CA → refused', async () => {
    const local = derive({ ...tlsDeclaration(), listen: { kind: 'tls', host: '127.0.0.1', port: 7443 } });
    const m = memoryIo();
    ensureTls(local, m.io, new Date());
    const rogue = memoryIo();
    ensureTls(local, rogue.io, new Date());
    const read = (io: ReturnType<typeof memoryIo>, path: string) => io.files.get(path)!.body;
    const bundle = parseEngineBundle(read(m, local.engineBundlePath))!;
    const rogueBundle = parseEngineBundle(read(rogue, local.engineBundlePath))!;

    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      tls: {
        cert: read(m, tls.serverCert),
        key: read(m, tls.serverKey),
        ca: read(m, tls.caCert),
        requestCert: true,
        rejectUnauthorized: true,
      },
      fetch: () => new Response('ok'),
    });
    const url = `https://127.0.0.1:${server.port}/`;
    const attempt = async (t: Record<string, string>) => {
      try {
        return (await fetch(url, { tls: t })).status;
      } catch {
        return 'refused';
      }
    };
    try {
      expect(await attempt({ ca: bundle.caPem, cert: bundle.certPem, key: bundle.keyPem })).toBe(200);
      expect(await attempt({ ca: bundle.caPem })).toBe('refused');
      expect(await attempt({ ca: bundle.caPem, cert: rogueBundle.certPem, key: rogueBundle.keyPem })).toBe('refused');
      expect(await attempt({ ca: bundle.caPem, cert: read(m, tls.serverCert), key: read(m, tls.serverKey) })).toBe('refused');
      expect(await attempt({ ca: rogueBundle.caPem, cert: bundle.certPem, key: bundle.keyPem })).toBe('refused');
    } finally {
      server.stop(true);
    }
  });
});
