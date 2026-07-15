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

import { confinedPath } from '../util/paths';
import { runBinary } from '../util/spawn';
import { config } from '../config';

const GIT_TIMEOUT_MS = 30_000;

// A minimal, constructed environment for git: no inheritance of the daemon's secrets.
function gitEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: config.SITES_ROOT,
    GIT_AUTHOR_NAME: 'Dédalo Site Builder',
    GIT_AUTHOR_EMAIL: 'site-builder@dedalo.local',
    GIT_COMMITTER_NAME: 'Dédalo Site Builder',
    GIT_COMMITTER_EMAIL: 'site-builder@dedalo.local',
  };
}

async function git(slug: string, ...args: string[]): Promise<void> {
  const cwd = confinedPath(config.SITES_ROOT, slug);
  const result = await runBinary(['git', ...args], { cwd, env: gitEnv(), timeoutMs: GIT_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
  }
}

/** Initialize the repo and record the scaffolded template as the first commit. */
export async function initRepo(slug: string): Promise<void> {
  await git(slug, 'init', '--quiet', '--initial-branch=main');
  await commitAll(slug, 'scaffold: initial template');
}

/**
 * Stage everything and commit. Returns true if a commit was made, false if the tree was
 * clean (no changes to commit — a turn where the agent wrote nothing). A clean tree is
 * not an error.
 */
export async function commitAll(slug: string, message: string): Promise<boolean> {
  await git(slug, 'add', '-A');
  const cwd = confinedPath(config.SITES_ROOT, slug);
  // `git diff --cached --quiet` exits 1 when there IS something staged.
  const staged = await runBinary(['git', 'diff', '--cached', '--quiet'], {
    cwd,
    env: gitEnv(),
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
    env: gitEnv(),
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
