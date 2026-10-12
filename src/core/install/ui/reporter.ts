/**
 * THE RUN, ON SCREEN (terminal installer phase 3, 2026-10-12) — the
 * RunReporter scripts/install.ts drives once the walker returned `install`
 * (or `resume` / `abort`): the Install screen from the executor's step events,
 * the log lines into the ring (the `l` view — sanitized and, the executor's
 * redaction wrapping the capture, redacted), the generated secret into the
 * shown-once box, then the Done card (a key closes it). Lines the executor
 * prints after an interrupt also go to the exit notice: they are what the
 * operator must read once the terminal is back (the resume hint).
 */

import { sanitizeLine } from '../display_text.ts';
import type { RunReporter } from '../run_events.ts';
import type { App } from './app.ts';
import type { DoneModel } from './screens/done.ts';
import { applyStepEvent } from './screens/install.ts';

type ShowDone = (model: DoneModel, code: number, lines: readonly string[]) => Promise<never>;

export function tuiReporter(app: App, showDone: ShowDone): RunReporter {
	let interrupted = false;
	const line = (text: string): void => {
		app.log.push(text);
		const last = sanitizeLine(text).trim();
		if (last !== '') app.run.lastLog = last;
		if (interrupted) app.life.notice([text]);
		app.draw();
	};
	const enterRun = (): void => {
		app.widget = null;
		app.cancel = null;
		app.life.phase('run');
	};
	return {
		io: {
			log: line,
			warn: line,
			showOnce: (lines) => {
				app.run.shownOnce = [...app.run.shownOnce, ...lines];
				app.draw();
				return true;
			},
			step: (event) => {
				if (event.phase === 'interrupted') interrupted = true;
				applyStepEvent(app.run, event);
				app.draw();
			},
			signals: (armed) => app.life.armed(armed),
			interrupted: () => {
				interrupted = true;
			},
		},
		prepare: () => {
			enterRun();
			app.draw();
		},
		begin: (steps) => {
			enterRun();
			app.run.steps = steps.map((step) => ({
				id: step.id,
				label: step.label,
				status: 'pending',
				elapsedMs: null,
				warnings: [],
				message: null,
			}));
			app.draw();
		},
		announce: (announcement) => {
			app.run.announcement = announcement;
			app.draw();
		},
		finish: async (outcome, context) => {
			app.run.outcome = outcome;
			app.run.preparing = false;
			await showDone(
				{
					kind: 'run',
					outcome,
					mode: context.mode,
					rootVerified: context.rootVerified,
					shownOnce: app.run.shownOnce,
				},
				outcome.exitCode,
				outcome.exitCode === 0 ? [] : [...outcome.hint],
			);
		},
	};
}
