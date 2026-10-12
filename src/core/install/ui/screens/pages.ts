/**
 * THE WHOLE-PANE ASKS (terminal installer phase 3, 2026-10-12): the Welcome
 * card, the Resume choice (an unfinished install), a failed probe's next step
 * — each a widget that answers the walker's structured view
 * (prompter_contract.ts) with the SAME words plain mode reads (`resume`,
 * `abort`, `retry`, `edit`, `yes`, `quit`).
 */

import { sanitizeLine } from '../../display_text.ts';
import {
	BACK,
	type Nav,
	type ProbeCommand,
	type ProbeView,
	QUIT,
	type ResumeView,
	type WelcomeView,
} from '../../prompter_contract.ts';
import { type Line, seg, selectedLine } from '../styled.ts';
import { cursorDelta, moveCursor } from '../view_state.ts';
import type { DrawContext, KeyHint, Widget } from '../widget.ts';
import { wrapped } from '../widgets/field_parts.ts';
import { BLANK, noticeLines } from '../widgets/notices.ts';

// ── welcome ──────────────────────────────────────────────────────────────────

const WELCOME_KEYS: readonly KeyHint[] = [
	['enter', 'begin'],
	['q', 'quit'],
	['F1', 'help'],
];

/** The Welcome card's text (the logo is the frame's). */
export function welcomeLines(view: WelcomeView, width: number): Line[] {
	return [
		[seg('Welcome to Dédalo', 'text', { bold: true })],
		[seg(`Cultural heritage management system · installer ${view.version}`.trim(), 'muted')],
		BLANK,
		...wrapped(
			'Every answer is checked before anything runs; the Review shows the whole plan first.',
			width,
			'muted',
		),
		...wrapped(
			'Nothing is installed before you type yes on the Review. ctrl+c stops at any time; an interrupted install continues with --resume.',
			width,
			'muted',
		),
		...wrapped('The same plan without these screens: --answers <file>.', width, 'info'),
		BLANK,
		[
			seg('❯ ', 'accent'),
			seg('Press enter to begin', 'text', { bold: true }),
			seg('   q quit', 'faint'),
		],
	];
}

export function welcomePage(view: WelcomeView, done: (answer: Nav | null) => void): Widget {
	const KEYS: Readonly<Record<string, () => void>> = {
		enter: () => done(null),
		'char:q': () => done(QUIT),
	};
	return {
		id: 'welcome',
		kind: 'welcome',
		editing: false,
		placement: 'page',
		title: 'Dédalo installer',
		label: 'Welcome',
		description:
			'The installer asks screen by screen, then shows the whole plan before anything runs.',
		lines: (ctx: DrawContext) => ({ lines: welcomeLines(view, ctx.width), focus: 0 }),
		keys: () => WELCOME_KEYS,
		onKey: (name: string) => KEYS[name]?.(),
		pending: () => ({ id: 'welcome', kind: 'welcome' }),
	};
}

// ── a list of buttons ────────────────────────────────────────────────────────

interface Button {
	value: string;
	hotkey: string;
	label: string;
	description: string;
}

/** Button rows: `❯ [r] Resume` + its description; `focus` = the cursor's row. */
function buttonRows(
	buttons: readonly Button[],
	cursor: number,
	width: number,
	offset: number,
): { lines: Line[]; focus: number } {
	const lines: Line[] = [];
	let focus = offset;
	buttons.forEach((button, index) => {
		if (index === cursor) focus = offset + lines.length;
		lines.push(...buttonLines([button], index === cursor ? 0 : -1, width));
	});
	return { lines, focus };
}

/** Button rows: `❯ [r] Resume` + its description. */
function buttonLines(buttons: readonly Button[], cursor: number, width: number): Line[] {
	return buttons.flatMap((button, index) => {
		const row: Line = [
			seg(index === cursor ? '❯ ' : '  ', 'accent'),
			seg(`[${button.hotkey}] `, 'accent'),
			seg(button.label, index === cursor ? 'text' : 'muted', { bold: index === cursor }),
		];
		return [
			index === cursor ? selectedLine(row, width) : row,
			...wrapped(button.description, width, 'faint', '      '),
		];
	});
}

/** A page of buttons: ↑↓ + Enter, or a button's hotkey. */
function buttonKeys(
	buttons: readonly Button[],
	cursor: () => number,
	move: (cursor: number) => void,
	pick: (value: string) => void,
): (name: string) => void {
	return (name: string) => {
		const hot = buttons.find((button) => name === `char:${button.hotkey}`);
		if (hot !== undefined) return pick(hot.value);
		if (name === 'enter') return pick((buttons[cursor()] as Button).value);
		const delta = cursorDelta(name, 1);
		if (delta !== null) move(moveCursor(cursor(), delta, buttons.length));
	};
}

// ── resume ───────────────────────────────────────────────────────────────────

const RESUME_BUTTONS: readonly Button[] = [
	{
		value: 'resume',
		hotkey: 'r',
		label: 'Resume the install',
		description: 'The finished steps are verified again, then the rest run.',
	},
	{
		value: 'abort',
		hotkey: 'a',
		label: 'Abort it',
		description:
			'Undo what the install created and reset its database to empty (asks the database name first).',
	},
	{
		value: 'quit',
		hotkey: 'q',
		label: 'Quit',
		description: 'Leave it as it is; run the installer again later.',
	},
];

export function resumePage(
	view: ResumeView,
	done: (answer: 'resume' | 'abort' | Nav) => void,
): Widget {
	const buttons = RESUME_BUTTONS.filter((button) => button.value !== 'abort' || view.canAbort);
	let cursor = 0;
	const pick = (value: string): void => {
		done(value === 'quit' ? QUIT : (value as 'resume' | 'abort'));
	};
	return {
		id: 'resume',
		kind: 'resume',
		editing: false,
		placement: 'page',
		title: 'An install was interrupted',
		label: 'Resume',
		description: 'An unfinished install record was found in the private directory.',
		lines: (ctx: DrawContext) => {
			const head = [
				...wrapped(
					`An install into database '${view.database}' was interrupted (${view.outcome}).`,
					ctx.width,
					'warn',
				),
				...wrapped(
					"Its plan and the steps already done are kept in the install's private directory.",
					ctx.width,
					'muted',
				),
				BLANK,
			];
			const rows = buttonRows(buttons, cursor, ctx.width, head.length);
			return { lines: [...head, ...rows.lines], focus: rows.focus };
		},
		keys: () => [
			['↑↓', 'move'],
			['enter', 'choose'],
			['r/a/q', 'resume · abort · quit'],
		],
		onKey: buttonKeys(
			buttons,
			() => cursor,
			(next) => {
				cursor = next;
			},
			pick,
		),
		pending: () => ({
			id: 'resume',
			kind: 'resume',
			options: buttons.map((button) => button.value),
			cursor,
		}),
	};
}

// ── a failed probe ───────────────────────────────────────────────────────────

const PROBE_BUTTONS: Readonly<Record<ProbeCommand, Omit<Button, 'value'>>> = Object.freeze({
	retry: {
		hotkey: 'r',
		label: 'Retry the check',
		description: 'Run it again (fix the cause first).',
	},
	edit: {
		hotkey: 'e',
		label: 'Edit the answers',
		description: "Ask this screen's questions again.",
	},
	yes: {
		hotkey: 'y',
		label: 'Keep these settings untested',
		description: 'Recorded on the Review as kept untested.',
	},
	quit: { hotkey: 'q', label: 'Quit', description: 'Nothing has been installed.' },
});

/** A verdict line's role. */
function verdictRole(line: string): 'err' | 'ok' | 'warn' | 'muted' {
	if (/^(error|Check failed|✗)/i.test(line)) return 'err';
	if (/^(warn|!)/i.test(line)) return 'warn';
	return /^(Check passed|System ready)/.test(line) ? 'ok' : 'muted';
}

export function probePage(view: ProbeView, done: (answer: string | Nav) => void): Widget {
	const buttons: Button[] = view.commands.map((value) => ({ value, ...PROBE_BUTTONS[value] }));
	let cursor = 0;
	const keys = buttonKeys(
		buttons,
		() => cursor,
		(next) => {
			cursor = next;
		},
		(value) => done(value),
	);
	return {
		id: `${view.screen.id}.probe_action`,
		kind: 'probe',
		editing: false,
		placement: 'page',
		title: `${view.screen.title} — check failed`,
		label: view.screen.title,
		description: view.prompt,
		lines: (ctx: DrawContext) => {
			const verdict = view.lines.flatMap((line) =>
				wrapped(sanitizeLine(line), ctx.width, verdictRole(line)),
			);
			const head = [...verdict, ...noticeLines([], ctx.width), BLANK];
			const rows = buttonRows(buttons, cursor, ctx.width, head.length);
			return { lines: [...head, ...rows.lines], focus: rows.focus };
		},
		keys: () => [
			['↑↓', 'move'],
			['enter', 'choose'],
			[buttons.map((button) => button.hotkey).join('/'), view.prompt],
			['esc', 'back'],
		],
		onKey: (name: string) => (name === 'esc' ? done(BACK) : keys(name)),
		pending: () => ({
			id: `${view.screen.id}.probe_action`,
			kind: 'probe',
			options: buttons.map((button) => button.value),
			cursor,
		}),
	};
}
