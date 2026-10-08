/**
 * TEST-ONLY zip STORE writer — builds the fake Bun release archives the P5 gates verify
 * (tests/init_install_sh.test.ts, tests/init_bun_install.test.ts), in-test, so no binary
 * fixture lives on disk and each test can make exactly the archive it needs. Entries carry
 * Unix mode bits (version-made-by 3) so `unzip` restores the executable bit of `<asset>/bun`.
 *
 * fakeBun(version) is a POSIX sh script standing in for the Bun binary: it answers
 * `--version` with `version` (or exits with `exitCode`), so the trampoline's post-verify
 * `--version` runs on macOS and Linux alike.
 */
import { crc32 } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array | string;
  /** Unix mode, default 0o755. */
  readonly mode?: number;
}

const enc = new TextEncoder();

export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const data = typeof entry.data === 'string' ? enc.encode(entry.data) : entry.data;
    const crc = crc32(data) >>> 0;
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 10, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0x21, true); // date 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, (3 << 8) | 20, true); // made by Unix
    cv.setUint16(6, 10, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(38, ((0o100000 | (entry.mode ?? 0o755)) << 16) >>> 0, true); // external attrs
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A stand-in Bun: `bun --version` prints `version` and exits `exitCode`. */
export function fakeBun(version: string, exitCode = 0): string {
  return `#!/bin/sh\n[ "$1" = --version ] || exit 64\nprintf '%s\\n' '${version}'\nexit ${exitCode}\n`;
}

/** `<asset>.zip` holding `<asset>/bun` (plus a decoy) the way Bun's releases are laid out. */
export function fakeBunZip(asset: string, version: string, exitCode = 0): Uint8Array {
  return zipStore([
    { name: `${asset}/bun`, data: fakeBun(version, exitCode) },
    { name: `${asset}/README.txt`, data: 'decoy: unzip -j must extract only <asset>/bun\n', mode: 0o644 },
  ]);
}

/** A `.bun-sha256` for `pin`, with `hashes` per asset (missing ones filled with zeros). */
export function shaTable(pin: string, hashes: Readonly<Record<string, string>>, signedBy = 'A'.repeat(40)): string {
  const assets = ['bun-linux-aarch64', 'bun-linux-x64-baseline', 'bun-linux-x64'];
  return `# bun-v${pin}\n# signed-by: ${signedBy}\n${assets.map(a => `${hashes[a] ?? '0'.repeat(64)}  ${a}.zip`).join('\n')}\n`;
}
