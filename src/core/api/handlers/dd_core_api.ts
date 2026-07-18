/**
 * dd_core_api handlers (WS-C S2-25 extraction — bodies moved VERBATIM from
 * api/dispatch.ts; dispatch keeps registry assembly + gates + envelope).
 *
 * The `read` sub-action routing (relation-list / TM / resolve_data / get_data /
 * generic readSection) lives in the section facade —
 * src/core/section/read_facade.ts — so read semantics stay with the section
 * subsystem; this file keeps only the ACL gates and the menu/area model
 * dispatch that run BEFORE routing.
 */

import { config } from '../../../config/config.ts';
import { dispatchAreaRead, refuseAreaWrite } from '../../area/read.ts';
import { isAreaModel } from '../../concepts/area.ts';
import type { Rqo } from '../../concepts/rqo.ts';
import { isConsultationOnlySection } from '../../concepts/section.ts';
import { getSectionTipos } from '../../concepts/sqo.ts';
import { currentApplicationLang, currentDataLang } from '../../resolve/request_lang.ts';
import { routeSectionRead } from '../../section/read_facade.ts';
import { type ChangedDataItem, saveComponentData } from '../../section/record/save_component.ts';
import {
	type Principal,
	getPermissions,
	getSectionPermissions,
} from '../../security/permissions.ts';
import type { Session } from '../../security/session_store.ts';
import { getTermByLocator, getTermTipos } from '../../ts_object/term_resolver.ts';
import {
	type ActionHandler,
	type ApiRequestContext,
	requirePrincipal,
} from '../handler_context.ts';
import { type ApiResult, denied } from '../response.ts';

/** PHP safe_tipo grammar (shared/core_functions.php:2296). */
const SAFE_TIPO = /^[a-z]{2,}[0-9]+$/;

/** dd_core_api action handlers, keyed by action (registered in dispatch.ts). */
export const coreApiActions: Record<string, ActionHandler> = {
	read: async (rqo, context) => {
		// Permission gates BEFORE any search/DB work (PHP build_json_rows
		// gate A + per-sqo-target gate). The session is guaranteed here (read
		// is not in NO_LOGIN_ACTIONS).
		const principal = requirePrincipal(context);

		// Menu read (PHP menu::get_json). Navigation, not a section: it carries
		// its own fixed permission (level 2), so it is resolved BEFORE the
		// section permission gates rather than through the dd774 matrix.
		if ((rqo.source?.model ?? '') === 'menu') {
			return await readMenu(rqo, context, principal);
		}

		// Area-model reads (PHP area_*_json controllers) — tree areas
		// (thesaurus/ontology boot data), maintenance (widget catalog), and
		// — Phase B — the dashboard. dispatchAreaRead returns null for
		// dashboard-behavior areas until that engine lands, so they fall
		// through to the generic path exactly as before (engineering/AREA_SPEC.md §2).
		if (isAreaModel(rqo.source?.model ?? '')) {
			const areaResult = await dispatchAreaRead(rqo, principal);
			if (areaResult !== null) {
				await logReadActivity(rqo, principal, context, areaResult);
				return areaResult;
			}
		}

		// Gate A: source (section_tipo, tipo).
		const source = rqo.source ?? {};
		if (source.section_tipo !== undefined && source.tipo !== undefined) {
			const level = await getPermissions(principal, source.section_tipo, source.tipo);
			if (level < 1) {
				return denied(403, 'Insufficient permissions to read');
			}
		}
		// Gate B: every SQO target section, self-keyed.
		if (rqo.sqo !== undefined) {
			for (const targetSectionTipo of getSectionTipos(rqo.sqo)) {
				const level = await getPermissions(principal, targetSectionTipo, targetSectionTipo);
				if (level < 1) {
					return denied(403, 'Insufficient permissions to read');
				}
			}
		}

		// Sub-action routing + the generic section read live in the section
		// facade (S2-25) — everything below the gates is section semantics.
		const readResult = await routeSectionRead(rqo, principal);
		// LOAD activity (PHP dd_core_api::read :771 → log_activity): every
		// section/area page load appends a 'LOAD EDIT'/'LOAD LIST' audit row keyed
		// by the SECTION tipo. This is the stream the dashboard timeline aggregates
		// (metricActivity filters WHERE ∈ child sections) — without it the activity
		// card is permanently empty (only component-keyed SAVE rows exist, which
		// the section filter correctly ignores).
		await logReadActivity(rqo, principal, context, readResult);
		return readResult;
	},
	save: async (rqo, context) => {
		// State-changing action: CSRF is enforced by the dispatch gate
		// (save is NOT in CSRF_EXEMPT_ACTIONS). Permission gate: level >= 2
		// on (section_tipo, component tipo) — PHP dd_core_api::save parity.
		const principal = requirePrincipal(context);
		const source = rqo.source ?? {};
		const dataPayload = (rqo.data ?? {}) as { changed_data?: ChangedDataItem[] };

		if (
			source.tipo === undefined ||
			source.section_tipo === undefined ||
			source.section_id === undefined ||
			source.section_id === null
		) {
			return denied(400, 'save: source.tipo/section_tipo/section_id are required');
		}
		const saveAreaRefusal = await refuseAreaWrite(source.section_tipo, source.model);
		if (saveAreaRefusal !== null) return saveAreaRefusal;
		// Consultation-only sections (Activity dd542, Time Machine dd15, …) are
		// read-only regardless of any component-level grant (PHP dd_core_api:1330
		// "Illegal save to activity"). The search_* exception preserves saving a
		// search/list preset within the section's list view. The write ENGINE
		// (saveComponentData) enforces the same rule for MCP/agent doors.
		if (
			isConsultationOnlySection(source.section_tipo) &&
			!String(source.section_id).startsWith('search_')
		) {
			return denied(403, `Illegal save to read-only section '${source.section_tipo}'`);
		}
		// SEARCH-MODE relation link (portal/relation link_record + unlink_record):
		// the picker lands on a CLIENT-MINTED synthetic id ('search_<n>', search.js
		// get_section_id) that is NOT a matrix row. The picked locator is a search
		// FILTER (client entries → preset JSON → RQO q), never a persisted relation —
		// so RESOLVE it for the chip and ECHO it WITHOUT writing. The write path would
		// materialize the host record (createSectionRecord), which fails on the NaN id
		// and THROWS a 500 on read-only sections (Activity dd542 / Time Machine dd15).
		// Mirrors the resolve_data action; a read grant (>= 1) is enough — nothing is
		// written, and resolveSearchData applies its own per-target projects ACL.
		if (String(source.section_id).startsWith('search_')) {
			if (!Array.isArray(dataPayload.changed_data)) {
				return denied(400, 'save: data.changed_data must be an array');
			}
			const { getColumnNameByModel: columnOf, getModelByTipo: modelOf } = await import(
				'../../ontology/resolver.ts'
			);
			const searchModel = await modelOf(source.tipo);
			if (searchModel !== null && columnOf(searchModel) === 'relation') {
				const searchLevel = await getPermissions(principal, source.section_tipo, source.tipo);
				if (searchLevel < 1) {
					return denied(403, "You don't have enough permissions to search this component");
				}
				// The resulting picked set: the client sends clone(self.data) — its
				// CURRENT chips (entries) — plus the DELTA changed_data (link_record
				// one 'insert'; unlink_record one 'remove' by entry id). Reconcile
				// here: the echo is the client's next self.data verbatim (refresh
				// tmp_api_response), so inserts-only would drop every prior chip on
				// a second pick and clear ALL chips on an unlink. Insert duplicates
				// are dropped (the client's own duplicate check is page-local).
				const searchPayload = (rqo.data ?? {}) as { entries?: unknown; value?: unknown };
				const currentChips = (
					Array.isArray(searchPayload.entries)
						? (searchPayload.entries as Record<string, unknown>[])
						: Array.isArray(searchPayload.value)
							? (searchPayload.value as Record<string, unknown>[])
							: []
				).filter((chip) => chip !== null && typeof chip === 'object');
				const removedIds = new Set(
					dataPayload.changed_data
						.filter((change) => change.action === 'remove' && change.id != null)
						.map((change) => String(change.id)),
				);
				const merged = currentChips.filter((chip) => !removedIds.has(String(chip.id)));
				for (const change of dataPayload.changed_data) {
					if (change.action !== 'insert' || change.value == null) continue;
					const locator = change.value as Record<string, unknown>;
					const exists = merged.some(
						(chip) =>
							chip.section_tipo === locator.section_tipo &&
							String(chip.section_id) === String(locator.section_id),
					);
					if (!exists) merged.push(locator);
				}
				// Strip the echo-only stamps — resolveSearchData re-stamps id 1..n.
				const picked = merged.map(
					({ id: _id, paginated_key: _paginatedKey, ...locator }) => locator,
				);
				const resolveRqo = {
					...rqo,
					source: { ...source, action: 'resolve_data', value: picked },
				} as typeof rqo;
				const { resolveSearchData, buildGetDataContext } = await import('../../section/read.ts');
				const { buildDataItem } = await import('../../resolve/component_data.ts');
				const resolved = await resolveSearchData(resolveRqo, principal);
				// resolveSearchData emits the main item with a NULL record identity
				// (synthetic record — read.ts expandPortal stamp), so match by tipo
				// only and RE-STAMP the client's synthetic id: the client picks its
				// item by String(el.section_id)===String(self.section_id)
				// ('search_1', component_common.js:400). The resolved entries are the
				// string-cast locators the JSONB @> containment needs — rebuilding
				// from the raw numeric `picked` here would echo a numeric section_id
				// that misses every string-stored relation locator (0 rows).
				let mainItem = resolved.find(
					(item) =>
						(item as { tipo?: string }).tipo === source.tipo &&
						(item as { section_tipo?: string }).section_tipo === source.section_tipo,
				);
				if (mainItem !== undefined) {
					(mainItem as { section_id?: unknown }).section_id = source.section_id;
				} else {
					mainItem = buildDataItem(
						source.tipo,
						source.section_tipo,
						source.section_id,
						'search',
						source.lang ?? 'lg-nolan',
						// Same string cast as resolveSearchData's echo (PHP locator
						// parity, class.locator.php set_section_id).
						picked.map((locator) =>
							locator.section_id !== undefined && locator.section_id !== null
								? { ...locator, section_id: String(locator.section_id) }
								: locator,
						),
					);
					resolved.unshift(mainItem);
				}
				// The client's link_record duplicate-check reads pagination.total and
				// requires it to exceed the pre-insert count (component_portal.js:1063).
				(mainItem as { pagination?: unknown }).pagination = {
					total: picked.length,
					limit: picked.length,
					offset: 0,
				};
				const context = await buildGetDataContext(resolveRqo, resolved as never, principal);
				return { status: 200, body: { result: { context, data: resolved }, msg: 'OK' } };
			}
		}
		const level = await getPermissions(principal, source.section_tipo, source.tipo);
		if (level < 2) {
			return denied(403, "You don't have enough permissions to edit this component");
		}
		// Per-record scope gate (PHP assert_record_in_user_scope): a level-2 user
		// may only edit records inside their projects filter — the level gate
		// alone would let them write a record they can never see (cross-project
		// IDOR). Global admins are unscoped. Same rule as duplicate/delete/tools.
		if (!principal.isGlobalAdmin) {
			const { isRecordInScope } = await import('../../security/record_scope.ts');
			if (!(await isRecordInScope(source.section_tipo, Number(source.section_id), principal))) {
				return denied(403, 'Record is out of the user scope');
			}
		}
		if (!Array.isArray(dataPayload.changed_data)) {
			return denied(400, 'save: data.changed_data must be an array');
		}

		const outcome = await saveComponentData({
			componentTipo: source.tipo,
			sectionTipo: source.section_tipo,
			sectionId: Number(source.section_id),
			lang: source.lang ?? 'lg-nolan',
			changedData: dataPayload.changed_data,
			userId: principal.userId,
			// Dataframe saves carry the pairing context (PHP source.caller_dataframe).
			callerDataframe:
				(
					source as {
						caller_dataframe?: { main_component_tipo?: string; id_key?: number | string };
					}
				).caller_dataframe ?? null,
		});
		if (!outcome.ok) {
			return denied(400, `save failed: ${outcome.message}`);
		}
		// Server-side observers (PHP propagate_to_observers): the saved
		// component's declared observers recompute their external data.
		// component_alias (WC-020): observers watch the DATA component — a save
		// through an alias fires the TARGET's observers. Same-record observer
		// items (component_info recomputes) ride the response data below (PHP
		// observers_data merge — the client refreshes the info widget in place).
		let observersData: unknown[] = [];
		{
			const { propagateToObservers } = await import('./observers.ts');
			const { resolveDataTipo } = await import('../../ontology/alias.ts');
			observersData = await propagateToObservers(
				await resolveDataTipo(source.tipo),
				source.section_tipo,
				Number(source.section_id),
				Array.isArray(outcome.data) ? outcome.data : [],
				principal.userId,
			);
		}
		// Activity audit (PHP logger 'SAVE' code 5) — never fails the save.
		{
			const { logActivity } = await import('./activity_log.ts');
			const { getModelByTipo, getMatrixTableFromTipo } = await import('../../ontology/resolver.ts');
			const host =
				context.clientIp === '127.0.0.1' || context.clientIp === '::1'
					? 'localhost'
					: context.clientIp;
			await logActivity({
				what: 'SAVE',
				tipo: source.tipo,
				userId: principal.userId,
				host,
				datos: {
					msg: 'Saved component data',
					lang: source.lang ?? 'lg-nolan',
					tipo: source.tipo,
					table: (await getMatrixTableFromTipo(source.section_tipo)) ?? 'matrix',
					section_id: String(source.section_id),
					section_tipo: source.section_tipo,
					component_name: (await getModelByTipo(source.tipo)) ?? '',
				},
			});
		}
		// Return the saved component in the canonical DataItem shape the client
		// resolves by (component_common.js save()/build(): result.data.find(el =>
		// el.tipo===tipo && el.section_tipo===… && String(el.section_id)===…)).
		// PHP's save echoes this same {tipo, section_tipo, section_id, entries}
		// envelope; returning the bare items array left the client's .find()
		// empty, so the echoed value never round-tripped (client test suite:
		// "<component>. Data save using API").
		const { buildDataItem } = await import('../../resolve/component_data.ts');
		const savedItems = Array.isArray(outcome.data) ? outcome.data : [];
		// Relation saves echo context too (populated in the block below); [] for scalars.
		let savedContext: unknown[] = [];
		let savedDataItem = buildDataItem(
			source.tipo,
			source.section_tipo,
			Number(source.section_id),
			'edit',
			source.lang ?? 'lg-nolan',
			savedItems,
		);
		// The full response data payload: [main item] for scalars; for relation
		// saves the main item PLUS the linked targets' subdatum (below).
		let savedData: unknown[] = [savedDataItem];
		// Select-family components (radio_button/check_box/select/…) re-render
		// from data.datalist AFTER a save (e.g. component_radio_button
		// get_checked_value_label reads self.data.datalist); the edit read attaches
		// it, so the save echo must too or the post-save render dereferences
		// undefined (client suite test_component_radio_button reset flow).
		{
			const { SELECT_FAMILY_MODELS } = await import('../../relations/models/select_family.ts');
			const { getModelByTipo, getNode, getColumnNameByModel } = await import(
				'../../ontology/resolver.ts'
			);
			const savedModel = await getModelByTipo(source.tipo);
			if (savedModel !== null && SELECT_FAMILY_MODELS.has(savedModel)) {
				const { getDatalist } = await import('../../relations/datalist.ts');
				const savedNode = await getNode(source.tipo);
				(savedDataItem as { datalist?: unknown }).datalist = await getDatalist(
					source.tipo,
					savedNode?.properties ?? null,
					source.section_tipo,
					source.lang ?? 'lg-nolan',
				);
			}
			// Relation-column components (portal / relation_*): the client reuses the
			// save response as a BUILD response — link_record/unlink_record → refresh
			// → build_autoload reads result.context.length (component_portal.js:632)
			// and result.data.find(...).pagination.total (…:1063). The edit read emits
			// both (buildGetDataContext, relation_core.ts:140); the save echo must too
			// or the write op crashes / sees total:0 and returns false.
			const isRelationSave = savedModel !== null && getColumnNameByModel(savedModel) === 'relation';
			if (isRelationSave) {
				(savedDataItem as { pagination?: unknown }).pagination = {
					total: savedItems.length,
					limit: savedItems.length,
					offset: 0,
				};
				// PHP save answers get_json: the payload carries the component's
				// FULL resolved data — the main item plus the linked targets'
				// per-ddo subdatum values — so the client's link_record
				// refresh({tmp_api_response}) renders the picked chip WITHOUT a
				// second request (found live 2026-07-09: the picker link saved but
				// stayed blank until reload). Reuse the get_data pipeline; on any
				// resolution hiccup keep the bare echo (never fail a durable save).
				try {
					const { readComponentData } = await import('../../section/read.ts');
					const fullData = await readComponentData(rqo);
					const mainItem = fullData.find(
						(item) =>
							(item as { tipo?: string }).tipo === source.tipo &&
							String((item as { section_id?: unknown }).section_id) === String(source.section_id),
					);
					if (mainItem !== undefined) {
						const carriedDatalist = (savedDataItem as { datalist?: unknown }).datalist;
						if (carriedDatalist !== undefined) {
							(mainItem as { datalist?: unknown }).datalist = carriedDatalist;
						}
						savedDataItem = mainItem as typeof savedDataItem;
						savedData = fullData;
					}
				} catch {
					// bare echo fallback — the save itself is already durable
				}
				const { buildGetDataContext } = await import('../../section/read.ts');
				savedContext = await buildGetDataContext(rqo, savedData as never, principal);
			}
		}
		// PHP observers_data merge (:1503): the same-record recomputed observer
		// items append AFTER the saved component's own data.
		if (observersData.length > 0) {
			savedData = [...savedData, ...observersData];
		}
		return {
			status: 200,
			body: { result: { context: savedContext, data: savedData }, msg: 'OK' },
		};
	},
	read_raw: async (rqo, context) => {
		// Raw stored value(s) for a SQO's matched records (PHP read_raw).
		// Read-only; permission gate level >= 1 on every SQO target section.
		const principal = requirePrincipal(context);
		const options = (rqo.options ?? {}) as {
			section_tipo?: string;
			tipo?: string;
			model?: string;
			type?: string;
		};
		if (options.section_tipo === undefined) {
			return denied(400, 'read_raw: options.section_tipo is required');
		}
		if (options.tipo === undefined) {
			return denied(400, 'read_raw: options.tipo is required');
		}
		const targets = rqo.sqo !== undefined ? getSectionTipos(rqo.sqo) : [options.section_tipo];
		for (const targetSectionTipo of targets) {
			const level = await getPermissions(principal, targetSectionTipo, targetSectionTipo);
			if (level < 1) {
				return denied(403, 'Insufficient permissions to read');
			}
		}
		const { readRaw } = await import('./read_raw.ts');
		const outcome = await readRaw(
			{
				sectionTipo: options.section_tipo,
				tipo: options.tipo,
				model: options.model,
				type: options.type,
				sqo: rqo.sqo,
			},
			principal,
		);
		return {
			status: 200,
			body: { result: outcome.result, table: outcome.table, msg: 'OK. Request done' },
		};
	},
	create: async (rqo, context) => {
		// Create a new section record (PHP dd_core_api::create → create_record).
		// State-changing: CSRF enforced by the dispatch gate; permission gate
		// level >= 2 on (section_tipo, section_tipo). Returns the new section_id.
		const principal = requirePrincipal(context);
		const source = rqo.source ?? {};
		const sectionTipo = source.section_tipo;
		if (sectionTipo === undefined) {
			return denied(400, 'create: source.section_tipo is required');
		}
		const createAreaRefusal = await refuseAreaWrite(sectionTipo, source.model);
		if (createAreaRefusal !== null) return createAreaRefusal;
		// getSectionPermissions caps consultation-only sections at read (1), so a
		// create is refused here (PHP section::create_record:452 refusal); the
		// createSectionRecord engine backstops the same rule for other doors.
		const level = await getSectionPermissions(principal, sectionTipo);
		if (level < 2) {
			return denied(
				403,
				`You don't have enough permissions to create a record in this section (${sectionTipo})`,
			);
		}
		const { createSectionRecord } = await import('../../section/record/create_record.ts');
		const sectionId = await createSectionRecord(sectionTipo, principal.userId);
		return { status: 200, body: { result: sectionId, msg: 'OK. Request done' } };
	},
	duplicate: async (rqo, context) => {
		// Clone a record into a NEW one (PHP dd_core_api::duplicate). WRITE
		// permission required — duplication spawns records, so read-only users
		// must be refused (PHP §5.2 note). Non-admins must also be in the
		// source record's project scope (assert_record_in_user_scope) — that
		// per-record gate is enforced here via a principal-scoped existence
		// search when the caller is not a global admin.
		const principal = requirePrincipal(context);
		const source = rqo.source ?? {};
		const sectionTipo = source.section_tipo;
		if (sectionTipo === undefined) {
			return denied(400, 'duplicate: source.section_tipo is required');
		}
		if (source.section_id === undefined || source.section_id === null) {
			return denied(400, 'duplicate: source.section_id is required');
		}
		const dupAreaRefusal = await refuseAreaWrite(sectionTipo, source.model);
		if (dupAreaRefusal !== null) return dupAreaRefusal;
		// Consultation-only sections cap at read (1) → duplicate refused here; the
		// duplicateSectionRecord engine backstops the same rule for other doors.
		const level = await getSectionPermissions(principal, sectionTipo);
		if (level < 2) {
			return denied(
				403,
				`You don't have enough permissions to write to the section (${sectionTipo})`,
			);
		}
		const sourceSectionId = Number(source.section_id);
		if (!principal.isGlobalAdmin) {
			// Per-record scope gate: the source must be visible under the
			// caller's projects filter (PHP assert_record_in_user_scope).
			const { isRecordInScope } = await import('../../security/record_scope.ts');
			if (!(await isRecordInScope(sectionTipo, sourceSectionId, principal))) {
				return denied(403, 'Record is out of the user scope');
			}
		}
		const { duplicateSectionRecord } = await import('../../section/record/duplicate_record.ts');
		const newSectionId = await duplicateSectionRecord(
			sectionTipo,
			sourceSectionId,
			principal.userId,
		);
		return { status: 200, body: { result: newSectionId, msg: 'OK. Request done' } };
	},
	delete: async (rqo, context) => {
		// Delete a section record (PHP dd_core_api::delete): delete_record
		// removes the row (TM snapshot first); delete_data (the PHP DEFAULT)
		// keeps the row and empties every component. State-changing: CSRF
		// enforced; permission gate level >= 2 on the section. Multi-record
		// sqo deletes are ledgered.
		const principal = requirePrincipal(context);
		const source = (rqo.source ?? {}) as {
			tipo?: string;
			section_tipo?: string;
			section_id?: number | string | null;
			delete_mode?: string;
		};
		const sectionTipo = source.section_tipo ?? source.tipo;
		const deleteMode = source.delete_mode ?? 'delete_data';
		// PHP :1214 — the caller may accept subtree orphaning explicitly.
		const deleteWithChildren =
			(rqo.options as { delete_with_children?: boolean } | undefined)?.delete_with_children ===
			true;
		if (sectionTipo === undefined) {
			return denied(400, 'delete: source.section_tipo is required');
		}
		const deleteAreaRefusal = await refuseAreaWrite(
			sectionTipo,
			(rqo.source as { model?: string })?.model,
		);
		if (deleteAreaRefusal !== null) return deleteAreaRefusal;
		if (deleteMode !== 'delete_record' && deleteMode !== 'delete_data') {
			return denied(400, `delete: unknown delete_mode '${deleteMode}'`);
		}
		const hasSqo = rqo.sqo !== undefined && rqo.sqo !== null;
		if ((source.section_id === undefined || source.section_id === null) && !hasSqo) {
			return denied(400, 'delete: source.section_id or rqo.sqo is required');
		}
		// Consultation-only sections cap at read (1) → delete refused here; the
		// delete engines backstop the same rule for other doors.
		const level = await getSectionPermissions(principal, sectionTipo);
		if (level < 2) {
			return denied(
				403,
				`You don't have enough permissions to delete this section (${sectionTipo})`,
			);
		}
		const { deleteSectionRecord, deleteSectionData } = await import(
			'../../section/record/delete_record.ts'
		);
		// Targets: the explicit section_id, or the SQO's matched records
		// (PHP sections::delete runs the search then deletes each row).
		// Multi-record deletes are a GLOBAL-ADMIN operation (fail closed).
		let targets: number[];
		if (source.section_id !== undefined && source.section_id !== null) {
			const targetId = Number(source.section_id);
			// Per-record scope gate (PHP assert_record_in_user_scope): a level-2
			// user may only delete records inside their projects filter — the
			// level gate alone would let them delete a record they can never see
			// (cross-project IDOR). Global admins are unscoped.
			if (!principal.isGlobalAdmin) {
				const { isRecordInScope } = await import('../../security/record_scope.ts');
				if (!(await isRecordInScope(sectionTipo, targetId, principal))) {
					return denied(403, 'Record is out of the user scope');
				}
			}
			targets = [targetId];
		} else {
			if (!principal.isGlobalAdmin) {
				return denied(403, 'delete: sqo-based multi-delete requires global admin');
			}
			const { sanitizeClientSqo } = await import('../../concepts/sqo.ts');
			const { buildSearchSql } = await import('../../search/sql_assembler.ts');
			const { sql: db } = await import('../../db/postgres.ts');
			const sqo = sanitizeClientSqo(structuredClone(rqo.sqo) as Record<string, unknown>);
			const { sql: builtSql, params } = await buildSearchSql(sqo, {});
			const matched = (await db.unsafe(builtSql, params as (string | number | null)[])) as {
				section_tipo: string;
				section_id: number;
			}[];
			// The SQO must stay within the gated section (no cross-section leaks).
			targets = matched
				.filter((row) => row.section_tipo === sectionTipo)
				.map((row) => Number(row.section_id));
		}
		const deleted: string[] = [];
		const { logActivity } = await import('./activity_log.ts');
		const { getMatrixTableFromTipo: tableOf } = await import('../../ontology/resolver.ts');
		const activityHost =
			context.clientIp === '127.0.0.1' || context.clientIp === '::1'
				? 'localhost'
				: context.clientIp;
		// HIERARCHY/ONTOLOGY registry records cascade: deleting one
		// uninstalls its whole TLD (dd_ontology nodes + main + node
		// records — PHP ontology::delete_main, fired before the record
		// delete). Global-admin only, matching the structural blast radius.
		{
			const { ONTOLOGY_MAIN_SECTIONS, deleteOntologyMain } = await import(
				'../../ontology/ontology_delete.ts'
			);
			if (ONTOLOGY_MAIN_SECTIONS.has(sectionTipo) && deleteMode === 'delete_record') {
				if (!principal.isGlobalAdmin) {
					return denied(403, 'delete: ontology-main cascade requires global admin');
				}
				const { deleteSectionRecord: cascadeDelete } = await import(
					'../../section/record/delete_record.ts'
				);
				const cascaded: string[] = [];
				for (const targetId of targets) {
					const cascade = await deleteOntologyMain(sectionTipo, targetId, (st, id) =>
						cascadeDelete(st, id, principal.userId),
					);
					if (!cascade.result) {
						return denied(400, `delete: ontology cascade failed (${cascade.errors.join('; ')})`);
					}
					cascaded.push(String(targetId));
				}
				return { status: 200, body: { result: cascaded, msg: 'OK. Request done' } };
			}
		}
		// Children-exist refusal (PHP sections::delete :535-593): a delete_record
		// on a tree/thesaurus parent that still has children is SKIPPED so its
		// subtree is never orphaned. Bypassed by options.delete_with_children;
		// never applies in delete_data mode. Lives HERE (the orchestrator), not
		// the engine — the ontology-main cascade above legitimately tears down
		// whole trees through deleteSectionRecord. Resolve the section's
		// component_relation_children tipo ONCE (PHP get_children_tipo).
		let relationChildrenTipo: string | null = null;
		if (!deleteWithChildren && deleteMode === 'delete_record') {
			const { getChildrenTipo } = await import('../../relations/children.ts');
			relationChildrenTipo = await getChildrenTipo(sectionTipo);
		}
		const skippedErrors: string[] = [];
		for (const targetId of targets) {
			if (relationChildrenTipo !== null) {
				// PHP reads component_relation_children->get_data() — the COMPUTED
				// inverse getChildren(), never a stored value (:574-593). The error
				// enumerates the child ids like PHP; the record is skipped, not
				// deleted and not audited.
				const { getChildren } = await import('../../relations/children.ts');
				const children = await getChildren(targetId, sectionTipo, relationChildrenTipo);
				if (children.length > 0) {
					const childIds = children.map((child) => child.section_id).join(',');
					skippedErrors.push(
						`skipped record deletion because it has children : ${targetId} [${childIds}]`,
					);
					continue;
				}
			}
			const outcome =
				deleteMode === 'delete_record'
					? await deleteSectionRecord(sectionTipo, targetId, principal.userId)
					: await deleteSectionData(sectionTipo, targetId, principal.userId);
			deleted.push(...outcome.deleted);
			if (outcome.deleted.length > 0) {
				// Activity audit (PHP 'DELETE' code 4). PHP QUIRK mirrored: the
				// delete_data logger hardcodes delete_mode 'delete_record' too.
				await logActivity({
					what: 'DELETE',
					tipo: sectionTipo,
					userId: principal.userId,
					host: activityHost,
					datos: {
						msg:
							deleteMode === 'delete_record'
								? 'DEBUG INFO section_record::delete Deleted section record and its own references. Full deleted record'
								: 'Empty section record and children data',
						tipo: sectionTipo,
						table: (await tableOf(sectionTipo)) ?? 'matrix',
						section_id: targetId,
						delete_mode: 'delete_record',
						section_tipo: sectionTipo,
					},
				});
			}
		}
		// Security-cache invalidation (SEC): deleting a user or profile record can
		// change grants/assignments in ways a per-component save never sees. Drop
		// the affected caches so access reflects the deletion on the next request.
		if (deleted.length > 0) {
			const { invalidateSecurityCachesForSection } = await import('../../security/permissions.ts');
			invalidateSecurityCachesForSection(sectionTipo);
		}
		// PHP keeps msg 'OK. Request done' even when records were skipped (its
		// :681 errors check tests an undefined local — always false); the skip
		// reasons travel in `errors` (PHP response->errors passthrough).
		const deleteBody: Record<string, unknown> = { result: deleted, msg: 'OK. Request done' };
		if (skippedErrors.length > 0) deleteBody.errors = skippedErrors;
		return { status: 200, body: deleteBody };
	},
	count: async (rqo, context) => {
		// Record total for a search (PHP dd_core_api::count :1592): the SQO
		// runs with full_count=true; the same permission gates + projects
		// ACL as read apply.
		const principal = requirePrincipal(context);
		if (rqo.sqo === undefined) {
			return denied(400, 'count: rqo.sqo is required');
		}

		// Inverse-reference count (mode 'related', relation_list paginator):
		// gate on the HOST record's section (the filter locators), since the
		// targets are 'all' by design.
		if ((rqo.sqo as { mode?: string }).mode === 'related') {
			const sqoRelated = rqo.sqo as {
				filter_by_locators?: { section_tipo?: string }[];
				section_tipo?: string[] | 'all';
				group_by?: string[];
			};
			const locators = Array.isArray(sqoRelated.filter_by_locators)
				? sqoRelated.filter_by_locators
				: [];
			for (const locator of locators) {
				if (typeof locator.section_tipo !== 'string') continue;
				const level = await getPermissions(principal, locator.section_tipo, locator.section_tipo);
				if (level < 1) {
					return denied(403, 'Insufficient permissions to read');
				}
			}
			const { countInverseReferences } = await import('../../search/search_related.ts');
			const result = await countInverseReferences(locators as never, {
				sectionTipos: Array.isArray(sqoRelated.section_tipo)
					? sqoRelated.section_tipo.includes('all')
						? 'all'
						: sqoRelated.section_tipo
					: 'all',
				groupBy: sqoRelated.group_by,
			});
			return { status: 200, body: { result, msg: 'OK' } };
		}

		for (const targetSectionTipo of getSectionTipos(rqo.sqo)) {
			const level = await getPermissions(principal, targetSectionTipo, targetSectionTipo);
			if (level < 1) {
				return denied(403, 'Insufficient permissions to read');
			}
		}
		// The read STRATEGY owns counting: the default matrix source runs the
		// SQO full_count; the dd15 TM source counts matrix_time_machine with the
		// same scoping as its read (pagination parity — the generic SQO count
		// would hit the wrong table).
		const { sanitizeClientSqo } = await import('../../concepts/sqo.ts');
		const { pickReadSource } = await import('../../section/read_source.ts');
		const sqo = sanitizeClientSqo(structuredClone(rqo.sqo) as Record<string, unknown>);
		const readSource = await pickReadSource((rqo.sqo as { mode?: string }).mode);
		const total = await readSource.count(sqo, principal);
		return { status: 200, body: { result: { total }, msg: 'OK' } };
	},
	start: async (rqo, context) => {
		// The client's first boot call (PHP dd_core_api::start): environment
		// + a structure-context. NOT LOGGED → the LOGIN element context (the
		// client renders whatever element start describes, so this is what
		// makes the login form appear). Logged → the default section context.
		// The section extras section_map is ledgered uncovered.
		const { buildEnvironment: buildEnv } = await import('../../resolve/environment.ts');
		if (context.session === null) {
			// INSTALL MODE (DEC-19): a fresh, unconfigured machine mounts the
			// install wizard instead of the login form. The client instantiates
			// core/installer/js/installer.js from the context entry's
			// model:'installer', then fires get_install_context. `installInProgress`
			// keeps the wizard mounted on a RELOAD after persist_config has
			// restarted the server into configured mode (config.installMode is now
			// false, but the install is not yet sealed) — without it a mid-install
			// reload would strand on the login form with no schema/root yet. Once
			// install_finish seals, both are false and the login branch runs.
			const { installInProgress } = await import('../../install/gate.ts');
			if (config.installMode || installInProgress()) {
				const { buildInstallContext } = await import('../../install/context.ts');
				return {
					status: 200,
					body: {
						result: { context: [buildInstallContext()], data: [] },
						environment: await buildEnv(null, null),
						msg: 'OK',
					},
				};
			}
			const { buildLoginContext } = await import('./login_context.ts');
			return {
				status: 200,
				body: {
					result: { context: [await buildLoginContext()], data: [] },
					environment: await buildEnv(null, null),
					msg: 'OK',
				},
			};
		}
		const { buildStructureContext } = await import('../../resolve/structure_context.ts');
		const principal = requirePrincipal(context);

		// Page element from the URL vars (PHP :266-300): the client forwards
		// its GET params as options.search_obj — t/tipo, st/section_tipo,
		// id/section_id, m/mode (or a whole locator). Defaults to the main
		// section in list mode.
		const searchObj = ((rqo.options as { search_obj?: Record<string, unknown> } | undefined)
			?.search_obj ?? {}) as Record<string, unknown>;
		const locator =
			typeof searchObj.locator === 'string'
				? (JSON.parse(searchObj.locator) as Record<string, unknown>)
				: ((searchObj.locator as Record<string, unknown>) ?? null);
		const pick = (...values: unknown[]): string | null => {
			for (const value of values) {
				if (typeof value === 'string' && value !== '') return value;
				if (typeof value === 'number') return String(value);
			}
			return null;
		};

		// TOOL deep link (PHP start tool case): ?tool=tool_x opens the tool in
		// its own window/tab — start describes the TOOL element so the client
		// renders the tool instead of a section (verified: PHP returns one
		// context entry, type='tool'). The tool must be authorized for the caller.
		const toolParam = pick(searchObj.tool);
		if (toolParam !== null && /^tool_[a-z0-9_]+$/.test(toolParam)) {
			const { getUserTools, buildToolElementContext } = await import('../../tools/registry.ts');
			const authorizedTools = await getUserTools(context.session.userId, principal.isGlobalAdmin);
			if (!authorizedTools.some((tool) => tool.name === toolParam)) {
				return denied(403, 'Tool not authorized for current user');
			}
			const toolElementContext = await buildToolElementContext(toolParam);
			const toolStartContext: unknown[] = [];
			if ((rqo.options as { menu?: boolean } | undefined)?.menu === true) {
				const menuCtx = await buildStructureContext({
					tipo: 'dd85',
					sectionTipo: 'dd85',
					mode: 'list',
					lang: currentDataLang(),
					langOverride: currentDataLang(),
					permissions: 2,
					addRequestConfig: false,
				});
				if (menuCtx !== null) toolStartContext.push(menuCtx);
			}
			if (toolElementContext !== null) toolStartContext.push(toolElementContext);
			return {
				status: 200,
				body: {
					result: { context: toolStartContext, data: [] },
					environment: await buildEnv(context.session, principal),
					msg: 'OK',
				},
			};
		}

		let pageTipo = pick(locator?.tipo, searchObj.t, searchObj.tipo) ?? config.mainSection;
		let pageSectionTipo =
			pick(locator?.section_tipo, searchObj.st, searchObj.section_tipo) ?? pageTipo;
		const pageMode = pick(locator?.mode, searchObj.m, searchObj.mode) ?? 'list';
		// The record id from the deep link (?id=1). PHP injects it onto the
		// page-element context (:480 section / :627 component) so the client
		// instance knows its section_id; a component/viewer deep link that omits
		// it leaves get_data reads with section_id null → they fall to
		// readSection and 500. Kept numeric when numeric.
		const pageSectionIdRaw = pick(locator?.section_id, searchObj.id, searchObj.section_id);
		const pageSectionId =
			pageSectionIdRaw !== null && /^\d+$/.test(pageSectionIdRaw)
				? Number(pageSectionIdRaw)
				: pageSectionIdRaw;
		// The deep-link view (?view=viewer) — PHP element->set_view($view). It
		// makes the client mount a DIFFERENT view (e.g. component_image's
		// view_viewer_image, the floating full-image popup) instead of the
		// default edit view. Without it the viewer window renders the edit UI.
		const pageView = pick(locator?.view, searchObj.view);

		// section_tool reroute (PHP dd_core_api start :386-426): a section_tool
		// page is an ontological ALIAS — the page element is overwritten with the
		// TARGET section and the tool activation ships on config.tool_context
		// (the client's tool_common.js cascade branch (1)). Without this the
		// client builds the tool from a synthetic single-entry ddo_map and the
		// components configured in properties.tool_config.<tool>.ddo_map never
		// render (numisdata201/numisdata670).
		let pageConfig: Record<string, unknown> | null = null;
		const { getModelByTipo, getPropertiesByTipo } = await import('../../ontology/resolver.ts');
		if ((await getModelByTipo(pageTipo)) === 'section_tool') {
			const sectionToolTipo = pageTipo;
			const properties = (await getPropertiesByTipo(sectionToolTipo)) as {
				config?: Record<string, unknown> | null;
				tool_config?: Record<string, unknown> | null;
			} | null;
			// overwrite (!) — PHP :395-398. The whole properties.config replaces
			// the built section context's config below (PHP set_config :456-458).
			const targetSectionTipo = properties?.config?.target_section_tipo;
			if (typeof targetSectionTipo === 'string' && targetSectionTipo !== '') {
				pageTipo = targetSectionTipo;
				pageSectionTipo = targetSectionTipo;
			}
			pageConfig = properties?.config != null ? structuredClone(properties.config) : null;
			// tool_context (PHP :400-424) from the CALLER's authorized tools; an
			// unauthorized/unregistered tool logs and ships WITHOUT tool_context.
			const toolConfigBag = properties?.tool_config;
			if (pageConfig !== null && toolConfigBag != null && typeof toolConfigBag === 'object') {
				const { getUserTools } = await import('../../tools/registry.ts');
				const { buildSectionToolContext } = await import('../../tools/section_tool_context.ts');
				const userTools = await getUserTools(context.session.userId, principal.isGlobalAdmin);
				const toolContext = await buildSectionToolContext(toolConfigBag, userTools);
				if (toolContext === null) {
					console.warn(
						`start: section_tool ${sectionToolTipo}: named tool not in user_tools — context ships without tool_context (PHP parity)`,
					);
				} else {
					pageConfig.tool_context = toolContext;
				}
			}
			// A section_tool whose rerouted tipo is still not a real section is an
			// ERROR in PHP too — section::get_instance returns false and start
			// fatals on ->set_lang (:430-434), answering result:false (numisdata625,
			// pinned in section_tool_start_differential). Refuse loudly with the
			// same envelope instead of emitting a bogus entry.
			if ((await getModelByTipo(pageTipo)) !== 'section') {
				const message = `start: section_tool ${sectionToolTipo} has no buildable target section (config.target_section_tipo)`;
				console.warn(message);
				return { status: 200, body: { result: false, msg: message, errors: [message] } };
			}
		}

		// Permission gate on the requested element (a deep link must not leak
		// context the user cannot read). For a section_tool this gates the
		// REROUTED target section — the element the context actually describes.
		const pagePermissions = await getPermissions(principal, pageSectionTipo, pageTipo);
		if (pagePermissions < 1) {
			return denied(403, 'Insufficient permissions to read');
		}
		// PHP start instantiates page elements with DEDALO_DATA_LANG and no
		// nolan forcing (differentially verified: section + menu contexts
		// carry lg-spa). The client's instances INHERIT this lang and thread
		// it into every component read/save — nolan here made the whole edit
		// form save as lg-nolan.
		//
		// The three payload builds are independent reads — run them
		// concurrently (the request-context/lang ALS stores flow into every
		// Promise.all branch, engineering/REQUEST_ISOLATION.md); the context array is
		// then assembled in the original order (menu first) for wire stability.
		const menuWanted = (rqo.options as { menu?: boolean } | undefined)?.menu === true;
		const [sectionContext, menuContext, environment] = await Promise.all([
			buildStructureContext({
				tipo: pageTipo,
				sectionTipo: pageSectionTipo,
				mode: pageMode === 'edit' ? 'edit' : 'list',
				lang: currentDataLang(),
				langOverride: currentDataLang(),
				permissions: pagePermissions,
				addRequestConfig: false, // PHP start builds context without it
				view: pageView, // ?view=viewer → the client mounts the dedicated view
			}),
			// Menu shell context (PHP :372-380): when the client asks with
			// options.menu=true, start ALSO describes the menu element — the
			// client mounts the header from it and autoloads its tree via the
			// menu get_data read (already served by readMenu). The menu is
			// rendered at fixed permission level 2 (menu_json.php).
			menuWanted
				? buildStructureContext({
						tipo: 'dd85',
						sectionTipo: 'dd85',
						mode: 'list',
						lang: currentDataLang(),
						langOverride: currentDataLang(),
						permissions: 2,
						addRequestConfig: false,
					})
				: null,
			// The FULL environment block (page_globals + plain_vars + get_label) —
			// the copied client injects it via set_environment() at boot
			// (rewrite/client_seam.md seam item 1). Session is non-null on this
			// branch (the anonymous path returned above).
			buildEnv(context.session, principal),
		]);
		const startContext: unknown[] = [];
		if (menuContext !== null) startContext.push(menuContext);
		if (sectionContext !== null) {
			// section_tool config REPLACEMENT (PHP set_config :456-458 — dd_object
			// set_config swaps the whole config object, so keys the plain section
			// context carried, e.g. relation_list_tipo, are dropped on the wire).
			if (pageConfig !== null) {
				(sectionContext as { config?: unknown }).config = pageConfig;
			}
			// Inject the deep-link record id onto the page-element context (PHP
			// $current_context->section_id = $section_id). The client reads it to
			// set the instance's section_id, which every component read/save then
			// threads — without it a viewer/component deep link reads section_id null.
			if (pageSectionId !== null) {
				(sectionContext as { section_id?: unknown }).section_id = pageSectionId;
			}
			startContext.push(sectionContext);
		}
		return {
			status: 200,
			body: {
				result: { context: startContext, data: [] },
				environment,
				msg: 'OK',
			},
		};
	},
	get_element_context: async (rqo, context) => {
		// One element's structure context, no data (PHP get_element_context →
		// element get_json(get_context=true, get_data=false)). Covers
		// section/component models; area/tool element contexts are ledgered.
		const { buildStructureContext } = await import('../../resolve/structure_context.ts');
		const principal = requirePrincipal(context);
		const source = rqo.source ?? {};

		// TOOL branch (PHP get_element_context tool branch): the client's
		// open_tool string path sends source:{model:'tool_x'} with NO tipo.
		// Require the tool to be authorized for the caller, then return its
		// full tool context (tipo/lang/labels/description/developer included).
		if (
			source.tipo === undefined &&
			typeof source.model === 'string' &&
			/^tool_[a-z0-9_]+$/.test(source.model)
		) {
			const { getUserTools, buildToolElementContext } = await import('../../tools/registry.ts');
			const toolName = source.model;
			const authorized = await getUserTools(
				(context.session as Session).userId,
				principal.isGlobalAdmin,
			);
			if (!authorized.some((tool) => tool.name === toolName)) {
				return denied(403, 'Tool not authorized for current user');
			}
			const toolContext = await buildToolElementContext(toolName);
			return {
				status: 200,
				body: { result: toolContext !== null ? [toolContext] : [], msg: 'OK' },
			};
		}

		const tipo = source.tipo;
		if (tipo === undefined) {
			return denied(400, 'get_element_context: source.tipo is required');
		}
		const sectionTipo = source.section_tipo ?? tipo;
		const mode = source.mode ?? 'list';
		const lang = source.lang ?? 'lg-spa';
		const { getModelByTipo } = await import('../../ontology/resolver.ts');
		const model = source.model ?? (await getModelByTipo(tipo));
		// Covered element families: sections, components, and the area models
		// (area, area_root, area_admin, … — plain ontology nodes whose context
		// the generic structure builder resolves). Tool element contexts are
		// still ledgered. The area default request_config null-skeleton is
		// ledgered too (TS area entries omit the key).
		const isCoveredModel =
			model !== null &&
			(model === 'section' || model.startsWith('component_') || isAreaModel(model));
		if (!isCoveredModel) {
			return denied(
				400,
				`get_element_context: model '${model}' not implemented (section/component/area only)`,
			);
		}
		// Read gate: level >= 1 on (section_tipo, tipo) — PHP assert_section_permission.
		const permissions = await getPermissions(principal, sectionTipo, tipo);
		if (permissions < 1) {
			return denied(403, 'Insufficient permissions to read');
		}
		const entry = await buildStructureContext({
			tipo,
			sectionTipo,
			mode,
			lang,
			permissions,
		});
		return {
			status: 200,
			body: { result: entry !== null ? [entry] : [], msg: 'OK' },
		};
	},
	get_section_elements_context: async (rqo, context) => {
		// The edit-mode search-filter panel's element list (PHP dd_core_api::
		// get_section_elements_context). Authenticated read; permissions are
		// ALWAYS enforced server-side (the client skip_permissions flag is
		// ignored). Returns the "simple" structure-context set per section.
		const principal = requirePrincipal(context);
		const { buildSectionElementsContext } = await import(
			'../../resolve/section_elements_context.ts'
		);
		const result = await buildSectionElementsContext(
			principal,
			(rqo.options ?? {}) as Record<string, unknown>,
		);
		return { status: 200, body: { result, msg: 'OK. Request done' } };
	},
	get_section_terms: async (rqo, context) => {
		// Batch-resolve the section_map display term for a set of records (PHP
		// dd_core_api::get_section_terms :3482) — the graph view labels ALL its
		// nodes with one request instead of one datum read per node. The
		// locators/scope/lang ride at the TOP level of the rqo (client
		// build_graph_data.js fetch_section_terms), not under source/options.
		const principal = requirePrincipal(context);

		const rawLocators = (rqo as { locators?: unknown }).locators;
		if (!Array.isArray(rawLocators) || rawLocators.length === 0) {
			// PHP returns this as a handled response envelope, not an HTTP error.
			return {
				status: 200,
				body: {
					result: false,
					msg: 'Error. Invalid or empty locators',
					errors: ['bad_locators'],
				},
			};
		}
		// hard cap to prevent unbounded work from a hostile/huge batch (PHP :3491)
		const maxLocators = 1000;
		let locatorEntries = rawLocators as unknown[];
		if (locatorEntries.length > maxLocators) {
			console.warn(
				`[dd_core_api] get_section_terms batch exceeds cap (${maxLocators}); truncating from ${locatorEntries.length}`,
			);
			locatorEntries = locatorEntries.slice(0, maxLocators);
		}

		// scope null => the section_map main → thesaurus → relation_list chain.
		const scopeRaw = (rqo as { scope?: unknown }).scope;
		const scope = typeof scopeRaw === 'string' ? scopeRaw : null;
		const langRaw = (rqo as { lang?: unknown }).lang;
		const lang = typeof langRaw === 'string' ? langRaw : currentDataLang();

		// Resolve deduped by composite key; skip invalid or unreadable sections.
		const terms: Record<string, string | null> = {};
		for (const entry of locatorEntries) {
			if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
			const sectionTipo = (entry as { section_tipo?: unknown }).section_tipo;
			const sectionId = (entry as { section_id?: unknown }).section_id;
			if (typeof sectionTipo !== 'string' || !SAFE_TIPO.test(sectionTipo)) continue;
			if (
				sectionId === null ||
				sectionId === undefined ||
				sectionId === '' ||
				(typeof sectionId !== 'string' && typeof sectionId !== 'number')
			) {
				continue;
			}
			const key = `${sectionTipo}_${sectionId}`;
			if (key in terms) continue; // dedup — first occurrence wins
			// SEC: read permission required on the section (omit forbidden, never leak).
			if ((await getPermissions(principal, sectionTipo, sectionTipo)) < 1) continue;
			// Only sections with a section_map term — otherwise getTermByLocator
			// returns the "{tipo}_{id}" fallback string, which would clobber the
			// client's own provisional node label.
			if ((await getTermTipos(sectionTipo, scope)).length === 0) continue;
			terms[key] = await getTermByLocator(
				{ section_tipo: sectionTipo, section_id: sectionId },
				lang,
				true, // from_cache
				scope,
			);
		}

		return {
			status: 200,
			body: { result: terms, msg: 'OK. Request done successfully', errors: [] },
		};
	},
	// get_matrix_ontology_locator: DELETED at the DEC-16 re-sync (2026-07-11)
	// together with the PHP endpoint and matrix_ontology_locator_differential —
	// the client's get_ontology_url 'local_ontology' case now derives the
	// locator locally (the pure tld+'0' / digit-run derivation its
	// 'master_ontology' case always used).
	get_indexation_grid: async (rqo, context) => {
		// The thesaurus "show indexations" grid (PHP dd_core_api::
		// get_indexation_grid :2845 → indexation_grid::build_indexation_grid).
		// Client: ts_object.js show_indexations → dd_grid view 'indexation'.
		const principal = requirePrincipal(context);
		const source = (rqo.source ?? {}) as {
			section_tipo?: string;
			section_id?: string | number;
			tipo?: string;
			value?: unknown;
		};
		const sectionTipo = source.section_tipo ?? source.tipo;
		if (!source.section_tipo || !source.tipo || !source.section_id) {
			// PHP appends the trigger detail to the base failure msg (HTTP 200).
			return {
				status: 200,
				body: {
					result: false,
					msg: 'Error. Request failed Trigger Error: (get_indexation_grid) Empty source properties (section_tipo, section_id, tipo are mandatory)',
					errors: ['invalid rqo source'],
				},
			};
		}
		// SEC: read permission on the term's section. PHP throws
		// permission_exception → dd_manager:458 converts to HTTP 200
		// result:false 'permissions_denied' — mirror that (client contract).
		const level = await getPermissions(principal, sectionTipo as string, sectionTipo as string);
		if (level < 1) {
			return {
				status: 200,
				body: {
					result: false,
					msg: `Error. Insufficient permissions on section ${sectionTipo} (required: 1, have: ${level})`,
					errors: ['permissions_denied'],
				},
			};
		}
		const { buildIndexationGrid } = await import('../../section/indexation_grid.ts');
		const grid = await buildIndexationGrid(
			{
				sectionTipo: sectionTipo as string,
				sectionId: source.section_id,
				tipo: source.tipo,
				sqo: (rqo.sqo ?? {}) as import('../../section/indexation_grid.ts').IndexationGridSqo,
			},
			principal,
		);
		return {
			status: 200,
			body: { result: grid, msg: 'OK. Request done successfully', errors: [] },
		};
	},
	get_activity_metric: async (rqo, context) => {
		// On-demand activity dataset for the area dashboard's timeline range
		// switch (client dashboard.js fetch_range → 3m/6m/1y). The dashboard READ
		// serves only activity_30d inline; wider ranges are fetched here so the
		// initial payload stays small. Gated IDENTICALLY to the dashboard read
		// (area/read.ts readDashboardArea): read permission > 0 on the area.
		const principal = requirePrincipal(context);
		const options = (rqo.options ?? {}) as { area_tipo?: unknown; range_days?: unknown };
		const areaTipo = options.area_tipo;
		if (typeof areaTipo !== 'string' || !SAFE_TIPO.test(areaTipo)) {
			return denied(400, 'get_activity_metric: invalid area_tipo');
		}
		const { getModelByTipo } = await import('../../ontology/resolver.ts');
		if (!isAreaModel((await getModelByTipo(areaTipo)) ?? '')) {
			return denied(400, 'get_activity_metric: not an area');
		}
		const rangeDays = Number(options.range_days);
		const { ACTIVITY_RANGE_DAYS, getAreaActivityMetric } = await import('../../area/dashboard.ts');
		if (!ACTIVITY_RANGE_DAYS.has(rangeDays)) {
			return denied(400, 'get_activity_metric: unsupported range_days');
		}
		// SEC: same permission boundary as the dashboard payload it extends.
		if ((await getPermissions(principal, areaTipo, areaTipo)) < 1) {
			return denied(403, 'Insufficient permissions to read');
		}
		const data = await getAreaActivityMetric(areaTipo, rangeDays);
		return { status: 200, body: { result: true, data, msg: 'OK. Request done' } };
	},
	get_ip_country: async (rqo, context) => {
		// Server-side IP→country resolution for the Activity (dd542) IP list view.
		// Replaces the former per-visitor browser fetch to a third-party service:
		// resolution is LOCAL and OFFLINE against the openly-licensed DB-IP
		// Country Lite database (src/core/geoip). Authenticated (dispatch gate) +
		// CSRF. Returns country_code:null for private/reserved/unresolved IPs (and
		// when the database is not loaded) so the client simply shows no flag.
		requirePrincipal(context);
		const options = (rqo.options ?? {}) as { ip?: unknown };
		const ip = options.ip;
		if (typeof ip !== 'string' || ip.length === 0 || ip.length > 64) {
			return denied(400, 'get_ip_country: invalid ip');
		}
		const { resolveCountry } = await import('../../geoip/reader.ts');
		const resolved = resolveCountry(ip);
		return {
			status: 200,
			body: {
				result: true,
				data: { country_code: resolved?.country_code ?? null },
				msg: 'OK. Request done',
			},
		};
	},
	get_environment: async (_rqo, context) => {
		// The full client environment (PHP get_environment): page_globals +
		// plain_vars + get_label — the payload set_environment() injects.
		const { buildEnvironment } = await import('../../resolve/environment.ts');
		// Seeded once by dispatchRqo; null for the unauthenticated environment read.
		const principal = context.principal ?? null;
		const environment = await buildEnvironment(context.session, principal);
		return { status: 200, body: environment };
	},
};

/** Preset sections excluded from LOAD activity (PHP DEDALO_TEMP_PRESET_SECTION_TIPO
 * dd655 / DEDALO_SEARCH_PRESET_SECTION_TIPO dd623 — user list/search presets are
 * not real navigation and must not pollute the activity timeline). */
const ACTIVITY_EXCLUDED_PRESET_TIPOS: ReadonlySet<string> = new Set(['dd655', 'dd623']);

/**
 * LOAD activity for a section/area read (PHP dd_core_api::log_activity :3603).
 * Appends a 'LOAD EDIT'/'LOAD LIST' audit row keyed by the read's SECTION/AREA
 * tipo — the stream the dashboard timeline aggregates. Fire-and-swallow: an
 * audit write must never fail the read (logActivity already swallows its own
 * errors; this wrapper guards the model/preset lookups too).
 *
 * PHP exclusions mirrored: skip mode 'search'/'tm', skip the Activity section and
 * its own components (self-log loop guard — ACTIVITY_SECTION_TIPO dd542), skip
 * temp/search preset sections, and log ONLY section + area models (never a bare
 * component read, e.g. an autocomplete's get_data — dd_core_api :3628-3633).
 */
async function logReadActivity(
	rqo: Rqo,
	principal: Principal,
	context: ApiRequestContext,
	result: ApiResult,
): Promise<void> {
	try {
		const source = rqo.source ?? {};
		const tipo = source.tipo ?? '';
		const mode = source.mode ?? '';
		if (tipo === '' || mode === 'search' || mode === 'tm') return;
		// Self-log loop guard: the Activity section (dd542) is the log's own home.
		const { ACTIVITY_SECTION_TIPO } = await import('../../concepts/section.ts');
		if (tipo === ACTIVITY_SECTION_TIPO) return;
		if (ACTIVITY_EXCLUDED_PRESET_TIPOS.has(tipo)) return;

		const { getModelByTipo } = await import('../../ontology/resolver.ts');
		const model = (await getModelByTipo(tipo)) ?? '';
		// Only sections and areas generate activity (PHP :3631) — a bare component
		// read (autocomplete get_data, resolve_data) leaves no footprint.
		if (model !== 'section' && !model.startsWith('area')) return;

		const modeToActivity = mode === 'list' ? 'list' : 'edit';
		const datos: Record<string, unknown> = {
			msg: `HTML Page is loaded in mode: ${modeToActivity} [${mode}]`,
			tipo,
		};
		// section_id echoed only for a section EDIT load (PHP :3647), read from the
		// response's first entry, falling back to the request source.
		if (model === 'section' && mode === 'edit') {
			const body = result.body as
				| { result?: { data?: { section_id?: unknown; entries?: { section_id?: unknown }[] }[] } }
				| undefined;
			const firstItem = body?.result?.data?.[0];
			const sectionId =
				firstItem?.entries?.[0]?.section_id ?? firstItem?.section_id ?? source.section_id ?? null;
			if (sectionId !== null && sectionId !== undefined) datos.id = sectionId;
		}

		const host =
			context.clientIp === '127.0.0.1' || context.clientIp === '::1'
				? 'localhost'
				: (context.clientIp ?? 'unknown');
		const { logActivity } = await import('./activity_log.ts');
		await logActivity({
			what: `LOAD ${modeToActivity.toUpperCase()}`, // 'LOAD EDIT' | 'LOAD LIST'
			tipo,
			userId: principal.userId,
			host,
			datos, // PHP data_activity: {msg, tipo, id?} — nothing more
		});
	} catch (error) {
		console.error('LOAD activity log failed (swallowed):', error);
	}
}

/**
 * Menu read (PHP menu::get_json → menu_json.php). Returns the menu's structure
 * context plus one data item carrying the tree_datalist (the permitted
 * navigation nodes), the developer-only ontology-inspection flag, and the
 * current username. info_data (installation diagnostics for the About panel) is
 * ledgered — it is not needed for the boot render.
 */
async function readMenu(
	rqo: Rqo,
	context: ApiRequestContext,
	principal: Principal,
): Promise<ApiResult> {
	const { getMenuTreeDatalist } = await import('./menu.ts');
	const { buildStructureContext } = await import('../../resolve/structure_context.ts');
	const source = rqo.source ?? {};
	const menuTipo = source.tipo ?? 'dd85';
	const lang = source.lang ?? currentApplicationLang();

	// The menu is always rendered at permission level 2 (PHP menu_json.php).
	const menuContext = await buildStructureContext({
		tipo: menuTipo,
		sectionTipo: source.section_tipo ?? menuTipo,
		mode: 'list',
		lang,
		permissions: 2,
		addRequestConfig: false,
	});
	// The tree is viewer-scoped: admins+developers get it unfiltered; anyone
	// else gets the permission-filtered menu (PHP get_tree_datalist).
	const { tree_datalist } = await getMenuTreeDatalist({
		userId: principal.userId,
		isGlobalAdmin: principal.isGlobalAdmin,
		isDeveloper: principal.isDeveloper,
	});
	const { buildInfoData } = await import('../../resolve/environment.ts');

	const dataItem = {
		tipo: menuTipo,
		model: 'menu',
		tree_datalist,
		// Installation diagnostics (PHP get_info_data) — the header info bar
		// prefers these over page_globals; TS-runtime values.
		info_data: await buildInfoData(),
		show_ontology: principal.isDeveloper,
		username: context.session?.username ?? null,
	};
	return {
		status: 200,
		body: {
			result: { context: menuContext !== null ? [menuContext] : [], data: [dataItem] },
			msg: 'OK',
		},
	};
}
