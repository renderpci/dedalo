/**
 * THE MEASURED PROCESS of tool_export_delimited_html_writers_native leg E
 * (bounded memory of the csv / tsv / html download writers).
 *
 * A live-heap peak can only be read honestly in a process that does ONE thing:
 * measured in the gate's own process (2026-10, GATE-1 run 3, unloaded) the
 * forced-GC `heapUsed` delta drifted past half the file for a writer that holds
 * one 64 Ki-char buffer — whatever else that process had allocated (earlier
 * legs, the 60 000-row spool build, the bun:test runtime) moved the number, not
 * the writer. So the gate spawns this file once per (format, spool size) and
 * reads the JSON it prints as the last stdout line.
 *
 * WHAT IS SAMPLED. The spool's `rows()` is wrapped: every `sampleEvery` rows
 * the writer pulls, a full GC runs and the LIVE heap (`heapUsed`) above the
 * post-GC baseline is sampled. The probe sits on the INPUT side, so it sees
 * whatever the writer retains while it walks the grid — a growing string
 * buffer, an array of every line, every chunk it already handed the sink —
 * however (and whether) the writer then chunks its sink writes. The sink
 * counts bytes and drops each chunk (nothing here keeps the file).
 *
 * WRITES NOTHING: the spool is the PARENT gate's (a marked export-artifacts
 * scratch root it builds and sweeps); this process only reads it.
 *
 *   bun run export_writer_heap_child.ts <csv|tsv|html> <jobDir> <sampleEvery>
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExportManifest } from '../../tools/tool_export/server/artifact_store.ts';
import { openSpoolReader } from '../../tools/tool_export/server/spool_reader.ts';
import { csvWriter, tsvWriter } from '../../tools/tool_export/server/writers/delimited.ts';
import { htmlWriter } from '../../tools/tool_export/server/writers/html.ts';
import type { ExportWriter, FileSink } from '../../tools/tool_export/server/writers/types.ts';

/** What the parent parses (the last stdout line). */
export interface ExportWriterHeapReport {
	format: string;
	rows: number;
	bytes: number;
	writes: number;
	largestChunk: number;
	samples: number;
	/** Largest live-heap growth (bytes) over the post-GC baseline at any sample. */
	peakGrowth: number;
}

const WRITERS: Record<string, ExportWriter> = { csv: csvWriter, tsv: tsvWriter, html: htmlWriter };

const [format = '', jobDir = '', sampleArg = ''] = process.argv.slice(2);
const write = WRITERS[format];
const sampleEvery = Number(sampleArg);
if (write === undefined || jobDir === '' || !(sampleEvery > 0)) {
	console.error(`export_writer_heap_child: bad arguments ${JSON.stringify(process.argv.slice(2))}`);
	process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(jobDir, 'manifest.json'), 'utf8')) as ExportManifest;
const real = openSpoolReader(jobDir, { indexEvery: manifest.index_every });

let baseline = 0;
let peakGrowth = 0;
let samples = 0;
function sample(): void {
	Bun.gc(true);
	peakGrowth = Math.max(peakGrowth, process.memoryUsage().heapUsed - baseline);
	samples++;
}

let pulled = 0;
const spool = {
	...real,
	async *rows(options?: { signal?: AbortSignal }) {
		for await (const row of real.rows(options)) {
			if (++pulled % sampleEvery === 0) sample();
			yield row;
		}
	},
};

let bytes = 0;
let writes = 0;
let largestChunk = 0;
const sink: FileSink = {
	// a text writer never logs scratch bytes; nothing to meter
	async admitScratch() {},
	async write(chunk) {
		const size = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
		largestChunk = Math.max(largestChunk, size);
		bytes += size;
		writes++;
	},
	get bytes() {
		return bytes;
	},
};

Bun.gc(true);
baseline = process.memoryUsage().heapUsed;
const result = await write(
	{
		spool,
		manifest,
		options: { origin: 'https://dedalo.writers.example.test', showTipoInLabel: false },
	},
	sink,
	new AbortController().signal,
);
if (result.bytes !== bytes) {
	console.error(
		`export_writer_heap_child: writer reported ${result.bytes} bytes, sink saw ${bytes}`,
	);
	process.exit(3);
}
const report: ExportWriterHeapReport = {
	format,
	rows: result.rows,
	bytes,
	writes,
	largestChunk,
	samples,
	peakGrowth,
};
console.log(JSON.stringify(report));
process.exit(0);
