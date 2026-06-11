// Micro-benchmark: in-place parseJsonStrings vs the previous rebuild approach.
// Not part of the test suite (timing is environment-dependent).
// Run: bun run scripts/bench-parse-json.ts
import { parseJsonStrings } from '../src/utils/parse-json';

// Previous implementation, kept here only for comparison.
function parseJsonStringsRebuild<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map(item => parseJsonStringsRebuild(item)) as T;
  }
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in data) {
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === 'string' && isJsonLike(value)) {
        try { result[key] = JSON.parse(value); } catch { result[key] = value; }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = parseJsonStringsRebuild(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }
  return data;
}
function isJsonLike(value: string): boolean {
  if (value.length < 2) return false;
  const first = value[0];
  return first === '[' || first === '{';
}

// Representative page: mostly plain columns, a couple of JSON-string columns.
function makeRows(n: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      section_id: i,
      lang: 'lg-eng',
      code: `OH-${i}`,
      title: `Record number ${i}`,
      mint: 'Barcino',
      year: 1936 + (i % 4),
      weight: null,
      type_data: '["3390","6584","18080","18325"]',
      dd_relations: '[{"section_tipo":"rsc170","section_id":' + i + '},{"section_tipo":"rsc36","section_id":' + (i + 1) + '}]',
    });
  }
  return rows;
}

const ROWS = 1000;
const ITERS = 2000;

function bench(label: string, fn: (rows: Record<string, unknown>[]) => unknown): number {
  // warmup
  for (let i = 0; i < 50; i++) fn(makeRows(ROWS));
  const start = performance.now();
  for (let i = 0; i < ITERS; i++) {
    fn(makeRows(ROWS)); // fresh rows each iter — both approaches get unparsed input
  }
  const ms = performance.now() - start;
  const opsPerSec = (ITERS * ROWS) / (ms / 1000);
  console.log(
    `${label.padEnd(18)} ${ms.toFixed(1).padStart(8)} ms  ` +
    `${(ms / ITERS).toFixed(3).padStart(7)} ms/page  ` +
    `${Math.round(opsPerSec).toLocaleString().padStart(12)} rows/s`,
  );
  return ms;
}

console.log(`parseJsonStrings benchmark — ${ROWS} rows x ${ITERS} iterations\n`);
// makeRows() allocation is included in both timings equally, so the delta
// reflects the parser, not the fixture.
const rebuild = bench('rebuild (old)', parseJsonStringsRebuild);
const inPlace = bench('in-place (new)', parseJsonStrings);

const delta = ((rebuild - inPlace) / rebuild) * 100;
console.log(`\nin-place is ${delta >= 0 ? delta.toFixed(1) + '% faster' : Math.abs(delta).toFixed(1) + '% slower'} than rebuild`);
