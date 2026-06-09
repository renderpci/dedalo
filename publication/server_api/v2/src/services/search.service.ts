import { executeQuery, executeRawQuery, validateTableName, validateColumnName, validateWhereClause } from '../db/query-builder';
import { getPool } from '../db/pool';
import { config } from '../config';
import type { SearchParams, SearchResult, TableRow, TextFragment, AvFragment } from '../db/types';

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
    default:
      throw new Error(`Invalid mode: ${params.mode}`);
  }
}

async function searchRecords(params: SearchParams): Promise<SearchResult> {
  const { table, fields, where, order, limit = 100, offset = 0, section_id, lang } = params;

  validateTableName(table);

  const fieldList = fields ? fields.split(',').map(f => f.trim()) : undefined;

  let whereClause = where || '';
  const whereParams: any[] = [];

  if (section_id) {
    const ids = section_id.split(',').map(id => parseInt(id.trim(), 10));
    if (whereClause) {
      whereClause += ` AND section_id IN (${ids.map(() => '?').join(',')})`;
    } else {
      whereClause = `section_id IN (${ids.map(() => '?').join(',')})`;
    }
    whereParams.push(...ids);
  }

  if (lang) {
    if (whereClause) {
      whereClause += ` AND lang = ?`;
    } else {
      whereClause = `lang = ?`;
    }
    whereParams.push(lang);
  }

  const { rows, total } = await executeQuery({
    table,
    fields: fieldList,
    where: whereClause || undefined,
    whereParams,
    order,
    limit,
    offset,
  });

  return {
    mode: 'records',
    data: rows,
    total,
    limit,
    offset,
  };
}

async function searchFulltext(params: SearchParams): Promise<SearchResult> {
  const { table, column = 'transcription', q, limit = 100, offset = 0 } = params;

  if (!q) {
    throw new Error('Missing required parameter: q');
  }

  validateTableName(table);
  validateColumnName(column);

  const sql = `
    SELECT *, MATCH(\`${column}\`) AGAINST(? IN BOOLEAN MODE) as relevance
    FROM \`${table}\`
    WHERE MATCH(\`${column}\`) AGAINST(? IN BOOLEAN MODE)
    ORDER BY relevance DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total
    FROM \`${table}\`
    WHERE MATCH(\`${column}\`) AGAINST(? IN BOOLEAN MODE)
  `;

  const pool = getPool();
  const [rows] = await pool.execute(sql, [q, q, limit, offset]);
  const [countRows] = await pool.execute(countSql, [q]);

  const total = (countRows as any[])[0]?.total || 0;

  const data = (rows as any[]).map(row => {
    const text = row[column] || '';
    const fragments = extractFragments(text, q, 320, 3);

    return {
      ...row,
      fragments,
    };
  });

  return {
    mode: 'fulltext',
    data,
    total,
    limit,
    offset,
    query: q,
  };
}

async function searchTextFragment(params: SearchParams): Promise<SearchResult<TextFragment>> {
  const { table, column = 'transcription', section_id, terms, max_characters = 320, max_occurrences = 1 } = params;

  if (!section_id || !terms) {
    throw new Error('Missing required parameters: section_id and terms');
  }

  validateTableName(table);
  validateColumnName(column);

  const id = parseInt(section_id, 10);
  const sql = `SELECT \`${column}\` FROM \`${table}\` WHERE section_id = ?`;

  const pool = getPool();
  const [rows] = await pool.execute(sql, [id]);

  if ((rows as any[]).length === 0) {
    return {
      mode: 'text-fragment',
      data: [],
      total: 0,
      section_id: id,
      terms,
    };
  }

  const text = (rows as any[])[0][column] || '';
  const fragments = extractTextFragments(text, terms, max_characters, max_occurrences);

  return {
    mode: 'text-fragment',
    data: fragments,
    total: fragments.length,
    section_id: id,
    terms,
  };
}

async function searchAvFragment(params: SearchParams): Promise<SearchResult<AvFragment>> {
  const { table = 'interview', section_id, terms, max_characters = 320, max_occurrences = 1 } = params;

  if (!section_id || !terms) {
    throw new Error('Missing required parameters: section_id and terms');
  }

  validateTableName(table);

  const id = parseInt(section_id, 10);

  const sql = `
    SELECT i.*, a.image, a.rsc35 as video
    FROM \`${table}\` i
    LEFT JOIN audiovisual a ON i.section_id = a.section_id
    WHERE i.section_id = ?
  `;

  const pool = getPool();
  const [rows] = await pool.execute(sql, [id]);

  if ((rows as any[]).length === 0) {
    return {
      mode: 'av-fragment',
      data: [],
      total: 0,
      section_id: id,
      terms,
    };
  }

  const row = (rows as any[])[0];
  const transcription = row.transcription || row.rsc36 || '';
  const fragments = extractAvFragments(transcription, terms, max_characters, max_occurrences, row);

  return {
    mode: 'av-fragment',
    data: fragments,
    total: fragments.length,
    section_id: id,
    terms,
  };
}

function extractFragments(text: string, query: string, maxChars: number, maxOccurrences: number): Array<{ text: string; position: number }> {
  const words = query.split(/\s+/).filter(Boolean);
  const fragments: Array<{ text: string; position: number }> = [];

  for (const word of words) {
    const regex = new RegExp(word, 'gi');
    let match;
    let count = 0;

    while ((match = regex.exec(text)) !== null && count < maxOccurrences) {
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(text.length, match.index + match[0].length + maxChars / 2);

      let fragment = text.slice(start, end);
      if (start > 0) fragment = '...' + fragment;
      if (end < text.length) fragment = fragment + '...';

      fragment = fragment.replace(new RegExp(`(${word})`, 'gi'), '<mark>$1</mark>');

      fragments.push({
        text: fragment,
        position: match.index,
      });

      count++;
    }
  }

  return fragments;
}

function extractTextFragments(text: string, terms: string, maxChars: number, maxOccurrences: number): TextFragment[] {
  const words = terms.split(/\s+/).filter(Boolean);
  const fragments: TextFragment[] = [];

  for (const word of words) {
    const regex = new RegExp(word, 'gi');
    let match;
    let count = 0;

    while ((match = regex.exec(text)) !== null && count < maxOccurrences) {
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(text.length, match.index + match[0].length + maxChars / 2);

      let fragment = text.slice(start, end);
      if (start > 0) fragment = '...' + fragment;
      if (end < text.length) fragment = fragment + '...';

      fragment = fragment.replace(new RegExp(`(${word})`, 'gi'), '<mark>$1</mark>');

      const pageMatch = text.slice(0, match.index).match(/\[page-n-(\d+)\]/g);
      const page = pageMatch ? parseInt(pageMatch[pageMatch.length - 1].match(/\d+/)![0], 10) : undefined;

      fragments.push({
        text: fragment,
        page,
        position: match.index,
      });

      count++;
    }
  }

  return fragments;
}

function extractAvFragments(text: string, terms: string, maxChars: number, maxOccurrences: number, row: any): AvFragment[] {
  const words = terms.split(/\s+/).filter(Boolean);
  const fragments: AvFragment[] = [];

  for (const word of words) {
    const regex = new RegExp(word, 'gi');
    let match;
    let count = 0;

    while ((match = regex.exec(text)) !== null && count < maxOccurrences) {
      const start = Math.max(0, match.index - maxChars / 2);
      const end = Math.min(text.length, match.index + match[0].length + maxChars / 2);

      let transcription = text.slice(start, end);
      if (start > 0) transcription = '...' + transcription;
      if (end < text.length) transcription = transcription + '...';

      transcription = transcription.replace(new RegExp(`(${word})`, 'gi'), '<mark>$1</mark>');

      const tcIn = 0;
      const tcOut = 0;

      fragments.push({
        transcription,
        media: {
          video_url: row.video ? `${config.MEDIA_BASE_URL}/${row.video}` : '',
          image_url: row.image ? `${config.MEDIA_BASE_URL}/${row.image}` : '',
          tc_in: tcIn,
          tc_out: tcOut,
        },
        speakers: [],
      });

      count++;
    }
  }

  return fragments;
}
