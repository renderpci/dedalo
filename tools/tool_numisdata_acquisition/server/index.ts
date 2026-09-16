/**
 * tool_numisdata_acquisition — pastes a public auction URL, fetches it, and
 * lets the operator review every lot before committing: preview_url returns
 * the parsed auction + lots (nothing written yet); commit_lots creates one
 * numisdata4 record per kept lot, resolves/links its Auction and Type, and
 * imports the lot's image via tool_import_files' crop_50 processor.
 *
 * lib/ is a verbatim-as-possible port of the standalone `coins` archive
 * tool's acquisition engine. All five sources are ported (jesusvico, biddr,
 * aureo, numisbids, sixbid) — each adapter.ts documents what's deliberately
 * NOT ported (headless-browser rendering, cross-auction search URL shapes)
 * and, for numisbids/sixbid, the explicit user authorization to bypass
 * robots.txt (numisbids blocks ClaudeBot by name; sixbid is a blanket
 * Disallow). Only jesusvico and biddr have been verified end-to-end against
 * real data so far.
 */

import { join } from 'node:path';
import { NO_LANG } from '../../../src/config/data_langs.ts';
import { sql } from '../../../src/core/db/postgres.ts';
import { DedaloError } from '../../../src/core/errors/dedalo_error.ts';
import { ok } from '../../../src/core/errors/index.ts';
import { stagingDir } from '../../../src/core/media/ingest/add_file.ts';
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
import { cropCoinPair } from '../../tool_import_files/server/script_files/numisdata/crop_50.ts';
import type { RawSource } from './lib/acquisition/http.ts';
import { downloadImageBytes, extensionFromUrl } from './lib/acquisition/image_fetch.ts';
import { aureoAdapter } from './lib/sources/aureo/adapter.ts';
import { biddrAdapter } from './lib/sources/biddr/adapter.ts';
import { jesusvicoAdapter } from './lib/sources/jesusvico/adapter.ts';
import { numisbidsAdapter } from './lib/sources/numisbids/adapter.ts';
import { sixbidAdapter } from './lib/sources/sixbid/adapter.ts';

const NUMISDATA_OBJECT_TIPO = 'numisdata4';
// material/mint/ruler/denomination/condition (thesaurus-linked) and sourceUrl
// (component_iri, value shape unverified) are still deliberately deferred.
const WEIGHT_TIPO = 'numisdata133'; // component_number
const DIAMETER_TIPO = 'numisdata135'; // component_number
const INVENTORY_NUMBER_TIPO = 'numisdata151'; // component_input_text, "Inventory number"
const DATE_TEXT_TIPO = 'numisdata1372'; // component_input_text
const AUCTION_RELATION_TIPO = 'numisdata147'; // component_autocomplete -> numisdata224
const OBVERSE_DESIGN_TIPO = 'numisdata763'; // component_text_area, "Specific obverse design"
const REVERSE_DESIGN_TIPO = 'numisdata1029'; // component_text_area, "Specific reverse design"
// Fallback ONLY, when a description doesn't follow jesusvico's "A/...R/..."
// split: component_text_area, "Public remark".
const PUBLIC_REMARK_TIPO = 'numisdata150';

// numisdata224's own fields (confirmed via dd_ontology this session).
const AUCTION_SECTION_TIPO = 'numisdata224';
const AUCTION_COMPANY_TIPO = 'numisdata228'; // component_autocomplete, no source config -> free text
// "Number & title" is a genuinely COMBINED field — formatAuctionNumberTitle
// uses the source's own title text, not the bare number. Since that's no
// longer a stable dedup key on its own, the bare number is ALSO written to
// AUCTION_CODE_TIPO purely for findExistingAuction to match on.
const AUCTION_NUMBER_TITLE_TIPO = 'numisdata230'; // component_input_text
const AUCTION_CODE_TIPO = 'numisdata231'; // component_input_text, "Code" (otherwise unused) — dedup key
// The generic non-reciprocal link relation type used everywhere else in this
// codebase; numisdata147 declares no config_relation.relation_type override.
const RELATION_TYPE_LINK = 'dd151';

// numisdata3 ("Type") — a shared scholarly catalog-classification record
// (Catalog system + Number, e.g. "ACIP" 1781). Read-only: findExistingType
// only ever LINKS to an existing Type, never creates one — it's a shared
// taxonomy entry (Mint/Denomination cross-links, weight/diameter averages
// computed across every linked object), and auto-fabricating one from
// scraped auction-house text risks polluting it in a way that's much harder
// to notice than an extra Auction record. No match -> left unlinked, reported.
const TYPE_RELATION_TIPO = 'numisdata161'; // component_autocomplete -> numisdata3
const TYPE_SECTION_TIPO = 'numisdata3';
const TYPE_CODE_TIPO = 'numisdata27'; // component_input_text, "Code"/"Number"
const TYPE_CATALOGUE_RELATION_TIPO = 'numisdata309'; // component_select -> numisdata300
const CATALOGUE_SECTION_TIPO = 'numisdata300';
const CATALOGUE_NAME_TIPO = 'numisdata303'; // component_input_text, e.g. "ACIP", "MIB", "RPC"

// Confirmed directly from the live numisdata256 ("Add images") ontology config.
const OBVERSE_PORTAL_TIPO = 'numisdata164';
const REVERSE_PORTAL_TIPO = 'numisdata165';
const IMAGE_SECTION_TIPO = 'rsc170'; // the shared "resource" image record type
const IMAGE_COMPONENT_TIPO = 'rsc29'; // component_image on rsc170
const IMPORT_KEY_DIR = 'numisdata_acquisition';

const ADAPTERS = [jesusvicoAdapter, biddrAdapter, aureoAdapter, numisbidsAdapter, sixbidAdapter];

function assertUrlOption(options: Record<string, unknown>): string {
	const url = options.url;
	if (typeof url !== 'string' || url.trim() === '') {
		throw new DedaloError('tool.action_failed', {
			message: 'preview_url requires a non-empty "url" string option.',
			publicMessage: 'Paste an auction URL first.',
		});
	}
	return url;
}

function findAdapterOrThrow(url: string) {
	const adapter = ADAPTERS.find((candidate) => candidate.matchesUrl(url));
	if (!adapter) {
		throw new DedaloError('tool.action_failed', {
			message: `No supported source adapter matches this URL: ${url}`,
			publicMessage:
				'Only jesusvico.com, biddr.com, aureo.com, numisbids.com, and sixbid.com URLs are supported.',
		});
	}
	return adapter;
}

/**
 * Fetches and parses one auction URL — no curation, no persistence. Also
 * runs a read-only Auction existence check so the review screen can show
 * "will link" vs "will create" before the operator commits to anything.
 *
 * Runs as a background job (multi-page listings can take 30s+, long enough
 * to hit the client's own retry timeout and collide with the idempotency
 * lock on the still-running attempt) — progress is published per page.
 */
async function previewUrl(context: ToolActionContext): Promise<ToolResponse> {
	const url = assertUrlOption(context.options);
	const adapter = findAdapterOrThrow(url);

	const acquisition = await adapter.acquire(url, (currentPage, totalPages) => {
		context.publishProgress?.({
			msg: `Fetching page ${currentPage} of ${totalPages}`,
			counter: currentPage,
			total: totalPages,
		});
	});
	const firstPage = acquisition.pages[0];
	if (firstPage === undefined) {
		throw new DedaloError('tool.action_failed', {
			message: `Adapter '${adapter.id}' returned zero pages for ${url}.`,
		});
	}

	const auction = adapter.parseAuction(firstPage, url);
	const lots = acquisition.pages.flatMap((page) => adapter.parseLots(page, url));

	const auctionHouse = auction.auctionHouse?.trim() ?? '';
	const auctionNumber = auction.auctionNumber?.trim() ?? '';
	const existingAuctionSectionId =
		auctionHouse !== '' && auctionNumber !== ''
			? await findExistingAuction(auctionHouse, auctionNumber)
			: null;

	return ok(
		{
			auction,
			lots,
			auction_status: {
				exists: existingAuctionSectionId !== null,
				section_id: existingAuctionSectionId,
			},
		},
		{ requestId: toolRequestId(context) },
	);
}

/**
 * Parses a page the OPERATOR's own browser already fetched, instead of this
 * tool fetching it live — the fallback for a source whose own defenses block
 * automated retrieval outright (confirmed live for numisbids.com: HTTP 403
 * from multiple independent networks). A human visiting a page isn't
 * automated retrieval, so there's nothing here to detect or bypass — this
 * just parses HTML the operator already legitimately has, in memory only,
 * never written to disk.
 *
 * Single-page only — no live fetch here to drive a pagination walk, so a
 * multi-page sale needs one preview_html call per page.
 */
async function previewHtml(context: ToolActionContext): Promise<ToolResponse> {
	const url = assertUrlOption(context.options);
	const html = context.options.html;
	if (typeof html !== 'string' || html.trim() === '') {
		throw new DedaloError('tool.action_failed', {
			message: 'preview_html requires a non-empty "html" string option.',
			publicMessage: "Paste or upload the saved page's HTML first.",
		});
	}

	const adapter = findAdapterOrThrow(url);
	// Host-allowlist guard still applies even though nothing is fetched — this
	// URL drives relative-link resolution and the Auction dedup search below.
	adapter.assertSafeUrl(url);

	const page: RawSource = { html, finalUrl: url, httpStatus: 200, contentType: 'text/html' };
	const auction = adapter.parseAuction(page, url);
	const lots = adapter.parseLots(page, url);

	const auctionHouse = auction.auctionHouse?.trim() ?? '';
	const auctionNumber = auction.auctionNumber?.trim() ?? '';
	const existingAuctionSectionId =
		auctionHouse !== '' && auctionNumber !== ''
			? await findExistingAuction(auctionHouse, auctionNumber)
			: null;

	return ok(
		{
			auction,
			lots,
			auction_status: {
				exists: existingAuctionSectionId !== null,
				section_id: existingAuctionSectionId,
			},
		},
		{ requestId: toolRequestId(context) },
	);
}

/** Parses "6.75g" / "29.6mm" style values into the plain float component_number expects. */
function parseLeadingNumber(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const match = value.match(/^-?\d+(\.\d+)?/);
	return match ? Number(match[0]) : null;
}

/**
 * Splits a jesusvico.com description on its "A/" (Anverso) / "R/" (Reverso)
 * markers, cutting the reverse run where the metrology block starts. One
 * confirmed sample, not a guaranteed convention — English-locale
 * descriptions carry no such markers. Returns nulls (not a guess) when
 * absent; the caller falls back to a general remark field.
 */
function splitJesusvicoDesign(description: string | null): {
	obverse: string | null;
	reverse: string | null;
} {
	if (description === null) return { obverse: null, reverse: null };
	const obverseStart = description.indexOf('A/');
	const reverseStart = description.indexOf('R/', obverseStart + 1);
	if (obverseStart === -1 || reverseStart === -1 || reverseStart <= obverseStart) {
		return { obverse: null, reverse: null };
	}
	const trimTrailingPunctuation = (text: string): string => text.trim().replace(/[.,;]\s*$/, '');
	const obverse = trimTrailingPunctuation(description.slice(obverseStart + 2, reverseStart));
	const afterReverse = description.slice(reverseStart + 2);
	const metrologyMatch = afterReverse.match(/\b(?:AE|AR|AV|AU|BI|Æ)\b|\d+(?:[.,]\d+)?\s*g\.?\s/i);
	const reverse = trimTrailingPunctuation(
		metrologyMatch?.index !== undefined
			? afterReverse.slice(0, metrologyMatch.index)
			: afterReverse,
	);
	return { obverse: obverse || null, reverse: reverse || null };
}

/** numisdata230 ("Number & title") gets the source's own auction title, which
 * already reads as both — falls back to the bare number only when a page has
 * no title at all. */
function formatAuctionNumberTitle(auctionNumber: string, title: string | null): string {
	const cleanTitle = title?.trim();
	return cleanTitle ? cleanTitle : auctionNumber;
}

/** Writes one field as a fresh 'set_data' (a bare {id, value} item).
 * `sectionTipo` MUST be the tipo `sectionId` actually belongs to — a prior
 * version hard-coded NUMISDATA_OBJECT_TIPO here, which silently no-opped
 * every Auction-record write (findOrCreateAuction targets numisdata224, not
 * numisdata4) with no error surfaced at all. */
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

/**
 * Downloads the lot's first image, stages it through Dédalo's upload
 * pipeline, splits it with `crop_50` (called directly — trusted server code,
 * not an untrusted client-named processor), then links each half through its
 * portal the same way tool_import_files' importIntoPortal does.
 */
async function importImagesForLot(
	context: ToolActionContext,
	lot: Record<string, unknown>,
	sectionId: number,
): Promise<string[]> {
	const images = lot.images;
	const first = Array.isArray(images) ? images[0] : undefined;
	const sourceUrl =
		first !== null && typeof first === 'object'
			? (first as { sourceUrl?: unknown }).sourceUrl
			: null;
	if (typeof sourceUrl !== 'string' || sourceUrl === '') {
		throw new DedaloError('tool.action_failed', {
			message: 'This lot has no image to import.',
			publicMessage: 'This lot has no image to import.',
		});
	}

	// The image host isn't always the page's own host (sixbid's
	// image-cdn.sixbid.com, biddr's media.biddr.com), so the safety check is
	// resolved from the image URL itself via the same adapter registry.
	const imageAdapter = ADAPTERS.find((candidate) => candidate.matchesUrl(sourceUrl));
	if (!imageAdapter) {
		throw new DedaloError('tool.action_failed', {
			message: `No source adapter recognizes this image's host: ${sourceUrl}`,
			publicMessage: 'This image is hosted somewhere this tool does not recognize.',
		});
	}

	const { bytes, contentType } = await downloadImageBytes(sourceUrl, imageAdapter.assertSafeUrl);
	const extension = extensionFromUrl(sourceUrl, contentType);
	const fileName = `numisdata4_${sectionId}.${extension}`;

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
		throw new DedaloError('tool.action_failed', { message: 'Image upload did not stage a file.' });
	}

	const outcome = await cropCoinPair({
		file_path: join(stagingDir(context.userId, IMPORT_KEY_DIR), staged.tmpName),
		file_name: fileName,
		user_id: context.userId,
		key_dir: IMPORT_KEY_DIR,
		file_processor_properties: [
			{
				function_name: 'crop_50',
				custom_arguments: {
					destination_1: OBVERSE_PORTAL_TIPO,
					destination_2: REVERSE_PORTAL_TIPO,
				},
			},
		],
	});
	if (!outcome.ok || outcome.outputs === undefined) {
		throw new DedaloError('tool.action_failed', {
			message: outcome.message,
			publicMessage: outcome.message,
		});
	}

	const spec = requireMediaSpec('component_image');
	const created: string[] = [];
	for (const output of outcome.outputs) {
		if (output.portalComponentTipo === undefined) continue;
		const save = await saveComponentData({
			componentTipo: output.portalComponentTipo,
			sectionTipo: NUMISDATA_OBJECT_TIPO,
			sectionId,
			lang: NO_LANG,
			userId: context.userId,
			changedData: [{ action: 'add_new_element', id: null, value: IMAGE_SECTION_TIPO }],
		});
		const createdSectionId = (save as { ok: boolean; created_section_id?: number })
			.created_section_id;
		if (!save.ok || createdSectionId === undefined) {
			throw new DedaloError('record.save_failed', {
				message: `Could not link the ${output.portalComponentTipo} image: ${save.message}`,
			});
		}
		const { identity, pathOpts } = await resolveMediaToolContext({
			component_tipo: IMAGE_COMPONENT_TIPO,
			section_tipo: IMAGE_SECTION_TIPO,
			section_id: createdSectionId,
		});
		const result = await processUploadedFile({
			spec,
			identity,
			pathOpts,
			userId: context.userId,
			keyDir: IMPORT_KEY_DIR,
			tmpName: output.tmpName,
			extension,
		});
		await persistUploadedMedia({
			sectionTipo: identity.sectionTipo,
			sectionId: identity.sectionId,
			componentTipo: identity.componentTipo,
			lang: identity.lang,
			filesInfo: result.filesInfo,
			originalFileName: output.fileName,
			originalNormalizedName: `${buildMediaIdentifier(identity)}.${result.extension}`,
			nameKeys: nameKeysForQuality(spec, undefined),
		});
		result.startTranscode?.();
		created.push(`${output.portalComponentTipo}→${IMAGE_SECTION_TIPO}#${createdSectionId}`);
	}

	return created;
}

/**
 * Exact match on (Company, Number & title) — a wrong match would silently
 * attach a lot to someone else's auction, worse than an occasional
 * duplicate. Used by previewUrl (check only) and findOrCreateAuction.
 */
async function findExistingAuction(
	auctionHouse: string,
	auctionNumber: string,
): Promise<number | null> {
	const table = await getMatrixTableFromTipo(AUCTION_SECTION_TIPO);
	if (table === null) {
		throw new DedaloError('tool.action_failed', {
			message: `No matrix table for section '${AUCTION_SECTION_TIPO}'.`,
		});
	}
	const existing = (await sql.unsafe(
		`SELECT section_id FROM "${table}"
		 WHERE section_tipo = $1
		   AND string->'${AUCTION_COMPANY_TIPO}'->0->>'value' = $2
		   AND string->'${AUCTION_CODE_TIPO}'->0->>'value' = $3
		 LIMIT 1`,
		[AUCTION_SECTION_TIPO, auctionHouse, auctionNumber],
	)) as { section_id: number }[];
	return existing[0]?.section_id ?? null;
}

/** Finds an existing numisdata224 Auction record, or creates one when none matches. */
async function findOrCreateAuction(
	context: ToolActionContext,
	auctionHouse: string,
	auctionNumber: string,
	title: string | null,
): Promise<{ sectionId: number; created: boolean }> {
	const found = await findExistingAuction(auctionHouse, auctionNumber);
	if (found !== null) return { sectionId: found, created: false };

	const sectionId = await createSectionRecord(AUCTION_SECTION_TIPO, context.userId);
	await writeField(
		sectionId,
		AUCTION_SECTION_TIPO,
		AUCTION_COMPANY_TIPO,
		auctionHouse,
		context.userId,
	);
	await writeField(
		sectionId,
		AUCTION_SECTION_TIPO,
		AUCTION_NUMBER_TITLE_TIPO,
		formatAuctionNumberTitle(auctionNumber, title),
		context.userId,
	);
	await writeField(
		sectionId,
		AUCTION_SECTION_TIPO,
		AUCTION_CODE_TIPO,
		auctionNumber,
		context.userId,
	);
	return { sectionId, created: true };
}

/** Links numisdata4's Auction field to an EXISTING numisdata224 record — a
 * real relation (numisdata147 carries a `source` config), so this goes
 * through save_component.ts's validateRelationInsert path. */
async function linkAuction(
	context: ToolActionContext,
	lotSectionId: number,
	auctionSectionId: number,
): Promise<void> {
	const save = await saveComponentData({
		componentTipo: AUCTION_RELATION_TIPO,
		sectionTipo: NUMISDATA_OBJECT_TIPO,
		sectionId: lotSectionId,
		lang: NO_LANG,
		userId: context.userId,
		changedData: [
			{
				action: 'set_data',
				value: [
					{
						id: 1,
						type: RELATION_TYPE_LINK,
						section_id: auctionSectionId,
						section_tipo: AUCTION_SECTION_TIPO,
						from_component_tipo: AUCTION_RELATION_TIPO,
					},
				],
			},
		],
	});
	if (!save.ok) {
		throw new DedaloError('record.save_failed', {
			message: `Could not link the Auction relation: ${save.message}`,
		});
	}
}

/** Real Catalogue (numisdata300) name -> section_id, loaded once per commit
 * batch — small, stable reference data. */
type CatalogueIndex = Map<string, number>;

/** Loads every real, currently-curated Catalogue name, so a scraped citation
 * is matched against what this Dédalo instance actually curates, never a
 * hardcoded/guessed abbreviation list. */
async function loadCatalogueIndex(): Promise<CatalogueIndex> {
	const table = await getMatrixTableFromTipo(CATALOGUE_SECTION_TIPO);
	const index: CatalogueIndex = new Map();
	if (table === null) return index;
	const rows = (await sql.unsafe(
		`SELECT section_id, string->'${CATALOGUE_NAME_TIPO}'->0->>'value' AS name
		 FROM "${table}"
		 WHERE section_tipo = $1`,
		[CATALOGUE_SECTION_TIPO],
	)) as { section_id: number; name: string | null }[];
	for (const row of rows) {
		if (row.name) index.set(row.name, row.section_id);
	}
	return index;
}

/**
 * Best-effort extraction of a catalog citation ("ACIP-1759") from a lot's
 * description — matched ONLY against real, currently-curated Catalogue
 * names. Confirmed live: jesusvico descriptions also carry citations from
 * catalogs this instance does NOT curate (e.g. "I-109" — jesusvico's own
 * house numbering) alongside real ones ("ACIP-1759"); non-matches are
 * silently skipped rather than guessed at. Longest name checked first so
 * e.g. "RIC I" can't shadow "RIC I (second edition)".
 */
function extractCatalogueCitation(
	text: string | null,
	catalogueIndex: CatalogueIndex,
): { catalogueName: string; catalogueSectionId: number; code: string } | null {
	if (!text) return null;
	const names = [...catalogueIndex.keys()].sort((a, b) => b.length - a.length);
	for (const name of names) {
		const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const match = text.match(new RegExp(`\\b${escapedName}[\\s-]+(\\d+(?:[./]\\d+)?)`));
		if (match) {
			const catalogueSectionId = catalogueIndex.get(name);
			if (catalogueSectionId !== undefined) {
				return { catalogueName: name, catalogueSectionId, code: match[1]! };
			}
		}
	}
	return null;
}

/** Finds an EXISTING numisdata3 Type record matching a catalog citation —
 * deliberately never creates one (see TYPE_* constants for why). Matches on
 * the exact Catalogue relation + exact Code text. */
async function findExistingType(catalogueSectionId: number, code: string): Promise<number | null> {
	const table = await getMatrixTableFromTipo(TYPE_SECTION_TIPO);
	if (table === null) {
		throw new DedaloError('tool.action_failed', {
			message: `No matrix table for section '${TYPE_SECTION_TIPO}'.`,
		});
	}
	const existing = (await sql.unsafe(
		`SELECT section_id FROM "${table}"
		 WHERE section_tipo = $1
		   AND relation->'${TYPE_CATALOGUE_RELATION_TIPO}'->0->>'section_id' = $2
		   AND string->'${TYPE_CODE_TIPO}'->0->>'value' = $3
		 LIMIT 1`,
		[TYPE_SECTION_TIPO, String(catalogueSectionId), code],
	)) as { section_id: number }[];
	return existing[0]?.section_id ?? null;
}

/** Links numisdata4's Type field to an EXISTING numisdata3 record — same
 * relation-write shape as linkAuction. */
async function linkType(
	context: ToolActionContext,
	lotSectionId: number,
	typeSectionId: number,
): Promise<void> {
	const save = await saveComponentData({
		componentTipo: TYPE_RELATION_TIPO,
		sectionTipo: NUMISDATA_OBJECT_TIPO,
		sectionId: lotSectionId,
		lang: NO_LANG,
		userId: context.userId,
		changedData: [
			{
				action: 'set_data',
				value: [
					{
						id: 1,
						type: RELATION_TYPE_LINK,
						section_id: typeSectionId,
						section_tipo: TYPE_SECTION_TIPO,
						from_component_tipo: TYPE_RELATION_TIPO,
					},
				],
			},
		],
	});
	if (!save.ok) {
		throw new DedaloError('record.save_failed', {
			message: `Could not link the Type relation: ${save.message}`,
		});
	}
}

/** One lot's outcome from commitLots. */
interface CommitOneLotResult {
	lot_identifier: unknown;
	section_tipo: string;
	section_id: number;
	fields_written: string[];
	auction_section_id: number | null;
	auction_created: boolean | null;
	auction_error: string | null;
	// null section_id covers both "no citation found" and "citation found but
	// no Type matched it" — type_citation distinguishes the two.
	type_section_id: number | null;
	type_citation: string | null;
	type_error: string | null;
	images_created: string[] | null;
	images_error: string | null;
}

/** One resolved Auction, cached within a commitLots batch. */
interface ResolvedAuction {
	sectionId: number;
	created: boolean;
}

/** Resolves the Auction for ONE lot against a batch-shared cache, keyed on
 * (house, number) — a distinct auction resolves once no matter how many
 * lots in the batch share it. */
async function resolveAuctionCached(
	context: ToolActionContext,
	cache: Map<string, ResolvedAuction>,
	auctionHouse: string,
	auctionNumber: string,
	title: string | null,
): Promise<ResolvedAuction> {
	const key = `${auctionHouse} ${auctionNumber}`;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;
	const resolved = await findOrCreateAuction(context, auctionHouse, auctionNumber, title);
	cache.set(key, resolved);
	return resolved;
}

/**
 * Biddr's and sixbid's search results label each lot's real auction as
 * "<House>, <Auction title>" (confirmed live for both). Splits it into a
 * per-lot Company + Number&title override so a search batch resolves each
 * lot against ITS OWN auction rather than the batch-level pseudo-auction.
 * The "number" half is really the title text (not always a bare digit), used
 * as both dedup key and display text.
 */
function splitSearchAuctionCategory(category: string): { house: string; label: string } | null {
	const idx = category.indexOf(', ');
	if (idx === -1) return null;
	const house = category.slice(0, idx).trim();
	const label = category.slice(idx + 2).trim();
	if (house === '' || label === '') return null;
	return { house, label };
}

/**
 * Creates a numisdata4 record from one previewed lot, writes its fields, and
 * resolves/links Auction, Type, and image. The Auction/Type/image steps are
 * best-effort — a failure there is surfaced in the result, not thrown, since
 * the record itself already exists with real fields on it.
 *
 * For most batches every lot shares the same batch-level auction info; for a
 * Biddr/sixbid search batch, each lot's own `category` overrides it (see
 * splitSearchAuctionCategory) so it resolves against its real auction.
 */
async function commitOneLot(
	context: ToolActionContext,
	lot: Record<string, unknown>,
	auctionHouse: string,
	auctionNumber: string,
	auctionTitle: string | null,
	auctionSourceDomain: string,
	auctionCache: Map<string, ResolvedAuction>,
	catalogueIndex: CatalogueIndex,
): Promise<CommitOneLotResult> {
	const l = lot;
	const sectionId = await createSectionRecord(NUMISDATA_OBJECT_TIPO, context.userId);

	const fieldsWritten: string[] = [];
	const weight = parseLeadingNumber(l.weight);
	if (weight !== null) {
		await writeField(sectionId, NUMISDATA_OBJECT_TIPO, WEIGHT_TIPO, weight, context.userId);
		fieldsWritten.push(WEIGHT_TIPO);
	}
	const diameter = parseLeadingNumber(l.diameter);
	if (diameter !== null) {
		await writeField(sectionId, NUMISDATA_OBJECT_TIPO, DIAMETER_TIPO, diameter, context.userId);
		fieldsWritten.push(DIAMETER_TIPO);
	}
	if (typeof l.lotNumber === 'string' && l.lotNumber.trim() !== '') {
		await writeField(
			sectionId,
			NUMISDATA_OBJECT_TIPO,
			INVENTORY_NUMBER_TIPO,
			l.lotNumber,
			context.userId,
		);
		fieldsWritten.push(INVENTORY_NUMBER_TIPO);
	}
	if (typeof l.datePeriod === 'string' && l.datePeriod.trim() !== '') {
		await writeField(
			sectionId,
			NUMISDATA_OBJECT_TIPO,
			DATE_TEXT_TIPO,
			l.datePeriod,
			context.userId,
		);
		fieldsWritten.push(DATE_TEXT_TIPO);
	}
	const description = typeof l.description === 'string' ? l.description : null;
	const { obverse: obverseDesign, reverse: reverseDesign } = splitJesusvicoDesign(description);
	if (obverseDesign !== null) {
		await writeField(
			sectionId,
			NUMISDATA_OBJECT_TIPO,
			OBVERSE_DESIGN_TIPO,
			obverseDesign,
			context.userId,
		);
		fieldsWritten.push(OBVERSE_DESIGN_TIPO);
	}
	if (reverseDesign !== null) {
		await writeField(
			sectionId,
			NUMISDATA_OBJECT_TIPO,
			REVERSE_DESIGN_TIPO,
			reverseDesign,
			context.userId,
		);
		fieldsWritten.push(REVERSE_DESIGN_TIPO);
	}
	if (
		obverseDesign === null &&
		reverseDesign === null &&
		description !== null &&
		description.trim() !== ''
	) {
		await writeField(
			sectionId,
			NUMISDATA_OBJECT_TIPO,
			PUBLIC_REMARK_TIPO,
			description,
			context.userId,
		);
		fieldsWritten.push(PUBLIC_REMARK_TIPO);
	}

	let effectiveAuctionHouse = auctionHouse;
	let effectiveAuctionNumber = auctionNumber;
	let effectiveAuctionTitle = auctionTitle;
	const isSearchCategorySource =
		auctionSourceDomain === 'biddr.com' || auctionSourceDomain === 'sixbid.com';
	if (isSearchCategorySource && typeof l.category === 'string' && l.category !== '') {
		const split = splitSearchAuctionCategory(l.category);
		if (split !== null) {
			effectiveAuctionHouse = split.house;
			effectiveAuctionNumber = split.label;
			effectiveAuctionTitle = split.label;
		}
	}

	let auctionSectionId: number | null = null;
	let auctionCreated: boolean | null = null;
	let auctionError: string | null = null;
	if (effectiveAuctionHouse !== '' && effectiveAuctionNumber !== '') {
		try {
			const resolved = await resolveAuctionCached(
				context,
				auctionCache,
				effectiveAuctionHouse,
				effectiveAuctionNumber,
				effectiveAuctionTitle,
			);
			auctionSectionId = resolved.sectionId;
			auctionCreated = resolved.created;
			await linkAuction(context, sectionId, auctionSectionId);
			fieldsWritten.push(AUCTION_RELATION_TIPO);
		} catch (error) {
			auctionError = (error as Error).message;
		}
	}

	let typeSectionId: number | null = null;
	let typeCitation: string | null = null;
	let typeError: string | null = null;
	try {
		const citation = extractCatalogueCitation(description, catalogueIndex);
		if (citation !== null) {
			typeCitation = `${citation.catalogueName}-${citation.code}`;
			typeSectionId = await findExistingType(citation.catalogueSectionId, citation.code);
			if (typeSectionId !== null) {
				await linkType(context, sectionId, typeSectionId);
				fieldsWritten.push(TYPE_RELATION_TIPO);
			}
		}
	} catch (error) {
		typeError = (error as Error).message;
	}

	let imagesCreated: string[] | null = null;
	let imagesError: string | null = null;
	try {
		imagesCreated = await importImagesForLot(context, l, sectionId);
	} catch (error) {
		imagesError = (error as Error).message;
	}

	return {
		lot_identifier: l.lotIdentifier,
		section_tipo: NUMISDATA_OBJECT_TIPO,
		section_id: sectionId,
		fields_written: fieldsWritten,
		auction_section_id: auctionSectionId,
		auction_created: auctionCreated,
		auction_error: auctionError,
		type_section_id: typeSectionId,
		type_citation: typeCitation,
		type_error: typeError,
		images_created: imagesCreated,
		images_error: imagesError,
	};
}

/**
 * Commits a curated batch of lots from the review screen. Runs as a
 * background job — a real batch (dozens to hundreds of lots, each a record
 * create + several field writes + an image download/crop/link) is easily
 * minutes, long enough to hit the client's retry window. Progress is
 * published per lot.
 */
async function commitLots(context: ToolActionContext): Promise<ToolResponse> {
	const lots = context.options.lots;
	if (!Array.isArray(lots) || lots.length === 0) {
		throw new DedaloError('tool.action_failed', {
			message:
				'commit_lots requires a non-empty "lots" array (from preview_url, minus any excluded).',
			publicMessage: 'No lots to import — run Preview first, then keep at least one lot.',
		});
	}
	const auction = context.options.auction;
	const a =
		auction !== null && typeof auction === 'object' ? (auction as Record<string, unknown>) : null;
	const auctionHouse = typeof a?.auctionHouse === 'string' ? a.auctionHouse.trim() : '';
	// Falls back to the adapter's own auctionIdentifier when auctionNumber is
	// empty — numisbids' sale page exposes no separate human-facing number,
	// which was silently skipping Auction resolution for every numisbids lot.
	const rawAuctionNumber = typeof a?.auctionNumber === 'string' ? a.auctionNumber.trim() : '';
	const auctionNumber =
		rawAuctionNumber !== ''
			? rawAuctionNumber
			: typeof a?.auctionIdentifier === 'string'
				? a.auctionIdentifier.trim()
				: '';
	const auctionTitle =
		typeof a?.title === 'string' && a.title.trim() !== '' ? a.title.trim() : null;
	const auctionSourceDomain = typeof a?.sourceDomain === 'string' ? a.sourceDomain : '';

	const auctionCache = new Map<string, ResolvedAuction>();
	const catalogueIndex = await loadCatalogueIndex();
	const results: CommitOneLotResult[] = [];
	let counter = 0;
	for (const lot of lots) {
		if (lot === null || typeof lot !== 'object') continue;
		counter += 1;
		const l = lot as Record<string, unknown>;
		context.publishProgress?.({
			msg: `Creating record for lot ${typeof l.lotNumber === 'string' ? l.lotNumber : counter}`,
			counter,
			total: lots.length,
		});
		results.push(
			await commitOneLot(
				context,
				l,
				auctionHouse,
				auctionNumber,
				auctionTitle,
				auctionSourceDomain,
				auctionCache,
				catalogueIndex,
			),
		);
	}

	return ok({ results }, { requestId: toolRequestId(context) });
}

export const tool: ToolServerModule = {
	name: 'tool_numisdata_acquisition',
	apiActions: {
		// Read-only: fetches external data + a read-only Auction check, writes nothing.
		preview_url: {
			permission: 'section',
			minLevel: 1,
			handler: previewUrl,
		},
		// Same read gate — parses HTML the operator already fetched, no network request.
		preview_html: {
			permission: 'section',
			minLevel: 1,
			handler: previewHtml,
		},
		// Write: resolves Auction/Type, creates one record per kept lot, imports images.
		commit_lots: {
			permission: 'section',
			minLevel: 2,
			handler: commitLots,
		},
	},
	// Both run in the background — each is slow enough that the client drives
	// them as jobs with live progress rather than one synchronous request.
	backgroundRunnable: ['preview_url', 'commit_lots'],
	// Scopes the toolbar button to numisdata4 only (register.json's
	// affected_models:["section"] has no narrower scope of its own).
	isAvailable: (availabilityContext) => availabilityContext.sectionTipo === NUMISDATA_OBJECT_TIPO,
};
