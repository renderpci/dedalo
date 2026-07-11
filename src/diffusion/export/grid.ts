/**
 * Export GRID — the NDJSON flat-table protocol over the shared diffusion
 * engine (DIFFUSION_PLAN D8/P6 "export unification"), placement math rebuilt
 * 2026-07-08 as a faithful port of the PHP oracle's export_tabulator
 * (tools/tool_export/class.export_tabulator.php) after the deep-breakdown
 * divergence (multi-author bibliography exports came out incoherent: rows
 * misaligned, '|n' suffix collisions merging unrelated authors into one
 * cell, no fill_the_gaps, single-field relation leaves).
 *
 * The WIRE (meta/col/row/end line shapes, interleaving, streaming duality,
 * the three data formats, breakdown placement, separators, column identity/
 * ordering) is pinned by the live-PHP differentials
 * (test/parity/tool_export_differential.test.ts +
 * tool_export_breakdown_differential.test.ts). The RESOLUTION (records,
 * relation hops, locator order, index provenance) rides the shared plan
 * compiler (compile_columns.ts) + resolver atom entry point
 * (resolveRecordAtoms) through atoms.ts.
 *
 * Tabulator semantics (PHP export_tabulator, ported member for member):
 * - build_item_tree/compute_node_layout — the per-record relation item TREE:
 *   axes keyed by the identity chain BEFORE the indexed segment; item heights
 *   stack within an axis, parent height = MAX across axes (max-alignment,
 *   NOT cartesian product); offsets stack sequentially.
 * - place_atom — per breakdown, each indexed segment goes to the row
 *   dimension or the column dimension: 'columns' → all suffixes; 'rows' →
 *   all rows; 'default' → FIRST indexed level rows, deeper suffixes. Column
 *   key = per-SEGMENT identity keys, each with its own '|n' (n>0) — the
 *   collision-free rule ('...rsc368|1.rsc205_rsc140').
 * - resolve_item_rows — offset walk down the tree; fill_the_gaps repeats a
 *   spanning value over its whole row span.
 * - register_column — dedupe by key; deterministic ordered insert
 *   (sort_key lexicographic → shorter first → arrival seq); 'after' insert
 *   hints; labels = per-segment ontology terms joined ' | ' with ' N+1'
 *   suffixes on suffixed segments; ar_labels keeps the section/component
 *   alternation. 'end' carries the AUTHORITATIVE display order.
 * - value/dedalo_raw — static column modes: ONE column per top-component
 *   key, minted on the first record that carries the ddo (even atom-less);
 *   cells overwrite on key collision (PHP parity).
 *
 * Record SELECTION deliberately stays on sanitizeClientSqo + buildSearchSql
 * (the same §8.4 chokepoint the whole read side uses): the export contract
 * preserves the client SQO's order and the caller-principal projects filter,
 * and the protocol's meta `total` needs the full selection up front.
 */

import { sanitizeClientSqo } from '../../core/concepts/sqo.ts';
import { sql } from '../../core/db/postgres.ts';
import { termByTipo } from '../../core/ontology/labels.ts';
import { getColumnNameByModel, getModelByTipo } from '../../core/ontology/resolver.ts';
import { buildSearchSql } from '../../core/search/sql_assembler.ts';
import type { ToolActionContext, ToolResponse } from '../../core/tools/module.ts';
import { loadExportRecord } from '../resolve/resolver.ts';
import type { ExportRun, ExportSegment, GridAtom } from './atoms.ts';
import {
	cellTypeOfModel,
	collectGridAtoms,
	createExportRun,
	resolveValueCell,
	segmentIdentityKey,
} from './atoms.ts';
import type { ExportDdoInput } from './compile_columns.ts';
import { compileExportPlan } from './compile_columns.ts';
import { ndjsonStream } from './ndjson_stream.ts';

/** One raw declared path step (verbatim client shape). */
type RawPathStep = {
	section_tipo?: string | string[];
	component_tipo?: string;
	model?: string;
	name?: string;
	[extra: string]: unknown;
};

/** A registered tabulator column (PHP export_tabulator::$columns entry). */
interface TabColumn {
	i: number;
	key: string;
	group: string;
	path: unknown;
	label: string;
	ar_labels: string[];
	cell_type: string;
	model: string | null;
	sortKey: number[];
	seq: number;
}

/** An item-tree node (PHP build_item_tree node shape). */
interface ItemNode {
	height: number;
	offset: number;
	axes: Map<string, Map<number, ItemNode>>;
}

/** Per-record entry, one per export ddo (PHP get_record_atoms ar_entries). */
type RecordEntry =
	| { kind: 'grid'; ddoIndex: number; atoms: GridAtom[] }
	| {
			kind: 'value';
			ddoIndex: number;
			topKey: string;
			declaredPath: RawPathStep[];
			/** PHP atoms[0]->path: the fan-out-extended label chain (relation
			 * leaves with data only) — the header resolves through it. */
			labelSegments?: ExportSegment[];
			flat: string | null;
			leafModel: string;
			topModel: string;
	  }
	| {
			kind: 'raw';
			ddoIndex: number;
			topKey: string;
			ownSegment: ExportSegment;
			raw: string | number | null;
			cellType: string;
			topModel: string;
	  };

/**
 * The stateful tabulator of one export run (PHP export_tabulator instance):
 * columns registry + deterministic display order + row/record counters.
 * Created per request — no module state (request isolation).
 */
function createTabulator(options: {
	dataFormat: string;
	breakdown: string;
	fillTheGaps: boolean;
	lang: string;
}) {
	const { dataFormat, breakdown, fillTheGaps, lang } = options;
	const columns = new Map<string, TabColumn>();
	const order: string[] = [];
	const byOrdinal = new Map<number, TabColumn>();
	let nextOrdinal = 0;
	let nextSeq = 0;
	let rowsEmitted = 0;
	let recordsCount = 0;

	/** PHP resolve_labels: per-segment section+component terms; dedalo_raw
	 * emits raw tipos (import header grammar) with the section_id alias. */
	const resolveLabels = async (
		segments: ExportSegment[] | null,
		suffixMap: Map<number, number>,
		fallbackKey: string,
	): Promise<{ label: string; ar_labels: string[] }> => {
		if (segments === null || segments.length === 0) {
			return { label: fallbackKey, ar_labels: [fallbackKey] };
		}
		const arLabels: string[] = [];
		const compact: string[] = [];
		for (let position = 0; position < segments.length; position++) {
			const segment = segments[position] as ExportSegment;
			let sectionLabel: string;
			let componentLabel: string;
			if (dataFormat === 'dedalo_raw') {
				sectionLabel = segment.section_tipo;
				componentLabel =
					segment.model === 'component_section_id' ? 'section_id' : segment.component_tipo;
			} else {
				sectionLabel = await termByTipo(segment.section_tipo, lang);
				componentLabel =
					segment.sub_id !== undefined
						? segment.sub_id
						: await termByTipo(segment.component_tipo, lang);
			}
			const suffix = suffixMap.get(position);
			if (suffix !== undefined && suffix > 0) {
				componentLabel += ` ${suffix + 1}`;
			}
			arLabels.push(sectionLabel, componentLabel);
			compact.push(componentLabel);
		}
		return { label: compact.join(' | '), ar_labels: arLabels };
	};

	/** PHP compare_columns: sort_key lexicographic → shorter first → seq. */
	const compareColumns = (a: TabColumn, b: TabColumn): number => {
		const len = Math.min(a.sortKey.length, b.sortKey.length);
		for (let i = 0; i < len; i++) {
			const ka = a.sortKey[i] as number;
			const kb = b.sortKey[i] as number;
			if (ka !== kb) return ka - kb;
		}
		if (a.sortKey.length !== b.sortKey.length) return a.sortKey.length - b.sortKey.length;
		return a.seq - b.seq;
	};

	/** PHP register_column: the single point of column creation. */
	const registerColumn = async (
		key: string,
		group: string,
		segments: ExportSegment[] | null,
		pathPayload: unknown,
		suffixMap: Map<number, number>,
		ddoIndex: number,
		sortTail: number[],
		cellType: string,
		model: string | null,
		newColLines: Record<string, unknown>[],
	): Promise<TabColumn> => {
		const existing = columns.get(key);
		if (existing !== undefined) return existing;

		const labels = await resolveLabels(segments, suffixMap, key);
		let effectiveModel = model;
		if (effectiveModel === null && segments !== null && segments.length > 0) {
			effectiveModel = segments[segments.length - 1]?.model ?? null;
		}

		const column: TabColumn = {
			i: nextOrdinal++,
			key,
			group,
			path: pathPayload,
			label: labels.label,
			ar_labels: labels.ar_labels,
			cell_type: cellType,
			model: effectiveModel,
			sortKey: [ddoIndex, ...sortTail],
			seq: nextSeq++,
		};
		columns.set(key, column);
		byOrdinal.set(column.i, column);

		// ordered insert (deterministic display order)
		let insertPos = order.length;
		for (let i = 0; i < order.length; i++) {
			const other = columns.get(order[i] as string) as TabColumn;
			if (compareColumns(column, other) < 0) {
				insertPos = i;
				break;
			}
		}
		order.splice(insertPos, 0, key);
		const after =
			insertPos > 0 ? (columns.get(order[insertPos - 1] as string) as TabColumn).i : null;

		newColLines.push({
			t: 'col',
			i: column.i,
			key: column.key,
			group: column.group,
			path: column.path,
			label: column.label,
			ar_labels: column.ar_labels,
			cell_type: column.cell_type,
			model: column.model,
			after,
		});
		return column;
	};

	/** PHP build_item_tree: register every indexed item chain of the record. */
	const buildItemTree = (entries: RecordEntry[], firstOnly: boolean): ItemNode => {
		const root: ItemNode = { height: 1, offset: 0, axes: new Map() };
		for (const entry of entries) {
			if (entry.kind !== 'grid') continue;
			for (const atom of entry.atoms) {
				let node = root;
				const identityChain: string[] = [];
				for (const segment of atom.segments) {
					if (segment.item_index !== null) {
						const axisKey = identityChain.join('.');
						let axis = node.axes.get(axisKey);
						if (axis === undefined) {
							axis = new Map();
							node.axes.set(axisKey, axis);
						}
						let item = axis.get(segment.item_index);
						if (item === undefined) {
							item = { height: 1, offset: 0, axes: new Map() };
							axis.set(segment.item_index, item);
						}
						node = item;
						if (firstOnly) break;
					}
					identityChain.push(segmentIdentityKey(segment));
				}
			}
		}
		computeNodeLayout(root);
		return root;
	};

	/** PHP compute_node_layout: heights bottom-up, offsets stack, MAX axes. */
	const computeNodeLayout = (node: ItemNode): void => {
		let maxAxisHeight = 1;
		for (const [axisKey, items] of node.axes) {
			const sorted = new Map([...items.entries()].sort((a, b) => a[0] - b[0]));
			node.axes.set(axisKey, sorted);
			let offset = 0;
			for (const item of sorted.values()) {
				computeNodeLayout(item);
				item.offset = offset;
				offset += item.height;
			}
			if (offset > maxAxisHeight) maxAxisHeight = offset;
		}
		node.height = maxAxisHeight;
	};

	/** PHP resolve_item_rows: offset walk + fill span. */
	const resolveItemRows = (
		rowChain: { axisKey: string; index: number }[],
		itemTree: ItemNode | null,
	): number[] => {
		if (itemTree === null) return [0];
		let rowOffset = 0;
		let node = itemTree;
		for (const ix of rowChain) {
			const item = node.axes.get(ix.axisKey)?.get(ix.index);
			if (item === undefined) return [rowOffset]; // unknown item (defensive)
			rowOffset += item.offset;
			node = item;
		}
		const span = Math.max(1, node.height);
		if (!fillTheGaps) return [rowOffset];
		return Array.from({ length: span }, (_, i) => rowOffset + i);
	};

	/** PHP place_atom: resolve the column + output rows of one atom. */
	const placeAtom = async (
		atom: GridAtom,
		ddoIndex: number,
		itemTree: ItemNode | null,
		newColLines: Record<string, unknown>[],
	): Promise<{ column: TabColumn; rows: number[] }> => {
		// indexed segments: [{pos, axisKey (identity chain BEFORE), index}]
		const indexed: { pos: number; axisKey: string; index: number }[] = [];
		const identityChain: string[] = [];
		for (let pos = 0; pos < atom.segments.length; pos++) {
			const segment = atom.segments[pos] as ExportSegment;
			if (segment.item_index !== null) {
				indexed.push({ pos, axisKey: identityChain.join('.'), index: segment.item_index });
			}
			identityChain.push(segmentIdentityKey(segment));
		}

		// column suffixes vs row dimension per breakdown mode
		const suffixMap = new Map<number, number>();
		const rowChain: { axisKey: string; index: number }[] = [];
		if (breakdown === 'columns') {
			for (const ix of indexed) suffixMap.set(ix.pos, ix.index);
		} else if (breakdown === 'rows') {
			for (const ix of indexed) rowChain.push(ix);
		} else {
			for (let i = 0; i < indexed.length; i++) {
				const ix = indexed[i] as { pos: number; axisKey: string; index: number };
				if (i === 0) rowChain.push(ix);
				else suffixMap.set(ix.pos, ix.index);
			}
		}

		// column key: per-segment identities, '|n' on column-dimension segments
		const keyParts: string[] = [];
		for (let pos = 0; pos < atom.segments.length; pos++) {
			let part = segmentIdentityKey(atom.segments[pos] as ExportSegment);
			const suffix = suffixMap.get(pos);
			if (suffix !== undefined && suffix > 0) part += `|${suffix}`;
			keyParts.push(part);
		}
		const columnKey = keyParts.join('.');
		const group = segmentIdentityKey(atom.segments[0] as ExportSegment);

		const sortTail: number[] = [];
		for (const ix of indexed) {
			const suffix = suffixMap.get(ix.pos);
			if (suffix !== undefined) sortTail.push(suffix);
		}

		const column = await registerColumn(
			columnKey,
			group,
			atom.segments,
			atom.segments,
			suffixMap,
			ddoIndex,
			sortTail,
			atom.cellType,
			null, // model: taken from the leaf segment
			newColLines,
		);

		let rows: number[];
		if (rowChain.length === 0) {
			// record-level value: first row, or the whole record span when filling
			rows =
				fillTheGaps && itemTree !== null && itemTree.height > 1 && breakdown !== 'columns'
					? Array.from({ length: itemTree.height }, (_, i) => i)
					: [0];
		} else {
			rows = resolveItemRows(rowChain, itemTree);
		}
		return { column, rows };
	};

	/** PHP record_lines: tabulate one record → col* then row* lines. */
	const recordLines = async (
		entries: RecordEntry[],
		recId: string,
	): Promise<Record<string, unknown>[]> => {
		recordsCount++;
		const newColLines: Record<string, unknown>[] = [];
		const cellGroups = new Map<number, Map<number, string[]>>();
		const rawCells: Record<string, string | number> = {};
		let recordHeight = 1;

		const itemTree =
			dataFormat === 'grid_value' && breakdown !== 'columns'
				? buildItemTree(entries, breakdown === 'default')
				: null;
		if (itemTree !== null) recordHeight = itemTree.height;

		for (const entry of entries) {
			if (entry.kind === 'value' || entry.kind === 'raw') {
				// static column modes mint the top ddo column even with no atoms
				const isRaw = entry.kind === 'raw';
				const segments: ExportSegment[] = isRaw
					? [entry.ownSegment]
					: // PHP :295-302 — with atoms the header chain is atoms[0]->path
						// (fan-out-extended); the declared chain only covers the
						// no-atoms case.
						(entry.labelSegments ??
						entry.declaredPath.map((step) => ({
							section_tipo: String(
								Array.isArray(step.section_tipo)
									? (step.section_tipo[0] ?? '')
									: (step.section_tipo ?? ''),
							),
							component_tipo: String(step.component_tipo ?? ''),
							model: String(step.model ?? ''),
							item_index: null,
							section_id: null,
						})));
				const cellType = isRaw
					? entry.raw !== null
						? entry.cellType
						: 'text'
					: entry.flat !== null
						? cellTypeOfModel(entry.leafModel)
						: 'text';
				const column = await registerColumn(
					entry.topKey,
					entry.topKey, // group
					segments,
					isRaw ? segments : entry.declaredPath,
					new Map(),
					entry.ddoIndex,
					[],
					cellType,
					entry.topModel,
					newColLines,
				);
				if (isRaw) {
					if (entry.raw !== null) rawCells[String(column.i)] = entry.raw;
				} else if (entry.flat !== null && entry.flat !== '') {
					rawCells[String(column.i)] = entry.flat;
				}
				continue;
			}

			// grid_value: place every atom
			for (const atom of entry.atoms) {
				const placement = await placeAtom(atom, entry.ddoIndex, itemTree, newColLines);
				for (const rowIndex of placement.rows) {
					let rowCells = cellGroups.get(rowIndex);
					if (rowCells === undefined) {
						rowCells = new Map();
						cellGroups.set(rowIndex, rowCells);
					}
					const bucket = rowCells.get(placement.column.i) ?? [];
					bucket.push(atom.value);
					rowCells.set(placement.column.i, bucket);
				}
			}
		}

		const lines = newColLines;
		if (dataFormat === 'value' || dataFormat === 'dedalo_raw') {
			lines.push({ t: 'row', rec: recId, sub: 0, c: rawCells });
			rowsEmitted++;
		} else {
			for (let rowIndex = 0; rowIndex < recordHeight; rowIndex++) {
				const cells: Record<string, string> = {};
				for (const [ordinal, values] of cellGroups.get(rowIndex) ?? []) {
					const joined = values.length === 1 ? (values[0] as string) : values.join(' | ');
					if (joined !== '') cells[String(ordinal)] = joined;
				}
				lines.push({ t: 'row', rec: recId, sub: rowIndex, c: cells });
				rowsEmitted++;
			}
		}
		return lines;
	};

	/** PHP end_line: the AUTHORITATIVE display order. */
	const endLine = (): Record<string, unknown> => ({
		t: 'end',
		columns: order.map((key) => (columns.get(key) as TabColumn).i),
		rows: rowsEmitted,
		records: recordsCount,
	});

	return { recordLines, endLine };
}

/** Build the export grid through the unified engine (see module doc). */
export async function exportGridUnified(context: ToolActionContext): Promise<ToolResponse> {
	const { options } = context;
	const sectionTipo = String(options.section_tipo ?? options.tipo ?? '');
	if (sectionTipo === '') {
		return { result: false, msg: 'Error. Missing section_tipo', errors: ['invalid_request'] };
	}
	// PHP validates both against fixed sets and FALLS BACK (never errors).
	const rawFormat = String(options.data_format ?? 'value');
	const dataFormat = ['value', 'grid_value', 'dedalo_raw'].includes(rawFormat)
		? rawFormat
		: 'value';
	const rawBreakdown = String(options.breakdown ?? 'default');
	const breakdown = ['default', 'rows', 'columns'].includes(rawBreakdown)
		? rawBreakdown
		: 'default';
	const fillTheGaps = options.fill_the_gaps !== false; // PHP default true
	const wantStream = options.ndjson_stream === true;
	const exportDdos = Array.isArray(options.ar_ddo_to_export)
		? (options.ar_ddo_to_export as ExportDdoInput[])
		: [];
	const lang = String(options.lang ?? 'lg-spa');

	// Stage B: the export column set compiles through the SHARED plan compiler
	// front-end (one FieldPlan per ddo, ordinals = user DOM order).
	const plan = await compileExportPlan(exportDdos, sectionTipo, {
		valueWithParents: options.value_with_parents === true,
	});
	const fields = plan.sections[0]?.fields ?? [];
	const run = createExportRun();

	// Stage C: the export serializes the FULL filtered selection (PHP forces
	// limit ALL). The standard assembler applies the identifier chokepoint +
	// (for non-admins) the projects filter through the caller's principal.
	const sqoInput = (options.sqo ?? { section_tipo: [sectionTipo] }) as Record<string, unknown>;
	const sqo = sanitizeClientSqo(structuredClone(sqoInput));
	sqo.limit = null as unknown as number; // ALL
	sqo.offset = 0;
	const { sql: builtSql, params } = await buildSearchSql(sqo, {
		principal: context.principal.isGlobalAdmin ? undefined : context.principal,
	});
	const records = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
		section_id: number;
		section_tipo: string;
	}[];

	const unresolved: string[] = [];
	const columns: Record<string, unknown>[] = [];
	const rows: Record<string, unknown>[] = [];
	let endLineOut: Record<string, unknown> | null = null;

	const meta = {
		t: 'meta',
		v: 1,
		data_format: dataFormat,
		breakdown,
		fill_the_gaps: options.fill_the_gaps ?? true,
		section_tipo: sectionTipo,
		total: records.length,
	};

	const tabulator = createTabulator({ dataFormat, breakdown, fillTheGaps, lang });

	/** One record's entries (PHP get_record_atoms), per data format. */
	const buildEntries = async (record: {
		section_id: number;
		section_tipo: string;
	}): Promise<RecordEntry[]> => {
		const entries: RecordEntry[] = [];
		for (const field of fields) {
			const ddoIndex = field.exportColumn?.ordinal ?? 0;
			const path = (field.exportColumn?.path ?? []) as RawPathStep[];
			const firstStep = path[0] ?? {};
			const firstSection = String(
				Array.isArray(firstStep.section_tipo)
					? (firstStep.section_tipo[0] ?? '')
					: (firstStep.section_tipo ?? ''),
			);
			const topComponent = String(firstStep.component_tipo ?? '');
			// PHP get_record_atoms guard: skip ddos that are not direct children
			// of this row's section (multi-section sqo rows).
			if (topComponent === '' || firstSection !== record.section_tipo) continue;
			const topKey = `${firstSection}_${topComponent}`;

			if (dataFormat === 'grid_value') {
				entries.push({
					kind: 'grid',
					ddoIndex,
					atoms: await collectGridAtoms(
						run,
						field,
						record.section_tipo,
						Number(record.section_id),
						lang,
						unresolved,
					),
				});
				continue;
			}

			const topModel = (await getModelByTipo(topComponent)) ?? String(firstStep.model ?? '');
			if (dataFormat === 'dedalo_raw') {
				entries.push({
					kind: 'raw',
					ddoIndex,
					topKey,
					ownSegment: {
						section_tipo: firstSection,
						component_tipo: topComponent,
						model: topModel,
						item_index: null,
						section_id: null,
					},
					...(await buildRawCell(run, record, topComponent, topModel)),
					topModel,
				});
				continue;
			}

			const lastStep = path[path.length - 1] ?? {};
			const leafTipo = String(lastStep.component_tipo ?? '');
			const leafModel = (await getModelByTipo(leafTipo)) ?? String(lastStep.model ?? '');
			const flat = await resolveValueCell(
				run,
				field,
				record.section_tipo,
				Number(record.section_id),
				lang,
				unresolved,
			);
			// Column LABEL segments (PHP export_tabulator :295-302: with atoms the
			// value column's path is atoms[0]->path — the declared chain EXTENDED by
			// the fan-out segments, e.g. 'Denominación | Término'). TS's value cells
			// join through resolveValueCell instead of atoms, so derive the label
			// chain from the first grid atom only when the leaf fans out.
			let labelSegments: ExportSegment[] | undefined;
			if (flat !== null && getColumnNameByModel(leafModel) === 'relation') {
				const labelAtoms = await collectGridAtoms(
					run,
					field,
					record.section_tipo,
					Number(record.section_id),
					lang,
					[], // label derivation never adds unresolved notes
				);
				labelSegments = labelAtoms[0]?.segments;
			}
			entries.push({
				kind: 'value',
				ddoIndex,
				topKey,
				declaredPath: path,
				labelSegments,
				flat,
				leafModel,
				topModel,
			});
		}
		return entries;
	};

	/**
	 * The single protocol-line producer BOTH forms consume: meta, interleaved
	 * col/row lines (col lines precede the first row that uses them — new
	 * columns can mint on ANY record), then the 'end' line (authoritative
	 * display order).
	 */
	async function* protocolLines(): AsyncGenerator<Record<string, unknown>> {
		yield meta;
		for (const record of records) {
			const entries = await buildEntries(record);
			for (const line of await tabulator.recordLines(entries, String(record.section_id))) {
				if (line.t === 'col') columns.push(line);
				else rows.push(line);
				yield line;
			}
		}
		endLineOut = tabulator.endLine();
		yield endLineOut;
	}

	if (wantStream) {
		// NDJSON protocol (PHP stream_export_grid) through the outcome.stream
		// seam (S2-34): bytes leave as each line is produced.
		return {
			result: true,
			msg: 'OK. Request done',
			errors: [],
			stream: ndjsonStream(protocolLines(), 'diffusion/export'),
			streamContentType: 'application/x-ndjson; charset=utf-8',
		};
	}

	// Buffered form: drain the SAME generator; columns/rows fill as it runs.
	for await (const line of protocolLines()) {
		void line;
	}
	const response: ToolResponse = {
		result: {
			meta,
			columns,
			rows,
			end: endLineOut,
		},
		msg: 'OK. Request done',
		errors: [],
	};
	if (unresolved.length > 0) {
		response.errors = unresolved.map((model) => `unresolved export cell model: ${model}`);
	}
	return response;
}

/**
 * dedalo_raw cell of the TOP component (PHP get_raw_export_value: raw export
 * does NOT recurse — the first path component's stored slice, dedalo_data
 * wrapped, dataframe frames alongside; component_section_id stays a plain
 * int, the re-import record key).
 */
async function buildRawCell(
	run: ExportRun,
	record: { section_id: number; section_tipo: string },
	componentTipo: string,
	model: string,
): Promise<{ raw: string | number | null; cellType: string }> {
	if (model === 'component_section_id') {
		return { raw: Number(record.section_id), cellType: 'section_id' };
	}
	const stored = await loadExportRecord(run.atoms, record.section_tipo, Number(record.section_id));
	const column = getColumnNameByModel(model);
	if (column === null) return { raw: null, cellType: 'json' };
	const raw = (stored?.columns[column as never] as unknown as Record<string, unknown> | null)?.[
		componentTipo
	];
	if (raw === undefined || raw === null) return { raw: null, cellType: 'json' };
	// Dataframe slots of this main: relation entries paired by
	// main_component_tipo, ALL item ids (the raw-export contract).
	const { getDataframeChildTipos } = await import(
		'../../core/section/list_definitions/section_list.ts'
	);
	const frames: unknown[] = [];
	for (const frameTipo of await getDataframeChildTipos(componentTipo)) {
		const bag =
			((stored?.columns.relation as Record<string, unknown[]> | null)?.[frameTipo] as
				| { main_component_tipo?: string }[]
				| undefined) ?? [];
		frames.push(...bag.filter((entry) => entry?.main_component_tipo === componentTipo));
	}
	const wrapped =
		frames.length > 0 ? { dedalo_data: { dato: raw, dataframe: frames } } : { dedalo_data: raw };
	return { raw: JSON.stringify(wrapped), cellType: 'json' };
}
