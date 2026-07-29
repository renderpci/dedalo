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
		const response = await run(
			contextOf(
				{ tipo: PDF_TIPO, section_tipo: PDF_SECTION, section_id: 1, method: 'text' },
				NO_ACCESS,
			),
		);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('unauthorized');
	});

	test('an unknown method is refused before any filesystem access', async () => {
		const run = await handler();
		for (const method of ['xml', '', undefined, 'TEXT']) {
			const response = await run(
				contextOf({ tipo: PDF_TIPO, section_tipo: PDF_SECTION, section_id: 1, method }),
			);
			expect(response.result).toBe(false);
			expect(response.errors).toContain('bad method');
		}
	});

	test('a non-media component is refused with an envelope, not a throw', async () => {
		const run = await handler();
		const response = await run(
			contextOf({
				tipo: 'numisdata16',
				section_tipo: 'test2',
				section_id: 1,
				method: 'text',
			}),
		);
		expect(response.result).toBe(false);
		expect(String(response.msg)).toContain('is not a media component');
	});

	test('a missing default-quality file is reported, never returned as empty text', async () => {
		const run = await handler();
		const response = await run(
			contextOf({
				tipo: PDF_TIPO,
				section_tipo: PDF_SECTION,
				section_id: 999999,
				method: 'text',
			}),
		);
		expect(response.result).toBe(false);
		expect(String(response.msg).length).toBeGreaterThan(0);
	});
});
