/**
 * Run a throwaway TS driver in a CHILD bun process, with extra environment.
 *
 * WHY A CHILD. Pool-wide settings (DB_STATEMENT_TIMEOUT_MS, DB_POOL_MAX, …) are
 * frozen when src/config/config.ts is first imported — which the test preload
 * has long since done. A child started with the key in its environment measures
 * the REAL production path (config → postgres.ts → the pool), never a seam
 * invented for the test. The child inherits this run's environment, so it talks
 * to the SAME suite database (the preload already repointed DB_NAME) and the
 * same marked media root — nothing here sets either.
 *
 * Pattern of record: test/unit/slow_query_scope_native.test.ts.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Absolute module path for a repo-relative source file (for driver imports). */
export function repoModule(relative: string): string {
	return JSON.stringify(join(REPO_ROOT, relative));
}

export interface ChildDriver {
	/** Write `source` as `<name>` in the scratch dir and run it. */
	run(
		name: string,
		source: string,
		env: Record<string, string | undefined>,
		options?: { onStart?: (child: ReturnType<typeof Bun.spawn>) => void },
	): Promise<{ exitCode: number; stdout: string; stderr: string }>;
	/** Remove the scratch dir (call from afterAll). */
	dispose(): void;
}

export function childDriver(prefix: string): ChildDriver {
	const scratchDir = mkdtempSync(join(tmpdir(), `${prefix}-`));
	return {
		async run(name, source, env, options = {}) {
			const file = join(scratchDir, name);
			writeFileSync(file, source, 'utf8');
			// process.execPath, never a bare 'bun' off $PATH: the child must run the
			// runtime UNDER TEST (ops_runtime_pin).
			const child = Bun.spawn([process.execPath, file], {
				cwd: REPO_ROOT,
				env: { ...process.env, ...env } as Record<string, string>,
				stdout: 'pipe',
				stderr: 'pipe',
			});
			options.onStart?.(child);
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(child.stdout as ReadableStream).text(),
				new Response(child.stderr as ReadableStream).text(),
				child.exited,
			]);
			return { exitCode, stdout, stderr };
		},
		dispose() {
			rmSync(scratchDir, { recursive: true, force: true });
		},
	};
}

/** The last `RESULT <json>` line a driver printed, parsed. */
export function driverResult<T>(stdout: string, stderr: string): T {
	const line = stdout
		.split('\n')
		.reverse()
		.find((candidate) => candidate.startsWith('RESULT '));
	if (line === undefined) {
		throw new Error(`driver printed no RESULT line.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
	}
	return JSON.parse(line.slice('RESULT '.length)) as T;
}
