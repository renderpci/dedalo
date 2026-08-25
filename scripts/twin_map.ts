/**
 * Generator / checker for `engineering/twin_map.json` — the DEC-14b twin map,
 * made machine-readable.
 *
 *   bun run scripts/twin_map.ts --report   # human summary, writes nothing
 *   bun run scripts/twin_map.ts --check    # print drift, exit 1 if any
 *   bun run scripts/twin_map.ts            # regenerate (refuses growth)
 *
 * THE RATCHET is `unmapped_reds`: parity files that still carry frozen reds and
 * have no twin. It is SHRINK-ONLY. Growth needs --allow-regression and a reason
 * in the commit message, because the only honest ways for it to grow are a new
 * corpus-bound gate (which needs justifying) or a twin being deleted.
 *
 * HERMETIC: reads tracked source + engineering/parity_baseline.json.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	derivedStatus,
	filesNamingAParityGate,
	parseBackLinks,
	parseTwins,
	REPO_ROOT,
	redFilesFromBaseline,
} from './lib/twin_census.ts';

const ARTIFACT = join(REPO_ROOT, 'engineering/twin_map.json');

/**
 * Files whose header names a parity path that is NOT a twin claim. Set-equality
 * is asserted, so a stale entry is red.
 */
const NOT_A_TWIN: ReadonlyMap<string, string> = new Map([
	[
		'test/unit/parity_baseline_tripwire.test.ts',
		'names the SYNTHETIC path test/parity/x.test.ts inside planted JUnit XML and in-memory drift fixtures — it is the parity ratchet, not a twin of any gate',
	],
]);

export type TwinMap = {
	generated_by: string;
	rule: string;
	measured: {
		twins: number;
		retired: number;
		frozen_record: number;
		supplement: number;
		back_links: number;
		unmapped_red_files: number;
		unmapped_red_tests: number;
	};
	twins: { file: string; target: string; status: string }[];
	not_a_twin: Record<string, string>;
	unmapped_reds: Record<string, number>;
};

export function buildMap(): TwinMap {
	const red = redFilesFromBaseline();
	const twins = parseTwins();
	const mappedTargets = new Set(twins.map((t) => t.target));

	const unmapped: Record<string, number> = {};
	for (const [file, count] of [...red.entries()].sort()) {
		if (!mappedTargets.has(file)) unmapped[file] = count;
	}
	const byStatus = (s: string) => twins.filter((t) => t.status === s).length;

	return {
		generated_by: 'bun run scripts/twin_map.ts',
		rule: "The DEC-14b twin map, read from @twin-of/@twin-status directives in each twin's own header (engineering/ORACLE_HARVEST.md keeps the prose; this file is the enforcement). unmapped_reds is SHRINK-ONLY: a parity file with frozen reds and no twin. Status is DERIVED from the tree — retired (the gate is gone), frozen-record (the gate survives WITH frozen reds; this is the portable half), supplement (the gate survives GREEN; the twin adds coverage). A header claim that disagrees with the tree is a gate failure.",
		measured: {
			twins: twins.length,
			retired: byStatus('retired'),
			frozen_record: byStatus('frozen-record'),
			supplement: byStatus('supplement'),
			back_links: parseBackLinks().size,
			unmapped_red_files: Object.keys(unmapped).length,
			unmapped_red_tests: Object.values(unmapped).reduce((a, b) => a + b, 0),
		},
		twins: twins.map((t) => ({ file: t.file, target: t.target, status: t.status })),
		not_a_twin: Object.fromEntries([...NOT_A_TWIN.entries()].sort()),
		unmapped_reds: unmapped,
	};
}

export function loadMap(): TwinMap {
	return JSON.parse(readFileSync(ARTIFACT, 'utf8')) as TwinMap;
}

export { ARTIFACT, NOT_A_TWIN };

/** Every way the tree can disagree with the frozen artifact. */
export function drift(fresh: TwinMap, frozen: TwinMap): string[] {
	const out: string[] = [];
	const red = redFilesFromBaseline();
	const redSet = new Set(red.keys());

	for (const t of fresh.twins) {
		const want = derivedStatus(t.target, redSet);
		if (t.status !== want) {
			out.push(`${t.file}: @twin-status says ${t.status}, the tree says ${want} (${t.target})`);
		}
		if (t.status !== 'retired' && !existsSync(join(REPO_ROOT, t.target))) {
			out.push(`${t.file}: @twin-of names ${t.target}, which does not exist`);
		}
	}

	// Population totality: named a parity gate => twin or allowlisted.
	const declared = new Set(fresh.twins.map((t) => t.file));
	for (const f of filesNamingAParityGate()) {
		if (!declared.has(f) && !NOT_A_TWIN.has(f)) {
			out.push(`${f}: names a parity gate but carries no @twin-of and is not in NOT_A_TWIN`);
		}
	}
	for (const f of NOT_A_TWIN.keys()) {
		if (!filesNamingAParityGate().includes(f)) {
			out.push(`NOT_A_TWIN lists ${f}, which no longer names a parity gate — stale`);
		}
		if (declared.has(f)) out.push(`NOT_A_TWIN lists ${f}, which now declares @twin-of`);
	}

	// Back-links: a surviving target must name its twins.
	const links = parseBackLinks();
	for (const t of fresh.twins) {
		if (!existsSync(join(REPO_ROOT, t.target))) continue;
		const named = links.get(t.target) ?? [];
		if (!named.includes(t.file)) {
			out.push(`${t.target}: surviving gate does not @twinned-by its twin ${t.file}`);
		}
	}

	// The ratchet.
	for (const [file, count] of Object.entries(fresh.unmapped_reds)) {
		const before = frozen.unmapped_reds[file];
		if (before === undefined) out.push(`NEW unmapped red file: ${file} (${count} tests)`);
		else if (count > before) out.push(`unmapped reds GREW in ${file}: ${before} -> ${count}`);
	}
	for (const file of Object.keys(frozen.unmapped_reds)) {
		if (fresh.unmapped_reds[file] === undefined) {
			out.push(`FIXED — ${file} is no longer an unmapped red; regenerate the map`);
		}
	}
	return out;
}

if (import.meta.main) {
	const args = new Set(process.argv.slice(2));
	const fresh = buildMap();

	if (args.has('--report')) {
		console.log(JSON.stringify(fresh.measured, null, 2));
		console.log(`\nunmapped reds (${fresh.measured.unmapped_red_files} files):`);
		for (const [f, n] of Object.entries(fresh.unmapped_reds))
			console.log(`  ${String(n).padStart(3)}  ${f}`);
		process.exit(0);
	}
	if (args.has('--check')) {
		const d = drift(fresh, loadMap());
		if (d.length === 0) {
			console.log('twin_map: no drift');
			process.exit(0);
		}
		for (const line of d) console.error(`  ${line}`);
		process.exit(1);
	}

	if (existsSync(ARTIFACT)) {
		const frozen = loadMap();
		const grew =
			fresh.measured.unmapped_red_files > frozen.measured.unmapped_red_files ||
			fresh.measured.unmapped_red_tests > frozen.measured.unmapped_red_tests;
		if (grew && !args.has('--allow-regression')) {
			console.error(
				`REFUSED: unmapped reds grew ${frozen.measured.unmapped_red_files}/${frozen.measured.unmapped_red_tests}` +
					` -> ${fresh.measured.unmapped_red_files}/${fresh.measured.unmapped_red_tests}.` +
					' Pass --allow-regression and say why in the commit message.',
			);
			process.exit(1);
		}
	}
	writeFileSync(ARTIFACT, `${JSON.stringify(fresh, null, '\t')}\n`);
	console.log(`twin_map: wrote ${ARTIFACT}`);
}
