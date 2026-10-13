/**
 * A FILTERED CHECKLIST (terminal installer phase 3, 2026-10-12) — the
 * multi-select of the ontologies, thesauri and languages, on the SAME model as
 * plain mode's numbered list (multi_select.ts): a locked row answers its
 * reason, ticking ticks what the option declares (transitively), a ticked
 * option's MANDATORY dependency cannot be unticked, an optional one the
 * operator unticked stays declined.
 *
 * Keys: typing filters (value, label, group); `/` starts a new filter;
 * Backspace edits it; Esc clears it, and on an empty filter goes back; ↑↓
 * PgUp PgDn Home End move; Space toggles; Enter (or Tab) continues.
 */

import { sanitizeLine } from '../../display_text.ts';
import {
	filtered,
	type MultiState,
	markWords,
	multiResult,
	multiState,
	toggle,
} from '../../multi_select.ts';
import { BACK, FIELD_BACK, type Nav } from '../../prompter_contract.ts';
import type { Option, Question } from '../../screen_model.ts';
import { type Line, seg } from '../styled.ts';
import { cursorDelta, moveCursor, typedText } from '../view_state.ts';
import type { DrawContext, KeyHint, Widget } from '../widget.ts';
import { badgedRow, descriptionLines, labelSeg, onRole, pointer } from './field_parts.ts';

const CHECKLIST_KEYS: readonly KeyHint[] = [
	['↑↓', 'move'],
	['space', 'toggle'],
	['type', 'filter'],
	['enter', 'continue'],
	['esc', 'clear filter / back'],
	['F1', 'help'],
	['ctrl+q', 'quit'],
];

/** The words on a row's right: its marks (an Empty thesaurus in the mockup's words), declined. */
export function rowBadge(option: Option, state: MultiState): string {
	const words = option.marks.some((mark) => mark.kind === 'empty')
		? markWords({ ...option, marks: option.marks.filter((mark) => mark.kind !== 'empty') })
		: markWords(option);
	const empty = option.marks.some((mark) => mark.kind === 'empty') ? ['Empty — you fill it'] : [];
	const declined = state.unticked.has(option.value) ? ['declined'] : [];
	return [...empty, ...(words === '' ? [] : [words]), ...declined].join(' · ');
}

/** One option row: pointer, box (■ locked), code and label, the badge right-aligned. */
/** The box: ■ locked, ◼ ticked, ◻ not. */
function boxOf(option: Option, on: boolean): string {
	if (option.locked) return '■ ';
	return on ? '◼ ' : '◻ ';
}

function rowLine(option: Option, state: MultiState, focused: boolean, width: number): Line {
	const on = state.selected.has(option.value);
	const text = onRole(on, 'text', 'muted');
	const left: Line = [
		pointer(focused),
		seg(boxOf(option, on), onRole(on, 'accent', 'faint')),
		seg(sanitizeLine(option.value), text, { bold: focused }),
		seg(`  ${sanitizeLine(option.label)}`, text),
	];
	return badgedRow(left, rowBadge(option, state), 'info', focused, width);
}

/** The rows the filter shows, each group introduced by its header. */
function rowLines(
	state: MultiState,
	cursor: number,
	width: number,
): { lines: Line[]; focus: number } {
	const lines: Line[] = [];
	let group: string | null = null;
	let focus = 0;
	filtered(state).forEach(({ option }, index) => {
		if (option.group !== group && (option.group ?? '') !== '') {
			lines.push([seg(sanitizeLine(option.group ?? ''), 'faint', { bold: true })]);
		}
		group = option.group;
		if (index === cursor) focus = lines.length;
		lines.push(rowLine(option, state, index === cursor, width));
	});
	return { lines, focus };
}

/** The filter line: `/ word▏   3 of 36 shown · 31 selected`. */
function filterLine(state: MultiState): Line {
	const shown = filtered(state).length;
	return [
		seg('/ ', 'accent'),
		seg(
			state.filter === '' ? 'type to filter' : sanitizeLine(state.filter),
			state.filter === '' ? 'faint' : 'text',
			{
				sel: true,
			},
		),
		seg('▏', 'accent', { sel: true }),
		seg(`   ${shown} of ${state.options.length} shown · ${state.selected.size} selected`, 'muted'),
	];
}

export function checklistField(question: Question, done: (answer: string[] | Nav) => void): Widget {
	const state = multiState(question);
	let cursor = 0;
	let notice: string | null = null;
	const rows = (): number => filtered(state).length;
	const setFilter = (filter: string): void => {
		state.filter = filter;
		cursor = 0;
	};
	const current = (): Option | undefined => filtered(state)[cursor]?.option;
	const KEYS: Readonly<Record<string, () => void>> = {
		enter: () => done(multiResult(state)),
		tab: () => done(multiResult(state)),
		'shift-tab': () => done(FIELD_BACK),
		esc: () => (state.filter === '' ? done(BACK) : setFilter('')),
		backspace: () => setFilter(Array.from(state.filter).slice(0, -1).join('')),
		space: () => {
			const option = current();
			if (option !== undefined) toggle(state, option, (line) => (notice = line));
		},
		'char:/': () => setFilter(''),
	};
	return {
		id: question.id,
		kind: 'multi',
		editing: true,
		placement: 'field',
		title: question.label,
		label: question.label,
		description: question.description,
		lines: (ctx: DrawContext) => {
			const head = [
				...descriptionLines(question, ctx.width, ctx.layout.descLines),
				[labelSeg(question.label, 'accent')],
				filterLine(state),
			];
			const body = rowLines(state, cursor, ctx.width);
			const said = notice === null ? [] : [[seg(`! ${sanitizeLine(notice)}`, 'warn')]];
			const empty = rows() === 0 ? [[seg('  nothing matches the filter', 'faint')]] : [];
			return {
				lines: [...head, ...body.lines, ...empty, ...said],
				focus: head.length + body.focus,
			};
		},
		keys: () => CHECKLIST_KEYS,
		onKey: (name: string) => {
			notice = name === 'space' ? notice : null;
			const action = KEYS[name];
			if (action !== undefined) return action();
			const delta = cursorDelta(name, 8);
			if (delta !== null) cursor = moveCursor(cursor, delta, rows());
			else if (typedText(name) !== '') setFilter(`${state.filter}${typedText(name)}`);
		},
		pending: () => ({
			id: question.id,
			kind: 'multi',
			options: filtered(state).map(({ option }) => option.value),
			selected: multiResult(state),
			cursor,
			filter: state.filter,
		}),
	};
}
