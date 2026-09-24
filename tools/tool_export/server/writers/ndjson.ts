/**
 * NDJSON — the lossless download: the spool itself, every protocol line
 * (meta, col, row, end) byte-for-byte as the job wrote it, i.e. byte-identical
 * to what get_export_grid streams for the same export. Streamed, bounded
 * memory; refuses before 'end' (a partial protocol stream is not a file).
 *
 * The build door does NOT normally run this copy: buildArtifactFile hard-links
 * the ended grid into place (ArtifactStore.linkSpoolAsFile — no second copy on
 * disk or against the quota). This writer is the fallback where the
 * filesystem cannot hard-link, and the byte-identity reference the gates
 * compare the link against.
 */

import type { ExportWriter } from './types.ts';
import { throwIfCancelled } from './types.ts';

/** Lines between two cancellation checks. */
const CHECK_EVERY = 256;

const ROW_PREFIX = '{"t":"row"';

export const ndjsonWriter: ExportWriter = async ({ spool }, sink, signal) => {
	await spool.requireEnd();
	throwIfCancelled(signal);
	let rows = 0;
	let count = 0;
	for await (const line of spool.rawLines({ signal })) {
		if (++count % CHECK_EVERY === 0) throwIfCancelled(signal);
		// the writer serializes {t:…} first (JSON.stringify key order), so this is exact
		if (line.startsWith(ROW_PREFIX)) rows++;
		await sink.write(`${line}\n`);
	}
	throwIfCancelled(signal);
	return { bytes: sink.bytes, rows };
};
