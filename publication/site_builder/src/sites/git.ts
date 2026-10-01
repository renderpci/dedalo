/**
 * Per-site git — the rollback substrate for agent work.
 *
 * Every site workspace is a git repo. The first commit is the scaffolded template; after
 * every agent turn the daemon commits whatever the agent wrote, so the site's history is
 * a turn-by-turn ledger a UI can later walk back through. git is invoked with argv
 * arrays through the confinement and a constructed environment: git's HOME and global
 * configuration are fixed by its unit (none at all), and its identity is supplied explicitly
 * so the daemon never depends on the ambient user's git config.
 *
 * The author is a fixed service identity; the acting user is recorded in the audit log,
 * not the git author, because git author is free-text and must not be mistaken for an
 * authenticated fact.
 *
 * Every git command goes through the `git` DOOR (`drivers/network_profile.ts`: no proxy, no
 * bind, no inet family), as the SITE's own identity, under the site's reservation (see
 * `withSite` below). The confinement policy is a trailing PARAMETER, defaulted to this
 * daemon's, for the reason `startBuild`'s is: the door these real call sites state is then
 * assertable on a host with no systemd (tests/agent_confinement.test.ts, "the real call
 * sites").
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { confinedPath } from '../util/paths';
import { mkdirShared, writeFileSharedAtomic } from '../util/shared_tree';
import { policyFromConfig, runConfined, type ConfinementPolicy } from '../drivers/confinement';
import { config } from '../config';
import { ConflictError } from '../errors';
import { busyDetail, busyReason, end, holdsReservation, tryBegin } from '../workspace_activity';

/**
 * EVERY GIT COMMAND HOLDS THE SITE (LEAD-1b). git runs agent-authored hooks and filters as
 * the site's identity, so it runs under the site's reservation like a turn or a build: the
 * caller's own (a turn's commit, `createSite`'s init, the boot recovery), or — for a caller
 * that holds none — a `git` reservation taken here for the operation's duration, refused
 * (409) while anything else holds the site.
 */
async function withSite<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  if (holdsReservation(slug)) return fn();
  if (!tryBegin(slug, 'git')) {
    const reason = busyReason(slug) ?? 'git_running';
    throw new ConflictError(busyDetail(reason, slug), reason);
  }
  try {
    return await fn();
  } finally {
    end(slug, 'git');
  }
}

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

// A minimal, constructed environment for git: no inheritance of the daemon's secrets. NO
// HOME: the git unit fixes it to /nonexistent, with no global and no system configuration
// (LEAD-1b) — git's whole configuration is the repository's.
function gitEnv(workspace?: string): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
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
    // GIT_DIR and GIT_WORK_TREE name the repository outright, so discovery never runs.
    // That pair is what the gate holds (tests/git_confinement.test.ts drives `changedFiles`
    // — the one door with no `assertIsRepository` in front of it — against a `.git`-less
    // workspace inside an enclosing checkout, and against a `.git` that is a stray FILE).
    // GIT_CEILING_DIRECTORIES is a belt for an invocation that somehow reaches git without
    // them; measured, removing it alone changes no behaviour while GIT_DIR is set, so it is
    // stated as the redundancy it is rather than credited as a third defence.
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
export async function excludeDaemonState(
  slug: string,
  policy: ConfinementPolicy = policyFromConfig(),
): Promise<void> {
  return withSite(slug, () => excludeDaemonStateHeld(slug, policy));
}

async function excludeDaemonStateHeld(slug: string, policy: ConfinementPolicy): Promise<void> {
  const cwd = confinedPath(config.SITES_ROOT, slug);
  // Refuse before the mkdir below, which would otherwise CREATE `.git/info` in a directory
  // that holds no repository — manufacturing the very evidence the caller's guard looks
  // for, and leaving a `.git` that is not one.
  assertIsRepository(cwd, 'exclude daemon state');
  // THROUGH THE FD-BASED WRITERS, like every other daemon-side write into a workspace.
  //
  // `.git` is created by the AGENT (git runs confined), so this is the one file this daemon
  // writes into a directory the agent owns outright — and `confinedPath` is lexical: a
  // `.git/info/exclude -> <the instance's audit trail>` planted by a turn had the daemon
  // truncate the trail and refill it with this body. `mkdirShared` creates only what is
  // missing and modes only what it creates (`.git` and `info`, when git made them, keep
  // their own modes), and the atomic writer renames a tmp sibling this daemon owns over the
  // target instead of writing through it — which is also what makes an agent-owned
  // `exclude` replaceable at all.
  await mkdirShared(config.SITES_ROOT, join(slug, '.git', 'info'));
  await writeFileSharedAtomic(config.SITES_ROOT, join(slug, '.git', 'info', 'exclude'), EXCLUDE_BODY);
  await runConfined({
    door: 'git',
    slug,
    argv: ['git', 'rm', '-r', '--cached', '--quiet', '--ignore-unmatch', DAEMON_STATE_DIR],
    cwd,
    env: gitEnv(cwd),
    timeoutMs: config.GIT_TIMEOUT_MS,
    label: 'git command',
  }, policy);
}

async function git(policy: ConfinementPolicy, slug: string, ...args: string[]): Promise<void> {
  const cwd = confinedPath(config.SITES_ROOT, slug);
  // Every command but `init` REQUIRES the repository to already exist here. Without this,
  // a missing `.git` is not an error — it is a silent promotion to whatever repository
  // encloses the workspace.
  if (args[0] !== 'init') assertIsRepository(cwd, `git ${args[0]}`);
  const result = await runConfined({
    door: 'git',
    slug,
    argv: ['git', ...args],
    cwd,
    env: gitEnv(cwd),
    timeoutMs: config.GIT_TIMEOUT_MS,
    label: 'git command',
  }, policy);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
  }
}

/** Initialize the repo and record the scaffolded template as the first commit. */
export async function initRepo(slug: string, policy: ConfinementPolicy = policyFromConfig()): Promise<void> {
  return withSite(slug, async () => {
    await git(policy, slug, 'init', '--quiet', '--initial-branch=main');
    // Before the FIRST commit: `.git/info/exclude` only exists once `git init` has made the
    // .git directory, and the first commit is already capable of carrying daemon state.
    await excludeDaemonStateHeld(slug, policy);
    await commitAllHeld(slug, 'scaffold: initial template', policy);
  });
}

/**
 * Stage everything and commit. Returns true if a commit was made, false if the tree was
 * clean (no changes to commit — a turn where the agent wrote nothing). A clean tree is
 * not an error.
 */
export async function commitAll(
  slug: string,
  message: string,
  policy: ConfinementPolicy = policyFromConfig(),
): Promise<boolean> {
  return withSite(slug, () => commitAllHeld(slug, message, policy));
}

async function commitAllHeld(slug: string, message: string, policy: ConfinementPolicy): Promise<boolean> {
  // Re-asserted here and not only at init: this is the one function every commit goes
  // through, so a repo created by an older daemon — or one whose .git was restored from a
  // backup taken before the rule existed — gets the exclusion before its next `add -A`.
  await excludeDaemonStateHeld(slug, policy);
  await git(policy, slug, 'add', '-A');
  const cwd = confinedPath(config.SITES_ROOT, slug);
  // `git diff --cached --quiet` exits 1 when there IS something staged.
  const staged = await runConfined({
    door: 'git',
    slug,
    argv: ['git', 'diff', '--cached', '--quiet'],
    cwd,
    env: gitEnv(cwd),
    timeoutMs: config.GIT_TIMEOUT_MS,
    label: 'git command',
  }, policy);
  if (staged.exitCode === 0) {
    return false; // nothing staged
  }
  await git(policy, slug, 'commit', '--quiet', '--no-verify', '-m', message);
  return true;
}

/** The porcelain status — used to derive a turn's file-change list for all drivers. */
export async function changedFiles(slug: string, policy: ConfinementPolicy = policyFromConfig()): Promise<string[]> {
  return withSite(slug, () => changedFilesHeld(slug, policy));
}

async function changedFilesHeld(slug: string, policy: ConfinementPolicy): Promise<string[]> {
  const cwd = confinedPath(config.SITES_ROOT, slug);
  const result = await runConfined({
    door: 'git',
    slug,
    argv: ['git', 'status', '--porcelain'],
    cwd,
    env: gitEnv(cwd),
    timeoutMs: config.GIT_TIMEOUT_MS,
    label: 'git command',
  }, policy);
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    // porcelain: "XY <path>"; the path is everything after the 2-char status + space.
    .map(line => line.slice(3).trim())
    .filter(Boolean);
}
