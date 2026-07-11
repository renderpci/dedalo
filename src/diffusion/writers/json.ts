/**
 * JSON writer — the 'json' DiffusionWriter (DIFFUSION_SPEC §4.3 "csv / json:
 * new first-class; one streamed file per table target, ZIP on close").
 *
 * Layout: `<root>/json/<dirLabel>/` with, per SectionPlan:
 *   - `<tableName>.ndjson` — one JSON object per line
 *     `{"section_id":…,"lang":…,"columns":{…}}` (streaming-friendly; matches
 *     the tree's NDJSON precedents, e.g. tool_export's export_tabulator
 *     protocol) — columns restricted to the ordered non-excluded plan
 *     columns;
 *   - `<tableName>.meta.json` — the plan's column list, lang policy and the
 *     run's counts (written at close, after the counts are final).
 *
 * Same discipline as csv.ts: FileSink streaming onto a sibling temp,
 * temp → atomic rename at close, ZIP when more than one section produced a
 * data file (`diffusion_json.zip`, data + meta files), abort() drops temps.
 *
 * removeRecords: identical full-export stance as csv (see csv.ts doc): when
 * the section's ndjson was written this run the removed section_ids are
 * filtered out at finalize (NDJSON lines are single-line JSON, so a line
 * filter is exact); otherwise no-op + a warning in the summary.
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import type { FileSink } from 'bun';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import {
	atomicWriteFile,
	createZip,
	fileTargetDirLabel,
	formatTargetDir,
	planColumnNames,
	tempPathFor,
} from './files.ts';
import type {
	DiffusionWriter,
	WriteBatchResult,
	WriterRunSummary,
	WriterSession,
} from './types.ts';

/** One NDJSON line for a ProjectedRow (columns in plan order, LF-terminated). */
function ndjsonLine(row: ProjectedRow, columnNames: string[]): string {
	const columns: Record<string, string | null> = {};
	for (const columnName of columnNames) {
		columns[columnName] = row.columns[columnName] ?? null;
	}
	return `${JSON.stringify({ section_id: row.sectionId, lang: row.lang, columns })}\n`;
}

/**
 * Stream-filter a finalized ndjson temp: drop lines whose section_id is in
 * `removedIds`. Exact because JSON.stringify never emits raw newlines —
 * every line is one complete record.
 */
export async function filterNdjsonRecords(
	inputPath: string,
	outputPath: string,
	removedIds: ReadonlySet<string>,
): Promise<{ kept: number; dropped: number }> {
	const outSink = Bun.file(outputPath).writer();
	const decoder = new TextDecoder('utf-8');
	let pending = '';
	let kept = 0;
	let dropped = 0;

	const handleLine = (line: string): void => {
		if (line === '') return;
		const parsed = JSON.parse(line) as { section_id: number | string };
		if (removedIds.has(String(parsed.section_id))) {
			dropped++;
		} else {
			outSink.write(`${line}\n`);
			kept++;
		}
	};

	const stream = Bun.file(inputPath).stream();
	for await (const chunk of stream) {
		pending += decoder.decode(chunk, { stream: true });
		let newlineIndex = pending.indexOf('\n');
		while (newlineIndex !== -1) {
			handleLine(pending.slice(0, newlineIndex));
			pending = pending.slice(newlineIndex + 1);
			newlineIndex = pending.indexOf('\n');
		}
	}
	pending += decoder.decode();
	handleLine(pending); // trailing line without newline (defensive)
	await outSink.end();
	return { kept, dropped };
}

/** Per-section streaming state. */
interface JsonSectionState {
	section: SectionPlan;
	finalPath: string;
	metaPath: string;
	tempPath: string;
	sink: FileSink | null;
	written: number;
	deleted: number;
	removedIds: Set<string>;
}

class JsonWriterSession implements WriterSession {
	private readonly plan: PublicationPlan;
	private readonly targetDir: string;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly states = new Map<string, JsonSectionState>();
	private readonly errors: string[] = [];
	private schemaEnsured = false;

	constructor(plan: PublicationPlan) {
		this.plan = plan;
		this.targetDir = formatTargetDir('json', fileTargetDirLabel(plan));
		for (const section of plan.sections) this.stateFor(section);
	}

	private stateFor(section: SectionPlan): JsonSectionState {
		let state = this.states.get(section.tableName);
		if (state === undefined) {
			const finalPath = `${this.targetDir}/${section.tableName}.ndjson`;
			state = {
				section,
				finalPath,
				metaPath: `${this.targetDir}/${section.tableName}.meta.json`,
				tempPath: tempPathFor(finalPath),
				sink: null,
				written: 0,
				deleted: 0,
				removedIds: new Set(),
			};
			this.states.set(section.tableName, state);
		}
		return state;
	}

	/** File-target "schema" = the run directory exists. */
	async ensureSchema(): Promise<void> {
		mkdirSync(this.targetDir, { recursive: true });
		this.schemaEnsured = true;
	}

	/** Append NDJSON lines to the section's streamed temp. */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			throw new Error(
				`json writer: writeRows('${section.tableName}') before ensureSchema() — the run directory is created there`,
			);
		}
		const state = this.stateFor(section);
		const columnNames = planColumnNames(section);
		if (state.sink === null) {
			state.sink = Bun.file(state.tempPath).writer();
		}
		for (const row of rows) {
			state.sink.write(ndjsonLine(row, columnNames));
		}
		state.written += rows.length;
		return { written: rows.length, deleted: 0 };
	}

	/** Same full-export stance as csv.ts removeRecords (see its doc-comment). */
	async removeRecords(
		section: SectionPlan,
		sectionIds: (number | string)[],
	): Promise<WriteBatchResult> {
		if (sectionIds.length === 0) return { written: 0, deleted: 0 };
		const state = this.stateFor(section);
		if (state.sink === null) {
			this.errors.push(
				`json removeRecords('${section.tableName}'): no ndjson written this run — json is a full-export format; re-publish the element to regenerate the file without these records.`,
			);
			return { written: 0, deleted: 0 };
		}
		for (const sectionId of sectionIds) state.removedIds.add(String(sectionId));
		return { written: 0, deleted: 0 };
	}

	/** Finalize temps (filter removed ids) → rename, write metas, zip (>1 section). */
	async close(): Promise<WriterRunSummary> {
		const dataPaths: string[] = [];
		const metaPaths: string[] = [];
		for (const state of this.states.values()) {
			if (state.sink === null) continue;
			await state.sink.end();
			state.sink = null;
			if (state.removedIds.size > 0) {
				const filteredPath = tempPathFor(state.finalPath);
				const { dropped } = await filterNdjsonRecords(
					state.tempPath,
					filteredPath,
					state.removedIds,
				);
				state.deleted += dropped;
				state.written -= dropped;
				unlinkSync(state.tempPath);
				renameSync(filteredPath, state.finalPath);
			} else {
				renameSync(state.tempPath, state.finalPath);
			}
			dataPaths.push(state.finalPath);

			// Meta sidecar: the plan's shape + this run's final counts.
			atomicWriteFile(
				state.metaPath,
				`${JSON.stringify(
					{
						table_name: state.section.tableName,
						section_tipo: state.section.sectionTipo,
						columns: planColumnNames(state.section),
						langs: this.plan.langPolicy.langs,
						main_lang: this.plan.langPolicy.mainLang,
						records_count: state.written,
						records_removed: state.deleted,
					},
					null,
					'\t',
				)}\n`,
			);
			metaPaths.push(state.metaPath);
		}
		if (dataPaths.length > 1) {
			await createZip([...dataPaths, ...metaPaths], `${this.targetDir}/diffusion_json.zip`);
		}
		return {
			tables: [...this.states.values()].map((state) => ({
				table_name: state.section.tableName,
				records_affected: state.written + state.deleted,
				records_count: state.written,
			})),
			errors: [...this.errors],
		};
	}

	/** Drop every in-flight temp — nothing partial ever reaches a final path. */
	async abort(): Promise<void> {
		for (const state of this.states.values()) {
			if (state.sink !== null) {
				try {
					await state.sink.end();
				} catch {
					// already broken — temp unlink below is the cleanup that matters
				}
				state.sink = null;
			}
			if (existsSync(state.tempPath)) unlinkSync(state.tempPath);
		}
	}
}

/** The 'json' format writer (registry entry). */
export const jsonWriter: DiffusionWriter = {
	format: 'json',
	async open(plan: PublicationPlan): Promise<WriterSession> {
		return new JsonWriterSession(plan);
	},
};
