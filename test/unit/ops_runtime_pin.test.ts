/**
 * Runtime-pin lockstep tripwire (audit S2-36, WS-E item 1).
 *
 * THE INVARIANT under test: the verified Bun version is pinned in FIVE places
 * that must never drift — `.bun-version` (the source of truth), `package.json`
 * engines.bun, the system_info widget's MIN_BUN floor, the `Dockerfile` base
 * image tag, and `init_test.ts`'s installer floor (compared on major.minor,
 * since it is deliberately a floor rather than an exact pin). A SIXTH copy, the
 * `.gitlab-ci.yml` CI-image fingerprint pin and the GitHub workflows'
 * `bun-version-file` wiring, is owned by `ci_workflow_tripwire.test.ts` — that
 * is the complete census as of 2026-08-25. A SEVENTH (2026-10-08, provision init
 * §1.3): `.bun-sha256`, the publication host's Bun hash table — its pin line, its
 * signed-by line (= scripts/ci/bun_pin_hashes.ts BUN_RELEASE_KEY_FINGERPRINT) and its
 * asset lines (= the SIGNED payload of ci/bun/SHASUMS256.txt.asc, re-verified here
 * with gpgv), plus the kernel floor held with the pin (layout.ts BUN_KERNEL_FLOOR).
 * Add a copy anywhere else and it must be added here too. This file also asserts the diffusion zip writer
 * carries NO runtime `Bun.zip` probe (a future Bun shipping Bun.zip must not
 * silently change archive bytes). Also pins the deterministic-bytes property
 * of the PKZIP STORE writer itself.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Glob } from 'bun';
import { BUN_ASSETS } from '../../publication/host_agent/src/provision/exec_contract.ts';
import { BUN_KERNEL_FLOOR } from '../../publication/host_agent/src/provision/layout.ts';
import {
	ASC_PATH,
	ascShapeProblem,
	BUN_PIN_KERNEL_FLOOR,
	BUN_RELEASE_KEY_FINGERPRINT,
	dearmorPublicKey,
	GPGV_MISSING,
	KEY_PATH,
	payloadAssetLines,
	primaryFingerprint,
	showKeysProblem,
	statusProblem,
	TABLE_PATH,
	tableAssetLines,
	verifiedPayload,
} from '../../scripts/ci/bun_pin_hashes.ts';
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

	test('the diffusion archive bytes do not depend on the runtime shipping a Bun.zip', async () => {
		// The S2-36 property, measured as an OUTCOME (it was three source-spelling
		// pins, which a rename defeats): whatever `Bun.zip` the runtime carries — none,
		// one that throws, one that returns foreign bytes — createZip's archive is
		// byte-identical. A writer that probed the runtime would change bytes (or
		// throw) under at least one of the stubs.
		const dir = mkdtempSync(join(tmpdir(), 'dedalo_zip_probe_'));
		const bunObject = Bun as unknown as Record<string, unknown>;
		const hadZip = Object.hasOwn(bunObject, 'zip');
		const originalZip = bunObject.zip;
		const stub = (value: unknown): void => {
			Object.defineProperty(bunObject, 'zip', { value, configurable: true, writable: true });
		};
		try {
			writeFileSync(join(dir, 'a.txt'), 'alpha content');
			writeFileSync(join(dir, 'b.bin'), new Uint8Array([0, 1, 2, 250, 251, 252]));
			const inputs = [join(dir, 'a.txt'), join(dir, 'b.bin')];
			await createZip(inputs, join(dir, 'plain.zip'));
			const plain = readFileSync(join(dir, 'plain.zip'));
			stub(() => {
				throw new Error('a runtime Bun.zip was called');
			});
			await createZip(inputs, join(dir, 'throwing.zip'));
			stub(async () => new Uint8Array([0x66, 0x6f, 0x72, 0x65, 0x69, 0x67, 0x6e]));
			await createZip(inputs, join(dir, 'foreign.zip'));
			expect(readFileSync(join(dir, 'throwing.zip')).equals(plain)).toBe(true);
			expect(readFileSync(join(dir, 'foreign.zip')).equals(plain)).toBe(true);
		} finally {
			if (hadZip) stub(originalZip);
			else Reflect.deleteProperty(bunObject, 'zip');
			rmSync(dir, { recursive: true, force: true });
		}
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

/**
 * THE BUN HASH TABLE (provision init §1.3, Q3). `.bun-sha256` is what a publication host
 * verifies the Bun it runs as root against; it must be EXACTLY the signed payload of the
 * committed `ci/bun/SHASUMS256.txt.asc`, whose signature is re-verified here with gpgv
 * (the TS-dearmored key, a fresh short homedir, the status rules of §1.3 step 3). gpgv is
 * in the CI image: missing on Linux is RED; only on Darwin is the signature leg skipped.
 * Mutation targets (both red): an unsigned hash line appended after the armour, and a hash
 * line edited inside the signed payload.
 */
describe('the Bun hash table is the signed payload (.bun-sha256, Q3)', () => {
	const pinned = readFileSync(join(ROOT, '.bun-version'), 'utf-8').trim();
	const table = readFileSync(TABLE_PATH, 'utf-8');
	const asc = readFileSync(ASC_PATH, 'utf-8');
	const key = readFileSync(KEY_PATH, 'utf-8');
	const gpgv = Bun.which('gpgv');
	const signatureLeg = gpgv !== null || process.platform !== 'darwin';

	test('line 1 is the pin, line 2 the pinned release key, then one line per asset', () => {
		const lines = table.split('\n');
		expect(table.endsWith('\n')).toBe(true);
		expect(lines[0]).toBe(`# bun-v${pinned}`);
		expect(lines[1]).toBe(`# signed-by: ${BUN_RELEASE_KEY_FINGERPRINT}`);
		expect(tableAssetLines(table).map((l) => l.split('  ')[1])).toEqual(
			BUN_ASSETS.map((a) => `${a}.zip`),
		);
	});

	test('the committed key is ONE primary key with the pinned fingerprint (computed in TS)', () => {
		expect(primaryFingerprint(dearmorPublicKey(key))).toBe(BUN_RELEASE_KEY_FINGERPRINT);
	});

	test('the kernel floor is held with the pin', () => {
		expect(BUN_PIN_KERNEL_FLOOR.pin).toBe(pinned);
		expect(BUN_KERNEL_FLOOR).toBe(BUN_PIN_KERNEL_FLOOR.floor);
	});

	test('the committed .asc is one clearsigned document with nothing outside the armour', () => {
		expect(ascShapeProblem(asc)).toBeNull();
		expect(existsSync(join(ROOT, 'ci/bun/SHASUMS256.txt'))).toBe(false);
	});

	test.skipIf(!signatureLeg)(
		'gpgv verifies the .asc and the table equals its signed payload (skipped on Darwin without gpgv)',
		() => {
			expect(gpgv, `${GPGV_MISSING} — and in the CI image (apt install gpgv)`).not.toBeNull();
			const payload = verifiedPayload(asc, key, { gpgv: gpgv as string });
			expect(tableAssetLines(table)).toEqual(payloadAssetLines(payload));
		},
	);

	test.skipIf(!signatureLeg)(
		'mutations: an unsigned line after the armour, an edited payload line, another key — each refused',
		() => {
			const tools = { gpgv: gpgv as string };
			const unsigned = `${asc}${'0'.repeat(64)}  bun-linux-x64.zip\n`;
			expect(() => verifiedPayload(unsigned, key, tools)).toThrow(/after its signature/);
			const line = payloadAssetLines(verifiedPayload(asc, key, tools))[2] as string;
			const edited = asc.replace(
				line,
				`${line.slice(0, 63)}${line[63] === '0' ? '1' : '0'}${line.slice(64)}`,
			);
			expect(edited).not.toBe(asc);
			expect(() => verifiedPayload(edited, key, tools)).toThrow(/BADSIG/);
			expect(() => verifiedPayload(asc, key, tools, 'B'.repeat(40))).toThrow(
				/release key: the primary key is F3DC[0-9A-F]{36}, the pin is B{40}/,
			);
		},
	);

	test('the status rules (§1.3 step 3)', () => {
		const F = BUN_RELEASE_KEY_FINGERPRINT;
		const good = `[GNUPG:] NEWSIG\n[GNUPG:] GOODSIG 8EAB4D40A7B22B59 R\n[GNUPG:] VALIDSIG ${F} 2026-09-05 1 0 4 0 22 10 01 ${F}\n`;
		expect(statusProblem(good, F)).toBeNull();
		expect(statusProblem(`${good}[GNUPG:] NEWSIG\n`, F)).toMatch(/2 NEWSIG/);
		expect(statusProblem(good.replace(/\[GNUPG:\] GOODSIG.*\n/, ''), F)).toMatch(/0 GOODSIG/);
		expect(statusProblem(good.replace(new RegExp(`${F}\\n$`), `${'C'.repeat(40)}\n`), F)).toMatch(
			/primary key/,
		);
		for (const bad of [
			'BADSIG',
			'ERRSIG',
			'EXPSIG',
			'EXPKEYSIG',
			'KEYEXPIRED',
			'KEYREVOKED',
			'REVKEYSIG',
			'NO_PUBKEY',
		]) {
			expect(statusProblem(`${good}[GNUPG:] ${bad} x\n`, F)).toBe(`gpgv reported ${bad}`);
		}
	});

	test('the armour: an altered body fails its CRC; text outside the armour is refused', () => {
		const lines = key.split('\n');
		const body = lines.findIndex((l) => l.startsWith('mDMEY'));
		const flipped = [...lines];
		flipped[body] =
			`${(lines[body] as string).slice(0, 10)}${(lines[body] as string)[10] === 'A' ? 'B' : 'A'}${(lines[body] as string).slice(11)}`;
		expect(() => dearmorPublicKey(flipped.join('\n'))).toThrow(/CRC-24/);
		expect(() => dearmorPublicKey(`junk\n${key}`)).toThrow(/outside the armour/);
		expect(() => dearmorPublicKey(key.replace(/^=.*\n/m, ''))).toThrow(/CRC-24 line/);
	});

	test('gpg --show-keys: exactly one pub, its fpr directly after', () => {
		const F = BUN_RELEASE_KEY_FINGERPRINT;
		const one = `pub:-:255:22:8EAB4D40A7B22B59:1674678294:::-:::scESC:::::ed25519:::0:\nfpr:::::::::${F}:\nsub:-:255:18:36FA:1::::::e:::::cv25519::\nfpr:::::::::8CDF8ECABE81CE3F32AC047236FA8E877B80AB05:\n`;
		expect(showKeysProblem(one, F)).toBeNull();
		expect(showKeysProblem(`${one}${one}`, F)).toMatch(/2 pub/);
		expect(showKeysProblem(one.replace(`fpr:::::::::${F}:\n`, ''), F)).toMatch(
			/no fpr|primary key/,
		);
		expect(showKeysProblem(one, 'D'.repeat(40))).toMatch(/primary key/);
	});
});
