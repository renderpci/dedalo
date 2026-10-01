/**
 * THE AGENT WORKFLOWS' CORPUS — the one lister of `.agents/workflows/*.js` (the
 * multi-agent workflow scripts, e.g. `review-diff`), so a gate that censuses
 * them imports its root instead of choosing one in-file
 * (`census_derivation_tripwire` registers this module in SHARED_LISTERS; the
 * sibling `agent_skills_corpus.ts` owns `.agents/skills`).
 *
 * `.agents/` is the REAL path; `.claude` is a committed symlink to it
 * (`agent_alias_tripwire`). Git does not descend into a symlinked directory, so
 * the real path is the only one a listing may name. Zero-argument on purpose —
 * a parameterized lister hands the root choice back to the caller.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Root of the workflow scripts, repo-relative (the real path, never the alias). */
export const WORKFLOWS_ROOT = '.agents/workflows';

export interface WorkflowFile {
	/** The script's file name (`review-diff.js`) — its basename is what `meta.name` must equal. */
	file: string;
	/** Repo-relative path. */
	rel: string;
	source: string;
}

/** Every committed workflow script (`*.js` directly under the root), sorted by file name. */
export function workflowFiles(): WorkflowFile[] {
	return readdirSync(join(REPO_ROOT, WORKFLOWS_ROOT))
		.filter((name) => name.endsWith('.js'))
		.sort()
		.map((file) => ({
			file,
			rel: `${WORKFLOWS_ROOT}/${file}`,
			source: readFileSync(join(REPO_ROOT, WORKFLOWS_ROOT, file), 'utf8'),
		}));
}
