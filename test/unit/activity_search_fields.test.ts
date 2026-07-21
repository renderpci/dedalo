/**
 * ACTIVITY (dd542) search-field restriction (WC-045, 2026-07-21).
 *
 * The edit-mode search "FIELDS" panel (dd_core_api::get_section_elements_context
 * → buildSectionElementsContext) appends the shared section-info group dd196
 * (Created/Modified by user + date, First/Last publication + user) to every
 * non-TM section, shown to global admins. On the append-only Activity log that
 * editorial metadata is meaningless as a search dimension, so dd542 omits the
 * dd196 group (and its children).
 *
 * The exclusion is dd542-SCOPED (SUPPRESS_SECTION_INFO), a sibling of WC-044's
 * dd542 list-sort restriction — not a global change to dd196, which is why the
 * scope-control section (dd128) still carries it for the same admin principal.
 * Model-level ar_components_exclude cannot express this: dd196's children are
 * date/relation models, the same models as legitimate activity fields.
 */

import { describe, expect, test } from 'bun:test';
import { ACTIVITY_SECTION_TIPO, AUDIT_TIPOS } from '../../src/core/concepts/section.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { buildSectionElementsContext } from '../../src/core/resolve/section_elements_context.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';

const SECTION_INFO_GROUP_TIPO = 'dd196';
const USERS_SECTION_TIPO = 'dd128'; // scope control (has its own elements → gets dd196)

interface Entry {
	tipo?: string;
	parent?: unknown;
}

async function elements(sectionTipo: string): Promise<Entry[]> {
	// resolvePrincipal(-1) is the global admin — the only role dd196 is ever
	// offered to, so the suppression is observable here (a non-admin never sees it).
	const principal = await resolvePrincipal(-1);
	return runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, () =>
		buildSectionElementsContext(principal, {
			ar_section_tipo: [sectionTipo],
		}),
	) as Promise<Entry[]>;
}

describe('activity search-field restriction (WC-045)', () => {
	test('dd542 omits the dd196 section-info group and every dd196 child', async () => {
		const ctx = await elements(ACTIVITY_SECTION_TIPO);
		const tipos = new Set(ctx.map((e) => e.tipo));

		// the group itself
		expect(tipos.has(SECTION_INFO_GROUP_TIPO)).toBe(false);
		// the four named audit children
		for (const child of Object.values(AUDIT_TIPOS)) {
			expect(tipos.has(child), `${child} (dd196 child) must be absent`).toBe(false);
		}
		// robust catch-all: no entry may hang under dd196 (covers the publication
		// children whose tipos are not hardcoded in TS).
		for (const entry of ctx) {
			expect(entry.parent, `no entry may have parent ${SECTION_INFO_GROUP_TIPO}`).not.toBe(
				SECTION_INFO_GROUP_TIPO,
			);
		}
	});

	test('dd542 still offers its real fields + the section entry', async () => {
		const ctx = await elements(ACTIVITY_SECTION_TIPO);
		const tipos = new Set(ctx.map((e) => e.tipo));
		// dd542 section, dd543 Who, dd544 IP, dd545 What, dd546 Where, dd547 When, dd551 Data
		for (const tipo of ['dd542', 'dd543', 'dd544', 'dd545', 'dd546', 'dd547', 'dd551']) {
			expect(tipos.has(tipo), `${tipo} must be present`).toBe(true);
		}
	});

	test('scope control: a non-suppressed section (dd128) still gets dd196', async () => {
		const ctx = await elements(USERS_SECTION_TIPO);
		const tipos = new Set(ctx.map((e) => e.tipo));
		expect(tipos.has(SECTION_INFO_GROUP_TIPO)).toBe(true);
	});
});
