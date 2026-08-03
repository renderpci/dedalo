/**
 * CRITERION PATH READER — resolve a seed record's value at a criterion path.
 *
 * A criterion is an SQO `path` walked outward from the object section
 * (see ./types.ts). This module is the READ half of identification: given a
 * seed record and that path, it returns what the seed HOLDS there, in the
 * CriterionValue union. `./criteria.ts` then compiles that value plus the
 * criterion into the SQO leaf that finds everybody else holding the same thing.
 *
 * THE ONE RULE THIS FILE OBEYS: it must walk the path exactly the way the
 * SEARCH side walks it, because the two are the halves of one comparison. A
 * reader that disagrees with the matcher is worse than no reader — it produces
 * seeds that cannot find themselves. The hop semantics below are a deliberate,
 * line-by-line mirror of `search/conform.ts` buildJoinChain (:83-121):
 *
 *   - the HOP component of step `i` is `path[i-1].component_tipo` and the
 *     section it lands in is `path[i].section_tipo` (the join reads the
 *     PREVIOUS alias's relation key and joins the CURRENT step's table);
 *   - the hop key is the component's DATA tipo (`resolveDataTipo` — WC-020
 *     component_alias: an alias stores nothing under its own tipo);
 *   - the landing row is matched on the LOCATOR's own `section_tipo` +
 *     `section_id`, inside the table of `path[i].section_tipo` — NOT on
 *     `path[i].section_tipo` itself. A multi-target portal whose locator points
 *     at a sibling section sharing that matrix table therefore resolves here
 *     exactly as the SQL LEFT JOIN resolves it, and one pointing at a section
 *     in another table resolves to nothing on both sides;
 *   - every stored locator of a hop is followed (the LATERAL unnest fans out),
 *     so a coin with two Types yields the union of both Types' legends.
 *
 * The LEAF kind comes from the component's model, through the descriptor
 * registry (never a hardcoded model list): the 'relation' column is the
 * relation family, component_date is a range, the 'number' searchBuilder family
 * is numeric, everything else is text.
 *
 * DATES. component_date stores `{start, end}` dd_date OBJECTS in the `date`
 * column, never strings. The ordinal is the persisted virtual-calendar
 * `start.time` — the value `search/builders/builder_date.ts` compares against
 * (`@.start.time <op> …`), stamped on save by `media/file_date.ts`
 * addTimeToDateItem. We READ that stamp first and only recompute with
 * `ddDateToSeconds` when an item was never stamped, precisely to keep reader and
 * matcher on one scale: a stored stamp can be STALE relative to its own
 * year/month/day fields (test3/1 `test145` item 1 carries year 1628 with a
 * year-628 time), and recomputing there would make the record fail to match
 * ITSELF through the search engine. The staleness is a data-integrity question
 * for the save path, not something a reader may paper over.
 *
 * SAFETY. Never throws: an unresolvable path returns null. Refusals that mean
 * "this path is not walkable" (depth cap, non-relation hop, unknown component)
 * WARN before returning null — a silently narrowed read is the failure mode this
 * subsystem cannot afford. Depth is capped at MAX_PATH_HOPS and every
 * (section_tipo, section_id, component_tipo) triple is visited at most once, so
 * a self-referential ontology cannot spin here.
 *
 * REQUEST IDENTITY is a PARAMETER, never an ALS read: the language to resolve
 * values in is passed in (default: the install's main data lang), so this module
 * is callable from a background job with no request scope.
 */

import { config } from '../../config/config.ts';
import { getComponentModel, getSearchBuilderFamily } from '../components/registry.ts';
import { buildLocatorLookupKey, type Locator } from '../concepts/locator.ts';
import { type MatrixRecord, readMatrixRecord } from '../db/matrix.ts';
import { type DdDate, ddDateToSeconds } from '../media/file_date.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../ontology/resolver.ts';
import { resolveComponentValue } from '../resolve/component_data.ts';
import type { CriterionPathStep, CriterionValue, ValueLocator } from './types.ts';

/**
 * Maximum number of HOPS (relation steps) a criterion path may walk — a path of
 * N steps performs N-1 hops. Nine steps is already an absurd curatorial path;
 * the cap exists so a mis-authored profile cannot fan a read out across the
 * whole corpus.
 */
export const MAX_PATH_HOPS = 8;

/** The record a criterion path starts from. */
export interface PathReadSeed {
	sectionTipo: string;
	sectionId: number;
}

export interface PathReadOptions {
	/**
	 * Data language for value resolution (component_data's fallback chain still
	 * applies). Explicit, never read from the request ALS — identification also
	 * runs in background jobs.
	 */
	lang?: string;
	/** Locator-identity properties for de-duplication + the cycle guard. */
	readonly locatorKeyProperties?: readonly string[];
}

/**
 * The two locator fields identity is keyed on (the transient `id` is never one).
 * Exported because the MATCHER keys on the same fields: one locator-identity
 * rule for the whole subsystem, or the reader and the scorer disagree about
 * which links are "the same link".
 */
export const IDENTITY_LOCATOR_PROPERTIES: readonly string[] = ['section_tipo', 'section_id'];

/** One record in the walk's frontier. */
interface FrontierRecord {
	record: MatrixRecord;
	sectionTipo: string;
	sectionId: number;
}

/** A stored component_date item: sparse dd_date parts (PHP dd_date). */
interface StoredDateItem {
	start?: DdDate | null;
	end?: DdDate | null;
	period?: DdDate | null;
}

function warn(message: string): void {
	console.warn(`[identify/path_read] ${message}`);
}

/**
 * The ordinal seconds of one dd_date part. The persisted `time` stamp wins (it
 * IS the search key — see the module doc); an unstamped part is computed with
 * the engine's canonical virtual-calendar conversion. Null when the part
 * carries neither.
 */
function partSeconds(part: DdDate | null | undefined): number | null {
	if (part === null || part === undefined || typeof part !== 'object') return null;
	if (typeof part.time === 'number' && Number.isFinite(part.time)) return part.time;
	if (typeof part.year !== 'number') return null;
	return ddDateToSeconds(part);
}

/**
 * One stored date item → one ordinal range. Mode detection mirrors
 * media/file_date.ts addTimeToDateItem exactly (period wins, then start[/end],
 * then a bare dd_date at the item root); an item with no end is a POINT, so its
 * start closes it.
 */
function dateItemToRange(raw: unknown): { from: number; to: number } | null {
	if (raw === null || typeof raw !== 'object') return null;
	const item = raw as StoredDateItem;
	if (item.period !== undefined && item.period !== null) {
		const seconds = partSeconds(item.period);
		return seconds === null ? null : { from: seconds, to: seconds };
	}
	if (item.start !== undefined && item.start !== null) {
		const from = partSeconds(item.start);
		if (from === null) return null;
		const to = partSeconds(item.end) ?? from;
		return { from, to: Math.max(from, to) };
	}
	// A bare dd_date stored at the item root (the add_time root branch).
	const bare = partSeconds(raw as DdDate);
	return bare === null ? null : { from: bare, to: bare };
}

/** A stored item's numeric value (`{id, value}` — component_number's shape). */
function numberItemToValue(raw: unknown): number | null {
	const candidate =
		raw !== null && typeof raw === 'object' ? (raw as { value?: unknown }).value : raw;
	if (typeof candidate === 'number') return Number.isFinite(candidate) ? candidate : null;
	if (typeof candidate === 'string' && candidate.trim() !== '') {
		const parsed = Number(candidate.replace(',', '.'));
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/**
 * A stored item's text value. The FIELD is family-driven, because the matcher's
 * is: the string family compares `elem->>'value'`
 * (builders/builder_string.ts:212) while component_iri compares `elem->>'iri'`
 * (builders/builder_iri.ts:76-80, "structurally identical to the string family
 * but matches on the `iri` field"). Reading `.value` off an iri item would
 * produce an always-empty criterion against a perfectly searchable component.
 */
function textItemToValue(raw: unknown, field: 'value' | 'iri'): string | null {
	const candidate =
		raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>)[field] : raw;
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		return trimmed === '' ? null : trimmed;
	}
	if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
	return null;
}

/**
 * A stored item as a locator, with the TRANSIENT `id` dropped (types.ts
 * ValueLocator: "the transient `id` is never one" — it is a per-record item
 * counter, so keeping it would make two records' identical links look different
 * and would over-constrain the emitted containment leaf).
 */
function itemToLocator(raw: unknown): ValueLocator | null {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const { id: _transientId, ...rest } = raw as Record<string, unknown>;
	const sectionTipo = rest.section_tipo;
	const sectionId = rest.section_id;
	if (typeof sectionTipo !== 'string' || sectionTipo === '') return null;
	if (typeof sectionId !== 'number' && typeof sectionId !== 'string') return null;
	return rest as ValueLocator;
}

/** Resolved stored items of one component on one record (lang chain applied). */
async function readItems(
	record: MatrixRecord,
	componentTipo: string,
	model: string,
	lang: string,
): Promise<unknown[]> {
	const { value, fallbackValue } = await resolveComponentValue(record, componentTipo, model, lang);
	return value ?? fallbackValue ?? [];
}

/**
 * Record identity as a string key. Built through concepts/locator.ts rather than
 * by hand: the locator law owns section_id comparison (DEC-21), and its key form
 * is the one that treats a stored '05' and a 5 as the same record.
 */
function recordKey(sectionTipo: string, sectionId: number | string): string {
	return buildLocatorLookupKey(
		{ section_tipo: sectionTipo, section_id: sectionId } as Locator,
		IDENTITY_LOCATOR_PROPERTIES,
	);
}

/** The (section_tipo, section_id, component_tipo) triple that bounds the walk. */
function visitKey(sectionTipo: string, sectionId: number | string, componentTipo: string): string {
	return `${recordKey(sectionTipo, sectionId)}_${componentTipo}`;
}

/**
 * Walk `path` from `seed` to its LEAF component and return the leaf's values.
 *
 * Returns null — never throws — when the path cannot be resolved: an empty or
 * over-deep path, a missing record, a hop that is not a relation component, an
 * unknown component tipo, or simply no stored value at the end of the walk.
 */
export async function readPathValues(
	seed: PathReadSeed,
	path: CriterionPathStep[],
	options: PathReadOptions = {},
): Promise<CriterionValue | null> {
	try {
		return await walk(seed, path, options);
	} catch (error) {
		// A read is never allowed to take the identification run down; the caller
		// treats null as "this criterion is absent on the seed".
		warn(`path read failed for ${seed.sectionTipo}/${seed.sectionId}: ${(error as Error).message}`);
		return null;
	}
}

async function walk(
	seed: PathReadSeed,
	path: CriterionPathStep[],
	options: PathReadOptions,
): Promise<CriterionValue | null> {
	if (path.length === 0) return null;
	const hops = path.length - 1;
	if (hops > MAX_PATH_HOPS) {
		warn(`refusing a ${hops}-hop path (cap ${MAX_PATH_HOPS}) — check the criterion definition`);
		return null;
	}

	const lang = options.lang ?? config.lang.dataLangDefault;
	const seedTable = await getMatrixTableFromTipo(seed.sectionTipo);
	if (seedTable === null) {
		warn(`no matrix table for seed section '${seed.sectionTipo}'`);
		return null;
	}
	const seedRecord = await readMatrixRecord(seedTable, seed.sectionTipo, seed.sectionId);
	if (seedRecord === null) return null;

	/** (section_tipo, section_id, component_tipo) triples already expanded. */
	const visited = new Set<string>();
	let frontier: FrontierRecord[] = [
		{ record: seedRecord, sectionTipo: seed.sectionTipo, sectionId: seed.sectionId },
	];

	// --- HOPS: mirror search/conform.ts buildJoinChain (see the module doc) ---
	for (let index = 1; index < path.length; index++) {
		const hopComponent = (path[index - 1] as CriterionPathStep).component_tipo;
		const stepSection = (path[index] as CriterionPathStep).section_tipo;
		if (
			typeof hopComponent !== 'string' ||
			hopComponent === '' ||
			typeof stepSection !== 'string' ||
			stepSection === ''
		) {
			warn('a multi-hop path step needs section_tipo + component_tipo');
			return null;
		}
		const hopModel = await getModelByTipo(hopComponent);
		if (hopModel === null) {
			warn(`unknown hop component '${hopComponent}'`);
			return null;
		}
		if (getColumnNameByModel(hopModel) !== 'relation') {
			// conform's join chain unnests `<alias>.relation->'<tipo>'`; a hop that
			// stores anywhere else simply cannot be joined through. Loud, not silent.
			warn(
				`hop component '${hopComponent}' is model '${hopModel}', which stores no locators — a criterion path can only hop through the relation family`,
			);
			return null;
		}
		const stepTable = await getMatrixTableFromTipo(stepSection);
		if (stepTable === null) {
			warn(`no matrix table for join step '${stepSection}'`);
			return null;
		}

		const next: FrontierRecord[] = [];
		const reached = new Set<string>();
		for (const current of frontier) {
			const key = visitKey(current.sectionTipo, current.sectionId, hopComponent);
			if (visited.has(key)) continue;
			visited.add(key);

			const items = await readItems(current.record, hopComponent, hopModel, lang);
			for (const item of items) {
				const locator = itemToLocator(item);
				if (locator === null) continue;
				const targetId = Number(locator.section_id);
				if (!Number.isInteger(targetId)) continue;
				const targetTipo = String(locator.section_tipo);
				const reachedKey = recordKey(targetTipo, targetId);
				if (reached.has(reachedKey)) continue;
				reached.add(reachedKey);
				// The landing row is matched on the LOCATOR's identity inside the
				// STEP's table — the LEFT JOIN's ON clause, verbatim.
				const targetRecord = await readMatrixRecord(stepTable, targetTipo, targetId);
				if (targetRecord === null) continue;
				next.push({ record: targetRecord, sectionTipo: targetTipo, sectionId: targetId });
			}
		}
		if (next.length === 0) return null;
		frontier = next;
	}

	// --- LEAF ---------------------------------------------------------------
	const leafStep = path[path.length - 1] as CriterionPathStep;
	const leafComponent = leafStep.component_tipo;
	if (typeof leafComponent !== 'string' || leafComponent === '') {
		warn('the last path step carries no component_tipo');
		return null;
	}
	if (leafComponent === 'section_id') {
		// conform allowlists the PSEUDO tipo 'section_id' (conform.ts:373-375), but
		// its matcher is the dedicated section_id builder, not the numeric one — so
		// a value read here could not be compiled back into an agreeing leaf.
		// Refuse loudly rather than emit something the matcher reads differently.
		warn("the pseudo tipo 'section_id' is not a supported criterion leaf");
		return null;
	}
	const leafModel = await getModelByTipo(leafComponent);
	if (leafModel === null) {
		warn(`unknown leaf component '${leafComponent}'`);
		return null;
	}

	const rawItems: unknown[] = [];
	for (const current of frontier) {
		const key = visitKey(current.sectionTipo, current.sectionId, leafComponent);
		if (visited.has(key)) continue;
		visited.add(key);
		rawItems.push(...(await readItems(current.record, leafComponent, leafModel, lang)));
	}
	if (rawItems.length === 0) return null;

	return collectLeafValue(rawItems, leafModel, options.locatorKeyProperties);
}

/**
 * Fold the leaf's stored items into the CriterionValue union, de-duplicated.
 * The kind is DESCRIPTOR-DRIVEN (components/registry.ts), never a model list:
 * the 'relation' column is the relation family; component_date is a range; the
 * 'number' searchBuilder family is numeric; everything else is text.
 */
function collectLeafValue(
	rawItems: readonly unknown[],
	leafModel: string,
	locatorKeyProperties: readonly string[] = IDENTITY_LOCATOR_PROPERTIES,
): CriterionValue | null {
	const column = getColumnNameByModel(leafModel);

	if (column === 'relation') {
		const locators: ValueLocator[] = [];
		const seen = new Set<string>();
		for (const item of rawItems) {
			const locator = itemToLocator(item);
			if (locator === null) continue;
			const key = buildLocatorLookupKey(locator as Locator, locatorKeyProperties);
			if (seen.has(key)) continue;
			seen.add(key);
			locators.push(locator);
		}
		return locators.length === 0 ? null : { kind: 'locators', locators };
	}

	if (getComponentModel(leafModel)?.model === 'component_date' || column === 'date') {
		const ranges: { from: number; to: number }[] = [];
		const seen = new Set<string>();
		for (const item of rawItems) {
			const range = dateItemToRange(item);
			if (range === null) continue;
			const key = `${range.from}:${range.to}`;
			if (seen.has(key)) continue;
			seen.add(key);
			ranges.push(range);
		}
		return ranges.length === 0 ? null : { kind: 'date', ranges };
	}

	if (getSearchBuilderFamily(leafModel) === 'number') {
		const values: number[] = [];
		const seen = new Set<number>();
		for (const item of rawItems) {
			const value = numberItemToValue(item);
			if (value === null || seen.has(value)) continue;
			seen.add(value);
			values.push(value);
		}
		return values.length === 0 ? null : { kind: 'number', values };
	}

	const textField = getSearchBuilderFamily(leafModel) === 'iri' ? 'iri' : 'value';
	const values: string[] = [];
	const seen = new Set<string>();
	for (const item of rawItems) {
		const value = textItemToValue(item, textField);
		if (value === null || seen.has(value)) continue;
		seen.add(value);
		values.push(value);
	}
	return values.length === 0 ? null : { kind: 'text', values };
}
