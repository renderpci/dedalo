/**
 * Per-site git — the rollback substrate for agent work.
 *
 * Every site workspace is a git repo. The first commit is the scaffolded template; after
 * every agent turn the daemon commits whatever the agent wrote, so the site's history is
 * a turn-by-turn ledger a UI can later walk back through. git is invoked with argv
 * arrays through the no-shell spawner (util/spawn.ts) and a constructed environment: git
 * needs a HOME (for a global config it will not find) and an identity, both supplied
 * explicitly so the daemon never depends on the ambient user's git config.
 *
 * The author is a fixed service identity; the acting user is recorded in the audit log,
 * not the git author, because git author is free-text and must not be mistaken for an
 * authenticated fact.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { confinedPath } from '../util/paths';
import { runBinary } from '../util/spawn';
import { config } from '../config';

const GIT_TIMEOUT_MS = 30_000;

/**
 * THE DAEMON'S OWN STATE IS NEVER COMMITTED — and above all not `.builder/mcp.json`.
 *
 * That file is written before every agent turn (`src/drivers/claude_code.ts`) and carries
 * the MCP server's headers, which on an instance whose Publication API is key-protected
 * means `X-API-Key: <the museum's key>`, in cleartext. The workspace is a git repo and the
 * daemon runs `git add -A` after each turn, so the key was being committed — into the
 * history of the very site the museum then publishes, where no later commit can remove it.
 *
 * The exclusion is written to `.git/info/exclude` and NOT to a `.gitignore` in the working
 * tree, deliberately:
 *
 *   - a `.gitignore` is site source. It appears in the agent's tree, is itself committed,
 *     and an agent turn asked to "clean up the repo" may rewrite or delete it — the one file
 *     that must not be editable by the thing it is protecting against.
 *   - `.git/info/exclude` is repository-local, never committed, never shown to the agent,
 *     and honoured by `git add -A` exactly like a `.gitignore` would be.
 *
 * Rewritten (idempotently) on every commit rather than only at init, so a repo created
 * before this rule existed acquires it; and anything already tracked under `.builder/` is
 * removed from the INDEX in the same breath, because ignoring a tracked path does nothing at
 * all.
 */
const DAEMON_STATE_DIR = '.builder';
const EXCLUDE_BODY = [
  '# Written by the Dédalo site-builder daemon. Repository-local: never committed.',
  '#',
  '# .builder/ is the daemon\'s private state inside this workspace — build records, build',
  '# logs, and the per-turn MCP configuration, which carries the Publication API key as a',
  '# request header. None of it is site source, and the key must never enter the history of',
  '# a site the museum publishes.',
  `/${DAEMON_STATE_DIR}/`,
  '',
].join('\n');

// A minimal, constructed environment for git: no inheritance of the daemon's secrets.
function gitEnv(workspace?: string): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    // git reads ~/.gitconfig; point it at the agent home, not at the tree it is committing.
    HOME: config.AGENT_HOME,
    GIT_AUTHOR_NAME: 'Dédalo Site Builder',
    GIT_AUTHOR_EMAIL: 'site-builder@dedalo.local',
    GIT_COMMITTER_NAME: 'Dédalo Site Builder',
    GIT_COMMITTER_EMAIL: 'site-builder@dedalo.local',
  };
  if (workspace) {
    // THE REPOSITORY IS PINNED, NOT INFERRED.
    //
    // `cwd` alone is not confinement: git DISCOVERS a repository by walking upwards, so a
    // workspace whose own `.git` is missing — never created, half-deleted, or simply a
    // directory that happens to sit inside a larger checkout — makes `git add -A && git
    // commit` operate on the ENCLOSING repository instead. This is not hypothetical: it
    // swept an entire unrelated working tree into commits authored by this daemon.
    //
    // GIT_DIR and GIT_WORK_TREE name the repository outright, so discovery never runs, and
    // GIT_CEILING_DIRECTORIES stops any walk that a future subcommand might still attempt
    // before it can leave the workspace.
    env.GIT_DIR = join(workspace, '.git');
    env.GIT_WORK_TREE = workspace;
    env.GIT_CEILING_DIRECTORIES = dirname(workspace);
  }
  return env;
}

/**
 * The workspace must ALREADY be a repository. Shared by every door, because the failure it
 * prevents is not "git errors out" — it is git quietly succeeding against a repository
 * further up the tree.
 */
function assertIsRepository(workspace: string, what: string): void {
  if (existsSync(join(workspace, '.git'))) return;
  throw new Error(
    `${what}: '${workspace}' is not a repository (no .git). Refusing, because git ` +
      `discovers repositories by walking UPWARDS and would otherwise operate on whatever ` +
      `checkout encloses this directory. Nothing was run.`,
  );
}

/**
 * Plant (or refresh) the repository-local exclusion, and untrack anything under `.builder/`
 * that a previous version of this daemon committed.
 *
 * `git rm --cached` is a no-op on a clean repo and is `--ignore-unmatch`ed so a repo with
 * nothing tracked there does not fail; when it does match, the file leaves the index and
 * stops being re-committed. It cannot rewrite history — a key already in an old commit is
 * already spent, and is an operator's key-rotation problem, not something a daemon may
 * pretend to fix by rewriting a museum's repository.
 */
export async function excludeDaemonState(slug: string): Promise<void> {
  const cwd = confinedPath(config.SITES_ROOT, slug);
  // Refuse before the mkdir below, which would otherwise CREATE `.git/info` in a directory
  // that holds no repository — manufacturing the very evidence the caller's guard looks
  // for, and leaving a `.git` that is not one.
  assertIsRepository(cwd, 'exclude daemon state');
  const exclude = join(cwd, '.git', 'info', 'exclude');
  await mkdir(dirname(exclude), { recursive: true });
  await writeFile(exclude, EXCLUDE_BODY, 'utf8');
  await runBinary(['git', 'rm', '-r', '--cached', '--quiet', '--ignore-unmatch', DAEMON_STATE_DIR], {
    cwd,
    env: gitEnv(cwd),
    timeoutMs: GIT_TIMEOUT_MS,
  });
}

async function git(slug: string, ...args: string[]): Promise<void> {
  const cwd = confinedPath(config.SITES_ROOT, slug);
  // Every command but `init` REQUIRES the repository to already exist here. Without this,
  // a missing `.git` is not an error — it is a silent promotion to whatever repository
  // encloses the workspace.
  if (args[0] !== 'init') assertIsRepository(cwd, `git ${args[0]}`);
  const result = await runBinary(['git', ...args], { cwd, env: gitEnv(cwd), timeoutMs: GIT_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
  }
}

/** Initialize the repo and record the scaffolded template as the first commit. */
export async function initRepo(slug: string): Promise<void> {
  await git(slug, 'init', '--quiet', '--initial-branch=main');
  // Before the FIRST commit: `.git/info/exclude` only exists once `git init` has made the
  // .git directory, and the first commit is already capable of carrying daemon state.
  await excludeDaemonState(slug);
  await commitAll(slug, 'scaffold: initial template');
}

/**
 * Stage everything and commit. Returns true if a commit was made, false if the tree was
 * clean (no changes to commit — a turn where the agent wrote nothing). A clean tree is
 * not an error.
 */
export async function commitAll(slug: string, message: string): Promise<boolean> {
  // Re-asserted here and not only at init: this is the one function every commit goes
  // through, so a repo created by an older daemon — or one whose .git was restored from a
  // backup taken before the rule existed — gets the exclusion before its next `add -A`.
  await excludeDaemonState(slug);
  await git(slug, 'add', '-A');
  const cwd = confinedPath(config.SITES_ROOT, slug);
  // `git diff --cached --quiet` exits 1 when there IS something staged.
  const staged = await runBinary(['git', 'diff', '--cached', '--quiet'], {
    cwd,
    env: gitEnv(cwd),
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (staged.exitCode === 0) {
    return false; // nothing staged
  }
  await git(slug, 'commit', '--quiet', '--no-verify', '-m', message);
  return true;
}

/** The porcelain status — used to derive a turn's file-change list for all drivers. */
export async function changedFiles(slug: string): Promise<string[]> {
  const cwd = confinedPath(config.SITES_ROOT, slug);
  const result = await runBinary(['git', 'status', '--porcelain'], {
    cwd,
    env: gitEnv(cwd),
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    // porcelain: "XY <path>"; the path is everything after the 2-char status + space.
    .map(line => line.slice(3).trim())
    .filter(Boolean);
}
