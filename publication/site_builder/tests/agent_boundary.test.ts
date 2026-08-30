/**
 * THE AGENT BOUNDARY — the two things that must never cross it, gated.
 *
 * An agent turn runs arbitrary generated code as this instance's unix user, inside a site's
 * workspace, and the daemon commits whatever it wrote. Two properties keep that from being
 * a hole, and both were stated in prose and enforced by nothing:
 *
 *   1. THE AGENT'S HOME IS THE AGENT'S OWN ROOT, never the workspaces root. Three call
 *      sites construct a child environment (the session manager, git, the build runner) and
 *      all three say so in a comment. A HOME inside the tree an agent turn writes to is a
 *      site able to rewrite the agent's own configuration — its credentials file, its MCP
 *      servers — for every later turn on every OTHER site of the museum.
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
 * The first is a SOURCE assertion, and deliberately: the three environments are built by
 * module-private functions inside detached pipelines, so the honest way to hold them is to
 * read what they construct — the same shape as the boot-ordering gate in
 * tests/instance_roots.test.ts. The second is behavioural: it runs a real commit through
 * the real git and reads the index back.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { provisionSite, resetInstance, workspacePath } from './fixtures/instance';
import { createSite } from '../src/sites/workspace';
import { commitAll } from '../src/sites/git';
import { runBinary } from '../src/util/spawn';

const ACTOR = { user_id: 11, username: 'boundary-tester' };
const SRC = join(import.meta.dir, '..', 'src');

beforeEach(resetInstance);
afterEach(resetInstance);

/* ────────────────────────────────────────────────────────────────────────────────────
 * 1. HOME
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe("every child environment's HOME is the agent's own root", () => {
  /**
   * The three files that construct a child environment. Named individually rather than
   * discovered, so a call site that MOVES has to be re-registered here: a census that
   * silently shrinks is the failure mode of every source-reading gate.
   */
  const CALL_SITES = [
    'sessions/manager.ts', // the agent turn itself
    'sites/git.ts', // git, which reads ~/.gitconfig
    'build/builder.ts', // install + build steps, whose package managers write caches
  ] as const;

  /** Source with comments stripped: the prose EXPLAINS the rule and would satisfy a grep. */
  function code(file: string): string {
    return readFileSync(join(SRC, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  test.each([...CALL_SITES])('%s sets HOME from config.AGENT_HOME and from nothing else', file => {
    // The value is everything up to the separator that ends it — a comma, a newline, or the
    // closing brace of a one-line object literal (which is how the build runner writes it).
    const assignments = [...code(file).matchAll(/HOME:\s*([^,\n}]+)/g)].map(m => m[1]!.trim());
    // At least one — a call site that stopped setting HOME would inherit the daemon's,
    // which on a provisioned host is the service user's real home directory.
    expect(assignments.length).toBeGreaterThan(0);
    for (const value of assignments) {
      expect({ file, value }).toEqual({ file, value: 'config.AGENT_HOME' });
    }
  });

  test('no child environment names the WORKSPACES root as a home', () => {
    // The specific mistake this gate exists for: `HOME: config.SITES_ROOT` reads plausibly
    // (it is a root the daemon owns) and hands every agent turn a home inside the tree it
    // is editing.
    for (const file of CALL_SITES) {
      expect({ file, sitesRootAsHome: /HOME:\s*config\.SITES_ROOT/.test(code(file)) }).toEqual({
        file,
        sitesRootAsHome: false,
      });
    }
  });

  test('AGENT_HOME is a root of its own, and the preflight holds it', () => {
    // The gate above is about the three call sites; this is the other half — the root they
    // name is one the daemon proves at boot (marker + write probe), so "the agent's own
    // root" is a directory that exists and is ours rather than a string.
    const roots = code('instance/roots.ts');
    expect(roots).toContain("label: 'AGENT_HOME'");
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * 2. The Publication API key
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the daemon never commits its own state into a site it publishes', () => {
  async function gitOut(slug: string, ...args: string[]): Promise<string> {
    const result = await runBinary(['git', ...args], {
      cwd: workspacePath(slug),
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: workspacePath(slug) },
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
