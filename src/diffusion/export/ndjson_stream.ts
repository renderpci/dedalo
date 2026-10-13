/**
 * NDJSON streaming primitive for export (S2-34): wrap an async generator of
 * protocol objects as a PULL-BASED ReadableStream — one line is JSON-encoded
 * and enqueued per `pull`, so bytes leave the server AS each line is produced
 * rather than being buffered whole (PHP stream_export_grid). A generator that
 * throws mid-stream errors the stream (the client sees a truncated body with
 * no 'end' line — the documented abort signal).
 *
 * Shared by both export writers: tools/tool_export/server/tool_export.ts
 * (legacy) and src/diffusion/export/grid.ts (unified). `label` only tags the
 * abort log line.
 */
export function ndjsonStream(
	lines: AsyncGenerator<Record<string, unknown>>,
	label = 'export',
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	// Set by cancel(): a pull that was in flight when the body was cancelled
	// settles into a stream that is already closed — it must touch neither the
	// controller nor the abort log (a reader that went away is not an abort).
	let cancelled = false;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const next = await lines.next();
				if (cancelled) return;
				if (next.done === true) {
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
			} catch (error) {
				if (cancelled) return;
				console.error(`[${label}] ndjson stream aborted:`, error);
				controller.error(error);
			}
		},
		// Awaited: the generator owns the export's selection cursor (a pooled
		// connection — PERF-1), so a cancelled body resolves only once it is back.
		async cancel() {
			cancelled = true;
			await lines.return(undefined as never);
		},
	});
}
