/**
 * INSTALL PLAIN-MODE PARITY TRIPWIRE — the interactive plain line mode
 * (src/core/install/install_session.ts under the plain prompter, over the screen model,
 * screen_model.ts) is a front end of the one install plan: for every case it
 * can express, the answers it hands back decide EXACTLY the plan the CLI flags
 * and the answers file decide (terminal installer phase 2, 2026-10-12).
 *
 * WHY. A screen that restated a default, mapped a tick to the wrong answer key,
 * lost a declined dependency or kept a hidden answer would install something
 * the operator never saw on the Review — while every other front end agreed.
 *
 * WHAT IS MEASURED (outcomes, not spellings):
 *  (a) THE MATRIX (test/helpers/install_answer_cases.ts: every phase-1 case +
 *      the route cases — production with an instance, docker, trial, an
 *      explicit developer, production + diffusion + mail, air-gapped with a
 *      local ontology source and a declined dependency, a declined declared
 *      thesaurus, odd values): runInteractiveInstall under the scripted prompter
 *      (the script derived from the case's plan through the MODEL's own
 *      question ids — scriptForPlan), fake probes that pass, the catalog from
 *      the fixture source → `decided(plan)` ≡ the flags' ≡ the answers file's,
 *      and the SECRETS handed back
 *      are exactly the case's. A phase-1 case the screens cannot express is
 *      listed in NOT_PLAIN with its reason, and the reason is MEASURED (a
 *      ROUTE_FIXED key on its route, or a core TLD in a list).
 *  (b) ANTI-VACUITY: the prompter was asked every screen of the route and every
 *      question the final screens show.
 *  (c) ROUNDTRIPS, every case: answersFileOf → answersFromAnswersFile and
 *      cliArgsOf → answersFromCliArgs decide the same plan (values with
 *      spaces, quotes, a leading `--`, non-ASCII included).
 *  (d) docker / trial INSTALL from the Review (phase 4: their host steps run
 *      here): the walked plan is the flags', the root password is asked and
 *      the stack's database password never (generated into .dedalo.env).
 *  (e) an EDIT from the Review (a language change, mail turned off) installs
 *      the plan of the edited answers.
 *  (f) the catalog-changed refusal: reviewed decisions ≠ the final plan's →
 *      CATALOG_CHANGED_REFUSAL; equal → none.
 *  (h) an unfinished install found on start: resume answers `resume`; abort
 *      asks the database name typed back (a wrong one refused and re-asked,
 *      never typed right = refused) and the database password only when the
 *      reset needs it and the environment did not give it; abort not offered
 *      = quit; the terminal prompt names abort only when it is offered.
 *
 * DB-FREE, network-free (the only non-vendored source is a local fixture in a
 * mkdtemp dir, removed in afterAll); nothing is spawned, nothing installed.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	CATALOG_CHANGED_REFUSAL,
	type FrontEndResult,
	reviewDecisions,
	reviewedDecisionsRefusal,
} from '../../src/core/install/front_end.ts';
import { hostCommandPrefix } from '../../src/core/install/host/host_executor.ts';
import {
	answersFileOf,
	answersFromAnswersFile,
	answersFromCliArgs,
	buildInstallPlan,
	cliArgsOf,
	type InstallPlan,
	normalizeInstallAnswers,
	SECRET_ANSWER_KEYS,
	TOPONYMY_SUGGESTION,
	TOPONYMY_SUGGESTION_INTERACTIVE,
} from '../../src/core/install/install_plan.ts';
import { runInteractiveInstall } from '../../src/core/install/install_session.ts';
import { resolveOntologyCatalog } from '../../src/core/install/ontology_catalog.ts';
import type { OntologyCatalog } from '../../src/core/install/ontology_choice.ts';
import { BACK, QUIT, type ScreenView } from '../../src/core/install/prompter_contract.ts';
import { buildScreens, ROUTE_FIXED, sameAsCommand } from '../../src/core/install/screen_model.ts';
import {
	DONE_TEXT,
	ENTRY_COMMAND,
	NOTICE_TEXT,
	REVIEW_TEXT,
} from '../../src/core/install/screen_text.ts';
import {
	scriptedInstallPrompter,
	ttyInstallPrompter,
} from '../../src/core/install/ui_plain/prompter.ts';
import { CORE_ONTOLOGY_TLDS } from '../../src/core/ontology/core_tlds.ts';
import {
	DEFAULT_ONTOLOGIES,
	decided,
	declaredThesauri,
	localOntologySource,
} from '../helpers/install_answer_cases.ts';
import {
	allCases,
	NOT_PLAIN,
	type ParityCase,
	splitCase,
} from '../helpers/install_parity_cases.ts';
import {
	autoTerminal,
	fakeProbes,
	GOOD_ROOT_PASSWORD,
	modelInput,
	scriptForPlan,
	thesaurusOffer,
} from '../helpers/install_plain_script.ts';

const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_plain_parity_'));

/** The local ontology source, written into THIS gate's mkdtemp (the helper only returns bytes). */
function writeSource(dir: string, files = localOntologySource()): string {
	mkdirSync(dir, { recursive: true });
	for (const [name, bytes] of files) writeFileSync(join(dir, name), bytes);
	return dir;
}

afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

const SOURCE_DIR = writeSource(join(scratchRoot, 'ontology_source'));
const LOCAL = await resolveOntologyCatalog(
	{ kind: 'local', path: SOURCE_DIR },
	{ allowedServers: [] },
);
afterAll(() => LOCAL.cleanup());
const LOCAL_CATALOG: OntologyCatalog = LOCAL.catalog;

type Case = ParityCase;

const ALL_CASES: Case[] = allCases(SOURCE_DIR);

const planOf = (raw: Readonly<Record<string, unknown>>, local: boolean): InstallPlan =>
	buildInstallPlan(raw, local ? { ontologyCatalog: LOCAL_CATALOG } : {});

/** The plan a plain result decides (its raw answers + the secrets it collected). */
function plainPlan(result: FrontEndResult, local: boolean): InstallPlan {
	if (result.kind !== 'install') throw new Error(`plain run ended '${result.kind}', not install`);
	const { root_password: _root, ...answerSecrets } = result.secrets;
	return planOf({ ...result.raw, ...answerSecrets }, local);
}

/** Run the plain mode under a script; answers the result and the prompter's record. */
async function runScripted(
	script: Parameters<typeof scriptedInstallPrompter>[0],
	local: boolean,
	writeAnswers?: (path: string, answers: InstallPlan['answers']) => string | null,
) {
	const prompter = scriptedInstallPrompter(script);
	const probes = fakeProbes({ catalog: local ? LOCAL_CATALOG : null });
	const result = await runInteractiveInstall({
		prompter,
		probes,
		priorEnv: {},
		thesauri: thesaurusOffer(),
		host: {},
		givenSecrets: {},
		unfinished: null,
		...(writeAnswers === undefined ? {} : { writeAnswers }),
	});
	return { result, prompter, probes };
}

// ── (a) + (b) the matrix ─────────────────────────────────────────────────────

describe('plain mode ≡ flags ≡ answers file (a, b)', () => {
	test('the matrix is the shared one, and every NOT_PLAIN reason is real (measured)', () => {
		expect(ALL_CASES.length).toBeGreaterThanOrEqual(18);
		for (const [name, reason] of Object.entries(NOT_PLAIN)) {
			const found = ALL_CASES.find((item) => item.name === name);
			expect(found, name).toBeDefined();
			const { plain } = splitCase(found?.argv ?? []);
			const route = normalizeInstallAnswers(plain).answers.route;
			if (reason === 'declared_named') {
				const declared = new Set(declaredThesauri(DEFAULT_ONTOLOGIES).install);
				const named = String(plain.hierarchies ?? '').split(',');
				expect(
					named.some((tld) => declared.has(tld)),
					name,
				).toBe(true);
				// The thesauri INSTALLED are the same through the screen (only the order differs):
				// there the named one is simply left TICKED (pre-ticked by its declarer — a
				// tick also lifts its decline).
				const caseRaw = splitCase(found?.argv ?? []).raw;
				const flagsPlan = planOf(caseRaw, false);
				const ticked = planOf(
					{
						...caseRaw,
						hierarchies: named.filter((tld) => !declared.has(tld)),
						declined_dependencies: String(caseRaw.declined_dependencies ?? '')
							.split(',')
							.filter((token) => token !== '' && !named.includes(token.split(':')[0] as string))
							.join(','),
					},
					false,
				);
				expect([...ticked.hierarchies].sort(), name).toEqual([...flagsPlan.hierarchies].sort());
			} else if (reason === 'route_fixed') {
				expect(
					Object.keys(plain).filter((key) => ROUTE_FIXED[route][key] !== undefined).length,
					name,
				).toBeGreaterThan(0);
			} else {
				const lists = [plain.hierarchies, plain.ontologies].map((value) =>
					String(value ?? '')
						.toLowerCase()
						.split(','),
				);
				expect(
					lists
						.flat()
						.some((tld) => tld === 'lg' || (CORE_ONTOLOGY_TLDS as readonly string[]).includes(tld)),
					name,
				).toBe(true);
			}
		}
		// Every route is in the matrix.
		const routes = new Set(
			ALL_CASES.map((item) => normalizeInstallAnswers(splitCase(item.argv).plain).answers.route),
		);
		expect([...routes].sort()).toEqual(['developer', 'docker', 'production', 'trial']);
	});

	for (const answerCase of ALL_CASES.filter((item) => NOT_PLAIN[item.name] === undefined)) {
		test(`${answerCase.name}`, async () => {
			const { raw, plain, secrets } = splitCase(answerCase.argv);
			const flags = planOf(raw, answerCase.local);
			expect(flags.errors, answerCase.name).toEqual([]);
			// Phase 4: EVERY route installs from the Review (docker/trial run their host
			// steps here); the docker stack's database password is generated, never asked.
			const script = scriptForPlan(flags, Object.keys(plain), {
				...secrets,
				root_password: GOOD_ROOT_PASSWORD,
			});
			const { result, prompter } = await runScripted(script, answerCase.local);
			// The plan the plain mode hands back.
			const fromPlain = plainPlan(result, answerCase.local);
			expect(decided(fromPlain)).toEqual(decided(flags));
			expect(result.kind === 'install' ? result.secrets : null).toEqual({
				...secrets,
				root_password: GOOD_ROOT_PASSWORD,
			});
			// ≡ the answers file of the case (its secrets apart, through DEDALO_INSTALL_*).
			const file = answersFromAnswersFile({ schema: 'dedalo.install.answers/1', answers: plain });
			expect(file.errors).toEqual([]);
			expect(decided(planOf({ ...file.raw, ...secrets }, answerCase.local))).toEqual(
				decided(flags),
			);
			// (b) anti-vacuity: every screen of the route, every question the final screens show.
			const finalScreens = buildScreens(
				modelInput(result.kind === 'install' ? result.raw : { route: flags.answers.route }, {
					catalogs: {
						ontology: {
							catalog: answerCase.local ? LOCAL_CATALOG : null,
							ok: true,
							detail: '',
						},
						thesauri: thesaurusOffer(),
					},
				}),
			);
			for (const screen of finalScreens) {
				expect(prompter.asked, `screen ${screen.id}`).toContain(`screen:${screen.id}`);
				if (result.kind !== 'install') continue;
				for (const question of screen.questions) {
					if (question.id.endsWith('.probe_override')) continue;
					expect(prompter.asked, question.id).toContain(question.id);
				}
			}
		});
	}
});

// ── (c) roundtrips ───────────────────────────────────────────────────────────

/**
 * A roundtrip decides the same install. Its notes may only SHRINK: the
 * normalized answers no longer carry an input the plan dropped with a note
 * (`lg` / `dd` in a list) — every other decided field is identical.
 */
function expectSameDecision(back: InstallPlan, plan: InstallPlan): void {
	const { notes: backNotes, ...backRest } = decided(back);
	const { notes, ...rest } = decided(plan);
	expect(backRest).toEqual(rest);
	expect(backNotes.filter((note) => !notes.includes(note))).toEqual([]);
}

describe('roundtrips: answers file and argv are faithful inverses (c)', () => {
	for (const answerCase of ALL_CASES) {
		test(`${answerCase.name}`, () => {
			const { raw, secrets } = splitCase(answerCase.argv);
			const plan = planOf(raw, answerCase.local);
			const viaFile = answersFromAnswersFile(
				JSON.parse(JSON.stringify(answersFileOf(plan.answers))) as unknown,
			);
			expect(viaFile.errors).toEqual([]);
			// No secret ever enters the file.
			for (const key of SECRET_ANSWER_KEYS)
				expect(Object.hasOwn(viaFile.raw, key), key).toBe(false);
			expectSameDecision(planOf({ ...viaFile.raw, ...secrets }, answerCase.local), plan);
			const argv = cliArgsOf(plan.answers);
			for (const flag of [
				'--db-password',
				'--mysql-password',
				'--smtp-password',
				'--root-password',
			]) {
				expect(
					argv.some((token) => token.startsWith(flag)),
					flag,
				).toBe(false);
			}
			const viaArgv = answersFromCliArgs(argv);
			expect(viaArgv.errors).toEqual([]);
			expectSameDecision(planOf({ ...viaArgv.raw, ...secrets }, answerCase.local), plan);
		});
	}

	test('the odd-values case really carries the odd values (anti-vacuity)', () => {
		const odd = ALL_CASES.find((item) => item.name.startsWith('odd values'));
		const plan = planOf(splitCase(odd?.argv ?? []).raw, false);
		expect(plan.answers.entity_label).toBe('--x \'quoted\' "double" Ñandú · 博物館');
		expect(plan.answers.information).toBe('a b  c');
		expect(cliArgsOf(plan.answers)).toContain(
			'--entity-label=--x \'quoted\' "double" Ñandú · 博物館',
		);
	});
});

// ── (d) docker / trial: they install here (phase 4) ─────────────────────────

describe('docker and trial: the Review installs, like every route (d)', () => {
	for (const route of ['docker', 'trial'] as const) {
		test(`${route}: install offered and taken; the root password asked, the stack's database password never`, async () => {
			const answerCase = ALL_CASES.find((item) => item.name === `route ${route}`) as Case;
			const { raw, plain } = splitCase(answerCase.argv);
			const flags = planOf(raw, false);
			expect(flags.errors).toEqual([]);
			const script = scriptForPlan(flags, Object.keys(plain), {
				root_password: GOOD_ROOT_PASSWORD,
			});
			// trial: the no-media-protection acknowledgement must be TYPED.
			if (route === 'trial') script.answers['route.trial_no_media_protection'] = 'yes';
			const { result, prompter } = await runScripted(script, false);
			expect(result.kind).toBe('install');
			expect(decided(plainPlan(result, false))).toEqual(decided(flags));
			expect(prompter.said).not.toContain('install is not offered: see the errors above');
			// The root password is asked (the engine child sets it); the stack's database
			// password is GENERATED on the host into .dedalo.env — never asked, never shown.
			expect(prompter.asked.some((id) => id.endsWith('.root_password'))).toBe(true);
			expect(prompter.asked.filter((id) => id.endsWith('.db_password'))).toEqual([]);
			expect(result.kind === 'install' ? result.secrets : null).toEqual({
				root_password: GOOD_ROOT_PASSWORD,
			});
		});
	}
});

// ── (e) an edit from the Review ──────────────────────────────────────────────

describe('an edit from the Review installs the edited plan (e)', () => {
	test('change the languages and turn mail off: the plan of the edited answers', async () => {
		const answerCase = ALL_CASES.find((item) => item.name === '+mailer') as Case;
		const { raw, plain, secrets } = splitCase(answerCase.argv);
		const original = planOf(raw, false);
		const screens = buildScreens(modelInput({ route: 'developer' }));
		const indexOf = (id: string): number =>
			(screens.find((screen) => screen.id === id)?.index ?? 0) as number;
		const script = scriptForPlan(
			original,
			Object.keys(plain),
			{ ...secrets, root_password: GOOD_ROOT_PASSWORD },
			[`edit ${indexOf('languages')}`, `edit ${indexOf('mail')}`, 'install'],
		);
		const prompter = scriptedInstallPrompter(script);
		// The operator's NEW answers, typed when the Review is first shown.
		const review = prompter.review;
		let edited = false;
		prompter.review = async (view) => {
			if (!edited) {
				edited = true;
				script.answers['languages.langs'] = ['lg-eng', 'lg-fra'];
				script.answers['languages.app_lang_default'] = 'lg-fra';
				script.answers['languages.data_lang_default'] = 'lg-eng';
				script.answers['mail.mailer'] = false;
			}
			return review(view);
		};
		const result = await runInteractiveInstall({
			prompter,
			probes: fakeProbes(),
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		const expected = planOf(
			{
				...raw,
				langs: 'lg-eng,lg-fra',
				app_lang_default: 'lg-fra',
				data_lang_default: 'lg-eng',
				mailer: false,
				smtp_host: undefined,
				smtp_port: undefined,
				smtp_secure: undefined,
				smtp_user: undefined,
				smtp_pass: undefined,
				smtp_from: undefined,
				smtp_from_name: undefined,
			},
			false,
		);
		expect(expected.errors).toEqual([]);
		expect(expected.envKeys).not.toContain('DEDALO_SMTP_HOST');
		const fromPlain = plainPlan(result, false);
		expect(decided(fromPlain)).toEqual(decided(expected));
		// …and NOT the original (the edit really changed the plan).
		expect(decided(fromPlain)).not.toEqual(decided(original));
		// The mail password held for the disabled service is not handed back.
		expect(result.kind === 'install' ? result.secrets.smtp_pass : 'x').toBeUndefined();
	});
});

// ── (g) a verdict holds only for what it tested ─────────────────────────────

describe('a probe verdict holds only for the answers it tested (g)', () => {
	test('an instance changed from the Review re-runs the database and media checks over the NEW names', async () => {
		const answerCase = ALL_CASES.find(
			(item) => item.name === 'route production + instance (derived names as shown)',
		) as Case;
		const { raw, plain } = splitCase([...answerCase.argv, '--instance', 'murillo']);
		const original = planOf(raw, false);
		expect(original.answers.db_database).toBe('dedalo_murillo');
		const script = scriptForPlan(
			original,
			Object.keys(plain),
			{ db_password: 'Zz-Db-1', root_password: GOOD_ROOT_PASSWORD },
			['edit 1', 'install'],
		);
		const prompter = scriptedInstallPrompter(script);
		const review = prompter.review;
		let edited = false;
		prompter.review = async (view) => {
			if (!edited) {
				edited = true;
				script.answers['route.instance'] = 'ribera';
			}
			return review(view);
		};
		const probes = fakeProbes();
		const result = await runInteractiveInstall({
			prompter,
			probes,
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		const final = plainPlan(result, false);
		expect(final.answers.db_database).toBe('dedalo_ribera');
		const tested = (probe: string) =>
			probes.calls
				.filter((call) => call.probe === probe)
				.map((call) => normalizeInstallAnswers(call.answers ?? {}).answers);
		// The LAST check of each ran over what will be installed.
		expect(tested('db').at(-1)?.db_database).toBe('dedalo_ribera');
		// Phase 4: a created production database is owned by the instance's PEER role.
		expect(tested('db').at(-1)?.db_username).toBe('ded_ribera');
		expect(tested('media').at(-1)?.media_path).toBe(final.answers.media_path);
		expect(final.answers.media_path).toBe('/srv/dedalo/ribera/dedalo/media');
		// Anti-vacuity: the first checks DID run over the old names.
		expect(tested('db')[0]?.db_database).toBe('dedalo_murillo');
	});

	test('a route changed from the Review re-runs the System check: a host route never installs over a trial verdict', async () => {
		const answerCase = ALL_CASES.find((item) => item.name === 'route trial') as Case;
		const { raw, plain } = splitCase(answerCase.argv);
		// Phase 4: trial asks the root password too (its engine child sets it).
		const script = scriptForPlan(
			planOf(raw, false),
			Object.keys(plain),
			{ root_password: GOOD_ROOT_PASSWORD },
			['edit 1', 'install'],
		);
		const prompter = scriptedInstallPrompter(script);
		const review = prompter.review;
		let edited = false;
		prompter.review = async (view) => {
			if (!edited) {
				edited = true;
				script.answers['route.route'] = 'developer';
			}
			return review(view);
		};
		// The host checks (psql, the seed…) fail on this "host"; a Docker route skips them.
		const fake = fakeProbes();
		const probes = {
			...fake,
			system: async (route: Parameters<typeof fake.system>[0]) => {
				const outcome = await fake.system(route);
				return route === 'trial' || route === 'docker'
					? outcome
					: { ...outcome, ok: false, detail: 'psql not found (fake)' };
			},
		};
		const result = await runInteractiveInstall({
			prompter,
			probes,
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		expect(result.kind).not.toBe('install');
		expect(
			fake.calls.filter((call) => call.probe === 'system').map((call) => call.answers?.route),
		).toEqual(['trial', 'developer']);
	});

	test('a secret the ENVIRONMENT supplied for a service turned off is not handed back', async () => {
		const answerCase = ALL_CASES.find((item) => item.name === '+mailer') as Case;
		const { raw, plain, secrets } = splitCase(answerCase.argv);
		const original = planOf(raw, false);
		const screens = buildScreens(modelInput({ route: 'developer' }));
		const mailIndex = screens.find((screen) => screen.id === 'mail')?.index as number;
		const script = scriptForPlan(
			original,
			Object.keys(plain),
			{ ...secrets, smtp_pass: undefined, root_password: GOOD_ROOT_PASSWORD },
			[`edit ${mailIndex}`, 'install'],
		);
		const prompter = scriptedInstallPrompter(script);
		const review = prompter.review;
		let edited = false;
		prompter.review = async (view) => {
			if (!edited) {
				edited = true;
				script.answers['mail.mailer'] = false;
			}
			return review(view);
		};
		const result = await runInteractiveInstall({
			prompter,
			probes: fakeProbes(),
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: { smtp_pass: 'Zz-Env-Smtp-3' },
			unfinished: null,
		});
		expect(result.kind).toBe('install');
		expect(result.kind === 'install' ? result.secrets.smtp_pass : 'x').toBeUndefined();
		expect(JSON.stringify(result)).not.toContain('Zz-Env-Smtp-3');
	});
});

// ── (f) the catalog-changed refusal ─────────────────────────────────────────

describe('the reviewed decisions bind the run (f)', () => {
	test('a final plan that decides otherwise than the reviewed one is refused; the same one is not', () => {
		const argv = [
			'--db-name',
			'd',
			'--db-user',
			'u',
			'--entity',
			'e',
			'--ontology-source',
			SOURCE_DIR,
			'--ontologies',
			'zzsma,oh',
		];
		const raw = answersFromCliArgs(argv).raw;
		const reviewedPlan = planOf(raw, true);
		expect(reviewedPlan.errors).toEqual([]);
		const reviewed = reviewDecisions(reviewedPlan);
		expect(reviewedDecisionsRefusal(reviewed, planOf(raw, true))).toBeNull();
		// The source changed between the Review and the run: zzsma no longer declares zzsmb.
		const changedDir = writeSource(
			join(scratchRoot, 'changed_source'),
			localOntologySource([
				{
					tld: 'zzsma',
					name: 'zz screen A',
					typologyId: 8,
					typologyName: 'Catalog',
					dependencies: [{ tld: 'dd', main: 'ontology35', mandatory: true }],
					nodes: [{ id: 1, parent: 'zzsma0', model: 'dd6', term: 'A root' }],
				},
			]),
		);
		return resolveOntologyCatalog({ kind: 'local', path: changedDir }, { allowedServers: [] }).then(
			(changed) => {
				try {
					const final = buildInstallPlan(raw, { ontologyCatalog: changed.catalog });
					expect(final.errors).toEqual([]);
					expect(reviewedDecisionsRefusal(reviewed, final)).toBe(CATALOG_CHANGED_REFUSAL);
				} finally {
					changed.cleanup();
				}
			},
		);
	});
});

// ── (h) an unfinished install: resume / abort / quit ─────────────────────────

describe('an unfinished install on start: resume, abort (the name typed back), quit (h)', () => {
	const unfinished = { database: 'dedalo_prado', outcome: 'failed', canAbort: true };

	/** The plain mode over `script`, an unfinished install found on start. */
	async function startWith(
		script: Parameters<typeof scriptedInstallPrompter>[0],
		found: typeof unfinished & { needsDbPassword?: boolean },
		givenSecrets: Record<string, string> = {},
		typedNames: string[] = [],
	) {
		const prompter = scriptedInstallPrompter(script);
		const text = prompter.text;
		// The database names typed, in order (the scripted prompter repeats one answer).
		prompter.text = async (question) => {
			if (question.id !== 'resume.confirm_database' || typedNames.length === 0)
				return text(question);
			prompter.asked.push(question.id);
			return typedNames.shift() as string;
		};
		const result = await runInteractiveInstall({
			prompter,
			probes: fakeProbes(),
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets,
			unfinished: found,
		});
		return { result, prompter };
	}

	test('resume: no question asked, the session resumes', async () => {
		const { result, prompter } = await startWith({ answers: { resume: 'resume' } }, unfinished);
		expect(result).toEqual({ kind: 'resume' });
		expect(prompter.said).toContain(
			"An install into database 'dedalo_prado' was interrupted (failed).",
		);
		expect(prompter.asked).toEqual(['resume']);
	});

	test('abort: a wrong name is refused and asked again; the right one aborts; the password when needed', async () => {
		const { result, prompter } = await startWith(
			{ answers: { resume: 'abort' }, secrets: { 'resume.db_password': 'Zz-Abort-Db-1' } },
			{ ...unfinished, needsDbPassword: true },
			{},
			['dedalo_wrong', 'dedalo_prado'],
		);
		expect(result).toEqual({
			kind: 'abort',
			confirmDatabase: 'dedalo_prado',
			secrets: { db_password: 'Zz-Abort-Db-1' },
		});
		expect(prompter.asked).toEqual([
			'resume',
			'resume.confirm_database',
			'resume.confirm_database',
			'resume.db_password',
		]);
		expect(prompter.said).toContain(
			"type the database name 'dedalo_prado' exactly to confirm the abort",
		);
	});

	test('abort: the password is NOT asked when the reset does not need it, nor when the environment gave it', async () => {
		const notNeeded = await startWith({ answers: { resume: 'abort' } }, unfinished, {}, [
			'dedalo_prado',
		]);
		expect(notNeeded.result).toEqual({
			kind: 'abort',
			confirmDatabase: 'dedalo_prado',
			secrets: {},
		});
		expect(notNeeded.prompter.asked).not.toContain('resume.db_password');
		const given = await startWith(
			{ answers: { resume: 'abort' } },
			{ ...unfinished, needsDbPassword: true },
			{ db_password: 'Zz-Env-Db-2' },
			['dedalo_prado'],
		);
		expect(given.result).toEqual({
			kind: 'abort',
			confirmDatabase: 'dedalo_prado',
			secrets: { db_password: 'Zz-Env-Db-2' },
		});
		expect(given.prompter.asked).not.toContain('resume.db_password');
	});

	test('a name never typed right ends the session as refused; abort not offered = quit', async () => {
		const never = await startWith(
			{ answers: { resume: 'abort', 'resume.confirm_database': 'nope' } },
			unfinished,
		);
		expect(never.result).toEqual({ kind: 'quit', reason: 'refused' });
		const offered = await startWith(
			{ answers: { resume: 'abort' } },
			{ ...unfinished, canAbort: false },
		);
		expect(offered.result).toEqual({ kind: 'quit', reason: 'operator' });
		expect(offered.prompter.asked).toEqual(['resume']);
	});

	test('the plain terminal prompt names abort only when it is offered', async () => {
		for (const canAbort of [true, false]) {
			const terminal = autoTerminal(() => 'resume');
			try {
				const result = await runInteractiveInstall({
					prompter: ttyInstallPrompter({
						input: terminal.input,
						output: terminal.output,
						signals: terminal.signals,
					}),
					probes: fakeProbes(),
					priorEnv: {},
					thesauri: thesaurusOffer(),
					host: {},
					givenSecrets: {},
					unfinished: { ...unfinished, canAbort },
				});
				expect(result).toEqual({ kind: 'resume' });
				expect(terminal.prompts.at(-1)).toContain(
					canAbort ? 'resume it, abort it, or quit' : 'resume it, or quit',
				);
			} finally {
				terminal.stop();
			}
		}
	});
});

// ── campaign 3 (P5): what the session says and writes, per route ─────────────

describe('campaign 3: the session’s words and files (C3-36, C3-48, C3-53, C3-61, C3-64)', () => {
	/** A route case's flags plan and the script that walks it (Review commands given). */
	function walked(name: string, review: readonly string[]) {
		const answerCase = ALL_CASES.find((item) => item.name === name) as Case;
		const { raw, plain } = splitCase(answerCase.argv);
		const flags = planOf(raw, false);
		expect(flags.errors, name).toEqual([]);
		const script = scriptForPlan(
			flags,
			Object.keys(plain),
			{ root_password: GOOD_ROOT_PASSWORD },
			review,
		);
		return { flags, script };
	}

	/** Run a scripted session with --write-answers pointing at `path` (writes recorded, never on disk). */
	async function withWriteAnswers(
		script: Parameters<typeof scriptedInstallPrompter>[0],
		path: string,
	) {
		const writes: { path: string; answers: InstallPlan['answers'] }[] = [];
		const prompter = scriptedInstallPrompter(script);
		const result = await runInteractiveInstall({
			prompter,
			probes: fakeProbes(),
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
			writeAnswersPath: path,
			writeAnswers: (target, answers) => {
				writes.push({ path: target, answers });
				return null;
			},
		});
		return { result, prompter, writes };
	}

	test('C3-36: --write-answers on an interactive run is written at the first VALID Review — a quit there keeps it', async () => {
		const { flags, script } = walked('route trial', ['quit']);
		const { result, writes, prompter } = await withWriteAnswers(script, '/scratch/answers.json');
		expect(result.kind).toBe('quit');
		expect(writes.length).toBe(1);
		expect(writes[0]?.path).toBe('/scratch/answers.json');
		const written = { ...(writes[0]?.answers ?? {}) } as Record<string, unknown>;
		expect(decided(planOf(written, false))).toEqual(decided(flags));
		expect(prompter.said).toContain(DONE_TEXT.written('/scratch/answers.json'));
		expect(result.kind === 'quit' ? result.notices : 'not a quit').toBeUndefined();
	});

	test('C3-36: a session that quits before a valid Review says the file was NOT written', async () => {
		const { script } = walked('route trial', ['quit']);
		script.answers['route.route'] = '<quit>';
		const { result, writes } = await withWriteAnswers(script, '/scratch/answers.json');
		expect(writes).toEqual([]);
		expect(result.kind === 'quit' ? result.notices : []).toEqual([
			DONE_TEXT.notWritten('/scratch/answers.json'),
		]);
	});

	test("C3-53: the Review's 'same as' line and the answers file's next step use the route's own entry command", async () => {
		const cases: [string, string][] = [
			['route trial', 'sh install.sh --route=trial'],
			['route docker', 'sh install.sh --route=docker'],
			['route developer (explicit)', 'bun run scripts/install.ts'],
			[
				'route production + instance (derived names as shown)',
				'sudo sh install.sh --route=production',
			],
		];
		for (const [name, start] of cases) {
			const { flags, script } = walked(name, ['write /scratch/a.json']);
			const { result, prompter } = await runScripted(script, false, () => null);
			expect(result.kind, name).toBe('written');
			const sameAs = prompter.said.find((line) => line.startsWith(REVIEW_TEXT.sameAs)) ?? '';
			expect(sameAs.slice(REVIEW_TEXT.sameAs.length).trim(), name).toStartWith(`${start} `);
			expect(sameAsCommand(flags.answers), name).toStartWith(`${start} `);
			const entry = ENTRY_COMMAND[flags.answers.route] as string;
			expect(prompter.said, name).toContain(DONE_TEXT.writtenNext(flags.answers.route));
			expect(DONE_TEXT.writtenNext(flags.answers.route), name).toContain(
				`${entry} --answers <file>`,
			);
		}
		// The host routes' words ARE the resume line's (host_executor.ts hostCommandPrefix).
		for (const route of ['production', 'docker', 'trial'] as const) {
			expect(ENTRY_COMMAND[route]).toBe(hostCommandPrefix({ route }));
		}
	});

	test('C3-48: "Install now" says what the image source does — never "pulls" for a local build', async () => {
		for (const [source, words] of [
			['build', 'builds the image here from this checkout'],
			['official', 'pulls the official image and verifies its signature'],
		] as const) {
			const { script } = walked('route trial', ['install']);
			script.answers['image.image_source'] = source;
			const acknowledged: string[] = [];
			const base = scriptedInstallPrompter(script);
			const prompter = {
				...base,
				acknowledge: async (question: Parameters<typeof base.acknowledge>[0]) => {
					acknowledged.push(`${question.id}: ${question.description}`);
					return base.acknowledge(question);
				},
			};
			const result = await runInteractiveInstall({
				prompter,
				probes: fakeProbes(),
				priorEnv: {},
				thesauri: thesaurusOffer(),
				host: {},
				givenSecrets: {},
				unfinished: null,
			});
			expect(result.kind, source).toBe('install');
			const install = acknowledged.find((line) => line.startsWith('review.install')) ?? '';
			expect(install, source).toContain(words);
			if (source === 'build') expect(install).not.toContain('pulls');
		}
	});

	test('C3-61: a failed row no fix on this machine changes offers only quit — retry is refused', async () => {
		const views: { commands: readonly string[]; prompt: string; lines: readonly string[] }[] = [];
		const { script } = walked('route trial', ['quit']);
		script.answers['system.probe_action'] = 'retry';
		const base = scriptedInstallPrompter(script);
		let asks = 0;
		const prompter = {
			...base,
			probe: async (view: Parameters<typeof base.probe>[0]) => {
				views.push({ commands: view.commands, prompt: view.prompt, lines: view.lines });
				asks += 1;
				return asks === 1 ? 'retry' : 'quit';
			},
		};
		const probes = fakeProbes();
		probes.system = async () => ({
			ok: false,
			detail: 'one check failed',
			rows: [
				{
					state: 'fail',
					label: 'Operating system',
					detail: 'Zz OS 1 is not supported',
					fixable: false,
				},
			],
		});
		const result = await runInteractiveInstall({
			prompter,
			probes,
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		expect(result.kind).toBe('quit');
		expect(views[0]?.commands).toEqual(['quit']);
		expect(views[0]?.prompt).toBe('quit, or back to choose another route');
		expect(base.said).toContain(
			"'retry' is not offered here — type quit, or back to choose another route",
		);
		// The verdict never asks for a fix that cannot exist (campaign 3b C3-61).
		expect(views[0]?.lines.join('\n')).toContain(NOTICE_TEXT.systemUnfixable);
		expect(views[0]?.lines.join('\n')).not.toContain('fix it and re-check');
		// CONTROL: a fixable failure still offers retry.
		probes.system = async () => ({
			ok: false,
			detail: 'one check failed',
			rows: [{ state: 'fail', label: 'Private directory', detail: 'not writable' }],
		});
		views.length = 0;
		asks = 1;
		await runInteractiveInstall({
			prompter,
			probes,
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		expect(views[0]?.commands).toEqual(['retry', 'edit', 'quit']);
		expect(views[0]?.lines.join('\n')).toContain('1 check failed — fix it and re-check.');
	});

	test('C3-64: the interactive Review advises the Thesauri step and Maintenance, never CLI flags', async () => {
		const { flags, script } = walked('route trial', ['quit']);
		expect(flags.suggestions).toContain(TOPONYMY_SUGGESTION);
		const { prompter } = await runScripted(script, false);
		expect(prompter.said).toContain(TOPONYMY_SUGGESTION_INTERACTIVE);
		expect(prompter.said.some((line) => line.includes(TOPONYMY_SUGGESTION))).toBe(false);
		expect(prompter.said.filter((line) => /--hierarchies|--list-hierarchies/.test(line))).toEqual(
			[],
		);
	});
});

describe('campaign 3b: back, re-checks and the rail (N27, N34, N37)', () => {
	/** A route case's script (the Review quits). */
	function scriptOf(name: string) {
		const answerCase = ALL_CASES.find((item) => item.name === name) as Case;
		const { raw, plain } = splitCase(answerCase.argv);
		const flags = planOf(raw, false);
		expect(flags.errors, name).toEqual([]);
		return scriptForPlan(flags, Object.keys(plain), { root_password: GOOD_ROOT_PASSWORD }, [
			'quit',
		]);
	}

	test('N37: `back` from a question re-asks it on return, and the check stepped back onto runs again, printed once', async () => {
		const base = scriptedInstallPrompter(scriptOf('route trial'));
		let imageAsks = 0;
		const prompter = {
			...base,
			choice: async (question: Parameters<typeof base.choice>[0]) => {
				if (question.id !== 'image.image_source') return base.choice(question);
				imageAsks += 1;
				return imageAsks === 1 ? BACK : base.choice(question);
			},
		};
		const probes = fakeProbes();
		const result = await runInteractiveInstall({
			prompter,
			probes,
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		expect(result.kind).toBe('quit');
		// The question navigated away from is asked again when the step comes back.
		expect(imageAsks).toBe(2);
		// The System check ran again on the way back (never a cached verdict)…
		expect(probes.calls.filter((call) => call.probe === 'system').length).toBe(2);
		// …and its rows were printed once per visit, never twice for one.
		expect(base.said.filter((line) => line.includes('Bun  fake')).length).toBe(2);
	});

	test('N27: a check re-run before the Review names the answers that changed what it checked', async () => {
		const script = scriptOf('route production + instance (derived names as shown)');
		// The Web server is answered AFTER the Identity check, which reads it (R10R1: the
		// re-check printed after the Administrator password read as if the password changed it).
		script.answers['web_tls.web_server'] = 'apache';
		const prompter = scriptedInstallPrompter(script);
		await runInteractiveInstall({
			prompter,
			probes: fakeProbes(),
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		const rechecks = prompter.said.filter((line) => line.startsWith('the answers changed what'));
		expect(rechecks.length).toBeGreaterThan(0);
		expect(rechecks).toContain(
			"the answers changed what 'Identity' checked (Web server): checking again",
		);
		for (const line of rechecks) {
			expect(line).toMatch(/^the answers changed what '[^']+' checked \([^)]+\): checking again$/);
		}
	});

	test('N34: the view of a screen whose check failed marks it failed; the screen is shown current before its check', async () => {
		const base = scriptedInstallPrompter(scriptOf('route trial'));
		const views: ScreenView[] = [];
		let probeViewSeen = null as string | null;
		let failedAtProbe = null as readonly string[] | null;
		const prompter = {
			...base,
			view: (view: ScreenView) => {
				views.push(view);
			},
			probe: async (_view: Parameters<typeof base.probe>[0]) => {
				probeViewSeen = views.at(-1)?.screen.id ?? null;
				failedAtProbe = views.at(-1)?.failed ?? null;
				return QUIT;
			},
		};
		const probes = fakeProbes({ fail: ['system'] });
		await runInteractiveInstall({
			prompter,
			probes,
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		// The failed check's page is drawn under ITS screen, never the route screen's.
		expect(probeViewSeen).toBe('system');
		expect(failedAtProbe).toEqual(['system']);
		// CONTROL: a passing check is never marked failed.
		const passing: ScreenView[] = [];
		await runInteractiveInstall({
			prompter: {
				...scriptedInstallPrompter(scriptOf('route trial')),
				view: (view: ScreenView) => void passing.push(view),
			},
			probes: fakeProbes(),
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		expect(passing.some((view) => (view.failed ?? []).length > 0)).toBe(false);
	});
});
