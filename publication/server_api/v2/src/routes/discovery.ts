import { config, dbNames } from '../config';
import { json } from '../utils/response';
import { API_VERSION } from '../constants';

export async function handleApiIndex(_req: Request): Promise<Response> {
  const base = config.BASE_PATH;

  return json({
    name: 'Dédalo Publication API',
    version: API_VERSION,
    links: {
      databases: `${base}/databases`,
      docs: `${base}/docs`,
      openapi: `${base}/openapi.yaml`,
      health: `${base}/health`,
    },
  });
}

export async function handleDatabases(_req: Request): Promise<Response> {
  const base = config.BASE_PATH;

  return json({
    data: dbNames.map(name => ({
      name,
      links: {
        tables: `${base}/${name}/tables`,
      },
    })),
  });
}
