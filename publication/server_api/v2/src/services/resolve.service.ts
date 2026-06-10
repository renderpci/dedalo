import { dbExecute } from '../db/pool';
import { validateTableName, validateColumnName } from '../db/query-builder';
import { parseJsonStrings } from '../utils/parse-json';
import { ValidationError } from '../errors';
import { COLUMNS, PUBLICATION_SCHEMA_TABLE, PUBLICATION_SCHEMA_ID, MAX_RESOLVE_DEPTH, MAX_RESOLVE_ROWS } from '../constants';
import { TTLCache } from '../db/schema-cache';
import type { RowDataPacket } from 'mysql2/promise';

export type RelationMap = Record<string, string>;
export type InverseRelationMap = Record<string, string>;

const schemaCache = new TTLCache<InverseRelationMap>(30);

export async function getPublicationSchema(db: string): Promise<InverseRelationMap> {
  const cacheKey = `${db}:dd_relations`;
  const cached = schemaCache.get(cacheKey);
  if (cached) return cached;

  validateTableName(PUBLICATION_SCHEMA_TABLE);

  const sql = `SELECT data FROM \`${PUBLICATION_SCHEMA_TABLE}\` WHERE id = ?`;
  const rows = await dbExecute<RowDataPacket[]>(db, sql, [PUBLICATION_SCHEMA_ID]);

  const row = (rows as Record<string, unknown>[])[0];
  if (!row || !row.data) {
    throw new ValidationError('publication_schema table not found or empty');
  }

  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  const ddRelations = data?.dd_relations as InverseRelationMap | undefined;
  if (!ddRelations || typeof ddRelations !== 'object') {
    throw new ValidationError('dd_relations mapping not found in publication_schema');
  }

  schemaCache.set(cacheKey, ddRelations);
  return ddRelations;
}

function parseRelationMap(value: string): RelationMap {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ValidationError('resolve_relations must be a JSON object like {"image":"image"}');
    }
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val !== 'string') {
        throw new ValidationError(`resolve_relations value for "${key}" must be a string, got ${typeof val}`);
      }
    }
    return parsed as RelationMap;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('resolve_relations must be valid JSON');
  }
}

function parseInverseRelationMap(value: string): InverseRelationMap {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ValidationError('resolve_inverse_relations must be a JSON object like {"rsc170":"images"}');
    }
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val !== 'string') {
        throw new ValidationError(`resolve_inverse_relations value for "${key}" must be a string, got ${typeof val}`);
      }
    }
    return parsed as InverseRelationMap;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('resolve_inverse_relations must be valid JSON');
  }
}

export async function resolveRelations(
  db: string,
  rows: Record<string, unknown>[],
  relationMapRaw: string,
  depth: number = 0,
): Promise<Record<string, unknown>[]> {
  const relationMap = parseRelationMap(relationMapRaw);

  const topLevelKeys: RelationMap = {};
  const deepKeys: Record<string, string> = {};

  for (const [key, target] of Object.entries(relationMap)) {
    if (key.includes('.')) {
      const [column, deepField] = key.split('.', 2);
      deepKeys[key] = target;
      if (!topLevelKeys[column]) {
        topLevelKeys[column] = column;
      }
    } else {
      topLevelKeys[key] = target;
    }
  }

  if (depth >= MAX_RESOLVE_DEPTH) {
    return rows;
  }

  const result = [...rows];

  for (const row of result) {
    for (const [column, target] of Object.entries(topLevelKeys)) {
      if (!(column in row)) continue;
      if (column === '_resolved_from') continue;

      const cellValue = row[column];

      try {
        row[column] = await resolveColumn(
          db,
          cellValue,
          target,
          column,
          deepKeys,
          depth,
        );
      } catch {
        // skip unresolvable columns, leave original value
      }
    }
  }

  return result;
}

async function resolveColumn(
  db: string,
  cellValue: unknown,
  target: string,
  column: string,
  deepKeys: Record<string, string>,
  depth: number,
): Promise<unknown> {
  // auto case: parse the cell value to determine target table dynamically
  if (target === 'auto') {
    if (typeof cellValue !== 'string') return cellValue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(cellValue);
    } catch {
      return cellValue;
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (obj.table && obj.section_id) {
        const table = String(obj.table);
        const sectionId = Number(obj.section_id);
        validateTableName(table);
        return fetchRows(db, table, [sectionId]);
      }
    }
    return cellValue;
  }

  // standard case: cell value is a JSON array of section_ids
  let sectionIds: (number | string)[];

  if (typeof cellValue === 'string') {
    try {
      const parsed = JSON.parse(cellValue);
      if (Array.isArray(parsed)) {
        sectionIds = parsed.map(item => {
          if (typeof item === 'object' && item !== null && 'section_id' in item) {
            return (item as Record<string, unknown>).section_id as number;
          }
          return Number(item);
        }).filter(n => !isNaN(n));
      } else {
        return cellValue;
      }
    } catch {
      return cellValue;
    }
  } else if (Array.isArray(cellValue)) {
    sectionIds = cellValue.map(item => {
      if (typeof item === 'object' && item !== null && 'section_id' in (item as object)) {
        return (item as Record<string, unknown>).section_id as number;
      }
      return Number(item);
    }).filter(n => !isNaN(n));
  } else {
    return cellValue;
  }

  if (sectionIds.length === 0) return cellValue;

  // Dot notation: "table.column" means match against a non-section_id column
  let matchColumn: string = COLUMNS.SECTION_ID;
  let table = target;

  if (target.includes('.')) {
    const [tbl, col] = target.split('.', 2);
    table = tbl;
    matchColumn = col;
    validateColumnName(matchColumn);
  }

  validateTableName(table);

  if (sectionIds.length > MAX_RESOLVE_ROWS) {
    sectionIds = sectionIds.slice(0, MAX_RESOLVE_ROWS);
  }

  const resolved = await fetchRowsByIds(db, table, matchColumn, sectionIds);

  // Deep resolution: check if there are nested resolve keys for this column
  const childDeepKeys: Record<string, string> = {};
  for (const [deepKey, deepTarget] of Object.entries(deepKeys)) {
    const prefix = `${column}.`;
    if (deepKey.startsWith(prefix)) {
      const childField = deepKey.slice(prefix.length);
      childDeepKeys[childField] = deepTarget;
    }
  }

  if (Object.keys(childDeepKeys).length > 0 && depth < MAX_RESOLVE_DEPTH - 1) {
    const childRelationRaw = JSON.stringify(childDeepKeys);
    for (const resolvedRow of resolved) {
      for (const [childField, childTarget] of Object.entries(childDeepKeys)) {
        if (!(childField in resolvedRow)) continue;
        try {
          resolvedRow[childField] = await resolveColumn(
            db,
            resolvedRow[childField],
            childTarget,
            childField,
            {},
            depth + 1,
          );
        } catch {
          // skip unresolvable child columns
        }
      }
    }
  }

  return resolved;
}

async function fetchRowsByIds(
  db: string,
  table: string,
  matchColumn: string,
  ids: (number | string)[],
): Promise<Record<string, unknown>[]> {
  const placeholders = ids.map(() => '?').join(',');
  const params = matchColumn === COLUMNS.SECTION_ID
    ? ids.map(id => Number(id))
    : ids.map(id => String(id));

  const sql = `SELECT * FROM \`${table}\` WHERE \`${matchColumn}\` IN (${placeholders})`;
  const rows = await dbExecute<RowDataPacket[]>(db, sql, params);
  return parseJsonStrings(rows as Record<string, unknown>[]);
}

async function fetchRows(
  db: string,
  table: string,
  sectionIds: number[],
): Promise<Record<string, unknown>[]> {
  return fetchRowsByIds(db, table, COLUMNS.SECTION_ID, sectionIds);
}

export async function resolveInverseRelations(
  db: string,
  rows: Record<string, unknown>[],
  inverseMapRaw: string | true,
): Promise<Record<string, unknown>[]> {
  let inverseMap: InverseRelationMap;

  if (inverseMapRaw === true) {
    inverseMap = await getPublicationSchema(db);
  } else {
    inverseMap = parseInverseRelationMap(inverseMapRaw);
  }

  const result = [...rows];

  for (const row of result) {
    const cellValue = row[COLUMNS.DD_RELATIONS];
    if (cellValue === undefined || cellValue === null) continue;

    let locators: unknown[];
    if (typeof cellValue === 'string') {
      try {
        locators = JSON.parse(cellValue);
      } catch {
        continue;
      }
    } else if (Array.isArray(cellValue)) {
      locators = cellValue;
    } else {
      continue;
    }

    const resolved: Record<string, unknown>[] = [];

    for (const locator of locators) {
      const loc = typeof locator === 'string' ? JSON.parse(locator) : locator;
      if (typeof loc !== 'object' || loc === null) continue;

      const sectionTipo = String((loc as Record<string, unknown>).section_tipo ?? '');
      const sectionId = Number((loc as Record<string, unknown>).section_id ?? 0);

      if (!sectionTipo || !sectionId || isNaN(sectionId)) continue;

      const targetTable = inverseMap[sectionTipo];
      if (!targetTable) continue;

      try {
        validateTableName(targetTable);
        const fetched = await fetchRows(db, targetTable, [sectionId]);
        resolved.push(...fetched);
      } catch {
        // skip unresolvable locators
      }
    }

    row[COLUMNS.DD_RELATIONS] = resolved;
  }

  return result;
}

export function normalizeResolveRelations(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return value;
}

export function normalizeResolveInverseRelations(value: string | undefined | null): string | true | undefined {
  if (!value) return undefined;
  if (value === 'true' || value === '1') return true;
  return value;
}

export { parseRelationMap, parseInverseRelationMap };