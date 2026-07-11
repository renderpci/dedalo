/**
 * Phase 3/6 gate: count with SQO mode 'related' (+ group_by) vs live PHP —
 * the relation_list paginator total and its per-section breakdown.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

function countRqo(groupBy?: string[]): Record<string, unknown> {
	return {
		action: 'count',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: 'numisdata308',
			section_tipo: 'numisdata6',
			section_id: '1',
			action: 'count',
			mode: 'edit',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['all'],
			mode: 'related',
			filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '1' }],
			...(groupBy !== undefined ? { group_by: groupBy } : {}),
		},
	};
}

async function tsCount(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const result = await dispatchRqo(
		structuredClone(rqo) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	return (result.body as { result?: Record<string, unknown> }).result ?? {};
}

let php: PhpApiClient | null = null;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
});

async function phpCount(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
	const result =
		(
			(await (php as PhpApiClient).call(structuredClone(rqo))).body as {
				result?: Record<string, unknown>;
			}
		).result ?? {};
	const { debug: _debug, ...rest } = result;
	return rest;
}

describe.if(hasPhpCredentials())('related count differential (relation_list totals)', () => {
	test('the plain total matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const phpResult = await phpCount(countRqo());
		const tsResult = await tsCount(countRqo());
		expect(Number(phpResult.total)).toBeGreaterThan(0);
		expect(tsResult).toEqual(phpResult);
	});

	test('group_by section_tipo yields the same per-group totals', async () => {
		if (!hasPhpCredentials()) return;
		const phpResult = await phpCount(countRqo(['section_tipo']));
		const tsResult = await tsCount(countRqo(['section_tipo']));
		expect(tsResult.total).toEqual(phpResult.total);
		// PHP appends one entry per UNION-arm row; order can differ — compare sorted.
		const sortKey = (entry: { key: string[]; value: number }): string =>
			`${entry.key.join('|')}=${entry.value}`;
		const phpGroups = ((phpResult.totals_group ?? []) as { key: string[]; value: number }[])
			.map(sortKey)
			.sort();
		const tsGroups = ((tsResult.totals_group ?? []) as { key: string[]; value: number }[])
			.map(sortKey)
			.sort();
		expect(tsGroups).toEqual(phpGroups);
	});

	test('invalid group_by identifiers are dropped (never interpolated)', async () => {
		const result = await tsCount(countRqo(['section_tipo; DROP TABLE matrix', 'section_tipo']));
		expect(Number(result.total)).toBeGreaterThan(0);
		const groups = (result.totals_group ?? []) as { key: string[] }[];
		// Only the valid identifier survived — keys have exactly one element.
		expect(groups.every((group) => group.key.length === 1)).toBe(true);
	});
});
