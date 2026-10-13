/**
 * THE FULL-SCREEN PROMPTER (terminal installer phase 3, 2026-10-12) — the
 * InstallPrompter the walker (install_session.ts) drives when the full-screen
 * UI is up: every ask puts its widget on screen and resolves when the widget
 * answers — with the plain mode's answer values, so the session cannot tell
 * the two apart. Ctrl-C / Ctrl-D / SIGINT end the pending ask as QUIT with
 * stopReason `interrupted`; three mismatching secret entries end it as
 * `refused`; a confirmed Ctrl-Q ends it as a chosen quit.
 *
 * `pending()` describes the ask for the gates' key driver — read only, and
 * never a secret's value.
 */

import { sanitizeLine } from '../display_text.ts';
import type { InstallPrompter, Nav, PasswordFeedback } from '../prompter_contract.ts';
import { QUIT } from '../prompter_contract.ts';
import type { Question, Screen } from '../screen_model.ts';
import type { PendingView } from '../tui_loader.ts';
import type { App } from './app.ts';
import { probePage, resumePage, welcomePage } from './screens/pages.ts';
import { reviewPage } from './screens/review.ts';
import type { Widget } from './widget.ts';
import { checklistField } from './widgets/checklist.ts';
import { choiceField } from './widgets/choice.ts';
import { acknowledgeField, confirmField } from './widgets/confirm.ts';
import { secretField } from './widgets/secret_field.ts';
import { textField } from './widgets/text_field.ts';

/** The walker's progress lines (`checking: …`, `reading the ontology catalog…`). */
const PROGRESS = /^(checking: |reading the ontology catalog)/;

/** A progress line (shown while the work runs; not a message for the page that follows). */
export const isProgressLine = (line: string): boolean => PROGRESS.test(line);

/** The question whose acknowledgement is a TYPED yes (the install itself, as in plain mode). */
const TYPED_YES = 'review.install';

/**
 * What was said on the PREVIOUS screen and is still shown on the next one (a
 * passed check's verdict: a screen without questions — the System check —
 * advances on its own) is headed by that screen's title, so its rows never
 * read as part of the next screen's form (campaign 3 C3-49).
 */
function carriedOver(said: string[], previous: Screen | undefined, next: Screen): string[] {
	if (said.length === 0 || previous === undefined || previous.id === next.id) return said;
	return [`${previous.title}:`, ...said];
}

/** Put a widget on screen; resolve with its answer (or QUIT on an interrupt / a confirmed quit). */
function ask<T>(app: App, make: (done: (answer: T) => void) => Widget): Promise<T> {
	return new Promise<T>((resolve) => {
		let settled = false;
		const done = (answer: T): void => {
			if (settled) return;
			settled = true;
			app.cancel = null;
			app.widget = null;
			app.said = [];
			resolve(answer);
			app.draw();
		};
		app.cancel = (reason) => {
			if (reason !== null) app.stopped = reason;
			done(QUIT as T);
		};
		app.overlay = null;
		app.widget = make(done);
		app.draw();
	});
}

export function tuiPrompter(app: App): InstallPrompter & { pending(): PendingView | null } {
	return {
		interactive: true,
		view: (view) => {
			const previous = app.view?.screen;
			app.view = view;
			// A finished check's or catalog read's progress line is not kept past the next view.
			app.said = carriedOver(
				app.said.filter((line) => !isProgressLine(line)),
				previous,
				view.screen,
			);
			app.draw();
		},
		screen: () => undefined,
		say: (lines) => {
			app.said.push(...lines.map(sanitizeLine));
			app.draw();
		},
		welcome: (view) => ask<Nav | null>(app, (done) => welcomePage(view, done)),
		resume: (view) => {
			app.unfinished = true;
			return ask<'resume' | 'abort' | Nav>(app, (done) => resumePage(view, done));
		},
		text: (question: Question) =>
			ask<string | Nav>(app, (done) => textField(question, done as (answer: unknown) => void)),
		choice: (question) => ask<string | Nav>(app, (done) => choiceField(question, done)),
		multi: (question) => ask<string[] | Nav>(app, (done) => checklistField(question, done)),
		secret: (question, feedback?: PasswordFeedback) =>
			ask<string | Nav>(app, (done) =>
				secretField(question, feedback, done, () => {
					app.stopped = 'refused';
				}),
			),
		confirm: (question) => ask<boolean | Nav>(app, (done) => confirmField(question, done)),
		acknowledge: (question) =>
			ask<boolean | Nav>(app, (done) =>
				question.id === TYPED_YES
					? textField(question, done as (answer: unknown) => void, { typedYes: true })
					: acknowledgeField(question, done),
			),
		probe: (view) => ask<string | Nav>(app, (done) => probePage(view, done)),
		review: (view) => ask<string | Nav>(app, (done) => reviewPage(view, done)),
		showOnce: (lines) => {
			app.run.shownOnce = [...app.run.shownOnce, ...lines];
			app.draw();
			return true;
		},
		stopReason: () => app.stopped,
		pending: () => (app.cancel === null ? null : (app.widget?.pending() ?? null)),
	};
}
