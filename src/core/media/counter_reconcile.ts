/**
 * POST-RESTORE COUNTER RECONCILE — the media tree is the third witness of an id
 * that was minted (P0-14 / LIFE-01).
 *
 * THE FAILURE THIS CLOSES. A `pg_restore` to backup instant T0 rolls
 * `matrix_counter` back WITH the data, while the media filesystem keeps every
 * file written up to the disaster at T1. The two stores then disagree: the
 * restored database has never heard of ids 900..950, and the disk holds their
 * originals and derivatives.
 *
 * Media identity is exactly `{component_tipo}_{section_tipo}_{section_id}`
 * (`buildMediaIdentifier`), so when the allocator re-mints those ids every new
 * record keys straight into a dead record's files. No collision fires — the rows
 * are gone — and the S2-01 self-heal is collision-triggered, so it cannot see
 * this. Then `component_av` re-derives `files_info` from disk and plays the dead
 * object's derivatives, and `tool_update_cache` / `media_repair_files_info
 * --apply` PERSIST the wrong attachment.
 *
 * The counter half of P0-14 widened the allocator's floor to the live rows plus
 * the time-machine witness. Neither sees this: a restore rolls BOTH back
 * together. Only the disk remembers.
 *
 * WHAT THIS DOES. Reads the media tree, recovers the highest `section_id` any
 * file names per section, and RAISES that section's counter to it. Raise-only,
 * so it can never point a counter at an id already in use, and re-running it is
 * a no-op.
 *
 * WHY IT IS AN OPERATOR ACTION AND NOT A BOOT STEP. It walks the whole media
 * tree — the store `engineering/PRODUCTION.md` §6 calls "the source of truth
 * every derivative rebuilds from", which on a heritage install is the largest
 * thing on the host. That is a restore-day procedure, deliberately run and
 * reported, not something a boot does silently while an operator waits.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { counterFloorExpression, counterTableFor } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../ontology/resolver.ts';
import { requireMediaRoot } from './path.ts';

/**
 * A media file name, back to the identity that built it. Tipos are
 * `^[a-z]+[0-9]+$` (no underscore), so the three parts split unambiguously; the
 * optional trailing lang is `lg-*` and may itself carry underscores, which is
 * why it is matched last and loosely.
 */
const MEDIA_IDENTIFIER = /^([a-z]+[0-9]+)_([a-z]+[0-9]+)_([0-9]+)(?:_(lg-[a-z0-9_]+))?\./;

/** One media file name, back to the (section_tipo, section_id) it carries. */
function parseMediaIdentifier(fileName: string): { sectionTipo: string; sectionId: number } | null {
	const match = MEDIA_IDENTIFIER.exec(fileName);
	if (match === null) return null;
	const sectionId = Number(match[3]);
	if (!Number.isInteger(sectionId) || sectionId <= 0) return null;
	return { sectionTipo: match[2] as string, sectionId };
}

export interface MediaWitness {
	sectionTipo: string;
	/** The highest section_id any file on disk names for this section. */
	maxSectionId: number;
	/** One file that named it — so a surprising number can be traced by hand. */
	sample: string;
}

/**
 * Walk the media root and recover, per section tipo, the highest section_id any
 * file names. Directory names are ignored entirely: only the identifier a file
 * carries is evidence, because that is what the engine reads back.
 */
export async function scanMediaSectionIds(
	mediaRoot?: string,
): Promise<{ witnesses: Map<string, MediaWitness>; filesScanned: number }> {
	const root = requireMediaRoot(mediaRoot);
	const witnesses = new Map<string, MediaWitness>();
	let filesScanned = 0;

	const record = (fileName: string): void => {
		const parsed = parseMediaIdentifier(fileName);
		if (parsed === null) return;
		const seen = witnesses.get(parsed.sectionTipo);
		if (seen === undefined || parsed.sectionId > seen.maxSectionId) {
			witnesses.set(parsed.sectionTipo, {
				sectionTipo: parsed.sectionTipo,
				maxSectionId: parsed.sectionId,
				sample: fileName,
			});
		}
	};

	const walk = async (dir: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (entry.isDirectory()) {
				await walk(join(dir, entry.name));
				continue;
			}
			filesScanned += 1;
			record(entry.name);
		}
	};
	await walk(root);
	return { witnesses, filesScanned };
}

/**
 * Does the DATABASE already know an id at least as high as the one this file
 * names? Returns the raise to make, or null when nothing is owed.
 *
 * The comparison is against the allocator's OWN floor (live rows + the
 * time-machine witness), not merely the stored counter: where that floor is
 * already higher, the media adds nothing and raising would be noise.
 */
async function raiseNeededFor(witness: MediaWitness): Promise<CounterRaise | null> {
	// Only a real SECTION owns a counter; a file naming anything else is not
	// evidence about an allocator.
	if ((await getModelByTipo(witness.sectionTipo)) !== 'section') return null;
	const table = await getMatrixTableFromTipo(witness.sectionTipo);
	if (table === null) return null;
	const counterTable = counterTableFor(table);

	const current = (await sql.unsafe(`SELECT value FROM "${counterTable}" WHERE tipo = $1`, [
		witness.sectionTipo,
	])) as { value: number }[];
	const floorRows = (await sql.unsafe(
		`SELECT GREATEST(COALESCE((SELECT value FROM "${counterTable}" WHERE tipo = $1), 0),
		                 ${counterFloorExpression(table)}) AS floor_value`,
		[witness.sectionTipo],
	)) as { floor_value: number }[];
	if (Number(floorRows[0]?.floor_value ?? 0) >= witness.maxSectionId) return null;

	return {
		sectionTipo: witness.sectionTipo,
		before: current[0] === undefined ? null : Number(current[0].value),
		after: witness.maxSectionId,
		witness: witness.sample,
	};
}

/** RAISE-ONLY: the media can only ever move a counter forward. */
async function applyRaise(witness: MediaWitness): Promise<void> {
	const table = await getMatrixTableFromTipo(witness.sectionTipo);
	if (table === null) return;
	const counterTable = counterTableFor(table);
	await sql.unsafe(
		`INSERT INTO "${counterTable}" (tipo, value) VALUES ($1, $2)
		 ON CONFLICT (tipo) DO UPDATE
		    SET value = GREATEST("${counterTable}".value, EXCLUDED.value)`,
		[witness.sectionTipo, witness.maxSectionId],
	);
}

export interface CounterRaise {
	sectionTipo: string;
	/** The counter before — null when the section had no counter row at all. */
	before: number | null;
	after: number;
	/** The file that proved the id was minted. */
	witness: string;
}

/**
 * Raise every section's counter to the highest id its MEDIA names, where the
 * disk knows about an id the database does not.
 *
 * `apply:false` reports what it would do and writes nothing — the restore-day
 * default, because an operator should read this list before it moves anything.
 */
export async function reconcileCountersWithMedia(
	options: { apply: boolean; mediaRoot?: string } = { apply: false },
): Promise<{ raises: CounterRaise[]; filesScanned: number; sectionsWithMedia: number }> {
	const { witnesses, filesScanned } = await scanMediaSectionIds(options.mediaRoot);
	const raises: CounterRaise[] = [];

	for (const witness of witnesses.values()) {
		const raise = await raiseNeededFor(witness);
		if (raise === null) continue;
		raises.push(raise);
		if (options.apply) await applyRaise(witness);
	}

	return { raises, filesScanned, sectionsWithMedia: witnesses.size };
}
