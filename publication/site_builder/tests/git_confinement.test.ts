/**
 * THE DAEMON COMMITS TO ITS OWN WORKSPACE, AND TO NOTHING ELSE.
 *
 * git DISCOVERS a repository by walking upwards from its working directory. So `cwd` is not
 * confinement: a workspace whose own `.git` is missing — never created, half-removed, or a
 * directory that merely sits inside a larger checkout — silently promotes `git add -A &&
 * git commit` to the ENCLOSING repository.
 *
 * This is not a hypothetical. It happened in this repository: two commits authored
 * `Dédalo Site Builder <site-builder@dedalo.local>` swept an entire unrelated working tree
 * into the project's own history, one of them labelled "scaffold: initial template" — the
 * daemon's first-commit message, applied to somebody else's repository.
 *
 * TWO MECHANISMS, HONESTLY WEIGHTED. GIT_DIR + GIT_WORK_TREE name the repository outright
 * so discovery never runs, and every command but `init` refuses outright when the workspace
 * holds no `.git`. (GIT_CEILING_DIRECTORIES is also set, and is a belt: measured, removing
 * it alone changes nothing while GIT_DIR is set. It is not credited here as a third
 * defence, because a gate that cannot tell a mechanism from its absence is not holding it.)
 *
 * The env pinning is held by the `.git`-less and `.git`-is-a-FILE cases below, driven
 * through `changedFiles` — the one door that does not call `assertIsRepository`, and
 * therefore the only place the pinning is the last thing standing.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resetInstance, roots, workspacePath } from './fixtures/instance';
import { runBinary } from '../src/util/spawn';
import { commitAll, initRepo, changedFiles } from '../src/sites/git';

beforeEach(resetInstance);
afterEach(resetInstance);

/** A real git repository ENCLOSING the workspaces root — the shape that caused the incident. */
async function makeEnclosingRepo(): Promise<{ dir: string; head: () => Promise<string> }> {
  const dir = roots.sitesRoot;
  await mkdir(dir, { recursive: true });
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dir };
  const run = (...args: string[]) => runBinary(['git', ...args], { cwd: dir, env, timeoutMs: 30_000 });
  await run('init', '--quiet', '--initial-branch=main');
  await writeFile(join(dir, 'PRECIOUS.txt'), 'the enclosing project', 'utf8');
  await run('-c', 'user.email=a@b.c', '-c', 'user.name=A', 'add', '-A');
  await run('-c', 'user.email=a@b.c', '-c', 'user.name=A', 'commit', '--quiet', '-m', 'enclosing: real work');
  const head = async () => (await run('rev-parse', 'HEAD')).stdout.trim();
  return { dir, head };
}

describe('git never escapes the workspace', () => {
  test('a workspace with no .git is REFUSED, not promoted to the enclosing repository', async () => {
    const enclosing = await makeEnclosingRepo();
    const before = await enclosing.head();

    // A workspace directory that exists but was never `git init`ed.
    const slug = 'orphan';
    await mkdir(workspacePath(slug), { recursive: true });
    await writeFile(join(workspacePath(slug), 'index.html'), '<h1>hi</h1>', 'utf8');

    await expect(commitAll(slug, 'should never reach the enclosing repo')).rejects.toThrow(
      /not a repository/,
    );

    // The enclosing repository is untouched: same HEAD, and its file still there.
    expect(await enclosing.head()).toBe(before);
    expect(await readFile(join(enclosing.dir, 'PRECIOUS.txt'), 'utf8')).toBe('the enclosing project');
  });

  test('a real workspace commits to ITSELF while an enclosing repository exists', async () => {
    const enclosing = await makeEnclosingRepo();
    const before = await enclosing.head();

    const slug = 'owned';
    await mkdir(workspacePath(slug), { recursive: true });
    await writeFile(join(workspacePath(slug), 'index.html'), '<h1>site</h1>', 'utf8');
    await initRepo(slug);

    // The workspace got its own repository and its own commit…
    expect(existsSync(join(workspacePath(slug), '.git'))).toBe(true);
    // …and the enclosing one did not move.
    expect(await enclosing.head()).toBe(before);
  });

  test('changedFiles reports its own workspace while an enclosing repository exists', async () => {
    // The POSITIVE case only. Note what it does NOT hold: this workspace has its own `.git`,
    // so git's upward discovery stops there whether or not the environment is pinned — the
    // test below is the one that can tell the two worlds apart.
    await makeEnclosingRepo();
    const slug = 'reported';
    await mkdir(workspacePath(slug), { recursive: true });
    await writeFile(join(workspacePath(slug), 'a.html'), 'a', 'utf8');
    await initRepo(slug);
    await writeFile(join(workspacePath(slug), 'b.html'), 'b', 'utf8');

    const changed = await changedFiles(slug);
    expect(changed).toContain('b.html');
    expect(changed.join('\n')).not.toContain('PRECIOUS.txt');
  });

  /**
   * THE STATE IN WHICH THE ENV PINNING IS THE ONLY DEFENCE LEFT.
   *
   * The header credits three mechanisms. Two of them — GIT_DIR + GIT_WORK_TREE naming the
   * repository outright, and GIT_CEILING_DIRECTORIES stopping any walk that survives — were
   * held by nothing: removing all three variables left the suite green, this file included,
   * because every case above either has a real `.git` in the workspace (so discovery finds
   * the right repository anyway) or has none and is refused by `assertIsRepository` before
   * git runs.
   *
   * `changedFiles` is the door where neither of those is true: it never calls
   * `assertIsRepository`. Handed a `.git`-less workspace inside an enclosing checkout it
   * runs `git status` there, and with the pinning removed git walks up and answers with the
   * ENCLOSING tree's files — measured: `["ENCLOSING_SECRET.txt","orphan/"]`, reported to a
   * museum as the changes an agent turn made to its site.
   */
  test('changedFiles on a .git-LESS workspace reports nothing, never the enclosing tree', async () => {
    const enclosing = await makeEnclosingRepo();
    // Something in the enclosing tree that must never be named back to a museum.
    await writeFile(join(enclosing.dir, 'ENCLOSING_SECRET.txt'), 'not this site\'s work', 'utf8');

    const slug = 'orphan';
    await mkdir(workspacePath(slug), { recursive: true });
    await writeFile(join(workspacePath(slug), 'index.html'), '<h1>hi</h1>', 'utf8');
    expect(existsSync(join(workspacePath(slug), '.git'))).toBe(false);

    const changed = await changedFiles(slug);

    expect(changed).toEqual([]);
    expect(changed.join('\n')).not.toContain('ENCLOSING_SECRET');
    expect(changed.join('\n')).not.toContain('PRECIOUS.txt');
  });

  /**
   * AND THE CEILING, on its own: a workspace whose `.git` EXISTS but is not a repository.
   *
   * `assertIsRepository` only asks whether the path exists, so a `.git` that is a stray file
   * (a gitlink left by a submodule extraction, a backup artefact) passes it — and without
   * GIT_DIR/GIT_CEILING_DIRECTORIES git would resume walking upward from there. This is the
   * gap between the existence check and the pinning, and it is the shape a future door with
   * no guard at all would be in.
   */
  test('a workspace whose .git is a FILE still cannot reach the enclosing repository', async () => {
    const enclosing = await makeEnclosingRepo();
    const before = await enclosing.head();

    const slug = 'gitlink';
    await mkdir(workspacePath(slug), { recursive: true });
    await writeFile(join(workspacePath(slug), '.git'), 'gitdir: /nowhere\n', 'utf8');
    await writeFile(join(workspacePath(slug), 'page.html'), 'x', 'utf8');

    // Whatever it does, it does not commit somebody else's tree.
    await commitAll(slug, 'a turn').catch(() => undefined);

    expect(await enclosing.head()).toBe(before);
    expect(await changedFiles(slug)).toEqual([]);
  });
});
