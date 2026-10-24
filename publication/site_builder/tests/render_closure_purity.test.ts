/**
 * THE LAYOUT AND EVERY RENDERER LOAD WITHOUT node_modules — over their WHOLE import closure.
 *
 * The law (render/types.ts, layout.ts header): repo-side tripwires import `provision/layout.ts`
 * and `provision/render/*.ts` from the ENGINE's tree, where this package's node_modules is not
 * installed. `provision.test.ts` checks each of those files' DIRECT imports; but they reach into
 * `src/drivers/` and `src/util/` too (agent_identity, network_profile, unit_frames,
 * unit_properties, shared_tree, …), and a `zod` — or a `../config` / `../provision/schema`,
 * which pull it in — one relative hop away passed that check while breaking every repo gate.
 *
 * The outcome, measured rather than read: the package's `src/` is copied to a scratch directory
 * with NO node_modules anywhere above it, and a fresh `bun` imports layout.ts and every
 * renderer there. Control: the same copy with ONE module of the closure (drivers/network_profile,
 * two hops from layout.ts) importing `zod` fails to load — the walk is the runtime's, so a hop
 * of any depth counts.
 */

import { afterAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PACKAGE_SRC = join(import.meta.dir, '..', 'src');
const scratches: string[] = [];

afterAll(() => {
	for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

/** A copy of `src/` under a directory no node_modules sits above. */
function isolatedCopy(): string {
	const root = mkdtempSync(join(tmpdir(), 'sb-closure-'));
	scratches.push(root);
	// The premise of the measurement: nothing above the copy can resolve a package.
	for (let dir = root; ; dir = dirname(dir)) {
		expect({ dir, node_modules: existsSync(join(dir, 'node_modules')) }).toEqual({
			dir,
			node_modules: false,
		});
		if (dirname(dir) === dir) break;
	}
	cpSync(PACKAGE_SRC, join(root, 'src'), { recursive: true });
	return root;
}

/** Imports layout.ts and every render/*.ts in a fresh bun at `root`; the failures, by module. */
function loadAll(root: string): { loaded: number; failed: string[] } {
	const modules = [
		'src/provision/layout.ts',
		...readdirSync(join(root, 'src', 'provision', 'render'))
			.filter((file) => file.endsWith('.ts'))
			.sort()
			.map((file) => `src/provision/render/${file}`),
	];
	const script = `
		const failed = [];
		for (const m of ${JSON.stringify(modules)}) {
			try { await import('./' + m); } catch (e) { failed.push(m + ': ' + String(e && e.message).split('\\n')[0]); }
		}
		console.log(JSON.stringify({ loaded: ${modules.length} - failed.length, failed }));
	`;
	writeFileSync(join(root, 'load.mjs'), script);
	// `--no-install`: with no node_modules, bun would otherwise AUTO-INSTALL a bare import from
	// the registry — and a plant would load.
	const run = spawnSync(process.execPath, ['--no-install', 'load.mjs'], {
		cwd: root,
		encoding: 'utf8',
		// No NODE_PATH, no package resolution from anywhere but the copy itself.
		env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root },
	});
	const line = String(run.stdout).trim().split('\n').pop() ?? '';
	try {
		return JSON.parse(line) as { loaded: number; failed: string[] };
	} catch {
		return {
			loaded: 0,
			failed: [
				`the loader did not answer (exit ${run.status}): ${String(run.stderr).slice(0, 400)}`,
			],
		};
	}
}

test('layout.ts and every renderer load with no node_modules — their whole closure is dependency-free', () => {
	const root = isolatedCopy();
	const result = loadAll(root);
	expect(result.failed).toEqual([]);
	expect(result.loaded).toBeGreaterThan(1);
}, 60_000);

test('CONTROL: a zod import two hops into the closure (layout → drivers/agent_identity → drivers/network_profile) is a load failure', () => {
	const root = isolatedCopy();
	const planted = join(root, 'src', 'drivers', 'network_profile.ts');
	writeFileSync(
		planted,
		`import { z } from 'zod';\nexport const __zod = z;\n${readFileSync(planted, 'utf8')}`,
	);
	const result = loadAll(root);
	// layout.ts imports drivers/agent_identity, which imports network_profile: two hops.
	expect(
		result.failed.some(
			(line) => line.startsWith('src/provision/layout.ts:') && line.includes('zod'),
		),
	).toBe(true);
}, 60_000);
