/**
 * Transform run REPORT + dry-run infrastructure (UPDATE_PROCESS Phase 5).
 * Every move_* executor takes a TransformContext and records what it WOULD do
 * (dry run) or DID do (execute) through the same recorder — so the required
 * dry-run mode (the TS improvement over PHP's execute-only transforms, WC-025)
 * reports the exact deltas a real run would apply.
 */

export interface TransformDelta {
	/** 'update' | 'insert' | 'delete' | 'null_component' | 'link_portal' | 'rewrite_locator'. */
	op: string;
	table: string;
	/** Human anchor: '<section_tipo>/<section_id>' or a tipo/lang key. */
	target: string;
	detail?: string;
}

export interface TransformReport {
	result: boolean;
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

	toReport(msgPrefix: string): TransformReport {
		const total = Object.values(this.counts).reduce((sum, n) => sum + n, 0);
		const mode = this.dryRun ? 'DRY RUN' : 'executed';
		return {
			result: this.errors.length === 0,
			dryRun: this.dryRun,
			msg: `${this.errors.length === 0 ? 'OK' : 'Warning'}. ${msgPrefix} — ${mode}: ${total} change(s) across ${Object.keys(this.counts).length} op kind(s)${this.errors.length > 0 ? `, ${this.errors.length} error(s)` : ''}.`,
			errors: this.errors,
			counts: this.counts,
			sample: this.sample,
		};
	}
}
