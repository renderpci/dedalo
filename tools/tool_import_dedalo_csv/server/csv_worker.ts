/**
 * CSV parse worker (audit S3-42): parseCsv/analyzeCsv are CPU-bound and were
 * running ON the serving event loop — opening the import tool re-parsed AND
 * re-scanned EVERY csv synchronously, stalling all users' requests/SSE for
 * seconds on large files. This worker runs the identical pure code off-loop.
 *
 * Two modes:
 *  - analyze: return only the get_csv_files summary (header + counts + bounded
 *    preview + malformed-JSON rows). The full row set never crosses the thread
 *    boundary, so the structured clone stays tiny even for a 200MB file.
 *  - default (parse): return the full parsed rows — import_files needs them.
 */

import { analyzeCsv, parseCsv } from '../../../src/core/tools/import_csv.ts';

declare let self: Worker;

self.onmessage = (event: MessageEvent) => {
	const { text, delimiter, analyze } = event.data as {
		text: string;
		delimiter?: string;
		analyze?: boolean;
	};
	try {
		if (analyze === true) {
			postMessage({ analysis: analyzeCsv(text, delimiter) });
		} else {
			postMessage({ rows: parseCsv(text, delimiter) });
		}
	} catch (error) {
		postMessage({ error: error instanceof Error ? error.message : String(error) });
	}
};
