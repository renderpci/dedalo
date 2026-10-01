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
 * Streaming: writeRows appends through an awaited file handle onto the
 * table's PARTIAL (files.ts FullExportFile — job-scoped `<final>.part-<jobId>`
 * when a runner drives the session, a `.tmp-*` sibling otherwise; constant
 * memory); close() finalizes partial → atomic rename, zips when the run
 * produced more than one csv, and reports per-table counts.
 *
 * A RUN, NOT A SESSION (DIFF-1): checkpoint() fsyncs every partial and returns
 * its durable length; a resumed session of the same job (open with that
 * checkpoint) cuts the partial back to it and appends — the published csv is
 * the snapshot of the WHOLE run, never only of the rows written after a crash.
 * A checkpoint whose partial is gone or short answers `restart_required`.
 * abort() keeps a job-scoped partial (the job resumes from it) and deletes only
 * a session-owned temp. (The plan compiler cannot reach csv today —
 * KNOWN_FORMATS — so this contract is gated at writer level.)
 *
 * removeRecords honesty: csv is a FULL-EXPORT format — a published csv is a
 * complete snapshot, so "remove record X" only means something relative to
 * rows written in the SAME run. When the section's file was started this run,
 * close() filters every id the RUN removed (context.removed — the run ledger)
 * out during finalize; otherwise the call is a no-op that leaves a warning in
 * the run summary (there is no existing artifact to surgically edit —
 * re-publish to regenerate).
 */

import { mkdirDurably } from '../../core/files/durable.ts';
import { neutralizeSpreadsheetFormula } from '../../core/files/spreadsheet_formula.ts';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import {
	ArtifactEventLog,
	createZip,
	type FullExportCheckpoint,
	FullExportFile,
	fileTargetDirLabel,
	formatTargetDir,
	planColumnNames,
	removedIdSet,
	sweepOrphanPartials,
	sweepStaleTemps,
	WriterErrors,
} from './files.ts';
import type {
	ArtifactEvent,
	DiffusionWriter,
	WriteBatchResult,
	WriterCloseContext,
	WriterContinuity,
	WriterOpenContext,
	WriterRunSummary,
	WriterSession,
} from './types.ts';

/** RFC4180 quoting + spreadsheet formula-injection neutralization. */
export function csvField(value: string): string {
	let out = neutralizeSpreadsheetFormula(value);
	// RFC4180: quote when the field contains comma, quote, CR or LF.
	if (/[",\r\n]/.test(out)) {
		out = `"${out.replace(/"/g, '""')}"`;
	}
	return out;
}

/** One csv record line (LF-terminated; null → empty field). */
function csvLine(values: (string | null)[]): string {
	return `${values.map((value) => csvField(value ?? '')).join(',')}\n`;
}

/** Per-section streaming state. */
interface CsvSectionState {
	section: SectionPlan;
	file: FullExportFile;
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
	private readonly targetDir: string;
	private readonly jobId: string | null;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly states = new Map<string, CsvSectionState>();
	private readonly errors: WriterErrors;
	private readonly events: ArtifactEventLog;
	private schemaEnsured = false;
	continuity: WriterContinuity = 'fresh';

	constructor(plan: PublicationPlan, context?: WriterOpenContext) {
		this.targetDir = formatTargetDir('csv', fileTargetDirLabel(plan));
		this.jobId = context?.jobId ?? null;
		this.errors = new WriterErrors(context?.resume ?? null);
		this.events = new ArtifactEventLog(context);
		for (const section of plan.sections) this.stateFor(section);
	}

	/** Honour the resume checkpoint (open-time; see FullExportFile.resume). */
	async restore(resume: unknown): Promise<void> {
		if (resume === null || resume === undefined) return;
		const tables = ((resume as { tables?: unknown }).tables ?? {}) as Record<
			string,
			Partial<FullExportCheckpoint>
		>;
		let honoured = true;
		for (const [tableName, state] of this.states) {
			if (!(await state.file.resume(tables[tableName]))) honoured = false;
		}
		this.continuity = honoured ? 'resumed' : 'restart_required';
	}

	private stateFor(section: SectionPlan): CsvSectionState {
		let state = this.states.get(section.tableName);
		if (state === undefined) {
			state = {
				section,
				file: new FullExportFile(`${this.targetDir}/${section.tableName}.csv`, this.jobId),
			};
			this.states.set(section.tableName, state);
		}
		return state;
	}

	/** File-target "schema" = the run directory exists. */
	async ensureSchema(): Promise<void> {
		mkdirDurably(this.targetDir);
		this.schemaEnsured = true;
	}

	/** Append rows to the section's partial (header on the run's first write). */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			throw new Error(
				`csv writer: writeRows('${section.tableName}') before ensureSchema() — the run directory is created there`,
			);
		}
		const state = this.stateFor(section);
		const columnNames = planColumnNames(section);
		let text = state.file.started ? '' : csvLine(['section_id', 'lang', ...columnNames]);
		for (const row of rows) {
			text += csvLine([
				String(row.sectionId),
				row.lang ?? '',
				...columnNames.map((columnName) => row.columns[columnName] ?? null),
			]);
		}
		await state.file.append(text);
		state.file.written += rows.length;
		return { written: rows.length, deleted: 0 };
	}

	/**
	 * Record ids to filter out at finalize — only meaningful when this run
	 * started the section's file (see the module doc-comment for the honest
	 * full-export stance). Deleted counts land in the close() summary once
	 * the filter actually runs.
	 */
	async removeRecords(
		section: SectionPlan,
		sectionIds: (number | string)[],
	): Promise<WriteBatchResult> {
		if (sectionIds.length === 0) return { written: 0, deleted: 0 };
		const state = this.stateFor(section);
		if (!state.file.started) {
			this.errors.add(
				`csv removeRecords('${section.tableName}'): no csv written this run — csv is a full-export format; re-publish the element to regenerate the file without these records.`,
			);
			return { written: 0, deleted: 0 };
		}
		for (const sectionId of sectionIds) this.events.note('removed', section.sectionTipo, sectionId);
		return { written: 0, deleted: 0 };
	}

	takeArtifacts(): ArtifactEvent[] {
		return this.events.take();
	}

	/** Durability barrier: every partial fsynced; its durable length + counters, and the error lines. */
	async checkpoint(): Promise<unknown> {
		const tables: Record<string, FullExportCheckpoint> = {};
		for (const [tableName, state] of this.states) tables[tableName] = await state.file.durable();
		return { tables, errors: this.errors.list() };
	}

	runSummary(): WriterRunSummary {
		return {
			tables: [...this.states.values()].map((state) => ({
				table_name: state.section.tableName,
				records_affected: state.file.written + state.file.deleted,
				records_count: state.file.written,
			})),
			errors: this.errors.list(),
		};
	}

	/** Finalize partials (filtering the run's removed ids) → atomic rename → zip (>1 file). */
	async close(context?: WriterCloseContext): Promise<WriterRunSummary> {
		const run = this.events.closeContext(context);
		// This session's own partials are temps too (a job-less session's are
		// `.tmp-*`): never swept from under the finalize below.
		await sweepStaleTemps(
			this.targetDir,
			run,
			[...this.states.values()].map((state) => state.file.partialPath),
		);
		const finalizedPaths: string[] = [];
		for (const state of this.states.values()) {
			if (!state.file.started) continue;
			await state.file.finalize(
				await removedIdSet(run, state.section.sectionTipo),
				filterCsvRecords,
			);
			finalizedPaths.push(state.file.finalPath);
		}
		if (finalizedPaths.length > 1) {
			await createZip(finalizedPaths, `${this.targetDir}/diffusion_csv.zip`);
		}
		await sweepOrphanPartials(this.targetDir, run, this.jobId);
		return this.runSummary();
	}

	/** Release the handles; a job-scoped partial stays for the job's resume (FullExportFile.abort). */
	async abort(): Promise<void> {
		for (const state of this.states.values()) await state.file.abort();
	}
}

/** The 'csv' format writer (registry entry). */
export const csvWriter: DiffusionWriter = {
	format: 'csv',
	async open(plan: PublicationPlan, context?: WriterOpenContext): Promise<WriterSession> {
		const session = new CsvWriterSession(plan, context);
		await session.restore(context?.resume ?? null);
		return session;
	},
};
