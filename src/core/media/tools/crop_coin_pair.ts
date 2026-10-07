/**
 * cropCoinPair — split a white-background coin photo into obverse/reverse (PHP
 * tool_import_files crop_50, the numisdata script). Detects exactly two
 * coin-sized foreground blobs via ImageMagick connected-components, crops
 * each, pads the shorter to the taller's height with white, and stages both
 * as new files in the SAME staging directory as the source.
 *
 * SHARED LOGIC LIVES HERE, not under either tool's own directory (review item
 * G, PR #114): tool_import_files registers it as a named FileProcessor
 * ('crop_50', SEC-053 allowlist), and tool_numisdata_acquisition calls it
 * directly as a plain function for its own per-lot image split. Neither tool
 * owns it, so a tool reaching into the OTHER tool's `server/` internals (the
 * previous location, tools/tool_import_files/server/script_files/numisdata/
 * crop_50.ts) was the wrong shape - this is `src/`, like every other
 * cross-tool media primitive it already depends on (imagemagick.ts,
 * region_split.ts).
 *
 * THIS FUNCTION CREATES NO RECORDS. It only produces files and reports them
 * via `outputs` (`FileProcessorOutput[]`, see `import_files_match.ts`) -
 * tool_import_files' own `import_files` per-file loop (`importIntoPortal`)
 * adds each output as a child through its OWN portal on the CALLING record -
 * no new top-level record. That mirrors the PHP original's actual behaviour
 * exactly (`component_portal->add_new_element` using the caller's own
 * `section_id` for each `custom_arguments` destination, PHP :139-148) while
 * keeping the portal/record-creation machinery in ONE place
 * (tool_import_files/server/index.ts) instead of duplicated here.
 *
 * DESTINATION MAPPING — `custom_arguments`, read from the ontology exactly
 * like PHP did: `tool_config.file_processor` (`file_processor_properties` on
 * the wire, PHP's own naming) is an array of processor descriptors; this
 * function's own entry (`function_name === 'crop_50'`) carries
 * `custom_arguments`, an object whose VALUES are portal component tipos in
 * left-to-right order (production numisdata4: `{"destination_1":
 * "numisdata164" /* Obverse *\/, "destination_2": "numisdata165" /* Reverse *\/}`).
 * Object key order is insertion order for string keys in both PHP arrays and
 * JS objects, so `Object.values(...)` reproduces PHP's `foreach` order.
 *
 * Strengthened vs the PHP original (agreed before porting):
 *  - every ImageMagick call is exit-code checked end to end (PHP's
 *    shell_exec/exec ignored failures entirely — a broken pipeline there
 *    cascaded into a silent "0 regions found" with no diagnostic);
 *  - an AREA-SIMILARITY floor between the two regions
 *    (`region_split.ts assertPlausibleObjectPair`) — a single coin accidentally
 *    split into two blobs (a hole, a crack, a glare spot) no longer silently
 *    produces two garbage crops; it is refused with a diagnostic instead.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FileProcessor, FileProcessorOutput } from '../../tools/import_files_match.ts';
import { tempSibling } from '../atomic.ts';
import {
	buildBilevelMask,
	cropAndPadImage,
	runConnectedComponents,
} from '../engine/imagemagick.ts';
import { sanitizeSegment, stagingDir } from '../ingest/add_file.ts';
import {
	assertPlausibleObjectPair,
	parseConnectedComponentsReport,
	type Region,
} from '../region_split.ts';

/** ImageMagick connected-components noise floor (pixels) — same default the PHP original used. */
const DEFAULT_AREA_THRESHOLD = 30000;
/** Reject a detected blob narrower/shorter than this on either axis. */
const DEFAULT_MIN_DIMENSION = 50;
/** Minimum smaller-area/larger-area ratio to accept two regions as one coin's two faces (NEW). */
const DEFAULT_MIN_SIMILARITY = 0.4;

/** One `tool_config.file_processor[]` descriptor, as the ontology stores it (PHP shape, unchanged). */
interface FileProcessorDescriptor {
	function_name?: string;
	custom_arguments?: Record<string, string>;
}

/**
 * Find this function's own `custom_arguments` in the processor-properties
 * array and return its declared portal tipos in order. Fails closed (empty
 * array, never a guess) when the descriptor is missing, malformed, or does
 * not carry exactly the two destinations a coin split needs.
 */
export function destinationPortalTipos(rawProperties: unknown): string[] {
	if (!Array.isArray(rawProperties)) return [];
	const mine = (rawProperties as FileProcessorDescriptor[]).find(
		(entry) => entry?.function_name === 'crop_50',
	);
	const args = mine?.custom_arguments;
	if (args === undefined || args === null || typeof args !== 'object') return [];
	return Object.values(args).filter(
		(value): value is string => typeof value === 'string' && value !== '',
	);
}

/** Server-side names derived from the client's file name (never the raw name on disk). */
interface CropNames {
	/** The client name minus its extension — used only for the display names. */
	stem: string;
	/** Lower-cased extension, `png` when the name has none. */
	extension: string;
	/** `stem` reduced to `[A-Za-z0-9_-]` — the base of every on-disk name. */
	safeStem: string;
}

/** A validated crop request: everything `cropCoinPair` needs past its input checks. */
interface CropRequest {
	sourcePath: string;
	fileName: string;
	/** Staging directory of the source; the mask and both crops are written here. */
	dir: string;
	/** The two destination portal tipos, Obverse first. */
	destinations: string[];
	names: CropNames;
}

type ParsedCropRequest = { ok: true; request: CropRequest } | { ok: false; message: string };

/** A string input field, or '' for anything else (missing, wrong type). */
function stringField(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function deriveCropNames(fileName: string): CropNames {
	const dot = fileName.lastIndexOf('.');
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : 'png';
	// The mask/output filenames are SERVER-GENERATED from a sanitized stem, never
	// the raw client name — sanitizeSegment at each use is the actual gate; this
	// is just keeping the staged files readable in a listing.
	const safeStem = stem.replace(/[^A-Za-z0-9_-]/g, '_') || 'crop';
	return { stem, extension, safeStem };
}

/**
 * Validate the processor input: the four required fields, then exactly the two
 * destination portal tipos a coin split needs. Fails with the operator-facing
 * message; never guesses a destination.
 */
function parseCropRequest(input: Record<string, unknown>): ParsedCropRequest {
	const sourcePath = stringField(input.file_path);
	const fileName = stringField(input.file_name);
	const userId = Number(input.user_id);
	const keyDir = stringField(input.key_dir);
	if (sourcePath === '' || fileName === '' || !Number.isInteger(userId) || keyDir === '') {
		return { ok: false, message: 'crop_50: missing file_path/file_name/user_id/key_dir' };
	}

	const destinations = destinationPortalTipos(input.file_processor_properties);
	if (destinations.length !== 2) {
		return {
			ok: false,
			message:
				`crop_50: expected exactly 2 destination portal tipos in this button's ` +
				`custom_arguments (Obverse + Reverse), found ${destinations.length}. ` +
				'Check tool_config.file_processor on the ontology node that offers this processor.',
		};
	}

	const dir = stagingDir(userId, keyDir);
	return {
		ok: true,
		request: { sourcePath, fileName, dir, destinations, names: deriveCropNames(fileName) },
	};
}

/**
 * Detect the two coin faces: bilevel mask -> connected components -> the
 * plausible left/right pair. The mask is scratch and is removed whatever the
 * connected-components step does.
 */
async function detectFacePair(sourcePath: string, maskPath: string): Promise<[Region, Region]> {
	await buildBilevelMask(sourcePath, maskPath);
	let report: string;
	try {
		report = await runConnectedComponents(maskPath, DEFAULT_AREA_THRESHOLD);
	} finally {
		rmSync(maskPath, { force: true });
	}
	const regions = parseConnectedComponentsReport(report, DEFAULT_MIN_DIMENSION);
	return assertPlausibleObjectPair(regions, DEFAULT_MIN_SIMILARITY);
}

/** Crop each face into the staging dir and report it against its destination portal. */
async function cropFaces(
	request: CropRequest,
	faces: [Region, Region],
): Promise<FileProcessorOutput[]> {
	const { sourcePath, dir, destinations, names } = request;
	const maxHeight = Math.max(faces[0].height, faces[1].height);
	const outputs: FileProcessorOutput[] = [];
	for (const [index, region] of faces.entries()) {
		// The STAGED name is unique per call (tempSibling: pid + uuid, extension kept
		// last for magick): every lot of an acquisition batch stages under ONE
		// key_dir, so two faces of two lots whose images share a file name would
		// otherwise overwrite each other. The PHP-parity name is `fileName` below.
		const stagedPath = tempSibling(join(dir, `${names.safeStem}_face${index}.${names.extension}`));
		const tmpName = sanitizeSegment(stagedPath.slice(stagedPath.lastIndexOf('/') + 1));
		const outPath = join(dir, tmpName);
		// Pad only vertically (own width kept, height brought up to the taller
		// region's) — matches the PHP recipe (:101-115) exactly.
		await cropAndPadImage(sourcePath, outPath, region, region.width, maxHeight);
		outputs.push({
			tmpName,
			fileName: `${names.stem}_crop-${index}.${names.extension}`,
			// left (index 0) -> destinations[0] (Obverse), right (index 1) -> destinations[1]
			// (Reverse) — same order `assertPlausibleObjectPair` already returns them in.
			portalComponentTipo: destinations[index],
		});
	}
	return outputs;
}

export const cropCoinPair: FileProcessor = async (input) => {
	const parsed = parseCropRequest(input);
	if (!parsed.ok) return { ok: false, message: parsed.message };
	const { request } = parsed;
	const { fileName } = request;

	// The scratch mask's unique token (pid + uuid) comes from tempSibling, BEFORE
	// the `.png` that tells ImageMagick the output format.
	const maskPath = tempSibling(
		join(request.dir, sanitizeSegment(`${request.names.safeStem}_mask.png`)),
	);
	try {
		const outputs = await cropFaces(request, await detectFacePair(request.sourcePath, maskPath));
		return { ok: true, message: `Split '${fileName}' into ${outputs.length} faces`, outputs };
	} catch (error) {
		rmSync(maskPath, { force: true });
		// SEC-18: nothing filters an ok:false `message` on its way to the browser,
		// so the EXCEPTION's own text never rides the wire — an ImageMagick
		// failure or an fs error carries staging paths and argv in it. The reason
		// goes to the log (with the file it was working on); the operator gets a
		// deliberate sentence that names the two things they can actually act on.
		console.error(`[crop_coin_pair] '${fileName}' failed:`, (error as Error).message ?? error);
		return {
			ok: false,
			message:
				`crop_50: could not split '${fileName}' into two faces. Either the photo ` +
				'does not show exactly two coin-sized objects on a white background, or ' +
				'an ImageMagick step failed — the server log has the reason.',
		};
	}
};
