/**
 * media.probe — WHAT THE PUBLICATION HOST'S MEDIA ROOT IS, measured on every call (spec §6).
 *
 * A rule hash proves the rules are INSTALLED (§7); this proves the tree they gate is there
 * and shaped as declared. Four measurements, in dependency order:
 *
 * - present: MEDIA_ROOT is a directory. Absent ⇒ nothing else is probed: every later answer
 *   would describe the empty mountpoint, not the media.
 * - read_only: MEASURED BY WRITING, never inferred from mount flags or modes. An exclusive
 *   create (`wx` = O_CREAT|O_EXCL: never clobbers, never follows a planted symlink) of a
 *   uniquely named file. Refused with EROFS/EACCES/EPERM ⇒ true (the agent cannot write
 *   here — the property that matters, whatever the reason). Succeeded ⇒ false, and the file
 *   is unlinked at once; a failed unlink is itself a problem naming the path, so a probe
 *   never leaves a file silently. Any other errno ⇒ null, explained.
 * - pub_readable / pub_markers: `.publication/pub/` (engineering/MEDIA_PROTECTION.md: one
 *   flat file per published record) can be listed, and how many regular files it holds.
 *
 * Expectation by mode: `shared` (§5.1) must be read-only — a writable export lets the
 * publication host rewrite the work host's media; `copy` (§5.2) must be writable — the agent
 * is its only writer; `none` probes nothing.
 *
 * Never throws for a filesystem state: every finding is a `problems[]` sentence, so `status`
 * embeds the probe and still answers. The fs is injected (ProbeFs) because the read-only
 * branch cannot be produced honestly by a suite that may run as root.
 */

import { randomBytes } from 'node:crypto';
import { open, opendir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';

export interface MediaProbe {
  mode: 'shared' | 'copy' | 'none';
  root: string | null;
  present: boolean;
  read_only: boolean | null;
  pub_readable: boolean | null;
  pub_markers: number | null;
  problems: string[];
}

export type MediaMode = MediaProbe['mode'];

export interface ProbeTarget {
  mode: MediaMode;
  root: string | null;
}

/** The four filesystem questions the probe asks — nothing else is reachable through it. */
export interface ProbeFs {
  /** true for a directory; false for ENOENT/ENOTDIR/not-a-directory; throws on any other errno. */
  isDirectory(path: string): Promise<boolean>;
  /** O_CREAT|O_EXCL create, closed at once. Rejects with the errno on failure. */
  createExclusive(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Regular files directly inside `dir` (subdirectories are not markers). */
  countFiles(dir: string): Promise<number>;
}

export const PROBE_FILE_PREFIX = '.dedalo_host_agent_probe.';
export const PUB_DIR = join('.publication', 'pub');
/** The errnos that mean "the agent cannot create a file here". */
export const READ_ONLY_CODES: readonly string[] = Object.freeze(['EROFS', 'EACCES', 'EPERM']);

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unknown error';
}

export const nodeProbeFs: ProbeFs = {
  async isDirectory(path) {
    try {
      return (await stat(path)).isDirectory();
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') return false;
      throw error;
    }
  },
  async createExclusive(path) {
    const handle = await open(path, 'wx', 0o600);
    await handle.close();
  },
  async remove(path) {
    await unlink(path);
  },
  async countFiles(dir) {
    let count = 0;
    for await (const entry of await opendir(dir)) {
      if (entry.isFile()) count++;
    }
    return count;
  },
};

async function probeReadOnly(root: string, fs: ProbeFs, problems: string[]): Promise<boolean | null> {
  const probePath = join(root, `${PROBE_FILE_PREFIX}${process.pid}.${randomBytes(8).toString('hex')}`);
  try {
    await fs.createExclusive(probePath);
  } catch (error) {
    const code = errorCode(error);
    if (READ_ONLY_CODES.includes(code)) return true;
    problems.push(`write probe in ${root} failed with ${code}: read-only state unknown`);
    return null;
  }
  try {
    await fs.remove(probePath);
  } catch (error) {
    problems.push(
      `write probe ${probePath} was created but could not be removed (${errorCode(error)}): delete it by hand`,
    );
  }
  return false;
}

export async function probeMediaTarget(target: ProbeTarget, fs: ProbeFs): Promise<MediaProbe> {
  const problems: string[] = [];
  const unmeasured = { read_only: null, pub_readable: null, pub_markers: null } as const;

  if (target.mode === 'none') {
    return { mode: 'none', root: null, present: false, ...unmeasured, problems };
  }
  const root = target.root;
  if (root === null) {
    problems.push(`MEDIA_MODE=${target.mode} declares a media root but MEDIA_ROOT is not set: nothing can be probed`);
    return { mode: target.mode, root: null, present: false, ...unmeasured, problems };
  }

  let present = false;
  try {
    present = await fs.isDirectory(root);
    if (!present) {
      const why = target.mode === 'shared' ? 'the read-only mount is missing' : 'the copy target was never created';
      problems.push(`media root ${root} is not a directory: ${why}`);
    }
  } catch (error) {
    problems.push(`media root ${root} cannot be inspected (${errorCode(error)})`);
  }
  if (!present) {
    return { mode: target.mode, root, present: false, ...unmeasured, problems };
  }

  const read_only = await probeReadOnly(root, fs, problems);
  if (target.mode === 'shared' && read_only === false) {
    problems.push(`media root ${root} is WRITABLE by the agent: shared mode requires a read-only mount (spec §5.1)`);
  }
  if (target.mode === 'copy' && read_only === true) {
    problems.push(`media root ${root} is read-only: copy mode needs the agent to write it (spec §5.2)`);
  }

  const pubDir = join(root, PUB_DIR);
  let pub_readable = false;
  let pub_markers: number | null = null;
  try {
    pub_markers = await fs.countFiles(pubDir);
    pub_readable = true;
  } catch (error) {
    problems.push(
      `${pubDir} cannot be listed (${errorCode(error)}): the generated rules answer 404 for every media file`,
    );
  }

  return { mode: target.mode, root, present: true, read_only, pub_readable, pub_markers, problems };
}

/** The configured media root, probed with the real filesystem. No route passes a path. */
export async function probeMedia(): Promise<MediaProbe> {
  return probeMediaTarget({ mode: config.MEDIA_MODE, root: config.MEDIA_ROOT ?? null }, nodeProbeFs);
}
