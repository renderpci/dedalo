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
 * THE BUILD COMMAND IS AGENT-CONTROLLED, AND SAYING OTHERWISE WAS THE DEFECT.
 *
 * This header used to read "commands come from the daemon-owned manifest (an agent cannot
 * edit site.json), so splitting them into an argv on whitespace is safe: there is no shell
 * and no agent-controlled string in the command position." The parenthesis is false.
 * `site.json` sits at `<SITES_ROOT>/<slug>/site.json` — inside the very workspace the
 * driver is spawned with as its cwd and that `git add -A` then commits. A turn may rewrite
 * the `build` block, `readManifest` re-reads it at build time, and the daemon runs what it
 * finds. Measured end to end: a turn that wrote a new spec had its own command executed by
 * the next build, reported as `success`.
 *
 * So the argv split is NOT justified by provenance, and the two things that actually hold
 * are stated instead — both of them mechanical, neither of them a claim about who wrote a
 * file:
 *
 *   1. THERE IS NO SHELL. `runBinary` hands `Bun.spawn` an argv ARRAY; `argv[0]` is the
 *      binary and the rest are literal arguments. Nothing is parsed by `sh`, so the split
 *      is a tokenisation of a command, not an injection surface. A spec naming `sh` gets
 *      a shell the same way a turn naming `sh` does — by asking for one, at its own
 *      privilege, which is the next point.
 *   2. A BUILD STEP RUNS AT EXACTLY AN AGENT TURN'S PRIVILEGE, NEVER WIDER. Same unix
 *      user, same workspace, and — the part that must never drift — the same CONSTRUCTED
 *      environment: `{ PATH, HOME }` and nothing else. Not the daemon's SERVICE_TOKEN, not
 *      `$CREDENTIALS_DIRECTORY`, not a provider key (a turn gets its own driver's key; a
 *      build gets none at all). An agent that rewrites the build spec therefore obtains
 *      nothing it did not already have while the turn was running.
 *
 * `tests/agent_boundary.test.ts` holds (2) as the key SET of the child environment, on this
 * path and on the driver and shared-spawn paths beside it. The day a build step needs a
 * credential, it is that gate that must be argued with first.
 */

import { existsSync, lstatSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { confinedPath, confinedRealPath } from '../util/paths';
import { config } from '../config';
import { ConflictError, NotFoundError } from '../errors';
import { runBinary } from '../util/spawn';
import { readManifest, type BuildSpec } from '../sites/manifest';
import { assertWithinQuota, siteExists, treeSizeMb } from '../sites/workspace';
import { siteSurface } from '../sites/webspace';
import { busyReason, endBuild, tryBeginBuild } from '../workspace_activity';
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

function buildsDir(slug: string): string {
  return confinedPath(config.SITES_ROOT, slug, '.builder', 'builds');
}

/**
 * THE BUILD ID IS CALLER DATA, SO ITS PATH IS CONFINED LIKE EVERY OTHER PATH HERE.
 *
 * `buildsDir` confines the SLUG; joining the id onto the result undid that — the router
 * `decodeURIComponent`s each URL segment, so an id spelling a traversal chain resolved
 * outside the builds directory and `getBuild`/`getBuildLog` read (and returned) whatever
 * `.json`/`.log` file it named. `confinedPath` is the daemon's law for exactly this
 * (`promote.ts`: confinedPath, never join), and it applies to the LAST segment too.
 *
 * These two throw on an escaping id. That is right for the daemon's own minted ids (a
 * writer must never write outside), and the caller-facing doors below translate the throw
 * into the same answer an unknown id already gets — see `pathForCallerId`.
 */
function recordPath(slug: string, id: string): string {
  return confinedPath(buildsDir(slug), `${id}.json`);
}

function logPath(slug: string, id: string): string {
  return confinedPath(buildsDir(slug), `${id}.log`);
}

/**
 * The caller-supplied-id door: the confined path, or null when the id escapes.
 *
 * A traversal id answers EXACTLY as an unknown id does (the route's 404), reading nothing
 * — a distinct status would be an oracle telling a token holder which host paths exist.
 */
function pathForCallerId(build: () => string): string | null {
  try {
    return build();
  } catch {
    return null;
  }
}

/** Kicks off a build, returning its id. The work runs detached; poll getBuild. */
export async function startBuild(slug: string): Promise<{ build_id: string }> {
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);

  // WHERE THIS BUILD WILL LAND, PROVED BEFORE IT RUNS. `siteSurface` refuses a site whose
  // webspace the provisioner never created, is another instance's, or is read-only under
  // ProtectSystem=strict. Asking now costs one stat and one probe; asking only at promote
  // time would mean the museum waits five minutes to be told it had nowhere to publish.
  siteSurface(await readManifest(slug), 'preprod');

  // Reserve the workspace synchronously — one check-and-mark, cross-exclusive with agent
  // turns (workspace_activity.ts), so a build can never start while an agent edits the
  // tree, even if the requests land in the same tick.
  if (!tryBeginBuild(slug)) {
    const reason = busyReason(slug) ?? 'build_running';
    throw new ConflictError(
      reason === 'session_running'
        ? 'Cannot build while a session is running'
        : 'A build is already running',
      reason,
    );
  }

  try {
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

    // Detached: the reservation is released when the build settles. executeBuild funnels
    // every failure into its terminal record, but its own failure handling can still
    // reject (an unwritable log), so the .catch is load-bearing — without it that becomes
    // an unhandled rejection.
    void executeBuild(slug, id, record)
      .catch(error => console.error(`[build] detached build '${id}' for '${slug}' failed unexpectedly:`, error))
      .finally(() => endBuild(slug));
    return { build_id: id };
  } catch (error) {
    endBuild(slug);
    throw error;
  }
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
  // HOME is the agent's own root: a build step's package manager writes a cache into it,
  // and a cache inside the workspace it is building is a build able to poison the next one.
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: config.AGENT_HOME };

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

    // WHAT WAS BUILT IS PROVED BEFORE IT IS COPIED — see resolveOutputDir: an agent turn
    // owns this directory's name and its contents, and a LEXICAL path is a claim about a
    // string, not about the tree.
    const resolved = resolveOutputDir(workspace, spec.output);
    if (resolved.error) {
      await append(`\n# refused: ${resolved.error}\n`);
      return finish(slug, record, 'failed', null, resolved.reason as string);
    }
    const outputDir = resolved.path as string;

    await append(`\n# promote to preprod\n`);
    // The quota covers the workspace AND both release stores, and it is asked HERE because
    // this is the step that grows them: a promote adds a whole immutable copy of the output.
    // The output's OWN size is passed in, because that copy is exactly what is about to be
    // added — a gate that weighed only what already existed let one build carry a site to
    // nearly twice its quota. Its own catch so the record says WHY — "over disk quota" is
    // something a museum can act on, where the catch-all's "build error" would send someone
    // to read a log that ends in a successful build.
    try {
      await assertWithinQuota(
        manifest,
        `promoting a build of '${slug}'`,
        await treeSizeMb(outputDir),
      );
    } catch (error) {
      await append(`\n# refused: ${error instanceof Error ? error.message : String(error)}\n`);
      return finish(slug, record, 'failed', null, 'over disk quota');
    }
    const release = await promoteRelease(siteSurface(manifest, 'preprod'), outputDir);
    await append(`released ${release}\n`);
    return finish(slug, record, 'success', release, null);
  } catch (error) {
    await append(`\n# error: ${error instanceof Error ? error.message : String(error)}\n`);
    return finish(slug, record, 'failed', null, 'build error');
  }
}

/**
 * Runs one manifest command as an argv (split on whitespace). The split is a tokenisation,
 * not a parse: `Bun.spawn` receives an ARRAY, so no shell ever sees the string — see the
 * module header for why provenance is not the argument here and what is. Both stdout and
 * stderr are streamed to the same sink so the build log interleaves them the way a terminal
 * would. Never throws; the caller inspects exitCode/timedOut.
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
 * WHERE THE BUILD OUTPUT ACTUALLY IS — proved with lstat and realpath, never spelled.
 *
 * `confinedPath(workspace, spec.output)` answers a question about a STRING: it says the
 * name does not climb out of the workspace. It says nothing about what stands there, and an
 * agent turn writes this directory. `ln -s / dist` is a build that "succeeds", produces a
 * directory the lexical check approves of, and hands the promote layer the root of the
 * filesystem to copy into a release store a web server then serves. Verified end to end
 * before this function existed: a file outside the workspace was read back through the
 * served link.
 *
 * So two questions, both of them about the tree:
 *
 *   - IS THE OUTPUT DIRECTORY ITSELF A LINK? `promoteRelease` refuses a symlinked ENTRY it
 *     walks over, but it never lstat'd the root it was handed — the one path in the whole
 *     copy that was taken on trust.
 *   - DOES ITS REALPATH STAY INSIDE THE WORKSPACE? That catches the same trick one level up
 *     (`dist/` real, `dist/../..` reached through a symlinked ancestor), and it is
 *     `confinedRealPath` — the helper that already exists for exactly this, rather than a
 *     second implementation of it here.
 *
 * Returns a REASON rather than throwing, because every other way a build can fail on this
 * path becomes a terminal record with a sentence in it, and a refusal that arrived as a
 * generic 'build error' would send a museum to read a log that ends in a successful build.
 */
function resolveOutputDir(
  workspace: string,
  output: string,
): { path?: string; error?: string; reason?: string } {
  const lexical = confinedPath(workspace, output);
  let info;
  try {
    info = lstatSync(lexical);
  } catch {
    return {
      error: `the build produced no '${output}' directory in the workspace`,
      reason: `build produced no ${output}/ directory`,
    };
  }
  if (info.isSymbolicLink()) {
    return {
      error:
        `'${output}' is a SYMBOLIC LINK, not a directory. A build output is copied into an ` +
        `immutable release store that a web server reads; a link here would decide which ` +
        `tree gets copied and served, and this daemon does not follow one. Have the build ` +
        `write the directory itself.`,
      reason: `build output '${output}' is a symbolic link`,
    };
  }
  if (!info.isDirectory()) {
    return {
      error: `'${output}' is not a directory.`,
      reason: `build output '${output}' is not a directory`,
    };
  }
  try {
    return { path: confinedRealPath(workspace, output) };
  } catch (error) {
    return {
      error:
        `'${output}' resolves outside the workspace (${(error as Error).message}). Only what ` +
        `the build wrote inside its own workspace may be promoted.`,
      reason: `build output '${output}' resolves outside the workspace`,
    };
  }
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
  await appendFile(logPath(slug, id), text, 'utf8');
}

/** A specific build's status record. */
export async function getBuild(slug: string, id: string): Promise<BuildStatus | null> {
  const path = pathForCallerId(() => recordPath(slug, id));
  if (path === null || !existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as BuildStatus;
  } catch {
    return null;
  }
}

/** A build's captured log text. */
export async function getBuildLog(slug: string, id: string): Promise<string | null> {
  const path = pathForCallerId(() => logPath(slug, id));
  if (path === null || !existsSync(path)) return null;
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
