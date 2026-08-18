/**
 * RELATION SAVE HOOKS (RELATIONS_SPEC.md §2/§8.7) — the write-side
 * particularities of the relation family, consumed by the generic component
 * save pipeline (section/record/save_component.ts):
 *
 * - sort_data: absolute-position locator move, validated against the stored
 *   item (PHP component_common::update_data_value 'sort_data');
 * - sort_by_column: property-gated reorder of the stored locators by a
 *   target-section column search (PHP
 *   component_relation_common::sort_data_by_column, :3310);
 * - add_new_element: create a target record inheriting the HOST's projects
 *   filter, then append the link locator (PHP
 *   component_relation_common::add_new_element, :3770 — the §8.7
 *   filter-inheritance security carry-over);
 * - relation_search ancestor index maintenance for the legacy
 *   component_autocomplete_hi model (hierarchical 'search Spain matches
 *   Madrid' index);
 * - delete_locator: the dd_component_portal_api partial-locator removal.
 *
 * Phase A: verbatim strangler extraction — semantics unchanged. Phase C adds
 * dataframe saves (id_key stamping + test_equal_properties dedup); Phase D
 * adds the children write-redirect-to-parent.
 *
 * The sort matcher runs the LOCATOR LAW (S2-03/S2-04 per DEC-21):
 * locator::compare_locators over PHP's exact 4-property list
 * (class.component_common.php:4424-4428) — section_id loose-numeric, every
 * other property strict AND present-on-both — so TS rejects exactly the
 * stale-drag/type-drift reorders the PHP oracle rejects. The moved item
 * additionally PRESERVES stored properties the client's value omits (beyond
 * PHP, which persists the bare client value after the same validation): the
 * 4-property gate means those extras can only be non-identity fields, and
 * keeping them protects id_key dataframe pairing + inverse-ref cleanup.
 * delete_locator was ALIGNED to compareLocators earlier (S1-06): the loose
 * matcher over-deleted (stored '7' vs sent 7) against the oracle.
 */

import { getComponentModel } from '../components/registry.ts';
import { compareLocators, isLocatorInArray } from '../concepts/locator.ts';
import { canonicalizeStoredSectionId } from '../concepts/section_id.ts';
import {
	type DataframePairing,
	dataframeEntriesEqual,
	dataframeEntryMatches,
	isDataframeEntry,
	normalizeDataframeEntry,
} from '../concepts/subdatum.ts';
import { dbTimestamp } from '../db/db_timestamp.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { recordTimeMachine } from '../db/time_machine.ts';
import { DedaloError } from '../errors/index.ts';
import type { Principal } from '../security/permissions.ts';
import {
	inCapScope,
	isTargetAllowed,
	isTermSelectable,
	type PickerConstraint,
	resolvePickerConstraint,
} from './picker_constraint.ts';

export interface SortDataChange {
	value: Record<string, unknown> | null;
	source_key: number;
	target_key: number;
}

/**
 * PHP update_data_value 'sort_data': validate the client's locator against
 * the stored item at source_key (locator law — see the module header), then
 * rebuild the array — the moved locator lands BEFORE the target when moving
 * up, AFTER it when moving down. Returns null on any validation failure (PHP
 * returns false).
 */
export function applySortData(items: unknown[], change: SortDataChange): unknown[] | null {
	const value = change.value === null ? null : { ...change.value };
	// biome-ignore lint/performance/noDelete: PHP unset — paginated_key must be ABSENT in persisted data
	if (value !== null) delete value.paginated_key;
	const sourceKey = Number(change.source_key);
	const targetKey = Number(change.target_key);
	const source = items[sourceKey] as Record<string, unknown> | undefined;
	if (source === undefined || source === null || value === null) return null;
	// PHP :4424: locator::compare_locators($db_value, $client_value,
	// ['section_id','section_tipo','from_component_tipo','tag_id']).
	if (
		!compareLocators(source as never, value as never, [
			'section_id',
			'section_tipo',
			'from_component_tipo',
			'tag_id',
		])
	) {
		return null;
	}
	// The persisted moved item: stored item first, client value over it — a
	// client payload that omits stored properties (id, type, …) can never
	// strip them (S2-03; identity drift is already excluded by the gate above).
	const moved: Record<string, unknown> = { ...source, ...value };
	// biome-ignore lint/performance/noDelete: PHP unset — paginated_key must be ABSENT in persisted data
	delete moved.paginated_key;
	if (sourceKey === targetKey) return [...items];
	const rebuilt: unknown[] = [];
	items.forEach((current, key) => {
		if (key === sourceKey) return;
		if (key === targetKey && targetKey < sourceKey) {
			rebuilt.push(moved, current);
			return;
		}
		if (key === targetKey && targetKey > sourceKey) {
			rebuilt.push(current, moved);
			return;
		}
		rebuilt.push(current);
	});
	return rebuilt;
}

export interface SortByColumnChange {
	component_tipo: string;
	direction: string;
}

/**
 * Persistent user reorder of the stored locators by a column (v7 per-ddo model,
 * WC-048): gated by the COLUMN ddo's own `sort_by_column: true` — the top-level
 * `properties.sort_by_column` (true | allowlist array) is GONE, the capability
 * is declared on the `show.ddo_map` entry itself. The column must be a show
 * ddo_map entry of the component's own edit config; the stored locators reorder
 * by a target-section search ordered on that column (unranked locators keep
 * relative order at the END). PHP ancestor: component_relation_common::
 * sort_data_by_column (reference only — TS diverges to the ddo-level gate).
 */
export async function applySortByColumn(
	items: unknown[],
	change: SortByColumnChange,
	componentTipo: string,
	sectionTipo: string,
): Promise<unknown[] | null> {
	const { getNode } = await import('../ontology/resolver.ts');
	const node = await getNode(componentTipo);

	const direction = String(change.direction ?? '').toUpperCase();
	if (direction !== 'ASC' && direction !== 'DESC') return null;

	const columnTipo = String(change.component_tipo ?? '');
	const { buildRequestConfigForElement } = await import('./request_config/build.ts');
	const config = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: componentTipo,
		ownerSectionTipo: sectionTipo,
		mode: 'edit',
		ownerIsSection: false,
	});
	const ddo = (config[0]?.show?.ddo_map ?? []).find((entry) => entry.tipo === columnTipo);
	if (ddo === undefined) return null;
	// Per-ddo opt-in: the column must declare `sort_by_column: true`.
	if ((ddo as { sort_by_column?: unknown }).sort_by_column !== true) return null;

	// The ranking scope is the TARGET section(s) — where the linked records
	// live — read from the locators, NOT the caller `sectionTipo`. A portal
	// column's `section_tipo: 'self'` means its target; resolving 'self' to the
	// caller searched the wrong table and ranked nothing.
	const { rankLocatorsByColumns, locatorTargetSections, buildOrderEntries } = await import(
		'./order_locators.ts'
	);
	const targets = locatorTargetSections(items);
	const firstTarget = targets[0];
	if (firstTarget === undefined) return null;

	// Resolve the per-MODEL order path (relation columns join to the linked
	// leaf, not a non-existent `.value` on the locator).
	const order = await buildOrderEntries([{ componentTipo: columnTipo, direction }], firstTarget);
	if (order.length === 0) return null;
	return rankLocatorsByColumns(items, targets, order);
}

/**
 * The project locators a portal "+" hands its new target record (PHP
 * component_common::get_current_section_filter_data, :5141-5212):
 *
 *  - the host section IS the projects section (dd153) → the host RECORD is the
 *    project ("project of projects": a sub-project inherits its parent);
 *  - otherwise the host's own component_filter locators, INTERSECTED with the
 *    caller's authorized projects ("only intersections are accepted") — a
 *    cataloguer must never mint a record into a project they cannot see;
 *  - nothing left → [], and add_new_element's OWN empty branch takes over.
 *
 * The intersection is the half TS was missing; the fallback used to be a
 * HARDCODED `dd153/1` that ignored DEDALO_DEFAULT_PROJECT entirely.
 *
 * THE EMPTY CASE IS NOT THE CREATE DOOR'S CASCADE. PHP add_new_element
 * (component_relation_common.php:3798-3813) handles it inline with
 * DEDALO_SECTION_PROJECTS_TIPO / DEDALO_DEFAULT_PROJECT / the filter relation
 * type; it never calls component_filter::get_default_data_for_user, so the
 * caller's own FIRST project — which IS the create door's answer for a
 * non-admin — is deliberately not used here. Falling through to
 * resolveDefaultFilterData was an undeclared divergence (a non-admin's
 * unreachable-host "+" silently landed in their first project instead of the
 * default one). See defaultProjectFilterData below.
 *
 * NOTE the further asymmetry, also PHP's: `get_current_section_filter_data` has
 * NO global-admin exemption, while `get_default_data_for_user` does. An admin
 * carries no dd170 locators, so the intersection empties and the new record
 * lands in DEDALO_DEFAULT_PROJECT rather than the host's project — pinned by
 * portal_edit_writes_native.test.ts. Do not "fix" it without a WC entry.
 */
async function inheritedHostFilterData(
	sectionTipo: string,
	sectionId: number,
	userId: number,
): Promise<Record<string, unknown>[]> {
	const { config } = await import('../../config/config.ts');
	const { getComponentFilterTipo, getMatrixTableFromTipo } = await import(
		'../ontology/resolver.ts'
	);

	if (sectionTipo === config.features.filterSectionTipo) {
		// PHP :5150-5158 — the host record itself is the project.
		return [
			{
				section_tipo: config.features.filterSectionTipo,
				// int-canonical stored address (WC-2026-08-10-section-id-int-canonical).
				section_id: sectionId,
				type: 'dd675',
			},
		];
	}

	const hostFilterTipo = await getComponentFilterTipo(sectionTipo);
	if (hostFilterTipo === null) return [];
	const hostTable = await getMatrixTableFromTipo(sectionTipo);
	if (hostTable === null) return [];
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const hostRecord = await readMatrixRecord(hostTable, sectionTipo, sectionId);
	const stored =
		((hostRecord?.columns.relation as Record<string, unknown[]> | null)?.[hostFilterTipo] as Record<
			string,
			unknown
		>[]) ?? [];
	if (stored.length === 0) return [];

	// Intersect with the CALLER's projects (PHP :5199-5205, in_array_locator
	// over [section_tipo, section_id] — the locator law, loose section_id).
	const { getUserProjects } = await import('../security/permissions.ts');
	const userProjects = (await getUserProjects(userId)).map((projectId) => ({
		section_tipo: config.features.filterSectionTipo,
		// Canonical int form; the compare itself is loose on section_id anyway.
		section_id: projectId,
	}));
	return stored.filter((locator) =>
		isLocatorInArray(locator as never, userProjects as never[], ['section_tipo', 'section_id']),
	);
}

/**
 * PHP add_new_element's own empty-filter branch (:3798-3813): when
 * get_current_section_filter_data yields nothing — an empty intersection, a
 * host with no projects, a host section with no component_filter, or a TEMPORAL
 * instance (`is_temporal===true` short-circuits it to null) — the new record
 * gets the CONFIGURED default project, built from
 * DEDALO_SECTION_PROJECTS_TIPO / DEDALO_DEFAULT_PROJECT /
 * DEDALO_RELATION_TYPE_FILTER. `from_component_tipo` and `id` are stamped by
 * the create door (stampFilterData), exactly as PHP re-stamps them at :3833.
 */
async function defaultProjectFilterData(): Promise<Record<string, unknown>[]> {
	const { config } = await import('../../config/config.ts');
	const { RELATION_TYPE_FILTER } = await import('../section/record/record_defaults.ts');
	return [
		{
			section_tipo: config.features.filterSectionTipo,
			// int-canonical stored address (WC-2026-08-10-section-id-int-canonical).
			section_id: config.features.defaultProject,
			type: RELATION_TYPE_FILTER,
		},
	];
}

/**
 * PHP add_new_element (component_relation_common.php:3770-3860): create a
 * record in the target section — inheriting the HOST record's project filter
 * (or the create-door default) into the target's component_filter — then
 * append the link locator to the portal.
 *
 * THE ACTOR IS THE REAL CALLER. This path used to hardcode user -1, so every
 * record born from a portal "+" was attributed to the superuser and left no
 * NEW activity row (audit §5.1). The principal is request-scoped
 * (security/request_context.ts) — never captured at module level; outside any
 * request scope (background jobs, unit harnesses) it falls back to the
 * superuser exactly as the rest of the engine does.
 */
export async function applyAddNewElement(
	items: unknown[],
	targetSectionTipo: string,
	componentTipo: string,
	sectionTipo: string,
	sectionId: number,
	options?: {
		/**
		 * Skip the HOST record read that seeds the new target's project filter.
		 * Set by the TEMPORAL door (section/record/temporal.ts): a temporal
		 * instance addresses no record, so there is no host to inherit from and
		 * `sectionId` is a sentinel — reading it would read a stranger's record.
		 * The filter then falls through to the default project locator below,
		 * which is the same fallback a host with an empty filter already takes.
		 */
		skipHostFilterRead?: boolean;
	},
): Promise<{ items: unknown[]; sectionId: number } | null> {
	if (targetSectionTipo === '') return null;
	const { createSectionRecord } = await import('../section/record/create_record.ts');
	const { currentPrincipal, currentRequestContext } = await import(
		'../security/request_context.ts'
	);
	const { SUPERUSER_ID } = await import('../security/permissions.ts');
	const userId = currentPrincipal()?.userId ?? SUPERUSER_ID;

	// Host project filter. EMPTY (no intersection, no host filter, or the
	// temporal door) → PHP's own DEDALO_DEFAULT_PROJECT branch, NOT the create
	// door's per-user cascade (:3798-3813 — see defaultProjectFilterData).
	const inherited =
		options?.skipHostFilterRead === true
			? []
			: await inheritedHostFilterData(sectionTipo, sectionId, userId);
	const filterData = inherited.length > 0 ? inherited : await defaultProjectFilterData();

	// ONE insert carries the inherited filter (PHP passes it as create_record's
	// `values`), so the record is never momentarily outside the projects ACL.
	const newSectionId = await createSectionRecord(targetSectionTipo, userId, new Date(), undefined, {
		filterData,
	});
	if (!newSectionId) return null;

	// Activity audit (PHP logger 'NEW' code 3 — section::create_record step 7,
	// which add_new_element reaches like every other create door). Never fails
	// the create: logActivity swallows its own errors.
	{
		const { logActivity, hostFromClientIp } = await import('../api/handlers/activity_log.ts');
		const { getMatrixTableFromTipo } = await import('../ontology/resolver.ts');
		await logActivity({
			what: 'NEW',
			tipo: targetSectionTipo,
			userId,
			host: hostFromClientIp(currentRequestContext()?.clientIp),
			data: {
				msg: 'Created section record',
				section_id: newSectionId,
				section_tipo: targetSectionTipo,
				tipo: targetSectionTipo,
				table: (await getMatrixTableFromTipo(targetSectionTipo)) ?? 'matrix',
			},
		});
	}

	// append the link locator (dedup like PHP add_locator_to_data). PHP's
	// save assigns the next ITEM id (1 on an empty portal).
	const maxId = (items as { id?: unknown }[]).reduce(
		(max, item) => Math.max(max, Number(item?.id ?? 0) || 0),
		0,
	);
	const locator = {
		id: maxId + 1,
		type: 'dd151',
		// WC-2026-08-10-section-id-int-canonical: createSectionRecord already
		// returns the int address — minting it as text was the old string law.
		section_id: newSectionId,
		section_tipo: targetSectionTipo,
		from_component_tipo: componentTipo,
	};
	// Locator law (S2-04/DEC-21): key-based membership over the target pair —
	// stringified matching like the previous inline check, via the canonical
	// in_array_locator twin instead of a hand-rolled comparison.
	const exists = isLocatorInArray(locator as never, items as never[], [
		'section_tipo',
		'section_id',
	]);
	return {
		items: exists ? [...items] : [...items, locator],
		sectionId: newSectionId,
	};
}

/**
 * Write relation_search[componentTipo] = the recursive PARENT locators of
 * every stored target (dedup, closest-first, tagged with the items' relation
 * type) — the autocomplete_hi ancestor index. Exported for the observer
 * DEFAULT branch (same-record refresh after tag-text saves).
 */
export async function maintainRelationSearchIndex(
	table: string,
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
	items: unknown[],
): Promise<void> {
	const { getParentChainLocators } = await import('../resolve/dd_info.ts');
	const { updateMatrixKeyData } = await import('../db/matrix_write.ts');
	const relationType = ((items[0] as { type?: string } | null)?.type ?? 'dd151') || 'dd151';
	const seenAncestors = new Set<string>();
	const searchValue: Record<string, unknown>[] = [];
	for (const item of items) {
		const locator = item as { section_tipo?: string; section_id?: unknown } | null;
		if (typeof locator?.section_tipo !== 'string' || locator.section_id === undefined) continue;
		for (const parent of await getParentChainLocators(
			locator.section_tipo,
			String(locator.section_id),
		)) {
			const key = `${parent.section_tipo}|${parent.section_id}`;
			if (seenAncestors.has(key)) continue;
			seenAncestors.add(key);
			searchValue.push({
				type: relationType,
				section_id: parent.section_id,
				section_tipo: parent.section_tipo,
				from_component_tipo: componentTipo,
			});
		}
	}
	await updateMatrixKeyData(
		table,
		sectionTipo,
		sectionId,
		'relation_search',
		componentTipo,
		searchValue.length > 0 ? searchValue : null, // null → delete_key
	);
}

/**
 * PHP component_relation_common::validate_data_element (:1058-1198) — the
 * relation-family INSERT validation/normalization. The service_autocomplete
 * link_record flow depends on every step (found live 2026-07-09: the generic
 * insert used to persist the picker's raw client locator — paginated_key
 * kept, `type` missing, numeric section_id — polluting the shared data):
 *
 *  - section_id + section_tipo required, else the insert is IGNORED;
 *  - autoreference guard (self-link → ignored, PHP :1082);
 *  - `type` filled from the component's relation type (:1098);
 *  - component_relation_related additionally stamps `type_rel` (:1103);
 *  - `from_component_tipo` FORCED to the component's own tipo (:1107-19);
 *  - translatable relation locators carry the request lang (:1121-35);
 *  - transient `paginated_key` never persists (:1138-41);
 *  - locator normalization CANONICALIZES section_id to an INT
 *    (WC-2026-08-10-section-id-int-canonical, repealing the PHP-era string law
 *    "client 301 → stored \"301\"" that this list carried: the record address is
 *    an integer, so client 301 and client "301" both store 301). Values that are
 *    NOT convertible to an address — external-service remote ids like
 *    "001338683" or "Q42" — pass through VERBATIM; they are a different concept
 *    wearing the same field name and must never be cast;
 *  - duplicate rejection over get_locator_properties_to_check
 *    ([section_id, section_tipo, type, tag_id] + lang when translatable,
 *    :1146-98) — a dup returns null so the item is not added and the client's
 *    server-authoritative duplicate check (pagination.total unchanged) fires.
 *
 * Properties the client sent beyond the locator law are PRESERVED (S2-03
 * posture — dataframe id_key pairing must survive). Returns the normalized
 * locator, or null when the insert must be dropped (PHP returns false).
 *
 * DATAFRAME saves run through here TOO, with `pairing` set. They used to be
 * excluded (`!isDataframeSave` at all three save_component call sites), which
 * made component_dataframe the ONE relation column that persisted the client's
 * raw locator: no `type`, echoed `paginated_key`, numeric section_id, no dedup
 * — i.e. write-only frames the read predicate could never see again. PHP has
 * no such exclusion (component_dataframe::set_data delegates to
 * parent::set_data → validate_data_element like every other relation); it only
 * OVERRIDES the dedup key, which `pairing` reproduces here.
 *
 * THIS IS THE LENGTH-1 DOOR. The list above is `normalizeRelationInsert`;
 * everything else — the target, read-grant, selectability and selection-cap
 * constraints — is `validateRelationInserts`, the array door this delegates to.
 *
 * TWO KINDS OF REFUSAL, TWO SIGNALS. The PHP-era drops (bad_form /
 * autoreference / duplicate) keep this door's designed contract: null, read by
 * every caller as PHP's "ignored" (the client's server-authoritative duplicate
 * check is exactly an unchanged pagination.total). The four CONSTRAINT
 * refusals are NOT ignorable facts — a null here was a silent success (the save
 * answered ok, the locator was never written, only a server console line said
 * why), which is the exact "silently narrowed scope" CLAUDE.md forbids. They
 * are THROWN as the registered errors below, so the save transaction rolls
 * back and the API answers a named refusal (`relation.insert_refused` 400 for
 * off_target / term_not_selectable / selection_limit; the generic
 * `perm.denied` 403 for target_not_readable — a refusal must not describe what
 * the actor may not reach, the same posture the picker read takes).
 * Callers wanting per-locator verdicts WITHOUT a throw use the batch door.
 */
export async function validateRelationInsert(
	rawValue: Record<string, unknown>,
	context: RelationInsertContext,
): Promise<Record<string, unknown> | null> {
	const { outcomes } = await validateRelationInserts([rawValue], context);
	const outcome = outcomes[0];
	if (outcome === undefined || outcome.status === 'refused') {
		if (outcome?.code !== undefined && !PHP_ERA_DROPS.has(outcome.code)) {
			throw refusalToError(outcome, context);
		}
		return null;
	}
	return outcome.value ?? null;
}

/**
 * The typed error a constraint refusal becomes at the length-1 door. Kept
 * beside the door so the code→error mapping has ONE home; the reason string is
 * the LOG message (Error.message), never the wire — the wire carries the
 * registry message + the whitelisted details.
 */
function refusalToError(
	outcome: RelationInsertOutcome,
	context: RelationInsertContext,
): DedaloError {
	const targetSectionTipo = String(outcome.locator.section_tipo ?? '');
	const message = `validateRelationInsert: refused (${String(outcome.code)}) ${context.componentTipo} @ ${context.hostSectionTipo}/${String(context.hostSectionId)} — ${String(outcome.reason)}`;
	// LOG-ONLY coordinates: the host id rides as-is (int canonical,
	// WC-2026-08-10-section-id-int-canonical — never String()-minted).
	const coordinates = {
		tipo: context.componentTipo,
		section_tipo: context.hostSectionTipo,
		section_id: context.hostSectionId,
	};
	if (outcome.code === 'target_not_readable') {
		return new DedaloError('perm.denied', { message, coordinates });
	}
	return new DedaloError('relation.insert_refused', {
		message,
		coordinates,
		details: { constraint: String(outcome.code), section_tipo: targetSectionTipo },
	});
}

/** The caller context both insert doors share. */
export interface RelationInsertContext {
	componentTipo: string;
	model: string;
	hostSectionTipo: string;
	hostSectionId: number | string;
	translatable: boolean;
	lang: string;
	/**
	 * The locators the component ALREADY holds in the scope of this save — the
	 * dedup set, and the baseline the selection cap counts from. For a dataframe
	 * save this is the CALLER's frame subset (save_component narrows it with
	 * filterCallerEntries), which is deliberate: the caller's frames are what the
	 * dedup, the client's own counter and the cap all reason about.
	 */
	existingItems: unknown[];
	/**
	 * The locators the component held BEFORE this save — the RE-PERSIST
	 * baseline, and it is a data-integrity control, not an optimisation.
	 *
	 * A `set_data` replays the WHOLE stored array through this door (the CSV
	 * import and the raw-export round trip both do exactly that). The
	 * constraint gates police GROWTH: a locator that is merely being written
	 * back must never be re-judged, because the facts they test are not
	 * stable over a record's life — a target hierarchy can be deactivated, a
	 * principal can lack read on a section a colleague linked years ago, a
	 * term's `is_indexable` flag can be cleared. Re-judging on an unrelated
	 * save turns any of those into SILENT DELETION of stored heritage data,
	 * with the save still reporting success. Refusing a new pick is a
	 * refusal; dropping a stored link is data loss.
	 *
	 * Absent (undefined) on the doors that only ever add — insert/update —
	 * where every value IS net-new and the baseline would be noise.
	 */
	storedItems?: unknown[];
	/**
	 * The ACTOR the read-grant gate judges — threaded EXPLICITLY by the caller
	 * that holds the request principal (save_component, from dispatch / the
	 * MCP write tools). `undefined` = not threaded: the door falls back to the
	 * request-context ALS, which is the documented BACKSTOP for the leaf callers
	 * that reach saveComponentData without a principal in hand (listed on
	 * `SaveRequest.principal`), never the primary channel. A write-validation
	 * path must not depend on ambient state it cannot see was set.
	 */
	principal?: Principal;
	/**
	 * Frame pairing context — present ONLY for a component_dataframe save.
	 * Switches on the two dataframe particularities: the persisted-frame
	 * normalizer (forced dd490 + server-authoritative pairing fields) and
	 * the test_equal_properties dedup key.
	 */
	pairing?: DataframePairing | null;
}

/**
 * WHY an insert was refused — a machine-readable code beside the human reason,
 * so the picker can title a refused chip with a repo-owned catalog label
 * instead of re-parsing English (labels are the picker's own step; this is the
 * key it maps on).
 *
 * The first three are the PHP-era drops this door has always made silently
 * (validate_data_element returning false); the last four are the constraint
 * refusals PHP never made.
 */
export type RelationInsertRefusalCode =
	| 'bad_form'
	| 'autoreference'
	| 'duplicate'
	| 'off_target'
	| 'target_not_readable'
	| 'term_not_selectable'
	| 'selection_limit';

/** The drops that predate the constraint gates — see validateRelationInsert. */
const PHP_ERA_DROPS: ReadonlySet<RelationInsertRefusalCode> = new Set<RelationInsertRefusalCode>([
	'bad_form',
	'autoreference',
	'duplicate',
]);

/** One locator's answer. `value` (the normalized locator) rides an acceptance. */
export interface RelationInsertOutcome {
	/** The locator AS SENT — so a refusal names the entry the client can see. */
	locator: Record<string, unknown>;
	status: 'accepted' | 'refused';
	value?: Record<string, unknown>;
	code?: RelationInsertRefusalCode;
	reason?: string;
}

export interface RelationInsertBatchResult {
	/** One entry per submitted locator, in submission order. Never shorter. */
	outcomes: RelationInsertOutcome[];
	/**
	 * The size of the resulting row set — `existingItems` plus the accepted
	 * locators. Server-authoritative, exactly as the single-locator path's
	 * pagination total already is (component_portal reads it as the truth about
	 * what landed, which is what makes the client's duplicate check work).
	 */
	total: number;
}

/**
 * THE RELATION INSERT CHOKEPOINT — an ARRAY in, a per-locator outcome out.
 *
 * A single locator is the length-1 case (`validateRelationInsert` above is
 * exactly that call), so no existing caller changes shape. The array form
 * exists because three of the checks below are properties of the SET, not of
 * one locator: N picks each individually under `data_limit` collectively break
 * it, and a batch validated one-request-at-a-time cannot see that. Evaluating
 * the whole array here — inside the caller's transaction, against a row set
 * that grows as entries are accepted — is what makes the cap an invariant
 * rather than a race.
 *
 * A PARTIALLY REFUSED BATCH IS NOT AN ERROR. The accepted locators are returned
 * for the caller to persist and the refused ones are NAMED, per entry. Dropping
 * an entry with no outcome row would be a silent scope narrowing; refusing the
 * whole batch because one term was off-target would throw away a curator's
 * other nine picks.
 *
 * FOUR CONSTRAINTS, ALL SERVER-RESOLVED (picker plan §2). None of them reads
 * anything the request carries — the caller ddo names itself and
 * `relations/picker_constraint.ts` derives the rest, which is the SAME resolver
 * the picker read calls for its affordances. Two call sites, one answer: a
 * stale or forged client cap changes nothing here.
 *
 *  1. TARGET — the locator's section must be one the caller declares (virtual
 *     resolved on both sides, `isTargetAllowed`). A caller that declares NO
 *     target is exempt, and that exemption is the `reason` on the branch, not a
 *     silent pass.
 *  2. READ GRANT — an operator must not persist a locator into a section they
 *     cannot see. Scoped to TREE-PICKER callers (the write twin of the picker
 *     read's pruning) and FAIL-CLOSED there; every other caller is authorized
 *     by the caller grant dispatch enforced (see gate 2).
 *  3. SELECTABILITY — the term's own answer (`isTermSelectable`). The tree
 *     renders it, but a rendered affordance is not an authorization, so it is
 *     re-asked here. Scoped honestly: a target section that declares no
 *     `is_indexable` component has no selectability contract at all.
 *  4. THE SELECTION CAP — `properties.data_limit`, re-resolved server-side.
 *
 * The constraint is resolved ONCE for the whole batch: it is a property of the
 * caller ddo and the host record, neither of which varies across the array.
 */
export async function validateRelationInserts(
	rawValues: Record<string, unknown>[],
	context: RelationInsertContext,
): Promise<RelationInsertBatchResult> {
	const outcomes: RelationInsertOutcome[] = [];
	if (rawValues.length === 0) {
		return { outcomes, total: context.existingItems.length };
	}

	// Resolved LAZILY, on the first locator that actually needs judging, and
	// then reused for the rest of the call. It is a property of the caller ddo
	// and the host record, so it cannot vary across the array.
	//
	// WHY LAZY. The length-1 door is what production uses, so a `set_data` of N
	// locators enters here N times; resolving eagerly cost N `readMatrixRecord`s
	// of the same (growing) host row inside the caller's row lock — O(N^2) bytes
	// read on exactly the door a CSV import drives hardest. A re-persist needs no
	// constraint at all (every value is already stored), so the common bulk path
	// now resolves it ZERO times.
	let constraint: PickerConstraint | null = null;
	const constraintFor = async (): Promise<PickerConstraint> => {
		constraint ??= await resolvePickerConstraint(
			context.componentTipo,
			context.hostSectionTipo,
			context.hostSectionId,
			// The cap scope: for a frame the constraint counts the main item's
			// frames (`held`), the same scope resultingCountInCapScope uses.
			context.pairing ?? null,
		);
		return constraint;
	};
	// The actor: the principal the caller THREADED, else the request-context ALS
	// as the documented backstop (read per call, never captured at module
	// level). It is resolved once for the batch and handed to the read-grant
	// gate, which is FAIL-CLOSED inside its scope: no actor there is a refusal,
	// not an exemption — see refuseByPickerConstraint gate 2.
	const actor = context.principal ?? (await ambientPrincipal());

	const accepted: Record<string, unknown>[] = [];
	for (const rawValue of rawValues) {
		const normalized = await normalizeRelationInsert(rawValue, context, accepted);
		if (normalized.value === undefined) {
			outcomes.push({
				locator: rawValue,
				status: 'refused',
				code: normalized.code,
				reason: normalized.reason,
			});
			continue;
		}
		// RE-PERSIST short-circuit, before the constraint is even resolved: a
		// locator the component already holds is being written back, not
		// introduced, and none of the gates apply to it (see
		// refuseByPickerConstraint gate 0 for the full reasoning).
		if (isAlreadyStored(normalized.value, context)) {
			accepted.push(normalized.value);
			outcomes.push({ locator: rawValue, status: 'accepted', value: normalized.value });
			continue;
		}
		const refusal = await refuseByPickerConstraint(
			normalized.value,
			context,
			await constraintFor(),
			actor,
			// The size the CAP SCOPE would reach if this locator lands: the
			// component's own baseline for THIS save plus everything accepted
			// before it in the batch, narrowed to the scope the cap is declared
			// in (the slot, or the main item for a frame). On an `update` the
			// caller's baseline excludes the item being rewritten, so this lands
			// back on the same count — an update never grows the set and never
			// trips the cap.
			resultingCountInCapScope([...context.existingItems, ...accepted], context),
		);
		if (refusal !== null) {
			outcomes.push({ locator: rawValue, status: 'refused', ...refusal });
			continue;
		}
		accepted.push(normalized.value);
		outcomes.push({ locator: rawValue, status: 'accepted', value: normalized.value });
	}

	return { outcomes, total: context.existingItems.length + accepted.length };
}

/**
 * PHP validate_data_element proper — normalization + the three drops that
 * predate the constraint gates. Byte-identical to what this module has always
 * done; the split exists so the batch door can run the set-scoped constraints
 * AFTER the dedup, on the row set that actually results.
 *
 * `batchAccepted` are the locators accepted EARLIER IN THE SAME BATCH: they are
 * part of the dedup scope (PHP resets its lookup map once per set_data call,
 * not once per element), so two identical picks in one submission collapse into
 * one exactly as two successive single saves would.
 */
async function normalizeRelationInsert(
	rawValue: Record<string, unknown>,
	context: RelationInsertContext,
	batchAccepted: readonly Record<string, unknown>[],
): Promise<{ value?: Record<string, unknown>; code?: RelationInsertRefusalCode; reason?: string }> {
	const existingItems =
		batchAccepted.length === 0
			? context.existingItems
			: [...context.existingItems, ...batchAccepted];
	const value: Record<string, unknown> = { ...rawValue };
	if (
		value.section_id === undefined ||
		value.section_id === null ||
		value.section_tipo === undefined ||
		value.section_tipo === null
	) {
		// bad-formed locator — ignored
		return { code: 'bad_form', reason: 'the locator carries no section_tipo + section_id' };
	}
	if (
		compareLocators(
			value as never,
			{ section_tipo: context.hostSectionTipo, section_id: context.hostSectionId } as never,
			['section_tipo', 'section_id'],
		)
	) {
		// autoreference — avoid the infinite loop (locator law: loose section_id)
		return { code: 'autoreference', reason: 'a record cannot link to itself' };
	}
	if (value.type === undefined || value.type === null || value.type === '') {
		value.type = await getRelationTypeByTipo(context.componentTipo);
	}
	if (context.model === 'component_relation_related' && value.type_rel === undefined) {
		const { getNode } = await import('../ontology/resolver.ts');
		const { getRelationTypeRel } = await import('./related.ts');
		value.type_rel = getRelationTypeRel((await getNode(context.componentTipo))?.properties ?? null);
	}
	value.from_component_tipo = context.componentTipo;
	if (context.translatable) {
		value.lang = context.lang;
	}
	// biome-ignore lint/performance/noDelete: PHP unset — paginated_key must be ABSENT in persisted data
	delete value.paginated_key;
	// Canonical stored address (WC-2026-08-10-section-id-int-canonical): int for
	// a record, verbatim for an external remote id. Never Number() blindly.
	value.section_id = canonicalizeStoredSectionId(value.section_id);

	// DATAFRAME normalization + dedup. The pairing fields are stamped from the
	// SERVER's caller context (overriding whatever the client sent for `type`,
	// `id_key` and `main_component_tipo`), and identity is compared over
	// test_equal_properties — which includes id_key, so the same target record
	// may legitimately be framed from two different main items, while the SAME
	// frame twice is dropped.
	if (context.pairing !== undefined && context.pairing !== null) {
		const normalized = normalizeDataframeEntry(value, context.pairing);
		for (const item of existingItems) {
			if (dataframeEntriesEqual(item, normalized)) {
				// already framed — ignored
				return { code: 'duplicate', reason: 'this record is already framed from that item' };
			}
		}
		return { value: normalized };
	}

	/**
	 * A frame arriving with NO caller pairing — import, and every maintenance
	 * door — is STILL a frame, and frame identity is still id_key-scoped.
	 *
	 * WC-2026-08-09-dataframe-import-id-key-identity. Without this arm the entry
	 * fell to the generic relation dedup below, whose key is
	 * [section_id, section_tipo, type, tag_id] — `id_key` is absent from it, so
	 * two frames pointing at the SAME target record from DIFFERENT main items
	 * hashed identically and the second was silently dropped as "already
	 * linked". That is the precise mistake `dataframeEntriesEqual`'s own header
	 * warns against; it was simply unreachable when `pairing` was null, which is
	 * exactly the case on every CSV import (`dataframePairingOf` needs a caller
	 * ddo, and an import has none).
	 *
	 * Nothing is normalized here: with no caller context there is nothing
	 * authoritative to stamp, so the entry's OWN `id_key`/`main_component_tipo`
	 * — carried in the file, written by the export — are the identity. That is
	 * what makes a raw export round trip.
	 */
	if (isDataframeEntry(value)) {
		for (const item of existingItems) {
			if (dataframeEntriesEqual(item, value)) {
				// the same frame twice — ignored
				return { code: 'duplicate', reason: 'the same frame is already stored' };
			}
		}
		return { value };
	}

	// Duplicate rejection (hash-key equality like PHP build_locator_lookup_key;
	// String() casts give the loose section_id the locator law requires).
	const props = context.translatable
		? ['section_id', 'section_tipo', 'type', 'tag_id', 'lang']
		: ['section_id', 'section_tipo', 'type', 'tag_id'];
	const lookupKey = (item: unknown): string =>
		props
			.map((prop) => {
				const raw = (item as Record<string, unknown> | null)?.[prop];
				return raw === undefined || raw === null ? '' : String(raw);
			})
			.join('|');
	const valueKey = lookupKey(value);
	for (const item of existingItems) {
		if (lookupKey(item) === valueKey) {
			// already linked — ignored
			return { code: 'duplicate', reason: 'that record is already linked here' };
		}
	}
	return { value };
}

/**
 * THE FOUR CONSTRAINT GATES (picker plan §2.1-§2.3) — run on the NORMALIZED
 * locator, AFTER the dedup, so a duplicate is dropped exactly as it always was
 * and never counts against the cap. Returns the named refusal, or null to
 * accept.
 *
 * Every answer comes from `relations/picker_constraint.ts`, the resolver the
 * picker READ also calls. That is the whole point: the affordance the tree
 * offers and the persistence this door grants are the same computation, so they
 * cannot drift into "the UI let me pick it and the save silently dropped it".
 */
async function refuseByPickerConstraint(
	value: Record<string, unknown>,
	context: RelationInsertContext,
	constraint: PickerConstraint,
	actor: Principal | undefined,
	resultingCount: number,
): Promise<{ code: RelationInsertRefusalCode; reason: string } | null> {
	const targetSectionTipo = String(value.section_tipo);

	// 0. RE-PERSIST. This locator is already stored: the save is writing it
	// back, not introducing it. EVERY gate below is skipped, because every one
	// of them tests a fact that can change under a record after the link was
	// legitimately made — the target hierarchy deactivated, the saving
	// principal's read grant, the term's `is_indexable` flag, the declared cap
	// lowered. Judging a stored locator against today's answer would delete
	// heritage data on an unrelated save and report success (a `set_data`
	// replays the whole array through here — that is the CSV-import and
	// raw-export round trip). Gate 3 already carried this reasoning for its own
	// case; it is the same argument for all four, so it is made once, here.
	//
	// The gates keep their full force on NET-NEW locators, which is what they
	// exist to police.
	if (isAlreadyStored(value, context)) {
		return null;
	}

	// 1. TARGET. `isTargetAllowed` resolves BOTH sides through
	// getSectionRealTipo, so a virtual target (rsc170) and its real section
	// (rsc2) name the same thing in either direction.
	//
	// DECLARED EXEMPTION — `constraint.targets` is empty. The caller declares no
	// target section at all (component_relation_children projections, callers
	// whose request_config resolves to nothing on this install), and "no
	// declaration" is not "nothing is permitted": there is simply no target
	// constraint to enforce. Stated here rather than left as a fallthrough,
	// because it is the one escape this gate has and it must stay visible.
	// isTargetAllowed owns that branch so the read path cannot re-decide it.
	if (!(await isTargetAllowed(constraint.targets, targetSectionTipo))) {
		return {
			code: 'off_target',
			reason:
				`'${targetSectionTipo}' is not a target of '${context.componentTipo}' ` +
				`(declared: ${constraint.targets.join(', ')})`,
		};
	}

	// 2. READ GRANT on the linked section — SCOPED TO TREE-PICKER CALLERS, the
	// same scope as gate 3(a), and for the same reason: it is the write twin of
	// the picker READ, which prunes the hierarchies a principal holds no grant
	// on (area/read.ts, the 403 branch). Everywhere else the read model is the
	// OPPOSITE: a value reached THROUGH an authorized caller is floored to read
	// (`permissions.inheritSubdatumPermission` — the portal's resolved values,
	// the autocomplete's picks, the component_filter's project datalist are all
	// rendered from targets the actor may hold 0 on). Authorization there IS the
	// caller grant, which dispatch already enforced (>= 2 on componentTipo)
	// before this door was reached. Judging the target section here for those
	// callers refused every non-admin's own project pick (component_filter →
	// dd153: level 2 on the filter, 0 on the section, and the datalist was built
	// from THEIR OWN authorized projects) — a rule the read side never had.
	//
	// FAIL-CLOSED inside the scope: no actor (a picker caller written with no
	// principal threaded AND no request scope) is a refusal, never a skip. A
	// write-authorization gate that answers "allowed" because it could not see
	// who was asking is not a gate. The doors that legitimately run credless
	// (import, maintenance) re-persist through `storedItems` (gate 0) and are
	// unaffected; a NET-NEW pick into a tree picker with no actor is refused.
	if (await callerDeclaresTreePicker(context.componentTipo)) {
		if (actor === undefined) {
			return {
				code: 'target_not_readable',
				reason: `no principal to judge the read grant on the linked section '${targetSectionTipo}' (write refused fail-closed)`,
			};
		}
		const { getSectionPermissions } = await import('../security/permissions.ts');
		if ((await getSectionPermissions(actor, targetSectionTipo)) < 1) {
			return {
				code: 'target_not_readable',
				// Names the SECTION, never the record: the actor already named the
				// section in the payload, so nothing is disclosed by repeating it.
				reason: `no read grant on the linked section '${targetSectionTipo}'`,
			};
		}
	}

	// 3. SELECTABILITY — the term's own answer, re-asked because a rendered
	// affordance is not an authorization (picker plan §2a).
	//
	// TWO DECLARED EXEMPTIONS, both derived on the SERVER (no client assertion
	// selects a code path here), because the plan scopes this gate to "inserts
	// arriving from a thesaurus-target picker" and both halves of that phrase
	// have to be true:
	//
	//  a. THE CALLER IS NOT A TREE PICKER. Relation-mode selectability is the
	//     tree's rule: the caller declares `properties.view: 'tree'` and the
	//     picker renders per-term affordances from `isIndexable`. An ordinary
	//     portal or autocomplete linking into the same thesaurus has NEVER
	//     consulted the flag — tool_indexation's tree was the only surface that
	//     did — so enforcing it there would not tighten an existing rule, it
	//     would invent one. And it would be destructive rather than strict: a
	//     `set_data` re-persists the WHOLE array through this door, so any
	//     stored term predating its section's `is_indexable` flag would be
	//     dropped from the save. Refusing a new pick is a refusal; deleting
	//     stored links on an unrelated save is data loss, and the premise
	//     reserves conservatism for exactly that.
	//  b. THE TARGET DECLARES NO CONTRACT. The section_map names the component
	//     carrying the flag; a target with no such declaration has no rule to
	//     check, and `isTermSelectable` cannot tell "no contract" from "not
	//     selectable" (false for both), so the scope is decided BEFORE asking.
	//     Reading section_map here is the exemption's SCOPE, never a second
	//     copy of the rule — the rule stays in ts_object.isIndexable, behind
	//     isTermSelectable.
	if (
		(await callerDeclaresTreePicker(context.componentTipo)) &&
		(await targetDeclaresSelectability(targetSectionTipo))
	) {
		const targetSectionId = Math.trunc(Number(value.section_id));
		if (!Number.isFinite(targetSectionId)) {
			return {
				code: 'term_not_selectable',
				reason: `'${targetSectionTipo}' declares selectable terms, but '${String(value.section_id)}' is not a record address`,
			};
		}
		if (!(await isTermSelectable(targetSectionTipo, targetSectionId))) {
			return {
				code: 'term_not_selectable',
				reason: `the term ${targetSectionTipo}/${targetSectionId} is not marked selectable in its thesaurus`,
			};
		}
	}

	// 4. THE SELECTION CAP — `properties.data_limit`, re-resolved server-side
	// and never read off the request. Enforced on the RESULTING row set inside
	// the caller's transaction, so N concurrent picks each individually under
	// the limit cannot collectively exceed it.
	//
	// THE SECOND CLAUSE IS NOT SLACK. A save is refused only when it would
	// leave the component holding more than its limit AND MORE THAN IT ALREADY
	// HELD. Live components exist over their declared cap (dd560 declares
	// data_limit 1 and holds 5 frames), and a bare `> limit` test would lock
	// their operators out of editing what is already there — a data-integrity
	// hazard, not a stricter rule. What the cap forbids is GROWTH past the
	// limit; an over-capacity component can be edited and shrunk, never grown.
	//
	// THE COUNT IS PER CAP SCOPE, NOT PER SLOT. `data_limit` on a dataframe is
	// declared per MAIN ITEM — one slot tipo stores the frames of every item of
	// the main component on the record (filterCallerEntries is the read twin of
	// this). Counting the slot would make a `data_limit:1` frame slot accept the
	// first item's frame and refuse every sibling item's, which on a whole-array
	// re-import silently truncates the record. The caller computes the scoped
	// count and hands it in; this gate only compares.
	//
	// BOTH SIDES IN THE SAME SCOPE. `held` (selection_limit − remaining) is
	// what the constraint counted as already stored, and the constraint was
	// resolved WITH the caller's pairing (validateRelationInserts hands it to
	// resolvePickerConstraint), so for a frame it counts the main item's frames,
	// not the slot's. A slot-wide `held` against a per-item `resultingCount`
	// let a `data_limit:1` slot grow item A to two frames as long as the OTHER
	// items' frames outnumbered two — the growth clause never fired.
	if (constraint.selection_limit !== null && constraint.remaining !== null) {
		const held = constraint.selection_limit - constraint.remaining;
		if (resultingCount > constraint.selection_limit && resultingCount > held) {
			return {
				code: 'selection_limit',
				reason: `'${context.componentTipo}' accepts at most ${constraint.selection_limit} linked record(s)`,
			};
		}
	}

	return null;
}

/**
 * How many rows would the CAP SCOPE hold if this locator lands?
 *
 * The scope is the slot for an ordinary relation component, and the MAIN ITEM
 * for a dataframe frame — because that is the unit `data_limit` is declared in
 * (one slot tipo carries the frames of every main item on the record). Counting
 * the slot for a frame turns a `data_limit:1` label slot into "one frame per
 * RECORD" instead of "one frame per item", which silently truncates any
 * whole-array re-persist of a multi-item record.
 *
 * @param baseline items already in the set for this save (stored or accepted).
 * @param context  carries the pairing that defines the scope, when there is one.
 */
function resultingCountInCapScope(
	baseline: readonly unknown[],
	context: RelationInsertContext,
): number {
	// One scope predicate — `picker_constraint.inCapScope` — so the count the
	// resolver makes for `held` and the count made here for `resulting` are
	// the SAME filter, never two.
	return inCapScope(baseline, context.pairing ?? null).length + 1;
}

/**
 * Is this locator ALREADY STORED on the component — i.e. is this save writing
 * it back rather than introducing it?
 *
 * Compared on the ADDRESS ONLY (`section_tipo` + `section_id`), deliberately.
 * A re-persist legitimately rewrites the mutable fields of a stored link — the
 * server re-derives `type`, `from_component_tipo`, and for a frame the whole
 * pairing block — so a full-shape equality would answer "new" for a locator
 * that is plainly the same link, and hand it back to the gates this exists to
 * keep it away from. Identity here is "does the component already point at this
 * record"; the dedup key (which DOES include `type` and `tag_id`) is a
 * different question, asked by `normalizeRelationInsert`, and stays untouched.
 *
 * A frame additionally has to match its MAIN ITEM: one slot tipo stores frames
 * for every item of the main component, so "already stored" for a frame means
 * "already stored against this same main item".
 */
function isAlreadyStored(value: Record<string, unknown>, context: RelationInsertContext): boolean {
	const stored = context.storedItems;
	if (stored === undefined || stored.length === 0) return false;

	// The ADDRESS is compared through `compareLocators` — the locator equality
	// law (concepts/locator.ts): section_id LOOSE-NUMERIC (a stored '05' IS the
	// same record as 5, and int-vs-string is the ordinary pre-sweep case), the
	// tipo strict. NOT `isLocatorInArray`: that is KEY-STRING equality
	// (buildLocatorLookupKey stringifies, so '05' ≠ '5'), which would read such a
	// re-persist as net-new and hand it to the gates this function exists to
	// keep it away from. A frame additionally has to match its MAIN ITEM,
	// compared the way `dataframeEntriesEqual` compares the pairing fields —
	// String()-loose, because `id_key` is stamped as an int by the normalizer
	// but a PHP-era or imported frame may carry it as a string.
	const pairing = context.pairing ?? null;
	return stored.some((item) => {
		if (item === null || typeof item !== 'object') return false;
		const candidate = item as Record<string, unknown>;
		if (!compareLocators(value as never, candidate as never, ['section_tipo', 'section_id'])) {
			return false;
		}
		if (pairing === null) return true;
		return (
			String(candidate.main_component_tipo) === String(value.main_component_tipo) &&
			String(candidate.id_key) === String(value.id_key)
		);
	});
}

/**
 * The request-context principal, read per call — the BACKSTOP behind
 * `RelationInsertContext.principal`, never the primary channel.
 */
async function ambientPrincipal(): Promise<Principal | undefined> {
	const { currentPrincipal } = await import('../security/request_context.ts');
	return currentPrincipal();
}

/**
 * Is this caller a TREE PICKER? The SCOPE of gate 3's exemption (a), and only
 * that.
 *
 * The caller's own ontology `properties.view` — the same declaration the read
 * path resolves into `context.view === 'tree'` to grant picker mode, so the
 * write path's scope is derived from the identical fact and no client string
 * chooses it. A ddo_map-level `view` is deliberately NOT consulted: it is a
 * per-caller-context display choice that this door has no caller context for,
 * and guessing one would be the second, unvalidatable authority the picker
 * design exists to remove.
 */
async function callerDeclaresTreePicker(componentTipo: string): Promise<boolean> {
	const { getNode } = await import('../ontology/resolver.ts');
	return (
		((await getNode(componentTipo))?.properties as { view?: unknown } | null | undefined)?.view ===
		'tree'
	);
}

/**
 * Does this target section declare a per-term selectability contract? The SCOPE
 * of gate 3's exemption (b), and only that.
 *
 * The predicate itself lives in ontology/section_map.ts and is SHARED with
 * section/read.ts, which stamps the same answer on list rows so the picker's
 * affordance and this gate cannot disagree — ledger:
 * WC-2026-08-17-list-row-selectability-declared. It used to be a private copy
 * here; two copies of a gate predicate is how the arrow went missing on rows
 * this gate was already exempting.
 */
async function targetDeclaresSelectability(sectionTipo: string): Promise<boolean> {
	const { declaresTermSelectability } = await import('../ontology/section_map.ts');
	return await declaresTermSelectability(sectionTipo);
}

/**
 * The component's effective relation type (PHP component_relation_common
 * __construct :217-229): properties->config_relation->relation_type of the
 * component's OWN tipo, falling back to the concrete class default
 * (descriptor.defaultRelationType — PHP $default_relation_type). The
 * properties lookup MUST key on the tipo, not the normalized model: rsc860
 * normalizes component_autocomplete_hi → component_portal but its own
 * properties keep relation_type dd96 (the tool_indexation link type).
 */
export async function getRelationTypeByTipo(tipo: string): Promise<string> {
	const { getNode, getModelByTipo } = await import('../ontology/resolver.ts');
	const configured = (
		(await getNode(tipo))?.properties as {
			config_relation?: { relation_type?: unknown };
		} | null
	)?.config_relation?.relation_type;
	if (typeof configured === 'string' && configured !== '') return configured;
	const model = (await getModelByTipo(tipo)) ?? '';
	return getComponentModel(model)?.defaultRelationType ?? 'dd151';
}

/**
 * PHP trait.dataframe_common::remove_dataframe_data_by_id (:280-369) — the
 * server-authoritative cascade fired when ONE data item of a main component
 * is removed: every dataframe slot declared in the main's request_config
 * ddo_map loses the frame locators paired with that item (id_key contract),
 * sibling items' frames untouched.
 *
 * PHP-fidelity details (S1-05):
 * - The slot strip emits NO Time Machine row: PHP suppresses the slot's own
 *   TM entry (tm_record::$save_tm=false, REL-01) because the MAIN component's
 *   TM row captures the full state; a separate slot row would break TM
 *   restore ordering. The modified stamps are the caller's responsibility
 *   too (the main save/delete path refreshes them).
 * - get_dataframe_delete_policy(): default 'unlink' clears slot entries
 *   only; 'delete_target' additionally soft-deletes the unlinked frame
 *   TARGET records (collected BEFORE clearing, delete_data mode —
 *   recoverable from time machine; per-target failures log and continue).
 */
export async function removeDataframeDataById(
	table: string,
	sectionTipo: string,
	sectionId: number,
	mainComponentTipo: string,
	itemId: number,
	userId: number,
): Promise<void> {
	const { getNode, getModelByTipo } = await import('../ontology/resolver.ts');
	const node = await getNode(mainComponentTipo);
	if (node === undefined || node === null) return;

	// dataframe slots declared in the main's request_config (PHP
	// get_dataframe_ddo: ddo_map entries whose model is component_dataframe).
	const { buildRequestConfigForElement } = await import('./request_config/build.ts');
	const config = await buildRequestConfigForElement(node.properties ?? null, {
		ownerTipo: mainComponentTipo,
		ownerSectionTipo: sectionTipo,
		mode: 'edit',
		ownerIsSection: false,
	});
	const slotTipos: string[] = [];
	for (const item of config) {
		for (const ddo of item.show?.ddo_map ?? []) {
			if (typeof ddo.tipo !== 'string' || slotTipos.includes(ddo.tipo)) continue;
			if ((await getModelByTipo(ddo.tipo)) === 'component_dataframe') slotTipos.push(ddo.tipo);
		}
	}
	if (slotTipos.length === 0) return;

	// delete policy from the MAIN component's ontology properties
	// (properties->dataframe->delete_policy; anything else is 'unlink').
	const policy = (node.properties as { dataframe?: { delete_policy?: unknown } } | null)?.dataframe
		?.delete_policy;
	const deleteTarget = policy === 'delete_target';
	// KEPT UNION: targets are lifted from the RAW stored dataframe slot entries
	// (unswept legacy string ids), so the collected id keeps the stored form.
	const unlinkedTargets: { section_tipo: string; section_id: number | string }[] = [];

	const { updateMatrixKeyData } = await import('../db/matrix_write.ts');
	for (const slotTipo of slotTipos) {
		const rows = (await sql.unsafe(
			`SELECT relation->$1 AS items FROM "${table}" WHERE section_tipo = $2 AND section_id = $3`,
			[slotTipo, sectionTipo, sectionId],
		)) as { items: unknown }[];
		const slotItems = Array.isArray(rows[0]?.items)
			? (rows[0].items as Record<string, unknown>[])
			: [];
		if (slotItems.length === 0) continue;

		const kept: Record<string, unknown>[] = [];
		const removed: Record<string, unknown>[] = [];
		for (const entry of slotItems) {
			(dataframeEntryMatches(entry, mainComponentTipo, itemId, slotTipo) ? removed : kept).push(
				entry,
			);
		}
		if (removed.length === 0) continue; // nothing paired with this item

		if (deleteTarget) {
			for (const entry of removed) {
				const target = entry as { section_tipo?: unknown; section_id?: unknown };
				if (typeof target.section_tipo === 'string' && target.section_id !== undefined) {
					unlinkedTargets.push({
						section_tipo: target.section_tipo,
						section_id: target.section_id as number | string,
					});
				}
			}
		}
		// Slot write with NO TM row (see the contract note above): null value
		// removes the key, like PHP set_data(null)+save on an emptied slot.
		await updateMatrixKeyData(
			table,
			sectionTipo,
			sectionId,
			'relation',
			slotTipo,
			kept.length > 0 ? kept : null,
		);
	}

	// delete_target policy: soft-delete the unlinked frame target records
	// (PHP sections::delete delete_mode 'delete_data' — recoverable).
	if (deleteTarget && unlinkedTargets.length > 0) {
		const { deleteSectionData } = await import('../section/record/delete_record.ts');
		for (const target of unlinkedTargets) {
			try {
				await deleteSectionData(target.section_tipo, Number(target.section_id), userId);
			} catch (error) {
				// PHP logs per-target soft-delete failures and continues.
				console.error(
					`removeDataframeDataById: delete_target soft-delete failed for ${target.section_tipo}/${String(target.section_id)}:`,
					error,
				);
			}
		}
	}
}

/**
 * What {@link deletePortalLocator} ANSWERS with. Not a wire envelope: a refusal
 * is a THROW, so `removed` is always a real count (0 = nothing matched).
 */
export interface PortalLocatorRemoval {
	/** How many stored locators the call removed. */
	removed: number;
	/** The operator narrative the panel prints (PHP `msg`, one line per outcome). */
	msg: string[];
}

/**
 * dd_component_portal_api.delete_locator (PHP): remove every stored locator
 * matching the given partial locator on ar_properties via
 * locator::compare_locators (empty ar_properties → full property-UNION strict
 * compare, property_exists semantics, section_id-only loose match,
 * paginated_key always excluded). A missing locator.type auto-sets to the
 * component's relation type; a MISMATCHED type aborts (PHP
 * remove_locator_from_data guard). Each removed locator cascades its paired
 * dataframe slot entries (remove_dataframe_data_by_id, S1-05). ANSWERS with a
 * `PortalLocatorRemoval` payload (never a wire envelope) and REFUSES by
 * THROWING — a missing address is `request.invalid_options`, a caller below
 * level 2 is `perm.denied` (ERRORS_SPEC §4).
 */
export async function deletePortalLocator(
	// `isDeveloper` is optional so an existing caller that only knows the
	// identity + admin flag still type-checks; it is only consulted for the
	// maintenance AREA gate, which no portal section can ever be, and a caller
	// that omits it is asserting "not a developer".
	principal: Omit<Principal, 'isDeveloper'> & Partial<Pick<Principal, 'isDeveloper'>>,
	// KEPT UNION: `source` is the RQO body of dd_component_portal_api
	// .delete_locator, an uncoerced wire door — legacy clients still post the
	// string form. Consumed numerically (Number()) for the row address only.
	source: { tipo?: string; section_tipo?: string; section_id?: string | number },
	options: { locator?: Record<string, unknown>; ar_properties?: string[] },
): Promise<PortalLocatorRemoval> {
	const msg: string[] = [];
	const tipo = source.tipo ?? '';
	const sectionTipo = source.section_tipo ?? '';
	const sectionId = source.section_id;
	const locator = options.locator;
	if (
		tipo === '' ||
		sectionTipo === '' ||
		sectionId === undefined ||
		sectionId === null ||
		locator === undefined ||
		locator === null ||
		typeof locator !== 'object'
	) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'Missing required source/options (section_tipo, tipo, section_id, locator)',
			coordinates: { section_tipo: sectionTipo, tipo },
		});
	}
	// SEC: write permission — PHP dd_component_portal_api::delete_locator runs
	// `security::assert_section_permission($section_tipo, 2)`, i.e. the LEVEL-2
	// matrix gate, not an admin flag. Gating on isGlobalAdmin (the old v0
	// stand-in) half-completed the tool_indexation "delete index" for every
	// ordinary cataloguer: the client had already stripped the transcription
	// tags in every language before calling this, so the refusal left the
	// rsc860 locator behind as an orphan (audit §5.4). getSectionPermissions is
	// the section-level twin of PHP common::get_permissions(tipo, tipo) — it
	// additionally caps consultation-only sections at read, which is exactly
	// right for a removal.
	const { getSectionPermissions } = await import('../security/permissions.ts');
	const actor: Principal = { isDeveloper: false, ...principal };
	if ((await getSectionPermissions(actor, sectionTipo)) < 2) {
		throw new DedaloError('perm.denied', {
			coordinates: { section_tipo: sectionTipo, tipo, required_level: 2 },
		});
	}

	const { getMatrixTableFromTipo, getModelByTipo, getColumnNameByModel } = await import(
		'../ontology/resolver.ts'
	);
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const { updateMatrixKeyData } = await import('../db/matrix_write.ts');
	const model = (await getModelByTipo(tipo)) ?? '';
	const column = getColumnNameByModel(model) ?? 'relation';
	const table = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';

	// Empty/omitted ar_properties passes through as [] — PHP's API layer never
	// substitutes the method's 4-field default here, so compare_locators runs
	// its full property-UNION strict compare (substituting the default
	// over-deletes: a second locator to the same target with a different
	// tag_id would be destroyed).
	const properties = Array.isArray(options.ar_properties) ? options.ar_properties : [];

	// W11 (2026-08-02, observer-cascade prerequisite): the read → JS filter →
	// whole-key replace below was an UNLOCKED read-modify-write on the pooled
	// connection — two concurrent removals on the same record each read the
	// full bag, each wrote its own filtered copy, and the second COMMIT undid
	// the first removal (lost update); any cascade wired through this door
	// would then propagate from a bag state that never existed. The whole RMW
	// (+ the dataframe cascade + the TM audit row) now runs in ONE transaction
	// with the row locked FOR UPDATE before the read, so concurrent removals
	// serialize and the write+audit commit atomically. The post-commit fan-out
	// (save event, permission caches, observers) stays OUTSIDE the transaction
	// — observers must see committed state and may never run in an ambient tx
	// (B6, see observers.ts runObserverCascadeHop).
	const outcome = await withTransaction(async () => {
		// Row lock first — the identifier is the allowlist-validated matrix
		// table; both values are bound. ZERO-ROW GUARD (review 2026-08-02): a
		// FOR UPDATE that matches no row LOCKS NOTHING, and under READ COMMITTED
		// the readMatrixRecord below takes a FRESH snapshot — a record committed
		// between the two statements would then be read-modify-written with NO
		// lock, re-opening the W11 lost-update window. Never proceed past the
		// lock unless it actually returned (and therefore locked) the row; a
		// record that does not exist under the lock has no locators to remove —
		// byte-identical empty-data response.
		const lockedRows = (await sql.unsafe(
			`SELECT id FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
			[sectionTipo, Number(sectionId)],
		)) as { id: number }[];
		if (lockedRows.length === 0) {
			return {
				emptyData: true,
				typeMismatch: false,
				removed: 0,
				removedLocators: [] as Record<string, unknown>[],
			};
		}
		const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
		const items =
			((
				record?.columns[column as keyof typeof record.columns] as Record<string, unknown[]> | null
			)?.[tipo] as Record<string, unknown>[]) ?? [];
		if (items.length === 0) {
			return {
				emptyData: true,
				typeMismatch: false,
				removed: 0,
				removedLocators: [] as Record<string, unknown>[],
			};
		}

		// type guard (PHP remove_locator_from_data): default a missing type to the
		// component's OWN relation type (config_relation.relation_type of the tipo,
		// then the class default — rsc860 is dd96, not dd151); abort on mismatch.
		// PHP isset() treats null like absent, so null auto-sets too. Runs AFTER
		// the empty-data check (PHP order — the empty-data message wins).
		const compare = { ...locator };
		const relationType = await getRelationTypeByTipo(tipo);
		if (compare.type === undefined || compare.type === null) {
			compare.type = relationType;
		} else if (compare.type !== relationType) {
			return {
				emptyData: false,
				typeMismatch: true,
				removed: 0,
				removedLocators: [] as Record<string, unknown>[],
			};
		}

		const kept: Record<string, unknown>[] = [];
		const removedLocators: Record<string, unknown>[] = [];
		for (const item of items) {
			// PHP locator::compare_locators semantics: property present on exactly
			// one side → not equal; absent on both → skip; section_id loose, every
			// other property strict (stored tag_id '7' vs sent 7 does NOT match);
			// paginated_key always excluded (accidental saved-paginated_key guard).
			const equal = compareLocators(item as never, compare as never, properties, ['paginated_key']);
			if (equal) {
				removedLocators.push(item);
			} else {
				// PHP re-persists survivors through the locator class, which CASTS
				// tag_id to string — mirror the normalization.
				kept.push(
					item?.tag_id !== undefined && item.tag_id !== null
						? { ...item, tag_id: String(item.tag_id) }
						: item,
				);
			}
		}
		if (removedLocators.length > 0) {
			// Dataframe cascade (PHP remove_locator_from_data :1362): each removed
			// locator strips the frame entries paired with its item id (unified
			// id_key pairing). Pre-migration locators without an id have no id_key
			// to pair on — PHP skips them too.
			for (const removedLocator of removedLocators) {
				const itemId = removedLocator.id;
				if (itemId === undefined || itemId === null) continue;
				await removeDataframeDataById(
					table,
					sectionTipo,
					Number(sectionId),
					tipo,
					Math.trunc(Number(itemId)),
					principal.userId,
				);
			}
			await updateMatrixKeyData(table, sectionTipo, Number(sectionId), column, tipo, kept);
			await recordTimeMachine(
				{
					sectionTipo,
					sectionId: Number(sectionId),
					componentTipo: tipo,
					lang: 'lg-nolan',
					userId: principal.userId,
					data: kept,
				},
				dbTimestamp(),
			);
		}
		return {
			emptyData: false,
			typeMismatch: false,
			removed: removedLocators.length,
			removedLocators,
		};
	});

	if (outcome.emptyData) {
		msg.push(`No locators are removed (${model} - ${tipo}). The component data is empty`);
		return { removed: 0, msg };
	}
	if (outcome.typeMismatch) {
		msg.push(`No locators are removed (${model} - ${tipo})`);
		return { removed: 0, msg };
	}
	const removed = outcome.removed;
	if (removed > 0) {
		// Cache invalidation (Opus review 2026-07-10, C2): this door bypassed the
		// save chokepoint's event fan-out, so removing a SECURITY locator (dd244
		// admin flag, dd1725 profile, dd170 projects) left every security cache
		// stale until the TTL — a demoted admin kept admin for up to 300s. The
		// event channel + the targeted clear close all three caches at once.
		// Post-COMMIT (W11): fired after the transaction above settles, so a
		// concurrent request repopulating the cache reads the committed bag.
		{
			const { fireSaveEvent } = await import('../section_record/save_event.ts');
			const { invalidatePermissionsForWrite } = await import('../security/permissions.ts');
			await fireSaveEvent(sectionTipo);
			invalidatePermissionsForWrite(sectionTipo, tipo, Number(sectionId));
		}
		// Observer cascade (2026-07-24): this door bypasses saveComponentData,
		// so it fires propagation itself. This is a PURE REMOVAL door — the
		// removed locators name the records whose mirrors must recompute, and
		// nothing was saved. Until 2026-08-06 they rode the `saved` slot, which
		// happened to work only because the two sets were then handled
		// identically; ObservedChange makes the semantics explicit. The
		// recompute reads truth from matrix_relation_index, so the removal is
		// already reflected. Dynamic import: runtime-only relations→section
		// edge, no static SCC. Post-COMMIT (W11/B6): the recompute must read the
		// committed removal.
		{
			const { propagateToObservers } = await import('../section/record/observers.ts');
			await propagateToObservers(
				tipo,
				sectionTipo,
				Number(sectionId),
				{ saved: [], removed: outcome.removedLocators },
				principal.userId,
			);
		}
		msg.push(`Deleted ${removed} locators (${model} - ${tipo})`);
	} else {
		msg.push(`No locators are removed (${model} - ${tipo})`);
	}
	return { removed, msg };
}
