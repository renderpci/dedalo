/**
 * TOOL CACHE INVALIDATION — the "single entry point" invariant, made mechanical
 * (DEC-12: an invariant stated only in a header rots).
 *
 * `src/core/tools/cache.ts::invalidateAllToolCaches()` is documented as THE one
 * place every tools cache is dropped, and `section_record/save_event.ts` is
 * documented as routing dd1324 (tools registry) / dd996 (install config) /
 * dd234 (profiles) writes into it. Both claims were prose only. A missed hop
 * means a tool stays in — or vanishes from — a user's menu until the server
 * restarts, which is exactly the class of bug the post-cutover "no TTL, pure
 * invalidation" posture removed the safety net for.
 *
 * Three things are gated here:
 *
 *  1. ROUTING (behavioural). `fireSaveEvent(<tipo>)` must actually invalidate for
 *     each of the three tipos, and must NOT for anything else. The observable
 *     signal is cache IDENTITY: `getRoots()` and `loadToolModules()` are memoized,
 *     so they return the SAME object on every call until something clears them.
 *  2. REACHABILITY (behavioural). Routing is worthless if a write path never
 *     REACHES `fireSaveEvent`. `duplicateSectionRecord` and `createSectionRecord`
 *     call `insertMatrixRecordWithCounter` DIRECTLY — they are the two record
 *     writers that do NOT go through the record_write.ts chokepoint that fires
 *     for every other write — so each must fire for itself (PHP parity:
 *     section_record::create() :2074 and duplicate()'s closing save() both fire
 *     save_event). Duplicating a dd1324 row clones a tool's NAME and its ACTIVE
 *     flag into the registry: without the fire the tool stays wrong in every
 *     user's menu until the process restarts — the post-cutover posture deleted
 *     the TTL that used to bound that.
 *     Observed through the public `registerSectionDataListener` seam, which
 *     `fireSaveEvent` fans out to BEFORE its tipo switch: seeing the tipo there
 *     proves the switch was reached WITH it, and (1) proves what the switch then
 *     does with dd1324 / dd996 / dd234. The composition is deliberate — seeding a
 *     real tool row into the suite registry to assert the dd1324 leg end-to-end
 *     would make every other tools gate in the suite see a ghost tool. The
 *     NEGATIVE half is asserted directly: a scratch (non-tool) create/duplicate
 *     must leave the tool caches intact, so "fix it by always invalidating"
 *     fails here.
 *  3. TOTALITY (source). `invalidateAllToolCaches` must call every reset the four
 *     cache-owning modules export. Adding a fifth cache to the subsystem and
 *     forgetting to clear it here is the silent-staleness bug; this fails the day
 *     the reset is added, not the day a user notices a stale menu.
 */
// Migrated to the generic `test` TLD 2026-08-19: the negative half only needs section
// tipos that are NOT a tool-cache trigger, so it names generic `test` sections.

import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { duplicateSectionRecord } from '../../src/core/section/record/duplicate_record.ts';
import {
	fireSaveEvent,
	registerSectionDataListener,
} from '../../src/core/section_record/save_event.ts';
import { invalidateAllToolCaches } from '../../src/core/tools/cache.ts';
import { loadToolModules } from '../../src/core/tools/loader.ts';
import {
	DD64_SECTION_TIPO,
	PROFILE_SECTION_TIPO,
	TIPO,
	TOOLS_CONFIG_SECTION_TIPO,
	TOOLS_REGISTER_SECTION_TIPO,
} from '../../src/core/tools/ontology_map.ts';
import { getRoots } from '../../src/core/tools/paths.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const src = (rel: string): string => readFileSync(join(import.meta.dir, '..', '..', rel), 'utf8');

/**
 * A memoized-cache identity probe: prime both caches and hand back a checker that
 * says whether they are still the SAME objects. `getRoots` memoizes the roots
 * array (paths.ts rootsCache); `loadToolModules` memoizes the loaded-module Map
 * (loader.ts loadedTools). Either being rebuilt means the invalidation ran.
 */
async function primeCaches(): Promise<() => Promise<boolean>> {
	const roots = getRoots();
	const modules = await loadToolModules();
	// Sanity: they really are memoized, or the probe proves nothing.
	expect(getRoots()).toBe(roots);
	expect(await loadToolModules()).toBe(modules);
	return async () => getRoots() === roots && (await loadToolModules()) === modules;
}

/**
 * Reachability fixture. `test3` + `createSectionRecord(-1)` is the documented
 * scratch convention (test/helpers/test_data.ts header); every id is swept in
 * afterAll. test3 is NOT one of the three tool tipos — which is exactly what
 * lets the same fixture serve the negative half.
 */
const SCRATCH_SECTION = 'test3';
const SCRATCH_TABLE = 'matrix_test';
const SCRATCH_COMPONENT = 'test52'; // component_input_text, translatable
const ROOT_USER = -1;
const scratchIds: number[] = [];

/** Every section tipo fireSaveEvent has fanned out since the last reset. */
const firedTipos: string[] = [];
registerSectionDataListener((sectionTipo) => {
	firedTipos.push(sectionTipo);
});

/** A scratch source carrying a real component value (so a duplicate of it
 * exercises the copy + Time Machine path, not just the bare insert). */
async function seedScratchSource(): Promise<number> {
	const sectionId = await createSectionRecord(SCRATCH_SECTION, ROOT_USER);
	scratchIds.push(sectionId);
	await sql.unsafe(
		`UPDATE ${SCRATCH_TABLE} SET string = jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[
			SCRATCH_SECTION,
			sectionId,
			SCRATCH_COMPONENT,
			JSON.stringify([{ id: 1, lang: 'lg-spa', value: 'cache-fire' }]),
		],
	);
	return sectionId;
}

afterAll(async () => {
	for (const sectionId of scratchIds) {
		if (sectionId > 0) await cleanScratchRecord(SCRATCH_SECTION, sectionId, SCRATCH_TABLE);
	}
});

describe('the two chokepoint-bypassing record writers reach the save event', () => {
	test('createSectionRecord fires for the created section', async () => {
		firedTipos.length = 0;
		const sectionId = await createSectionRecord(SCRATCH_SECTION, ROOT_USER);
		scratchIds.push(sectionId);
		expect(sectionId).toBeGreaterThan(0);
		expect(firedTipos.filter((tipo) => tipo === SCRATCH_SECTION)).toEqual([SCRATCH_SECTION]);
	});

	test('duplicateSectionRecord fires for the duplicated section', async () => {
		const sourceId = await seedScratchSource();
		firedTipos.length = 0;
		const dupId = await duplicateSectionRecord(SCRATCH_SECTION, sourceId, ROOT_USER);
		scratchIds.push(dupId);
		expect(dupId).toBeGreaterThan(0);
		expect(dupId).not.toBe(sourceId);
		// EXACTLY once: fired after the whole duplicate landed (copy + media +
		// Time Machine + observers), not once per inner write.
		expect(firedTipos.filter((tipo) => tipo === SCRATCH_SECTION)).toEqual([SCRATCH_SECTION]);
	});

	test('neither invalidates the tool caches for a NON-tool section', async () => {
		// Guards the lazy fix ("just call invalidateAllToolCaches() in duplicate"),
		// which would re-scan the whole tools tree on every record create in the
		// install. The fire must carry the tipo and let the switch decide.
		const sourceId = await seedScratchSource();
		const stillCached = await primeCaches();
		scratchIds.push(await createSectionRecord(SCRATCH_SECTION, ROOT_USER));
		scratchIds.push(await duplicateSectionRecord(SCRATCH_SECTION, sourceId, ROOT_USER));
		expect(await stillCached()).toBe(true);
	});
});

describe('save_event routes the three tool-owning sections into invalidateAllToolCaches', () => {
	test.each([
		['dd1324 tools registry', TOOLS_REGISTER_SECTION_TIPO],
		['dd996 install config', TOOLS_CONFIG_SECTION_TIPO],
		['dd234 profiles', PROFILE_SECTION_TIPO],
	])('a write to %s invalidates the tool caches', async (_label, sectionTipo) => {
		const stillCached = await primeCaches();
		await fireSaveEvent(sectionTipo);
		expect(await stillCached()).toBe(false);
	});

	test('a write to any OTHER section leaves the tool caches alone', async () => {
		// The negative half matters as much: if fireSaveEvent invalidated on every
		// write the tests above would pass while the subsystem re-scanned the whole
		// tools tree on every record save in the install.
		for (const sectionTipo of ['test3', 'test6099', 'ontology35', 'dd1244']) {
			const stillCached = await primeCaches();
			await fireSaveEvent(sectionTipo);
			expect({ sectionTipo, cached: await stillCached() }).toEqual({ sectionTipo, cached: true });
		}
	});
});

/**
 * The registry ROW cache (registry.ts activeToolRowsCache) is the one tool cache
 * with an observable identity, so it is the one that can be proved end-to-end
 * rather than at the source level.
 *
 * It exists because fetchActiveToolRows() is a constant query that every reader
 * calls — media_icons once per rendered list row, which cost 43ms per section list
 * read. Caching it moved gate 3 ("the tool must be ACTIVE in dd1324") from a
 * live read to a cached one, so the invalidation is now load-bearing for a
 * SECURITY gate: a deactivated tool that stays cached stays dispatchable. That
 * is asserted here against the real save-event channel, not a manual reset.
 */
describe('the active-registry row cache is invalidated by a real dd1324 write', () => {
	const SCRATCH_TOOL_ID = 999_733;

	async function deleteScratchTool(): Promise<void> {
		await sql`
			DELETE FROM matrix_tools
			WHERE section_tipo = ${TOOLS_REGISTER_SECTION_TIPO} AND section_id = ${SCRATCH_TOOL_ID}
		`;
	}

	afterAll(async () => {
		await deleteScratchTool();
		invalidateAllToolCaches();
	});

	test('a tool added and then removed becomes visible, and invisible, on the save event', async () => {
		await deleteScratchTool();
		invalidateAllToolCaches();

		const { getActiveToolMetaBySectionId } = await import('../../src/core/tools/registry.ts');
		expect((await getActiveToolMetaBySectionId()).has(SCRATCH_TOOL_ID)).toBe(false);

		// Raw insert: the registry's own writer bypasses the section chokepoint
		// too (writeRegistryRecord → matrix_write), which is why importTools
		// invalidates for itself.
		await sql.unsafe(
			`INSERT INTO matrix_tools (section_tipo, section_id, string, relation)
			 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
			[
				TOOLS_REGISTER_SECTION_TIPO,
				SCRATCH_TOOL_ID,
				JSON.stringify({ [TIPO.NAME]: [{ id: 1, value: 'tool_zz_cache_probe' }] }),
				JSON.stringify({
					[TIPO.ACTIVE]: [
						{
							id: 1,
							type: 'dd151',
							section_id: '1',
							section_tipo: DD64_SECTION_TIPO,
							from_component_tipo: TIPO.ACTIVE,
						},
					],
				}),
			],
		);

		// The cache is REAL: without invalidation the fresh row stays invisible.
		// (This is the staleness the cache buys — stated, not hidden.)
		expect((await getActiveToolMetaBySectionId()).has(SCRATCH_TOOL_ID)).toBe(false);

		// …and the production channel clears it.
		await fireSaveEvent(TOOLS_REGISTER_SECTION_TIPO);
		expect((await getActiveToolMetaBySectionId()).has(SCRATCH_TOOL_ID)).toBe(true);

		// The same must hold for DEACTIVATION, which is the direction that matters
		// for the gate: a removed tool must stop being served.
		await deleteScratchTool();
		await fireSaveEvent(TOOLS_REGISTER_SECTION_TIPO);
		expect((await getActiveToolMetaBySectionId()).has(SCRATCH_TOOL_ID)).toBe(false);
	});
});

describe('invalidateAllToolCaches is total', () => {
	test('it drops the memoized roots and the loaded-module registry', async () => {
		const stillCached = await primeCaches();
		invalidateAllToolCaches();
		expect(await stillCached()).toBe(false);
	});

	/**
	 * The four tools modules that own module-level cache state each export a
	 * reset. `invalidateAllToolCaches` must call ALL of them — that is the whole
	 * content of "THE single entry point". Two of the four (the registry reader
	 * and the config maps) have no externally observable identity, so this is
	 * asserted at the source level rather than not at all.
	 */
	test('every cache-owning module reset is called from the one entry point', () => {
		const body = src('src/core/tools/cache.ts');
		const owners = {
			'src/core/tools/registry.ts': 'resetRegistryCache',
			'src/core/tools/config.ts': 'resetConfigCache',
			'src/core/tools/paths.ts': 'resetPathsCache',
			'src/core/tools/loader.ts': 'resetLoadedTools',
		} as const;
		for (const [module, reset] of Object.entries(owners)) {
			// The reset exists where we think it does…
			expect({ module, exported: src(module).includes(`export function ${reset}(`) }).toEqual({
				module,
				exported: true,
			});
			// …and the single entry point calls it.
			expect({ reset, called: body.includes(`${reset}()`) }).toEqual({ reset, called: true });
		}
	});

	/**
	 * The registry-write path does NOT go through the section write chokepoint
	 * (writeRegistryRecord calls matrix_write directly), so importTools has to
	 * invalidate for itself. Stated in register.ts; asserted here, because losing
	 * that one line would leave every user's menu stale after a real import.
	 */
	test('a real (non-dry-run) importTools invalidates for itself', () => {
		const register = src('src/core/tools/register.ts');
		expect(register).toContain("import { invalidateAllToolCaches } from './cache.ts'");
		expect(register).toContain('if (!dryRun) invalidateAllToolCaches();');
	});
});
