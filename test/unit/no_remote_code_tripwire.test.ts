/**
 * NO-REMOTE-CODE TRIPWIRE (DEC-12).
 *
 * The client and the tools may never load EXECUTABLE CODE from a third-party
 * host. Every library comes from the client-lib registry
 * (src/core/client_libs/registry.ts → /dedalo/lib/…) and every AI model from the
 * install's own model store (/dedalo/ai_models/…).
 *
 * WHY THIS EXISTS. Until 2026-07-28 the in-browser speech recogniser imported its
 * runtime straight from a CDN and streamed its model weights from a public hub.
 * The tool's whole promise is that an interview holding personal data is
 * transcribed locally — and that promise was quietly broken twice over: the
 * feature could not work at all in an air-gapped archive, and where there was
 * internet it announced to two third parties exactly when a record was being
 * worked on. A regression here is invisible in the browser (it still works, on a
 * developer's connected laptop) which is precisely why it needs a gate.
 *
 * WHAT IS CHECKED: statements that LOAD CODE — static and dynamic `import`,
 * `importScripts`, `new Worker(…)`, `<script src>`, a script element's `.src`
 * or `setAttribute('src', …)`, an `<script type="importmap">` binding, and a
 * streaming `WebAssembly.instantiateStreaming(fetch(…))`. "Remote" is any
 * absolute `http(s)://` OR PROTOCOL-RELATIVE `//host/…` target, and any other
 * scheme except a runtime builtin (`node:`, `bun:`) — the reviewer's
 * 2026-09-04 probe showed `<script src="//cdn…">`, the canonical CDN include,
 * passing an `https?://` anchor. Data URLs are a different question (a map
 * tile server is a legitimate remote address) and are out of scope on purpose:
 * this gate is about who gets to run code in the user's browser.
 *
 * THREE LEGS (GATE-54, 2026-09-04 — the third and the roots are new):
 *
 *   1. LITERAL — a loading construct whose target is an absolute http(s) string.
 *      The original gate, kept as the cheap first pass.
 *
 *   2. CONFIG-SHAPED — a loading construct whose target is NOT a string literal:
 *      `import(x)`, `new Worker(expr)`, `importScripts(expr)`, `script.src =
 *      expr`, a template's `<script src="${…}">`. This is the RC-01 shape (the
 *      URL assembled from a constant, a config value or a server field), and it
 *      is what the literal leg could never see. Every such target is RESOLVED
 *      against a SAME-ORIGIN GRAMMAR: a relative or root-relative literal; a
 *      template or concatenation built on `DEDALO_ROOT_WEB` / `DEDALO_CORE_URL`
 *      (the install's own root, emitted by the server) or on `''`; `new
 *      URL(<relative>, import.meta.url | self.location | document.baseURI)`; a
 *      conditional or `||` whose every arm is same-origin; a Node `join(…)` /
 *      `resolve(…)` (a filesystem path on the server, not a URL); and an
 *      identifier that a SINGLE-HOP assignment in the same file binds to any of
 *      those (`const url = base + '/lib/d3/…'`, `const base = DEDALO_ROOT_WEB`).
 *      A target that resolves to an absolute http(s) literal — the "config
 *      constant" shape, `const CDN = 'https://…'; import(CDN)` — is RED, no
 *      exception possible. A target the grammar cannot decide (a server field, a
 *      function parameter) is RED unless it is on `ALLOWLIST`: an ENUMERATED,
 *      shrink-only list where each site names its file, the exact target text,
 *      the reason, and at least one `verify` clause this gate RE-PROVES every
 *      run — the emitter of that field in src/ refusing non-root-relative URLs,
 *      a registry scanned for absolute paths — so the allowlist is a set of
 *      re-checked facts, not a set of names.
 *
 *   3. LIBRARY DEFAULTS — the loads that happen inside a library unless told
 *      otherwise: transformers.js's onnxruntime WASM (must pin `wasmPaths`) and
 *      its model host (must be THIS install's model store, `/dedalo/ai_models/`
 *      — never the hub, never a directory of the code tree), the 3D viewer's
 *      environment presets (a DATA fetch, but one that phones home).
 *
 * ROOTS. `client/dedalo`, `tools`, `src` since W1-02, plus `vendor` and
 * `publication` since GATE-54: a vendored bundle that phones a CDN for a chunk,
 * or a swagger page that loads its bundle from unpkg, is a remote code load
 * wherever it lives. The walk is FLOORED, so a lost root is a red rather than a
 * green over nothing.
 *
 * HONEST LIMITS. The resolver is lexical and single-hop by design: it reads one
 * `const x = …` binding in the same file, never a call's return or a value set on
 * another line. Anything past that is "undecided" and must be allowlisted with a
 * verify clause — the gate errs toward paperwork, never toward a silent pass. It
 * cannot see a target built at runtime from a server field whose emitter is not
 * covered by a verify clause; the allowlist's clauses are that coverage, and each
 * is written next to the site it covers.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { libRootRelative, readManifest } from '../../scripts/vendor_verify.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = resolve(import.meta.dir, '../..');
// Widened 2026-07-28 (W1-02): src/ + .ts are scanned too — a remote code load
// is a remote code load wherever it lives, and the AI serving path is TS.
// Widened 2026-09-04 (GATE-54): vendor/ and publication/ — the committed bundles
// and the isolated publication subsystem were the two trees outside the scan.
const SCAN_ROOTS = ['client/dedalo', 'publication', 'src', 'tools', 'vendor'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.ts']);

/**
 * The ONE spelling of "models from this install": transformers.js `remoteHost`
 * set to the engine's model store on this origin (an `options.model_host ||`
 * default is the store too).
 */
const MODEL_STORE_HOST =
	/\bremoteHost\s*=\s*new\s+URL\(\s*(?:[\w.]+\s*\|\|\s*)?['"]\/dedalo\/ai_models\/['"]\s*,\s*self\.location\.origin\s*\)/;

/** The walk must see at least this many files, or a root went missing. 1766 on 2026-09-04. */
const WALK_FLOOR = 1200;

/**
 * Code-loading statements pointing at an absolute http(s) URL. Each pattern is
 * anchored on the loading construct, never on the bare URL, so ordinary remote
 * DATA references (tile servers, documentation links) are untouched.
 */
const REMOTE_CODE_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
	{ name: 'static import', pattern: /\bimport\s[^;]*?from\s*['"`](?:https?:)?\/\/[^'"`]+['"`]/g },
	{ name: 'bare import', pattern: /\bimport\s*['"`](?:https?:)?\/\/[^'"`]+['"`]/g },
	{ name: 'dynamic import', pattern: /\bimport\s*\(\s*['"`](?:https?:)?\/\/[^'"`]+['"`]/g },
	{ name: 'importScripts', pattern: /\bimportScripts\s*\(\s*['"`](?:https?:)?\/\/[^'"`]+['"`]/g },
	{
		name: 'worker',
		pattern: /\bnew\s+(?:Shared)?Worker\s*\(\s*['"`](?:https?:)?\/\/[^'"`]+['"`]/g,
	},
	{ name: 'script src', pattern: /<script[^>]+src\s*=\s*['"](?:https?:)?\/\/[^'"]+['"]/g },
	// A module specifier map: `<script type="importmap">{"imports":{"x":"https://…"}}`
	// binds a bare name to a remote module for every import in the page.
	{
		name: 'importmap',
		pattern: /<script[^>]*type\s*=\s*['"]importmap['"][^>]*>[^<]*['"](?:https?:)?\/\/[^'"]+['"]/g,
	},
	// Streaming WebAssembly compilation from a remote fetch: executable code,
	// not data (the RC-01 class — the runtime's own WASM glue).
	{
		name: 'wasm streaming',
		pattern:
			/\bWebAssembly\.(?:instantiate|compile)Streaming\s*\(\s*fetch\s*\(\s*['"`](?:https?:)?\/\/[^'"`]+['"`]/g,
	},
];

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.git') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full, out);
			continue;
		}
		if (SCAN_EXTENSIONS.has(extname(full).toLowerCase())) out.push(full);
	}
	return out;
}

function scanFiles(): string[] {
	const files: string[] = [];
	for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
	return files.sort();
}

/** Bundles are big; the walk + scan is ~7 s. Each test that runs it says so. */
const SCAN_TIMEOUT_MS = 60_000;

/** The leg-2 site scan over the whole tree, computed once per run (three tests read it). */
let sitesMemo: LoaderSite[] | null = null;
function allLoaderSites(): LoaderSite[] {
	if (sitesMemo === null) {
		const sites: LoaderSite[] = [];
		for (const file of scanFiles()) {
			sites.push(...loaderSitesIn(relative(REPO_ROOT, file), readFileSync(file, 'utf8')));
		}
		sitesMemo = sites;
	}
	return sitesMemo;
}

/* ── leg 2: the config-shaped resolver ─────────────────────────────────────── */

/**
 * A loading construct whose TARGET is an expression. `capture` is the group that
 * holds the target; `receiver` (script.src only) the group naming the element.
 */
const LOADER_SITES: readonly { name: string; pattern: RegExp }[] = [
	{ name: 'dynamic import', pattern: /\bimport\s*\(\s*([^()]*(?:\([^()]*\)[^()]*)*?)\s*\)/g },
	{
		name: 'worker',
		pattern: /\bnew\s+(?:Shared)?Worker\s*\(\s*([^,()]*(?:\([^()]*\)[^,()]*)*?)\s*[,)]/g,
	},
	{ name: 'importScripts', pattern: /\bimportScripts\s*\(\s*([^()]*(?:\([^()]*\)[^()]*)*?)\s*\)/g },
	{ name: 'script.src', pattern: /\b(\w+)\.src\s*=\s*([^;\n]+)/g },
	{
		name: 'script.setAttribute',
		// The attribute name is read from the string-KEPT text (discovery runs on
		// the blanked text, where it is spaces): see loaderSitesIn.
		pattern:
			/\b(\w+)\.setAttribute\s*\(\s*['"][^'"]*['"]\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*?)\s*\)/g,
	},
	{
		name: 'wasm streaming',
		pattern:
			/\bWebAssembly\.(?:instantiate|compile)Streaming\s*\(\s*fetch\s*\(\s*([^,()]*(?:\([^()]*\)[^,()]*)*?)\s*[,)]/g,
	},
	{
		name: 'template script src',
		pattern: /<script[^>]*\ssrc\s*=\s*["']?((?:\$\{[^}]*\}|<\?[^>]*\?>)[^"'\s>]*)/g,
	},
];

/** Same-origin bases the server emits into the page, and the empty base. */
const SAME_ORIGIN_BASES = new Set(['DEDALO_ROOT_WEB', 'DEDALO_CORE_URL', "''", '""']);

/** `new URL(x, <base>)` bases that are this document / this module. */
const URL_BASE_PATTERN =
	/^(import\.meta\.url|self\.location(\.\w+)?|window\.location(\.\w+)?|location(\.\w+)?|document\.baseURI)$/;

type Verdict = 'same-origin' | 'remote' | 'undecided';

/** Split `expr` on a top-level operator token (outside brackets and quotes). */
function splitTopLevel(expr: string, operator: string): string[] | null {
	const parts: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let start = 0;
	for (let i = 0; i < expr.length; i++) {
		const char = expr[i] as string;
		if (quote !== null) {
			if (char === '\\') i++;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') depth++;
		else if (char === ')' || char === ']' || char === '}') depth--;
		else if (depth === 0 && expr.startsWith(operator, i)) {
			// `+` must not be `++`, `?` must not be `?.` / `??`, `||` is two chars.
			const before = expr[i - 1] ?? '';
			const after = expr[i + operator.length] ?? '';
			if (operator === '+' && (before === '+' || after === '+')) continue;
			if (operator === '?' && (after === '.' || after === '?' || before === '?')) continue;
			if (operator === ':' && (before === '?' || after === '/')) continue;
			parts.push(expr.slice(start, i));
			start = i + operator.length;
			i += operator.length - 1;
		}
	}
	if (parts.length === 0) return null;
	parts.push(expr.slice(start));
	return parts;
}

function stripParens(expr: string): string {
	let text = expr.trim();
	while (text.startsWith('(') && text.endsWith(')')) {
		// Only when the outer parens match each other.
		let depth = 0;
		let matched = true;
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '(') depth++;
			else if (text[i] === ')') depth--;
			if (depth === 0 && i < text.length - 1) {
				matched = false;
				break;
			}
		}
		if (!matched) break;
		text = text.slice(1, -1).trim();
	}
	return text;
}

/** The verdict of a bare string literal's CONTENT. */
function literalVerdict(value: string): Verdict {
	if (/^https?:\/\//i.test(value) || value.startsWith('//')) return 'remote';
	// A runtime builtin (`node:fs`, `bun:sqlite`) is the process itself, not a load.
	if (/^(node|bun):/i.test(value)) return 'same-origin';
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return 'remote'; // any other scheme
	return 'same-origin';
}

/**
 * Resolve a loader target expression to a verdict. `source` is the file's
 * comment-stripped text, used for the single-hop binding lookup.
 */
function resolveTarget(rawExpr: string, source: string, depth = 0, at = source.length): Verdict {
	// `.href` / `.toString()` on a URL object is the same URL.
	const expr = stripParens(rawExpr).replace(/\.(href|toString\(\))$/, '');
	if (expr === '' || depth > 4) return 'undecided';

	// A template BODY (the `<script src="${…}…">` capture has no backticks).
	if (expr.startsWith('${')) return resolveTarget(`\`${expr}\``, source, depth + 1, at);

	// A plain string literal.
	const literal = /^(['"])(.*)\1$/s.exec(expr);
	if (literal !== null) return literalVerdict(literal[2] as string);

	// A template literal: the FIRST segment decides. `${base}/x` defers to `base`.
	const template = /^`(.*)`$/s.exec(expr);
	if (template !== null) {
		const body = template[1] as string;
		if (/https?:\/\//i.test(body.replace(/\$\{[^}]*\}/g, ''))) return 'remote';
		const lead = /^\$\{([^}]*)\}/.exec(body);
		if (lead !== null) return resolveTarget(lead[1] as string, source, depth + 1, at);
		return literalVerdict(body);
	}

	// `new URL(<rel>, <this document / module>)`.
	const url = /^new\s+URL\s*\((.*)\)$/s.exec(expr);
	if (url !== null) {
		const args = splitTopLevel(url[1] as string, ',') ?? [url[1] as string];
		const target = resolveTarget(args[0] as string, source, depth + 1, at);
		const base = (args[1] ?? '').trim();
		if (target === 'remote') return 'remote';
		if (args.length === 2 && URL_BASE_PATTERN.test(base) && target === 'same-origin') {
			return 'same-origin';
		}
		return 'undecided';
	}

	// A Node filesystem path (server-side dynamic import) — not a URL at all.
	if (/^(join|resolve|realpathSync|fileURLToPath|pathToFileURL)\s*\(/.test(expr)) {
		return 'same-origin';
	}

	// `cond ? a : b` — every arm must be same-origin.
	const ternary = splitTopLevel(expr, '?');
	if (ternary !== null && ternary.length === 2) {
		const arms = splitTopLevel(ternary[1] as string, ':');
		if (arms !== null && arms.length === 2) {
			return worst(
				resolveTarget(arms[0] as string, source, depth + 1, at),
				resolveTarget(arms[1] as string, source, depth + 1, at),
			);
		}
	}
	// `a || b` — every arm must be same-origin.
	const either = splitTopLevel(expr, '||');
	if (either !== null) {
		return either
			.map((arm) => resolveTarget(arm, source, depth + 1, at))
			.reduce<Verdict>((acc, verdict) => worst(acc, verdict), 'same-origin');
	}
	// `a + b + …` — the FIRST non-empty operand is the origin and decides; the rest
	// are path pieces, which may be anything except a literal that smuggles a host
	// (`'//cdn…'`, `'https://…'`). An empty-string base defers to the next operand,
	// so `'' + remote_url` is decided by `remote_url`, not by the ''.
	const concat = splitTopLevel(expr, '+');
	if (concat !== null) {
		const operands = concat.map((operand) => stripParens(operand)).filter((o) => o !== '');
		const first = operands.find((operand) => operand !== "''" && operand !== '""');
		if (first === undefined) return 'same-origin';
		const head = resolveTarget(first, source, depth + 1, at);
		if (head !== 'same-origin') return head;
		for (const rest of operands.slice(operands.indexOf(first) + 1)) {
			const piece = /^(['"`])(.*)\1$/s.exec(rest);
			if (piece !== null && /(^|[^:])\/\/|https?:\/\//i.test(piece[2] as string)) return 'remote';
		}
		return 'same-origin';
	}
	// `typeof X !== 'undefined' && X` — the guarded-global idiom; the value is X.
	const guarded = /^typeof\s+(\w+)\s*!==?\s*['"]undefined['"]\s*&&\s*(\w+)$/.exec(expr);
	if (guarded !== null && guarded[1] === guarded[2]) {
		return resolveTarget(guarded[2] as string, source, depth + 1, at);
	}

	// The install's own root, emitted by the server; or the empty base.
	if (SAME_ORIGIN_BASES.has(expr)) return 'same-origin';

	// An identifier: ONE hop to its binding in this file.
	if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
		// The NEAREST binding before the site (a file may bind `url` in several
		// functions); the first one after it when none precedes.
		const binding = new RegExp(
			`\\b(?:const|let|var)\\s+${expr}\\s*=\\s*([^\\n;]+(?:\\n\\s*[?:|&+][^\\n;]+)*)`,
			'g',
		);
		let chosen: RegExpExecArray | null = null;
		let found: RegExpExecArray | null = binding.exec(source);
		while (found !== null) {
			if (found.index < at || chosen === null) chosen = found;
			if (found.index >= at) break;
			found = binding.exec(source);
		}
		if (chosen !== null) {
			return resolveTarget(
				(chosen[1] as string).replace(/\s*\n\s*/g, ' '),
				source,
				depth + 1,
				chosen.index,
			);
		}
	}
	return 'undecided';
}

function worst(a: Verdict, b: Verdict): Verdict {
	if (a === 'remote' || b === 'remote') return 'remote';
	if (a === 'undecided' || b === 'undecided') return 'undecided';
	return 'same-origin';
}

/** One site the resolver found. */
interface LoaderSite {
	file: string;
	name: string;
	target: string;
	verdict: Verdict;
}

/** A line longer than this is a minifier's: the file is a bundle, not source. */
const BUNDLE_LINE_LENGTH = 1000;

function hasBundleLine(text: string): boolean {
	let start = 0;
	for (let i = 0; i <= text.length; i++) {
		if (i === text.length || text.charCodeAt(i) === 10) {
			if (i - start > BUNDLE_LINE_LENGTH) return true;
			start = i + 1;
		}
	}
	return false;
}

/** Every non-literal loader site in one file. */
function loaderSitesIn(file: string, original: string): LoaderSite[] {
	// Sites are DISCOVERED in the string-blanked text (so a message that says
	// "import (x)" is not a site) and the target is READ from the same offsets of
	// the string-kept text — the two strippings are offset-identical by construction.
	// A minified bundle skips the blanking: the shared scanner's string-blanking
	// walk is not linear on a 1 MB line, and a bundle has no prose to blank.
	const kept = stripComments(original);
	const blanked = hasBundleLine(original) ? kept : stripComments(original, { blankStrings: true });
	const discoveryText = kept.length === blanked.length ? blanked : kept;
	const out: LoaderSite[] = [];
	for (const { name, pattern } of LOADER_SITES) {
		// An HTML `<script src>` inside a template string IS string content, so the
		// blanked text cannot show it: that one pattern reads the kept text.
		const haystack = name === 'template script src' ? kept : discoveryText;
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null = pattern.exec(haystack);
		while (match !== null) {
			const isElementSrc = name === 'script.src' || name === 'script.setAttribute';
			const group = isElementSrc ? 2 : 1;
			const start = match.index + (match[0] as string).indexOf(match[group] as string);
			const target = kept.slice(start, start + (match[group] as string).length).trim();
			if (
				name === 'script.setAttribute' &&
				!/^\w+\.setAttribute\s*\(\s*['"]src['"]/.test(kept.slice(match.index, match.index + 64))
			) {
				// setAttribute of something other than `src`: not a load.
				match = pattern.exec(haystack);
				continue;
			}
			if (isElementSrc) {
				// Only a SCRIPT element's src loads code: the receiver must be created
				// as one in this file, or be named as one.
				const receiver = match[1] as string;
				const created = new RegExp(
					`\\b${receiver}\\s*=\\s*document\\.createElement\\(\\s*['"]script['"]`,
				);
				if (!created.test(kept) && !/script/i.test(receiver)) {
					match = pattern.exec(haystack);
					continue;
				}
			}
			// A SAME-ORIGIN bare literal target is not a site: nothing to resolve.
			// A REMOTE literal (`import('//cdn…')`, an `http:` string) is judged here
			// as well as by leg 1 — two legs, one verdict, so neither pattern set's
			// URL grammar is the only thing between a CDN include and a green run
			// (the reviewer's 2026-09-04 probe: a protocol-relative literal passed
			// leg 1's `https?://` anchor and was skipped here as "a literal").
			const bareLiteral = /^(['"])([^'"]*)\1$/.exec(target);
			if (bareLiteral !== null && literalVerdict(bareLiteral[2] as string) === 'same-origin') {
				match = pattern.exec(haystack);
				continue;
			}
			out.push({ file, name, target, verdict: resolveTarget(target, kept, 0, start) });
			match = pattern.exec(haystack);
		}
	}
	return out;
}

/**
 * A verify clause the gate re-proves: a file that must (or must not) contain a
 * literal. Exactly one predicate per clause.
 */
interface VerifyClause {
	file: string;
	must_contain?: string;
	must_not_contain?: string;
}

/** An allowlisted undecided site. ENUMERATED, shrink-only; every field is re-proved. */
interface AllowlistEntry {
	file: string;
	/** The exact target expression text at the site. */
	target: string;
	reason: string;
	verify: VerifyClause[];
}

/**
 * THE ALLOWLIST — undecided sites the grammar cannot resolve, each with the fact
 * that keeps it same-origin, re-proved every run. A site whose file, target or
 * clause no longer holds is RED: the entry is stale, delete or fix it.
 */
const ALLOWLIST: readonly AllowlistEntry[] = [
	{
		file: 'client/dedalo/core/common/js/instances.js',
		target: 'module_path',
		reason:
			'The element loader: a tool module resolves to `DEDALO_TOOLS_URLS[model]` when the tool lives in an ADDITIONAL tool root, else to a relative path. DEDALO_TOOLS_URLS is built server-side from DEDALO_ADDITIONAL_TOOLS, whose reader REFUSES any root url that is not root-relative — the only way an absolute URL could enter is through that reader.',
		verify: [
			{
				file: 'src/config/readers.ts',
				must_contain:
					"if (!url.startsWith('/') || url.startsWith('//')) continue; // same-origin only",
			},
			{
				file: 'src/core/resolve/environment.ts',
				must_contain: 'DEDALO_TOOLS_URLS: getAdditionalToolsUrlMap()',
			},
		],
	},
	{
		file: 'client/dedalo/core/common/js/utils/util.js',
		target: 'src',
		reason:
			'`load_script(src)`, the generic classic-script loader. Its parameter is whatever a caller passes; the callers are the registry scan below (`load_script(` arguments across client/ and tools/ must resolve same-origin), so this entry covers the function and that leg covers its inputs.',
		verify: [
			{
				file: 'client/dedalo/core/common/js/utils/util.js',
				must_contain: 'export function load_script(',
			},
		],
	},
	{
		file: 'client/dedalo/core/section/js/render_edit_section.js',
		target: 'path',
		reason:
			'`render_view.path || …` — the section view registry `render_views` is a CLIENT-declared table of view modules (section.js), whose every `path` is a relative literal; the registry scan below proves no entry is absolute.',
		verify: [
			{ file: 'client/dedalo/core/section/js/section.js', must_contain: 'self.render_views = [' },
		],
	},
	{
		file: 'client/dedalo/core/section/js/render_list_section.js',
		target: 'path',
		reason:
			'Same registry as render_edit_section.js (`render_views`, client-declared, scanned below).',
		verify: [
			{ file: 'client/dedalo/core/section/js/section.js', must_contain: 'self.render_views = [' },
		],
	},
	{
		file: 'client/dedalo/core/component_portal/js/render_edit_component_portal.js',
		target: 'path',
		reason:
			'The portal view registry (`render_views` in component_portal.js), client-declared, scanned below.',
		verify: [
			{
				file: 'client/dedalo/core/component_portal/js/component_portal.js',
				must_contain: 'self.render_views = [',
			},
		],
	},
	{
		file: 'client/dedalo/core/dd_grid/js/render_list_dd_grid.js',
		target: 'value.action.module_path',
		reason:
			'A grid cell action whose module is named by the SERVER (`module_path` in the indexation grid builder). The emitter scan below reads every `module_path:` value src/ and the tool servers emit and refuses one that is not a relative path.',
		verify: [{ file: 'src/core/section/indexation_grid.ts', must_contain: 'module_path:' }],
	},
	{
		file: 'client/dedalo/core/dd_grid/js/view_table_dd_grid.js',
		target: 'value.action.module_path',
		reason: 'Same server field as render_list_dd_grid.js (`module_path`, emitter-scanned below).',
		verify: [{ file: 'src/core/section/indexation_grid.ts', must_contain: 'module_path:' }],
	},
	{
		file: 'client/dedalo/core/dd_grid/js/view_indexation_dd_grid.js',
		target: 'value.action.module_path',
		reason: 'Same server field as render_list_dd_grid.js (`module_path`, emitter-scanned below).',
		verify: [{ file: 'src/core/section/indexation_grid.ts', must_contain: 'module_path:' }],
	},
	{
		file: 'client/dedalo/test/client/js/test_others_lifecycle.js',
		target: 'element.path',
		reason:
			'The browser harness iterating the element table IT builds in the same file — every `path` is a relative literal (registry-scanned below with the render_views paths).',
		verify: [
			{ file: 'client/dedalo/test/client/js/test_others_lifecycle.js', must_contain: 'path' },
		],
	},
	{
		file: 'src/core/tools/loader.ts',
		target: 'canonical',
		reason:
			'Server-side: the tool server entry, realpath-resolved and REFUSED when it canonicalises outside a tool root — a filesystem path on this machine, never a URL.',
		verify: [{ file: 'src/core/tools/loader.ts', must_contain: 'refused (outside root)' }],
	},
	{
		file: 'publication/server_api/v2/src/routes/docs.ts',
		target: '${basePath}/docs/swagger/swagger-ui-bundle.js',
		reason:
			'The v2 API docs page: `basePath` is `config.BASE_PATH`, the path prefix the API is mounted under — a root-relative prefix by contract, and the config module is where that contract lives.',
		verify: [
			{
				file: 'publication/server_api/v2/src/routes/docs.ts',
				must_contain: "const basePath = config.BASE_PATH || ''",
			},
		],
	},
	{
		file: 'publication/server_api/v2/src/routes/docs.ts',
		target: '${basePath}/docs/swagger/swagger-ui-standalone-preset.js',
		reason: 'Same page and same `basePath` as the entry above (the swagger standalone preset).',
		verify: [
			{
				file: 'publication/server_api/v2/src/routes/docs.ts',
				must_contain: "const basePath = config.BASE_PATH || ''",
			},
		],
	},
	{
		file: 'publication/server_api/v2/src/routes/docs.ts',
		target: '${basePath}/docs/scalar/standalone.js',
		reason:
			'Same `basePath` as the entries above (the scalar docs renderer, served by the same API).',
		verify: [
			{
				file: 'publication/server_api/v2/src/routes/docs.ts',
				must_contain: "const basePath = config.BASE_PATH || ''",
			},
		],
	},
];

/** Shrink-only cap on the allowlist — 13 on 2026-09-04. */
const ALLOWLIST_CAP = 13;

/** `path`/`module_path` REGISTRY values across the client: every one must be a relative path. */
function registryPathOffenders(files: string[]): string[] {
	const offenders: string[] = [];
	for (const file of files) {
		const rel = relative(REPO_ROOT, file);
		if (!rel.startsWith('client/dedalo/')) continue;
		const source = stripComments(readFileSync(file, 'utf8'));
		if (!/render_views|element\.path|load_script\s*\(/.test(source)) continue;
		for (const match of source.matchAll(/\bpath\s*:\s*(['"`][^'"`\n]*['"`])/g)) {
			if (resolveTarget(match[1] as string, source) !== 'same-origin') {
				offenders.push(`${rel}: registry path ${match[1]}`);
			}
		}
		for (const match of source.matchAll(
			/\bload_script\s*\(\s*([^()]*(?:\([^()]*\)[^()]*)*?)\s*\)/g,
		)) {
			const target = ((splitTopLevel(match[1] as string, ',') ?? [match[1]])[0] as string).trim();
			if (target === '' || target === 'src') continue; // the definition itself
			if (resolveTarget(target, source) !== 'same-origin') {
				offenders.push(`${rel}: load_script(${target.slice(0, 80)}) does not resolve same-origin`);
			}
		}
	}
	return offenders;
}

/** Every `module_path:` the server emits must be a relative path — the dd_grid allowlist's other half. */
function emitterOffenders(files: string[]): { offenders: string[]; seen: number } {
	const offenders: string[] = [];
	let seen = 0;
	for (const file of files) {
		const rel = relative(REPO_ROOT, file);
		if (!(rel.startsWith('src/') || /^tools\/[^/]+\/server\//.test(rel))) continue;
		const source = stripComments(readFileSync(file, 'utf8'));
		for (const match of source.matchAll(/\bmodule_path\s*:\s*([^,\n]+)/g)) {
			seen++;
			if (resolveTarget(match[1] as string, source) !== 'same-origin') {
				offenders.push(`${rel}: module_path: ${(match[1] as string).trim().slice(0, 80)}`);
			}
		}
	}
	return { offenders, seen };
}

describe('no remote code: the client and tools load code only from this install', () => {
	test(
		'the walk covers every root and is not empty (floor)',
		() => {
			const files = scanFiles();
			expect(files.length).toBeGreaterThan(WALK_FLOOR);
			for (const root of SCAN_ROOTS) {
				expect(
					files.some((file) => relative(REPO_ROOT, file).startsWith(`${root}/`)),
					`no scanned file under ${root}/`,
				).toBe(true);
			}
		},
		SCAN_TIMEOUT_MS,
	);

	test(
		'LEG 1 — no file imports code from a third-party host by literal URL',
		() => {
			const offenders: string[] = [];
			const files = scanFiles();
			expect(files.length).toBeGreaterThan(WALK_FLOOR);
			for (const file of files) {
				const source = stripComments(readFileSync(file, 'utf8'));
				for (const { name, pattern } of REMOTE_CODE_PATTERNS) {
					pattern.lastIndex = 0;
					const found = source.match(pattern);
					if (found !== null) {
						offenders.push(`${relative(REPO_ROOT, file)}: ${name} → ${found[0].slice(0, 120)}`);
					}
				}
			}
			expect(offenders).toEqual([]);
		},
		SCAN_TIMEOUT_MS,
	);

	test(
		'LEG 2 — every config-shaped load resolves same-origin, or is an allowlisted site with a re-proved reason',
		() => {
			const sites = allLoaderSites();
			// Floor: the tree HAS config-shaped loads (27 on 2026-09-04). Zero means the
			// discovery regexes broke, not that the code got simpler.
			expect(
				sites.length,
				'no non-literal loader site found anywhere — discovery is broken',
			).toBeGreaterThan(10);
			expect(sites.filter((site) => site.verdict === 'same-origin').length).toBeGreaterThan(3);

			const remote = sites.filter((site) => site.verdict === 'remote');
			expect(
				remote.map((site) => `${site.file}: ${site.name} → ${site.target}`),
				'a loader whose target RESOLVES to an absolute http(s) URL — the config-constant shape. No allowlist covers this.',
			).toEqual([]);

			// A THIRD-PARTY BUNDLE (a file under a vendor_manifest.json row's root) is held
			// to the REMOTE verdict only: its undecided targets are its own chunk loader
			// (`import(n.p + "chunk.js")`), and what vouches for a bundle's internals is
			// the manifest — digest, version evidence, advisory ledger — not a per-site
			// allowlist nobody could write over a 1 MB line. First-party code gets no
			// such pass: every undecided site there is allowlisted by name or red.
			const bundleRoots = Object.entries(readManifest().libs).map(([id, entry]) =>
				libRootRelative(id, entry),
			);
			const inBundle = (file: string): boolean =>
				bundleRoots.some((root) => file === root || file.startsWith(`${root}/`));
			expect(
				sites.filter((site) => inBundle(site.file)).length,
				'the bundles were not scanned',
			).toBeGreaterThan(0);
			const allow = new Map(ALLOWLIST.map((entry) => [`${entry.file} ${entry.target}`, entry]));
			const undecided = sites
				.filter((site) => site.verdict === 'undecided')
				.filter((site) => !inBundle(site.file))
				.filter((site) => !allow.has(`${site.file} ${site.target}`))
				.map((site) => `${site.file}: ${site.name} → ${site.target}`);
			expect(
				undecided,
				'a loader target the same-origin grammar cannot decide. Either build it from DEDALO_ROOT_WEB / a relative literal / new URL(rel, import.meta.url), or add an ALLOWLIST entry with a verify clause this gate can re-prove.',
			).toEqual([]);
		},
		SCAN_TIMEOUT_MS,
	);

	test(
		'LEG 2 — the allowlist is enumerated, shrink-only, and every entry still holds',
		() => {
			expect(ALLOWLIST.length).toBeLessThanOrEqual(ALLOWLIST_CAP);
			expect(ALLOWLIST.length).toBeGreaterThan(0);
			const siteKeys = new Set<string>();
			for (const site of allLoaderSites()) {
				siteKeys.add(`${site.file} ${site.target} ${site.verdict}`);
			}
			const stale: string[] = [];
			for (const entry of ALLOWLIST) {
				if (entry.reason.trim().length < 60) stale.push(`${entry.file}: reason too thin`);
				if (entry.verify.length === 0) stale.push(`${entry.file}: no verify clause`);
				if (!siteKeys.has(`${entry.file} ${entry.target} undecided`)) {
					stale.push(
						`${entry.file}: no UNDECIDED site with target "${entry.target}" — the entry is stale (site gone, target rewritten, or now resolvable); delete it`,
					);
				}
				for (const clause of entry.verify) {
					let text: string;
					try {
						text = readFileSync(join(REPO_ROOT, clause.file), 'utf8');
					} catch {
						stale.push(`${entry.file}: verify file ${clause.file} does not exist`);
						continue;
					}
					const hasContain = typeof clause.must_contain === 'string';
					const hasNot = typeof clause.must_not_contain === 'string';
					if (hasContain === hasNot)
						stale.push(`${entry.file}: a verify clause needs exactly one predicate`);
					if (hasContain && !text.includes(clause.must_contain as string)) {
						stale.push(
							`${entry.file}: ${clause.file} no longer contains "${clause.must_contain}" — the fact this entry rests on is gone`,
						);
					}
					if (hasNot && text.includes(clause.must_not_contain as string)) {
						stale.push(`${entry.file}: ${clause.file} now contains "${clause.must_not_contain}"`);
					}
				}
			}
			expect(stale).toEqual([]);
		},
		SCAN_TIMEOUT_MS,
	);

	test(
		'LEG 2 — the other half of the allowlist: client registries and server emitters name only same-origin paths',
		() => {
			const files = scanFiles();
			expect(registryPathOffenders(files)).toEqual([]);
			const emitters = emitterOffenders(files);
			// Floor: the server DOES emit module_path (5 sites in indexation_grid.ts on
			// 2026-09-04); zero means the scan lost the emitter, not that it went away.
			expect(emitters.seen).toBeGreaterThan(2);
			expect(emitters.offenders).toEqual([]);
		},
		SCAN_TIMEOUT_MS,
	);

	test(
		"LEG 3 — every in-browser AI runtime pins onnxruntime WASM locally and takes its models from this install's store (RC-01, W1-02)",
		() => {
			// transformers.js loads its onnxruntime WASM glue (.mjs + .wasm) from
			// cdn.jsdelivr.net BY DEFAULT unless env.backends.onnx.wasm.wasmPaths is
			// pointed at a local path. That remote load is INVISIBLE to the URL
			// patterns above (there is no literal import URL — it is a library
			// default), so it gets its own invariant: any file importing the
			// transformers runtime MUST set wasmPaths. This is the exact hole the RC-01
			// finding walked through (tool_lang's browser_transformer set remoteHost
			// but never wasmPaths, so the runtime came from the CDN).
			const offenders: string[] = [];
			let importers = 0;
			for (const file of scanFiles()) {
				const rel = relative(REPO_ROOT, file);
				if (rel.startsWith('vendor/')) continue; // the runtime's own tree is not an importer
				const source = readFileSync(file, 'utf8');
				const importsTransformers =
					/\bimport\b[^;]*\bfrom\s*['"`][^'"`]*transformers(\.min)?\.js['"`]/.test(source);
				if (!importsTransformers) continue;
				importers++;
				if (!/wasmPaths\s*=/.test(source)) {
					offenders.push(
						`${rel}: imports transformers.js but never sets env.backends.onnx.wasm.wasmPaths → onnxruntime WASM falls back to the CDN`,
					);
				}
				// And the MODEL comes from the install's model store: without remoteHost
				// transformers.js fetches huggingface.co; pointed anywhere else (the
				// tools tree's `./models/`, until P2-5-residue 2026-09-04) the weights
				// live outside the store's digest/pin/session door.
				if (!MODEL_STORE_HOST.test(source)) {
					offenders.push(
						`${rel}: imports transformers.js but env.remoteHost is not the install's model store (${'/dedalo/ai_models/'})`,
					);
				}
			}
			// Anti-vacuity: three importers on 2026-09-04 (browser_whisper,
			// browser_transformer, remove_background); zero means the import shape moved.
			expect(importers).toBeGreaterThan(1);
			expect(offenders).toEqual([]);
		},
		SCAN_TIMEOUT_MS,
	);

	test('POSITIVE CONTROL — leg 3: the model-store spelling is the one the three runtimes use, and the tools-tree one is not', () => {
		expect(
			MODEL_STORE_HOST.test(
				"env.remoteHost = new URL('/dedalo/ai_models/', self.location.origin).href;",
			),
		).toBe(true);
		expect(
			MODEL_STORE_HOST.test(
				"env.remoteHost\t= new URL( options.model_host || '/dedalo/ai_models/', self.location.origin ).href;",
			),
		).toBe(true);
		// The shape that committed 20 MB of a tokenizer under tools/ (pre-2026-09-04).
		expect(
			MODEL_STORE_HOST.test("env.remoteHost = new URL('./models/', self.location.href).href;"),
		).toBe(false);
		expect(MODEL_STORE_HOST.test("env.remoteHost = 'https://huggingface.co/';")).toBe(false);
	});

	test('LEG 3 — the 3D viewer resolves its lighting environments from this install (2026-08-08)', () => {
		// A THIRD invisible-load shape, and the reason this test exists next to the
		// transformers one rather than under the URL patterns above: an environment
		// preset is a DATA fetch (`EXRLoader.load(entry.path)`), which the patterns
		// deliberately do not cover — a remote address is legitimate for data in
		// general (a map tile server).
		//
		// It is NOT legitimate here. component_3d's environment dropdown shipped two
		// presets pointing at a public bucket: dead in an air-gapped archive, and on
		// a connected one every selection announced to a third party that a 3D
		// heritage record was being worked on. Same promise as the recogniser above,
		// broken the same two ways — so the registry is held to the same rule.
		const registry = join(REPO_ROOT, 'client/dedalo/core/component_3d/js/viewer/environments.js');
		const source = stripComments(readFileSync(registry, 'utf8'));
		const remote = [...source.matchAll(/path\s*:\s*['"`](https?:\/\/[^'"`]+)['"`]/g)].map(
			(match) => match[1] ?? '',
		);
		expect(remote).toEqual([]);
		// Anti-vacuity: the file must still BE a registry of presets, or a rename
		// would leave this passing over nothing.
		expect(/export\s+const\s+environments\s*=/.test(source)).toBe(true);
		expect((source.match(/\bid\s*:/g) ?? []).length).toBeGreaterThan(1);
	});

	test('POSITIVE CONTROL — leg 1: the literal patterns catch what they claim to', () => {
		const samples = [
			"import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';",
			"import('https://evil.example.com/x.js')",
			"importScripts('http://cdn.example.com/w.js')",
			"new Worker('https://cdn.example.com/worker.js')",
			'<script src="https://cdn.example.com/lib.js"></script>',
			// Protocol-relative: the canonical CDN include, and no `https?:` to anchor on.
			'<script src="//cdn.example.com/other.js"></script>',
			"import('//cdn.example.com/lib.js')",
			"importScripts('//cdn.example.com/w.js')",
			'<script type="importmap">{"imports":{"lib":"https://cdn.example.com/lib.js"}}</script>',
			"WebAssembly.instantiateStreaming(fetch('https://cdn.example.com/x.wasm'), imports)",
		];
		expect(samples.length).toBeGreaterThan(9);
		for (const sample of samples) {
			const hit = REMOTE_CODE_PATTERNS.some(({ pattern }) => {
				pattern.lastIndex = 0;
				return pattern.test(sample);
			});
			expect(hit).toBe(true);
		}
	});

	test('POSITIVE CONTROL — leg 1: local imports and remote DATA references are not flagged', () => {
		const allowed = [
			"import { pipeline } from '/dedalo/lib/transformers/dist/transformers.js';",
			"import { ui } from '../../../core/common/js/ui.js'",
			"new Worker('../../tools/tool_transcription/transcribers/browser_whisper/browser_whisper.js', { type: 'module' })",
			"const tiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'",
			"fetch('https://api.example.org/data.json')",
			'<script type="importmap">{"imports":{"three":"/dedalo/lib/three/build/three.module.js"}}</script>',
			"WebAssembly.instantiateStreaming(fetch(new URL('./x.wasm', import.meta.url)))",
		];
		for (const sample of allowed) {
			const hit = REMOTE_CODE_PATTERNS.some(({ pattern }) => {
				pattern.lastIndex = 0;
				return pattern.test(sample);
			});
			expect(hit).toBe(false);
		}
	});

	test('POSITIVE CONTROL — leg 2: the config-shaped shapes are seen and judged', () => {
		// The RC-01 shape, three ways: a constant, a config-looking binding, a template.
		const remoteConstant =
			"const CDN_SRC = 'https://cdn.example.com/lib.js';\nconst m = await import(CDN_SRC);\n";
		const remoteTemplate =
			"const host = 'https://cdn.example.com';\nconst w = new Worker(`${host}/w.js`);\n";
		const remoteScript =
			"const s = document.createElement('script');\ns.src = 'https://cdn.example.com/x.js';\n";
		const remoteHtml =
			'<html><script src="${cdn}/x.js"></script></html>\nconst cdn = "https://cdn.example.com";\n';
		// The reviewer's 2026-09-04 probe: a script element fed through setAttribute,
		// a protocol-relative literal, a remote WASM stream — each a loader in its own right.
		const remoteSetAttribute =
			"const s = document.createElement('script');\ns.setAttribute('src', 'https://cdn.example.com/lib.js');\n";
		const remoteProtocolRelative = "importScripts('//cdn.example.com/w.js');\n";
		const remoteWasm =
			"const WASM = 'https://cdn.example.com/x.wasm';\nWebAssembly.instantiateStreaming(fetch(WASM), imports);\n";
		for (const [text, expected] of [
			[remoteConstant, 'remote'],
			[remoteTemplate, 'remote'],
			[remoteScript, 'remote'],
			[remoteHtml, 'remote'],
			[remoteSetAttribute, 'remote'],
			[remoteProtocolRelative, 'remote'],
			[remoteWasm, 'remote'],
		] as const) {
			const sites = loaderSitesIn('scratch.js', text);
			expect(sites.length, text).toBeGreaterThan(0);
			expect(
				sites.map((site) => site.verdict),
				text,
			).toContain(expected);
		}
		// Same-origin grammar, every clause.
		const sameOrigin = [
			'import(`../../../core/widgets${short_path}.js`)',
			"new Worker(DEDALO_CORE_URL + '/page/js/worker_cache.js')",
			"const base = (typeof DEDALO_ROOT_WEB !== 'undefined' && DEDALO_ROOT_WEB) ? DEDALO_ROOT_WEB : ''\nconst url = base + '/lib/d3/dist/d3.min.js'\nimport(url)",
			"new Worker(new URL('./csv_worker.ts', import.meta.url))",
			'import(join(coreDir, relPath))',
			'import(DEDALO_ROOT_WEB+"/lib/lz-string/lz-string.js")',
			'const module_path = `../../../tools/${model}/js/${model}.js`\nimport(module_path)',
			"const path = render_view.path || ('./' + render_view.render +'.js')",
			// A wasm stream from this module, a same-origin setAttribute.
			"WebAssembly.instantiateStreaming(fetch(new URL('./x.wasm', import.meta.url)))",
			"const s = document.createElement('script');\ns.setAttribute('src', DEDALO_ROOT_WEB + '/x.js')",
		];
		for (const text of [...sameOrigin.slice(0, 7), ...sameOrigin.slice(8)]) {
			const sites = loaderSitesIn('scratch.js', text);
			expect(sites.length, text).toBeGreaterThan(0);
			expect(
				sites.map((site) => site.verdict),
				text,
			).toEqual(sites.map(() => 'same-origin'));
		}
		// A same-origin LITERAL is not a site at all; a remote literal of any spelling is.
		expect(loaderSitesIn('scratch.ts', "const fs = await import('node:fs');\n")).toEqual([]);
		expect(resolveTarget("'node:fs'", '')).toBe('same-origin');
		expect(resolveTarget("'bun:sqlite'", '')).toBe('same-origin');
		expect(resolveTarget("'//cdn.example.com/x.js'", '')).toBe('remote');
		expect(resolveTarget("'ftp://cdn.example.com/x.js'", '')).toBe('remote');
		expect(
			loaderSitesIn('scratch.js', "import('//cdn.example.com/x.js');\n").map(
				(site) => site.verdict,
			),
		).toEqual(['remote']);
		// Undecided: a server field, a bare parameter — the allowlist's shape.
		expect(resolveTarget('value.action.module_path', '')).toBe('undecided');
		expect(resolveTarget('src', 'function load(src) { el.src = src }')).toBe('undecided');
		expect(resolveTarget("render_view.path || ('./' + render_view.render + '.js')", '')).toBe(
			'undecided',
		);
		// A message that merely SAYS "import (x)" is not a site.
		expect(
			loaderSitesIn(
				'scratch.ts',
				'const m = `redistribute it with the ontology import (update_ontology)`;\n',
			),
		).toEqual([]);
		// The comment-stripping keeps a commented-out CDN import inert.
		expect(
			loaderSitesIn(
				'scratch.js',
				"//import { pipeline } from 'https://cdn.example.com/x';\nimport('./ok.js')\n",
			),
		).toEqual([]);
		// A non-script element's .src is not a code load.
		expect(
			loaderSitesIn(
				'scratch.js',
				"const img = document.createElement('img');\nimg.src = remote_url;\n",
			),
		).toEqual([]);
		// Another scheme is remote too.
		expect(resolveTarget("'data:text/javascript,alert(1)'", '')).toBe('remote');
		expect(resolveTarget("'//cdn.example.com/x.js'", '')).toBe('remote');
	});
});
