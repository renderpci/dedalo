/**
 * THE FULL-SCREEN INSTALLER ON A REAL TERMINAL, ONE EXIT PATH AT A TIME — the
 * child process test/unit/install_tui_restore_tripwire.test.ts runs under a
 * PTY (Bun.spawn `terminal`). It opens the UI exactly as scripts/install.ts
 * does (src/core/install/tui_loader.ts openFullScreen on the real stdin and
 * stdout — the real renderer, the real lifecycle on the real process) and
 * then takes the path its MODE argument names; the gate types the keys or
 * sends the signals and reads the PTY's byte stream.
 *
 *   argv: <MODE> <SIDE_FILE_PREFIX>
 *   writes: <prefix>.ready   once the UI is up: its pid (the gate starts typing / signals it)
 *           <prefix>.blocking once a blocking install step started
 *           <prefix>.exit    from the LAST `exit` listener: {"isRaw": …}
 *
 * MODES: walk (Welcome → the route question; quit / interrupt by keys or
 * signals), throw (an uncaught error while the Welcome waits), fail (the
 * scripts/install.ts `fail` path: exitNow(1, message)), done (the Done card,
 * Enter closes), install (a real executeInstall over a fake step table whose
 * step blocks: Ctrl-C stops it), sigkill (POSITIVE CONTROL: SIGKILL with the
 * renderer up — nothing can restore), plain_env (opens the UI WITHOUT clearing
 * OpenTUI's environment switches — the control for OTUI_STDIN_LOG).
 *
 * Not a test file: run only by the gate, never imported by src/.
 */

import { writeFileSync } from 'node:fs';
import { executeInstall } from '../../src/core/install/executor.ts';
import { runInteractiveInstall } from '../../src/core/install/install_session.ts';
import { openFullScreen, type TuiFrontEnd } from '../../src/core/install/tui_loader.ts';
import { fakeHost, fakePlan, fakeTable } from '../helpers/install_fake_executor.ts';
import { fakeProbes, thesaurusOffer } from '../helpers/install_plain_script.ts';

const [mode = 'walk', side = '/dev/null'] = Bun.argv.slice(2);

const opened = await openFullScreen({
	stdin: process.stdin,
	stdout: process.stdout,
	noColor: false,
	version: '7.0.0-fixture',
});
if (opened.kind !== 'tui') {
	process.stderr.write(`fixture: no UI (${opened.reason})\n`);
	process.exit(3);
}
const front: TuiFrontEnd = opened.front;
// Registered AFTER the UI (so after the renderer's and the lifecycle's exit hooks): what the
// terminal was left as when the process ended.
process.on('exit', () => {
	writeFileSync(`${side}.exit`, JSON.stringify({ isRaw: process.stdin.isRaw === true }));
});
writeFileSync(`${side}.ready`, String(process.pid));

/** scripts/install.ts quitCode. */
const quitCode = (reason: string | undefined): number =>
	reason === 'interrupted' ? 130 : reason === 'refused' ? 1 : 0;

async function walk(): Promise<never> {
	const result = await runInteractiveInstall({
		prompter: front.prompter,
		probes: fakeProbes(),
		priorEnv: {},
		thesauri: thesaurusOffer(),
		host: {},
		givenSecrets: {},
		unfinished: null,
		version: '7.0.0-fixture',
	});
	const code = result.kind === 'quit' ? quitCode(result.reason) : 0;
	return front.close(code, ['nothing was installed']);
}

async function done(): Promise<void> {
	front.reporter.begin?.([{ id: 'test_db_connection', label: 'Database reachable' }]);
	await front.reporter.finish(
		{ exitCode: 0, result: 'complete', message: null, failedStep: null, hint: [] },
		{ mode: 'fresh', rootVerified: true },
	);
}

/** A real executeInstall whose ontology step blocks until the process is stopped. */
async function install(): Promise<void> {
	const { plan, planFile } = fakePlan();
	front.reporter.prepare?.();
	front.reporter.begin?.(plan.steps.map((id) => ({ id, label: `fake ${id}` })));
	const outcome = await executeInstall(
		{ mode: 'fresh', planFile, plan, secrets: { root_password: 'Mosaic-Kestrel-Harbor-47' } },
		front.reporter.io,
		{
			table: fakeTable([], {
				install_ontologies: {
					run: async () => {
						writeFileSync(`${side}.blocking`, '');
						await Bun.sleep(600_000);
						return { ok: true, msg: 'never' };
					},
				},
			}),
			host: fakeHost().host,
		},
	);
	await front.reporter.finish(outcome, { mode: 'fresh', rootVerified: false });
}

const MODES: Record<string, () => unknown> = {
	walk,
	plain_env: walk,
	done,
	install,
	throw: () => {
		setTimeout(() => {
			throw new Error('fixture boom after the UI opened');
		}, 300);
	},
	fail: () => {
		setTimeout(() => front.exitNow(1, ['✖ install failed: fixture refusal']), 300);
	},
	sigkill: () => {
		setTimeout(() => process.kill(process.pid, 'SIGKILL'), 300);
	},
};

await (MODES[mode] ?? walk)();
