/**
 * `get_diffusion_info` → `section_diffusion_nodes[].connection_status` — the
 * WIRE SHAPE the tool_diffusion accordion panel consumes (WC-065, 2026-07-29).
 *
 * THE BUG THIS GATE CLOSES: `src/diffusion/api/info.ts` emitted a BARE STRING
 * (`'ok' | 'unavailable'`) stamped from the writer registry. The client
 * (`tools/tool_diffusion/js/render_tool_diffusion.js:594-611`) reads an OBJECT:
 * it gates on truthiness, then reads `.result === true` for the css class and
 * `.msg` for the text. A string is truthy → the "Connection status" LABEL
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
 * 2. the SHAPE assertions: `{result:boolean, msg:string}` or null, and NEVER a
 *    bare string — the literal client contract;
 * 3. the NULLITY rule: non-MariaDB-target formats emit null (PHP's
 *    `default: // ignore` at :1002), so the row is omitted rather than
 *    reporting a meaningless verdict for an rdf/xml/markdown element.
 * Plus a SINGLE-SOURCE pin (the MariaDB-target format list is shared with the
 * plan compiler, never forked) and a CLIENT pin (the consumer still reads
 * `.result`/`.msg`), which weld the two ends together.
 *
 * DB TIER (stated choice, per the no-silent-green rule): the real-payload check
 * is OPPORTUNISTIC. `buildDiffusionInfo` returns `{section_diffusion_nodes: []}`
 * whenever the virtual tree is null, which is the case on every box whose test
 * database lacks the configured DEDALO_DIFFUSION_DOMAIN — asserting over an
 * empty list would be silently green. So the contract is carried by the pure
 * helper + the type pin + the source pins (all DB-less and always run), and the
 * payload sweep asserts only when the tree actually produced panels, logging
 * loudly when it did not.
 *
 * MariaDB is NOT required: every probe is INJECTED except the memo test, which
 * deliberately targets a non-existent database (a failed probe is a valid
 * verdict and still populates the memo).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	type DiffusionConnectionStatus,
	type SectionDiffusionNode,
	buildDiffusionInfo,
	connectionStatusForElement,
} from '../../src/diffusion/api/info.ts';
import { TABLE_FORMATS, isMariadbTargetFormat } from '../../src/diffusion/plan/formats.ts';
import {
	closeAllTargetPools,
	getTargetDatabaseStatus,
} from '../../src/diffusion/targets/mariadb/db.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

/** The PHP oracle's verbatim strings (class.diffusion_utils.php:984 / :988). */
const MSG_READY = 'Database is ready.';
const MSG_NOT_READY = 'Database is NOT ready (missing or engine unreachable).';

// --- 1. type pin (compile-time; a string-union regression fails tsc) ---------
type Probe = SectionDiffusionNode['connection_status'];
const _pinNull: Probe = null;
const _pinObject: Probe = { result: true, msg: MSG_READY };

/** Every non-MariaDB format the compiler knows, plus the "no element" case. */
const NON_TABLE_TYPES: (string | null)[] = ['rdf', 'xml', 'markdown', 'csv', 'json', null];

describe('connection_status — the shape the accordion panel consumes', () => {
	test('the type pin accepts null and {result,msg} (and nothing else)', () => {
		expect(_pinNull).toBeNull();
		expect(_pinObject).toEqual({ result: true, msg: MSG_READY });
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
				result: true,
				msg: MSG_READY,
			}));
			expect(typeof status).not.toBe('string');
			expect(status).not.toBeNull();
			const value = status as DiffusionConnectionStatus;
			expect(Object.keys(value).sort()).toEqual(['msg', 'result']);
			expect(typeof value.result).toBe('boolean');
			expect(typeof value.msg).toBe('string');
			expect(value.msg.length).toBeGreaterThan(0);
		}
	});

	test('a reachable target yields the oracle ready verdict', async () => {
		const status = await connectionStatusForElement('sql', 'web_test_db', 'dd_test', async () => ({
			result: true,
			msg: MSG_READY,
		}));
		expect(status).toEqual({ result: true, msg: MSG_READY });
	});

	test('a probe THROW degrades to result:false — it never breaks the panel', async () => {
		const status = await connectionStatusForElement('sql', 'web_test_db', 'dd_test', async () => {
			throw new Error('ECONNREFUSED');
		});
		expect(status).toEqual({ result: false, msg: MSG_NOT_READY });
	});

	test('an unresolvable target database is NOT ready (never a throw)', async () => {
		for (const database of [null, '']) {
			const status = await connectionStatusForElement('sql', database, 'dd_test', async () => {
				throw new Error('the probe must never run without a database name');
			});
			expect(status).toEqual({ result: false, msg: MSG_NOT_READY });
		}
	});
});

describe('connection_status — the per-database memo (N panels, ONE round-trip)', () => {
	afterAll(async () => {
		// Also the lifecycle claim in the module_state_tripwire allowlist entry.
		await closeAllTargetPools();
	});

	test('a repeated database inside the TTL reuses the SAME verdict object', async () => {
		// A database that cannot exist: the verdict is result:false either way,
		// and a memo hit is proven by object IDENTITY (no second round-trip).
		const database = 'dedalo_probe_memo_absent_db';
		const first = await getTargetDatabaseStatus(database);
		const second = await getTargetDatabaseStatus(database);
		expect(second).toBe(first);
		expect(typeof first.result).toBe('boolean');
		expect(typeof first.msg).toBe('string');
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
				return { result: true, msg: MSG_READY };
			});
			expect(probed).toEqual([expected]);
			expect(status).toEqual({ result: true, msg: MSG_READY });
		}
	});

	test('a label that cannot yield an identifier degrades, it does not throw', async () => {
		let ran = false;
		const status = await connectionStatusForElement('sql', '///', 'dd_test', async () => {
			ran = true;
			return { result: true, msg: MSG_READY };
		});
		expect(ran).toBe(false);
		expect(status).toEqual({ result: false, msg: MSG_NOT_READY });
	});

	test('the client still reads .result and .msg off the object', () => {
		const client = read('tools/tool_diffusion/js/render_tool_diffusion.js');
		expect(client).toContain('node.connection_status.result===true');
		expect(client).toContain('node.connection_status.msg');
	});
});

describe('connection_status — the real get_diffusion_info payload', () => {
	test('every emitted node carries null or {result,msg} (never a string)', async () => {
		const { section_diffusion_nodes } = await buildDiffusionInfo('dd1190');
		if (section_diffusion_nodes.length === 0) {
			console.warn(
				'[test] no diffusion panels for dd1190 in this database — payload sweep asserted ' +
					'nothing (the pure-helper, type and source pins above carry the contract).',
			);
			return;
		}
		for (const node of section_diffusion_nodes) {
			const status = node.connection_status;
			expect(typeof status).not.toBe('string');
			if (status === null) {
				expect(isMariadbTargetFormat(node.type)).toBe(false);
				continue;
			}
			expect(isMariadbTargetFormat(node.type)).toBe(true);
			expect(typeof status.result).toBe('boolean');
			expect(typeof status.msg).toBe('string');
		}
	});
});
