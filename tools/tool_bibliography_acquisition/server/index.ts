/**
 * tool_bibliography_acquisition — pastes a public journal/OAI-PMH URL, harvests its metadata, and
 * lets the operator review every publication before committing: preview_url returns the parsed
 * series + publications (nothing written yet); commit_publications creates one rsc205 record per
 * kept publication, resolves/links its Series and Authors, and imports the PDF when one is found.
 */

import { NO_LANG } from '../../../src/config/data_langs.ts';
import { sql } from '../../../src/core/db/postgres.ts';
import { DedaloError } from '../../../src/core/errors/dedalo_error.ts';
import { ok } from '../../../src/core/errors/index.ts';
import {
	processUploadedFile,
	requireMediaSpec,
} from '../../../src/core/media/ingest/process_uploaded_file.ts';
import { receiveUpload } from '../../../src/core/media/ingest/upload.ts';
import { buildMediaIdentifier } from '../../../src/core/media/path.ts';
import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import {
	nameKeysForQuality,
	persistUploadedMedia,
} from '../../../src/core/media/tools/files_info_persist.ts';
import { getMatrixTableFromTipo } from '../../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../../src/core/section/record/save_component.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { downloadFileBytes } from './lib/acquisition/file_fetch.ts';
import type { RawSource } from './lib/acquisition/http.ts';
import { parseDcDate, splitAuthorName } from './lib/extraction/parser-utils.ts';
import { ojsOaiAdapter } from './lib/sources/ojs_oai/adapter.ts';

// rsc205 is a VIRTUAL section (relations -> rsc3) but real records are stamped section_tipo='rsc205'
// itself, not rsc3 - confirmed against rsc170 (the coin tool's own virtual image section), whose
// 1,820 real rows all carry section_tipo='rsc170'.
const PUBLICATION_TIPO = 'rsc205';
// Dedup key - the same field tool_import_marc21/tool_import_zotero populate with their own
// source's item id (Zotero key, MARC control number). We use the OAI <identifier>.
const CODE_TIPO = 'rsc137'; // component_input_text, "Code"
const TITLE_TIPO = 'rsc140'; // component_input_text, "Title"
const AUTHORSHIP_RELATION_TIPO = 'rsc139'; // component_autocomplete_hi -> rsc197 (People)
const PERSONAL_NAME_TIPO = 'rsc349'; // component_input_text, quick-paste author text
const PAGES_TIPO = 'rsc223'; // component_input_text, "Pages. Physical description"
const ABSTRACT_TIPO = 'rsc221'; // component_text_area, parent rsc397 "Other descriptions" -> rsc3
const PUBLISHER_TIPO = 'rsc219'; // component_input_text, parent rsc129 (same group as Title)
const SERIES_RELATION_TIPO = 'rsc211'; // component_portal -> rsc212 (Series), no autocomplete
// UI config in the ontology - doesn't block a server-resolved write, same as
// numisdata147/161 not depending on their own UI config either.
const SERIES_NUMBER_TIPO = 'rsc384'; // component_input_text, "Serie/magazine/collection number"
const PUBLICATION_DATE_TIPO = 'rsc224'; // component_date, date_mode: "range"
const URL_TIPO = 'rsc217'; // component_iri
const PDF_URI_TIPO = 'rsc668'; // component_iri
const DOCUMENT_TIPO = 'rsc209'; // component_pdf, direct field on the Publication record itself

// Thesaurus-backed (component_select -> dd810), unlike every other field here - match-only, same
// spirit as the coin tool's Type linking. section_id=8 confirmed real: tool_import_zotero's own
// production config maps CSL "article"/"article-journal" to it, and its dd812 label reads
// "Artículo en revista científica" / "Scientific journal article" - exactly what dc:type's
// "info:eu-repo/semantics/article" means.
const TYPOLOGY_RELATION_TIPO = 'rsc138';
const TYPOLOGY_SECTION_TIPO = 'dd810';
const ARTICLE_TYPOLOGY_SECTION_ID = 8;

// Same match-only pattern, confirmed the same way: tool_import_zotero's config maps CSL "ISSN" to
// dd292 section_id=2, whose dd296 label reads "ISSN".
const STANDARD_NUMBER_TIPO = 'rsc147'; // component_input_text, holds the ISBN/ISSN value itself
const STANDARD_NUMBER_TYPE_RELATION_TIPO = 'rsc249';
const STANDARD_NUMBER_TYPE_SECTION_TIPO = 'dd292';
const ISSN_TYPE_SECTION_ID = 2;

const PEOPLE_SECTION_TIPO = 'rsc197'; // also virtual (relations -> rsc75); same storage rule applies
const PERSON_SURNAME_TIPO = 'rsc86';
const PERSON_GIVEN_NAME_TIPO = 'rsc85';

const SERIES_SECTION_TIPO = 'rsc212'; // also virtual (relations -> dd22); same storage rule applies
const SERIES_NAME_TIPO = 'rsc214';

const RELATION_TYPE_LINK = 'dd151';
const IMPORT_KEY_DIR = 'bibliography_acquisition';

const ADAPTERS = [ojsOaiAdapter];

function assertUrlOption(options: Record<string, unknown>): string {
	const url = options.url;
	if (typeof url !== 'string' || url.trim() === '') {
		throw new DedaloError('tool.action_failed', {
			message: 'preview_url requires a non-empty "url" string option.',
			publicMessage: 'Paste a journal URL first.',
		});
	}
	return url;
}

function findAdapterOrThrow(url: string) {
	const adapter = ADAPTERS.find((candidate) => candidate.matchesUrl(url));
	if (!adapter) {
		throw new DedaloError('tool.action_failed', {
			message: `No supported source adapter matches this URL: ${url}`,
			publicMessage: 'Only OAI-PMH journal/repository URLs are supported right now.',
		});
	}
	return adapter;
}

/**
 * Fetches and parses one bounded set of articles - a single article, or every article linked from
 * the pasted listing page (a journal homepage's current issue, an issue page, ...) - never a whole
 * journal's history. Also runs a read-only Series existence check so the review screen can show
 * "will link" vs "will create". Runs as a background job - one GetRecord fetch per article.
 */
async function previewUrl(context: ToolActionContext): Promise<ToolResponse> {
	const url = assertUrlOption(context.options);
	const adapter = findAdapterOrThrow(url);

	const acquisition = await adapter.acquire(url, (current, total) => {
		context.publishProgress?.({
			msg: `Fetching article ${current} of ${total}`,
			counter: current,
			total,
		});
	});
	const firstPage = acquisition.pages[0];
	if (firstPage === undefined) {
		throw new DedaloError('tool.action_failed', {
			message: `Adapter '${adapter.id}' returned zero pages for ${url}.`,
		});
	}

	const series = adapter.parseSeries(firstPage, url);
	const publications = acquisition.pages.flatMap((page) => adapter.parsePublications(page, url));

	const seriesName = series.name?.trim() ?? '';
	const existingSeriesSectionId = seriesName !== '' ? await findExistingSeries(seriesName) : null;

	return ok(
		{
			series,
			publications,
			series_status: {
				exists: existingSeriesSectionId !== null,
				section_id: existingSeriesSectionId,
			},
			partial_error: acquisition.partialError ?? null,
		},
		{ requestId: toolRequestId(context) },
	);
}

/**
 * Parses a page the OPERATOR's own browser already fetched, instead of this tool fetching it live -
 * the fallback for a source that blocks automated retrieval (confirmed live for OJS journal landing
 * pages: a Cloudflare challenge, HTTP 200, not a 403 our code can detect by status code alone).
 * Single-page only - no live fetch here to drive resumptionToken pagination.
 */
async function previewHtml(context: ToolActionContext): Promise<ToolResponse> {
	const url = assertUrlOption(context.options);
	const html = context.options.html;
	if (typeof html !== 'string' || html.trim() === '') {
		throw new DedaloError('tool.action_failed', {
			message: 'preview_html requires a non-empty "html" string option.',
			publicMessage: "Paste or upload the saved page's content first.",
		});
	}

	const adapter = findAdapterOrThrow(url);
	adapter.assertSafeUrl(url);

	const page: RawSource = { html, finalUrl: url, httpStatus: 200, contentType: 'text/xml' };
	const series = adapter.parseSeries(page, url);
	const publications = adapter.parsePublications(page, url);

	const seriesName = series.name?.trim() ?? '';
	const existingSeriesSectionId = seriesName !== '' ? await findExistingSeries(seriesName) : null;

	return ok(
		{
			series,
			publications,
			series_status: {
				exists: existingSeriesSectionId !== null,
				section_id: existingSeriesSectionId,
			},
		},
		{ requestId: toolRequestId(context) },
	);
}

/** Writes one field as a fresh 'set_data' (a bare {id, value} item). */
async function writeField(
	sectionId: number,
	sectionTipo: string,
	componentTipo: string,
	value: string | number,
	userId: number,
): Promise<void> {
	await saveComponentData({
		componentTipo,
		sectionTipo,
		sectionId,
		lang: NO_LANG,
		userId,
		changedData: [{ action: 'set_data', value: [{ id: 1, value }] }],
	});
}

/** component_iri stores {id, iri, title} - NOT the generic {id, value} writeField uses. A bare
 * value-only entry silently fails to render (the edit UI reads .iri, finds undefined, shows blank)
 * even though it's really stored. */
async function writeIriField(
	sectionId: number,
	sectionTipo: string,
	componentTipo: string,
	iri: string,
	title: string | null,
	userId: number,
): Promise<void> {
	await saveComponentData({
		componentTipo,
		sectionTipo,
		sectionId,
		lang: NO_LANG,
		userId,
		changedData: [{ action: 'set_data', value: [{ id: 1, iri, title: title ?? '' }] }],
	});
}

/** Writes a component_date field's `start` only, matching how real records represent a single
 * point-in-time date - the field's own date_mode is "range", but leaving `end` unset (rather than
 * duplicating the same date into it) is what the real production records do. save_component.ts's
 * component_date override computes the sort-key `time` on `start` regardless. */
async function writeDateField(
	sectionId: number,
	sectionTipo: string,
	componentTipo: string,
	date: { year: number; month: number; day: number },
	userId: number,
): Promise<void> {
	await saveComponentData({
		componentTipo,
		sectionTipo,
		sectionId,
		lang: NO_LANG,
		userId,
		changedData: [
			{
				action: 'set_data',
				value: [{ id: 1, start: { year: date.year, month: date.month, day: date.day } }],
			},
		],
	});
}

/** Exact Code match - lets a re-import reuse the existing rsc205 record instead of duplicating it. */
async function findExistingPublication(identifier: string): Promise<number | null> {
	const table = await getMatrixTableFromTipo(PUBLICATION_TIPO);
	if (table === null) {
		throw new DedaloError('tool.action_failed', {
			message: `No matrix table for section '${PUBLICATION_TIPO}'.`,
		});
	}
	const existing = (await sql.unsafe(
		`SELECT section_id FROM "${table}"
		 WHERE section_tipo = $1
		   AND string->'${CODE_TIPO}'->0->>'value' = $2
		 LIMIT 1`,
		[PUBLICATION_TIPO, identifier],
	)) as { section_id: number }[];
	return existing[0]?.section_id ?? null;
}

/** Exact name match - used by previewUrl (check only) and findOrCreateSeries. */
async function findExistingSeries(name: string): Promise<number | null> {
	const table = await getMatrixTableFromTipo(SERIES_SECTION_TIPO);
	if (table === null) {
		throw new DedaloError('tool.action_failed', {
			message: `No matrix table for section '${SERIES_SECTION_TIPO}'.`,
		});
	}
	const existing = (await sql.unsafe(
		`SELECT section_id FROM "${table}"
		 WHERE section_tipo = $1
		   AND string->'${SERIES_NAME_TIPO}'->0->>'value' = $2
		 LIMIT 1`,
		[SERIES_SECTION_TIPO, name],
	)) as { section_id: number }[];
	return existing[0]?.section_id ?? null;
}

/** Finds an existing rsc212 Series record, or creates one when none matches. */
async function findOrCreateSeries(
	context: ToolActionContext,
	name: string,
): Promise<{ sectionId: number; created: boolean }> {
	const found = await findExistingSeries(name);
	if (found !== null) return { sectionId: found, created: false };

	const sectionId = await createSectionRecord(SERIES_SECTION_TIPO, context.userId);
	await writeField(sectionId, SERIES_SECTION_TIPO, SERIES_NAME_TIPO, name, context.userId);
	return { sectionId, created: true };
}

/** Links the Publication's Series field to an EXISTING rsc212 record. */
async function linkSeries(
	context: ToolActionContext,
	publicationSectionId: number,
	seriesSectionId: number,
): Promise<void> {
	const save = await saveComponentData({
		componentTipo: SERIES_RELATION_TIPO,
		sectionTipo: PUBLICATION_TIPO,
		sectionId: publicationSectionId,
		lang: NO_LANG,
		userId: context.userId,
		changedData: [
			{
				action: 'set_data',
				value: [
					{
						id: 1,
						type: RELATION_TYPE_LINK,
						section_id: seriesSectionId,
						section_tipo: SERIES_SECTION_TIPO,
						from_component_tipo: SERIES_RELATION_TIPO,
					},
				],
			},
		],
	});
	if (!save.ok) {
		throw new DedaloError('record.save_failed', {
			message: `Could not link the Series relation: ${save.message}`,
		});
	}
}

/** Links a Publication field to one fixed, known-in-advance thesaurus term - used for both
 * Bibliographic typology (always "journal article") and Type of standard number (always "ISSN"),
 * neither of which needs a dynamic lookup since we only ever recognize one term for each. */
async function linkFixedTerm(
	context: ToolActionContext,
	publicationSectionId: number,
	componentTipo: string,
	targetSectionTipo: string,
	targetSectionId: number,
): Promise<void> {
	const save = await saveComponentData({
		componentTipo,
		sectionTipo: PUBLICATION_TIPO,
		sectionId: publicationSectionId,
		lang: NO_LANG,
		userId: context.userId,
		changedData: [
			{
				action: 'set_data',
				value: [
					{
						id: 1,
						type: RELATION_TYPE_LINK,
						section_id: targetSectionId,
						section_tipo: targetSectionTipo,
						from_component_tipo: componentTipo,
					},
				],
			},
		],
	});
	if (!save.ok) {
		throw new DedaloError('record.save_failed', {
			message: `Could not link ${componentTipo}: ${save.message}`,
		});
	}
}

/** Exact (Surname, Given name) match - used by findOrCreatePerson. */
async function findExistingPerson(
	surname: string,
	givenName: string | null,
): Promise<number | null> {
	const table = await getMatrixTableFromTipo(PEOPLE_SECTION_TIPO);
	if (table === null) {
		throw new DedaloError('tool.action_failed', {
			message: `No matrix table for section '${PEOPLE_SECTION_TIPO}'.`,
		});
	}
	const existing = (await sql.unsafe(
		`SELECT section_id FROM "${table}"
		 WHERE section_tipo = $1
		   AND string->'${PERSON_SURNAME_TIPO}'->0->>'value' = $2
		   AND string->'${PERSON_GIVEN_NAME_TIPO}'->0->>'value' IS NOT DISTINCT FROM $3
		 LIMIT 1`,
		[PEOPLE_SECTION_TIPO, surname, givenName],
	)) as { section_id: number }[];
	return existing[0]?.section_id ?? null;
}

/** Finds an existing rsc197 Person record, or creates one when none matches. */
async function findOrCreatePerson(
	context: ToolActionContext,
	surname: string,
	givenName: string | null,
): Promise<{ sectionId: number; created: boolean }> {
	const found = await findExistingPerson(surname, givenName);
	if (found !== null) return { sectionId: found, created: false };

	const sectionId = await createSectionRecord(PEOPLE_SECTION_TIPO, context.userId);
	await writeField(sectionId, PEOPLE_SECTION_TIPO, PERSON_SURNAME_TIPO, surname, context.userId);
	if (givenName !== null) {
		await writeField(
			sectionId,
			PEOPLE_SECTION_TIPO,
			PERSON_GIVEN_NAME_TIPO,
			givenName,
			context.userId,
		);
	}
	return { sectionId, created: true };
}

/** Links the Publication's Authorship field to every resolved rsc197 record in one bulk replace -
 * component_portal is multi-valued (not in save_component.ts's MONOVALUE_MODELS), so a single
 * set_data with N items is the correct way to write N authors, not N separate calls. */
async function linkAuthors(
	context: ToolActionContext,
	publicationSectionId: number,
	personSectionIds: number[],
): Promise<void> {
	const save = await saveComponentData({
		componentTipo: AUTHORSHIP_RELATION_TIPO,
		sectionTipo: PUBLICATION_TIPO,
		sectionId: publicationSectionId,
		lang: NO_LANG,
		userId: context.userId,
		changedData: [
			{
				action: 'set_data',
				value: personSectionIds.map((personSectionId, index) => ({
					id: index + 1,
					type: RELATION_TYPE_LINK,
					section_id: personSectionId,
					section_tipo: PEOPLE_SECTION_TIPO,
					from_component_tipo: AUTHORSHIP_RELATION_TIPO,
				})),
			},
		],
	});
	if (!save.ok) {
		throw new DedaloError('record.save_failed', {
			message: `Could not link the Authorship relation: ${save.message}`,
		});
	}
}

/**
 * Resolves a real downloadable PDF URL when the publication doesn't already carry one - OAI-PMH's
 * oai_dc never does, so this is the normal case for our only source. Best-effort: returns null
 * (never throws) when the landing page can't be reached (e.g. a Cloudflare-blocked journal) or has
 * no PDF galley link.
 */
async function resolvePublicationPdfUrl(
	publication: Record<string, unknown>,
): Promise<string | null> {
	const landingPageUrl = publication.landingPageUrl;
	if (typeof landingPageUrl !== 'string' || landingPageUrl === '') return null;

	const adapter = ADAPTERS.find((candidate) => candidate.matchesUrl(landingPageUrl));
	if (!adapter?.resolvePdfUrl) return null;

	try {
		return await adapter.resolvePdfUrl(landingPageUrl);
	} catch {
		return null;
	}
}

/**
 * Downloads the publication's PDF (resolving one first when not already known) and stores it
 * directly on the Publication record's own rsc209 field - no separate resource record or crop step
 * needed, unlike the numismatic tool's obverse/reverse image split. Also returns the resolved URL
 * so the caller can write it into rsc668 (PDF URI) even when the byte-download itself is skipped.
 */
async function importDocumentForPublication(
	context: ToolActionContext,
	publication: Record<string, unknown>,
	sectionId: number,
): Promise<{ pdfUrl: string | null; documentImported: boolean; documentError: string | null }> {
	const existingPdfUrl = publication.pdfUrl;
	const pdfUrl =
		typeof existingPdfUrl === 'string' && existingPdfUrl !== ''
			? existingPdfUrl
			: await resolvePublicationPdfUrl(publication);
	if (pdfUrl === null) {
		return { pdfUrl: null, documentImported: false, documentError: null };
	}

	const adapter = ADAPTERS.find((candidate) => candidate.matchesUrl(pdfUrl));
	if (!adapter) {
		return {
			pdfUrl,
			documentImported: false,
			documentError: `No source adapter recognizes this PDF's host: ${pdfUrl}`,
		};
	}

	const { bytes } = await downloadFileBytes(pdfUrl, adapter.assertSafeUrl, 'application/pdf');
	const fileName = `${PUBLICATION_TIPO}_${sectionId}.pdf`;

	const staged = receiveUpload(
		{
			keyDir: IMPORT_KEY_DIR,
			fileName,
			chunked: false,
			chunkIndex: 0,
			totalChunks: 1,
			blob: bytes,
			uploadId: null,
			csrfToken: null,
		},
		context.userId,
	);
	if (staged.tmpName === undefined) {
		return { pdfUrl, documentImported: false, documentError: 'PDF upload did not stage a file.' };
	}

	const spec = requireMediaSpec('component_pdf');
	const { identity, pathOpts } = await resolveMediaToolContext({
		component_tipo: DOCUMENT_TIPO,
		section_tipo: PUBLICATION_TIPO,
		section_id: sectionId,
	});
	const result = await processUploadedFile({
		spec,
		identity,
		pathOpts,
		userId: context.userId,
		keyDir: IMPORT_KEY_DIR,
		tmpName: staged.tmpName,
		extension: 'pdf',
	});
	await persistUploadedMedia({
		sectionTipo: identity.sectionTipo,
		sectionId: identity.sectionId,
		componentTipo: identity.componentTipo,
		lang: identity.lang,
		filesInfo: result.filesInfo,
		originalFileName: fileName,
		originalNormalizedName: `${buildMediaIdentifier(identity)}.${result.extension}`,
		nameKeys: nameKeysForQuality(spec, undefined),
	});
	result.startTranscode?.();
	return { pdfUrl, documentImported: true, documentError: null };
}

/** One resolved Series, cached within a commit batch. */
interface ResolvedSeries {
	sectionId: number;
	created: boolean;
}

/** One resolved Person, cached within a commit batch. */
interface ResolvedPerson {
	sectionId: number;
	created: boolean;
}

async function resolveSeriesCached(
	context: ToolActionContext,
	cache: Map<string, ResolvedSeries>,
	name: string,
): Promise<ResolvedSeries> {
	const cached = cache.get(name);
	if (cached !== undefined) return cached;
	const resolved = await findOrCreateSeries(context, name);
	cache.set(name, resolved);
	return resolved;
}

async function resolvePersonCached(
	context: ToolActionContext,
	cache: Map<string, ResolvedPerson>,
	surname: string,
	givenName: string | null,
): Promise<ResolvedPerson> {
	const key = `${surname}|${givenName ?? ''}`;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;
	const resolved = await findOrCreatePerson(context, surname, givenName);
	cache.set(key, resolved);
	return resolved;
}

/** OAI identifiers are "scheme:repository-id:local-id" (colon-delimited by protocol convention) -
 * the local-id alone reads far cleaner in the Code column than the full string. */
function shortPublicationCode(identifier: string): string {
	const lastColon = identifier.lastIndexOf(':');
	return lastColon === -1 ? identifier : identifier.slice(lastColon + 1);
}

/** One publication's outcome from commitPublications. */
interface CommitOnePublicationResult {
	publication_identifier: unknown;
	section_tipo: string;
	section_id: number;
	/** True when an rsc205 record with this Code already existed - nothing else in this result was
	 * attempted, section_id names the pre-existing record. */
	skipped: boolean;
	fields_written: string[];
	series_section_id: number | null;
	series_created: boolean | null;
	series_error: string | null;
	author_section_ids: number[];
	author_errors: string[];
	document_imported: boolean;
	document_error: string | null;
}

/**
 * Creates an rsc205 record from one previewed publication, writes its fields, and resolves/links
 * Series, Authors, and the PDF document. The Series/author/document steps are best-effort - a
 * failure there is surfaced in the result, not thrown, since the record itself already exists with
 * real fields on it by that point. Skips entirely (no create, no field writes) when a record with
 * the same Code was already imported, rather than risk clobbering a cataloger's later edits.
 */
async function commitOnePublication(
	context: ToolActionContext,
	publication: Record<string, unknown>,
	seriesCache: Map<string, ResolvedSeries>,
	personCache: Map<string, ResolvedPerson>,
): Promise<CommitOnePublicationResult> {
	const p = publication;
	const identifier =
		typeof p.publicationIdentifier === 'string' && p.publicationIdentifier !== ''
			? shortPublicationCode(p.publicationIdentifier)
			: null;

	if (identifier !== null) {
		const existingSectionId = await findExistingPublication(identifier);
		if (existingSectionId !== null) {
			return {
				publication_identifier: p.publicationIdentifier,
				section_tipo: PUBLICATION_TIPO,
				section_id: existingSectionId,
				skipped: true,
				fields_written: [],
				series_section_id: null,
				series_created: null,
				series_error: null,
				author_section_ids: [],
				author_errors: [],
				document_imported: false,
				document_error: null,
			};
		}
	}

	const sectionId = await createSectionRecord(PUBLICATION_TIPO, context.userId);
	const fieldsWritten: string[] = [];

	if (identifier !== null) {
		await writeField(sectionId, PUBLICATION_TIPO, CODE_TIPO, identifier, context.userId);
		fieldsWritten.push(CODE_TIPO);
	}
	if (typeof p.title === 'string' && p.title.trim() !== '') {
		await writeField(sectionId, PUBLICATION_TIPO, TITLE_TIPO, p.title, context.userId);
		fieldsWritten.push(TITLE_TIPO);
	}
	if (typeof p.pages === 'string' && p.pages.trim() !== '') {
		await writeField(sectionId, PUBLICATION_TIPO, PAGES_TIPO, p.pages, context.userId);
		fieldsWritten.push(PAGES_TIPO);
	}
	if (typeof p.abstract === 'string' && p.abstract.trim() !== '') {
		await writeField(sectionId, PUBLICATION_TIPO, ABSTRACT_TIPO, p.abstract, context.userId);
		fieldsWritten.push(ABSTRACT_TIPO);
	}
	if (typeof p.publisher === 'string' && p.publisher.trim() !== '') {
		await writeField(sectionId, PUBLICATION_TIPO, PUBLISHER_TIPO, p.publisher, context.userId);
		fieldsWritten.push(PUBLISHER_TIPO);
	}
	if (typeof p.seriesNumber === 'string' && p.seriesNumber.trim() !== '') {
		await writeField(
			sectionId,
			PUBLICATION_TIPO,
			SERIES_NUMBER_TIPO,
			p.seriesNumber,
			context.userId,
		);
		fieldsWritten.push(SERIES_NUMBER_TIPO);
	}
	const publicationTitle = typeof p.title === 'string' ? p.title : null;
	if (typeof p.landingPageUrl === 'string' && p.landingPageUrl.trim() !== '') {
		await writeIriField(
			sectionId,
			PUBLICATION_TIPO,
			URL_TIPO,
			p.landingPageUrl,
			publicationTitle,
			context.userId,
		);
		fieldsWritten.push(URL_TIPO);
	}
	const authors = Array.isArray(p.authors)
		? p.authors.filter((a): a is string => typeof a === 'string')
		: [];
	if (authors.length > 0) {
		await writeField(
			sectionId,
			PUBLICATION_TIPO,
			PERSONAL_NAME_TIPO,
			authors.join('; '),
			context.userId,
		);
		fieldsWritten.push(PERSONAL_NAME_TIPO);
	}
	const parsedDate = typeof p.publicationDate === 'string' ? parseDcDate(p.publicationDate) : null;
	if (parsedDate !== null) {
		await writeDateField(
			sectionId,
			PUBLICATION_TIPO,
			PUBLICATION_DATE_TIPO,
			parsedDate,
			context.userId,
		);
		fieldsWritten.push(PUBLICATION_DATE_TIPO);
	}
	const types = Array.isArray(p.types)
		? p.types.filter((t): t is string => typeof t === 'string')
		: [];
	if (types.includes('info:eu-repo/semantics/article')) {
		await linkFixedTerm(
			context,
			sectionId,
			TYPOLOGY_RELATION_TIPO,
			TYPOLOGY_SECTION_TIPO,
			ARTICLE_TYPOLOGY_SECTION_ID,
		);
		fieldsWritten.push(TYPOLOGY_RELATION_TIPO);
	}
	if (typeof p.issn === 'string' && p.issn.trim() !== '') {
		await writeField(sectionId, PUBLICATION_TIPO, STANDARD_NUMBER_TIPO, p.issn, context.userId);
		fieldsWritten.push(STANDARD_NUMBER_TIPO);
		await linkFixedTerm(
			context,
			sectionId,
			STANDARD_NUMBER_TYPE_RELATION_TIPO,
			STANDARD_NUMBER_TYPE_SECTION_TIPO,
			ISSN_TYPE_SECTION_ID,
		);
		fieldsWritten.push(STANDARD_NUMBER_TYPE_RELATION_TIPO);
	}

	let seriesSectionId: number | null = null;
	let seriesCreated: boolean | null = null;
	let seriesError: string | null = null;
	if (typeof p.seriesName === 'string' && p.seriesName.trim() !== '') {
		try {
			const resolved = await resolveSeriesCached(context, seriesCache, p.seriesName.trim());
			seriesSectionId = resolved.sectionId;
			seriesCreated = resolved.created;
			await linkSeries(context, sectionId, seriesSectionId);
			fieldsWritten.push(SERIES_RELATION_TIPO);
		} catch (error) {
			seriesError = (error as Error).message;
		}
	}

	const authorSectionIds: number[] = [];
	const authorErrors: string[] = [];
	for (const author of authors) {
		try {
			const { surname, givenName } = splitAuthorName(author);
			if (surname === '') continue;
			const resolved = await resolvePersonCached(context, personCache, surname, givenName);
			authorSectionIds.push(resolved.sectionId);
		} catch (error) {
			authorErrors.push((error as Error).message);
		}
	}
	if (authorSectionIds.length > 0) {
		try {
			await linkAuthors(context, sectionId, authorSectionIds);
			fieldsWritten.push(AUTHORSHIP_RELATION_TIPO);
		} catch (error) {
			authorErrors.push((error as Error).message);
		}
	}

	let documentImported = false;
	let documentError: string | null = null;
	try {
		const outcome = await importDocumentForPublication(context, p, sectionId);
		documentImported = outcome.documentImported;
		documentError = outcome.documentError;
		if (outcome.pdfUrl !== null) {
			await writeIriField(
				sectionId,
				PUBLICATION_TIPO,
				PDF_URI_TIPO,
				outcome.pdfUrl,
				publicationTitle,
				context.userId,
			);
			fieldsWritten.push(PDF_URI_TIPO);
		}
	} catch (error) {
		documentError = (error as Error).message;
	}

	return {
		publication_identifier: p.publicationIdentifier,
		section_tipo: PUBLICATION_TIPO,
		section_id: sectionId,
		skipped: false,
		fields_written: fieldsWritten,
		series_section_id: seriesSectionId,
		series_created: seriesCreated,
		series_error: seriesError,
		author_section_ids: authorSectionIds,
		author_errors: authorErrors,
		document_imported: documentImported,
		document_error: documentError,
	};
}

/**
 * Commits a curated batch of publications from the review screen. Runs as a background job - a
 * full-journal batch (hundreds of records, each a create + several field writes + author/series
 * resolution) is easily minutes. Progress is published per publication.
 */
async function commitPublications(context: ToolActionContext): Promise<ToolResponse> {
	const publications = context.options.publications;
	if (!Array.isArray(publications) || publications.length === 0) {
		throw new DedaloError('tool.action_failed', {
			message:
				'commit_publications requires a non-empty "publications" array (from preview_url, minus any excluded).',
			publicMessage: 'No publications to import — run Preview first, then keep at least one.',
		});
	}

	const seriesCache = new Map<string, ResolvedSeries>();
	const personCache = new Map<string, ResolvedPerson>();
	const results: CommitOnePublicationResult[] = [];
	let counter = 0;
	for (const publication of publications) {
		if (publication === null || typeof publication !== 'object') continue;
		counter += 1;
		const p = publication as Record<string, unknown>;
		context.publishProgress?.({
			msg: `Creating record for "${typeof p.title === 'string' ? p.title : `publication ${counter}`}"`,
			counter,
			total: publications.length,
		});
		results.push(await commitOnePublication(context, p, seriesCache, personCache));
	}

	return ok({ results }, { requestId: toolRequestId(context) });
}

export const tool: ToolServerModule = {
	name: 'tool_bibliography_acquisition',
	apiActions: {
		preview_url: {
			permission: 'section',
			minLevel: 1,
			handler: previewUrl,
		},
		preview_html: {
			permission: 'section',
			minLevel: 1,
			handler: previewHtml,
		},
		commit_publications: {
			permission: 'section',
			minLevel: 2,
			handler: commitPublications,
		},
	},
	backgroundRunnable: ['preview_url', 'commit_publications'],
	// rsc3 covered too in case the resolved/real tipo is what reaches isAvailable instead of rsc205.
	isAvailable: (availabilityContext) =>
		availabilityContext.sectionTipo === PUBLICATION_TIPO ||
		availabilityContext.sectionTipo === 'rsc3',
};
