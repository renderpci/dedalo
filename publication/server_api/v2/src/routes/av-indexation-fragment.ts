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
