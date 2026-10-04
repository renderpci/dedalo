/**
 * CONFIG-DISCIPLINE TRIPWIRE (audit S2-21; README.md "Hard rules").
 *
 * The documented config precedence is: real process environment >
 * ../private/.env — implemented ONLY by src/config/env.ts (readEnv /
 * requireEnv / envSnapshot). A raw `process.env.KEY` read silently drops the
 * private-file half of that chain, so the same key set in the documented
 * config home is ignored while the systemd/CI variant works — behavior that
 * differs by launch method with zero diagnostics (runtime-reproduced for
 * DEDALO_MEDIA_JOB_CONCURRENCY).
 *
 * RULE: `process.env` is BANNED in src/ and tools/ outside src/config/ —
 * and so are its aliases `Bun.env` and `import.meta.env` (identical raw
 * reads of the process environment; either one bypasses the precedence
 * chain exactly the same way — evasion-hole hardening, 2026-07-07).
 * Exemptions, each exact-file with a max line count:
 *   - SUBPROCESS PASSTHROUGH: spawning a child with the WHOLE env map is
 *     legitimate (the child re-applies the precedence itself when it boots
 *     through src/config).
 *   - DEFERRED SITES: named reader sites owned by sibling workstreams; each
 *     carries its owner. Do not add to this list — convert new code to
 *     readEnv/envSnapshot.
 *
 * Also asserts the precedence contract itself (readEnv/envSnapshot behavior)
 * so the loader cannot silently regress while the static ban stays green.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { envSnapshot, readEnv } from '../../src/config/env.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

// ---------------------------------------------------------------------------
// Static ban: process.env outside src/config/.
// ---------------------------------------------------------------------------

/**
 * file → { maxLines, reason }. maxLines is the ceiling of NON-COMMENT lines
 * mentioning process.env; lowering it is always welcome, raising it needs
 * the same justification bar as a new entry.
 */
const PROCESS_ENV_ALLOWLIST: Record<string, { maxLines: number; reason: string }> = {
	'src/core/area_maintenance/backup.ts': {
		maxLines: 1,
		reason:
			'subprocess passthrough (inheritedEnvironment): pg_dump gets the whole env; pg_restore the same with the message locale pinned to C and no PGPASSWORD',
	},
	'src/core/media/engine/spawn.ts': {
		maxLines: 1,
		reason: 'subprocess passthrough: media binaries get the whole env',
	},
	'src/diffusion/jobs/scheduler.ts': {
		maxLines: 1,
		reason: 'subprocess passthrough: runner child gets the whole env (+ job vars)',
	},
	'src/core/area_maintenance/widgets/runtime_info.ts': {
		maxLines: 1,
		reason:
			'DEFERRED (S2-21): NODE_ENV read (moved verbatim in the S2-23 split, then again in the ' +
			'WC-030 php_runtime merge); convert to readEnv',
	},
	// media/jobs.ts and ai/mcp/server.ts: converted to readEnv (debris
	// workstream, 2026-07-07) — allowlist entries removed.
};

/** Raw environment reads: process.env plus its Bun aliases. */
const RAW_ENV_READ = /process\.env\b|Bun\.env\b|import\.meta\.env\b/;

/** Non-comment lines of `content` that mention a raw environment read. */
function processEnvLines(content: string): number[] {
	const hits: number[] = [];
	content.split('\n').forEach((line, index) => {
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
		if (RAW_ENV_READ.test(trimmed)) hits.push(index + 1);
	});
	return hits;
}

describe('process.env / Bun.env / import.meta.env ban outside src/config/ (S2-21)', () => {
	test('every raw env read (process.env, Bun.env, import.meta.env) is in src/config/ or exactly allowlisted', () => {
		const violations: string[] = [];
		for (const dir of ['src', 'tools']) {
			const glob = new Glob('**/*.ts');
			for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
				if (match.endsWith('.test.ts')) continue;
				const file = relative(REPO_ROOT, join(REPO_ROOT, dir, match));
				if (file.startsWith('src/config/')) continue; // the loader itself
				const lines = processEnvLines(readFileSync(join(REPO_ROOT, file), 'utf-8'));
				if (lines.length === 0) continue;
				const allowed = PROCESS_ENV_ALLOWLIST[file];
				if (allowed === undefined) {
					violations.push(`${file}:${lines.join(',')} (not allowlisted)`);
				} else if (lines.length > allowed.maxLines) {
					violations.push(
						`${file}:${lines.join(',')} (${lines.length} lines > allowed ${allowed.maxLines})`,
					);
				}
			}
		}
		expect(
			violations,
			`Raw env read (process.env / Bun.env / import.meta.env) outside src/config/. Use readEnv()/envSnapshot() from src/config/env.ts so ../private/.env keeps working: ${violations.join('; ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Behavioral contract: the precedence chain itself.
// ---------------------------------------------------------------------------

describe('readEnv / envSnapshot precedence contract', () => {
	const PROBE_KEY = '__DEDALO_CONFIG_TRIPWIRE_PROBE__';

	test('process env wins and is visible through both readers', () => {
		process.env[PROBE_KEY] = 'from-process';
		try {
			expect(readEnv(PROBE_KEY)).toBe('from-process');
			expect(envSnapshot()[PROBE_KEY]).toBe('from-process');
		} finally {
			delete process.env[PROBE_KEY];
		}
		// envSnapshot is per-call, not a boot snapshot: the deletion is visible.
		expect(envSnapshot()[PROBE_KEY]).toBeUndefined();
		// readEnv has NO fallback parameter any more: defaults live in src/config/catalog/
		// and a literal passed here is a compile error (that is the gate). An unset key
		// simply reads as undefined; the catalog-backed readers supply the default.
		expect(readEnv(PROBE_KEY)).toBeUndefined();
	});

	test('the private .env values reach readEnv AND envSnapshot when not shadowed (scratch private dir)', () => {
		// BUILT, never borrowed: the developer's ../private/.env is not on a CI host
		// (by design — the tiers compose their env), so reading it made this leg return
		// before asserting there and test a different file on every desk. A child
		// process boots env.ts against a scratch DEDALO_PRIVATE_DIR whose .env this
		// test wrote: an unshadowed key must come from the file, a shadowed one from
		// the process env, and a quoted value must lose its quotes.
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-private-env-'));
		try {
			writeFileSync(
				join(dir, '.env'),
				[
					'# a scratch private .env',
					'DEDALO_ZZ_ENV_PROBE_FILE=from-file',
					'DEDALO_ZZ_ENV_PROBE_QUOTED="quoted value"',
					'DEDALO_ZZ_ENV_PROBE_SHADOWED=from-file',
				].join('\n'),
			);
			const child = Bun.spawnSync(
				[
					process.execPath,
					'-e',
					`import { envSnapshot, readEnv, privateDir } from ${JSON.stringify(join(import.meta.dir, '../../src/config/env.ts'))};
const keys = ['DEDALO_ZZ_ENV_PROBE_FILE', 'DEDALO_ZZ_ENV_PROBE_QUOTED', 'DEDALO_ZZ_ENV_PROBE_SHADOWED'];
const snap = envSnapshot();
console.log(JSON.stringify({ privateDir, read: keys.map((k) => readEnv(k)), snap: keys.map((k) => snap[k]) }));`,
				],
				{
					cwd: dir,
					env: {
						PATH: Bun.env.PATH ?? '',
						HOME: Bun.env.HOME ?? '',
						DEDALO_PRIVATE_DIR: dir,
						DEDALO_ZZ_ENV_PROBE_SHADOWED: 'from-process',
					},
					stdout: 'pipe',
					stderr: 'pipe',
				},
			);
			expect(child.exitCode, child.stderr.toString()).toBe(0);
			const out = JSON.parse(child.stdout.toString().trim()) as {
				privateDir: string;
				read: string[];
				snap: string[];
			};
			expect(realpathSync(out.privateDir)).toBe(realpathSync(dir));
			const expected = ['from-file', 'quoted value', 'from-process'];
			expect(out.read).toEqual(expected);
			expect(out.snap).toEqual(expected);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
