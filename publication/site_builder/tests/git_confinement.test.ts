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
 * GIT_DIR + GIT_WORK_TREE name the repository outright so discovery never runs;
 * GIT_CEILING_DIRECTORIES stops any walk that survives; and every command but `init`
 * refuses outright when the workspace holds no `.git`.
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

  test('changedFiles reports the WORKSPACE, never the enclosing tree', async () => {
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
});
