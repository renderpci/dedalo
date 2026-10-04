/**
 * WHAT SURVIVES A POWER CUT — a model of the page cache, driven by the real `node:fs/promises`
 * calls this daemon's writers make (`src/util/shared_tree.ts` is FileHandle-based).
 *
 * A process kill cannot test durability: the page cache outlives the process, so a write +
 * `rename` with no fsync looks perfectly durable to any kill -9 gate. A power cut (or a kernel
 * crash) keeps only what was forced to disk, and on ext4/XFS with delayed allocation a NEW inode
 * renamed into place and never fsynced comes back ZERO-LENGTH. The model spies the promise-API
 * doors and answers, at any instant, the question a power cut would:
 *
 *   - a file's BYTES are durable once a handle of that file was `sync()`/`datasync()`ed after
 *     the last write that reached it;
 *   - a DIRECTORY ENTRY (a creation, a rename's source and target, an unlink, a mkdir) is
 *     durable once its directory was fsynced (a directory handle's `sync()`) after the change;
 *   - a path survives with its bytes when its bytes are durable AND every entry on its way up
 *     to `root` is.
 *
 * CONSERVATIVE BY CONSTRUCTION: what the model did not SEE is never proven. Bytes written
 * through a door it does not spy are unknown until a spied sync covers them; a rename it did not
 * see leaves the target unknown; an entry that was not there when the model started and that no
 * spied directory sync covered is not durable. So a gate built on it can be defeated only by a
 * writer that fsyncs, never by one that does not.
 *
 * (The engine has its own model for its SYNCHRONOUS `node:fs` writers, `test/helpers/
 * power_loss_model.ts`; this package is an isolated subsystem with its own suite and its own
 * I/O shape, so it carries its own — the same semantics, a different door.)
 *
 * `restore()` MUST run (finally): the spies replace exports for the whole process.
 */

import { spyOn } from 'bun:test';
import { constants as FS, lstatSync, readdirSync, statSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface PowerCutModel {
  /** `path` survives a power cut NOW, holding the bytes last written to it. */
  survives(path: string): boolean;
  /** Why `path` would not survive (for the assertion message); '' when it does. */
  explain(path: string): string;
  /** What the model saw (a gate asserts it is non-vacuous). */
  readonly seen: { writes: number; syncs: number; dirSyncs: number; renames: number; mkdirs: number };
  /** Put the real doors back. */
  restore(): void;
}

function flagsWrite(flags: unknown): boolean {
  if (typeof flags === 'number') return (flags & (FS.O_WRONLY | FS.O_RDWR)) !== 0;
  return typeof flags === 'string' && /[wa+]/.test(flags);
}

function flagsTruncate(flags: unknown): boolean {
  if (typeof flags === 'number') return (flags & FS.O_TRUNC) !== 0;
  return typeof flags === 'string' && flags.startsWith('w');
}

/** Something stands at `path` (never followed: a link counts as an entry). */
function exists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Model every file under `root` (absolute). Paths outside it are ignored. */
export async function startPowerCutModel(root: string): Promise<PowerCutModel> {
  const top = resolve(root);
  const inScope = (path: string) => path === top || path.startsWith(`${top}/`);
  /** Bytes state of a FILE the model saw written. Absent ⇒ never written under the model. */
  const bytes = new Map<string, 'durable' | 'volatile'>();
  /** Entries changed and not yet covered by a directory sync. */
  const dirty = new Set<string>();
  /** Entries a spied directory sync made durable after their last change. */
  const clean = new Set<string>();
  /** Every entry under `top` at start (durable by assumption: it predates the gate). */
  const initial = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      initial.add(path);
      if (entry.isDirectory()) walk(path);
    }
  };
  if (isDirectory(top)) walk(top);
  const handlePath = new WeakMap<object, string>();
  const seen = { writes: 0, syncs: 0, dirSyncs: 0, renames: 0, mkdirs: 0 };

  const changed = (path: string) => {
    if (!inScope(path) || path === top) return;
    dirty.add(path);
    clean.delete(path);
  };
  const wrote = (path: string | undefined) => {
    if (path === undefined || !inScope(path)) return;
    bytes.set(path, 'volatile');
    seen.writes++;
  };

  // The FileHandle class is not exported by name: reach its prototype through a live handle.
  const probe = await fsp.open(top, FS.O_RDONLY);
  const proto = Object.getPrototypeOf(probe) as Record<string, (...args: unknown[]) => Promise<unknown>>;
  await probe.close();
  const real = {
    open: fsp.open,
    rename: fsp.rename,
    mkdir: fsp.mkdir,
    rm: fsp.rm,
    unlink: fsp.unlink,
    writeFile: fsp.writeFile,
  };
  const realProto = {
    write: proto.write,
    writev: proto.writev,
    writeFile: proto.writeFile,
    appendFile: proto.appendFile,
    truncate: proto.truncate,
    sync: proto.sync,
    datasync: proto.datasync,
  };

  const spies: { mockRestore(): void }[] = [];
  spies.push(
    spyOn(fsp, 'open').mockImplementation((async (path: unknown, flags?: unknown, mode?: unknown) => {
      const at = resolve(String(path));
      const existed = exists(at);
      const handle = await (real.open as (...a: unknown[]) => Promise<FileHandle>)(path, flags, mode);
      if (inScope(at)) {
        handlePath.set(handle, at);
        if (!existed) {
          changed(at);
          bytes.set(at, 'volatile');
        } else if (flagsWrite(flags) && flagsTruncate(flags)) {
          bytes.set(at, 'volatile');
        }
      }
      return handle;
    }) as typeof fsp.open),
    spyOn(fsp, 'rename').mockImplementation((async (from: unknown, to: unknown) => {
      const src = resolve(String(from));
      const dst = resolve(String(to));
      await real.rename(from as string, to as string);
      if (inScope(src) || inScope(dst)) seen.renames++;
      changed(src);
      changed(dst);
      const carried = bytes.get(src);
      bytes.delete(src);
      // A rename the model saw of bytes it never saw written: the target is UNKNOWN (volatile).
      if (inScope(dst)) bytes.set(dst, carried ?? (initial.has(src) ? 'durable' : 'volatile'));
    }) as typeof fsp.rename),
    spyOn(fsp, 'mkdir').mockImplementation((async (path: unknown, options?: unknown) => {
      const at = resolve(String(path));
      const missing: string[] = [];
      for (let level = at; inScope(level) && level !== top && !exists(level); level = dirname(level)) missing.push(level);
      const result = await (real.mkdir as (...a: unknown[]) => Promise<unknown>)(path, options);
      for (const level of missing) {
        changed(level);
        seen.mkdirs++;
      }
      return result;
    }) as typeof fsp.mkdir),
    spyOn(fsp, 'rm').mockImplementation((async (path: unknown, options?: unknown) => {
      changed(resolve(String(path)));
      return (real.rm as (...a: unknown[]) => Promise<void>)(path, options);
    }) as typeof fsp.rm),
    spyOn(fsp, 'unlink').mockImplementation((async (path: unknown) => {
      changed(resolve(String(path)));
      return real.unlink(path as string);
    }) as typeof fsp.unlink),
    spyOn(fsp, 'writeFile').mockImplementation((async (path: unknown, ...rest: unknown[]) => {
      const at = typeof path === 'string' ? resolve(path) : undefined;
      if (at !== undefined && !exists(at)) changed(at);
      wrote(at);
      return (real.writeFile as (...a: unknown[]) => Promise<void>)(path, ...rest);
    }) as typeof fsp.writeFile),
  );
  for (const name of ['write', 'writev', 'writeFile', 'appendFile', 'truncate'] as const) {
    const original = realProto[name];
    spies.push(
      spyOn(proto, name).mockImplementation(function (this: object, ...args: unknown[]) {
        wrote(handlePath.get(this));
        return original.apply(this, args);
      }),
    );
  }
  for (const name of ['sync', 'datasync'] as const) {
    const original = realProto[name];
    spies.push(
      spyOn(proto, name).mockImplementation(async function (this: object, ...args: unknown[]) {
        const result = await original.apply(this, args);
        const at = handlePath.get(this);
        if (at !== undefined) {
          if (isDirectory(at)) {
            seen.dirSyncs++;
            for (const entry of [...dirty]) {
              if (dirname(entry) === at) {
                dirty.delete(entry);
                clean.add(entry);
              }
            }
          } else {
            seen.syncs++;
            if (bytes.has(at)) bytes.set(at, 'durable');
          }
        }
        return result;
      }),
    );
  }

  const entryDurable = (path: string) => !dirty.has(path) && (initial.has(path) || clean.has(path));

  const explain = (path: string): string => {
    const at = resolve(path);
    if (!inScope(at)) return `${at} is outside the modelled root ${top}`;
    // A directory has no bytes of its own to lose: only its entry (and those above it) count.
    if (!isDirectory(at)) {
      const state = bytes.get(at);
      if (state === 'volatile') return `the bytes of ${at} were never synced after their last write`;
      if (state === undefined && !initial.has(at)) return `${at} was never written where the model could see it`;
    }
    for (let level = at; level !== top; level = dirname(level)) {
      if (!entryDurable(level)) return `the entry ${level} was never made durable by a sync of ${dirname(level)}`;
    }
    return '';
  };

  return {
    survives: (path: string) => explain(path) === '',
    explain,
    seen,
    restore() {
      for (const spy of spies) spy.mockRestore();
    },
  };
}
