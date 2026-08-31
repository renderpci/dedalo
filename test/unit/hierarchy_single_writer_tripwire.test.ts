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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../..');
/**
 * `scripts` is scanned too: an operator script is exactly where a second
 * "just provision it / just fix the locator" writer appears, and it runs
 * against a production DB with no review path.
 */
const SEARCH_ROOTS = ['src', 'tools', 'scripts'];

/** The module that owns the invariant. */
const OWNER = 'src/core/ontology/hierarchy_state.ts';
/** The provisioner's own module (it defines the function). */
const PROVISIONER = 'src/core/ontology/hierarchy_provision.ts';
/**
 * ontology_write seeds the 'dd' ONTOLOGY registry's root children — the ontology tree,
 * not a thesaurus hierarchy (no <tld>1 terms exist to resolve a root from).
 */
const ROOT_TERM_WRITER_EXEMPT = new Set([
	OWNER,
	'src/core/ontology/ontology_write.ts',
	// The SUITE's own corpus builder: it composes a hierarchy record's relation
	// payload (including hierarchy45, which the tree refuses to render without)
	// for the disposable test database. It writes a fixture, never an
	// installation's hierarchy. Surfaced 2026-08-31 by hardening the matcher
	// below — it was invisible to the three-shape version.
	'src/core/test_data/test_corpus/ensure.ts',
]);

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
			// The NAME, not the call site: `import { generateVirtualSection as gvs }`
			// followed by `gvs(...)` is the same second writer, and a call-shaped
			// regex (`generateVirtualSection\s*\(`) waved it straight through.
			if (/\bgenerateVirtualSection\b/.test(code(readFileSync(file, 'utf8')))) {
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
			// THE CONSTANT NAME PLUS A WRITE VERB (P2-21 / GATE-36), which is how
			// this file's FIRST assertion was already written — with a comment
			// saying so. This one kept three SYNTACTIC shapes requiring the tipo to
			// appear inside the call, so ordinary ES shorthand walked through:
			//
			//   const componentTipo = HIERARCHY_GENERAL_TERM;
			//   await saveComponentData({ …, componentTipo, … });
			//
			// matches none of the three. The invariant that produced the
			// dangling-root-term incident was held by a matcher one refactor weaker
			// than its sibling in the same file.
			const namesRootTerm =
				/\b(HIERARCHY_GENERAL_TERM|HIERARCHY_GENERAL_TERM_MODEL)\b|'hierarchy45'|'hierarchy59'/.test(
					body,
				);
			const persists =
				/\b(saveComponentData|updateMatrixKeyData|insertMatrixRecord\w*|upsertDdOntologyNode)\s*\(/.test(
					body,
				);
			if (namesRootTerm && persists) offenders.push(rel);
		}
		expect(
			offenders,
			'Only hierarchy_state.ts may write a root-term locator. A file that NAMES the ' +
				`general-term tipo and calls a persist verb is a writer.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	test('anti-vacuity: the shorthand shape that used to walk through is caught', () => {
		// The mutation control the audit asks for: the evading shape must red the
		// matcher, and an ordinary READ must still be free.
		const shorthand =
			'const componentTipo = HIERARCHY_GENERAL_TERM;\nawait saveComponentData({ componentTipo });';
		const names =
			/\b(HIERARCHY_GENERAL_TERM|HIERARCHY_GENERAL_TERM_MODEL)\b|'hierarchy45'|'hierarchy59'/;
		const persists =
			/\b(saveComponentData|updateMatrixKeyData|insertMatrixRecord\w*|upsertDdOntologyNode)\s*\(/;
		expect(names.test(shorthand) && persists.test(shorthand)).toBe(true);
		// The three OLD shapes all scored zero on it — that is the defect.
		expect(/componentTipo:\s*HIERARCHY_GENERAL_TERM/.test(shorthand)).toBe(false);
		expect(/updateMatrixKeyData\([^)]*?HIERARCHY_GENERAL_TERM/s.test(shorthand)).toBe(false);
		// A pure READ of the tree is still free.
		const reader = 'const tree = await readHierarchy(HIERARCHY_GENERAL_TERM);';
		expect(names.test(reader) && persists.test(reader)).toBe(false);
	});
});
