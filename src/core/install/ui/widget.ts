/**
 * ONE ASK, ON SCREEN (terminal installer phase 3, 2026-10-12) — the shape
 * every full-screen widget has: what it draws (lines, which one has the
 * focus), which keys it answers and their footer hints, and a read-only
 * description of its state for the gates' key driver (`pending`). A widget
 * resolves its ask itself (the prompter hands it the resolver); it never
 * decides an answer the question does not offer.
 */

import type { Palette } from './palette.ts';
import type { Line } from './styled.ts';
import type { Layout } from './view_state.ts';

export type WidgetKind =
	| 'text'
	| 'secret'
	| 'choice'
	| 'multi'
	| 'confirm'
	| 'acknowledge'
	| 'welcome'
	| 'resume'
	| 'probe'
	| 'review'
	| 'done';

/** What a gate's key driver may read (never a secret value). */
export interface PendingAsk {
	id: string;
	kind: WidgetKind;
	/** choice / multi (the filtered rows) / resume / probe: the option values in display order. */
	options?: readonly string[];
	/** choice: the current value; multi: the selection; confirm: ['yes'|'no']; acknowledge: ['yes'] when ticked. */
	selected?: readonly string[];
	cursor?: number;
	filter?: string;
	/** text: the field's text; review: the sub-mode (`command`, `edit`, `write`). */
	value?: string;
	/** secret: `first` or `again`. */
	phase?: string;
}

export interface DrawContext {
	width: number;
	layout: Layout;
	palette: Palette;
}

/** A footer hint: the key, what it does. */
export type KeyHint = readonly [string, string];

export interface Widget {
	readonly id: string;
	readonly kind: WidgetKind;
	/** Typing edits text here: `q ? / e w l` are not hotkeys, F1 is help. */
	readonly editing: boolean;
	/** `field`: drawn in its screen's question list; `page`: the whole pane. */
	readonly placement: 'field' | 'page';
	/** The pane title for a page (a field takes its screen's). */
	readonly title: string;
	/** The question's label and description (the help overlay; a standalone field's title). */
	readonly label: string;
	readonly description: string;
	lines(ctx: DrawContext): { lines: Line[]; focus: number; pinned?: Line[] };
	keys(): readonly KeyHint[];
	onKey(name: string): void;
	onPaste?(text: string): void;
	pending(): PendingAsk;
}
