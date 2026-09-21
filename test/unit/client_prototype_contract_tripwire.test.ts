/**
 * TRIPWIRE — a browser symbol that carries PROTOTYPE MEMBERS must be declared
 * as a `function`, never as an arrow.
 *
 * WHY THIS EXISTS. The client's component modules are mixins: a constructor is
 * declared once and its methods are attached to its `prototype`, which
 * `component_<model>.js` then folds into the instance —
 *
 *     export const render_search_component_check_box = function() { return true }
 *     render_search_component_check_box.prototype.search = async function(options) { … }
 *
 * An arrow function HAS NO `prototype`. Rewriting that declaration as
 * `const render_search_component_check_box = () => true` — the kind of edit a
 * tidy-up makes without reading the next statement — turns the following line
 * into `undefined.search = …`, which throws WHILE THE MODULE IS EVALUATING.
 * Nothing reports a module that failed to evaluate: `get_instance` simply
 * answers `null`, and the component is missing from every view that asks for
 * it. It happened here, and it cost eight browser suites (the whole
 * component_check_box family plus every lifecycle suite that instantiates it)
 * with the only visible symptom being `Cannot read properties of null`.
 *
 * THE RULE. In `client/` and `tools/**​/js`, for every `X.prototype.<member> =`
 * assignment, the declaration of `X` in the same file must not be an arrow.
 * The scan is textual and deliberately narrow: it reads only same-file
 * declarations of the exact symbol being extended, so it cannot bless or blame
 * anything it did not see.
 *
 * HONEST LIMITS. A constructor declared in one module and extended in another
 * is invisible here (no such shape ships today: every `.prototype.` assignment
 * in the census sits in the file that declares its target, and the floor below
 * would notice if that stopped being true by dropping to zero). A symbol built
 * by `Object.assign`/`class` is out of scope: neither loses its prototype.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSources } from '../helpers/browser_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * The census: every first-party browser module, read once. The file LIST comes
 * from the shared lister (test/helpers/browser_corpus.ts), which is the only
 * place the browser roots are named.
 */
function browserSourceFiles(): { path: string; source: string }[] {
	return browserSources().map((path) => ({
		path,
		source: readFileSync(join(REPO_ROOT, path), 'utf8'),
	}));
}

/**
 * Every `X.prototype.member =` target of a file, with the line it sits on.
 * Anchored at the start of a line so a mention inside a string or a comment
 * body does not count as an assignment.
 */
function prototypeTargets(source: string): { name: string; line: number }[] {
	const out: { name: string; line: number }[] = [];
	const lines = source.split('\n');
	for (const [index, text] of lines.entries()) {
		const match = /^\s*([A-Za-z_$][\w$]*)\.prototype\.[\w$]+\s*=/.exec(text);
		if (match?.[1] !== undefined) out.push({ name: match[1], line: index + 1 });
	}
	return out;
}

/**
 * True when `name` is declared in this file as an ARROW function — the shape
 * that has no prototype. `const X = function…`, `function X…` and `class X…`
 * all answer false, because all three carry one.
 */
function declaredAsArrow(source: string, name: string): boolean {
	const declaration = new RegExp(
		`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`,
		'm',
	);
	return declaration.test(source);
}

/** Every (file, symbol) whose prototype is extended after an arrow declaration. */
function offenders(files: { path: string; source: string }[]): string[] {
	const found: string[] = [];
	for (const file of files) {
		for (const target of prototypeTargets(file.source)) {
			if (declaredAsArrow(file.source, target.name)) {
				found.push(`${file.path}:${target.line}: ${target.name} is an arrow — it has no prototype`);
			}
		}
	}
	return found;
}

describe('a prototype-carrying browser symbol is a function, never an arrow', () => {
	const files = browserSourceFiles();

	test('the census reads the browser tree it claims to read (floor)', () => {
		// A corpus that silently emptied would make every assertion below pass
		// while asserting nothing. Measured 2026-09-04: 772 first-party browser
		// modules carrying 1,900 prototype assignments — the floors sit well
		// under both so ordinary deletions do not redden them, and a collapsed
		// census still cannot hide.
		expect(files.length).toBeGreaterThan(600);
		const targets = files.flatMap((file) => prototypeTargets(file.source));
		expect(targets.length).toBeGreaterThan(1500);
	});

	test('no shipped browser module extends the prototype of an arrow', () => {
		const found = offenders(files);
		expect(
			found,
			`A module assigns onto the prototype of an arrow function. An arrow has none, so the assignment throws WHILE THE MODULE EVALUATES: the module never finishes, get_instance answers null, and the component vanishes from every view with no error naming it. Declare the constructor as \`function\`:\n${found.join('\n')}`,
		).toEqual([]);
	});

	test('positive control: a planted arrow constructor is caught', () => {
		// The gate proved against a file built to be wrong — without this, an
		// empty answer above could mean "clean" or "the matcher never matches".
		const scratch = mkdtempSync(join(tmpdir(), 'proto-contract-'));
		try {
			const planted = join(scratch, 'planted.js');
			writeFileSync(
				planted,
				'export const widget = () => true\nwidget.prototype.render = function() { return 1 }\n',
			);
			const caught = offenders([
				{
					path: planted,
					source: 'export const widget = () => true\nwidget.prototype.render = function() {}\n',
				},
			]);
			expect(caught.length).toBe(1);
			expect(caught[0]).toContain('widget');

			// …and the legal shape is NOT caught.
			const legal = offenders([
				{
					path: planted,
					source:
						'export const widget = function() { return true }\nwidget.prototype.render = function() {}\n',
				},
			]);
			expect(legal).toEqual([]);
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});
});
