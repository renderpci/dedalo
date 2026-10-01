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
 * - Writes go through the ONE media-key writer, the LOCKED TRANSFORM
 *   (tools/files_info_persist.ts transformStoredMediaItems — TOOLS-5): the dry
 *   run adjudicates on its unlocked snapshot, and each applied change RE-SCANS
 *   and RE-JUDGES the items read under the row lock — a curator's upload
 *   committed since the scan is refreshed, never overwritten by the snapshot,
 *   and a shrink only the locked value shows is held like any other.
 * - JUDGED PER ITEM, never per component: each stored item is GROW / DIFF /
 *   SHRINK on its OWN existing-file count, and a component's write carries
 *   every changed item except a SHRINK one, which keeps its stored index (HELD)
 *   unless `allowShrink` — files genuinely gone, or a partial local media copy
 *   (the 2026-07-19 index wipe). A per-component verdict let one growing (or
 *   foreign) item carry a sibling's shrink through.
 * - A FOREIGN item — one whose stored files carry the CLONE SIGNATURE, this
 *   component's and section's identifier with ANOTHER section_id
 *   (`<component>_<section>_<N≠id>…`, the damage a duplicate whose copy failed
 *   used to leave, CORE-5) — is always rewritten: it does not describe this
 *   record's files at all, so holding it as a "shrink" would keep a record
 *   pointing at files whose delete belongs to someone else. Any OTHER name the
 *   scan does not produce (a `properties.image_id` rename, a hand-placed file)
 *   is not foreign: it is judged by its count like every item, so a rescan that
 *   cannot see it is a held SHRINK, never a wipe.
 * - A record deleted or locked past the lock timeout mid-run is COUNTED
 *   (`missing` / `locked`), logged, and the sweep continues; `repaired` counts
 *   only what was written. The lock wait is the transform's PER-RECORD bound
 *   (`lockWait: 'per-record'`), whatever pool the sweep runs on.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type MediaTypeSpec, mediaTypeOf } from '../concepts/media.ts';
import { MATRIX_TABLE_ALLOWLIST } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { getModelByTipo } from '../ontology/resolver.ts';
import type { ReconcileDefinition } from '../reconcile/registry.ts';
import { resolveMediaPathOptions } from './ontology_path.ts';
import { type MediaIdentity, requireMediaRoot } from './path.ts';
import { refreshMediaItems, rescanMediaItems } from './repair.ts';
import { type StoredMediaItem, transformStoredMediaItems } from './tools/files_info_persist.ts';

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
	kind: FilesInfoChangeKind;
	/** The items to write: every changed item refreshed, a held SHRINK item kept as stored. */
	newItems: unknown[];
	/** Changed items this run would write (0 = the whole change is held). */
	writtenItems: number;
	/** SHRINK items whose stored index is kept (always 0 with allowShrink). */
	heldItems: number;
}

/**
 * The component's summary verdict for the report: FOREIGN when any changed item
 * is foreign, else GROW / DIFF / SHRINK on the changed items' existing-file
 * counts. What is WRITTEN is decided per item (FilesInfoChange.heldItems).
 */
export type FilesInfoChangeKind = 'GROW' | 'DIFF' | 'SHRINK' | 'FOREIGN';

export interface FilesInfoSweepSummary {
	root: string;
	scannedRows: number;
	scannedItems: number;
	/** Every stale index found (held ones included). */
	changes: FilesInfoChange[];
	/** Changes the run would persist (at least one item to write). */
	applicable: number;
	/** Changes with at least one SHRINK item withheld (a change may be both). */
	held: number;
	/** Components actually written (0 on a dry run). */
	repaired: number;
	/** Applied changes whose RECORD was gone under the lock (nothing written). */
	missing: number;
	/** Applied changes whose row stayed locked past the lock timeout (nothing written). */
	locked: number;
	/** Applied changes that held MORE shrink items under the lock than in the snapshot. */
	heldOnApply: number;
	/** Applied changes the locked items no longer needed (already current). */
	unchangedOnApply: number;
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

/** The last path segment of a stored file_path. */
function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Does this stored item index files of ANOTHER record? A non-external item one of
 * whose EXISTING entries carries the CLONE SIGNATURE: its file name is this
 * component's and section's media identifier with a DIFFERENT section_id —
 * `<componentTipo>_<sectionTipo>_<N>` (then a lang suffix, an extension or a
 * `_…` tier suffix) with N ≠ this record's id. Nothing else is foreign: a name
 * the scanner does not build (a `properties.image_id` rename, a hand-placed
 * file) proves only that a rescan cannot see it, and a rescan that cannot see a
 * file is a SHRINK, held. External items (and external entries) name URLs, not
 * files, and never count.
 */
export function isForeignItem(item: unknown, identityBase: Omit<MediaIdentity, 'lang'>): boolean {
	if (item === null || typeof item !== 'object') return false;
	const stored = item as Record<string, unknown>;
	if (typeof stored.external_source === 'string' && stored.external_source !== '') return false;
	if (!Array.isArray(stored.files_info)) return false;
	return stored.files_info.some((entry) => {
		const e = entry as Record<string, unknown> | null;
		if (e === null || e.file_exist !== true || e.external === true) return false;
		if (typeof e.file_path !== 'string' || e.file_path === '') return false;
		const owner = cloneSignatureId(baseName(e.file_path), identityBase);
		return owner !== null && owner !== identityBase.sectionId;
	});
}

/**
 * The section_id a file name's media identifier carries for THIS component and
 * section (`<componentTipo>_<sectionTipo>_<N>` followed by end, `.` or `_`), or
 * null when the name is not one of this component's identifiers at all.
 */
function cloneSignatureId(name: string, identityBase: Omit<MediaIdentity, 'lang'>): number | null {
	const prefix = `${identityBase.componentTipo}_${identityBase.sectionTipo}_`;
	if (!name.startsWith(prefix)) return null;
	const match = /^([1-9][0-9]*)(?:$|[._])/.exec(name.slice(prefix.length));
	return match === null ? null : Number(match[1]);
}

/** One component's adjudication: the items to write and what kind of change it is. */
interface Adjudication {
	changed: boolean;
	newItems: unknown[];
	storedCount: number;
	freshCount: number;
	kind: FilesInfoChangeKind;
	scanned: number;
	writtenItems: number;
	heldItems: number;
}

/**
 * Adjudicate PER ITEM on the SEMANTIC index; keep the stored object when
 * nothing really changed so unchanged items are not rewritten. `refreshed` is
 * the rescan of `stored`, index for index (rescanMediaItems keeps the order).
 * A FOREIGN item is always rewritten; any other changed item is GROW / DIFF /
 * SHRINK on its own count, and a SHRINK item keeps its stored index unless
 * `allowShrink` (see the header).
 */
function adjudicate(
	stored: readonly unknown[],
	refreshed: readonly unknown[],
	identityBase: Omit<MediaIdentity, 'lang'>,
	allowShrink: boolean,
): Adjudication {
	let scanned = 0;
	let writtenItems = 0;
	let heldItems = 0;
	let foreign = false;
	let storedChanged = 0;
	let freshChanged = 0;
	const newItems = stored.map((raw, index) => {
		if (raw === null || typeof raw !== 'object') return raw;
		scanned++;
		const storedIndex = existingIndex((raw as Record<string, unknown>).files_info);
		const freshItem = refreshed[index] as Record<string, unknown>;
		const freshIndex = existingIndex(freshItem.files_info);
		if (storedIndex.join('\n') === freshIndex.join('\n')) return raw;
		storedChanged += storedIndex.length;
		freshChanged += freshIndex.length;
		if (isForeignItem(raw, identityBase)) {
			foreign = true;
		} else if (freshIndex.length < storedIndex.length && !allowShrink) {
			heldItems++;
			return raw; // a SHRINK item keeps its stored index (header)
		}
		writtenItems++;
		return freshItem;
	});
	const count = (items: readonly unknown[]): number =>
		items.reduce(
			(sum: number, it) => sum + existingCount((it as Record<string, unknown> | null)?.files_info),
			0,
		);
	const storedCount = count(stored);
	const freshCount = storedCount - storedChanged + freshChanged;
	const kind: FilesInfoChangeKind = foreign
		? 'FOREIGN'
		: freshChanged > storedChanged
			? 'GROW'
			: freshChanged === storedChanged
				? 'DIFF'
				: 'SHRINK';
	return {
		changed: writtenItems + heldItems > 0,
		newItems,
		storedCount,
		freshCount,
		kind,
		scanned,
		writtenItems,
		heldItems,
	};
}

/** Whether a change writes anything (its held SHRINK items stay as stored). */
function applies(change: { writtenItems: number }): boolean {
	return change.writtenItems > 0;
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
				const verdict = adjudicate(
					rawItems,
					refreshedItems,
					{
						componentTipo,
						sectionTipo: row.section_tipo,
						sectionId: Number(row.section_id),
					},
					allowShrink,
				);
				scannedItems += verdict.scanned;
				if (!verdict.changed) continue;
				changes.push({
					table,
					sectionTipo: row.section_tipo,
					sectionId: Number(row.section_id),
					componentTipo,
					model,
					storedCount: verdict.storedCount,
					freshCount: verdict.freshCount,
					kind: verdict.kind,
					newItems: verdict.newItems,
					writtenItems: verdict.writtenItems,
					heldItems: verdict.heldItems,
				});
			}
		}
	}

	const applicable = changes.filter(applies);
	const held = changes.filter((c) => c.heldItems > 0);

	for (const change of changes) {
		const heldNote =
			change.heldItems === 0
				? ''
				: change.writtenItems === 0
					? ' — HELD (pass --allow-shrink)'
					: ` — ${change.heldItems} SHRINK item(s) HELD (pass --allow-shrink)`;
		log(
			`  ${change.kind.padEnd(7)} ${change.table} ${change.sectionTipo}/${change.sectionId} ` +
				`${change.componentTipo} (${change.model}): ${change.storedCount} -> ${change.freshCount} existing file(s)${heldNote}`,
		);
	}

	let repaired = 0;
	const tally = { missing: 0, locked: 0, heldOnApply: 0, unchangedOnApply: 0 };
	if (options.apply) {
		for (const change of applicable) {
			const { outcome, heldItems } = await applyChange(change, allowShrink);
			const where = `${change.table} ${change.sectionTipo}/${change.sectionId} ${change.componentTipo}`;
			if (outcome === 'written') {
				repaired++;
				log(`  APPLIED ${where}`);
				if (heldItems > change.heldItems) {
					tally.heldOnApply++;
					log(
						`  HELD    ${where} — under the lock ${heldItems} item(s) are a SHRINK, kept as stored`,
					);
				}
			} else if (outcome === 'missing') {
				tally.missing++;
				log(`  MISSING ${where} — the record was deleted during the sweep; nothing written`);
			} else if (outcome === 'locked') {
				tally.locked++;
				log(`  LOCKED  ${where} — the row stayed locked past the lock timeout; nothing written`);
			} else if (outcome === 'held') {
				tally.heldOnApply++;
				log(`  HELD    ${where} — under the lock the rescan is a SHRINK (pass --allow-shrink)`);
			} else {
				tally.unchangedOnApply++;
				log(`  CURRENT ${where} — the locked items needed no change`);
			}
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
		...tally,
		skippedModels: [...skippedModels],
	};
}

/**
 * APPLY one adjudicated change through the locked transform: the items are
 * RE-SCANNED and RE-JUDGED as they stand under the row lock — the snapshot's
 * verdict decided only that the record is worth visiting.
 */
async function applyChange(
	change: FilesInfoChange,
	allowShrink: boolean,
): Promise<{ outcome: 'written' | 'noop' | 'held' | 'missing' | 'locked'; heldItems: number }> {
	const spec = mediaTypeOf(change.model) as MediaTypeSpec;
	const identityBase = {
		componentTipo: change.componentTipo,
		sectionTipo: change.sectionTipo,
		sectionId: change.sectionId,
	};
	const pathOpts = await resolveMediaPathOptions(
		change.componentTipo,
		change.sectionTipo,
		change.sectionId,
	);
	let heldItems = 0;
	const outcome = await transformStoredMediaItems(
		identityBase,
		(locked) => {
			const rescan = rescanMediaItems(locked, { spec, identityBase, pathOpts, holdShrink: false });
			const verdict = adjudicate(locked, rescan.items, identityBase, allowShrink);
			heldItems = verdict.heldItems;
			if (!verdict.changed) return { skip: 'noop' };
			if (!applies(verdict)) return { skip: 'held' };
			return { write: verdict.newItems as StoredMediaItem[] };
		},
		{ lockWait: 'per-record' },
	);
	return { outcome: outcome.action, heldItems };
}

/**
 * The registry shape (core/reconcile/registry.ts, S-10): drift = stale indexes
 * (held SHRINK items included — they ARE drift, only not auto-repaired), apply =
 * the per-item GROW/DIFF/FOREIGN writes. `scope` = section tipos. `detail` carries every
 * outcome the sweep counts — an applied change that was NOT written (the record
 * vanished, its row stayed locked, a SHRINK only the locked value showed, the
 * locked items already current) is named, never folded into silence.
 */
export const FILES_INFO_RECONCILE: ReconcileDefinition = {
	name: 'files_info',
	stores: ['matrix media column (files_info cache)', 'media tree (quality files)'],
	description:
		'Re-scan the disk for every media component and rewrite a stale files_info index, judged per item — GROW/DIFF items are applied; a FOREIGN item (files carrying another record’s identifier) is always rewritten; a SHRINK item (files gone) is reported and keeps its index. Each apply re-judges the items under the row lock.',
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
				// Applied-but-not-written outcomes (see FilesInfoSweepSummary).
				missing: parts.reduce((sum, part) => sum + part.missing, 0),
				locked: parts.reduce((sum, part) => sum + part.locked, 0),
				heldOnApply: parts.reduce((sum, part) => sum + part.heldOnApply, 0),
				unchangedOnApply: parts.reduce((sum, part) => sum + part.unchangedOnApply, 0),
				skippedModels: [...new Set(parts.flatMap((part) => part.skippedModels))],
				// newItems are whole media arrays — too big for a gauge/widget report.
				changes: changes.map(({ newItems: _omitted, ...change }) => change),
			},
		};
	},
};
