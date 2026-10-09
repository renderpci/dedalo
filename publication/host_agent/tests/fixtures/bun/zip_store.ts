/**
 * TEST-ONLY builder of the fake Bun release archives the P5 gates verify
 * (tests/init_install_sh.test.ts, tests/init_bun_install.test.ts, tests/init_bun_asset.test.ts),
 * in-test, so no binary fixture lives on disk and each test makes exactly the archive it needs.
 * The archive is written by the REAL Info-ZIP `zip` (no encoder of our own): entries are files in
 * a scratch tree carrying their Unix modes, so `unzip` restores the executable bit of
 * `<asset>/bun` exactly as it does for a real Bun release. `zip` is a declared tool of the suite
 * (ci/Dockerfile installs it); a host without it fails loudly here, never silently.
 *
 * fakeBun(version) is a POSIX sh script standing in for the Bun binary: it answers
 * `--version` with `version` (or exits with `exitCode`), so the trampoline's post-verify
 * `--version` runs on macOS and Linux alike.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array | string;
  /** Unix mode, default 0o755. */
  readonly mode?: number;
}

/** A fixed mtime, so the same entries always give the same archive bytes. */
const FIXED_TIME = new Date('2020-01-01T00:00:00Z');

export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const zipBin = Bun.which('zip');
  if (zipBin === null) throw new Error('zip_store: the `zip` tool (Info-ZIP) is required by this suite and is not installed');
  const scratch = mkdtempSync(join(tmpdir(), 'dedalo-fake-bun-zip-'));
  try {
    for (const entry of entries) {
      const path = join(scratch, 'tree', entry.name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, entry.data);
      chmodSync(path, entry.mode ?? 0o755);
      utimesSync(path, FIXED_TIME, FIXED_TIME);
    }
    const out = join(scratch, 'out.zip');
    // -X: no extra attributes (uid/gid, extended timestamps) beyond the Unix mode; -0: STORE.
    const run = Bun.spawnSync(['zip', '-X', '-0', '-q', out, ...entries.map(e => e.name)], {
      cwd: join(scratch, 'tree'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PATH: dirname(zipBin), LC_ALL: 'C' },
    });
    if (run.exitCode !== 0) throw new Error(`zip_store: zip exited ${run.exitCode}: ${run.stderr.toString().trim()}`);
    return new Uint8Array(readFileSync(out));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
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
