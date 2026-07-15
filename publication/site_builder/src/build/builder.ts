/**
 * The build runner — install, build, and promote a site's static output to preprod.
 *
 * A build is: run the manifest's install command, then its build command, capturing all
 * output to a log; if both succeed and the output directory exists, copy it into a fresh
 * preprod release and flip the preprod symlink (promote.ts). Each build has a small JSON
 * record next to its log so status can be polled without parsing the log.
 *
 * Builds run detached: startBuild writes the 'running' record, fires the job, and returns
 * the id immediately (the route answers 202); the client polls getBuild. A build is
 * refused while an agent session is running for the site — they would race on the same
 * working tree.
 *
 * Commands come from the daemon-owned manifest (an agent cannot edit site.json), so
 * splitting them into an argv on whitespace is safe: there is no shell and no
 * agent-controlled string in the command position.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import { ConflictError, NotFoundError } from '../errors';
import { runBinary } from '../util/spawn';
import { readManifest, type BuildSpec } from '../sites/manifest';
import { siteExists } from '../sites/workspace';
import { isSiteBusy } from '../sessions/manager';
import { promoteRelease, newReleaseId } from './promote';

export type BuildOutcome = 'running' | 'success' | 'failed';

export interface BuildStatus {
  id: string;
  outcome: BuildOutcome;
  started_at: string;
  finished_at: string | null;
  /** The preprod release directory produced on success, if any. */
  release: string | null;
  /** A short failure reason on the record for the UI; the full log has the detail. */
  error: string | null;
}

const buildingSlugs = new Set<string>();

function buildsDir(slug: string): string {
  return confinedPath(config.SITES_ROOT, slug, '.builder', 'builds');
}

function recordPath(slug: string, id: string): string {
  return join(buildsDir(slug), `${id}.json`);
}

function logPath(slug: string, id: string): string {
  return join(buildsDir(slug), `${id}.log`);
}

export function isBuilding(slug: string): boolean {
  return buildingSlugs.has(slug);
}

/** Kicks off a build, returning its id. The work runs detached; poll getBuild. */
export async function startBuild(slug: string): Promise<{ build_id: string }> {
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  if (isSiteBusy(slug)) throw new ConflictError('Cannot build while a session is running', 'session_running');
  if (buildingSlugs.has(slug)) throw new ConflictError('A build is already running', 'build_running');

  const id = newReleaseId();
  await mkdir(buildsDir(slug), { recursive: true });
  const record: BuildStatus = {
    id,
    outcome: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    release: null,
    error: null,
  };
  await writeRecord(slug, record);
  await writeFile(logPath(slug, id), '', 'utf8');

  buildingSlugs.add(slug);
  void executeBuild(slug, id, record).finally(() => buildingSlugs.delete(slug));
  return { build_id: id };
}

/**
 * The detached build pipeline: install → build → verify the output directory exists →
 * promote a fresh preprod release. Each stage short-circuits to a 'failed' record with a
 * one-line reason (the log holds the detail); it never throws out — the catch-all funnels
 * any unexpected error into the same terminal record so `finally` in startBuild always
 * clears the per-slug lock. A missing output directory is a failure, not a crash: a build
 * command can exit 0 yet produce nothing.
 */
async function executeBuild(slug: string, id: string, record: BuildStatus): Promise<void> {
  const workspace = confinedPath(config.SITES_ROOT, slug);
  const manifest = await readManifest(slug);
  const spec = manifest.build;
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: config.SITES_ROOT };

  const append = (text: string) => appendLog(slug, id, text);

  try {
    await append(`# install: ${spec.install}\n`);
    const install = await runStep(spec.install, workspace, env, config.INSTALL_TIMEOUT_MS, append);
    if (install.exitCode !== 0 || install.timedOut) {
      return finish(slug, record, 'failed', null, install.timedOut ? 'install timed out' : 'install failed');
    }

    await append(`\n# build: ${spec.build}\n`);
    const build = await runStep(spec.build, workspace, env, config.BUILD_TIMEOUT_MS, append);
    if (build.exitCode !== 0 || build.timedOut) {
      return finish(slug, record, 'failed', null, build.timedOut ? 'build timed out' : 'build failed');
    }

    const outputDir = confinedPath(workspace, spec.output);
    if (!existsSync(outputDir)) {
      return finish(slug, record, 'failed', null, `build produced no ${spec.output}/ directory`);
    }

    await append(`\n# promote to preprod\n`);
    const release = await promoteRelease(config.PREPROD_ROOT, slug, outputDir);
    await append(`released ${release}\n`);
    return finish(slug, record, 'success', release, null);
  } catch (error) {
    await append(`\n# error: ${error instanceof Error ? error.message : String(error)}\n`);
    return finish(slug, record, 'failed', null, 'build error');
  }
}

/**
 * Runs one manifest command as an argv (split on whitespace — safe because the command
 * comes from the daemon-owned manifest, never the agent; see the module header). Both
 * stdout and stderr are streamed to the same sink so the build log interleaves them the
 * way a terminal would. Never throws; the caller inspects exitCode/timedOut.
 */
function runStep(
  command: string,
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
  onOutput: (text: string) => void,
): ReturnType<typeof runBinary> {
  const argv = command.trim().split(/\s+/).filter(Boolean);
  return runBinary(argv, { cwd, env, timeoutMs, onStdout: onOutput, onStderr: onOutput });
}

/**
 * Stamps the terminal outcome onto the build record and persists it. Returned (not just
 * called) at each exit of executeBuild so the record write is awaited before the pipeline
 * unwinds and the lock is released.
 */
async function finish(
  slug: string,
  record: BuildStatus,
  outcome: BuildOutcome,
  release: string | null,
  error: string | null,
): Promise<void> {
  record.outcome = outcome;
  record.finished_at = new Date().toISOString();
  record.release = release;
  record.error = error;
  await writeRecord(slug, record);
}

async function writeRecord(slug: string, record: BuildStatus): Promise<void> {
  const target = recordPath(slug, record.id);
  const tmp = target + '.tmp';
  await writeFile(tmp, JSON.stringify(record, null, 2) + '\n', 'utf8');
  await rename(tmp, target);
}

async function appendLog(slug: string, id: string, text: string): Promise<void> {
  await (await import('node:fs/promises')).appendFile(logPath(slug, id), text, 'utf8');
}

/** A specific build's status record. */
export async function getBuild(slug: string, id: string): Promise<BuildStatus | null> {
  const path = recordPath(slug, id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as BuildStatus;
  } catch {
    return null;
  }
}

/** A build's captured log text. */
export async function getBuildLog(slug: string, id: string): Promise<string | null> {
  const path = logPath(slug, id);
  if (!existsSync(path)) return null;
  return readFile(path, 'utf8');
}

/** The most recent build record for a site, or null if it has never been built. */
export async function latestBuild(slug: string): Promise<BuildStatus | null> {
  const dir = buildsDir(slug);
  if (!existsSync(dir)) return null;
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  if (files.length === 0) return null;
  files.sort();
  return getBuild(slug, files[files.length - 1].slice(0, -'.json'.length));
}

export type { BuildSpec };
