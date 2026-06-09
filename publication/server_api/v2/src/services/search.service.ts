import { executeQuery, validateTableName, validateColumnName } from '../db/query-builder';
import { getPool } from '../db/pool';
import { config } from '../config';
import { escapeRegExp } from '../utils/regex';
import { parseJsonStrings } from '../utils/parse-json';
import { ValidationError } from '../errors';
import { COLUMNS } from '../constants';
import { resolveRelations, resolveInverseRelations, normalizeResolveRelations, normalizeResolveInverseRelations } from './resolve.service';
import type { SearchParams } from '../validators';
import type { SearchResult, TextFragment, AvFragment, MediaInfo } from '../db/types';

export async function search(params: SearchParams): Promise<SearchResult<any>> {
  switch (params.mode) {
    case 'records':
      return searchRecords(params);
    case 'fulltext':
      return searchFulltext(params);
    case 'text-fragment':
      return searchTextFragment(params);
    case 'av-fragment':
      return searchAvFragment(params);
  }
}

async function searchRecords(params: Extract<SearchParams, { mode: 'records' }>): Promise<SearchResult<any>> {
  const { table, fields, filter, order, limit, offset, section_id, lang, count } = params;

  validateTableName(table);

  if (count) {
    return searchRecordsCount(params);
  }

  const fieldList = fields ? fields.split(',').map((f: string) => f.trim()) : undefined;

  let filterStr = filter || '';
  const extraFilters: string[] = [];

  if (section_id) {
    const ids = section_id.split(',').map((id: string) => parseInt(id.trim(), 10));
    if (ids.some(isNaN)) {
      throw new ValidationError('Invalid section_id value');
    }
    extraFilters.push(`${COLUMNS.SECTION_ID}:in:${ids.join('|')}`);
  }

  if (lang) {
    extraFilters.push(`${COLUMNS.LANG}:eq:${lang}`);
  }

  if (extraFilters.length > 0) {
    filterStr = filterStr
      ? `${filterStr},${extraFilters.join(',')}`
      : extraFilters.join(',');
  }

  const { rows, total } = await executeQuery({
    table,
    fields: fieldList,
    filter: filterStr || undefined,
    order,
    limit,
    offset,
  });

  let resolvedRows = rows as Record<string, unknown>[];
  const relMap = normalizeResolveRelations(params.resolve_relations);
  const invMap = normalizeResolveInverseRelations(params.resolve_inverse_relations);

  if (relMap) {
    resolvedRows = await resolveRelations(resolvedRows, relMap);
  }
  if (invMap) {
    resolvedRows = await resolveInverseRelations(resolvedRows, invMap);
  }

  return { mode: 'records', data: resolvedRows, total, limit, offset };
}

async function searchRecordsCount(params: Extract<SearchParams, { mode: 'records' }>): Promise<SearchResult<any>> {
  const { table, filter, section_id, lang } = params;

  validateTableName(table);

  let filterStr = filter || '';
  const extraFilters: string[] = [];

  if (section_id) {
    const ids = section_id.split(',').map((id: string) => parseInt(id.trim(), 10));
    if (ids.some(isNaN)) {
      throw new ValidationError('Invalid section_id value');
    }
    extraFilters.push(`${COLUMNS.SECTION_ID}:in:${ids.join('|')}`);
  }

  if (lang) {
    extraFilters.push(`${COLUMNS.LANG}:eq:${lang}`);
  }

  if (extraFilters.length > 0) {
    filterStr = filterStr
      ? `${filterStr},${extraFilters.join(',')}`
      : extraFilters.join(',');
  }

  const { total } = await executeQuery({
    table,
    filter: filterStr || undefined,
    limit: 1,
    offset: 0,
  });

  return { mode: 'records', data: [], total, table, filter: filterStr || undefined };
}

async function searchFulltext(params: Extract<SearchParams, { mode: 'fulltext' }>): Promise<SearchResult<any>> {
  const { table, column = COLUMNS.TRANSCRIPTION, q, limit, offset, count } = params;

  validateTableName(table);
  validateColumnName(column);

  const escapedCol = `\`${column}\``;

  if (count) {
    return searchFulltextCount(params);
  }

  const sql = `
    SELECT *, MATCH(${escapedCol}) AGAINST(? IN BOOLEAN MODE) as relevance
    FROM \`${table}\`
    WHERE MATCH(${escapedCol}) AGAINST(? IN BOOLEAN MODE)
    ORDER BY relevance DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total
    FROM \`${table}\`
    WHERE MATCH(${escapedCol}) AGAINST(? IN BOOLEAN MODE)
  `;

  const pool = getPool();
  const [rows] = await pool.execute(sql, [q, q, limit, offset]);
  const [countRows] = await pool.execute(countSql, [q]);

  const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

  const data = parseJsonStrings(rows as Record<string, unknown>[]).map(row => {
    const text = (row[column] as string) || '';
    const fragments = extractFragments(text, q, 320, 3);
    return { ...row, fragments };
  });

  let resolvedData = data as Record<string, unknown>[];
  const relMap = normalizeResolveRelations(params.resolve_relations);
  const invMap = normalizeResolveInverseRelations(params.resolve_inverse_relations);

  if (relMap) {
    resolvedData = await resolveRelations(resolvedData, relMap);
  }
  if (invMap) {
    resolvedData = await resolveInverseRelations(resolvedData, invMap);
  }

  return { mode: 'fulltext', data: resolvedData, total, limit, offset, query: q };
}

async function searchFulltextCount(params: Extract<SearchParams, { mode: 'fulltext' }>): Promise<SearchResult<any>> {
  const { table, column = COLUMNS.TRANSCRIPTION, q } = params;

  validateTableName(table);
  validateColumnName(column);

  const escapedCol = `\`${column}\``;

  const countSql = `
    SELECT COUNT(*) as total
    FROM \`${table}\`
    WHERE MATCH(${escapedCol}) AGAINST(? IN BOOLEAN MODE)
  `;

  const pool = getPool();
  const [countRows] = await pool.execute(countSql, [q]);

  const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

  return { mode: 'fulltext', data: [], total, table, query: q };
}

async function searchTextFragment(params: Extract<SearchParams, { mode: 'text-fragment' }>): Promise<SearchResult<TextFragment>> {
  const { table, column = COLUMNS.TRANSCRIPTION, section_id, terms, max_characters, max_occurrences } = params;

  validateTableName(table);
  validateColumnName(column);

  const id = parseInt(section_id, 10);
  const sql = `SELECT \`${column}\` FROM \`${table}\` WHERE ${COLUMNS.SECTION_ID} = ?`;

  const pool = getPool();
  const [rows] = await pool.execute(sql, [id]);

  if ((rows as unknown[]).length === 0) {
    return { mode: 'text-fragment', data: [], total: 0, section_id: id, terms };
  }

  const text = ((rows as Record<string, unknown>[])[0][column] as string) || '';
  const fragments = extractTextFragments(text, terms, max_characters, max_occurrences);

  return { mode: 'text-fragment', data: fragments, total: fragments.length, section_id: id, terms };
}

async function searchAvFragment(params: Extract<SearchParams, { mode: 'av-fragment' }>): Promise<SearchResult<AvFragment>> {
  const { table = 'interview', section_id, terms, max_characters, max_occurrences } = params;

  validateTableName(table);

  const id = parseInt(section_id, 10);

  const sql = `
    SELECT i.*, a.image, a.${COLUMNS.VIDEO} as video
    FROM \`${table}\` i
    LEFT JOIN audiovisual a ON i.${COLUMNS.SECTION_ID} = a.${COLUMNS.SECTION_ID}
    WHERE i.${COLUMNS.SECTION_ID} = ?
  `;

  const pool = getPool();
  const [rows] = await pool.execute(sql, [id]);

  if ((rows as unknown[]).length === 0) {
    return { mode: 'av-fragment', data: [], total: 0, section_id: id, terms };
  }

  const row = parseJsonStrings((rows as Record<string, unknown>[])[0]);
  const transcription = (row.transcription as string) || (row.rsc36 as string) || '';
  const fragments = extractAvFragments(transcription, terms, max_characters, max_occurrences, row);

  return { mode: 'av-fragment', data: fragments, total: fragments.length, section_id: id, terms };
}

function extractFragments(
  text: string,
  query: string,
  maxChars: number,
  maxOccurrences: number,
): Array<{ text: string; position: number }> {
  const words = query.split(/\s+/).filter(Boolean);
  const fragments: Array<{ text: string; position: number }> = [];

  for (const word of words) {
    const escaped = escapeRegExp(word);
    const regex = new RegExp(escaped, 'gi');
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = regex.exec(text)) !== null && count < maxOccurrences) {
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(text.length, match.index + match[0].length + maxChars / 2);

      let fragment = text.slice(start, end);
      if (start > 0) fragment = '...' + fragment;
      if (end < text.length) fragment = fragment + '...';

      fragment = fragment.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');

      fragments.push({ text: fragment, position: match.index });
      count++;
    }
  }

  return fragments;
}

function extractTextFragments(
  text: string,
  terms: string,
  maxChars: number,
  maxOccurrences: number,
): TextFragment[] {
  const words = terms.split(/\s+/).filter(Boolean);
  const fragments: TextFragment[] = [];

  for (const word of words) {
    const escaped = escapeRegExp(word);
    const regex = new RegExp(escaped, 'gi');
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = regex.exec(text)) !== null && count < maxOccurrences) {
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(text.length, match.index + match[0].length + maxChars / 2);

      let fragment = text.slice(start, end);
      if (start > 0) fragment = '...' + fragment;
      if (end < text.length) fragment = fragment + '...';

      fragment = fragment.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');

      const pageMatch = text.slice(0, match.index).match(/\[page-n-(\d+)\]/g);
      const page = pageMatch ? parseInt(pageMatch[pageMatch.length - 1].match(/\d+/)![0], 10) : undefined;

      fragments.push({ text: fragment, page, position: match.index });
      count++;
    }
  }

  return fragments;
}

function extractAvFragments(
  text: string,
  terms: string,
  maxChars: number,
  maxOccurrences: number,
  row: Record<string, unknown>,
): AvFragment[] {
  const words = terms.split(/\s+/).filter(Boolean);
  const fragments: AvFragment[] = [];

  for (const word of words) {
    const escaped = escapeRegExp(word);
    const regex = new RegExp(escaped, 'gi');
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = regex.exec(text)) !== null && count < maxOccurrences) {
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(text.length, match.index + match[0].length + maxChars / 2);

      let transcription = text.slice(start, end);
      if (start > 0) transcription = '...' + transcription;
      if (end < text.length) transcription = transcription + '...';

      transcription = transcription.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');

      const { tcIn, tcOut } = extractTimecodes(text, match.index);

      const media = buildMediaInfo(row, tcIn, tcOut);

      fragments.push({ transcription, media, speakers: [] });
      count++;
    }
  }

  return fragments;
}

function extractTimecodes(text: string, position: number): { tcIn: number; tcOut: number } {
  const tcPattern = /\[tc-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]/g;
  let tcIn = 0;
  let tcOut = 0;
  let match: RegExpExecArray | null;

  while ((match = tcPattern.exec(text)) !== null) {
    if (match.index <= position) {
      tcIn = parseFloat(match[1]);
      tcOut = parseFloat(match[2]);
    }
    if (match.index > position) break;
  }

  return { tcIn, tcOut };
}

function buildMediaInfo(row: Record<string, unknown>, tcIn: number, tcOut: number): MediaInfo {
  const video = row.video as string | undefined;
  const image = row.image as string | undefined;

  return {
    video_url: video ? `${config.MEDIA_BASE_URL}/${video}?vbegin=${tcIn}&vend=${tcOut}` : '',
    image_url: image ? `${config.MEDIA_BASE_URL}/${image}` : '',
    tc_in: tcIn,
    tc_out: tcOut,
  };
}
