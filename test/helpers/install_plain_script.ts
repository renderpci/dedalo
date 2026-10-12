/**
 * DRIVING THE PLAIN INTERACTIVE INSTALLER WITHOUT A TERMINAL (terminal
 * installer phase 2, 2026-10-12) — for the gates over
 * src/core/install/install_session.ts (the ONE walker, plain or full-screen):
 *
 *  - `scriptForPlan`: the PlainScript (scriptedInstallPrompter) that answers
 *    the screens so that the plain mode decides the given plan. The question
 *    each answer key is asked by is READ FROM THE SCREEN MODEL (questionByKey —
 *    never a re-typed id table); multi-selects are answered with the plan's own
 *    FULL tick set (the selection the operator leaves on screen).
 *  - `fakeProbes`: InstallProbes that pass (or fail, per probe), record every
 *    call, and answer the ontology catalog a gate supplies.
 *  - `FakeTtyInput` / `FakeTtyOutput` / `FakeSignals` and `autoTerminal`: the
 *    host agent's fake-stream harness (publication/host_agent/tests/
 *    init_tty.test.ts — copied, the agent is never imported), plus an
 *    expect-style responder that types the next line when the output ends in a
 *    prompt — so a whole plain run is driven over real raw-mode reading.
 *
 * Writes nothing, touches no database, spawns nothing.
 */

import type { InstallProbes } from '../../src/core/install/front_end.ts';
import { hierarchyChoiceView } from '../../src/core/install/hierarchy_meta.ts';
import type { InstallPlan } from '../../src/core/install/install_plan.ts';
import type { OntologyCatalog } from '../../src/core/install/ontology_choice.ts';
import type { SecretKey, Secrets } from '../../src/core/install/run_files.ts';
import {
	buildScreens,
	type InstallCatalogs,
	type ProbeOutcome,
	type Question,
	type ScreenModelInput,
} from '../../src/core/install/screen_model.ts';
import type { PlainScript } from '../../src/core/install/ui_plain/prompter.ts';
import type { TtyInput, TtyOutput, TtySignals } from '../../src/core/install/ui_plain/terminal.ts';
import { CORE_ONTOLOGY_TLDS } from '../../src/core/ontology/core_tlds.ts';

/** A root password every policy rule accepts. */
export const GOOD_ROOT_PASSWORD = 'Mosaic-Kestrel-Harbor-47';

/** The thesaurus offer the screens show (what scripts/install.ts reads once). */
export function thesaurusOffer(): InstallCatalogs['thesauri'] {
	return { view: hierarchyChoiceView('lg-eng') };
}

/** A screen-model input over `raw` (no host suggestion, no probe, nothing acknowledged). */
export function modelInput(
	raw: Readonly<Record<string, unknown>>,
	overrides: Partial<ScreenModelInput> = {},
): ScreenModelInput {
	return {
		raw,
		secretsGiven: {},
		priorEnv: {},
		catalogs: { ontology: { catalog: null, ok: true, detail: '' }, thesauri: thesaurusOffer() },
		host: {},
		probes: {},
		acknowledged: new Set(),
		...overrides,
	};
}

/**
 * The answers that turn EVERY conditional question on (production — the
 * instance asked —, publication, mail, air-gapped — the offline package asked).
 */
export const MAXIMAL_RAW: Readonly<Record<string, unknown>> = Object.freeze({
	route: 'production',
	instance: 'zzmax',
	diffusion: true,
	mailer: true,
	update_servers: 'none',
});

/**
 * The answers that turn on the questions MAXIMAL_RAW cannot reach together
 * (phase 4: the certificate paths are asked for `tls_mode files`, the Let's
 * Encrypt contact for `letsencrypt`; the image repository for a custom docker
 * image) — every one alternative of a mutually exclusive choice.
 */
export const MAXIMAL_ALTERNATIVES: readonly Readonly<Record<string, unknown>>[] = Object.freeze([
	Object.freeze({ ...MAXIMAL_RAW, tls_mode: 'files' }),
	Object.freeze({ route: 'docker', image_source: 'custom', tls_mode: 'files' }),
	Object.freeze({ route: 'docker', image_source: 'custom', diffusion: true, mailer: true }),
	Object.freeze({ route: 'trial', image_source: 'custom', diffusion: true, mailer: true }),
	Object.freeze({ route: 'developer', diffusion: true, mailer: true, update_servers: 'none' }),
]);

/**
 * EVERY question that asks each answer key (and secret key), over the maximal
 * screens of every route — a key is asked by a different screen per route
 * (production's `web_tls.server_name`, docker's `tls_address.server_name`).
 */
export function questionsByKey(): ReadonlyMap<string, readonly Question[]> {
	const byKey = new Map<string, Question[]>();
	const screens = [MAXIMAL_RAW, ...MAXIMAL_ALTERNATIVES].flatMap((raw) =>
		buildScreens(modelInput(raw)),
	);
	for (const screen of screens) {
		for (const question of screen.questions) {
			if (question.key === null) continue;
			const list = byKey.get(question.key) ?? [];
			if (!list.some((known) => known.id === question.id)) list.push(question);
			byKey.set(question.key, list);
		}
	}
	return byKey;
}

/** The first question that asks each answer key (and secret key). */
export function questionByKey(): ReadonlyMap<string, Question> {
	const first = new Map<string, Question>();
	for (const [key, list] of questionsByKey()) first.set(key, list[0] as Question);
	return first;
}

/** The answer keys whose question is a multi-select over a selection (answered with the tick set). */
const SELECTION_KEYS: ReadonlySet<string> = new Set([
	'ontologies',
	'hierarchies',
	'declined_dependencies',
	'langs',
]);

/** One answer as typed at its question (a confirm a boolean, everything else text). */
function typed(question: Question, value: unknown): string | boolean {
	if (question.kind === 'confirm') return value === true;
	return value === undefined || value === null ? '' : String(value);
}

/**
 * The script under which the plain mode decides `plan`: every key the CASE set
 * (`keys` — its raw answers), typed at the question that asks it; the three
 * selections answered with the plan's full tick set; the secrets at their
 * secret questions; the root password; then `review` (default: install + yes).
 */
export function scriptForPlan(
	plan: InstallPlan,
	keys: Iterable<string>,
	secrets: Secrets,
	review: readonly string[] = ['install'],
): PlainScript & { answers: Record<string, string | readonly string[] | boolean> } {
	const byKey = questionsByKey();
	const answers: Record<string, string | readonly string[] | boolean> = {
		'route.route': plan.answers.route,
		'ontologies.ontologies': plan.activeOntologyTlds.filter(
			(tld) => !(CORE_ONTOLOGY_TLDS as readonly string[]).includes(tld),
		),
		'thesauri.hierarchies': [...plan.hierarchies],
		'languages.langs': [...plan.langConfig.projectsDefaultLangs],
		'review.install': 'yes',
	};
	// The trial route's no-media-protection acknowledgement is TYPED, never defaulted.
	if (plan.answers.route === 'trial') answers['route.trial_no_media_protection'] = 'yes';
	for (const key of keys) {
		if (SELECTION_KEYS.has(key)) continue;
		for (const question of byKey.get(key) ?? []) {
			if (question.kind === 'secret') continue;
			answers[question.id] = typed(question, plan.answers[key as keyof InstallPlan['answers']]);
		}
	}
	const scriptedSecrets: Record<string, string> = {};
	for (const [key, value] of Object.entries(secrets) as [SecretKey, string | undefined][]) {
		if (value === undefined || value === '') continue;
		for (const question of byKey.get(key) ?? []) scriptedSecrets[question.id] = value;
	}
	return { answers, secrets: scriptedSecrets, review };
}

// ── the probes ───────────────────────────────────────────────────────────────

export interface FakeProbeCall {
	probe: string;
	answers?: Readonly<Record<string, unknown>>;
	secret?: string;
	sendTo?: string;
}

/**
 * InstallProbes that PASS (or fail, per `fail`), recording each call. The
 * ontology catalog is `catalog` (null = the built-in one is offered).
 */
export function fakeProbes(
	options: { catalog?: OntologyCatalog | null; fail?: readonly string[] } = {},
): InstallProbes & { calls: FakeProbeCall[] } {
	const calls: FakeProbeCall[] = [];
	const outcome = (probe: string): ProbeOutcome =>
		options.fail?.includes(probe) === true
			? { ok: false, detail: `${probe} unreachable (fake)` }
			: { ok: true, detail: `${probe} ok (fake)` };
	return {
		calls,
		system: async (route) => {
			calls.push({ probe: 'system', answers: { route } });
			return {
				...outcome('system'),
				rows: [{ state: 'ok', label: 'Bun', detail: 'fake' }],
				version: '0.0.0-fake',
				seedPath: '/fake/seed',
			};
		},
		database: async (answers, secret) => {
			calls.push({ probe: 'db', answers, secret });
			return outcome('db');
		},
		media: async (answers) => {
			calls.push({ probe: 'media', answers });
			return outcome('media');
		},
		diffusion: async (answers, secret) => {
			calls.push({ probe: 'diffusion', answers, secret });
			return outcome('diffusion');
		},
		mailer: async (answers, secret, sendTo) => {
			calls.push({ probe: 'mailer', answers, secret, ...(sendTo === undefined ? {} : { sendTo }) });
			return outcome('mailer');
		},
		ontologyCatalog: async (answers) => {
			calls.push({ probe: 'catalog', answers });
			return { ok: true, detail: '', catalog: options.catalog ?? null };
		},
	};
}

// ── fake terminal streams (copied from the host agent's init_tty.test.ts) ────

export class FakeTtyInput implements TtyInput {
	isTTY = true;
	raw: boolean[] = [];
	listener: ((chunk: Buffer | string) => void) | null = null;
	setRawMode(mode: boolean): void {
		this.raw.push(mode);
	}
	on(_event: 'data', listener: (chunk: Buffer | string) => void): void {
		this.listener = listener;
	}
	removeListener(): void {
		this.listener = null;
	}
	resume(): void {}
	pause(): void {}
	type(chunk: string): void {
		this.listener?.(Buffer.from(chunk));
	}
}

export class FakeTtyOutput implements TtyOutput {
	isTTY = true;
	text = '';
	write(chunk: string): void {
		this.text += chunk;
	}
}

export class FakeSignals implements TtySignals {
	listeners: (() => void)[] = [];
	on(_signal: 'SIGINT', listener: () => void): void {
		this.listeners.push(listener);
	}
	removeListener(_signal: 'SIGINT', listener: () => void): void {
		this.listeners = this.listeners.filter((row) => row !== listener);
	}
	fire(): void {
		for (const listener of [...this.listeners]) listener();
	}
}

/**
 * A terminal that ANSWERS: whenever a question is open (a raw-mode reader is
 * listening) and the output ends in a prompt (no trailing newline), `respond`
 * gets that prompt line and the whole transcript and returns the line to type
 * (sent with Enter), or null to stop answering. `prompts` records each prompt
 * answered. `stop()` ends the responder.
 */
export function autoTerminal(respond: (prompt: string, transcript: string) => string | null): {
	input: FakeTtyInput;
	output: FakeTtyOutput;
	signals: FakeSignals;
	prompts: string[];
	stop(): void;
} {
	const input = new FakeTtyInput();
	const output = new FakeTtyOutput();
	const signals = new FakeSignals();
	const prompts: string[] = [];
	let answeredAt = -1;
	const timer = setInterval(() => {
		const text = output.text;
		if (input.listener === null || text.endsWith('\n') || text.length === answeredAt) return;
		const prompt = text.slice(text.lastIndexOf('\n') + 1);
		const line = respond(prompt, text);
		answeredAt = text.length;
		if (line === null) return;
		prompts.push(prompt);
		input.type(`${line}\r`);
	}, 0);
	return { input, output, signals, prompts, stop: () => clearInterval(timer) };
}
