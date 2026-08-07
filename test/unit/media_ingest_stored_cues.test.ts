/**
 * THE isOriginal / isMaster SPLIT, gated on its CONSEQUENCE (2026-08-07).
 *
 * `processUploadedFile` asks two different questions about the target tier:
 *
 *  - `isMaster` — do the derived tiers get re-encoded from this file? Any master
 *    does that, the archival original AND the retouched one.
 *  - `isOriginal` — does this upload replace the ARCHIVAL tier's stored cue? Only
 *    the original does. A retouch must keep the record's stored
 *    `external_source` / `original_normalized_name` / `modified_normalized_name`,
 *    because those describe files the retouch did not replace.
 *
 * Collapsing them back into one boolean (`const isOriginal = isMaster`) is the
 * regression this file exists for, and it is INVISIBLE to a scan of a scratch
 * media tree: the stored cues only matter when the component actually stores
 * some. So the stored-item read is mocked and the effect is asserted on the
 * returned files_info — an external-source component that a retouch upload would
 * otherwise stop reporting as external.
 *
 * OWN FILE ON PURPOSE: `mock.module` leaks across files in this suite (see
 * media_master_qualities_config.test.ts for the same reason), and this one
 * replaces a module the whole media subsystem imports.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { stagingDir } from '../../src/core/media/ingest/add_file.ts';
import { processUploadedFile } from '../../src/core/media/ingest/process_uploaded_file.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';
import * as REAL_TOOL_SUPPORT from '../../src/core/media/tool_support.ts';

const ROOT = `${tmpdir()}/dedalo_ingest_cues_${process.pid}`;
const image = mediaTypeOf('component_image')!;
const HAVE_MAGICK = existsSync(resolveMagick());
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };
const MODIFIED = config.media.imageQualityRetouched;
const USER_ID = 7;
const KEY_DIR = 'kdcues';

/** What the record is pretending to store for every identity in this file. */
const STORED_ITEM = {
	external_source: 'https://example.invalid/an-external-master.jpg',
	original_normalized_name: 'rsc29_rsc170_1.tif',
};

let sectionId = 0;
function nextIdentity(): MediaIdentity {
	sectionId += 1;
	return { componentTipo: 'rsc29', sectionTipo: 'rsc170', sectionId, lang: null };
}

async function stage(tmpName: string): Promise<void> {
	const absolute = `${stagingDir(USER_ID, KEY_DIR, ROOT)}/${tmpName}`;
	mkdirSync(absolute.slice(0, absolute.lastIndexOf('/')), { recursive: true });
	const result = await runBinary([resolveMagick(), '-size', '60x40', 'xc:blue', absolute], {
		nice: false,
	});
	if (result.exitCode !== 0) throw new Error(result.stderr);
}

beforeAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
	mkdirSync(ROOT, { recursive: true });
	// The record stores cues. Only the branch under test decides whether the
	// ingest reads them back.
	mock.module('../../src/core/media/tool_support.ts', () => ({
		...REAL_TOOL_SUPPORT,
		readStoredMediaItems: async () => [STORED_ITEM],
	}));
});
afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
	mock.module('../../src/core/media/tool_support.ts', () => REAL_TOOL_SUPPORT);
});

describe.if(HAVE_MAGICK)('a RETOUCH upload keeps the stored cues', () => {
	test('the external_source the record stores still reaches the scan', async () => {
		const identity = nextIdentity();
		await stage('cue_retouch.tif');

		const result = await processUploadedFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER_ID,
			keyDir: KEY_DIR,
			tmpName: 'cue_retouch.tif',
			extension: 'tif',
			quality: MODIFIED,
		});

		// scanFilesInfo short-circuits every entry to `external` when the context
		// carries an external_source — so this is the stored cue, observed. Under
		// `isOriginal = isMaster` the retouch takes the original's branch, the cues
		// are read as `undefined`, and nothing here is external.
		expect(result.filesInfo.length).toBeGreaterThan(0);
		expect(result.filesInfo.every((info) => info.external === true)).toBe(true);
	});

	test('an ORIGINAL upload REPLACES them — the cue is this upload, not the old one', async () => {
		const identity = nextIdentity();
		await stage('cue_original.tif');

		const result = await processUploadedFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER_ID,
			keyDir: KEY_DIR,
			tmpName: 'cue_original.tif',
			extension: 'tif',
		});

		// The archival tier's own cue is what was just stored, and the stale
		// external_source must NOT come back and mask the file on disk.
		expect(result.filesInfo.some((info) => info.external === true)).toBe(false);
		expect(
			result.filesInfo.some(
				(info) => info.quality === image.originalQuality && info.file_exist === true,
			),
		).toBe(true);
	});
});
