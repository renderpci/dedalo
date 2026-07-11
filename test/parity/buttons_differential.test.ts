/**
 * Phase 6c gate: section buttons context — the section structure-context
 * buttons[] must match live PHP (ontology button_* children, permission-gated).
 *
 * Two shapes are covered because they resolve buttons differently (PHP
 * section::get_section_buttons_tipo, class.section.php:1121-1196):
 *   - numisdata6 — a REAL section: its own button_* children.
 *   - dd1244     — a VIRTUAL section (relations[0].tipo → real dd623): INHERITS
 *                  the real section's buttons, minus its exclude_elements. A plain
 *                  `WHERE parent = tipo` lookup returns [] here (dd1244's only
 *                  children are section_list/exclude_elements), so this case is
 *                  the regression guard for "virtual section shows no buttons".
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const rqoFor = (tipo: string) => ({
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo,
		section_tipo: tipo,
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: [tipo], limit: 1 },
});

// [sectionTipo, kind] — both cases assert > 0 buttons; the virtual case is the
// regression guard (the bug it locks out returned [] for dd1244).
const CASES: [string, string][] = [
	['numisdata6', 'real section'],
	['dd1244', 'virtual section (→ dd623)'],
];

describe.if(hasPhpCredentials())('section buttons context differential (Phase 6c gate)', () => {
	for (const [tipo, kind] of CASES) {
		describe(`${tipo} — ${kind}`, () => {
			let phpButtons: Record<string, unknown>[];
			let tsButtons: Record<string, unknown>[];

			beforeAll(async () => {
				if (!hasPhpCredentials()) return;
				const client = new PhpApiClient();
				await client.login(
					config.phpReference.username as string,
					config.phpReference.password as string,
				);
				const rqo = rqoFor(tipo);
				const { body } = await client.call(structuredClone(rqo));
				const phpSection = (body.result as { context: Record<string, unknown>[] }).context.find(
					(entry) => entry.tipo === tipo,
				);
				phpButtons = (phpSection?.buttons as Record<string, unknown>[]) ?? [];

				const tsResult = await readSection(rqo as unknown as Rqo);
				const tsSection = tsResult.context.find((entry) => entry.tipo === tipo);
				tsButtons = (tsSection?.buttons as Record<string, unknown>[]) ?? [];
			});

			test('buttons match PHP (typo/type/tipo/model/label, in order)', () => {
				if (!hasPhpCredentials()) return;
				expect(tsButtons.length).toBe(phpButtons.length);
				expect(tsButtons.length).toBeGreaterThan(0);
				expect(tsButtons).toEqual(phpButtons);
			});
		});
	}
});
