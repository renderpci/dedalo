/**
 * THE BUN ARCHIVE'S TRUST, in TS (spec S7, §1.3): which asset a CPU gets, the committed hash
 * table `.bun-sha256`, Bun's SHASUMS256.txt as a cross-check, and the one verdict. install.sh
 * applies the same rules in sh before Bun ever starts (`verify_bun`); this module is the second
 * check, inside init, on the bytes it is about to install (bun_install.ts).
 *
 * The table is generated ONLY from the signed payload of Bun's clearsigned SHASUMS256.txt.asc
 * (scripts/ci/bun_pin_hashes.ts, verified against the pinned release-key fingerprint) and is
 * committed in the source; a mirror or a MITM can change the bytes it serves, never the table.
 *
 * Table grammar (exactly five lines, a final newline allowed):
 *   # bun-v<pin>
 *   # signed-by: <40 uppercase hex>
 *   <sha256>  bun-linux-aarch64.zip
 *   <sha256>  bun-linux-x64-baseline.zip
 *   <sha256>  bun-linux-x64.zip
 * The asset lines are in BUN_ASSETS order. install.sh's header checks are held to
 * SHA_TABLE_PIN_LINE / SHA_TABLE_SIGNED_BY_LINE (tests/init_install_sh.test.ts).
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node: builtins and ../exec_contract.
 * This module never fetches; bunReleaseUrl only names the URL install.sh downloads.
 */
import { createHash } from 'node:crypto';
import { BUN_ASSETS, type BunAsset } from '../exec_contract';

/** HostFacts.cpu's shape (init/types.ts): what pickAsset needs. */
export interface CpuFacts {
  readonly arch: 'x64' | 'aarch64' | 'other';
  readonly avx2: boolean;
  readonly musl: boolean;
}

/** The pin grammar, shared with `.bun-version` and install.sh step 5.5. */
export const BUN_PIN_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
/** Line 1 of the table (install.sh holds `# bun-v$PIN` to it). */
export const SHA_TABLE_PIN_LINE = /^# bun-v([0-9]+\.[0-9]+\.[0-9]+)$/;
/** Line 2: the primary fingerprint of the key that signed the payload the table came from. */
export const SHA_TABLE_SIGNED_BY_LINE = /^# signed-by: ([0-9A-F]{40})$/;
/** One hash line: `<64 lowercase hex>  <name>` (two spaces, sha256sum's text-mode format). */
export const SHA_LINE = /^([0-9a-f]{64}) {2}(\S+)$/;

/** The default download base (install.sh `BASE`); `--mirror` replaces it, https only. */
export const BUN_RELEASE_BASE = 'https://github.com/oven-sh/bun/releases/download';

export class BunAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BunAssetError';
  }
}

/** The asset install.sh step 5.6 picks: x64 → baseline without AVX2; aarch64; anything else refused. */
export function pickAsset(cpu: CpuFacts): BunAsset {
  if (cpu.musl) throw new BunAssetError('bun: a musl libc host has no supported Bun build here (the pinned assets are glibc)');
  if (cpu.arch === 'x64') return cpu.avx2 ? 'bun-linux-x64' : 'bun-linux-x64-baseline';
  if (cpu.arch === 'aarch64') return 'bun-linux-aarch64';
  throw new BunAssetError(`bun: no Bun build for this CPU (${BUN_ASSETS.join(', ')} only)`);
}

export function isBunAsset(value: string): value is BunAsset {
  return (BUN_ASSETS as readonly string[]).includes(value);
}

export interface ShaTable {
  readonly pin: string;
  readonly signedBy: string;
  /** asset → sha256 (lowercase hex). */
  readonly hashes: Readonly<Record<BunAsset, string>>;
}

/** The committed table, strictly: exactly the grammar above, or BunAssetError naming the line. */
export function parseShaTable(text: string): ShaTable {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  if (lines.length !== 2 + BUN_ASSETS.length) {
    throw new BunAssetError(`.bun-sha256: expected ${2 + BUN_ASSETS.length} lines, found ${lines.length}`);
  }
  const pin = SHA_TABLE_PIN_LINE.exec(lines[0] ?? '')?.[1];
  if (pin === undefined) throw new BunAssetError(".bun-sha256: line 1 must be '# bun-v<pin>'");
  const signedBy = SHA_TABLE_SIGNED_BY_LINE.exec(lines[1] ?? '')?.[1];
  if (signedBy === undefined) throw new BunAssetError(".bun-sha256: line 2 must be '# signed-by: <40 uppercase hex>'");
  const hashes: Partial<Record<BunAsset, string>> = {};
  BUN_ASSETS.forEach((asset, index) => {
    const match = SHA_LINE.exec(lines[2 + index] ?? '');
    if (match === null || match[2] !== `${asset}.zip`) {
      throw new BunAssetError(`.bun-sha256: line ${3 + index} must be '<sha256>  ${asset}.zip'`);
    }
    hashes[asset] = match[1] as string;
  });
  return Object.freeze({ pin, signedBy, hashes: Object.freeze(hashes as Record<BunAsset, string>) });
}

export interface ShasumsLine {
  readonly sha: string;
  readonly name: string;
}

/**
 * Bun's SHASUMS256.txt (the cross-check, untrusted): every `<sha>  <name>` line. A line that
 * matches neither that nor blank is refused — a file we cannot read exactly is not a check.
 */
export function parseShasums(text: string): readonly ShasumsLine[] {
  const out: ShasumsLine[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') return;
    const match = SHA_LINE.exec(line);
    if (match === null) throw new BunAssetError(`SHASUMS256.txt: line ${index + 1} is not '<sha256>  <name>'`);
    out.push(Object.freeze({ sha: match[1] as string, name: match[2] as string }));
  });
  return Object.freeze(out);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type ArchiveVerdict =
  | { readonly ok: true; readonly sha: string }
  | { readonly ok: false; readonly reason: string };

/**
 * THE VERDICT (spec S7, §5 step 4.1): the archive's in-process sha256 equals the committed
 * table's line for `asset`; the table's pin is `pin`; when the sums are given, exactly one
 * SHASUMS line names `<asset>.zip` and it agrees. Every refusal names what disagreed and never
 * suggests trusting the download instead.
 */
export function verifyArchive(
  bytes: Uint8Array,
  asset: string,
  pin: string,
  tableText: string,
  sumsText: string | null,
): ArchiveVerdict {
  if (!isBunAsset(asset)) return { ok: false, reason: `'${asset}' is not a Bun asset (${BUN_ASSETS.join(', ')})` };
  if (!BUN_PIN_PATTERN.test(pin)) return { ok: false, reason: `the pin '${pin}' is not <major>.<minor>.<patch>` };
  let table: ShaTable;
  try {
    table = parseShaTable(tableText);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  if (table.pin !== pin) {
    return { ok: false, reason: `.bun-sha256 is for bun-v${table.pin}, the source pins ${pin}: the table and .bun-version disagree` };
  }
  const expected = table.hashes[asset];
  const actual = sha256Hex(bytes);
  if (actual !== expected) {
    return { ok: false, reason: `${asset}.zip has sha256 ${actual}, .bun-sha256 says ${expected}: the archive is not the pinned release` };
  }
  if (sumsText !== null) {
    let sums: readonly ShasumsLine[];
    try {
      sums = parseShasums(sumsText);
    } catch (error) {
      return { ok: false, reason: (error as Error).message };
    }
    const named = sums.filter(line => line.name === `${asset}.zip`);
    if (named.length !== 1) {
      return { ok: false, reason: `SHASUMS256.txt names ${asset}.zip ${named.length} times (exactly once required)` };
    }
    if (named[0]?.sha !== expected) {
      return { ok: false, reason: `SHASUMS256.txt disagrees with .bun-sha256 for ${asset}.zip: refusing both` };
    }
  }
  return { ok: true, sha: actual };
}

/** `<base>/bun-v<pin>/<asset>.zip` — the URL install.sh's curl fetches (base: https, no trailing '/'). */
export function bunReleaseUrl(pin: string, asset: string, base: string = BUN_RELEASE_BASE): string {
  if (!BUN_PIN_PATTERN.test(pin)) throw new BunAssetError(`bun: the pin '${pin}' is not <major>.<minor>.<patch>`);
  if (!isBunAsset(asset)) throw new BunAssetError(`bun: '${asset}' is not a Bun asset`);
  if (!/^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[A-Za-z0-9._~%/-]*)?$/.test(base) || base.endsWith('/')) {
    throw new BunAssetError('bun: the release base must be an https URL without a trailing /');
  }
  return `${base}/bun-v${pin}/${asset}.zip`;
}
