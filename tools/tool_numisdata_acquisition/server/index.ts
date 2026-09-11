/**
 * tool_numisdata_acquisition — pastes a public auction URL, fetches it
 * (conservative, robots.txt-respecting, rate-limited — see lib/acquisition/),
 * and returns the parsed auction + lots as structured JSON. This is the
 * acquisition half only: nothing is written to Dédalo's own DB yet, no
 * images are downloaded, no numisdata4 record is created. Those are later
 * slices — this proves the pipe end to end first (see
 * docs/ — v7_autoimport_data branch — for the staged plan).
 *
 * lib/ is a verbatim-as-possible port of the standalone `coins` archive
 * tool's acquisition engine (src/acquisition/, src/domain/, src/extraction/,
 * src/sources/) — see that repo's ARCHITECTURE.md "Alternative: direct
 * integration" section, which is exactly this. Only one source adapter
 * (jesusvico.com — fully robots.txt-permissive, simplest of the five) is
 * ported so far; the other four (Biddr, sixbid, numisbids, aureo) get added
 * the same way once this slice is proven.
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
import { downloadImageBytes, extensionFromUrl } from './lib/acquisition/image_fetch.ts';
import { jesusvicoAdapter } from './lib/sources/jesusvico/adapter.ts';

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
const AUCTION_NUMBER_TITLE_TIPO = 'numisdata230'; // component_input_text
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

/** The only adapter wired up so far. Becomes a registry lookup (by URL) once more sources land. */
const ADAPTERS = [jesusvicoAdapter];

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

	const adapter = ADAPTERS.find((candidate) => candidate.matchesUrl(url));
	if (!adapter) {
		throw new DedaloError('tool.action_failed', {
			message: `No supported source adapter matches this URL: ${url}`,
			publicMessage: 'Only jesusvico.com URLs are supported right now — more sources are coming.',
		});
	}

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

/** Writes one field as a fresh 'set_data' — the shape confirmed by reading
 * save_component.ts's set_data branch: a bare {id, value} item, no lang (a
 * non-translatable model is auto-stamped 'lg-nolan' regardless of what's
 * passed here). */
async function writeField(
	sectionId: number,
	componentTipo: string,
	value: string | number,
	userId: number,
): Promise<void> {
	await saveComponentData({
		componentTipo,
		sectionTipo: NUMISDATA_OBJECT_TIPO,
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

	const { bytes, contentType } = await downloadImageBytes(sourceUrl);
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
		   AND string->'${AUCTION_NUMBER_TITLE_TIPO}'->0->>'value' = $3
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
): Promise<{ sectionId: number; created: boolean }> {
	const found = await findExistingAuction(auctionHouse, auctionNumber);
	if (found !== null) return { sectionId: found, created: false };

	const sectionId = await createSectionRecord(AUCTION_SECTION_TIPO, context.userId);
	await writeField(sectionId, AUCTION_COMPANY_TIPO, auctionHouse, context.userId);
	await writeField(sectionId, AUCTION_NUMBER_TITLE_TIPO, auctionNumber, context.userId);
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
): Promise<ResolvedAuction> {
	const key = `${auctionHouse} ${auctionNumber}`;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;
	const resolved = await findOrCreateAuction(context, auctionHouse, auctionNumber);
	cache.set(key, resolved);
	return resolved;
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
 * TODAY every lot in a batch carries the SAME auctionHouse/auctionNumber
 * (jesusvico has no cross-auction listing) — but this reads them per-call
 * rather than assuming a batch-wide constant, so a future source whose lots
 * each name their own real auction (via ExtractedLot.category, per the
 * README) only needs its per-lot house/number threaded in here, not a
 * different resolution strategy.
 */
async function commitOneLot(
	context: ToolActionContext,
	lot: Record<string, unknown>,
	auctionHouse: string,
	auctionNumber: string,
	auctionCache: Map<string, ResolvedAuction>,
): Promise<CommitOneLotResult> {
	const l = lot;
	const sectionId = await createSectionRecord(NUMISDATA_OBJECT_TIPO, context.userId);

	const fieldsWritten: string[] = [];
	const weight = parseLeadingNumber(l.weight);
	if (weight !== null) {
		await writeField(sectionId, WEIGHT_TIPO, weight, context.userId);
		fieldsWritten.push(WEIGHT_TIPO);
	}
	const diameter = parseLeadingNumber(l.diameter);
	if (diameter !== null) {
		await writeField(sectionId, DIAMETER_TIPO, diameter, context.userId);
		fieldsWritten.push(DIAMETER_TIPO);
	}
	if (typeof l.lotNumber === 'string' && l.lotNumber.trim() !== '') {
		await writeField(sectionId, INVENTORY_NUMBER_TIPO, l.lotNumber, context.userId);
		fieldsWritten.push(INVENTORY_NUMBER_TIPO);
	}
	if (typeof l.datePeriod === 'string' && l.datePeriod.trim() !== '') {
		await writeField(sectionId, DATE_TEXT_TIPO, l.datePeriod, context.userId);
		fieldsWritten.push(DATE_TEXT_TIPO);
	}
	const description = typeof l.description === 'string' ? l.description : null;
	const { obverse: obverseDesign, reverse: reverseDesign } = splitJesusvicoDesign(description);
	if (obverseDesign !== null) {
		await writeField(sectionId, OBVERSE_DESIGN_TIPO, obverseDesign, context.userId);
		fieldsWritten.push(OBVERSE_DESIGN_TIPO);
	}
	if (reverseDesign !== null) {
		await writeField(sectionId, REVERSE_DESIGN_TIPO, reverseDesign, context.userId);
		fieldsWritten.push(REVERSE_DESIGN_TIPO);
	}
	if (
		obverseDesign === null &&
		reverseDesign === null &&
		description !== null &&
		description.trim() !== ''
	) {
		await writeField(sectionId, PUBLIC_REMARK_TIPO, description, context.userId);
		fieldsWritten.push(PUBLIC_REMARK_TIPO);
	}

	let auctionSectionId: number | null = null;
	let auctionCreated: boolean | null = null;
	let auctionError: string | null = null;
	if (auctionHouse !== '' && auctionNumber !== '') {
		try {
			const resolved = await resolveAuctionCached(
				context,
				auctionCache,
				auctionHouse,
				auctionNumber,
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
 * TODAY every lot shares the same batch-level `auction` option (jesusvico
 * has no cross-auction listing), so in practice this still resolves exactly
 * one Auction per batch — the cache just makes that the OUTCOME of the
 * per-lot logic instead of an assumption baked into the caller.
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
	const auctionNumber = typeof a?.auctionNumber === 'string' ? a.auctionNumber.trim() : '';

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
			await commitOneLot(context, l, auctionHouse, auctionNumber, auctionCache),
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
