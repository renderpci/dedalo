/**
 * Append-only-log search-field restriction (WC-045, 2026-07-21).
 *
 * The edit-mode search "FIELDS" panel (dd_core_api::get_section_elements_context
 * → buildSectionElementsContext) appends the shared section-info group dd196
 * (Created/Modified by user + date, First/Last publication + user) to every
 * section with its own elements, shown to global admins. On an append-only log
 * that editorial metadata is meaningless as a search dimension, so two sections
 * omit the dd196 group (and its children) via SUPPRESS_SECTION_INFO:
 *   - dd542 (Activity): deliberate divergence from PHP (sibling of WC-044).
 *   - dd15 (Time Machine): PHP-parity restoration — PHP empties section_info for
 *     the TM section (class.common.php:3759); the TS port never enforced it.
 *
 * The exclusion is section-SCOPED, not a global change to dd196 — which is why
 * the scope-control section (dd128) still carries it for the same admin
 * principal. Model-level ar_components_exclude cannot express this: dd196's
 * children are date/relation models, the same models as legitimate log fields.
 */

import { describe, expect, test } from 'bun:test';
import {
	ACTIVITY_SECTION_TIPO,
	AUDIT_TIPOS,
	TIME_MACHINE_SECTION_TIPO,
} from '../../src/core/concepts/section.ts';
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

// Each suppressed section: the tipo + the real fields that MUST survive (the
// section entry itself plus its own searchable components).
const SUPPRESSED = [
	{
		label: 'Activity',
		tipo: ACTIVITY_SECTION_TIPO, // dd542
		// section, Who, IP, What, Where, When, Data
		required: ['dd542', 'dd543', 'dd544', 'dd545', 'dd546', 'dd547', 'dd551'],
	},
	{
		label: 'Time Machine',
		tipo: TIME_MACHINE_SECTION_TIPO, // dd15
		// the section entry must survive; its own TM columns stay offered too
		required: ['dd15'],
	},
];

describe('append-only-log search-field restriction (WC-045)', () => {
	for (const { label, tipo, required } of SUPPRESSED) {
		test(`${label} (${tipo}) omits the dd196 section-info group and every dd196 child`, async () => {
			const ctx = await elements(tipo);
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

		test(`${label} (${tipo}) still offers its real fields + the section entry`, async () => {
			const ctx = await elements(tipo);
			const tipos = new Set(ctx.map((e) => e.tipo));
			for (const req of required) {
				expect(tipos.has(req), `${req} must be present`).toBe(true);
			}
		});
	}

	test('scope control: a non-suppressed section (dd128) still gets dd196', async () => {
		const ctx = await elements(USERS_SECTION_TIPO);
		const tipos = new Set(ctx.map((e) => e.tipo));
		expect(tipos.has(SECTION_INFO_GROUP_TIPO)).toBe(true);
	});
});
