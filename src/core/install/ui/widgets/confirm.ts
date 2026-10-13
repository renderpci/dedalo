/**
 * AN ON/OFF TOGGLE AND AN ACKNOWLEDGEMENT (terminal installer phase 3,
 * 2026-10-12).
 *  - confirm: `y` / `n`, ←→ or Space switch, Enter (or Tab) answers; the
 *    default is the shared rule (confirmDefault — the current value, else the
 *    plan's default).
 *  - acknowledge (trial without media protection, no thesaurus, a probe kept
 *    untested): Space ticks "I understand" — and so does TYPING `yes`, the
 *    plain mode's word (campaign 3 C3-26: the docs say "type yes" for both);
 *    Enter answers, unticked declines. The how-to line is
 *    screen_text.ts ACKNOWLEDGE_TEXT.full. (The install itself keeps the typed
 *    `yes`: text_field.ts typedYes.)
 */

import { BACK, confirmDefault, FIELD_BACK, type Nav } from '../../prompter_contract.ts';
import type { Question } from '../../screen_model.ts';
import { ACKNOWLEDGE_TEXT } from '../../screen_text.ts';
import { type Line, seg } from '../styled.ts';
import type { DrawContext, KeyHint, Widget } from '../widget.ts';
import { labelSeg, wrapped } from './field_parts.ts';

const CONFIRM_KEYS: readonly KeyHint[] = [
	['y/n', 'answer'],
	['enter', 'continue'],
	['shift+tab', 'previous'],
	['esc', 'back'],
	['F1', 'help'],
	['ctrl+q', 'quit'],
];

const ACK_KEYS: readonly KeyHint[] = [
	['space', 'tick'],
	['yes', 'type to tick'],
	['enter', 'continue'],
	['shift+tab', 'previous'],
	['esc', 'back'],
	['ctrl+q', 'quit'],
];

/** A `[ Yes ]` / `[ No ]` button. */
function button(text: string, on: boolean): Line[number] {
	return seg(` ${text} `, on ? 'accent' : 'faint', { sel: on, bold: on });
}

/** The keys both widgets share (navigation). */
function navKeys(done: (answer: Nav) => void): Record<string, () => void> {
	return { 'shift-tab': () => done(FIELD_BACK), esc: () => done(BACK) };
}

export function confirmField(question: Question, done: (answer: boolean | Nav) => void): Widget {
	let value = confirmDefault(question);
	const KEYS: Readonly<Record<string, () => void>> = {
		...navKeys(done),
		enter: () => done(value),
		tab: () => done(value),
		'char:y': () => done(true),
		'char:Y': () => done(true),
		'char:n': () => done(false),
		'char:N': () => done(false),
		left: () => {
			value = !value;
		},
		right: () => {
			value = !value;
		},
		space: () => {
			value = !value;
		},
	};
	return {
		id: question.id,
		kind: 'confirm',
		editing: false,
		placement: 'field',
		title: question.label,
		label: question.label,
		description: question.description,
		lines: (ctx: DrawContext) => {
			const description = wrapped(question.description, ctx.width, 'muted');
			const row: Line = [
				labelSeg(question.label, 'accent'),
				button('Yes', value),
				seg('  '),
				button('No', !value),
			];
			return { lines: [...description, row], focus: description.length };
		},
		keys: () => CONFIRM_KEYS,
		onKey: (name: string) => KEYS[name]?.(),
		pending: () => ({
			id: question.id,
			kind: 'confirm',
			selected: [value ? 'yes' : 'no'],
		}),
	};
}

export function acknowledgeField(
	question: Question,
	done: (answer: boolean | Nav) => void,
): Widget {
	let ticked = false;
	/** The last letters typed: `yes` ticks the box. */
	let typed = '';
	const KEYS: Readonly<Record<string, () => void>> = {
		...navKeys(done),
		enter: () => done(ticked),
		tab: () => done(ticked),
		space: () => {
			ticked = !ticked;
		},
	};
	const typeLetter = (name: string): void => {
		typed = `${typed}${name.slice(5).toLowerCase()}`.slice(-3);
		if (typed === 'yes') ticked = true;
	};
	return {
		id: question.id,
		kind: 'acknowledge',
		editing: false,
		placement: 'field',
		title: question.label,
		label: question.label,
		description: question.description,
		lines: (ctx: DrawContext) => {
			const description = wrapped(question.description, ctx.width, 'warn');
			const row: Line = [
				seg('❯ ', 'accent'),
				seg(ticked ? '◼ ' : '◻ ', ticked ? 'accent' : 'faint'),
				seg(`${question.label} — ${ACKNOWLEDGE_TEXT.tick}`, 'text', { bold: true }),
			];
			const how: Line = [seg(`  ${ACKNOWLEDGE_TEXT.full}`, 'faint')];
			return { lines: [...description, row, how], focus: description.length };
		},
		keys: () => ACK_KEYS,
		onKey: (name: string) => (name.startsWith('char:') ? typeLetter(name) : KEYS[name]?.()),
		pending: () => ({
			id: question.id,
			kind: 'acknowledge',
			selected: ticked ? ['yes'] : [],
		}),
	};
}
