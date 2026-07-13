import { z } from 'zod';
import { dbNames } from '../config';
import { assertKnownDb } from '../db/pool';
import { listRecords, getRecord } from '../services/records.service';
import { fulltextSearch, textFragments, avFragments } from '../services/search.service';
import { listTables, getTable } from '../services/schema.service';
import { getAvIndexationFragment } from '../services/av-indexation.service';
import { parseSort } from '../utils/query-params';
import type { FilterCondition } from '../utils/query-params';
import { ValidationError } from '../errors';
import { DEFAULT_TABLE, DEFAULT_COLUMN, DEFAULT_LIMIT, DEFAULT_MAX_CHARACTERS, DEFAULT_MAX_OCCURRENCES, VALID_OPERATORS_HINT } from '../constants';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

function textContent(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorContent(error: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }] };
}

const dbParam = z.string().optional().describe(`Database name (default: ${dbNames[0]}). Use list_databases to discover available databases.`);

const filtersParam = z.array(z.object({
  field: z.string().describe('Column name'),
  op: z.string().optional().describe(`Operator (default: eq). Valid: ${VALID_OPERATORS_HINT}`),
  value: z.string().optional().describe('Comparison value. For in/not_in: pipe-separated values (e.g. "1|2|3"). Omit for is_null/is_not_null.'),
})).optional().describe('Filter conditions, combined with AND');

function resolveDb(args: Record<string, unknown>): string {
  const db = (args.db as string | undefined) ?? dbNames[0];
  return assertKnownDb(db);
}

function toConditions(filters: unknown): FilterCondition[] {
  if (!filters) return [];
  if (!Array.isArray(filters)) {
    throw new ValidationError('filters must be an array of {field, op?, value?} objects');
  }

  return filters.map((raw) => {
    const { field, op = 'eq', value } = raw as { field: string; op?: string; value?: string };
    const operator = op.toLowerCase();

    if (operator === 'is_null' || operator === 'is_not_null') {
      return { field, operator, values: [] };
    }
    if (value === undefined) {
      throw new ValidationError(`Filter on "${field}" with operator "${operator}" requires a value`);
    }
    if (operator === 'in' || operator === 'not_in') {
      const values = String(value).split('|').map(v => v.trim()).filter(v => v !== '');
      if (values.length === 0) {
        throw new ValidationError(`Filter on "${field}" requires at least one pipe-separated value`);
      }
      return { field, operator, values };
    }
    return { field, operator, values: [String(value)] };
  });
}

function parseFieldList(fields: unknown): string[] | undefined {
  if (typeof fields !== 'string' || !fields) return undefined;
  const list = fields.split(',').map(f => f.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export const tools: ToolDefinition[] = [
  {
    name: 'list_databases',
    description: 'List the public databases exposed by this API. Each database contains its own set of published tables.',
    inputSchema: {},
    handler: async () => textContent({ databases: dbNames }),
  },
  {
    name: 'get_schema',
    description: 'Introspect a database schema. Returns available tables, their columns and types, and row counts. Use this to understand the data structure before querying.',
    inputSchema: {
      db: dbParam,
      table: z.string().optional().describe('Specific table to inspect (optional, returns all tables if omitted)'),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      if (args.table) {
        return textContent(await getTable(db, args.table as string));
      }
      return textContent(await listTables(db));
    },
  },
  {
    name: 'search_records',
    description: 'Search and query records from any published table. Supports structured filters, pagination, sorting, field selection, and relation resolution. Use this to retrieve structured data from the Dédalo publication database.',
    inputSchema: {
      db: dbParam,
      table: z.string().describe('Target table name (e.g., interview, ts_themes, publications)'),
      fields: z.string().optional().describe('Comma-separated list of fields to return'),
      filters: filtersParam,
      sort: z.string().optional().describe('Sort fields, comma-separated; prefix with "-" for descending (e.g., "title,-section_id")'),
      limit: z.number().optional().describe('Maximum number of results (default: 100, max: 1000)'),
      offset: z.number().optional().describe('Number of results to skip (default: 0)'),
      lang: z.string().optional().describe('Language filter (e.g., lg-eng, lg-spa)'),
      count: z.boolean().optional().describe('When true, also return the total count of matching rows'),
      resolve_relations: z.string().optional().describe('JSON object mapping column names to target tables for forward relation resolution (e.g., {"image":"image","informant":"informant"}). Supports dot notation for deep resolution (e.g., {"eventos.documentos":"image"}). Use "auto" for link columns.'),
      resolve_inverse_relations: z.string().optional().describe('Resolve inverse relations (dd_relations column). Pass "true" to auto-load mapping from publication_schema, or a JSON object like {"rsc170":"images"}'),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      const { rows, total } = await listRecords(db, args.table as string, {
        fields: parseFieldList(args.fields),
        conditions: toConditions(args.filters),
        order: args.sort ? parseSort(args.sort as string) : [],
        limit: (args.limit ?? DEFAULT_LIMIT) as number,
        offset: (args.offset ?? 0) as number,
        lang: args.lang as string | undefined,
        withTotal: (args.count ?? false) as boolean,
        resolve_relations: args.resolve_relations as string | undefined,
        resolve_inverse_relations: args.resolve_inverse_relations as string | undefined,
      });
      return textContent({ data: rows, ...(total !== undefined ? { total } : {}) });
    },
  },
  {
    name: 'get_record',
    description: 'Get a single record by section_id. Records can have one row per language; without lang all language variants are returned.',
    inputSchema: {
      db: dbParam,
      table: z.string().describe('Target table name'),
      section_id: z.number().describe('Record section_id'),
      lang: z.string().optional().describe('Language variant to return (e.g., lg-eng)'),
      fields: z.string().optional().describe('Comma-separated list of fields to return'),
      resolve_relations: z.string().optional().describe('JSON object mapping column names to target tables for forward relation resolution'),
      resolve_inverse_relations: z.string().optional().describe('Resolve inverse relations. "true" for auto-load, or JSON mapping like {"rsc170":"images"}'),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      const { rows, languages, hasLang } = await getRecord(db, args.table as string, args.section_id as number, {
        fields: parseFieldList(args.fields),
        lang: args.lang as string | undefined,
        resolve_relations: args.resolve_relations as string | undefined,
        resolve_inverse_relations: args.resolve_inverse_relations as string | undefined,
      });
      return textContent({ data: rows, ...(hasLang ? { languages } : {}) });
    },
  },
  {
    name: 'count_records',
    description: 'Count records matching structured filters without fetching data. Also supports fulltext counting with the q parameter.',
    inputSchema: {
      db: dbParam,
      table: z.string().describe('Target table name'),
      filters: filtersParam,
      lang: z.string().optional().describe('Language filter (e.g., lg-eng, lg-spa)'),
      q: z.string().optional().describe('Fulltext search query to count matching rows instead of filters'),
      column: z.string().optional().describe(`Column for fulltext count (default: ${DEFAULT_COLUMN})`),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      if (args.q) {
        const { total } = await fulltextSearch(db, args.table as string, {
          q: args.q as string,
          column: (args.column ?? DEFAULT_COLUMN) as string,
          limit: 0,
          offset: 0,
          withTotal: true,
        });
        return textContent({ total });
      }
      const { total } = await listRecords(db, args.table as string, {
        conditions: toConditions(args.filters),
        lang: args.lang as string | undefined,
        limit: 0,
        offset: 0,
        withTotal: true,
      });
      return textContent({ total });
    },
  },
  {
    name: 'fulltext_search',
    description: 'Perform full-text search using MariaDB FULLTEXT indexing. Returns results with relevance scores and highlighted text fragments.',
    inputSchema: {
      db: dbParam,
      table: z.string().describe('Target table name'),
      q: z.string().describe('Search query. Supports boolean operators (+, -, "", etc.)'),
      column: z.string().optional().describe(`Column to search in (default: ${DEFAULT_COLUMN})`),
      limit: z.number().optional().describe('Maximum number of results (default: 100)'),
      offset: z.number().optional().describe('Number of results to skip (default: 0)'),
      count: z.boolean().optional().describe('When true, also return the total count of matching rows'),
      resolve_relations: z.string().optional().describe('JSON object mapping column names to target tables for forward relation resolution'),
      resolve_inverse_relations: z.string().optional().describe('Resolve inverse relations. "true" for auto-load, or JSON mapping like {"rsc170":"images"}'),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      const { rows, total } = await fulltextSearch(db, args.table as string, {
        q: args.q as string,
        column: (args.column ?? DEFAULT_COLUMN) as string,
        limit: (args.limit ?? DEFAULT_LIMIT) as number,
        offset: (args.offset ?? 0) as number,
        withTotal: (args.count ?? false) as boolean,
        resolve_relations: args.resolve_relations as string | undefined,
        resolve_inverse_relations: args.resolve_inverse_relations as string | undefined,
      });
      return textContent({ data: rows, ...(total !== undefined ? { total } : {}) });
    },
  },
  {
    name: 'get_text_fragment',
    description: 'Extract text fragments from large publication texts (books, thesis, etc.). Returns excerpts with page references and highlighted matches.',
    inputSchema: {
      db: dbParam,
      table: z.string().describe('Table containing the text (e.g., publications)'),
      section_id: z.number().describe('Section ID of the record'),
      terms: z.string().describe('Search terms to find in the text'),
      column: z.string().optional().describe(`Column containing the text (default: ${DEFAULT_COLUMN})`),
      lang: z.string().optional().describe('Language variant to read (e.g., lg-eng)'),
      max_characters: z.number().optional().describe(`Maximum characters per fragment (default: ${DEFAULT_MAX_CHARACTERS})`),
      max_occurrences: z.number().optional().describe(`Maximum fragments per term (default: ${DEFAULT_MAX_OCCURRENCES})`),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      const fragments = await textFragments(db, args.table as string, args.section_id as number, {
        terms: args.terms as string,
        column: (args.column ?? DEFAULT_COLUMN) as string,
        lang: args.lang as string | undefined,
        max_characters: (args.max_characters ?? DEFAULT_MAX_CHARACTERS) as number,
        max_occurrences: (args.max_occurrences ?? DEFAULT_MAX_OCCURRENCES) as number,
      });
      return textContent({ data: fragments });
    },
  },
  {
    name: 'get_av_fragment',
    description: 'Extract audiovisual interview fragments. Returns transcription excerpts with video timecodes, media URLs, and speaker information.',
    inputSchema: {
      db: dbParam,
      table: z.string().optional().describe(`Table name (default: ${DEFAULT_TABLE})`),
      section_id: z.number().describe('Section ID of the interview'),
      terms: z.string().describe('Search terms within the transcription'),
      lang: z.string().optional().describe('Language variant to read (e.g., lg-eng)'),
      max_characters: z.number().optional().describe(`Maximum characters per fragment (default: ${DEFAULT_MAX_CHARACTERS})`),
      max_occurrences: z.number().optional().describe(`Maximum fragments per term (default: ${DEFAULT_MAX_OCCURRENCES})`),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      const fragments = await avFragments(db, (args.table as string) || DEFAULT_TABLE, args.section_id as number, {
        terms: args.terms as string,
        lang: args.lang as string | undefined,
        max_characters: (args.max_characters ?? DEFAULT_MAX_CHARACTERS) as number,
        max_occurrences: (args.max_occurrences ?? DEFAULT_MAX_OCCURRENCES) as number,
      });
      return textContent({ data: fragments });
    },
  },
  {
    name: 'get_av_indexation_fragment',
    description: 'Resolve an indexation locator (from thesaurus) to an audiovisual fragment. Returns video clip with timecodes, transcription, and associated thesaurus terms.',
    inputSchema: {
      db: dbParam,
      section_id: z.number().describe('Section ID'),
      section_tipo: z.string().optional().describe('Section type identifier'),
      component_tipo: z.string().optional().describe('Component type identifier'),
      tag_id: z.number().optional().describe('Tag ID from indexation'),
      tc_in: z.number().optional().describe('Timecode in (seconds)'),
      tc_out: z.number().optional().describe('Timecode out (seconds)'),
    },
    handler: async (args) => {
      const db = resolveDb(args);
      const result = await getAvIndexationFragment(db, {
        section_id: args.section_id as number,
        section_tipo: args.section_tipo as string | undefined,
        component_tipo: args.component_tipo as string | undefined,
        tag_id: args.tag_id as number | undefined,
        tc_in: args.tc_in as number | undefined,
        tc_out: args.tc_out as number | undefined,
      });
      return textContent({ data: result });
    },
  },
];

export const toolsByName = new Map(tools.map(t => [t.name, t]));

/**
 * The ONE way a tool is invoked — by the MCP transport (server.ts registers this) and
 * by the tests alike. It exists so a failing tool answers with an error *result* the
 * agent can read and act on, rather than a protocol-level exception.
 */
export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return errorContent(new Error(`Unknown tool: ${name}`));
  }

  try {
    return await tool.handler(args);
  } catch (error) {
    return errorContent(error);
  }
}
