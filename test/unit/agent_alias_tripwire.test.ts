/**
 * TRIPWIRE — the agent-tooling aliases are SYMLINKS, not copies (P3-2 / GATE-48).
 *
 * AGENTS.md is the project's instructions; `CLAUDE.md` is a committed symlink to
 * it, and `.claude` a committed symlink to `.agents`. That is the "link, never
 * duplicate" law, and AGENTS.md applies it to itself first: "Never duplicate an
 * alias into a real file. A second copy of AGENTS.md is a fork, not a
 * convenience."
 *
 * It was prose. The state is correct today and nothing asserted it — a DEC-12
 * violation ("invariants are tripwired or deleted") on the file that is the
 * SOURCE of DEC-12. The moment `CLAUDE.md` becomes a real file, the two agent
 * toolchains read different law and neither one knows it: no test fails, no
 * build breaks, and the drift is invisible until two agents act on conflicting
 * instructions.
 *
 * The cheapest gate in the repo, on its most load-bearing file.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** alias -> the real path it must point at. ENUMERATED and total: there are two. */
const ALIASES: Record<string, string> = {
	'CLAUDE.md': 'AGENTS.md',
	'.claude': '.agents',
};

/** `git ls-files -s` mode for a symlink. A regular file is 100644. */
const SYMLINK_MODE = '120000';

function gitMode(path: string): string | null {
	const out = Bun.spawnSync(['git', 'ls-files', '-s', '--', path], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	}).stdout.toString();
	return out.trim() === '' ? null : (out.trim().split(/\s+/)[0] ?? null);
}

describe('agent tooling aliases are symlinks, never copies', () => {
	test('git records each alias as a symlink', () => {
		for (const [alias, target] of Object.entries(ALIASES)) {
			const mode = gitMode(alias);
			expect(mode, `${alias} is not tracked by git at all`).not.toBeNull();
			expect(
				mode,
				`${alias} is tracked as mode ${mode}, not a symlink (${SYMLINK_MODE}). A real file ` +
					`here is a FORK of ${target}: the two agent toolchains would read different ` +
					'instructions and nothing else in the repo would notice.',
			).toBe(SYMLINK_MODE);
		}
	});

	test('each alias points at its real path', () => {
		// Mode alone is not enough: a symlink to the wrong place is still 120000.
		for (const [alias, target] of Object.entries(ALIASES)) {
			expect(readlinkSync(join(REPO_ROOT, alias)), `${alias} points somewhere unexpected`).toBe(
				target,
			);
		}
	});

	test('the law this gate enforces is still written down', () => {
		// If the rule is deleted from AGENTS.md, this gate is enforcing a policy
		// nobody declares any more — that should be a deliberate act, not a drift.
		const agents = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8');
		expect(agents).toContain('Never duplicate an alias into a real file');
		// ...and reading through the alias must yield the same bytes.
		expect(readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8')).toBe(agents);
	});
});
