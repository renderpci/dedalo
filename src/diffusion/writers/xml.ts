/**
 * XML writer — the 'xml' DiffusionWriter (DIFFUSION_SPEC §4.3 "rdf / xml:
 * one deterministic file per record; close() does type-aware merge + ZIP,
 * all temp+rename"). PHP oracle: diffusion/class.diffusion_xml.php
 * (DOMDocument render_dom + write_file); merge grammar: old engine
 * diffusion/api/v1/lib/rdf_file_utils.ts merge_xml_parts (:96-121).
 *
 * Layout — IDENTICAL to the delete-side grammar so publish and unpublish
 * stay in lockstep (diffusion_delete.ts resolvePublishedFilePath :367-369;
 * PHP get_record_file_path class.diffusion_xml.php:565-566):
 *
 *   <root>/xml/<serviceName>/<section_tipo>_<section_id>.xml
 *
 * Document shape (PHP render_dom: DOMDocument('1.0','UTF-8') with
 * formatOutput pretty-print = 2-space indent; root node = the diffusion
 * root's ontology label, fields = child elements named by their labels,
 * translatable values = per-lang alpha2 child elements — class.diffusion_xml
 * .php resolve_langs :1164-1226 "<title><en>My title</en><es>Mi título</es>
 * </title>"; real v6-published fixture media_mib/xml/numisdata5_5777_*.xml
 * shows the same declaration + 2-space nesting):
 *
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <publication_bulletin>
 *     <title>
 *       <en>My title</en>
 *       <es>Mi título</es>
 *     </title>
 *   </publication_bulletin>
 *
 * Element names pass through sanitizeXmlNodeName — the VERBATIM port of PHP
 * sanitize_xml_node_name (:1245-1268; invalid chars → '_', digit/period
 * start → '_' prefix, reserved 'xml' prefix → 'x' prefix). The tabular ride:
 * this writer consumes ProjectedRows like csv/json/markdown — lang-null rows
 * render the value inline in the field element (PHP single-nolan-lang
 * inline case :1176-1179); lang-coded rows render per-lang children. Null
 * columns are omitted entirely; empty strings render empty elements (PHP
 * createElement without a text child).
 *
 * Ledgered divergences (deliberate, determinism):
 * - NO wall-clock: consolidated artifacts are `diffusion_xml_merged.xml` /
 *   `diffusion_xml.zip` (old engine stamped `_<date>` tags — dropped like
 *   the markdown writer's zip; who/when live in the dd1758 activity log).
 * - removeRecords unlinks the canonical file only — the TS delete-side
 *   grammar (diffusion_delete.ts has no xml legacy-variant branch; PHP
 *   delete_record_file additionally globbed pre-v7 timestamped names).
 *   Publish/delete stay in lockstep with diffusion_delete.ts, the single
 *   source of truth on this side.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import {
	atomicWriteFile,
	createZip,
	formatTargetDir,
	planColumnNames,
	recordFileName,
} from './files.ts';
import {
	CONSOLIDATED_MERGED_PREFIX,
	CONSOLIDATED_ZIP_PREFIX,
	escapeXmlText,
	langToAlpha2,
	requireFilesTarget,
} from './rdf.ts';
import type {
	DiffusionWriter,
	WriteBatchResult,
	WriterRunSummary,
	WriterSession,
} from './types.ts';

/**
 * Ensure a label is a legal XML element name — VERBATIM port of PHP
 * sanitize_xml_node_name (class.diffusion_xml.php:1245-1268): strip invalid
 * chars to '_', force a letter/underscore start, guard the reserved 'xml'
 * prefix. Empty input sanitizes to '_' (PHP would skip the node; the tabular
 * plan never emits empty labels — compile validates them).
 */
export function sanitizeXmlNodeName(name: string): string {
	// 1. keep letters, digits, hyphens, underscores and periods only
	let sanitized = name.replace(/[^a-zA-Z0-9_\-.]/g, '_');
	// 2. XML names must start with a letter or underscore
	if (!/^[a-zA-Z_]/.test(sanitized)) {
		sanitized = `_${sanitized}`;
	}
	// 3. reserved 'xml' prefix (case-insensitive) → prepend 'x'
	if (/^xml/i.test(sanitized)) {
		sanitized = `x${sanitized}`;
	}
	return sanitized;
}

/**
 * Render one record (all langs of one section_id) as a standalone XML
 * document — see the module doc-comment for the PHP-anchored shape.
 */
export function renderXmlRecord(section: SectionPlan, rows: ProjectedRow[]): string {
	const rootName = sanitizeXmlNodeName(section.tableName);
	const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<${rootName}>`];

	for (const columnName of planColumnNames(section)) {
		const fieldName = sanitizeXmlNodeName(columnName);
		// null columns omitted: skip the element when NO row carries a value
		const valuedRows = rows.filter((row) => (row.columns[columnName] ?? null) !== null);
		if (valuedRows.length === 0) continue;

		const inline = valuedRows.length === 1 && valuedRows[0]?.lang === null;
		if (inline) {
			// nolan single value → inline text (PHP resolve_langs :1176-1179)
			const value = valuedRows[0]?.columns[columnName] ?? '';
			lines.push(
				value === ''
					? `  <${fieldName}/>`
					: `  <${fieldName}>${escapeXmlText(value)}</${fieldName}>`,
			);
			continue;
		}
		// translatable → one alpha2 child per lang (PHP :1211-1222)
		lines.push(`  <${fieldName}>`);
		for (const row of valuedRows) {
			const value = row.columns[columnName] as string;
			const langName = sanitizeXmlNodeName(row.lang === null ? 'nolan' : langToAlpha2(row.lang));
			lines.push(
				value === ''
					? `    <${langName}/>`
					: `    <${langName}>${escapeXmlText(value)}</${langName}>`,
			);
		}
		lines.push(`  </${fieldName}>`);
	}

	lines.push(`</${rootName}>`);
	return `${lines.join('\n')}\n`;
}

/**
 * Generic XML consolidation — VERBATIM port of the old engine's
 * merge_xml_parts (rdf_file_utils.ts:96-121): root element (name + attrs)
 * from the FIRST part, every part's root-children concatenated under it.
 * Parts without the first root are included whole (old-engine behavior).
 * Single part returns untouched; empty input returns ''.
 */
export function mergeXmlParts(rawParts: string[]): string {
	const nonEmpty = rawParts.filter((part) => part && part.trim().length > 0);
	if (nonEmpty.length === 0) return '';
	if (nonEmpty.length === 1) return nonEmpty[0] as string;

	const first = nonEmpty[0] as string;
	const rootMatch =
		first.match(/<\?xml[^>]*\?>\s*<([A-Za-z_][\w:.-]*)([^>]*)>/) ??
		first.match(/^\s*<([A-Za-z_][\w:.-]*)([^>]*)>/);
	if (!rootMatch) return nonEmpty.join('\n');

	const rootName = rootMatch[1] as string;
	const rootAttrs = rootMatch[2] ?? '';

	const innerBlocks = nonEmpty
		.map((part) => {
			const open = part.indexOf(`<${rootName}`);
			const openEnd = part.indexOf('>', open);
			const close = part.lastIndexOf(`</${rootName}>`);
			if (open === -1 || close === -1 || openEnd === -1 || close <= openEnd) return part.trim();
			return part.slice(openEnd + 1, close).trim();
		})
		.filter((block) => block.length > 0)
		.join('\n\n');

	return `<?xml version="1.0" encoding="utf-8"?>\n<${rootName}${rootAttrs}>\n\n${innerBlocks}\n\n</${rootName}>\n`;
}

/** Consolidated artifact names — old grammar minus the wall-clock date tag. */
const XML_MERGED_NAME = 'diffusion_xml_merged.xml';
const XML_ZIP_NAME = 'diffusion_xml.zip';

/** Per-table counters feeding the close() summary (markdown writer shape). */
interface XmlTableCounters {
	records_affected: number;
	records_count: number;
}

class XmlWriterSession implements WriterSession {
	private readonly serviceName: string;
	private readonly targetDir: string;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly counters = new Map<string, XmlTableCounters>();
	private readonly errors: string[] = [];
	/** Files THIS RUN finalized, insertion-ordered — merge + zip manifest. */
	private readonly writtenFiles = new Set<string>();
	private schemaEnsured = false;

	constructor(plan: PublicationPlan) {
		this.serviceName = requireFilesTarget('xml', plan);
		this.targetDir = formatTargetDir('xml', this.serviceName);
		for (const section of plan.sections) {
			this.counters.set(section.tableName, { records_affected: 0, records_count: 0 });
		}
	}

	private countersFor(tableName: string): XmlTableCounters {
		let counters = this.counters.get(tableName);
		if (counters === undefined) {
			counters = { records_affected: 0, records_count: 0 };
			this.counters.set(tableName, counters);
		}
		return counters;
	}

	/**
	 * Per-record file path — the EXACT delete-side grammar
	 * (diffusion_delete.ts:367-369 `${sectionTipo}_${sectionId}.xml`; PHP
	 * class.diffusion_xml.php:565).
	 */
	private recordPath(section: SectionPlan, sectionId: number | string): string {
		return `${this.targetDir}/${recordFileName(section.sectionTipo, sectionId, 'xml')}`;
	}

	/** File-target "schema" = the run directory exists (no DDL). */
	async ensureSchema(): Promise<void> {
		mkdirSync(this.targetDir, { recursive: true });
		this.schemaEnsured = true;
	}

	/**
	 * Group the batch's rows per section_id (the projection emits every lang
	 * of a record together) and land ONE deterministic .xml per record, each
	 * via its own temp+rename.
	 */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			throw new Error(
				`xml writer: writeRows('${section.tableName}') before ensureSchema() — the run directory is created there`,
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
			atomicWriteFile(filePath, renderXmlRecord(section, group.rows));
			this.writtenFiles.add(filePath);
		}
		const counters = this.countersFor(section.tableName);
		counters.records_affected += grouped.size;
		counters.records_count += rows.length;
		return { written: rows.length, deleted: 0 };
	}

	/**
	 * Unlink the deterministic per-record files. Missing file = idempotent
	 * success with zero deletions (diffusion_delete.ts xml grammar; PHP
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
			this.writtenFiles.delete(filePath); // never merge/zip a file we just removed
		}
		this.countersFor(section.tableName).records_affected += deleted;
		return { written: 0, deleted };
	}

	/**
	 * Consolidate: merge every per-record document this run wrote under the
	 * first document's root (mergeXmlParts), then ZIP the per-record files +
	 * the merged document (old engine index.ts:543-563), everything
	 * temp+rename. Consolidated paths ride the summary as prefixed
	 * zero-count table entries — see rdf.ts CONSOLIDATED_MERGED_PREFIX for
	 * the runner mapping.
	 */
	async close(): Promise<WriterRunSummary> {
		const consolidated: { table_name: string; records_affected: number; records_count: number }[] =
			[];
		if (this.writtenFiles.size > 0) {
			const files = [...this.writtenFiles];
			const merged = mergeXmlParts(files.map((path) => readFileSync(path, 'utf-8')));
			const mergedPath = `${this.targetDir}/${XML_MERGED_NAME}`;
			atomicWriteFile(mergedPath, merged);
			const zipPath = `${this.targetDir}/${XML_ZIP_NAME}`;
			await createZip([...files, mergedPath], zipPath);
			const relativeDir = `/xml/${this.serviceName}`;
			consolidated.push(
				{
					table_name: `${CONSOLIDATED_MERGED_PREFIX}${relativeDir}/${XML_MERGED_NAME}`,
					records_affected: 0,
					records_count: 0,
				},
				{
					table_name: `${CONSOLIDATED_ZIP_PREFIX}${relativeDir}/${XML_ZIP_NAME}`,
					records_affected: 0,
					records_count: 0,
				},
			);
		}
		return {
			tables: [
				...[...this.counters.entries()].map(([tableName, counters]) => ({
					table_name: tableName,
					records_affected: counters.records_affected,
					records_count: counters.records_count,
				})),
				...consolidated,
			],
			errors: [...this.errors],
		};
	}

	/**
	 * Per-record files land via their own temp+rename (atomicWriteFile cleans
	 * its temp on failure) and stay finalized — the PHP per-record save
	 * posture. Consolidation temps only exist inside close(); this sweep is a
	 * defensive cleanup of any '.tmp-*' sibling a crash left behind.
	 */
	async abort(): Promise<void> {
		if (!existsSync(this.targetDir)) return;
		for (const name of readdirSync(this.targetDir)) {
			if (name.includes('.tmp-')) unlinkSync(`${this.targetDir}/${name}`);
		}
	}
}

/** The 'xml' format writer (registry entry). */
export const xmlWriter: DiffusionWriter = {
	format: 'xml',
	async open(plan: PublicationPlan): Promise<WriterSession> {
		return new XmlWriterSession(plan);
	},
};
