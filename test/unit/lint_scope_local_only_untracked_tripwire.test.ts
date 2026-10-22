/**
 * BIOME'S LOCAL-ONLY EXCLUSIONS HIDE NOTHING TRACKED (cross-ops:r4 S3).
 *
 * THE DEFECT. biome.jsonc excludes a "LOCAL-ONLY, GITIGNORED, NEVER ON A CLONE"
 * group — `!**\/audits`, `!**\/.cache`, `!**\/dev`, `!**\/dev_tools`, `!**\/rewrite`
 * — at ANY depth, on the stated ground that "nothing under any is tracked (git
 * ls-files is empty)". No gate checked that ground. A tracked tree under one of
 * those names (a `src/core/x/dev/` helper, a force-added file) would be silently
 * unlinted while `bun run lint` stays green: the reason would be false and nothing
 * would say so. lint_scope_tripwire guards the four doors of biome's scope; this
 * guards the one claim that licenses that group.
 *
 * THE LAW. Every pattern of the group (read from biome.jsonc itself, not copied
 * here) matches ZERO paths `git ls-files` lists. The offender is named with its
 * two honest answers: move it out, or give it an exclusion of its own with its
 * own reason. A planted listing proves the matcher can see an offender at depth
 * and does not over-match a mere prefix (`devices/`).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trackedRepoFiles } from '../helpers/css_reference_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const GROUP_HEADING = 'LOCAL-ONLY, GITIGNORED, NEVER ON A CLONE';

/**
 * The `!**\/<name>` patterns of the local-only group: the run of pattern lines
 * after the group's comment, up to the first blank line (biome.jsonc's group shape).
 */
function localOnlyPatterns(config: string): string[] {
	const lines = config.split('\n');
	const heading = lines.findIndex((line) => line.includes(GROUP_HEADING));
	if (heading < 0) return [];
	const patterns: string[] = [];
	for (const line of lines.slice(heading + 1)) {
		const trimmed = line.trim();
		if (trimmed === '') break;
		if (trimmed.startsWith('//')) continue;
		const match = /^"(![^"]+)",?$/.exec(trimmed);
		if (match?.[1] !== undefined) patterns.push(match[1]);
	}
	return patterns;
}

/** The directory name a `!**\/<name>` pattern excludes at any depth (null: another shape). */
function excludedName(pattern: string): string | null {
	const match = /^!\*\*\/([^/*]+)$/.exec(pattern);
	return match?.[1] ?? null;
}

/** The listed paths under a directory named `name` at any depth (or the name itself). */
function pathsUnder(name: string, listing: readonly string[]): string[] {
	return listing.filter((path) => path.split('/').includes(name));
}

const PATTERNS = localOnlyPatterns(readFileSync(join(REPO_ROOT, 'biome.jsonc'), 'utf8'));

describe('biome local-only exclusions: nothing tracked hides under them', () => {
	test('the group is found and every pattern is the any-depth directory shape (anti-vacuity)', () => {
		expect(PATTERNS).toEqual(expect.arrayContaining(['!**/dev', '!**/dev_tools', '!**/rewrite']));
		for (const pattern of PATTERNS) {
			expect(excludedName(pattern), `${pattern}: not a !**/<name> pattern`).not.toBeNull();
		}
	});

	test('the matcher sees an offender at depth and ignores a mere prefix (planted control)', () => {
		const listing = ['src/core/x/dev/a.ts', 'src/devices/b.ts', 'dev_toolsx/c.ts', 'rewrite/d.md'];
		expect(pathsUnder('dev', listing)).toEqual(['src/core/x/dev/a.ts']);
		expect(pathsUnder('dev_tools', listing)).toEqual([]);
		expect(pathsUnder('rewrite', listing)).toEqual(['rewrite/d.md']);
	});

	test('no tracked path lies under a local-only exclusion', () => {
		const tracked = trackedRepoFiles(); // the registered whole-index lister (census_derivation)
		expect(tracked.length).toBeGreaterThan(1000); // the index really was read
		const offenders = PATTERNS.flatMap((pattern) => {
			const name = excludedName(pattern) ?? '';
			return pathsUnder(name, tracked).map((path) => `${path} (hidden by ${pattern})`);
		});
		expect(
			offenders,
			'tracked files biome never lints — move each out of the local-only tree, or give its tree an exclusion of its own with its own reason in biome.jsonc',
		).toEqual([]);
	});
});
