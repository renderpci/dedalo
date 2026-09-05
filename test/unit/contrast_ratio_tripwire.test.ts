/**
 * CONTRAST RATIO tripwire (DEC-12; audit 2026-08-26 row P1-18, finding CLI-23).
 *
 * WHAT WAS WRONG. The light theme — the DEFAULT for every user who never touches
 * the toggle — shipped text/background pairs down to 1.92:1, the brand orange on
 * white at 2.44:1 in every modal title and on the login button. Nothing in the
 * repo computed a ratio: the theme gate checks that a dark token is PAIRED with a
 * light one, and says in its own words that "a paired-but-unreadable dark token
 * still passes"; the duplication gate asserts WHERE a token may be declared,
 * never what it evaluates to. So the palette could be retuned to any value and
 * every gate stayed green.
 *
 * WHAT THIS ASSERTS. For every CSS rule that declares BOTH a foreground and a
 * background, in both shipped palettes (light `:root`, dark `:root[data-theme]`),
 * the WCAG 2.1 relative-luminance contrast ratio is at least 4.5:1 — 3:1 where
 * the same rule declares large text (SC 1.4.3's own exception), and never below
 * 3:1 in any case.
 *
 * THE CORPUS IS THE BUILT CSS, ON PURPOSE. `main.css` is what the browser gets
 * (deploy is a checkout; production never compiles LESS), and it is the only
 * artifact where the pairs that actually CO-OCCUR in one rule are visible — a
 * pure-token derivation can compute ratios for pairs nobody ever writes and
 * cannot see the ones that matter. `css_build_tripwire` proves this file is a
 * byte-exact compile of the `.less` sources, so reading the built file is
 * reading the sources; and `css_source_tripwire` proves the sources are tracked.
 *
 * THE HONEST LIMIT, stated because the audit stated it: a rule that declares a
 * colour and inherits its background from an ancestor is NOT paired here — no
 * static reading of a stylesheet can resolve the cascade. That half belongs to
 * the axe pass inside the browser tier (`client_a11y_budget_tripwire`), which
 * judges the RENDERED tree, where the inherited background is a fact.
 *
 * EXEMPTIONS are enumerated below, one reason each, shrink-only.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const MAIN_CSS = 'client/dedalo/core/page/css/main.css';

/** AA for body text. */
const AA_NORMAL = 4.5;
/** AA for large text (>= 24px, or >= 18.66px bold) — SC 1.4.3's own exception. */
const AA_LARGE = 3.0;

/**
 * Floors. The corpus must not silently shrink to nothing: a refactor that stops
 * the parser from seeing rules would otherwise turn this gate green by finding
 * no pairs at all.
 */
const MIN_RULES_SCANNED = 3000;
const MIN_TOKENS_RESOLVED = 150;
const MIN_PAIRS_JUDGED = 100;

/**
 * ENUMERATED exemptions, shrink-only, one reason each. A selector listed here
 * that no longer fails is red: the exemption outlived the pair it excused.
 */
const EXEMPTIONS: ReadonlyArray<{ selector: string; reason: string }> = [];

// ---------------------------------------------------------------------------
// Colour maths (WCAG 2.1 relative luminance / contrast ratio).
// ---------------------------------------------------------------------------

interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

const NAMED: Record<string, Rgba> = {
	white: { r: 255, g: 255, b: 255, a: 1 },
	black: { r: 0, g: 0, b: 0, a: 1 },
	red: { r: 255, g: 0, b: 0, a: 1 },
	transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function parseColor(raw: string): Rgba | null {
	const value = raw.trim().toLowerCase();
	if (NAMED[value]) return NAMED[value];
	const hex = /^#([0-9a-f]{3,8})$/.exec(value);
	if (hex) {
		const h = hex[1] ?? '';
		const expand = (s: string | undefined) =>
			Number.parseInt((s ?? '0').length === 1 ? `${s}${s}` : (s ?? '00'), 16);
		if (h.length === 3 || h.length === 4) {
			return {
				r: expand(h[0]),
				g: expand(h[1]),
				b: expand(h[2]),
				a: h.length === 4 ? expand(h[3]) / 255 : 1,
			};
		}
		if (h.length === 6 || h.length === 8) {
			return {
				r: Number.parseInt(h.slice(0, 2), 16),
				g: Number.parseInt(h.slice(2, 4), 16),
				b: Number.parseInt(h.slice(4, 6), 16),
				a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
			};
		}
	}
	const fn = /^(rgba?)\(([^)]+)\)$/.exec(value);
	if (fn) {
		const parts = (fn[2] ?? '').split(/[,/\s]+/).filter((p) => p !== '');
		if (parts.length < 3) return null;
		const num = (s: string | undefined) =>
			(s ?? '').endsWith('%')
				? (Number.parseFloat(s ?? '0') * 255) / 100
				: Number.parseFloat(s ?? '0');
		const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
		const rgba = {
			r: num(parts[0]),
			g: num(parts[1]),
			b: num(parts[2]),
			a: Number.isFinite(alpha) ? alpha : 1,
		};
		return Number.isFinite(rgba.r) && Number.isFinite(rgba.g) && Number.isFinite(rgba.b)
			? rgba
			: null;
	}
	return null;
}

/** Composite a translucent colour over an opaque one (what the eye actually sees). */
function composite(top: Rgba, bottom: Rgba): Rgba {
	const a = top.a;
	return {
		r: top.r * a + bottom.r * (1 - a),
		g: top.g * a + bottom.g * (1 - a),
		b: top.b * a + bottom.b * (1 - a),
		a: 1,
	};
}

function relativeLuminance(color: Rgba): number {
	const channel = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(fg: Rgba, bg: Rgba): number {
	const l1 = relativeLuminance(fg);
	const l2 = relativeLuminance(bg);
	const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
	return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// CSS reading.
// ---------------------------------------------------------------------------

interface CssRule {
	selector: string;
	declarations: Record<string, string>;
}

/** Split a stylesheet into flat rules. Comments are stripped; at-rule wrappers are transparent. */
function parseRules(css: string): CssRule[] {
	const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const rules: CssRule[] = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let match: RegExpExecArray | null = re.exec(clean);
	while (match !== null) {
		const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ');
		const declarations: Record<string, string> = {};
		for (const decl of (match[2] ?? '').split(';')) {
			const idx = decl.indexOf(':');
			if (idx === -1) continue;
			const prop = decl.slice(0, idx).trim().toLowerCase();
			const value = decl
				.slice(idx + 1)
				.trim()
				.replace(/\s*!important$/i, '');
			if (prop !== '') declarations[prop] = value;
		}
		if (selector !== '' && !selector.startsWith('@')) {
			rules.push({ selector, declarations });
		}
		match = re.exec(clean);
	}
	return rules;
}

/** Collect a palette's custom properties from the rules whose selector matches. */
function collectTokens(
	rules: CssRule[],
	selectorMatches: (s: string) => boolean,
): Map<string, string> {
	const tokens = new Map<string, string>();
	for (const rule of rules) {
		if (!selectorMatches(rule.selector)) continue;
		for (const [prop, value] of Object.entries(rule.declarations)) {
			if (prop.startsWith('--')) tokens.set(prop, value);
		}
	}
	return tokens;
}

/** Follow a var() chain to a literal colour. Returns null when it does not resolve to one. */
function resolveColor(raw: string, tokens: Map<string, string>, depth = 0): Rgba | null {
	if (depth > 12) return null;
	const value = raw.trim();
	const varMatch = /^var\(\s*(--[a-z0-9_-]+)\s*(?:,([\s\S]+))?\)$/i.exec(value);
	if (varMatch) {
		const token = tokens.get(varMatch[1] ?? '');
		if (token !== undefined) return resolveColor(token, tokens, depth + 1);
		return varMatch[2] !== undefined ? resolveColor(varMatch[2], tokens, depth + 1) : null;
	}
	// a shorthand background like "var(--x) no-repeat" or "#fff url(...)": take the first colour-ish token
	if (/\s/.test(value) && !/^rgba?\(/i.test(value)) {
		for (const part of value.split(/\s+(?![^(]*\))/)) {
			const resolved = resolveColor(part, tokens, depth + 1);
			if (resolved) return resolved;
		}
		return null;
	}
	return parseColor(value);
}

/** Is this rule's text large enough for the 3:1 threshold? */
function isLargeText(declarations: Record<string, string>): boolean {
	const size = declarations['font-size'];
	const weight = declarations['font-weight'];
	if (!size) return false;
	const px = /^([\d.]+)px$/.exec(size.trim());
	const rem = /^([\d.]+)rem$/.exec(size.trim());
	const value = px
		? Number.parseFloat(px[1] ?? '0')
		: rem
			? Number.parseFloat(rem[1] ?? '0') * 16
			: null;
	if (value === null) return false;
	const bold = weight !== undefined && (weight === 'bold' || Number.parseInt(weight, 10) >= 700);
	return value >= 24 || (bold && value >= 18.66);
}

interface JudgedPair {
	selector: string;
	palette: string;
	ratio: number;
	threshold: number;
	fg: string;
	bg: string;
}

/** The whole judgement, exported so a positive control can drive it over a synthetic sheet. */
function judgeStylesheet(
	css: string,
	palette: {
		name: string;
		isPaletteSelector: (s: string) => boolean;
		isRuleSelector: (s: string) => boolean;
	},
): { rules: number; tokens: number; pairs: JudgedPair[] } {
	const rules = parseRules(css);
	const tokens = collectTokens(rules, palette.isPaletteSelector);
	const pairs: JudgedPair[] = [];
	for (const rule of rules) {
		if (!palette.isRuleSelector(rule.selector)) continue;
		const fgRaw = rule.declarations.color;
		const bgRaw = rule.declarations['background-color'] ?? rule.declarations.background;
		if (!fgRaw || !bgRaw) continue;
		// `color-mix()` and friends are computed by the browser, not resolvable
		// here: they belong to the axe leg, which reads the RENDERED value.
		if (/color-mix\(|gradient\(/i.test(bgRaw) || /color-mix\(|gradient\(/i.test(fgRaw)) continue;
		// A rule that paints a background-IMAGE over its background-colour is not
		// judgeable from the declarations either: the image is what the eye sees
		// (the tool header's identity band is exactly this shape). The axe leg
		// reads the rendered pixel; this one declines to guess.
		if (rule.declarations['background-image'] !== undefined) continue;
		const fg = resolveColor(fgRaw, tokens);
		const bgResolved = resolveColor(bgRaw, tokens);
		if (!fg || !bgResolved) continue;
		// A FULLY transparent background is not a pair: the real background comes
		// from an ancestor, which no static reading of a stylesheet can resolve.
		// That is this gate's stated limit and the axe leg's half of the work.
		if (bgResolved.a === 0) continue;
		// composite over the palette's own page canvas: a translucent background
		// scored without it reads as pure black and fakes a failure.
		const canvas = resolveColor('var(--bg_app)', tokens) ?? { r: 255, g: 255, b: 255, a: 1 };
		const bg = bgResolved.a < 1 ? composite(bgResolved, canvas) : bgResolved;
		const fgOver = fg.a < 1 ? composite(fg, bg) : fg;
		pairs.push({
			selector: rule.selector,
			palette: palette.name,
			ratio: contrastRatio(fgOver, bg),
			threshold: isLargeText(rule.declarations) ? AA_LARGE : AA_NORMAL,
			fg: fgRaw,
			bg: bgRaw,
		});
	}
	return { rules: rules.length, tokens: tokens.size, pairs };
}

const isDarkSelector = (s: string) =>
	s.includes('[data-theme="dark"]') || s.includes("[data-theme='dark']");
const isDesignSelector = (s: string) => s.includes('[data-design=');

/**
 * A palette declaration is a ROOT-ONLY selector. A token re-pointed under a
 * descendant (`:root:not([data-theme="dark"]) .tool_header { --fg_muted: … }`,
 * the sanctioned scoped-override idiom) is NOT the palette: reading it as one
 * hands every rule in the document a value that only one widget ever sees.
 */
const rootParts = (selector: string) => selector.split(',').map((s) => s.trim());
const isLightRoot = (selector: string) =>
	rootParts(selector).some((s) => s === ':root' || s === 'html');
const isDarkRoot = (selector: string) =>
	rootParts(selector).some((s) => /^(:root|html)\[data-theme=["']dark["']\]$/.test(s));

const PALETTES = [
	{
		name: 'light',
		isPaletteSelector: isLightRoot,
		isRuleSelector: (s: string) => !isDarkSelector(s) && !isDesignSelector(s),
	},
	{
		name: 'dark',
		// the design axis ([data-design="redesign"]) is an OPT-IN third palette, not
		// a theme: it re-declares the same token names under its own selector, so
		// letting it into the theme's token map scores pairs no user is served.
		isPaletteSelector: (s: string) => (isLightRoot(s) || isDarkRoot(s)) && !isDesignSelector(s),
		isRuleSelector: (s: string) => !isDesignSelector(s),
	},
];

describe('contrast_ratio_tripwire', () => {
	const css = readFileSync(join(REPO_ROOT, MAIN_CSS), 'utf8');

	test('the corpus is the whole shipped stylesheet, not a sample', () => {
		const rules = parseRules(css);
		expect(rules.length).toBeGreaterThan(MIN_RULES_SCANNED);
		const tokens = collectTokens(rules, (s) => s === ':root');
		expect(tokens.size).toBeGreaterThan(MIN_TOKENS_RESOLVED);
	});

	test('every text-on-background pair the stylesheet declares meets WCAG AA', () => {
		const failures: string[] = [];
		let judged = 0;
		for (const palette of PALETTES) {
			const result = judgeStylesheet(css, palette);
			judged += result.pairs.length;
			for (const pair of result.pairs) {
				if (pair.ratio >= pair.threshold) continue;
				if (EXEMPTIONS.some((e) => e.selector === pair.selector)) continue;
				failures.push(
					`${pair.palette}: ${pair.selector} — ${pair.ratio.toFixed(2)}:1 (needs ${pair.threshold}:1) color:${pair.fg} on ${pair.bg}`,
				);
			}
		}
		expect(judged).toBeGreaterThan(MIN_PAIRS_JUDGED);
		expect(failures.sort().join('\n')).toBe('');
	});

	test('the maths is the WCAG formula (positive control on known pairs)', () => {
		const white = parseColor('#ffffff') as Rgba;
		const black = parseColor('#000000') as Rgba;
		expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
		expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
		// the finding's own headline pair: the brand orange on white
		expect(contrastRatio(parseColor('#f78a1c') as Rgba, white)).toBeLessThan(2.6);
	});

	test('a planted failing rule IS caught (the detector is not vacuous)', () => {
		const planted =
			':root{--brand:#f78a1c;} .planted_offender{color:var(--brand);background-color:#ffffff;}';
		const result = judgeStylesheet(planted, PALETTES[0] as (typeof PALETTES)[number]);
		const offender = result.pairs.find((p) => p.selector === '.planted_offender');
		expect(offender).toBeDefined();
		expect((offender as JudgedPair).ratio).toBeLessThan(AA_NORMAL);
	});

	test('every enumerated exemption still names a pair that fails', () => {
		const failing = new Set<string>();
		for (const palette of PALETTES) {
			for (const pair of judgeStylesheet(css, palette).pairs) {
				if (pair.ratio < pair.threshold) failing.add(pair.selector);
			}
		}
		const stale = EXEMPTIONS.filter((e) => !failing.has(e.selector)).map((e) => e.selector);
		expect(stale.join(', ')).toBe('');
	});
});
