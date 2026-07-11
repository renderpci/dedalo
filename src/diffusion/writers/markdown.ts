/**
 * Markdown writer — the 'markdown' DiffusionWriter (DIFFUSION_SPEC §4.3
 * "markdown: rides the tabular semantics (as today), per-record .md, ZIP
 * only"). PHP oracle: diffusion/class.diffusion_markdown.php.
 *
 * Layout — IDENTICAL to the delete-side grammar so publish and unpublish
 * stay in lockstep (diffusion_delete.ts:297-299; PHP get_record_file_path
 * class.diffusion_markdown.php:74-75):
 *
 *   <root>/markdown/<serviceName>/<section_tipo>_<section_id>.md
 *
 * Document shape (tabular ride: the writer consumes ProjectedRows, all langs
 * of one section_id grouped into ONE file):
 *   - YAML frontmatter (PHP render_frontmatter quoting, :445-448) with
 *     section_tipo / section_id / table / diffusion_element. DETERMINISM
 *     DIVERGENCE, deliberate: PHP adds section_name + title (ontology
 *     lookups writers must not make) and the old engine stamps wall-clock
 *     dates into artifact names — this writer emits NO timestamps at all, so
 *     re-runs over the same data are byte-identical (the P4 crash-recovery
 *     gate depends on it). Ledgered in the run report.
 *   - `# <tableName>` document header, then one `## <lang>` block per lang
 *     ('nolan' for lang-null rows) listing `**<column>**: value` lines for
 *     the non-null, non-empty plan columns (PHP sanitize_md_value applied —
 *     :459-476 — values are NOT HTML-escaped, LLM readability is the goal).
 *
 * removeRecords unlinks the per-record file; missing file = idempotent
 * success (the diffusion_delete.ts markdown posture). close() zips the run's
 * files (`diffusion_md.zip` — the old engine's `diffusion_md_<date>.zip`
 * grammar minus the wall-clock tag; ZIP only, no merged document, PHP
 * parity). abort() is a documented no-op: every per-record file lands via
 * its own temp+rename, so there are no run-scoped temps — already-finalized
 * records stay, exactly like a crashed PHP per-record save loop.
 */

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import {
	atomicWriteFile,
	createZip,
	fileTargetDirLabel,
	formatTargetDir,
	planColumnNames,
	recordFileName,
} from './files.ts';
import type {
	DiffusionWriter,
	WriteBatchResult,
	WriterRunSummary,
	WriterSession,
} from './types.ts';

/** Lang-null rows group under the nolan heading (oracle sentinel vocabulary). */
const NOLAN_HEADING = 'nolan';

/**
 * Neutralize only what breaks Markdown structure: line-leading ATX headers
 * and a lone `---` line (PHP sanitize_md_value, verbatim port).
 */
export function sanitizeMdValue(value: string): string {
	let out = value.trim();
	out = out.replace(/^(\s*)(#{1,6}\s)/gm, '$1\\$2');
	out = out.replace(/^---\s*$/gm, '\\-\\-\\-');
	return out;
}

/** YAML frontmatter block (PHP render_frontmatter: quoted, \ and " escaped). */
export function renderFrontmatter(pairs: Record<string, string>): string {
	let out = '---\n';
	for (const [key, value] of Object.entries(pairs)) {
		const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		out += `${key}: "${escaped}"\n`;
	}
	out += '---\n\n';
	return out;
}

/**
 * Render one record (all langs of one section_id) into a Markdown document.
 * Deterministic: plan column order, ProjectedRow arrival order for langs,
 * no timestamps (see the module doc-comment for the ledgered divergence).
 */
export function renderMarkdownRecord(
	plan: PublicationPlan,
	section: SectionPlan,
	sectionId: number | string,
	rows: ProjectedRow[],
): string {
	let md = renderFrontmatter({
		section_tipo: section.sectionTipo,
		section_id: String(sectionId),
		table: section.tableName,
		diffusion_element: plan.elementTipo,
	});
	md += `# ${sanitizeMdValue(section.tableName)}\n\n`;

	const columnNames = planColumnNames(section);
	for (const row of rows) {
		md += `## ${row.lang ?? NOLAN_HEADING}\n\n`;
		for (const columnName of columnNames) {
			const value = row.columns[columnName] ?? null;
			if (value === null || value === '') continue; // compact documents (PHP posture)
			md += `**${columnName}**: ${sanitizeMdValue(value)}\n`;
		}
		md += '\n';
	}
	return `${md.trimEnd()}\n`;
}

/** Per-table counters feeding the close() summary (mariadb writer shape). */
interface MarkdownTableCounters {
	records_affected: number;
	records_count: number;
}

class MarkdownWriterSession implements WriterSession {
	private readonly plan: PublicationPlan;
	private readonly targetDir: string;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly counters = new Map<string, MarkdownTableCounters>();
	private readonly errors: string[] = [];
	/** Files THIS RUN finalized — the zip manifest. */
	private readonly writtenFiles = new Set<string>();
	private schemaEnsured = false;

	constructor(plan: PublicationPlan) {
		this.plan = plan;
		this.targetDir = formatTargetDir('markdown', fileTargetDirLabel(plan));
		for (const section of plan.sections) {
			this.counters.set(section.tableName, { records_affected: 0, records_count: 0 });
		}
	}

	private countersFor(tableName: string): MarkdownTableCounters {
		let counters = this.counters.get(tableName);
		if (counters === undefined) {
			counters = { records_affected: 0, records_count: 0 };
			this.counters.set(tableName, counters);
		}
		return counters;
	}

	private recordPath(section: SectionPlan, sectionId: number | string): string {
		return `${this.targetDir}/${recordFileName(section.sectionTipo, sectionId, 'md')}`;
	}

	/** File-target "schema" = the run directory exists. */
	async ensureSchema(): Promise<void> {
		mkdirSync(this.targetDir, { recursive: true });
		this.schemaEnsured = true;
	}

	/**
	 * Group the batch's rows per section_id (the projection emits every lang
	 * of a record together — projectRecordRows) and land ONE .md per record,
	 * each via its own temp+rename.
	 */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			throw new Error(
				`markdown writer: writeRows('${section.tableName}') before ensureSchema() — the run directory is created there`,
			);
		}
		const grouped = new Map<string, { sectionId: number | string; rows: ProjectedRow[] }>();
		for (const row of rows) {
			const key = String(row.sectionId);
			let group = grouped.get(key);
			if (group === undefined) {
				group = { sectionId: row.sectionId, rows: [] };
				grouped.set(key, group);
			}
			group.rows.push(row);
		}
		for (const group of grouped.values()) {
			const filePath = this.recordPath(section, group.sectionId);
			atomicWriteFile(
				filePath,
				renderMarkdownRecord(this.plan, section, group.sectionId, group.rows),
			);
			this.writtenFiles.add(filePath);
		}
		const counters = this.countersFor(section.tableName);
		counters.records_affected += grouped.size;
		counters.records_count += rows.length;
		return { written: rows.length, deleted: 0 };
	}

	/**
	 * Unlink the deterministic per-record files. Missing file = idempotent
	 * success with zero deletions (diffusion_delete.ts markdown branch / PHP
	 * delete_record_file "no file found (already removed)").
	 */
	async removeRecords(
		section: SectionPlan,
		sectionIds: (number | string)[],
	): Promise<WriteBatchResult> {
		let deleted = 0;
		for (const sectionId of sectionIds) {
			const filePath = this.recordPath(section, sectionId);
			if (existsSync(filePath)) {
				unlinkSync(filePath);
				deleted++;
			}
			this.writtenFiles.delete(filePath); // never zip a file we just removed
		}
		this.countersFor(section.tableName).records_affected += deleted;
		return { written: 0, deleted };
	}

	/** ZIP the run's files (ZIP only, no merged document — PHP parity). */
	async close(): Promise<WriterRunSummary> {
		if (this.writtenFiles.size > 0) {
			await createZip([...this.writtenFiles], `${this.targetDir}/diffusion_md.zip`);
		}
		return {
			tables: [...this.counters.entries()].map(([tableName, counters]) => ({
				table_name: tableName,
				records_affected: counters.records_affected,
				records_count: counters.records_count,
			})),
			errors: [...this.errors],
		};
	}

	/**
	 * No run-scoped temps to clean: every record file landed via its own
	 * temp+rename inside atomicWriteFile (which already unlinks its temp on
	 * failure). Finalized records stay — the PHP per-record save posture.
	 */
	async abort(): Promise<void> {
		// no-op by design
	}
}

/** The 'markdown' format writer (registry entry). */
export const markdownWriter: DiffusionWriter = {
	format: 'markdown',
	async open(plan: PublicationPlan): Promise<WriterSession> {
		return new MarkdownWriterSession(plan);
	},
};
