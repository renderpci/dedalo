import { getPool } from '../db/pool';
import type { SchemaResponse, TableInfo } from '../db/types';

export async function getSchema(table?: string): Promise<SchemaResponse> {
  const pool = getPool();

  if (table) {
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM \`${table}\``
    );

    const columnNames = (columns as any[]).map(row => row.COLUMN_NAME);
    const total = (countRows as any[])[0]?.total || 0;

    return {
      tables: [
        {
          name: table,
          columns: columnNames,
          row_count: total,
        },
      ],
    };
  }

  const [tables] = await pool.execute(
    `SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
  );

  const tableInfos: TableInfo[] = [];

  for (const row of tables as any[]) {
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [row.TABLE_NAME]
    );

    tableInfos.push({
      name: row.TABLE_NAME,
      columns: (columns as any[]).map(col => col.COLUMN_NAME),
      row_count: row.TABLE_ROWS || 0,
    });
  }

  return { tables: tableInfos };
}
