/**
 * TOOL COLOUR CONTRAST (DEC-12) — a tool's colour never reaches text unpaired.
 *
 * Every tool has ONE identity hue (`--<tool>` in its sheet). The hues are
 * mid-tones picked for recognition: white clears 4.5:1 on about half of them,
 * near-black on the other half, some on neither. So text never sits on the raw
 * hue. scripts/tool_colors.ts derives, per tool and per theme, a button fill
 * (the hue moved in OKLCH lightness) + the ink for it, and the header wash, into
 * the GENERATED client/dedalo/core/tools_common/css/tool_colors.less.
 *
 * The failure this exists for (2026-09-27): tool_propagate_component_data
 * repainted core `.warning` buttons with its red and kept the core near-black
 * ink — 2.63:1, unreadable; tool_ontology_parser did the same with its green
 * (3.01:1). The pair was split across two files (fill in the tool, ink in
 * buttons.less), which is why no review caught it.
 *
 * FOUR assertions:
 *  1. the generated file is what the generator produces from today's hues
 *     (a hue edited without `bun run css:tool-colors` is stale output);
 *  2. every generated fill/ink pair clears 4.5:1 — MEASURED HERE with this
 *     file's own WCAG code, not the generator's;
 *  3. the header's muted ink clears 4.5:1 on every tool's header wash, both
 *     themes (the wash is the hue mixed into the surface: a dark hue darkens it);
 *  4. no tool sheet paints a `button` with its raw hue — a button takes the
 *     tool colour only through `.tool_action_button()` (tool_mixins.less),
 *     which carries fill + ink + glyph as one set;
 *  5. no CORE sheet (compiled main.css) paints a tool LAUNCHER button
 *     (`button.tool_<x>`, stamped by ui.tool.build_section_tool_button): the
 *     launcher is a toolbar button and takes the toolbar's look (buttons.less,
 *     no fill at rest). area_ontology painted tool_ontology_parser's launcher
 *     with the raw ontology green under the `.warning` ink (~2.5:1) — outside
 *     tools/, so assertion 4 never saw it (2026-09-30).
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectHues, OUT_FILE, render } from '../../scripts/tool_colors.ts';
import { toolDirectoryNames } from '../helpers/tool_directory_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const MIN = 4.5;

// ---- WCAG 2.x, independent of the generator ----
const channel = (c: number) => {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string): [number, number, number] => {
	const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (hex: string) => {
	const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
	const x = lum(a);
	const y = lum(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** `color-mix(in srgb, hue share, surface)` — the space tool_common mixes in. */
const mix = (hue: string, surface: string, share: number) => {
	const h = rgb(hue);
	const s = rgb(surface);
	return `#${h
		.map((c, i) =>
			Math.round(c * share + (s[i] as number) * (1 - share))
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`;
};

type Block = { selector: string; decls: Record<string, string> };
/** The generated file is flat: `<selector> { --x: v; … }`. */
const generatedBlocks = (text: string): Block[] =>
	[...text.replace(/\/\/[^\n]*/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
		selector: (m[1] as string).trim(),
		decls: Object.fromEntries(
			[...(m[2] as string).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((d) => [
				d[1] as string,
				(d[2] as string).trim(),
			]),
		),
	}));
/**
 * Element-`button` rules of a compiled tool sheet that paint the tool's RAW hue
 * (`@tool_color` compiles to `var(--<tool>)`). `.button` / `.button_*` classes
 * are icon masks — a hover tint on a glyph, not a fill under text — and stay open.
 */
const rawHueButtons = (tool: string, css: string): string[] =>
	[...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
		.filter((m) => /(^|[\s>+~(,])button(?![\w-])/.test(m[1] as string))
		.filter((m) =>
			new RegExp(`background(-color)?\\s*:\\s*var\\(--${tool}\\)`).test(m[2] as string),
		)
		.map((m) => (m[1] as string).trim().replace(/\s+/g, ' '));

/**
 * Rules of a compiled CORE sheet that set a background on an element `button`
 * carrying a `tool_<x>` class — a tool launcher repainted outside its toolbar look.
 */
const launcherPaints = (css: string): string[] =>
	[...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
		.filter((m) => /(^|[\s>+~(,])button(\.[\w-]+)*\.tool_[\w]+/.test(m[1] as string))
		.filter((m) => /(^|[;\s])background(-color)?\s*:/.test(m[2] as string))
		.map((m) => (m[1] as string).trim().replace(/\s+/g, ' '));

/** `var(--tool_x, #hex)` → `#hex` (the resolved fallback the generator writes). */
const fallbackHex = (v: string) => v.match(/#[0-9a-fA-F]{6}\b/)?.[0] ?? v;

describe('tool colour contrast (DEC-12)', () => {
	const generated = readFileSync(OUT_FILE, 'utf8');
	const blocks = generatedBlocks(generated);

	test('the generated file is fresh', () => {
		expect(
			generated === render(collectHues().hues),
			'tool_colors.less does not match its generator — a tool hue changed without `bun run css:tool-colors`.',
		).toBe(true);
	});

	test('every generated fill/ink pair clears 4.5:1 (measured here)', () => {
		expect(blocks.length).toBeGreaterThan(60);
		// not vacuous: every tool, both themes
		expect(blocks.length).toBe(collectHues().hues.length * 2);
		const low: string[] = [];
		for (const { selector, decls } of blocks) {
			for (const fill of ['--tool_fill', '--tool_fill_hover']) {
				const r = ratio(decls[fill] as string, decls['--tool_on_fill'] as string);
				if (!(r >= MIN))
					low.push(
						`${selector} ${fill} ${decls[fill]} / ${decls['--tool_on_fill']} = ${r.toFixed(2)}`,
					);
			}
		}
		expect(
			low,
			'Regenerate with `bun run css:tool-colors`; never hand-edit the generated file.',
		).toEqual([]);
	});

	test("the header's muted ink clears 4.5:1 on every tool's wash, both themes", () => {
		const common = read('client/dedalo/core/tools_common/css/tool_common.less');
		const share =
			Number(
				common.match(/--tool_wash:\s*color-mix\(in srgb,\s*var\(--tool_edge[^)]*\)\s*(\d+)%/)?.[1],
			) / 100;
		const mutedLight = common.match(
			/:root:not\(\[data-theme="dark"\]\) \.tool_header \{\s*--fg_muted:\s*(#[0-9a-f]{6})/i,
		)?.[1];
		const dark = read('client/dedalo/core/page/css/layout/theme_dark.less');
		const mutedDark = dark.match(/^\s*--fg_muted:\s*(#[0-9a-f]{6})/im)?.[1];
		const surfaceDark = dark.match(/^\s*--bg_surface_alt:\s*(#[0-9a-f]{6})/im)?.[1];
		const tokens = read('client/dedalo/core/page/css/layout/vars_tokens.less');
		const surfaceLight = tokens.match(/^\s*--color_grey_15:\s*(#[0-9a-f]{6})/im)?.[1]; // --bg_surface_alt in light
		for (const v of [share, mutedLight, mutedDark, surfaceDark, surfaceLight])
			expect(v).toBeTruthy();

		expect(blocks.length).toBeGreaterThan(60);
		const low: string[] = [];
		for (const { selector, decls } of blocks) {
			const isDark = selector.startsWith(':root[data-theme="dark"]');
			const edge = fallbackHex(decls['--tool_edge'] as string);
			const wash = mix(edge, (isDark ? surfaceDark : surfaceLight) as string, share);
			const r = ratio((isDark ? mutedDark : mutedLight) as string, wash);
			if (!(r >= MIN)) low.push(`${selector}: muted on wash ${wash} = ${r.toFixed(2)}`);
		}
		expect(
			low,
			'Lower the wash share in tool_common.less (--tool_wash) or darken/lighten the header --fg_muted.',
		).toEqual([]);
	});

	test('positive control: the button scan catches a planted raw-hue fill, and only that', () => {
		const planted = [
			'.wrapper_tool.tool_x > .c button { background-color: var(--tool_x); }',
			'.wrapper_tool.tool_x button.warning:hover { background: var(--tool_x); }',
			// legal: an icon mask class, the mixin's generated fill, another token
			'.column_section_id > .button_edit.list_tool_x:hover { background-color: var(--tool_x); }',
			'.wrapper_tool.tool_x button { background-color: var(--tool_fill); }',
			'.wrapper_tool.tool_x button { background-color: var(--tool_x_fill); }',
		].join('\n');
		expect(rawHueButtons('tool_x', planted)).toEqual([
			'.wrapper_tool.tool_x > .c button',
			'.wrapper_tool.tool_x button.warning:hover',
		]);
	});

	test('no tool sheet paints a button with its raw hue', () => {
		// compiled CSS: `@tool_color` has become `var(--tool_x)`. An ELEMENT
		// `button` selector only — `.button_edit` / `.button` masks are icons (a
		// hover tint on a glyph), not a fill under text.
		const sheets = toolDirectoryNames()
			.map((tool) => ({ tool, file: `tools/${tool}/css/${tool}.css` }))
			.filter(({ file }) => existsSync(join(REPO_ROOT, file)));
		expect(sheets.length).toBeGreaterThan(30);
		const offenders = sheets.flatMap(({ tool, file }) =>
			rawHueButtons(tool, read(file)).map((s) => `${file}: ${s}`),
		);
		expect(
			offenders,
			'Use `.tool_action_button();` (tool_mixins.less): it paints the generated fill WITH its ink and glyph colour.',
		).toEqual([]);
	});

	test('positive control: the launcher scan catches a core repaint, and only that', () => {
		const planted = [
			'.area_x > .buttons_container button.tool_x { background-color: var(--color_x); }',
			'.b button.warning.tool_x:hover { background: red; }',
			// legal: an icon mask class, a non-background rule, a non-tool class
			'.wrapper_tool .button.tool_button { background-color: red; }',
			'.b button.tool_x { margin: 0; }',
			'.b button.warning { background-color: red; }',
		].join('\n');
		expect(launcherPaints(planted)).toEqual([
			'.area_x > .buttons_container button.tool_x',
			'.b button.warning.tool_x:hover',
		]);
	});

	test('no core sheet repaints a tool launcher button', () => {
		const css = read('client/dedalo/core/page/css/main.css');
		expect(css.length).toBeGreaterThan(100_000);
		expect(
			launcherPaints(css),
			'A tool launcher is a toolbar button: it takes the toolbar look (buttons.less), never a per-tool fill.',
		).toEqual([]);
	});
});
