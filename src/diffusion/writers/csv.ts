/**
 * CSV writer — the 'csv' DiffusionWriter (DIFFUSION_SPEC §4.3 "csv / json:
 * new first-class; one streamed file per table target, ZIP on close").
 *
 * Layout: `<root>/csv/<dirLabel>/<tableName>.csv` (dirLabel = serviceName for
 * 'files' targets, database for 'table' targets — files.ts). One file per
 * SectionPlan; header = `section_id,lang` + the ordered non-excluded plan
 * columns; one line per ProjectedRow. RFC4180 quoting (fields containing
 * `,` `"` CR or LF are quoted, embedded quotes doubled); UTF-8, no BOM,
 * LF line endings; null columns emit the empty field.
 *
 * Streaming: writeRows appends through a Bun FileSink on a sibling temp file
 * (constant memory); close() finalizes temp → atomic rename, zips when the
 * run produced more than one csv, and reports per-table counts. abort()
 * discards the temps.
 *
 * removeRecords honesty: csv is a FULL-EXPORT format — a published csv is a
 * complete snapshot, so "remove record X" only means something relative to
 * rows written in the SAME run. When the section's file was written this run,
 * close() filters the removed section_ids out during finalize; otherwise the
 * call is a no-op that leaves a warning in the run summary (there is no
 * existing artifact to surgically edit — re-publish to regenerate).
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import type { FileSink } from 'bun';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import {
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

/** RFC4180: quote when the field contains comma, quote, CR or LF. */
export function csvField(value: string): string {
	if (/[",\r\n]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/** One csv record line (LF-terminated; null → empty field). */
function csvLine(values: (string | null)[]): string {
	return `${values.map((value) => csvField(value ?? '')).join(',')}\n`;
}

/** Per-section streaming state. */
interface CsvSectionState {
	section: SectionPlan;
	finalPath: string;
	tempPath: string;
	sink: FileSink | null;
	written: number;
	deleted: number;
	removedIds: Set<string>;
}

/**
 * Stream-filter a finalized csv temp: drop data records whose FIRST field
 * (section_id) is in `removedIds`, keep the header. Quote-aware record
 * boundary detection (a lone `"` toggles quoted state; RFC4180 doubled
 * quotes toggle twice = net unchanged), so quoted embedded newlines never
 * split a record. Constant memory: one record buffered at a time.
 */
export async function filterCsvRecords(
	inputPath: string,
	outputPath: string,
	removedIds: ReadonlySet<string>,
): Promise<{ kept: number; dropped: number }> {
	const outSink = Bun.file(outputPath).writer();
	const decoder = new TextDecoder('utf-8');
	let record = '';
	let inQuotes = false;
	let isHeader = true;
	let kept = 0;
	let dropped = 0;

	const flushRecord = (): void => {
		if (record === '') return;
		if (isHeader) {
			outSink.write(record);
			isHeader = false;
		} else if (removedIds.has(firstCsvField(record))) {
			dropped++;
		} else {
			outSink.write(record);
			kept++;
		}
		record = '';
	};

	const stream = Bun.file(inputPath).stream();
	for await (const chunk of stream) {
		const text = decoder.decode(chunk, { stream: true });
		for (const char of text) {
			record += char;
			if (char === '"') inQuotes = !inQuotes;
			else if (char === '\n' && !inQuotes) flushRecord();
		}
	}
	record += decoder.decode();
	flushRecord(); // trailing record without newline (defensive; we always write LF)
	await outSink.end();
	return { kept, dropped };
}

/** First field of a csv record, unquoted (section_id column). */
function firstCsvField(record: string): string {
	if (record.startsWith('"')) {
		let field = '';
		for (let index = 1; index < record.length; index++) {
			const char = record[index];
			if (char === '"') {
				if (record[index + 1] === '"') {
					field += '"';
					index++;
					continue;
				}
				break; // closing quote
			}
			field += char;
		}
		return field;
	}
	const comma = record.indexOf(',');
	const end = comma === -1 ? record.length : comma;
	return record.slice(0, end).replace(/[\r\n]+$/, '');
}

class CsvWriterSession implements WriterSession {
	private readonly plan: PublicationPlan;
	private readonly targetDir: string;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly states = new Map<string, CsvSectionState>();
	private readonly errors: string[] = [];
	private schemaEnsured = false;

	constructor(plan: PublicationPlan) {
		this.plan = plan;
		this.targetDir = formatTargetDir('csv', fileTargetDirLabel(plan));
		for (const section of plan.sections) this.stateFor(section);
	}

	private stateFor(section: SectionPlan): CsvSectionState {
		let state = this.states.get(section.tableName);
		if (state === undefined) {
			const finalPath = `${this.targetDir}/${section.tableName}.csv`;
			state = {
				section,
				finalPath,
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

	/** Append rows to the section's streamed temp (header on first write). */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			throw new Error(
				`csv writer: writeRows('${section.tableName}') before ensureSchema() — the run directory is created there`,
			);
		}
		const state = this.stateFor(section);
		const columnNames = planColumnNames(section);
		if (state.sink === null) {
			state.sink = Bun.file(state.tempPath).writer();
			state.sink.write(csvLine(['section_id', 'lang', ...columnNames]));
		}
		for (const row of rows) {
			state.sink.write(
				csvLine([
					String(row.sectionId),
					row.lang ?? '',
					...columnNames.map((columnName) => row.columns[columnName] ?? null),
				]),
			);
		}
		state.written += rows.length;
		return { written: rows.length, deleted: 0 };
	}

	/**
	 * Collect ids to filter out at finalize — only meaningful when this run
	 * wrote the section's file (see the module doc-comment for the honest
	 * full-export stance). Deleted counts land in the close() summary once
	 * the filter actually runs.
	 */
	async removeRecords(
		section: SectionPlan,
		sectionIds: (number | string)[],
	): Promise<WriteBatchResult> {
		if (sectionIds.length === 0) return { written: 0, deleted: 0 };
		const state = this.stateFor(section);
		if (state.sink === null) {
			this.errors.push(
				`csv removeRecords('${section.tableName}'): no csv written this run — csv is a full-export format; re-publish the element to regenerate the file without these records.`,
			);
			return { written: 0, deleted: 0 };
		}
		for (const sectionId of sectionIds) state.removedIds.add(String(sectionId));
		return { written: 0, deleted: 0 };
	}

	/** Finalize temps (filtering removed ids) → atomic rename → zip (>1 file). */
	async close(): Promise<WriterRunSummary> {
		const finalizedPaths: string[] = [];
		for (const state of this.states.values()) {
			if (state.sink === null) continue;
			await state.sink.end();
			state.sink = null;
			if (state.removedIds.size > 0) {
				const filteredPath = tempPathFor(state.finalPath);
				const { dropped } = await filterCsvRecords(state.tempPath, filteredPath, state.removedIds);
				state.deleted += dropped;
				state.written -= dropped;
				unlinkSync(state.tempPath);
				renameSync(filteredPath, state.finalPath);
			} else {
				renameSync(state.tempPath, state.finalPath);
			}
			finalizedPaths.push(state.finalPath);
		}
		if (finalizedPaths.length > 1) {
			await createZip(finalizedPaths, `${this.targetDir}/diffusion_csv.zip`);
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

/** The 'csv' format writer (registry entry). */
export const csvWriter: DiffusionWriter = {
	format: 'csv',
	async open(plan: PublicationPlan): Promise<WriterSession> {
		return new CsvWriterSession(plan);
	},
};
