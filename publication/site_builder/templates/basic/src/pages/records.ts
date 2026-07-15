/**
 * Example page: a paginated table of records. Demonstrates listRecords() and the
 * envelope shape. Replace with whatever presentation your site needs.
 */

import { listRecords } from '../lib/dedalo';

export async function renderRecords(root: HTMLElement, db: string, table: string): Promise<void> {
  const result = await listRecords(db, table, { limit: 25 });
  const rows = result.data;

  if (rows.length === 0) {
    root.textContent = `No records in ${table}.`;
    return;
  }

  // Columns from the union of the first few rows' keys (published rows can be sparse).
  const columns = Array.from(new Set(rows.slice(0, 5).flatMap(row => Object.keys(row)))).slice(0, 8);

  const table_el = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table_el.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const col of columns) {
      const td = document.createElement('td');
      const value = (row as Record<string, unknown>)[col];
      td.textContent = value == null ? '' : String(value).slice(0, 120);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table_el.appendChild(tbody);

  root.replaceChildren(table_el);
}
