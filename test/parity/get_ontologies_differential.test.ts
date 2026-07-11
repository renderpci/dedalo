/**
 * Workstream B gate: tool_ontology_parser::get_ontologies vs live PHP, plus the
 * developer security gates. get_ontologies is READ-ONLY (no writes), so it is
 * safe to run against the live core ontology.
 *
 * Diffs the resolved ontology descriptor list ({target_section_tipo, tld, name,
 * typology_id, typology_name}) between engines, and pins:
 *  - a non-developer principal is refused ('unauthorized');
 *  - export_ontologies is unregistered → 'unauthorized_method';
 *  - empty options passes the developer gate (the copied client sends options:{}).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dispatchToolRequest } from '../../src/core/tools/dispatch.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

interface OntologyDescriptor {
	target_section_tipo: string;
	tld: string;
	name: string | null;
	typology_id: number | null;
	typology_name: string | null;
}

function sortByTld(list: OntologyDescriptor[]): OntologyDescriptor[] {
	return [...list].sort(
		(a, b) =>
			a.tld.localeCompare(b.tld) || a.target_section_tipo.localeCompare(b.target_section_tipo),
	);
}

const captured: { php?: OntologyDescriptor[]; ts?: OntologyDescriptor[] } = {};

const GET_ONTOLOGIES_RQO = {
	action: 'tool_request',
	dd_api: 'dd_tools_api',
	source: { model: 'tool_ontology_parser', action: 'get_ontologies' },
	options: {},
};

beforeAll(async () => {
	if (!hasPhpCredentials()) return;

	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpResponse = await php.call(GET_ONTOLOGIES_RQO);
	captured.php = (phpResponse.body.result as OntologyDescriptor[]) ?? [];

	const principal = await resolvePrincipal(-1);
	const tsResponse = await dispatchToolRequest(
		principal,
		-1,
		GET_ONTOLOGIES_RQO.source,
		GET_ONTOLOGIES_RQO.options,
	);
	captured.ts = (tsResponse.result as OntologyDescriptor[]) ?? [];
}, 60000);

describe.if(hasPhpCredentials())('get_ontologies differential', () => {
	test('same ontology descriptor set (tld + target_section_tipo + typology_id)', () => {
		if (!hasPhpCredentials()) return;
		const php = sortByTld(captured.php ?? []).map((d) => ({
			target_section_tipo: d.target_section_tipo,
			tld: d.tld,
			typology_id: d.typology_id,
		}));
		const ts = sortByTld(captured.ts ?? []).map((d) => ({
			target_section_tipo: d.target_section_tipo,
			tld: d.tld,
			typology_id: d.typology_id,
		}));
		expect(ts).toEqual(php);
	});

	test('names match per tld', () => {
		if (!hasPhpCredentials()) return;
		const phpNames = new Map(sortByTld(captured.php ?? []).map((d) => [d.tld, d.name]));
		const tsNames = new Map(sortByTld(captured.ts ?? []).map((d) => [d.tld, d.name]));
		expect([...tsNames.entries()].sort()).toEqual([...phpNames.entries()].sort());
	});
});

describe.if(hasPhpCredentials())('developer security gates', () => {
	test('non-developer principal is refused', async () => {
		if (!hasPhpCredentials()) return;
		const nonDev = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
		const response = await dispatchToolRequest(nonDev, 999999, GET_ONTOLOGIES_RQO.source, {});
		expect(response.result).toBe(false);
	});

	test('export_ontologies is REGISTERED and developer-gated (refuses a non-developer)', async () => {
		if (!hasPhpCredentials()) return;
		// The action landed 2026-07-09 (tools prod-readiness pass) — the old
		// "unregistered → unauthorized_method" pin went stale and, worse, its
		// superuser call actually RAN a full dd export (5s+ → timeout red). Pin
		// the CURRENT contract instead: registered (never unauthorized_method)
		// and developer-only — asserted with a refused non-developer, so the
		// gate never triggers a real export.
		const nonDev = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
		const response = await dispatchToolRequest(
			nonDev,
			999999,
			{ model: 'tool_ontology_parser', action: 'export_ontologies' },
			{ selected_ontologies: ['dd'] },
		);
		expect(response.result).toBe(false);
		expect(response.errors ?? []).not.toContain('unauthorized_method');
	});

	test('empty options passes the developer gate', async () => {
		if (!hasPhpCredentials()) return;
		const principal = await resolvePrincipal(-1);
		const response = await dispatchToolRequest(principal, -1, GET_ONTOLOGIES_RQO.source, {});
		expect(Array.isArray(response.result)).toBe(true);
	});
});
