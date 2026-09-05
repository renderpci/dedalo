/**
 * TRIPWIRE — every identifier the browser trees REFERENCE must resolve to
 * something: a binding in the file, an import, or a declared ambient global.
 * And when the thing it names is an export of another first-party browser
 * module, it must be IMPORTED — never picked up off the window.
 *
 * WHAT THIS COVERS, AND WHAT IT DOES NOT. `client_prototype_contract_tripwire`
 * guards a different defect with a similar blast radius: a prototype TARGET
 * that has no prototype (an arrow), which throws WHILE THE MODULE EVALUATES.
 * This gate is about the IDENTIFIER RESOLVING TO NOTHING, which can bite at
 * either time — at evaluation when it sits at module top level (DEAD-01:
 * `service_subtitles.prototype.edit = render_edit_service_subtitles.prototype.edit`,
 * a module that exists in no tree, so `get_instance('service_subtitles')`
 * answered null and both tool callers died on `.build()` of null), or at CALL
 * time when it sits inside a function body (DEAD-02: `project.activeLayer` on
 * the paper.js document object of an editor the component stopped using;
 * DEAD-04: `spinner.remove()` on a binding deleted years earlier; DEAD-07:
 * eleven `event_manager.*` calls that only worked because event_manager.js
 * publishes the singleton on `window` as a side effect of being loaded by
 * somebody else first). Neither gate subsumes the other and neither repeats
 * the other's scan.
 *
 * THE TWO LEGS.
 *
 *  (A) FIRST-PARTY EXPORT ⇒ IMPORT. If the unresolved name is a named export
 *      of any module in the browser corpus, the reference is a defect no
 *      matter what the file's `/*global …*\/` header says. A header entry is a
 *      promise about the PAGE environment; it cannot bless a module's own
 *      export, because reading that export off the window means the file works
 *      only when some other module has already been evaluated. That is exactly
 *      the DEAD-07 shape, and `component_portal/js/buttons.js` was the file
 *      whose header made it look legal.
 *
 *  (B) EVERYTHING ELSE ⇒ DECLARED. Any other unresolved name must be a
 *      standard web/JS global (`AMBIENT_GLOBALS`), a suite global inside the
 *      browser test suite, or an ENUMERATED entry of `DEDALO_RUNTIME_GLOBALS`
 *      with the reason it is not an import. That table is shrink-only in both
 *      directions: an entry nothing references any more is a failure, so a
 *      repair cannot leave its blessing behind for the next defect to reuse.
 *
 * WHAT IS READ AS A REFERENCE. Only two positions, deliberately: the OBJECT of
 * a member expression and the CALLEE of a call/new. Those are the positions
 * where an unresolved name throws, and they cannot be confused with a property
 * name or an object key. A bare `foo` passed as an argument is out of scope.
 *
 * HONEST LIMITS. Bindings are collected FILE-WIDE, not per scope: a name
 * declared in one function and referenced in another is treated as resolved.
 * That is the deliberate direction to be wrong in — this gate is about names
 * that resolve NOWHERE, and a scope-exact resolver would report shadowing
 * noise instead. Assignment through `window.x = …` is not tracked, so a page
 * global really injected by the server is declared, not inferred.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { browserSources } from '../helpers/browser_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Standard web platform + ECMAScript globals. Not a policy list: a platform. */
const AMBIENT_GLOBALS = new Set([
	// ECMAScript
	'globalThis',
	'Object',
	'Array',
	'Function',
	'String',
	'Number',
	'Boolean',
	'Symbol',
	'BigInt',
	'Math',
	'JSON',
	'Date',
	'RegExp',
	'Promise',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'WeakRef',
	'Proxy',
	'Reflect',
	'Intl',
	'Error',
	'TypeError',
	'RangeError',
	'SyntaxError',
	'ReferenceError',
	'EvalError',
	'URIError',
	'AggregateError',
	'ArrayBuffer',
	'DataView',
	'Int8Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
	'parseInt',
	'parseFloat',
	'isNaN',
	'isFinite',
	'encodeURI',
	'decodeURI',
	'encodeURIComponent',
	'decodeURIComponent',
	'structuredClone',
	'queueMicrotask',
	'arguments',
	// browser environment
	'window',
	'self',
	'top',
	'parent',
	'opener',
	'frames',
	'document',
	'navigator',
	'location',
	'history',
	'screen',
	'console',
	'crypto',
	'performance',
	'localStorage',
	'sessionStorage',
	'indexedDB',
	'IDBKeyRange',
	'caches',
	'customElements',
	'CSS',
	'speechSynthesis',
	'setTimeout',
	'clearTimeout',
	'setInterval',
	'clearInterval',
	'requestAnimationFrame',
	'cancelAnimationFrame',
	'requestIdleCallback',
	'cancelIdleCallback',
	'scheduler',
	'getComputedStyle',
	'matchMedia',
	'alert',
	'confirm',
	'prompt',
	'atob',
	'btoa',
	'fetch',
	'Headers',
	'Request',
	'Response',
	'FormData',
	'URL',
	'URLSearchParams',
	'Blob',
	'File',
	'FileReader',
	'XMLHttpRequest',
	'WebSocket',
	'EventSource',
	'AbortController',
	'AbortSignal',
	'Worker',
	'Notification',
	'MediaRecorder',
	'AudioContext',
	'SpeechSynthesisUtterance',
	'Image',
	'Audio',
	'Option',
	'ImageData',
	'OffscreenCanvas',
	'ClipboardItem',
	'DOMParser',
	'XMLSerializer',
	'XPathResult',
	'DOMException',
	'Node',
	'NodeFilter',
	'NodeList',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Text',
	'Range',
	'Selection',
	'DocumentFragment',
	'Event',
	'CustomEvent',
	'MouseEvent',
	'KeyboardEvent',
	'DragEvent',
	'MutationObserver',
	'ResizeObserver',
	'IntersectionObserver',
	'TextEncoder',
	'TextDecoder',
	'ReadableStream',
	'WritableStream',
	'TransformStream',
	'CompressionStream',
	'DecompressionStream',
]);

/**
 * Live only inside the browser suite's own directory: mocha + chai in the
 * pages, and the Node globals of the suite RUNNER that sits beside them
 * (puppeteer_runner.js is executed by node, not served to a browser).
 */
const SUITE_GLOBALS = new Set([
	'describe',
	'it',
	'before',
	'after',
	'beforeEach',
	'afterEach',
	'xdescribe',
	'xit',
	'specify',
	'context',
	'mocha',
	'chai',
	'assert',
	'process',
	'require',
	'module',
	'exports',
	'__dirname',
	'__filename',
]);

/** A file of the browser suite, where SUITE_GLOBALS are live. */
const isSuiteFile = (path: string): boolean => path.includes('/test/client/');

/**
 * ENUMERATED, SHRINK-ONLY. Names that are genuinely not module exports: the
 * server-rendered page injects them, or a vendored library publishes them.
 * Each entry says which. An entry that stops being referenced FAILS — a
 * blessing outlives its subject only by accident.
 */
const DEDALO_RUNTIME_GLOBALS: Record<string, string> = {
	page_globals:
		'server-injected: page.js emits the <script> that defines it before any module loads',
	get_label: 'server-injected: the label catalog is written into the page as a global object',
	DEDALO_API_URL: 'server-injected build constant, emitted with the page',
	DD_TIPOS: 'server-injected ontology-tipo constant map, emitted with the page',
	Tooltip:
		'vendored codex-tooltip (client/dedalo/lib/codex-tooltip), a script that assigns a global; ui.js imports it for the side effect',
	turf: 'vendored @turf/turf, loaded at runtime by component_geolocation.load_libs()',
	iro: 'vendored iro.js colour picker, loaded at runtime by component_geolocation.load_libs()',
	QRCode:
		'vendored EasyQRCodeJS (client/dedalo/lib/qrcode), loaded by <script> and by the QR worker importScripts',
};

/**
 * ENUMERATED, SHRINK-ONLY. Leg (A) exemptions: a first-party export a file may
 * legitimately reach without importing. There are none — a bare identifier
 * always resolves in the reader's OWN realm, so even a genuine cross-frame
 * consumer has to say `parent.window.<name>` and is not a bare reference at
 * all. Kept as a declared, empty, reasoned door rather than an implicit one.
 */
const CROSS_REALM_EXEMPTIONS: { file: string; identifier: string; reason: string }[] = [];

// ────────────────────────────────────────────────────────────────────────────
// The analyser. Pure: source in, unresolved references out.
// ────────────────────────────────────────────────────────────────────────────

type Reference = { name: string; line: number };

/** A Babel AST node, read structurally: this gate never builds one. */
type BabelNode = { type: string; [key: string]: unknown };
type BabelAst = { program: BabelNode; comments?: { value: string }[] };

const asNode = (value: unknown): BabelNode | undefined =>
	value && typeof value === 'object' && typeof (value as BabelNode).type === 'string'
		? (value as BabelNode)
		: undefined;
const asNodes = (value: unknown): BabelNode[] =>
	Array.isArray(value) ? (value as BabelNode[]) : [];
const nameOf = (value: unknown): string | undefined =>
	(value as { name?: string } | undefined)?.name;
const lineOf = (node: BabelNode): number => (node.loc as { start: { line: number } }).start.line;

function walk(node: unknown, visit: (n: BabelNode) => void): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	const n = asNode(node);
	if (!n) return;
	visit(n);
	for (const key of Object.keys(n)) {
		if (
			key === 'loc' ||
			key === 'leadingComments' ||
			key === 'trailingComments' ||
			key === 'innerComments'
		)
			continue;
		walk(n[key], visit);
	}
}

/** Every name a binding pattern introduces. */
function patternNames(node: unknown, out: Set<string>): void {
	const n = asNode(node);
	if (!n) return;
	switch (n.type) {
		case 'Identifier': {
			const name = nameOf(n);
			if (name) out.add(name);
			return;
		}
		case 'ObjectPattern':
			for (const property of asNodes(n.properties)) {
				patternNames(property.type === 'ObjectProperty' ? property.value : property.argument, out);
			}
			return;
		case 'ArrayPattern':
			for (const element of asNodes(n.elements)) patternNames(element, out);
			return;
		case 'AssignmentPattern':
			patternNames(n.left, out);
			return;
		case 'RestElement':
			patternNames(n.argument, out);
			return;
		default:
			return;
	}
}

/**
 * Every name BOUND anywhere in the file: imports, declarators, function and
 * class names, EVERY parameter list (class and object methods included — the
 * omission of those is what produced this gate's only false positives while it
 * was being built), catch parameters, labels.
 */
function collectBindings(ast: BabelAst): Set<string> {
	const bindings = new Set<string>();
	walk(ast.program, (n) => {
		switch (n.type) {
			case 'ImportDeclaration':
				for (const specifier of asNodes(n.specifiers)) {
					const local = nameOf(specifier.local);
					if (local) bindings.add(local);
				}
				break;
			case 'VariableDeclarator':
				patternNames(n.id, bindings);
				break;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
			case 'ClassMethod':
			case 'ClassPrivateMethod':
			case 'ObjectMethod':
				patternNames(n.id, bindings);
				for (const param of asNodes(n.params)) patternNames(param, bindings);
				break;
			case 'ClassDeclaration':
			case 'ClassExpression':
				patternNames(n.id, bindings);
				break;
			case 'CatchClause':
				patternNames(n.param, bindings);
				break;
			case 'LabeledStatement': {
				const label = nameOf(n.label);
				if (label) bindings.add(label);
				break;
			}
		}
	});
	return bindings;
}

/** The names a file's own `/*global a, b *\/` header promises. */
function headerGlobals(ast: BabelAst): Set<string> {
	const declared = new Set<string>();
	for (const comment of ast.comments ?? []) {
		const match = /^\s*global\s+([^*]*)$/.exec(comment.value);
		if (!match) continue;
		for (const raw of (match[1] ?? '').split(',')) {
			const name = (raw.trim().split(':')[0] ?? '').trim();
			if (name) declared.add(name);
		}
	}
	return declared;
}

/** Every named export of a module (`export const/function/class`, `export {…}`). */
function collectExportNames(ast: BabelAst): Set<string> {
	const names = new Set<string>();
	walk(ast.program, (n) => {
		if (n.type !== 'ExportNamedDeclaration') return;
		for (const specifier of asNodes(n.specifiers)) {
			const exported = asNode(specifier.exported);
			if (exported?.type === 'Identifier') patternNames(exported, names);
		}
		const declaration = asNode(n.declaration);
		if (!declaration) return;
		if (declaration.type === 'VariableDeclaration') {
			for (const declarator of asNodes(declaration.declarations))
				patternNames(declarator.id, names);
		} else {
			patternNames(declaration.id, names);
		}
	});
	return names;
}

const parseBrowserModule = (source: string): BabelAst =>
	parse(source, { sourceType: 'module' }) as unknown as BabelAst;

/**
 * The identifier a node REFERENCES, or nothing. Two positions only: the object
 * of a member expression and the callee of a call/new — the positions where an
 * unresolved name throws, and the ones that can never be a property name or an
 * object key.
 */
function referencedIdentifier(n: BabelNode): BabelNode | undefined {
	if (n.type === 'MemberExpression') {
		const object = asNode(n.object);
		return object?.type === 'Identifier' ? object : undefined;
	}
	if (n.type === 'CallExpression' || n.type === 'NewExpression') {
		const callee = asNode(n.callee);
		return callee?.type === 'Identifier' ? callee : undefined;
	}
	return undefined;
}

/**
 * The unresolved references of one file, plus how many reference positions
 * were examined (the denominator the corpus floor is taken over).
 */
function unresolvedReferences(
	source: string,
	ambient: Set<string>,
): { unresolved: Reference[]; examined: number } {
	const ast = parseBrowserModule(source);
	const bindings = collectBindings(ast);
	const declared = headerGlobals(ast);

	const unresolved: Reference[] = [];
	const seen = new Set<string>();
	let examined = 0;

	walk(ast.program, (n) => {
		const identifier = referencedIdentifier(n);
		if (!identifier) return;

		examined++;
		const name = nameOf(identifier) ?? '';
		if (bindings.has(name) || declared.has(name) || ambient.has(name)) return;

		const key = `${name}:${lineOf(identifier)}`;
		if (seen.has(key)) return;
		seen.add(key);
		unresolved.push({ name, line: lineOf(identifier) });
	});

	return { unresolved, examined };
}

/**
 * Leg (A) variant: a first-party export is unresolved EVEN WHEN the header
 * blesses it, so the header set is withheld for those names only.
 */
function unimportedFirstPartyExports(source: string, exports: Set<string>): Reference[] {
	const ast = parseBrowserModule(source);
	const bindings = collectBindings(ast);

	const hits: Reference[] = [];
	const seen = new Set<string>();
	walk(ast.program, (n) => {
		const identifier = referencedIdentifier(n);
		if (!identifier) return;

		const name = nameOf(identifier) ?? '';
		if (bindings.has(name) || !exports.has(name)) return;

		const key = `${name}:${lineOf(identifier)}`;
		if (seen.has(key)) return;
		seen.add(key);
		hits.push({ name, line: lineOf(identifier) });
	});
	return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// The census
// ────────────────────────────────────────────────────────────────────────────

const CORPUS = browserSources().map((path) => {
	const source = readFileSync(join(REPO_ROOT, path), 'utf8');
	return { path, source, ast: parseBrowserModule(source) };
});

/** Every named export of the whole browser corpus — derived, never listed. */
const FIRST_PARTY_EXPORTS = new Set<string>();
for (const file of CORPUS) {
	for (const name of collectExportNames(file.ast)) FIRST_PARTY_EXPORTS.add(name);
}

const ambientFor = (path: string): Set<string> =>
	isSuiteFile(path)
		? new Set([...AMBIENT_GLOBALS, ...SUITE_GLOBALS, ...Object.keys(DEDALO_RUNTIME_GLOBALS)])
		: new Set([...AMBIENT_GLOBALS, ...Object.keys(DEDALO_RUNTIME_GLOBALS)]);

describe('client dead-reference tripwire', () => {
	test('the census is the whole browser corpus and every file parses', () => {
		expect(CORPUS.length).toBeGreaterThan(700);
		let examined = 0;
		for (const file of CORPUS)
			examined += unresolvedReferences(file.source, ambientFor(file.path)).examined;
		expect(examined).toBeGreaterThan(20000);
	});

	test('(A) a first-party module export is IMPORTED where it is referenced, never taken off the window', () => {
		const exempt = new Set(CROSS_REALM_EXEMPTIONS.map((e) => `${e.file}:${e.identifier}`));
		const offenders: string[] = [];
		let scanned = 0;
		for (const file of CORPUS) {
			scanned++;
			for (const hit of unimportedFirstPartyExports(file.source, FIRST_PARTY_EXPORTS)) {
				if (exempt.has(`${file.path}:${hit.name}`)) continue;
				offenders.push(
					`${file.path}:${hit.line} — ${hit.name} is exported by a browser module but is not imported here`,
				);
			}
		}
		expect(scanned).toBeGreaterThan(700);
		expect(offenders).toEqual([]);
	});

	test('(B) every other referenced identifier resolves to a binding or a declared global', () => {
		const offenders: string[] = [];
		let scanned = 0;
		for (const file of CORPUS) {
			scanned++;
			for (const hit of unresolvedReferences(file.source, ambientFor(file.path)).unresolved) {
				offenders.push(`${file.path}:${hit.line} — ${hit.name} resolves to nothing`);
			}
		}
		expect(scanned).toBeGreaterThan(700);
		expect(offenders).toEqual([]);
	});

	test('the runtime-global table is shrink-only: every entry is still referenced', () => {
		const referenced = new Set<string>();
		for (const file of CORPUS) {
			const bare = isSuiteFile(file.path)
				? new Set([...AMBIENT_GLOBALS, ...SUITE_GLOBALS])
				: AMBIENT_GLOBALS;
			for (const hit of unresolvedReferences(file.source, bare).unresolved)
				referenced.add(hit.name);
		}
		const stale = Object.keys(DEDALO_RUNTIME_GLOBALS).filter((name) => !referenced.has(name));
		expect(referenced.size).toBeGreaterThan(0);
		expect(stale).toEqual([]);
	});

	test('every runtime-global entry carries a reason, and none of them is a module export', () => {
		for (const [name, reason] of Object.entries(DEDALO_RUNTIME_GLOBALS)) {
			expect(reason.length, `${name} needs a reason`).toBeGreaterThan(20);
			expect(
				FIRST_PARTY_EXPORTS.has(name),
				`${name} IS a module export — import it, do not bless it`,
			).toBe(false);
		}
		for (const entry of CROSS_REALM_EXEMPTIONS) expect(entry.reason.length).toBeGreaterThan(20);
	});

	test('POSITIVE CONTROL — the analyser reports the three shapes this row repaired', () => {
		// DEAD-01: a module-top-level reference to a module that does not exist.
		const dead_01 = `const service = function() {}\nservice.prototype.edit = render_edit_missing.prototype.edit\n`;
		expect(unresolvedReferences(dead_01, AMBIENT_GLOBALS).unresolved.map((h) => h.name)).toEqual([
			'render_edit_missing',
		]);

		// DEAD-02: a reference inside a function body — throws when CALLED.
		const dead_02 = `export const f = function() {\n\treturn project.activeLayer.exportJSON()\n}\n`;
		expect(unresolvedReferences(dead_02, AMBIENT_GLOBALS).unresolved.map((h) => h.name)).toEqual([
			'project',
		]);

		// DEAD-07: a first-party export read off the window, blessed by a header.
		const dead_07 = `/*global event_manager*/\nexport const g = () => { event_manager.publish('x') }\n`;
		expect(unresolvedReferences(dead_07, AMBIENT_GLOBALS).unresolved).toEqual([]);
		expect(
			unimportedFirstPartyExports(dead_07, new Set(['event_manager'])).map((h) => h.name),
		).toEqual(['event_manager']);
	});

	test('NEGATIVE CONTROL — bindings the collector must see are not reported', () => {
		const clean = [
			`import {a} from './a.js'\na.run()`,
			`function f(plan, {report}, [x], ...rest) { plan.go(); report.go(); x.go(); rest.go() }`,
			`const o = { m(instance) { instance.go() } }`,
			`class C { m(node) { node.go() } }`,
			`try { null } catch (e) { e.go() }`,
			`for (const item of []) item.go()`,
			`export const h = (query = {}) => query.go()`,
		].join('\n');
		expect(unresolvedReferences(clean, AMBIENT_GLOBALS).unresolved).toEqual([]);
	});
});
