/**
 * Read-path benchmark: TS pipeline vs live PHP API for the SAME RQO
 * (plan A6 "perf benchmarks vs PHP recorded per phase"; spec §10 success
 * metric: measurably lower API latency).
 *
 * Method: N warm iterations of the same section list read (10 records ×3
 * string components). TS side calls readSection in-process (the reverse-proxy
 * hop is equal for both stacks and excluded); PHP side goes over HTTP to the
 * local server (its native deployment shape). Reports p50/p95/mean.
 *
 * Usage: bun run scripts/benchmark_read.ts [iterations=30]
 */

import { config } from '../src/config/config.ts';
import type { Rqo } from '../src/core/concepts/rqo.ts';
import { readSection } from '../src/core/section/read.ts';
import { PhpApiClient } from '../test/parity/php_client.ts';

const ITERATIONS = Number(Bun.argv[2] ?? 30);

const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: ['numisdata6'], limit: 10, offset: 0 },
	show: {
		ddo_map: [
			{ tipo: 'numisdata16', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
			{ tipo: 'numisdata17', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
			{ tipo: 'numisdata18', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
		],
	},
};

function stats(samples: number[]): { p50: number; p95: number; mean: number } {
	const sorted = [...samples].sort((a, b) => a - b);
	const at = (q: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
	return {
		p50: at(0.5),
		p95: at(0.95),
		mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
	};
}

// --- PHP side ---------------------------------------------------------------
const client = new PhpApiClient();
await client.login(config.phpReference.username as string, config.phpReference.password as string);
await client.call(structuredClone(READ_RQO)); // warmup
const phpSamples: number[] = [];
for (let i = 0; i < ITERATIONS; i++) {
	const start = performance.now();
	await client.call(structuredClone(READ_RQO));
	phpSamples.push(performance.now() - start);
}

// --- TS side ----------------------------------------------------------------
await readSection(READ_RQO as unknown as Rqo); // warmup
const tsSamples: number[] = [];
for (let i = 0; i < ITERATIONS; i++) {
	const start = performance.now();
	await readSection(READ_RQO as unknown as Rqo);
	tsSamples.push(performance.now() - start);
}

const php = stats(phpSamples);
const ts = stats(tsSamples);
const format = (s: { p50: number; p95: number; mean: number }) =>
	`p50 ${s.p50.toFixed(1)}ms  p95 ${s.p95.toFixed(1)}ms  mean ${s.mean.toFixed(1)}ms`;

console.log(`read benchmark (${ITERATIONS} iterations, 10 records × 3 components)`);
console.log(`PHP (HTTP, local): ${format(php)}`);
console.log(`TS  (in-process) : ${format(ts)}`);
console.log(
	`speedup (p50): ${(php.p50 / ts.p50).toFixed(1)}x   (mean): ${(php.mean / ts.mean).toFixed(1)}x`,
);
