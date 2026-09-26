/**
 * THE BASELINE-ARTIFACT CORPUS — the ONE lister of what could be a committed ratchet
 * artifact, and of the tree that could read one.
 *
 * `scripts/baselines_bank.ts` banks improvements only for the ratchets its REGISTRY
 * knows, so test/unit/baseline_registry_tripwire.test.ts holds that registry TOTAL over
 * (a) every `engineering/…json` the tree names and (b) every `engineering/**\/*.json` on
 * disk. The walks behind both live HERE, not in the gate, so their roots are written
 * down once (the census rule: a gate does not choose a walk root in-file —
 * test/unit/census_derivation_tripwire.test.ts, SHARED_LISTERS).
 *
 * ROOTS, one group per walk site:
 *   readerSources()             `scripts` `test` `src` `tools` `.github` — every tree whose
 *                               code, shell or workflow could name an artifact a gate reads
 *                               (tools' vendored `lib/` trees and node_modules excluded:
 *                               third-party bytes read no baseline of ours).
 *   engineeringJsonOnDisk()     `engineering` — the home of every committed artifact.
 *   trackedEngineeringFiles()   `engineering` — the git index's view of the same home, so a
 *                               per-machine runtime record can be proven NOT committed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The trees that could read a committed artifact. */
export const READER_ROOTS = ['scripts', 'test', 'src', 'tools', '.github'] as const;
const READER_GLOB = '**/*.{ts,js,sh,yml,yaml}';

export interface ReaderSource {
	/** Repo-relative path. */
	file: string;
	source: string;
}

/** Every source file under READER_ROOTS, with its text. */
export function readerSources(): ReaderSource[] {
	const out: ReaderSource[] = [];
	for (const root of READER_ROOTS) {
		const abs = join(REPO_ROOT, root);
		if (!existsSync(abs)) continue;
		for (const rel of new Glob(READER_GLOB).scanSync({ cwd: abs, dot: true })) {
			if (rel.includes('node_modules/') || (rel.includes('/lib/') && root === 'tools')) continue;
			const file = `${root}/${rel}`;
			out.push({ file, source: readFileSync(join(REPO_ROOT, file), 'utf8') });
		}
	}
	return out;
}

let onDiskCache: string[] | null = null;

/** Every `engineering/**\/*.json` on disk, repo-relative, sorted. */
export function engineeringJsonOnDisk(): string[] {
	if (onDiskCache === null) {
		onDiskCache = [...new Glob('**/*.json').scanSync({ cwd: join(REPO_ROOT, 'engineering') })]
			.map((rel) => `engineering/${rel}`)
			.sort();
	}
	return onDiskCache;
}

/**
 * The git index's files under engineering/. THROWS when the index cannot answer (an
 * exported archive has none): a failure must be loud, never read as "nothing committed".
 */
export function trackedEngineeringFiles(): Set<string> {
	const git = Bun.spawnSync(['git', 'ls-files', '--', 'engineering'], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (git.exitCode !== 0) {
		throw new Error(
			`git ls-files -- engineering failed (exit ${git.exitCode}): ${git.stderr.toString().trim()}`,
		);
	}
	return new Set(git.stdout.toString().split('\n').filter(Boolean));
}
