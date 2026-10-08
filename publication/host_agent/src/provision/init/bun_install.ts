/**
 * THE BUN INSTALL (spec §5 step 4, item `bun.install`): put the pinned, verified Bun at
 * `bun_bin`, or leave the old one exactly where it was.
 *
 * Order, each step gating the next:
 *   1. the archive's sha256, computed HERE on the bytes read, against the committed table
 *      (and SHASUMS when given) — bun_asset.ts verifyArchive; mismatch → BunInstallRefused;
 *   2. unzipBun into a fresh `<stateDir>/bun_extract/` (root 0700, wiped first);
 *   3. the extracted binary's `--version` = pin (it is the first Bun code to run, and only
 *      after step 1); exit 126 names noexec/fapolicyd, any other failure names glibc;
 *   4. the missing directories of dirname(target) are created root:root 0755 — an EXISTING
 *      ancestor is never chowned or chmodded; one that is not a root-owned, non-writable real
 *      directory refuses (compare offered `relocate` for that, spec S6);
 *   5. writeBytesAtomic(target, bytes, 0755, root, root) — the temp + rename door of host_io;
 *   6. the installed target's `--version` = pin; on failure the previous bytes are written
 *      back through the same door (with no previous file the new one stays, and the next
 *      run's compare judges it again — InitIo has no single-file removal door);
 *   7. the extract directory is removed, always.
 * The `bin_t` label is NOT applied here: `provision apply` labels bun_bin before any unit
 * starts it (spec S9).
 *
 * I/O only through the injected ports (the InitIo / InitExec doors; production wiring in
 * init/act.ts). No spawn, no fs, no fetch in this file.
 */
import { dirname } from 'node:path';
import type { BunAsset, InitExec } from '../exec_contract';
import type { DirFacts } from '../lock';
import { type CpuFacts, isBunAsset, pickAsset, verifyArchive } from './bun_asset';
import type { InitIo, OperatorFile } from './types';
import { BINARY_READ_CAP_BYTES } from './types';

export class BunInstallRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BunInstallRefused';
  }
}

/** Raised after a step that changed nothing on the target failed (2, 3, 4, 6). */
export class BunInstallFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BunInstallFailed';
  }
}

export interface BunInstallPorts {
  readonly io: Pick<InitIo, 'readOperatorFile' | 'readRootFile' | 'mkdir' | 'chown' | 'chmod' | 'writeBytesAtomic' | 'removeTree'>;
  readonly exec: Pick<InitExec, 'unzipBun' | 'bunVersion'>;
  /** lstat, never following a link (LockIo.lstat's shape). */
  readonly lstat: (path: string) => DirFacts | null;
  /** The committed `.bun-sha256` text (the staged source's, or kept/'s). */
  readonly table: string;
  /** `<INIT_BASE>/<instance>`: `bun_extract/` is created under it and removed again. */
  readonly stateDir: string;
}

export interface BunInstalled {
  readonly asset: BunAsset;
  readonly sha: string;
  readonly target: string;
  /** true: a previous file at target was replaced. */
  readonly replaced: boolean;
}

export const BUN_EXTRACT_DIR_NAME = 'bun_extract';
const EXTRACT_MODE = 0o700;
const BIN_DIR_MODE = 0o755;
const BIN_MODE = 0o755;
const WRITABLE_BY_OTHERS = 0o022;

function cleanAbsolute(what: string, path: string): void {
  if (!/^\/[A-Za-z0-9._/-]*$/.test(path) || path.split('/').includes('..') || path === '/') {
    throw new BunInstallRefused(`bun: ${what} '${path}' is not a clean absolute path`);
  }
}

/** A root-owned regular file nobody else can write: the staged archive, the extracted binary. */
function readRootOwned(io: BunInstallPorts['io'], what: string, path: string): OperatorFile {
  const file = io.readOperatorFile(path, BINARY_READ_CAP_BYTES);
  if (file.uid !== 0 || (file.mode & WRITABLE_BY_OTHERS) !== 0) {
    throw new BunInstallRefused(`bun: ${what} '${path}' must be root-owned and not group/other-writable`);
  }
  return file;
}

function versionProblem(result: { code: number; stdout: string }, pin: string, bin: string, stateDir: string): string | null {
  if (result.code === 126) {
    return `bun: '${bin}' could not be executed (exit 126): '${stateDir}' is on a noexec filesystem (or fapolicyd denies it): see \`findmnt -T ${stateDir}\` / \`fapolicyd-cli --list\``;
  }
  if (result.code !== 0) {
    return `bun: '${bin} --version' failed (exit ${result.code}): the pinned Bun may need a newer glibc than this host's (\`getconf GNU_LIBC_VERSION\`)`;
  }
  const said = result.stdout.trim();
  if (said !== pin) return `bun: '${bin} --version' says '${said.slice(0, 40)}', the pin is ${pin}`;
  return null;
}

/** The directories of `dir` that do not exist yet, outermost first; every existing one is judged. */
function missingChain(dir: string, lstat: BunInstallPorts['lstat']): string[] {
  const parts = dir.split('/').filter(part => part !== '');
  const missing: string[] = [];
  let path = '';
  for (const part of parts) {
    path = `${path}/${part}`;
    const facts = lstat(path);
    if (facts === null) {
      missing.push(path);
      continue;
    }
    if (facts.type !== 'dir') {
      throw new BunInstallRefused(`bun: '${path}' (an ancestor of bun_bin) is a ${facts.type}, not a directory; nothing was changed`);
    }
    if (facts.uid !== 0 || (facts.mode & WRITABLE_BY_OTHERS) !== 0) {
      throw new BunInstallRefused(
        `bun: '${path}' (an ancestor of bun_bin) is not a root-owned directory closed to group/other writes; it is never chowned — relocate bun_bin`,
      );
    }
  }
  return missing;
}

/**
 * installBun(archive, sums, pin, cpu, target, ports). `cpu` is the HostFacts cpu row, or the
 * asset compare already chose (the `bun_install` InitAction carries the asset): both resolve
 * through the same table.
 */
export function installBun(
  archive: string,
  sums: string | null,
  pin: string,
  cpu: CpuFacts | BunAsset,
  target: string,
  ports: BunInstallPorts,
): BunInstalled {
  const { io, exec, lstat, stateDir } = ports;
  cleanAbsolute('archive', archive);
  if (sums !== null) cleanAbsolute('SHASUMS file', sums);
  cleanAbsolute('bun_bin', target);
  cleanAbsolute('state directory', stateDir);
  const asset: BunAsset = typeof cpu === 'string' ? cpu : pickAsset(cpu);
  if (!isBunAsset(asset)) throw new BunInstallRefused(`bun: '${String(asset)}' is not a Bun asset`);

  // 1. the hash, in process, before anything from the archive runs or is unpacked
  const bytes = readRootOwned(io, 'archive', archive).bytes;
  const sumsText = sums === null ? null : io.readRootFile(sums);
  if (sums !== null && sumsText === null) throw new BunInstallRefused(`bun: the SHASUMS file '${sums}' cannot be read`);
  const verdict = verifyArchive(bytes, asset, pin, ports.table, sumsText);
  if (!verdict.ok) throw new BunInstallRefused(`bun: ${verdict.reason}`);

  // 4 (judged before any change): the target's chain and the target itself
  const previousFacts = lstat(target);
  if (previousFacts !== null && previousFacts.type !== 'file') {
    throw new BunInstallRefused(`bun: bun_bin '${target}' exists and is a ${previousFacts.type}; nothing was changed`);
  }
  const missing = missingChain(dirname(target), lstat);
  const previous = previousFacts === null ? null : io.readOperatorFile(target, BINARY_READ_CAP_BYTES).bytes;

  const extract = `${stateDir}/${BUN_EXTRACT_DIR_NAME}`;
  try {
    // 2. a fresh extract directory
    if (lstat(extract) !== null) io.removeTree(extract, stateDir);
    io.mkdir(extract, EXTRACT_MODE);
    io.chown(extract, 0, 0);
    io.chmod(extract, EXTRACT_MODE);
    const unzipped = exec.unzipBun(archive, asset, extract);
    if (unzipped.code !== 0) throw new BunInstallFailed(`bun: unzip of ${asset}.zip failed (exit ${unzipped.code}); bun_bin unchanged`);
    const extracted = `${extract}/bun`;

    // 3. the extracted binary answers the pin
    const early = versionProblem(exec.bunVersion(extracted), pin, extracted, stateDir);
    if (early !== null) throw new BunInstallFailed(`${early}; bun_bin unchanged`);
    const binary = readRootOwned(io, 'extracted binary', extracted).bytes;

    // 4. the missing chain, root:root 0755, never touching an existing directory
    for (const dir of missing) {
      io.mkdir(dir, BIN_DIR_MODE);
      io.chown(dir, 0, 0);
      io.chmod(dir, BIN_DIR_MODE);
    }

    // 5. the atomic write
    io.writeBytesAtomic(target, binary, BIN_MODE, 0, 0);

    // 6. the installed file answers the pin, or the previous bytes come back
    const late = versionProblem(exec.bunVersion(target), pin, target, stateDir);
    if (late !== null) {
      if (previous !== null) io.writeBytesAtomic(target, previous, BIN_MODE, 0, 0);
      throw new BunInstallFailed(`${late}; ${previous !== null ? 'the previous bun_bin was restored' : 'there was no previous bun_bin (the new file stays and the next run judges it again)'}`);
    }
    return Object.freeze({ asset, sha: verdict.sha, target, replaced: previous !== null });
  } finally {
    // 7. always
    if (lstat(extract) !== null) io.removeTree(extract, stateDir);
  }
}
