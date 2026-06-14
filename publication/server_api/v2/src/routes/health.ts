import { dbNames } from '../config';
import { getPool } from '../db/pool';
import { json } from '../utils/response';
import type { HealthResponse } from '../db/types';
import { API_VERSION as VERSION } from '../constants';

export async function handleHealth(_req: Request): Promise<Response> {
  const databases: Record<string, 'connected' | 'error'> = {};
  let allConnected = true;

  await Promise.all(dbNames.map(async (db) => {
    try {
      await getPool(db).query('SELECT 1');
      databases[db] = 'connected';
    } catch {
      databases[db] = 'error';
      allConnected = false;
    }
  }));

  const data: HealthResponse = {
    status: allConnected ? 'ok' : 'error',
    databases,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: VERSION,
  };

  return json(data, allConnected ? 200 : 503);
}
