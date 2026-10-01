/**
 * THE MEASURED PROCESS of diffusion_artifact_rss_native (PERF-2/DIFF-4).
 *
 * A peak-RSS ceiling can only be measured in a process that does ONE thing:
 * `process.resourceUsage().maxRSS` is a high-water mark (KiB) of the whole
 * process, so the gate spawns this file per measurement and reads the delta it
 * prints as the last stdout line (JSON). The BASELINE is the CURRENT resident
 * size after a full GC (`process.memoryUsage().rss`), never the high-water mark
 * itself: a phase before the measured one (the rdf mode's writes) may have
 * peaked higher than where the process now sits, and measuring from that peak
 * would hide every byte the measured step grows back up to it. Modes:
 *
 *   control <file>            read the file WHOLE — the positive control proving
 *                             the unit and the probe (its delta must be large);
 *   zip <out.zip> <file>...   the production `createZip` over big files;
 *   rdf <count> <bytes>       an rdf writer session writes <count> records of
 *                             ~<bytes> each (batches of 10, GC between them),
 *                             then the BASELINE is taken and `close()` runs the
 *                             consolidation (merge + zip) — the measured delta is
 *                             close()'s alone.
 *
 * The rdf mode goes through `writeRows` on purpose: before the run ledger the
 * session consolidated only files IT wrote, so a close() over files seeded by
 * another process would consolidate nothing and measure nothing. Its close gets
 * the synthetic run context the runner passes (the artifact manifest = every
 * record written, in order); a pre-ledger close() ignores the argument.
 *
 * The environment is the parent's (DEDALO_DIFFUSION_FILES_ROOT points at a
 * MARKED scratch root; the test media guard is inherited armed).
 */

import type { FieldPlan, PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import type { ProjectedRow } from '../../src/diffusion/project/lang_ladder.ts';

const [mode, ...args] = process.argv.slice(2);

function peakKiB(): number {
	return process.resourceUsage().maxRSS;
}

/** The resident size NOW (KiB), after a full collection — the delta's baseline. */
function baselineKiB(): number {
	Bun.gc(true);
	return Math.floor(process.memoryUsage().rss / 1024);
}

function report(baseline: number, extra: Record<string, unknown> = {}): void {
	const peak = peakKiB();
	console.log(
		JSON.stringify({
			mode,
			baselineKiB: baseline,
			peakKiB: peak,
			deltaKiB: peak - baseline,
			...extra,
		}),
	);
}

if (mode === 'control') {
	const [path] = args;
	const baseline = baselineKiB();
	const bytes = new Uint8Array(await Bun.file(path as string).arrayBuffer());
	let checksum = 0;
	for (let index = 0; index < bytes.length; index += 4096)
		checksum = (checksum + (bytes[index] ?? 0)) | 0;
	report(baseline, { checksum });
} else if (mode === 'zip') {
	const [outPath, ...inputs] = args;
	const { createZip } = await import('../../src/diffusion/writers/files.ts');
	const baseline = baselineKiB();
	await createZip(inputs, outPath as string);
	report(baseline);
} else if (mode === 'rdf') {
	const count = Number(args[0]);
	const partBytes = Number(args[1]);
	const { rdfWriter } = await import('../../src/diffusion/writers/rdf.ts');
	const titleField: FieldPlan = {
		id: 'rss_title',
		columnName: 'dc:title',
		sourceChain: [],
		transform: [],
		column: { fieldModel: 'field_text' },
		policy: {},
		excludeColumn: false,
	};
	const section: SectionPlan = {
		sectionTipo: 'test6100',
		tableName: 'nmo:NumismaticObject',
		tableTipo: 'test6100_table',
		fields: [titleField],
	};
	const plan: PublicationPlan = {
		planId: 'rss_rdf',
		elementTipo: 'test6112',
		format: 'rdf',
		serviceName: 'rss_rdf',
		target: { kind: 'files', serviceName: 'rss_rdf' },
		sections: [section],
		recursion: { maxLevels: 0 },
		langPolicy: { langs: ['lg-eng'], mainLang: 'lg-eng' },
		warnings: [],
	} as PublicationPlan;
	const open = rdfWriter.open as unknown as (
		plan: PublicationPlan,
		context?: { jobId: string; resume: unknown },
	) => Promise<{
		ensureSchema(): Promise<void>;
		writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<unknown>;
		close(context?: unknown): Promise<{ tables: { table_name: string }[] }>;
	}>;
	const session = await open(plan, { jobId: '00000000-0000-4000-8000-00000000f00d', resume: null });
	await session.ensureSchema();
	const filler = 'a'.repeat(partBytes);
	for (let first = 1; first <= count; first += 10) {
		const rows: ProjectedRow[] = [];
		for (let id = first; id < first + 10 && id <= count; id++) {
			rows.push({ sectionId: id, lang: 'lg-eng', columns: { 'dc:title': `${id} ${filler}` } });
		}
		await session.writeRows(section, rows);
		Bun.gc(true);
	}
	const context = {
		async *manifest() {
			for (let id = 1; id <= count; id++) yield { sectionTipo: section.sectionTipo, sectionId: id };
		},
		async *removed() {},
	};
	const baseline = baselineKiB();
	const summary = await session.close(context);
	report(baseline, { tables: summary.tables.map((table) => table.table_name) });
} else {
	console.error(`diffusion_rss_child: unknown mode '${mode}'`);
	process.exit(2);
}
process.exit(0);
