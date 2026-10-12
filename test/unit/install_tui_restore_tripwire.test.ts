/**
 * INSTALL FULL-SCREEN RESTORE TRIPWIRE — whatever way the full-screen
 * installer ends, the operator gets their terminal back (terminal installer
 * phase 3, 2026-10-12; `src/core/install/ui/lifecycle.ts`, `ui/app.ts`,
 * `scripts/install.ts`): quit, Ctrl-C, Ctrl-D, SIGINT, SIGTERM, an uncaught
 * error, a refusal after the UI opened, Ctrl-C during an install step, the Done
 * screen — each exits with the plain mode's code, and leaves the terminal as
 * it found it.
 *
 * WHAT IS MEASURED (outcomes, on a REAL pseudo-terminal — Bun.spawn
 * `terminal` — never on the code's spelling):
 *  (a) per exit path, the child (test/fixtures/install_tui_restore_fixture.ts,
 *      the UI opened exactly as scripts/install.ts opens it) is run as
 *      `sh -c 'bun fixture MODE; stty -a'`, and from the PTY byte stream:
 *       - the exit code is the path's (0 / 1 / 130 / 143), within 5 s of the
 *         key or signal that ended it;
 *       - EVERY terminal mode the run turned on is turned off after its last
 *         enable (the alternate screen ?1049, bracketed paste ?2004, focus
 *         ?1004, ?2031, the kitty keyboard push `>…u` / pop `<u`,
 *         modifyOtherKeys `>4;…m`), the last cursor-visibility sequence shows
 *         the cursor, and no mouse tracking (?1000/?1002/?1003/?1006) is ever
 *         enabled (the terminal's own selection copies the Done screen);
 *       - TERMIOS after the child: `stty -a` reports `icanon`, `isig` and
 *         `echo` (a measurement of the tty, not of a JS flag) — and the
 *         fixture's last `exit` listener saw stdin out of raw mode;
 *       - the path's message (the failure, the interrupt's resume hint, the
 *         uncaught error) is printed AFTER the last ?1049l — on the main screen,
 *         where the operator can read it.
 *  (b) POSITIVE CONTROL: SIGKILL with the renderer up (nothing can restore) —
 *      the same checks report the alternate screen left on and the tty left
 *      raw, so they are not vacuous.
 *  (c) THE REAL CLI (scripts/install.ts, scratch private dir): Ctrl-Q + y at
 *      the route question exits 0 with the terminal restored; started with
 *      OpenTUI's OTUI_STDIN_LOG (which appends every raw stdin byte — a typed
 *      password — to a file) and OTUI_DEBUG set, a typed sentinel reaches no
 *      file: the installer clears those switches. CONTROL: the fixture, which
 *      does NOT clear them, does write the sentinel there — the switch is real.
 *  (d) `--delay-start` (an OpenTUI switch that stalls the renderer) is refused
 *      by the installer's argument parser before any UI opens.
 *
 * Writes only mkdtemp scratch (removed in afterAll); no database; the probes
 * and the step table are fakes.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { answersFromCliArgs } from '../../src/core/install/install_plan.ts';

const ROOT = resolve(import.meta.dir, '../..');
const FIXTURE = join(ROOT, 'test/fixtures/install_tui_restore_fixture.ts');
const CLI = join(ROOT, 'scripts/install.ts');
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_tui_restore_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

const EXIT_MARK = 'FIXTURE_EXIT=';
/** How long a path may take to end once its key or signal was sent. */
const END_WITHIN_MS = 5000;
/** How long the UI may take to come up. */
const READY_WITHIN_MS = 20000;

// The terminal sequences read from the stream (built from strings: a regex literal with
// brackets and slashes inside a class desyncs the census tracker's bracket count).
const ESC = '\x1b';
const DEC_MODE = new RegExp(`${ESC}\\[\\?([0-9;]+)([hl])`, 'g');
const KITTY_PUSH = new RegExp(`${ESC}\\[>[0-9]*u`, 'g');
const KITTY_POP = new RegExp(`${ESC}\\[<[0-9]*u`, 'g');
const OTHER_KEYS = new RegExp(`${ESC}\\[>4;([0-9])m`, 'g');
const ANY_ESCAPE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^\u0007]*\u0007|${ESC}.`, 'g');
const SQ = "'";
const SQ_ESCAPED = "'\\''";

// ── the PTY run ──────────────────────────────────────────────────────────────

interface PtyRun {
	output(): string;
	write(text: string): void;
	signal(name: 'SIGINT' | 'SIGTERM'): void;
	waitFor(predicate: () => boolean, within: number, what: string): Promise<void>;
	/** The child's exit code and the stty report (after it ended). */
	ended(): Promise<{ code: number; stream: string; stty: string; endedInMs: number }>;
	side: string;
}

/** A bun child under a 104×30 PTY, followed by `stty -a` in the same terminal. */
function ptyRun(argv: readonly string[], env: Record<string, string> = {}): PtyRun {
	const dir = mkdtempSync(join(scratchRoot, 'run_'));
	const side = join(dir, 'side');
	let text = '';
	const decoder = new TextDecoder();
	const quoted = [process.execPath, ...argv.map((arg) => arg.replace('{side}', side))]
		.map((arg) => `'${arg.split(SQ).join(SQ_ESCAPED)}'`)
		.join(' ');
	// In the FOREGROUND (a background job would read /dev/null); the child names its pid in <side>.ready.
	const proc = Bun.spawn(['sh', '-c', `${quoted}; code=$?; stty -a; echo "${EXIT_MARK}$code"`], {
		cwd: ROOT,
		env: {
			...Bun.env,
			TERM: 'xterm-256color',
			DEDALO_INSTALL_PRIVATE_DIR: join(dir, 'private'),
			DEDALO_TS_STATE_PATH: join(dir, 'private', 'ts_state.json'),
			...env,
		},
		terminal: {
			cols: 104,
			rows: 30,
			data: (_terminal: unknown, chunk: Uint8Array) => {
				text += decoder.decode(chunk, { stream: true });
			},
		},
	});
	let sentAt = Date.now();
	const waitFor = async (predicate: () => boolean, within: number, what: string) => {
		const until = Date.now() + within;
		while (!predicate()) {
			if (Date.now() > until)
				throw new Error(`timed out waiting for ${what}:\n${JSON.stringify(text.slice(-600))}`);
			await Bun.sleep(25);
		}
	};
	const childPid = (): number => Number(readFileSync(`${side}.ready`, 'utf8'));
	return {
		side,
		output: () => text,
		write: (keys) => {
			sentAt = Date.now();
			(proc as unknown as { terminal: { write(data: string): void } }).terminal.write(keys);
		},
		signal: (name) => {
			sentAt = Date.now();
			process.kill(childPid(), name);
		},
		waitFor,
		ended: async () => {
			await waitFor(
				() => text.includes(EXIT_MARK) && /=\d+\r?\n/.test(text.slice(text.lastIndexOf(EXIT_MARK))),
				30000,
				'the exit mark',
			);
			const endedInMs = Date.now() - sentAt;
			await proc.exited;
			const at = text.lastIndexOf(EXIT_MARK);
			const code = Number(/=(\d+)/.exec(text.slice(at))?.[1]);
			const sttyAt = text.lastIndexOf('speed ');
			return { code, stream: text.slice(0, sttyAt), stty: text.slice(sttyAt, at), endedInMs };
		},
	};
}

/** The fixture in `mode`, with the UI up. */
async function fixture(mode: string, env: Record<string, string> = {}): Promise<PtyRun> {
	const run = ptyRun(['run', FIXTURE, mode, '{side}'], env);
	await run.waitFor(() => existsSync(`${run.side}.ready`), READY_WITHIN_MS, `${mode} ready`);
	await Bun.sleep(150);
	return run;
}

// ── the checks ───────────────────────────────────────────────────────────────

/** DEC private modes the run may leave on: none (2027 is a query-only mode OpenTUI never resets). */
const LEFT_ON_OK: ReadonlySet<string> = new Set(['2027', '25']);
const MOUSE_MODES = ['1000', '1002', '1003', '1006', '1015'];

/** Every way the stream leaves the terminal changed; [] = restored. */
function terminalLeftChanged(stream: string): string[] {
	const problems: string[] = [];
	const lastOf = new Map<string, { on: number; off: number }>();
	for (const match of stream.matchAll(DEC_MODE)) {
		for (const mode of (match[1] as string).split(';')) {
			const seen = lastOf.get(mode) ?? { on: -1, off: -1 };
			if (match[2] === 'h') seen.on = match.index;
			else seen.off = match.index;
			lastOf.set(mode, seen);
		}
	}
	for (const [mode, seen] of lastOf) {
		if (MOUSE_MODES.includes(mode) && seen.on >= 0) problems.push(`mouse mode ?${mode} enabled`);
		if (!LEFT_ON_OK.has(mode) && seen.on > seen.off) problems.push(`?${mode} left on`);
	}
	const cursor = lastOf.get('25');
	if (cursor !== undefined && cursor.off > cursor.on) problems.push('cursor left hidden');
	if (!lastOf.has('1049')) problems.push('never entered the alternate screen (vacuous)');
	const pushes = [...stream.matchAll(KITTY_PUSH)].map((m) => m.index);
	const pops = [...stream.matchAll(KITTY_POP)].map((m) => m.index);
	if (pushes.length > 0 && (pops.at(-1) ?? -1) < (pushes.at(-1) ?? 0))
		problems.push('kitty keyboard left pushed');
	const other = [...stream.matchAll(OTHER_KEYS)];
	if (other.length > 0 && other.at(-1)?.[1] !== '0') problems.push('modifyOtherKeys left on');
	return problems;
}

/** The local flags of a `stty -a` report. */
function sttyFlags(stty: string): Set<string> {
	return new Set(stty.split(/\s+/).filter((token) => /^-?[a-z]+$/.test(token)));
}

/** The text printed after the alternate screen was left (the main screen), escapes removed. */
function afterRestore(stream: string): string {
	const at = stream.lastIndexOf('\x1b[?1049l');
	return stream.slice(at).replace(ANY_ESCAPE, '');
}

/** Every restore check for one ended run. */
async function expectRestored(
	run: PtyRun,
	expectedCode: number,
	message?: string | RegExp,
): Promise<void> {
	const { code, stream, stty, endedInMs } = await run.ended();
	expect(code, stream.slice(-400)).toBe(expectedCode);
	expect(endedInMs).toBeLessThan(END_WITHIN_MS);
	expect(terminalLeftChanged(stream)).toEqual([]);
	const flags = sttyFlags(stty);
	for (const flag of ['icanon', 'isig', 'echo'])
		expect(flags.has(flag), `${flag} in ${stty}`).toBe(true);
	expect(JSON.parse(readFileSync(`${run.side}.exit`, 'utf8'))).toEqual({ isRaw: false });
	if (message !== undefined) {
		const tail = afterRestore(stream);
		if (typeof message === 'string') expect(tail).toContain(message);
		else expect(tail).toMatch(message);
	}
}

const ENTER = '\r';
const CTRL_C = '\x03';
const CTRL_D = '\x04';
const CTRL_Q = '\x11';

/** Past the Welcome: the route question is asked (the frame names it). */
async function toRouteQuestion(run: PtyRun): Promise<void> {
	run.write(ENTER);
	await run.waitFor(() => run.output().includes('Install type'), 10000, 'the route question');
	await Bun.sleep(100);
}

// ── (a) every exit path ──────────────────────────────────────────────────────

describe('every exit path restores the terminal (a)', () => {
	test('q at the Welcome: exit 0', async () => {
		const run = await fixture('walk');
		run.write('q');
		await expectRestored(run, 0, 'nothing was installed');
	}, 60000);

	test('Ctrl-C at a question: exit 130', async () => {
		const run = await fixture('walk');
		await toRouteQuestion(run);
		run.write(CTRL_C);
		await expectRestored(run, 130, 'nothing was installed');
	}, 60000);

	test('Ctrl-D at a question: exit 130', async () => {
		const run = await fixture('walk');
		await toRouteQuestion(run);
		run.write(CTRL_D);
		await expectRestored(run, 130);
	}, 60000);

	test('Ctrl-Q then y at a question: a chosen quit, exit 0', async () => {
		const run = await fixture('walk');
		await toRouteQuestion(run);
		run.write(CTRL_Q);
		await Bun.sleep(100);
		run.write('y');
		await expectRestored(run, 0);
	}, 60000);

	test('an external SIGINT during the walk: exit 130', async () => {
		const run = await fixture('walk');
		await toRouteQuestion(run);
		run.signal('SIGINT');
		await expectRestored(run, 130);
	}, 60000);

	test('an external SIGTERM during the walk: exit 143', async () => {
		const run = await fixture('walk');
		await toRouteQuestion(run);
		run.signal('SIGTERM');
		await expectRestored(run, 143);
	}, 60000);

	test('an uncaught error after the UI opened: exit 1, its message on the main screen', async () => {
		const run = await fixture('throw');
		await expectRestored(run, 1, 'fixture boom after the UI opened');
	}, 60000);

	test('a refusal after the UI opened (scripts/install.ts fail): exit 1, the message visible', async () => {
		const run = await fixture('fail');
		await expectRestored(run, 1, 'install failed: fixture refusal');
	}, 60000);

	test('the Done screen, then Enter: exit 0', async () => {
		const run = await fixture('done');
		await run.waitFor(() => run.output().includes('installed'), 10000, 'the Done card');
		await Bun.sleep(100);
		run.write(ENTER);
		await expectRestored(run, 0);
	}, 60000);

	test('Ctrl-C during a blocking install step: exit 130, the interrupt and its resume hint after the restore', async () => {
		const run = await fixture('install');
		await run.waitFor(() => existsSync(`${run.side}.blocking`), 15000, 'the blocking step');
		await Bun.sleep(150);
		run.write(CTRL_C);
		await expectRestored(run, 130, /interrupted[\s\S]*--resume/);
	}, 60000);
});

// ── (b) positive control ─────────────────────────────────────────────────────

describe('the checks are not vacuous (b)', () => {
	test('SIGKILL with the renderer up: the alternate screen left on, the tty left raw', async () => {
		const run = await fixture('sigkill');
		const { code, stream, stty } = await run.ended();
		expect(code).toBe(137);
		expect(terminalLeftChanged(stream)).toContain('?1049 left on');
		expect(sttyFlags(stty).has('-icanon')).toBe(true);
		expect(existsSync(`${run.side}.exit`)).toBe(false);
	}, 60000);

	test('the stream checks flag a planted mouse enable, a hidden cursor and a kitty push', () => {
		const base = '\x1b[?1049h\x1b[?25l…\x1b[?1049l\x1b[?25h';
		expect(terminalLeftChanged(base)).toEqual([]);
		expect(terminalLeftChanged(`${base}\x1b[?1002h`)).toContain('mouse mode ?1002 enabled');
		expect(terminalLeftChanged(`${base}\x1b[?25l`)).toContain('cursor left hidden');
		expect(terminalLeftChanged(`${base}\x1b[>1u`)).toContain('kitty keyboard left pushed');
		expect(terminalLeftChanged(`${base}\x1b[?2004h`)).toContain('?2004 left on');
		expect(terminalLeftChanged('plain text')).toContain(
			'never entered the alternate screen (vacuous)',
		);
	});
});

// ── (c) the real CLI ─────────────────────────────────────────────────────────

const SENTINEL = 'zqxsentinelwq';

describe('the real installer (c)', () => {
	test('Ctrl-Q + y at the route question: exit 0, restored; OpenTUI stdin logging is cleared', async () => {
		const logPath = join(scratchRoot, 'cli_stdin.log');
		const run = ptyRun(['run', CLI], { OTUI_STDIN_LOG: logPath, OTUI_DEBUG: '1' });
		await run.waitFor(() => run.output().includes('\x1b[?1049h'), READY_WITHIN_MS, 'the CLI UI');
		await run.waitFor(() => run.output().includes('Welcome'), 10000, 'the Welcome');
		await Bun.sleep(150);
		await toRouteQuestion(run);
		run.write(SENTINEL);
		await Bun.sleep(100);
		run.write(CTRL_Q);
		await Bun.sleep(100);
		run.write('y');
		const { code, stream, stty } = await run.ended();
		expect(code).toBe(0);
		expect(terminalLeftChanged(stream)).toEqual([]);
		expect(sttyFlags(stty).has('icanon')).toBe(true);
		expect(afterRestore(stream)).toContain('nothing was installed');
		const logged = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
		expect(logged).not.toContain(SENTINEL);
	}, 90000);

	test('CONTROL: without the clearing (the fixture), OTUI_STDIN_LOG records the typed bytes', async () => {
		const logPath = join(scratchRoot, 'fixture_stdin.log');
		const run = await fixture('plain_env', { OTUI_STDIN_LOG: logPath });
		await toRouteQuestion(run);
		run.write(SENTINEL);
		await Bun.sleep(150);
		run.write(CTRL_C);
		await run.ended();
		expect(existsSync(logPath) ? readFileSync(logPath, 'utf8') : '').toContain(SENTINEL);
	}, 60000);
});

// ── (d) --delay-start ────────────────────────────────────────────────────────

describe('OpenTUI switches on the command line (d)', () => {
	test('--delay-start is refused by the parser (the interactive install exits 1 before any UI)', () => {
		expect(answersFromCliArgs(['--delay-start']).errors.length).toBeGreaterThan(0);
	});
});
