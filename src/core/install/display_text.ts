/**
 * THE INSTALLER FRONT ENDS' TEXT HYGIENE (terminal installer phase 3,
 * 2026-10-12) — the ONE output sanitizer and the wrap rule, shared by the plain
 * line mode (ui_plain/) and the full-screen UI (ui/). Moved here unchanged from
 * ui_plain/terminal.ts (which re-exports them), so the full-screen UI never
 * imports the plain mode's raw-mode reader.
 *
 * sanitizeLine is COPIED, NOT IMPORTED, from
 * publication/host_agent/src/provision/init/report.ts (the agent is a separate
 * deployable and never imports the engine, nor the engine the agent) — held
 * equal by outcome in test/unit/install_sanitizer_twin_native.test.ts. EVERY
 * untrusted string a front end draws passes here: a catalog name from an
 * ontology server, a probe message, an engine log line, an error text.
 */

/** ESC sequences: CSI (`ESC [ … final`), OSC/DCS/APC/PM/SOS (`ESC ] … BEL|ST`), and two-byte escapes. */
const ESCAPE_SEQUENCES =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching escape sequences IS the point — this makes a line inert for a terminal
	/\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\]PX^_][\s\S]*?(?:\x07|\x1b\\|$)|\x1b[ -/]*[0-~]?/g;
/** C0 controls except `\n`, DEL, and the C1 range (U+0080–U+009F, the 8-bit CSI/OSC introducers). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters IS the point — this strips them
const CONTROLS = /[\x00-\x09\x0b-\x1f\x7f\x80-\x9f]/g;

/**
 * One line made inert for a terminal: ESC sequences removed first (their
 * parameters with them), a tab becomes one space, then every other control is
 * removed. EVERY string the plain mode prints passes here — a catalog name from
 * an ontology server is untrusted.
 */
export function sanitizeLine(line: string): string {
	return line.replace(ESCAPE_SEQUENCES, '').replace(/\t/g, ' ').replace(CONTROLS, '');
}

/* ── layout ──────────────────────────────────────────────────────────────────── */

/** The wrap width: the terminal's columns clamped to 40-100; 80 when unknown. */
export function wrapWidth(columns: number | undefined): number {
	if (columns === undefined || !Number.isFinite(columns) || columns <= 0) return 80;
	return Math.min(100, Math.max(40, Math.floor(columns)));
}

/** One long line broken at single spaces (continuations: its leading spaces + `indent`). */
function breakLine(paragraph: string, width: number, indent: string): string[] {
	const columns = (value: string): number => Array.from(value).length;
	const leading = /^ */.exec(paragraph)?.[0] ?? '';
	const lines: string[] = [];
	let line = '';
	for (const word of paragraph.slice(leading.length).split(' ')) {
		if (line === '') line = `${leading}${word}`;
		else if (columns(`${line} ${word}`) <= width) line = `${line} ${word}`;
		else {
			lines.push(line);
			line = `${leading}${indent}${word}`;
		}
	}
	return [...lines, line];
}

/**
 * `text` wrapped at single spaces to `width` columns. A line that fits is kept
 * byte for byte (its alignment spaces included); a longer one is broken, every
 * continuation line prefixed with the line's own leading spaces plus `indent`.
 * A word longer than the width (a path, a URL) stays whole on its own line.
 * Existing newlines are kept.
 */
export function wrap(text: string, width: number, indent = ''): string[] {
	return text
		.split('\n')
		.flatMap((paragraph) =>
			Array.from(paragraph).length <= width ? [paragraph] : breakLine(paragraph, width, indent),
		);
}

/** The first line of a text (an error message's summary), sanitized. */
export function firstLine(text: string): string {
	return sanitizeLine(text.split('\n')[0] ?? '');
}

/* ── the Review's host blocks ───────────────────────────────────────────────── */

/**
 * The Review's to-do block's step id (host/review.ts REVIEW_TODO_STEP — gated
 * equal by install_tui_frames): its lines are SENTENCES the operator acts on,
 * not commands the installer runs.
 */
export const REVIEW_TODO_BLOCK = 'todo';

/**
 * One line of a Review host block, as both front ends print it: a command the
 * installer runs is `$ <command>`; a to-do sentence is printed as it is (never
 * dressed as a command the installer would run).
 */
export function reviewCommandText(step: string, line: string): string {
	return step === REVIEW_TODO_BLOCK ? line : `$ ${line}`;
}
