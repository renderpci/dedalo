/**
 * TRIPWIRE — EVERY TWO-INT ADVISORY LOCK NAMES A DECLARED, UNIQUE CLASS
 * (cross-write:r3, review of b095553e22..ffc2a8479b, S3 tripwire-integrity).
 *
 * The engine's two-int advisory locks — key (class int4, hashtext(name)) — are
 * separate locks only because each family has its OWN class: the diffusion
 * target fence, the per-tld ontology projection lock, the per-tld registry-row
 * mint lock. Two families sharing a class would make one tld's projection and a
 * diffusion target of the same hashtext serialize each other (or deadlock with
 * a third lock between them), and nothing would say why. That rule lived only
 * as prose next to the constants ("cannot collide", "never orders against").
 *
 * WHAT IS HELD, DERIVED from the write-path corpus (test/helpers/write_path_corpus.ts —
 * src/, tools/, scripts/, the registered lister that owns those roots) on every run:
 *   1. every `const <NAME>_LOCK_CLASS = <int>` is an int4 > 0, its NAME and its
 *      VALUE both unique across the tree (floor: the three known families);
 *   2. every SQL site taking a two-int advisory lock (`pg_[try_]advisory_[xact_]
 *      lock[_shared]($1::int, …)`) binds a DECLARED class as its first
 *      parameter — never a literal, never an undeclared identifier;
 *   3. no SQL literal spells a class inline (`advisory_…lock(<digits>`).
 * The scanner is proven against planted offenders of each clause (positive
 * controls), so a regex that matches nothing cannot pass vacuously.
 *
 * (The single-key bigint / hashtext advisory locks are a different key space in
 * Postgres — they cannot collide with a two-int key — and are not this gate's.)
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	REPO_ROOT,
	WRITE_PATH_CORPUS_FLOOR,
	writePathSourceFiles,
} from '../helpers/write_path_corpus.ts';

const INT4_MAX = 2_147_483_647;
/** The families known when this gate was written — the census may grow, never fall below. */
const CLASS_FLOOR = 3;

interface SourceFile {
	path: string;
	text: string;
}

const CLASS_DECL = /\bconst\s+([A-Z][A-Z0-9_]*_LOCK_CLASS)\s*(?::\s*number\s*)?=\s*([0-9_]+)\s*;/g;
const TWO_INT_SITE = /pg_(?:try_)?advisory_(?:xact_)?lock(?:_shared)?\(\$1::int\s*,/g;
const LITERAL_CLASS = /pg_(?:try_)?advisory_(?:xact_)?lock(?:_shared)?\(\s*-?[0-9]/g;

interface Census {
	classes: { name: string; value: number; path: string }[];
	problems: string[];
}

/** The census over `files` — pure, so the positive controls drive the same code. */
function census(files: readonly SourceFile[]): Census {
	const classes: Census['classes'] = [];
	const problems: string[] = [];
	for (const file of files) {
		for (const match of file.text.matchAll(CLASS_DECL)) {
			classes.push({
				name: match[1] as string,
				value: Number((match[2] as string).replaceAll('_', '')),
				path: file.path,
			});
		}
	}
	const byName = new Map<string, string[]>();
	const byValue = new Map<number, string[]>();
	for (const entry of classes) {
		if (!Number.isInteger(entry.value) || entry.value <= 0 || entry.value > INT4_MAX)
			problems.push(`${entry.path}: ${entry.name} = ${entry.value} is not a positive int4`);
		byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry.path]);
		byValue.set(entry.value, [...(byValue.get(entry.value) ?? []), `${entry.path}:${entry.name}`]);
	}
	for (const [name, paths] of byName)
		if (paths.length > 1) problems.push(`class name ${name} declared twice: ${paths.join(', ')}`);
	for (const [value, owners] of byValue)
		if (owners.length > 1) problems.push(`class value ${value} shared by: ${owners.join(', ')}`);
	const declared = new Set(byName.keys());
	for (const file of files) {
		for (const match of file.text.matchAll(LITERAL_CLASS))
			problems.push(`${file.path}: an inline class literal in '${match[0]}'`);
		for (const match of file.text.matchAll(TWO_INT_SITE)) {
			// The site's parameter list: the first `[` after the SQL text (a ternary of
			// two SQL strings shares one list).
			const tail = file.text.slice((match.index ?? 0) + match[0].length);
			const params = /\[\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,/.exec(tail);
			const first = params?.[1]?.split('.').at(-1);
			if (first === undefined || !declared.has(first))
				problems.push(
					`${file.path}: a two-int advisory lock binds ${first === undefined ? 'no parameter list' : `'${first}'`} — not a declared *_LOCK_CLASS`,
				);
		}
	}
	return { classes, problems };
}

function treeFiles(): SourceFile[] {
	return writePathSourceFiles().map((path) => ({
		path,
		text: readFileSync(join(REPO_ROOT, path), 'utf8'),
	}));
}

describe('advisory-lock classes', () => {
	test('every class is declared once, unique in value, and every two-int site binds one', () => {
		const files = treeFiles();
		// Floor: the corpus walk really read the tree.
		expect(files.length).toBeGreaterThan(WRITE_PATH_CORPUS_FLOOR);
		const { classes, problems } = census(files);
		expect(problems).toEqual([]);
		// Floor: the census sees the known families (a regex that matched nothing is red).
		expect(classes.length).toBeGreaterThanOrEqual(CLASS_FLOOR);
		const sites = files.reduce((n, file) => n + [...file.text.matchAll(TWO_INT_SITE)].length, 0);
		expect(sites).toBeGreaterThanOrEqual(CLASS_FLOOR);
	});

	describe('positive controls — the scanner sees each offender', () => {
		const decl = (name: string, value: number) => `export const ${name}_LOCK_CLASS = ${value};\n`;
		const site = (param: string) =>
			`await sql.unsafe('SELECT pg_advisory_xact_lock($1::int, hashtext($2))', [${param}, key]);\n`;

		test('a duplicate class value', () => {
			const { problems } = census([
				{ path: 'a.ts', text: decl('A', 17589990) },
				{ path: 'b.ts', text: decl('B', 17589990) },
			]);
			expect(problems.some((line) => line.startsWith('class value 17589990'))).toBe(true);
		});

		test('a duplicate class name', () => {
			const { problems } = census([
				{ path: 'a.ts', text: decl('A', 17589990) },
				{ path: 'b.ts', text: decl('A', 17589991) },
			]);
			expect(problems.some((line) => line.startsWith('class name A_LOCK_CLASS'))).toBe(true);
		});

		test('a site binding an undeclared identifier, and one binding a literal', () => {
			const { problems } = census([
				{ path: 'a.ts', text: decl('A', 17589990) + site('A_LOCK_CLASS') },
				{ path: 'b.ts', text: site('SOME_OTHER') },
				{ path: 'c.ts', text: site('17589990') },
			]);
			expect(problems.filter((line) => line.startsWith('a.ts'))).toEqual([]);
			expect(
				problems.some((line) =>
					line.startsWith("b.ts: a two-int advisory lock binds 'SOME_OTHER'"),
				),
			).toBe(true);
			expect(problems.some((line) => line.startsWith('c.ts: a two-int advisory lock binds'))).toBe(
				true,
			);
		});

		test('an inline class literal in the SQL', () => {
			const { problems } = census([
				{
					path: 'a.ts',
					text: "await sql.unsafe('SELECT pg_advisory_xact_lock(17589990, hashtext($1))', [k]);",
				},
			]);
			expect(problems.some((line) => line.includes('inline class literal'))).toBe(true);
		});
	});
});
