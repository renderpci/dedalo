/**
 * TEMPORAL instances — a tool's throwaway editable clone (WC-059).
 *
 * THE INVARIANT: a temporal instance ADDRESSES NO RECORD. The `section_id` it
 * carries is a client-side sentinel (1), not an address, and every door must
 * treat it as such: the save resolves and echoes, it never persists; the read
 * resolves CONTEXT with an empty value, it never reads the record.
 *
 * WHY THIS FILE EXISTS. The client has shipped `source.is_temporal` since PHP
 * commit 5c45c71ebb (2026-01-31), where it selected `matrix_temp_manager` — a
 * `(section_tipo, user)`-keyed row in the unlogged `temp` table — so writes went
 * to a scratch store. The TS rewrite carried the five client call sites over and
 * did NOT port the store; `rqoSourceSchema` is `.passthrough()`, so the flag rode
 * along unread and `saveComponentData({sectionId: Number(source.section_id)})`
 * wrote the sentinel straight onto the REAL record 1 of the target section —
 * value replaced, Time Machine row appended, modified-stamp falsified, and for
 * relations an orphan target record created. Un-ledgered until 2026-07-28.
 *
 * WHY NOT PORT THE STORE. Nothing ever reads the value back out of it: the
 * propagate tool sends `component_to_propagate.data.entries` straight from client
 * memory (tools/tool_propagate_component_data/js/…:333). The store was a PHP-era
 * accident of "a component must have a record", not a requirement — and making
 * `saveComponentData` polymorphic over a second store would refactor the engine's
 * most load-bearing write path (row lock, counter, relation index, TM) to serve a
 * write that must not happen at all. The PHP design was also broken on its own
 * terms: its key is per (section, user), so two tools open on the same section
 * collide.
 *
 * The producers (all client-side, frozen by the tripwire's allowlist):
 *   tools/tool_propagate_component_data/js/tool_propagate_component_data.js
 *   client/dedalo/core/services/service_tmp_section/js/service_tmp_section.js
 *   client/dedalo/core/component_text_area/js/render_draw.js
 *   client/dedalo/core/component_text_area/js/render_reference.js
 *   client/dedalo/core/section/js/view_graph_solved_section.js
 *
 * Gate: test/unit/temporal_instance_tripwire.test.ts.
 */

import type { ApiResult } from '../../api/response.ts';
import { denied } from '../../api/response.ts';
import type { Rqo } from '../../concepts/rqo.ts';
import { isConsultationOnlySection } from '../../concepts/section.ts';
import {
	getColumnNameByModel,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../ontology/resolver.ts';
import type { Principal } from '../../security/permissions.ts';
import {
	currentChipsFromPayload,
	mergeRelationChips,
	resolveRelationEcho,
} from './resolve_echo.ts';
import {
	type ChangedDataItem,
	applyUpdate,
	getIdFromKey,
	isLangSlicedModel,
	normalizeItemId,
} from './save_component.ts';

/**
 * The record id the client stamps on a temporal instance (component_common.js
 * `section_id: 1`). Documented here so the sentinel has a name — it is NEVER
 * honored as an address; the doors branch on `is_temporal`, not on this value.
 */
export const TEMPORAL_SECTION_ID_SENTINEL = 1;

/** The actions a temporal instance may apply, in memory. */
const TEMPORAL_ACTIONS: ReadonlySet<string> = new Set([
	'set_data',
	'update',
	'insert',
	'remove',
	'add_new_element',
]);

/**
 * The PREDICATE lives in concepts/rqo.ts, beside the field declaration — this
 * module reaches back into section/read.ts (via ./resolve_echo.ts), and read.ts
 * needs the predicate too, so defining it here would close a static import cycle
 * (import_scc_tripwire). This module owns the BEHAVIOUR; rqo.ts owns the flag.
 */

/** Next in-memory item id (the engine's counter never runs — nothing persists). */
function nextItemId(items: unknown[]): number {
	return (
		(items as { id?: unknown }[]).reduce(
			(max, item) => Math.max(max, Number(item?.id ?? 0) || 0),
			0,
		) + 1
	);
}

/**
 * NORMALIZE a LITERAL temporal component's entries for the echo.
 *
 * (!) THE DELTA IS NOT RE-APPLIED, and that is the whole subtlety of this door.
 * The persisted engine seeds from the LOCKED MATRIX ROW and applies
 * `changed_data` to it (`save_component.ts` applySaveComponentData) — it
 * structurally cannot double-apply. A temporal instance has no row to seed from,
 * so the only base available is `data.entries` from the request — and the client
 * has ALREADY applied the delta to that: `component_common.prototype.change_value`
 * (:1272-1278) runs `update_data_value` for every changed_data item, mutating
 * `self.data.entries` in place, and only THEN calls `save(changed_data)`, which
 * ships `clone(self.data)` (:663-664). So `data.entries` is the POST-delta state.
 *
 * Re-applying it here would: fail every `remove` (the item is already gone, and
 * the engine's "unknown id" rule would 400 the user's deletion), duplicate every
 * `insert`, and append on every `update`. Only `set_data` — which replaces
 * wholesale — is idempotent, which is exactly why the first version of this door
 * looked correct against a set_data-only gate.
 *
 * What DOES still have to happen is the normalization the persisted path performs
 * on the way to storage, because the echo becomes the client's next `self.data`:
 * the lang stamp and the item-id mint. Without the id mint an id-less item stays
 * id-less, so the next `update` arrives with `id: null` and appends instead of
 * replacing — the array grows on every committed edit, and for
 * tool_propagate_component_data that array is what gets written across every
 * matched record.
 *
 * The relation branch needs no equivalent: `mergeRelationChips` is idempotent
 * under both orderings (its insert path dedups by locator, its remove path is a
 * filter), which is why the same payload shape is safe there.
 *
 * Returns a message instead of throwing so the door answers 400 with the reason.
 */
export function applyTemporalLiteralChanges(
	entries: unknown[],
	changedData: ChangedDataItem[],
	options: { langSliced: boolean; effectiveLang: string; translatable: boolean; lang: string },
): { ok: true; items: unknown[] } | { ok: false; message: string } {
	const { langSliced, effectiveLang, translatable, lang } = options;

	for (const change of changedData) {
		if (!TEMPORAL_ACTIONS.has(change.action)) {
			return {
				ok: false,
				message: `action '${change.action}' is not available on a temporal instance`,
			};
		}
		if (change.action === 'add_new_element') {
			return {
				ok: false,
				message: "action 'add_new_element' is only available on a relation component",
			};
		}
		if (change.action === 'insert' && (change.value === null || typeof change.value !== 'object')) {
			return { ok: false, message: 'insert value must be an object item' };
		}
	}

	// Objects only — PHP's set_data_lang accepts nothing else and drops the rest.
	const items = entries
		.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
		.map((item) => ({ ...item }));

	// Lang stamp: a sliced component FORCE-corrects every item's lang (PHP
	// set_data_lang clone-stamps the slice); a merely translatable one fills a
	// missing lang (PHP set_data's lang-orphan guard).
	for (const item of items) {
		if (langSliced) {
			item.lang = effectiveLang;
		} else if (translatable && item.lang === undefined) {
			item.lang = lang;
		}
	}

	// Item-id mint, mirroring the persisted allocator. A sliced component first
	// tries the SHARED id at the same position in the sibling languages (PHP
	// :4110-4126 get_id_from_key), so a first translation reuses its siblings' id
	// instead of orphaning itself behind a fresh one.
	items.forEach((item, index) => {
		if (item.id !== undefined && item.id !== null && item.id !== '') return;
		const shared = langSliced ? getIdFromKey(items, index, [effectiveLang]) : null;
		item.id = shared ?? nextItemId(items);
	});

	return { ok: true, items };
}

/**
 * The temporal SAVE door: normalize the client's value and echo it in the
 * canonical shape the client resolves by. No matrix read of the addressed
 * record, no write to it, no Time Machine row, no modified stamp, no activity row.
 *
 * AUTHORIZATION is the caller's: the door admits at a READ level (>= 1), because
 * nothing is persisted and the write grant is therefore not the question being
 * asked — the same reasoning as the search_<n> branch.
 *
 * (!) ONE EXCEPTION, and it is the only write anywhere under this door:
 * `add_new_element` really creates a record in the TARGET section (PHP's temp
 * store did too — the target is real, only the host anchor was scratch). The
 * save handler therefore admits that action at level >= 2, and the branch below
 * additionally refuses a consultation-only target. Any claim that this door
 * "never writes" must be read with that exception in mind.
 */
export async function resolveTemporalSave(rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const source = rqo.source ?? {};
	const payload = (rqo.data ?? {}) as {
		changed_data?: ChangedDataItem[];
		entries?: unknown;
		value?: unknown;
	};
	const changedData = payload.changed_data ?? [];
	const componentTipo = source.tipo as string;
	const sectionTipo = source.section_tipo as string;
	const lang = source.lang ?? 'lg-nolan';

	const model = await getModelByTipo(componentTipo);
	if (model === null) {
		return denied(400, `save: unknown component tipo '${componentTipo}'`);
	}
	const column = getColumnNameByModel(model);

	for (const change of changedData) {
		if (!TEMPORAL_ACTIONS.has(change.action)) {
			return denied(400, `action '${change.action}' is not available on a temporal instance`);
		}
	}

	// RELATION family: resolve the picked set into real chips and echo it. The
	// resolver is the same one the search_<n> door uses (./resolve_echo.ts) —
	// the client needs a labelled chip and a pagination.total, and only a real
	// resolution produces them.
	if (column === 'relation') {
		let picked = mergeRelationChips(currentChipsFromPayload(payload), changedData);
		for (const change of changedData) {
			if (change.action !== 'add_new_element') continue;
			// add_new_element genuinely creates a record — in the TARGET section,
			// never in the host. PHP's temp store behaved the same way: the target
			// is real, only the host anchor was scratch. The host-filter read is
			// SKIPPED (there is no host record to read), so the created record
			// inherits the default project locator.
			//
			// (!) This is the ONE action on this door that writes, so it carries the
			// gates the door's read-level entry check deliberately does not: the
			// caller was admitted at level >= 2 for it (see the save handler), and
			// the TARGET must be a real, writable section. Without the
			// consultation-only check the createSectionRecord engine THROWS on
			// dd542/dd15 — a 500 where a 400 is the honest answer.
			const targetSectionTipo = String(change.value ?? '');
			if (targetSectionTipo === '' || isConsultationOnlySection(targetSectionTipo)) {
				return denied(400, `add_new_element: invalid target section '${targetSectionTipo}'`);
			}
			const { applyAddNewElement } = await import('../../relations/save.ts');
			const outcome = await applyAddNewElement(
				picked,
				targetSectionTipo,
				componentTipo,
				sectionTipo,
				Number(source.section_id ?? TEMPORAL_SECTION_ID_SENTINEL),
				{ skipHostFilterRead: true },
			);
			if (outcome === null) {
				return denied(400, 'add_new_element failed');
			}
			picked = outcome.items as Record<string, unknown>[];
		}
		const echo = await resolveRelationEcho({
			rqo,
			principal,
			picked,
			mode: source.mode ?? 'edit',
		});
		// Select-family components re-render from data.datalist (e.g.
		// component_radio_button get_checked_value_label reads it after a save), and
		// the persisted door attaches it — so this one must too, or the post-save
		// render dereferences undefined. It belongs HERE, not on the literal branch:
		// every SELECT_FAMILY_MODELS member is a relation-column component, so a
		// datalist attach placed after the `column === 'relation'` return could
		// never run at all.
		const { SELECT_FAMILY_MODELS } = await import('../../relations/models/select_family.ts');
		if (SELECT_FAMILY_MODELS.has(model)) {
			const { getDatalist } = await import('../../relations/datalist.ts');
			const { getNode } = await import('../../ontology/resolver.ts');
			const node = await getNode(componentTipo);
			const echoed = ((echo.body as { result?: { data?: unknown[] } }).result?.data ??
				[]) as Record<string, unknown>[];
			const main = echoed.find(
				(entry) => entry.tipo === componentTipo && entry.section_tipo === sectionTipo,
			);
			if (main !== undefined) {
				main.datalist = await getDatalist(
					componentTipo,
					node?.properties ?? null,
					sectionTipo,
					lang,
				);
			}
		}
		return echo;
	}

	// LITERAL family: apply in memory and echo.
	const translatable = await getTranslatableByTipo(componentTipo);
	const outcome = applyTemporalLiteralChanges(currentChipsFromPayload(payload), changedData, {
		langSliced: isLangSlicedModel(model),
		effectiveLang: translatable || model === 'component_iri' ? lang : 'lg-nolan',
		translatable,
		lang,
	});
	if (!outcome.ok) {
		return denied(400, `save failed: ${outcome.message}`);
	}

	const { buildDataItem } = await import('../../resolve/component_data.ts');
	const dataItem = buildDataItem(
		componentTipo,
		sectionTipo,
		source.section_id ?? null,
		source.mode ?? 'edit',
		lang,
		outcome.items,
	);
	return { status: 200, body: { result: { context: [], data: [dataItem] }, msg: 'OK' } };
}
