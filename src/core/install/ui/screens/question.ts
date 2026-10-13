/**
 * A MODEL SCREEN, DRAWN (terminal installer phase 3, 2026-10-12) — what the
 * walker last sent (ScreenView: the screen as the model rebuilt it) with the
 * asking widget in place of its question: the description (clamped; F1 shows
 * it whole), the notices, every visible question with its CURRENT value
 * (answered ones in full, pending ones dimmed), the focused one live, then
 * what the session said. A question the screen does not hold (the abort's
 * typed database name, the test-mail recipient, the install's typed yes) is
 * drawn after the list, under its own label. Plus the left rail of the
 * route's steps.
 */

import { sanitizeLine } from '../../display_text.ts';
import type { RouteScreen, ScreenView } from '../../prompter_contract.ts';
import type { Option, Question } from '../../screen_model.ts';
import type { PaneModel } from '../frame.ts';
import { type Line, seg } from '../styled.ts';
import type { DrawContext, Widget } from '../widget.ts';
import { labelSeg, wrapped } from '../widgets/field_parts.ts';
import { BLANK, noticeLines, saidLines, screenExtras } from '../widgets/notices.ts';

/** The run states the rail adds after the model's screens. */
export const RUN_STATES = ['Install', 'Done'] as const;

export type RailState = 'done' | 'current' | 'pending' | 'skipped';

/** One rail row: `✓  3 Database` (compact: the mark and the number). */
function railRow(mark: RailState, index: number, title: string, full: boolean): Line {
	const MARK: Readonly<Record<RailState, [string, 'ok' | 'accent' | 'faint']>> = {
		done: ['✓', 'ok'],
		current: ['›', 'accent'],
		pending: ['·', 'faint'],
		skipped: ['–', 'faint'],
	};
	const [glyph, role] = MARK[mark];
	const number = String(index).padStart(2, ' ');
	const titleRole = mark === 'current' ? 'accent' : mark === 'done' ? 'text' : 'faint';
	const head: Line = [seg(glyph, role), seg(` ${number}`, 'faint')];
	return full ? [...head, seg(` ${title}`, titleRole, { bold: mark === 'current' })] : head;
}

/** A model screen's rail state. */
function screenState(screen: RouteScreen, view: ScreenView | null, current: string): RailState {
	if (screen.id === current) return 'current';
	if (!(view?.seen ?? []).includes(screen.id)) return 'pending';
	return screen.placeholder ? 'skipped' : 'done';
}

/**
 * The rail: the route's screens (from the walker's view), then Install and
 * Done. `current` is a screen id, or a run state's name.
 */
export function railLines(
	view: ScreenView | null,
	current: string,
	runStates: Readonly<Record<string, RailState>>,
	full: boolean,
): Line[] {
	const screens = view?.screens ?? [];
	const rows = screens.map((screen) =>
		railRow(screenState(screen, view, current), screen.index, screen.title, full),
	);
	RUN_STATES.forEach((name, offset) => {
		rows.push(railRow(runStates[name] ?? 'pending', screens.length + offset + 1, name, full));
	});
	return rows;
}

/** The selected option labels of a choice/multi value. */
function optionLabels(options: readonly Option[] | undefined, values: readonly string[]): string {
	return values
		.map((value) => {
			const option = options?.find((item) => item.value === value);
			return option === undefined || option.label === '' ? value : option.label;
		})
		.join(', ');
}

/** A multi value's words: the count, then the values. */
function multiText(value: unknown): string {
	const values = Array.isArray(value) ? value.map(String) : [];
	return values.length === 0 ? '0 selected' : `${values.length} selected: ${values.join(', ')}`;
}

/** What a question's row shows as its value, by kind (text is the fallback). */
const VALUE_TEXT: Readonly<
	Partial<Record<Question['kind'], (question: Question, value: unknown) => string>>
> = Object.freeze({
	secret: (question: Question) => (question.answered ? '•••••• given' : 'not set'),
	acknowledge: (question: Question) => (question.answered ? 'accepted' : '—'),
	confirm: (_question: Question, value: unknown) => (value === true ? 'yes' : 'no'),
	multi: (_question: Question, value: unknown) => multiText(value),
	choice: (question: Question, value: unknown) =>
		optionLabels(question.options, [String(value ?? '')]),
});

function valueText(question: Question): string {
	const value = question.value ?? question.default;
	const text = VALUE_TEXT[question.kind];
	return text === undefined ? String(value ?? '') : text(question, value);
}

/** A question not being asked: label, value (dimmed while unanswered), ✗ on an error. */
function summaryRow(question: Question): Line {
	const failed = question.answered && question.errors.length > 0;
	return [
		labelSeg(question.label),
		seg(` ${sanitizeLine(valueText(question))}`, question.answered ? 'text' : 'faint'),
		...(failed ? [seg('  ✗', 'err')] : []),
	];
}

/** The screen's head: description (clamped), notices, extras. */
function headLines(view: ScreenView, ctx: DrawContext): Line[] {
	const description = wrapped(view.screen.description, ctx.width, 'muted');
	const clamped = description.slice(0, ctx.layout.descLines);
	return [...clamped, ...noticeLines(view.screen.notices, ctx.width), BLANK];
}

/** The questions, the asking widget in its place. */
function questionLines(
	view: ScreenView,
	widget: Widget | null,
	ctx: DrawContext,
): { lines: Line[]; focus: number | null } {
	const lines: Line[] = [];
	let focus: number | null = null;
	for (const question of view.screen.questions) {
		if (widget !== null && question.id === widget.id) {
			const drawn = widget.lines(ctx);
			focus = lines.length + drawn.focus;
			lines.push(...drawn.lines);
		} else lines.push(summaryRow(question));
	}
	return { lines, focus };
}

/** A widget whose question is not on the screen: after the list, under its label. */
function standalone(
	widget: Widget,
	ctx: DrawContext,
	offset: number,
): { lines: Line[]; focus: number } {
	const drawn = widget.lines(ctx);
	return { lines: [BLANK, ...drawn.lines], focus: offset + 1 + drawn.focus };
}

/** The screen and the widget: its lines and the focus (null when nothing is asked). */
function bodyOf(
	view: ScreenView | null,
	widget: Widget | null,
	ctx: DrawContext,
): { lines: Line[]; focus: number | null } {
	if (view === null) return { lines: [], focus: null };
	const head = headLines(view, ctx);
	const list = questionLines(view, widget, ctx);
	return {
		lines: [...head, ...list.lines],
		focus: list.focus === null ? null : head.length + list.focus,
	};
}

/** The body with a widget its screen does not hold appended (under its own label). */
function withWidget(
	body: { lines: Line[]; focus: number | null },
	widget: Widget | null,
	ctx: DrawContext,
): { lines: Line[]; focus: number | null } {
	if (widget === null || body.focus !== null) return body;
	const extra = standalone(widget, ctx, body.lines.length);
	return { lines: [...body.lines, ...extra.lines], focus: extra.focus };
}

/** What follows the questions: what was said, then the screen's manual step and links. */
function tailLines(view: ScreenView | null, said: readonly string[], ctx: DrawContext): Line[] {
	const spoken = said.length === 0 ? [] : [BLANK, ...saidLines(said, ctx.width)];
	const extras = view === null ? [] : screenExtras(view.screen, ctx.width);
	return [...spoken, ...(extras.length === 0 ? [] : [BLANK, ...extras])];
}

/** THE question pane: the screen, the widget, what was said. */
export function questionPane(
	view: ScreenView | null,
	widget: Widget | null,
	said: readonly string[],
	ctx: DrawContext,
): PaneModel {
	const body = withWidget(bodyOf(view, widget, ctx), widget, ctx);
	const tail = tailLines(view, said, ctx);
	// Nothing asked: the newest said line (a running check) stays in view.
	const focus = body.focus ?? body.lines.length + Math.min(tail.length, 3) - 1;
	return {
		title: view?.screen.title ?? widget?.title ?? 'Dédalo installer',
		lines: [...body.lines, ...tail],
		focus: Math.max(0, focus),
	};
}
