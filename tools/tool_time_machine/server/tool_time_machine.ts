/**
 * tool_time_machine.apply_value — restore one historical snapshot (a
 * matrix_time_machine row, identified by its own PK `matrix_id`) back into
 * the live record (PHP tools/tool_time_machine::apply_value).
 *
 * COMPONENT branch (the client's "Apply and save" button): the TM row's data
 * overwrites the component's live value, after stripping dataframe frame
 * entries from the main data — a TM snapshot of a dataframe-paired component
 * carries BOTH the main items and dd490 frame objects, and restoring a frame
 * into the main column corrupts it (this strip applies to literal mains too,
 * not only relation models — the historical relation-only filter leaked
 * locators into literal columns). component_iri separates by the `iri`
 * property instead (frames never carry it). The stripped-out frames are NOT
 * discarded: they are replayed into their `component_dataframe` slots FIRST
 * (dataframe_restore.ts — PHP's set_time_machine_data sequence), because a
 * main restored without its frames leaves orphan pairings behind. The restore
 * then writes a fresh TM audit row carrying main + frames, so the restore
 * itself is revertible (PHP: "the new save immediately creates a fresh TM
 * entry"; component restores do NOT delete the consumed TM row), and finally
 * fires the observer cascade like every PHP `element->save()` did.
 *
 * SECTION branch (recover a whole deleted/edited record): the TM snapshot's
 * data is a full matrix-columns object; it overwrites the live record via the
 * write chokepoint (PHP element->set_data + save()). LEDGERED vs PHP (no
 * fixture / no TS twin): deleted-media relink, the session-SQO reset (TS has no
 * PHP session), and the TM-row consumption (PHP deletes the restored snapshot;
 * TS keeps it — harmless, the fresh audit row supersedes it in the list).
 *
 * UNCOVERED SCOPE (denied loudly, never guessed) — both refusals exist because
 * the alternative is DELETING data the archive cannot get back:
 *   1. restoring a TM row whose own tipo IS a `component_dataframe` slot — with
 *      or without `caller_dataframe`. For such a row the snapshot's dd490
 *      entries ARE the component's value, so the shared
 *      `stripDataframeFramesFromTmMain` (which the TM PREVIEW read applies too)
 *      reduces it to an empty array and the restore would silently WIPE the
 *      slot. Un-stripping only the restore would make the tool write something
 *      the user never previewed; the fix belongs in the ONE shared strip plus
 *      `section/read.ts`, so until then the door refuses instead of deleting.
 *   2. restoring a snapshot that carries NO frames onto a main whose slots DO
 *      hold frames (`refuseFramelessWipe`). The CAPTURE half is unported —
 *      `save_component.ts` never appends the slots' frames — so every TS-written
 *      TM row is frameless and indistinguishable from a PHP-era row whose slots
 *      were genuinely empty. Replaying the wipe would delete frames that exist
 *      in no other row. Lifted the day capture lands.
 *
 * A frame naming a tipo that is NOT a live dataframe slot is NOT refused: PHP's
 * per-slot filter matches it nowhere either, so it restores nothing and is
 * stripped out of the main data (see dataframe_restore.ts's header).
 */

import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { MATRIX_JSONB_COLUMNS } from '../../../src/core/db/matrix.ts';
import {
	absorbComponentItemIds,
	readMatrixKeyForUpdate,
} from '../../../src/core/db/matrix_write.ts';
import { withTransaction } from '../../../src/core/db/postgres.ts';
import { recordEpoch } from '../../../src/core/db/record_generation.ts';
import {
	readTimeMachineRow,
	recordTimeMachine,
	type TimeMachineRow,
} from '../../../src/core/db/time_machine.ts';
import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { restoreDeletedSectionMediaFiles } from '../../../src/core/media/file_ops.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { isLangSlicedModel } from '../../../src/core/section/record/save_component.ts';
import { persistRecordColumns, persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { principalCanAccessRecord } from '../../../src/core/security/record_scope.ts';
import { stripDataframeFramesFromTmMain } from '../../../src/core/tm_record/tm_record.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { normalizeRestoredSectionIds } from '../../../src/core/update/transform/section_id_restore.ts';
import {
	applyDataframeRestore,
	composeTimeMachineSnapshot,
	DataframeRestoreError,
	type DataframeSlotRestore,
	planDataframeRestore,
	refuseFramelessWipe,
	resolveDataframeSlotTipos,
} from './dataframe_restore.ts';
import { propagateRestoreToObservers, readComponentItems } from './restore_common.ts';

/**
 * SECTION restore (PHP apply_value model==='section'): the snapshot is a full
 * matrix-columns object; overwrite the live record's columns through the write
 * chokepoint (PHP element->set_data + save(), which stamps the modified audit).
 * Structural 'id' is not a column; every jsonb column present in the snapshot
 * is written (including 'data' section metadata — PHP set_data replaces all).
 */
async function restoreSection(
	tmRow: TimeMachineRow,
	sectionTipo: string,
	sectionId: number,
	userId: number,
): Promise<void> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new DedaloError('request.invalid_model', {
			coordinates: { section_tipo: sectionTipo },
			message: `No matrix table for '${sectionTipo}'`,
		});
	}
	const snapshot = tmRow.data;
	if (snapshot === null || typeof snapshot !== 'object') {
		throw new DedaloError('tool.target_not_found', {
			coordinates: { section_tipo: sectionTipo, section_id: sectionId, tm_id: tmRow.id },
			message: 'The TM section snapshot is empty',
		});
	}
	const columns: Partial<Record<MatrixJsonbColumn, unknown>> = {};
	for (const [column, value] of Object.entries(snapshot as Record<string, unknown>)) {
		if (MATRIX_JSONB_COLUMNS.includes(column as MatrixJsonbColumn)) {
			columns[column as MatrixJsonbColumn] = value;
		}
	}
	// section_id int-canonical convergence (WC-2026-08-10-section-id-int-canonical, D6.2): TM snapshots — and any pre-migration backup restored
	// into a post-migration install — carry string-form locator addresses; a
	// verbatim write would re-inject them forever. The kernel converts what the
	// sweep would convert (external remote ids and junk pass verbatim), so
	// restores CONVERGE on the canonical form instead of undoing the sweep.
	await normalizeRestoredSectionIds(columns);
	await persistRecordColumns({ table, sectionTipo, sectionId }, columns, { userId });

	// THE FILES, TOO (P1-11 / LIFE-08). The delete moved every managed file of
	// every media component into its quality dir's `deleted/` sub-folder — a
	// move, never a hard delete, precisely so this step can undo it. Without it
	// the restored record's media column points at live paths holding NO FILES
	// and the restore still answers ok:true: the row is back, the objects are
	// not, and only opening the record shows it.
	//
	// POST-PERSIST and unwrapped, matching the delete's own post-commit half: the
	// row must be back before the files are, and a media failure must not undo a
	// restore that landed. `restoreDeletedSectionMediaFiles` never overwrites a
	// live file — an operator may have re-uploaded since, and silently replacing
	// the newer file with the pre-delete one is the one outcome nothing can undo.
	try {
		const mediaColumn = columns.media as Record<string, unknown[]> | null | undefined;
		const outcome = await restoreDeletedSectionMediaFiles(sectionTipo, sectionId, mediaColumn);
		if (outcome.errors.length > 0) {
			console.error(
				`[tool_time_machine] media restore for ${sectionTipo}/${sectionId} reported: ${outcome.errors.join('; ')}`,
			);
		}
	} catch (error) {
		// Never fail a landed restore on the file half — say it loudly instead.
		console.error(
			`[tool_time_machine] media restore for ${sectionTipo}/${sectionId} FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// LEDGERED (no TS twin / no fixture): session-SQO reset, and consuming
	// (deleting) the restored TM row.
}

/**
 * The LANGUAGES a component TM snapshot speaks for — the set whose live items
 * the restore is entitled to replace (DATA-03,
 * WC-2026-08-27-tm-lang-slice-restore-merge).
 *
 * A lang-sliced component's TM row is NOT the component's value: it is the
 * EFFECTIVE-LANGUAGE SLICE of it. `save_component.ts` writes it that way
 * (`tmSnapshot = langSliced ? items.filter(item => item.lang === effectiveLang)`
 * :1231-1238, PHP get_data_lang parity), so a trilingual literal has three
 * independent one-language histories and no row anywhere holds all three.
 *
 * The languages are read from the SNAPSHOT ITSELF rather than from the TM row's
 * `lang` column, because the items are what the write actually carries: a row
 * whose column and payload disagree would otherwise decide the fate of a
 * language the payload never mentions. The column is the fallback for the two
 * cases the items cannot answer, and both must still touch exactly ONE language
 * rather than turn the restore into a no-op or into a whole-key replace:
 *   - an EMPTY snapshot (the slice was cleared that day);
 *   - a snapshot that is not an item array at all — SQL NULL (what an empty
 *     slice is stored as) or a bare scalar. The caller passes `[]` for those:
 *     an unrepresentable snapshot is the EMPTY SLICE of its own language, never
 *     a licence to reach a sibling language.
 *
 * SHARED with the bulk door (`bulk_revert.ts`), which applies the same law to
 * the same per-language snapshots — one predicate, never a second copy.
 */
export function snapshotLangs(
	snapshotItems: readonly unknown[],
	fallbackLang: string,
): Set<string> {
	const langs = new Set<string>();
	for (const item of snapshotItems) {
		if (item === null || typeof item !== 'object') continue;
		const itemLang = (item as { lang?: unknown }).lang;
		if (typeof itemLang === 'string' && itemLang !== '') langs.add(itemLang);
	}
	if (langs.size === 0) langs.add(fallbackLang);
	return langs;
}

/**
 * MERGE a restored snapshot OVER the live value instead of replacing the key
 * (DATA-03 — the divergence from PHP, ledgered in
 * `engineering/wire_contract/WC-2026-08-27-tm-lang-slice-restore-merge.md`).
 *
 * THE LAW, stated once: *a component restore never deletes a language the
 * snapshot does not carry.* PHP's apply_value wrote the one-language slice as
 * the whole component key, so restoring the Spanish version of a trilingual
 * literal DELETED the Basque and the English value — silently, with `ok:true`,
 * and the fresh TM row the restore wrote carried only the restored slice, so
 * the loss was invisible even in the history the restore itself created.
 * Sequential per-language restores ping-ponged, which is why the tool could not
 * reassemble a multilingual value at all.
 *
 * Survivors keep their stored object VERBATIM (same reference, therefore the
 * same key order through json_codec), so an untouched language is byte-identical
 * before and after. They come first and the restored items last, which is the
 * order `save_component.ts` already writes a lang-sliced save in
 * (`items = [...otherLangs, ...stamped]`, PHP set_data_lang :1052-1128) — the
 * restore must not invent a second array shape for the same component.
 *
 * DELIBERATELY MORE CONSERVATIVE than set_data_lang in one respect: a live item
 * with no `lang` (a lang orphan) is KEPT here, where the save path drops it.
 * This door's mandate is to replay a snapshot, not to garbage-collect data no
 * snapshot mentions — and an orphan deleted by a restore is deleted with no row
 * anywhere to recover it from.
 *
 * SHARED with `bulk_revert.ts`: both restore doors write the same shape from the
 * same per-language snapshots, so they merge through this one function. A second
 * copy would drift into a second notion of "the slice" — and the bulk door's
 * blast radius is a whole batch per click.
 */
export function mergeRestoredLangSlice(
	liveItems: readonly unknown[],
	restoredItems: readonly unknown[],
	restoredLangs: ReadonlySet<string>,
): unknown[] {
	const survivors = liveItems.filter((item) => {
		if (item === null || typeof item !== 'object') return true;
		const itemLang = (item as { lang?: unknown }).lang;
		return typeof itemLang !== 'string' || !restoredLangs.has(itemLang);
	});
	return [...survivors, ...restoredItems];
}

/**
 * The ONE-LANGUAGE slice a restore's own TM AUDIT row carries (DATA-03,
 * WC-2026-08-27-tm-lang-slice-restore-merge).
 *
 * Byte-for-byte the rule the save path applies to the same write —
 * `save_component.ts:1231-1238`, `items.filter(item => item.lang ===
 * effectiveLang)` stamped `lang: effectiveLang` — because ONE TM ROW IS ONE
 * LANGUAGE everywhere else in the engine: the dd15 history list filters the
 * rows by `filter_by_locators.lang` (`js/tool_time_machine.js` :381-386), the
 * preview and list emit resolve a row against the request lang
 * (`section/read.ts` :715-722 grafts the row, :751 injects it; the lang filter
 * is `resolve/component_data.ts` :123-125), and both
 * restore doors decide what they may replace from the row's own items
 * (`snapshotLangs`). A row that carried several languages under one `lang` tag
 * therefore reverted languages nobody selected — restoring it from the Spanish
 * timeline put an English value back that the English timeline had already
 * moved past.
 *
 * The tag and the payload are derived from the SAME lang, so the row is
 * self-consistent by construction: a written value whose items do not speak the
 * audit language yields the empty slice for it, which is the invariant being
 * enforced rather than propagated.
 */
export function tmAuditSlice(writtenValue: unknown, auditLang: string): unknown {
	if (!Array.isArray(writtenValue)) return writtenValue;
	return writtenValue.filter(
		(item) =>
			item !== null && typeof item === 'object' && (item as { lang?: unknown }).lang === auditLang,
	);
}

/**
 * Append the RECOVER SECTION / RECOVER COMPONENT activity row (dd42 codes
 * 13/14, PHP tool_time_machine :99 / :213 / :419).
 *
 * (!) The WHERE tipo is the SECTION tipo for BOTH — including a component
 * restore, whose own tipo goes unused. That is PHP's behaviour at all three
 * call sites, not an oversight here.
 */
async function logRecoverActivity(
	context: ToolActionContext,
	what: 'RECOVER SECTION' | 'RECOVER COMPONENT',
	payload: Record<string, unknown>,
	sectionTipo: string,
): Promise<void> {
	const { logActivity, hostFromClientIp } = await import(
		'../../../src/core/api/handlers/activity_log.ts'
	);
	await logActivity({
		what,
		tipo: sectionTipo,
		userId: context.userId,
		host: hostFromClientIp(context.clientIp),
		data: payload,
	});
}

export async function toolTimeMachineApplyValue(context: ToolActionContext): Promise<ToolResponse> {
	const { options, userId } = context;
	const sectionTipo = String(options.section_tipo ?? '');
	const sectionId = Number(options.section_id ?? 0);
	const tipo = String(options.tipo ?? '');
	const lang = String(options.lang ?? 'lg-nolan');
	const matrixId = options.matrix_id;

	if (sectionTipo === '' || tipo === '' || matrixId === null || matrixId === undefined) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'section_tipo, tipo and matrix_id are required',
		});
	}

	const model = await getModelByTipo(tipo);
	if (model === null) {
		throw new DedaloError('request.invalid_tipo', { coordinates: { tipo } });
	}
	if (model !== 'section' && !model.startsWith('component_')) {
		throw new DedaloError('request.invalid_model', {
			coordinates: { tipo, model },
			message: `apply_value for model '${model}' is not restorable`,
		});
	}
	// SEC-024 §9.4 — PER-RECORD scope. The declarative module gate ('tipo',
	// level 2) authorizes the (section_tipo, tipo) SCHEMA pair; it says nothing
	// about the caller-supplied section_id, and the TM row lookup applies no
	// projects filter of its own. Without this a level-2 user restores a
	// historical snapshot into a record outside their filter_by_projects scope
	// (PHP asserts security::assert_record_in_user_scope here — it was the ONLY
	// gate of the two that this port dropped). PHP skips it for an empty
	// section_id; so do we — the TM target match below refuses those anyway.
	if (
		sectionId > 0 &&
		!(await principalCanAccessRecord(sectionTipo, sectionId, context.principal))
	) {
		throw new DedaloError('perm.out_of_scope', {
			coordinates: { section_tipo: sectionTipo, section_id: sectionId },
		});
	}
	if (options.caller_dataframe !== null && options.caller_dataframe !== undefined) {
		// Dataframe SLOT restore is uncovered scope (no fixture to gate it).
		throw new DedaloError('engine.uncovered_scope', {
			coordinates: { tipo, section_tipo: sectionTipo },
			message: 'apply_value with caller_dataframe is uncovered scope on this server (ledgered)',
		});
	}

	// TM row lookup — matrix_id is the PK of matrix_time_machine (shared reader).
	const tmRow = await readTimeMachineRow(Number(matrixId));
	if (tmRow === null) {
		throw new DedaloError('tool.target_not_found', {
			coordinates: { tm_id: String(matrixId) },
			message: `TM row not found: ${String(matrixId)}`,
		});
	}
	// The snapshot must belong to the requested target — a mismatched matrix_id
	// would restore another record's history into this one.
	//
	// (!) The address is NOT enough (P0-14). Where a section_id was re-minted, a
	// DEAD record's snapshots carry the living record's exact coordinates, so
	// this check passed and the restore wrote the dead record's values in with
	// ok:true. The record's generation epoch is the second half of its identity:
	// rows below it belong to whoever held the address before.
	const epoch = await recordEpoch(sectionTipo, sectionId);
	if (
		tmRow.section_tipo !== sectionTipo ||
		tmRow.section_id !== sectionId ||
		tmRow.tipo !== tipo ||
		tmRow.id < epoch
	) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'matrix_id does not belong to the requested target',
			coordinates: { tm_id: String(matrixId), section_tipo: sectionTipo, tipo },
		});
	}

	// SECTION restore: overwrite the whole record from the snapshot columns.
	if (model === 'section') {
		// Throws on refusal (the dispatch catch converts), so the activity row is
		// appended only for a restore that actually landed.
		await restoreSection(tmRow, sectionTipo, sectionId, userId);
		await logRecoverActivity(
			context,
			'RECOVER SECTION',
			{
				msg: 'Recovered section record from time machine',
				section_id: sectionId,
				section_tipo: sectionTipo,
				top_id: sectionId,
				top_tipo: sectionTipo,
				table: (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix',
				tm_id: matrixId,
			},
			sectionTipo,
		);
		return ok(true, { requestId: toolRequestId(context) });
	}

	// COMPONENT restore.
	if (model === 'component_dataframe') {
		// See the header: the shared preview/restore strip empties a slot's own
		// snapshot, so restoring it would silently delete the slot.
		throw new DedaloError('engine.uncovered_scope', {
			coordinates: { tipo, model },
			message:
				`apply_value on a component_dataframe slot ('${tipo}') is uncovered scope on this ` +
				'server: the shared time-machine strip would write an empty slot (ledgered)',
		});
	}

	// int-canonical convergence on the WHOLE snapshot (D6.2 — see restoreSection),
	// BEFORE the strip and the frame plan below: the frames replayed into the
	// slots are stored addresses too, so normalizing only the main would write
	// the main int-form and its frames string-form — half a convergence, and the
	// legacy form re-injected on exactly the rows the sweep just fixed.
	const snapshot = { value: tmRow.data };
	await normalizeRestoredSectionIds(snapshot);
	const canonicalSnapshot = snapshot.value;

	// Main data: strip dataframe frames (iri: keep only entries carrying `iri`).
	// SAME strip the tool_time_machine preview read applies (read.ts), so the
	// value the user previewed is exactly what this restore writes.
	const data = stripDataframeFramesFromTmMain(model, canonicalSnapshot);

	// IS THIS SNAPSHOT A LANGUAGE SLICE? (DATA-03). The predicate is the WRITE
	// engine's own export — `isLangSlicedModel` (save_component.ts :326, PHP
	// supports_translation && !is_relation) — never a second copy and never the
	// ontology `translatable` flag alone: the flag mis-slices, because an
	// ontology-non-translatable input_text still slices, on the `lg-nolan` the
	// engine normalizes it to. Read and write must agree on what "the slice" is,
	// or a restore replaces a language the save never wrote there. For every
	// OTHER model the TM row holds the component's whole value, and this door
	// keeps replacing the key exactly as PHP did — merging there would resurrect
	// portal locators and select values a later save legitimately removed.
	const langSliced = isLangSlicedModel(model);
	// The request's effective lang — the same translatable-or-iri rule the save
	// path stamps with (save_component.ts :680). It is only the FALLBACK here:
	// see `snapshotLang` below.
	const translatable = await getTranslatableByTipo(tipo);
	const requestEffectiveLang = translatable || model === 'component_iri' ? lang : 'lg-nolan';
	// THE LANGUAGE THIS RESTORE SPEAKS FOR — the TM ROW's own lang column, and
	// only when that is null/empty (pre-migration rows) the request's effective
	// lang. The bulk door derives it the same way (`bulk_revert.ts` :292,
	// `auditLang = rowLang ?? …`), and the two doors must agree.
	//
	// (!) `options.lang` is NOT validated against `tmRow.lang` — the target check
	// above covers section_tipo / section_id / tipo only — so a caller may hand
	// this door a Spanish row with `lang: lg-eng`. The MERGE was already right
	// there (it reads its languages from the snapshot items), but tagging and
	// slicing the audit row with the REQUEST lang wrote that row into the
	// UNTOUCHED language's timeline, carrying that language's surviving items:
	// the changed language recorded nothing, and the untouched one gained a row
	// duplicating its current value — restoring which later reverts an edit
	// nobody selected. Deriving both from the ROW closes it (DATA-03).
	const snapshotLang = tmRow.lang !== null && tmRow.lang !== '' ? tmRow.lang : requestEffectiveLang;
	// The snapshot's ITEMS — `[]` for a snapshot that is not an item array.
	// (!) The lang branch is NOT gated on that array shape. `matrix_time_machine.data`
	// is a NULLABLE jsonb column, so a lang-sliced component's row can hold SQL
	// NULL (what an empty slice is written as) or a bare scalar — PHP-era rows do.
	// Such a snapshot is the EMPTY SLICE of its own language; sending it down the
	// whole-key path instead deleted EVERY language the component had and wrote a
	// bare string into a key that must hold an item array. The snapshot's shape may
	// decide how much of ONE language is restored; it may never decide whether a
	// SIBLING language lives.
	const restoredItems = Array.isArray(data) ? data : [];
	const restoredLangs = langSliced ? snapshotLangs(restoredItems, snapshotLang) : null;

	// Overwrite the live component value.
	const column = getColumnNameByModel(model);
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (column === null || table === null) {
		throw new DedaloError('request.invalid_model', {
			coordinates: { model, section_tipo: sectionTipo },
			message: `No matrix column/table for '${model}' / '${sectionTipo}'`,
		});
	}
	const writeTarget = { table, sectionTipo, sectionId };

	// The FRAME half (PHP apply_value :277-333). Planned before anything is
	// written so an unplaceable frame refuses the whole restore instead of
	// leaving the record half-restored.
	let framePlan: DataframeSlotRestore[];
	try {
		framePlan = await planDataframeRestore(
			tipo,
			canonicalSnapshot,
			await resolveDataframeSlotTipos(tipo),
		);
	} catch (error) {
		if (error instanceof DataframeRestoreError) {
			// The refusal sentence names slot tipos — LOG-only (the code's
			// disclosure is 'operator'), never echoed on the wire.
			throw new DedaloError('engine.uncovered_scope', {
				cause: error,
				coordinates: { tipo, section_tipo: sectionTipo },
				message: error.message,
			});
		}
		throw error;
	}

	// The frameless-wipe guard (dataframe_restore.ts): the CAPTURE half is
	// unported, so a TS-written snapshot carries no frames and applying this
	// plan would DELETE the live ones with no row anywhere to recover them.
	// Refuse before a single write, never "restore most of it".
	const framelessRefusal = await refuseFramelessWipe(writeTarget, tipo, framePlan);
	if (framelessRefusal !== null) {
		throw new DedaloError('engine.uncovered_scope', {
			coordinates: { tipo, section_tipo: sectionTipo, section_id: sectionId },
			message: framelessRefusal,
		});
	}

	// Pre-restore main value — the observer cascade needs the locators this
	// restore DROPS (targets whose mirror still references the record).
	const preRestoreItems = await readComponentItems(table, sectionTipo, sectionId, column, tipo);

	// What the restore WRITES. Identical to the snapshot for every non-sliced
	// model; for a sliced one it is the snapshot merged over the languages the
	// snapshot does not speak for, computed under the row lock below.
	let restoredValue: unknown = data;

	await withTransaction(async () => {
		// LANG-SLICE MERGE (DATA-03). The read is `FOR UPDATE` and lives INSIDE
		// the transaction on purpose: this is a read-modify-write of a whole
		// component key, so an unlocked read would silently revert whatever a
		// concurrent save committed on the sibling languages between the read and
		// the write — the same lost-update shape the merge exists to close, moved
		// one layer down. The lock is taken FIRST, before the frame writes, so the
		// whole restore holds one consistent view of the record.
		if (restoredLangs !== null) {
			const liveItems = await readMatrixKeyForUpdate(
				table,
				sectionTipo,
				sectionId,
				column as MatrixJsonbColumn,
				tipo,
			);
			// null = the ROW does not exist; there is nothing to merge over and
			// nothing this door can write either.
			restoredValue = mergeRestoredLangSlice(liveItems ?? [], restoredItems, restoredLangs);
		}

		// Frames FIRST (PHP restores the slots before saving the main).
		await applyDataframeRestore(writeTarget, framePlan);

		// Chokepoint write: restored value + the record's modified stamps in one
		// update (PHP: apply_value restores via element->save(), which stamps).
		await persistRecordKeys(
			writeTarget,
			[{ column: column as MatrixJsonbColumn, key: tipo, value: restoredValue }],
			{ userId },
		);
		// Restored items carry explicit ids; raise the counter so a later insert
		// cannot mint a duplicate (PHP raises on every set_data). For a
		// dataframe-paired main this is load-bearing: a duplicated main item id
		// would make two items answer to the same frame `id_key`.
		await absorbComponentItemIds(
			table,
			sectionTipo,
			sectionId,
			tipo,
			Array.isArray(restoredValue) ? restoredValue : [],
		);

		// Fresh TM audit for the restore itself (PHP: the component save creates a
		// new TM entry; the consumed row is kept). Its data is main + every
		// restored frame (PHP get_time_machine_data_to_save), so reverting the
		// restore brings the frames back with it. Stamp via the ONE shared
		// DEDALO_TIMEZONE-aware helper (S1-03) — never an inline UTC formatter.
		//
		// For a lang-sliced component that row is ONE LANGUAGE — `snapshotLang`,
		// the language the restored ROW speaks for, sliced out of the post-merge
		// value exactly as the save path slices the same write (`tmAuditSlice`,
		// save_component.ts :1231-1238). DATA-03: writing the whole merged value
		// under a single-language `lang` tag broke the one-row-one-language
		// assumption every other consumer of this table holds (see
		// `tmAuditSlice`), so restoring the row this door had just written
		// reverted languages the operator never selected — English came back from
		// the Spanish timeline while the English timeline's newest row said
		// something else. The merge is what makes a one-language row sufficient:
		// reverting it replaces that language and leaves the others standing.
		// The tag is the ROW's language and not the REQUEST's for the same
		// reason: they can differ, and then the request lang files the row under
		// a timeline this restore did not touch.
		await recordTimeMachine(
			{
				sectionTipo,
				sectionId,
				componentTipo: tipo,
				lang: langSliced ? snapshotLang : lang,
				userId,
				data: composeTimeMachineSnapshot(
					langSliced ? tmAuditSlice(restoredValue, snapshotLang) : restoredValue,
					framePlan,
				),
			},
			dbTimestamp(),
		);
	});

	// Observer cascade, POST-COMMIT (PHP: apply_value restores through
	// element->save(), whose last act is propagate_to_observers — this port
	// wrote through the chokepoint directly and skipped it, so a TM restore of
	// an observed component left every mirror stale and logged no observer TM
	// row). Post-commit because a cascade hop refuses to run inside an ambient
	// transaction (B6, observers.ts).
	// The cascade diffs against what was WRITTEN, not against the snapshot: fed
	// the slice, it would report every surviving sibling language as a removed
	// target and unwire mirrors the restore never touched.
	await propagateRestoreToObservers(
		tipo,
		sectionTipo,
		sectionId,
		preRestoreItems,
		restoredValue,
		userId,
	);

	await logRecoverActivity(
		context,
		'RECOVER COMPONENT',
		{
			msg: 'Recovered component data from time machine',
			model,
			section_id: sectionId,
			section_tipo: sectionTipo,
			table,
			tm_id: matrixId,
		},
		sectionTipo,
	);

	return ok(true, { requestId: toolRequestId(context) });
}
