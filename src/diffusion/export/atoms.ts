/**
 * Export ATOMS — the export-specific projection over the shared engine's
 * atom events (DIFFUSION_PLAN D8/P6), rebuilt 2026-07-08 to the PHP oracle's
 * export-atom shape (core/dd_grid/class.export_atom.php +
 * component_relation_common::get_export_value).
 *
 * The RESOLUTION (which records, which locators, in which order, with which
 * index provenance) is the shared resolver's resolveRecordAtoms; this module
 * turns those events into PHP-shaped export atoms:
 *
 * - value format: the flat cell string — the PHP export_value::join_atoms
 *   record/field dimensions (legacy resolvePathValue): leaf display values
 *   come from the SAME resolveCellValue contract the relation_list panel
 *   uses; the FIRST indexed level joins with ' | ' (records separator), every
 *   deeper level flips to the component's declared fields_separator (?? ', ');
 * - grid_value format: one atom per placed value, carrying the FULL SEGMENT
 *   PATH (PHP export_path_segment[]): every segment names its runtime owner
 *   (`{section_tipo}_{component_tipo}`) and — when its owner record was
 *   reached by traversing a relation locator — the RAW stored-locator
 *   position as `item_index`. The tabulator (grid.ts) derives the column key,
 *   the '|n' suffixes and the row explosion FROM the segments, per breakdown.
 *
 * Relation-LEAF fan-out (PHP get_export_value recursion): a declared path
 * that ENDS on a relation component does not stop there — the component's OWN
 * request_config ddo_map children resolve per locator target (rsc139 →
 * rsc86 Surname AND rsc85 Name, one column each), and relation-model children
 * recurse further (their declared descendants in the same map first, else
 * their own config), each hop appending a segment with the locator position.
 * component_dataframe children are UNCOVERED scope (ledgered): they surface
 * in `unresolved` (loud) instead of silently dropping a declared column.
 *
 * Byte-parity notes (pinned by test/parity/tool_export_breakdown_differential):
 * - empty/null leaf values are SKIPPED (no atom, no join part) — the PHP
 *   empty() bug-for-bug rule;
 * - segments use the RUNTIME owner section (PHP instantiates every component
 *   at the locator target — multi-section autocompletes key per target);
 * - all caches live in the per-request ExportRun (request isolation, no
 *   module state).
 */

import { dataframeEntryMatches } from '../../core/concepts/subdatum.ts';
import { getColumnNameByModel, getModelByTipo, getNode } from '../../core/ontology/resolver.ts';
import type { CellValueResolveOptions } from '../../core/resolve/relation_list.ts';
import {
	componentFieldsSeparator,
	resolveCellValue,
	resolveRelationTargetValues,
} from '../../core/resolve/relation_list.ts';
import type { RawConfigDdo } from '../../core/section/list_definitions/section_list.ts';
import { resolveOwnConfigMap } from '../../core/section/list_definitions/section_list.ts';
import type { FieldPlan } from '../plan/types.ts';
import type { ExportAtomRun, ExportLeafAtom } from '../resolve/resolver.ts';
import {
	createExportAtomRun,
	loadExportRecord,
	loadExportRecordFromTable,
	resolveRecordAtoms,
} from '../resolve/resolver.ts';

/** PHP export_value records_separator (join_atoms depth-0 default). */
const RECORDS_SEPARATOR = ' | ';

/** PHP get_export_value recursion depth backstop (fail LOUD, never spin). */
const MAX_FANOUT_DEPTH = 12;

/** Per-request export run state: the shared atom run + projection caches. */
export interface ExportRun {
	atoms: ExportAtomRun;
	/** relation component tipo → its OWN request_config child ddos. */
	ownChildren: Map<string, RawConfigDdo[]>;
	/** Threads the run's record cache into the shared flat-value resolvers —
	 * without it every relation-target label re-reads its record per row (N+1). */
	cellOpts: CellValueResolveOptions;
}

/** Fresh per-request run (never module-scoped — request isolation). */
export function createExportRun(): ExportRun {
	const atoms = createExportAtomRun();
	return {
		atoms,
		ownChildren: new Map(),
		cellOpts: {
			loadRecord: (tableName, sectionTipo, sectionId) =>
				loadExportRecordFromTable(atoms, tableName, sectionTipo, sectionId),
		},
	};
}

/** One PHP-shaped export path segment (wire shape of the col line's path). */
export interface ExportSegment {
	section_tipo: string;
	component_tipo: string;
	model: string | null;
	/** RAW stored-locator position that reached this segment's owner record;
	 * null when the owner is the exported row itself (no hop). */
	item_index: number | null;
	section_id: number | string | null;
	/** Virtual sub-column discriminator (PHP component_info/inverse, parents). */
	sub_id?: string;
}

/** PHP export_path_segment::get_identity_key (sub_id joined with '#'). */
export function segmentIdentityKey(segment: ExportSegment): string {
	const base = `${segment.section_tipo}_${segment.component_tipo}`;
	return segment.sub_id !== undefined ? `${base}#${segment.sub_id}` : base;
}

/** One grid_value export atom: a placed value with its full segment path. */
export interface GridAtom {
	value: string;
	cellType: string;
	/** The leaf component's model (PHP column model = leaf segment model). */
	model: string;
	segments: ExportSegment[];
}

/** PHP export atom cell_type by leaf model (export_atom defaults). */
export function cellTypeOfModel(model: string | null): string {
	switch (model) {
		case 'component_image':
			return 'img';
		case 'component_av':
		case 'component_3d':
			return 'av';
		case 'component_iri':
			return 'iri';
		case 'component_section_id':
			return 'section_id';
		default:
			return 'text';
	}
}

/** One raw declared path step (verbatim client shape). */
type RawPathStep = Record<string, unknown>;

/**
 * The relation component's OWN request_config child ddos (PHP
 * get_export_value `$this->request_config ?? build_request_config()` — the
 * component's own map, NO section_list substitution). Implicit configs (relations
 * list, no ddo_map) normalize to flat self-parented component children.
 */
async function ownChildrenOf(run: ExportRun, componentTipo: string): Promise<RawConfigDdo[]> {
	const cached = run.ownChildren.get(componentTipo);
	if (cached !== undefined) return cached;
	const map = await resolveOwnConfigMap(componentTipo);
	let children: RawConfigDdo[];
	if (map.rawDdos !== null) {
		children = map.rawDdos;
	} else {
		children = [];
		for (const candidate of map.implicitRelations ?? []) {
			const model = await getModelByTipo(candidate);
			if (model?.startsWith('component_')) {
				children.push({ tipo: candidate, parent: 'self', model });
			}
		}
	}
	run.ownChildren.set(componentTipo, children);
	return children;
}

/** Whether a field's DECLARED chain contains a component_dataframe step —
 * a shape the tool UI cannot produce (frames belong to the SOURCE record;
 * the drill-down lists the TARGET's elements) that would mis-walk silently.
 * Consumers push 'component_dataframe:declared-path' and emit nothing. */
function hasDeclaredDataframeStep(field: FieldPlan): boolean {
	return field.sourceChain.some(
		(step) => (step as { model?: string }).model === 'component_dataframe',
	);
}

/** Direct children of `parentTipo` in a ddo_map ('self' aliases the owner). */
function directChildrenOf(
	map: RawConfigDdo[],
	parentTipo: string,
	mapOwnerTipo: string,
): RawConfigDdo[] {
	return map.filter(
		(ddo) =>
			typeof ddo?.tipo === 'string' &&
			(ddo.parent === parentTipo || (ddo.parent === 'self' && parentTipo === mapOwnerTipo)),
	);
}

/**
 * The value-format cell of one export field on one record — the PHP
 * export_value::join byte twin over the shared walk's events: leaves resolve
 * through resolveCellValue, per-level joins fold bottom-up over the index
 * vectors (level 0 = ' | ', deeper levels = the level component's declared
 * fields_separator), empty parts dropped at every level.
 */
export async function resolveValueCell(
	run: ExportRun,
	field: FieldPlan,
	sectionTipo: string,
	sectionId: number | string,
	lang: string,
	unresolved: string[],
): Promise<string | null> {
	const path = field.exportColumn?.path ?? [];
	if (path.length === 0) return null;
	if (hasDeclaredDataframeStep(field)) {
		// A DECLARED path step of model component_dataframe is not producible
		// from the tool UI (frames belong to the SOURCE record, the drill-down
		// lists the target's elements) and would mis-walk silently — loud instead.
		unresolved.push('component_dataframe:declared-path');
		return null;
	}
	const events = await resolveRecordAtoms(run.atoms, field, sectionTipo, sectionId);
	if (events.length === 0) return null;

	const hops = path.length - 1;
	const leafTipo = String((path[hops] as RawPathStep | undefined)?.component_tipo ?? '');
	if (leafTipo === '') return null;

	// Per-level separators (legacy levelSeparator): level 0 always ' | ';
	// deeper levels use the level component's declared fields_separator (the
	// SAME cached core accessor the relation_list panel uses). The LEAF's
	// separator is passed INTO resolveCellValue as its multi-item join.
	const separators: string[] = [];
	for (let level = 0; level <= hops; level++) {
		const levelTipo = String((path[level] as RawPathStep | undefined)?.component_tipo ?? '');
		separators.push(level === 0 ? RECORDS_SEPARATOR : await componentFieldsSeparator(levelTipo));
	}

	const joinLevel = async (group: ExportLeafAtom[], depth: number): Promise<string | null> => {
		if (depth === hops) {
			// All hops consumed: exactly one leaf event per locator path.
			const event = group[0] as ExportLeafAtom;
			return resolveCellValue(
				event.ownerSectionTipo,
				Number(event.ownerSectionId),
				leafTipo,
				lang,
				unresolved,
				separators[hops],
				run.cellOpts,
			);
		}
		// Group by this hop's locator position (first-seen order = DFS order).
		const buckets = new Map<number, ExportLeafAtom[]>();
		for (const event of group) {
			const position = event.indexVector[depth] as number;
			const bucket = buckets.get(position);
			if (bucket === undefined) buckets.set(position, [event]);
			else bucket.push(event);
		}
		const parts: string[] = [];
		for (const [, bucket] of buckets) {
			const value = await joinLevel(bucket, depth + 1);
			if (value !== null && value !== '') parts.push(value);
		}
		return parts.length > 0 ? parts.join(separators[depth] as string) : null;
	};

	return joinLevel(events, 0);
}

/**
 * grid_value atoms of one export field on one record (PHP get_record_atoms →
 * get_export_value recursion): literal leaves yield one atom whose segments
 * mirror the declared chain (item_index = the hop position that reached each
 * owner); relation leaves FAN OUT into their own request_config children per
 * stored locator, appending one segment per fan-out hop.
 */
export async function collectGridAtoms(
	run: ExportRun,
	field: FieldPlan,
	sectionTipo: string,
	sectionId: number | string,
	lang: string,
	unresolved: string[],
): Promise<GridAtom[]> {
	const path = field.exportColumn?.path ?? [];
	if (hasDeclaredDataframeStep(field)) {
		// See resolveValueCell — declared dataframe steps stay loud, never a
		// silent empty walk (frames live on the SOURCE record, not the target).
		unresolved.push('component_dataframe:declared-path');
		return [];
	}
	const events = await resolveRecordAtoms(run.atoms, field, sectionTipo, sectionId);
	const atoms: GridAtom[] = [];

	for (const event of events) {
		// Segments of the DECLARED chain: runtime owner per position, the raw
		// locator position that reached it as item_index (null at the root).
		const segments: ExportSegment[] = [];
		for (let position = 0; position < path.length; position++) {
			const rawStep = path[position] as RawPathStep | undefined;
			const componentTipo = String(rawStep?.component_tipo ?? '');
			const owner = event.hopOwners[position];
			segments.push({
				section_tipo: owner?.sectionTipo ?? String(rawStep?.section_tipo ?? sectionTipo),
				component_tipo: componentTipo,
				model: (await getModelByTipo(componentTipo)) ?? String(rawStep?.model ?? ''),
				item_index: position === 0 ? null : (event.indexVector[position - 1] ?? null),
				section_id: position === 0 ? null : (owner?.sectionId ?? null),
			});
		}

		if (event.locators !== undefined) {
			// COMPACT portal cells (WC-008, user-approved 2026-07-08): a
			// SINGLE-step ddo whose leaf is a REAL portal (stored ontology model
			// component_portal — the runtime alias also covers autocompletes,
			// which keep PHP parity) does NOT fan out: each referenced record's
			// FULL flat info lands in ONE cell, one atom per stored locator, and
			// the breakdown explodes them by row or by '|n' column. Deep field
			// columns stay available by dragging the expanded child components
			// (multi-step declared paths, PHP-parity fan-out below).
			if (path.length === 1) {
				const storedModel = (await getNode(event.step.tipo))?.model ?? null;
				if (storedModel === 'component_portal') {
					const targets = await resolveRelationTargetValues(
						event.ownerSectionTipo,
						Number(event.ownerSectionId),
						event.step.tipo,
						lang,
						unresolved,
						run.cellOpts,
					);
					const leafSegment = segments[0] as ExportSegment;
					for (const target of targets) {
						const value = target.parts.join(RECORDS_SEPARATOR);
						if (value === '') continue;
						atoms.push({
							value,
							cellType: 'text',
							model: event.step.model,
							segments: [
								{
									...leafSegment,
									item_index: target.index,
									section_id: target.sectionId,
								},
							],
						});
					}
					continue;
				}
			}
			// Relation leaf: fan out into the component's own children per
			// locator target (PHP get_export_value foreach data → ddo children).
			// The OWNER is the record holding the leaf's data (dataframe slots
			// live there).
			await fanOutRelation(
				run,
				event.step.tipo,
				event.ownerSectionTipo,
				event.ownerSectionId,
				event.locators,
				segments,
				lang,
				unresolved,
				atoms,
				0,
			);
			continue;
		}

		// Literal leaf: the component's flat value at the owner record.
		const value = await resolveCellValue(
			event.ownerSectionTipo,
			Number(event.ownerSectionId),
			event.step.tipo,
			lang,
			unresolved,
			RECORDS_SEPARATOR,
			run.cellOpts,
		);
		if (value === null || value === '') continue;
		atoms.push({
			value,
			cellType: cellTypeOfModel(event.step.model),
			model: event.step.model,
			segments,
		});
	}

	return atoms;
}

/** One fan-out locator: target identity + raw slot position + (for dataframe
 * pairing) the STORED locator id and its main_component_tipo. */
interface FanOutLocator {
	sectionTipo: string;
	sectionId: number | string;
	index: number;
	id?: number | string;
	mainComponentTipo?: string;
}

/**
 * PHP component_relation_common::get_export_value recursion: per stored
 * locator × own-map child — plain children emit one atom (segment item_index
 * = the locator's RAW position), relation children recurse into THEIR stored
 * locators (declared descendants of the current map first, else the child's
 * own config map). `ownerSectionTipo/ownerSectionId` = the record HOLDING the
 * relation's data (where dataframe slots live — PHP $this->section_*).
 */
async function fanOutRelation(
	run: ExportRun,
	relationTipo: string,
	ownerSectionTipo: string,
	ownerSectionId: number | string,
	locators: FanOutLocator[],
	baseSegments: ExportSegment[],
	lang: string,
	unresolved: string[],
	atoms: GridAtom[],
	depth: number,
	declaredMap?: RawConfigDdo[],
	/** The tipo whose request_config `declaredMap` came from — 'self' entries
	 * alias THIS tipo, never the current relation (a nested rsc368 must not
	 * adopt the portal map's self children as its own). */
	declaredMapOwner?: string,
): Promise<void> {
	if (depth > MAX_FANOUT_DEPTH) {
		throw new Error(
			`tool_export fan-out exceeded depth ${MAX_FANOUT_DEPTH} at '${relationTipo}' — cyclic request_config?`,
		);
	}
	// Children: the declared descendants when the caller's map declares them,
	// else the component's OWN request_config (PHP context->ddo_map ?? own).
	let map: RawConfigDdo[];
	let mapOwner: string;
	if (
		declaredMap !== undefined &&
		declaredMapOwner !== undefined &&
		directChildrenOf(declaredMap, relationTipo, declaredMapOwner).length > 0
	) {
		map = declaredMap;
		mapOwner = declaredMapOwner;
	} else {
		map = await ownChildrenOf(run, relationTipo);
		mapOwner = relationTipo;
	}
	const children = directChildrenOf(map, relationTipo, mapOwner);
	if (children.length === 0) return; // PHP: empty ddo_direct_children → no atoms

	for (const locator of locators) {
		for (const child of children) {
			const childModel = (await getModelByTipo(child.tipo)) ?? String(child.model ?? '');
			if (childModel === '') continue; // PHP: missing TLD → skip (debug log)

			if (childModel === 'component_dataframe') {
				// PHP relation_common :871-897 + component_dataframe::get_data
				// :103-129: frames live on the OWNER record's relation column under
				// the frame tipo, paired to THIS locator by (dd490, main, id_key =
				// the MAIN locator's stored id). Null id → zero frames (PHP predicate
				// false). Frame positions are the FILTERED re-index (restart at 0 per
				// caller), and the dataframe SEGMENT pins the ORACLE shape: OWNER
				// section + MAIN locator position/target id (verified vs live PHP,
				// numisdata3 §15657).
				if (locator.id === undefined || locator.id === null) continue;
				const owner = await loadExportRecord(run.atoms, ownerSectionTipo, ownerSectionId);
				const slot = ((owner?.columns.relation as Record<string, unknown[]> | null)?.[child.tipo] ??
					[]) as Record<string, unknown>[];
				const mainTipo = locator.mainComponentTipo ?? relationTipo; // PHP :877
				const paired = slot.filter((entry) =>
					dataframeEntryMatches(
						entry as never,
						mainTipo,
						locator.id as number | string,
						child.tipo,
					),
				);
				const frameLocators: FanOutLocator[] = [];
				for (let index = 0; index < paired.length; index++) {
					const stored = paired[index] as {
						section_tipo?: unknown;
						section_id?: unknown;
						id?: number | string;
					};
					if (typeof stored?.section_tipo !== 'string' || stored.section_id === undefined) {
						continue; // invalid consumes its index (PHP :806-823)
					}
					frameLocators.push({
						sectionTipo: stored.section_tipo,
						sectionId: stored.section_id as number | string,
						index,
						id: stored.id,
					});
				}
				const dataframeSegment: ExportSegment = {
					section_tipo: ownerSectionTipo,
					component_tipo: child.tipo,
					model: 'component_dataframe',
					item_index: locator.index,
					section_id: locator.sectionId,
				};
				// Frames-of-frames live on the SAME record (PHP $this->section_*).
				await fanOutRelation(
					run,
					child.tipo,
					ownerSectionTipo,
					ownerSectionId,
					frameLocators,
					[...baseSegments, dataframeSegment],
					lang,
					unresolved,
					atoms,
					depth + 1,
					map,
					mapOwner,
				);
				continue;
			}

			const childSegment: ExportSegment = {
				section_tipo: locator.sectionTipo,
				component_tipo: child.tipo,
				model: childModel,
				item_index: locator.index,
				section_id: locator.sectionId,
			};
			const segments = [...baseSegments, childSegment];

			// Relation-model child: recurse into ITS stored locators.
			if (getColumnNameByModel(childModel) === 'relation') {
				const target = await loadExportRecord(run.atoms, locator.sectionTipo, locator.sectionId);
				const bag =
					((target?.columns.relation as Record<string, unknown[]> | null)?.[child.tipo] as
						| {
								section_tipo?: string;
								section_id?: number | string;
								id?: number | string;
								main_component_tipo?: string;
						  }[]
						| undefined) ?? [];
				const childLocators: FanOutLocator[] = [];
				for (let index = 0; index < bag.length; index++) {
					const stored = bag[index];
					if (typeof stored?.section_tipo !== 'string' || stored.section_id === undefined) {
						continue;
					}
					childLocators.push({
						sectionTipo: stored.section_tipo,
						sectionId: stored.section_id,
						index,
						id: stored.id,
						mainComponentTipo: stored.main_component_tipo,
					});
				}
				await fanOutRelation(
					run,
					child.tipo,
					locator.sectionTipo,
					locator.sectionId,
					childLocators,
					segments,
					lang,
					unresolved,
					atoms,
					depth + 1,
					map,
					mapOwner,
				);
				continue;
			}

			// Plain child: one atom, the child's flat value at the target record.
			const value = await resolveCellValue(
				locator.sectionTipo,
				Number(locator.sectionId),
				child.tipo,
				lang,
				unresolved,
				RECORDS_SEPARATOR,
				run.cellOpts,
			);
			if (value === null || value === '') continue;
			atoms.push({
				value,
				cellType: cellTypeOfModel(childModel),
				model: childModel,
				segments,
			});
		}
	}
}
