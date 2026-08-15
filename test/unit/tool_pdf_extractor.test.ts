/**
 * tool_pdf_extractor server module gates (the extraction core itself is driven
 * in media_tools.test.ts, which builds a real PDF and reads its text back).
 *
 * What this pins:
 *  - the declarative record gate stays READ-level on the record;
 *  - the handler's own (section_tipo, component_tipo) READ assertion — PHP
 *    gates on the PAIR (assert_tipo_permission(…, 1)); the port had only the
 *    section-level 'record' gate, which a component-specific dd774 grant does
 *    not imply;
 *  - the method allowlist and the pdf-only model check, both of which must fail
 *    with an envelope rather than throwing.
 */

import { describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';
import { refusalOf } from '../helpers/refusal.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

async function handler(): Promise<(ctx: ToolActionContext) => Promise<ToolResponse>> {
	const loaded = await getLoadedTool('tool_pdf_extractor');
	expect(loaded).not.toBeNull();
	return mustGet(loaded?.module.apiActions.get_pdf_data, 'get_pdf_data').handler;
}

const contextOf = (
	options: Record<string, unknown>,
	principal: Principal = SUPERUSER,
): ToolActionContext =>
	({ principal, userId: principal.userId, options, background: false }) as ToolActionContext;

// test85 is the test-tree component_pdf (parent test45); numisdata16 is a literal.
const PDF_TIPO = 'test85';
const PDF_SECTION = 'test45';

describe('tool_pdf_extractor module surface', () => {
	test('get_pdf_data is the only action, record-gated at READ level', async () => {
		const loaded = await getLoadedTool('tool_pdf_extractor');
		const actions = loaded?.module.apiActions ?? {};
		expect(Object.keys(actions)).toEqual(['get_pdf_data']);
		const spec = mustGet(actions.get_pdf_data, 'get_pdf_data');
		expect(spec.permission).toBe('record_tipo');
		expect(spec.minLevel).toBe(1);
		// A read tool must never be offered a background fork.
		expect(loaded?.module.backgroundRunnable).toBeUndefined();
	});
});

describe('tool_pdf_extractor gates', () => {
	test('a caller without READ on the (section, component) pair is refused', async () => {
		const run = await handler();
		const refusal = await refusalOf(
			run(
				contextOf(
					{ tipo: PDF_TIPO, section_tipo: PDF_SECTION, section_id: 1, method: 'text' },
					NO_ACCESS,
				),
			),
		);
		expect(refusal.code).toBe('perm.denied');
	});

	test('an unknown method is refused before any filesystem access', async () => {
		const run = await handler();
		for (const method of ['xml', '', undefined, 'TEXT']) {
			const refusal = await refusalOf(
				run(contextOf({ tipo: PDF_TIPO, section_tipo: PDF_SECTION, section_id: 1, method })),
			);
			expect(refusal.code).toBe('request.invalid_options');
			expect(refusal.publicMessage).toContain("method must be 'text' or 'html'");
		}
	});

	test('a non-media component is refused, never answered with empty text', async () => {
		const run = await handler();
		// The media-context resolve still refuses with an UNTYPED engine throw
		// (tool_support.ts is a different sweep); it reaches the chokepoint as
		// internal.unexpected rather than a body the handler dresses up.
		expect(
			run(
				contextOf({
					tipo: 'numisdata16',
					section_tipo: 'test2',
					section_id: 1,
					method: 'text',
				}),
			),
		).rejects.toThrow(/is not a media component/);
	});

	test('a missing default-quality file is reported, never returned as empty text', async () => {
		const run = await handler();
		expect(
			run(
				contextOf({
					tipo: PDF_TIPO,
					section_tipo: PDF_SECTION,
					section_id: 999999,
					method: 'text',
				}),
			),
		).rejects.toThrow();
	});
});
