/**
 * THE PLAIN REPORTER — the headless CLI's (and the plain mode's) printing of a
 * run (scripts/install.ts drives it): the announcement, the transcript, the
 * outcome. The full-screen twin is ui/reporter.ts.
 *
 * THE ONE-TIME SALT (campaign 3b C3-18 / N28): the line is shown when the
 * output IS a terminal — the interactive plain mode's prompt sink, or a
 * headless run's own stdout (`sh install.sh --route trial --resume` typed at
 * a terminal is headless: it printed "not shown here" and contradicted the
 * docs, which promise the salt from whichever run completes the install on a
 * terminal). Redirected output keeps the rule of a run without a one-time
 * display (see `display` below). After a salt was shown, the closing block
 * repeats that it is kept, and that it belongs with the backups — the line
 * itself scrolled by mid-stream, among the step lines.
 *
 * A refused run (nothing was done) is worded `refused:`, never "install
 * failed" (campaign 3b N24 — screen_text.ts DONE_TEXT.failure).
 */

import { sanitizeLine } from '../display_text.ts';
import { interactiveSuggestion } from '../install_plan.ts';
import type { InstallPrompter } from '../prompter_contract.ts';
import type { RunEnding, RunOutcomeView, RunReporter } from '../run_events.ts';
import { DONE_TEXT } from '../screen_text.ts';
import type { TtyOutput } from './terminal.ts';

/** Show `lines` once on a TERMINAL sink; answers whether it was one. */
export function showOnceOn(output: TtyOutput, lines: readonly string[]): boolean {
	if (output.isTTY !== true) return false;
	for (const item of lines) output.write(`${sanitizeLine(item)}\n`);
	return true;
}

/** Where the plain reporter writes (the process console by default; a gate injects one). */
export interface PlainSinks {
	log(line: string): void;
	warn(line: string): void;
	error(line: string): void;
}

const CONSOLE: PlainSinks = {
	log: (line) => console.log(line),
	warn: (line) => console.warn(line),
	error: (line) => console.error(line),
};

/**
 * A complete run's closing lines. A host route says where the salt is read
 * back in its To-do (campaign 3c D3); the engine route repeats where it is kept.
 */
function completeLines(rootVerified: boolean, ending: RunEnding, saltShown: boolean): string[] {
	const keep = saltShown && !hostEnding(ending) ? [`  ${DONE_TEXT.saltKeep}`] : [];
	return [`\n✔ ${DONE_TEXT.complete(rootVerified)}. ${DONE_TEXT.next(ending)}`, ...keep];
}

/** A host route's ending (its closing block carries the To-do, the salt's read command in it). */
export function hostEnding(ending: RunEnding): boolean {
	return ending.route === 'production' || ending.route === 'docker' || ending.route === 'trial';
}

/** The closing To-do block of a host route (campaign 3c D5 — the same lines on every front end). */
export function todoLines(ending: RunEnding): string[] {
	const told = ending.told ?? [];
	return told.length === 0 ? [] : ['', DONE_TEXT.todoHeading, ...told.map((line) => `  • ${line}`)];
}

/** A run that did not complete: its first line, then the hint (when a resume or abort is possible). */
export function printFailure(outcome: RunOutcomeView, sinks: PlainSinks = CONSOLE): void {
	if (outcome.hint.length === 0) {
		sinks.error(`\n✖ ${DONE_TEXT.failure(outcome)}\n`);
		return;
	}
	sinks.error(`\n✖ ${DONE_TEXT.failure(outcome)}`);
	for (const line of outcome.hint) sinks.error(line);
	sinks.error('');
}

export interface PlainReporterOptions {
	/** The interactive plain mode's prompter (its prompt sink shows the salt; advice in its words). */
	prompter?: InstallPrompter;
	/** A headless run's own output (default: this process's stdout) — the salt is shown there when it is a terminal. */
	terminal?: TtyOutput;
	sinks?: PlainSinks;
}

/** The plain reporter (see the header). */
export function plainReporter(options: PlainReporterOptions = {}): RunReporter {
	const { prompter } = options;
	const terminal = options.terminal ?? process.stdout;
	const sinks = options.sinks ?? CONSOLE;
	let saltShown = false;
	const showOnce = (lines: readonly string[]): boolean => {
		const shown = prompter !== undefined ? prompter.showOnce(lines) : showOnceOn(terminal, lines);
		saltShown = saltShown || shown;
		return shown;
	};
	// A headless run whose stdout is NOT a terminal keeps the executors' own rule for
	// a run without a one-time display: the engine logs the line (its transcript is
	// the operator's — the developer CLI, CI), a host route prints the command that
	// reads it back.
	const display = prompter !== undefined || terminal.isTTY === true;
	return {
		io: {
			log: (line) => sinks.log(line),
			warn: (line) => sinks.warn(line),
			...(display ? { showOnce } : {}),
		},
		announce: (announcement) => {
			sinks.log(`\n${announcement.title}\n`);
			for (const note of announcement.notes) sinks.log(`  note: ${note}`);
			for (const warning of announcement.warnings) sinks.warn(`  ⚠ ${warning}`);
			// The interactive plain mode words the advice for its screens, never CLI flags (C3-64).
			for (const suggestion of announcement.suggestions) {
				const said = prompter === undefined ? suggestion : interactiveSuggestion(suggestion);
				sinks.log(`  suggestion: ${said}`);
			}
		},
		finish: async (outcome, context) => {
			if (outcome.exitCode !== 0) return printFailure(outcome, sinks);
			const lines =
				outcome.result === 'aborted'
					? [`\n✔ ${DONE_TEXT.abortedFor(context.ending)}`]
					: completeLines(context.rootVerified, context.ending, saltShown);
			for (const line of [...lines, ...todoLines(context.ending), '']) sinks.log(line);
		},
	};
}
