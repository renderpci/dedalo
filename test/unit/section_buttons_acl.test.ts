/**
 * SECTION_SPEC §9 gate: section buttons are gated by the REAL per-button ACL
 * (PHP get_buttons_context: get_permissions(sectionTipo, buttonTipo) >= 2),
 * not the caller-level permission cap.
 *
 * White-box, principal-sensitivity: the same section yields the full button set
 * for a global admin and the grant-filtered set for a non-admin (user 16,
 * profile 8), driven through getPermissions against the real dd774 matrix.
 *
 * LEDGERED (no live fixture): the "entitled non-admin sees the buttons it is
 * granted" direction cannot be exercised on this install — profile 8 has NO
 * button granted >= 2 (every button grant is 0), so admin→full / non-admin→none
 * is the only observable spread. The keeps-direction is proven by construction
 * (the getPermissions >= 2 filter) and would gate live once a partial-button
 * profile or a live-PHP non-admin login exists.
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSectionButtons } from '../../src/core/section/buttons.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';

const SECTION = 'test6099'; // buttons: button_new 123, button_delete 124, button_trigger 672
const NON_ADMIN_USER = 16;

async function buttonChildTipos(sectionTipo: string): Promise<string[]> {
	const rows = (await sql`
		SELECT tipo FROM dd_ontology
		WHERE parent = ${sectionTipo} AND model LIKE 'button_%'
		ORDER BY order_number NULLS LAST, tipo
	`) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

describe('section buttons per-button ACL (SECTION_SPEC §9)', () => {
	test('a global admin sees every (non-excluded) section button', async () => {
		const superuser = await resolvePrincipal(-1);
		const buttons = await buildSectionButtons(SECTION, 3, superuser);
		const expected = await buttonChildTipos(SECTION);
		expect(buttons.map((button) => button.tipo)).toEqual(expected);
		// every emitted button carries the DDO wire markers.
		for (const button of buttons) {
			expect(button.typo).toBe('ddo');
			expect(button.type).toBe('button');
		}
	});

	test('a non-admin without button grants (>=2) sees no buttons', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		expect(principal.isGlobalAdmin).toBe(false);
		const buttons = await buildSectionButtons(SECTION, 1, principal);
		expect(buttons).toEqual([]);
	});

	test('the filter is per-button (principal), not the caller cap', async () => {
		// With a principal, callerPermissions is ignored: passing 3 (as if the
		// caller were admin) still yields nothing for a non-admin, because each
		// button is gated by its own getPermissions.
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		const buttons = await buildSectionButtons(SECTION, 3, principal);
		expect(buttons).toEqual([]);
	});

	// PHP get_buttons_context :4231-4305 (oracle: section_context_extras fixture,
	// test6415): a button_trigger DDO carries `properties` and `tools` —
	// each user tool with a matching properties.tool_config.<name> as a simple
	// context + ENRICHED tool_config (ddo_map 'self' resolved, model/
	// translatable/label stamped), the enrichment ALSO written back to the
	// button's own properties.tool_config (PHP mutates the shared object). The
	// client's open_tool consumes tools[0]; without it, opening the tool from a
	// list view throws "Cannot read properties of undefined (reading '0')".
	test('a button_trigger carries the tool contexts (properties + tools)', async () => {
		const superuser = await resolvePrincipal(-1);
		const buttons = await buildSectionButtons(SECTION, 3, superuser);

		// plain buttons: no properties/tools keys (dd_object drops null keys).
		const plain = buttons.find((button) => button.model === 'button_new');
		expect(plain).toBeDefined();
		expect(Object.keys(plain as object)).toEqual(['typo', 'type', 'tipo', 'model', 'label']);

		const trigger = buttons.find((button) => button.model === 'button_trigger');
		expect(trigger?.tipo).toBe('test6415');
		// wire key order (PHP dd_object declaration order).
		expect(Object.keys(trigger as object)).toEqual([
			'typo',
			'type',
			'tipo',
			'model',
			'properties',
			'label',
			'tools',
		]);
		const tool = (trigger?.tools as Record<string, unknown>[])[0] as {
			name: string;
			tool_config: { ddo_map: Record<string, unknown>[] };
		};
		expect(tool.name).toBe('tool_cataloging');
		// enriched ddo_map: every entry stamped with translatable + label.
		for (const entry of tool.tool_config.ddo_map) {
			expect(entry.translatable).not.toBeUndefined();
			expect(entry.label).not.toBeUndefined();
			expect(entry.tipo).not.toBe('self');
		}
		// the enrichment reaches the button's own properties.tool_config too.
		const buttonConfig = (
			trigger?.properties as { tool_config: { tool_cataloging: { ddo_map: unknown[] } } }
		).tool_config.tool_cataloging;
		expect(buttonConfig.ddo_map).toEqual(tool.tool_config.ddo_map);
	});
});
