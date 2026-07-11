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
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const next = await lines.next();
				if (next.done === true) {
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
			} catch (error) {
				console.error(`[${label}] ndjson stream aborted:`, error);
				controller.error(error);
			}
		},
		cancel() {
			void lines.return(undefined as never);
		},
	});
}
