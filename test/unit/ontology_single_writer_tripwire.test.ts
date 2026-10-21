/**
 * TRIPWIRE — a TLD's dd_ontology is reconciled/rebuilt/retracted by ONE module.
 *
 * `dd_ontology(tld)` equals the parse of `matrix_ontology(<tld>0)` while the tld is active and
 * is empty while it is not. The whole-tld write doors live in
 * `src/core/ontology/ontology_state.ts` — `rebuildOntology` (the id-stable reconcile),
 * `retractOntology`, `syncOntologyActivation` — and nowhere else (ONT-1, audit 2026-09-26).
 * The outcome half is gated by `ontology_derive_packages_native` (G1c-e),
 * `ontology_update_shell_native` (G1a/G1b) and `ontology_state_native`; this census only
 * keeps a second authority from importing the primitives. It fails if:
 *
 *  1. `regenerateRecordsInDdOntology` exists anywhere (retired onto rebuildOntology).
 *  2. ANY whole-tld delete primitive of `src/core/db/dd_ontology.ts` — every
 *     `export async function deleteTld*`, DERIVED from that file, so a new variant (the
 *     `deleteTldNodesReturningTipos` hole `ontology_delete.ts` used) is covered the day it
 *     lands — is named outside the allowlist: its definition (dd_ontology.ts), the authority
 *     (ontology_state.ts) and two TEST-ONLY teardowns, each with its reason below.
 *     `ontology_write.ts` (activation → syncOntologyActivation) and `ontology_delete.ts`
 *     (→ retractOntology) route through the authority and are NOT on it.
 *  3. A PARSE of an ontology record (every `export async function
 *     parseSectionRecordToOntologyNode*` of `src/core/ontology/parser.ts`, DERIVED) is used
 *     outside its two sanctioned consumers: `section_record/ontology_projection.ts` (the ONE
 *     per-record door, which refuses a parse outside the record's own address — ONT-2) and
 *     `ontology_state.ts` (the whole-tld door, scoped to the tld it rebuilds). A third module
 *     that parses and upserts would write a record into ANOTHER tld's namespace again. The
 *     census is proven on a synthetic offender (self-test) as well as on the tree.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../..');
/** `scripts` too — an operator script wiping a tld is the same second authority. */
const SEARCH_ROOTS = ['src', 'tools', 'scripts'];

/** Whole-tld delete primitive users that are NOT "some new module wipes a tld". */
const DELETE_TLD_ALLOWLIST = new Set([
	'src/core/db/dd_ontology.ts', // defines them
	'src/core/ontology/ontology_state.ts', // the rebuild / retract / activation authority
	// dropSituation: teardown of a TEST SITUATION on a reserved `zz*` TLD
	// (2026-08-19). Not a second rebuild authority: a situation's nodes are
	// not a projection of matrix_ontology — they have NO source records, are
	// born through upsertDdOntologyNode and die with the test. situation()
	// refuses any TLD outside /^zz[a-z]*$/, so this door cannot reach a real TLD.
	'src/core/test_data/situations/situation.ts',
	// dropSyntheticHierarchies: teardown of the SUITE's generated geography
	// hierarchies (2026-08-25). The call iterates ONLY the closed
	// SYNTHETIC_HIERARCHY_TLDS pair (testgeoa/testgeob — compile-time
	// constants, no caller-supplied TLD can reach it), runs behind
	// assertTestDatabase, and sweeps the dd_ontology PROJECTION only AFTER
	// deleteOntologyByTld has removed the matrix_ontology source through the
	// delete driver — full teardown of both sides, not a second rebuild
	// authority. The T3 SQL ratchet is what forbids a raw dd_ontology DELETE
	// there, making deleteTldNodes the one sanctioned sweep.
	'src/core/test_data/synthetic_hierarchy_fixture.ts',
]);

function sourceFiles(): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			if (entry === 'node_modules' || entry.startsWith('.')) continue;
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) walk(full);
			else if (entry.endsWith('.ts')) found.push(full);
		}
	};
	for (const root of SEARCH_ROOTS) walk(join(REPO_ROOT, root));
	return found;
}

/** Strip comments — a mention in prose is documentation, not a call. */
const code = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every `export async function deleteTld*` of the definition file — the census subject. */
function deleteTldPrimitives(): string[] {
	const source = code(readFileSync(join(REPO_ROOT, 'src/core/db/dd_ontology.ts'), 'utf8'));
	return [...source.matchAll(/export\s+async\s+function\s+(deleteTld\w*)\s*\(/g)].map(
		(match) => match[1] as string,
	);
}

/** The modules allowed to PARSE an ontology record into a dd_ontology node (rule 3). */
const PARSE_ALLOWLIST = new Set([
	'src/core/ontology/parser.ts', // defines them
	'src/core/section_record/ontology_projection.ts', // the per-record door (address-guarded)
	'src/core/ontology/ontology_state.ts', // the whole-tld door (tld-scoped)
]);

/** Every `export async function parseSectionRecordToOntologyNode*` of parser.ts. */
function parsePrimitives(): string[] {
	const source = code(readFileSync(join(REPO_ROOT, 'src/core/ontology/parser.ts'), 'utf8'));
	return [
		...source.matchAll(/export\s+async\s+function\s+(parseSectionRecordToOntologyNode\w*)\s*\(/g),
	].map((match) => match[1] as string);
}

/** The files among `sources` naming a parse primitive in CODE, outside the allowlist. */
function parseOffenders(sources: readonly { rel: string; text: string }[]): string[] {
	const names = parsePrimitives();
	const matcher = new RegExp(`\\b(?:${names.join('|')})\\b`);
	return sources
		.filter((source) => !PARSE_ALLOWLIST.has(source.rel) && matcher.test(code(source.text)))
		.map((source) => source.rel);
}

describe('dd_ontology has one reconcile/rebuild authority', () => {
	test('regenerateRecordsInDdOntology is retired (exists nowhere)', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			if (/\bregenerateRecordsInDdOntology\b/.test(code(readFileSync(file, 'utf8')))) {
				offenders.push(relative(REPO_ROOT, file));
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the primitive list is derived from dd_ontology.ts (anti-vacuity floor)', () => {
		const names = deleteTldPrimitives();
		expect(names).toEqual(
			expect.arrayContaining([
				'deleteTldNodes',
				'deleteTldNodesReturningTipos',
				'deleteTldNodesExcept',
			]),
		);
		expect(names.length).toBeGreaterThanOrEqual(3);
	});

	test('every whole-tld delete primitive is used only by the allowlisted modules', () => {
		const names = deleteTldPrimitives();
		expect(names.length).toBeGreaterThan(0);
		const matcher = new RegExp(`\\b(?:${names.join('|')})\\b`);
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			const rel = relative(REPO_ROOT, file);
			if (DELETE_TLD_ALLOWLIST.has(rel)) continue;
			if (matcher.test(code(readFileSync(file, 'utf8')))) offenders.push(rel);
		}
		expect(offenders).toEqual([]);
	});

	test('the parse primitive list is derived from parser.ts (anti-vacuity floor)', () => {
		expect(parsePrimitives()).toEqual(
			expect.arrayContaining([
				'parseSectionRecordToOntologyNode',
				'parseSectionRecordToOntologyNodeWithDefects',
			]),
		);
	});

	test('the parse census catches a synthetic offender and ignores prose (self-test)', () => {
		const offender = {
			rel: 'src/core/zz/rogue.ts',
			text: [
				"import { parseSectionRecordToOntologyNode } from '../ontology/parser.ts';",
				"import { upsertDdOntologyNode } from '../db/dd_ontology.ts';",
				'const node = await parseSectionRecordToOntologyNode(s, id);',
				'if (node) await upsertDdOntologyNode(node);',
			].join('\n'),
		};
		const prose = {
			rel: 'src/core/zz/prose.ts',
			text: '/** the inverse of `parseSectionRecordToOntologyNodeWithDefects` */\nexport {};',
		};
		const allowed = { ...offender, rel: 'src/core/ontology/ontology_state.ts' };
		expect(parseOffenders([offender, prose, allowed])).toEqual(['src/core/zz/rogue.ts']);
	});

	test('only the per-record door and the whole-tld door parse an ontology record', () => {
		const sources = sourceFiles().map((file) => ({
			rel: relative(REPO_ROOT, file),
			text: readFileSync(file, 'utf8'),
		}));
		// Floor: the census saw the two sanctioned consumers (it is not reading an empty tree).
		const users = sources.filter((source) =>
			/\bparseSectionRecordToOntologyNode\w*\b/.test(code(source.text)),
		);
		expect(users.map((source) => source.rel)).toEqual(
			expect.arrayContaining([
				'src/core/section_record/ontology_projection.ts',
				'src/core/ontology/ontology_state.ts',
			]),
		);
		expect(parseOffenders(sources)).toEqual([]);
	});
});
