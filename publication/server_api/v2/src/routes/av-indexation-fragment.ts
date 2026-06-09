import { getAvIndexationFragment } from '../services/av-indexation.service';
import { HttpError } from '../middleware/error-handler';

export async function handleAvIndexationFragment(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  const section_id = params.get('section_id');
  const section_tipo = params.get('section_tipo') || undefined;
  const component_tipo = params.get('component_tipo') || undefined;
  const tag_id = params.get('tag_id') ? parseInt(params.get('tag_id')!, 10) : undefined;
  const tc_in = params.get('tc_in') ? parseFloat(params.get('tc_in')!) : undefined;
  const tc_out = params.get('tc_out') ? parseFloat(params.get('tc_out')!) : undefined;

  if (!section_id) {
    throw new HttpError(400, 'Missing required parameter: section_id');
  }

  const result = await getAvIndexationFragment({
    section_id: parseInt(section_id, 10),
    section_tipo,
    component_tipo,
    tag_id,
    tc_in,
    tc_out,
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
