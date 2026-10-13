/**
 * THE FULL-SCREEN UI'S PALETTE (terminal installer phase 3, 2026-10-12) — the
 * approved mockup's colours (the logo orange as the accent), by ROLE: a screen
 * names what a text IS (muted, an error, the accent), never a colour. NO_COLOR
 * keeps the UI and drops the colours: the terminal's own foreground and
 * background, the accent and the selection expressed as bold and reverse.
 */

/** What a piece of text is. */
export type Role =
	| 'text'
	| 'muted'
	| 'faint'
	| 'accent'
	| 'ok'
	| 'warn'
	| 'err'
	| 'info'
	| 'line'
	| 'chip';

/** The mockup's colours. */
export const COLORS = Object.freeze({
	bg: '#16161a',
	panel: '#1d1d22',
	line: '#3a3a42',
	text: '#e8e6e3',
	muted: '#8b8b94',
	faint: '#5c5c66',
	accent: '#F78A1C',
	ok: '#7fc96b',
	warn: '#e8c26a',
	err: '#ef6f6c',
	info: '#77b8e0',
	sel: '#2a2a31',
	chipText: '#1b1206',
});

export interface Palette {
	/** false = NO_COLOR: no colour at all (bold and reverse carry the emphasis). */
	readonly color: boolean;
	/** The screen background (undefined = the terminal's own). */
	readonly bg: string | undefined;
	/** A role's foreground (undefined = the terminal's own). */
	fg(role: Role): string | undefined;
	/** The selected row's background (undefined = reverse video). */
	readonly sel: string | undefined;
	/** The border colours: the pane (accent) and the rail (line). */
	readonly paneBorder: string | undefined;
	readonly railBorder: string | undefined;
}

const ROLE_COLOR: Readonly<Record<Role, string>> = Object.freeze({
	text: COLORS.text,
	muted: COLORS.muted,
	faint: COLORS.faint,
	accent: COLORS.accent,
	ok: COLORS.ok,
	warn: COLORS.warn,
	err: COLORS.err,
	info: COLORS.info,
	line: COLORS.line,
	chip: COLORS.chipText,
});

const COLOR_PALETTE: Palette = Object.freeze({
	color: true,
	bg: COLORS.bg,
	fg: (role: Role) => ROLE_COLOR[role],
	sel: COLORS.sel,
	paneBorder: COLORS.accent,
	railBorder: COLORS.line,
});

const MONO_PALETTE: Palette = Object.freeze({
	color: false,
	bg: undefined,
	fg: () => undefined,
	sel: undefined,
	paneBorder: undefined,
	railBorder: undefined,
});

export function paletteFor(noColor: boolean): Palette {
	return noColor ? MONO_PALETTE : COLOR_PALETTE;
}
