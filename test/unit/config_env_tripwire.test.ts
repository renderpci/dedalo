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
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { envSnapshot, parseEnvFile, privateDir, readEnv } from '../../src/config/env.ts';

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
		reason: 'subprocess passthrough: pg_dump child gets the whole env',
	},
	'src/core/media/engine/spawn.ts': {
		maxLines: 1,
		reason: 'subprocess passthrough: media binaries get the whole env',
	},
	'src/diffusion/jobs/scheduler.ts': {
		maxLines: 1,
		reason: 'subprocess passthrough: runner child gets the whole env (+ job vars)',
	},
	'src/core/area_maintenance/widgets/php_runtime.ts': {
		maxLines: 1,
		reason:
			'DEFERRED (S2-21): NODE_ENV read (moved verbatim in the S2-23 split); convert to readEnv',
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

	test('../private/.env values reach readEnv AND envSnapshot when not shadowed', () => {
		const envFilePath = join(privateDir, '.env');
		if (!existsSync(envFilePath)) return; // fresh checkout without a private file
		const fileValues = parseEnvFile(readFileSync(envFilePath, 'utf-8'));
		const unshadowed = Object.keys(fileValues).filter((key) => process.env[key] === undefined);
		if (unshadowed.length === 0) return; // everything shadowed in this run
		for (const key of unshadowed) {
			expect(readEnv(key)).toBe(fileValues[key] as string);
			expect(envSnapshot()[key]).toBe(fileValues[key] as string);
		}
	});
});
