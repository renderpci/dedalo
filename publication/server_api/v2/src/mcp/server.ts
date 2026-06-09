import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { search } from '../services/search.service';
import { getSchema } from '../services/schema.service';
import { getAvIndexationFragment } from '../services/av-indexation.service';

let server: McpServer | null = null;
let transport: WebStandardStreamableHTTPServerTransport | null = null;

export function createMcpServer(): McpServer {
  if (server) return server;

  server = new McpServer({
    name: 'dedalo-publication-api',
    version: '2.0.0',
  });

  server.registerTool('search_records', {
    description: 'Search and query records from any published table. Supports filtering, pagination, sorting, and field selection. Use this to retrieve structured data from the Dédalo publication database.',
    inputSchema: {
      table: z.string().describe('Target table name (e.g., interview, ts_themes, publications)'),
      fields: z.string().optional().describe('Comma-separated list of fields to return (optional)'),
      where: z.string().optional().describe('SQL WHERE clause for filtering (optional)'),
      order: z.string().optional().describe('ORDER BY clause (e.g., "title ASC")'),
      limit: z.number().optional().describe('Maximum number of results (default: 100, max: 1000)'),
      offset: z.number().optional().describe('Number of results to skip (default: 0)'),
      section_id: z.string().optional().describe('Filter by section_id (comma-separated for multiple)'),
      lang: z.string().optional().describe('Language filter (e.g., lg-eng, lg-spa)'),
    },
  }, async (args) => {
    const result = await search({
      mode: 'records',
      table: args.table,
      fields: args.fields,
      where: args.where,
      order: args.order,
      limit: args.limit,
      offset: args.offset,
      section_id: args.section_id,
      lang: args.lang,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('fulltext_search', {
    description: 'Perform full-text search using MariaDB FULLTEXT indexing. Returns results with relevance scores and highlighted text fragments.',
    inputSchema: {
      table: z.string().describe('Target table name'),
      column: z.string().optional().describe('Column to search in (default: transcription)'),
      q: z.string().describe('Search query. Supports boolean operators (+, -, "", etc.)'),
      limit: z.number().optional().describe('Maximum number of results (default: 100)'),
      offset: z.number().optional().describe('Number of results to skip (default: 0)'),
    },
  }, async (args) => {
    const result = await search({
      mode: 'fulltext',
      table: args.table,
      column: args.column,
      q: args.q,
      limit: args.limit,
      offset: args.offset,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_text_fragment', {
    description: 'Extract text fragments from large publication texts (books, thesis, etc.). Returns excerpts with page references and highlighted matches.',
    inputSchema: {
      table: z.string().describe('Table containing the text (e.g., publications)'),
      section_id: z.string().describe('Section ID of the record'),
      terms: z.string().describe('Search terms to find in the text'),
      column: z.string().optional().describe('Column containing the text (default: transcription)'),
      max_characters: z.number().optional().describe('Maximum characters per fragment (default: 320)'),
      max_occurrences: z.number().optional().describe('Maximum fragments per term (default: 1)'),
    },
  }, async (args) => {
    const result = await search({
      mode: 'text-fragment',
      table: args.table,
      section_id: args.section_id,
      terms: args.terms,
      column: args.column,
      max_characters: args.max_characters,
      max_occurrences: args.max_occurrences,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_av_fragment', {
    description: 'Extract audiovisual interview fragments. Returns transcription excerpts with video timecodes, media URLs, and speaker information.',
    inputSchema: {
      table: z.string().optional().describe('Table name (default: interview)'),
      section_id: z.string().describe('Section ID of the interview'),
      terms: z.string().describe('Search terms within the transcription'),
      max_characters: z.number().optional().describe('Maximum characters per fragment (default: 320)'),
      max_occurrences: z.number().optional().describe('Maximum fragments per term (default: 1)'),
    },
  }, async (args) => {
    const result = await search({
      mode: 'av-fragment',
      table: args.table || 'interview',
      section_id: args.section_id,
      terms: args.terms,
      max_characters: args.max_characters,
      max_occurrences: args.max_occurrences,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_av_indexation_fragment', {
    description: 'Resolve an indexation locator (from thesaurus) to an audiovisual fragment. Returns video clip with timecodes, transcription, and associated thesaurus terms.',
    inputSchema: {
      section_id: z.number().describe('Section ID'),
      section_tipo: z.string().optional().describe('Section type identifier'),
      component_tipo: z.string().optional().describe('Component type identifier'),
      tag_id: z.number().optional().describe('Tag ID from indexation'),
      tc_in: z.number().optional().describe('Timecode in (seconds)'),
      tc_out: z.number().optional().describe('Timecode out (seconds)'),
    },
  }, async (args) => {
    const result = await getAvIndexationFragment({
      section_id: args.section_id,
      section_tipo: args.section_tipo,
      component_tipo: args.component_tipo,
      tag_id: args.tag_id,
      tc_in: args.tc_in,
      tc_out: args.tc_out,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_schema', {
    description: 'Introspect the database schema. Returns available tables, their columns, and row counts. Use this to understand the data structure before querying.',
    inputSchema: {
      table: z.string().optional().describe('Specific table to inspect (optional, returns all if omitted)'),
    },
  }, async (args) => {
    const result = await getSchema(args.table);

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  return server;
}

export async function handleMcpRequest(req: Request): Promise<Response> {
  const mcpServer = createMcpServer();

  if (!transport) {
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await mcpServer.connect(transport);
  }

  return transport.handleRequest(req);
}
