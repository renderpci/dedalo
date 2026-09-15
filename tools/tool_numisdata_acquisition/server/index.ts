/**
 * tool_numisdata_acquisition — pastes a public auction URL, fetches it
 * (conservative, rate-limited — see lib/acquisition/), and lets the operator
 * review every lot found before committing: preview_url returns the parsed
 * auction + lots as structured JSON (nothing written yet); commit_lots then
 * creates one real numisdata4 record per kept lot, resolves/links its
 * Auction (numisdata224, found-or-created per source auction), and imports
 * the lot's image via tool_import_files' crop_50 processor.
 *
 * lib/ is a verbatim-as-possible port of the standalone `coins` archive
 * tool's acquisition engine (src/acquisition/, src/domain/, src/extraction/,
 * src/sources/) — see that repo's ARCHITECTURE.md "Alternative: direct
 * integration" section, which is exactly this. All five sources are ported
 * (jesusvico, biddr, aureo, numisbids, sixbid) — each source's own adapter.ts
 * documents what's deliberately NOT ported yet (headless-browser rendering,
 * cross-auction search/historical-archive URL shapes) and, for numisbids/
 * sixbid, the explicit user authorization to bypass robots.txt (numisbids'
 * own robots.txt names and blocks ClaudeBot; sixbid's is a blanket Disallow
 * for every agent) — see each adapter's own comment for the full disclosure.
 * NONE of the four newer sources (biddr, aureo, numisbids, sixbid) have been
 * tested against a real live page yet — only jesusvico has been verified
 * end-to-end against real data.
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
/** numisdata4's component tipos this v1 slice writes. material/mint/ruler/
 * denomination/condition (thesaurus-linked) and sourceUrl (component_iri,
 * value shape unverified) are still deliberately deferred. */
const WEIGHT_TIPO = 'numisdata133'; // component_number
const DIAMETER_TIPO = 'numisdata135'; // component_number
const INVENTORY_NUMBER_TIPO = 'numisdata151'; // component_input_text, "Inventory number" (sibling of numisdata146 under numisdata145)
const DATE_TEXT_TIPO = 'numisdata1372'; // component_input_text
const AUCTION_RELATION_TIPO = 'numisdata147'; // component_autocomplete -> numisdata224 (a real relation)
const OBVERSE_DESIGN_TIPO = 'numisdata763'; // component_text_area, "Specific obverse design"
const REVERSE_DESIGN_TIPO = 'numisdata1029'; // component_text_area, "Specific reverse design"
// Fallback ONLY: when a description doesn't follow the "A/...R/..." split
// (confirmed so far on one jesusvico convention; English-locale/other-style
// lots don't use it), the whole description lands here rather than being
// lost. component_text_area, "Public remark".
const PUBLIC_REMARK_TIPO = 'numisdata150';

// numisdata224's own fields (confirmed via dd_ontology this session — see
// numisdata225's children). numisdata229 "Date" (component_date) is NOT
// written: every source we've tested so far (single-lot fetches) reports
// startDate: null, so there's no real data to verify that write shape
// against yet.
const AUCTION_SECTION_TIPO = 'numisdata224';
const AUCTION_COMPANY_TIPO = 'numisdata228'; // component_autocomplete, no source config -> free text
// Confirmed label (dd_ontology): "Number & title" — a genuinely COMBINED
// field, not a bare number. Writing the raw auctionNumber here ("178") was
// wrong; formatAuctionNumberTitle uses the source's own auction title
// ("Subasta Presencial 178") instead, which already reads as both. Because
// that text is no longer a stable dedup key on its own, the bare
// auctionNumber is ALSO written to AUCTION_CODE_TIPO purely so
// findExistingAuction has something exact and stable to match on.
const AUCTION_NUMBER_TITLE_TIPO = 'numisdata230'; // component_input_text
const AUCTION_CODE_TIPO = 'numisdata231'; // component_input_text, "Code" (otherwise unused) — the dedup key
// The generic link relation type used everywhere else in this codebase for
// an ordinary (non-reciprocal) relation — numisdata147 declares no
// config_relation.relation_type override, unlike e.g. numisdata55's
// "Equivalents" (dd47), so it takes this default.
const RELATION_TYPE_LINK = 'dd151';

// Confirmed directly from the live numisdata256 ("Add images") ontology config
// read earlier this session — not a generic resolution, the real values.
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
 * Fetches and parses one auction URL, returning everything found — no
 * curation, no persistence. The caller (client UI) lets the user drop
 * unwanted lots before anything is created in Dédalo (commit_lots).
 *
 * Also runs a READ-ONLY existence check for the Auction record, so the
 * review screen can show "will link to an existing auction" vs "will
 * create a new one" before the operator commits to anything — the same
 * dedup key commit_lots uses to actually resolve it (see
 * findExistingAuction), just without the create-if-missing half.
 *
 * BACKGROUND JOB: a full multi-page auction listing acquires every page
 * sequentially, each rate-limited (adapter.acquire's own onProgress
 * callback — already part of the SourceAdapter contract, just unused until
 * now) — for a large auction that's easily 30s+, long enough that a
 * synchronous round trip hit the client's own retry timeout and collided
 * with the idempotency lock on the still-running first attempt (observed
 * live: two overlapping preview_url calls, one at ~10s one at ~34s). Progress
 * is published per page so the client can show real status instead of
 * guessing when to give up.
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
 * tool live-fetching the URL — the fallback for a source whose own active
 * defenses block automated retrieval outright (confirmed live for
 * numisbids.com: HTTP 403 from multiple independent network origins, both
 * before and after removing this tool's own robots.txt check, consistent
 * with its robots.txt explicitly naming and blocking crawlers like
 * ClaudeBot). A real browser visiting the page isn't automated retrieval, so
 * there's nothing here to detect or bypass — the operator saves the page,
 * this just parses the HTML they already legitimately have.
 *
 * The pasted HTML is parsed in memory only — never written to disk, nothing
 * to clean up, nothing persists past this one request/response.
 *
 * Single-page only: there's no live fetch here to drive a pagination walk,
 * so a multi-page sale needs one preview_html call per page (or the site's
 * own single-lot URLs pasted individually).
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
	// SSRF/host-allowlist guard still applies even though nothing is fetched here — this URL
	// drives relative-link resolution and the Auction dedup search below, so it must still be a
	// real, safe URL for this source rather than an attacker-supplied one paired with forged HTML.
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

/** Parses "6.75g" / "29.6mm" style values (weight/diameter's stored shape —
 * see lib/domain/lot.ts) into the plain float component_number expects. */
function parseLeadingNumber(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const match = value.match(/^-?\d+(\.\d+)?/);
	return match ? Number(match[0]) : null;
}

/**
 * Splits a jesusvico.com description on its "A/" (Anverso) / "R/" (Reverso)
 * markers — confirmed live: "... CELSA. As. A/ Busto de Victoria a der., ...
 * R/ Yunta fundacional a der.; PR QVIN/ M FVL COTAC. AE 13,8 g. 28,5 mm.
 * I-796; ...". The reverse run is cut where the metrology block starts (a
 * composition code — AE/AR/AV/AU/BI — or a bare weight figure), the exact
 * boundary extractJesusvicoWeight/Diameter already read from in
 * lib/sources/jesusvico/parser.ts — this and those are reading adjacent
 * parts of the same sentence, just for a different field.
 *
 * ONE confirmed sample, not a guaranteed convention — this is an
 * ancient/Iberian-style Spanish-locale catalogue description; the
 * English-locale "CATHOLIC MONARCHS (1475-1504)..." style tested earlier
 * this session carries no "A/"/"R/" markers at all. Returns nulls (not a
 * guess) when they're absent — the caller falls back to storing the whole
 * description in a general remark field instead of losing it.
 *
 * Deliberately NOT in lib/sources/jesusvico/parser.ts: this is OUR field
 * mapping onto numisdata4's design fields, not a fact about the source
 * itself the way weight/diameter/datePeriod are — jesusvico's own
 * ExtractedLot.description already carries the full text either way.
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

/** numisdata230 ("Number & title") gets the source's own auction title
 * (jesusvico's h1: "Subasta Presencial 178", "Online Auction 178", ...) —
 * it already reads as the number and title together, so no need to append
 * the bare number again. Falls back to the bare number only when a page has
 * no title at all (title is nullable on ExtractedAuction; shouldn't happen
 * on a real listing page, but not a reason to throw). */
function formatAuctionNumberTitle(auctionNumber: string, title: string | null): string {
	const cleanTitle = title?.trim();
	return cleanTitle ? cleanTitle : auctionNumber;
}

/** Writes one field as a fresh 'set_data' — the shape confirmed by reading
 * save_component.ts's set_data branch: a bare {id, value} item, no lang (a
 * non-translatable model is auto-stamped 'lg-nolan' regardless of what's
 * passed here).
 *
 * `sectionTipo` MUST be the tipo of the record `sectionId` actually belongs
 * to — this was hard-coded to NUMISDATA_OBJECT_TIPO ('numisdata4') until a
 * live commit exposed the bug: findOrCreateAuction's two calls pass a
 * numisdata224 (Auction) sectionId, and with the lot's tipo pinned here
 * saveComponentData silently wrote nothing (no throw, no error surfaced —
 * confirmed by querying the DB directly: the freshly created Auction record's
 * own numisdata228/numisdata230 fields were empty even though commit_lots
 * reported auction_created: true with no auction_error). */
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
 * Downloads the lot's first image, stages it through Dédalo's own upload
 * pipeline (receiveUpload — the same magic-byte-sniffing, size-bounded path a
 * real browser upload takes), splits it with `crop_50` (called directly —
 * we're invoking a known function server-side, not dispatching an
 * untrusted client-named processor, so the SEC-053 registry lookup doesn't
 * apply here), then links each half through its portal exactly like
 * `tool_import_files`'s `importIntoPortal` does — same public primitives,
 * no import of that tool's private functions.
 *
 * A plain helper, not its own apiAction: `commitLot` calls this in the same
 * request, since the operator always wants both — one button, one round
 * trip. Throws on failure; the caller decides whether that sinks the whole
 * response or is reported alongside a record that was already created.
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

	// The image host isn't always the same as the auction page's host (e.g. sixbid's
	// image-cdn.sixbid.com, biddr's media.biddr.com), so the safety check is resolved from the
	// image URL itself via the same adapter registry preview_url/commit_lots already use, rather
	// than assuming whichever adapter matched the pasted auction URL also owns this image host.
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
 * READ-ONLY half of the Auction dedup: an EXACT match on (Company, Number &
 * title), the same narrow key findOrCreateAuction commits with — a wrong
 * match would silently attach a lot to someone else's auction, which is
 * worse than an occasional duplicate record. Used by both previewUrl (check
 * only, before anything is written) and findOrCreateAuction (check, then
 * create if missing).
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

/**
 * Finds an existing numisdata224 Auction record (findExistingAuction), or
 * creates one when none matches.
 */
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

/**
 * Links numisdata4's Auction field to an EXISTING numisdata224 record.
 * Unlike every other write in this tool, numisdata147 carries a real
 * `source` config (confirmed against the live ontology) — it's a genuine
 * relation, not a plain literal, so this goes through save_component.ts's
 * validateRelationInsert path. The least-verified write here so far.
 */
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

/** One lot's outcome from commitLots — plain data, not a wire envelope
 * (commitLots wraps the whole array in the ONE response envelope). */
interface CommitOneLotResult {
	lot_identifier: unknown;
	section_tipo: string;
	section_id: number;
	fields_written: string[];
	auction_section_id: number | null;
	auction_created: boolean | null;
	auction_error: string | null;
	images_created: string[] | null;
	images_error: string | null;
}

/** One resolved Auction, cached within a commitLots batch. */
interface ResolvedAuction {
	sectionId: number;
	created: boolean;
}

/**
 * Resolves the Auction for ONE lot against a batch-shared cache, keyed on
 * (house, number) — a DISTINCT auction resolves (and possibly creates) once
 * no matter how many lots in the batch share it; a batch mixing lots from
 * several real auctions (a source with cross-auction filtering — numisbids'
 * searchall, aureo's historical archive, both documented in coins' own
 * README as producing exactly this shape; not wired up here yet, since
 * jesusvico — the only source this tool supports today — has no such
 * listing) still resolves each one correctly instead of forcing every lot
 * onto whichever auction happened to be resolved first.
 */
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
 * Both Biddr's and sixbid's search results label each lot's real originating auction as
 * "<House>, <Auction title>" — confirmed independently against real live data for each (Biddr:
 * "Heritage Auctions, Auction 61650", "Stack's Bowers Galleries, September 2026 World Premier CC
 * Auction"; sixbid: built from the API's own separate companyName/auctionName fields into the
 * identical "House, Title" shape in parser.ts's parseSixbidSearchLots specifically so this one
 * splitter covers both). Splits it into a per-lot Company + Number&title override so a search
 * batch (which spans several real auctions) resolves/links each lot to ITS OWN auction rather than
 * the batch-level pseudo-auction ("Multiple auction houses") preview_url returns for the search
 * itself.
 *
 * The "number" half here is really the whole title after the comma, not always a bare digit (the
 * Stack's Bowers example has none) — used as both the dedup key and the display text, same as any
 * other source's auctionNumber/title pair; splitting further into a true numeric id isn't reliable
 * (a bare \d+ match would misread "2026" as an auction number).
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
 * Creates a real numisdata4 record from one previously-previewed lot, writes
 * the mapped fields, resolves (finds-or-creates, via the batch cache) and
 * links its Auction, and imports the image.
 *
 * The Auction and image steps are best-effort and reported, not fatal: by
 * the time they run the record already exists with real fields on it, so a
 * failure there must not read as "nothing happened" — it's surfaced in the
 * result, not thrown.
 *
 * For a normal single-auction batch every lot shares the same batch-level
 * auctionHouse/auctionNumber/auctionTitle (passed in as-is). For a Biddr or
 * sixbid search batch, each lot's own `category` (see
 * splitSearchAuctionCategory) overrides those three so it resolves against
 * ITS real auction instead of the batch's pseudo-auction — only these two
 * sources' search formats are verified so far; the same override point is
 * where numisbids'/aureo's own search formats would plug in once each is
 * verified against real data.
 */
async function commitOneLot(
	context: ToolActionContext,
	lot: Record<string, unknown>,
	auctionHouse: string,
	auctionNumber: string,
	auctionTitle: string | null,
	auctionSourceDomain: string,
	auctionCache: Map<string, ResolvedAuction>,
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
		images_created: imagesCreated,
		images_error: imagesError,
	};
}

/**
 * Commits a CURATED batch of lots from the review screen — creates one
 * numisdata4 record per lot, each resolving its OWN Auction against a
 * batch-shared cache (see resolveAuctionCached: correct for a future batch
 * spanning several real auctions, one DB round-trip per distinct one
 * either way). One button, one round trip, for however many lots the
 * operator kept.
 *
 * For most sources every lot shares the same batch-level `auction` option
 * (a single real auction has no cross-auction listing) — the cache just
 * makes that the OUTCOME of the per-lot logic instead of an assumption baked
 * into the caller. A Biddr or sixbid search batch is the exception verified
 * so far: each lot's own `category` overrides the batch-level auction (see
 * commitOneLot/splitSearchAuctionCategory).
 *
 * BACKGROUND JOB: each lot is a record create + several field writes + an
 * image download/crop/link — for a real review batch (dozens to hundreds of
 * lots) that's easily minutes, the same class of problem preview_url's own
 * multi-page fetch had (observed live: a 190-lot batch blew past the
 * client's ~10s retry window and collided with the idempotency lock on the
 * still-running first attempt). Progress is published per lot.
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
	// Falls back to the adapter's own auctionIdentifier when auctionNumber is empty — numisbids'
	// sale page exposes no separate human-facing "number" (parseNumisbidsAuction sets it null,
	// confirmed against a real saved sale page: the page has a house name and an "Auction 389"
	// title, but nothing numisbids itself labels as a number), which was silently skipping Auction
	// resolution entirely for every numisbids lot (the guard below requires a non-empty number).
	// auctionIdentifier is always non-empty for a real auction (every adapter sets it from the
	// URL/API), so this recovers a usable dedup key without guessing at page content that isn't
	// there.
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
			),
		);
	}

	return ok({ results }, { requestId: toolRequestId(context) });
}

export const tool: ToolServerModule = {
	name: 'tool_numisdata_acquisition',
	apiActions: {
		// 'section' + minLevel 1 (read): this action fetches external data and
		// returns it for preview (including a read-only Auction existence
		// check) — it writes nothing to Dédalo's own DB, so a read gate on the
		// numisdata4 caller is enough.
		preview_url: {
			permission: 'section',
			minLevel: 1,
			handler: previewUrl,
		},
		// Same read gate as preview_url — parses a page the operator's own
		// browser already fetched (see previewHtml's own comment) instead of
		// live-fetching the URL. No network request happens here at all.
		preview_html: {
			permission: 'section',
			minLevel: 1,
			handler: previewHtml,
		},
		// minLevel 2 (write): resolves the Auction once, then creates one
		// record per kept lot, writes fields, AND imports images.
		commit_lots: {
			permission: 'section',
			minLevel: 2,
			handler: commitLots,
		},
	},
	// Both run in the background: a multi-page listing fetch (preview_url) and
	// a multi-lot commit (commit_lots — record create + fields + image per
	// lot) are both slow enough that the client drives them as jobs with live
	// progress rather than one synchronous request each.
	backgroundRunnable: ['preview_url', 'commit_lots'],
	// Scopes the toolbar button to numisdata4 only — without this it was
	// surfacing on every section generically (affected_models:["section"] in
	// register.json has no narrower scope of its own).
	isAvailable: (availabilityContext) => availabilityContext.sectionTipo === NUMISDATA_OBJECT_TIPO,
};
