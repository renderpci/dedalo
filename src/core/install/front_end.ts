/**
 * THE INTERACTIVE FRONT END'S CONTRACT (terminal installer phase 2,
 * 2026-10-12) — shared by the ONE interactive session (install_session.ts),
 * whichever prompter draws it: the plain line mode (ui_plain/) or the
 * full-screen UI (ui/, loaded through tui_loader.ts):
 *
 *  - WHICH front end runs (selectFrontEnd): headless whenever the invocation
 *    already carries what to do (install_plan.ts isHeadlessInvocation);
 *    otherwise interactive — refused when stdin is not a terminal (piped input
 *    gets a pointer to --answers) or cannot be put in raw mode (hidden input is
 *    impossible), or when no terminal can show the prompts; PLAIN when asked
 *    (--plain), on TERM unset/dumb, when stdout is not a terminal, or below
 *    80×24; the full-screen UI otherwise (it falls back to plain, with one
 *    line saying why, when it cannot start — tui_loader.ts).
 *    NO_COLOR changes colour only, never the mode.
 *  - WHAT it hands back (FrontEndResult): the RAW answers + the secrets it
 *    collected, and the decisions the operator REVIEWED — scripts/install.ts
 *    runs the SAME plan → executor path as a headless run, re-resolving the
 *    ontology catalog in process, and refuses when the decisions it reaches
 *    differ from the reviewed ones (the catalog changed in between).
 *  - HOW it probes (InstallProbes): every probe that touches the engine's
 *    configuration runs in a CHILD process (install_probe_client.ts → install_probe.ts) —
 *    config freezes at import, and the front end must stay config-free until
 *    the run starts. Gates inject fakes.
 *
 * Types, the selection table, the decision comparison — and the ONE
 * answers-file writer (`--write-answers`, the Review's `write`). Kept off the
 * server's import closure (install_screen_model_tripwire).
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { HierarchyChoiceView, HierarchyTypologyView } from './hierarchy_meta.ts';
import {
	ANSWERS_FILE_SCHEMA,
	answersFileOf,
	type CliInstallInvocation,
	type InstallAnswers,
	type InstallPlan,
	type InstallRoute,
	isHeadlessInvocation,
} from './install_plan.ts';
import type { OntologyCatalog } from './ontology_choice.ts';
import { installPrivateDir } from './paths.ts';
import { type Secrets, writeFileAtomic } from './run_files.ts';
import type { ProbeOutcome } from './screen_model.ts';

/** The terminal as scripts/install.ts measures it (the only place that reads process state). */
export interface TerminalCaps {
	stdinTty: boolean;
	stdoutTty: boolean;
	/** stderr is a terminal (the prompt sink when stdout is redirected). */
	stderrTty: boolean;
	/** /dev/tty can be opened for writing (the last-resort prompt sink). */
	ttyDevice: boolean;
	/** stdin can enter raw mode (hidden input needs it). */
	rawMode: boolean;
	term?: string;
	noColor: boolean;
	columns?: number;
	rows?: number;
}

/** The smallest terminal the full-screen UI is drawn in. */
export const MIN_COLUMNS = 80;
export const MIN_ROWS = 24;

export type FrontEndChoice =
	| { kind: 'headless' }
	| { kind: 'interactive'; ui: 'tui' | 'plain'; reason: string; sink: PromptSink }
	| { kind: 'refuse'; error: string };

/** Where an interactive front end writes its prompts (never into a redirected stdout). */
export type PromptSink = 'stdout' | 'stderr' | 'tty';

export const PIPED_STDIN_REFUSAL =
	'stdin is not a terminal — give the answers with --answers <file> (and the secrets via DEDALO_INSTALL_* or --secrets-stdin)';
export const NO_RAW_MODE_REFUSAL =
	'this terminal cannot hide typed input (no raw mode) — give the answers with --answers <file>';
export const NO_TERMINAL_SINK_REFUSAL =
	'no terminal to show the questions on (stdout and stderr are redirected and /dev/tty cannot be opened) — give the answers with --answers <file>';

/** The prompt sink: stdout when it is a terminal, else stderr, else /dev/tty; null = none. */
function promptSink(caps: TerminalCaps): PromptSink | null {
	if (caps.stdoutTty) return 'stdout';
	if (caps.stderrTty) return 'stderr';
	return caps.ttyDevice ? 'tty' : null;
}

/** Is the terminal below the full-screen UI's size (unknown counts as too small)? */
function tooSmall(caps: TerminalCaps): boolean {
	return (caps.columns ?? 0) < MIN_COLUMNS || (caps.rows ?? 0) < MIN_ROWS;
}

/** The plain-mode rules, in order: the first that applies is the reason. */
const PLAIN_RULES: readonly { applies: (caps: TerminalCaps) => boolean; reason: string }[] = [
	{
		applies: (caps) => (caps.term ?? '') === '' || caps.term === 'dumb',
		reason: 'TERM is unset or dumb',
	},
	{ applies: (caps) => !caps.stdoutTty, reason: 'stdout is not a terminal' },
	{ applies: tooSmall, reason: `the terminal is smaller than ${MIN_COLUMNS}×${MIN_ROWS}` },
];

/** Why the plain mode is used, or null (the full-screen UI can be drawn). */
function plainReason(caps: TerminalCaps, plain: boolean): string | null {
	if (plain) return '--plain';
	return PLAIN_RULES.find((rule) => rule.applies(caps))?.reason ?? null;
}

/** THE selection rule (see the header), in order. */
export function selectFrontEnd(
	caps: TerminalCaps,
	options: { headless: boolean; plain: boolean },
): FrontEndChoice {
	if (options.headless) return { kind: 'headless' };
	if (!caps.stdinTty) return { kind: 'refuse', error: PIPED_STDIN_REFUSAL };
	if (!caps.rawMode) return { kind: 'refuse', error: NO_RAW_MODE_REFUSAL };
	const sink = promptSink(caps);
	if (sink === null) return { kind: 'refuse', error: NO_TERMINAL_SINK_REFUSAL };
	const reason = plainReason(caps, options.plain);
	return reason === null
		? { kind: 'interactive', ui: 'tui', reason: 'a full terminal', sink }
		: { kind: 'interactive', ui: 'plain', reason, sink };
}

/** The selection for a parsed invocation. */
export function selectFrontEndFor(
	caps: TerminalCaps,
	invocation: CliInstallInvocation,
): FrontEndChoice {
	return selectFrontEnd(caps, {
		headless: isHeadlessInvocation(invocation),
		plain: invocation.plain,
	});
}

// ── what the operator reviewed ───────────────────────────────────────────────

/**
 * The decisions a Review shows that a re-resolved catalog could change — the
 * run_files.ts ontologyDecisions shape on an InstallPlan (no content hash: the
 * probe child's extracted copy of a local package is gone by then).
 */
export interface ReviewedDecisions {
	steps: string[];
	envKeys: string[];
	hierarchies: string[];
	activeOntologyTlds: string[];
	ontologyInstall: { tld: string; origin: string }[];
}

export function reviewDecisions(plan: InstallPlan): ReviewedDecisions {
	return {
		steps: [...plan.steps],
		envKeys: [...plan.envKeys],
		hierarchies: [...plan.hierarchies],
		activeOntologyTlds: [...plan.activeOntologyTlds],
		ontologyInstall: (plan.ontologyRequest?.items ?? []).map((item) => ({
			tld: item.tld,
			origin: item.origin,
		})),
	};
}

export const CATALOG_CHANGED_REFUSAL =
	'the ontology catalog changed between review and install — run again';

/** The refusal when the final plan decides otherwise than the reviewed one, else null. */
export function reviewedDecisionsRefusal(
	reviewed: ReviewedDecisions,
	final: InstallPlan,
): string | null {
	return JSON.stringify(reviewDecisions(final)) === JSON.stringify(reviewed)
		? null
		: CATALOG_CHANGED_REFUSAL;
}

// ── the result ───────────────────────────────────────────────────────────────

export type FrontEndResult =
	| {
			kind: 'install';
			/** The plain answers (no secret). */
			raw: Record<string, unknown>;
			secrets: Secrets;
			reviewed: ReviewedDecisions;
			/** Also write the reviewed answers here (--write-answers). */
			writeAnswers?: string;
	  }
	/** The answers were written (`write <path>` at the Review); nothing installed. */
	| { kind: 'written'; path: string }
	/** The operator chose to continue the unfinished install found on start. */
	| { kind: 'resume' }
	/**
	 * The operator chose to UNDO the unfinished install: the database name typed
	 * back (the executor compares it again — it is the authority) and the
	 * database password when the reset needs one.
	 */
	| { kind: 'abort'; confirmDatabase: string; secrets: Secrets }
	/**
	 * Nothing installed. `reason` decides the exit code (scripts/install.ts):
	 * `operator` = a typed `quit` (0), `interrupted` = Ctrl-C / Ctrl-D / SIGINT
	 * (130), `refused` = an answer refused too often, secret entries that never
	 * matched (1).
	 */
	| { kind: 'quit'; reason?: QuitReason };

/**
 * Why the name typed to confirm an abort is refused, or null — it must be the
 * interrupted install's database, exactly (the executor checks it again).
 */
export function abortConfirmRefusal(typed: string, database: string): string | null {
	return typed.trim() === database
		? null
		: `type the database name '${database}' exactly to confirm the abort`;
}

/** Why an interactive session ended without installing (see FrontEndResult). */
export type QuitReason = 'operator' | 'interrupted' | 'refused';

// ── the probes ───────────────────────────────────────────────────────────────

/** The ontology catalog a source offers (null = unreachable: the built-in one is offered). */
export interface CatalogProbeResult {
	ok: boolean;
	detail: string;
	catalog: OntologyCatalog | null;
}

/**
 * Every probe the interactive front end runs, by the PLAIN answers so far (+
 * the one secret a probe needs, never more). The real ones run in the probe
 * child (install_probe_client.ts childProbes); a gate injects fakes.
 */
export interface InstallProbes {
	system(route: InstallRoute): Promise<ProbeOutcome>;
	/** ok = the database exists and the role reaches it. */
	database(answers: Readonly<Record<string, unknown>>, dbPassword: string): Promise<ProbeOutcome>;
	/** ok = the media directory exists writable, or its nearest existing ancestor is writable. */
	media(answers: Readonly<Record<string, unknown>>): Promise<ProbeOutcome>;
	diffusion(
		answers: Readonly<Record<string, unknown>>,
		mysqlPassword: string,
	): Promise<ProbeOutcome>;
	mailer(
		answers: Readonly<Record<string, unknown>>,
		smtpPass: string,
		sendTo?: string,
	): Promise<ProbeOutcome>;
	ontologyCatalog(
		answers: Readonly<Record<string, unknown>>,
		priorEnv: Readonly<Record<string, string>>,
	): Promise<CatalogProbeResult>;
}

/** The thesaurus offer the front end shows (read once, config-free: hierarchyChoiceView). */
export interface ThesaurusOffer {
	hierarchies: HierarchyChoiceView[];
	hierarchy_typologies: HierarchyTypologyView[];
}

// ── the answers file ─────────────────────────────────────────────────────────

/** Does `path` parse as an answers file (dedalo.install.answers/1)? */
function isAnswersFile(path: string): boolean {
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as { schema?: unknown };
		return parsed?.schema === ANSWERS_FILE_SCHEMA;
	} catch {
		return false;
	}
}

/** Is `target` the private directory or inside it? */
function insidePrivateDir(target: string): boolean {
	const fromPrivate = relative(resolve(installPrivateDir()), target);
	return fromPrivate === '' || !(fromPrivate.startsWith('..') || isAbsolute(fromPrivate));
}

/** Why `target` may not receive an answers file, or null. */
function answersTargetRefusal(path: string, target: string): string | null {
	if (insidePrivateDir(target)) {
		return `--write-answers: ${path} is inside the private directory — choose a path outside it`;
	}
	if (existsSync(target) && !isAnswersFile(target)) {
		return `--write-answers: ${path} exists and is not an answers file (${ANSWERS_FILE_SCHEMA}) — refusing to replace it`;
	}
	return null;
}

/**
 * Write `answers` as an answers file at `path` (0600, atomic — answersFileOf:
 * the plain keys only). Answers the refusal sentence, or null when written.
 * REFUSED: a path inside the install's private directory (`--write-answers
 * ../private/.env` would replace the configuration), and an existing file
 * that is not an answers file — an answers file is the only thing it replaces.
 */
export function writeAnswersFile(path: string, answers: InstallAnswers): string | null {
	const target = resolve(path);
	const refusal = answersTargetRefusal(path, target);
	if (refusal !== null) return refusal;
	try {
		writeFileAtomic(target, `${JSON.stringify(answersFileOf(answers), null, 2)}\n`);
	} catch (error) {
		return `--write-answers: ${path}: ${(error as Error).message}`;
	}
	return null;
}
