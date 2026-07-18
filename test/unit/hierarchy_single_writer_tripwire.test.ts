/**
 * TRIPWIRE — hierarchy consistency has exactly ONE writer.
 *
 * The bug this guards against is not a line of code, it is a SHAPE: three call sites
 * (tool_hierarchy Generate, the installer's activation, ontology_write) each establishing
 * a different subset of the same invariant, none of them checking the end state. That is
 * how a hierarchy ended up with an ontology, an active flag, and a General Term locator
 * pointing at a record that was never created (Albania, 2026-07-14).
 *
 * The invariant, and every write that establishes it, now lives in
 * src/core/ontology/hierarchy_state.ts. This test fails the moment a second writer appears:
 *
 *  1. `generateVirtualSection` — the ontology provisioner — may only be called by
 *     hierarchy_state.ts (and its own module). A caller that provisions WITHOUT converging
 *     the rest of the invariant reintroduces the half-built hierarchy.
 *  2. A root-term locator (hierarchy45 / hierarchy59) may only be WRITTEN by
 *     hierarchy_state.ts. Anyone else writing one is hard-coding an id — the exact defect
 *     behind the dangling `<tld>1`/1 and `<tld>2`/2 pointers.
 *
 * ontology_write.ts is the ONE allowed exception for (2): it seeds the `dd` ONTOLOGY
 * registry (ontology35 / the 'dd' tld), which is not a thesaurus hierarchy and has no
 * <tld>1 terms to resolve a root from. It is listed explicitly, not pattern-matched.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../..');
const SEARCH_ROOTS = ['src', 'tools'];

/** The module that owns the invariant. */
const OWNER = 'src/core/ontology/hierarchy_state.ts';
/** The provisioner's own module (it defines the function). */
const PROVISIONER = 'src/core/ontology/hierarchy_provision.ts';
/**
 * ontology_write seeds the 'dd' ONTOLOGY registry's root children — the ontology tree,
 * not a thesaurus hierarchy (no <tld>1 terms exist to resolve a root from).
 */
const ROOT_TERM_WRITER_EXEMPT = new Set([OWNER, 'src/core/ontology/ontology_write.ts']);

function sourceFiles(): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			if (entry === 'node_modules' || entry.startsWith('.')) continue;
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else if (entry.endsWith('.ts')) {
				found.push(full);
			}
		}
	};
	for (const root of SEARCH_ROOTS) walk(join(REPO_ROOT, root));
	return found;
}

/** Strip comments — a mention in prose is documentation, not a second writer. */
function code(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('hierarchy consistency has one writer', () => {
	test('generateVirtualSection is called only by hierarchy_state.ts', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			const rel = relative(REPO_ROOT, file);
			if (rel === OWNER || rel === PROVISIONER) continue;
			if (/\bgenerateVirtualSection\s*\(/.test(code(readFileSync(file, 'utf8')))) {
				offenders.push(rel);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('a root-term locator (hierarchy45/59) is written only by hierarchy_state.ts', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			const rel = relative(REPO_ROOT, file);
			if (ROOT_TERM_WRITER_EXEMPT.has(rel)) continue;
			const body = code(readFileSync(file, 'utf8'));
			// A WRITE is a persist call whose key is the general-term tipo. Reads (the tree,
			// the request_config resolver, the inspector) are free.
			const writesRootTerm =
				/updateMatrixKeyData\([^)]*?(HIERARCHY_GENERAL_TERM|'hierarchy45'|'hierarchy59')/s.test(
					body,
				) || /\bwrite\(\s*'relation',\s*HIERARCHY_GENERAL_TERM/.test(body);
			if (writesRootTerm) offenders.push(rel);
		}
		expect(offenders).toEqual([]);
	});
});
