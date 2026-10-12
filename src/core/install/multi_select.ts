/**
 * THE MULTI-SELECT'S STATE AND RULES (terminal installer phase 3, 2026-10-12)
 * — one checklist model shared by the plain mode's numbered list
 * (ui_plain/prompter.ts) and the full-screen UI's filtered checklist
 * (ui/widgets/checklist.ts). Moved here unchanged from ui_plain/prompter.ts.
 *
 * The rules are the model's (screen_model.ts Option): a LOCKED option answers
 * its reason instead of toggling; ticking an option ticks what it DECLARES,
 * transitively (an optional dependency the operator unticked in this session
 * stays declined, a mandatory one is ticked regardless); an option a ticked
 * one declares MANDATORY cannot be unticked. The selection keeps ORDER (the
 * working languages are written in it). Pure: no terminal.
 */

import { type Nav, navOf } from './prompter_contract.ts';
import type { Option, OptionMark, Question } from './screen_model.ts';

/** A multi-select page (the plain mode's list). */
export const MULTI_PAGE = 20;

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
export function lockReason(option: Option): string {
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

/** Does `option` match the filter word (its value, label or group)? */
export function matches(option: Option, word: string): boolean {
	return [option.value, option.label, option.group ?? ''].some((text) =>
		text.toLowerCase().includes(word),
	);
}

/** The options the current filter shows, with their 1-based numbers. */
export function filtered(state: MultiState): { number: number; option: Option }[] {
	const word = state.filter.toLowerCase();
	return state.options
		.map((option, index) => ({ number: index + 1, option }))
		.filter(({ option }) => word === '' || matches(option, word));
}

/** The ticked options that declare `value` MANDATORY (it cannot be unticked while they are ticked). */
export function mandatoryDeclarers(state: MultiState, value: string): string[] {
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
 * Tick `option` AND what it declares, transitively — as the screens pre-tick a
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
export function toggle(state: MultiState, option: Option, say: (line: string) => void): void {
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

export type MultiOutcome = 'done' | 'continue' | 'show' | 'show_all' | Nav;

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
