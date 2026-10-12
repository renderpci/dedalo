/**
 * THE PLAIN MODE'S PROMPTER (terminal installer phase 2, 2026-10-12) — how ONE
 * model question (screen_model.ts Question) is asked on a line terminal. It
 * asks; it never decides: the options, the default, the errors and the locks
 * all come from the question, and the answer goes back through the model's
 * applyAnswer (run_plain.ts).
 *
 * THE LINE CONTRACT (installer_reference.md §Plain mode):
 *  - every answer may be `back` (the previous screen) or `quit`; Ctrl-C /
 *    Ctrl-D quit too;
 *  - text/choice: an EMPTY answer takes the shown default — unlike the host
 *    agent's prompter this was copied from (tty.ts: "the default is shown, never
 *    taken"), because every default here is the plan's own and the Review shows
 *    them all again before anything runs; `-` empties an optional field;
 *  - confirm (an on/off toggle): `[y/N]` / `[Y/n]` by the default;
 *  - acknowledge (trial, no thesaurus, a probe override, the install itself):
 *    the word `yes` must be TYPED;
 *  - multi: numbered options in their groups, a page of 20 lines; `3`, `3-7`,
 *    `3 5 9` toggle; a code (`es`) toggles it; `/word` filters, `/` clears;
 *    `list` shows all; `more` pages; enter or `next` finishes; a locked option
 *    says why instead of toggling;
 *  - secret: hidden, entered TWICE, three mismatches abort; an empty entry
 *    re-asks unless the question allows it; a CR/LF/NUL is refused (the .env
 *    line rule); with `feedback` (the root password) each policy rule is
 *    printed as `ok`/`missing` after the first entry and it is re-asked until
 *    the policy passes — never the value. Words, not glyphs (screen readers).
 *
 * Every string printed passes sanitizeLine (no ESC byte ever leaves the plain
 * mode). The prompt SINK is chosen by the caller (front_end.ts selectFrontEnd):
 * stdout, or stderr / /dev/tty when stdout is redirected.
 */

import { hasIllegalControlCharacter } from '../install_plan.ts';
import type { Option, OptionMark, Question, Screen } from '../screen_model.ts';
import {
	Aborted,
	RawReader,
	readLine,
	sanitizeLine,
	type TtyOutput,
	type TtyStreams,
	wrap,
	wrapWidth,
} from './terminal.ts';

/** A navigation answer: the previous screen, or leave. */
export type Nav = { readonly nav: 'back' | 'quit' };
export const BACK: Nav = Object.freeze({ nav: 'back' });
export const QUIT: Nav = Object.freeze({ nav: 'quit' });

export function isNav(value: unknown): value is Nav {
	return value === BACK || value === QUIT;
}

/** The root password's live verdict (screen_model.ts passwordFeedback). */
export type PasswordFeedback = (password: string) => {
	rules: { id: string; text: string; ok: boolean }[];
	errors: string[];
};

/** Secrets: how many mismatching pairs before the question is aborted. */
export const SECRET_ATTEMPTS = 3;

/** A multi-select page. */
export const MULTI_PAGE = 20;

export interface InstallPrompter {
	/** A real terminal (or a script that plays one). */
	readonly interactive: boolean;
	/** A screen's header, description, notices, placeholder and help. */
	screen(screen: Screen): void;
	say(lines: readonly string[]): void;
	text(question: Question): Promise<string | Nav>;
	choice(question: Question): Promise<string | Nav>;
	multi(question: Question): Promise<string[] | Nav>;
	secret(question: Question, feedback?: PasswordFeedback): Promise<string | Nav>;
	confirm(question: Question): Promise<boolean | Nav>;
	acknowledge(question: Question): Promise<boolean | Nav>;
	/** A free line (the Review's command, a probe's next step, a test-mail recipient). */
	line(id: string, prompt: string): Promise<string | Nav>;
	/** A generated secret, shown once — only on a terminal; answers whether it reached one. */
	showOnce(lines: readonly string[]): boolean;
	/**
	 * Why the prompter itself ended the session, when it did: `interrupted`
	 * (Ctrl-C, Ctrl-D, SIGINT) or `refused` (secret entries that never matched);
	 * null when every QUIT it answered was typed.
	 */
	stopReason?(): 'interrupted' | 'refused' | null;
}

/** Three hidden entries that never matched: the session ends as REFUSED, not interrupted. */
class EntriesNeverMatched extends Aborted {}

/** `back` / `quit` typed as an answer. */
function navOf(answer: string): Nav | null {
	const word = answer.trim().toLowerCase();
	return word === 'back' ? BACK : word === 'quit' ? QUIT : null;
}

/** A default as shown in brackets. */
function shownDefault(value: unknown): string {
	if (value === null || value === undefined) return '';
	return Array.isArray(value) ? value.join(',') : String(value);
}

/**
 * What an empty answer takes: the current value (an edit re-asks with it) — or,
 * when the model refuses that value, the plan's default (never offer back an
 * answer that is refused).
 */
function suggested(question: Question): string {
	return question.errors.length > 0
		? shownDefault(question.default)
		: shownDefault(question.value ?? question.default);
}

// ── option marks, as words ───────────────────────────────────────────────────

/** Each mark kind's words (screen readers read words, not glyphs). */
const MARK_WORDS: Readonly<Record<OptionMark['kind'], (mark: OptionMark) => string>> =
	Object.freeze({
		core: () => 'always installed',
		default: () => 'default',
		ships_terms: () => 'ships terms',
		empty: () => 'definition, you fill it',
		needed_by: (mark: OptionMark) => neededByWords(mark),
		also_installs: (mark: OptionMark) =>
			mark.kind === 'also_installs' ? `also installs ${mark.tlds.join(', ')}` : '',
		undeclared: () => 'dependencies not declared',
		note: () => '',
	});

function neededByWords(mark: OptionMark): string {
	if (mark.kind !== 'needed_by') return '';
	return `${mark.mandatory ? 'needed by' : 'recommended by'} ${mark.by.join(', ')}`;
}

/** The words of an option's marks. */
export function markWords(option: Option): string {
	return option.marks
		.map((mark) => MARK_WORDS[mark.kind](mark))
		.filter((word) => word !== '')
		.join('; ');
}

/** Why a locked option cannot be unticked. */
function lockReason(option: Option): string {
	const needed = option.marks.find((mark) => mark.kind === 'needed_by');
	return needed?.kind === 'needed_by'
		? `${option.value} is needed by ${needed.by.join(', ')} and stays installed`
		: `${option.value} is always installed`;
}

// ── the multi-select ─────────────────────────────────────────────────────────

/** The multi-select's state between commands. */
export interface MultiState {
	readonly options: readonly Option[];
	selected: Set<string>;
	/** What the operator unticked in this session (a deliberate decline a later tick respects). */
	unticked: Set<string>;
	filter: string;
	page: number;
}

/** Does `option` match the filter word? */
function matches(option: Option, word: string): boolean {
	return [option.value, option.label, option.group ?? ''].some((text) =>
		text.toLowerCase().includes(word),
	);
}

/** The options the current filter shows, with their 1-based numbers. */
function filtered(state: MultiState): { number: number; option: Option }[] {
	const word = state.filter.toLowerCase();
	return state.options
		.map((option, index) => ({ number: index + 1, option }))
		.filter(({ option }) => word === '' || matches(option, word));
}

/** One option row: `[x]   3  es  Spain  (ships terms)`. */
function optionRow(number: number, option: Option, selected: boolean): string {
	const marks = markWords(option);
	const box = selected ? '[x]' : '[ ]';
	const tail = `${marks === '' ? '' : `  (${marks})`}${option.locked ? ' locked' : ''}`;
	return `  ${box} ${String(number).padStart(3)}  ${option.value}  ${option.label}${tail}`;
}

/** The rows of a page, each group introduced by its header line. */
function groupedRows(
	slice: readonly { number: number; option: Option }[],
	selected: ReadonlySet<string>,
): string[] {
	const lines: string[] = [];
	let group: string | null = null;
	for (const { number, option } of slice) {
		if (option.group !== group && (option.group ?? '') !== '') lines.push(` ${option.group}`);
		group = option.group;
		lines.push(optionRow(number, option, selected.has(option.value)));
	}
	return lines;
}

/** The status line under a page. */
function statusLine(state: MultiState, shown: number): string {
	const filter =
		state.filter === '' ? '' : ` · filter '${state.filter}' (${shown} shown, / clears)`;
	return `  ${state.selected.size} selected${filter}`;
}

/** The lines of one page of the multi-select (or of every option, `all`). */
export function pageLines(state: MultiState, all: boolean): string[] {
	const rows = filtered(state);
	const start = all ? 0 : state.page * MULTI_PAGE;
	const slice = all ? rows : rows.slice(start, start + MULTI_PAGE);
	const rest = rows.length - (start + slice.length);
	return [
		...groupedRows(slice, state.selected),
		...(rest > 0
			? [`  ... ${rest} more: 'more' for the next page, 'list' for all, /word to filter`]
			: []),
		statusLine(state, rows.length),
	];
}

/** The ticked options that declare `value` MANDATORY (it cannot be unticked while they are ticked). */
function mandatoryDeclarers(state: MultiState, value: string): string[] {
	return state.options
		.filter(
			(other) =>
				other.value !== value &&
				state.selected.has(other.value) &&
				other.declares.some((item) => item.tld === value && item.mandatory),
		)
		.map((other) => other.value);
}

/**
 * Tick `option` AND what it declares, transitively — as the wizard pre-ticks a
 * dependency and the flags install it (`--ontologies zzsma` installs zzsma's
 * optional zzsmb unless declined). An OPTIONAL dependency the operator unticked
 * in this session stays unticked (a deliberate decline); a mandatory one is
 * ticked regardless.
 */
function tickWithDeclared(state: MultiState, option: Option): void {
	const byValue = new Map(state.options.map((item) => [item.value, item]));
	const queue: Option[] = [option];
	while (queue.length > 0) {
		const current = queue.shift() as Option;
		state.selected.add(current.value);
		queue.push(...declaredToTick(state, byValue, current));
	}
}

/** The declared options of `current` still to tick (offered, unticked, not declined unless mandatory). */
function declaredToTick(
	state: MultiState,
	byValue: ReadonlyMap<string, Option>,
	current: Option,
): Option[] {
	return current.declares
		.filter(
			(declared) =>
				!state.selected.has(declared.tld) &&
				(declared.mandatory || !state.unticked.has(declared.tld)),
		)
		.map((declared) => byValue.get(declared.tld))
		.filter((next): next is Option => next !== undefined);
}

/**
 * Toggle one option (a locked one — or one a ticked option declares mandatory —
 * answers its reason instead). Ticking ticks its declared closure.
 */
function toggle(state: MultiState, option: Option, say: (line: string) => void): void {
	if (option.locked) {
		say(lockReason(option));
		return;
	}
	if (!state.selected.has(option.value)) {
		state.unticked.delete(option.value);
		tickWithDeclared(state, option);
		return;
	}
	const declarers = mandatoryDeclarers(state, option.value);
	if (declarers.length > 0) {
		say(`${option.value} is needed by ${declarers.join(', ')} and stays installed`);
		return;
	}
	state.selected.delete(option.value);
	state.unticked.add(option.value);
}

/** One token as option numbers (`3`, `3-7`), or null when it is not one. */
function tokenNumbers(token: string): number[] | null {
	const range = /^(\d+)-(\d+)$/.exec(token);
	if (range === null) return /^\d+$/.test(token) ? [Number(token)] : null;
	const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b) as [number, number];
	return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
}

/** The option numbers a command names (`3`, `3-7`, `3 5 9`), or null when it is not numbers. */
function numbersOf(command: string, count: number): number[] | null {
	const lists = command
		.split(/[\s,]+/)
		.filter((token) => token !== '')
		.map(tokenNumbers);
	if (lists.length === 0 || lists.some((list) => list === null)) return null;
	return (lists as number[][]).flat().filter((n) => n >= 1 && n <= count);
}

type MultiOutcome = 'done' | 'continue' | 'show' | 'show_all' | Nav;

/** One multi-select command: does it match, and what it does. */
interface MultiCommandRule {
	matches(command: string, state: MultiState): boolean;
	run(state: MultiState, command: string, say: (line: string) => void): MultiOutcome;
}

/** The option a typed code names (case-insensitive), or undefined. */
function optionByCode(state: MultiState, command: string): Option | undefined {
	return state.options.find((option) => option.value.toLowerCase() === command.toLowerCase());
}

/** The commands, in order (the first that matches runs). */
const MULTI_COMMANDS: readonly MultiCommandRule[] = [
	{ matches: (command) => navOf(command) !== null, run: (_s, command) => navOf(command) as Nav },
	{
		matches: (command) => command === '' || command.toLowerCase() === 'next',
		run: () => 'done',
	},
	{ matches: (command) => command === 'list', run: () => 'show_all' },
	{
		matches: (command) => command === 'more',
		run: (state) => {
			state.page = (state.page + 1) * MULTI_PAGE >= filtered(state).length ? 0 : state.page + 1;
			return 'show';
		},
	},
	{
		matches: (command) => command.startsWith('/'),
		run: (state, command) => {
			state.filter = command.slice(1).trim();
			state.page = 0;
			return 'show';
		},
	},
	{
		matches: (command, state) => (numbersOf(command, state.options.length) ?? []).length > 0,
		run: (state, command, say) => {
			for (const n of numbersOf(command, state.options.length) ?? []) {
				toggle(state, state.options[n - 1] as Option, say);
			}
			return 'show';
		},
	},
	{
		matches: (command, state) => optionByCode(state, command) !== undefined,
		run: (state, command, say) => {
			toggle(state, optionByCode(state, command) as Option, say);
			return 'show';
		},
	},
];

/** One multi-select command applied to the state (what to do next). */
export function multiCommand(
	state: MultiState,
	command: string,
	say: (line: string) => void,
): MultiOutcome {
	const trimmed = command.trim();
	const rule = MULTI_COMMANDS.find((item) => item.matches(trimmed, state));
	if (rule !== undefined) return rule.run(state, trimmed, say);
	say(`'${trimmed}' is not a number, a code or a command (/word, list, more, next, back, quit)`);
	return 'continue';
}

/**
 * A new multi-select state from the question. The selection keeps ORDER (a
 * Set's insertion order): the question's current value first, in its order —
 * then any other pre-selected option — and every later tick is appended, an
 * untick removes. The order is part of the answer where the plan keeps it (the
 * working languages are written in that order: DEDALO_PROJECTS_DEFAULT_LANGS).
 */
export function multiState(question: Question): MultiState {
	const options = question.options ?? [];
	const preselected = options.filter((option) => option.selected).map((option) => option.value);
	const current = (Array.isArray(question.value) ? question.value.map(String) : []).filter(
		(value) => preselected.includes(value),
	);
	return {
		options,
		selected: new Set([...current, ...preselected]),
		unticked: new Set(),
		filter: '',
		page: 0,
	};
}

/** The selection in the order it was made (see multiState). */
export function multiResult(state: MultiState): string[] {
	const known = new Set(state.options.map((option) => option.value));
	return [...state.selected].filter((value) => known.has(value));
}

// ── the terminal prompter ────────────────────────────────────────────────────

/** What every question body uses: the sanitized writer and the readers. */
interface Io {
	write(text: string): void;
	say(lines: readonly string[]): void;
	visible(reader: RawReader): Promise<string>;
	hidden(reader: RawReader): Promise<string>;
}

/** The question's description, and — once answered — its errors and hint. */
function intro(io: Io, question: Question): void {
	io.say([`${question.label}: ${question.description}`]);
	// An unanswered question's errors are the plan's verdict on its DEFAULT (a
	// required field with none): shown only once the operator answered —
	// run_plain prints them on a re-ask.
	if (question.answered) io.say(question.errors.map((error) => `  error: ${error}`));
	if (question.hint !== undefined) io.say([`  ${question.hint}`]);
}

/** A text answer: empty takes the suggestion, `-` empties an optional field. */
function textAnswer(answer: string, question: Question, fallback: string): string | Nav {
	const nav = navOf(answer);
	if (nav !== null) return nav;
	if (answer === '-' && question.emptyAllowed === true) return '';
	return answer === '' ? fallback : answer;
}

async function askText(io: Io, reader: RawReader, question: Question): Promise<string | Nav> {
	intro(io, question);
	const fallback = suggested(question);
	const bracket = fallback === '' ? '' : ` [${fallback}]`;
	const clear = question.emptyAllowed === true && fallback !== '' ? ", '-' empties it" : '';
	io.write(`${question.label}${bracket}${clear}: `);
	return textAnswer((await io.visible(reader)).trim(), question, fallback);
}

/** The option an answer names: its number or its value; undefined when none. */
function pickOption(options: readonly Option[], answer: string): Option | undefined {
	const byNumber = /^\d+$/.test(answer) ? options[Number(answer) - 1] : undefined;
	return byNumber ?? options.find((option) => option.value.toLowerCase() === answer.toLowerCase());
}

/** One option line of a choice. */
function choiceLine(option: Option, index: number, current: string): string {
	const label = option.label === '' ? option.value : option.label;
	const mark = option.value === current ? ' (current)' : '';
	const description = option.description === '' ? '' : ` — ${option.description}`;
	return `  ${index + 1}  ${label}${mark}${description}`;
}

/** A choice answer: a nav, the current value on empty, the named option, or undefined (ask again). */
function choiceAnswer(
	answer: string,
	options: readonly Option[],
	current: string,
): string | Nav | undefined {
	const nav = navOf(answer);
	if (nav !== null) return nav;
	// Enter takes the current value — '' too when it IS an option (media_access_mode's engine default).
	if (answer === '')
		return current !== '' || options.some((option) => option.value === '') ? current : undefined;
	return pickOption(options, answer)?.value;
}

/** The `[current]` bracket of a choice prompt: the option's label when it names one. */
function choiceBracket(options: readonly Option[], current: string): string {
	const option = options.find((item) => item.value === current);
	const shown = option === undefined ? current : option.label === '' ? option.value : option.label;
	return shown === '' ? '' : ` [${shown}]`;
}

async function askChoice(io: Io, reader: RawReader, question: Question): Promise<string | Nav> {
	intro(io, question);
	const options = question.options ?? [];
	const current = suggested(question);
	io.say(options.map((option, index) => choiceLine(option, index, current)));
	for (;;) {
		io.write(`${question.label}${choiceBracket(options, current)}: `);
		const answer = (await io.visible(reader)).trim();
		const picked = choiceAnswer(answer, options, current);
		if (picked !== undefined) return picked;
		io.write(`'${answer}' is not one of the options: type its number\n`);
	}
}

async function askMulti(io: Io, reader: RawReader, question: Question): Promise<string[] | Nav> {
	intro(io, question);
	const state = multiState(question);
	let outcome: MultiOutcome = 'show';
	for (;;) {
		if (outcome !== 'continue') io.say(pageLines(state, outcome === 'show_all'));
		io.write('toggle numbers or a code, /word filters, enter = done: ');
		outcome = multiCommand(state, await io.visible(reader), (line) => io.say([line]));
		if (isNav(outcome)) return outcome;
		if (outcome === 'done') return multiResult(state);
	}
}

/** Why one hidden entry is refused, or null. */
function entryRefusal(entry: string, question: Question): string | null {
	if (hasIllegalControlCharacter(entry))
		return 'a line break or NUL cannot be part of it; type it again';
	return entry === '' && question.emptyAllowed !== true ? 'it cannot be empty; type it' : null;
}

/** One hidden entry, re-asked while refused. */
async function hiddenEntry(io: Io, reader: RawReader, question: Question): Promise<string> {
	for (;;) {
		io.write(`${question.label} (hidden): `);
		const entry = await io.hidden(reader);
		const refusal = entryRefusal(entry, question);
		if (refusal === null) return entry;
		io.write(`${refusal}\n`);
	}
}

/** The policy's rule list for an entry (never the value); answers whether it passes. */
function policyPasses(io: Io, entry: string, feedback: PasswordFeedback | undefined): boolean {
	if (feedback === undefined) return true;
	const verdict = feedback(entry);
	for (const rule of verdict.rules)
		io.write(`  ${rule.ok ? 'ok     ' : 'missing'}  ${rule.text}\n`);
	if (verdict.errors.length === 0) return true;
	io.write('the password does not meet the policy; type another\n');
	return false;
}

/** A first entry that passes the policy (re-asked until it does). */
async function acceptedEntry(
	io: Io,
	reader: RawReader,
	question: Question,
	feedback: PasswordFeedback | undefined,
): Promise<string> {
	for (;;) {
		const entry = await hiddenEntry(io, reader, question);
		if (policyPasses(io, entry, feedback)) return entry;
	}
}

async function askSecret(
	io: Io,
	reader: RawReader,
	question: Question,
	feedback: PasswordFeedback | undefined,
): Promise<string> {
	intro(io, question);
	for (let attempt = 1; attempt <= SECRET_ATTEMPTS; attempt += 1) {
		const first = await acceptedEntry(io, reader, question, feedback);
		if (first === '') return '';
		io.write(`${question.label} again (hidden): `);
		if ((await io.hidden(reader)) === first) return first;
		io.write('the two entries differ; type it again\n');
	}
	io.write(`the entries did not match ${SECRET_ATTEMPTS} times\n`);
	throw new EntriesNeverMatched();
}

/** The words a confirm takes. */
const YES_NO: Readonly<Record<string, boolean>> = Object.freeze({
	y: true,
	yes: true,
	n: false,
	no: false,
});

/** A confirm's default: the current value (or the default when unanswered). */
function confirmDefault(question: Question): boolean {
	return (question.value ?? question.default) === true;
}

async function askConfirm(io: Io, reader: RawReader, question: Question): Promise<boolean | Nav> {
	intro(io, question);
	const fallback = confirmDefault(question);
	for (;;) {
		io.write(`${question.label} ${fallback ? '[Y/n]' : '[y/N]'}: `);
		const answer = (await io.visible(reader)).trim().toLowerCase();
		const nav = navOf(answer);
		if (nav !== null) return nav;
		const word = answer === '' ? fallback : YES_NO[answer];
		if (word !== undefined) return word;
		io.write('answer y or n\n');
	}
}

async function askAcknowledge(
	io: Io,
	reader: RawReader,
	question: Question,
): Promise<boolean | Nav> {
	intro(io, question);
	io.write('Type yes to accept (anything else declines): ');
	const answer = (await io.visible(reader)).trim();
	return navOf(answer) ?? answer === 'yes';
}

/** A screen's header block. */
function screenLines(screen: Screen): string[] {
	return [
		'',
		`Step ${screen.index} of ${screen.count}: ${screen.title}`,
		screen.description,
		...screen.notices.map(
			(notice) => `${notice.level === 'info' ? '' : `${notice.level}: `}${notice.text}`,
		),
		...(screen.placeholder === undefined ? [] : [`manual step: ${screen.placeholder.manual}`]),
		...screen.help.map((link) => `help: ${link.label} — ${link.url}`),
	];
}

/** The sanitized, wrapped writer over the prompt sink. */
function ioOf(streams: TtyStreams, width: number): Io {
	const write = (text: string): void => {
		streams.output.write(sanitizeLine(text));
	};
	return {
		write,
		say: (lines) => {
			for (const line of lines) {
				for (const wrapped of wrap(sanitizeLine(line), width, '    ')) write(`${wrapped}\n`);
			}
		},
		visible: (reader) => readLine(reader, streams.output, true),
		hidden: (reader) => readLine(reader, streams.output, false),
	};
}

/** Show `lines` once on a TERMINAL sink; answers whether it was one. */
function showOnceOn(output: TtyOutput, lines: readonly string[]): boolean {
	if (output.isTTY !== true) return false;
	for (const item of lines) output.write(`${sanitizeLine(item)}\n`);
	return true;
}

/**
 * The production prompter over `streams` (stdin + the chosen prompt sink).
 * Interactive when stdin is a TTY that can enter raw mode; the sink need not be
 * stdout (prompts carry no secret).
 */
export function ttyInstallPrompter(
	streams: TtyStreams,
	options: { columns?: number } = {},
): InstallPrompter {
	const interactive =
		streams.input.isTTY === true && typeof streams.input.setRawMode === 'function';
	const io = ioOf(streams, wrapWidth(options.columns));
	let stopped: 'interrupted' | 'refused' | null = null;
	/** One question in raw mode; Ctrl-C/Ctrl-D (or three secret mismatches) quit. */
	const ask = async <T>(body: (reader: RawReader) => Promise<T>): Promise<T | Nav> => {
		if (!interactive) return QUIT;
		const reader = new RawReader(streams);
		reader.open();
		try {
			return await body(reader);
		} catch (error) {
			if (!(error instanceof Aborted)) throw error;
			stopped = error instanceof EntriesNeverMatched ? 'refused' : 'interrupted';
			if (stopped === 'interrupted') io.write('aborted by operator\n');
			return QUIT;
		} finally {
			reader.close();
		}
	};
	return {
		interactive,
		screen: (screen) => io.say(screenLines(screen)),
		say: io.say,
		text: (question) => ask((reader) => askText(io, reader, question)),
		choice: (question) => ask((reader) => askChoice(io, reader, question)),
		multi: (question) => ask((reader) => askMulti(io, reader, question)),
		secret: (question, feedback) => ask((reader) => askSecret(io, reader, question, feedback)),
		confirm: (question) => ask((reader) => askConfirm(io, reader, question)),
		acknowledge: (question) => ask((reader) => askAcknowledge(io, reader, question)),
		line: (_id, prompt) =>
			ask(async (reader) => {
				io.write(`${prompt}: `);
				const answer = (await io.visible(reader)).trim();
				return navOf(answer) ?? answer;
			}),
		showOnce: (lines) => showOnceOn(streams.output, lines),
		stopReason: () => stopped,
	};
}

// ── the scripted prompter ────────────────────────────────────────────────────

export interface PlainScript {
	/** question id (or a line id) → the answer as typed: text/choice string, multi list, confirm boolean. */
	readonly answers: Readonly<Record<string, string | readonly string[] | boolean>>;
	/** secret question id → the value. */
	readonly secrets?: Readonly<Record<string, string>>;
	/** The Review's commands, in order (`quit` once exhausted). */
	readonly review?: readonly string[];
	readonly interactive?: boolean;
}

/** A scripted `<back>` / `<quit>`. */
function scriptedNav(value: unknown): Nav | null {
	return value === '<back>' ? BACK : value === '<quit>' ? QUIT : null;
}

/** A scripted secret: '' or a refused value (control character, policy) ends the session. */
function scriptedSecret(
	value: string,
	question: Question,
	feedback: PasswordFeedback | undefined,
): string | Nav {
	if (entryRefusal(value, question) !== null) return QUIT;
	return feedback !== undefined && feedback(value).errors.length > 0 ? QUIT : value;
}

/**
 * A prompter that answers from `script`, recording every question it was asked
 * (`asked`: question ids, `screen:<id>` per screen shown), every line said
 * (`said`) and every one-time display (`shown`). An unlisted text/choice/
 * multi/confirm takes the default; an unlisted secret is '' (refused — QUIT —
 * when the question does not allow it); an unlisted acknowledgement is
 * declined. `<back>` / `<quit>` script nav.
 */
export function scriptedInstallPrompter(script: PlainScript): InstallPrompter & {
	readonly asked: string[];
	readonly shown: string[];
	readonly said: string[];
} {
	const asked: string[] = [];
	const shown: string[] = [];
	const said: string[] = [];
	const review = [...(script.review ?? [])];
	const interactive = script.interactive ?? true;
	const scripted = (id: string): string | readonly string[] | boolean | undefined => {
		asked.push(id);
		return script.answers[id];
	};
	/** A text/choice answer: scripted, else the suggestion. */
	const textOf = (question: Question): string | Nav => {
		const value = scripted(question.id);
		return scriptedNav(value) ?? (typeof value === 'string' ? value : suggested(question));
	};
	return {
		asked,
		shown,
		said,
		interactive,
		screen: (screen) => {
			asked.push(`screen:${screen.id}`);
			said.push(...screenLines(screen));
		},
		say: (lines) => {
			said.push(...lines);
		},
		text: async (question) => textOf(question),
		choice: async (question) => textOf(question),
		multi: async (question) => {
			const value = scripted(question.id);
			const nav = scriptedNav(value);
			if (nav !== null) return nav;
			return Array.isArray(value) ? [...value] : multiResult(multiState(question));
		},
		secret: async (question, feedback) => {
			asked.push(question.id);
			return scriptedSecret(script.secrets?.[question.id] ?? '', question, feedback);
		},
		confirm: async (question) => {
			const value = scripted(question.id);
			const nav = scriptedNav(value);
			if (nav !== null) return nav;
			return typeof value === 'boolean' ? value : confirmDefault(question);
		},
		acknowledge: async (question) => {
			const value = scripted(question.id);
			return scriptedNav(value) ?? (value === true || value === 'yes');
		},
		line: async (id) => {
			if (id === 'review') {
				asked.push(id);
				return review.shift() ?? 'quit';
			}
			const value = scripted(id);
			return scriptedNav(value) ?? (typeof value === 'string' ? value : '');
		},
		showOnce: (lines) => {
			if (interactive) shown.push(...lines);
			return interactive;
		},
	};
}
