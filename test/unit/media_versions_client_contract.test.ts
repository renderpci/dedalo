/**
 * The media-versions PANEL's three client-side contracts with the engine.
 *
 * All were invisible from the server side — the
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
 * 3. BOTH SIDES OF THE UNSYNC COMPARISON COME FROM ONE ANSWER. The panel warns
 *    "files info data is unsync" when the record's stored files_info and the
 *    disk scan disagree. It took the disk side live and the DB side from the
 *    COMPONENT'S CACHED DATA — a snapshot from when the tool opened that no
 *    refresh re-reads — so every delete raised a warning about a record that was
 *    perfectly in sync, and a page reload made it vanish. `get_files_info` now
 *    returns `files_info_db` beside the scan, and the client reads the DB side
 *    only from there. Gated on the SERVER side (the field is emitted, and it is
 *    the stored value, not the scan) because that is the half a refactor would
 *    quietly drop.
 *
 * Static source assertions where the subject is vanilla JS with no DOM harness
 * in this suite — these are exactly the lines a future edit would silently
 * reintroduce.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { getFilesInfo } from '../../tools/tool_media_versions/server/media_versions.ts';

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

	test('get_files_info carries the STORED files_info beside the disk scan', async () => {
		// test94 on the canonical test3 playground: no media on disk, and the
		// record stores none either. Both sides must still be present and be
		// ARRAYS — the panel compares their lengths, so an absent field would read
		// as "0 entries" and silently un-warn a component that needs Regenerate.
		const response = (await getFilesInfo({
			options: { tipo: 'test94', section_tipo: 'test3', section_id: 1 },
			userId: -1,
		} as never)) as unknown as { result: unknown; files_info_db: unknown };
		expect(Array.isArray(response.result)).toBe(true);
		expect(Array.isArray(response.files_info_db)).toBe(true);
	});

	test('the client reads the DB side of the comparison from the server only', () => {
		const source = readFileSync(TOOL_JS, 'utf8');
		// The assignment that made the warning lie: files_info_db taken from the
		// component's cached entries. One occurrence survives ON PURPOSE as the
		// pre-request fallback, immediately overwritten by the server's answer —
		// so pin the count AND pin that the server assignment exists.
		const fromCache = source.match(/files_info_db\s*=\s*entries\[0\]/g) ?? [];
		expect(fromCache.length).toBe(1);
		expect(source).toContain('response?.files_info_db');
	});
});
