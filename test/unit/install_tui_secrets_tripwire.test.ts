/**
 * INSTALL FULL-SCREEN SECRETS TRIPWIRE — the OpenTUI installer (src/core/
 * install/ui/, terminal installer phase 3, 2026-10-12) never draws a secret,
 * never keeps one where the renderer could draw or log it, never writes one
 * into an answers file, and shows the generated salt exactly once — on the
 * Done screen (owner decision: "secrets are never echoed or logged, entered
 * twice").
 *
 * WHAT IS MEASURED (outcomes, never spellings):
 *  (a) A WHOLE full-screen walk, driven by KEYS on OpenTUI's test renderer
 *      (test/helpers/install_tui_driver.ts), with four distinct secrets —
 *      database, MariaDB, SMTP, root (a weak root first) — typed one key at a
 *      time: after EVERY key the frame (characters AND styled spans) holds
 *      none of them (any case, their distinctive core as a substring); while a
 *      secret field has focus, no renderable in the tree carries the value
 *      (value / plainText / content) and the tree holds no Input/Textarea
 *      renderable. POSITIVE CONTROLS: the field shows exactly n `•` after n
 *      keys; the secrets DID reach the result.
 *  (b) The live policy checklist: the weak root's rules show ✗, and rows turn
 *      ✓ as the strong one is typed (frames differ) — the rules never carry
 *      the value.
 *  (c) A probe message planted with ESC/CSI/OSC sequences is drawn as
 *      sanitizeLine(message): its text is on screen, its payload is not.
 *  (d) --write-answers during the walk: the file holds no secret.
 *  (e) Three mismatching pairs end the session as `refused`.
 *  (f) THE RUN: a real executeInstall (fake step table, temp private dir) under
 *      the full-screen reporter: a step that prints the database password
 *      through console.log / console.info / console.error(new Error) shows the
 *      redaction marker in the `l` log view, never the password; the
 *      generated salt appears on NO frame before the executor's one-time
 *      display, and on the Done frame after it.
 *
 * DB-FREE; the only writes are mkdtemp scratch dirs, removed in afterAll. The
 * environment switches of OpenTUI (OTUI_STDIN_LOG would append every typed
 * byte to a file) are a PTY matter: install_tui_restore_tripwire.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Renderable } from '@opentui/core';
import { sanitizeLine } from '../../src/core/install/display_text.ts';
import { executeInstall } from '../../src/core/install/executor.ts';
import { writeAnswersFile } from '../../src/core/install/front_end.ts';
import { buildInstallPlan } from '../../src/core/install/install_plan.ts';
import { runInteractiveInstall } from '../../src/core/install/install_session.ts';
import { installEnvPath } from '../../src/core/install/run_files.ts';
import { passwordFeedback } from '../../src/core/install/screen_model.ts';
import { CASES, routeCases } from '../helpers/install_answer_cases.ts';
import { fakeHost, fakePlan, fakeTable, withPrivateDir } from '../helpers/install_fake_executor.ts';
import { splitCase } from '../helpers/install_parity_cases.ts';
import { fakeProbes, scriptForPlan, thesaurusOffer } from '../helpers/install_plain_script.ts';
import {
	drivenPrompter,
	enter,
	type Keys,
	openRig,
	pending,
	type TuiRig,
	typeKeys,
} from '../helpers/install_tui_driver.ts';

/** The engine-only ending (these runs are engine runs). */
const ENGINE_ENDING = { route: 'engine', instance: '', keptLive: false } as const;

const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_tui_secrets_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

/** Four distinct secrets; each `core` is what must never appear, in any case. */
const SECRETS = {
	db: { value: 'Db-QuetzalOrchid-71', core: 'quetzalorchid' },
	mysql: { value: 'My-PangolinVelvet-38', core: 'pangolinvelvet' },
	smtp: { value: 'Sm-MarmotTopaz-52', core: 'marmottopaz' },
	root: { value: 'Ro-KestrelHarbor-47x', core: 'kestrelharbor' },
} as const;
const CORES = Object.values(SECRETS).map((secret) => secret.core);
/** A root password the policy refuses. */
const WEAK_ROOT = 'weakling';

/** The text of a frame's styled spans. */
function spansText(rig: TuiRig): string {
	return rig.setup
		.captureSpans()
		.lines.map((line) => line.spans.map((span) => span.text).join(''))
		.join('\n');
}

/** None of the secrets in `text` (any case; their core as a substring). */
function expectNoSecret(text: string, where: string): void {
	const lower = text.toLowerCase();
	for (const core of CORES) expect(lower.includes(core), `${where}: ${core}`).toBe(false);
}

/** Every renderable under the root. */
function descendants(node: Renderable): Renderable[] {
	return node.getChildren().flatMap((child) => [child, ...descendants(child as Renderable)]);
}

/** A renderable's text-bearing properties, as text. */
function carried(node: Renderable): string {
	const record = node as unknown as Record<string, unknown>;
	return ['value', 'plainText', 'content']
		.map((key) => {
			const value = record[key];
			if (value === undefined || value === null) return '';
			if (typeof value === 'string') return value;
			const chunks = (value as { chunks?: { text: string }[] }).chunks;
			return Array.isArray(chunks) ? chunks.map((chunk) => chunk.text).join('') : String(value);
		})
		.join('\u0000');
}

/** While a secret field has focus: no renderable carries a secret, none is an input. */
function expectTreeClean(rig: TuiRig): void {
	const nodes = descendants(rig.setup.renderer.root);
	expect(nodes.length).toBeGreaterThan(5);
	for (const node of nodes) {
		const name = node.constructor.name;
		expect(name === 'InputRenderable' || name === 'TextareaRenderable', name).toBe(false);
		expectNoSecret(carried(node), `renderable ${name}`);
	}
}

// ── (a)–(d) the walk ─────────────────────────────────────────────────────────

describe('a whole full-screen walk never draws a secret (a–d)', () => {
	test('four secrets typed key by key; frames, spans and the tree stay clean; the file too', async () => {
		// production + publication + mail: every secret question is asked.
		const answerCase = routeCases(scratchRoot).find(
			(item) => item.name === 'production + diffusion + mailer',
		) as ReturnType<typeof routeCases>[number];
		// An EXISTING database: a created one is peer-only and asks no password (C3-66).
		const { raw, plain } = splitCase([...answerCase.argv, '--db-mode', 'existing']);
		const plan = buildInstallPlan(raw);
		const script = scriptForPlan(
			plan,
			Object.keys(plain),
			{
				db_password: SECRETS.db.value,
				mysql_password: SECRETS.mysql.value,
				smtp_pass: SECRETS.smtp.value,
			},
			['install'],
		);
		const rig = await openRig();
		let keysPressed = 0;
		let dotsSeen = 0;
		const ruleFrames: string[] = [];
		const allFrames: string[] = [];
		const keys: Keys = {
			afterKey: async () => {
				keysPressed += 1;
				const frame = await rig.frame();
				allFrames.push(frame);
				expectNoSecret(frame, `frame after key ${keysPressed}`);
				expectNoSecret(spansText(rig), `spans after key ${keysPressed}`);
				const ask = rig.front.prompter.pending();
				if (ask?.kind === 'secret') {
					expectTreeClean(rig);
					const row = frame.split('\n').find((line) => line.includes('•')) ?? '';
					dotsSeen = Math.max(dotsSeen, (row.match(/•/g) ?? []).length);
				}
			},
			intercept: async (id) => {
				// Every question's frame too (not only after a key): a screen answered without a
				// typed key — the database screen's successor, web_tls, since identity moved
				// before the database (2026-10-12) — still shows the probe's sentence.
				allFrames.push(await rig.frame());
				if (id !== 'administrator.root_password') return 'continue';
				// The weak one first: refused by the policy (asked again), its rules ✗.
				await typeKeys(rig, keys, WEAK_ROOT);
				ruleFrames.push(await rig.frame());
				await enter(rig, keys);
				expect(pending(rig).phase).toBe('first');
				expect(await rig.frame()).toContain('does not meet the policy');
				for (const char of SECRETS.root.value) {
					await typeKeys(rig, keys, char);
					ruleFrames.push(await rig.frame());
				}
				await enter(rig, keys);
				expect(pending(rig).phase).toBe('again');
				await typeKeys(rig, keys, SECRETS.root.value);
				await enter(rig, keys);
				return 'handled';
			},
		};
		try {
			const probes = fakeProbes();
			probes.database = async (answers, secret) => {
				probes.calls.push({ probe: 'db', answers, secret });
				return { ok: true, detail: 'reached \x1b]0;PwnedTitle\x07\x1b[31mdb\x1b[0m' };
			};
			const prompter = drivenPrompter(rig, script, keys);
			const result = await runInteractiveInstall({
				prompter,
				probes,
				priorEnv: {},
				thesauri: thesaurusOffer(),
				host: {},
				givenSecrets: {},
				unfinished: null,
			});
			expect(rig.errors).toEqual([]);
			// Anti-vacuity: the walk asked every secret and they reached the result.
			expect(prompter.asked).toContain('database.db_password');
			expect(prompter.asked).toContain('publication.mysql_password');
			expect(prompter.asked).toContain('mail.smtp_pass');
			expect(result.kind).toBe('install');
			expect(result.kind === 'install' ? result.secrets : null).toEqual({
				db_password: SECRETS.db.value,
				mysql_password: SECRETS.mysql.value,
				smtp_pass: SECRETS.smtp.value,
				root_password: SECRETS.root.value,
			});
			expect(keysPressed).toBeGreaterThan(200);
			// POSITIVE CONTROL: the field drew one dot per typed key.
			expect(dotsSeen).toBe(SECRETS.root.value.length);
			// (b) the live checklist: ✗ for the weak one, rows turning ✓ as the strong one is typed.
			const okCount = (frame: string): number => (frame.match(/✓/g) ?? []).length;
			expect((ruleFrames[0] ?? '').includes('✗')).toBe(true);
			expect(okCount(ruleFrames.at(-1) ?? '')).toBeGreaterThan(okCount(ruleFrames[0] ?? ''));
			expect(passwordFeedback(SECRETS.root.value).errors).toEqual([]);
			expect(JSON.stringify(passwordFeedback(WEAK_ROOT)).toLowerCase()).not.toContain(WEAK_ROOT);
			// (c) the planted message: its text drawn, its escape payload not.
			expect(sanitizeLine('reached \x1b]0;PwnedTitle\x07\x1b[31mdb\x1b[0m')).toBe('reached db');
			expect(allFrames.some((frame) => frame.includes('reached db'))).toBe(true);
			for (const frame of allFrames) {
				expect(frame.includes('PwnedTitle')).toBe(false);
				expect(frame.includes('\x1b')).toBe(false);
			}
		} finally {
			await rig.dispose();
		}
	}, 120000);

	test("the Review's w writes an answers file with no secret in it (d)", async () => {
		const answerCase = routeCases(scratchRoot).find(
			(item) => item.name === 'production + diffusion + mailer',
		) as ReturnType<typeof routeCases>[number];
		const { raw, plain } = splitCase(answerCase.argv);
		const path = join(mkdtempSync(join(scratchRoot, 'answers_')), 'answers.json');
		const script = scriptForPlan(
			buildInstallPlan(raw),
			Object.keys(plain),
			{
				db_password: SECRETS.db.value,
				mysql_password: SECRETS.mysql.value,
				smtp_pass: SECRETS.smtp.value,
				root_password: SECRETS.root.value,
			},
			[`write ${path}`],
		);
		const rig = await openRig();
		try {
			const prompter = drivenPrompter(rig, script);
			const result = await runInteractiveInstall({
				prompter,
				probes: fakeProbes(),
				priorEnv: {},
				thesauri: thesaurusOffer(),
				host: {},
				givenSecrets: {},
				unfinished: null,
				writeAnswers: writeAnswersFile,
			});
			expect(result).toEqual({ kind: 'written', path });
			// Anti-vacuity: the secrets WERE typed before the Review.
			expect(prompter.asked).toContain('mail.smtp_pass');
			const text = readFileSync(path, 'utf8');
			expect(text).toContain('Parity Museum');
			expectNoSecret(text, 'answers file');
		} finally {
			await rig.dispose();
		}
	});

	test('three mismatching pairs end the session as refused (e)', async () => {
		const answerCase = CASES.find(
			(item) => item.name === 'base (every default)',
		) as (typeof CASES)[number];
		const { raw, plain } = splitCase(answerCase.argv);
		const script = scriptForPlan(buildInstallPlan(raw), Object.keys(plain), {}, ['install']);
		const rig = await openRig();
		try {
			const keys: Keys = {
				intercept: async (id) => {
					if (id !== 'database.db_password') return 'continue';
					for (let pair = 0; pair < 3; pair++) {
						await typeKeys(rig, {}, `First-Entry-${pair}`);
						await enter(rig, {});
						await typeKeys(rig, {}, `Other-Entry-${pair}`);
						await enter(rig, {});
					}
					return 'handled';
				},
			};
			const result = await runInteractiveInstall({
				prompter: drivenPrompter(rig, script, keys),
				probes: fakeProbes(),
				priorEnv: {},
				thesauri: thesaurusOffer(),
				host: {},
				givenSecrets: {},
				unfinished: null,
			});
			expect(result).toEqual({ kind: 'quit', reason: 'refused' });
		} finally {
			await rig.dispose();
		}
	});
});

// ── (f) the run ──────────────────────────────────────────────────────────────

describe('the run under the full-screen reporter (f)', () => {
	test('the log view shows the redaction marker, never the password; the salt only on the Done frame', async () => {
		const DB = SECRETS.db.value;
		const SALT = 'Salt-NarwhalSaffron-66';
		// Tall enough that the log view's TAIL still holds install_ontologies' lines: the
		// developer plan ends with verify_dev_server (TODO-053), two lines after them.
		const rig = await openRig({ captureConsole: true, height: 34 });
		const framesBeforeSalt: string[] = [];
		let saltShown = false;
		try {
			await withPrivateDir(mkdtempSync(join(scratchRoot, 'private_')), async () => {
				const { plan, planFile } = fakePlan({ db_password: DB });
				const reporter = rig.front.reporter;
				const io = {
					...reporter.io,
					showOnce: (lines: readonly string[]) => {
						saltShown = true;
						return reporter.io.showOnce?.(lines) ?? false;
					},
				};
				reporter.begin?.(plan.steps.map((id) => ({ id, label: `fake ${id}` })));
				const recordFrame = async () => {
					if (!saltShown) framesBeforeSalt.push(await rig.frame());
				};
				const outcome = await executeInstall(
					{
						mode: 'fresh',
						planFile,
						plan,
						secrets: { root_password: SECRETS.root.value, db_password: DB },
					},
					io,
					{
						table: fakeTable([], {
							persist_config: {
								run: async () => {
									// The salt the real step generates, in the private .env.
									writeFileSync(installEnvPath(), `DEDALO_SALT_STRING=${SALT}\n`, { mode: 0o600 });
									await recordFrame();
									return { ok: true, msg: 'config written' };
								},
							},
							install_ontologies: {
								run: async () => {
									console.log(`connecting with ${DB}`);
									console.info(DB);
									console.error(new Error(`auth failed for ${DB}`));
									await recordFrame();
									return { ok: true, msg: 'ontologies ok' };
								},
							},
						}),
						host: fakeHost().host,
					},
				);
				expect(outcome.result).toBe('complete');
				expect(saltShown).toBe(true);
				// The `l` log view: the lines are there, redacted.
				rig.setup.mockInput.pressKey('l');
				const logFrame = await rig.frame();
				expect(logFrame).toContain('connecting with');
				expect(logFrame).toContain('***');
				expect(logFrame.toLowerCase()).not.toContain(SECRETS.db.core);
				expect(logFrame).not.toContain(SALT);
				expect(rig.app.log.lines().join('\n')).not.toContain(DB);
				expect(rig.app.log.lines().join('\n')).toContain('auth failed for');
				// Done: the salt drawn once there.
				const finished = reporter.finish(outcome, {
					mode: 'fresh',
					rootVerified: true,
					ending: ENGINE_ENDING,
				});
				const doneFrame = await rig.frame();
				expect(doneFrame).toContain(SALT);
				expect(doneFrame.toLowerCase()).not.toContain(SECRETS.db.core);
				rig.setup.mockInput.pressEnter();
				await Promise.race([finished, Bun.sleep(3000)]);
				expect(rig.port.exits).toEqual([0]);
			});
			// No frame before the one-time display held the salt (and frames WERE taken).
			expect(framesBeforeSalt.length).toBeGreaterThanOrEqual(2);
			for (const frame of framesBeforeSalt) expect(frame).not.toContain(SALT);
			expect(rig.errors).toEqual([]);
		} finally {
			try {
				await rig.dispose();
			} catch {
				// the Done screen's close already destroyed the renderer
			}
		}
	});
});
