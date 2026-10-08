/**
 * THE WEB-CONFIG TRANSACTION (spec §13.5) — extracted from rules.apply so the agent's own
 * media include (src/rules/apply.ts) and root's host-wide nginx map (src/rules/host_map_main.ts)
 * install a file the web server loads in ONE way. The order is the property:
 *
 *   write `<live>.new` (fsynced, exact mode) → keep the last LOADED file as `<live>.prev` →
 *   mark `<live>.reload-pending` → atomic rename `.new` → live → configtest → reload →
 *   [active poll] → clear the marker.
 *
 * A failed configtest puts the `.prev` bytes back (or removes the file when there was none),
 * clears the marker, re-runs configtest and reports BOTH results. It NEVER reloads: the web
 * server keeps serving what it has in memory, and the disk is back to it.
 *
 * `.prev` IS THE LAST FILE THE WEB SERVER LOADED, not the last file on disk: the marker is
 * written BEFORE the swap, removed only after a successful reload or a restore, and while it
 * exists `.prev` is not rotated. A failed reload followed by another run therefore restores
 * what is actually loaded.
 *
 * RELOAD FAILURE KEEPS THE NEW FILE: it passed configtest, so the disk holds the desired
 * state; the marker stays, so "applied" (loaded) reads null until a later run reloads.
 * The same holds when the caller's active poll says the server is down after a reload that
 * returned 0 (the EL AVC case): the outcome is `reload_failed` with `active: false`.
 *
 * IDEMPOTENT: live bytes identical to the request AND no marker → `unchanged`, no write, no
 * configtest, no reload.
 *
 * NOT LOCKED HERE: both callers hold the host web lock (src/provision/lock.ts) around the
 * whole call. ZERO-DEPENDENCY (it is part of root's renderer copy, src/provision/host_map_renderer.ts):
 * node: builtins and a type-only import.
 */

import { existsSync } from 'node:fs';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExecResult } from '../provision/exec_contract';

export interface TxnPaths {
  readonly dir: string;
  readonly live: string;
  readonly next: string;
  readonly prev: string;
  readonly restore: string;
  readonly pending: string;
}

/** The five companion paths of one live file. */
export function txnPaths(dir: string, live: string): TxnPaths {
  return { dir, live, next: `${live}.new`, prev: `${live}.prev`, restore: `${live}.restore`, pending: `${live}.reload-pending` };
}

/** The web server's own commands (the agent's Exec, or root's rendererExec). */
export interface TxnExec {
  webConfigtest(): Promise<ExecResult>;
  webReload(): Promise<ExecResult>;
  /** After a reload that returned 0: is the server still up? Absent = not polled. */
  webActive?(): Promise<boolean>;
}

export interface TxnOptions {
  /** The exact mode of every file written (the agent include 0640; root's map 0644). */
  readonly fileMode: number;
  /** The directory's mode when it must be created. */
  readonly dirMode: number;
  /** One line written into the reload-pending marker (the hash). */
  readonly marker: string;
}

export type TxnOutcome =
  | { readonly result: 'unchanged' }
  | { readonly result: 'applied'; readonly replaced: boolean }
  | {
      readonly result: 'configtest_failed';
      readonly restored: 'previous' | 'removed';
      readonly configtest: ExecResult;
      readonly after: ExecResult;
    }
  | {
      readonly result: 'reload_failed';
      readonly configtest: ExecResult;
      readonly reload: ExecResult;
      /** false: the reload returned 0 but the active poll found the server down. */
      readonly active: boolean | null;
    };

/** Write + fsync a file at exactly `mode` (a pre-existing file is replaced; the umask is overridden). */
export async function writeDurable(path: string, data: Uint8Array, mode: number): Promise<void> {
  await rm(path, { force: true });
  const handle = await open(path, 'wx', mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, mode);
}

/**
 * fsync a directory, so a rename or a new entry in it survives a power loss. Best-effort: some
 * filesystems refuse fsync on a directory, which is never a correctness condition here.
 */
export async function syncDir(dir: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(dir, 'r');
    await handle.sync();
  } catch {
    // best-effort durability
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readOptional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** A spawn that throws (sudo missing, ENOENT) is a failed step, never an unhandled one after the swap. */
export async function step(run: () => Promise<ExecResult>): Promise<ExecResult> {
  try {
    return await run();
  } catch (error) {
    return { code: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error) };
  }
}

async function activeAfterReload(exec: TxnExec): Promise<boolean | null> {
  if (exec.webActive === undefined) return null;
  try {
    return await exec.webActive();
  } catch {
    return false;
  }
}

/** Put the last loaded file back (atomically), or remove the file when there was none. */
async function restore(paths: TxnPaths, hadPrevious: boolean, mode: number): Promise<'previous' | 'removed'> {
  if (hadPrevious) {
    await writeDurable(paths.restore, await readFile(paths.prev), mode);
    await rename(paths.restore, paths.live);
    await syncDir(dirname(paths.live));
    return 'previous';
  }
  await rm(paths.live, { force: true });
  return 'removed';
}

/** Install `bytes` as `paths.live` (see the header). Throws only on a filesystem fault. */
export async function runTxn(paths: TxnPaths, bytes: Uint8Array, exec: TxnExec, options: TxnOptions): Promise<TxnOutcome> {
  await mkdir(paths.dir, { recursive: true, mode: options.dirMode });
  const requested = Buffer.from(bytes);
  const live = await readOptional(paths.live);
  const pending = existsSync(paths.pending);
  const unchanged = live !== null && live.equals(requested);
  if (unchanged && !pending) return { result: 'unchanged' };

  // `.prev` is the last LOADED file: rotate it only when the live file is the loaded one.
  const hadPrevious = pending ? existsSync(paths.prev) : live !== null;
  if (!unchanged) {
    await writeDurable(paths.next, requested, options.fileMode);
    if (!pending) {
      if (live !== null) await writeDurable(paths.prev, live, options.fileMode);
      else await rm(paths.prev, { force: true });
    }
  }
  // The marker goes down BEFORE the swap: a crash after it leaves "not loaded", never a lie.
  await writeDurable(paths.pending, Buffer.from(`${options.marker}\n`, 'utf8'), options.fileMode);
  if (!unchanged) await rename(paths.next, paths.live);
  await syncDir(dirname(paths.live)); // the marker and the swap reach the disk before anything is reloaded

  const configtest = await step(() => exec.webConfigtest());
  if (configtest.code !== 0) {
    const restored = await restore(paths, hadPrevious, options.fileMode);
    await rm(paths.pending, { force: true });
    const after = await step(() => exec.webConfigtest());
    return { result: 'configtest_failed', restored, configtest, after };
  }

  const reload = await step(() => exec.webReload());
  const active = reload.code === 0 ? await activeAfterReload(exec) : null;
  if (reload.code !== 0 || active === false) return { result: 'reload_failed', configtest, reload, active };

  await rm(paths.pending, { force: true });
  return { result: 'applied', replaced: hadPrevious };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The child's output, for the journal and the audit line only (never the wire). */
export function txnOutput(result: ExecResult, cap = 4096): string {
  return `${result.stdout}${result.stderr}`.trim().slice(-cap);
}

/**
 * The line of `live` a configtest names, or null. Read only when the message names the LIVE
 * file (`… on line N of <live>` for Apache, `… in <live>:N` for nginx), so an error in some
 * other file of the server's config never reports a misleading line.
 */
export function configtestLine(result: ExecResult, live: string): number | null {
  const text = txnOutput(result);
  const path = escapeRegex(live);
  const match = new RegExp(`on line (\\d+) of ${path}\\b`).exec(text) ?? new RegExp(`in ${path}:(\\d+)`).exec(text);
  return match?.[1] ? Number(match[1]) : null;
}
