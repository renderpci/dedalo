/**
 * Runtime-pin lockstep tripwire (audit S2-36, WS-E item 1).
 *
 * THE INVARIANT under test: the verified Bun version is pinned in THREE
 * places that must never drift — `.bun-version`, `package.json` engines.bun,
 * and the system_info widget's MIN_BUN floor — and the diffusion zip writer
 * carries NO runtime `Bun.zip` probe (a future Bun shipping Bun.zip must not
 * silently change archive bytes). Also pins the deterministic-bytes property
 * of the PKZIP STORE writer itself.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createZip } from '../../src/diffusion/writers/files.ts';

const ROOT = resolve(import.meta.dir, '../..');

describe('runtime pin (S2-36)', () => {
	const pinned = readFileSync(join(ROOT, '.bun-version'), 'utf-8').trim();

	test('.bun-version holds a concrete semver', () => {
		expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test('package.json engines.bun matches .bun-version', () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
			engines?: { bun?: string };
		};
		expect(pkg.engines?.bun).toBe(pinned);
	});

	test('system_info MIN_BUN matches .bun-version', () => {
		const source = readFileSync(
			join(ROOT, 'src/core/area_maintenance/widgets/system_info.ts'),
			'utf-8',
		);
		const match = /const MIN_BUN = '([^']+)'/.exec(source);
		expect(match?.[1]).toBe(pinned);
	});

	test('diffusion zip writer has no Bun.zip runtime probe', () => {
		const source = readFileSync(join(ROOT, 'src/diffusion/writers/files.ts'), 'utf-8');
		// The deterministic STORE writer must be UNCONDITIONAL: no feature-probe
		// of the runtime may switch the archive byte format (S2-36 scenario b).
		// Comments may mention Bun.zip (they document the removal); CODE may not
		// probe it.
		expect(source).not.toMatch(/\bbunZip\b/);
		expect(source).not.toMatch(/\{\s*zip\?:/);
		expect(source).toContain('atomicWriteFile(zipPath, buildStoreZip(entries))');
	});
});

describe('zip determinism (the property the probe removal protects)', () => {
	test('two runs over the same inputs produce identical bytes', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dedalo_zip_det_'));
		try {
			writeFileSync(join(dir, 'a.txt'), 'alpha content');
			writeFileSync(join(dir, 'b.txt'), 'beta content');
			const inputs = [join(dir, 'a.txt'), join(dir, 'b.txt')];
			await createZip(inputs, join(dir, 'one.zip'));
			await createZip(inputs, join(dir, 'two.zip'));
			const one = readFileSync(join(dir, 'one.zip'));
			const two = readFileSync(join(dir, 'two.zip'));
			expect(one.equals(two)).toBe(true);
			// PKZIP local-file-header magic, method STORE.
			expect(one.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
