/**
 * ui.reveal — the ONE "scroll the response into view" mechanism (DEC-12 gate).
 *
 * WHAT WENT WRONG WITHOUT IT: a response surface is appended LAST, below the
 * form that fired it, so a result or a failure landed under the fold and the
 * panel looked idle unless the user scrolled. update_code and update_ontology
 * each grew a private copy of the fix; tool_update_cache had none.
 *
 * TWO ASSERTIONS:
 *   1. the helper keeps its measured shape: guarded for DOM stubs, issued in
 *      the NEXT frame (a scroll issued while nodes are still being appended
 *      lands short — measured in update_code 2026-08-28), reduced motion
 *      honoured, and it returns the node so a caller can wrap the append;
 *   2. the known callers use it and hold no local scrollIntoView copy.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const ui_src = read('client/dedalo/core/common/js/ui.js');
const fn_start = ui_src.indexOf('\treveal : function(node, options={}) {');
const fn_body = ui_src.slice(fn_start, ui_src.indexOf('},//end reveal', fn_start));

describe('ui.reveal', () => {
	test('exists with its measured shape', () => {
		expect(fn_start).toBeGreaterThan(-1);
		expect(fn_body).toContain("typeof node.scrollIntoView!=='function'");
		expect(fn_body).toContain('requestAnimationFrame(bring_into_view)');
		expect(fn_body).toContain('prefers-reduced-motion: reduce');
		expect(fn_body).toContain("options.block || 'start'");
		expect(fn_body.trimEnd().endsWith('return node')).toBe(true);
	});

	const CALLERS = [
		'client/dedalo/core/area_maintenance/widgets/update_code/js/render_update_code.js',
		'client/dedalo/core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js',
		'tools/tool_update_cache/js/render_tool_update_cache.js',
	];
	for (const rel of CALLERS) {
		test(`${rel.split('/').pop()} reveals through ui.reveal, no local copy`, () => {
			const src = read(rel);
			expect(src).toContain('ui.reveal(');
			expect(src).not.toContain('scrollIntoView');
		});
	}

	test('tool_update_cache reveals its final report and its refusal', () => {
		const src = read('tools/tool_update_cache/js/render_tool_update_cache.js');
		expect(src).toContain('ui.reveal(container.appendChild(\n\t\t\t\t\t\trender_response_report(');
		expect(src).toContain('ui.reveal(response_message)');
	});
});
