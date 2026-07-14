/**
 * `GET /:db/av-indexation-fragment` — resolve a thesaurus INDEXATION LOCATOR
 * into the audiovisual fragment it points at.
 *
 * A locator is the pointer an indexer left on a moment of an interview
 * (section_id + component_tipo + tag_id + a timecode window). This route takes
 * one back and returns what it denotes: the transcription slice between those
 * timecodes, the media URLs for that window, the speaker, and the thesaurus
 * terms attached to the tag. It is the read side of Dédalo's indexation.
 *
 * Note the route shape: it hangs directly off `/:db`, with NO `tables/:table`
 * segment. That is not an omission — the fragment is a JOIN across the
 * interview record, its media and its speaker table, so the tables are fixed by
 * server config (the AV_* keys), not chosen per request. The whole locator
 * therefore arrives as query parameters, and the response `data` is a single
 * object rather than the usual array.
 */

import { assertKnownDb } from '../db/pool';
import { getAvIndexationFragment } from '../services/av-indexation.service';
import { avIndexationParamsSchema } from '../validators';
import { json } from '../utils/response';

export async function handleAvIndexationFragment(_req: Request, params: Record<string, string>, url: URL): Promise<Response> {
  const db = assertKnownDb(params.db);
  const locator = avIndexationParamsSchema.parse(Object.fromEntries(url.searchParams));

  const result = await getAvIndexationFragment(db, locator);
  return json({ data: result });
}
