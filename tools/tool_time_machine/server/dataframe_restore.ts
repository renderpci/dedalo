/**
 * DATAFRAME-PAIRED TIME-MACHINE RESTORE — the frame half of a component
 * restore (PHP tools/tool_time_machine::apply_value :277-333 →
 * component_dataframe::set_time_machine_data :382).
 *
 * A main component that declares a `component_dataframe` slot does NOT store
 * its frames in its own column: they live in `relation[<slot tipo>]`, paired
 * to INDIVIDUAL main items by `id_key → id` (RELATIONS_SPEC §6.2). A restore
 * that rewrites only the main column therefore leaves the record in a state it
 * was never in — the audit's §5.6 finding on `oh1`: `oh24` (Informants)
 * reverted while `oh115` (Role) kept TODAY's frames, and every frame whose
 * `id_key` no longer matched a live main item became a permanent orphan the
 * UI can neither show nor delete.
 *
 * PHP's sequence, ported here verbatim:
 *   1. for each dataframe slot of the main component, EMPTY the slot
 *      (`empty_full_data_associated_to_main_component` removes every locator
 *      whose `from_component_tipo` is the slot — all main items, all pairings);
 *   2. replay the slot's frames as carried by the TM snapshot;
 *   3. write NO time-machine row for the slot — the main component's fresh row
 *      carries the frames (PHP `tm_record::$save_tm = false` around the slot
 *      save, and `component_common::get_time_machine_data_to_save` :1580
 *      appends every slot's FULL data to the main's snapshot).
 * Steps 1+2 collapse into ONE key write per slot here: writing the key with
 * the snapshot's frames replaces its whole content, and `null` removes it —
 * the same end state through the write chokepoint, in one statement.
 *
 * WHERE THE FRAMES COME FROM. The TM snapshot of a main component is a FLAT
 * array holding both the main items and the dd490 frame objects. Each frame
 * names its slot in `from_component_tipo`; pre-migration frames may lack it
 * and are claimed by `main_component_tipo` (PHP's dual read).
 *
 * WHY THE SLOT SET IS A UNION (deliberate divergence,
 * WC-2026-08-09-time-machine-restore-replays-paired-dataframe-frames):
 * PHP discovers slots from the main's `request_config` show map alone, which
 * misses a LITERAL main whose frames activate on `has_dataframe` + ontology
 * parentage (the two halves can legitimately disagree — see the
 * `dedalo-relations-ts` dataframe contract). A slot missed at discovery time is
 * never emptied, which is exactly the orphan this module exists to prevent, so
 * discovery unions the ontology children, the own-config ddos (show AND hide)
 * and the slots the snapshot's own frames name (model-checked before they are
 * believed).
 *
 * WHAT IS *NOT* REFUSED (PHP fidelity — the oracle handles it generically).
 * PHP never inspects a frame's `from_component_tipo` on its own: it loops the
 * slots it discovered and, for each, FILTERS the snapshot for frames naming
 * that slot. A frame naming a tipo that is not a live dataframe slot of this
 * main therefore matches no iteration, is written nowhere, and is stripped out
 * of the main data — inert, not lost (the TM row it came from is kept forever;
 * component restores never consume it). An earlier revision of this module
 * aborted such a restore, which broke the Phase-6 contract gate
 * `tool_request.test.ts` "apply_value strips dataframe frames from the restored
 * main data" — a snapshot carrying a stale/foreign frame must still restore.
 * Refusal is reserved for the two cases where proceeding CORRUPTS or DELETES:
 * an unattributable legacy frame with several slots in play, and the frameless
 * wipe below.
 */

import { DATAFRAME_RELATION_TYPE } from '../../../src/core/concepts/subdatum.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { absorbComponentItemIds } from '../../../src/core/db/matrix_write.ts';
import { getColumnNameByModel, getModelByTipo } from '../../../src/core/ontology/resolver.ts';
import { resolveDataframeSlotTipos } from '../../../src/core/relations/dataframe_slots.ts';
import { canonicalJson } from '../../../src/core/section/record/append_merge.ts';
import {
	persistRecordKeys,
	type RecordWriteTarget,
} from '../../../src/core/section_record/index.ts';
import { normalizeRestoredSectionIds } from '../../../src/core/update/transform/section_id_restore.ts';
import { readComponentItems } from './restore_common.ts';

/** One slot's restored content: `frames` empty ⇒ the key is removed (the wipe). */
export interface DataframeSlotRestore {
	slotTipo: string;
	frames: Record<string, unknown>[];
}

/** Thrown when a snapshot frame cannot be attributed to a dataframe slot. */
export class DataframeRestoreError extends Error {}

/**
 * PHP `component_common::is_dataframe_entry` — the dual read: the unified
 * dd490 marker OR the legacy pairing-key shape. Kept identical to
 * `tm_record.ts`'s copy of the same predicate (that one strips frames OUT of
 * the main data; this one selects them IN), because the two must partition the
 * snapshot exactly: an entry either restores as main data or as a frame, never
 * both and never neither.
 */
function isFrameEntry(entry: unknown): entry is Record<string, unknown> {
	if (entry === null || typeof entry !== 'object') return false;
	const candidate = entry as { type?: unknown; main_component_tipo?: unknown };
	return candidate.type === DATAFRAME_RELATION_TYPE || candidate.main_component_tipo !== undefined;
}

/**
 * The slot discovery lives in core (`relations/dataframe_slots.ts`) because the
 * save path's CAPTURE half reads it too; re-exported so this module's callers
 * keep one import site and there is one discovery, never two that drift.
 */
export { resolveDataframeSlotTipos };

/**
 * Partition a main component's TM snapshot into the frame set of each slot.
 *
 * - a frame naming `from_component_tipo` is claimed by that slot; the slot is
 *   ADDED to the plan when discovery missed it (the snapshot is authoritative
 *   about which slots carried frames) but only after the model check. A tipo
 *   that is NOT a `component_dataframe` names no slot of this main, so the
 *   frame is inert — PHP's per-slot filter never matches it either (see the
 *   header: refusing here broke a real contract gate);
 * - a legacy frame with no `from_component_tipo` is claimed by
 *   `main_component_tipo === mainTipo` — PHP hands it to the slot it is
 *   currently looping over. With exactly one slot the behaviour is identical;
 *   with NONE, PHP's loop never runs and the frame is inert (matched here);
 *   with SEVERAL, PHP duplicates it into every slot, so the entry is
 *   unattributable and this refuses instead of guessing (duplicating a frame
 *   across slots is the corruption, not a fix). Legacy frames are attributed
 *   only after the whole snapshot is scanned, so a slot that only a
 *   `from_component_tipo` frame revealed still counts as "in play";
 * - discovered slots absent from the snapshot get an EMPTY frame list, which
 *   is what wipes them — guard that with `refuseFramelessWipe` before writing.
 */
export async function planDataframeRestore(
	mainTipo: string,
	snapshot: unknown,
	discoveredSlots: readonly string[],
): Promise<DataframeSlotRestore[]> {
	const plan = new Map<string, Record<string, unknown>[]>();
	for (const slotTipo of discoveredSlots) plan.set(slotTipo, []);
	if (!Array.isArray(snapshot))
		return [...plan].map(([slotTipo, frames]) => ({ slotTipo, frames }));

	const legacyFrames: Record<string, unknown>[] = [];
	for (const entry of snapshot) {
		if (!isFrameEntry(entry)) continue;
		const from = entry.from_component_tipo;
		if (typeof from === 'string' && from !== '') {
			if (!plan.has(from)) {
				// Not a dataframe slot ⇒ names nothing this main can restore into.
				if ((await getModelByTipo(from)) !== 'component_dataframe') continue;
				plan.set(from, []);
			}
			plan.get(from)?.push(entry);
			continue;
		}
		// Legacy frame (pre-migration): claimed by main_component_tipo.
		if (entry.main_component_tipo !== mainTipo) continue;
		legacyFrames.push(entry);
	}

	if (legacyFrames.length > 0) {
		const slots = [...plan.keys()];
		if (slots.length > 1) {
			throw new DataframeRestoreError(
				`time-machine snapshot of '${mainTipo}' carries a legacy frame with no from_component_tipo while ${slots.length} dataframe slots are in play (${slots.join(', ')}); it cannot be attributed to one slot`,
			);
		}
		// slots.length === 0 ⇒ PHP's per-slot loop never runs: the frame is inert.
		if (slots.length === 1) {
			for (const entry of legacyFrames) plan.get(slots[0] as string)?.push(entry);
		}
	}
	return [...plan].map(([slotTipo, frames]) => ({ slotTipo, frames }));
}

/**
 * REFUSE a restore whose plan would DELETE live frames because the snapshot
 * carries none — the interim guard over the unported CAPTURE half.
 *
 * `save_component.ts` builds a main component's TM snapshot from the
 * component's OWN items and never appends the paired slots' frames (PHP's
 * `component_common::get_time_machine_data_to_save` :1580 did) — except an
 * APPEND-import save, which composes them (`appendTmFrames`, 2026-09-27). So
 * every other TM row the TS engine has written for a dataframe-paired main is
 * FRAMELESS, and it is
 * indistinguishable from a PHP-era row whose slots were genuinely empty. Wiping
 * on that ambiguity is the worst outcome an archive can have: the frames exist
 * in no other row (PHP writes no TM row for a slot — `oh115` has 0 against
 * `oh24`'s 172 in the live archive) and the slot-row restore door is itself
 * refused, so the deletion is UNRECOVERABLE. The pre-fix bug merely left the
 * frames STALE.
 *
 * The condition is the narrowest one that closes the hole: refuse only when the
 * snapshot carried NO frame at all for ANY planned slot AND some planned slot
 * currently holds frames. A snapshot that carries frames is demonstrably a
 * frame-aware capture, so its silence about another slot is informative and
 * that slot is emptied (PHP's contract); an already-empty slot has nothing to
 * lose and restores normally.
 *
 * Returns the refusal message, or `null` when the plan is safe to apply.
 * Delete this guard when the capture half lands — and delete it together with
 * the tests that assert the refusal, not by weakening them.
 */
export async function refuseFramelessWipe(
	target: RecordWriteTarget,
	mainTipo: string,
	plan: readonly DataframeSlotRestore[],
): Promise<string | null> {
	if (plan.length === 0) return null;
	if (plan.some((slot) => slot.frames.length > 0)) return null;
	const column = getColumnNameByModel('component_dataframe');
	if (column === null) {
		throw new DataframeRestoreError('no matrix column for model component_dataframe');
	}
	const populated: string[] = [];
	for (const { slotTipo } of plan) {
		const live = await readComponentItems(
			target.table,
			target.sectionTipo,
			target.sectionId,
			column,
			slotTipo,
		);
		if (live.length > 0) populated.push(slotTipo);
	}
	if (populated.length === 0) return null;
	return `time-machine snapshot of '${mainTipo}' carries no dataframe frames while its slot(s) ${populated.join(', ')} hold live frames. The engine does not yet append the slots' frames when it CAPTURES a snapshot (section/record/save_component.ts), so an empty history cannot be told apart from an unrecorded one, and restoring would delete those frames irrecoverably. Refusing (uncovered scope)`;
}

/** The main component a frame pairs with; a frame naming none is the planned main's (legacy). */
function ownedBy(entry: Record<string, unknown>, mainTipo: string): boolean {
	const main = entry.main_component_tipo;
	return typeof main !== 'string' || main === '' || main === mainTipo;
}

/** Order-free structural key of a frame list (sorted canonical JSON of each frame). */
function frameSetKey(frames: readonly unknown[]): string {
	return JSON.stringify(frames.map((frame) => canonicalJson(frame)).sort());
}

/** One slot's LIVE frames (read on the ambient connection — the caller's locked row). */
async function liveSlotFrames(target: RecordWriteTarget, slotTipo: string): Promise<unknown[]> {
	const column = getColumnNameByModel('component_dataframe');
	if (column === null) {
		throw new DataframeRestoreError('no matrix column for model component_dataframe');
	}
	return readComponentItems(target.table, target.sectionTipo, target.sectionId, column, slotTipo);
}

/**
 * What the slots hold AS THE RUN (or this revert) LEFT THEM — the stale-frames
 * guard's evidence that a live slot differing from the snapshot is the run's
 * own doing, not a later edit: per slot, frame lists that are all legitimate
 * live states. Filled by the caller from (a) the frames the BATCH row itself
 * composed (an append save's row, a replace main's row whose legacy envelope
 * wrote frames), (b) the newest slot TM row the RUN wrote (a slot column),
 * (c) the newest slot TM row THIS REVERT wrote (a batch's slot row reverted
 * before its main — id DESC).
 */
export type SlotEvidence = ReadonlyMap<string, readonly (readonly unknown[])[]>;

/** Int-canonical frames of a slot's live value (D6.2: a string-form address is the same frame). */
async function canonicalLiveFrames(
	target: RecordWriteTarget,
	slotTipo: string,
): Promise<unknown[]> {
	const container = { value: await liveSlotFrames(target, slotTipo) };
	await normalizeRestoredSectionIds(container);
	return Array.isArray(container.value) ? container.value : [];
}

/** The entries of `frames` paired with `mainTipo` (frames only — non-objects dropped). */
function ownFrames(frames: readonly unknown[], mainTipo: string): Record<string, unknown>[] {
	return frames.filter(
		(entry): entry is Record<string, unknown> =>
			entry !== null &&
			typeof entry === 'object' &&
			ownedBy(entry as Record<string, unknown>, mainTipo),
	);
}

/**
 * REFUSE a bulk revert whose snapshot's frames went STALE. A composed snapshot
 * (an append save's row, a PHP-era row — `get_time_machine_data_to_save`) holds
 * the slot as it stood at THAT row, and a later frame edit is saved on the SLOT
 * tipo and never writes a main row. Applying such a plan replaced the slot
 * with the old frames: a curator's later edit was silently deleted, with
 * `ok:true`. Applies to EVERY bulk run (not only append runs) — the hole is the
 * snapshot's, whoever wrote it.
 *
 * Per slot, over THIS main's frames only, the plan is safe when the live
 * frames equal the snapshot's (the restore changes nothing in the slot) or ANY
 * state the run or this revert left the slot in (`evidence`, see SlotEvidence)
 * — the change since the snapshot is then the run's own, and undoing it is the
 * revert's job. Anything else means the slot changed after the run: refuse
 * (closed skip reason `frames_changed_since_run`), never guess. Returns the
 * refusal message (LOG-only, slot tipos), or `null` when the plan is safe.
 */
export async function refuseStaleFrames(
	target: RecordWriteTarget,
	mainTipo: string,
	plan: readonly DataframeSlotRestore[],
	evidence: SlotEvidence,
): Promise<string | null> {
	const changed: string[] = [];
	for (const { slotTipo, frames } of plan) {
		const liveKey = frameSetKey(ownFrames(await canonicalLiveFrames(target, slotTipo), mainTipo));
		const accepted = [frames, ...(evidence.get(slotTipo) ?? [])];
		if (accepted.some((state) => frameSetKey(ownFrames(state, mainTipo)) === liveKey)) continue;
		changed.push(slotTipo);
	}
	if (changed.length === 0) return null;
	return `the dataframe slot(s) ${changed.join(', ')} of '${mainTipo}' changed after the run being reverted (their frames match neither the pre-batch snapshot nor any state the run or this revert left them in); restoring the snapshot's frames would delete that later change. Refusing`;
}

/**
 * The plan narrowed to THIS main's frames: each slot keeps, as LIVE, the
 * frames paired with OTHER main components (a slot can serve several) and
 * takes the snapshot's frames of this main. A composed snapshot holds the
 * FULL slot as it stood at its row; replaying other mains' frames from it
 * reverted work the batch never did (every bulk run, like refuseStaleFrames).
 *
 * EXCEPT a slot in `wholeSlots`: its live content is exactly what THIS REVERT
 * already wrote (the batch's slot row, reverted first). Nothing there is
 * anyone else's later work, and that slot row's own history can be blind to
 * what the snapshot knows (a PHP-era slot has no TM rows — its history lives
 * in the main's composed rows — so its revert blanks it): the snapshot is
 * replayed WHOLE, as before the scoping existed. Read on the ambient
 * connection (the caller's locked row).
 */
export async function scopePlanToMain(
	target: RecordWriteTarget,
	mainTipo: string,
	plan: readonly DataframeSlotRestore[],
	wholeSlots: ReadonlySet<string> = new Set(),
): Promise<DataframeSlotRestore[]> {
	const scoped: DataframeSlotRestore[] = [];
	for (const { slotTipo, frames } of plan) {
		if (wholeSlots.has(slotTipo)) {
			scoped.push({ slotTipo, frames: [...frames] });
			continue;
		}
		const others = (await liveSlotFrames(target, slotTipo)).filter(
			(entry): entry is Record<string, unknown> =>
				entry !== null &&
				typeof entry === 'object' &&
				!ownedBy(entry as Record<string, unknown>, mainTipo),
		);
		scoped.push({
			slotTipo,
			frames: [...others, ...frames.filter((entry) => ownedBy(entry, mainTipo))],
		});
	}
	return scoped;
}

/**
 * The planned slots whose WHOLE live content equals the frames THIS REVERT
 * wrote to them (`revertLeft`, slot → the revert's own slot row) — see
 * scopePlanToMain's `wholeSlots`.
 */
export async function slotsLeftByRevert(
	target: RecordWriteTarget,
	plan: readonly DataframeSlotRestore[],
	revertLeft: ReadonlyMap<string, readonly unknown[]>,
): Promise<Set<string>> {
	const whole = new Set<string>();
	for (const { slotTipo } of plan) {
		const left = revertLeft.get(slotTipo);
		if (left === undefined) continue;
		if (frameSetKey(await canonicalLiveFrames(target, slotTipo)) === frameSetKey(left)) {
			whole.add(slotTipo);
		}
	}
	return whole;
}

/**
 * Write the planned frame sets. MUST run inside the caller's transaction and
 * BEFORE the main component write (PHP restores the frames first).
 *
 * `audit` is false on purpose: the main write that follows carries the record's
 * dd197/dd201 modified stamps for the whole restore, exactly as PHP's main
 * `save()` does after the slot saves. No TM row is written for a slot (PHP
 * `$save_tm = false`) — the main's fresh row carries the frames.
 */
export async function applyDataframeRestore(
	target: RecordWriteTarget,
	plan: readonly DataframeSlotRestore[],
): Promise<void> {
	if (plan.length === 0) return;
	const column = getColumnNameByModel('component_dataframe');
	if (column === null) {
		throw new DataframeRestoreError('no matrix column for model component_dataframe');
	}
	for (const { slotTipo, frames } of plan) {
		await persistRecordKeys(
			target,
			[
				{
					column: column as MatrixJsonbColumn,
					key: slotTipo,
					// null REMOVES the key (PHP's emptied slot), never '[]'.
					value: frames.length > 0 ? frames : null,
				},
			],
			false,
		);
		// The restored frames carry explicit ids; raise the slot's counter so a
		// later insert cannot mint a duplicate (PHP raises on every set_data).
		// A duplicate id here would break the id_key pairing itself.
		await absorbComponentItemIds(
			target.table,
			target.sectionTipo,
			target.sectionId,
			slotTipo,
			frames,
		);
	}
}

/**
 * The main component's TM snapshot shape when it carries dataframe slots
 * (PHP `get_time_machine_data_to_save` :1580 — the main's own data followed by
 * each slot's FULL frame set). Composing it here is what makes a restore
 * revertible WITH its frames.
 */
export function composeTimeMachineSnapshot(
	mainData: unknown,
	plan: readonly DataframeSlotRestore[],
): unknown {
	if (plan.length === 0 || !Array.isArray(mainData)) return mainData;
	const frames = plan.flatMap((slot) => slot.frames);
	return frames.length === 0 ? mainData : [...mainData, ...frames];
}
