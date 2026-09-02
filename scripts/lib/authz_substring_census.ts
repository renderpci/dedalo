/**
 * THE AUTHZ-SUBSTRING CENSUS (S-2 clause 4 / P0-15 — the SEC-01 lesson, GATE-24).
 *
 * An authorization decision may not be gated by a source substring. Gate B of
 * the export grid had exactly ONE assertion in the whole tree —
 * `src.includes('getPermissions(context.principal, seg.section_tipo, …)')` —
 * and that assertion stayed green through `< 1` → `< 0`, an `if (false)` around
 * the loop, and `throw` → `continue`: a substring cannot see the guard that
 * encloses the call, the comparison the result feeds, or whether the refusal
 * fires. A gate that survives every neutering of the decision is not a gate.
 *
 * This module is the PURE classifier behind `authz_substring_gate_tripwire`.
 * Given a test file's source it finds the SITES — assertion literals that pin
 * a call-site shape of an authorization symbol — and, PER SYMBOL, whether the
 * same file also carries a BEHAVIOURAL LEG for that symbol. A site whose symbol
 * has no leg in its file is UNCOVERED; a file with an uncovered site is
 * substring-only for that decision.
 *
 * WHY THE LEG IS PER SYMBOL, NOT PER FILE. The first cut of this census
 * credited a whole file for ONE real call: `security_audit_2026_07_23_tripwire`
 * drives `scopeInverseReferenceHits` as a global admin and was thereby
 * licensed to pin AUTHZ-06's per-user project narrowing as a substring — and a
 * `|| true` on that filter (every non-admin sees every tenant's projects) stayed
 * green across the suite. That is the SEC-01 shape with an alibi. A pin of
 * symbol S is covered only by a non-literal call of S (through a real import
 * of S) in the same file; the role-flag member read `.isGlobalAdmin` is covered
 * by a principal-driven refusal (`refusalOf`, `refusalOfSync`, `resolvePrincipal`)
 * — the shape a role decision is driven in. Anything else is a cross-file twin,
 * admitted ONLY through the gate's enumerated map, per symbol.
 *
 * WHAT A SITE IS. A string or regex literal holding `<symbol>(` — the paren
 * escaped or not, regex whitespace (`\s*`) between name and paren or not, so
 * `toMatch(/getPermissions\s*\(ctx/)` is the same pin as
 * `includes('getPermissions(ctx')` — or `.isGlobalAdmin`, that the file uses
 * as a NEEDLE against a haystack: an argument (any position) of an
 * assertion-shaped method (`includes`/`indexOf`/`toContain`/`toMatch`/`match`/
 * `split`/`replace`/`matchAll`/`exec`/`test`…), directly or through
 * `new RegExp(…)`; the RECEIVER of `.test(`/`.exec(` (`/re/.test(src)`,
 * `new RegExp(s).exec(src)`); an argument of a LOCAL helper whose body feeds a
 * parameter to one of those; or HOISTED — the literal sits in the initializer
 * of a binding (a constant, an array element, an object property) that is later
 * that needle, itself, through a member path (`PINS.gateB`), or through a
 * `for…of` over it. Whether the file reads source text is NOT a precondition: a
 * needle is a needle whichever fs door fetched the haystack. `isGlobalAdmin:`
 * (an object-literal key, a principal FIXTURE) is not a site: a fixture is
 * data, not a decision — the member shape needs the leading dot.
 *
 * THE SYMBOL SET IS DERIVED, NEVER HAND-KEPT. The core set is the exported
 * functions of the four authorization modules (permissions, record_scope,
 * frontier_scope, tools/security) minus the cache plumbing; the wrapper set is
 * every top-level function in src/ and tools/ whose body calls one of them,
 * iterated to a fixpoint (tool_transcription's `gateRecord` → `gateRecordWrite`
 * is the shape that needs the second hop), gated by an authorization name
 * vocabulary.
 *
 * HONEST LIMIT. Sites are found lexically: a needle assembled by concatenation
 * or a template expression at runtime is invisible; a needle that reaches the
 * assertion through a function RETURN (`needles()`), a class field, a
 * destructuring pattern, or a helper declared as a class method is not
 * followed; a haystack method not in the list (`localeCompare`, a hand-rolled
 * scanner over `charAt`) is not an assertion; and a wrapper declared as an
 * arrow const or a class method is not derived. The leg is symbol-granular,
 * not location-granular: a real call of `getPermissions` in a file licenses
 * every `getPermissions(` pin in that file, whichever source location each pin
 * names — the exemption map is where WHICH twin drives WHICH pin is written
 * down. All these limits err toward NOT reporting, never toward a false red.
 */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

export interface SourceFile {
	/** repo-relative path */
	file: string;
	source: string;
}

export interface AuthzSymbols {
	/** exported decision functions of the authorization modules */
	core: string[];
	/** top-level functions elsewhere whose body calls a core (or wrapper) symbol */
	wrappers: string[];
	/** symbol → the wrappers whose body calls it DIRECTLY (the derivation edges) */
	callers: Record<string, string[]>;
}

export interface AuthzSite {
	file: string;
	line: number;
	/** the symbol the literal pins, or `.isGlobalAdmin` */
	symbol: string;
	/** the assertion method the literal is (eventually) an argument of */
	method: string;
	/** the hoisted binding the literal reached the assertion through, if any */
	via?: string;
	text: string;
}

export interface AuthzFileReport {
	file: string;
	sites: AuthzSite[];
	/** symbol → evidence of an in-file behavioural leg for that symbol */
	legs: Record<string, string>;
	/** sites whose symbol has no in-file leg */
	uncovered: AuthzSite[];
}

/** The four modules whose exports ARE the authorization decisions. */
export const AUTHZ_MODULES = [
	'src/core/security/permissions.ts',
	'src/core/security/record_scope.ts',
	'src/core/security/frontier_scope.ts',
	'src/core/tools/security.ts',
] as const;

/** Cache plumbing exported next to the decisions — not decisions. */
const NOT_A_DECISION = /^(?:clear|invalidate)|Cache/;

/** The member read of the role flag, e.g. `principal.isGlobalAdmin`. */
export const ROLE_FLAG_MEMBER = '.isGlobalAdmin';

/** Assertion-shaped methods a source literal can be the argument of. */
const ASSERTION_METHODS = [
	'includes',
	'indexOf',
	'lastIndexOf',
	'toContain',
	'toMatch',
	'toInclude',
	'test',
	'match',
	'matchAll',
	'search',
	'split',
	'replace',
	'replaceAll',
	'exec',
	'startsWith',
	'endsWith',
];
const METHODS = ASSERTION_METHODS.join('|');
/** Methods whose RECEIVER is the needle: `/re/.test(src)`, `re.exec(src)`. */
const RECEIVER_METHODS = 'test|exec';
/**
 * `….method(` — any argument position (`replace('a', NEEDLE)`), optionally
 * through `new RegExp(` — ending right before the literal. Matched against
 * CODE (other literals blanked), so an earlier string argument holding parens
 * cannot break the argument walk.
 */
const ASSERTION_METHOD_TAIL = new RegExp(
	`\\.(${METHODS})\\s*\\((?:[^()]*,)?\\s*(?:new\\s+RegExp\\s*\\(\\s*)?$`,
);
/** `new RegExp(` right before the literal (the receiver form's prefix half). */
const NEW_REGEXP_PREFIX = /\bnew\s+RegExp\s*\(\s*$/;
/** A regex literal that is the receiver: `/re/.test(` follows it. */
const RECEIVER_SUFFIX = new RegExp(`^\\s*\\.\\s*(${RECEIVER_METHODS})\\s*\\(`);
/** `new RegExp('re'[, flags]).test(` — the `)` then the receiver method. */
const NEW_REGEXP_RECEIVER_SUFFIX = new RegExp(
	`^\\s*(?:,[^()]*)?\\)\\s*\\.\\s*(${RECEIVER_METHODS})\\s*\\(`,
);
/** `….method(…, IDENT.path` — an identifier (root of a member path) is a needle. */
const ASSERTED_IDENTIFIER = new RegExp(
	`\\.(${METHODS})\\s*\\((?:[^()]*,)?\\s*(?:new\\s+RegExp\\s*\\(\\s*)?([A-Za-z_$][\\w$]*)(?:\\s*\\.\\s*[\\w$]+|\\s*\\[[^\\]]*\\])*\\s*[,)]`,
	'g',
);
/** `IDENT.path.test(` — an identifier is the receiver needle. */
const RECEIVER_IDENTIFIER = new RegExp(
	`\\b([A-Za-z_$][\\w$]*)(?:\\s*\\.\\s*[\\w$]+|\\s*\\[[^\\]]*\\])*\\s*\\.\\s*(${RECEIVER_METHODS})\\s*\\(`,
	'g',
);
/** `for (const X of Y)` — Y's elements reach whatever X reaches. */
const FOR_OF = /\bfor\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s+(\w+)\s*\)/g;
/** `const X = …` — a hoisted needle (or an array / object of them). */
const BINDING = /\b(?:const|let|var)\s+(\w+)\s*(?::[^=;]*)?=(?!=)/g;
/** A local function whose parameters may be needles: declaration or arrow const. */
const LOCAL_FUNCTION =
	/\b(?:function\s+(\w+)\s*\(([^)]*)\)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]*)?=>)/g;

/** A principal-driven refusal: the test resolves a real principal or awaits a refusal. */
export const REFUSAL_CALLS = ['refusalOf', 'refusalOfSync', 'resolvePrincipal'];
/**
 * The other principal-driven refusal shape: a NON-ADMIN principal literal in
 * the file and an awaited rejection. Both halves are required — a rejection
 * alone is any error test, a non-admin literal alone is a fixture.
 */
const NON_ADMIN_LITERAL = /\bisGlobalAdmin\s*:\s*false\b/;
const AWAITED_REJECTION = /\.rejects\s*\.\s*toThrow\s*\(/;

// --- lexical regions ---------------------------------------------------------

type Region = { kind: 'code' | 'string' | 'regex' | 'comment'; start: number; end: number };

/** Characters after which a `/` opens a regex literal rather than dividing. */
const REGEX_PRECEDER = /[(,=:[!&|?{};+\-*%<>~^]$|\breturn$|\btypeof$|\bcase$|^$/;

/**
 * Split source into code / string / regex / comment regions. The regex
 * heuristic — a `/` opens a literal when the preceding non-space code token
 * cannot end an expression — is the standard one and holds for a test corpus.
 */
export function lexRegions(source: string): Region[] {
	const regions: Region[] = [];
	let i = 0;
	let codeStart = 0;
	const closeCode = (at: number): void => {
		if (at > codeStart) regions.push({ kind: 'code', start: codeStart, end: at });
	};
	while (i < source.length) {
		const ch = source[i] as string;
		const next = source[i + 1];
		if (ch === '/' && next === '/') {
			closeCode(i);
			const end = source.indexOf('\n', i);
			const stop = end === -1 ? source.length : end;
			regions.push({ kind: 'comment', start: i, end: stop });
			i = codeStart = stop;
			continue;
		}
		if (ch === '/' && next === '*') {
			closeCode(i);
			const end = source.indexOf('*/', i + 2);
			const stop = end === -1 ? source.length : end + 2;
			regions.push({ kind: 'comment', start: i, end: stop });
			i = codeStart = stop;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			closeCode(i);
			let j = i + 1;
			while (j < source.length) {
				const c = source[j];
				if (c === '\\') {
					j += 2;
					continue;
				}
				if (c === ch) break;
				// A template literal spans lines; a plain string never does.
				if (ch !== '`' && c === '\n') break;
				j += 1;
			}
			const stop = Math.min(j + 1, source.length);
			regions.push({ kind: 'string', start: i, end: stop });
			i = codeStart = stop;
			continue;
		}
		if (ch === '/') {
			const before = source.slice(codeStart, i).trimEnd();
			if (REGEX_PRECEDER.test(before)) {
				closeCode(i);
				let j = i + 1;
				let inClass = false;
				while (j < source.length) {
					const c = source[j];
					if (c === '\\') {
						j += 2;
						continue;
					}
					if (c === '\n') break;
					if (c === '[') inClass = true;
					else if (c === ']') inClass = false;
					else if (c === '/' && !inClass) break;
					j += 1;
				}
				// Consume the flags.
				j += 1;
				while (j < source.length && /[a-z]/i.test(source[j] as string)) j += 1;
				const stop = Math.min(j, source.length);
				regions.push({ kind: 'regex', start: i, end: stop });
				i = codeStart = stop;
				continue;
			}
		}
		i += 1;
	}
	closeCode(source.length);
	return regions;
}

/** The source with every region not in `keep` blanked to spaces (positions preserved). */
function blankExcept(source: string, keep: readonly Region['kind'][]): string {
	let out = '';
	for (const region of lexRegions(source)) {
		const slice = source.slice(region.start, region.end);
		out += keep.includes(region.kind) ? slice : slice.replace(/[^\n]/g, ' ');
	}
	return out;
}

/** Code only: strings, regexes and comments blanked. */
export function codeOnly(source: string): string {
	return blankExcept(source, ['code']);
}

/** Code + strings: only comments blanked (an import path IS a string). */
export function withoutComments(source: string): string {
	return blankExcept(source, ['code', 'string', 'regex']);
}

function lineOf(source: string, offset: number): number {
	let line = 1;
	for (let i = 0; i < offset; i += 1) if (source[i] === '\n') line += 1;
	return line;
}

// --- symbol derivation -----------------------------------------------------------

// `[<(]`: a generic signature (`scopeInverseReferenceHits<T ...>(`) is still a function.
const EXPORTED_FUNCTION = /^export\s+(?:async\s+)?function\s+(\w+)\s*[<(]/gm;
const TOP_LEVEL_FUNCTION = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[<(]/gm;

/**
 * The VOCABULARY a wrapper's name must speak. Without it the fixpoint absorbs
 * every function that transitively reaches a decision (dispatchRqo, readSection,
 * propagateToObservers… measured 291 names), and a substring pinning
 * `propagateToObservers(` would be reported as an authorization gate. A wrapper
 * is a function that BOTH calls a decision AND is named as one — the grammar
 * is derived-by-shape, not a list of files.
 */
const WRAPPER_VOCABULARY =
	/^(?:gate|assert|require|authoriz|can[A-Z]|is[A-Z]|scope|acl|refuse|deny)|Permission|Scope|Authoriz|Gate|Acl|Grant|Visible|Allowed/;

/** The exported decision functions of the authorization modules (pure). */
export function deriveCoreSymbols(modules: SourceFile[]): string[] {
	const names = new Set<string>();
	for (const { source } of modules) {
		for (const match of source.matchAll(EXPORTED_FUNCTION)) {
			const name = match[1] as string;
			if (!NOT_A_DECISION.test(name)) names.add(name);
		}
	}
	return [...names].sort();
}

/**
 * Top-level functions whose body calls a known symbol, to a fixpoint (pure).
 * A body runs from the declaration to the next line that is a bare `}` at
 * column 0 — the shape of every top-level function in this tree.
 */
export function deriveWrapperSymbols(files: SourceFile[], core: string[]): string[] {
	return deriveWrapperGraph(files, core).wrappers;
}

/** The wrappers AND the edges: which known symbol each wrapper's body calls directly. */
export function deriveWrapperGraph(
	files: SourceFile[],
	core: string[],
): { wrappers: string[]; callers: Record<string, string[]> } {
	const known = new Set(core);
	const wrappers = new Set<string>();
	const callers: Record<string, string[]> = {};
	// (name, body) pairs, comments/strings blanked so a mention in prose is not a call.
	const declared: { name: string; body: string }[] = [];
	for (const { source } of files) {
		const code = codeOnly(source);
		for (const match of code.matchAll(TOP_LEVEL_FUNCTION)) {
			const name = match[1] as string;
			const start = match.index ?? 0;
			const endMatch = /^}/m.exec(code.slice(start));
			const body = code.slice(start, endMatch ? start + (endMatch.index ?? 0) + 1 : undefined);
			declared.push({ name, body });
		}
	}
	let grew = true;
	while (grew) {
		grew = false;
		for (const { name, body } of declared) {
			if (known.has(name) || !WRAPPER_VOCABULARY.test(name)) continue;
			for (const symbol of known) {
				if (new RegExp(`\\b${symbol}\\s*\\(`).test(body)) {
					known.add(name);
					wrappers.add(name);
					grew = true;
					break;
				}
			}
		}
	}
	// The edges, over the FINAL set (a wrapper admitted late may call an earlier
	// one) — for core symbols too: `assertActionPermission` (core) calls
	// `isRecordInScope` (core) directly, and a twin that drives the former with a
	// stubbed latter is driving that edge.
	for (const { name, body } of declared) {
		if (!known.has(name)) continue;
		for (const symbol of known) {
			if (symbol !== name && new RegExp(`\\b${symbol}\\s*\\(`).test(body)) {
				const list = callers[symbol] ?? [];
				list.push(name);
				callers[symbol] = list;
			}
		}
	}
	for (const list of Object.values(callers)) list.sort();
	return { wrappers: [...wrappers].sort(), callers };
}

/** Read the authorization modules + the src/tools tree and derive the symbol set. */
export function deriveAuthzSymbols(repoRoot: string): AuthzSymbols {
	const modules: SourceFile[] = AUTHZ_MODULES.map((file) => ({
		file,
		source: readFileSync(join(repoRoot, file), 'utf8'),
	}));
	const core = deriveCoreSymbols(modules);
	const files: SourceFile[] = [];
	for (const dir of ['src', 'tools']) {
		for (const match of new Glob('**/*.ts').scanSync({ cwd: join(repoRoot, dir) })) {
			if (match.endsWith('.test.ts') || match.endsWith('.d.ts')) continue;
			const file = relative(repoRoot, join(repoRoot, dir, match));
			files.push({ file, source: readFileSync(join(repoRoot, file), 'utf8') });
		}
	}
	return { core, ...deriveWrapperGraph(files, core) };
}

// --- the classifier ------------------------------------------------------------------

function symbolPattern(symbols: AuthzSymbols): RegExp {
	const names = [...symbols.core, ...symbols.wrappers];
	// A call shape `name(` — regex whitespace (`\s*`, `\s+`, ` *`, escaped once
	// or twice) may sit between name and paren, and the paren may be
	// regex-escaped (`name\(`, or `name\\(` inside a string fed to `new RegExp`),
	// since a bare mention is prose — or the member READ `.isGlobalAdmin` (dot
	// escaped or not). No dot ⇒ a fixture key. Global: one literal may pin several.
	return new RegExp(
		`\\b(${names.join('|')})(?:\\s|\\\\{1,2}s[*+?]?|[ ][*+?])*(?:\\\\)*\\(|((?:\\\\)?\\.isGlobalAdmin)\\b`,
		'g',
	);
}

/**
 * Local helpers whose parameters reach an assertion — `has(src, needle)` —
 * so a literal passed to them is a needle too. Two passes: a helper may call
 * another helper.
 */
function assertionHelpers(code: string): Set<string> {
	const helpers = new Set<string>();
	const declared: { name: string; params: string[]; body: string }[] = [];
	for (const match of code.matchAll(LOCAL_FUNCTION)) {
		const name = (match[1] ?? match[3]) as string;
		const params = ((match[2] ?? match[4]) as string)
			.split(',')
			.map((p) =>
				p
					.trim()
					.replace(/^\.\.\./, '')
					.replace(/[?:=].*$/s, '')
					.trim(),
			)
			.filter((p) => /^[A-Za-z_$][\w$]*$/.test(p));
		// The body: a brace block (balanced), or an arrow's expression to the `;`.
		const after = (match.index ?? 0) + match[0].length;
		const open = after + (/^\s*/.exec(code.slice(after))?.[0].length ?? 0);
		let body: string;
		if (code[open] === '{') {
			let depth = 0;
			let close = open;
			for (; close < code.length; close += 1) {
				if (code[close] === '{') depth += 1;
				else if (code[close] === '}') {
					depth -= 1;
					if (depth === 0) break;
				}
			}
			body = code.slice(open, close + 1);
		} else {
			const semi = code.indexOf(';', open);
			body = code.slice(open, semi === -1 ? undefined : semi);
		}
		declared.push({ name, params, body });
	}
	for (let pass = 0; pass < 2; pass += 1) {
		for (const { name, params, body } of declared) {
			if (helpers.has(name) || params.length === 0) continue;
			const needles = new Set<string>();
			for (const m of body.matchAll(ASSERTED_IDENTIFIER)) needles.add(m[2] as string);
			for (const m of body.matchAll(RECEIVER_IDENTIFIER)) needles.add(m[1] as string);
			for (const helper of helpers) {
				for (const arg of helperArguments(body, helper)) needles.add(arg);
			}
			if (params.some((param) => needles.has(param))) helpers.add(name);
		}
	}
	return helpers;
}

/** The identifier arguments (roots of member paths) of every call of a local helper. */
function helperArguments(code: string, helper: string): string[] {
	const names: string[] = [];
	for (const call of code.matchAll(new RegExp(`\\b${helper}\\s*\\(([^()]*)\\)`, 'g'))) {
		for (const arg of (call[1] as string).split(',')) {
			const root = /^\s*([A-Za-z_$][\w$]*)/.exec(arg)?.[1];
			if (root !== undefined) names.push(root);
		}
	}
	return names;
}

/** `helper(` — ending right before a literal argument (any position). */
function helperTail(helpers: Set<string>): RegExp | null {
	if (helpers.size === 0) return null;
	return new RegExp(`\\b(${[...helpers].join('|')})\\s*\\((?:[^()]*,)?\\s*$`);
}

/**
 * Which bindings are (transitively) the needle of an assertion, with the
 * method: an argument (root of a member path, so `PINS.gateB` marks `PINS`),
 * a `.test`/`.exec` receiver, a local helper's argument, or the iterable of a
 * `for…of` whose loop variable is one.
 */
function assertedBindings(code: string, helpers: Set<string>): Map<string, string> {
	const asserted = new Map<string, string>();
	// The first shape a binding is asserted through names the method (a binding
	// used both as an argument and as a receiver is still one needle).
	const mark = (name: string, method: string): void => {
		if (!asserted.has(name)) asserted.set(name, method);
	};
	for (const match of code.matchAll(ASSERTED_IDENTIFIER))
		mark(match[2] as string, match[1] as string);
	for (const match of code.matchAll(RECEIVER_IDENTIFIER))
		mark(match[1] as string, match[2] as string);
	for (const helper of helpers) {
		for (const arg of helperArguments(code, helper)) mark(arg, helper);
	}
	// `for (const needle of NEEDLES)`: the iterable reaches the assertion through
	// its loop variable. Two passes cover a nested loop.
	for (let pass = 0; pass < 2; pass += 1) {
		for (const match of code.matchAll(FOR_OF)) {
			const method = asserted.get(match[1] as string);
			if (method !== undefined) asserted.set(match[2] as string, method);
		}
	}
	return asserted;
}

/** The [start, end) code span of each asserted binding's initializer. */
function initializerSpans(
	code: string,
	asserted: Map<string, string>,
): { name: string; method: string; start: number; end: number }[] {
	const spans: { name: string; method: string; start: number; end: number }[] = [];
	for (const match of code.matchAll(BINDING)) {
		const name = match[1] as string;
		const method = asserted.get(name);
		if (method === undefined) continue;
		const start = (match.index ?? 0) + match[0].length;
		// The initializer runs to the next `;` in CODE (strings are blanked, so a
		// `;` inside the needle cannot end it early) or to the end of the file.
		const semi = code.indexOf(';', start);
		spans.push({ name, method, start, end: semi === -1 ? code.length : semi });
	}
	return spans;
}

/**
 * `name` is really imported: `import { …, name, … } from '…'` or the dynamic
 * `const { …, name, … } = await import('…')` — never a local declaration of
 * the same name.
 */
function importsName(source: string, name: string): boolean {
	const clean = withoutComments(source);
	const clauses = [
		...(clean.match(/\bimport\s*(?:type\s*)?\{[^}]*\}\s*from\s*['"][^'"]+['"]/g) ?? []),
		...(clean.match(/\{[^}]*\}\s*=\s*await\s+import\s*\(\s*['"][^'"]+['"]\s*\)/g) ?? []),
	];
	return clauses.some((clause) =>
		new RegExp(`[{,]\\s*(?:\\w+\\s+as\\s+)?${name}\\s*[,}]`).test(clause),
	);
}

/**
 * The behavioural leg a file carries FOR ONE SYMBOL, or null.
 *
 * In-file (`named: false` — the implicit cover every pin gets for free): a
 * function symbol needs a non-literal call of THAT symbol through a real
 * import of it; the role-flag member needs a principal-driven refusal. Nothing
 * else counts implicitly — that is the per-file alibi this census retired.
 *
 * As a NAMED twin (`named: true` — a human wrote the entry, the case name is
 * verified live, and the map is shrink-only): the same, plus a call of a
 * wrapper that DIRECTLY calls the symbol (driving `scopeIndexationGroups` with
 * a non-admin IS driving `scopeInverseReferenceHits`), plus a principal-driven
 * refusal for a function symbol (a door driven with a resolved non-admin
 * refuses THROUGH the symbol; the credited case says which door). A refusal is
 * `refusalOf`/`refusalOfSync`/`resolvePrincipal`, or a non-admin principal
 * literal together with an awaited rejection.
 */
export function legFor(
	source: string,
	symbol: string,
	symbols: AuthzSymbols,
	{ named }: { named: boolean },
): string | null {
	const code = codeOnly(source);
	const calls = (name: string): boolean =>
		new RegExp(`\\b${name}\\s*\\(`).test(code) && importsName(source, name);
	const refusals = REFUSAL_CALLS.filter((call) => new RegExp(`\\b${call}\\s*\\(`).test(code)).map(
		(call) => `${call}(`,
	);
	if (NON_ADMIN_LITERAL.test(code) && AWAITED_REJECTION.test(code)) {
		refusals.push('non-admin literal + rejects.toThrow(');
	}
	if (symbol === ROLE_FLAG_MEMBER) {
		return refusals.length > 0 ? refusals.join(', ') : null;
	}
	if (calls(symbol)) return `import + call of ${symbol}`;
	if (!named) return null;
	const viaWrapper = (symbols.callers[symbol] ?? []).find((wrapper) => calls(wrapper));
	if (viaWrapper !== undefined) return `import + call of ${viaWrapper} (calls ${symbol})`;
	return refusals.length > 0 ? refusals.join(', ') : null;
}

/**
 * Classify ONE test file. A site is a string/regex literal holding a call shape
 * of a symbol (or the role-flag member read) that is a NEEDLE: an argument of
 * an assertion-shaped method (any position, directly or through `new RegExp(`),
 * the receiver of `.test(`/`.exec(`, an argument of a local assertion helper,
 * or hoisted through a binding (constant, array, object; iterated or not) that
 * is one of those. One site per (literal, symbol). Legs are PER SYMBOL: a
 * non-literal call of the symbol through a real import for a function symbol;
 * a principal-driven refusal for `.isGlobalAdmin`.
 */
export function classifyAuthzFile(
	{ file, source }: SourceFile,
	symbols: AuthzSymbols,
): AuthzFileReport {
	const pattern = symbolPattern(symbols);
	const regions = lexRegions(source);
	const code = codeOnly(source);
	const helpers = assertionHelpers(code);
	const helperCall = helperTail(helpers);
	const spans = initializerSpans(code, assertedBindings(code, helpers));
	const sites: AuthzSite[] = [];
	for (const region of regions) {
		if (region.kind !== 'string' && region.kind !== 'regex') continue;
		const literal = source.slice(region.start, region.end);
		const hits = [...literal.matchAll(pattern)];
		if (hits.length === 0) continue;
		// Other literals are blanked in `code`, so the walk to the method cannot
		// be broken by a neighbouring string argument that holds parens.
		const prefix = code.slice(0, region.start);
		const suffix = code.slice(region.end);
		// Is the literal an argument of an assertion-shaped call (through `new RegExp(` or not)…
		let method: string | undefined = ASSERTION_METHOD_TAIL.exec(prefix)?.[1];
		// …the receiver of `.test(`/`.exec(` — a regex literal, or `new RegExp(…)`…
		if (method === undefined && region.kind === 'regex') {
			method = RECEIVER_SUFFIX.exec(suffix)?.[1];
		}
		if (method === undefined && NEW_REGEXP_PREFIX.test(prefix)) {
			method = NEW_REGEXP_RECEIVER_SUFFIX.exec(suffix)?.[1];
		}
		// …an argument of a local helper that asserts its parameter…
		if (method === undefined && helperCall !== null) method = helperCall.exec(prefix)?.[1];
		// …or inside the initializer of a binding that is any of those?
		const hoisted =
			method === undefined
				? spans.find((span) => region.start >= span.start && region.end <= span.end)
				: undefined;
		if (method === undefined && hoisted === undefined) continue;
		const seen = new Set<string>();
		for (const hit of hits) {
			const symbol = hit[1] ?? (hit[2] === undefined ? '' : ROLE_FLAG_MEMBER);
			if (seen.has(symbol)) continue;
			seen.add(symbol);
			sites.push({
				file,
				line: lineOf(source, region.start),
				symbol,
				method: (method ?? hoisted?.method) as string,
				...(hoisted === undefined ? {} : { via: hoisted.name }),
				text: literal.length > 120 ? `${literal.slice(0, 117)}...` : literal,
			});
		}
	}
	const legs: Record<string, string> = {};
	for (const site of sites) {
		if (site.symbol in legs) continue;
		const leg = legFor(source, site.symbol, symbols, { named: false });
		if (leg !== null) legs[site.symbol] = leg;
	}
	const uncovered = sites.filter((site) => !(site.symbol in legs));
	return { file, sites, legs, uncovered };
}

/** Every unit test file, classified (the census TOTAL). */
export function authzSubstringCensus(
	repoRoot: string,
	symbols: AuthzSymbols = deriveAuthzSymbols(repoRoot),
): { scanned: string[]; reports: AuthzFileReport[] } {
	const scanned: string[] = [];
	const reports: AuthzFileReport[] = [];
	for (const match of new Glob('**/*.test.ts').scanSync({ cwd: join(repoRoot, 'test/unit') })) {
		const file = relative(repoRoot, join(repoRoot, 'test/unit', match));
		scanned.push(file);
		const report = classifyAuthzFile(
			{ file, source: readFileSync(join(repoRoot, file), 'utf8') },
			symbols,
		);
		if (report.sites.length > 0) reports.push(report);
	}
	scanned.sort();
	reports.sort((a, b) => a.file.localeCompare(b.file));
	return { scanned, reports };
}

/** The files with at least one site whose symbol has no in-file leg. */
export function substringOnlyFiles(reports: AuthzFileReport[]): AuthzFileReport[] {
	return reports.filter((report) => report.uncovered.length > 0);
}
