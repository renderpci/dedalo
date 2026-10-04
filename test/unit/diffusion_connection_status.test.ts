/**
 * `get_diffusion_info` → `section_diffusion_nodes[].connection_status` — the
 * WIRE SHAPE the tool_diffusion accordion panel consumes (WC-065, 2026-07-29).
 *
 * THE BUG THIS GATE CLOSES: `src/diffusion/api/info.ts` emitted a BARE STRING
 * (`'ok' | 'unavailable'`) stamped from the writer registry. The client
 * (`tools/tool_diffusion/js/render_tool_diffusion.js:594-611`) reads an OBJECT:
 * it gates on truthiness, then reads `.ok === true` for the css class and
 * `.message` for the text (WC-2026-08-15-diffusion-connection-status-ok-message;
 * PHP-era `{result,msg}` retired by the P1 error sweep). A string is truthy → the "Connection status" LABEL
 * rendered, `'ok'.msg` is undefined → the VALUE rendered BLANK, and
 * `'ok' === true` is false → the row silently got class `value fail`. The PHP
 * oracle (`diffusion/class.diffusion_utils.php:971 get_connection_status`)
 * returned `{result, msg}` for sql targets and NULL for every other type (the
 * row disappears).
 *
 * WHY EACH ASSERTION EXISTS — three independent failure modes, each of which
 * leaves the panel broken on its own:
 * 1. the TYPE pin: a regression to a string union must fail `bunx tsc --noEmit`
 *    even if no runtime assertion runs;
 * 2. the SHAPE assertions: `{ok:boolean, message:string}` or null, and NEVER a
 *    bare string — the literal client contract;
 * 3. the NULLITY rule: non-MariaDB-target formats emit null (PHP's
 *    `default: // ignore` at :1002), so the row is omitted rather than
 *    reporting a meaningless verdict for an rdf/xml/markdown element.
 * Plus a SINGLE-SOURCE pin (the MariaDB-target format list is shared with the
 * plan compiler, never forked) and a CLIENT pin (the consumer still reads
 * `.result`/`.msg`), which weld the two ends together.
 *
 * THE REAL PAYLOAD IS BUILT, NOT BORROWED (review 2026-09-30). The payload leg used
 * to call `buildDiffusionInfo('dd1190')` on whatever the ambient ontology carried and
 * `return` green when it produced no panel — measured on the l3 suite lane: it logged
 * "asserted nothing" and reported a pass, inside the MariaDB tier set that claims
 * `skipped === 0` per file (the PUB-05 class: a MariaDB leg that runs nothing, green).
 * It now provisions the `zzd` situation (test/helpers/zzd_diffusion_fixture.ts: a
 * domain named after DEDALO_DIFFUSION_DOMAIN whose two sql elements publish `test3`
 * into `zzd_probe_db` / `zzd_probe_db_two`, plus rdf/xml/csv elements on other
 * sections), acquires both target databases on the lane's suite server, and asserts the
 * EXACT panels of `test3`: two sql tables, each carrying a READY verdict from the REAL
 * probe of the database its element names. An empty payload is a failure, never a pass.
 *
 * Every probe is INJECTED except the memo leg and the payload leg, which run the REAL
 * probe — so each acquires the lane's suite MariaDB first (`requireSuiteMariadb`, PUB-05) and probes
 * two databases whose verdicts are fixed by the suite, not by the machine: a suite
 * target (ready) and the granted-never-created control (not ready, errno 1049). It
 * used to probe an arbitrary absent name with no server acquired, which on a
 * developer machine reached the INSTALLATION's MariaDB through the driver's TCP
 * fallback, and whose verdict changed with whatever was listening.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildDiffusionInfo,
	connectionStatusForElement,
	type DiffusionConnectionStatus,
	type SectionDiffusionNode,
} from '../../src/diffusion/api/info.ts';
import { isMariadbTargetFormat, TABLE_FORMATS } from '../../src/diffusion/plan/formats.ts';
import {
	closeAllTargetPools,
	getTargetDatabaseStatus,
} from '../../src/diffusion/targets/mariadb/db.ts';
import { GRANTED_ABSENT_CONTROL_DB, requireSuiteMariadb } from '../helpers/suite_mariadb.ts';
import {
	countZzdOntology,
	dropZzdOntology,
	FILE_PANELS,
	FILE_SECTION,
	SQL_PANELS,
	SQL_SECTION,
	seedZzdOntology,
	zzdTargetDatabases,
} from '../helpers/zzd_diffusion_fixture.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

/** The PHP oracle's verbatim strings (class.diffusion_utils.php:984 / :988). */
const MSG_READY = 'Database is ready.';
const MSG_NOT_READY = 'Database is NOT ready (missing or engine unreachable).';

// --- 1. type pin (compile-time; a string-union regression fails tsc) ---------
type Probe = SectionDiffusionNode['connection_status'];
const _pinNull: Probe = null;
const _pinObject: Probe = { ok: true, message: MSG_READY };

/** Every non-MariaDB format the compiler knows, plus the "no element" case. */
const NON_TABLE_TYPES: (string | null)[] = ['rdf', 'xml', 'markdown', 'csv', 'json', null];

describe('connection_status — the shape the accordion panel consumes', () => {
	test('the type pin accepts null and {ok,message} (and nothing else)', () => {
		expect(_pinNull).toBeNull();
		expect(_pinObject).toEqual({ ok: true, message: MSG_READY });
	});

	test('non-MariaDB-target formats emit NULL (PHP: the row disappears)', async () => {
		for (const type of NON_TABLE_TYPES) {
			const status = await connectionStatusForElement(type, 'anything', 'dd_test', async () => {
				throw new Error('the probe must never run for a non-table format');
			});
			expect(status).toBeNull();
		}
	});

	test('MariaDB-target formats emit an OBJECT, never a bare string', async () => {
		for (const type of [...TABLE_FORMATS]) {
			const status = await connectionStatusForElement(type, 'web_test_db', 'dd_test', async () => ({
				ok: true,
				message: MSG_READY,
			}));
			expect(typeof status).not.toBe('string');
			expect(status).not.toBeNull();
			const value = status as DiffusionConnectionStatus;
			expect(Object.keys(value).sort()).toEqual(['message', 'ok']);
			expect(typeof value.ok).toBe('boolean');
			expect(typeof value.message).toBe('string');
			expect(value.message.length).toBeGreaterThan(0);
		}
	});

	test('a reachable target yields the oracle ready verdict', async () => {
		const status = await connectionStatusForElement('sql', 'web_test_db', 'dd_test', async () => ({
			ok: true,
			message: MSG_READY,
		}));
		expect(status).toEqual({ ok: true, message: MSG_READY });
	});

	test('a probe THROW degrades to a coded negative verdict — never a broken panel', async () => {
		const status = await connectionStatusForElement('sql', 'web_test_db', 'dd_test', async () => {
			throw new Error('ECONNREFUSED');
		});
		expect(status).toEqual({
			ok: false,
			code: 'diffusion.connection_failed',
			message: MSG_NOT_READY,
		});
	});

	test('an unresolvable target database is NOT ready (never a throw)', async () => {
		for (const database of [null, '']) {
			const status = await connectionStatusForElement('sql', database, 'dd_test', async () => {
				throw new Error('the probe must never run without a database name');
			});
			expect(status).toEqual({
				ok: false,
				code: 'diffusion.connection_failed',
				message: MSG_NOT_READY,
			});
		}
	});
});

describe('connection_status — the per-database memo (N panels, ONE round-trip)', () => {
	const target = zzdTargetDatabases()[0] as string;

	beforeAll(async () => {
		// The real probe connects: only ever to the lane's suite server (never the TCP
		// fallback a missing socket would take).
		await requireSuiteMariadb(import.meta.path, [target]);
	}, 120_000);

	afterAll(async () => {
		// Also the lifecycle claim in the module_state_tripwire allowlist entry.
		await closeAllTargetPools();
	});

	test('a repeated database inside the TTL reuses the SAME verdict object — ready and not-ready alike', async () => {
		// A memo hit is proven by object IDENTITY (no second round-trip), on a verdict
		// the suite fixes: a marked target is ready, the granted-never-created control
		// is not (a failed probe is a valid verdict and still populates the memo).
		for (const [database, ready] of [
			[target, true],
			[GRANTED_ABSENT_CONTROL_DB, false],
		] as const) {
			const first = await getTargetDatabaseStatus(database);
			const second = await getTargetDatabaseStatus(database);
			expect(second).toBe(first);
			expect(first.ok, database).toBe(ready);
			expect(first.message).toBe(ready ? MSG_READY : MSG_NOT_READY);
		}
	});
});

describe('connection_status — single source of truth and client welding', () => {
	test('the MariaDB-target format list is the plan compiler’s, not a fork', () => {
		const compile = read('src/diffusion/plan/compile.ts');
		const info = read('src/diffusion/api/info.ts');
		expect(compile).toContain("from './formats.ts'");
		expect(info).toContain("from '../plan/formats.ts'");
		// The literal set exists exactly once, in the leaf module.
		expect(read('src/diffusion/plan/formats.ts')).toContain("'sql', 'socrata'");
		expect(compile).not.toContain("new Set(['sql', 'socrata'])");
		expect(info).not.toContain("new Set(['sql', 'socrata'])");
		expect(isMariadbTargetFormat('sql')).toBe(true);
		expect(isMariadbTargetFormat('rdf')).toBe(false);
		expect(isMariadbTargetFormat(null)).toBe(false);
	});

	test('connection_status is no longer stamped from the writer registry', () => {
		const info = read('src/diffusion/api/info.ts');
		expect(info).not.toContain('connection_status: type !== null && WRITER_REGISTRY.has(type)');
		expect(info).not.toContain("'ok' : 'unavailable'");
	});

	test('the probe addresses the SANITIZED database, exactly like the writer', async () => {
		// getDatabaseNameForElement returns the RAW institution-editable ontology
		// label. The publish plan (compile.ts:576) and the delete map
		// (diffusion_map.ts:488) both run it through requireSqlIdentifier, which
		// NORMALIZES. If the panel probed the raw label it would address a
		// different database than the one published to and report a healthy
		// target as dead — the DIFF-A raw-vs-sanitized drift, read side.
		for (const [rawLabel, expected] of [
			['Web_MDCAT', 'web_mdcat'],
			['Web MDCAT', 'web_mdcat'],
			['web_mdcat', 'web_mdcat'],
		] as const) {
			const probed: string[] = [];
			const status = await connectionStatusForElement('sql', rawLabel, 'dd_test', async (db) => {
				probed.push(db);
				return { ok: true, message: MSG_READY };
			});
			expect(probed).toEqual([expected]);
			expect(status).toEqual({ ok: true, message: MSG_READY });
		}
	});

	test('a label that cannot yield an identifier degrades, it does not throw', async () => {
		let ran = false;
		const status = await connectionStatusForElement('sql', '///', 'dd_test', async () => {
			ran = true;
			return { ok: true, message: MSG_READY };
		});
		expect(ran).toBe(false);
		expect(status).toEqual({
			ok: false,
			code: 'diffusion.connection_failed',
			message: MSG_NOT_READY,
		});
	});

	// (!) CLIENT SWEEP PENDING. The server now emits `{ok, code?, message}`; the
	// shipped client still reads `.result` / `.msg`
	// (tools/tool_diffusion/js/render_tool_diffusion.js:594-611 and its
	// client/dedalo twin). The welding assertion is therefore expressed against
	// the SERVER shape — it goes green again, against the client, when the
	// client half of this sweep lands.
	test('the emitted verdict carries the fields a panel branches on', () => {
		const info = read('src/diffusion/api/info.ts');
		expect(info).toContain("code: 'diffusion.connection_failed'");
		expect(info).not.toContain('msg: MSG_DATABASE_NOT_READY');
	});
});

describe('connection_status — the real get_diffusion_info payload', () => {
	// The situation, not the ambient ontology: the fixture's table nodes that relate to
	// SQL_SECTION, each under an sql element whose `database` child names a suite target.
	const EXPECTED_PANELS = SQL_PANELS;

	beforeAll(async () => {
		await requireSuiteMariadb(import.meta.path, zzdTargetDatabases());
		const { preCount } = await seedZzdOntology();
		expect(preCount).toBe(0);
	}, 120_000);

	afterAll(async () => {
		await closeAllTargetPools();
		await dropZzdOntology();
		expect(await countZzdOntology()).toBe(0);
	});

	test('the situation declares exactly the databases the panels must probe', () => {
		expect([...zzdTargetDatabases()].sort()).toEqual(
			EXPECTED_PANELS.map((panel) => panel.database).sort(),
		);
	});

	test('every emitted node carries null or {ok,message} (never a string) — and the sql panels are READY on the real probe', async () => {
		const { section_diffusion_nodes } = await buildDiffusionInfo(SQL_SECTION);
		// Never vacuous: the situation guarantees these panels; an empty or partial
		// payload is the defect this leg exists to catch, not a reason to pass.
		const byTipo = new Map(section_diffusion_nodes.map((node) => [node.tipo, node]));
		for (const expected of EXPECTED_PANELS) {
			const node = byTipo.get(expected.tipo);
			if (node === undefined)
				throw new Error(
					`buildDiffusionInfo('${SQL_SECTION}') emitted no panel for ${expected.tipo} (panels: ${[...byTipo.keys()].join(', ') || 'none'}) — the fixture situation's sql table is not reaching the payload`,
				);
			expect(node.type, expected.tipo).toBe('sql');
			expect(
				node.parents.some((parent) => parent.tipo === expected.element),
				`${expected.tipo} must sit under its sql element ${expected.element}`,
			).toBe(true);
			// The REAL probe, on the database the element names — ready, because the
			// suite server holds that database for this lane (acquired above).
			expect(node.connection_status, expected.tipo).toEqual({ ok: true, message: MSG_READY });
		}
		for (const node of section_diffusion_nodes) {
			const status = node.connection_status;
			expect(typeof status).not.toBe('string');
			if (status === null) {
				expect(isMariadbTargetFormat(node.type)).toBe(false);
				continue;
			}
			expect(isMariadbTargetFormat(node.type)).toBe(true);
			expect(typeof status.ok).toBe('boolean');
			expect(typeof status.message).toBe('string');
		}
	});

	test('a non-MariaDB element in the same situation emits NULL through the real payload', async () => {
		// FILE_SECTION is published only by the rdf and xml elements: its panels must
		// exist and carry no verdict (PHP: the row disappears).
		const { section_diffusion_nodes } = await buildDiffusionInfo(FILE_SECTION);
		expect(section_diffusion_nodes.map((node) => node.tipo).sort()).toEqual([...FILE_PANELS]);
		for (const node of section_diffusion_nodes) {
			expect(isMariadbTargetFormat(node.type), node.tipo).toBe(false);
			expect(node.connection_status, node.tipo).toBeNull();
		}
	});
});
