/**
 * THE PLAIN MODE'S TERMINAL (terminal installer phase 2, 2026-10-12) — raw-mode
 * line reading, hidden input, the abort keys, and the one output sanitizer.
 *
 * COPIED, NOT IMPORTED, from publication/host_agent/src/provision/init/tty.ts
 * (RawReader, readLine, the stream shapes) and .../init/report.ts
 * (sanitizeLine), per the agent README's reuse rule: the agent is a separate
 * deployable and never imports the engine, and the engine does not import the
 * agent either. Adapted:
 *  - an ESCAPE SEQUENCE typed at a prompt (an arrow key: ESC [ A; a function
 *    key: ESC O P) is swallowed WHOLE — the source dropped only the ESC byte and
 *    let `[A` into the answer;
 *  - `wrap(text, width)` for the plain screens (80 columns when unknown, clamped
 *    to 40-100).
 *
 * Raw mode is on ONLY while a question is open; a SIGINT delivered from outside
 * restores it before the question aborts. Ctrl-C / Ctrl-D abort the question
 * (`Aborted`).
 */

/** The input side of a terminal (process.stdin's shape). */
export interface TtyInput {
	readonly isTTY?: boolean;
	setRawMode?(mode: boolean): unknown;
	on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
	removeListener(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
	resume(): unknown;
	pause(): unknown;
}

/** The output side (process.stdout's shape — or stderr, or /dev/tty: the prompt sink). */
export interface TtyOutput {
	readonly isTTY?: boolean;
	write(text: string): unknown;
}

/** Signal registration (process's shape); a gate passes a fake to deliver SIGINT. */
export interface TtySignals {
	on(signal: 'SIGINT', listener: () => void): unknown;
	removeListener(signal: 'SIGINT', listener: () => void): unknown;
}

export interface TtyStreams {
	readonly input: TtyInput;
	readonly output: TtyOutput;
	readonly signals?: TtySignals;
}

const ESC = '\x1b';
const CTRL_C = '\x03';
const CTRL_D = '\x04';
const ABORT_KEYS: ReadonlySet<string> = new Set([CTRL_C, CTRL_D]);
const BACKSPACE: ReadonlySet<string> = new Set(['\x7f', '\b']);
const ENTER: ReadonlySet<string> = new Set(['\r', '\n']);

/** Thrown inside the reader when the operator aborts (Ctrl-C, Ctrl-D, SIGINT). */
export class Aborted extends Error {}

/**
 * One raw-mode session: characters arrive through the `data` listener into a
 * queue; `nextChar` awaits the next one. Raw mode is on only while open.
 */
export class RawReader {
	private readonly queue: string[] = [];
	private waiter: ((char: string) => void) | null = null;
	private readonly onData = (chunk: Buffer | string): void => {
		for (const char of typeof chunk === 'string' ? chunk : chunk.toString('utf8')) {
			if (this.waiter !== null) {
				const resolve = this.waiter;
				this.waiter = null;
				resolve(char);
			} else this.queue.push(char);
		}
	};
	private readonly onSignal = (): void => {
		this.restore();
		if (this.waiter !== null) {
			const resolve = this.waiter;
			this.waiter = null;
			resolve(CTRL_C);
		} else this.queue.unshift(CTRL_C);
	};
	private raw = false;

	constructor(private readonly streams: TtyStreams) {}

	open(): void {
		this.streams.input.setRawMode?.(true);
		this.raw = true;
		this.streams.input.on('data', this.onData);
		this.streams.signals?.on('SIGINT', this.onSignal);
		this.streams.input.resume();
	}

	restore(): void {
		if (this.raw) {
			this.streams.input.setRawMode?.(false);
			this.raw = false;
		}
	}

	close(): void {
		this.restore();
		this.streams.input.removeListener('data', this.onData);
		this.streams.signals?.removeListener('SIGINT', this.onSignal);
		this.streams.input.pause();
	}

	nextChar(): Promise<string> {
		const queued = this.queue.shift();
		if (queued !== undefined) return Promise.resolve(queued);
		return new Promise((resolve) => {
			this.waiter = resolve;
		});
	}
}

/**
 * Swallow the rest of an escape sequence whose ESC was just read: CSI
 * (`ESC [` parameters… final byte 0x40-0x7E), SS3 (`ESC O` + one byte), or a
 * two-byte escape (`ESC` + one byte — an Alt-modified key).
 */
async function swallowEscape(reader: RawReader): Promise<void> {
	const kind = await reader.nextChar();
	if (kind === '[') {
		for (;;) {
			const code = (await reader.nextChar()).charCodeAt(0);
			if (code >= 0x40 && code <= 0x7e) return;
		}
	}
	if (kind === 'O') await reader.nextChar();
}

/** The line being typed. */
interface LineEdit {
	text: string;
	readonly output: TtyOutput;
	readonly echo: boolean;
}

/** A control character (a tab, DEL, C1) is never part of an answer. */
function isControl(char: string): boolean {
	return char < ' ' || char === '\x7f' || (char >= '\x80' && char <= '\x9f');
}

/** Backspace: drop the last character (a code point, not a UTF-16 unit). */
function erase(line: LineEdit): 'more' {
	if (line.text === '') return 'more';
	line.text = Array.from(line.text).slice(0, -1).join('');
	if (line.echo) line.output.write('\b \b');
	return 'more';
}

/** A printable character joins the answer (echoed only when visible). */
function insert(line: LineEdit, char: string): 'more' {
	if (isControl(char)) return 'more';
	line.text += char;
	if (line.echo) line.output.write(char);
	return 'more';
}

/** One key: abort, an escape sequence (swallowed), enter, backspace, or a character. */
async function handleKey(
	reader: RawReader,
	line: LineEdit,
	char: string,
): Promise<'more' | 'enter'> {
	if (ABORT_KEYS.has(char)) {
		line.output.write('\n');
		throw new Aborted();
	}
	if (char === ESC) return swallowEscape(reader).then(() => 'more' as const);
	if (ENTER.has(char)) {
		line.output.write('\n');
		return 'enter';
	}
	return BACKSPACE.has(char) ? erase(line) : insert(line, char);
}

/** Reads one line in raw mode. `echo`: print what is typed (visible) or nothing (hidden). */
export async function readLine(
	reader: RawReader,
	output: TtyOutput,
	echo: boolean,
): Promise<string> {
	const line: LineEdit = { text: '', output, echo };
	for (;;) {
		if ((await handleKey(reader, line, await reader.nextChar())) === 'enter') return line.text;
	}
}

/* ── sanitize (copied from host_agent init/report.ts) ──────────────────────────── */

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
