/**
 * Section read facade — the dd_core_api `read` SUB-ACTION ROUTING, extracted
 * verbatim from api/dispatch.ts (WS-C, audit S2-25): the routing that
 * discriminates a read RQO into its concrete section-read strategy lives WITH
 * the section subsystem, so its semantics cannot drift from section/read.ts.
 *
 * The caller (api/handlers/dd_core_api.ts) has already run the ACL gates that
 * are NOT routing: the menu/area model dispatch, permission gate A (source
 * section_tipo+tipo) and gate B (every SQO target section). Everything below —
 * relation-list, time-machine, resolve_data, component get_data, the stale-lock
 * release and the generic readSection — is behavior-identical to the pre-split
 * dispatch body, with ONE deliberate routing fix (2026-07-09, BUG-0): a
 * component-model source with `action:'search'` (the service_autocomplete
 * picker, input_text find_equal) routes to the generic readSection — PHP
 * dispatches on source.action alone (dd_core_api.php:2050/:2256) and the
 * get_data branches used to swallow it into the no-id empty shell.
 */

import { denied } from '../api/response.ts';
import type { ApiResult } from '../api/response.ts';
import type { Rqo } from '../concepts/rqo.ts';
import { type Principal, getPermissions } from '../security/permissions.ts';
import { readSection } from './read.ts';

/** Route a permission-gated dd_core_api read RQO to its read strategy. */
export async function routeSectionRead(rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const source = rqo.source ?? {};

	// Relation list (source.action 'get_relation_list'): the Referencias
	// panel — every record pointing AT the host. PHP only answers in
	// edit mode (any other mode returns the empty shell) and gates on
	// read access to the HOST section (gate A in the handler covered it when
	// source carried section_tipo+tipo; enforce host read here).
	if (source.action === 'get_relation_list') {
		const hostSectionTipo = String(source.section_tipo ?? '');
		const hostSectionId = source.section_id;
		if (hostSectionTipo === '' || hostSectionId === undefined || hostSectionId === null) {
			return denied(400, 'get_relation_list: source.section_tipo/section_id are required');
		}
		const hostLevel = await getPermissions(principal, hostSectionTipo, hostSectionTipo);
		if (hostLevel < 1) {
			return denied(403, 'Insufficient permissions to read');
		}
		if ((source.mode ?? 'list') !== 'edit') {
			// PHP relation_list_json: non-edit modes return the empty shell.
			return { status: 200, body: { result: { context: [], data: [] }, msg: 'OK' } };
		}
		const { buildRelationList } = await import('../resolve/relation_list.ts');
		const sqoOptions = (rqo.sqo ?? {}) as {
			limit?: number | false;
			offset?: number;
			section_tipo?: unknown;
		};
		// PHP runs the CLIENT sqo straight through sections::get_instance
		// (class.relation_list.php get_inverse_references): the sqo's
		// section_tipo axis narrows the OWNING sections ('all' = no narrowing —
		// the panel sends ["all"], the header open sends the one target section)
		// and set_limit(0) means ALL records (the header open sends limit 0).
		const rawSectionTipos = Array.isArray(sqoOptions.section_tipo)
			? sqoOptions.section_tipo.filter((tipo): tipo is string => typeof tipo === 'string')
			: typeof sqoOptions.section_tipo === 'string'
				? [sqoOptions.section_tipo]
				: [];
		const sectionTipos =
			rawSectionTipos.length === 0 || rawSectionTipos.includes('all')
				? ('all' as const)
				: rawSectionTipos;
		const relationList = await buildRelationList(hostSectionTipo, hostSectionId, {
			limit: sqoOptions.limit === 0 ? false : (sqoOptions.limit ?? false),
			offset: sqoOptions.offset,
			lang: source.lang,
			sectionTipos,
			// AUTHZ-05: scope referencing records to the caller (drops references in
			// sections/projects the caller cannot reach). Host-read alone (gate above)
			// is not enough — the scan spans 'all' owning sections.
			principal,
		});
		const body: Record<string, unknown> = {
			result: { context: relationList.context, data: relationList.data },
			msg: 'OK. Request done successfully',
		};
		if (relationList.unresolved.length > 0) {
			body.errors = relationList.unresolved.map(
				(model) => `unresolved relation_list cell model: ${model}`,
			);
		}
		return { status: 200, body };
	}

	// Time Machine read (sqo.mode 'tm'): the record-history listing is now
	// served through the GENERIC readSection (the dd15 TM read-source —
	// section/read_source.ts). Only the time-machine ACCESS GATE stays here:
	// it is a per-CALLER-section ACL (SECTION_SPEC §7.4, stricter than the
	// read grant) that must gate BEFORE the read. Gate B in the handler already
	// required level >= 1 on every SQO target section.
	if ((rqo.sqo as { mode?: string } | undefined)?.mode === 'tm') {
		const tmSectionTipo = source.section_tipo ?? source.tipo;
		if (typeof tmSectionTipo === 'string') {
			const { canAccessTimeMachineList } = await import('./list_definitions/time_machine_list.ts');
			if (!(await canAccessTimeMachineList(principal, tmSectionTipo))) {
				return denied(403, 'Insufficient permissions for the time machine of this section');
			}
		}
		// fall through to the generic readSection below (routes to the TM source)
	}

	// resolve_data: a component in SEARCH mode resolves INJECTED locators
	// (source.value) — the portal filter chips. Gate A in the handler covered
	// the (section_tipo, tipo) read permission.
	if (source.action === 'resolve_data') {
		const { resolveSearchData, buildGetDataContext } = await import('./read.ts');
		// Pass the principal so injected target locators outside the caller's
		// projects filter are dropped (foundation audit AUTHZ-02 — same root cause
		// as AUTHZ-01, bounded to the relation's declared target sections).
		const resolved = await resolveSearchData(rqo, principal);
		// Guarantee the component's OWN item is present (entries=[] when the
		// search carries no injected value). Some models (e.g. component_external,
		// search-unported) resolve to zero items, and the client search render
		// then reads data.entries of undefined (render_search_component_external
		// :178 data.entries[0]). A [] main item keeps the render safe.
		if (
			source.tipo !== undefined &&
			source.section_tipo !== undefined &&
			!resolved.some((d) => (d as { tipo?: string }).tipo === source.tipo)
		) {
			const { buildDataItem } = await import('../resolve/component_data.ts');
			// Pass section_id AS GIVEN (string) — the client matches the item by
			// String(el.section_id)===String(self.section_id), so coercing through
			// Number() (which drops leading zeros, e.g. '000147689') would break
			// the match and leave self.data empty.
			resolved.unshift(
				buildDataItem(
					source.tipo,
					source.section_tipo,
					(source.section_id as number | string | null) ?? 0,
					'search',
					source.lang ?? 'lg-nolan',
					[],
				),
			);
		}
		// The client BUILDS the search-mode instance from this response and
		// aborts if result.context is empty (component_portal.js:632 —
		// "component without context", leaving status stuck at 'building').
		// Emit the component's structure context (buildGetDataContext), same as
		// the get_data path, so the search filter builds + renders.
		const context = await buildGetDataContext(rqo, resolved, principal);
		return { status: 200, body: { result: { context, data: resolved }, msg: 'OK' } };
	}

	// Component-source SEARCH read (PHP routes on source.action alone —
	// dd_core_api.php:2050 `$action = $ddo_source->action ?? 'search'`, :2256
	// `case 'search': // Used by section and service autocomplete`): the
	// service_autocomplete target-record picker and the input_text find_equal
	// probe. Never treat it as a component get_data — with or without a
	// section_id it must fall through to the stale-lock release + generic
	// readSection below (PHP runs force_unlock inside `case 'search'` too,
	// dd_core_api.php:2322). Deliberate routing fix (BUG-0, 2026-07-09): the
	// branches below used to swallow it into the get_data no-id empty shell,
	// so the picker rendered empty for every user.
	const isComponentSearch = source.action === 'search';

	// Component-level get_data (portal pagination / "show more"): resolve
	// the single component directly, not the whole section.
	if (
		!isComponentSearch &&
		(source.action === 'get_data' || (source.model ?? '').startsWith('component_')) &&
		source.section_id !== undefined &&
		source.section_id !== null
	) {
		// §7.4 per-record projects (tenant) ACL on the DIRECT record read: get_data
		// addresses a record by section_id with NO sqo, so the handler's Gate B
		// (per-SQO-target) never ran and Gate A only checked the section-level
		// grant. Without this, a non-admin with a section read grant reads any
		// record's component values across the projects filter (foundation audit
		// AUTHZ-01, live cross-tenant read). Symmetric to the save/delete
		// isRecordInScope gate. Out of scope ⇒ PHP empty shell (never reveal the
		// record's existence), not a 403.
		//
		// SYNTHETIC search-filter ids are EXEMPT: the search panel builds each
		// filter component with a client-minted section_id ('search_<n>',
		// search.js get_section_id) that addresses NO matrix record —
		// readComponentData resolves a null record and returns only record-
		// INDEPENDENT data (the option datalist, or an empty item). PHP does not
		// gate this path at all (user_can_access_record is RAG-only; get_data serves
		// the datalist to every searcher). Gating it here is meaningless AND harmful:
		// isRecordInScope(NaN) returns false, blanking the whole search form for
		// non-admins (search is enabled for all users). Skip ONLY non-numeric ids;
		// every real numeric id — including non-positive ones (0, root -1) — stays
		// gated, so no record reach is opened (principalCanAccessRecord blocks < 1).
		const recordId = Number(source.section_id);
		if (typeof source.section_tipo === 'string' && !Number.isNaN(recordId)) {
			const { principalCanAccessRecord } = await import('../security/record_scope.ts');
			if (!(await principalCanAccessRecord(source.section_tipo, recordId, principal))) {
				return { status: 200, body: { result: { context: [], data: [] }, msg: 'OK' } };
			}
		}
		// §7.4 per-COMPONENT schema ACL — defense-in-depth (AUTHZ-06). The `read`
		// handler's Gate A already checks (section_tipo, tipo) before routing here,
		// but the component get_data facade must ALSO self-gate: it emits a
		// component's data / datalist directly, and this branch is reachable for a
		// SYNTHETIC search_<n> id that skips the record gate above, so it must not
		// rely solely on an upstream gate to withhold a component the caller holds
		// level 0 on. Mirrors the section-read path's per-ddo ddoIsAuthorized
		// (read.ts:181). Level 0 ⇒ PHP empty shell (never the data), same as the
		// record-scope branch above — never a 403 that reveals the component exists.
		if (typeof source.section_tipo === 'string' && typeof source.tipo === 'string') {
			const { ddoIsAuthorized } = await import('../security/permissions.ts');
			if (!(await ddoIsAuthorized(principal, source.section_tipo, source.tipo))) {
				return { status: 200, body: { result: { context: [], data: [] }, msg: 'OK' } };
			}
		}
		const { readComponentData, buildGetDataContext } = await import('./read.ts');
		const componentData = await readComponentData(rqo);
		// component_filter_records datalist (PHP get_datalist): the misc-column
		// edit/search views render one text-input row per authorized SECTION the
		// user can filter (level >= 2). It is USER-scoped, so it is computed here
		// (principal in scope) rather than in the record-only read pipeline, which
		// only stubs an empty array. Attach it to the component's own item.
		if ((source.model ?? '') === 'component_filter_records') {
			const { getFilterRecordsDatalist } = await import(
				'../api/handlers/filter_records_datalist.ts'
			);
			const { currentDataLang } = await import('../resolve/request_lang.ts');
			const datalist = await getFilterRecordsDatalist(principal.userId, currentDataLang());
			for (const item of componentData) {
				if ((item as { tipo?: string }).tipo === source.tipo) {
					(item as { datalist?: unknown }).datalist = datalist;
				}
			}
		}
		const componentContext = await buildGetDataContext(rqo, componentData, principal);
		return {
			status: 200,
			body: { result: { context: componentContext, data: componentData }, msg: 'OK' },
		};
	}

	// A component-level get_data with NO section_id has no record to read
	// (a deep link that failed to carry the id, or a not-yet-saved record).
	// Return an empty component response rather than falling to readSection,
	// which requires an sqo and would 500 (PHP returns empty rows, not a crash).
	if (
		!isComponentSearch &&
		(source.action === 'get_data' || (source.model ?? '').startsWith('component_')) &&
		(source.section_id === undefined || source.section_id === null)
	) {
		return { status: 200, body: { result: { context: [], data: [] }, msg: 'OK' } };
	}

	// Release the reader's own stale edit locks on a section list read
	// (PHP force_unlock_all_components, dd_core_api:2321): navigating to a
	// list means the user is no longer editing. Best-effort — a lock
	// subsystem hiccup must never fail a read.
	try {
		const { forceUnlockAllComponents } = await import('./locks.ts');
		await forceUnlockAllComponents(principal.userId);
	} catch {
		// non-critical; TTL expiry + blur release still apply
	}

	// Pass the principal so the per-record projects filter applies
	// (non-admins never over-see records on a gated section, §7.4).
	const result = await readSection(rqo, principal);
	return { status: 200, body: { result, msg: 'OK' } };
}
