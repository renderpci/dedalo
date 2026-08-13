/**
 * Types for `transcription_report.js` — the report shape shared by the tool, the
 * browser worker and the bun:test gate.
 */

export type ReportPhase = 'preflight' | 'audio' | 'model' | 'transcribe' | 'speakers' | 'done';
export type ReportSeverity = 'info' | 'progress' | 'warning' | 'error';

export interface TranscriptionReport {
	phase: ReportPhase;
	severity: ReportSeverity;
	message: string;
	cause: string;
	action: string;
	detail: string;
}

export interface FailureClassification {
	key: string;
	phase: ReportPhase;
	severity: 'error';
	message_key: string;
	cause_key: string;
	action_key: string;
	detail: string;
}

export interface FailureContext {
	phase?: string;
	model?: string;
	device?: string;
	log?: string;
}

/**
 * build_report's input is untrusted/unvalidated at the type level on purpose:
 * the whole point of the function is to normalize a phase/severity that may not
 * be one of the known values (see the RULES table's runtime `.includes` checks).
 * Typing this as `Partial<TranscriptionReport>` would make the fallback branch
 * type-unreachable — a caller could never legally pass the "nonsense" that the
 * function exists to survive.
 */
export interface TranscriptionReportInput {
	phase?: string;
	severity?: string;
	message?: string;
	cause?: string;
	action?: string;
	detail?: string;
}

export type ModelState = 'ready' | 'unverified' | 'incomplete' | 'damaged' | 'missing';

/**
 * What one model state MEANS. `usable` is the run gate; `message_key`/`cause_key`
 * are absent for the two usable states because there is nothing to report.
 */
export interface ModelStateInfo {
	state_key: string;
	usable: boolean;
	message_key?: string;
	cause_key?: string;
	action_key: string | null;
}

export const MODEL_STATES: Readonly<Record<ModelState, ModelStateInfo>>;

/**
 * `null` = the server did not say (an older server, or no entry for this model) —
 * NOT a fault. The return type is a bare `string` on purpose: an UNRECOGNISED state
 * comes back verbatim rather than being flattened away, because these states cross a
 * wire and a server one version ahead is how an unknown word arrives. Callers must
 * treat a `MODEL_STATES` miss as "cannot interpret", never as "nothing to say".
 */
export function model_state_of(
	// entries are guarded one by one: a sparse/dirty array from the wire is data,
	// not a crash
	models: ({ name?: string; state?: string } | null | undefined)[] | undefined | null,
	name: string | null | undefined,
): ModelState | (string & {}) | null;

export const REPORT_PHASES: readonly ReportPhase[];
export const REPORT_SEVERITIES: readonly ReportSeverity[];
export function build_report(input: TranscriptionReportInput): TranscriptionReport;
export function classify_failure(
	raw_message: string,
	context?: FailureContext,
): FailureClassification;

/**
 * THE DEGRADED-ANSWER CONTRACT of get_model_sources.
 *
 * ABSENT and EMPTY are different answers: an absent field means the server
 * CANNOT TELL (every consumer keeps its permissive behaviour and says the state
 * is unknown), while `installed: []` / `models: []` / `diarization: null` are
 * real answers about a readable catalog.
 */
export function server_answered(
	sources: Record<string, unknown> | null | undefined,
	field: string,
): boolean;

/** 'yes' | 'no' | 'unknown' — 'unknown' must never be read as 'no'. */
export function installed_answer(
	sources: Record<string, unknown> | null | undefined,
	name: string | null | undefined,
): 'yes' | 'no' | 'unknown';
