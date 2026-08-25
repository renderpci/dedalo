/**
 * crop_50 — split a white-background coin photo into obverse/reverse (PHP
 * tool_import_files crop_50, the numisdata script). Detects exactly two
 * coin-sized foreground blobs via ImageMagick connected-components, crops
 * each, pads the shorter to the taller's height with white, and stages both
 * as new files in the SAME staging directory as the source.
 *
 * PATH MIRRORS THE PHP LAYOUT ON PURPOSE: PHP's `file_processor` loaded this
 * script from `dirname(__FILE__) . $file_processor_obj->script_file`, where
 * `script_file` was `/script_files/numisdata/crop_50.php` — a path relative
 * to the tool's own directory. This file sits at the exact same
 * `script_files/<tld>/<function_name>.ts` position under
 * `tools/tool_import_files/`, just one level deeper than that (`server/` is
 * NOT renameable — `src/core/tools/loader.ts` hardcodes `server/index.ts` as
 * the tool-discovery entry point for every tool in this codebase, so it has
 * to stay the outer directory).
 *
 * THIS FUNCTION CREATES NO RECORDS. It only produces files and reports them
 * via `outputs` (`FileProcessorOutput[]`, see `import_files_match.ts`) — the
 * `import_files` per-file loop (`../../index.ts`, `importIntoPortal`) adds
 * each output as a child through its OWN portal on the CALLING record — no
 * new top-level record. That mirrors the PHP original's actual behaviour
 * exactly (`component_portal->add_new_element` using the caller's own
 * `section_id` for each `custom_arguments` destination, PHP :139-148) while
 * keeping the portal/record-creation machinery in ONE place (`../../index.ts`)
 * instead of duplicated here.
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
 *    (`coin_split.ts assertPlausibleCoinPair`) — a single coin accidentally
 *    split into two blobs (a hole, a crack, a glare spot) no longer silently
 *    produces two garbage crops; it is refused with a diagnostic instead.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildBilevelMask,
	cropAndPadImage,
	runConnectedComponents,
} from '../../../../../src/core/media/engine/imagemagick.ts';
import { sanitizeSegment, stagingDir } from '../../../../../src/core/media/ingest/add_file.ts';
import { assertPlausibleCoinPair, parseConnectedComponentsReport } from '../../../../../src/core/media/coin_split.ts';
import type { FileProcessor, FileProcessorOutput } from '../../../../../src/core/tools/import_files_match.ts';

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
	return Object.values(args).filter((value): value is string => typeof value === 'string' && value !== '');
}

export const cropCoinPair: FileProcessor = async (input) => {
	const sourcePath = typeof input.file_path === 'string' ? input.file_path : '';
	const fileName = typeof input.file_name === 'string' ? input.file_name : '';
	const userId = Number(input.user_id);
	const keyDir = typeof input.key_dir === 'string' ? input.key_dir : '';
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
	const dot = fileName.lastIndexOf('.');
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : 'png';
	// The mask/output filenames are SERVER-GENERATED from a sanitized stem, never
	// the raw client name — sanitizeSegment below is the actual gate; this is just
	// keeping the temp mask readable in a listing.
	const safeStem = stem.replace(/[^A-Za-z0-9_-]/g, '_') || 'crop';

	const maskPath = join(dir, sanitizeSegment(`${safeStem}_mask_${Date.now()}.png`));
	try {
		await buildBilevelMask(sourcePath, maskPath);
		let report: string;
		try {
			report = await runConnectedComponents(maskPath, DEFAULT_AREA_THRESHOLD);
		} finally {
			rmSync(maskPath, { force: true });
		}

		const regions = parseConnectedComponentsReport(report, DEFAULT_MIN_DIMENSION);
		const [left, right] = assertPlausibleCoinPair(regions, DEFAULT_MIN_SIMILARITY);
		const maxHeight = Math.max(left.height, right.height);

		const outputs: FileProcessorOutput[] = [];
		for (const [index, region] of [left, right].entries()) {
			const tmpName = sanitizeSegment(`${safeStem}_crop-${index}.${extension}`);
			const outPath = join(dir, tmpName);
			// Pad only vertically (own width kept, height brought up to the taller
			// region's) — matches the PHP recipe (:101-115) exactly.
			await cropAndPadImage(sourcePath, outPath, region, region.width, maxHeight);
			outputs.push({
				tmpName,
				fileName: `${stem}_crop-${index}.${extension}`,
				// left (index 0) -> destinations[0] (Obverse), right (index 1) -> destinations[1]
				// (Reverse) — same order `assertPlausibleCoinPair` already returns them in.
				portalComponentTipo: destinations[index],
			});
		}

		return { ok: true, message: `Split '${fileName}' into ${outputs.length} faces`, outputs };
	} catch (error) {
		rmSync(maskPath, { force: true });
		return { ok: false, message: (error as Error).message };
	}
};
