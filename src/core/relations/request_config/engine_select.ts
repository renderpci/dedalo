/**
 * CAPABILITY NEGOTIATION at the request_config NARROWING sites.
 *
 * Roughly a dozen places in the engine need ONE request_config item where a
 * component may declare several — a pagination limit to stamp, a section_list
 * column set, an order path, a fields separator. Every one of them used to spell
 * the choice itself, in three drifting forms:
 *
 *     rcs.find(x => x.api_engine === 'dedalo')                     // → undefined
 *     rcs.find(x => (x.api_engine ?? 'dedalo') === 'dedalo')       // → undefined
 *     rcs.find(x => x.api_engine === 'dedalo') ?? rcs[0]           // → THE EXTERNAL ITEM
 *
 * All three are wrong for an EXTERNAL-ONLY component. `test61` is one today
 * (its single item declares `zenon`); `test204` is NOT — its first item
 * declares no `api_engine`, i.e. implicit dedalo, and only its SECOND item is
 * zenon. The shape matters because an external-only relation component is the
 * subsystem's advertised configuration, not because the census is full of them.
 * The first two spellings silently produce nothing — no
 * pagination stamp, no columns, no order path — which is the "silently narrow
 * scope" failure the project forbids. The third is worse: it hands an external
 * item to code that then asks the DEDALO engine to order, page or SQL-search it,
 * and answers confidently with the wrong thing.
 *
 * THE RULE HERE. The dedalo item wins whenever there is one — that is not a
 * preference, it is the fact that the dedalo engine is the only one with a
 * matrix table behind it. When there is none, every survivor is external, and
 * the caller's CONCERN is put to the adapter: can this service order? page?
 * back a list column? search? A `true` returns the item; a `false` REFUSES with
 * a named error naming the site, the service and the concern.
 *
 * WHY REFUSING IS RIGHT, and not "degrade to empty". An unordered list quietly
 * served as an ordered one is a wrong answer that looks right, and a heritage
 * cataloguer has no way to tell. The refusal is loud, names what to fix, and —
 * unlike the silent paths it replaces — appears in a log.
 *
 * NOT a read-path degradation seam: this is a CONFIGURATION question (which
 * engine backs this component), answered identically for every request. The
 * degradation posture (never throw, emit `source_status`) governs the VALUE
 * path — components/component_external/value.ts — where the failure is a remote
 * service having a bad day. These two must not be confused.
 *
 * Census + ratchet: test/unit/external_config_narrowing_census.test.ts.
 */

import type { ExternalServiceCapabilities } from '../../../external/api/index.ts';

/** The implicit engine of a config item that declares none. */
const DEFAULT_ENGINE = 'dedalo';

/**
 * One request_config item, as far as engine selection cares. Deliberately NO
 * index signature: the selector returns the caller's OWN item type unchanged
 * (`<T extends EngineSelectableItem>`), so every site keeps the shape it already
 * had instead of widening to `unknown` at the pick.
 */
export interface EngineSelectableItem {
	readonly api_engine?: string;
}

/**
 * What a narrowing site is about to do with the item it picks. The names are
 * the adapter descriptor's capability flags verbatim
 * (src/external/descriptor_types.ts ExternalServiceCapabilities) — one
 * vocabulary, so a site cannot ask a question no adapter answers.
 */
export type EngineConcern = keyof ExternalServiceCapabilities;

/** A narrowing site refused because the surviving engine cannot do the job. */
export class ExternalEngineConcernUnsupportedError extends Error {
	readonly site: string;
	readonly service: string;
	readonly concern: EngineConcern;

	constructor(fields: { site: string; service: string; concern: EngineConcern; detail?: string }) {
		super(
			`request_config narrowing refused at ${fields.site}: the only engine is '${fields.service}', whose adapter declares capabilities.${fields.concern} = false${fields.detail === undefined ? '' : ` (${fields.detail})`}`,
		);
		this.name = 'ExternalEngineConcernUnsupportedError';
		this.site = fields.site;
		this.service = fields.service;
		this.concern = fields.concern;
	}
}

/**
 * Pick the ONE config item for a site whose concern is answered LOCALLY —
 * nothing about the remote service can change the answer.
 *
 * Two sites qualify today, both about paging a locator array Dédalo already
 * holds: the list/TM cell limit (section_list.pickConfig) and the get_data
 * pagination stamp (section/read.getDataContext). `cellLimit` slices
 * `relation` column entries that are stored in THIS install's matrix; the
 * remote adapter's `capabilities.pagination` says whether the SERVICE can page
 * its own result set, which is a different question. Routing these through
 * selectConfigItemForConcern made zenon's `pagination: false` throw
 * ExternalEngineConcernUnsupportedError out of the section-list read path.
 *
 * "Dedalo item else first item" — the `find(dedalo) ?? rcs[0]` spelling, which
 * is CORRECT here and only here: it is byte-identical to the pre-multi-engine
 * behaviour for every all-dedalo config, and for an external-only one it reads
 * a plain number off the item that owns it.
 *
 * Synchronous by construction: no adapter is consulted. That is the point.
 */
export function selectLocalConfigItem<T extends EngineSelectableItem>(
	items: readonly T[] | null | undefined,
): T | null {
	if (!Array.isArray(items) || items.length === 0) return null;
	return items.find((item) => engineOf(item) === DEFAULT_ENGINE) ?? (items[0] as T);
}

/** The item's engine, with the implicit default applied. */
export function engineOf(item: EngineSelectableItem | undefined): string {
	const declared = item?.api_engine;
	return typeof declared === 'string' && declared.length > 0 ? declared : DEFAULT_ENGINE;
}

/**
 * Pick the ONE config item a narrowing site should work from.
 *
 *  - no items → `null` (the component declares no config; every caller already
 *    has a defined answer for that, and inventing one here would hide it);
 *  - a dedalo item (declared or implicit) → that item, always the FIRST such;
 *  - otherwise → the first external item, but only after its adapter says it
 *    supports `concern`. Unsupported, or a service no adapter implements, and
 *    this THROWS.
 *
 * `site` is a stable, greppable identifier of the call site (module + function),
 * used in the error and asserted by the census ratchet.
 */
export async function selectConfigItemForConcern<T extends EngineSelectableItem>(
	items: readonly T[] | null | undefined,
	concern: EngineConcern,
	site: string,
): Promise<T | null> {
	if (!Array.isArray(items) || items.length === 0) return null;
	const dedalo = items.find((item) => engineOf(item) === DEFAULT_ENGINE);
	if (dedalo !== undefined) return dedalo;

	// External-only. The facade is a DYNAMIC import (engineering/CONVENTIONS.md):
	// src/core and src/external are peers, and a static value edge would fuse
	// them — a component with a plain dedalo config never loads the subsystem.
	const external = items[0] as T;
	const service = engineOf(external);
	const { externalServiceCapabilities } = await import('../../../external/api/index.ts');
	// An unregistered service throws ExternalServiceNotRegisteredError from here,
	// which is the right answer: "I cannot find out what it supports" must never
	// be read as "it supports this".
	if (!externalServiceCapabilities(service)[concern]) {
		throw new ExternalEngineConcernUnsupportedError({ site, service, concern });
	}
	return external;
}
