/**
 * THE INTERACTIVE INSTALL SESSION (terminal installer phase 3, 2026-10-12 —
 * phase 2's plain walker, made UI-neutral) — the ONE walk every interactive
 * front end runs: the plain line mode (ui_plain/prompter.ts) and the
 * full-screen UI (ui/prompter.ts) are two InstallPrompter implementations of
 * the same session, so they cannot differ in order, gating, invalidation,
 * kept secrets, what is handed back or when install is offered. It walks the
 * screen model (screen_model.ts) in the route's order, asks every visible
 * question through the prompter, runs each screen's probe and applies its
 * gate, then shows the Review — and hands back RAW ANSWERS + SECRETS for
 * scripts/install.ts to run through the SAME plan and executor as a headless
 * install (front_end.ts). It decides nothing the model does not.
 *
 * THE WALK:
 *  - the Welcome; then an unfinished install record offers resume / abort /
 *    quit — abort asks the database name typed back (abortConfirmRefusal) and,
 *    when the reset needs it (steps.ts abortNeedsDatabasePassword), the
 *    database password;
 *  - per screen: every visible question not yet asked this session, re-asked
 *    while the model reports errors on it — before each ask the prompter gets
 *    the screen as the model REBUILT it (ScreenView: current values, the route,
 *    the screens shown so far); then the probe — `must_pass`: retry / edit /
 *    quit; `pass_or_acknowledge`: retry / edit / typed `yes` (shown on the
 *    Review);
 *  - an answer that turns questions on (publication, mail, the air-gapped
 *    package) asks them on the same screen; one that hides questions drops their
 *    answers (the model's applyAnswer);
 *  - `back` re-asks the previous screen; FIELD_BACK (the full-screen UI's
 *    Shift-Tab) re-asks the previous question of this screen (on the first one
 *    it is `back`); the Review offers `install` (only with no plan error, on a
 *    route that runs here, and with a typed `yes`), `edit <n>` (re-asks screen
 *    n, then every screen with a question not yet asked), `write <path>` (an
 *    answers file) and `quit`.
 *
 * SECRETS stay in this module's session (never in the model's answers — it
 * only learns WHETHER each was given). A secret supplied by DEDALO_INSTALL_* /
 * --secrets-stdin is kept without asking ("supplied by the environment"); the
 * root password is still held to the policy, and an "edit" after a failed
 * probe asks the screen's kept secret again.
 */

import {
	abortConfirmRefusal,
	type CatalogProbeResult,
	type FrontEndResult,
	type InstallProbes,
	type QuitReason,
	reviewDecisions,
	writeAnswersFile,
} from './front_end.ts';
import { BUILD_DURATION } from './host/stack/layout.ts';
import {
	INSTALL_ANSWER_KEYS,
	type InstallAnswers,
	type InstallPlan,
	type InstallRoute,
	normalizeInstallAnswers,
} from './install_plan.ts';
import {
	BACK,
	FIELD_BACK,
	type InstallPrompter,
	isNav,
	type Nav,
	type ProbeCommand,
	type ProbeView,
	QUIT,
	type ReviewView,
	type ScreenView,
} from './prompter_contract.ts';
import {
	type InstallState,
	readInstallEnv,
	readPlanFile,
	readStateFile,
	type SecretKey,
	type Secrets,
	secretsFromEnv,
} from './run_files.ts';
import {
	applyAnswer,
	buildScreens,
	type InstallCatalogs,
	type ProbeId,
	type ProbeOutcome,
	passwordFeedback,
	previewPlan,
	type Question,
	reviewLines,
	routeExecutesHere,
	type Screen,
	type ScreenId,
	type ScreenModelInput,
	sameAsCommand,
	unfixableFailure,
	visibleKeys,
} from './screen_model.ts';
import { DONE_TEXT, NOTICE_TEXT } from './screen_text.ts';
import { abortNeedsDatabasePassword } from './steps.ts';

export interface InteractiveDeps {
	prompter: InstallPrompter;
	probes: InstallProbes;
	priorEnv: Readonly<Record<string, string>>;
	/** The thesaurus offer (hierarchyChoiceView('lg-eng'), read once by the caller). */
	thesauri: InstallCatalogs['thesauri'];
	host: { timezone?: string; locale?: string };
	/** Secrets the environment / --secrets-stdin supplied: kept, never re-asked (root: policy-checked). */
	givenSecrets: Secrets;
	/** --write-answers: where the reviewed answers are also written. */
	writeAnswersPath?: string;
	/** The unfinished install on start; undefined = read the run files. */
	unfinished?: Unfinished | null;
	/** The answers-file writer (front_end.ts writeAnswersFile); a gate injects one. */
	writeAnswers?: (path: string, answers: InstallAnswers) => string | null;
	/** The release the Welcome names. */
	version?: string;
	/**
	 * A host route's Review commands for a plan (the host facts measured by the
	 * caller — scripts/install.ts; host/host_table.ts hostReview). Absent: none.
	 */
	hostCommands?: (plan: InstallPlan) => Promise<NonNullable<ReviewView['hostCommands']>>;
	/** Why THIS process cannot run the plan's route (production without root), or null. */
	routeRefusal?: (plan: InstallPlan) => string | null;
	/**
	 * What the run's own preflight would refuse for this plan, measured NOW and
	 * recorded nowhere (host_executor.ts hostPlanRefusals — the same function the
	 * run asks before it writes anything). The Review shows each as an error and
	 * does not offer install; a typed `yes` asks it again (campaign 3c D2: an
	 * untrusted chain, Apache beside nginx, an image version, a held port were
	 * refused only after `yes`, every answer lost). Absent: none.
	 */
	preflightRefusals?: (plan: InstallPlan) => Promise<string[]>;
}

/**
 * The deps the CLI (scripts/install.ts) hands the session: its Review hooks
 * REQUIRED, so dropping one there is a tsc error (campaign 3c D2: the
 * preflight asked before `yes` was wired by one optional property nothing
 * checked). Gates pass the hooks they exercise; the CLI passes them all.
 */
export type CliInteractiveDeps = InteractiveDeps &
	Required<Pick<InteractiveDeps, 'hostCommands' | 'routeRefusal' | 'preflightRefusals'>>;

/** An install record left in progress (offered for resume / abort / quit on start). */
export interface Unfinished {
	database: string;
	outcome: string;
	/** Abort is offered (the saved plan is readable); default true. */
	canAbort?: boolean;
	/** Abort must ask the database password (steps.ts abortNeedsDatabasePassword); default false. */
	needsDbPassword?: boolean;
}

/** Re-asking an answer the model keeps refusing ends the session (a script cannot loop forever). */
const MAX_ATTEMPTS = 12;

/** The probe each screen runs. */
const SCREEN_PROBE: Partial<Record<ScreenId, ProbeId>> = {
	system: 'system',
	identity: 'identity',
	database: 'db',
	services: 'media',
	publication: 'diffusion',
	mail: 'mailer',
};

/** The screen that runs each probe (SCREEN_PROBE inverted). */
const PROBE_SCREEN: Readonly<Partial<Record<ProbeId, ScreenId>>> = Object.freeze(
	Object.fromEntries(Object.entries(SCREEN_PROBE).map(([screen, probe]) => [probe, screen])),
);

/**
 * WHAT EACH PROBE TESTED: the normalized answer keys it reads (derived by
 * prefix from the answer catalog — a new db_/mysql_/smtp_ key is covered
 * without an edit here) and the one secret it is handed. A verdict is kept
 * with the hash of these inputs and stands ONLY while they are unchanged: an
 * answer on ANOTHER screen (the instance re-deriving db_database and
 * media_path, the route changing what the System check checks) makes it stale.
 */
const PROBE_INPUTS: Readonly<Record<ProbeId, { keys: readonly string[]; secret?: SecretKey }>> =
	Object.freeze({
		system: { keys: ['route', 'instance'] },
		identity: {
			keys: [
				'route',
				'instance',
				'install_dir',
				'service_user',
				'service_group',
				'backup_dir',
				'media_path',
				'unix_socket',
				'web_server',
			],
		},
		db: { keys: prefixed('db_'), secret: 'db_password' },
		media: { keys: ['media_path'] },
		diffusion: { keys: prefixed('mysql_'), secret: 'mysql_password' },
		mailer: { keys: prefixed('smtp_'), secret: 'smtp_pass' },
	});

/** The plain answer keys starting with `prefix` (the secret itself excluded — it is `secret`). */
function prefixed(prefix: string): string[] {
	return INSTALL_ANSWER_KEYS.filter(
		(key) => key.startsWith(prefix) && !/_(password|pass)$/.test(key),
	);
}

/** The secret keys asked on each screen (an `edit` after a failed probe re-asks a kept one). */
const SCREEN_SECRETS: Partial<Record<ScreenId, readonly SecretKey[]>> = {
	database: ['db_password'],
	publication: ['mysql_password'],
	mail: ['smtp_pass'],
	administrator: ['root_password'],
};

/**
 * The secrets an abort would run with (scripts/install.ts resumeSecrets): once
 * persist_config is done, the ones the install's own .env holds; before, the
 * given ones.
 */
function abortSecrets(state: InstallState, given: Secrets): Secrets {
	if (state.steps.persist_config?.status !== 'done') return given;
	const env = readInstallEnv();
	return env === null ? given : secretsFromEnv(env);
}

/** The unfinished install recorded in the run dir, or null. */
function readUnfinished(given: Secrets): Unfinished | null {
	try {
		const state = readStateFile();
		if (state === null || state.outcome !== 'in_progress') return null;
		const plan = readPlanFile();
		return {
			database: String(plan?.answers.db_database ?? ''),
			outcome: state.outcome,
			canAbort: plan !== null,
			needsDbPassword:
				plan !== null && abortNeedsDatabasePassword(plan, state, abortSecrets(state, given)),
		};
	} catch {
		return null;
	}
}

/** One interactive session's state (never module state). */
interface Session {
	readonly deps: InteractiveDeps;
	raw: Record<string, unknown>;
	secrets: Secrets;
	/** Supplied by the environment and not to be asked (until an edit asks again). */
	kept: Set<SecretKey>;
	acknowledged: Set<string>;
	probes: Partial<Record<ProbeId, ProbeOutcome>>;
	/** The inputs each recorded verdict was taken over (PROBE_INPUTS) — a hash, never a secret. */
	probeKeys: Partial<Record<ProbeId, string[]>>;
	/** The inputs whose change dropped each verdict (named by the re-check — N27). */
	changedSince: Partial<Record<ProbeId, string[]>>;
	catalog: InstallCatalogs['ontology'];
	/** The (update_servers, ontology_source) the catalog was read for. */
	catalogKey: string | null;
	asked: Set<string>;
	/** The screens shown this session (a placeholder screen is shown once). */
	seen: Set<ScreenId>;
	/** An answer was refused too often (the session ends as `refused`). */
	refused: boolean;
	/** The answers --write-answers last wrote (JSON), or null — never yet. */
	answersWritten: string | null;
}

function inputOf(session: Session): ScreenModelInput {
	const secretsGiven: Partial<Record<SecretKey, boolean>> = {};
	for (const [key, value] of Object.entries(session.secrets)) {
		secretsGiven[key as SecretKey] = value !== undefined && value !== '';
	}
	return {
		raw: session.raw,
		secretsGiven,
		priorEnv: session.deps.priorEnv,
		catalogs: { ontology: session.catalog, thesauri: session.deps.thesauri },
		host: session.deps.host,
		probes: session.probes,
		acknowledged: session.acknowledged,
	};
}

const screensOf = (session: Session): Screen[] => buildScreens(inputOf(session));

function screenOf(session: Session, id: ScreenId): Screen | undefined {
	return screensOf(session).find((item) => item.id === id);
}

function questionOf(
	session: Session,
	screenId: ScreenId,
	questionId: string,
): Question | undefined {
	return screenOf(session, screenId)?.questions.find((item) => item.id === questionId);
}

/** What the walker is doing now, for the prompter (ScreenView). */
function viewOf(session: Session, id: ScreenId, focus: string | null, probing = false): ScreenView {
	const screens = screensOf(session);
	const screen = screens.find((item) => item.id === id) ?? (screens[0] as Screen);
	return {
		screen,
		screens: screens.map((item) => ({
			id: item.id,
			title: item.title,
			index: item.index,
			placeholder: item.placeholder !== undefined,
		})),
		seen: [...session.seen],
		failed: failedScreens(session),
		focus,
		probing,
		route: typeof session.raw.route === 'string' ? routeOf(session) : null,
	};
}

/** The screens whose gating check failed and stands unacknowledged (the rail's ✗ — N34). */
function failedScreens(session: Session): ScreenId[] {
	return (Object.entries(session.probes) as [ProbeId, ProbeOutcome | undefined][])
		.filter(([, outcome]) => outcome !== undefined && !outcome.ok)
		.map(([probe]) => PROBE_SCREEN[probe])
		.filter(
			(screen): screen is ScreenId =>
				screen !== undefined && !session.acknowledged.has(`${screen}.probe_override`),
		);
}

/** The route chosen so far (the model's own reading of the answers). */
function routeOf(session: Session): InstallRoute {
	return previewPlan(inputOf(session)).answers.route;
}

/** Forget a screen's probe verdict (its answers changed). */
function invalidateProbe(session: Session, screenId: ScreenId): void {
	const probe = SCREEN_PROBE[screenId];
	if (probe !== undefined) {
		delete session.probes[probe];
		delete session.probeKeys[probe];
	}
	session.acknowledged.delete(`${screenId}.probe_override`);
}

/**
 * What `probe` would test NOW, input by input (PROBE_INPUTS over the normalized
 * answers): one hash per answer key, then the secret's — a hash, never a value.
 */
function probeInputKey(session: Session, probe: ProbeId): string[] {
	const answers = normalizeInstallAnswers(session.raw).answers as unknown as Record<
		string,
		unknown
	>;
	const inputs = PROBE_INPUTS[probe];
	const secret = inputs.secret === undefined ? '' : (session.secrets[inputs.secret] ?? '');
	const hashOf = (value: unknown): string => String(Bun.hash(JSON.stringify(value)));
	return [...inputs.keys.map((key) => hashOf(answers[key] ?? null)), hashOf(secret)];
}

/** The inputs of `probe` that changed between two input keys (an answer key, or `password`). */
function changedInputs(
	probe: ProbeId,
	before: readonly string[],
	now: readonly string[],
): string[] {
	const names = [...PROBE_INPUTS[probe].keys, 'password'];
	return names.filter((_name, index) => before[index] !== now[index]);
}

/**
 * Drop every verdict (and its acknowledged override) whose inputs changed
 * since it was taken — wherever the change was answered — remembering WHICH
 * inputs changed (the re-check says so — campaign 3b N27).
 */
function dropStaleVerdicts(session: Session): void {
	for (const probe of Object.keys(session.probeKeys) as ProbeId[]) {
		const now = probeInputKey(session, probe);
		const changed = changedInputs(probe, session.probeKeys[probe] ?? [], now);
		if (changed.length === 0) continue;
		const screen = PROBE_SCREEN[probe];
		if (screen !== undefined) invalidateProbe(session, screen);
		session.changedSince[probe] = changed;
	}
}

// ── the ontology catalog ─────────────────────────────────────────────────────

function catalogKeyOf(raw: Readonly<Record<string, unknown>>): string {
	return JSON.stringify([raw.update_servers ?? null, raw.ontology_source ?? null]);
}

/** Read the catalog of the CURRENT source once per (update_servers, ontology_source). */
async function refreshCatalog(session: Session): Promise<void> {
	const key = catalogKeyOf(session.raw);
	if (session.catalogKey === key) return;
	session.deps.prompter.say(['reading the ontology catalog…']);
	const result: CatalogProbeResult = await session.deps.probes.ontologyCatalog(
		session.raw,
		session.deps.priorEnv,
	);
	session.catalog = { catalog: result.catalog, ok: result.ok, detail: result.detail };
	session.catalogKey = key;
}

// ── asking one question ──────────────────────────────────────────────────────

/** A kept (environment-supplied) secret: announced, not asked — unless the root password fails the policy. */
function keptSecret(session: Session, key: SecretKey, question: Question): boolean {
	if (!session.kept.has(key)) return false;
	if (key === 'root_password' && passwordFeedback(session.secrets[key] ?? '').errors.length > 0) {
		session.kept.delete(key);
		session.deps.prompter.say([
			`${question.label}: the supplied one does not meet the policy — type another`,
		]);
		return false;
	}
	session.deps.prompter.say([`${question.label}: ${NOTICE_TEXT.envSecret}`]);
	return true;
}

/** Ask a secret; the value stays in the session. */
async function askSecret(session: Session, question: Question): Promise<'ok' | Nav> {
	const key = question.key as SecretKey;
	if (keptSecret(session, key, question)) return 'ok';
	const answer = await session.deps.prompter.secret(
		question,
		key === 'root_password' ? passwordFeedback : undefined,
	);
	if (isNav(answer)) return answer;
	if (answer === '') delete session.secrets[key];
	else session.secrets[key] = answer;
	return 'ok';
}

/** The prompter's method for each plain question kind (text is the fallback). */
const PROMPT_BY_KIND: Readonly<
	Partial<
		Record<Question['kind'], (prompter: InstallPrompter, question: Question) => Promise<unknown>>
	>
> = Object.freeze({
	choice: (prompter: InstallPrompter, question: Question) => prompter.choice(question),
	multi: (prompter: InstallPrompter, question: Question) => prompter.multi(question),
	confirm: (prompter: InstallPrompter, question: Question) => prompter.confirm(question),
});

/** The prompter's answer for a plain question, by kind. */
function promptFor(prompter: InstallPrompter, question: Question): Promise<unknown> {
	const ask = PROMPT_BY_KIND[question.kind];
	return ask === undefined ? prompter.text(question) : ask(prompter, question);
}

/** A typed-yes acknowledgement: recorded when typed; declined → re-run the screen. */
async function askAcknowledge(session: Session, question: Question): Promise<'ok' | 'again' | Nav> {
	const typed = await session.deps.prompter.acknowledge(question);
	if (isNav(typed)) return typed;
	if (!typed) return 'again';
	session.acknowledged.add(question.id);
	return 'ok';
}

/**
 * One plain answer applied: the question as the model now sees it when it
 * still carries errors (to re-ask), else null. Prints the errors of a question
 * whose answer equals its default (no key — the prompter's intro shows an
 * answered question's own).
 */
function applyPlain(
	session: Session,
	screenId: ScreenId,
	question: Question,
	answer: unknown,
): Question | null {
	session.raw = applyAnswer(session.raw, question, answer);
	const next = questionOf(session, screenId, question.id);
	if (next === undefined || next.errors.length === 0) return null;
	if (!next.answered) session.deps.prompter.say(next.errors.map((error) => `  error: ${error}`));
	return next;
}

/** Ask a plain (text/choice/multi/confirm) question until the model reports no error on it. */
async function askPlain(
	session: Session,
	screenId: ScreenId,
	first: Question,
): Promise<'ok' | Nav> {
	let question: Question | null = first;
	for (let attempt = 0; attempt < MAX_ATTEMPTS && question !== null; attempt++) {
		const answer = await promptFor(session.deps.prompter, question);
		if (isNav(answer)) return answer;
		question = applyPlain(session, screenId, question, answer);
	}
	if (question === null) return 'ok';
	session.deps.prompter.say(['the answer was refused too many times — leaving']);
	session.refused = true;
	return QUIT;
}

/**
 * Ask ONE question. Answers 'ok', 'again' (a declined acknowledgement: re-run
 * the screen) or a Nav.
 */
function askQuestion(
	session: Session,
	screenId: ScreenId,
	question: Question,
): Promise<'ok' | 'again' | Nav> {
	if (question.kind === 'secret') return askSecret(session, question);
	if (question.kind === 'acknowledge') return askAcknowledge(session, question);
	return askPlain(session, screenId, question);
}

// ── the probes ───────────────────────────────────────────────────────────────

/** A question the walker asks itself (never an answer key, never in the plan). */
function ownQuestion(
	id: string,
	kind: 'text' | 'secret',
	text: { label: string; description: string },
	emptyAllowed: boolean,
): Question {
	return {
		id,
		key: kind === 'secret' ? 'db_password' : null,
		sets: [],
		kind,
		label: text.label,
		description: text.description,
		value: null,
		default: '',
		answered: false,
		required: !emptyAllowed,
		emptyAllowed,
		errors: [],
	};
}

/**
 * The mail probe's test recipient (asked at probe time; never an answer, never
 * persisted). A navigation answer (quit, an interrupt, back) is RETURNED — the
 * probe does not run and the walk honours it — never read as "no recipient".
 */
async function testRecipient(prompter: InstallPrompter): Promise<string | undefined | Nav> {
	const recipient = await prompter.text(
		ownQuestion(
			'mail.test_recipient',
			'text',
			{
				label: 'Send a test mail to',
				description: 'an address; empty = check the connection only',
			},
			true,
		),
	);
	if (isNav(recipient)) return recipient;
	return recipient === '' ? undefined : recipient;
}

/** The mail probe: its recipient first; a navigation answer ends it unrun. */
async function mailerProbe(session: Session): Promise<ProbeOutcome | Nav> {
	const recipient = await testRecipient(session.deps.prompter);
	if (isNav(recipient)) return recipient;
	return session.deps.probes.mailer(session.raw, session.secrets.smtp_pass ?? '', recipient);
}

/** Each probe, with the one secret it needs. */
const PROBE_RUNS: Readonly<Record<ProbeId, (session: Session) => Promise<ProbeOutcome | Nav>>> =
	Object.freeze({
		system: (session: Session) =>
			session.deps.probes.system(routeOf(session), previewPlan(inputOf(session)).answers.instance),
		identity: (session: Session) => session.deps.probes.identity(session.raw),
		db: (session: Session) =>
			session.deps.probes.database(session.raw, session.secrets.db_password ?? ''),
		media: (session: Session) => session.deps.probes.media(session.raw),
		diffusion: (session: Session) =>
			session.deps.probes.diffusion(session.raw, session.secrets.mysql_password ?? ''),
		mailer: mailerProbe,
	});

/** A notice as one plain line. */
function noticeLine(notice: { level: string; text: string }): string {
	return `${notice.level === 'info' ? '' : `${notice.level}: `}${notice.text}`;
}

/** The probe's verdict lines (the System check: its rows, from the rebuilt screen). */
function probeLines(session: Session, screen: Screen, outcome: ProbeOutcome): string[] {
	if (screen.id === 'system') return (screenOf(session, 'system')?.notices ?? []).map(noticeLine);
	return [
		outcome.ok ? NOTICE_TEXT.probeOk(outcome.detail) : NOTICE_TEXT.probeFailed(outcome.detail),
	];
}

/** The probe's outcome: the recorded one, else a fresh run (recorded; a Nav is not a verdict). */
async function probeOutcome(
	session: Session,
	screen: Screen,
	probe: ProbeId,
): Promise<ProbeOutcome | Nav> {
	const recorded = session.probes[probe];
	if (recorded !== undefined) return recorded;
	session.deps.prompter.view(viewOf(session, screen.id, null, true));
	session.deps.prompter.say([`checking: ${screen.title}…`]);
	const key = probeInputKey(session, probe);
	const outcome = await PROBE_RUNS[probe](session);
	if (isNav(outcome)) return outcome;
	session.probes[probe] = outcome;
	session.probeKeys[probe] = key;
	delete session.changedSince[probe];
	return outcome;
}

type ProbeGate = NonNullable<Screen['probe']>;

/**
 * What the operator may do after a failed probe. A failure no fix on this
 * machine can change (an unsupported operating system — C3-61) offers only
 * quit, or back to another route: "retry" would only fail again.
 */
function probePrompt(gate: ProbeGate['gate'], outcome: ProbeOutcome): string {
	if (unfixableFailure(outcome)) return 'quit, or back to choose another route';
	return gate === 'pass_or_acknowledge'
		? 'retry, edit, or yes to keep these settings untested'
		: 'retry, edit, or quit (this check must pass)';
}

/** The commands a failed probe offers (quit always works). */
function probeCommands(gate: ProbeGate['gate'], outcome: ProbeOutcome): ProbeCommand[] {
	if (unfixableFailure(outcome)) return ['quit'];
	return gate === 'pass_or_acknowledge'
		? ['retry', 'edit', 'yes', 'quit']
		: ['retry', 'edit', 'quit'];
}

/** A failed probe, as the prompter shows it. */
function probeView(
	session: Session,
	screen: Screen,
	probe: ProbeGate,
	outcome: ProbeOutcome,
	lines: string[],
): ProbeView {
	return {
		screen: screenOf(session, screen.id) ?? screen,
		lines,
		gate: probe.gate,
		commands: probeCommands(probe.gate, outcome),
		prompt: probePrompt(probe.gate, outcome),
	};
}

/** `edit` after a failed probe: forget the verdict, ask the screen's kept secrets again. */
function editAfterProbe(session: Session, screen: Screen): 'again' {
	invalidateProbe(session, screen.id);
	for (const key of SCREEN_SECRETS[screen.id] ?? []) session.kept.delete(key);
	return 'again';
}

/**
 * One command after a failed probe → what happens: null = ask again (retry
 * re-runs the probe; a word the view does not offer is explained — `retry` is
 * refused where only quit is offered).
 */
function probeCommand(
	session: Session,
	screen: Screen,
	view: ProbeView,
	word: string,
): 'next' | 'again' | Nav | null {
	const probe = SCREEN_PROBE[screen.id] as ProbeId;
	if (!(view.commands as readonly string[]).includes(word)) {
		session.deps.prompter.say([NOTICE_TEXT.notOffered(word, view.prompt)]);
		return null;
	}
	if (word === 'retry') {
		delete session.probes[probe];
		delete session.probeKeys[probe];
		return null;
	}
	if (word === 'edit') return editAfterProbe(session, screen);
	if (word === 'quit') return QUIT;
	session.acknowledged.add(`${screen.id}.probe_override`);
	return 'next';
}

/** Does the probe's verdict let the walk go on (passed, report-only, or overridden)? */
function probePassed(
	session: Session,
	screen: Screen,
	probe: ProbeGate,
	outcome: ProbeOutcome,
): boolean {
	return (
		outcome.ok || probe.gate === 'report' || session.acknowledged.has(`${screen.id}.probe_override`)
	);
}

/** Run the screen's probe and apply its gate. */
async function probeStep(session: Session, screen: Screen): Promise<'next' | 'again' | Nav> {
	const probe = screen.probe;
	if (probe === undefined) return 'next';
	for (let round = 0; round < MAX_ATTEMPTS; round++) {
		const decided = await probeRound(session, screen, probe);
		if (decided !== null) return decided;
	}
	return QUIT;
}

/** One round of a screen's probe: its verdict, and on a failure the operator's command (null = again). */
async function probeRound(
	session: Session,
	screen: Screen,
	probe: ProbeGate,
): Promise<'next' | 'again' | Nav | null> {
	const outcome = await probeOutcome(session, screen, probe.id);
	if (isNav(outcome)) return outcome;
	const lines = probeLines(session, screen, outcome);
	if (probePassed(session, screen, probe, outcome)) {
		session.deps.prompter.say(lines);
		return 'next';
	}
	// The screen as it now stands — its check failed (the rail marks it so — N34).
	session.deps.prompter.view(viewOf(session, screen.id, null));
	const view = probeView(session, screen, probe, outcome, lines);
	const command = await session.deps.prompter.probe(view);
	if (isNav(command)) return command;
	return probeCommand(session, screen, view, command.trim().toLowerCase());
}

// ── a screen ─────────────────────────────────────────────────────────────────

/** The answers + secret values a screen's questions can change (to know when to re-probe). */
function fingerprint(session: Session): string {
	return JSON.stringify([session.raw, session.secrets]);
}

/** Does the screen's probe verdict still stand (none, passed, or overridden)? */
function verdictStands(session: Session, screen: Screen): boolean {
	const probe = screen.probe;
	if (probe === undefined) return true;
	return (
		session.probes[probe.id]?.ok === true || session.acknowledged.has(`${screen.id}.probe_override`)
	);
}

/** The screen's questions not asked in this pass (a probe override is the probe step's). */
function pendingOf(screen: Screen | undefined, done: ReadonlySet<string>): Question[] {
	return (screen?.questions ?? []).filter(
		(item) => !done.has(item.id) && !item.id.endsWith('.probe_override'),
	);
}

/** A `new`-mode screen with nothing new to ask, a standing verdict, shown before: skipped. */
function nothingNew(session: Session, screen: Screen, done: ReadonlySet<string>): boolean {
	return (
		pendingOf(screen, done).length === 0 &&
		verdictStands(session, screen) &&
		session.seen.has(screen.id)
	);
}

/** Is the screen skipped in this walk (`new` mode with nothing new — see nothingNew)? */
function skipped(
	session: Session,
	screen: Screen,
	mode: 'all' | 'new',
	done: ReadonlySet<string>,
): boolean {
	return mode === 'new' && nothingNew(session, screen, done);
}

/** The next question to ask on the screen (the catalog read first for the ontologies). */
async function nextQuestion(
	session: Session,
	id: ScreenId,
	done: ReadonlySet<string>,
): Promise<Question | undefined> {
	const question = pendingOf(screenOf(session, id), done)[0];
	if (question?.id !== 'ontologies.ontologies') return question;
	await refreshCatalog(session);
	return questionOf(session, id, question.id) ?? question;
}

/** Was the question put to the operator (a kept environment secret is announced, not asked)? */
function prompted(session: Session, question: Question): boolean {
	return !(question.kind === 'secret' && session.kept.has(question.key as SecretKey));
}

/** A question answered in this pass: done, asked, and (when it was prompted) in the pass order. */
function recordAsked(
	session: Session,
	done: Set<string>,
	pass: string[],
	question: Question,
): void {
	done.add(question.id);
	session.asked.add(question.id);
	if (prompted(session, question)) pass.push(question.id);
}

/**
 * FIELD_BACK: the previous question of this pass is asked again (it leaves
 * `done` and `asked`, so it is pending again — and, coming first in the screen
 * order, asked before the current one, which was never recorded). On the
 * pass's first question it is BACK (the previous screen).
 */
function fieldBack(session: Session, done: Set<string>, pass: string[]): Nav | null {
	const previous = pass.pop();
	if (previous === undefined) return BACK;
	done.delete(previous);
	session.asked.delete(previous);
	return null;
}

/** What one answer leaves the screen: null = go on asking; else what ends the pass. */
function settleAnswer(
	session: Session,
	id: ScreenId,
	answered: { done: Set<string>; pass: string[]; question: Question; before: string },
	outcome: 'ok' | 'again' | Nav,
): 'ok' | 'again' | Nav | null {
	if (outcome === FIELD_BACK) return fieldBack(session, answered.done, answered.pass);
	// A navigation (back, quit) answered nothing: the question stays pending, so
	// coming back to the screen asks it (campaign 3b N37 — `back` from Image
	// source recorded it asked, and the step came back without its question).
	if (isNav(outcome)) return outcome;
	recordAsked(session, answered.done, answered.pass, answered.question);
	if (fingerprint(session) !== answered.before) invalidateProbe(session, id);
	dropStaleVerdicts(session);
	return outcome === 'ok' ? null : outcome;
}

/** Ask every pending question of the screen; answers 'ok' or what interrupted it. */
async function askScreen(
	session: Session,
	id: ScreenId,
	done: Set<string>,
): Promise<'ok' | 'again' | Nav> {
	const pass: string[] = [];
	for (
		let question = await nextQuestion(session, id, done);
		question !== undefined;
		question = await nextQuestion(session, id, done)
	) {
		session.deps.prompter.view(viewOf(session, id, question.id));
		const before = fingerprint(session);
		const outcome = await askQuestion(session, id, question);
		const ended = settleAnswer(session, id, { done, pass, question, before }, outcome);
		if (ended !== null) return ended;
	}
	return 'ok';
}

/** Does the screen's check stand FAILED (recorded not ok, not acknowledged)? */
function failedVerdict(session: Session, id: ScreenId): boolean {
	const probe = SCREEN_PROBE[id];
	return (
		probe !== undefined &&
		session.probes[probe]?.ok === false &&
		!session.acknowledged.has(`${id}.probe_override`)
	);
}

/** The screen to run and what counts as asked in this pass, or null (absent, or skipped). */
function enterScreen(
	session: Session,
	id: ScreenId,
	mode: 'all' | 'new',
): { first: Screen; done: Set<string> } | null {
	// Visited again in full (back, edit): its check runs again, never a cached verdict
	// shown twice (campaign 3b N37 — the Docker daemon stopped meanwhile read "answers").
	// A FAILED verdict runs again on any visit: `back` from it and forward again
	// printed the old rows twice and no `checking:` line (campaign 3c D18).
	if (mode === 'all' || failedVerdict(session, id)) invalidateProbe(session, id);
	const first = screenOf(session, id);
	if (first === undefined) return null;
	const done = new Set(mode === 'new' ? session.asked : []);
	return skipped(session, first, mode, done) ? null : { first, done };
}

/**
 * A screen is entered: seen, and shown CURRENT before anything is asked or
 * checked (campaign 3b N34: a screen without questions kept the previous
 * screen current on the rail while its check ran).
 */
function showScreen(session: Session, screen: Screen): void {
	session.seen.add(screen.id);
	session.deps.prompter.view(viewOf(session, screen.id, null));
	session.deps.prompter.screen(screen);
}

/**
 * Run ONE screen: `all` asks every visible question (a first visit, back,
 * edit); `new` only the ones not yet asked this session — and skips the screen
 * entirely when it has none, its probe verdict still stands and it was shown
 * before (a placeholder screen is shown once).
 */
async function runScreen(
	session: Session,
	id: ScreenId,
	mode: 'all' | 'new',
): Promise<'next' | 'again' | Nav> {
	const entered = enterScreen(session, id, mode);
	if (entered === null) return 'next';
	const { first, done } = entered;
	showScreen(session, first);
	const asked = await askScreen(session, id, done);
	if (asked !== 'ok') return asked;
	const screen = screenOf(session, id);
	return screen === undefined ? 'next' : probeStep(session, screen);
}

/** Where the walk goes after a screen: [next index, next mode]. */
function stepAfter(outcome: 'next' | 'again' | Nav, index: number): [number, 'all' | 'new'] {
	if (outcome === BACK || outcome === FIELD_BACK) return [Math.max(0, index - 1), 'all'];
	return outcome === 'again' ? [index, 'all'] : [index + 1, 'new'];
}

/**
 * Walk the route's screens from `start` to the Review: the screen at `start`
 * fully (`firstMode`), every later one for its new questions only.
 */
async function walk(
	session: Session,
	start: number,
	firstMode: 'all' | 'new',
): Promise<'review' | 'quit'> {
	let [index, mode] = [start, firstMode];
	for (let steps = 0; steps < 500; steps++) {
		const screen = screensOf(session)[index];
		if (screen === undefined || screen.id === 'review') return 'review';
		const outcome = await runScreen(session, screen.id, mode);
		if (outcome === QUIT) return 'quit';
		[index, mode] = outcome === 'next' ? staleBehind(session, index) : stepAfter(outcome, index);
	}
	return 'quit';
}

/**
 * After screen `index` passed: an EARLIER gate whose verdict this screen's
 * answers made stale is checked again NOW — the walk goes back to it (nothing
 * is asked again; the screens between are skipped as unchanged) and then on
 * past `index`. Campaign 3c D4: the Identity check, stale once the Web server
 * was answered at step 5, was re-run only before the Review, after step 12.
 */
function staleBehind(session: Session, index: number): [number, 'all' | 'new'] {
	const stale = firstUnprovenGate(session);
	if (stale === undefined || !session.seen.has(stale.id)) return [index + 1, 'new'];
	const at = screensOf(session).findIndex((screen) => screen.id === stale.id);
	if (at < 0 || at > index) return [index + 1, 'new'];
	session.deps.prompter.say([recheckLine(session, stale)]);
	return [at, 'new'];
}

// ── the review ───────────────────────────────────────────────────────────────

/** How a stack gets its image, by source (C3-48 — never "pulls" for a local build). */
const IMAGE_SENTENCE: Readonly<Record<string, string>> = Object.freeze({
	official: 'pulls the official image and verifies its signature',
	custom: 'pulls the image from your registry',
	build: `builds the image here from this checkout's last commit (${BUILD_DURATION})`,
});

/** What `install` will do, in one sentence per route (a stack: per image source). */
function installSentence(answers: InstallAnswers): string {
	if (answers.route === 'production') {
		return `This changes this host: the packages, the instance ${answers.instance} (its user, database '${answers.db_database}', units, site and certificate) — every command is listed above.`;
	}
	if (answers.route === 'docker' || answers.route === 'trial') {
		const image = IMAGE_SENTENCE[answers.image_source] ?? IMAGE_SENTENCE.official;
		return `This ${image}, writes the stack's files and installs into the stack's database '${answers.db_database}'.`;
	}
	return `This writes the .env and installs into database '${answers.db_database}'.`;
}

function installQuestion(answers: InstallAnswers): Question {
	return {
		id: 'review.install',
		key: null,
		sets: [],
		kind: 'acknowledge',
		label: 'Install now',
		description: `${installSentence(answers)} Type yes to start.`,
		value: false,
		default: false,
		answered: false,
		required: true,
		errors: [],
	};
}

/**
 * The secrets as handed back: only the given ones whose question is still
 * VISIBLE — a password typed for a service turned off afterwards (an edit from
 * the Review) is dropped, as the model drops that service's answers: handed
 * back, the plan file would record it as supplied, and a resume would demand
 * it for a service the install does not configure.
 */
function givenOnly(secrets: Secrets, raw: Readonly<Record<string, unknown>>): Secrets {
	const visible = visibleKeys(raw);
	return Object.fromEntries(
		Object.entries(secrets).filter(
			([key, value]) => value !== undefined && value !== '' && visible.has(key),
		),
	) as Secrets;
}

/** What one Review round shows and decides on. */
interface ReviewRound {
	readonly screens: Screen[];
	readonly plan: InstallPlan;
	readonly canInstall: boolean;
}

/** The route's screens whose probe GATES the walk (must_pass / pass_or_acknowledge). */
function gatedScreens(session: Session): Screen[] {
	return screensOf(session).filter(
		(screen) => screen.probe !== undefined && screen.probe.gate !== 'report',
	);
}

/** The first gated screen whose verdict does not stand (stale, missing, failed), or undefined. */
function firstUnprovenGate(session: Session): Screen | undefined {
	dropStaleVerdicts(session);
	return gatedScreens(session).find((screen) => !verdictStands(session, screen));
}

/** Why THIS process cannot run the plan's route (production needs root), or null. */
function routeRefusalOf(session: Session, plan: InstallPlan): string | null {
	return session.deps.routeRefusal?.(plan) ?? null;
}

/**
 * What the run's preflight would refuse for `plan` now (campaign 3c D2) —
 * asked only over a plan the run could start (no plan error, a route this
 * process runs): the plan's own errors already block it, and the production
 * measure as a normal user is the route refusal's to tell.
 */
async function preflightOf(session: Session, plan: InstallPlan): Promise<string[]> {
	const probe = session.deps.preflightRefusals;
	if (probe === undefined || plan.errors.length > 0) return [];
	if (routeRefusalOf(session, plan) !== null) return [];
	return probe(plan);
}

/**
 * May the Review offer `install`: no plan error, a route that runs here, a
 * root password, nothing the run's preflight would refuse — and every gate's
 * verdict CURRENT (taken over the answers the install will use, or
 * acknowledged over them).
 */
function installOffered(session: Session, plan: InstallPlan, refused: readonly string[]): boolean {
	return (
		plan.errors.length === 0 &&
		refused.length === 0 &&
		routeExecutesHere(plan.answers.route) &&
		(session.secrets.root_password ?? '') !== '' &&
		firstUnprovenGate(session) === undefined
	);
}

/** An answer key as the screens name it (its question's label), else the key itself. */
function inputLabel(session: Session, key: string): string {
	if (key === 'password') return 'the password';
	const question = screensOf(session)
		.flatMap((screen) => screen.questions)
		.find((item) => item.key === key);
	return question?.label ?? key;
}

/**
 * Why a gate is checked again, naming the answers that changed (campaign 3b
 * N27: "the answers changed what 'Identity' checked" read as if the root
 * password did — it was the Web server, answered on a later screen).
 */
function recheckLine(session: Session, screen: Screen): string {
	const probe = SCREEN_PROBE[screen.id];
	const changed = probe === undefined ? [] : (session.changedSince[probe] ?? []);
	if (changed.length === 0) return `checking '${screen.title}' before the Review`;
	const names = changed.map((key) => inputLabel(session, key)).join(', ');
	return `the answers changed what '${screen.title}' checked (${names}): checking again`;
}

/**
 * Before the Review: a gate whose verdict an edit made stale (or that never
 * ran) is checked again — the walk from its screen re-runs the probe (nothing
 * new is asked) and every later stale one. Answers 'quit' when the operator
 * quit there.
 */
async function recheckGates(session: Session): Promise<'review' | 'quit'> {
	for (let round = 0; round < 50; round++) {
		const stale = firstUnprovenGate(session);
		if (stale === undefined) return 'review';
		const index = screensOf(session).findIndex((screen) => screen.id === stale.id);
		session.deps.prompter.say([recheckLine(session, stale)]);
		if ((await walk(session, index, 'new')) === 'quit') return 'quit';
	}
	return 'quit';
}

/** One Review round: what it decides on, and the view the prompter shows. */
async function reviewRound(session: Session): Promise<{ round: ReviewRound; view: ReviewView }> {
	const screens = screensOf(session);
	const input = inputOf(session);
	const plan = previewPlan(input);
	const refusal = routeRefusalOf(session, plan);
	const refused = await preflightOf(session, plan);
	const canInstall = refusal === null && installOffered(session, plan, refused);
	const view: ReviewView = {
		screen: screens.at(-1) as Screen,
		lines: reviewLines(plan, input),
		canInstall,
		editable: screens.slice(0, -1).map((item) => ({ n: item.index, title: item.title })),
		command: sameAsCommand(plan.answers),
		errors: [...plan.errors, ...(refusal === null ? [] : [refusal]), ...refused],
		hostCommands: plan.errors.length === 0 ? ((await session.deps.hostCommands?.(plan)) ?? []) : [],
	};
	return { round: { screens, plan, canInstall }, view };
}

/** The install result (after the typed yes). */
function installResult(session: Session, plan: InstallPlan): FrontEndResult {
	const writeAnswers = session.deps.writeAnswersPath;
	return {
		kind: 'install',
		raw: { ...session.raw },
		secrets: givenOnly(session.secrets, session.raw),
		reviewed: reviewDecisions(plan),
		...(writeAnswers === undefined ? {} : { writeAnswers }),
	};
}

/** A Review shown again WITHOUT measuring again: the round `install` just checked anew. */
interface Rechecked {
	readonly rechecked: { round: ReviewRound; view: ReviewView };
}

/**
 * A Review command's outcome: a result ends the session; null shows the Review
 * again (measured again); `rechecked` shows the round the command measured.
 */
type ReviewStep = FrontEndResult | Rechecked | null;

/**
 * `install` on a REFUSED Review CHECKS AGAIN (campaign 3d C3d-F2): the cause
 * fixed (the CA trusted, the port freed), the plan is measured anew and, now
 * clear, install goes on to its typed yes — never "not offered" from a stale
 * verdict, never an edit round trip to re-check. Still refused: the Review is
 * shown with what this check found.
 */
async function recheckRefused(
	session: Session,
): Promise<{ round: ReviewRound; view: ReviewView } | Rechecked> {
	session.deps.prompter.say([NOTICE_TEXT.recheckReview]);
	const again = await reviewRound(session);
	if (again.round.canInstall) return again;
	session.deps.prompter.say([NOTICE_TEXT.stillRefused]);
	return { rechecked: again };
}

async function reviewInstall(session: Session, shown: ReviewRound): Promise<ReviewStep> {
	let round = shown;
	if (!round.canInstall) {
		const again = await recheckRefused(session);
		if ('rechecked' in again) return again;
		round = again.round;
	}
	const typed = await session.deps.prompter.acknowledge(installQuestion(round.plan.answers));
	if (typed === QUIT) return { kind: 'quit' };
	if (typed !== true) return null;
	// Measured again at the typed yes: what changed since the Review was drawn
	// (a port taken meanwhile) keeps the session — and every answer — on the Review.
	const refused = await preflightOf(session, round.plan);
	if (refused.length === 0) return installResult(session, round.plan);
	session.deps.prompter.say([
		NOTICE_TEXT.refusedAtYes,
		...refused.map((line) => `  error: ${line}`),
	]);
	return null;
}

async function reviewEdit(
	session: Session,
	round: ReviewRound,
	number: string,
): Promise<ReviewStep> {
	const index = Number(number) - 1;
	if (index < 0 || index >= round.screens.length - 1) {
		session.deps.prompter.say([`no screen ${number}`]);
		return null;
	}
	return (await walk(session, index, 'all')) === 'quit' ? { kind: 'quit' } : null;
}

function reviewWrite(session: Session, round: ReviewRound, path: string): ReviewStep {
	const write = session.deps.writeAnswers ?? writeAnswersFile;
	const refusal = write(path.trim(), round.plan.answers);
	if (refusal !== null) {
		session.deps.prompter.say([refusal]);
		return null;
	}
	session.deps.prompter.say([
		DONE_TEXT.written(path.trim()),
		DONE_TEXT.writtenNext(round.plan.answers.route),
	]);
	return { kind: 'written', path: path.trim() };
}

/** The Review's commands: a pattern and what it does (the first match runs). */
const REVIEW_COMMANDS: readonly {
	pattern: RegExp;
	run: (session: Session, round: ReviewRound, argument: string) => ReviewStep | Promise<ReviewStep>;
}[] = [
	{ pattern: /^install$/, run: (session, round) => reviewInstall(session, round) },
	{ pattern: /^edit\s+(\d+)$/, run: reviewEdit },
	{ pattern: /^write\s+(.+)$/, run: reviewWrite },
	{ pattern: /^quit$/, run: () => ({ kind: 'quit' }) },
];

/** One Review command applied. */
async function reviewCommand(
	session: Session,
	round: ReviewRound,
	command: string,
): Promise<ReviewStep> {
	for (const item of REVIEW_COMMANDS) {
		const match = item.pattern.exec(command);
		if (match !== null) return item.run(session, round, match[1] ?? '');
	}
	session.deps.prompter.say([`'${command}' is not a review command`]);
	return null;
}

/**
 * --write-answers on an interactive run (campaign 3 C3-36): written at every
 * VALID Review (no plan error) whose answers differ from the last written —
 * so a session that reaches a valid Review and quits still leaves the file;
 * the closing message says so when it never was (quitNotices).
 */
function writeReviewedAnswers(session: Session, plan: InstallPlan): void {
	const path = session.deps.writeAnswersPath;
	const answers = JSON.stringify(plan.answers);
	if (path === undefined || !answersToWrite(session, plan, answers)) return;
	const refusal = (session.deps.writeAnswers ?? writeAnswersFile)(path, plan.answers);
	session.deps.prompter.say([refusal ?? DONE_TEXT.written(path)]);
	if (refusal === null) session.answersWritten = answers;
}

/** A valid plan whose answers differ from the ones last written. */
function answersToWrite(session: Session, plan: InstallPlan, answers: string): boolean {
	return plan.errors.length === 0 && session.answersWritten !== answers;
}

/** The Review loop: install / edit <n> / write <path> / quit (`back` edits the last screen). */
async function review(session: Session): Promise<FrontEndResult> {
	let carried: Rechecked['rechecked'] | null = null;
	for (let round = 0; round < 200; round++) {
		const step = await reviewOnce(session, carried);
		carried = step !== null && 'rechecked' in step ? step.rechecked : null;
		if (step !== null && carried === null) return step as FrontEndResult;
	}
	return { kind: 'quit' };
}

/**
 * One Review: the gates re-checked and the plan measured — or, `carried`, the
 * round an `install` just measured (shown as it is, never measured twice) —
 * then the operator's command applied.
 */
async function reviewOnce(
	session: Session,
	carried: Rechecked['rechecked'] | null,
): Promise<ReviewStep> {
	if (carried === null && (await recheckGates(session)) === 'quit') return { kind: 'quit' };
	const { round: shown, view } = carried ?? (await reviewRound(session));
	writeReviewedAnswers(session, shown.plan);
	session.seen.add('review');
	session.deps.prompter.view(viewOf(session, 'review', null));
	const command = await session.deps.prompter.review(view);
	if (command === QUIT) return { kind: 'quit' };
	return reviewCommand(session, shown, reviewText(command, shown));
}

/** The Review command as text (`back` edits the last screen). */
function reviewText(command: string | Nav, shown: ReviewRound): string {
	return isNav(command) ? `edit ${shown.screens.length - 1}` : command.trim();
}

// ── the start: welcome, an unfinished install, abort ─────────────────────────

/** The database name typed back before an abort resets it. */
function confirmDatabaseQuestion(database: string): Question {
	return ownQuestion(
		'resume.confirm_database',
		'text',
		{
			label: 'Database to reset',
			description: `Abort removes what the install created and resets database '${database}' to empty (the database itself is kept). Type its name to confirm.`,
		},
		false,
	);
}

/** The database password an abort's reset needs. */
const ABORT_PASSWORD_TEXT = Object.freeze({
	label: 'Database password',
	description: 'Abort resets the database and needs its password.',
});

/** The confirmed database name, or null (quit, or refused too often — `refused` marks it). */
async function confirmDatabase(
	deps: InteractiveDeps,
	database: string,
	refused: () => void,
): Promise<string | null> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const typed = await deps.prompter.text(confirmDatabaseQuestion(database));
		if (isNav(typed)) return null;
		const refusal = abortConfirmRefusal(typed, database);
		if (refusal === null) return typed.trim();
		deps.prompter.say([refusal]);
	}
	refused();
	return null;
}

/** The database password for the reset ('' = not needed), or null (quit). */
async function abortPassword(
	deps: InteractiveDeps,
	unfinished: Unfinished,
): Promise<string | null> {
	const given = deps.givenSecrets.db_password ?? '';
	if (unfinished.needsDbPassword !== true || given !== '') return given;
	const typed = await deps.prompter.secret(
		ownQuestion('resume.db_password', 'secret', ABORT_PASSWORD_TEXT, false),
	);
	return isNav(typed) ? null : typed;
}

/** ABORT chosen: the name typed back, the password when the reset needs it. */
async function abortFlow(
	deps: InteractiveDeps,
	unfinished: Unfinished,
	refused: () => void,
): Promise<FrontEndResult> {
	const confirmed = await confirmDatabase(deps, unfinished.database, refused);
	if (confirmed === null) return { kind: 'quit' };
	const password = await abortPassword(deps, unfinished);
	if (password === null) return { kind: 'quit' };
	return {
		kind: 'abort',
		confirmDatabase: confirmed,
		secrets: password === '' ? {} : { db_password: password },
	};
}

/** An unfinished install found on start: resume / abort / quit. */
async function unfinishedFlow(
	deps: InteractiveDeps,
	unfinished: Unfinished,
	refused: () => void,
): Promise<FrontEndResult> {
	const choice = await deps.prompter.resume({
		database: unfinished.database,
		outcome: unfinished.outcome,
		canAbort: unfinished.canAbort !== false,
	});
	if (choice === 'resume') return { kind: 'resume' };
	if (choice === 'abort' && unfinished.canAbort !== false)
		return abortFlow(deps, unfinished, refused);
	return { kind: 'quit' };
}

/**
 * THE INTERACTIVE INSTALL: the walk, then the Review. Answers what the caller
 * (scripts/install.ts) does next — never runs the install itself.
 */
export async function runInteractiveInstall(deps: InteractiveDeps): Promise<FrontEndResult> {
	const ended: SessionEnd = { refused: false, answersWritten: false };
	const result = await interactiveSession(deps, ended);
	if (result.kind !== 'quit') return result;
	const stopped = deps.prompter.stopReason?.() ?? null;
	const reason: QuitReason = stopped ?? (ended.refused ? 'refused' : 'operator');
	const notices = quitNotices(deps, ended);
	return { kind: 'quit', reason, ...(notices.length === 0 ? {} : { notices }) };
}

/** How a session ended, as the caller reports it. */
interface SessionEnd {
	/** An answer was refused too often. */
	refused: boolean;
	/** --write-answers wrote its file at a valid Review. */
	answersWritten: boolean;
}

/** The closing lines of a quit: a --write-answers file the session never wrote (C3-36). */
function quitNotices(deps: InteractiveDeps, ended: SessionEnd): string[] {
	const path = deps.writeAnswersPath;
	return path === undefined || ended.answersWritten ? [] : [DONE_TEXT.notWritten(path)];
}

/** A fresh session's state. */
function newSession(deps: InteractiveDeps): Session {
	const kept = new Set(
		(Object.entries(deps.givenSecrets) as [SecretKey, string | undefined][])
			.filter(([, value]) => value !== undefined && value !== '')
			.map(([key]) => key),
	);
	return {
		deps,
		raw: {},
		secrets: { ...deps.givenSecrets },
		kept,
		acknowledged: new Set(),
		probes: {},
		probeKeys: {},
		changedSince: {},
		catalog: { catalog: null, ok: true, detail: '' },
		catalogKey: null,
		asked: new Set(),
		seen: new Set(),
		refused: false,
		answersWritten: null,
	};
}

/** The unfinished install: the injected one, else the run files'. */
function unfinishedOf(deps: InteractiveDeps): Unfinished | null {
	return deps.unfinished === undefined ? readUnfinished(deps.givenSecrets) : deps.unfinished;
}

/** The session behind runInteractiveInstall (`ended` records how it ended). */
async function interactiveSession(
	deps: InteractiveDeps,
	ended: SessionEnd,
): Promise<FrontEndResult> {
	if ((await deps.prompter.welcome({ version: deps.version ?? '' })) === QUIT) {
		return { kind: 'quit' };
	}
	const unfinished = unfinishedOf(deps);
	const onRefused = (): void => {
		ended.refused = true;
	};
	if (unfinished !== null) return unfinishedFlow(deps, unfinished, onRefused);
	const session = newSession(deps);
	const walked = await walk(session, 0, 'all');
	const result = walked === 'quit' ? ({ kind: 'quit' } as const) : await review(session);
	ended.refused = ended.refused || session.refused;
	ended.answersWritten = session.answersWritten !== null;
	return result;
}
