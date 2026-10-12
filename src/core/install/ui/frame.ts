/**
 * THE FRAME (terminal installer phase 3, 2026-10-12) — the approved mockup's
 * layout, drawn from a FrameModel: the header (`▟▙ Dédalo installer <version>`,
 * the route chip, the status on the right), the left rail of steps (rounded,
 * " steps "), the orange rounded pane with the screen's lines, the footer's key
 * hints — or, for the Welcome and Done screens, the CARD with the logo (≥ 30
 * rows; below that the one-line header mark instead). Every row is one Text
 * already cut to its width (styled.ts): nothing wraps, nothing overflows.
 *
 * The tree is rebuilt on every draw (the mockup's remove + destroyRecursively),
 * so a resize or a new screen never leaves a stale renderable behind.
 */

import { BoxRenderable, type CliRenderer, TextRenderable } from '@opentui/core';
import { logoLines } from './logo.ts';
import type { Palette } from './palette.ts';
import { type Line, seg, spread, toStyled, truncateLine, widthOf } from './styled.ts';
import { type Layout, windowStart } from './view_state.ts';
import type { KeyHint } from './widget.ts';

export interface PaneModel {
	title: string;
	lines: Line[];
	focus: number;
	/** Drawn under the window, always visible (an action line). */
	pinned?: Line[];
}

export interface CardModel {
	title: string;
	tone: 'accent' | 'ok' | 'err' | 'warn';
	info: Line[];
	below: Line[];
}

export type FrameModel =
	| { kind: 'frame'; header: Line; rail: Line[]; pane: PaneModel; footer: readonly KeyHint[] }
	| { kind: 'card'; header: Line; card: CardModel; footer: readonly KeyHint[] }
	| { kind: 'small'; lines: Line[] };

interface Draw {
	renderer: CliRenderer;
	palette: Palette;
	layout: Layout;
}

/** One row of text (cut to `width`). */
function textRow(draw: Draw, line: Line, width: number): TextRenderable {
	return new TextRenderable(draw.renderer, {
		content: toStyled(truncateLine(line, width), draw.palette),
		height: 1,
		flexShrink: 0,
		wrapMode: 'none',
	});
}

/** The footer: as many hints as fit, in their priority order. */
export function footerLine(hints: readonly KeyHint[], width: number): Line {
	const line: Line = [];
	let used = 0;
	for (const [key, label] of hints) {
		const size = widthOf(key) + 1 + widthOf(label) + (line.length === 0 ? 0 : 2);
		if (used + size > width) break;
		if (line.length > 0) line.push(seg('  '));
		line.push(seg(key, 'text', { bold: true }), seg(` ${label}`, 'muted'));
		used += size;
	}
	return line;
}

/** The pane's visible lines: a window around the focus, then the pinned lines. */
export function paneRows(pane: PaneModel, height: number): Line[] {
	const pinned = pane.pinned ?? [];
	const room = Math.max(1, height - pinned.length);
	const start = windowStart(pane.lines.length, room, pane.focus);
	return [...pane.lines.slice(start, start + room), ...pinned];
}

/** A border's colour options (none under NO_COLOR: the terminal's own). */
function borderColors(
	border: string | undefined,
	title: string | undefined,
): Record<string, string> {
	return {
		...(border === undefined ? {} : { borderColor: border }),
		...(title === undefined ? {} : { titleColor: title }),
	};
}

/** The rail's shape: full (titles, " steps ") or compact (marks and numbers). */
const RAIL_SHAPE = Object.freeze({
	full: { paddingX: 1, title: ' steps ', inner: 4 },
	compact: { paddingX: 0, title: '', inner: 2 },
});

function railBox(draw: Draw, rail: Line[]): BoxRenderable {
	const shape = RAIL_SHAPE[draw.layout.rail];
	const box = new BoxRenderable(draw.renderer, {
		width: draw.layout.railWidth,
		flexShrink: 0,
		flexDirection: 'column',
		border: true,
		borderStyle: 'rounded',
		...borderColors(draw.palette.railBorder, draw.palette.fg('muted')),
		paddingX: shape.paddingX,
		title: shape.title,
	});
	const inner = draw.layout.railWidth - shape.inner;
	for (const line of rail.slice(0, draw.layout.paneHeight)) box.add(textRow(draw, line, inner));
	return box;
}

function paneBox(draw: Draw, pane: PaneModel): BoxRenderable {
	const box = new BoxRenderable(draw.renderer, {
		flexGrow: 1,
		flexDirection: 'column',
		border: true,
		borderStyle: 'rounded',
		...borderColors(draw.palette.paneBorder, draw.palette.paneBorder),
		paddingX: 2,
		title: ` ${pane.title} `,
	});
	for (const line of paneRows(pane, draw.layout.paneHeight)) {
		box.add(textRow(draw, line, draw.layout.paneWidth));
	}
	return box;
}

/** A row Box holding one text line (header / footer). */
function lineBox(draw: Draw, line: Line, paddingX: number): BoxRenderable {
	const box = new BoxRenderable(draw.renderer, { height: 1, flexShrink: 0, paddingX });
	box.add(textRow(draw, line, draw.layout.cols - paddingX * 2));
	return box;
}

function rootBox(draw: Draw, padding: number): BoxRenderable {
	return new BoxRenderable(draw.renderer, {
		width: '100%',
		height: '100%',
		flexDirection: 'column',
		padding,
		...(draw.palette.bg === undefined ? {} : { backgroundColor: draw.palette.bg }),
	});
}

function drawFrame(draw: Draw, model: Extract<FrameModel, { kind: 'frame' }>): BoxRenderable {
	const root = rootBox(draw, 0);
	root.add(lineBox(draw, model.header, 1));
	const body = new BoxRenderable(draw.renderer, {
		flexDirection: 'row',
		flexGrow: 1,
		paddingX: 1,
		gap: 1,
	});
	body.add(railBox(draw, model.rail));
	body.add(paneBox(draw, model.pane));
	root.add(body);
	root.add(lineBox(draw, footerLine(model.footer, draw.layout.cols - 4), 2));
	return root;
}

/** The card's border colour by tone. */
function toneColor(draw: Draw, tone: CardModel['tone']): string | undefined {
	return draw.palette.color ? draw.palette.fg(tone === 'accent' ? 'accent' : tone) : undefined;
}

/** The card's info column width. */
function infoWidth(draw: Draw): number {
	return Math.max(10, draw.layout.cols - 2 - 2 - 4 - (draw.layout.logo ? 33 : 0));
}

function cardBox(draw: Draw, card: CardModel, maxInfo: number): BoxRenderable {
	const color = toneColor(draw, card.tone);
	const box = new BoxRenderable(draw.renderer, {
		flexDirection: 'row',
		flexShrink: 0,
		border: true,
		borderStyle: 'rounded',
		...borderColors(color, color),
		paddingX: 2,
		paddingY: draw.layout.logo ? 1 : 0,
		gap: 3,
		title: ` ${card.title} `,
	});
	if (draw.layout.logo) {
		const logo = new BoxRenderable(draw.renderer, {
			flexDirection: 'column',
			width: 30,
			flexShrink: 0,
		});
		for (const line of logoLines()) logo.add(textRow(draw, line, 30));
		box.add(logo);
	}
	const info = new BoxRenderable(draw.renderer, { flexDirection: 'column', flexGrow: 1 });
	for (const line of card.info.slice(0, maxInfo)) info.add(textRow(draw, line, infoWidth(draw)));
	box.add(info);
	return box;
}

/** The card's shape with the logo (≥ 30 rows) and without (the header mark instead). */
const CARD_SHAPE = Object.freeze({
	logo: { padding: 1, headerRows: 0, chrome: 4 },
	plain: { padding: 0, headerRows: 1, chrome: 2 },
});

/** How many info rows the card shows. */
function cardRowsOf(draw: Draw, card: CardModel): number {
	return draw.layout.logo ? 16 : Math.min(card.info.length, draw.layout.rows - 8);
}

function drawCard(draw: Draw, model: Extract<FrameModel, { kind: 'card' }>): BoxRenderable {
	const shape = CARD_SHAPE[draw.layout.logo ? 'logo' : 'plain'];
	const root = rootBox(draw, shape.padding);
	if (shape.headerRows > 0) root.add(lineBox(draw, model.header, 1));
	const cardRows = cardRowsOf(draw, model.card);
	root.add(cardBox(draw, model.card, cardRows));
	const room = draw.layout.rows - shape.headerRows - cardRows - shape.chrome - 3;
	const below = new BoxRenderable(draw.renderer, {
		flexDirection: 'column',
		paddingX: 2,
		marginTop: 1,
	});
	for (const line of model.card.below.slice(0, Math.max(0, room))) {
		below.add(textRow(draw, line, draw.layout.cols - 6));
	}
	root.add(below);
	root.add(new BoxRenderable(draw.renderer, { flexGrow: 1 }));
	root.add(lineBox(draw, footerLine(model.footer, draw.layout.cols - 4), 2));
	return root;
}

function drawSmall(draw: Draw, model: Extract<FrameModel, { kind: 'small' }>): BoxRenderable {
	const root = rootBox(draw, 1);
	for (const line of model.lines) root.add(textRow(draw, line, Math.max(1, draw.layout.cols - 2)));
	return root;
}

/** THE draw: the old tree destroyed, the model's tree added, a render requested. */
export function drawModel(
	renderer: CliRenderer,
	palette: Palette,
	layout: Layout,
	model: FrameModel,
): void {
	for (const child of renderer.root.getChildren()) {
		renderer.root.remove(child);
		child.destroyRecursively();
	}
	const draw: Draw = { renderer, palette, layout };
	const DRAW = { frame: drawFrame, card: drawCard, small: drawSmall } as const;
	const root = (DRAW[model.kind] as (draw: Draw, model: FrameModel) => BoxRenderable)(draw, model);
	renderer.root.add(root);
	renderer.requestRender();
}

/** The header line: the mark, the product and version, the route chip; the status right. */
export function headerLine(
	version: string,
	route: string | null,
	status: Line,
	width: number,
): Line {
	const left: Line = [
		seg('▟▙ ', 'accent'),
		seg('Dédalo', 'text', { bold: true }),
		seg(` installer${version === '' ? '' : ` ${version}`}  `, 'muted'),
		...(route === null ? [] : [seg(` ${route} `, 'chip', { chip: true })]),
	];
	return spread(left, status, width);
}
