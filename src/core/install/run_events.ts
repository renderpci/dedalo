/**
 * THE INSTALL RUN'S EVENTS (terminal installer phase 3, 2026-10-12) — what the
 * executor (executor.ts) tells a front end while it runs, and what a front end
 * offers the run (RunIo, RunReporter). Types only, so a front end draws the
 * progress without importing the executor (or, through it, the engine).
 *
 * The executor's headless transcript is unchanged by these events: `log` and
 * `warn` are called exactly as before; `step` is an ADDITIONAL, optional
 * listener (gate: install_executor_events_native).
 */

import type { StepId } from './install_plan.ts';

export type StepPhase =
	| 'start'
	| 'skipped'
	| 'adopted'
	| 'done'
	| 'failed'
	| 'interrupted'
	| 'undo';

/** One step's progress (every text redacted by the executor before it is sent). */
export interface StepEvent {
	/** An engine step, or a host step (phase 4 — a host route's run). */
	step: StepId;
	label: string;
	phase: StepPhase;
	/** done: finished_at − started_at of the step's record; null when unknown. */
	elapsedMs: number | null;
	message?: string;
	warnings?: readonly string[];
}

/** What a run writes to (ExecutorIo is this). */
export interface RunIo {
	log(line: string): void;
	warn(line: string): void;
	/**
	 * The ONE-TIME display of a generated secret (the salt), when the front end
	 * has a terminal for it. Answers whether the lines reached a TERMINAL — only
	 * then is the secret recorded as shown. Absent (the headless CLI): the line
	 * is logged once.
	 */
	showOnce?(lines: readonly string[]): boolean;
	/** A step's progress (optional: the headless CLI has no listener). */
	step?(event: StepEvent): void;
	/**
	 * The executor's own SIGINT/SIGTERM handlers are ARMED (true, on entry) or
	 * gone (false, on return) — a front end that holds the terminal delegates
	 * the signals only while they are armed.
	 */
	signals?(armed: boolean): void;
	/**
	 * The run stopped on a signal — called on EVERY interrupt (inside a step or
	 * not), before the interrupt line and the resume hint are warned: a front
	 * end that holds the terminal keeps those lines for the restored screen.
	 */
	interrupted?(signal: 'SIGINT' | 'SIGTERM'): void;
	/**
	 * A line the run asks the front end to tell the operator, never to log (a
	 * host route's told commands — firewall, modules). Absent: logged.
	 */
	tell?(lines: readonly string[]): void;
	/**
	 * The run is a host route's engine CHILD (--events-jsonl): the parent tells
	 * how to resume or undo, in its own route's words — the child prints none of
	 * its own (`bun run scripts/install.ts --resume` is wrong there: C3-54).
	 */
	readonly delegated?: true;
}

/** The plan's words before the run (notes, warnings, suggestions). */
export interface RunAnnouncement {
	title: string;
	notes: readonly string[];
	warnings: readonly string[];
	suggestions: readonly string[];
}

/** How a run's result is told: the outcome as the executor answered it. */
/**
 * What the developer route's final screen tells (TODO-053 — dev_serve.ts
 * devServedView builds it from the WRITTEN .env; screen_text.ts
 * DONE_TEXT.served words it): the command, every URL, the certificate.
 */
export interface DevServedView {
	readonly start: string;
	/** Every address a browser opens the client by (dev_listener_address.ts devListenerUrls). */
	readonly urls: readonly string[];
	/** Other machines reach the listener. */
	readonly network: boolean;
	readonly tls:
		| {
				readonly kind: 'local_ca';
				readonly caFile: string;
				readonly fingerprint: string | null;
				/** Measured at the end of the run; null = not measured (the test seam). */
				readonly trusted: boolean | null;
				/** The manual way, for "not trusted yet". */
				readonly manual: string;
		  }
		| { readonly kind: 'files'; readonly certFile: string }
		| null;
}

/** How a run ended, for the Done sentences (the route and instance, a live instance kept by an abort). */
export interface RunEnding {
	/** `engine_only`: the by-hand host procedure's engine run (its next step is systemd — C3-54). */
	route: 'production' | 'docker' | 'trial' | 'engine' | 'engine_only';
	instance: string;
	keptLive: boolean;
	/** The steps an abort actually undid (its closing sentence says so — C3-50); absent: none. */
	undone?: readonly string[];
	/**
	 * A host route's closing To-do (firewall, modules, the outside check, the
	 * salt's read command): what the operator does — on EVERY front end's
	 * closing screen (campaign 3c D5: the full screen showed none). Absent: none.
	 */
	told?: readonly string[];
	/** The developer route's development server, as the written .env opens it. Absent: none. */
	served?: DevServedView;
}

export interface RunOutcomeView {
	exitCode: number;
	result: 'complete' | 'already_complete' | 'aborted' | 'failed' | 'refused';
	message: string | null;
	failedStep: string | null;
	hint: readonly string[];
}

/**
 * A front end's side of a run (scripts/install.ts drives it): the plain
 * reporter prints, the full-screen one draws the Install and Done screens.
 */
export interface RunReporter {
	readonly io: RunIo;
	/** The run is being prepared (the catalog re-resolved, the environment seeded). */
	prepare?(): void;
	/** The steps the run will go through, in order (before the first event). */
	begin?(steps: readonly { id: StepId; label: string }[]): void;
	announce(announcement: RunAnnouncement): void;
	/** Tell the outcome (the caller exits with outcome.exitCode afterwards). */
	finish(
		outcome: RunOutcomeView,
		context: {
			mode: 'fresh' | 'resume' | 'abort';
			rootVerified: boolean;
			/** The route's own Done sentences (screen_text.ts DONE_TEXT.next / abortedFor). */
			ending: RunEnding;
		},
	): Promise<void>;
}
