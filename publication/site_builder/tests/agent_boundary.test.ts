/**
 * THE AGENT BOUNDARY — the two things that must never cross it, gated.
 *
 * An agent turn runs arbitrary generated code as this instance's unix user, inside a site's
 * workspace, and the daemon commits whatever it wrote. Two properties keep that from being
 * a hole, and both were stated in prose and enforced by nothing:
 *
 *   1. THE AGENT'S HOME IS NOT THE CALLER'S TO CHOOSE (LEAD-1b). It used to be one root
 *      every call site set (`HOME: config.AGENT_HOME`) and this file held that spelling.
 *      Now the UNIT fixes it — each (site, door) its own directory, the site identity's,
 *      masked from every other run — no caller passes one, and the shim refuses a spec that
 *      tries. That is held BEHAVIOURALLY, on the spec frames the three real call sites send,
 *      by `lead1b_c4_daemon.test.ts` (G13); the spelling gate that stood here was deleted
 *      with the key.
 *   2. THE PUBLICATION API KEY IS NEVER COMMITTED. The per-turn MCP config carries it as a
 *      request header, in cleartext, inside `.builder/` in the site's git repo — and the
 *      daemon runs `git add -A` after every turn. A museum's key was entering the history
 *      of the very site it then publishes, where no later commit can remove it.
 *
 * A THIRD property belongs to the same boundary and lives in its own file: the child
 * environment is a CLOSED SET, not a filter over `process.env`. HOME is one key in it; the
 * rest of the set is the rest of the boundary, and this file named it in prose and held
 * only the one key. `tests/agent_env_boundary.test.ts` holds the set, behaviourally, and
 * is a separate file because it must READ the daemon's configuration (the provider keys
 * whose scoping it proves) — which the seam tripwire forbids to a file exempted for
 * QUOTING root-key identifiers, as this one is.
 *
 * The second is behavioural: it runs a real commit through the real git and reads the index
 * back.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { provisionSite, resetInstance, workspacePath } from './fixtures/instance';
import { createSite } from '../src/sites/workspace';
import { commitAll } from '../src/sites/git';
import { runConfined } from '../src/drivers/confinement';

const ACTOR = { user_id: 11, username: 'boundary-tester' };

beforeEach(resetInstance);
afterEach(resetInstance);

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. The Publication API key
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the daemon never commits its own state into a site it publishes', () => {
  async function gitOut(slug: string, ...args: string[]): Promise<string> {
    // Through the confinement door — see git_confinement.test.ts: a command whose cwd is
    // inside the workspaces root is refused by `runBinary` itself.
    const result = await runConfined({
      door: 'git',
      argv: ['git', ...args],
      cwd: workspacePath(slug),
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      timeoutMs: 30_000,
    });
    return result.stdout;
  }

  test('the MCP config — and the API key in it — is never in the index or the history', async () => {
    const { domain } = await provisionSite('secretive');
    await createSite({ slug: 'secretive', name: 'Secretive', domain, actor: ACTOR });

    // Exactly what the claude_code driver writes before a turn, key header and all.
    const KEY = 'publication-api-key-that-must-not-be-committed';
    await mkdir(join(workspacePath('secretive'), '.builder'), { recursive: true });
    await writeFile(
      join(workspacePath('secretive'), '.builder', 'mcp.json'),
      JSON.stringify({
        mcpServers: { dedalo_publication: { type: 'http', url: 'http://x/mcp', headers: { 'X-API-Key': KEY } } },
      }),
      'utf8',
    );
    // And something the agent legitimately wrote, so the commit is not empty and the gate
    // cannot pass by committing nothing at all.
    await writeFile(join(workspacePath('secretive'), 'index.html'), '<h1>a page</h1>', 'utf8');

    expect(await commitAll('secretive', 'turn: the agent wrote a page')).toBe(true);

    const tracked = await gitOut('secretive', 'ls-files');
    expect(tracked).toContain('index.html');
    expect(tracked).not.toContain('.builder/');

    // And not in any commit, which is the fact that actually matters: a key in a museum's
    // published repository is a key no later commit can take back.
    const history = await gitOut('secretive', 'log', '--all', '-p');
    expect(history).not.toContain(KEY);
    expect(history).not.toContain('X-API-Key');
  });

  test('the exclusion is repository-local, so an agent turn cannot commit it away', async () => {
    // A .gitignore would be site source: in the agent's tree, committed, and rewritable by
    // the very thing it protects against. `.git/info/exclude` is none of those.
    const { domain } = await provisionSite('excluded');
    await createSite({ slug: 'excluded', name: 'Excluded', domain, actor: ACTOR });

    const exclude = readFileSync(join(workspacePath('excluded'), '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('/.builder/');
    const tracked = await gitOut('excluded', 'ls-files');
    expect(tracked).not.toContain('.gitignore');
    expect(tracked).not.toContain('.builder');
  });

  test('daemon state ALREADY tracked by an older repo is untracked on the next commit', async () => {
    // Ignoring a tracked path does nothing at all, so the exclusion alone would leave every
    // repo created before this rule committing the key forever.
    const { domain } = await provisionSite('legacy');
    await createSite({ slug: 'legacy', name: 'Legacy', domain, actor: ACTOR });

    await mkdir(join(workspacePath('legacy'), '.builder'), { recursive: true });
    await writeFile(join(workspacePath('legacy'), '.builder', 'mcp.json'), '{"secret":"x"}', 'utf8');
    // Force it into the index the way an older daemon's `git add -A` would have.
    await gitOut('legacy', 'add', '-f', '.builder/mcp.json');
    expect(await gitOut('legacy', 'ls-files')).toContain('.builder/mcp.json');

    await writeFile(join(workspacePath('legacy'), 'page.html'), 'x', 'utf8');
    await commitAll('legacy', 'turn: a later commit');
    expect(await gitOut('legacy', 'ls-files')).not.toContain('.builder/mcp.json');
  });
});
