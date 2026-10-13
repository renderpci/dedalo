/**
 * THE PLAIN MODE'S TERMINAL AND PROMPTER (src/core/install/ui_plain/terminal.ts
 * + prompter.ts; terminal installer phase 2, 2026-10-12), on fake streams with
 * real raw-mode reading: what the operator types → what the question answers.
 *
 *  - an arrow / function key (a CSI or SS3 escape sequence) is swallowed WHOLE
 *    (the host-agent original let `[A` into the answer);
 *  - backspace erases a character; Ctrl-C, Ctrl-D and a SIGINT from outside
 *    abort the question (quit) and raw mode is ALWAYS restored;
 *  - text/choice: enter takes the shown default, `-` empties an optional
 *    field, an unknown choice is asked again, `back`/`quit` navigate;
 *  - confirm `[y/N]`/`[Y/n]`; an acknowledgement needs the word `yes` TYPED;
 *  - secret: hidden (never echoed), entered twice, three mismatches abort, an
 *    empty entry re-asked unless allowed, a control character refused, the
 *    policy list printed rule by rule (never the value);
 *  - multi: numbers, ranges, lists, codes toggle; /word filters, / clears;
 *    `list`, `more`; a locked option says why instead of toggling;
 *  - every printed string is sanitized; text wraps to the width.
 * The scripted prompter's contract (defaults, declined acknowledgements,
 * refused secrets) is covered too — the parity gates stand on it.
 */

import { describe, expect, test } from 'bun:test';
import {
	buildScreens,
	type Option,
	type Question,
	type Screen,
} from '../../src/core/install/screen_model.ts';
import {
	BACK,
	multiCommand,
	multiResult,
	multiState,
	pageLines,
	QUIT,
	SECRET_ATTEMPTS,
	scriptedInstallPrompter,
	ttyInstallPrompter,
} from '../../src/core/install/ui_plain/prompter.ts';
import { sanitizeLine, wrap, wrapWidth } from '../../src/core/install/ui_plain/terminal.ts';
import { autoTerminal, modelInput } from '../helpers/install_plain_script.ts';

/** A question of `kind` (the model's shape; only what the prompter reads matters). */
function question(kind: Question['kind'], extra: Partial<Question> = {}): Question {
	return {
		id: `zz.${kind}`,
		key: null,
		sets: [],
		kind,
		label: `Zz ${kind}`,
		description: 'a test question',
		value: undefined,
		default: '',
		answered: false,
		required: false,
		errors: [],
		...extra,
	};
}

function option(value: string, extra: Partial<Option> = {}): Option {
	return {
		value,
		label: value.toUpperCase(),
		description: '',
		group: null,
		selected: false,
		locked: false,
		marks: [],
		declares: [],
		external: false,
		...extra,
	};
}

/** A terminal that types `lines` (raw chunks, Enter appended) one per open prompt. */
function typing(lines: string[]) {
	const queue = [...lines];
	const terminal = autoTerminal(() => (queue.length === 0 ? null : (queue.shift() as string)));
	const prompter = ttyInstallPrompter({
		input: terminal.input,
		output: terminal.output,
		signals: terminal.signals,
	});
	return { terminal, prompter, queue };
}

/** Raw mode was entered and LEFT for every question (balanced, ends off). */
function expectRawRestored(raw: boolean[]): void {
	expect(raw.length).toBeGreaterThan(0);
	expect(raw.at(-1)).toBe(false);
	expect(raw.filter((mode) => mode).length).toBe(raw.filter((mode) => !mode).length);
}

describe('terminal — keys', () => {
	test('an arrow key (CSI) and a function key (SS3) are swallowed whole; backspace erases', async () => {
		const { terminal, prompter } = typing(['\x1b[Aab\x1bOPc\x7fd']);
		try {
			expect(await prompter.text(question('text'))).toBe('abd');
			expectRawRestored(terminal.input.raw);
			expect(terminal.output.text.includes('[A')).toBe(false);
		} finally {
			terminal.stop();
		}
	});

	test('Ctrl-C and Ctrl-D quit the question; raw mode restored', async () => {
		for (const key of ['\x03', '\x04']) {
			const { terminal, prompter } = typing([key]);
			try {
				expect(prompter.stopReason?.()).toBeNull();
				expect(await prompter.text(question('text'))).toBe(QUIT);
				expectRawRestored(terminal.input.raw);
				expect(terminal.output.text).toContain('aborted by operator');
				// The session ends INTERRUPTED (scripts/install.ts exits 130), not as a typed quit.
				expect(prompter.stopReason?.()).toBe('interrupted');
			} finally {
				terminal.stop();
			}
		}
	});

	test('a SIGINT from outside restores raw mode FIRST, then quits', async () => {
		const terminal = autoTerminal(() => {
			terminal.signals.fire();
			return null;
		});
		const prompter = ttyInstallPrompter({
			input: terminal.input,
			output: terminal.output,
			signals: terminal.signals,
		});
		try {
			expect(await prompter.secret(question('secret'))).toBe(QUIT);
			expectRawRestored(terminal.input.raw);
			expect(terminal.signals.listeners).toEqual([]);
			expect(prompter.stopReason?.()).toBe('interrupted');
		} finally {
			terminal.stop();
		}
	});

	test('not a terminal: every question quits, nothing is read', async () => {
		const { terminal, prompter } = typing(['x']);
		terminal.input.isTTY = false;
		const off = ttyInstallPrompter({ input: terminal.input, output: terminal.output });
		try {
			expect(off.interactive).toBe(false);
			expect(await off.text(question('text'))).toBe(QUIT);
			expect(terminal.input.raw).toEqual([]);
			expect(prompter.interactive).toBe(true);
		} finally {
			terminal.stop();
		}
	});
});

describe('prompter — text, choice, confirm, acknowledge', () => {
	test('text: enter takes the default; `-` empties an optional field; back / quit navigate', async () => {
		const { terminal, prompter } = typing(['', '-', '-', 'back', 'QUIT']);
		try {
			expect(await prompter.text(question('text', { default: 'localhost' }))).toBe('localhost');
			expect(await prompter.text(question('text', { default: 'x', emptyAllowed: true }))).toBe('');
			expect(await prompter.text(question('text', { default: 'x' }))).toBe('-');
			expect(await prompter.text(question('text'))).toBe(BACK);
			expect(await prompter.text(question('text'))).toBe(QUIT);
		} finally {
			terminal.stop();
		}
	});

	test("text: an answered question's errors and hint are shown; a refused value is not offered back", async () => {
		const { terminal, prompter } = typing(['']);
		try {
			const answer = await prompter.text(
				question('text', {
					value: '1x',
					default: 'plan',
					answered: true,
					errors: ["entity '1x' must start with a letter"],
					hint: 'suggested entity code: e_1x',
				}),
			);
			expect(answer).toBe('plan');
			expect(terminal.output.text).toContain("error: entity '1x' must start with a letter");
			expect(terminal.output.text).toContain('suggested entity code: e_1x');
		} finally {
			terminal.stop();
		}
	});

	test('choice: by number or value; an unknown one is asked again; enter keeps the current', async () => {
		const options = [option('official'), option('none')];
		const { terminal, prompter } = typing(['2', 'nope', 'OFFICIAL', '']);
		try {
			expect(await prompter.choice(question('choice', { options }))).toBe('none');
			expect(await prompter.choice(question('choice', { options }))).toBe('official');
			expect(terminal.output.text).toContain("'nope' is not one of the options");
			expect(await prompter.choice(question('choice', { options, value: 'none' }))).toBe('none');
		} finally {
			terminal.stop();
		}
	});

	test("choice: enter takes an EMPTY current value when '' is an option (media_access_mode's engine default)", async () => {
		const options = [option('', { label: 'Engine default' }), option('private')];
		const { terminal, prompter } = typing(['', '', '2']);
		try {
			expect(await prompter.choice(question('choice', { options, value: '' }))).toBe('');
			expect(terminal.output.text).toContain('[Engine default]');
			expect(terminal.output.text).not.toContain('is not one of the options');
			// Without '' among the options, an empty current still asks for a number.
			const strict = [option('official'), option('none')];
			expect(await prompter.choice(question('choice', { options: strict, value: '' }))).toBe(
				'none',
			);
			expect(terminal.output.text).toContain("'' is not one of the options");
		} finally {
			terminal.stop();
		}
	});

	test('confirm: [y/N] / [Y/n] by the default; acknowledge: only a typed yes accepts', async () => {
		const { terminal, prompter } = typing(['', '', 'y', 'maybe', 'n', 'y', 'yes please', 'yes']);
		try {
			expect(await prompter.confirm(question('confirm', { default: false }))).toBe(false);
			expect(await prompter.confirm(question('confirm', { default: true }))).toBe(true);
			expect(await prompter.confirm(question('confirm', { default: false }))).toBe(true);
			expect(await prompter.confirm(question('confirm', { default: true }))).toBe(false);
			expect(terminal.output.text).toContain('[y/N]');
			expect(terminal.output.text).toContain('[Y/n]');
			expect(terminal.output.text).toContain('answer y or n');
			expect(await prompter.acknowledge(question('acknowledge'))).toBe(false);
			expect(await prompter.acknowledge(question('acknowledge'))).toBe(false);
			expect(await prompter.acknowledge(question('acknowledge'))).toBe(true);
		} finally {
			terminal.stop();
		}
	});
});

describe('prompter — secrets', () => {
	const SECRET = 'Hidden-Value-93';

	test('hidden and entered twice: never echoed', async () => {
		const { terminal, prompter } = typing([SECRET, SECRET]);
		try {
			expect(await prompter.secret(question('secret'))).toBe(SECRET);
			expect(terminal.output.text.includes(SECRET)).toBe(false);
			expect(terminal.output.text).toContain('again (hidden)');
		} finally {
			terminal.stop();
		}
	});

	test(`${SECRET_ATTEMPTS} mismatching pairs abort (quit)`, async () => {
		const lines = Array.from({ length: SECRET_ATTEMPTS }, (_v, i) => [
			SECRET,
			`${SECRET}${i}`,
		]).flat();
		const { terminal, prompter } = typing(lines);
		try {
			expect(await prompter.secret(question('secret'))).toBe(QUIT);
			expect(terminal.output.text).toContain(`did not match ${SECRET_ATTEMPTS} times`);
			expectRawRestored(terminal.input.raw);
			// Refused (exit 1), not interrupted: nobody pressed Ctrl-C.
			expect(prompter.stopReason?.()).toBe('refused');
			expect(terminal.output.text).not.toContain('aborted by operator');
		} finally {
			terminal.stop();
		}
	});

	test('empty: re-asked unless allowed; allowed → answered once, no repeat', async () => {
		const { terminal, prompter } = typing(['', SECRET, SECRET, '']);
		try {
			expect(await prompter.secret(question('secret'))).toBe(SECRET);
			expect(terminal.output.text).toContain('it cannot be empty');
			expect(await prompter.secret(question('secret', { emptyAllowed: true }))).toBe('');
		} finally {
			terminal.stop();
		}
	});

	test('the policy feedback: each rule ok/missing after the first entry, re-asked until it passes, never the value', async () => {
		const feedback = (password: string) => ({
			rules: [
				{ id: 'length', text: 'at least 12 characters', ok: password.length >= 12 },
				{ id: 'digit', text: 'a digit', ok: /\d/.test(password) },
			],
			errors:
				password.length >= 12 && /\d/.test(password)
					? []
					: ['root password does not meet the password policy'],
		});
		const { terminal, prompter } = typing(['short', SECRET, SECRET]);
		try {
			expect(await prompter.secret(question('secret'), feedback)).toBe(SECRET);
			expect(terminal.output.text).toMatch(/missing\s+at least 12 characters/);
			expect(terminal.output.text).toMatch(/ok\s+at least 12 characters/);
			expect(terminal.output.text).toContain('does not meet the policy; type another');
			expect(terminal.output.text.includes('short')).toBe(false);
			expect(terminal.output.text.includes(SECRET)).toBe(false);
		} finally {
			terminal.stop();
		}
	});
});

describe('prompter — the multi-select', () => {
	const options = Array.from({ length: 30 }, (_v, i) =>
		option(`t${String(i + 1).padStart(2, '0')}`, { group: i < 15 ? 'Alpha' : 'Beta' }),
	);

	test('numbers, ranges, lists and codes toggle; /word filters; / clears; more pages; list shows all', () => {
		const state = multiState(question('multi', { options }));
		const said: string[] = [];
		const say = (line: string) => said.push(line);
		expect(multiCommand(state, '3', say)).toBe('show');
		expect(multiCommand(state, '5-7', say)).toBe('show');
		expect(multiCommand(state, '9 10,11', say)).toBe('show');
		expect(multiCommand(state, 'T20', say)).toBe('show');
		expect(multiResult(state)).toEqual(['t03', 't05', 't06', 't07', 't09', 't10', 't11', 't20']);
		expect(multiCommand(state, '3', say)).toBe('show');
		expect(multiResult(state)).not.toContain('t03');
		expect(multiCommand(state, '/beta', say)).toBe('show');
		expect(pageLines(state, false).filter((line) => /\bt\d\d\b/.test(line)).length).toBe(15);
		expect(multiCommand(state, '/', say)).toBe('show');
		expect(pageLines(state, false).join('\n')).toContain("10 more: 'more'");
		multiCommand(state, 'more', say);
		expect(pageLines(state, false).join('\n')).toContain('t30');
		expect(pageLines(state, true).filter((line) => /\bt\d\d\b/.test(line)).length).toBe(30);
		expect(multiCommand(state, 'gibberish', say)).toBe('continue');
		expect(said.at(-1)).toContain('is not a number, a code or a command');
		expect(multiCommand(state, '', say)).toBe('done');
		expect(multiCommand(state, 'next', say)).toBe('done');
		expect(multiCommand(state, 'back', say)).toBe(BACK);
	});

	test('a locked option says WHY instead of toggling', () => {
		const locked = option('tlb', {
			selected: true,
			locked: true,
			marks: [{ kind: 'needed_by', by: ['tla'], mandatory: true }],
		});
		const state = multiState(
			question('multi', { options: [option('tla', { selected: true }), locked] }),
		);
		const said: string[] = [];
		multiCommand(state, 'tlb', (line) => said.push(line));
		expect(multiResult(state)).toContain('tlb');
		expect(said).toEqual(['tlb is needed by tla and stays installed']);
	});

	test('ticking an option ticks what it declares, transitively; a mandatory one cannot be unticked; an optional decline is respected', () => {
		const declares = (...tlds: [string, boolean][]) =>
			tlds.map(([tld, mandatory]) => ({ tld, mandatory }));
		const state = multiState(
			question('multi', {
				options: [
					option('tla', { declares: declares(['tlb', false], ['tlm', true]) }),
					option('tlb', { declares: declares(['tlc', false]) }),
					option('tlc'),
					option('tlm'),
				],
			}),
		);
		const said: string[] = [];
		const say = (line: string) => said.push(line);
		multiCommand(state, 'tla', say);
		expect(multiResult(state)).toEqual(['tla', 'tlb', 'tlm', 'tlc']);
		// The mandatory dependency stays while its declarer is ticked.
		multiCommand(state, 'tlm', say);
		expect(multiResult(state)).toContain('tlm');
		expect(said.at(-1)).toBe('tlm is needed by tla and stays installed');
		// Decline the optional one, untick and re-tick the declarer: the decline holds.
		multiCommand(state, 'tlb', say);
		multiCommand(state, 'tla', say);
		multiCommand(state, 'tla', say);
		expect(multiResult(state)).not.toContain('tlb');
		expect(multiResult(state)).toContain('tlm');
		// Ticking the declined one itself again is honoured.
		multiCommand(state, 'tlb', say);
		expect(multiResult(state)).toContain('tlb');
	});

	test('on a terminal: toggles then enter return the selection in the order made', async () => {
		const { terminal, prompter } = typing(['2', '1', '']);
		try {
			const answer = await prompter.multi(question('multi', { options: options.slice(0, 3) }));
			expect(answer).toEqual(['t02', 't01']);
			expect(terminal.output.text).toContain('[x]');
		} finally {
			terminal.stop();
		}
	});
});

describe('output — sanitized and wrapped', () => {
	test('escape sequences and controls are removed; a tab is one space', () => {
		expect(sanitizeLine('a\x1b[31mb\x1b]0;t\x07c\td\x9be')).toBe('abc de');
	});

	test('a screen header with hostile text prints inert', () => {
		const { terminal, prompter } = typing([]);
		try {
			prompter.screen({
				id: 'ontologies',
				index: 2,
				count: 9,
				title: 'Ontologies',
				description: 'from \x1b[2Jserver',
				questions: [],
				notices: [{ level: 'warn', text: 'name \x1b]8;;http://x\x07link' }],
				help: [],
			});
			expect(terminal.output.text.includes('\x1b')).toBe(false);
			expect(terminal.output.text).toContain('Step 2 of 9: Ontologies');
		} finally {
			terminal.stop();
		}
	});

	test('wrap: the width is clamped 40-100 (80 unknown); a fitting line is kept byte for byte', () => {
		expect(wrapWidth(undefined)).toBe(80);
		expect(wrapWidth(20)).toBe(40);
		expect(wrapWidth(300)).toBe(100);
		expect(wrap('  aligned   columns', 40)).toEqual(['  aligned   columns']);
		const lines = wrap(`  ${'word '.repeat(20).trim()}`, 40, '  ');
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
		expect(lines[1]?.startsWith('    ')).toBe(true);
	});
});

describe('the scripted prompter (the parity gates stand on it)', () => {
	test('unlisted text/choice/multi/confirm take the default; an unlisted acknowledgement declines; an unlisted secret quits unless empty is allowed', async () => {
		const prompter = scriptedInstallPrompter({ answers: {} });
		expect(await prompter.text(question('text', { default: 'd' }))).toBe('d');
		expect(await prompter.choice(question('choice', { default: 'c' }))).toBe('c');
		expect(
			await prompter.multi(
				question('multi', { options: [option('a', { selected: true }), option('b')] }),
			),
		).toEqual(['a']);
		expect(await prompter.confirm(question('confirm', { default: true }))).toBe(true);
		expect(await prompter.acknowledge(question('acknowledge'))).toBe(false);
		expect(await prompter.secret(question('secret'))).toBe(QUIT);
		expect(await prompter.secret(question('secret', { emptyAllowed: true }))).toBe('');
		expect(prompter.asked).toEqual([
			'zz.text',
			'zz.choice',
			'zz.multi',
			'zz.confirm',
			'zz.acknowledge',
			'zz.secret',
			'zz.secret',
		]);
	});

	test('scripted values, <back>/<quit>, a refused secret (control character, policy) quits', async () => {
		const prompter = scriptedInstallPrompter({
			answers: { 'zz.text': '<back>', 'zz.choice': 'x', 'zz.acknowledge': 'yes' },
			secrets: { 'zz.secret': 'a\nb' },
			review: ['install'],
		});
		expect(await prompter.text(question('text'))).toBe(BACK);
		expect(await prompter.choice(question('choice'))).toBe('x');
		expect(await prompter.acknowledge(question('acknowledge'))).toBe(true);
		expect(await prompter.secret(question('secret'))).toBe(QUIT);
		const reviewScreen = buildScreens(modelInput({ route: 'developer' })).find(
			(screen) => screen.id === 'review',
		) as Screen;
		const view = {
			screen: reviewScreen,
			lines: [],
			canInstall: true,
			editable: [],
			command: '',
			errors: [],
		};
		expect(await prompter.review(view)).toBe('install');
		expect(await prompter.review(view)).toBe('quit');
		expect(prompter.asked.filter((id) => id === 'review')).toEqual(['review', 'review']);
	});
});
