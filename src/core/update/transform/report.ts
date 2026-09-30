/**
 * Transform run REPORT + dry-run infrastructure (UPDATE_PROCESS Phase 5).
 * Every move_* executor takes a TransformContext and records what it WOULD do
 * (dry run) or DID do (execute) through the same recorder — so the required
 * dry-run mode (the TS improvement over PHP's execute-only transforms, WC-025)
 * reports the exact deltas a real run would apply.
 */

export interface TransformDelta {
	/**
	 * 'update' | 'insert' | 'delete' | 'null_component' | 'link_portal' |
	 * 'rewrite_locator' | 'advance_counter' (move_locator raises the destination
	 * matrix_counter — D1) | 'refuse_collision' (move_lang leaves a row whose
	 * target lang is already populated untouched — D5).
	 */
	op: string;
	table: string;
	/** Human anchor: '<section_tipo>/<section_id>' or a tipo/lang key. */
	target: string;
	detail?: string;
}

export interface TransformReport {
	/** A REPORT flag (did every file transform cleanly), never an envelope's `result`. */
	ok: boolean;
	dryRun: boolean;
	msg: string;
	errors: string[];
	/** Per-op counts (e.g. {update: 12, insert: 3}). */
	counts: Record<string, number>;
	/** A bounded sample of the deltas (never the full set — logs stay readable). */
	sample: TransformDelta[];
}

const SAMPLE_CAP = 200;

/** Records deltas; in dry-run mode the executor SKIPS the actual write. */
export class TransformRecorder {
	readonly dryRun: boolean;
	readonly counts: Record<string, number> = {};
	readonly sample: TransformDelta[] = [];
	readonly errors: string[] = [];

	constructor(dryRun: boolean) {
		this.dryRun = dryRun;
	}

	record(delta: TransformDelta): void {
		this.counts[delta.op] = (this.counts[delta.op] ?? 0) + 1;
		if (this.sample.length < SAMPLE_CAP) this.sample.push(delta);
	}

	error(message: string): void {
		this.errors.push(message);
	}

	/**
	 * A fresh, EMPTY recorder in the same mode — one executed definition file's
	 * attempt records into it, and only a COMMITTED attempt is merged back
	 * (absorb), so a rolled-back attempt never reports writes that did not persist.
	 */
	fork(): TransformRecorder {
		return new TransformRecorder(this.dryRun);
	}

	/** Merge a committed attempt's counts, sample (still capped) and errors into this run. */
	absorb(attempt: TransformRecorder): void {
		for (const [op, count] of Object.entries(attempt.counts)) {
			this.counts[op] = (this.counts[op] ?? 0) + count;
		}
		for (const delta of attempt.sample) {
			if (this.sample.length >= SAMPLE_CAP) break;
			this.sample.push(delta);
		}
		this.errors.push(...attempt.errors);
	}

	toReport(msgPrefix: string): TransformReport {
		const total = Object.values(this.counts).reduce((sum, n) => sum + n, 0);
		const mode = this.dryRun ? 'DRY RUN' : 'executed';
		return {
			ok: this.errors.length === 0,
			dryRun: this.dryRun,
			msg: `${this.errors.length === 0 ? 'OK' : 'Warning'}. ${msgPrefix} — ${mode}: ${total} change(s) across ${Object.keys(this.counts).length} op kind(s)${this.errors.length > 0 ? `, ${this.errors.length} error(s)` : ''}.`,
			errors: this.errors,
			counts: this.counts,
			sample: this.sample,
		};
	}
}
