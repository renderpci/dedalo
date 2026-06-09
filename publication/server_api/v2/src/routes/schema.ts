import { getSchema } from '../services/schema.service';
import { schemaParamsSchema } from '../validators';
import { json } from '../utils/response';
import { ValidationError } from '../errors';

export async function handleSchema(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  const parsed = schemaParamsSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ValidationError(message);
  }

  const result = await getSchema(parsed.data.table);
  return json(result);
}
