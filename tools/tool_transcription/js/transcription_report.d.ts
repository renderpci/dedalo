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

/** `null` = the server did not say (an older server), NOT a fault. */
export function model_state_of(
	models: { name?: string; state?: string }[] | undefined | null,
	name: string | null | undefined,
): ModelState | null;

export const REPORT_PHASES: readonly ReportPhase[];
export const REPORT_SEVERITIES: readonly ReportSeverity[];
export function build_report(input: TranscriptionReportInput): TranscriptionReport;
export function classify_failure(
	raw_message: string,
	context?: FailureContext,
): FailureClassification;
