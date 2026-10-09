/**
 * THE SEALED PAIRING PACKAGE (engineering/PUBLICATION_HOST_SPEC.md §9.12) — the two-machine
 * pairing carried as ONE encrypted file instead of three loose secrets.
 *
 * `provision init` writes it on the publication host at the end of a two-machine (tls listener)
 * install: the engine fragment, the agent's SERVICE_TOKEN and the engine TLS bundle, sealed with
 * a one-time passphrase shown once on the terminal. The work system's pairing command
 * (`dedalo:pair-publication-host add <name> --package <file>`) opens it in memory and then runs
 * the very same checks and commit as the loose-file path.
 *
 * FORMAT v1 (binary; every multi-byte field is a fixed-size byte string):
 *
 *   offset  size  field
 *        0     8  magic 'DDPHPAIR'
 *        8     1  version = 1
 *        9     1  kdf = 1 (scrypt)
 *       10     1  log2(N) = 17
 *       11     1  r = 8
 *       12     1  p = 1
 *       13    16  salt
 *       29    12  nonce (AES-256-GCM IV)
 *       41     …  ciphertext
 *     end-16   16  GCM tag
 *
 * The 41-byte header is the GCM additional data: a changed header byte fails authentication.
 * The reader refuses BEFORE the KDF runs: another magic, another version, any KDF or parameter
 * other than exactly the ones written here (a file never chooses its own work factor), a file
 * shorter than header + tag or longer than MAX_PACKAGE_BYTES. A wrong passphrase and a tampered
 * body are the SAME refusal (`auth`): GCM cannot tell them apart, and the message says so.
 *
 * The plaintext is JSON with EXACTLY the keys {format, version, fragment, token, bundle}; any
 * other key set, a non-string part, or a part over its cap is refused (`parts`).
 *
 * The passphrase: 24 characters of an unambiguous base-32 alphabet (120 bits from randomBytes),
 * shown as six groups of four. Input is normalized (spaces and dashes dropped, upper-cased, O read
 * as 0 and I/L as 1) and a
 * value outside that shape is refused (`passphrase_shape`) before the KDF.
 *
 * ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node:crypto only. The engine's pairing
 * script imports this file (test/unit/tool_lossless_writeback_tripwire.test.ts admits it by its
 * checked import closure), so the format is written and read by ONE implementation.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

export const PACKAGE_MAGIC = 'DDPHPAIR';
export const PACKAGE_VERSION = 1;
export const KDF_SCRYPT = 1;
export const SCRYPT_LOG2N = 17;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
/** 128 · N · r = 128 MiB for these parameters; node's default cap (32 MiB) would refuse them. */
export const SCRYPT_MAXMEM = 256 * 1024 * 1024;
export const SALT_BYTES = 16;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const HEADER_BYTES = PACKAGE_MAGIC.length + 5 + SALT_BYTES + NONCE_BYTES;
export const MAX_PACKAGE_BYTES = 1024 * 1024;
export const PLAINTEXT_FORMAT = 'dedalo-publication-host-pairing';
/** Per-part caps (UTF-8 bytes): a fragment is a few hundred bytes, a bundle a few KiB. */
export const PART_CAPS = Object.freeze({ fragment: 16 * 1024, token: 1024, bundle: 256 * 1024 });
/** Crockford's base 32 (no I, L, O, U): what an operator reads off a screen and types again. */
export const PASSPHRASE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PASSPHRASE_LENGTH = 24;
const PASSPHRASE_SHAPE = new RegExp(`^[${PASSPHRASE_ALPHABET}]{${PASSPHRASE_LENGTH}}$`);
const PLAINTEXT_KEYS = Object.freeze(['bundle', 'format', 'fragment', 'token', 'version']);

export interface PairingParts {
  /** The agent's engine.env.fragment, as provision apply wrote it. */
  readonly fragment: string;
  /** The agent's SERVICE_TOKEN. */
  readonly token: string;
  /** engine_bundle.pem (client certificate, client key, CA). */
  readonly bundle: string;
}

export type PackageRefusalReason = 'bad_magic' | 'version' | 'params' | 'truncated' | 'too_large' | 'auth' | 'parts' | 'passphrase_shape';

const MESSAGES: Readonly<Record<PackageRefusalReason, string>> = {
  bad_magic: 'not a Dédalo pairing package (wrong magic)',
  version: 'a pairing package of a version this build does not read',
  params: 'the package names key-derivation parameters other than the ones this build writes',
  truncated: 'the package is truncated',
  too_large: `the package is larger than ${MAX_PACKAGE_BYTES} bytes`,
  auth: 'the passphrase is wrong or the package was altered (the two cannot be told apart)',
  parts: 'the package does not hold exactly a fragment, a token and a bundle',
  passphrase_shape: `the passphrase is not ${PASSPHRASE_LENGTH} characters of the pairing alphabet (dashes and spaces are ignored)`,
};

export class PairingPackageRefused extends Error {
  readonly reason: PackageRefusalReason;
  constructor(reason: PackageRefusalReason) {
    super(`pairing package refused: ${MESSAGES[reason]}`);
    this.name = 'PairingPackageRefused';
    this.reason = reason;
  }
}

/** A fresh one-time passphrase, grouped for display (`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`). */
export function newPassphrase(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(PASSPHRASE_LENGTH);
  let raw = '';
  // 256 is a multiple of 32: `byte % 32` is uniform.
  for (const byte of bytes) raw += PASSPHRASE_ALPHABET[byte % 32];
  return raw.match(/.{4}/g)?.join('-') ?? raw;
}

/** The canonical form the KDF reads: spaces and dashes dropped, upper case; null when the shape is wrong. */
export function normalizePassphrase(input: string): string | null {
  // Crockford's reading rules: O is 0, I and L are 1 (the letters never appear in a passphrase).
  const canonical = input.replace(/[\s-]/g, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  return PASSPHRASE_SHAPE.test(canonical) ? canonical : null;
}

function header(salt: Uint8Array, nonce: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES);
  out.set(new TextEncoder().encode(PACKAGE_MAGIC), 0);
  let at = PACKAGE_MAGIC.length;
  for (const value of [PACKAGE_VERSION, KDF_SCRYPT, SCRYPT_LOG2N, SCRYPT_R, SCRYPT_P]) out[at++] = value;
  out.set(salt, at);
  out.set(nonce, at + SALT_BYTES);
  return out;
}

function deriveKey(canonical: string, salt: Uint8Array): Buffer {
  return scryptSync(canonical, salt, 32, { N: 2 ** SCRYPT_LOG2N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
}

function checkParts(parts: Record<string, unknown>): PairingParts {
  const keys = Object.keys(parts).sort();
  if (keys.length !== PLAINTEXT_KEYS.length || keys.some((key, i) => key !== PLAINTEXT_KEYS[i])) throw new PairingPackageRefused('parts');
  if (parts.format !== PLAINTEXT_FORMAT || parts.version !== PACKAGE_VERSION) throw new PairingPackageRefused('parts');
  for (const name of ['fragment', 'token', 'bundle'] as const) {
    const value = parts[name];
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > PART_CAPS[name]) throw new PairingPackageRefused('parts');
  }
  return Object.freeze({ fragment: parts.fragment as string, token: parts.token as string, bundle: parts.bundle as string });
}

/** Seals the three parts under `passphrase` (the display or canonical form). */
export function sealPairingPackage(parts: PairingParts, passphrase: string, random: (n: number) => Uint8Array = randomBytes): Uint8Array {
  const canonical = normalizePassphrase(passphrase);
  if (canonical === null) throw new PairingPackageRefused('passphrase_shape');
  const checked = checkParts({ format: PLAINTEXT_FORMAT, version: PACKAGE_VERSION, ...parts });
  const salt = random(SALT_BYTES);
  const nonce = random(NONCE_BYTES);
  const head = header(salt, nonce);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(canonical, salt), nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(head);
  const plaintext = Buffer.from(JSON.stringify({ format: PLAINTEXT_FORMAT, version: PACKAGE_VERSION, fragment: checked.fragment, token: checked.token, bundle: checked.bundle }), 'utf8');
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  plaintext.fill(0);
  const out = new Uint8Array(HEADER_BYTES + body.length + TAG_BYTES);
  out.set(head, 0);
  out.set(body, HEADER_BYTES);
  out.set(cipher.getAuthTag(), HEADER_BYTES + body.length);
  return out;
}

/** The header checks that run BEFORE the KDF (exported for the format gate). */
export function packageHeaderProblem(bytes: Uint8Array): PackageRefusalReason | null {
  if (bytes.length > MAX_PACKAGE_BYTES) return 'too_large';
  if (bytes.length < PACKAGE_MAGIC.length) return 'truncated';
  if (Buffer.from(bytes.subarray(0, PACKAGE_MAGIC.length)).toString('latin1') !== PACKAGE_MAGIC) return 'bad_magic';
  if (bytes.length < HEADER_BYTES + TAG_BYTES) return 'truncated';
  const at = PACKAGE_MAGIC.length;
  if (bytes[at] !== PACKAGE_VERSION) return 'version';
  if (bytes[at + 1] !== KDF_SCRYPT || bytes[at + 2] !== SCRYPT_LOG2N || bytes[at + 3] !== SCRYPT_R || bytes[at + 4] !== SCRYPT_P) return 'params';
  return null;
}

/** Opens a package in memory. Throws PairingPackageRefused; never returns a partial result. */
export function openPairingPackage(bytes: Uint8Array, passphrase: string): PairingParts {
  const problem = packageHeaderProblem(bytes);
  if (problem !== null) throw new PairingPackageRefused(problem);
  const canonical = normalizePassphrase(passphrase);
  if (canonical === null) throw new PairingPackageRefused('passphrase_shape');
  const head = bytes.subarray(0, HEADER_BYTES);
  const salt = head.subarray(PACKAGE_MAGIC.length + 5, PACKAGE_MAGIC.length + 5 + SALT_BYTES);
  const nonce = head.subarray(PACKAGE_MAGIC.length + 5 + SALT_BYTES, HEADER_BYTES);
  const body = bytes.subarray(HEADER_BYTES, bytes.length - TAG_BYTES);
  const tag = bytes.subarray(bytes.length - TAG_BYTES);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(canonical, salt), nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(head);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new PairingPackageRefused('auth');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new PairingPackageRefused('parts');
  } finally {
    plaintext.fill(0);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new PairingPackageRefused('parts');
  return checkParts(parsed as Record<string, unknown>);
}
