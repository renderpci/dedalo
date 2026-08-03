/**
 * The media-versions PANEL's two client-side contracts with the engine.
 *
 * Both were broken at once, and neither is visible from the server side — the
 * build really did succeed, the API really did answer 'ok', and the panel still
 * sat blinking "Processing" forever. What failed was the completion step.
 *
 * 1. NO 'force_save'. PHP's panel finished a build by asking the component to
 *    save, so the new files_info would reach the record. The TS engine persists
 *    it on the build path itself, and `saveComponentData` REFUSES unknown save
 *    actions loudly — so that call could only ever 500. Asserted from both ends:
 *    the engine still refuses it (the refusal is the contract, not an accident),
 *    and no client sends it.
 *
 * 2. The refresh after a mutation must NOT destroy dependencies. The default
 *    `refresh()` destroys them, which nulls `main_element.context` — and the
 *    grid's re-render reads `main_element.context.features.default_quality` on
 *    its first line, so it threw before repainting a single cell. Every
 *    mutating path in the panel (build, delete_version, delete_quality,
 *    sync_files) therefore passes `destroy: false`.
 *
 * Static source assertions, deliberately: the panel is vanilla JS with no DOM
 * test harness in this suite, and these are exactly the two lines a future edit
 * would silently reintroduce.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';

const REPO_ROOT = join(import.meta.dir, '../..');
const RENDER_JS = join(REPO_ROOT, 'tools/tool_media_versions/js/render_tool_media_versions.js');
const TOOL_JS = join(REPO_ROOT, 'tools/tool_media_versions/js/tool_media_versions.js');

describe('media-versions panel ↔ engine contract', () => {
	test("the engine refuses 'force_save' — the reason the client must not send it", async () => {
		// Scratch section + a nonexistent record: the action check runs first, so
		// this never reaches a write. If this ever starts succeeding, 'force_save'
		// became a real action and the client rule below can be revisited.
		await expect(
			saveComponentData({
				componentTipo: 'test94',
				sectionTipo: 'test3',
				sectionId: -999999,
				lang: 'lg-nolan',
				changedData: [{ action: 'force_save' } as never],
				userId: -1,
			} as never),
		).rejects.toThrow(/force_save/);
	});

	test('no client file sends a force_save', () => {
		for (const file of [RENDER_JS, TOOL_JS]) {
			const source = readFileSync(file, 'utf8');
			// The comment explaining WHY it is gone is allowed; a save call is not.
			const calls = source.match(/action\s*:\s*'force_save'/g) ?? [];
			expect(calls).toEqual([]);
		}
	});

	test('every refresh in the panel keeps its dependencies alive', () => {
		const source = readFileSync(RENDER_JS, 'utf8');
		// A BARE self.refresh() takes the destroying default — the exact defect.
		// It must not exist here; options are always explicit.
		expect(source.match(/self\.refresh\(\s*\)/g) ?? []).toEqual([]);
		// And every options block must say destroy:false.
		const blocks = source.match(/self\.refresh\(\{[^}]*\}\)/g) ?? [];
		expect(blocks.length).toBeGreaterThan(0);
		const destroying = blocks.filter((block) => !/destroy\s*:\s*false/.test(block));
		expect(destroying).toEqual([]);
	});
});
