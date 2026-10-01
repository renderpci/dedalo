/**
 * TRIPWIRE — every committed workflow script PARSES as a workflow script.
 *
 * `.agents/workflows/*.js` are the multi-agent workflows (AGENTS.md "Agent
 * tooling layout"; `review-diff` is the adversarial review every lane runs).
 * They are plain JavaScript that the agent harness loads by stripping the
 * leading `export` from `export const meta = {…}` and compiling the rest as the
 * body of an async function (top-level `await` and `return` are legal there).
 * Nothing in the repo ever compiled them. Measured 2026-10-01: a0f00f4e1e put
 * raw backticks (`observed`) inside the obligation-door lens's template literal;
 * the literal closed early, the file stopped parsing, and EVERY review-diff call
 * failed with a parse error until 94040587d6 quoted them with ''. Every gate
 * stayed green throughout, because no gate read the file.
 *
 * THE RULES (each a pure function below, each with a planted positive control):
 *
 *  A. SHAPE — after leading whitespace/comments the file begins with
 *     `export const meta =` (the harness's own contract: "every script must
 *     begin with export const meta").
 *  B. META IS A PURE LITERAL — the harness reads `meta` without running the
 *     script, so it must be object/array/string/number/boolean/null literals
 *     only: no identifier reference, call, spread, shorthand, computed key,
 *     method, or `${…}` interpolation. Checked by a strict recursive-descent
 *     parser of exactly that grammar, which also fixes where meta ENDS.
 *  C. META FIELDS — `name` and `description` are non-empty strings; `name`
 *     equals the file's basename (one name per workflow, as skill names equal
 *     their directory); `whenToUse`, when present, is a string; `phases`, when
 *     present, is an array of objects with a non-empty string `title` and
 *     optional string `detail` / `model`.
 *  D. THE BODY COMPILES — the file with that one leading `export ` removed is
 *     compiled (never run) as an AsyncFunction body by the JS engine itself. A
 *     syntax error — a stray backtick, a TypeScript annotation, an `import`, a
 *     second `export` — is red with the engine's message.
 *  E. NOT VACUOUS — the corpus is the directory listing, never a hand list, and
 *     it is non-empty and contains `review-diff.js`. The listing is the shared
 *     lister `test/helpers/agent_workflows_corpus.ts`, which owns the
 *     `.agents/workflows` root (registered in census_derivation_tripwire's
 *     SHARED_LISTERS) — this gate chooses no walk root of its own.
 *
 * HONEST LIMITS. Compiling is not running: a ReferenceError, a misspelled hook,
 * or a harness-forbidden call (`Date.now()`, `Math.random()`, argless
 * `new Date()` — they throw at run time to keep resume deterministic) is not
 * seen. A phase() title missing from meta.phases is legal (it gets its own
 * progress group), so it is not checked. The compiler is this process's JSC;
 * the harness's engine could in principle accept a syntax JSC refuses (or the
 * reverse) — for ES2023 script syntax they agree.
 *
 * Hermetic: fs only, imports no src/ module, no DB, no git.
 */

import { describe, expect, test } from 'bun:test';
import { basename } from 'node:path';
import { workflowFiles } from '../helpers/agent_workflows_corpus.ts';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
	body: string,
) => unknown;

// ── Rule A + B: locate meta and parse it under the pure-literal grammar ─────

class LiteralError extends Error {}

/** Skip whitespace and comments from `start`; returns the next significant index. */
function skipTrivia(src: string, start: number): number {
	let i = start;
	for (;;) {
		while (i < src.length && /\s/.test(src[i] as string)) i++;
		if (src.startsWith('//', i)) {
			const nl = src.indexOf('\n', i);
			i = nl < 0 ? src.length : nl + 1;
			continue;
		}
		if (src.startsWith('/*', i)) {
			const end = src.indexOf('*/', i + 2);
			if (end < 0) throw new LiteralError(`unterminated block comment at offset ${i}`);
			i = end + 2;
			continue;
		}
		return i;
	}
}

/**
 * Parses ONE value of the pure-literal grammar starting at `start` and returns the
 * index just past it. Throws LiteralError naming the offending token otherwise.
 */
function parseLiteral(src: string, start: number): number {
	let i = skipTrivia(src, start);
	const c = src[i];
	if (c === undefined) throw new LiteralError('unexpected end of file inside meta');
	if (c === '{') {
		i = skipTrivia(src, i + 1);
		while (src[i] !== '}') {
			i = parseKey(src, i);
			i = skipTrivia(src, i);
			if (src[i] !== ':')
				throw new LiteralError(
					`expected ':' after key at offset ${i} (shorthand properties and methods are not pure literals)`,
				);
			i = parseLiteral(src, i + 1);
			i = skipTrivia(src, i);
			if (src[i] === ',') i = skipTrivia(src, i + 1);
			else if (src[i] !== '}')
				throw new LiteralError(`expected ',' or '}' at offset ${i}, found ${tokenAt(src, i)}`);
		}
		return i + 1;
	}
	if (c === '[') {
		i = skipTrivia(src, i + 1);
		while (src[i] !== ']') {
			i = parseLiteral(src, i);
			i = skipTrivia(src, i);
			if (src[i] === ',') i = skipTrivia(src, i + 1);
			else if (src[i] !== ']')
				throw new LiteralError(`expected ',' or ']' at offset ${i}, found ${tokenAt(src, i)}`);
		}
		return i + 1;
	}
	if (c === "'" || c === '"' || c === '`') return parseString(src, i);
	const num = /^-?(?:0[xX][0-9a-fA-F_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(
		src.slice(i),
	);
	if (num) return checkWordEnd(src, i + num[0].length);
	for (const word of ['true', 'false', 'null']) {
		if (src.startsWith(word, i)) return checkWordEnd(src, i + word.length);
	}
	throw new LiteralError(
		`${tokenAt(src, i)} at offset ${i} is not a literal (identifier, call, spread or expression in meta)`,
	);
}

function checkWordEnd(src: string, i: number): number {
	if (/[\w$.(]/.test(src[i] ?? ''))
		throw new LiteralError(
			`${tokenAt(src, i)} at offset ${i} continues a literal into an expression`,
		);
	return i;
}

function parseKey(src: string, i: number): number {
	const c = src[i];
	if (c === "'" || c === '"') return parseString(src, i);
	if (c === '[') throw new LiteralError(`computed key at offset ${i} is not a pure literal`);
	if (src.startsWith('...', i))
		throw new LiteralError(`spread at offset ${i} is not a pure literal`);
	const ident = /^[A-Za-z_$][\w$]*|^\d+/.exec(src.slice(i));
	if (!ident) throw new LiteralError(`${tokenAt(src, i)} at offset ${i} is not a property key`);
	return i + ident[0].length;
}

/** A quoted string, or a template with NO unescaped `${` (interpolation is an expression). */
function parseString(src: string, i: number): number {
	const quote = src[i];
	for (let j = i + 1; j < src.length; j++) {
		const ch = src[j];
		if (ch === '\\') {
			j++;
			continue;
		}
		if (ch === quote) return j + 1;
		if (quote === '`' && ch === '$' && src[j + 1] === '{')
			throw new LiteralError(`template interpolation at offset ${j} is not a pure literal`);
		if (quote !== '`' && ch === '\n') throw new LiteralError(`unterminated string at offset ${i}`);
	}
	throw new LiteralError(`unterminated string at offset ${i}`);
}

function tokenAt(src: string, i: number): string {
	return JSON.stringify(src.slice(i, i + 24));
}

const META_HEAD = /^export\s+const\s+meta\s*=/;

interface MetaSite {
	/** Offset of the leading `export` keyword. */
	exportAt: number;
	/** The meta value's source text. */
	text: string;
}

/** Rules A + B. Throws LiteralError on any violation. */
function locateMeta(src: string): MetaSite {
	const exportAt = skipTrivia(src, 0);
	const head = META_HEAD.exec(src.slice(exportAt));
	if (!head)
		throw new LiteralError(
			`the script does not begin with \`export const meta =\` (found ${tokenAt(src, exportAt)})`,
		);
	const valueAt = skipTrivia(src, exportAt + head[0].length);
	if (src[valueAt] !== '{')
		throw new LiteralError(`meta is not an object literal (found ${tokenAt(src, valueAt)})`);
	const end = parseLiteral(src, valueAt);
	// The literal must END the declaration. `{…}.x`, `{…} || y`, `{…}, other = …` — and, through
	// ASI, the same continuations on the NEXT line (`}\n.x`, `}\n(f)`, `}\n[0]`, a tag) — would make
	// meta an expression. Accepted ends: `;`, end of file, or a new line whose first token cannot
	// continue an expression.
	const after = skipTrivia(src, end);
	if (after < src.length && src[after] !== ';') {
		const newLine = src.slice(end, after).includes('\n');
		const continues = /^(?:[.,?|&+\-*/%[(`=<>^]|!=|in\b|instanceof\b)/.test(src.slice(after));
		if (!newLine || continues)
			throw new LiteralError(
				`meta's literal is continued by ${tokenAt(src, after)} — it is an expression, not a literal`,
			);
	}
	return { exportAt, text: src.slice(valueAt, end) };
}

/** Evaluate a text ALREADY proven pure-literal by parseLiteral (no identifier, call or interpolation can run). */
function evalLiteral(text: string): unknown {
	return new Function(`return (${text});`)();
}

// ── Rule C: the fields ──────────────────────────────────────────────────────

function metaFaults(meta: unknown, file: string): string[] {
	const faults: string[] = [];
	if (meta === null || typeof meta !== 'object' || Array.isArray(meta))
		return ['meta is not an object'];
	const m = meta as Record<string, unknown>;
	const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim() !== '';
	if (!nonEmpty(m.name)) faults.push('meta.name is missing or not a non-empty string');
	else if (m.name !== basename(file, '.js'))
		faults.push(
			`meta.name ${JSON.stringify(m.name)} is not the file basename ${JSON.stringify(basename(file, '.js'))}`,
		);
	if (!nonEmpty(m.description))
		faults.push('meta.description is missing or not a non-empty string');
	if ('whenToUse' in m && typeof m.whenToUse !== 'string')
		faults.push('meta.whenToUse is not a string');
	if ('phases' in m) {
		if (!Array.isArray(m.phases)) faults.push('meta.phases is not an array');
		else
			m.phases.forEach((p, k) => {
				if (p === null || typeof p !== 'object' || Array.isArray(p)) {
					faults.push(`meta.phases[${k}] is not an object`);
					return;
				}
				const ph = p as Record<string, unknown>;
				if (!nonEmpty(ph.title)) faults.push(`meta.phases[${k}].title is missing or empty`);
				for (const opt of ['detail', 'model'])
					if (opt in ph && typeof ph[opt] !== 'string')
						faults.push(`meta.phases[${k}].${opt} is not a string`);
			});
	}
	return faults;
}

// ── Rule D: compile the body exactly as the harness does ───────────────────

/** Returns null when the body compiles, else the engine's SyntaxError message. */
function compileFault(src: string, site: MetaSite): string | null {
	const body =
		src.slice(0, site.exportAt) + src.slice(site.exportAt + 'export'.length).replace(/^\s+/, ' ');
	try {
		new AsyncFunction(body); // compile only — the function is never called
		return null;
	} catch (e) {
		return e instanceof SyntaxError ? `SyntaxError: ${e.message}` : `compile threw ${String(e)}`;
	}
}

/** All rules for one script's source. Empty = it parses as a workflow script. */
function workflowFaults(src: string, file: string): string[] {
	let site: MetaSite;
	try {
		site = locateMeta(src);
	} catch (e) {
		if (e instanceof LiteralError) return [`meta: ${e.message}`];
		throw e;
	}
	const faults = metaFaults(evalLiteral(site.text), file);
	const compiled = compileFault(src, site);
	if (compiled) faults.push(compiled);
	return faults;
}

// ── Positive controls ───────────────────────────────────────────────────────

const GOOD = `// leading comment is fine
export const meta = {
	name: 'planted',
	description: 'a planted control',
	whenToUse: "never",
	phases: [{ title: 'Scan', detail: \`no interpolation here\` }, { title: 'Fix', model: 'x' }],
	n: -1.5e3, ok: true, none: null, 'quoted key': [1, 2,],
}

const L = \`a lens with 'quoted' words\`
phase('Scan')
const r = await agent(L, { label: 'x' })
return { r }
`;

describe('agent workflows parse tripwire — positive controls', () => {
	test('a well-formed planted script is clean', () => {
		expect(workflowFaults(GOOD, 'planted.js')).toEqual([]);
	});

	test('rule D: the a0f00f4e1e shape — raw backticks inside a template literal — is red', () => {
		const broken = GOOD.replace(
			"a lens with 'quoted' words",
			'the write DECLARES its observed change on afterRecordWrite (`observed`: saved + the removed BEFORE-image)',
		);
		const faults = workflowFaults(broken, 'planted.js');
		expect(faults.length).toBe(1);
		expect(faults[0]).toStartWith('SyntaxError');
	});

	test('rule D: a TypeScript annotation, an import, a second export are red', () => {
		for (const bad of [
			GOOD.replace('const L =', 'const L: string ='),
			`${GOOD.split('\n}\n')[0]}\n}\nimport x from 'y'\nreturn 1\n`,
			GOOD.replace('const L =', 'export const L ='),
		]) {
			const faults = workflowFaults(bad, 'planted.js');
			expect(faults.some((f) => f.startsWith('SyntaxError'))).toBe(true);
		}
	});

	test('rule A: a script that does not BEGIN with export const meta is refused', () => {
		expect(workflowFaults(`const x = 1\n${GOOD}`, 'planted.js')[0]).toContain(
			'does not begin with',
		);
		expect(
			workflowFaults(GOOD.replace('export const meta', 'export let meta'), 'planted.js')[0],
		).toContain('does not begin with');
	});

	test('rule B: every non-literal form in meta is refused', () => {
		const cases: Array<[string, string]> = [
			["description: 'a planted control'", 'description: DESC'],
			["description: 'a planted control'", "description: 'a'.concat('b')"],
			["description: 'a planted control'", 'description: `a ${x} b`'],
			["description: 'a planted control'", "description: 'a' + 'b'"],
			["description: 'a planted control'", "description: 'a planted control', ...rest"],
			["description: 'a planted control'", "description: 'a planted control', name2"],
			["description: 'a planted control'", "description: 'a planted control', ['k']: 1"],
			["description: 'a planted control'", "description: 'a planted control', f() { return 1 }"],
			['n: -1.5e3', 'n: Math.PI'],
			['ok: true', 'ok: true.valueOf()'],
		];
		for (const [from, to] of cases) {
			const src = GOOD.replace(from, to);
			expect(src).not.toBe(GOOD);
			expect(workflowFaults(src, 'planted.js')[0] ?? '').toStartWith('meta:');
		}
	});

	test('rule B: a literal continued into an expression after its closing brace is refused', () => {
		for (const tail of ['}.name', '} || other', '}\n(wrap)', '}\n  .name', '}\n[0]']) {
			const src = GOOD.replace("'quoted key': [1, 2,],\n}", `'quoted key': [1, 2,],\n${tail}`);
			expect(src).not.toBe(GOOD);
			expect(workflowFaults(src, 'planted.js')[0] ?? '').toStartWith('meta:');
		}
		// …while a terminating `;` or a fresh statement on the next line is fine.
		expect(
			workflowFaults(
				GOOD.replace("'quoted key': [1, 2,],\n}", "'quoted key': [1, 2,],\n};"),
				'planted.js',
			),
		).toEqual([]);
	});

	test('rule C: missing/empty name or description, a name off the basename, malformed phases are refused', () => {
		expect(workflowFaults(GOOD.replace("name: 'planted',", ''), 'planted.js')).toContain(
			'meta.name is missing or not a non-empty string',
		);
		expect(workflowFaults(GOOD.replace("'a planted control'", "''"), 'planted.js')).toContain(
			'meta.description is missing or not a non-empty string',
		);
		expect(workflowFaults(GOOD, 'other.js')[0]).toContain('is not the file basename');
		expect(
			workflowFaults(
				GOOD.replace("{ title: 'Fix', model: 'x' }", "{ detail: 'no title' }"),
				'planted.js',
			),
		).toContain('meta.phases[1].title is missing or empty');
		expect(
			workflowFaults(GOOD.replace('whenToUse: "never"', 'whenToUse: 3'), 'planted.js'),
		).toContain('meta.whenToUse is not a string');
	});
});

// ── The real corpus ─────────────────────────────────────────────────────────

describe('agent workflows parse tripwire — .agents/workflows/*.js', () => {
	const files = workflowFiles();

	test('rule E: the corpus is read from disk and is not empty', () => {
		expect(files.length).toBeGreaterThan(0);
		expect(files.map((w) => w.file)).toContain('review-diff.js');
	});

	for (const { file, source } of files) {
		test(`${file} parses as a workflow script`, () => {
			expect(workflowFaults(source, file)).toEqual([]);
		});
	}
});
