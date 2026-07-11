/**
 * RDF writer — the 'rdf' DiffusionWriter (DIFFUSION_SPEC §4.3 "rdf / xml:
 * one deterministic file per record; close() does type-aware merge + ZIP,
 * all temp+rename"). PHP oracle: diffusion/class.diffusion_rdf.php (EasyRdf
 * rdfxml serialisation); merge grammar: old engine
 * diffusion/api/v1/lib/rdf_file_utils.ts merge_rdf_parts (:72-85).
 *
 * Layout — IDENTICAL to the delete-side grammar so publish and unpublish
 * stay in lockstep (diffusion_delete.ts resolvePublishedFilePath :371-386;
 * PHP get_record_file_path class.diffusion_rdf.php:275-340):
 *
 *   <root>/rdf/<serviceName>/<sanitize(rdfName_sectionTipo_sectionId)>.rdf
 *
 * where rdfName is the owl:Class label — EXACTLY what the plan compiler puts
 * in SectionPlan.tableName for file formats (compile.ts keeps rdf/xml labels
 * VERBATIM: 'nmo:NumismaticObject' is an RDF identity, not a SQL identifier)
 * and sanitize is the verbatim PHP sanitize_file_name subset ported below
 * (MUST stay byte-identical to diffusion_delete.ts sanitizePublishedFileName
 * :336-344 — the test suite pins the two functions against each other).
 *
 * Document shape (pinned against a REAL PHP-published file,
 * media_monedaiberica/rdf/nomisma/nmonumismaticobject-numisdata4-1-*.rdf):
 *
 *   <?xml version="1.0" encoding="utf-8" ?>
 *   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 *            xmlns:nmo="http://nomisma.org/ontology#">
 *
 *     <nmo:NumismaticObject rdf:about="...">
 *       <dc:title xml:lang="es">...</dc:title>
 *     </nmo:NumismaticObject>
 *
 *   </rdf:RDF>
 *
 * (EasyRdf declaration with a space before '?>', 9-space xmlns continuation
 * indent, 2-space entity / 4-space predicate indents, blank lines around the
 * entity block.)
 *
 * Ledgered divergences from PHP (deliberate, determinism + the writers-do-no-
 * I/O boundary):
 * - NO wall-clock anywhere: consolidated artifacts are `diffusion_rdf_merged
 *   .rdf` / `diffusion_rdf.zip` (old engine index.ts:529-534 stamped
 *   `_<date>` tags — dropped like the markdown writer's zip, so re-runs are
 *   byte-identical; who/when live in the dd1758 activity log).
 * - Subject URIs: PHP resolves rdf:about from the dd1010 entity-publication
 *   services (resolve_base_uri — record reads a writer must not make). This
 *   writer uses the value of a column literally named 'rdf:about' when the
 *   plan provides one (the compiler/resolver's forward path to real URIs) and
 *   falls back to the deterministic `urn:dedalo:record:<st>:<id>`.
 * - Namespace URIs: PHP reads properties->xmlns of the element; the compiled
 *   plan does not carry it (yet). Prefixes are collected from the plan labels
 *   and resolved via WELL_KNOWN_XMLNS (the vocabularies pinned from the real
 *   published files); an unknown prefix gets a urn:dedalo:xmlns fallback AND
 *   a summary error — loud, never silent (spec §4.3 posture).
 *
 * removeRecords unlinks the canonical file + the legacy '{base}_*.rdf'
 * variants — the EXACT diffusion_delete.ts unlinkPublishedFiles rdf branch
 * (:412-423); missing files = idempotent success (PHP delete_record_file
 * "no file found (already removed)").
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import { atomicWriteFile, createZip, formatTargetDir, planColumnNames } from './files.ts';
import type {
	DiffusionWriter,
	WriteBatchResult,
	WriterRunSummary,
	WriterSession,
} from './types.ts';

/**
 * WriterRunSummary side-channel (shape per writers/types.ts — no new fields):
 * close() APPENDS zero-count `tables` entries whose table_name is
 * '<prefix><media-root-relative path>' for the run's consolidated artifacts.
 * The runner must lift these into the finish result the client parses
 * (jobs/sse.ts progressDataFromJob finish-parity): strip the prefix, prepend
 * the public media URL, and emit
 *   result.consolidated_files = { merged_url, zip_url }
 * plus result.diffusion_data = [{ file_url }] per published record (derived
 * from the same deterministic per-record grammar). Old engine anchor:
 * diffusion/api/v1/index.ts:529-563.
 */
export const CONSOLIDATED_MERGED_PREFIX = 'consolidated_merged:';
export const CONSOLIDATED_ZIP_PREFIX = 'consolidated_zip:';

/** Loud open() gate: rdf/xml publish to a service-named files target only. */
export class InvalidFileTargetError extends Error {
	constructor(format: string, plan: PublicationPlan) {
		super(
			`${format} writer: plan '${plan.planId}' targets kind '${plan.target.kind}' — rdf/xml publish to {kind:'files', serviceName} only (check the element properties->diffusion->service_name).`,
		);
		this.name = 'InvalidFileTargetError';
	}
}

/** The 'files' target serviceName, or a loud typed error (never a guess). */
export function requireFilesTarget(format: string, plan: PublicationPlan): string {
	if (plan.target.kind !== 'files' || plan.target.serviceName === '') {
		throw new InvalidFileTargetError(format, plan);
	}
	return plan.target.serviceName;
}

/**
 * PHP sanitize_file_name + beautify (delete-side subset) — VERBATIM copy of
 * diffusion_delete.ts sanitizePublishedFileName (:336-344). Duplicated here
 * on purpose: writers consume only the diffusion-side modules (boundary
 * doctrine), so the lockstep is pinned by test, not by import.
 */
export function sanitizeRdfFileName(name: string): string {
	let out = name.replace(/[^\w\s\d\-_~,;[\]().]/gu, '');
	out = out.replace(/\.{2,}/g, '');
	out = out.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
	out = out.replace(/[\s_]+/g, '-').replace(/-+/g, '-');
	out = out.replace(/-*\.-*/g, '.').replace(/\.{2,}/g, '.');
	return out.replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * Per-record rdf file name — the EXACT delete-side grammar
 * (diffusion_delete.ts:385 `${sanitize(`${rdfName}_${sectionTipo}_${sectionId}`)}.rdf`;
 * PHP class.diffusion_rdf.php:324-328). rdfName = SectionPlan.tableName (the
 * verbatim owl:Class label).
 */
export function rdfRecordFileName(section: SectionPlan, sectionId: number | string): string {
	return `${sanitizeRdfFileName(`${section.tableName}_${section.sectionTipo}_${sectionId}`)}.rdf`;
}

/**
 * Dédalo lang code → alpha2 xml:lang (PHP lang::get_alpha2_from_code — the
 * real published files carry xml:lang="es"). Unknown codes fall back to the
 * first two letters of the ISO-639-3 tail (deterministic, never throws).
 */
const LANG_ALPHA2: Record<string, string> = {
	'lg-eng': 'en',
	'lg-spa': 'es',
	'lg-cat': 'ca',
	'lg-fra': 'fr',
	'lg-deu': 'de',
	'lg-por': 'pt',
	'lg-ita': 'it',
	'lg-nob': 'no',
	'lg-swe': 'sv',
	'lg-nld': 'nl',
	'lg-eus': 'eu',
	'lg-glg': 'gl',
	'lg-arb': 'ar',
	'lg-zho': 'zh',
	'lg-jpn': 'ja',
	'lg-rus': 'ru',
	'lg-ell': 'el',
	'lg-lat': 'la',
};

export function langToAlpha2(lang: string): string {
	return LANG_ALPHA2[lang] ?? lang.replace(/^lg-/, '').slice(0, 2);
}

/** XML text-node escaping (what EasyRdf/DOMDocument createTextNode does). */
export function escapeXmlText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** XML attribute-value escaping (double-quoted attributes). */
export function escapeXmlAttribute(value: string): string {
	return escapeXmlText(value).replace(/"/g, '&quot;');
}

/** A plan label must be a legal XML QName to become a class/predicate tag. */
const QNAME_PATTERN = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;

/** Loud gate: a plan label that cannot be an RDF/XML element name. */
export function requireQName(label: string, role: string): string {
	if (!QNAME_PATTERN.test(label)) {
		throw new Error(
			`rdf writer: ${role} '${label}' is not a valid XML QName — fix the ontology label (file-format labels reach the document verbatim).`,
		);
	}
	return label;
}

/**
 * Namespace URIs for the prefixes seen in real Dédalo rdf domains. rdf/nmo/
 * dc/void are pinned from the actual PHP-published monedaiberica files; the
 * rest are the canonical vocabulary URIs (PHP got all of them from the
 * element's properties->xmlns — see the module doc-comment divergence note).
 */
export const WELL_KNOWN_XMLNS: Record<string, string> = {
	rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
	rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
	nmo: 'http://nomisma.org/ontology#',
	nm: 'http://nomisma.org/id/',
	dc: 'http://purl.org/dc/terms/',
	dcterms: 'http://purl.org/dc/terms/',
	void: 'http://rdfs.org/ns/void#',
	skos: 'http://www.w3.org/2004/02/skos/core#',
	owl: 'http://www.w3.org/2002/07/owl#',
	foaf: 'http://xmlns.com/foaf/0.1/',
	xsd: 'http://www.w3.org/2001/XMLSchema#',
	geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
	crm: 'http://www.cidoc-crm.org/cidoc-crm/',
};

/** Documented fallback for a prefix the plan uses but nobody declared. */
export function fallbackXmlnsUri(prefix: string): string {
	return `urn:dedalo:xmlns:${prefix}#`;
}

/** The subject-URI override column (see module doc-comment divergence note). */
const ABOUT_COLUMN = 'rdf:about';

export interface RdfNamespaceSet {
	/** prefix → URI, insertion-ordered: rdf first, then first-use order. */
	declarations: Map<string, string>;
	/** Prefixes resolved through the urn:dedalo fallback (summary errors). */
	unknownPrefixes: string[];
}

/**
 * Collect the namespace declarations one section's documents need: the rdf
 * prefix (envelope + rdf:about) plus every prefix used by the class label and
 * the emitted predicate columns, in first-use order (EasyRdf emitted them in
 * properties->xmlns registration order; the plan's label order is our
 * deterministic equivalent).
 */
export function collectRdfNamespaces(section: SectionPlan): RdfNamespaceSet {
	const declarations = new Map<string, string>();
	const unknownPrefixes: string[] = [];
	declarations.set('rdf', WELL_KNOWN_XMLNS.rdf as string);
	const labels = [section.tableName, ...planColumnNames(section)];
	for (const label of labels) {
		const colon = label.indexOf(':');
		if (colon <= 0) continue; // unprefixed element names need no xmlns
		const prefix = label.slice(0, colon);
		if (declarations.has(prefix)) continue;
		const known = WELL_KNOWN_XMLNS[prefix];
		if (known !== undefined) {
			declarations.set(prefix, known);
		} else {
			declarations.set(prefix, fallbackXmlnsUri(prefix));
			unknownPrefixes.push(prefix);
		}
	}
	return { declarations, unknownPrefixes };
}

/** Deterministic fallback subject URI (module doc-comment divergence note). */
export function defaultSubjectUri(sectionTipo: string, sectionId: number | string): string {
	return `urn:dedalo:record:${sectionTipo}:${sectionId}`;
}

/**
 * Render ONE entity block: the owl:Class element wrapping one xml:lang-
 * attributed literal per (plan column × lang row with a non-null value) —
 * null columns omitted (PHP addLiteral only fires on non-empty values,
 * class.diffusion_rdf.php:973-979). lang-null rows emit plain literals.
 * Indentation pinned from the real published file (2-space entity, 4-space
 * predicate).
 */
export function renderRdfEntity(
	section: SectionPlan,
	sectionId: number | string,
	rows: ProjectedRow[],
): string {
	const className = requireQName(section.tableName, 'class label (tableName)');
	// subject: the rdf:about override column when the plan carries one
	let subjectUri = defaultSubjectUri(section.sectionTipo, sectionId);
	for (const row of rows) {
		const about = row.columns[ABOUT_COLUMN];
		if (about !== undefined && about !== null && about !== '') {
			subjectUri = about;
			break;
		}
	}

	const lines: string[] = [];
	lines.push(`  <${className} rdf:about="${escapeXmlAttribute(subjectUri)}">`);
	for (const columnName of planColumnNames(section)) {
		if (columnName === ABOUT_COLUMN) continue; // subject identity, not a predicate
		const predicate = requireQName(columnName, 'predicate label (columnName)');
		for (const row of rows) {
			const value = row.columns[columnName] ?? null;
			if (value === null) continue; // null columns omitted
			const langAttribute = row.lang === null ? '' : ` xml:lang="${langToAlpha2(row.lang)}"`;
			lines.push(`    <${predicate}${langAttribute}>${escapeXmlText(value)}</${predicate}>`);
		}
	}
	lines.push(`  </${className}>`);
	return lines.join('\n');
}

/**
 * Render one full per-record RDF/XML document: the EasyRdf envelope (pinned
 * from the real published file — declaration with ' ?>', 9-space xmlns
 * continuation indent) around the record's entity block.
 */
export function renderRdfRecord(
	section: SectionPlan,
	sectionId: number | string,
	rows: ProjectedRow[],
	namespaces: RdfNamespaceSet,
): string {
	const xmlnsLines = [...namespaces.declarations.entries()].map(
		([prefix, uri]) => `xmlns:${prefix}="${escapeXmlAttribute(uri)}"`,
	);
	// '<rdf:RDF ' is 9 chars — continuation xmlns lines align under the first.
	const openingTag = `<rdf:RDF ${xmlnsLines.join('\n         ')}>`;
	const entity = renderRdfEntity(section, sectionId, rows);
	return `<?xml version="1.0" encoding="utf-8" ?>\n${openingTag}\n\n${entity}\n\n</rdf:RDF>\n`;
}

/**
 * Type-aware consolidation — VERBATIM port of the old engine's
 * merge_rdf_parts (rdf_file_utils.ts:72-85): envelope (opening <rdf:RDF …>
 * tag with its namespaces) from the FIRST part, inner blocks of every part
 * concatenated. Single part returns untouched; empty input returns ''.
 * NOTE the merged declaration has NO space before '?>' — old engine :84.
 */
export function mergeRdfParts(rawParts: string[]): string {
	const nonEmpty = rawParts.filter((part) => part && part.trim().length > 0);
	if (nonEmpty.length === 0) return '';
	if (nonEmpty.length === 1) return nonEmpty[0] as string;

	const first = nonEmpty[0] as string;
	const openingMatch = first.match(/<rdf:RDF[^>]*>/s);
	const openingTag = openingMatch ? openingMatch[0] : '<rdf:RDF>';

	const innerBlocks = nonEmpty
		.map((part) => {
			const open = part.match(/<rdf:RDF[^>]*>/s);
			const closeIndex = part.lastIndexOf('</rdf:RDF>');
			if (!open || closeIndex === -1) return '';
			const bodyStart = (open.index ?? 0) + open[0].length;
			return part.slice(bodyStart, closeIndex).trim();
		})
		.filter((block) => block.length > 0)
		.join('\n\n');

	return `<?xml version="1.0" encoding="utf-8"?>\n${openingTag}\n\n${innerBlocks}\n\n</rdf:RDF>\n`;
}

/** Consolidated artifact names — old grammar minus the wall-clock date tag. */
const RDF_MERGED_NAME = 'diffusion_rdf_merged.rdf';
const RDF_ZIP_NAME = 'diffusion_rdf.zip';

/** Per-table counters feeding the close() summary (markdown writer shape). */
interface RdfTableCounters {
	records_affected: number;
	records_count: number;
}

class RdfWriterSession implements WriterSession {
	private readonly plan: PublicationPlan;
	private readonly serviceName: string;
	private readonly targetDir: string;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly counters = new Map<string, RdfTableCounters>();
	private readonly errors: string[] = [];
	/** Files THIS RUN finalized, insertion-ordered — merge + zip manifest. */
	private readonly writtenFiles = new Set<string>();
	/** Per-section namespace sets, memoized (unknown prefixes error ONCE). */
	private readonly namespacesBySection = new Map<string, RdfNamespaceSet>();
	private schemaEnsured = false;

	constructor(plan: PublicationPlan) {
		this.plan = plan;
		this.serviceName = requireFilesTarget('rdf', plan);
		this.targetDir = formatTargetDir('rdf', this.serviceName);
		for (const section of plan.sections) {
			this.counters.set(section.tableName, { records_affected: 0, records_count: 0 });
		}
	}

	private countersFor(tableName: string): RdfTableCounters {
		let counters = this.counters.get(tableName);
		if (counters === undefined) {
			counters = { records_affected: 0, records_count: 0 };
			this.counters.set(tableName, counters);
		}
		return counters;
	}

	private namespacesFor(section: SectionPlan): RdfNamespaceSet {
		let namespaces = this.namespacesBySection.get(section.tableTipo);
		if (namespaces === undefined) {
			namespaces = collectRdfNamespaces(section);
			for (const prefix of namespaces.unknownPrefixes) {
				this.errors.push(
					`rdf writer: no xmlns known for prefix '${prefix}' (section '${section.tableName}') — ` +
						`emitted fallback ${fallbackXmlnsUri(prefix)}; declare the vocabulary in the element ontology.`,
				);
			}
			this.namespacesBySection.set(section.tableTipo, namespaces);
		}
		return namespaces;
	}

	private recordPath(section: SectionPlan, sectionId: number | string): string {
		return `${this.targetDir}/${rdfRecordFileName(section, sectionId)}`;
	}

	/** File-target "schema" = the run directory exists (no DDL). */
	async ensureSchema(): Promise<void> {
		mkdirSync(this.targetDir, { recursive: true });
		this.schemaEnsured = true;
	}

	/**
	 * Group the batch's rows per section_id (the projection emits every lang
	 * of a record together) and land ONE deterministic .rdf per record, each
	 * via its own temp+rename.
	 */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			throw new Error(
				`rdf writer: writeRows('${section.tableName}') before ensureSchema() — the run directory is created there`,
			);
		}
		const namespaces = this.namespacesFor(section);
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
			atomicWriteFile(filePath, renderRdfRecord(section, group.sectionId, group.rows, namespaces));
			this.writtenFiles.add(filePath);
		}
		const counters = this.countersFor(section.tableName);
		counters.records_affected += grouped.size;
		counters.records_count += rows.length;
		return { written: rows.length, deleted: 0 };
	}

	/**
	 * Unlink the canonical per-record file PLUS the legacy '{base}_*.rdf'
	 * variants — the EXACT diffusion_delete.ts unlinkPublishedFiles rdf branch
	 * (:412-423; PHP delete_record_file legacy glob :369-379). Missing files =
	 * idempotent success with zero deletions.
	 */
	async removeRecords(
		section: SectionPlan,
		sectionIds: (number | string)[],
	): Promise<WriteBatchResult> {
		let deleted = 0;
		for (const sectionId of sectionIds) {
			const filePath = this.recordPath(section, sectionId);
			const toUnlink: string[] = [];
			if (existsSync(filePath)) toUnlink.push(filePath);
			const base = rdfRecordFileName(section, sectionId).replace(/\.rdf$/, '');
			if (existsSync(this.targetDir)) {
				for (const name of readdirSync(this.targetDir)) {
					if (name.startsWith(`${base}_`) && name.endsWith('.rdf')) {
						toUnlink.push(`${this.targetDir}/${name}`);
					}
				}
			}
			for (const path of toUnlink) {
				unlinkSync(path);
				deleted++;
				this.writtenFiles.delete(path); // never merge/zip a file we just removed
			}
			this.writtenFiles.delete(filePath);
		}
		this.countersFor(section.tableName).records_affected += deleted;
		return { written: 0, deleted };
	}

	/**
	 * Consolidate: merge every per-record document this run wrote into ONE
	 * envelope (mergeRdfParts), then ZIP the per-record files + the merged
	 * document (old engine index.ts:543-563), everything temp+rename. The
	 * consolidated paths ride the summary as prefixed zero-count table
	 * entries — see CONSOLIDATED_MERGED_PREFIX for the runner mapping.
	 */
	async close(): Promise<WriterRunSummary> {
		const consolidated: { table_name: string; records_affected: number; records_count: number }[] =
			[];
		if (this.writtenFiles.size > 0) {
			const files = [...this.writtenFiles];
			const merged = mergeRdfParts(files.map((path) => readFileSync(path, 'utf-8')));
			const mergedPath = `${this.targetDir}/${RDF_MERGED_NAME}`;
			atomicWriteFile(mergedPath, merged);
			const zipPath = `${this.targetDir}/${RDF_ZIP_NAME}`;
			await createZip([...files, mergedPath], zipPath);
			const relativeDir = `/rdf/${this.serviceName}`;
			consolidated.push(
				{
					table_name: `${CONSOLIDATED_MERGED_PREFIX}${relativeDir}/${RDF_MERGED_NAME}`,
					records_affected: 0,
					records_count: 0,
				},
				{
					table_name: `${CONSOLIDATED_ZIP_PREFIX}${relativeDir}/${RDF_ZIP_NAME}`,
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

/** The 'rdf' format writer (registry entry). */
export const rdfWriter: DiffusionWriter = {
	format: 'rdf',
	async open(plan: PublicationPlan): Promise<WriterSession> {
		return new RdfWriterSession(plan);
	},
};
