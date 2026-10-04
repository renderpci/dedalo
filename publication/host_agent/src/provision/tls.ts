/**
 * THE mTLS MATERIAL (D2): a private CA, the agent's server certificate (SAN = the declared
 * listen address) and the engine's client certificate, issued on the publication host by the
 * root-run provisioner (cli.ts `apply`, after the plan's filesystem actions made layout.tls.dir
 * and layout.engineBundleDir, BEFORE any unit starts). Zero-dep: node: builtins + ./layout.
 *
 * WHY NOT THE OpenSSL CLI: the provisioner runs on Debian/Ubuntu/RHEL (OpenSSL 3.x) and is
 * exercised on macOS (LibreSSL), whose `req -addext` / `x509 -extfile` grammars differ, and a
 * spawned `openssl` would be a child process outside src/exec.ts's closed set. Same reasoning
 * as D7 (bundles parsed in-process): one code path, every host. The DER below is the RFC 5280
 * subset these three certificates need; node:crypto signs; tests/provision_tls.test.ts
 * round-trips every certificate through X509Certificate AND a real Bun.serve mTLS handshake.
 *
 * IDEMPOTENT BY CONSTRUCTION: a run reissues ONLY what is missing, unparseable, not issued by
 * the current CA, not matching its key, not matching the declared address (server), or inside
 * its renewal window. A second run writes nothing.
 *
 * WHO HOLDS WHAT (layout.ts MODES rows, never a number typed here):
 *   tls/ca.pem          tlsPublic         root:root 0644 — also the agent's TLS_CLIENT_CA_FILE
 *   tls/ca.key          tlsCaKey          root:root 0600 — the agent can never sign
 *   tls/server.pem      tlsPublic         root:root 0644
 *   tls/server.key      tlsServerKey      <agent>:root 0400 — the agent's own key
 *   engine_bundle/engine_bundle.pem  engineBundleFile  root:root 0600 in a 0700 root dir —
 *                       client cert + client key + CA, the ONE file the operator carries to
 *                       the work host. The client key exists nowhere else.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
  X509Certificate,
} from 'node:crypto';
import { isIP, isIPv4, isIPv6 } from 'node:net';
import type { AgentLayout, ModeKey } from './layout';
import { groupName, MODES, ownerName } from './layout';

/* ── DER ───────────────────────────────────────────────────────────────────────────── */

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function derLength(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function tlv(tag: number, ...content: Uint8Array[]): Uint8Array {
  const body = concat(content);
  return concat([Uint8Array.of(tag), derLength(body.length), body]);
}

const seq = (...items: Uint8Array[]) => tlv(0x30, ...items);
const derSet = (...items: Uint8Array[]) => tlv(0x31, ...items);
const octets = (bytes: Uint8Array) => tlv(0x04, bytes);
const bitString = (bytes: Uint8Array, unusedBits = 0) => tlv(0x03, Uint8Array.of(unusedBits), bytes);
const explicit = (n: number, inner: Uint8Array) => tlv(0xa0 | n, inner);
const utf8 = (text: string) => tlv(0x0c, new TextEncoder().encode(text));
const BOOLEAN_TRUE = Uint8Array.of(0x01, 0x01, 0xff);

/** A non-negative INTEGER: minimal bytes, a leading 0x00 when the high bit is set. */
function integer(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0 && (bytes[start + 1] as number) < 0x80) start++;
  const trimmed = bytes.subarray(start);
  return tlv(0x02, (trimmed[0] as number) >= 0x80 ? concat([Uint8Array.of(0), trimmed]) : trimmed);
}

function oid(dotted: string): Uint8Array {
  const arcs = dotted.split('.').map(Number);
  const out: number[] = [40 * (arcs[0] as number) + (arcs[1] as number)];
  for (const arc of arcs.slice(2)) {
    const chunk: number[] = [arc & 0x7f];
    for (let v = Math.floor(arc / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift(0x80 | (v & 0x7f));
    out.push(...chunk);
  }
  return tlv(0x06, Uint8Array.from(out));
}

/** RFC 5280 §4.1.2.5: UTCTime through 2049, GeneralizedTime from 2050. Seconds, Zulu. */
function time(date: Date): Uint8Array {
  const digits = date.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const year = date.getUTCFullYear();
  return year >= 1950 && year < 2050
    ? tlv(0x17, new TextEncoder().encode(`${digits.slice(2)}Z`))
    : tlv(0x18, new TextEncoder().encode(`${digits}Z`));
}

/* ── X.509 ─────────────────────────────────────────────────────────────────────────── */

const OID = Object.freeze({
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  commonName: '2.5.4.3',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectAltName: '2.5.29.17',
  subjectKeyId: '2.5.29.14',
  authorityKeyId: '2.5.29.35',
  serverAuth: '1.3.6.1.5.5.7.3.1',
  clientAuth: '1.3.6.1.5.5.7.3.2',
});

export type CertRole = 'ca' | 'server' | 'client';

export interface IssueRequest {
  readonly role: CertRole;
  readonly commonName: string;
  /** Private key of the subject (its public half is certified). */
  readonly subjectKey: KeyObject;
  /** The issuer's CN (= commonName for the self-signed CA). */
  readonly issuerName: string;
  /** Private key that signs. */
  readonly issuerKey: KeyObject;
  readonly notBefore: Date;
  readonly notAfter: Date;
  /** Server only: the ONE address the engine dials — an IP literal or a DNS name. */
  readonly san?: string;
}

const DNS_NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const COMMON_NAME = /^[A-Za-z0-9 ._-]{1,64}$/;

function x509Name(cn: string): Uint8Array {
  if (!COMMON_NAME.test(cn)) throw new Error(`x509: common name '${cn}' does not match ${COMMON_NAME.source}.`);
  return seq(derSet(seq(oid(OID.commonName), utf8(cn))));
}

/** RFC 5280 §4.2.1.2 method (1): SHA-1 of the subjectPublicKey BIT STRING contents. */
function keyId(publicKey: KeyObject): Uint8Array {
  const spki = new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }));
  // P-256 SPKI: the last 65 bytes are 0x04 || X || Y.
  return new Uint8Array(createHash('sha1').update(spki.subarray(spki.length - 65)).digest());
}

function extension(id: string, critical: boolean, value: Uint8Array): Uint8Array {
  return critical ? seq(oid(id), BOOLEAN_TRUE, octets(value)) : seq(oid(id), octets(value));
}

function ipv6Bytes(address: string): Uint8Array {
  if (address.includes('.') || address.includes('%')) {
    throw new Error(`x509: IPv6 SAN '${address}' with an embedded IPv4 or a zone id is not supported.`);
  }
  const [head = '', tail = ''] = address.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = address.includes('::') ? [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t] : h;
  const out = new Uint8Array(16);
  groups.forEach((g, i) => {
    const v = Number.parseInt(g, 16);
    out[2 * i] = v >> 8;
    out[2 * i + 1] = v & 0xff;
  });
  return out;
}

/** GeneralNames with ONE entry: [7] iPAddress for a literal, [2] dNSName otherwise. */
export function sanValue(host: string): Uint8Array {
  if (isIPv4(host)) return seq(tlv(0x87, Uint8Array.from(host.split('.').map(Number))));
  if (isIPv6(host)) return seq(tlv(0x87, ipv6Bytes(host)));
  if (!DNS_NAME.test(host)) throw new Error(`x509: SAN '${host}' is neither an IP literal nor a lowercase DNS name.`);
  return seq(tlv(0x82, new TextEncoder().encode(host)));
}

/** Issue one certificate; returns PEM. CA: self-signed when issuerKey === subjectKey. */
export function issueCertificate(req: IssueRequest): string {
  if (!(req.notAfter.getTime() > req.notBefore.getTime())) throw new Error('x509: notAfter must be after notBefore.');
  const subjectPublic = createPublicKey(req.subjectKey);
  const issuerPublic = createPublicKey(req.issuerKey);
  const extensions: Uint8Array[] = [];
  if (req.role === 'ca') {
    extensions.push(extension(OID.basicConstraints, true, seq(BOOLEAN_TRUE)));
    // digitalSignature(0) + keyCertSign(5) + cRLSign(6) = 1000 0110, 1 unused bit.
    extensions.push(extension(OID.keyUsage, true, bitString(Uint8Array.of(0x86), 1)));
  } else {
    extensions.push(extension(OID.basicConstraints, true, seq()));
    // digitalSignature(0) = 1000 0000, 7 unused bits.
    extensions.push(extension(OID.keyUsage, true, bitString(Uint8Array.of(0x80), 7)));
    extensions.push(extension(OID.extKeyUsage, false, seq(oid(req.role === 'server' ? OID.serverAuth : OID.clientAuth))));
    if (req.role === 'server') {
      if (!req.san) throw new Error('x509: a server certificate needs its SAN (the declared listen address).');
      extensions.push(extension(OID.subjectAltName, false, sanValue(req.san)));
    }
  }
  extensions.push(extension(OID.subjectKeyId, false, octets(keyId(subjectPublic))));
  extensions.push(extension(OID.authorityKeyId, false, seq(tlv(0x80, keyId(issuerPublic)))));

  const serial = new Uint8Array(randomBytes(16));
  serial[0] = ((serial[0] as number) & 0x7f) | 0x01; // positive, never zero-led
  const algorithm = seq(oid(OID.ecdsaWithSha256));
  const tbs = seq(
    explicit(0, integer(Uint8Array.of(2))),
    integer(serial),
    algorithm,
    x509Name(req.issuerName),
    seq(time(req.notBefore), time(req.notAfter)),
    x509Name(req.commonName),
    new Uint8Array(subjectPublic.export({ type: 'spki', format: 'der' })),
    explicit(3, seq(...extensions)),
  );
  const signature = new Uint8Array(sign('sha256', tbs, req.issuerKey)); // EC: DER ECDSA-Sig-Value
  const der = seq(tbs, algorithm, bitString(signature));
  const b64 = (Buffer.from(der).toString('base64').match(/.{1,64}/g) ?? []).join('\n');
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

function generateP256Key(): KeyObject {
  return generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
}

function privateKeyPem(key: KeyObject): string {
  return key.export({ type: 'pkcs8', format: 'pem' }) as string;
}

/* ── the material ──────────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

export const TLS_VALIDITY = Object.freeze({
  caDays: 3650,
  leafDays: 397,
  /** A CA inside this window is reissued — and with it both leaves. */
  caRenewDays: 365,
  /** A leaf inside this window is reissued. */
  leafRenewDays: 30,
  /** notBefore is backdated this much: a host clock a few minutes behind still accepts. */
  backdateMs: 5 * 60_000,
});

/**
 * The two things issuance does to the host. cli.ts builds it over Task 8's ProvisionIo
 * (writeAtomic: temp → chown → chmod → rename, names resolved to ids from the observed host)
 * and a root-only reader; `check` passes a writer that records nothing.
 */
export interface TlsIo {
  readFile(path: string): string | null;
  writeFile(path: string, body: string, owner: string, group: string, mode: number): void;
}

export type TlsPiece = 'ca' | 'server' | 'client';

export interface TlsReport {
  readonly applicable: boolean;
  readonly issued: readonly TlsPiece[];
  /** True when the engine bundle changed this run: carry it to the work host. */
  readonly engineBundleChanged: boolean;
  /** sha256 of the CA certificate (DER), uppercase colon form — compare it on the work host. */
  readonly caFingerprint: string | null;
}

interface Loaded {
  readonly cert: X509Certificate;
  readonly certPem: string;
  readonly key: KeyObject;
}

const CERT_BLOCK = /-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+?-----END CERTIFICATE-----\n/g;
const KEY_BLOCK = /-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+?-----END PRIVATE KEY-----\n/;

function load(certPem: string | null, keyPem: string | null): Loaded | null {
  if (!certPem || !keyPem) return null;
  try {
    const cert = new X509Certificate(certPem);
    const key = createPrivateKey(keyPem);
    const fromKey = createPublicKey(key).export({ type: 'spki', format: 'der' });
    const fromCert = cert.publicKey.export({ type: 'spki', format: 'der' });
    if (!fromKey.equals(fromCert)) return null;
    return { cert, certPem, key };
  } catch {
    return null;
  }
}

function remainingMs(cert: X509Certificate, now: Date): number {
  return cert.validToDate.getTime() - now.getTime();
}

function issuedBy(leaf: X509Certificate, ca: Loaded): boolean {
  return leaf.checkIssued(ca.cert) && leaf.verify(ca.cert.publicKey);
}

function matchesAddress(cert: X509Certificate, host: string): boolean {
  return isIP(host) ? cert.checkIP(host) !== undefined : cert.checkHost(host, { subject: 'never' }) !== undefined;
}

function validity(now: Date, days: number): { notBefore: Date; notAfter: Date } {
  return {
    notBefore: new Date(now.getTime() - TLS_VALIDITY.backdateMs),
    notAfter: new Date(now.getTime() + days * DAY_MS),
  };
}

/** Split a bundle into (client cert, client key, CA cert) — the order ensureTls writes. */
export function parseEngineBundle(text: string | null): { certPem: string; keyPem: string; caPem: string } | null {
  if (!text) return null;
  const certs = text.match(CERT_BLOCK) ?? [];
  const key = KEY_BLOCK.exec(text);
  if (certs.length !== 2 || !key) return null;
  return { certPem: certs[0] as string, keyPem: key[0], caPem: certs[1] as string };
}

export function ensureTls(layout: AgentLayout, io: TlsIo, now: Date): TlsReport {
  const tls = layout.tls;
  if (layout.listen.kind !== 'tls' || tls === null) {
    return { applicable: false, issued: [], engineBundleChanged: false, caFingerprint: null };
  }
  const host = layout.listen.host;
  const caName = `dedalo-publication-host ${layout.instance} CA`;
  const issued: TlsPiece[] = [];
  const put = (path: string, body: string, key: ModeKey): void => {
    const row = MODES[key];
    io.writeFile(path, body, ownerName(layout, row.owner), groupName(layout, row.group), row.mode);
  };

  /* CA */
  let ca = load(io.readFile(tls.caCert), io.readFile(tls.caKey));
  if (!ca || !ca.cert.ca || remainingMs(ca.cert, now) < TLS_VALIDITY.caRenewDays * DAY_MS) {
    const key = generateP256Key();
    const certPem = issueCertificate({
      role: 'ca',
      commonName: caName,
      subjectKey: key,
      issuerName: caName,
      issuerKey: key,
      ...validity(now, TLS_VALIDITY.caDays),
    });
    put(tls.caKey, privateKeyPem(key), 'tlsCaKey');
    put(tls.caCert, certPem, 'tlsPublic');
    ca = { cert: new X509Certificate(certPem), certPem, key };
    issued.push('ca');
  }
  const caRenewed = issued.includes('ca');

  /* Server */
  const server = load(io.readFile(tls.serverCert), io.readFile(tls.serverKey));
  if (
    caRenewed ||
    !server ||
    !issuedBy(server.cert, ca) ||
    !matchesAddress(server.cert, host) ||
    remainingMs(server.cert, now) < TLS_VALIDITY.leafRenewDays * DAY_MS
  ) {
    const key = generateP256Key();
    const certPem = issueCertificate({
      role: 'server',
      commonName: `dedalo-publication-host ${layout.instance}`,
      subjectKey: key,
      issuerName: caName,
      issuerKey: ca.key,
      san: host,
      ...validity(now, TLS_VALIDITY.leafDays),
    });
    put(tls.serverKey, privateKeyPem(key), 'tlsServerKey');
    put(tls.serverCert, certPem, 'tlsPublic');
    issued.push('server');
  }

  /* Engine client bundle */
  const bundle = parseEngineBundle(io.readFile(layout.engineBundlePath));
  const client = bundle ? load(bundle.certPem, bundle.keyPem) : null;
  if (
    caRenewed ||
    !bundle ||
    !client ||
    bundle.caPem !== ca.certPem ||
    !issuedBy(client.cert, ca) ||
    remainingMs(client.cert, now) < TLS_VALIDITY.leafRenewDays * DAY_MS
  ) {
    const key = generateP256Key();
    const certPem = issueCertificate({
      role: 'client',
      commonName: `dedalo-engine for ${layout.instance}`,
      subjectKey: key,
      issuerName: caName,
      issuerKey: ca.key,
      ...validity(now, TLS_VALIDITY.leafDays),
    });
    put(layout.engineBundlePath, `${certPem}${privateKeyPem(key)}${ca.certPem}`, 'engineBundleFile');
    issued.push('client');
  }

  return {
    applicable: true,
    issued,
    engineBundleChanged: issued.includes('client'),
    caFingerprint: ca.cert.fingerprint256,
  };
}
