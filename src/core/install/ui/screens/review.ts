/**
 * THE REVIEW, DRAWN (terminal installer phase 3, 2026-10-12) — everything the
 * install will do (the model's review lines, its notices and the plan's
 * refusals), the equivalent command line (never a secret), and the walker's
 * Review commands as keys: Enter = `install` (only when offered — otherwise
 * the reason, inline), `e` + a number = `edit <n>`, `w` + a path =
 * `write <path>`, Esc = back (the walker edits the last screen), Ctrl-Q quit.
 * The command line is shown, not copied (no clipboard escape is written).
 */

import { sanitizeLine } from '../../display_text.ts';
import { BACK, type Nav, type ReviewView } from '../../prompter_contract.ts';
import { type Line, seg } from '../styled.ts';
import { editKey, editOf, editText, type FieldEdit, pasteInto } from '../view_state.ts';
import type { DrawContext, KeyHint, Widget } from '../widget.ts';
import { valueBox, wrapped } from '../widgets/field_parts.ts';
import { BLANK, noticeLines } from '../widgets/notices.ts';

type Mode = 'command' | 'edit' | 'write';

const MODE_KEYS: Readonly<Record<Mode, readonly KeyHint[]>> = Object.freeze({
	command: [
		['enter', 'install'],
		['e', 'edit a step'],
		['w', 'write answers'],
		['↑↓', 'scroll'],
		['esc', 'back'],
		['ctrl+q', 'quit'],
	],
	edit: [
		['digits', 'step number'],
		['enter', 'edit it'],
		['esc', 'cancel'],
	],
	write: [
		['type', 'a path'],
		['enter', 'write'],
		['esc', 'cancel'],
	],
});

/** One review line: the label column (14), the value wrapped under itself. */
function reviewLine(label: string, value: string, width: number): Line[] {
	const [first, ...rest] = wrapped(value, Math.max(10, width - 15), 'text');
	return [
		[seg(sanitizeLine(label).padEnd(14), 'muted'), seg(' '), ...(first ?? [seg('')])],
		...rest.map((line) => [seg(' '.repeat(15)), ...line]),
	];
}

/** The review's body. */
function bodyLines(view: ReviewView, width: number): Line[] {
	return [
		...noticeLines(view.screen.notices, width),
		...view.errors.flatMap((error) => wrapped(`✗ ${error}`, width, 'err')),
		BLANK,
		...view.lines.flatMap((line) => reviewLine(line.label, line.value, width)),
		...hostCommandBlock(view, width),
	];
}

/** A host route's commands, per step, exactly as they will run (review equals run). */
function hostCommandBlock(view: ReviewView, width: number): Line[] {
	const blocks = view.hostCommands ?? [];
	if (blocks.length === 0) return [];
	return [
		BLANK,
		...blocks.flatMap((block) => [
			...wrapped(`[${block.step}] ${block.label}`, width, 'text'),
			...block.commands.flatMap((command) => wrapped(`  $ ${command}`, width, 'muted')),
		]),
	];
}

/** The steps `e` offers, in words. */
function editableText(view: ReviewView): string {
	return view.editable.map((item) => `${item.n} ${item.title}`).join(' · ');
}

/** An edit the mode takes: a step number is digits only. */
function accepted(mode: Mode, next: FieldEdit): boolean {
	return mode !== 'edit' || /^\d*$/.test(editText(next));
}

export function reviewPage(view: ReviewView, done: (answer: string | Nav) => void): Widget {
	let mode: Mode = 'command';
	let edit: FieldEdit = editOf('');
	let scroll = 0;
	let notice: string | null = null;
	const enterMode = (next: Mode): void => {
		mode = next;
		edit = editOf('');
		notice = null;
	};
	const install = (): void => {
		if (view.canInstall) {
			done('install');
			return;
		}
		notice = `install is not offered: ${view.errors[0] ?? 'see the lines above (a route that runs elsewhere, a check that did not pass, no root password)'}`;
	};
	const submit = (): void => {
		const text = editText(edit).trim();
		if (text !== '') done(mode === 'edit' ? `edit ${text}` : `write ${text}`);
	};
	const COMMAND: Readonly<Record<string, () => void>> = {
		enter: install,
		'char:e': () => enterMode('edit'),
		'char:w': () => enterMode('write'),
		esc: () => done(BACK),
		up: () => {
			scroll = Math.max(0, scroll - 1);
		},
		down: () => {
			scroll += 1;
		},
		pgup: () => {
			scroll = Math.max(0, scroll - 10);
		},
		pgdn: () => {
			scroll += 10;
		},
	};
	const typing = (name: string): void => {
		if (name === 'enter' || name === 'esc') {
			name === 'enter' ? submit() : enterMode('command');
			return;
		}
		const next = editKey(edit, name);
		if (next !== null && accepted(mode, next)) edit = next;
	};
	const actionLine = (width: number): Line[] => {
		if (mode === 'edit')
			return [
				[
					seg('edit step: ', 'accent'),
					seg(`${editText(edit)}▏`, 'text', { sel: true }),
					seg(`   ${editableText(view)}`, 'faint'),
				],
			];
		if (mode === 'write')
			return [
				[seg('write the answers to (no secret is written):', 'accent')],
				valueBox(editText(edit), edit.caret, Math.max(10, width - 2)),
			];
		const head: Line = view.canInstall
			? [
					seg('❯ ', 'accent'),
					seg('Install', 'text', { bold: true }),
					seg('   enter — then type yes', 'faint'),
				]
			: [
					seg('install is not offered here', 'warn'),
					seg('   e edit · w write the answers · ctrl+q quit', 'faint'),
				];
		return [head, ...(notice === null ? [] : wrapped(notice, width, 'err'))];
	};
	return {
		id: 'review',
		kind: 'review',
		get editing() {
			return mode !== 'command';
		},
		placement: 'page',
		title: view.screen.title,
		label: view.screen.title,
		description: view.screen.description,
		lines: (ctx: DrawContext) => {
			const lines = [
				...wrapped(view.screen.description, ctx.width, 'muted'),
				...bodyLines(view, ctx.width),
			];
			scroll = Math.min(scroll, Math.max(0, lines.length - 1));
			const focus = Math.min(lines.length - 1, scroll + Math.floor(ctx.layout.paneHeight / 2));
			return { lines, focus: scroll === 0 ? 0 : focus, pinned: [BLANK, ...actionLine(ctx.width)] };
		},
		keys: () => MODE_KEYS[mode],
		onKey: (name: string) => (mode === 'command' ? COMMAND[name]?.() : typing(name)),
		onPaste: (text: string) => {
			if (mode === 'write') edit = pasteInto(edit, text);
		},
		pending: () => ({ id: 'review', kind: 'review', value: mode }),
	};
}
