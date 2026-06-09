import { search } from '../services/search.service';
import { searchParamsSchema } from '../validators';
import { json } from '../utils/response';
import { ValidationError } from '../errors';

export async function handleSearch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  const parsed = searchParamsSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ValidationError(message);
  }

  const result = await search(parsed.data);
  return json(result);
}
