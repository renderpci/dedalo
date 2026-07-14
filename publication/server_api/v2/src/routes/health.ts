/**
 * `GET /health` — the liveness/readiness probe a load balancer polls.
 *
 * Health here means "can this process actually serve data", so it is not a bare
 * "the HTTP server answered": it opens/uses a pooled connection to EVERY
 * configured database and runs `SELECT 1`. A process whose DB is unreachable is
 * useless to a client, and must be taken out of rotation — hence 503 when any
 * database fails, 200 only when all connect.
 *
 * Because it is a probe, it is the one GET the cache layer refuses to cache
 * (middleware/http-cache excludes `/health` by path): a stale "ok" served from
 * an ETag would defeat the entire point of asking.
 */

import { dbNames } from '../config';
import { dbExecute } from '../db/pool';
import { json } from '../utils/response';
import type { HealthResponse } from '../db/types';
import { API_VERSION as VERSION } from '../constants';

export async function handleHealth(_req: Request): Promise<Response> {
  const databases: Record<string, 'connected' | 'error'> = {};
  let allConnected = true;

  // Probe all databases concurrently, and swallow each failure into a per-db
  // status: a probe must always answer with a diagnosis. Letting the error
  // propagate would produce a 500 that says only "something broke", where the
  // operator needs to know WHICH database is down.
  await Promise.all(dbNames.map(async (db) => {
    try {
      await dbExecute(db, 'SELECT 1', []);
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
