import { getSchema } from '../services/schema.service';

export async function handleSchema(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const table = url.searchParams.get('table') || undefined;

  const result = await getSchema(table);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
