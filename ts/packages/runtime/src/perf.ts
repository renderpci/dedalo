/**
 * Lightweight per-request performance recorder, replacing the PHP
 * performance_monitor checkpoints / hrtime timing. Uses a monotonic clock so it
 * is unaffected by wall-clock changes.
 */
export interface PerfCheckpoint {
  readonly label: string;
  /** Milliseconds since the recorder was created. */
  readonly atMs: number;
}

export class PerfRecorder {
  private readonly startNs: bigint;
  private readonly points: PerfCheckpoint[] = [];

  constructor(startNs: bigint = process.hrtime.bigint()) {
    this.startNs = startNs;
  }

  checkpoint(label: string): void {
    const atMs = Number(process.hrtime.bigint() - this.startNs) / 1e6;
    this.points.push({ label, atMs });
  }

  checkpoints(): readonly PerfCheckpoint[] {
    return this.points;
  }

  /** Total elapsed milliseconds since creation. */
  elapsedMs(): number {
    return Number(process.hrtime.bigint() - this.startNs) / 1e6;
  }
}
