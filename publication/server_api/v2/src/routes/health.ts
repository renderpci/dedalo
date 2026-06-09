import { getPool } from '../db/pool';
import { json } from '../utils/response';
import type { HealthResponse } from '../db/types';

const VERSION = '2.1.0';

export async function handleHealth(_req: Request): Promise<Response> {
  try {
    const pool = getPool();
    await pool.execute('SELECT 1');

    const data: HealthResponse = {
      status: 'ok',
      database: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: VERSION,
    };

    return json(data);
  } catch (error) {
    const data: HealthResponse = {
      status: 'error',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: VERSION,
    };

    return json(data, 503);
  }
}
