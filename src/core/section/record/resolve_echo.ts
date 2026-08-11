/**
 * RESOLVE-ONLY relation save: the shared core of every save-shaped request that
 * must NOT persist.
 *
 * Two doors need exactly this behaviour, and they must not grow two copies of it:
 *
 *  - the SEARCH-MODE relation link (`source.section_id` = 'search_<n>', a
 *    client-minted synthetic id that addresses no matrix row — the picked
 *    locator is a search FILTER, never a persisted relation);
 *  - the TEMPORAL instance (`source.is_temporal`, a tool's throwaway editable
 *    clone — see ./temporal.ts and WC-059).
 *
 * Both hold the same contract: RESOLVE the picked set so the client can render
 * a real chip, ECHO it in the canonical DataItem shape, and write NOTHING. The
 * write path would materialize the host record (createSectionRecord) — on a
 * synthetic id it throws on the NaN, and on a temporal instance it clobbers
 * whatever real record the client's sentinel id happens to name.
 *
 * What is NOT shared is how each door computes its picked set: the search door
 * merges the client's current chips with the delta (below), while a temporal
 * portal may additionally have created a target record (add_new_element). So
 * this module owns the MERGE and the ECHO; the callers own the policy.
 */

import type { ApiResult } from '../../api/response.ts';
import { isLocatorInArray } from '../../concepts/locator.ts';
import type { Rqo } from '../../concepts/rqo.ts';
import { canonicalizeStoredSectionId } from '../../concepts/section_id.ts';
import type { Principal } from '../../security/permissions.ts';
import type { ChangedDataItem } from './save_component.ts';

/**
 * Reconcile the client's CURRENT chips with the delta it sent (PHP has no twin:
 * its save persisted and re-read).
 *
 * The client ships `clone(self.data)` — its current entries — PLUS the delta
 * (link_record sends one 'insert'; unlink_record one 'remove' by entry id). The
 * echo becomes the client's next `self.data` verbatim, so applying inserts only
 * would drop every prior chip on a second pick, and an unlink would clear ALL
 * chips. Insert duplicates are dropped here because the client's own duplicate
 * check is page-local.
 */
export function mergeRelationChips(
	currentChips: Record<string, unknown>[],
	changedData: ChangedDataItem[],
): Record<string, unknown>[] {
	const removedIds = new Set(
		changedData
			.filter((change) => change.action === 'remove' && change.id != null)
			.map((change) => String(change.id)),
	);
	const merged = currentChips.filter((chip) => !removedIds.has(String(chip.id)));
	for (const change of changedData) {
		if (change.action !== 'insert' || change.value == null) continue;
		const locator = change.value as Record<string, unknown>;
		// Locator law (S2-04/DEC-21): key-based membership over the target pair,
		// via the canonical in_array_locator twin. The hand-rolled stringified
		// comparison this replaces missed the loose-numeric case the law exists
		// for (a stored '05' vs 5).
		if (!isLocatorInArray(locator as never, merged as never[], ['section_tipo', 'section_id'])) {
			merged.push(locator);
		}
	}
	return merged;
}

/** Read the client's current chips out of the save payload (entries, or value). */
export function currentChipsFromPayload(payload: {
	entries?: unknown;
	value?: unknown;
}): Record<string, unknown>[] {
	const raw = Array.isArray(payload.entries)
		? (payload.entries as Record<string, unknown>[])
		: Array.isArray(payload.value)
			? (payload.value as Record<string, unknown>[])
			: [];
	return raw.filter((chip) => chip !== null && typeof chip === 'object');
}

/**
 * Resolve a picked locator set into the response the client's relation widget
 * expects — chips with labels, plus the context — WITHOUT writing anything.
 *
 * `mode` is stamped on the fallback DataItem only (the resolved main item keeps
 * whatever resolveSearchData emitted): 'search' for the search door, 'edit' for
 * a temporal clone.
 */
export async function resolveRelationEcho(options: {
	rqo: Rqo;
	principal: Principal;
	picked: Record<string, unknown>[];
	mode: string;
}): Promise<ApiResult> {
	const { rqo, principal, mode } = options;
	const source = rqo.source ?? {};
	// Strip the echo-only stamps — resolveSearchData re-stamps id 1..n.
	const picked = options.picked.map(
		({ id: _id, paginated_key: _paginatedKey, ...locator }) => locator,
	);
	const resolveRqo = {
		...rqo,
		source: { ...source, action: 'resolve_data', value: picked },
	} as typeof rqo;
	const { resolveSearchData, buildGetDataContext } = await import('../read.ts');
	const { buildDataItem } = await import('../../resolve/component_data.ts');
	const resolved = await resolveSearchData(resolveRqo, principal);
	// resolveSearchData emits the main item with a NULL record identity
	// (synthetic record — read.ts expandPortal stamp), so match by tipo only and
	// RE-STAMP the caller's id: the client picks its item by comparing the
	// stringified record id against its own (component_common.js:400).
	// The resolved entries carry the canonical locator form. The old law here
	// ("echo the string cast or the @> containment misses every string-stored
	// locator") is REPEALED by WC-2026-08-10-section-id-int-canonical: search
	// probes now try BOTH typed forms (search/containment.ts), so the echo is
	// free to carry the canonical int and no longer has to pin the wire to the
	// storage type of the moment.
	let mainItem = resolved.find(
		(item) =>
			(item as { tipo?: string }).tipo === source.tipo &&
			(item as { section_tipo?: string }).section_tipo === source.section_tipo,
	);
	if (mainItem !== undefined) {
		(mainItem as { section_id?: unknown }).section_id = source.section_id;
	} else {
		mainItem = buildDataItem(
			source.tipo as string,
			source.section_tipo as string,
			source.section_id ?? null,
			mode,
			source.lang ?? 'lg-nolan',
			// Canonical emission (WC-2026-08-10-section-id-int-canonical): a
			// record address goes out as an INT; an external remote id
			// ('001338683', 'Q42') and a synthetic token survive VERBATIM —
			// which is exactly what canonicalizeStoredSectionId does, and why
			// the blanket String() cast (PHP class.locator.php set_section_id)
			// is gone rather than inverted into a blanket Number().
			picked.map((locator) =>
				locator.section_id !== undefined && locator.section_id !== null
					? { ...locator, section_id: canonicalizeStoredSectionId(locator.section_id) }
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
