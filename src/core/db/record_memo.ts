/**
 * READ-SCOPED MATRIX ROW MEMO — one row is fetched from the DB once per
 * section read, however many components ask for it.
 *
 * WHY IT EXISTS. `readMatrixRecord` fetches a WHOLE row (every JSONB column
 * plus its `::text` twin — the heaviest projection in the codebase) to answer a
 * question about ONE component. That is fine once; the component_info widgets
 * do it once PER COMPONENT. A `component_state` instance declaring 8 paths over
 * the same related record (oh28 does) re-reads that one row 8 times, and a
 * media_icons widget on the same list re-reads it again. Measured on the oh1
 * list page (10 rows): 145 row reads for 27 distinct rows — 81% pure repeat —
 * and 328ms of the 371ms spent in SQL. The waste is linear in page size, so it
 * grows with both the archive and the widget config.
 *
 * SCOPE IS THE POINT. The memo lives in an AsyncLocalStorage scope opened by
 * `readSection`, NOT in a module-level cache:
 *
 *   - A read is a single point-in-time view (PHP served these off one
 *     per-request connection with exactly the same semantics), so reusing a row
 *     inside one read cannot serve a value the same read did not already see.
 *   - The scope dies with the read. There is no cross-request bleed and no
 *     stale-after-edit window, so this needs no invalidation wiring and is NOT
 *     a `cache_factory` cache — it is request state, which is the answer
 *     `module_state_tripwire` asks for.
 *   - It is deliberately NOT opened around the write path. Save/delete run
 *     inside `withTransaction` and legitimately re-read a row they just
 *     modified; memoizing there would hand back the pre-write row. Nothing
 *     opens this scope for a mutation, and `memoizedReadMatrixRecord` degrades
 *     to a direct read whenever no scope is active.
 *
 * The memo stores the in-flight PROMISE, not the resolved row: concurrent
 * component emits for the same row collapse onto one query instead of racing
 * to issue N identical ones before the first resolves.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { type MatrixRecord, readMatrixRecord } from './matrix.ts';

type RecordMemo = Map<string, Promise<MatrixRecord | null>>;

/**
 * Bound on rows pinned per read — the same posture, and the same number, as the
 * per-read cache this one feeds (`section/record_loader.ts` RECORD_CACHE_LIMIT).
 * Not duplicated by import: that module sits above db/ and importing upward
 * would put a cycle through a leaf.
 *
 * Overflow CLEARS rather than evicts one entry: a cleared memo only costs
 * re-reads, never correctness, and wholesale clearing is what the sibling cache
 * does. Measured for scale — a 1000-row rsc170 list pins ~1035 rows, so a real
 * page is two orders of magnitude below this.
 */
const RECORD_MEMO_LIMIT = 8000;

const recordMemoStore = new AsyncLocalStorage<RecordMemo>();

/**
 * Run `fn` with a row memo active. An ambient memo is JOINED, never shadowed —
 * a nested read (a portal expanding inside a list row) shares the outer read's
 * rows, which is both correct (same point-in-time view) and where much of the
 * repetition lives.
 */
export function runWithRecordMemo<T>(fn: () => T): T {
	const ambient = recordMemoStore.getStore();
	if (ambient !== undefined) return fn();
	return recordMemoStore.run(new Map(), fn);
}

/**
 * `readMatrixRecord`, answered from the read-scoped memo when one is active.
 * With no active scope this is a plain pass-through — callers outside a read
 * (every write path) keep reading straight from the DB.
 *
 * A FAILED read is memoized as its rejection: within one read, one row has one
 * outcome, and the first caller's error is the read's error. Nothing retries a
 * row mid-read, so this never converts a transient failure into a sticky one
 * beyond the read that hit it.
 */
export function memoizedReadMatrixRecord(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
): Promise<MatrixRecord | null> {
	const memo = recordMemoStore.getStore();
	if (memo === undefined) return readMatrixRecord(tableName, sectionTipo, sectionId);

	const key = `${tableName}|${sectionTipo}|${sectionId}`;
	const pending = memo.get(key);
	if (pending !== undefined) return pending;

	const started = readMatrixRecord(tableName, sectionTipo, sectionId);
	if (memo.size >= RECORD_MEMO_LIMIT) memo.clear();
	memo.set(key, started);
	return started;
}

/**
 * Seed a row the caller has ALREADY loaded (a `readMatrixRecordBatch` result)
 * into the active memo, so the lazy per-component readers hit it instead of
 * re-fetching it one round-trip at a time.
 *
 * This is what connects `section/record_loader.ts`'s page-level prefetch to the
 * widget path: the loader already batches every relation target on the page
 * into one `ANY()` query per section, but it keeps them in its own per-read
 * cache, which `readWidgetComponentData` has no handle on. Without this the
 * widgets re-read rows the page had already fetched — 26 serialized round-trips
 * on the oh1 list (rows emit sequentially, so they do not overlap).
 *
 * A `null` record is seeded too: within one read a definitive miss must not be
 * re-queried, matching the loader's own null-caching contract.
 *
 * No-op when no memo is active.
 */
export function seedRecordMemo(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
	record: MatrixRecord | null,
): void {
	const memo = recordMemoStore.getStore();
	if (memo === undefined) return;
	const key = `${tableName}|${sectionTipo}|${sectionId}`;
	// An in-flight read for this row wins: overwriting it would hand two
	// callers two different objects for one row inside a single read.
	if (memo.has(key)) return;
	if (memo.size >= RECORD_MEMO_LIMIT) memo.clear();
	memo.set(key, Promise.resolve(record));
}

/** True when a read-scoped memo is active (test/introspection use). */
export function hasActiveRecordMemo(): boolean {
	return recordMemoStore.getStore() !== undefined;
}
