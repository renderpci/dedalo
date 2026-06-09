import { getAvIndexationFragment } from '../services/av-indexation.service';
import { avIndexationParamsSchema } from '../validators';
import { json } from '../utils/response';
import { ValidationError } from '../errors';

export async function handleAvIndexationFragment(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  const parsed = avIndexationParamsSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ValidationError(message);
  }

  const result = await getAvIndexationFragment(parsed.data);
  return json(result);
}
