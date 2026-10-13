/**
 * THE FULL-SCREEN UI'S LINES (terminal installer phase 3, 2026-10-12) — every
 * pane, rail, header and footer row is a LINE: segments of text with a role
 * (palette.ts), measured in terminal columns, cut to the width it is drawn in.
 * The UI never lets the renderer wrap: what does not fit is truncated with `…`
 * here, so a frame never overflows its border at any size.
 *
 * toStyled turns a line into OpenTUI's StyledText through its chunks — never by
 * interpolating a StyledText into a template (it would print "[object Object]").
 * Every text that reaches a segment from outside the installer (a catalog name,
 * a probe or engine message) is sanitized by its caller (display_text.ts).
 */

import { bg, bold, fg, reverse, StyledText, type TextChunk } from '@opentui/core';
import type { Palette, Role } from './palette.ts';

/** One run of text in one style. */
export interface Seg {
	text: string;
	role?: Role;
	bold?: boolean;
	/** The selected row's background (NO_COLOR: reverse video). */
	sel?: boolean;
	/** The header's route chip: accent background, dark bold text (NO_COLOR: reverse). */
	chip?: boolean;
}

export type Line = Seg[];

export function seg(
	text: string,
	role: Role = 'text',
	extra: Omit<Seg, 'text' | 'role'> = {},
): Seg {
	return { text, role, ...extra };
}

/** A terminal column count (wide characters count 2). */
export function widthOf(text: string): number {
	return Bun.stringWidth(text);
}

export function lineWidth(line: Line): number {
	return line.reduce((sum, item) => sum + widthOf(item.text), 0);
}

/** `text` cut to `width` columns, `…` marking the cut. */
export function cutText(text: string, width: number): string {
	if (widthOf(text) <= width) return text;
	let out = '';
	for (const char of text) {
		if (widthOf(`${out}${char}`) > width - 1) break;
		out += char;
	}
	return `${out}…`;
}

/** The line cut to `width` columns (the segment that crosses it ends in `…`). */
export function truncateLine(line: Line, width: number): Line {
	const out: Line = [];
	let used = 0;
	for (const item of line) {
		const room = width - used;
		if (room <= 0) break;
		const text = widthOf(item.text) <= room ? item.text : cutText(item.text, room);
		out.push({ ...item, text });
		used += widthOf(text);
	}
	return out;
}

/** The line padded with spaces (in its last segment's selection) to `width`. */
export function padLine(line: Line, width: number): Line {
	const missing = width - lineWidth(line);
	if (missing <= 0) return line;
	const last = line.at(-1);
	return [...line, { text: ' '.repeat(missing), sel: last?.sel === true }];
}

/** The line as a selected row: every segment on the selection, padded to `width`. */
export function selectedLine(line: Line, width: number): Line {
	return padLine(
		truncateLine(line, width).map((item) => ({ ...item, sel: true })),
		width,
	);
}

/** Text right-aligned after `left` within `width` (the left part is cut first). */
export function spread(left: Line, right: Line, width: number): Line {
	const rightWidth = lineWidth(right);
	const leftCut = truncateLine(left, Math.max(0, width - rightWidth - 1));
	const gap = Math.max(1, width - lineWidth(leftCut) - rightWidth);
	return truncateLine([...leftCut, { text: ' '.repeat(gap) }, ...right], width);
}

type Style = (input: string | TextChunk) => TextChunk;

/** The foreground a segment takes (none under NO_COLOR). */
function fgStyle(item: Seg, palette: Palette): Style[] {
	const color = palette.fg(item.role ?? 'text');
	return color === undefined ? [] : [fg(color)];
}

/** The selection: its background, or reverse video under NO_COLOR. */
function selStyle(item: Seg, palette: Palette): Style[] {
	if (item.sel !== true) return [];
	return [palette.sel === undefined ? reverse : bg(palette.sel)];
}

/** Bold: asked for, or the accent under NO_COLOR (emphasis without colour). */
function boldStyle(item: Seg, palette: Palette): Style[] {
	const emphasis = item.bold === true || (!palette.color && item.role === 'accent');
	return emphasis ? [bold] : [];
}

/** The route chip: accent background + dark bold text; NO_COLOR: reverse bold. */
function chipStyles(palette: Palette): Style[] {
	if (!palette.color) return [reverse, bold];
	return [fg(palette.fg('chip') as string), bg(palette.fg('accent') as string), bold];
}

/** The styles one segment takes under `palette`. */
function stylesOf(item: Seg, palette: Palette): Style[] {
	if (item.chip === true) return chipStyles(palette);
	return [...fgStyle(item, palette), ...selStyle(item, palette), ...boldStyle(item, palette)];
}

function chunkOf(item: Seg, palette: Palette): TextChunk {
	const plain: TextChunk = { __isChunk: true, text: item.text };
	return stylesOf(item, palette).reduce<TextChunk>((chunk, style) => style(chunk), plain);
}

/** THE conversion: a line → StyledText (chunks only). */
export function toStyled(line: Line, palette: Palette): StyledText {
	return new StyledText(line.map((item) => chunkOf(item, palette)));
}
