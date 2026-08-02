/**
 * CSS TOKEN DUPLICATION tripwire (DEC-12: every documented invariant has one).
 *
 * The `vars_tokens.less` palette is DECLARED ONCE, by the one stylesheet that lands in the
 * document. Sibling of `css_build_tripwire.test.ts` (same compile, different question: that
 * one asks whether the bytes match their source, this one asks who is allowed to emit them).
 *
 * "The palette" now means the whole of it: ONE light palette file (`vars_tokens.less`) and ONE
 * dark-override file (`theme_dark.less`) — plus `redesign/_tokens.less`, the same names on a
 * second, ORTHOGONAL axis (design, not theme). Those three are PALETTE_FILES and assertion 5
 * holds the line; every other `:root` custom property in the app is declared in that set. It was not always. `layout/theme_tokens.less` used to carry a SECOND
 * palette — the 28 `--ut_*` tokens, light + dark — next to its LESS `@font_*`/`@size_*` vars,
 * and was imported by BOTH `main.less` and `test/client/css/unit_test.less`, whose compiled
 * sheets land in the SAME document (`test/client/index.html` links main.css and unit_test.css
 * together). Same disease, 2 KB of it against the 237 KB below. It was closed on 2026-08-02 by
 * DELETING the special case rather than splitting a second pair: the light block moved into
 * `vars_tokens.less`, the dark one into `theme_dark.less`, and `theme_tokens.less` kept only
 * the LESS vars — so it emits nothing, exactly like `vars.less`, and none of its importers
 * changed a line. That is the shape to copy: a partial that exists to be imported everywhere
 * must emit NOTHING, and a palette belongs in the one palette file per theme. Both emit-free
 * partials are gated below (EMIT_FREE_PARTIALS), and the `--ut_*` names are in OWNED now, so
 * re-declaring one from another entrypoint fails assertion 1 like any other palette token.
 *
 * WHAT WENT WRONG WITHOUT THIS GATE (real, measured 2026-08-02, before the split):
 *   - `layout/vars.less` held BOTH the `@alias` mappings and the `:root` block that declares
 *     the properties they alias. 39 stylesheets `@import (once) './vars'` for the aliases —
 *     and `(once)` dedupes per COMPILE, not per document. 36 of those importers are their own
 *     build entrypoint (every tool is one), so 36 stylesheets each shipped a full copy of the
 *     palette: 237 KB of the 572 KB of tool CSS — 41% — was byte-identical re-declaration.
 *   - Every token edit therefore churned 35 committed artifacts, in a repo where the compiled
 *     `.css` IS the deployed artifact.
 *   - It was not inert. `--select_icon_url` is a RELATIVE `url()` and LESS copies it verbatim,
 *     so a tool's copy resolved against `/dedalo/tools/<tool>/` and 404'd the select arrow for
 *     the WHOLE document the moment that sheet was lazily injected (`load_style`,
 *     client/dedalo/core/common/js/utils/util.js:260). Only dark mode escaped, and only by
 *     specificity accident: `:root[data-theme="dark"]` (0,2,0) out-ranks a plain `:root`
 *     (0,1,0) whatever the source order.
 *
 * The split (`layout/vars_tokens.less` = the `:root` emission; `layout/vars.less` = aliases
 * only, so none of its 39 importers changed a line) removed 257 KB of shipped tool CSS. But
 * the two files sit side by side, and an `@import './vars_tokens'` added next to the existing
 * `@import './vars'` — "to be safe", or by autocomplete — compiles perfectly clean and
 * silently restores all of it. Nothing but this gate notices.
 *
 * THE ASSERTIONS (beyond the self-test that the palette source and entrypoint discovery are
 * both non-empty, since every intersection below goes trivially green if either is):
 *   1. no entrypoint outside TOKEN_OWNERS re-declares, ON `:root`, any name that
 *      `vars_tokens.less` declares. Matched on DECLARATION (`--x:` in a rule), never on
 *      `var(--x)` USE — a tool consuming `--color_grey_13` is the entire point of the palette
 *      and must stay legal; only on the INTERSECTION with the palette's own name set, so a
 *      tool's OWN token (`--tool_indexation`) is invisible here; and only at the document
 *      ROOT, so a SCOPED override (`.wrapper_tool.tool_x { --media_max_height: 30vh }`) also
 *      stays legal — that is the idiom, and it is bounded by its selector;
 *   2. the set of entrypoints that actually emit a palette token EQUALS `TOKEN_OWNERS`. Set
 *      equality, not ⊆: an owner that stops emitting is a stale allowlist entry and must fail
 *      too, or the day the palette silently leaves `main.css` this file reports green while
 *      the whole app renders unstyled;
 *   3. the entrypoints that are NOT injected into the main.css document must be
 *      self-sufficient — every `var(--…)` they use is declared in the same file. That is the
 *      failure (1) and (2) cannot see: a sheet rendered into its own document, using tokens
 *      nobody declared there, computes every value to nothing and drops the rule;
 *   4. every partial in EMIT_FREE_PARTIALS compiles to ZERO bytes. The one (1)-(3) cannot
 *      make: they are keyed to the names `vars_tokens.less` already declares, so a token added
 *      to `vars.less` — the file 39 stylesheets import, called "vars", that every doc pointed
 *      at for three years — is not in that set, and 36 entrypoints can re-emit it with this
 *      gate fully green. An adversarial pass demonstrated exactly that hole before this
 *      assertion closed it. `theme_tokens.less` joined the list when its `--ut_*` palette moved
 *      into the palette files (2026-08-02); adding the next widely-imported partial is one line
 *      in that record, not a new test;
 *   5. only the files named in PALETTE_FILES declare a palette token on a GLOBAL ROOT.
 *      Assertions 1-2 work in ENTRYPOINT space, where the answer is always main.less — so a
 *      new partial inside its ~120-import graph could retune the palette document-wide with
 *      this file green. An adversarial pass landed exactly that. This one asks which FILE
 *      wrote the declaration, which only source space can answer.
 *
 * The palette's NAMES are read from the LESS source, not from a compiled sheet: the file is
 * 228 literal declarations with no interpolation, and it is a PARTIAL (not an entrypoint), so
 * compiling it here would mean a second, bespoke `less.render` call — a copy of the build the
 * sibling gate deliberately refuses to keep. The consumers, however, are read COMPILED, from
 * `buildOne`: the duplication arrives TRANSITIVELY, several `@import`s deep, so a scan of a
 * tool's own `.less` would see nothing at all, and a scan of its committed `.css` would go
 * green on a stale artifact.
 *
 * COST: compiles the 42 entrypoints (~1s). DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allLessFiles, buildOne, entrypoints } from '../../scripts/build_css.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The file that OWNS the palette: every name it declares is a name nobody else may declare. */
const PALETTE_SOURCE = 'client/dedalo/core/page/css/layout/vars_tokens.less';

/**
 * Partials that exist to be IMPORTED WIDELY and must therefore emit nothing. `@import (once)`
 * dedupes per COMPILE, not per document, so a byte emitted here is a byte multiplied by however
 * many entrypoints import it — the exact mechanism of the 237 KB duplication. Gated separately
 * from everything below, because the name-keyed assertions cannot see a token that has never
 * been in the palette. The reason is the value, and it carries the MULTIPLIER (importers, of
 * which entrypoints), because "emits nothing" without the arithmetic reads like style advice.
 */
const EMIT_FREE_PARTIALS: Record<string, string> = {
	'client/dedalo/core/page/css/layout/vars.less':
		'the LESS @alias mappings over the palette: imported by 39 stylesheets, 36 of which are their own build entrypoint, so every byte here ships 36 times. The :root block it used to hold lives in vars_tokens.less since the 2026-08-02 split. Keep it to @aliases and // line comments — a /** */ header is emitted CSS too, and the pre-split docblock was itself shipping into 34 tool artifacts',
	'client/dedalo/core/page/css/layout/theme_tokens.less':
		'the LESS @font_*/@size_* vars: imported by main.less and test/client/css/unit_test.less, BOTH entrypoints and both landing in the same runner document — so the --ut_* palette it used to hold shipped twice, until it moved into vars_tokens.less (light) and theme_dark.less (dark) on 2026-08-02. A declaration added back here re-opens that, and the name-keyed assertions cannot see it',
};

/**
 * Entrypoints allowed to emit the palette, each stamped with the DOCUMENT its bytes land in
 * and why main.css is not already there. The reason lives here, as the value, because an
 * allowlist of bare paths is a list of things somebody once did, not a list of things that
 * are justified — and assertion 2 makes appending to it the deliberate act it should be.
 */
const TOKEN_OWNERS: Record<string, string> = {
	'client/dedalo/core/page/css/main.less':
		'the SPA document stylesheet: client/dedalo/core/page/index.html loads it at boot, and every other sheet in the app is lazily injected into that same document by load_style(), so they all inherit these properties from here and a second copy would be pure duplication',
};

/**
 * The files allowed to DECLARE a palette token on a global root, one per theme axis. Every
 * other assertion here works in ENTRYPOINT space, which is blind to the hole this closes:
 * `main.less` imports ~120 partials, so a NEW partial declaring `:root { --color_white: red }`
 * retunes the app document-wide while assertions 1 and 2 stay green — the offending bytes are
 * inside the one legitimate owner. An adversarial pass landed exactly that payload and the
 * whole suite passed.
 *
 * That matters more than a normal gap, because "there is no third file that can grow a fourth
 * palette" is the STATED REASON the `--ut_*` palette was folded in here (2026-08-02) instead
 * of being split into its own pair. An unenforced justification is how the next maintainer
 * learns the rule was never real.
 */
const PALETTE_FILES: Record<string, string> = {
	'client/dedalo/core/page/css/layout/vars_tokens.less':
		'the light palette — the base every override is written against, on plain `:root`',
	'client/dedalo/core/page/css/layout/theme_dark.less':
		'the dark palette — the same names under `:root[data-theme="dark"]`, the theme axis',
	'client/dedalo/core/page/css/redesign/_tokens.less':
		'the "Calm Scholarly" design line — the same names under `:root[data-design="redesign"]` (and its own dark companion). A SECOND, orthogonal axis (design, not theme), which is why the rule is "the named palette files", not "two files": a scoped variant of the palette is legitimate, an unnamed one is not',
};

/**
 * Entrypoints whose CSS is loaded into a document that does NOT carry main.css. Named WITH
 * the document, because assertion 3 is a claim about where bytes land and no amount of CSS
 * can reveal that. Neither of these imports the palette today — they declare the handful of
 * properties they use locally, which is why they are not TOKEN_OWNERS.
 */
const STANDALONE_DOCUMENTS: { entrypoint: string; document: string }[] = [
	{
		entrypoint: 'client/dedalo/core/component_pdf/css/pdfjs_default_edit.less',
		document: "the PDF.js viewer iframe's contentDocument (view_default_edit_pdf.js)",
	},
	{
		entrypoint: 'client/dedalo/core/component_pdf/css/pdfjs_default_read_only.less',
		document: "the PDF.js viewer iframe's contentDocument (view_default_edit_pdf.js)",
	},
];

/** What a maintainer needs to be told when assertion 1 fires. */
const WHY_DUPLICATE =
	"A stylesheet that is NOT a declared token owner emits properties from layout/vars_tokens.less.\n\nThat is the pre-2026-08-02 duplication returning. It measured 237 KB of 572 KB of tool CSS (41%) in byte-identical copies, churned 35 committed artifacts on every token edit, and broke the light theme outright: a tool's copy of the RELATIVE --select_icon_url resolves against /dedalo/tools/<tool>/ and 404s the select arrow for the whole document once load_style() injects the sheet.\n\nFix: import './layout/vars' for the @aliases — it emits NOTHING, which is the entire point of the split. Import './layout/vars_tokens' ONLY from a stylesheet loaded into a document that does not already carry main.css, and add that entrypoint to TOKEN_OWNERS with the document it renders into. Then bun run css:build.";

/** Comments are prose ABOUT tokens, not tokens — `vars_tokens.less`'s own header quotes some. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** A DECLARATION: the name is preceded by `{`, `;` or line-leading space and followed by `:`.
 *  A `var(--x)` / `var(--x, fallback)` REFERENCE has no colon after the name, so it never
 *  matches — and it must not: consuming the palette is what the palette is for. */
const declared = (css: string): Set<string> =>
	new Set([...css.matchAll(/(?:^|[{;])\s*(--[a-z0-9_-]+)\s*:/gim)].map((m) => m[1] as string));

/**
 * Declarations made ON THE DOCUMENT ROOT — the only ones that can collide. A palette name
 * re-declared under a SCOPED selector is the sanctioned custom-property idiom (a tool
 * retuning `--media_max_height` for its own wrapper), and stays legal; the same declaration
 * on `:root` leaks to every rule in the document the moment `load_style()` injects the sheet,
 * and never unloads. The rule bodies of compiled CSS are flat (`[^{}]`), so the `@media`
 * wrapper never matches while the rules inside it do — which is what we want, since a
 * `@media … { :root {…} }` override is just as global.
 */
/** `body` and `*` are in here with `:root`/`html` deliberately. The comment above justifies
 *  root-scoping on the grounds that a SCOPED override is bounded by its selector — and that
 *  reasoning does not survive `body { --color_white: red }`, which reaches every rendered
 *  element exactly like `:root` does and likewise never unloads. An adversarial pass proved
 *  the narrower regex green against that exact payload. */
const GLOBAL_ROOT_TOKEN = /^(?::root|html|body|\*)(?:\[[^\]]*\])*$/;
const IS_ROOT_SELECTOR = (selector: string): boolean => {
	const parts = selector.trim().split(/\s+/).filter(Boolean);
	return parts.length > 0 && parts.every((p) => GLOBAL_ROOT_TOKEN.test(p));
};
const declaredAtRoot = (css: string): Set<string> => {
	const out = new Set<string>();
	for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
		// `[^{}]*` swallows everything since the previous `}`, so a STATEMENT at-rule
		// (`@import (once) './vars';`, `@charset …;`) sitting above a rule lands in the
		// selector capture and makes `:root` unrecognisable — silently emptying OWNED and
		// turning every intersection below trivially green. A selector cannot contain `;`,
		// so the segment after the last one is the selector and nothing else can be.
		const selector = (rule[1] as string).split(';').pop() as string;
		if (!selector.split(',').some((s) => IS_ROOT_SELECTOR(s))) continue;
		for (const name of declared(rule[2] as string)) out.add(name);
	}
	return out;
};

/** The names the palette owns, read from the LESS source (see the header for why not compiled).
 *  LESS `//` comments survive the block-comment strip and would be read as part of the
 *  selector, so drop the whole-line ones too — never an inline `//`, which lives inside a
 *  `url(https://…)` as often as it starts a comment. */
const OWNED = declaredAtRoot(
	stripComments(readFileSync(join(REPO_ROOT, PALETTE_SOURCE), 'utf8')).replace(/^\s*\/\/.*$/gm, ''),
);

/** Compiled once here, not inside the test: `buildOne` is async and `test()` bodies are not.
 *  `buildOne` always appends a sourceMappingURL comment — build scaffolding every compile
 *  emits, not something the source declared. Drop it, or the assertion tests less.render's
 *  plumbing instead of the file's content. */
const emitFreeBuilds = await Promise.all(
	Object.keys(EMIT_FREE_PARTIALS).map(async (lessPath) => ({
		lessPath,
		emitted: (await buildOne(lessPath)).css
			.replace(/\/\*#\s*sourceMappingURL=[^*]*\*\//g, '')
			.trim(),
	})),
);

/**
 * Does this .less SOURCE declare an owned name under a selector that reaches the whole
 * document? Read in SOURCE space, not compiled: by the time a partial reaches `main.css` it
 * has been flattened in with no record of which file wrote it — and which file wrote it is the
 * entire question. Source space means honouring LESS nesting and `&`, so this walks braces
 * keeping a selector stack instead of regexing flat rules the way the assertions above can.
 *
 * Deliberately NOT a LESS parser. It over-approximates (a declaration inside a mixin body
 * counts as emitted), and over-approximating is the safe direction for a gate: a false
 * positive is a conversation, a false negative is the hole this exists to close.
 */
const declaresPaletteAtRoot = (less: string, owned: Set<string>): string[] => {
	const found: string[] = [];
	const stack: string[] = [];
	let buf = '';
	for (const ch of less.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')) {
		if (ch === '{') {
			const raw = (buf.split(/[;}]/).pop() ?? '').trim().replace(/\s+/g, ' ');
			const parent = stack[stack.length - 1] ?? '';
			stack.push(raw.includes('&') ? raw.replace(/&/g, parent) : raw || parent);
			buf = '';
		} else if (ch === '}') {
			stack.pop();
			buf = '';
		} else if (ch === ';') {
			const decl = /(--[a-z0-9_-]+)\s*:/i.exec(buf.trim());
			const here = stack[stack.length - 1];
			// a nested block resolves against its parent, so the RESOLVED selector is what
			// decides whether the declaration reaches the document
			if (decl && here && owned.has(decl[1] as string) && here.split(',').some(IS_ROOT_SELECTOR))
				found.push(decl[1] as string);
			buf = '';
		} else buf += ch;
	}
	return found;
};

/** Compile every entrypoint once; the assertions below all read this. */
const targets = entrypoints();
const built = await Promise.all(
	targets.map(async (lessPath) => ({ lessPath, ...(await buildOne(lessPath)) })),
);

/** Entrypoints that emit at least one owned name — the derived truth both 1 and 2 compare to. */
const emitting = built
	.filter(({ css }) => [...declaredAtRoot(stripComments(css))].some((n) => OWNED.has(n)))
	.map(({ lessPath }) => lessPath)
	.sort();

describe('css token duplication tripwire', () => {
	test('the palette source and the entrypoint set are both non-empty (a zero-length pass is not a pass)', () => {
		// Guards the guard twice over: a moved/renamed vars_tokens.less would leave OWNED
		// empty and every intersection below trivially green, and a broken discovery would
		// leave nothing to check at all.
		expect(
			OWNED.size,
			`${PALETTE_SOURCE} declares ${OWNED.size} custom properties — ~200 at the 2026-08-02 split, 228 once the 28 --ut_* tokens folded in. Either it moved (repoint PALETTE_SOURCE) or the palette shrank drastically; both need a deliberate look.`,
		).toBeGreaterThan(200);
		expect(targets.length).toBeGreaterThan(30);
		expect(targets).toContain('client/dedalo/core/page/css/main.less');
	});

	test('no entrypoint outside the owner allowlist declares a vars_tokens property on :root', () => {
		const offenders = built
			.filter(({ lessPath }) => !(lessPath in TOKEN_OWNERS))
			.flatMap(({ lessPath, css }) => {
				const dupes = [...declaredAtRoot(stripComments(css))].filter((n) => OWNED.has(n));
				return dupes.length === 0
					? []
					: [`${lessPath} → ${dupes.length} token(s): ${dupes.slice(0, 6).join(', ')}…`];
			});
		expect(
			offenders,
			`${WHY_DUPLICATE}\n\nOffenders:\n${offenders.map((o) => `  ${o}`).join('\n')}`,
		).toEqual([]);
	});

	test('the token owners are a frozen, reason-stamped allowlist', () => {
		// An allowlist you may append to is not an allowlist: this is set EQUALITY, so an
		// owner that stops emitting fails as a stale entry instead of rotting silently. It is
		// also the only thing standing between "main.css lost the palette" and a green run.
		expect(
			emitting,
			`The entrypoints emitting the vars_tokens palette are not the ones TOKEN_OWNERS names.\n\nIf a new owner appeared: ${WHY_DUPLICATE}\nIf an owner DISAPPEARED: the document it serves now has no palette at all and renders with every var(--…) blank — restore the import, or drop the stale entry deliberately.\n\nEmitting: ${emitting.join(', ') || '(none)'}\nAllowlisted: ${Object.keys(TOKEN_OWNERS).join(', ')}`,
		).toEqual(Object.keys(TOKEN_OWNERS).sort());

		for (const [entrypoint, reason] of Object.entries(TOKEN_OWNERS)) {
			expect(
				reason.length,
				`${entrypoint} needs a substantive reason naming the document it renders into and why main.css is not there`,
			).toBeGreaterThan(20);
		}
	});

	test('the emit-free partials compile to zero bytes, so importing them stays free', () => {
		// THE ASSERTION THE OTHERS CANNOT MAKE. Everything above is keyed to the NAMES
		// vars_tokens.less declares, so it is blind to the one move a maintainer is most
		// likely to make: adding a token to a file that is imported everywhere but declares
		// nothing yet — vars.less, the file 39 stylesheets import, that is called "vars", and
		// that every doc pointed at for three years. A name that is not yet in vars_tokens is
		// not in OWNED, so 36 entrypoints can re-emit it with the gate fully green. An
		// adversarial pass demonstrated exactly that.
		//
		// This closes it at the source instead: each of these files claims in its own header
		// to be compile-time only, and DEC-12 says a claim without a gate is not a claim. Any
		// emitting construct fails here — a `:root` block, a bare ruleset, a block-comment
		// header (LESS copies those into the output; both pre-split docblocks were themselves
		// shipping into the artifacts), or an @import of anything that emits.
		expect(
			emitFreeBuilds.length,
			'EMIT_FREE_PARTIALS is empty — the assertion would pass vacuously',
		).toBe(Object.keys(EMIT_FREE_PARTIALS).length);
		expect(emitFreeBuilds.length).toBeGreaterThan(1);

		const offenders = emitFreeBuilds
			.filter(({ emitted }) => emitted !== '')
			.map(
				({ lessPath, emitted }) =>
					`${lessPath} compiled to ${emitted.length} bytes — it holds ${EMIT_FREE_PARTIALS[lessPath]}`,
			);
		expect(
			offenders,
			`A partial that exists to be imported everywhere emitted CSS, so its bytes ship once per importing entrypoint — that is the 237 KB duplication the 2026-08-02 splits removed.\n\nPut declarations in layout/vars_tokens.less (light) or layout/theme_dark.less (dark) — the one palette file per theme. Keep these files to LESS @vars and // line comments, never /** */ blocks.\n\nOffenders:\n${offenders.map((o) => `  ${o}`).join('\n')}`,
		).toEqual([]);
	});

	test('a stylesheet rendered into its own document declares every token it uses', () => {
		const offenders: string[] = [];
		for (const { entrypoint, document } of STANDALONE_DOCUMENTS) {
			const entry = built.find((b) => b.lessPath === entrypoint);
			// a renamed/removed standalone sheet must fail LOUDLY, not vanish from the gate
			expect(
				entry,
				`${entrypoint} is listed as a standalone document but is not an entrypoint`,
			).toBeDefined();
			const body = stripComments((entry as { css: string }).css);
			const local = declared(body);
			for (const token of new Set(
				[...body.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] as string),
			)) {
				if (local.has(token)) continue;
				offenders.push(
					`${entrypoint} uses ${token}, declared nowhere in it — renders into ${document}`,
				);
			}
		}
		expect(
			offenders,
			`A stylesheet loaded into a document WITHOUT main.css uses a custom property nothing declares there, so it computes to the empty value and the rule is dropped.\n\nEither stop using the token, or @import './layout/vars_tokens' from that sheet and add it to TOKEN_OWNERS — that standalone case is the one reason the import exists.\n\nOffenders:\n${offenders.map((o) => `  ${o}`).join('\n')}`,
		).toEqual([]);
	});
	test('only the named palette files declare a palette token on a global root', () => {
		// THE ENTRYPOINT-SPACE BLIND SPOT. Assertions 1 and 2 ask WHICH ENTRYPOINT emits the
		// palette, and the answer is always main.less — so a NEW partial added to its ~120-import
		// graph can declare `:root { --color_white: red }` and retune the app document-wide with
		// this whole file green. An adversarial pass landed exactly that payload and every
		// assertion passed. This one asks WHICH FILE WROTE IT, which only source space can answer.
		const offenders = allLessFiles()
			.filter((f) => !(f in PALETTE_FILES))
			.flatMap((f) => {
				const names = declaresPaletteAtRoot(readFileSync(join(REPO_ROOT, f), 'utf8'), OWNED);
				return names.length === 0
					? []
					: [`${f} → ${names.length}: ${[...new Set(names)].slice(0, 6).join(', ')}`];
			});
		expect(
			offenders,
			`A file outside PALETTE_FILES declares a vars_tokens property on a global root (:root / html / body / *).\n\nIt lands in main.css like any partial, so assertions 1 and 2 cannot see it — and it silently retunes the palette for the whole document.\n\nIf this is a legitimate NEW AXIS of the palette (the way redesign/_tokens.less is a design axis alongside the theme axis), add it to PALETTE_FILES with the axis it varies. If it is one component's override, SCOPE it to that component's selector instead — a scoped custom property is the sanctioned idiom and is bounded by its selector.\n\nOffenders:\n${offenders.map((o) => `  ${o}`).join('\n')}`,
		).toEqual([]);

		// and the allowlist cannot rot into paths that no longer declare anything
		for (const [file, axis] of Object.entries(PALETTE_FILES)) {
			expect(
				declaresPaletteAtRoot(readFileSync(join(REPO_ROOT, file), 'utf8'), OWNED).length,
				`${file} is allowlisted as a palette file (${axis}) but declares no palette token — stale entry, drop it`,
			).toBeGreaterThan(0);
		}
	});
});
