/**
 * ============================================================================
 * MEDIA files_info REPAIR SWEEP — CLI shell over core/media/repair.ts.
 * ============================================================================
 *
 * `files_info` inside the `media` jsonb column is a DISK-DERIVED CACHE (PHP
 * treated it exactly so): it indexes which quality/extension files exist for a
 * media component. The read path serves it verbatim for image/pdf/svg/3d
 * (only component_av re-scans per read — core/media/component_emit.ts), so a
 * stale index means the client renders nothing although the files are on disk.
 * (Observed 2026-07-19: rsc170/1 rsc29 with files_info:[] after writes ran
 * while MEDIA_PATH pointed at the wrong tree.)
 *
 * The media-domain logic lives in src/core/media/repair.ts (refreshMediaItems
 * — the same kernel tool_update_cache's media branch uses, there with
 * derivative regeneration). This script owns only what a terminal sweep needs:
 * argv, the root guard, cross-table discovery, the GROW/DIFF/SHRINK
 * adjudication, reporting, and the --apply write step.
 *
 * SCOPE + SAFETY:
 * - Root guard: refuses to run unless MEDIA_PATH exists and holds the image
 *   original tier — re-running against an empty/wrong root would re-corrupt
 *   every index (the exact failure being repaired).
 * - No derivative rebuild (regenerate:false): an unattended sweep must never
 *   re-encode files; that is tool_update_cache / tool_media_versions work.
 * - files_info is a cache, not user data: no time-machine version is written.
 * - Writes go through updateMatrixKeyData (jsonb_set on ONLY the component's
 *   key, encodeForJsonb inside) in a withTransaction per record.
 * - A rescan that finds FEWER existing files than stored (files genuinely
 *   gone, or a partial local media copy) is reported and SKIPPED unless
 *   --allow-shrink is passed.
 *
 * USAGE (dry-run is the default and prints the full change listing):
 *
 *     bun scripts/media_repair_files_info.ts
 *     bun scripts/media_repair_files_info.ts --section rsc170 --id 1 --component rsc29
 *     bun scripts/media_repair_files_info.ts --apply [--allow-shrink]
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
// Side-effect: registers the component-model lookup the ontology resolver
// requires (standalone scripts must do what the server entrypoint does).
import '../src/core/components/registry.ts';
import { config } from '../src/config/config.ts';
import { mediaTypeOf } from '../src/core/concepts/media.ts';
import { MATRIX_TABLE_ALLOWLIST } from '../src/core/db/matrix.ts';
import { updateMatrixKeyData } from '../src/core/db/matrix_write.ts';
import { sql, withTransaction } from '../src/core/db/postgres.ts';
import { refreshMediaItems } from '../src/core/media/repair.ts';
import { getModelByTipo } from '../src/core/ontology/resolver.ts';

interface Args {
	apply: boolean;
	allowShrink: boolean;
	section: string | null;
	id: number | null;
	component: string | null;
}

function usage(message: string): never {
	console.error(`media_repair_files_info: ${message}`);
	console.error(
		'usage: bun scripts/media_repair_files_info.ts [--section <tipo>] [--id <n>] [--component <tipo>] [--apply] [--allow-shrink]',
	);
	process.exit(1);
}

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false, allowShrink: false, section: null, id: null, component: null };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		switch (arg) {
			case '--apply':
				args.apply = true;
				break;
			case '--allow-shrink':
				args.allowShrink = true;
				break;
			case '--section':
				args.section = argv[++index] ?? usage('--section needs a tipo');
				break;
			case '--id': {
				const value = Number(argv[++index]);
				if (!Number.isInteger(value) || value <= 0) usage('--id must be a positive integer');
				args.id = value;
				break;
			}
			case '--component':
				args.component = argv[++index] ?? usage('--component needs a tipo');
				break;
			default:
				usage(`unknown argument '${arg}'`);
		}
	}
	if (args.id !== null && args.section === null) usage('--id requires --section');
	return args;
}

/**
 * The SEMANTIC index a files_info carries: the sorted set of existing
 * `quality|file_path` pairs. Comparing this — not the raw JSON — is what keeps
 * the sweep quiet on the ~100% of records whose stored entries differ from a
 * fresh TS scan only in key order / file_time shape (PHP-written cache), and
 * loud only on real divergence: files the index misses or files that are gone.
 */
function existingIndex(filesInfo: unknown): string[] {
	if (!Array.isArray(filesInfo)) return [];
	return filesInfo
		.filter((entry) => (entry as Record<string, unknown> | null)?.file_exist === true)
		.map((entry) => {
			const e = entry as Record<string, unknown>;
			return `${e.quality}|${e.file_path}`;
		})
		.sort();
}

function existingCount(filesInfo: unknown): number {
	return existingIndex(filesInfo).length;
}

interface Change {
	table: string;
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	model: string;
	storedCount: number;
	freshCount: number;
	kind: 'GROW' | 'DIFF' | 'SHRINK';
	newItems: unknown[];
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	// Root guard: never scan against a missing/empty media tree.
	const root = config.media.rootPath;
	if (root === null || !existsSync(root)) {
		usage(`media root '${root}' does not exist — fix MEDIA_PATH before repairing`);
	}
	if (!existsSync(join(root, 'image', 'original'))) {
		usage(
			`media root '${root}' has no image/original tier — looks like the wrong tree; refusing to rescan against it`,
		);
	}

	const scope =
		args.section !== null
			? `${args.section}${args.id !== null ? `/${args.id}` : ''}${args.component !== null ? ` ${args.component}` : ''}`
			: 'ALL media components';
	console.log(
		`media_repair_files_info — root ${root}, mode ${args.apply ? 'APPLY' : 'DRY-RUN'}, scope ${scope}`,
	);

	const changes: Change[] = [];
	const skippedModels = new Set<string>();
	let scannedRows = 0;
	let scannedItems = 0;

	for (const table of MATRIX_TABLE_ALLOWLIST) {
		let rows: { section_tipo: string; section_id: number; media_text: string }[];
		try {
			const filters = ['media IS NOT NULL', "media::text NOT IN ('{}', 'null')"];
			const params: (string | number)[] = [];
			if (args.section !== null) {
				params.push(args.section);
				filters.push(`section_tipo = $${params.length}`);
			}
			if (args.id !== null) {
				params.push(args.id);
				filters.push(`section_id = $${params.length}`);
			}
			rows = (await sql.unsafe(
				`SELECT section_tipo, section_id, media::text AS media_text
				 FROM "${table}" WHERE ${filters.join(' AND ')}
				 ORDER BY section_tipo, section_id`,
				params,
			)) as unknown as typeof rows;
		} catch (error) {
			// Non-standard table shape (no media column) — name it, keep sweeping.
			console.log(`  note: skipping table ${table}: ${(error as Error).message}`);
			continue;
		}

		for (const row of rows) {
			scannedRows++;
			let media: Record<string, unknown>;
			try {
				media = JSON.parse(row.media_text) as Record<string, unknown>;
			} catch {
				console.log(
					`  note: ${table} ${row.section_tipo}/${row.section_id}: unparseable media column`,
				);
				continue;
			}
			for (const [componentTipo, rawItems] of Object.entries(media)) {
				if (args.component !== null && componentTipo !== args.component) continue;
				if (!Array.isArray(rawItems) || rawItems.length === 0) continue;
				const model = await getModelByTipo(componentTipo);
				if (model === null) continue;
				if (mediaTypeOf(model) === null) {
					skippedModels.add(model);
					continue;
				}
				const { refreshedItems } = await refreshMediaItems({
					componentTipo,
					sectionTipo: row.section_tipo,
					sectionId: Number(row.section_id),
					model,
					items: rawItems,
					regenerate: false, // sweep never re-encodes files (header SCOPE)
				});
				// Adjudicate per item on the SEMANTIC index; keep the stored object
				// when nothing really changed so unchanged items are not rewritten.
				let itemChanged = false;
				const newItems = rawItems.map((raw, index) => {
					if (raw === null || typeof raw !== 'object') return raw;
					scannedItems++;
					const storedIndex = existingIndex((raw as Record<string, unknown>).files_info);
					const freshItem = refreshedItems[index] as Record<string, unknown>;
					const freshIndex = existingIndex(freshItem.files_info);
					if (storedIndex.join('\n') !== freshIndex.join('\n')) {
						itemChanged = true;
						return freshItem;
					}
					return raw;
				});
				if (!itemChanged) continue;
				const storedCount = rawItems.reduce(
					(sum: number, it) =>
						sum + existingCount((it as Record<string, unknown> | null)?.files_info),
					0,
				);
				const freshCount = newItems.reduce(
					(sum: number, it) =>
						sum + existingCount((it as Record<string, unknown> | null)?.files_info),
					0,
				);
				changes.push({
					table,
					sectionTipo: row.section_tipo,
					sectionId: Number(row.section_id),
					componentTipo,
					model,
					storedCount,
					freshCount,
					kind: freshCount > storedCount ? 'GROW' : freshCount === storedCount ? 'DIFF' : 'SHRINK',
					newItems,
				});
			}
		}
	}

	const applicable = changes.filter((c) => c.kind !== 'SHRINK' || args.allowShrink);
	const held = changes.filter((c) => c.kind === 'SHRINK' && !args.allowShrink);

	console.log(
		`\nscanned ${scannedRows} record(s) / ${scannedItems} media item(s); stale indexes: ${changes.length}`,
	);
	if (skippedModels.size > 0) {
		console.log(`non-media models in the media column (ignored): ${[...skippedModels].join(', ')}`);
	}
	for (const change of changes) {
		const heldNote =
			change.kind === 'SHRINK' && !args.allowShrink ? ' — HELD (pass --allow-shrink)' : '';
		console.log(
			`  ${change.kind.padEnd(7)} ${change.table} ${change.sectionTipo}/${change.sectionId} ` +
				`${change.componentTipo} (${change.model}): ${change.storedCount} -> ${change.freshCount} existing file(s)${heldNote}`,
		);
	}

	if (!args.apply) {
		console.log(
			`\nDRY-RUN complete: ${applicable.length} component(s) would be repaired, ${held.length} held. Re-run with --apply.`,
		);
		return;
	}

	let repaired = 0;
	for (const change of applicable) {
		await withTransaction(async () => {
			await updateMatrixKeyData(
				change.table,
				change.sectionTipo,
				change.sectionId,
				'media',
				change.componentTipo,
				change.newItems,
			);
		});
		repaired++;
		console.log(
			`  APPLIED ${change.table} ${change.sectionTipo}/${change.sectionId} ${change.componentTipo}`,
		);
	}
	console.log(`\nrepaired ${repaired} component(s), held ${held.length}.`);
}

await main();
process.exit(0);
