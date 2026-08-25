/**
 * Runtime-pin lockstep tripwire (audit S2-36, WS-E item 1).
 *
 * THE INVARIANT under test: the verified Bun version is pinned in FIVE places
 * that must never drift — `.bun-version` (the source of truth), `package.json`
 * engines.bun, the system_info widget's MIN_BUN floor, the `Dockerfile` base
 * image tag, and `init_test.ts`'s installer floor (compared on major.minor,
 * since it is deliberately a floor rather than an exact pin). A SIXTH copy, the
 * `.gitlab-ci.yml` `oven/bun:<tag>` image and the GitHub workflows'
 * `bun-version-file` wiring, is owned by `ci_workflow_tripwire.test.ts` — that
 * is the complete census as of 2026-08-25. Add a copy anywhere else and it must
 * be added here too. This file also asserts the diffusion zip writer
 * carries NO runtime `Bun.zip` probe (a future Bun shipping Bun.zip must not
 * silently change archive bytes). Also pins the deterministic-bytes property
 * of the PKZIP STORE writer itself.
 */

import { Glob } from 'bun';
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

	// THE DRIFT HAZARD THIS CLOSES (found 2026-08-25, during the 1.3.9 -> 1.4.0 bump):
	// the pin census turned up two more copies of the runtime version that NOTHING
	// gated — the Dockerfile's base-image tag and init_test's installer floor. The
	// Dockerfile header already ASKS for lockstep in prose, and init_test's comment
	// already CLAIMS to match .bun-version while sitting a patch train behind it
	// (it read [1,3,0] against a 1.3.9 pin). A stated rule with no mechanical gate
	// is the thing DEC-12 forbids, and a half-landed bump is exactly how the
	// container ends up on a different runtime than the suite verified.
	test('Dockerfile base image tag matches .bun-version', () => {
		const source = readFileSync(join(ROOT, 'Dockerfile'), 'utf-8');
		const match = /^FROM oven\/bun:([^-\s]+)/m.exec(source);
		expect(match?.[1]).toBe(pinned);
	});

	// A FLOOR, not an exact pin: the installer accepts any patch of the pinned
	// minor, so only major.minor is compared. That keeps init_test's looser intent
	// (it answers "is this runtime new enough to install on?") while making a
	// minor-train drift — the 1.3 -> 1.4 case — impossible to leave behind.
	test('init_test MIN_BUN floor tracks the pinned major.minor', () => {
		const source = readFileSync(join(ROOT, 'src/core/install/init_test.ts'), 'utf-8');
		const match = /const MIN_BUN = \[([^\]]+)\]/.exec(source);
		expect(match).not.toBeNull();
		const floor = (match?.[1] ?? '').split(',').map((n) => Number.parseInt(n.trim(), 10));
		const [major, minor] = pinned.split('.').map((n) => Number.parseInt(n, 10));
		expect(floor[0]).toBe(major);
		expect(floor[1]).toBe(minor);
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

/**
 * AMBIENT-ENV CONNECTION INPUTS (2026-08-25, found reviewing the 1.3.9 -> 1.4.0 bump).
 *
 * Bun 1.4's Bun.sql option parser falls back to the ambient `PGSSLMODE` /
 * `PG_SSLMODE` environment variables when `tls` is absent — 1.3.9's parser
 * never read them (verified by grepping both binaries: the string is present
 * in 1.4.0 and absent in 1.3.9). Those variables are routinely exported for
 * `psql`/`pg_dump`, so an absent `tls` would let the surrounding shell, the
 * systemd unit or a CI image decide the engine's TLS mode — behaviour that
 * differs by launch method with nothing in `../private/.env` to correct, which
 * is precisely the failure class `config_env_tripwire` exists to forbid.
 *
 * The rule is therefore mechanical, not prose: the pool's options must name
 * `tls` explicitly, and the value must come from the typed catalog.
 */
/**
 * A pin check that can silently test the WRONG binary is not a pin check.
 *
 * `ops_shutdown` spawned a bare `'bun'` off `$PATH` while asserting the boot
 * echo equals `Bun.version`. Running the suite on 1.4.0 with `$PATH` still on
 * 1.3.9 (the 2026-08-25 bump), it booted and validated the old runtime; only
 * the S2-36 version echo caught it, and the second spawn in the same file went
 * unnoticed for a whole review cycle. `process.execPath` is the runtime UNDER
 * TEST — `$PATH` is whatever the shell happens to hold.
 */
describe('server-spawning gates use the runtime under test, not $PATH', () => {
	test('no test/unit gate spawns a bare `bun` for src/server.ts', () => {
		const offenders: string[] = [];
		for (const match of new Glob('**/*.test.ts').scanSync({ cwd: join(ROOT, 'test/unit') })) {
			const source = readFileSync(join(ROOT, 'test/unit', match), 'utf-8');
			if (/Bun\.spawn\(\s*\[\s*['"`]bun['"`]/.test(source)) offenders.push(`test/unit/${match}`);
		}
		expect(
			offenders,
			`Spawn the server with process.execPath, not a bare 'bun' off $PATH — otherwise the gate can boot a DIFFERENT runtime than the one under test: ${offenders.join(', ')}`,
		).toEqual([]);
	});
});

describe('ambient env may not steer the DB connection (Bun 1.4 PGSSLMODE)', () => {
	const source = readFileSync(join(ROOT, 'src/core/db/postgres.ts'), 'utf-8');

	test('buildSqlOptions passes tls EXPLICITLY, from the catalog', () => {
		expect(source).toContain('tls: sslMode as PostgresSslMode');
		expect(source).toMatch(/const \{[^}]*sslMode[^}]*\} = config\.db;/);
	});

	test('the sslmode value is a catalogued key, not a raw env read', () => {
		const catalog = readFileSync(join(ROOT, 'src/config/catalog/db.ts'), 'utf-8');
		expect(catalog).toContain('DB_SSLMODE:');
		const configSource = readFileSync(join(ROOT, 'src/config/config.ts'), 'utf-8');
		expect(configSource).toContain("sslMode: readString('DB_SSLMODE')");
	});
});
