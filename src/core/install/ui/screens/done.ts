/**
 * THE DONE SCREEN (terminal installer phase 3, 2026-10-12) — the card with the
 * logo (≥ 30 rows): the outcome in the plain CLI's own sentences (screen_text.ts
 * DONE_TEXT), the generated secret shown ONCE (and where it is kept), and what
 * comes next — the supervisor, then the browser: post-install work
 * (thesauri, toponymies, restore, updates) stays in Maintenance. Variants: a
 * failed run (its message and resume hint), an aborted one, the answers file
 * written from the Review (trial: "Docker without media protection"). It
 * stays until Enter or q — the terminal's selection works (no mouse mode).
 */

import type { RunEnding, RunOutcomeView } from '../../run_events.ts';
import { DONE_TEXT, ROUTE_TEXT } from '../../screen_text.ts';
import type { CardModel } from '../frame.ts';
import { type Line, seg } from '../styled.ts';
import { wrapped } from '../widgets/field_parts.ts';
import { BLANK } from '../widgets/notices.ts';
import { shownOnceLines } from './install.ts';

export type DoneModel =
	| {
			kind: 'run';
			outcome: RunOutcomeView;
			mode: 'fresh' | 'resume' | 'abort';
			rootVerified: boolean;
			shownOnce: readonly string[];
			ending: RunEnding;
	  }
	/** `route`: the route the answers are for (its own entry command runs them — C3-53). */
	| { kind: 'written'; path: string; trial: boolean; route: string };

/** What comes next after a complete install (a host route already started the server). */
function nextLines(ending: RunEnding, width: number): Line[] {
	// The developer route: the served block IS what comes next (TODO-053).
	if (ending.served !== undefined) {
		return [
			[seg('Next', 'text', { bold: true })],
			...DONE_TEXT.served(ending.served).flatMap((line) => wrapped(line, width, 'text')),
		];
	}
	return [
		// First: a card too short for every line clips the bottom, and these are the operator's to do
		// (all of them are also left on the main screen when the UI closes).
		...todoCardLines(ending, width),
		[seg('Next', 'text', { bold: true })],
		...wrapped(`1 ${DONE_TEXT.next(ending)}`, width, 'muted'),
		...wrapped(`2 ${DONE_TEXT.browser}`, width, 'muted'),
	];
}

/**
 * A host route's closing To-do, on the card itself (campaign 3c D5: the full
 * screen showed none — the lines flashed by under their steps and were gone).
 */
function todoCardLines(ending: RunEnding, width: number): Line[] {
	const told = ending.told ?? [];
	if (told.length === 0) return [];
	return [
		[seg(DONE_TEXT.todoHeading, 'warn', { bold: true })],
		...told.flatMap((line) => wrapped(`• ${line}`, width, 'text')),
		BLANK,
	];
}

/**
 * The generated secret, on WHATEVER card ends the run: once handed to the
 * screen it is recorded as shown, so a failed run's card must show it too.
 */
function secretLines(shownOnce: readonly string[], width: number): Line[] {
	const secret = shownOnceLines(shownOnce, width);
	return secret.length === 0 ? [] : [...secret, ...wrapped(DONE_TEXT.saltStored, width, 'muted')];
}

function completeCard(model: Extract<DoneModel, { kind: 'run' }>, width: number): CardModel {
	return {
		title: 'installed',
		tone: 'ok',
		info: [
			[seg('Dédalo is installed', 'ok', { bold: true })],
			...wrapped(DONE_TEXT.complete(model.rootVerified), width, 'muted'),
			...secretLines(model.shownOnce, width),
		],
		below: nextLines(model.ending, width),
	};
}

function failedCard(model: Extract<DoneModel, { kind: 'run' }>, width: number): CardModel {
	const outcome = model.outcome;
	const refused = outcome.result === 'refused';
	const at = outcome.failedStep === null ? '' : ` at step [${outcome.failedStep}]`;
	return {
		title: refused ? 'refused' : 'install failed',
		tone: 'err',
		info: [
			[
				seg(refused ? 'Refused — nothing was changed' : 'The install stopped', 'err', {
					bold: true,
				}),
			],
			...wrapped(`${at.trim()} ${outcome.message ?? ''}`.trim(), width, 'text'),
			...secretLines(model.shownOnce, width),
		],
		below: outcome.hint.flatMap((line) => wrapped(line, width, 'muted')),
	};
}

function abortedCard(ending: RunEnding, width: number): CardModel {
	return {
		title: 'aborted',
		tone: 'warn',
		info: [
			[seg('Install aborted', 'warn', { bold: true })],
			...wrapped(DONE_TEXT.abortedFor(ending), width, 'muted'),
		],
		below: todoCardLines(ending, width),
	};
}

function writtenCard(model: Extract<DoneModel, { kind: 'written' }>, width: number): CardModel {
	const trial = model.trial
		? [
				BLANK,
				...wrapped(
					`${ROUTE_TEXT.trial.label}: ${ROUTE_TEXT.trial.badge}. ${ROUTE_TEXT.trial.description}`,
					width,
					'warn',
				),
			]
		: [];
	return {
		title: 'answers written',
		tone: 'accent',
		info: [
			[seg('Nothing was installed', 'text', { bold: true })],
			...wrapped(DONE_TEXT.written(model.path), width, 'muted'),
			...trial,
		],
		below: wrapped(DONE_TEXT.writtenNext(model.route), width, 'muted'),
	};
}

/** The card for a model. */
export function doneCard(model: DoneModel, width: number): CardModel {
	if (model.kind === 'written') return writtenCard(model, width);
	if (model.outcome.exitCode !== 0) return failedCard(model, width);
	return model.outcome.result === 'aborted'
		? abortedCard(model.ending, width)
		: completeCard(model, width);
}

/** The one sentence left on the main screen after the UI closes (never a secret). */
export function doneSummary(model: DoneModel): string {
	if (model.kind === 'written') return `✔ ${DONE_TEXT.written(model.path)}`;
	if (model.outcome.exitCode !== 0) return `✖ ${DONE_TEXT.failure(model.outcome)}`;
	if (model.outcome.result === 'aborted') return `✔ ${DONE_TEXT.abortedFor(model.ending)}`;
	return `✔ ${DONE_TEXT.complete(model.rootVerified)}. ${DONE_TEXT.next(model.ending)}`;
}
