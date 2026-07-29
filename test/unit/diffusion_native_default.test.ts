/**
 * DEDALO_DIFFUSION_NATIVE — the flag must never again advertise a dead route.
 *
 * The bug this gate exists for (2026-07-29): the flag defaulted to
 * unset-meaning-`false`, so an install that never wrote the key kept emitting
 * `DEDALO_DIFFUSION_API_URL = /dedalo/diffusion/api/v1/` into plain_vars. That
 * route belongs to the external service decommissioned at the 2026-07-11
 * cutover; THIS server serves no such path. Every tool_diffusion call from
 * every section therefore 404'd — surfacing to the user as the unrelated-looking
 * "Invalid tool wrapper: missing tool_header" (data_manager never rejects, so
 * the real error was swallowed; see the WC-003 addendum).
 *
 * Two independent failure modes are gated here, because fixing only one leaves
 * the bug reachable:
 *   1. the catalog default silently reverting to false;
 *   2. a reader going back to `readEnv(...) === 'true'`, which IGNORES the
 *      catalog default entirely and pins the value to false when unset — that
 *      was the actual mechanism, and a default-only test would not catch it.
 */

import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';
import { join } from 'node:path';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const KEY = 'DEDALO_DIFFUSION_NATIVE';
/** The route the legacy key points at. This server registers nothing for it. */
const LEGACY_URL = '/dedalo/diffusion/api/v1/';

describe('DEDALO_DIFFUSION_NATIVE — native diffusion is the default', () => {
	test('the catalog default is true', () => {
		// If this flips back to false, an install that never wrote the key starts
		// advertising LEGACY_URL again and tool_diffusion 404s everywhere.
		expect(CONFIG_CATALOG[KEY]?.default).toBe(true);
	});

	test('plain_vars OMITS the legacy url when the flag resolves true', async () => {
		const prior = process.env[KEY];
		process.env[KEY] = 'true';
		try {
			const { buildPlainVars } = await import('../../src/core/resolve/environment.ts');
			expect('DEDALO_DIFFUSION_API_URL' in buildPlainVars(true)).toBe(false);
		} finally {
			if (prior === undefined) delete process.env[KEY];
			else process.env[KEY] = prior;
		}
	});

	test('the escape hatch survives: explicit false still emits the legacy url', async () => {
		// A deployment that genuinely still fronts the external service behind its
		// own route must be able to opt back in. Opt-OUT, not opt-in.
		const prior = process.env[KEY];
		process.env[KEY] = 'false';
		try {
			const { buildPlainVars } = await import('../../src/core/resolve/environment.ts');
			expect(buildPlainVars(true).DEDALO_DIFFUSION_API_URL).toBe(LEGACY_URL);
		} finally {
			if (prior === undefined) delete process.env[KEY];
			else process.env[KEY] = prior;
		}
	});

	test('no source file reads the flag through readEnv (that bypasses the default)', async () => {
		// readEnv returns undefined when a key is unset and knows nothing about the
		// catalog, so `readEnv(KEY) === 'true'` evaluates false on every install
		// that never wrote the key — regardless of what the catalog says. The
		// typed reader (readBool) is the only form that honours the default.
		const offenders: string[] = [];
		for await (const rel of new Glob('src/**/*.ts').scan(REPO_ROOT)) {
			const text = await Bun.file(join(REPO_ROOT, rel)).text();
			for (const line of text.split('\n')) {
				// Skip prose: these files explain the trap in comments.
				const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
				if (code.includes(`readEnv('${KEY}')`) || code.includes(`readEnv("${KEY}")`)) {
					offenders.push(`${rel}: ${line.trim()}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
