/**
 * The Server-Sent Events responder for a session's event stream.
 *
 * Contract: replay the durable log from the client's cursor (`?after=N`), then live-tail
 * new events, and close when the running turn ends (a turn_end body) — the client opens a
 * fresh stream for the next message. A connection that arrives after the turn already
 * finished simply replays history and closes.
 *
 * Ordering/dedup: the manager appends every event to the JSONL log BEFORE fanning it to
 * subscribers, and seq is monotonic. So the handler subscribes FIRST (buffering live
 * events), replays the file up to the highest seq it has, then flushes buffered live
 * events with a greater seq — no event is dropped or duplicated across the replay/tail
 * seam.
 *
 * Heartbeats (`: ping`) keep the proxy from idling the connection; the engine relays this
 * stream to the browser with buffering disabled.
 */

import { replayEvents } from './store';
import { subscribe, isTurnRunning } from './manager';
import type { StoredEvent } from './events';

const HEARTBEAT_MS = 15_000;

export function sessionEventStream(slug: string, sessionId: string, afterSeq: number): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSeq = afterSeq;
      const buffered: StoredEvent[] = [];
      let replaying = true;

      const send = (event: StoredEvent): void => {
        if (closed) return;
        controller.enqueue(encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`));
        lastSeq = event.seq;
      };

      const close = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Subscribe first so nothing that arrives during replay is missed; buffer until the
      // backlog is flushed, then deliver in seq order.
      const unsubscribe = subscribe(sessionId, event => {
        if (replaying) {
          buffered.push(event);
          return;
        }
        if (event.seq > lastSeq) send(event);
        if (event.body.type === 'turn_end') close();
      });

      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': ping\n\n'));
      }, HEARTBEAT_MS);

      // Replay the durable backlog, then flush buffered live events, then tail.
      void (async () => {
        try {
          const backlog = await replayEvents(slug, sessionId, afterSeq);
          for (const event of backlog) {
            send(event);
            if (event.body.type === 'turn_end') {
              // History already contains a terminal marker and no turn is running now:
              // this is a completed session being re-read. Close after draining backlog.
              if (!isTurnRunning(sessionId)) {
                // keep draining remaining backlog, then close below
              }
            }
          }
          replaying = false;

          // Flush anything that arrived during replay (dedup by seq).
          for (const event of buffered) {
            if (event.seq > lastSeq) send(event);
            if (event.body.type === 'turn_end') {
              close();
              return;
            }
          }

          // If no turn is running, there is nothing more to tail — close.
          if (!isTurnRunning(sessionId)) close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                code: 'replay_failed',
                message: error instanceof Error ? error.message : String(error),
              })}\n\n`,
            ),
          );
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // The engine relays this to the browser; keep the proxy from buffering it.
      'X-Accel-Buffering': 'no',
    },
  });
}
