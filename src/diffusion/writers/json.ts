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
 * Same discipline as csv.ts: streamed onto the table's partial (files.ts
 * FullExportFile — job-scoped when a runner drives the session, so a resumed
 * run continues the SAME snapshot from its last checkpoint, DIFF-1), partial →
 * atomic rename at close, ZIP when more than one section produced a data file
 * (`diffusion_json.zip`, data + meta files); abort() keeps a job-scoped
 * partial and deletes only a session-owned temp.
 *
 * removeRecords: identical full-export stance as csv (see csv.ts doc): when
 * the section's ndjson was started this run, every id the RUN removed is
 * filtered out at finalize (NDJSON lines are single-line JSON, so a line
 * filter is exact); otherwise no-op + a warning in the summary.
 */

import { mkdirSync } from 'node:fs';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import {
	ArtifactEventLog,
	atomicWriteFile,
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
		// A PUBLISHED record line: its section_id keeps whatever form the writer
		// emitted (the published shape is a pinned edge), so the union stays and
		// the membership test compares as text — WC-2026-08-10-section-id-int-canonical.
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
	metaPath: string;
	file: FullExportFile;
}

class JsonWriterSession implements WriterSession {
	private readonly plan: PublicationPlan;
	private readonly targetDir: string;
	private readonly jobId: string | null;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly states = new Map<string, JsonSectionState>();
	private readonly errors: WriterErrors;
	private readonly events: ArtifactEventLog;
	private schemaEnsured = false;
	continuity: WriterContinuity = 'fresh';

	constructor(plan: PublicationPlan, context?: WriterOpenContext) {
		this.plan = plan;
		this.targetDir = formatTargetDir('json', fileTargetDirLabel(plan));
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

	private stateFor(section: SectionPlan): JsonSectionState {
		let state = this.states.get(section.tableName);
		if (state === undefined) {
			state = {
				section,
				metaPath: `${this.targetDir}/${section.tableName}.meta.json`,
				file: new FullExportFile(`${this.targetDir}/${section.tableName}.ndjson`, this.jobId),
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

	/** Append NDJSON lines to the section's partial. */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			throw new Error(
				`json writer: writeRows('${section.tableName}') before ensureSchema() — the run directory is created there`,
			);
		}
		const state = this.stateFor(section);
		const columnNames = planColumnNames(section);
		let text = '';
		for (const row of rows) text += ndjsonLine(row, columnNames);
		await state.file.append(text);
		state.file.written += rows.length;
		return { written: rows.length, deleted: 0 };
	}

	/** Same full-export stance as csv.ts removeRecords (see its doc-comment). */
	async removeRecords(
		section: SectionPlan,
		sectionIds: (number | string)[],
	): Promise<WriteBatchResult> {
		if (sectionIds.length === 0) return { written: 0, deleted: 0 };
		const state = this.stateFor(section);
		if (!state.file.started) {
			this.errors.add(
				`json removeRecords('${section.tableName}'): no ndjson written this run — json is a full-export format; re-publish the element to regenerate the file without these records.`,
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

	/** Finalize partials (filter the run's removed ids) → rename, write metas, zip (>1 section). */
	async close(context?: WriterCloseContext): Promise<WriterRunSummary> {
		const run = this.events.closeContext(context);
		// This session's own partials are temps too (a job-less session's are
		// `.tmp-*`): never swept from under the finalize below.
		await sweepStaleTemps(
			this.targetDir,
			run,
			[...this.states.values()].map((state) => state.file.partialPath),
		);
		const dataPaths: string[] = [];
		const metaPaths: string[] = [];
		for (const state of this.states.values()) {
			if (!state.file.started) continue;
			await state.file.finalize(
				await removedIdSet(run, state.section.sectionTipo),
				filterNdjsonRecords,
			);
			dataPaths.push(state.file.finalPath);

			// Meta sidecar: the plan's shape + this RUN's final counts.
			atomicWriteFile(
				state.metaPath,
				`${JSON.stringify(
					{
						table_name: state.section.tableName,
						section_tipo: state.section.sectionTipo,
						columns: planColumnNames(state.section),
						langs: this.plan.langPolicy.langs,
						main_lang: this.plan.langPolicy.mainLang,
						records_count: state.file.written,
						records_removed: state.file.deleted,
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
		await sweepOrphanPartials(this.targetDir, run, this.jobId);
		return this.runSummary();
	}

	/** Release the handles; a job-scoped partial stays for the job's resume (FullExportFile.abort). */
	async abort(): Promise<void> {
		for (const state of this.states.values()) await state.file.abort();
	}
}

/** The 'json' format writer (registry entry). */
export const jsonWriter: DiffusionWriter = {
	format: 'json',
	async open(plan: PublicationPlan, context?: WriterOpenContext): Promise<WriterSession> {
		const session = new JsonWriterSession(plan, context);
		await session.restore(context?.resume ?? null);
		return session;
	},
};
