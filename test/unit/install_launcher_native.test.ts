/**
 * INSTALLER LAUNCHER (scripts/install.ts): a checkout without dependencies is
 * refused with a sentence that says what to do — not the engine graph dying on
 * "Cannot find package 'zod'" (2026-10-20: `bun install` skipped, ESM imports
 * hoisted, no installer code ran). It never installs. Measured as OUTCOMES:
 *
 *  A. PACKAGE-FREE: the launcher's static graph is itself with `node:*` /
 *     `bun:*` imports only, and its one dynamic import is the installer body —
 *     a planted `import 'zod'` is reported;
 *  B. END TO END in a scratch tree (the real launcher, a stub body):
 *     no node_modules → exit 3, the sentence on stderr naming `bun install`,
 *     stdout empty, the body never loaded, nothing written — whatever the
 *     arguments (the production engine child's included); node_modules present
 *     → the body runs with the argv unchanged and its exit code is the launcher's.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const LAUNCHER = join(ROOT, 'scripts/install.ts');
const scratch = mkdtempSync(join(tmpdir(), 'dedalo_launcher_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// ── A. package-free ─────────────────────────────────────────────────────────

const transpiler = new Bun.Transpiler({ loader: 'ts' });

interface Graph {
	/** Non-relative static specifiers met anywhere in the graph. */
	external: string[];
	/** Dynamic import specifiers of the ENTRY file. */
	entryDynamic: string[];
	files: string[];
}

/** Walk static imports from `entry` (relative edges followed; dynamic edges recorded, not followed). */
function staticGraph(
	entry: string,
	read: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): Graph {
	const graph: Graph = { external: [], entryDynamic: [], files: [] };
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.shift() as string;
		if (graph.files.includes(file)) continue;
		graph.files.push(file);
		for (const found of transpiler.scanImports(read(file))) {
			if (found.kind === 'dynamic-import') {
				if (file === entry) graph.entryDynamic.push(found.path);
				continue;
			}
			if (found.path.startsWith('.')) queue.push(resolve(dirname(file), found.path));
			else graph.external.push(found.path);
		}
	}
	return graph;
}

const packageSpecifiers = (graph: Graph): string[] =>
	graph.external.filter((spec) => !spec.startsWith('node:') && !spec.startsWith('bun:'));

describe('A. the launcher is package-free', () => {
	test('its static graph is itself with node:/bun: imports; its one dynamic import is the installer body', () => {
		const graph = staticGraph(LAUNCHER);
		expect(graph.files.map((file) => relative(ROOT, file))).toEqual(['scripts/install.ts']);
		expect(packageSpecifiers(graph)).toEqual([]);
		expect(graph.external.length).toBeGreaterThan(0);
		expect(graph.entryDynamic).toEqual(['./install_main.ts']);
	});

	test('CONTROL: a planted package import is reported', () => {
		const planted = (file: string): string =>
			`import { z } from 'zod';\n${readFileSync(file, 'utf8')}`;
		expect(packageSpecifiers(staticGraph(LAUNCHER, planted))).toEqual(['zod']);
	});
});

// ── B. end to end: the real launcher in a scratch tree ─────────────────────

/** A scratch tree: the real launcher, a stub installer body that records it ran. */
function launcherTree(name: string, nodeModules: boolean): string {
	const dir = join(scratch, name);
	mkdirSync(join(dir, 'scripts'), { recursive: true });
	cpSync(LAUNCHER, join(dir, 'scripts/install.ts'));
	writeFileSync(
		join(dir, 'scripts/install_main.ts'),
		[
			"import { writeFileSync } from 'node:fs';",
			"writeFileSync(new URL('../BODY_RAN', import.meta.url), '');",
			'console.log(`MAIN ${JSON.stringify(Bun.argv.slice(2))}`);',
			"if (Bun.argv.includes('--exit7')) process.exit(7);",
		].join('\n'),
	);
	if (nodeModules) mkdirSync(join(dir, 'node_modules'));
	return dir;
}

function launch(
	dir: string,
	args: readonly string[],
): { code: number; stdout: string; stderr: string } {
	const proc = Bun.spawnSync([process.execPath, join(dir, 'scripts/install.ts'), ...args], {
		cwd: dir,
		env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: scratch, TERM: 'dumb' },
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		code: proc.exitCode ?? -1,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

describe('B. the launcher, end to end', () => {
	test('no node_modules: exit 3, the sentence names `bun install`, nothing loaded or written — any argv', () => {
		const cases: readonly (readonly string[])[] = [
			[],
			['--plain'],
			['--request-stdin', '--execute', '--events-jsonl'],
			['--status', '--json'],
		];
		for (const [index, args] of cases.entries()) {
			const dir = launcherTree(`missing_${index}`, false);
			const run = launch(dir, args);
			expect(run.code).toBe(3);
			expect(run.stdout).toBe('');
			expect(run.stderr).toContain('no node_modules');
			expect(run.stderr).toContain('bun install');
			expect(run.stderr).not.toContain('Cannot find package');
			// The stub body's own marker: it is the one write this path would make,
			// and the launcher's static graph is `node:*`/`bun:*` only (part A), so
			// its absence IS "the body never loaded, nothing written". A directory
			// listing would say the same and cost a walk root the census cannot
			// evaluate (a mkdtemp scratch tree; its opaque-site cap is full).
			expect(existsSync(join(dir, 'BODY_RAN'))).toBe(false);
		}
	}, 60000);

	test("node_modules present: the body runs with the argv unchanged, its exit code is the launcher's", () => {
		const dir = launcherTree('present', true);
		const run = launch(dir, ['--status', '--json']);
		expect(run.code, run.stderr).toBe(0);
		expect(run.stdout).toBe('MAIN ["--status","--json"]\n');
		expect(existsSync(join(dir, 'BODY_RAN'))).toBe(true);
		const failing = launch(launcherTree('present_exit', true), ['--exit7']);
		expect(failing.code).toBe(7);
		expect(failing.stdout).toBe('MAIN ["--exit7"]\n');
	}, 60000);
});
