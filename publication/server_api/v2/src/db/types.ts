/**
 * The type vocabulary shared by the db layer, the services and the routes: what a
 * row IS on the way in, and what the API's JSON shapes are on the way out.
 *
 * The published database is not designed here — it is whatever the Dédalo diffusion
 * process wrote — so these types split into two very different kinds:
 *
 * - **Row types** (DbRow, TableRow, and the per-table shapes below) are BELIEFS about
 *   a database this API only reads. Nothing validates a row against them at runtime;
 *   they are casts. A published table that disagrees will not raise a type error, it
 *   will simply hand you a field that is not what the interface promised.
 * - **Response types** (TableInfo, the fragment/locator shapes, BatchResponse,
 *   HealthResponse) are the API's own wire contract, which the handlers do control.
 *   These are the ones a client can rely on.
 */

/**
 * A row as the driver returns it, before any interpretation. Values are `unknown`
 * because a published column can hold anything the diffusion writer put there —
 * including JSON stored in TEXT (parsed later by utils/parse-json) — so the type
 * must not promise more than the driver guarantees. Replaces mysql2's RowDataPacket.
 */
export interface DbRow {
  [key: string]: unknown;
}

/**
 * The convenience view of a row: scalars only. It is the default generic of
 * db/query-builder.executeQuery, which casts DbRow to it.
 *
 * Hazard: this is a claim, not a guarantee, and it is knowingly optimistic —
 * executeQuery runs utils/parse-json over the rows first, so a JSON-in-TEXT column
 * arrives as a real object or array, which no member of this union describes. Code
 * that walks resolved rows works in `Record<string, unknown>` for exactly that reason.
 */
export interface TableRow {
  [key: string]: string | number | boolean | null;
}

// Schema introspection, as served by /{db}/tables. `type` is MariaDB's DATA_TYPE
// string and `row_count` is INFORMATION_SCHEMA's estimate in a listing, an exact
// COUNT(*) for a single table — see services/schema.service.ts.
export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  row_count: number;
}

// Unreferenced: the /tables route returns the array directly under the `data`
// envelope, so this wrapper describes no response the API actually emits.

/**
 * One highlighted excerpt from a text column (`/records/{id}/fragments`).
 *
 * `position` is the character offset of the match in the SOURCE text, not in
 * `text` (which is a window around it, `...`-elided and carrying `<mark>` tags).
 * `page` is the number of the last `[page-n-N]` marker preceding that offset, and
 * is absent — not zero — when no marker precedes it.
 */
export interface TextFragment {
  text: string;
  page?: number;
  position: number;
}

/**
 * Playable media for a fragment. The URLs are built from MEDIA_BASE_URL and the
 * timecodes (`?vbegin=…&vend=…`), and are the EMPTY STRING when the record has no
 * video/image — never null, so a client can concatenate without a guard.
 * `tc_in`/`tc_out` are seconds, both `0` when no `[tc-…]` marker covers the match.
 */
export interface MediaInfo {
  video_url: string;
  image_url: string;
  tc_in: number;
  tc_out: number;
}

export interface Speaker {
  name: string;
  role: string;
}

/**
 * A transcription excerpt with its media window (`/records/{id}/av-fragments`).
 *
 * Note that `speakers` is always `[]` on this endpoint — the search service does
 * not join the speaker table. Speakers are only populated for the locator-based
 * AvIndexationFragment below.
 */
export interface AvFragment {
  transcription: string;
  media: MediaInfo;
  speakers: Speaker[];
}

/**
 * A Dédalo locator: the engine's own way of pointing at a piece of a record
 * (section + component + tag), reused here as the query for
 * `/av-indexation-fragment`.
 *
 * Only `section_id` identifies the row; the rest narrow WHAT of it is wanted, and
 * `component_tipo` + `tag_id` together are what the thesaurus-term lookup matches
 * on — omit either and the fragment comes back with an empty `terms` list.
 */
export interface Locator {
  section_id: number;
  section_tipo?: string;
  component_tipo?: string;
  tag_id?: number;
  tc_in?: number;
  tc_out?: number;
}

// The locator is echoed back so a client holding several in-flight requests can
// pair each answer with the question it asked.
export interface AvIndexationFragment {
  locator: Locator;
  transcription: string;
  media: MediaInfo;
  speakers: Speaker[];
  terms: Array<{ term_id: string; term: string }>;
}

/**
 * One sub-query's outcome inside a /batch response.
 *
 * A batch is 200 as a whole even when members fail: `status` is the sub-query's own
 * code and exactly one of `data` (2xx) or `problem` (an RFC 9457 body) is present.
 * `id` is the caller's own label (unique within the batch), echoed back so results
 * can be correlated without depending on position.
 */
export interface BatchResult {
  id: string;
  status: number;
  data?: unknown;
  problem?: unknown;
}

export interface BatchResponse {
  results: BatchResult[];
}

// The /health body. `status: 'error'` (and the 503 that carries it) means at least
// one database in `databases` failed its probe — which one is the point of the map.
export interface HealthResponse {
  status: 'ok' | 'error';
  databases: Record<string, 'connected' | 'error'>;
  uptime: number;
  timestamp: string;
  version: string;
}
