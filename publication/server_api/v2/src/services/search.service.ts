import { validateColumnName } from '../db/query-builder';
import { dbExecute } from '../db/pool';
import { config } from '../config';
import { parseJsonStrings } from '../utils/parse-json';
import { NotFoundError, ValidationError } from '../errors';
import { COLUMNS } from '../constants';
import { extractFragments, pageAtPosition, timecodesAtPosition } from '../utils/fragments';
import { resolveRelations, resolveInverseRelations, normalizeResolveRelations, normalizeResolveInverseRelations } from './resolve.service';
import { assertTableExists, tableHasColumn } from './schema.service';
import type { TextFragment, AvFragment, MediaInfo } from '../db/types';
import type { RowDataPacket } from 'mysql2/promise';

export interface FulltextOptions {
  q: string;
  column: string;
  limit: number;
  offset: number;
  withTotal?: boolean;
  resolve_relations?: string;
  resolve_inverse_relations?: string;
}

async function assertSearchableColumn(db: string, table: string, column: string): Promise<void> {
  validateColumnName(column);
  if (!(await tableHasColumn(db, table, column))) {
    throw new ValidationError(`Unknown column "${column}" in table "${table}". Pass ?column= with a FULLTEXT-indexed text column`);
  }
}

// MariaDB raises 1191 when MATCH targets a column without a FULLTEXT index —
// a client problem, not a server one.
function mapFulltextError(error: unknown, column: string): never {
  if (error instanceof Error && (error as { code?: string }).code === 'ER_FT_MATCHING_KEY_NOT_FOUND') {
    throw new ValidationError(`Column "${column}" has no FULLTEXT index; fulltext search is not available on it`);
  }
  throw error;
}

export async function fulltextSearch(
  db: string,
  table: string,
  options: FulltextOptions,
): Promise<{ rows: Record<string, unknown>[]; total?: number }> {
  const { q, column, limit, offset, withTotal = false } = options;

  await assertTableExists(db, table);
  await assertSearchableColumn(db, table, column);

  const escapedCol = `\`${column}\``;

  let rows: Record<string, unknown>[] = [];
  if (limit > 0) {
    const sql = `
      SELECT *, MATCH(${escapedCol}) AGAINST(? IN BOOLEAN MODE) as relevance
      FROM \`${table}\`
      WHERE MATCH(${escapedCol}) AGAINST(? IN BOOLEAN MODE)
      ORDER BY relevance DESC
      LIMIT ? OFFSET ?
    `;
    const result = await dbExecute<RowDataPacket[]>(db, sql, [q, q, limit, offset])
      .catch(error => mapFulltextError(error, column));

    rows = parseJsonStrings(result as Record<string, unknown>[]).map(row => {
      const text = (row[column] as string) || '';
      const fragments = extractFragments(text, q, 320, 3);
      return { ...row, fragments };
    });

    const relMap = normalizeResolveRelations(options.resolve_relations);
    const invMap = normalizeResolveInverseRelations(options.resolve_inverse_relations);
    if (relMap) {
      rows = await resolveRelations(db, rows, relMap);
    }
    if (invMap) {
      rows = await resolveInverseRelations(db, rows, invMap);
    }
  }

  let total: number | undefined;
  if (withTotal) {
    const countSql = `
      SELECT COUNT(*) as total
      FROM \`${table}\`
      WHERE MATCH(${escapedCol}) AGAINST(? IN BOOLEAN MODE)
    `;
    const countRows = await dbExecute<RowDataPacket[]>(db, countSql, [q])
      .catch(error => mapFulltextError(error, column));
    total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;
  }

  return { rows, total };
}

export interface FragmentOptions {
  terms: string;
  column?: string;
  lang?: string;
  max_characters: number;
  max_occurrences: number;
}

async function fetchRecordText(
  db: string,
  table: string,
  id: number,
  columns: string[],
  lang?: string,
): Promise<Record<string, unknown>> {
  const hasLang = await tableHasColumn(db, table, COLUMNS.LANG);

  const selectCols = columns.map(col => `\`${col}\``).join(', ');
  let sql = `SELECT ${selectCols} FROM \`${table}\` WHERE \`${COLUMNS.SECTION_ID}\` = ?`;
  const params: (string | number)[] = [id];

  if (lang && hasLang) {
    sql += ` AND \`${COLUMNS.LANG}\` = ?`;
    params.push(lang);
  }
  if (hasLang) {
    sql += ` ORDER BY \`${COLUMNS.LANG}\` ASC`;
  }
  sql += ' LIMIT 1';

  const rows = await dbExecute<RowDataPacket[]>(db, sql, params);

  if (rows.length === 0) {
    const langSuffix = lang ? ` (lang: ${lang})` : '';
    throw new NotFoundError(`Record not found: ${table}/${id}${langSuffix}`);
  }

  return rows[0] as Record<string, unknown>;
}

export async function textFragments(
  db: string,
  table: string,
  id: number,
  options: FragmentOptions,
): Promise<TextFragment[]> {
  const { terms, column = COLUMNS.TRANSCRIPTION, lang, max_characters, max_occurrences } = options;

  await assertTableExists(db, table);
  await assertSearchableColumn(db, table, column);

  const row = await fetchRecordText(db, table, id, [column], lang);
  const text = (row[column] as string) || '';

  return extractFragments(text, terms, max_characters, max_occurrences).map(fragment => ({
    text: fragment.text,
    page: pageAtPosition(text, fragment.position),
    position: fragment.position,
  }));
}

export async function avFragments(
  db: string,
  table: string,
  id: number,
  options: FragmentOptions,
): Promise<AvFragment[]> {
  const { terms, lang, max_characters, max_occurrences } = options;

  await assertTableExists(db, table);

  const hasLang = await tableHasColumn(db, table, COLUMNS.LANG);

  let sql = `
    SELECT i.*, a.\`${COLUMNS.IMAGE}\`, a.\`${COLUMNS.VIDEO}\` as video
    FROM \`${table}\` i
    LEFT JOIN audiovisual a ON i.\`${COLUMNS.SECTION_ID}\` = a.\`${COLUMNS.SECTION_ID}\`
    WHERE i.\`${COLUMNS.SECTION_ID}\` = ?
  `;
  const params: (string | number)[] = [id];

  if (lang && hasLang) {
    sql += ` AND i.\`${COLUMNS.LANG}\` = ?`;
    params.push(lang);
  }
  if (hasLang) {
    sql += ` ORDER BY i.\`${COLUMNS.LANG}\` ASC`;
  }
  sql += ' LIMIT 1';

  const rows = await dbExecute<RowDataPacket[]>(db, sql, params);

  if (rows.length === 0) {
    const langSuffix = lang ? ` (lang: ${lang})` : '';
    throw new NotFoundError(`Record not found: ${table}/${id}${langSuffix}`);
  }

  const row = parseJsonStrings(rows[0] as Record<string, unknown>);
  const transcription = (row.transcription as string) || (row.rsc36 as string) || '';

  return extractFragments(transcription, terms, max_characters, max_occurrences).map(fragment => {
    const { tcIn, tcOut } = timecodesAtPosition(transcription, fragment.position);
    return {
      transcription: fragment.text,
      media: buildMediaInfo(row, tcIn, tcOut),
      speakers: [],
    };
  });
}

export function buildMediaInfo(row: Record<string, unknown>, tcIn: number, tcOut: number): MediaInfo {
  const video = row.video as string | undefined;
  const image = row.image as string | undefined;

  return {
    video_url: video ? `${config.MEDIA_BASE_URL}/${video}?vbegin=${tcIn}&vend=${tcOut}` : '',
    image_url: image ? `${config.MEDIA_BASE_URL}/${image}` : '',
    tc_in: tcIn,
    tc_out: tcOut,
  };
}
