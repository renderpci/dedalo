/**
 * THE AGENT SKILLS' CORPUS — the one lister of `.agents/skills/<name>/SKILL.md`,
 * so a gate that censuses the project skills imports its root instead of
 * choosing one in-file (`census_derivation_tripwire` registers this module in
 * SHARED_LISTERS).
 *
 * `.agents/` is the REAL path; `.claude` is a committed symlink to it
 * (`agent_alias_tripwire`). Git does not descend into a symlinked directory, so
 * the real path is the only one a listing may name.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Root of the project skills, repo-relative (the real path, never the alias). */
export const SKILLS_ROOT = '.agents/skills';

export interface SkillFile {
	/** The skill's directory name — what a `name:` frontmatter must equal. */
	dir: string;
	/** Repo-relative path of its SKILL.md. */
	rel: string;
	body: string;
}

/** Every project skill's SKILL.md, sorted by directory name. */
export function skillFiles(): SkillFile[] {
	const glob = new Glob('*/SKILL.md');
	return [...glob.scanSync({ cwd: join(REPO_ROOT, SKILLS_ROOT), onlyFiles: true })]
		.sort()
		.map((p) => ({
			dir: p.split('/')[0] ?? p,
			rel: `${SKILLS_ROOT}/${p}`,
			body: readFileSync(join(REPO_ROOT, SKILLS_ROOT, p), 'utf8'),
		}));
}

/**
 * Every path git TRACKS, repo-relative — what a skill may point a reader at.
 * The index, not the disk: a clone has no `rewrite/`, no `audits/`, no local
 * scratch, and a skill is read on a clone.
 */
export function trackedPaths(): string[] {
	const out = Bun.spawnSync(['git', 'ls-files', '-z'], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return out.stdout
		.toString()
		.split('\0')
		.filter((p) => p !== '');
}

/** Every skill directory name (a directory with a SKILL.md). */
export function skillNames(): Set<string> {
	return new Set(skillFiles().map((s) => s.dir));
}
