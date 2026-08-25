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
 *
 * ── RETIRED 2026-08-23 (DEC-14b) ──
 * The frozen body is the monedaiberica install's ~230-TLD REGISTERED-ontology
 * census — a fact about which install is loaded, not about the engine
 * (verified: the frozen TLD set and the suite DB's `SELECT DISTINCT tld FROM
 * dd_ontology` are disjoint). THE HONEST REPLACEMENT EXISTS:
 * `test/unit/get_ontologies_native.test.ts` seeds scratch ontology35 rows
 * (zz* TLDs, reserved id band) and asserts the census DERIVATION — the
 * five-field descriptor incl. the typology-name hop, the non-fatal tld-less
 * skip into the `errors` extension key, the activeOnly hierarchy4 filter —
 * plus UNGATED copies of the three developer security tests below (fully
 * native, needlessly credential-gated here). Mapping:
 * engineering/ORACLE_HARVEST.md. This file stays as the frozen record of the
 * decommissioned install's census and stays red on the suite DB by
 * construction.
 *
 * @twinned-by   test/unit/get_ontologies_native.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dispatchToolRequest } from '../../src/core/tools/dispatch.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

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
	// Envelope v2: `data` IS the flat descriptor array (the census notes ride
	// beside it as the `errors` extension key).
	captured.ts = (Array.isArray(tsResponse.data) ? tsResponse.data : []) as OntologyDescriptor[];
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
		// Envelope v2: the tool dispatch gates REFUSE BY THROWING (tools_dispatch.test.ts).
		const thrown = await dispatchToolRequest(nonDev, 999999, GET_ONTOLOGIES_RQO.source, {}).catch(
			(error: unknown) => error,
		);
		expect((thrown as { code?: string }).code).toBe('tool.not_authorized');
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
		const thrown = await dispatchToolRequest(
			nonDev,
			999999,
			{ model: 'tool_ontology_parser', action: 'export_ontologies' },
			{ selected_ontologies: ['dd'] },
		).catch((error: unknown) => error);
		// refused (thrown), and NOT as an unregistered method
		expect(typeof (thrown as { code?: string }).code).toBe('string');
		expect((thrown as { code?: string }).code).not.toBe('tool.method_not_allowed');
	});

	test('empty options passes the developer gate', async () => {
		if (!hasPhpCredentials()) return;
		const principal = await resolvePrincipal(-1);
		const response = await dispatchToolRequest(principal, -1, GET_ONTOLOGIES_RQO.source, {});
		// Envelope v2: `data` IS the flat list (the census notes ride beside it as
		// the `errors` extension key, never nested in `data`).
		expect(Array.isArray(response.data)).toBe(true);
		expect(Array.isArray((response as { errors?: unknown }).errors)).toBe(true);
	});
});
