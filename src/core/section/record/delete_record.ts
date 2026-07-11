/**
 * Section record deletion (PHP dd_core_api::delete → sections::delete →
 * section_record::delete, delete_mode 'delete_record').
 *
 * delete_record removes the whole record, and BEFORE removing it writes a
 * Time Machine snapshot of the record's full data (every matrix jsonb column)
 * under the section tipo — the audit point that lets the record be recovered.
 *
 * Covered: the TM snapshot + row removal, inverse-reference cleanup
 * (remove_all_inverse_references — locators in OTHER records that point at
 * this one, WITH the per-removed-locator dataframe cascade, S1-05),
 * media-file moves, diffusion unpublish, and the 'delete_data' mode (empty
 * every component, keep the row — deleteSectionData).
 *
 * ATOMICITY (S2-02): the DB steps (snapshot, TM row, inverse-ref rewrites,
 * row delete, RAG delete marker) run in ONE transaction; media moves and
 * diffusion unpublish are post-commit side effects.
 * OUT OF THIS MODULE (header re-dated 2026-07-10, S2-45): the ontology-main
 * cascade (deleting a hierarchy/ontology registry record uninstalls its TLD —
 * ontology/ontology_delete.ts deleteOntologyMain) runs at the DISPATCH
 * chokepoint BEFORE this function, global-admin gated; the CHILDREN-EXIST
 * refusal (PHP sections::delete :535-593 — a delete_record on a tree parent
 * with children is skipped unless options.delete_with_children) ALSO lives at
 * the dispatch chokepoint, deliberately NOT here: the ontology cascade calls
 * this function to tear down whole trees. INTENTIONAL DIVERGENCE: PHP
 * `remove_parent_references` (relation_common :1505-76) is NOT ported — it
 * calls `remove_me_as_your_child`, a method defined NOWHERE in the PHP tree
 * (latent fatal), and the computed-inverse children model makes it redundant
 * (a deleted child's parent locators die with its row; foreign locators are
 * stripped by removeAllInverseReferences below). No wire-shape change.
 */

import { compareLocators } from '../../concepts/locator.ts';
import { isConsultationOnlySection } from '../../concepts/section.ts';
import { dbTimestamp } from '../../db/db_timestamp.ts';
import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn } from '../../db/matrix.ts';
import { deleteMatrixRecord } from '../../db/matrix_write.ts';
import { sql, withTransaction } from '../../db/postgres.ts';
import { recordTimeMachine } from '../../db/time_machine.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { fireRagRecordEvent, fireSaveEvent } from '../../section_record/save_event.ts';

export interface DeleteRecordResult {
	/** Deleted section_ids as strings (PHP delete result shape). */
	deleted: string[];
	/** True when a matrix row was actually removed. */
	removed: boolean;
}

/**
 * Delete one section record (delete_record mode): snapshot to Time Machine,
 * then remove the row. Returns the PHP-shaped result. `now` is injectable for
 * deterministic tests.
 */
export async function deleteSectionRecord(
	sectionTipo: string,
	sectionId: number,
	userId: number,
	now: Date = new Date(),
): Promise<DeleteRecordResult> {
	if (isConsultationOnlySection(sectionTipo)) {
		throw new Error(
			`deleteSectionRecord: section '${sectionTipo}' is consultation-only (read-only)`,
		);
	}
	if (sectionId < 1) {
		throw new Error(`deleteSectionRecord: refusing to delete non-positive section_id ${sectionId}`);
	}
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`deleteSectionRecord: no matrix table for section '${sectionTipo}'`);
	}

	// ATOMIC DB PHASE (S2-02): snapshot + TM audit + inverse-reference rewrites
	// + row delete run in ONE transaction — a crash or thrown error mid-sequence
	// can no longer leave holders stripped of their locators while the target
	// still exists, or a 'deleted' TM snapshot for a record never removed.
	// Media moves and diffusion unpublish are NON-transactional side effects and
	// run AFTER commit (idempotent/soft — a crash between commit and them leaves
	// recoverable residue, never broken relations). NOTE: when called inside an
	// ambient outer transaction the "post-commit" steps run while that outer tx
	// is still open — composed callers own that trade-off.
	const txOutcome = await withTransaction(
		async (): Promise<{ snapshot: Record<string, unknown>; removedCount: number } | null> => {
			// 1. Read the full record (every jsonb column) for the TM snapshot — this is
			//    PHP section_record::get_data(), the object stored in matrix_time_machine.
			const columnList = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"`).join(', ');
			const rows = (await sql.unsafe(
				`SELECT ${columnList} FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
				[sectionTipo, sectionId],
			)) as Record<MatrixJsonbColumn, unknown>[];
			const record = rows[0];
			if (record === undefined) {
				return null; // nothing to delete
			}
			const snapshot: Record<string, unknown> = {};
			for (const column of MATRIX_JSONB_COLUMNS) {
				snapshot[column] = record[column] ?? null;
			}

			// 2. Time Machine audit (state 'deleted'): tipo = section_tipo, nolan lang,
			//    data = the full record snapshot (PHP tm_record::create in delete()).
			await recordTimeMachine(
				{
					sectionTipo,
					sectionId,
					componentTipo: sectionTipo,
					lang: 'lg-nolan',
					userId,
					data: snapshot,
				},
				dbTimestamp(now),
			);

			// 3. Referential integrity: remove every locator in OTHER records that
			//    points at this one (PHP remove_all_inverse_references, delete step 3).
			await removeAllInverseReferences(sectionTipo, sectionId, userId, now);

			// 4. Remove the row. (Ontology-node cleanup ledgered.)
			const removedCount = await deleteMatrixRecord(table, sectionTipo, sectionId);

			// 5. RAG delete event (S2-13): PHP delete() enqueues a 'delete' job
			//    (class.section_record.php:988) so the vector store stops serving the
			//    record's chunks. In-transaction on purpose: the enqueue writes through
			//    the ambient sql handle, so a rolled-back delete leaves no marker.
			await fireRagRecordEvent({ kind: 'delete', sectionTipo, sectionId });

			return { snapshot, removedCount };
		},
	);
	if (txOutcome === null) {
		return { deleted: [], removed: false };
	}

	// 6. Media files (POST-COMMIT): move every stored file to its quality dir's
	//    'deleted/' sub-folder (PHP remove_section_media_files — recoverable, no
	//    hard delete). No-op without a configured media root.
	await removeSectionMediaFiles(txOutcome.snapshot.media as Record<string, unknown[]> | null, now);

	// 7. Diffusion unpublish (POST-COMMIT — PHP diffusion_delete::delete_record):
	//    sql targets via the native executor; file targets + retry queue ledgered.
	{
		const { deleteDiffusionRecord } = await import('../../diffusion_bridge/diffusion_delete.ts');
		await deleteDiffusionRecord(sectionTipo, sectionId, true, userId);
	}

	// 8. Cache invalidation (S1-11): a delete stales the same caches a write
	//    does — the tipo-switch twins AND the section-data listeners (datalist
	//    option lists etc.). PHP's delete runs its save_event fan-out too.
	await fireSaveEvent(sectionTipo);

	return { deleted: [String(sectionId)], removed: txOutcome.removedCount > 0 };
}

/**
 * Move a deleted record's media files into '{qualityDir}/deleted/' with the
 * PHP datestamp suffix ('{stem}_deleted_2024-11-15_143022.{ext}' —
 * date("Y-m-d_Gis"), hour WITHOUT leading zero). Walks the media column's
 * items' files_info; missing files and a missing media root are silent
 * no-ops (PHP logs and continues). `mediaRoot` is injectable for tests and
 * defaults to env MEDIA_PATH.
 */
export async function removeSectionMediaFiles(
	mediaColumn: Record<string, unknown[]> | null,
	now: Date = new Date(),
	mediaRoot?: string,
): Promise<string[]> {
	if (mediaColumn === null || mediaColumn === undefined) return [];
	const { readEnv } = await import('../../../config/env.ts');
	const root = mediaRoot ?? readEnv('MEDIA_PATH');
	if (root === undefined || root === '') return [];

	const { existsSync, mkdirSync, renameSync } = await import('node:fs');
	const pad = (value: number): string => String(value).padStart(2, '0');
	// PHP date("Y-m-d_Gis"): G = 24h hour WITHOUT leading zero.
	const stamp =
		`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
		`_${now.getHours()}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

	const moved: string[] = [];
	for (const items of Object.values(mediaColumn)) {
		if (!Array.isArray(items)) continue;
		for (const item of items) {
			const filesInfo = (item as { files_info?: { file_path?: string }[] } | null)?.files_info;
			if (!Array.isArray(filesInfo)) continue;
			for (const info of filesInfo) {
				const filePath = info?.file_path;
				if (typeof filePath !== 'string' || filePath === '') continue;
				const source = `${root}${filePath}`;
				if (!existsSync(source)) continue;
				const slash = source.lastIndexOf('/');
				const dir = source.slice(0, slash);
				const fileName = source.slice(slash + 1);
				const dot = fileName.lastIndexOf('.');
				const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
				const extension = dot > 0 ? fileName.slice(dot + 1) : '';
				const deletedDir = `${dir}/deleted`;
				if (!existsSync(deletedDir)) mkdirSync(deletedDir, { recursive: true, mode: 0o775 });
				const target = `${deletedDir}/${stem}_deleted_${stamp}${extension !== '' ? `.${extension}` : ''}`;
				renameSync(source, target);
				moved.push(target);
			}
		}
	}
	return moved;
}

/**
 * Remove every stored locator pointing at (sectionTipo, sectionId) from the
 * records that hold them (PHP section_record::remove_all_inverse_references):
 * breakdown-search the exact inverse entries, then per owning component strip
 * the matching items (target section/id + the entry's own type +
 * from_component_tipo), write the key (empty → key removed) and audit a TM
 * pair like any component save. Only relation-column components participate
 * (PHP supports relation_common descendants + component_dataframe — both
 * store in the relation column). The owner's modified stamps refresh.
 */
async function removeAllInverseReferences(
	sectionTipo: string,
	sectionId: number,
	userId: number,
	now: Date,
): Promise<void> {
	const { findInverseReferenceLocators } = await import('../../search/search_related.ts');
	const { readMatrixRecord } = await import('../../db/matrix.ts');
	const { persistRecordKeys, persistModifiedStamp } = await import('../../section_record/index.ts');
	const { getModelByTipo, getColumnNameByModel } = await import('../../ontology/resolver.ts');
	const { dbTimestamp: stamp } = await import('./create_record.ts');

	const hits = await findInverseReferenceLocators(
		[{ section_tipo: sectionTipo, section_id: sectionId }],
		{ order: 'section_id' },
	);
	if (hits.length === 0) return;

	// Group by owning record + component so each component saves ONCE.
	const byOwner = new Map<
		string,
		{ table: string; ownerSection: string; ownerId: number; component: string; types: Set<string> }
	>();
	for (const hit of hits) {
		const raw = hit.locator_data as { from_component_tipo?: string; type?: string };
		const component = raw.from_component_tipo;
		if (typeof component !== 'string') continue;
		const key = `${hit.table}|${hit.section_tipo}|${hit.section_id}|${component}`;
		let group = byOwner.get(key);
		if (group === undefined) {
			group = {
				table: hit.table,
				ownerSection: hit.section_tipo,
				ownerId: hit.section_id,
				component,
				types: new Set(),
			};
			byOwner.set(key, group);
		}
		if (typeof raw.type === 'string') group.types.add(raw.type);
	}

	const backfillStamp = stamp(new Date(now.getTime() - 60_000));
	const nowStamp = stamp(now);
	const touchedOwners = new Set<string>();

	for (const group of byOwner.values()) {
		const model = await getModelByTipo(group.component);
		if (model === null || getColumnNameByModel(model) !== 'relation') continue; // PHP skips non-relation holders
		const record = await readMatrixRecord(group.table, group.ownerSection, group.ownerId);
		if (record === null) continue;
		const bag =
			((record.columns.relation as Record<string, unknown[]> | null)?.[group.component] as
				| { section_tipo?: string; section_id?: number | string; type?: string }[]
				| undefined) ?? [];
		const remaining: typeof bag = [];
		const removedEntries: typeof bag = [];
		for (const entry of bag) {
			// Locator law (S2-04/DEC-21): target match via compareLocators —
			// section_tipo strict + present-on-both, section_id LOOSE numeric
			// (PHP locator::compare_locators; stored '05' matches 5 where the old
			// String() comparison missed it). The type gate is the inverse-search
			// hit's own relation type, unchanged.
			const matches =
				entry !== null &&
				typeof entry === 'object' &&
				compareLocators(
					entry as Parameters<typeof compareLocators>[0],
					{ section_tipo: sectionTipo, section_id: sectionId },
					['section_tipo', 'section_id'],
				) &&
				(entry.type === undefined || group.types.has(String(entry.type)));
			(matches ? removedEntries : remaining).push(entry);
		}
		if (removedEntries.length === 0) continue; // nothing matched

		// DATAFRAME cascade (PHP remove_locator_from_data :1362 via
		// remove_all_inverse_references, S1-05): each removed locator strips the
		// owner's frame entries paired with its item id, so no orphaned frames
		// survive to re-attach to a future item reusing the id. Locators
		// without an id (pre-migration) have no id_key to pair on — PHP skips.
		{
			const { removeDataframeDataById } = await import('../../relations/save.ts');
			for (const entry of removedEntries) {
				const itemId = (entry as { id?: number | string }).id;
				if (itemId === undefined || itemId === null) continue;
				await removeDataframeDataById(
					group.table,
					group.ownerSection,
					group.ownerId,
					group.component,
					Math.trunc(Number(itemId)),
					userId,
				);
			}
		}

		const newData = remaining.length > 0 ? remaining : null;
		// Component save audit (relation data is nolan): backfill pair like any
		// TS-side component write.
		const history = (await sql.unsafe(
			`SELECT 1 FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND lang = 'lg-nolan' LIMIT 1`,
			[group.ownerSection, group.ownerId, group.component],
		)) as unknown[];
		if (history.length === 0) {
			await recordTimeMachine(
				{
					sectionTipo: group.ownerSection,
					sectionId: group.ownerId,
					componentTipo: group.component,
					lang: 'lg-nolan',
					userId,
					data: bag,
				},
				backfillStamp,
			);
		}
		await recordTimeMachine(
			{
				sectionTipo: group.ownerSection,
				sectionId: group.ownerId,
				componentTipo: group.component,
				lang: 'lg-nolan',
				userId,
				data: newData,
			},
			nowStamp,
		);
		// Chokepoint write, no audit here: the owner's stamps refresh ONCE below
		// (an owner may hold several affected components).
		await persistRecordKeys(
			{ table: group.table, sectionTipo: group.ownerSection, sectionId: group.ownerId },
			[{ column: 'relation', key: group.component, value: newData }],
			false,
		);
		touchedOwners.add(`${group.table}|${group.ownerSection}|${group.ownerId}`);
	}

	// Owners' modified stamps (component Save refreshes dd197/dd201).
	for (const ownerKey of touchedOwners) {
		const [ownerTable, ownerSection, ownerId] = ownerKey.split('|');
		if (ownerTable === undefined || ownerSection === undefined || ownerId === undefined) continue;
		await persistModifiedStamp(
			{ table: ownerTable, sectionTipo: ownerSection, sectionId: Number(ownerId) },
			{ userId, now },
		);
	}
}

/** Component models delete_data never empties (PHP $excluded_model_to_empty). */
const EXCLUDED_EMPTY_MODELS: ReadonlySet<string> = new Set([
	'component_section_id',
	'component_external',
	'component_inverse',
]);

/**
 * delete_data mode (PHP section_record::delete_data): keep the row, EMPTY
 * every component child of the section that has stored data —
 *   - per component: a Time Machine pair (backfill row with the OLD full
 *     value at NOW-60s when the tipo+lang has no TM history yet, then the
 *     save row with the new value), and the column KEY REMOVED
 *     (jsonb_set_lax 'delete_key'; component_filter gets the user's default
 *     project instead of null);
 *   - then the modified stamps refresh (dd197 user locator + dd201 date,
 *     whole-key replace).
 * Meta counters are KEPT (PHP leaves them). LEDGERED: media file moves,
 * component_info observer rows (computed data, no stored key on TS-written
 * records), the activity log row.
 */
export async function deleteSectionData(
	sectionTipo: string,
	sectionId: number,
	userId: number,
	now: Date = new Date(),
): Promise<DeleteRecordResult> {
	if (isConsultationOnlySection(sectionTipo)) {
		throw new Error(`deleteSectionData: section '${sectionTipo}' is consultation-only (read-only)`);
	}
	if (sectionId < 1) {
		throw new Error(`deleteSectionData: refusing non-positive section_id ${sectionId}`);
	}
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`deleteSectionData: no matrix table for section '${sectionTipo}'`);
	}
	const columnList = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"`).join(', ');
	const rows = (await sql.unsafe(
		`SELECT ${columnList} FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId],
	)) as Record<MatrixJsonbColumn, unknown>[];
	const record = rows[0];
	if (record === undefined) {
		return { deleted: [], removed: false };
	}

	const {
		getModelByTipo,
		getColumnNameByModel,
		getTranslatableByTipo,
		getNode,
		getOrderedSubtree,
	} = await import('../../ontology/resolver.ts');
	const { persistRecordKeys, persistModifiedStamp } = await import('../../section_record/index.ts');
	const { dbTimestamp: stamp } = await import('./create_record.ts');
	const { config } = await import('../../../config/config.ts');

	// Component children of the section (recursive; virtual sections resolve
	// through their real section's tree). Canonical accessor (S2-19/T3): this
	// walk deliberately CROSSES nested sections — same coverage as the raw walk
	// it replaces (no containment guard; PHP delete_data empties every declared
	// component key in the record). The 'component' prefix filter (old LIKE
	// 'component%') stays local.
	const childrenOf = async (root: string): Promise<{ tipo: string; model: string }[]> =>
		(await getOrderedSubtree(root, { crossSections: true }))
			.filter((node) => node.model?.startsWith('component') === true)
			.map((node) => ({ tipo: node.tipo, model: node.model as string }));
	let components = await childrenOf(sectionTipo);
	if (components.length === 0) {
		// Virtual section: relations[0].tipo points at the REAL section.
		const relations = (await getNode(sectionTipo))?.relations;
		const realTipo = Array.isArray(relations)
			? (relations[0] as { tipo?: unknown } | undefined)?.tipo
			: undefined;
		if (typeof realTipo === 'string') components = await childrenOf(realTipo);
	}

	const dataLang = (config.menu as { dataLang?: string }).dataLang ?? 'lg-spa';
	const backfillStamp = stamp(new Date(now.getTime() - 60_000));
	const nowStamp = stamp(now);

	for (const component of components) {
		if (EXCLUDED_EMPTY_MODELS.has(component.model)) continue;
		// component_info data is observer-COMPUTED (PHP empties it and logs a TM
		// row even without a stored key) — ledgered, no stored-key contract here.
		if (component.model === 'component_info') continue;
		const model = (await getModelByTipo(component.tipo)) ?? component.model;
		const column = getColumnNameByModel(model);
		if (column === null) continue;
		const stored = (record[column as MatrixJsonbColumn] as Record<string, unknown> | null)?.[
			component.tipo
		];
		if (stored === undefined || stored === null || (Array.isArray(stored) && stored.length === 0)) {
			continue;
		}

		// component_filter keeps the user's default project (PHP
		// get_default_data_for_user) instead of emptying to null.
		const newData =
			model === 'component_filter'
				? [
						{
							type: 'dd151',
							section_id: String(config.features.defaultProject), // DEDALO_DEFAULT_PROJECT
							section_tipo: config.features.filterSectionTipo, // DEDALO_FILTER_SECTION_TIPO_DEFAULT
							from_component_tipo: component.tipo,
						},
					]
				: null;

		const tmLang = (await getTranslatableByTipo(component.tipo)) ? dataLang : 'lg-nolan';
		const history = (await sql.unsafe(
			`SELECT 1 FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND lang = $4 LIMIT 1`,
			[sectionTipo, sectionId, component.tipo, tmLang],
		)) as unknown[];
		if (history.length === 0) {
			// Backfill-repair: the OLD full value, stamped 60s before the change.
			await recordTimeMachine(
				{
					sectionTipo,
					sectionId,
					componentTipo: component.tipo,
					lang: tmLang,
					userId,
					data: stored,
				},
				backfillStamp,
			);
		}
		await recordTimeMachine(
			{
				sectionTipo,
				sectionId,
				componentTipo: component.tipo,
				lang: tmLang,
				userId,
				data: newData,
			},
			nowStamp,
		);
		// Chokepoint write (PHP key-removal semantics: last key leaves '{}');
		// the stamps refresh ONCE at the end, not per component.
		await persistRecordKeys(
			{ table, sectionTipo, sectionId },
			[{ column: column as MatrixJsonbColumn, key: component.tipo, value: newData }],
			false,
		);
	}

	// Modified stamps (PHP update_modified_section_data 'update_record').
	await persistModifiedStamp({ table, sectionTipo, sectionId }, { userId, now });

	return { deleted: [String(sectionId)], removed: false };
}
