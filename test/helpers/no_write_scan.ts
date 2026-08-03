/**
 * THE NO-WRITE SCAN — the mechanical half of "nothing on the proposal path can
 * write" (IDENTIFY_SPEC §8, §8.1).
 *
 * It lives here, and not inside one test file, because TWO gates assert it:
 * `identify_propose.test.ts` runs it over the whole of `src/ai/identify/`, and
 * `identify_vision.test.ts` runs it over `vision.ts` specifically (the second
 * proposal source, which would otherwise only ever be checked by a directory
 * listing — a "gate" that stays green over any content whatsoever).
 *
 * WHY THE EXTRACTOR IS ITS OWN FUNCTION. The scan is only as honest as its
 * ability to SEE an import. The first version matched `/from\s+'([^']+)'/g`,
 * which reads static imports and nothing else — so
 * `await import('../../core/db/matrix_write.ts')` was invisible to it, produced
 * no DML literal of its own, and the flagship invariant stayed green over a full
 * matrix write. Dynamic import is an established idiom in this repo
 * (CONVENTIONS.md §2) and is already used inside these very gates, so that was a
 * reachable hole, not a theoretical one. `extractImportSpecifiers` therefore
 * covers every form the language offers, and has its own test.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Import specifier fragments that would hand a module a way to MUTATE state.
 *
 * These modules read the database too, of course — the line that must never be
 * crossed is this module acquiring a way to CHANGE anything, or a way to hand
 * work to something that will (a queue, the background runner, the api
 * dispatcher, which reaches every write action in the engine).
 */
export const FORBIDDEN_WRITE_IMPORTS: readonly string[] = [
	'matrix_write',
	'json_codec',
	'/record/', // section/record/{save,create,delete,duplicate}_record
	'save_component',
	'relations/save',
	'dd_ontology',
	'queue.ts', // diffusion/jobs/queue.ts — enqueueDiffusionJob
	'save_event',
	'diffusion',
	'db/postgres',
	'api/dispatch', // the registry reaches every write action there is
	'tools/background', // scheduleBackground — work handed to the runner IS a write
	'ontology_write',
	'ontology_state',
	'hierarchy_state',
];

/**
 * Statements that would be a write even with no telling import — a raw DML
 * string, an unparameterised escape hatch, or a call to one of the real doors
 * that hands work to something which writes.
 *
 * `scheduleBackground(` and `enqueueDiffusionJob(` are named because they are
 * what actually exists: an earlier version of this list matched `enqueue(`,
 * which no module in this engine ever calls, so the pattern could not have
 * fired on anything.
 */
export const FORBIDDEN_WRITE_SOURCE: readonly RegExp[] = [
	/\bINSERT\s+INTO\b/i,
	/\bUPDATE\s+[a-z_]+\s+SET\b/i,
	/\bDELETE\s+FROM\b/i,
	/\bTRUNCATE\s+/i,
	/\bsql\.unsafe\s*\(/,
	/\bscheduleBackground\s*\(/,
	/\b\w*[eE]nqueue\w*\s*\(/,
	/\bsaveComponent\s*\(/,
	/\b(?:insert|update|delete)MatrixRecord\w*\s*\(/,
	/\bwithTransaction\s*\(/,
];

/**
 * Every module specifier a source file imports, in every form the language
 * offers: static `import … from`, side-effect `import '…'`, re-export
 * `export … from`, dynamic `import(…)` (quoted or templated) and `require(…)`.
 */
export function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const push = (value: string | undefined): void => {
		if (value !== undefined && value !== '') out.push(value);
	};
	const quoted = String.raw`'([^']+)'|"([^"]+)"|\x60([^\x60$]+)\x60`;
	// `from '…'` / `from "…"` — static imports and re-exports.
	for (const match of source.matchAll(new RegExp(String.raw`\bfrom\s+(?:${quoted})`, 'g'))) {
		push(match[1] ?? match[2] ?? match[3]);
	}
	// `import('…')` — dynamic, awaited or not; and `require('…')`.
	for (const match of source.matchAll(
		new RegExp(String.raw`\b(?:import|require)\s*\(\s*(?:${quoted})`, 'g'),
	)) {
		push(match[1] ?? match[2] ?? match[3]);
	}
	// Bare side-effect import: `import '…';` (no `from`).
	for (const match of source.matchAll(new RegExp(String.raw`\bimport\s+(?:${quoted})`, 'g'))) {
		push(match[1] ?? match[2] ?? match[3]);
	}
	return out;
}

/** Comments are PROSE ABOUT the rule; they must not be scanned FOR it. */
export function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Every `.ts` file under `dir`, RECURSIVELY, as paths relative to `dir`. A
 * non-recursive listing would let a subdirectory hold the write nobody scans.
 */
export function listSourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			for (const nested of listSourceFiles(join(dir, entry.name))) {
				out.push(`${entry.name}/${nested}`);
			}
			continue;
		}
		if (entry.name.endsWith('.ts')) out.push(entry.name);
	}
	return out.sort();
}

/**
 * Scan ONE source file for a write seam. Returns a list of human-readable
 * violations — empty means the file has no way to change anything.
 */
export function scanFileForWriteSeam(path: string, label = path): string[] {
	const source = readFileSync(path, 'utf8');
	const violations: string[] = [];
	for (const specifier of extractImportSpecifiers(source)) {
		for (const forbidden of FORBIDDEN_WRITE_IMPORTS) {
			if (specifier.includes(forbidden)) {
				violations.push(`${label} imports '${specifier}' (forbidden: '${forbidden}')`);
			}
		}
	}
	const code = stripComments(source);
	for (const pattern of FORBIDDEN_WRITE_SOURCE) {
		const hit = pattern.exec(code);
		if (hit !== null) violations.push(`${label} contains ${pattern} — '${hit[0].trim()}'`);
	}
	return violations;
}
