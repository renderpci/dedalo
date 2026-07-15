/**
 * Example page: a Chart.js bar chart of record counts grouped by a categorical column.
 * Demonstrates count_records-style aggregation done client-side over a page of records.
 * Replace with the visualization your data deserves.
 */

import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { listRecords } from '../lib/dedalo';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

export async function renderChart(root: HTMLElement, db: string, table: string): Promise<void> {
  const result = await listRecords(db, table, { limit: 500 });
  const rows = result.data as Record<string, unknown>[];

  // Choose the first low-cardinality string column as the grouping dimension.
  const groupKey = chooseCategorical(rows);
  if (!groupKey) {
    root.textContent = 'No categorical column found to chart. Ask the agent to pick a metric.';
    return;
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[groupKey] ?? '—').slice(0, 40);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  const canvas = document.createElement('canvas');
  root.replaceChildren(canvas);
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(([label]) => label),
      datasets: [{ label: `Records by ${groupKey}`, data: sorted.map(([, count]) => count) }],
    },
    options: { responsive: true },
  });
}

function chooseCategorical(rows: Record<string, unknown>[]): string | null {
  if (rows.length === 0) return null;
  const keys = Object.keys(rows[0]);
  for (const key of keys) {
    const values = new Set(rows.map(row => String(row[key] ?? '')));
    if (values.size > 1 && values.size <= rows.length / 2) return key;
  }
  return keys[0] ?? null;
}
