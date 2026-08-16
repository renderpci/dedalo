/**
 * TOOL HEADER CONTRACT (DEC-12) — the unified header stays unified.
 *
 * `client/dedalo/core/tools_common/css/tool_common.less` owns the tool header for every
 * tool and both themes: the surface (identity hue demoted to a 4px top edge over
 * --bg_surface_alt), the ink, and the controls band `>.tool_buttons_container` —
 * its geometry, its one control height, the caption idiom, the select shape and
 * the narrow-viewport behaviour.
 *
 * That ownership was established by sweeping the same declarations back OUT of
 * the 36 per-tool stylesheets, where they had drifted into 36 different answers:
 * `align-items` was flex-start in tool_indexation, center in
 * numisdata_order_coins and flex-end in tool_subtitles, so the captions in one
 * tool sat on a different line from the captions in the next, and 54 hard-set
 * `@color_white` declarations pinned the ink to a colour that only worked on the
 * saturated slab the header no longer is.
 *
 * Nothing stops that drifting back. A new tool is written by copying a
 * neighbour, and the neighbour used to carry these rules — so this gate exists,
 * per DEC-12: the invariant is stated in tool_common.less, therefore it is
 * mechanically enforced here.
 *
 * THREE assertions, all TOTAL over `tools/&ast;/css/&ast;.less`:
 *
 *  1. Every tool paints the identity hue on its header. Under the edge
 *     treatment that 4px strip is the ONLY thing naming the tool you are in, so
 *     a tool that never paints it inherits the generic Dédalo orange and reads
 *     as any other tool. tool_print and tool_assistant both did exactly that
 *     until 2026-07-31.
 *
 *  2. No tool declares the BAND'S OWN geometry. Styling the band's CHILDREN
 *     stays open — a tool legitimately needs a wider select or an icon+text
 *     button (see tool_transcription) — but the height, padding, gaps and
 *     alignment of the row itself are what make it the same row in every tool.
 *
 *  3. No tool hard-sets header ink to a literal colour. The header ink is
 *     token-driven (`var(--fg_default)` / `var(--fg_muted)`, with `--color_white`
 *     re-scoped inside the header), which is what lets ONE change retune both
 *     themes; a literal hex or `@color_white` opts that tool out of the theme.
 *
 * Exemptions are named, with a reason, in EXEMPTIONS below — never silent.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * Declarations that belong to the shared band and to nothing else. Checked ONLY
 * on a rule whose selector ends at `.tool_buttons_container` — i.e. the band
 * node itself, not its contents.
 */
const BAND_GEOMETRY_PROPS = [
	'display',
	'align-items',
	'align-content',
	'flex-wrap',
	'gap',
	'row-gap',
	'column-gap',
	'height',
	'min-height',
	'max-height',
	'padding',
	'padding-top',
	'padding-bottom',
	'padding-left',
	'padding-right',
	'margin',
	'margin-top',
	'margin-bottom',
	'margin-left',
	'margin-right',
	'background-color',
	'border-top',
];

/** A literal colour, or the token the header re-scopes for legacy declarations. */
const LITERAL_INK =
	/^\s*color\s*:\s*(#[0-9a-fA-F]{3,8}|@color_white|var\(\s*--color_white\s*\)|rgba?\()/;

/**
 * Named exemptions. Key = `<tool>:<what>`, value = why it is legitimate.
 * Empty today; a future entry must say what the tool needs that the shared
 * contract genuinely cannot express.
 */
const EXEMPTIONS: Record<string, string> = {};

type Rule = { selector: string; body: string; line: number };

/**
 * Flatten a LESS file into (selector-path, own-declarations) pairs.
 *
 * Brace-matched rather than regex'd because these files nest four and five
 * levels deep and a regex cannot tell a nested block's declarations from its
 * parent's. `selector` is the joined ancestor chain, so a nested
 * `>.tool_buttons_container` inside `.wrapper_tool.tool_x >.tool_header` is
 * recognisable as the band.
 */
function flattenRules(text: string): Rule[] {
	const rules: Rule[] = [];
	/** One frame per open block: its selector, its own declarations so far. */
	const stack: { selector: string; decls: string; line: number }[] = [];
	let buf = '';
	let line = 1;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\n') line++;

		// skip comments wholesale — a commented-out rule is not a rule
		if (ch === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
			line++;
			continue;
		}
		if (ch === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
				if (text[i] === '\n') line++;
				i++;
			}
			i++;
			continue;
		}

		if (ch === '{') {
			// `buf` is [this block's parent's trailing declarations][selector].
			// Splitting at the last `;` is what separates them — without this the
			// declarations that precede a nested block are swallowed into the
			// child's selector and simply never checked.
			const cut = buf.lastIndexOf(';');
			const decls = cut === -1 ? '' : buf.slice(0, cut + 1);
			const selector = (cut === -1 ? buf : buf.slice(cut + 1)).trim().replace(/\s+/g, ' ');
			const parent = stack[stack.length - 1];
			if (parent) parent.decls += decls;
			stack.push({ selector, decls: '', line });
			buf = '';
		} else if (ch === '}') {
			const frame = stack.pop();
			if (frame) {
				rules.push({
					selector: stack
						.map((f) => f.selector)
						.concat(frame.selector)
						.join(' '),
					body: frame.decls + buf,
					line: frame.line,
				});
			}
			buf = '';
		} else {
			buf += ch;
		}
	}
	return rules;
}

function toolStylesheets(): { tool: string; file: string; text: string }[] {
	const out: { tool: string; file: string; text: string }[] = [];
	const glob = new Glob('tools/*/css/*.less');
	for (const file of glob.scanSync({ cwd: REPO_ROOT })) {
		const tool = file.split('/')[1] ?? '';
		// only the tool's own entry stylesheet, not partials it may import
		if (!tool || !file.endsWith(`/${tool}.less`)) continue;
		out.push({ tool, file, text: readFileSync(join(REPO_ROOT, file), 'utf8') });
	}
	return out.sort((a, b) => a.tool.localeCompare(b.tool));
}

/** True when the selector names the band node itself (not a descendant of it). */
function isBandNode(selector: string): boolean {
	const last = selector.split(' ').filter(Boolean).pop() ?? '';
	return /(^|[>\s.])\.?tool_buttons_container$/.test(last.replace(/^>/, ''));
}

/** True when the selector sits anywhere inside the tool header. */
function isHeaderContext(selector: string): boolean {
	return /tool_header|tool_buttons_container|tool_name_container/.test(selector);
}

describe('tool header contract (DEC-12)', () => {
	const sheets = toolStylesheets();

	test('there are tool stylesheets to check (the gate cannot pass vacuously)', () => {
		expect(sheets.length).toBeGreaterThan(30);
	});

	test('every tool paints the identity hue on its header', () => {
		const missing: string[] = [];
		for (const { tool, file, text } of sheets) {
			if (EXEMPTIONS[`${tool}:identity_hue`]) continue;
			const painted = flattenRules(text).some(
				(r) => /\.tool_header/.test(r.selector) && /(^|\n)\s*background-color\s*:/.test(r.body),
			);
			if (!painted) missing.push(file);
		}
		expect(
			missing,
			'These tools never paint their header, so the 4px identity edge — the only thing naming the tool — falls back to the generic Dédalo orange. Add `.tool_header.<tool> { background-color: @tool_color; }` (background-COLOR, never the `background` shorthand: the shorthand resets the gradient tool_common paints the header surface with).',
		).toEqual([]);
	});

	test('no tool declares the controls band’s own geometry', () => {
		const offenders: string[] = [];
		for (const { tool, file, text } of sheets) {
			for (const rule of flattenRules(text)) {
				if (!isBandNode(rule.selector)) continue;
				for (const decl of rule.body.split(';')) {
					const prop = decl.split(':')[0]?.trim().toLowerCase();
					if (!prop || !BAND_GEOMETRY_PROPS.includes(prop)) continue;
					if (EXEMPTIONS[`${tool}:band_${prop}`]) continue;
					offenders.push(`${file}:${rule.line}  ${prop} (on ${rule.selector})`);
				}
			}
		}
		expect(
			offenders,
			`The band's height, padding, gaps and alignment are tool_common.less's — that is what makes it the same row in every tool. Style the band's CHILDREN instead, or add a named EXEMPTIONS entry saying what the shared contract cannot express.`,
		).toEqual([]);
	});

	/**
	 * The MODAL case, pinned separately because the ink that broke it did not
	 * come from a tool stylesheet at all — the three assertions above would
	 * never have caught it.
	 *
	 * `dd-modal .header` (layout.less) sets `color: var(--modal_header_color)`,
	 * and that token is declared `var(--color_white)` at `:root`, so it computes
	 * to #ffffff THERE and inherits down as a literal white — the header's own
	 * `--color_white` re-point cannot reach it, because a custom property is
	 * substituted where it is declared, not where it is used. The modal tool
	 * header therefore rendered its title white on the neutral surface.
	 *
	 * tool_common.less restates the ink in its `&.header` branch at (0,2,0),
	 * which out-specifies `dd-modal .header` (0,1,1). This asserts that branch
	 * still exists: deleting it as "redundant" silently restores the bug.
	 */
	test('the modal tool header restates its ink over dd-modal', () => {
		const compiled = readFileSync(join(REPO_ROOT, 'client/dedalo/core/page/css/main.css'), 'utf8');
		const rule = /\.tool_header\.header\s*\{[^}]*\bcolor\s*:\s*var\(--fg_default\)/;
		expect(
			rule.test(compiled),
			`main.css has no \`.tool_header.header { color: var(--fg_default) }\`. Without it, \`dd-modal .header { color: var(--modal_header_color) }\` wins and a tool opened in a modal renders its NAME in white on the neutral header surface — the token resolves to #ffffff at :root and the header's --color_white re-point cannot reach it.`,
		).toBe(true);
	});

	/**
	 * Same class of bug, one element further out and unreachable by any selector
	 * here: the modal's minimise/close glyphs live in dd-modal's SHADOW ROOT
	 * (dd-modal.js `.mini_modal` / `.close_modal`). They read
	 * `--modal_btn_color` / `--modal_btn_hover_color`, which cross the shadow
	 * boundary by INHERITANCE from the host — and whose default is white,
	 * correct on the modal's own orange bar and invisible on the neutral surface
	 * a tool header paints. tool_common.less re-points them on the host, for the
	 * tool case only (`dd-modal:has(.tool_header)`), so a plain modal keeps the
	 * white glyphs its own bar needs.
	 */
	test('a tool-headed modal re-points the shadow-DOM chrome buttons', () => {
		const compiled = readFileSync(join(REPO_ROOT, 'client/dedalo/core/page/css/main.css'), 'utf8');
		const rule =
			/dd-modal:has\(\.tool_header\)\s*\{[^}]*--modal_btn_color\s*:[^}]*--modal_btn_hover_color\s*:/;
		expect(
			rule.test(compiled),
			`main.css has no \`dd-modal:has(.tool_header) { --modal_btn_color: …; --modal_btn_hover_color: … }\`. Without it the modal's own minimise and close glyphs inherit the default white — correct on the modal's orange bar, invisible on the neutral surface a tool header paints. They are in a shadow root, so a custom property on the host is the ONLY way to reach them.`,
		).toBe(true);
	});

	test('no tool hard-sets header ink to a literal colour', () => {
		const offenders: string[] = [];
		for (const { tool, file, text } of sheets) {
			for (const rule of flattenRules(text)) {
				if (!isHeaderContext(rule.selector)) continue;
				for (const decl of rule.body.split(';')) {
					if (!LITERAL_INK.test(decl)) continue;
					if (EXEMPTIONS[`${tool}:header_ink`]) continue;
					offenders.push(`${file}:${rule.line}  ${decl.trim()} (on ${rule.selector})`);
				}
			}
		}
		expect(
			offenders,
			'Header ink is token-driven (var(--fg_default) / var(--fg_muted)), which is what lets one change retune both themes. A literal colour opts that tool out of the theme — this is the failure that put 44 white declarations on a bar that is no longer saturated.',
		).toEqual([]);
	});
});
