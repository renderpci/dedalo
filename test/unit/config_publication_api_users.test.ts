/**
 * API_WEB_USER_CODE_MULTIPLE reader (readPublicationApiUsers) — the publication_api
 * maintenance widget's Swagger-docu buttons come from it. The api_ui address reaches
 * window.open, so only http(s)/root-relative survives.
 */

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { readPublicationApiUsers } from '../../src/config/readers.ts';

const ROOT = join(import.meta.dir, '..', '..');

const KEY = 'API_WEB_USER_CODE_MULTIPLE';
const saved = process.env[KEY];

afterEach(() => {
	if (saved === undefined) delete process.env[KEY];
	else process.env[KEY] = saved;
});

const read = (value: string) => {
	process.env[KEY] = value;
	const errors = spyOn(console, 'error').mockImplementation(() => {});
	try {
		return { users: readPublicationApiUsers(KEY), logged: errors.mock.calls.length };
	} finally {
		errors.mockRestore();
	}
};

describe('readPublicationApiUsers', () => {
	test('valid entries pass, api_ui defaults to null', () => {
		const { users, logged } = read(
			JSON.stringify([
				{ db_name: 'web_a', code: 'c1' },
				{ db_name: 'web_b', code: 'c2', api_ui: 'https://example.org/docu/ui/' },
				{ db_name: 'web_c', code: 'c3', api_ui: '/dedalo/publication/server_api/v1/docu/ui/' },
			]),
		);
		expect(users).toEqual([
			{ db_name: 'web_a', code: 'c1', api_ui: null },
			{ db_name: 'web_b', code: 'c2', api_ui: 'https://example.org/docu/ui/' },
			{ db_name: 'web_c', code: 'c3', api_ui: '/dedalo/publication/server_api/v1/docu/ui/' },
		]);
		expect(logged).toBe(0);
	});

	test('a non-http(s) api_ui is dropped to the default, loudly', () => {
		for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/']) {
			const { users, logged } = read(
				JSON.stringify([{ db_name: 'web_a', code: 'c', api_ui: bad }]),
			);
			expect(users).toEqual([{ db_name: 'web_a', code: 'c', api_ui: null }]);
			expect(logged).toBe(1);
		}
	});

	test('entries without string db_name/code are dropped, loudly', () => {
		const { users, logged } = read(
			JSON.stringify([
				{ db_name: 'web_a', code: 'c' },
				{ db_name: 'web_b' },
				{ code: 'x' },
				'str',
				null,
			]),
		);
		expect(users).toEqual([{ db_name: 'web_a', code: 'c', api_ui: null }]);
		expect(logged).toBe(1);
	});

	test('malformed / non-array JSON refuses to [], loudly', () => {
		for (const bad of ['web_a,code', '{"db_name":"web_a","code":"c"}']) {
			const { users, logged } = read(bad);
			expect(users).toEqual([]);
			expect(logged).toBe(1);
		}
	});

	// Empty only: deleting the key would fall through to ../private/.env (readEnv
	// precedence), which on an installation may hold real entries.
	test('empty = no users', () => {
		expect(read('').users).toEqual([]);
		expect(read('  ').users).toEqual([]);
	});
});

// The panel end: config is frozen at import, so the widget is booted in a child
// process with the key set. The widget's whole-body catch would answer [] on any
// failure, so a non-empty list proves the value reached the eager payload.
describe('publication_api widget', () => {
	test('serves the configured users as api_web_user_code_multiple', () => {
		const snippet = `const { widget } = await import('./src/core/area_maintenance/widgets/publication_api.ts');
const value = await widget.eagerValue();
console.log(JSON.stringify(value.api_web_user_code_multiple));
process.exit(0);`;
		const child = Bun.spawnSync(['bun', '-e', snippet], {
			cwd: ROOT,
			env: {
				...process.env,
				[KEY]: JSON.stringify([
					{ db_name: 'web_a', code: 'c1' },
					{ db_name: 'web_b', code: 'c2', api_ui: 'javascript:alert(1)' },
				]),
			} as Record<string, string>,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(child.exitCode).toBe(0);
		const lines = child.stdout.toString().trim().split('\n');
		expect(JSON.parse(lines[lines.length - 1] ?? '')).toEqual([
			{ db_name: 'web_a', code: 'c1', api_ui: null },
			{ db_name: 'web_b', code: 'c2', api_ui: null },
		]);
	}, 60_000);
});
