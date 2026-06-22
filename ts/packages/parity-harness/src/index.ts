export { parseCanonical, JsonParseError, type CNode } from './json_canonical.ts';
export {
  diffJson,
  formatDiffReport,
  DEFAULT_DIFFER_OPTIONS,
  type Diff,
  type DiffKind,
  type DiffResult,
  type DifferOptions,
} from './differ.ts';
export {
  captureResponse,
  configFromEnv,
  type CaptureConfig,
  type CaptureResult,
} from './capture_client.ts';
export { loadCorpus, BOOTSTRAP_CORPUS, AUTHENTICATED_CORPUS, type CorpusCase } from './corpus.ts';
export { login, type AuthSession } from './login.ts';
export {
  openTestDb,
  snapshotRow,
  restoreRow,
  runWriteParity,
  runCreateParity,
  normalizeRowForDiff,
  normalizeCreateRowForDiff,
  normalizeNewActivityRowForDiff,
  canonicalizePayload,
  canonicalizeCreateRow,
  canonicalizeNewActivityRow,
  type WriteHarnessDbConfig,
  type MatrixRowTarget,
  type MatrixPayload,
  type WriteApply,
  type WriteRunResult,
  type CreateApply,
  type CreateRunResult,
} from './write_harness.ts';

/** On-disk golden-master record. `responseBytes` is the raw wire body (parity ground truth). */
export interface GoldenMaster {
  label: string;
  rqo: Record<string, unknown>;
  capturedAt: string;
  status: number;
  contentType: string | null;
  responseBytes: string;
}
