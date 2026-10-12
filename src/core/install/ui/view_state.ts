/**
 * THE FULL-SCREEN UI'S PURE RULES (terminal installer phase 3, 2026-10-12) —
 * the layout a terminal size gets, the one key vocabulary every widget binds
 * (a renderer key event → a key NAME), the single-line editing reducers the
 * text and secret fields share, and the window of lines a pane shows. No
 * OpenTUI here: a gate tests these without a renderer.
 */

/** How the frame is laid out at a terminal size. */
export interface Layout {
	cols: number;
	rows: number;
	/** full: titles (≥ 96 columns); compact: marks and numbers only. */
	rail: 'full' | 'compact';
	railWidth: number;
	/** The logo needs 30 rows (16 of it, plus the card and the tips). */
	logo: boolean;
	/** How many description lines a question screen shows before `?` (help). */
	descLines: number;
	/** Below 80×24: only the too-small notice is drawn. */
	tooSmall: boolean;
	/** The pane's inner size (inside its border and padding). */
	paneWidth: number;
	paneHeight: number;
}

export const MIN_COLS = 80;
export const MIN_ROWS = 24;
const FULL_RAIL_COLS = 96;

/** THE layout rule. */
export function layoutFor(cols: number, rows: number): Layout {
	const rail = cols >= FULL_RAIL_COLS ? 'full' : 'compact';
	const railWidth = rail === 'full' ? 25 : 7;
	return {
		cols,
		rows,
		rail,
		railWidth,
		logo: rows >= 30,
		descLines: rows >= 30 ? 4 : 2,
		tooSmall: cols < MIN_COLS || rows < MIN_ROWS,
		// root paddingX 1+1, gap 1, pane border 2, pane paddingX 2+2
		paneWidth: Math.max(10, cols - railWidth - 9),
		// header 1, footer 1, pane border 2
		paneHeight: Math.max(1, rows - 4),
	};
}

// ── keys ─────────────────────────────────────────────────────────────────────

/** A renderer key event, narrowed (OpenTUI's KeyEvent shape). */
export interface KeyLike {
	name: string;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
	sequence: string;
}

/** Named keys (the renderer's name → ours). */
const NAMED: Readonly<Record<string, string>> = Object.freeze({
	return: 'enter',
	enter: 'enter',
	linefeed: 'enter',
	escape: 'esc',
	tab: 'tab',
	up: 'up',
	down: 'down',
	left: 'left',
	right: 'right',
	pageup: 'pgup',
	pagedown: 'pgdn',
	home: 'home',
	end: 'end',
	backspace: 'backspace',
	delete: 'delete',
	space: 'space',
	f1: 'f1',
});

/** Is the sequence one printable character (or a run of them, an IME commit)? */
function printable(sequence: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: a control character is exactly what is refused
	return sequence !== '' && !/[\x00-\x1f\x7f-\x9f]/.test(sequence);
}

/**
 * THE key vocabulary: `ctrl-<x>`, `shift-tab`, a named key (`enter`, `esc`,
 * `up`…), `char:<text>` for printable input, `other` for the rest.
 */
export function keyName(key: KeyLike): string {
	if (key.ctrl) return `ctrl-${key.name}`;
	if (key.meta) return 'other';
	return shiftTab(key) ?? NAMED[key.name] ?? charName(key.sequence);
}

/** Shift-Tab (the legacy `ESC [ Z`), or null. */
function shiftTab(key: KeyLike): string | null {
	return key.name === 'tab' && key.shift ? 'shift-tab' : null;
}

/** A printable sequence's name (`char:<text>`), else `other`. */
function charName(sequence: string): string {
	return printable(sequence) ? `char:${sequence}` : 'other';
}

/** The text a key types into a field ('' = it types nothing). */
export function typedText(name: string): string {
	if (name === 'space') return ' ';
	return name.startsWith('char:') ? name.slice(5) : '';
}

// ── single-line editing ──────────────────────────────────────────────────────

/** A line being edited: its code points and the caret (an index into them). */
export interface FieldEdit {
	readonly chars: readonly string[];
	readonly caret: number;
}

export function editOf(text: string): FieldEdit {
	const chars = Array.from(text);
	return { chars, caret: chars.length };
}

export function editText(edit: FieldEdit): string {
	return edit.chars.join('');
}

function insertText(edit: FieldEdit, text: string): FieldEdit {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: a control character never joins a field
	const clean = Array.from(text.replace(/[\x00-\x1f\x7f-\x9f]/g, ''));
	const chars = [...edit.chars.slice(0, edit.caret), ...clean, ...edit.chars.slice(edit.caret)];
	return { chars, caret: edit.caret + clean.length };
}

function backspace(edit: FieldEdit): FieldEdit {
	if (edit.caret === 0) return edit;
	const chars = [...edit.chars.slice(0, edit.caret - 1), ...edit.chars.slice(edit.caret)];
	return { chars, caret: edit.caret - 1 };
}

function deleteForward(edit: FieldEdit): FieldEdit {
	const chars = [...edit.chars.slice(0, edit.caret), ...edit.chars.slice(edit.caret + 1)];
	return { chars, caret: edit.caret };
}

/** Ctrl-W: the word before the caret (and the spaces after it). */
function deleteWord(edit: FieldEdit): FieldEdit {
	let start = edit.caret;
	while (start > 0 && edit.chars[start - 1] === ' ') start--;
	while (start > 0 && edit.chars[start - 1] !== ' ') start--;
	return { chars: [...edit.chars.slice(0, start), ...edit.chars.slice(edit.caret)], caret: start };
}

const clampCaret = (edit: FieldEdit, caret: number): FieldEdit => ({
	chars: edit.chars,
	caret: Math.max(0, Math.min(edit.chars.length, caret)),
});

/** The editing keys (one reducer each). */
const EDIT_KEYS: Readonly<Record<string, (edit: FieldEdit) => FieldEdit>> = Object.freeze({
	backspace,
	delete: deleteForward,
	'ctrl-h': backspace,
	'ctrl-u': () => ({ chars: [], caret: 0 }),
	'ctrl-w': deleteWord,
	left: (edit: FieldEdit) => clampCaret(edit, edit.caret - 1),
	right: (edit: FieldEdit) => clampCaret(edit, edit.caret + 1),
	home: (edit: FieldEdit) => clampCaret(edit, 0),
	end: (edit: FieldEdit) => clampCaret(edit, edit.chars.length),
	'ctrl-a': (edit: FieldEdit) => clampCaret(edit, 0),
	'ctrl-e': (edit: FieldEdit) => clampCaret(edit, edit.chars.length),
});

/** One key applied to a field: the new edit, or null when the key is not an editing key. */
export function editKey(edit: FieldEdit, name: string): FieldEdit | null {
	const reducer = EDIT_KEYS[name];
	if (reducer !== undefined) return reducer(edit);
	const text = typedText(name);
	return text === '' ? null : insertText(edit, text);
}

/** Pasted text joins the field (line breaks dropped: a field is one line). */
export function pasteInto(edit: FieldEdit, text: string): FieldEdit {
	return insertText(edit, text.replace(/[\r\n]+/g, ''));
}

// ── the visible window ───────────────────────────────────────────────────────

/** The first line shown when `total` lines must fit `height` with `focus` visible. */
export function windowStart(total: number, height: number, focus: number): number {
	if (total <= height) return 0;
	const start = focus - Math.floor(height / 2);
	return Math.max(0, Math.min(total - height, start));
}

/** A cursor moved by `delta` within `count` items (clamped). */
export function moveCursor(cursor: number, delta: number, count: number): number {
	if (count === 0) return 0;
	return Math.max(0, Math.min(count - 1, cursor + delta));
}

/** The cursor movement each navigation key makes (`page` = one page). */
export function cursorDelta(name: string, page: number): number | null {
	const deltas: Readonly<Record<string, number>> = {
		up: -1,
		down: 1,
		pgup: -page,
		pgdn: page,
		home: -1e9,
		end: 1e9,
	};
	return deltas[name] ?? null;
}
