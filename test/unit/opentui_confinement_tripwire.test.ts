/**
 * OPENTUI CONFINEMENT TRIPWIRE — the terminal UI library (`@opentui/core`, a
 * pre-1.0 native package per platform) belongs to the INSTALLER's full-screen
 * front end and nowhere else (terminal installer phase 3, 2026-10-12;
 * `src/core/install/ui/`, `src/core/install/tui_loader.ts`).
 *
 * WHY. The server must not load (or fail to load) a native terminal library on
 * a request; the headless installer (CI, --answers, --resume) must run where
 * the native package is missing; and an unpinned pre-1.0 dependency can break
 * the UI on any minor release.
 *
 * WHAT IS MEASURED (outcomes):
 *  (a) SOURCE: over every source file of src/, tools/ and scripts/ (the
 *      registered write-path lister — > 700 files), a module specifier
 *      starting `@opentui/` — static import, re-export, dynamic import(),
 *      require() — appears only under src/core/install/ui/. Controls: each
 *      specifier form, planted in a synthetic source, is flagged.
 *  (b) THE SERVER: its import closure (test/helpers/request_path_closure.ts,
 *      > 500 modules; static, side-effect and dynamic edges) rooted at the
 *      two server tables AND every tools/<tool>/server module (loaded by a
 *      computed specifier the walk cannot follow) holds no
 *      src/core/install/ui/ module and not the loader. CONTROL: a planted
 *      side-effect-only import of ui/app.ts is an edge.
 *  (c) THE INSTALLER: scripts/install.ts reaches ui/app.ts ONLY through the
 *      dynamic import (the closure with dynamic edges holds it, the static one
 *      does not); and spawned HEADLESS (`--list-langs`) with a preload that
 *      makes every resolution of `@opentui/*`, the loader and `install/ui/`
 *      THROW (any import form) it exits 0 — the headless path never loads them. CONTROL: the same preload under a
 *      terminal makes the interactive installer fall back to the plain mode
 *      with one line saying why.
 *  (d) THE PIN: package.json pins `@opentui/core` EXACTLY (no range, tag or
 *      URL — pre-1.0: a minor release may break the API), bun.lock resolves it
 *      to that version, and the lock carries the native package of every
 *      platform the installer targets (darwin arm64/x64, linux arm64/x64, glibc
 *      and musl) at that version.
 *  (e) THE LOADER never throws: an import that fails, or a UI whose opening
 *      throws, answers `{kind:'plain', reason: <first line>}`.
 *
 * DB-FREE. The spawns use a scratch private dir (mkdtemp, removed).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { openFullScreen, type TuiOptions } from '../../src/core/install/tui_loader.ts';
import {
	directImports,
	REPO_ROOT,
	REQUEST_PATH_ROOTS,
	reachableModules,
} from '../helpers/request_path_closure.ts';
import { WRITE_PATH_CORPUS_FLOOR, writePathSourceFiles } from '../helpers/write_path_corpus.ts';

const UI_DIR = 'src/core/install/ui/';
const LOADER = 'src/core/install/tui_loader.ts';
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_opentui_confinement_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

/** Every `@opentui/…` module specifier in `source` (any import form). */
function opentuiSpecifiers(source: string): string[] {
	const forms = [
		/\bfrom\s*['"](@opentui\/[^'"]*)['"]/g,
		/\bimport\s*['"](@opentui\/[^'"]*)['"]/g,
		/\bimport\s*\(\s*['"`](@opentui\/[^'"`]*)['"`]\s*\)/g,
		/\brequire\s*\(\s*['"`](@opentui\/[^'"`]*)['"`]\s*\)/g,
	];
	return forms.flatMap((form) => [...source.matchAll(form)].map((match) => match[1] as string));
}

const rel = (file: string): string => file.slice(REPO_ROOT.length + 1);

// ── (a) source ───────────────────────────────────────────────────────────────

describe('@opentui is imported only by the installer UI (a)', () => {
	const files = writePathSourceFiles();
	const importers = files.filter(
		(file) => opentuiSpecifiers(readFileSync(join(REPO_ROOT, file), 'utf8')).length > 0,
	);

	test('the walk is the whole source tree, and the UI does import it', () => {
		expect(files.length).toBeGreaterThan(WRITE_PATH_CORPUS_FLOOR);
		expect(files.some((file) => file.startsWith('scripts/'))).toBe(true);
		expect(files.some((file) => file.startsWith('tools/'))).toBe(true);
		expect(importers.length).toBeGreaterThanOrEqual(3);
		expect(importers).toContain('src/core/install/ui/app.ts');
	});

	test('no module outside src/core/install/ui/ names @opentui', () => {
		expect(importers.filter((file) => !file.startsWith(UI_DIR))).toEqual([]);
	});

	test('controls: every specifier form is seen', () => {
		expect(opentuiSpecifiers("import { x } from '@opentui/core';")).toEqual(['@opentui/core']);
		expect(opentuiSpecifiers('export * from "@opentui/core/testing";')).toEqual([
			'@opentui/core/testing',
		]);
		expect(opentuiSpecifiers("import '@opentui/core';")).toEqual(['@opentui/core']);
		expect(opentuiSpecifiers("await import('@opentui/react')")).toEqual(['@opentui/react']);
		expect(opentuiSpecifiers('require(`@opentui/core`)')).toEqual(['@opentui/core']);
		expect(opentuiSpecifiers("import x from './opentui.ts'")).toEqual([]);
	});
});

// ── (b) the server ───────────────────────────────────────────────────────────

/**
 * The tool server modules: loaded at request time through a COMPUTED specifier
 * (src/core/tools/loader.ts), which the walker cannot follow — so each is a root.
 */
const TOOL_SERVER_ROOTS: readonly string[] = writePathSourceFiles().filter((file) =>
	/^tools\/[^/]+\/server\/.+\.ts$/.test(file),
);

describe('the server never reaches the UI (b)', () => {
	const reachable = reachableModules(true, [...REQUEST_PATH_ROOTS, ...TOOL_SERVER_ROOTS]).map(rel);

	test('the closure is real (> 500 modules, into src/core/install and tools/)', () => {
		expect(reachable.length).toBeGreaterThan(500);
		// Into src/core/install through Maintenance › Import hierarchies (since the wizard
		// router left, 2026-10-12, the plan module is no longer on the server's path).
		expect(reachable).toContain('src/core/install/hierarchy_import.ts');
		expect(TOOL_SERVER_ROOTS.length).toBeGreaterThan(20);
		expect(reachable.filter((file) => file.startsWith('tools/')).length).toBeGreaterThan(20);
	});

	test('no UI module, no loader', () => {
		expect(reachable.filter((file) => file.startsWith(UI_DIR) || file === LOADER)).toEqual([]);
	});

	test('CONTROL: a side-effect import of the UI is an edge (no `from`, no binding)', () => {
		const dir = mkdtempSync(join(scratchRoot, 'side_effect_'));
		const planted = join(dir, 'planted.ts');
		const target = join(REPO_ROOT, UI_DIR, 'app.ts');
		writeFileSync(planted, `import '${relative(dir, target)}';\n`);
		expect(directImports(planted)).toEqual([target]);
		expect(directImports(planted, false)).toEqual([target]);
	});
});

// ── (c) the installer ────────────────────────────────────────────────────────

/**
 * A preload that makes a resolution THROW: every `@opentui/*` (the package absent, as on
 * a bare host) — and, `withUi`, the installer's own loader and UI too (whatever the
 * import form: a static, side-effect or dynamic import of them all fails the load).
 */
function blockingPreload(withUi: boolean): string {
	const path = join(scratchRoot, withUi ? 'no_ui_preload.ts' : 'no_opentui_preload.ts');
	const filter = withUi ? '/^@opentui\\/|tui_loader\\.ts$|install\\/ui\\//' : '/^@opentui\\//';
	// A template literal on purpose: the plugin runs in the SPAWNED installer's
	// process (its --preload), never in this one — mock_isolation_tripwire rule 4
	// counts an in-process plugin, and a template-literal driver is how it tells
	// the two apart.
	writeFileSync(
		path,
		`import { plugin } from 'bun';
plugin({
	name: 'no-opentui',
	setup(build) {
		build.onResolve({ filter: ${filter} }, (args) => {
			throw new Error(\`@opentui unavailable: \${args.path}\`);
		});
	},
});
`,
	);
	return path;
}

const cliEnv = (): Record<string, string> => {
	const dir = mkdtempSync(join(scratchRoot, 'private_'));
	return {
		...(Bun.env as Record<string, string>),
		DEDALO_INSTALL_PRIVATE_DIR: dir,
		DEDALO_TS_STATE_PATH: join(dir, 'ts_state.json'),
	};
};

describe('the installer loads the UI only on the full-screen path (c)', () => {
	test('scripts/install.ts reaches ui/app.ts through the dynamic import only', () => {
		const withDynamic = reachableModules(true, ['scripts/install.ts']).map(rel);
		const staticOnly = reachableModules(false, ['scripts/install.ts']).map(rel);
		expect(withDynamic).toContain('src/core/install/ui/app.ts');
		expect(withDynamic).toContain(LOADER);
		expect(staticOnly.length).toBeGreaterThan(20);
		expect(staticOnly.filter((file) => file.startsWith(UI_DIR) || file === LOADER)).toEqual([]);
	});

	test('headless with @opentui, the loader and the UI unresolvable: --list-langs exits 0', () => {
		const proc = Bun.spawnSync(
			[
				process.execPath,
				'--preload',
				blockingPreload(true),
				join(REPO_ROOT, 'scripts/install.ts'),
				'--list-langs',
			],
			{ cwd: REPO_ROOT, env: cliEnv(), stdout: 'pipe', stderr: 'pipe' },
		);
		expect(proc.exitCode, proc.stderr.toString()).toBe(0);
		expect(JSON.parse(proc.stdout.toString()).langs.length).toBeGreaterThan(5);
	}, 60000);

	test('CONTROL: interactive on a terminal with @opentui unresolvable falls back to plain, one line why', async () => {
		let text = '';
		const decoder = new TextDecoder();
		const proc = Bun.spawn(
			[
				process.execPath,
				'--preload',
				blockingPreload(false),
				join(REPO_ROOT, 'scripts/install.ts'),
			],
			{
				cwd: REPO_ROOT,
				env: { ...cliEnv(), TERM: 'xterm-256color' },
				terminal: {
					cols: 104,
					rows: 30,
					data: (_terminal: unknown, chunk: Uint8Array) => {
						text += decoder.decode(chunk, { stream: true });
					},
				},
			},
		);
		const terminal = (proc as unknown as { terminal: { write(data: string): void } }).terminal;
		const until = Date.now() + 30000;
		while (!text.includes('plain mode') && Date.now() < until) await Bun.sleep(25);
		terminal.write('quit\r');
		const code = await Promise.race([proc.exited, Bun.sleep(20000).then(() => -1)]);
		if (code === -1) proc.kill('SIGKILL');
		expect(text).toContain('full-screen UI unavailable (');
		expect(text).toContain('@opentui unavailable');
		expect(text).toContain('continuing in plain mode');
		expect(text).toContain('Dédalo installer (plain mode)');
		expect(text.includes('\x1b[?1049h')).toBe(false);
		expect(code).toBe(0);
	}, 60000);
});

// ── (d) the pin ──────────────────────────────────────────────────────────────

const PLATFORMS = [
	'darwin-arm64',
	'darwin-x64',
	'linux-arm64',
	'linux-x64',
	'linux-arm64-musl',
	'linux-x64-musl',
];

describe('@opentui/core is pinned exactly, and the lock carries every target (d)', () => {
	const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
		dependencies: Record<string, string>;
	};
	const pinned = pkg.dependencies['@opentui/core'] ?? '';
	const lock = readFileSync(join(REPO_ROOT, 'bun.lock'), 'utf8');

	test('an exact semver in dependencies (not dev: the installer ships it)', () => {
		expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test('bun.lock resolves that version, with every target platform', () => {
		const resolved = /"@opentui\/core": \["@opentui\/core@([^"]+)"/.exec(lock)?.[1];
		expect(resolved).toBe(pinned);
		for (const platform of PLATFORMS) {
			const native = new RegExp(
				`"@opentui/core-${platform}": \\["@opentui/core-${platform}@([^"]+)"`,
			).exec(lock);
			expect(native?.[1], platform).toBe(pinned);
		}
	});

	test('controls: a range or a tag is not a pin', () => {
		for (const bad of ['^0.6.1', '~0.6.1', '0.6', 'latest', '>=0.6.1', 'npm:@opentui/core@0.6.1'])
			expect(/^\d+\.\d+\.\d+$/.test(bad), bad).toBe(false);
	});
});

// ── (e) the loader ───────────────────────────────────────────────────────────

describe('the loader falls back, never throws (e)', () => {
	const options = {
		stdin: process.stdin,
		stdout: process.stdout,
		noColor: true,
		version: 'x',
	} as TuiOptions;

	test('a failed import: plain, the first line of the reason', async () => {
		expect(await openFullScreen(options, () => Promise.reject(new Error('x\nsecond')))).toEqual({
			kind: 'plain',
			reason: 'x',
		});
	});

	test('a UI whose opening throws (the native library missing): plain', async () => {
		const opened = await openFullScreen(options, async () => ({
			openTui: async () => {
				throw new Error('Failed to load native library \x1b[31mlibopentui\x1b[0m');
			},
		}));
		expect(opened).toEqual({ kind: 'plain', reason: 'Failed to load native library libopentui' });
	});
});
