/**
 * MEDIA files_info RECONCILE SWEEP — the cross-section sweep behind
 * scripts/media_repair_files_info.ts (its thin shell) and the `files_info`
 * entry of the reconcile registry (core/reconcile/registry.ts, S-10).
 *
 * `files_info` inside the `media` jsonb column is a DISK-DERIVED CACHE: it
 * indexes which quality/extension files exist for a media component. The read
 * path serves it verbatim for image/pdf/svg/3d (only component_av re-scans per
 * read — core/media/component_emit.ts), so a stale index means the client
 * renders nothing although the files are on disk. (Observed 2026-07-19:
 * rsc170/1 rsc29 with files_info:[] after writes ran while MEDIA_PATH pointed
 * at the wrong tree.)
 *
 * The per-component kernel is src/core/media/repair.ts refreshMediaItems — the
 * same one tool_update_cache's media branch uses, there with derivative
 * regeneration. This module owns what a SWEEP needs: the root guard,
 * cross-table discovery, the GROW/DIFF/SHRINK adjudication, and the apply step.
 * (The per-record write door with the create-vs-refresh rule that the tools
 * reach is tools/files_info_persist.ts; this sweep replaces whole item arrays it
 * already adjudicated, through the same jsonb key write.)
 *
 * SCOPE + SAFETY:
 * - Root guard: refuses to run unless the media root exists and holds the image
 *   original tier — re-running against an empty/wrong root would re-corrupt
 *   every index (the exact failure being repaired).
 * - No derivative rebuild (regenerate:false): an unattended sweep must never
 *   re-encode files; that is tool_update_cache / tool_media_versions work.
 * - files_info is a cache, not user data: no time-machine version is written.
 * - Writes go through updateMatrixKeyData (jsonb_set on ONLY the component's
 *   key, encodeForJsonb inside) in a withTransaction per record.
 * - A rescan that finds FEWER existing files than stored (files genuinely gone,
 *   or a partial local media copy) is reported and HELD unless `allowShrink`.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mediaTypeOf } from '../concepts/media.ts';
import { MATRIX_TABLE_ALLOWLIST } from '../db/matrix.ts';
import { updateMatrixKeyData } from '../db/matrix_write.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { getModelByTipo } from '../ontology/resolver.ts';
import type { ReconcileDefinition } from '../reconcile/registry.ts';
import { requireMediaRoot } from './path.ts';
import { refreshMediaItems } from './repair.ts';

export interface FilesInfoSweepOptions {
	/** false (default) = dry run: adjudicate + report, write nothing. */
	apply: boolean;
	/** Persist SHRINK changes too (files genuinely gone). Default false: held. */
	allowShrink?: boolean;
	/** Narrow to one section (and optionally one record / one component). */
	section?: string | null;
	id?: number | null;
	component?: string | null;
	/** Per-line report channel (the CLI prints; the registry keeps the structured report). */
	log?: (line: string) => void;
}

export interface FilesInfoChange {
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

export interface FilesInfoSweepSummary {
	root: string;
	scannedRows: number;
	scannedItems: number;
	/** Every stale index found (held ones included). */
	changes: FilesInfoChange[];
	/** Changes the run would persist (SHRINK only with allowShrink). */
	applicable: number;
	/** SHRINK changes withheld. */
	held: number;
	/** Components actually written (0 on a dry run). */
	repaired: number;
	/** Non-media models found in the media column (ignored). */
	skippedModels: string[];
}

/**
 * The SEMANTIC index a files_info carries: the sorted set of existing
 * `quality|file_path` pairs. Comparing this — not the raw JSON — is what keeps
 * the sweep quiet on the ~100% of records whose stored entries differ from a
 * fresh TS scan only in key order / file_time shape (PHP-written cache), and
 * loud only on real divergence: files the index misses or files that are gone.
 */
export function existingIndex(filesInfo: unknown): string[] {
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

/**
 * The root guard: never scan against a missing/empty media tree. Goes through
 * requireMediaRoot, so the test-media refusal sits on this door too.
 */
function guardedMediaRoot(): string {
	const root = requireMediaRoot();
	if (!existsSync(root)) {
		throw new DedaloError('media.not_configured', {
			message: `media root '${root}' does not exist — fix MEDIA_PATH before repairing`,
		});
	}
	if (!existsSync(join(root, 'image', 'original'))) {
		throw new DedaloError('media.not_configured', {
			message: `media root '${root}' has no image/original tier — looks like the wrong tree; refusing to rescan against it`,
		});
	}
	return root;
}

/** Sweep every media component's stored files_info against the disk. */
export async function sweepFilesInfo(
	options: FilesInfoSweepOptions,
): Promise<FilesInfoSweepSummary> {
	const log = options.log ?? ((): void => {});
	const root = guardedMediaRoot();
	const allowShrink = options.allowShrink === true;
	const section = options.section ?? null;
	const id = options.id ?? null;
	const component = options.component ?? null;

	const changes: FilesInfoChange[] = [];
	const skippedModels = new Set<string>();
	let scannedRows = 0;
	let scannedItems = 0;

	for (const table of MATRIX_TABLE_ALLOWLIST) {
		let rows: { section_tipo: string; section_id: number; media_text: string }[];
		try {
			const filters = ['media IS NOT NULL', "media::text NOT IN ('{}', 'null')"];
			const params: (string | number)[] = [];
			if (section !== null) {
				params.push(section);
				filters.push(`section_tipo = $${params.length}`);
			}
			if (id !== null) {
				params.push(id);
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
			log(`  note: skipping table ${table}: ${(error as Error).message}`);
			continue;
		}

		for (const row of rows) {
			scannedRows++;
			let media: Record<string, unknown>;
			try {
				media = JSON.parse(row.media_text) as Record<string, unknown>;
			} catch {
				log(`  note: ${table} ${row.section_tipo}/${row.section_id}: unparseable media column`);
				continue;
			}
			for (const [componentTipo, rawItems] of Object.entries(media)) {
				if (component !== null && componentTipo !== component) continue;
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
					holdShrink: false, // raw scan — the GROW/DIFF/SHRINK adjudication below guards
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

	const applicable = changes.filter((c) => c.kind !== 'SHRINK' || allowShrink);
	const held = changes.filter((c) => c.kind === 'SHRINK' && !allowShrink);

	for (const change of changes) {
		const heldNote =
			change.kind === 'SHRINK' && !allowShrink ? ' — HELD (pass --allow-shrink)' : '';
		log(
			`  ${change.kind.padEnd(7)} ${change.table} ${change.sectionTipo}/${change.sectionId} ` +
				`${change.componentTipo} (${change.model}): ${change.storedCount} -> ${change.freshCount} existing file(s)${heldNote}`,
		);
	}

	let repaired = 0;
	if (options.apply) {
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
			log(
				`  APPLIED ${change.table} ${change.sectionTipo}/${change.sectionId} ${change.componentTipo}`,
			);
		}
	}

	return {
		root,
		scannedRows,
		scannedItems,
		changes,
		applicable: applicable.length,
		held: held.length,
		repaired,
		skippedModels: [...skippedModels],
	};
}

/**
 * The registry shape (core/reconcile/registry.ts, S-10): drift = stale indexes
 * (held SHRINKs included — they ARE drift, only not auto-repaired), apply =
 * the GROW/DIFF writes. `scope` = section tipos.
 */
export const FILES_INFO_RECONCILE: ReconcileDefinition = {
	name: 'files_info',
	stores: ['matrix media column (files_info cache)', 'media tree (quality files)'],
	description:
		'Re-scan the disk for every media component and rewrite a stale files_info index — GROW/DIFF are applied, SHRINK (files gone) is reported and held.',
	scopeLabel: 'section tipo',
	// Stats every media file the matrix names: an operator sweep, not a boot step.
	schedule: 'operator',
	sources: [
		'src/core/media/files_info_reconcile.ts',
		'scripts/media_repair_files_info.ts',
		'src/core/media/repair.ts',
	],
	async run({ apply, scope }) {
		const parts: FilesInfoSweepSummary[] = [];
		for (const section of scope === undefined ? [null] : scope) {
			parts.push(await sweepFilesInfo({ apply, section }));
		}
		const changes = parts.flatMap((part) => part.changes);
		return {
			drift: changes.length,
			applied: parts.reduce((sum, part) => sum + part.repaired, 0),
			detail: {
				root: parts[0]?.root ?? null,
				scannedRows: parts.reduce((sum, part) => sum + part.scannedRows, 0),
				scannedItems: parts.reduce((sum, part) => sum + part.scannedItems, 0),
				held: parts.reduce((sum, part) => sum + part.held, 0),
				skippedModels: [...new Set(parts.flatMap((part) => part.skippedModels))],
				// newItems are whole media arrays — too big for a gauge/widget report.
				changes: changes.map(({ newItems: _omitted, ...change }) => change),
			},
		};
	},
};
