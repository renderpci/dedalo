/**
 * The install wizard's two injection chokepoints (2026-07-28 security audit).
 *
 * CMD-01 — `assertSafeConnField`: the posted psql connection fields used to
 * reach the argv as bare positionals; a `--command=\! sh`-shaped database was
 * parsed by psql as an OPTION → host command execution. Every field is now
 * flagged (`--dbname=…`) AND screened for an option-shape (`-…`) or a control
 * character.
 *
 * OPS-02 — `envQuote`: a CR/LF in a wizard value cannot live in a line-based
 * `.env`; the tail would parse as a SEPARATE `KEY=value` line → arbitrary-key
 * injection through `persist_config`. envQuote now REFUSES it.
 */

import { describe, expect, test } from 'bun:test';
import { envQuote } from '../../src/core/install/config_persist.ts';
import { assertSafeConnField } from '../../src/core/install/pg_exec.ts';

describe('CMD-01 — psql connection-field guard', () => {
	test('rejects an option-shaped value (the injection)', () => {
		expect(() => assertSafeConnField('database', '--command=\\! sh')).toThrow();
		expect(() => assertSafeConnField('database', '-h')).toThrow();
		expect(() => assertSafeConnField('user', '--username=postgres')).toThrow();
	});

	test('rejects control characters', () => {
		expect(() => assertSafeConnField('database', 'db\nname')).toThrow();
		expect(() => assertSafeConnField('host', 'host\rx')).toThrow();
		expect(() => assertSafeConnField('database', 'db\0name')).toThrow();
	});

	test('accepts ordinary Postgres identifiers', () => {
		expect(() => assertSafeConnField('database', 'dedalo_mib_v7')).not.toThrow();
		expect(() => assertSafeConnField('host', 'localhost')).not.toThrow();
		expect(() => assertSafeConnField('host', '/tmp')).not.toThrow(); // unix socket dir
		expect(() => assertSafeConnField('user', 'render')).not.toThrow();
	});
});

describe('OPS-02 — .env value guard', () => {
	test('refuses a newline-bearing value (arbitrary-key injection)', () => {
		expect(() => envQuote('ok\nDEDALO_BINARY_BASE=/tmp/evil')).toThrow();
		expect(() => envQuote('ok\r\nKEY=x')).toThrow();
		expect(() => envQuote('a\0b')).toThrow();
	});

	test('still quotes/round-trips ordinary values', () => {
		expect(envQuote('')).toBe('""');
		expect(envQuote('simple')).toBe('simple');
		expect(envQuote('has space')).toBe('"has space"');
		expect(envQuote('quote"inside')).toBe('"quote\\"inside"');
	});
});
