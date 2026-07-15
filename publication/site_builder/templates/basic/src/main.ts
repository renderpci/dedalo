/**
 * Entry point + tiny hash router. This is a starting point, not a finished site — the
 * agent is expected to reshape it freely. It exists so the first `bun run build` produces
 * something that renders and proves the API connection works.
 */

import { listDatabases, listTables } from './lib/dedalo';
import { renderRecords } from './pages/records';
import { renderMap } from './pages/map';
import { renderChart } from './pages/chart';

const app = document.getElementById('app') as HTMLElement;

async function route(): Promise<void> {
  const hash = location.hash.replace('#', '') || 'records';
  app.textContent = 'Loading…';
  try {
    // Discover the first database + table so the examples work against any publication.
    const dbs = await listDatabases();
    const db = dbs.data[0]?.name;
    if (!db) {
      app.textContent = 'No databases are published by this API yet.';
      return;
    }
    const tables = await listTables(db);
    const table = tables.data[0]?.name;
    if (!table) {
      app.textContent = `Database "${db}" has no tables yet.`;
      return;
    }

    if (hash === 'map') await renderMap(app, db, table);
    else if (hash === 'chart') await renderChart(app, db, table);
    else await renderRecords(app, db, table);
  } catch (error) {
    app.textContent = `Could not load data: ${(error as Error).message}`;
  }
}

window.addEventListener('hashchange', route);
route();
