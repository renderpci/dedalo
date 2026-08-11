/**
 * `evaluateCredentialChecks` — the db_status credential fold extracted out of
 * `computeCheckConfig` (check_config.ts, comp 29) per plan §4.1.7.
 *
 * The extraction takes `live` as a PARAMETER. That is a precondition, not a
 * style choice: the inline version closed over `readEnv`, so any assertion
 * about it was a statement about THIS machine's ../private/.env — green here,
 * undefined on a clone. Same non-portability that produced the 87.
 *
 * The two arms that decide what an operator sees:
 *   (a) `emptyIsValid` on DB_PASSWORD — an EMPTY password is legitimate under
 *       peer/trust auth. Invert it and every peer-auth install reports
 *       config_pw_check=false and a red dashboard header on a healthy database.
 *   (c) `global_status` is the AND of config_check, the connection probe and
 *       the write probe. Make it an OR and a broken database paints green.
 *
 * `computeCheckConfig` itself is never called: it opens a real connection,
 * runs a write probe and stats the private config dir.
 */

import { describe, expect, test } from 'bun:test';
import { evaluateCredentialChecks } from '../../src/core/area_maintenance/widgets/check_config.ts';

const SOURCE_FILE = `${import.meta.dir}/../../src/core/area_maintenance/widgets/check_config.ts`;

/** A stand-in catalog: the shipped-template values, with the GAP-3 exemption. */
const PLACEHOLDERS = [
	{ key: 'DB_NAME', value: 'mydatabase', emptyIsValid: false },
	{ key: 'DB_USER', value: 'myuser', emptyIsValid: false },
	{ key: 'DB_PASSWORD', value: 'mypassword', emptyIsValid: true },
	{ key: 'ENTITY', value: 'myentity', emptyIsValid: false },
	{ key: 'DEDALO_ENTITY_LABEL', value: 'My entity', emptyIsValid: false },
];

/** A fully configured install. */
const CONFIGURED: Record<string, string> = {
	DB_NAME: 'dedalo_real',
	DB_USER: 'dedalo',
	DB_PASSWORD: 's3cret',
	ENTITY: 'museum',
	DEDALO_ENTITY_LABEL: 'The Museum',
};

const HEALTHY = { connection: true, writable: true };

describe('the placeholder comparison', () => {
	test('a fully configured install passes every check', () => {
		expect(evaluateCredentialChecks(CONFIGURED, PLACEHOLDERS, HEALTHY)).toEqual({
			config_db_name_check: true,
			config_user_name_check: true,
			config_pw_check: true,
			config_information_check: true,
			config_info_key_check: true,
			config_check: true,
			db_connection_check: true,
			db_writable_check: true,
			global_status: true,
		});
	});

	test('a live value EQUAL to the catalog placeholder fails its check', () => {
		const out = evaluateCredentialChecks(
			{ ...CONFIGURED, DB_NAME: 'mydatabase' },
			PLACEHOLDERS,
			HEALTHY,
		);
		expect(out.config_db_name_check).toBe(false);
		expect(out.config_check).toBe(false);
		expect(out.global_status).toBe(false);
		// the other four are untouched — the fold is per-key, not all-or-nothing
		expect(out.config_user_name_check).toBe(true);
		expect(out.config_pw_check).toBe(true);
	});

	test('the sample password specifically still fails, exemption or not', () => {
		const out = evaluateCredentialChecks(
			{ ...CONFIGURED, DB_PASSWORD: 'mypassword' },
			PLACEHOLDERS,
			HEALTHY,
		);
		expect(out.config_pw_check).toBe(false);
	});

	test('the comparison is EXACT, not substring or case-insensitive', () => {
		const out = evaluateCredentialChecks(
			{ ...CONFIGURED, DB_NAME: 'mydatabase_prod', DB_USER: 'MYUSER' },
			PLACEHOLDERS,
			HEALTHY,
		);
		expect(out.config_db_name_check).toBe(true);
		expect(out.config_user_name_check).toBe(true);
	});

	test('a key with no catalog rule is never "still on sample"', () => {
		// find() returns undefined ⇒ the check passes; without the `=== undefined`
		// guard the fold would throw on a catalog that drops a placeholder.
		const out = evaluateCredentialChecks(CONFIGURED, [], HEALTHY);
		expect(out.config_check).toBe(true);
		expect(out.global_status).toBe(true);
	});
});

describe('emptyIsValid — GAP-3, the peer/trust-auth install', () => {
	test('an EMPTY DB_PASSWORD passes: emptyIsValid true', () => {
		const out = evaluateCredentialChecks({ ...CONFIGURED, DB_PASSWORD: '' }, PLACEHOLDERS, HEALTHY);
		// Inverted, this is a red header on every healthy peer-auth database.
		expect(out.config_pw_check).toBe(true);
		expect(out.config_check).toBe(true);
		expect(out.global_status).toBe(true);
	});

	test('an EMPTY value FAILS wherever emptyIsValid is false', () => {
		const out = evaluateCredentialChecks({ ...CONFIGURED, DB_NAME: '' }, PLACEHOLDERS, HEALTHY);
		expect(out.config_db_name_check).toBe(false);
		expect(out.config_check).toBe(false);
	});

	test('an ABSENT key reads as empty, not as undefined', () => {
		const { ENTITY: _dropped, ...partial } = CONFIGURED;
		const out = evaluateCredentialChecks(partial, PLACEHOLDERS, HEALTHY);
		expect(out.config_info_key_check).toBe(false);
	});
});

describe('global_status is an AND across ALL three sources', () => {
	test('healthy credentials + a dead connection is NOT green', () => {
		const out = evaluateCredentialChecks(CONFIGURED, PLACEHOLDERS, {
			connection: false,
			writable: false,
		});
		expect(out.config_check).toBe(true);
		expect(out.db_connection_check).toBe(false);
		// `&&` → `||` here paints a broken database green.
		expect(out.global_status).toBe(false);
	});

	test('a connected but READ-ONLY database is not green either', () => {
		const out = evaluateCredentialChecks(CONFIGURED, PLACEHOLDERS, {
			connection: true,
			writable: false,
		});
		expect(out.global_status).toBe(false);
	});

	test('a perfect database with sample credentials is not green either', () => {
		const out = evaluateCredentialChecks(
			{ ...CONFIGURED, ENTITY: 'myentity' },
			PLACEHOLDERS,
			HEALTHY,
		);
		expect(out.db_connection_check).toBe(true);
		expect(out.db_writable_check).toBe(true);
		expect(out.global_status).toBe(false);
	});

	test('the probes are reported verbatim, not re-derived', () => {
		const out = evaluateCredentialChecks(CONFIGURED, PLACEHOLDERS, {
			connection: true,
			writable: false,
		});
		expect(out.db_connection_check).toBe(true);
		expect(out.db_writable_check).toBe(false);
	});
});

describe('the wire shape', () => {
	test('the client reads these nine keys, in this order', () => {
		// render_check_config.js paints one row per `db_status.*_check` by name;
		// a renamed or dropped key reads as undefined and the row goes red.
		expect(Object.keys(evaluateCredentialChecks(CONFIGURED, PLACEHOLDERS, HEALTHY))).toEqual([
			'config_db_name_check',
			'config_user_name_check',
			'config_pw_check',
			'config_information_check',
			'config_info_key_check',
			'config_check',
			'db_connection_check',
			'db_writable_check',
			'global_status',
		]);
	});

	test('every value is a real boolean, never a truthy string', () => {
		const out = evaluateCredentialChecks(CONFIGURED, PLACEHOLDERS, HEALTHY);
		for (const value of Object.values(out)) expect(typeof value).toBe('boolean');
	});
});

describe('the extraction is REWIRED, not duplicated', () => {
	test('computeCheckConfig calls the extraction with the LIVE map injected', async () => {
		const source = await Bun.file(SOURCE_FILE).text();
		expect(source).toContain('evaluateCredentialChecks(live, CATALOG_PLACEHOLDERS, {');
		// the inline fold is gone from computeCheckConfig
		const caller = source.slice(source.indexOf('async function computeCheckConfig'));
		expect(caller).not.toBe('');
		expect(caller).not.toContain('const stillOnSample =');
		expect(caller).not.toContain('!stillOnSample(');
		expect(caller).not.toContain('configCheck && dbConnectionCheck && dbWritableCheck');
		// each predicate survives EXACTLY ONCE, inside the extraction
		expect(source.split('const stillOnSample =').length - 1).toBe(1);
		expect(source.split('rule.emptyIsValid').length - 1).toBe(1);
	});

	test('the extraction reads no environment of its own', async () => {
		const source = await Bun.file(SOURCE_FILE).text();
		const body = source.slice(
			source.indexOf('export function evaluateCredentialChecks'),
			source.indexOf('async function computeCheckConfig'),
		);
		expect(body).not.toBe('');
		// An un-injected extraction asserts against THIS machine's .env.
		expect(body).not.toContain('readEnv');
		expect(body).not.toContain('process.env');
		expect(body).not.toContain('CATALOG_PLACEHOLDERS');
	});
});
