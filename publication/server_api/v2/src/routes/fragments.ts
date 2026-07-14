/**
 * Fragment extraction for ONE record — the two "show me the passage" routes:
 *
 *   GET …/records/:id/fragments     — text excerpts, with a page number
 *   GET …/records/:id/av-fragments  — transcription excerpts, with timecodes
 *                                     and playable media URLs
 *
 * These are not search: the record is already chosen, and `terms` is matched
 * LITERALLY and case-insensitively inside its text — no boolean-mode operators,
 * unlike `?q=` on the search route. They exist because the interesting Dédalo
 * texts (books, theses, interview transcriptions) are far too large to ship to
 * a client that only wants the sentence around a word.
 *
 * The two differ in what they know how to read out of the text:
 *   - text fragments read `[page-n-X]` markers, and so can say WHICH PAGE a hit
 *     falls on. The column is a parameter, because a publication decides which
 *     column holds its long text.
 *   - AV fragments read `[tc-in-out]` timecode markers, and so can turn a hit
 *     into a MEDIA WINDOW (`…/video.mp4?vbegin=…&vend=…`). There is deliberately
 *     no `column` parameter: the source column and the media table it joins are
 *     server config (the AV_* keys), not a client's to choose.
 *
 * Neither route paginates — every extracted fragment is returned inline. What
 * bounds them instead is extraction itself: max terms, max term length, and a
 * cap on how much of the text is scanned (see utils/fragments), plus the
 * per-request `max_characters`/`max_occurrences` limits the schemas clamp.
 */

import { assertKnownDb } from '../db/pool';
import { textFragments, avFragments } from '../services/search.service';
import { fragmentsQuerySchema, avFragmentsQuerySchema } from '../validators';
// The same id parser the record routes use: a fragment addresses a record, so a
// malformed id must fail identically here and there.
import { parseRecordId } from './records';
import { json } from '../utils/response';

export async function handleTextFragments(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const id = parseRecordId(params.id);
  const query = fragmentsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const fragments = await textFragments(db, params.table, id, query);

  return json({
    data: fragments,
    meta: { section_id: id, terms: query.terms },
  });
}

export async function handleAvFragments(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const id = parseRecordId(params.id);
  const query = avFragmentsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const fragments = await avFragments(db, params.table, id, query);

  return json({
    data: fragments,
    meta: { section_id: id, terms: query.terms },
  });
}
