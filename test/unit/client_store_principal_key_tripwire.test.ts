/**
 * TRIPWIRE — a browser-local store that holds CONTENT or a PERMISSION-FILTERED
 * answer is keyed by the principal, and purged at logout (P2-3 / CLI-08+CLI-15).
 *
 * `tool_transcription` wrote raw ASR output — recognised speech, speaker turns,
 * timecodes: exactly the personal-data and embargoed material a heritage
 * archive exists to protect — to IndexedDB after every decode window, keyed by
 * RECORD and COMPONENT with no user, session or principal component. Retained
 * 14 days, enforced lazily only when the same tool rewrote the same key. Logout
 * cleared four unrelated keys and three `data` prefixes, and not this store.
 *
 * On a shared reading-room workstation — which is what a public archive HAS —
 * the next reader could open DevTools from the login page and read a
 * colleague's interview transcript, or open the tool and be offered
 * `action_resume` on someone else's work.
 *
 * Separately, `get_section_elements_context` cached a PERMISSION-FILTERED
 * envelope under a key with no user id, while `execute_request` short-circuits
 * on the localdb hit with NO session check — so a second user on the same
 * browser profile could be served the first user's filtered component list.
 *
 * The codebase already applies the correct rule one directory away:
 * `menu.build_cache_id` puts the user in the key. This gate makes that the rule
 * rather than one file's habit.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const TRANSCRIPTION = 'tools/tool_transcription/js/tool_transcription.js';
const PAGE = 'client/dedalo/core/page/js/page.js';
const COMMON = 'client/dedalo/core/common/js/common.js';
const MENU = 'client/dedalo/core/menu/js/menu.js';

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

describe('a content-bearing browser store is per-principal and dies at logout', () => {
	test('the transcript partial key carries the user', () => {
		const source = read(TRANSCRIPTION);
		const builder = source.slice(
			source.indexOf('export const partial_id'),
			source.indexOf('//end partial_id'),
		);
		expect(builder.length).toBeGreaterThan(100);
		// CONCATENATED INTO THE RETURNED KEY, not merely declared above it.
		// Measured: deleting the `+ user_id + '_'` term left the `const user_id`
		// line in the slice, so a bare /user_id/ match stayed green over the exact
		// defect this asserts against.
		expect(
			builder,
			'partial_id is keyed by record + component only. On a shared workstation the next ' +
				"user is offered action_resume on someone else's interview.",
		).toMatch(/\+\s*user_id\s*\+/);
		// An absent id must NOT collapse to the old, shared key.
		expect(builder, "an empty user id must get its own namespace, not everyone's").toMatch(
			/\|\|\s*'anon'/,
		);
	});

	test('logout purges the transcript store, not only the page cache', () => {
		const source = read(PAGE);
		const purge = source.slice(source.indexOf('page.prototype.delete_cache'));
		expect(purge).toContain("delete_local_db_data_by_prefix('data', 'page_cache_')");
		expect(
			purge,
			'quit leaves the ASR transcripts in the `status` table — 14-day retention, on a ' +
				'shared reading-room machine.',
		).toContain("delete_local_db_data_by_prefix('status', 'transcription_partial_')");
	});

	test('the permission-filtered context cache is keyed by the user', () => {
		const source = read(COMMON);
		const key = source.slice(
			source.indexOf("const cache_key = 'section_cache_elements_context_'") - 400,
			source.indexOf("const cache_key = 'section_cache_elements_context_'") + 300,
		);
		expect(key, 'the envelope is permission-filtered and the key has no user in it').toMatch(
			/user_id/,
		);
		expect(key).toMatch(/\|\|\s*'anon'/);
	});

	test("the rule this gate generalises is still the neighbour's practice", () => {
		// Anti-vacuity of a different kind: the three assertions above are about
		// specific files. If `menu.build_cache_id` ever stops keying by user, the
		// PRECEDENT this rule rests on is gone and the gate should be re-argued,
		// not silently left standing on a habit nobody keeps.
		const menu = read(MENU);
		const builder = menu.slice(menu.indexOf('menu.prototype.build_cache_id'));
		expect(builder).toContain('user_id');
	});

	test('anti-vacuity: the slices are real, not empty strings', () => {
		// Every assertion above reads a SLICE. A moved marker would make each one
		// search '' and pass. Each slice must have found its function.
		for (const [rel, marker] of [
			[TRANSCRIPTION, 'export const partial_id'],
			[PAGE, 'page.prototype.delete_cache'],
			[COMMON, "const cache_key = 'section_cache_elements_context_'"],
			[MENU, 'menu.prototype.build_cache_id'],
		] as const) {
			expect(read(rel).indexOf(marker), `${rel}: '${marker}' not found`).toBeGreaterThan(-1);
		}
	});
});
