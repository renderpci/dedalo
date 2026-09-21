/**
 * ARCHIVE RESTORE — the reconstruction half of the archive door: rebuild the
 * archived sections, from the artifact alone, in a database that need never
 * have held them (audit 2026-08-26 P1-10).
 *
 * ROW-LEVEL, THROUGH THE WRITER HOMES ONLY. A record is re-created with its
 * eleven columns bound as the very text the extraction read
 * (`updateMatrixRecord{rawTextPassthrough}` after `insertMatrixRecordWithExplicitId`
 * has minted the row and raised the counter), so what lands is byte-identical
 * to what was archived — no component save, no conform, no re-shaping. The
 * ontology subtree goes through `upsertDdOntologyNode`; media through the
 * media-root chokepoint (`absoluteFromRelative`), so the test-media guard and
 * the traversal gate apply to an archive exactly as to an upload.
 *
 * THE WRITE OBLIGATIONS ARE DECLARED, NOT SKIPPED. A restored row bypasses the
 * component chokepoint by design (it carries every column at once), so — like
 * the duplicate and create doors — it declares the post-write obligations for
 * itself through `afterRecordWrite`: the save event (tool/context caches), the
 * security reaction (a restored users/profiles row is judged like a save) and
 * the RAG index event (a restored record must reach the vector store like any
 * other). Pinned by write_obligations_tripwire.
 *
 * REFUSES BEFORE IT WRITES. Everything that can be checked is checked first —
 * digests, the ontology conflict set, the existing-record set, the media
 * target set, and every locator's resolution — and the refusal names what it
 * found. Then the ontology and the rows (+ the audit stamp) are written; the
 * media copies follow the commit, since the filesystem cannot join it and a
 * half-copied media tree is repairable by re-running the restore, whereas
 * half-written rows are not. (Ontology and rows are two transactions in that
 * order — see the note at the write.)
 *
 * LOCATORS (DATA-11). An address stored by an archived record must resolve:
 * to an archived record (internal), or to a record the DESTINATION already
 * holds. Neither → refused, unless the caller passes `allowExternal`, in which
 * case the dangling addresses are written as-is and REPORTED. Honest limit,
 * stated here and in the docs: for an address outside the set the restore
 * proves EXISTENCE, not identity — an installation's section_id counter is
 * local, so `zz10/7` in the destination may be a different record than
 * `zz10/7` was in the source. Archive the target sections together and the
 * question does not arise.
 *
 * TIME MACHINE. Each restored record gets ONE whole-record audit row
 * (`tipo = section_tipo`, `lg-nolan`, data = the full column snapshot) — the
 * same shape the delete door stamps — so the restore is visible in the
 * record's history without pretending to be a per-component save.
 *
 * SHAPE OF THIS MODULE. One orchestrator (`restoreArchive`) over small plan /
 * write steps, each capped at complexity 6 by crap_complexity_ratchet.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dbTimestamp } from '../db/db_timestamp.ts';
import { type DdOntologyRow, readDdOntologyRow, upsertDdOntologyNode } from '../db/dd_ontology.ts';
import {
	MATRIX_JSONB_COLUMNS,
	type MatrixJsonbColumn,
	readExistingSectionIds,
} from '../db/matrix.ts';
import {
	insertMatrixRecordWithExplicitId,
	type MatrixWriteValues,
	updateMatrixRecord,
} from '../db/matrix_write.ts';
import { withTransaction } from '../db/postgres.ts';
import { recordTimeMachine } from '../db/time_machine.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { MEDIA_DIR_MODE } from '../install/media_tree.ts';
import { absoluteFromRelative } from '../media/path.ts';
import { clearOntologyDerivedCaches } from '../ontology/cache_invalidation.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { afterRecordWrite } from '../section_record/record_write.ts';
import {
	type ArchiveAddress,
	type ArchiveManifest,
	type ArchiveRecordLine,
	type ArchiveSection,
	addressesOf,
	addressKey,
	archiveFilePath,
	assertSectionsDescribed,
	mediaArchivePath,
	ontologyRowsEqual,
	readArchiveOntology,
	readArchiveRecords,
	readManifest,
	sha256File,
} from './manifest.ts';

export interface RestoreOptions {
	archiveDir: string;
	/** The acting user stamped on the audit rows. */
	userId: number;
	/** Write addresses that resolve nowhere (reported). Default: refuse. */
	allowExternal?: boolean;
	/** A record the destination already holds: refuse (default) or overwrite its columns. */
	onExistingRecord?: 'refuse' | 'overwrite';
	/** An ontology node that exists with a DIFFERENT definition: refuse (default) or overwrite. */
	onOntologyConflict?: 'refuse' | 'overwrite';
	/** A media file that exists with different bytes: refuse (default) or overwrite. */
	onExistingMedia?: 'refuse' | 'overwrite';
	/** Scratch-root seam (gates); production omits it. */
	mediaRoot?: string;
}

export interface RestoreOutcome {
	manifest: ArchiveManifest;
	ontology: { inserted: number; unchanged: number; overwritten: number };
	records: { inserted: number; overwritten: number };
	media: { copied: number; unchanged: number; overwritten: number };
	locators: {
		internal: number;
		resolved_in_destination: number;
		/** Written dangling because `allowExternal` was set. */
		dangling: ArchiveAddress[];
	};
}

/** A refusal: the plan found something; NOTHING was written. */
function refuse(message: string, coordinates: Record<string, string | number> = {}): never {
	throw new DedaloError('archive.refused', {
		message: `archive restore REFUSED: ${message}. Nothing was written.`,
		coordinates,
	});
}

/**
 * VERIFY an archive without touching the database: manifest shape, every file
 * digest, the ontology digest, every records file parseable and of the stated
 * count. The CLI's `verify` and the first step of every restore.
 */
export function verifyArchive(archiveDir: string): ArchiveManifest {
	const manifest = readManifest(archiveDir);
	assertSectionsDescribed(manifest, readArchiveOntology(archiveDir, manifest));
	for (const section of manifest.sections) readArchiveRecords(archiveDir, section);
	return manifest;
}

type RecordsBySection = Map<string, ArchiveRecordLine[]>;

function readAllRecords(archiveDir: string, manifest: ArchiveManifest): RecordsBySection {
	const recordsBySection: RecordsBySection = new Map();
	for (const section of manifest.sections) {
		recordsBySection.set(section.section_tipo, readArchiveRecords(archiveDir, section));
	}
	return recordsBySection;
}

/** The ids the destination holds among `ids` of `tipo` — none when the section resolves to no table. */
async function existingInDestination(tipo: string, ids: number[]): Promise<Set<number>> {
	const table = await getMatrixTableFromTipo(tipo);
	if (table === null) return new Set<number>();
	return readExistingSectionIds(table, tipo, ids);
}

// ── plan: ontology ──────────────────────────────────────────────────────────

interface OntologyPlan {
	insert: DdOntologyRow[];
	overwrite: DdOntologyRow[];
	unchanged: number;
}

async function planOntology(
	subtree: readonly DdOntologyRow[],
	onConflict: RestoreOptions['onOntologyConflict'],
): Promise<OntologyPlan> {
	const plan: OntologyPlan = { insert: [], overwrite: [], unchanged: 0 };
	for (const row of subtree) {
		const existing = await readDdOntologyRow(row.tipo);
		if (existing === null) plan.insert.push(row);
		else if (ontologyRowsEqual(existing, row)) plan.unchanged += 1;
		else if (onConflict === 'overwrite') plan.overwrite.push(row);
		else {
			refuse(
				`ontology node '${row.tipo}' exists in the destination with a different definition (pass onOntologyConflict:'overwrite' to replace it)`,
				{ tipo: row.tipo },
			);
		}
	}
	return plan;
}

// ── plan: locators ──────────────────────────────────────────────────────────

interface StoredAddress {
	address: ArchiveAddress;
	/** The first archived record seen holding it — named in the refusal. */
	holder: string;
	holders: number;
}

interface LocatorPlan {
	internal: number;
	resolvedInDestination: number;
	dangling: StoredAddress[];
}

function parseColumn(text: string | null | undefined): unknown {
	return text === null || text === undefined ? null : JSON.parse(text);
}

/**
 * One entry per distinct address stored by any archived record, counting its
 * holders — the same census the manifest carries (`references.internal` counts
 * locators, not targets). Walked over `relation` AND `relation_search`.
 */
function storedAddresses(recordsBySection: RecordsBySection): Map<string, StoredAddress> {
	const stored = new Map<string, StoredAddress>();
	for (const [tipo, lines] of recordsBySection) {
		for (const line of lines) {
			const parsed = {
				relation: parseColumn(line.columns.relation),
				relation_search: parseColumn(line.columns.relation_search),
			};
			for (const address of addressesOf(parsed)) {
				const key = addressKey(address);
				const entry = stored.get(key) ?? {
					address,
					holder: `${tipo}/${line.section_id}`,
					holders: 0,
				};
				entry.holders += 1;
				stored.set(key, entry);
			}
		}
	}
	return stored;
}

function archivedIdsOf(recordsBySection: RecordsBySection): Map<string, Set<number>> {
	const archived = new Map<string, Set<number>>();
	for (const [tipo, lines] of recordsBySection) {
		archived.set(tipo, new Set(lines.map((line) => line.section_id)));
	}
	return archived;
}

/** Internal (the target is archived) vs. to-be-checked, grouped by target section. */
function splitInternal(
	stored: Map<string, StoredAddress>,
	archived: Map<string, Set<number>>,
): { internal: number; toCheck: Map<string, StoredAddress[]> } {
	let internal = 0;
	const toCheck = new Map<string, StoredAddress[]>();
	for (const entry of stored.values()) {
		if (archived.get(entry.address.section_tipo)?.has(entry.address.section_id)) {
			internal += entry.holders;
			continue;
		}
		const list = toCheck.get(entry.address.section_tipo) ?? [];
		list.push(entry);
		toCheck.set(entry.address.section_tipo, list);
	}
	return { internal, toCheck };
}

/**
 * Existence in the DESTINATION. A target section's table resolves through the
 * destination ontology as it stands NOW — a section this restore is about to
 * create is already internal, so the pre-write resolution is the right one.
 */
async function planLocators(recordsBySection: RecordsBySection): Promise<LocatorPlan> {
	const { internal, toCheck } = splitInternal(
		storedAddresses(recordsBySection),
		archivedIdsOf(recordsBySection),
	);
	const plan: LocatorPlan = { internal, resolvedInDestination: 0, dangling: [] };
	for (const [tipo, entries] of toCheck) {
		const ids = entries.map((e) => e.address.section_id);
		const present = await existingInDestination(tipo, ids);
		for (const entry of entries) {
			if (present.has(entry.address.section_id)) plan.resolvedInDestination += 1;
			else plan.dangling.push(entry);
		}
	}
	return plan;
}

function refuseDangling(dangling: StoredAddress[], allowExternal: boolean | undefined): void {
	if (dangling.length === 0 || allowExternal === true) return;
	const first = dangling[0] as StoredAddress;
	refuse(
		`${dangling.length} stored locator(s) resolve neither to an archived record nor to a record this database holds — first: ${addressKey(first.address)} held by ${first.holder} (pass allowExternal to write them dangling)`,
		{ unresolved: dangling.length, address: addressKey(first.address), holder: first.holder },
	);
}

// ── plan: media + existing records ──────────────────────────────────────────

interface MediaCopy {
	source: string;
	target: string;
	overwrite: boolean;
}

function planMedia(
	manifest: ArchiveManifest,
	options: RestoreOptions,
): { copies: MediaCopy[]; unchanged: number } {
	const copies: MediaCopy[] = [];
	let unchanged = 0;
	for (const file of manifest.media.files) {
		const source = archiveFilePath(options.archiveDir, mediaArchivePath(file.path));
		const target = absoluteFromRelative(file.path, options.mediaRoot);
		if (!existsSync(target)) {
			copies.push({ source, target, overwrite: false });
			continue;
		}
		if (sha256File(target) === file.sha256) {
			unchanged += 1;
			continue;
		}
		if (options.onExistingMedia !== 'overwrite') {
			refuse(
				`media file exists with different bytes: ${file.path} (pass onExistingMedia:'overwrite')`,
				{
					path: file.path,
				},
			);
		}
		copies.push({ source, target, overwrite: true });
	}
	return { copies, unchanged };
}

/**
 * Records the destination already holds, per section — resolved BEFORE the
 * ontology write: a section whose node is absent here cannot hold records, and
 * one whose node exists is asked now, so the refusal happens with nothing
 * written rather than inside the transaction.
 */
async function planExistingRecords(
	manifest: ArchiveManifest,
	recordsBySection: RecordsBySection,
	onExistingRecord: RestoreOptions['onExistingRecord'],
): Promise<Map<string, Set<number>>> {
	const existingBySection = new Map<string, Set<number>>();
	for (const section of manifest.sections) {
		const lines = recordsBySection.get(section.section_tipo) ?? [];
		const ids = lines.map((line) => line.section_id);
		const existing = await existingInDestination(section.section_tipo, ids);
		if (existing.size > 0 && onExistingRecord !== 'overwrite') {
			refuse(
				`${existing.size} record(s) of '${section.section_tipo}' already exist in the destination — first: ${section.section_tipo}/${[...existing][0]} (pass onExistingRecord:'overwrite' to replace their columns)`,
				{ section_tipo: section.section_tipo, existing: existing.size },
			);
		}
		existingBySection.set(section.section_tipo, existing);
	}
	return existingBySection;
}

// ── write ───────────────────────────────────────────────────────────────────

/** The whole-record snapshot the audit row carries (the delete door's shape). */
function snapshotOf(columns: Record<MatrixJsonbColumn, string | null>): Record<string, unknown> {
	const snapshot: Record<string, unknown> = {};
	for (const column of MATRIX_JSONB_COLUMNS) snapshot[column] = parseColumn(columns[column]);
	return snapshot;
}

/** The component tipos a restored row carries — the keys of every object-valued column. */
function touchedKeysOf(snapshot: Record<string, unknown>): string[] {
	const keys = new Set<string>();
	for (const value of Object.values(snapshot)) {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
		for (const key of Object.keys(value)) keys.add(key);
	}
	return [...keys];
}

interface RowWriteContext {
	table: string;
	sectionTipo: string;
	existing: Set<number>;
	userId: number;
	timestamp: string;
	outcome: RestoreOutcome;
}

/**
 * One row: mint it (raises the per-section counter past this id) unless the
 * destination holds it, bind the archived text verbatim — the lossless
 * passthrough —, stamp the audit row, declare the write obligations.
 */
async function writeRecordRow(line: ArchiveRecordLine, ctx: RowWriteContext): Promise<void> {
	const values: MatrixWriteValues = {};
	for (const column of MATRIX_JSONB_COLUMNS) values[column] = line.columns[column] ?? null;
	if (ctx.existing.has(line.section_id)) {
		ctx.outcome.records.overwritten += 1;
	} else {
		await insertMatrixRecordWithExplicitId(ctx.table, ctx.sectionTipo, line.section_id, {});
		ctx.outcome.records.inserted += 1;
	}
	await updateMatrixRecord(ctx.table, ctx.sectionTipo, line.section_id, values, {
		rawTextPassthrough: true,
	});
	const snapshot = snapshotOf(line.columns);
	await recordTimeMachine(
		{
			sectionTipo: ctx.sectionTipo,
			sectionId: line.section_id,
			componentTipo: ctx.sectionTipo,
			lang: 'lg-nolan',
			userId: ctx.userId,
			data: snapshot,
		},
		ctx.timestamp,
	);
	await afterRecordWrite(
		{ table: ctx.table, sectionTipo: ctx.sectionTipo, sectionId: line.section_id },
		{ door: 'restoreArchive', touchedKeys: touchedKeysOf(snapshot), rag: 'index' },
	);
}

/**
 * The table resolves through the destination ontology, which now holds the
 * section node; the manifest's table is the SOURCE's and is compared, not
 * trusted — a section may legitimately store elsewhere here.
 */
async function writeSectionRows(
	section: ArchiveSection,
	lines: ArchiveRecordLine[],
	ctx: Omit<RowWriteContext, 'table' | 'sectionTipo'>,
): Promise<void> {
	const table = await getMatrixTableFromTipo(section.section_tipo);
	if (table === null) {
		refuse(
			`section '${section.section_tipo}' resolves to no matrix table after the ontology restore`,
			{
				section_tipo: section.section_tipo,
			},
		);
	}
	for (const line of lines) {
		await writeRecordRow(line, { ...ctx, table, sectionTipo: section.section_tipo });
	}
}

function copyMedia(copies: MediaCopy[], outcome: RestoreOutcome): void {
	for (const { source, target, overwrite } of copies) {
		mkdirSync(dirname(target), { recursive: true, mode: MEDIA_DIR_MODE });
		copyFileSync(source, target);
		if (overwrite) outcome.media.overwritten += 1;
		else outcome.media.copied += 1;
	}
}

// ── orchestrator ────────────────────────────────────────────────────────────

export async function restoreArchive(options: RestoreOptions): Promise<RestoreOutcome> {
	const { archiveDir } = options;
	const manifest = verifyArchive(archiveDir);
	const ontology = readArchiveOntology(archiveDir, manifest);
	const recordsBySection = readAllRecords(archiveDir, manifest);

	// ── plan (nothing written yet) ──
	const ontologyPlan = await planOntology(ontology.subtree, options.onOntologyConflict);
	const locators = await planLocators(recordsBySection);
	refuseDangling(locators.dangling, options.allowExternal);
	const media = planMedia(manifest, options);
	const existingBySection = await planExistingRecords(
		manifest,
		recordsBySection,
		options.onExistingRecord,
	);

	const outcome: RestoreOutcome = {
		manifest,
		ontology: {
			inserted: ontologyPlan.insert.length,
			unchanged: ontologyPlan.unchanged,
			overwritten: ontologyPlan.overwrite.length,
		},
		records: { inserted: 0, overwritten: 0 },
		media: { copied: 0, unchanged: media.unchanged, overwritten: 0 },
		locators: {
			internal: locators.internal,
			resolved_in_destination: locators.resolvedInDestination,
			dangling: locators.dangling.map((d) => d.address),
		},
	};

	// ── write: ontology, then rows ──
	// TWO transactions, ontology first, and the order is load-bearing: the
	// resolver caches serve COMMITTED state and are invalidated only after a
	// transaction settles (S1-14), so a section node upserted in the same
	// transaction as its rows would still resolve to NO table. The ontology
	// commit is re-runnable (a second pass finds every node 'unchanged'), and
	// definitions without records are inert — the harmful half-state, rows
	// without their definitions, cannot occur.
	await withTransaction(async () => {
		for (const row of [...ontologyPlan.insert, ...ontologyPlan.overwrite]) {
			await upsertDdOntologyNode(row);
		}
	});
	await clearOntologyDerivedCaches();
	const timestamp = dbTimestamp();
	await withTransaction(async () => {
		for (const section of manifest.sections) {
			await writeSectionRows(section, recordsBySection.get(section.section_tipo) ?? [], {
				existing: existingBySection.get(section.section_tipo) ?? new Set<number>(),
				userId: options.userId,
				timestamp,
				outcome,
			});
		}
	});
	await clearOntologyDerivedCaches();

	// ── write: media, after the commit ──
	copyMedia(media.copies, outcome);
	return outcome;
}
