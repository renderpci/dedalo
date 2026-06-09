import { z } from 'zod';
import { search } from '../services/search.service';
import { getSchema } from '../services/schema.service';
import { getAvIndexationFragment } from '../services/av-indexation.service';

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

export const tools: ToolDefinition[] = [
  {
    name: 'search_records',
    description: 'Search and query records from any published table. Supports filtering, pagination, sorting, field selection, and relation resolution. Use this to retrieve structured data from the Dédalo publication database.',
    inputSchema: {
      table: z.string().describe('Target table name (e.g., interview, ts_themes, publications)'),
      fields: z.string().optional().describe('Comma-separated list of fields to return'),
      filter: z.string().optional().describe('Filter DSL: field:operator:value (e.g., section_id:eq:1,code:like:OH-%). Operators: eq, ne, gt, gte, lt, lte, like, in, not_in, is_null, is_not_null'),
      order: z.string().optional().describe('Order DSL: field:direction (e.g., title:asc,section_id:desc)'),
      limit: z.number().optional().describe('Maximum number of results (default: 100, max: 1000)'),
      offset: z.number().optional().describe('Number of results to skip (default: 0)'),
      section_id: z.string().optional().describe('Filter by section_id (comma-separated for multiple)'),
      lang: z.string().optional().describe('Language filter (e.g., lg-eng, lg-spa)'),
      count: z.boolean().optional().describe('When true, return only total count without data rows'),
      resolve_relations: z.string().optional().describe('JSON object mapping column names to target tables for forward relation resolution (e.g., {"image":"image","informant":"informant"}). Supports dot notation for deep resolution (e.g., {"eventos.documentos":"image"}). Use "auto" for link columns.'),
      resolve_inverse_relations: z.string().optional().describe('Resolve inverse relations (dd_relations column). Pass "true" to auto-load mapping from publication_schema, or a JSON object like {"rsc170":"images"}'),
    },
    handler: async (args) => {
      const result = await search({
        mode: 'records',
        table: args.table as string,
        fields: args.fields as string | undefined,
        filter: args.filter as string | undefined,
        order: args.order as string | undefined,
        limit: (args.limit ?? 100) as number,
        offset: (args.offset ?? 0) as number,
        section_id: args.section_id as string | undefined,
        lang: args.lang as string | undefined,
        count: (args.count ?? false) as boolean,
        resolve_relations: args.resolve_relations as string | undefined,
        resolve_inverse_relations: args.resolve_inverse_relations as string | undefined,
      });
      return textContent(result);
    },
  },
  {
    name: 'count_records',
    description: 'Count records matching a filter. Returns the total number of matching rows without fetching data. Applies the same filter DSL and language/section_id filters as search_records. Also supports fulltext counting with the q parameter.',
    inputSchema: {
      table: z.string().describe('Target table name'),
      filter: z.string().optional().describe('Filter DSL: field:operator:value (e.g., section_id:eq:1,code:like:OH-%)'),
      section_id: z.string().optional().describe('Filter by section_id (comma-separated for multiple)'),
      lang: z.string().optional().describe('Language filter (e.g., lg-eng, lg-spa)'),
      q: z.string().optional().describe('Fulltext search query to count matching rows'),
      column: z.string().optional().describe('Column for fulltext count (default: transcription)'),
    },
    handler: async (args) => {
      const mode = args.q ? 'fulltext' : 'records';
      const searchParams: Record<string, unknown> = {
        mode,
        table: args.table as string,
        count: true,
        filter: args.filter as string | undefined,
        section_id: args.section_id as string | undefined,
        lang: args.lang as string | undefined,
      };
      if (args.q) {
        searchParams.q = args.q as string;
        searchParams.column = (args.column ?? 'transcription') as string;
      }
      const result = await search(searchParams as any);
      return textContent(result);
    },
  },
  {
    name: 'fulltext_search',
    description: 'Perform full-text search using MariaDB FULLTEXT indexing. Returns results with relevance scores and highlighted text fragments.',
    inputSchema: {
      table: z.string().describe('Target table name'),
      column: z.string().optional().describe('Column to search in (default: transcription)'),
      q: z.string().describe('Search query. Supports boolean operators (+, -, "", etc.)'),
      limit: z.number().optional().describe('Maximum number of results (default: 100)'),
      offset: z.number().optional().describe('Number of results to skip (default: 0)'),
      count: z.boolean().optional().describe('When true, return only total count without data rows'),
      resolve_relations: z.string().optional().describe('JSON object mapping column names to target tables for forward relation resolution'),
      resolve_inverse_relations: z.string().optional().describe('Resolve inverse relations. "true" for auto-load, or JSON mapping like {"rsc170":"images"}'),
    },
    handler: async (args) => {
      const result = await search({
        mode: 'fulltext',
        table: args.table as string,
        column: (args.column ?? 'transcription') as string,
        q: args.q as string,
        limit: (args.limit ?? 100) as number,
        offset: (args.offset ?? 0) as number,
        count: (args.count ?? false) as boolean,
        resolve_relations: args.resolve_relations as string | undefined,
        resolve_inverse_relations: args.resolve_inverse_relations as string | undefined,
      });
      return textContent(result);
    },
  },
  {
    name: 'get_text_fragment',
    description: 'Extract text fragments from large publication texts (books, thesis, etc.). Returns excerpts with page references and highlighted matches.',
    inputSchema: {
      table: z.string().describe('Table containing the text (e.g., publications)'),
      section_id: z.string().describe('Section ID of the record'),
      terms: z.string().describe('Search terms to find in the text'),
      column: z.string().optional().describe('Column containing the text (default: transcription)'),
      max_characters: z.number().optional().describe('Maximum characters per fragment (default: 320)'),
      max_occurrences: z.number().optional().describe('Maximum fragments per term (default: 1)'),
    },
    handler: async (args) => {
      const result = await search({
        mode: 'text-fragment',
        table: args.table as string,
        section_id: args.section_id as string,
        terms: args.terms as string,
        column: (args.column ?? 'transcription') as string,
        max_characters: (args.max_characters ?? 320) as number,
        max_occurrences: (args.max_occurrences ?? 1) as number,
      });
      return textContent(result);
    },
  },
  {
    name: 'get_av_fragment',
    description: 'Extract audiovisual interview fragments. Returns transcription excerpts with video timecodes, media URLs, and speaker information.',
    inputSchema: {
      table: z.string().optional().describe('Table name (default: interview)'),
      section_id: z.string().describe('Section ID of the interview'),
      terms: z.string().describe('Search terms within the transcription'),
      max_characters: z.number().optional().describe('Maximum characters per fragment (default: 320)'),
      max_occurrences: z.number().optional().describe('Maximum fragments per term (default: 1)'),
    },
    handler: async (args) => {
      const result = await search({
        mode: 'av-fragment',
        table: (args.table as string) || 'interview',
        section_id: args.section_id as string,
        terms: args.terms as string,
        max_characters: (args.max_characters ?? 320) as number,
        max_occurrences: (args.max_occurrences ?? 1) as number,
      });
      return textContent(result);
    },
  },
  {
    name: 'get_av_indexation_fragment',
    description: 'Resolve an indexation locator (from thesaurus) to an audiovisual fragment. Returns video clip with timecodes, transcription, and associated thesaurus terms.',
    inputSchema: {
      section_id: z.number().describe('Section ID'),
      section_tipo: z.string().optional().describe('Section type identifier'),
      component_tipo: z.string().optional().describe('Component type identifier'),
      tag_id: z.number().optional().describe('Tag ID from indexation'),
      tc_in: z.number().optional().describe('Timecode in (seconds)'),
      tc_out: z.number().optional().describe('Timecode out (seconds)'),
    },
    handler: async (args) => {
      const result = await getAvIndexationFragment({
        section_id: args.section_id as number,
        section_tipo: args.section_tipo as string | undefined,
        component_tipo: args.component_tipo as string | undefined,
        tag_id: args.tag_id as number | undefined,
        tc_in: args.tc_in as number | undefined,
        tc_out: args.tc_out as number | undefined,
      });
      return textContent(result);
    },
  },
  {
    name: 'get_schema',
    description: 'Introspect the database schema. Returns available tables, their columns and types, and row counts. Use this to understand the data structure before querying.',
    inputSchema: {
      table: z.string().optional().describe('Specific table to inspect (optional, returns all if omitted)'),
    },
    handler: async (args) => {
      const result = await getSchema(args.table as string | undefined);
      return textContent(result);
    },
  },
];

export const toolsByName = new Map(tools.map(t => [t.name, t]));

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