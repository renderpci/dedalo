import { search } from '../services/search.service';
import { getSchema } from '../services/schema.service';
import { getAvIndexationFragment } from '../services/av-indexation.service';

export const tools = [
  {
    name: 'search_records',
    description: 'Search and query records from any published table. Supports filtering, pagination, sorting, and field selection. Use this to retrieve structured data from the Dédalo publication database.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: 'Target table name (e.g., interview, ts_themes, publications)',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated list of fields to return (optional)',
        },
        where: {
          type: 'string',
          description: 'SQL WHERE clause for filtering (optional)',
        },
        order: {
          type: 'string',
          description: 'ORDER BY clause (e.g., "title ASC")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 100, max: 1000)',
        },
        offset: {
          type: 'number',
          description: 'Number of results to skip (default: 0)',
        },
        section_id: {
          type: 'string',
          description: 'Filter by section_id (comma-separated for multiple)',
        },
        lang: {
          type: 'string',
          description: 'Language filter (e.g., lg-eng, lg-spa)',
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'fulltext_search',
    description: 'Perform full-text search using MariaDB FULLTEXT indexing. Returns results with relevance scores and highlighted text fragments.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: 'Target table name',
        },
        column: {
          type: 'string',
          description: 'Column to search in (default: transcription)',
        },
        q: {
          type: 'string',
          description: 'Search query. Supports boolean operators (+, -, "", etc.)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 100)',
        },
        offset: {
          type: 'number',
          description: 'Number of results to skip (default: 0)',
        },
      },
      required: ['table', 'q'],
    },
  },
  {
    name: 'get_text_fragment',
    description: 'Extract text fragments from large publication texts (books, thesis, etc.). Returns excerpts with page references and highlighted matches.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: 'Table containing the text (e.g., publications)',
        },
        section_id: {
          type: 'string',
          description: 'Section ID of the record',
        },
        terms: {
          type: 'string',
          description: 'Search terms to find in the text',
        },
        column: {
          type: 'string',
          description: 'Column containing the text (default: transcription)',
        },
        max_characters: {
          type: 'number',
          description: 'Maximum characters per fragment (default: 320)',
        },
        max_occurrences: {
          type: 'number',
          description: 'Maximum fragments per term (default: 1)',
        },
      },
      required: ['table', 'section_id', 'terms'],
    },
  },
  {
    name: 'get_av_fragment',
    description: 'Extract audiovisual interview fragments. Returns transcription excerpts with video timecodes, media URLs, and speaker information.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: 'Table name (default: interview)',
        },
        section_id: {
          type: 'string',
          description: 'Section ID of the interview',
        },
        terms: {
          type: 'string',
          description: 'Search terms within the transcription',
        },
        max_characters: {
          type: 'number',
          description: 'Maximum characters per fragment (default: 320)',
        },
        max_occurrences: {
          type: 'number',
          description: 'Maximum fragments per term (default: 1)',
        },
      },
      required: ['section_id', 'terms'],
    },
  },
  {
    name: 'get_av_indexation_fragment',
    description: 'Resolve an indexation locator (from thesaurus) to an audiovisual fragment. Returns video clip with timecodes, transcription, and associated thesaurus terms.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        section_id: {
          type: 'number',
          description: 'Section ID',
        },
        section_tipo: {
          type: 'string',
          description: 'Section type identifier',
        },
        component_tipo: {
          type: 'string',
          description: 'Component type identifier',
        },
        tag_id: {
          type: 'number',
          description: 'Tag ID from indexation',
        },
        tc_in: {
          type: 'number',
          description: 'Timecode in (seconds)',
        },
        tc_out: {
          type: 'number',
          description: 'Timecode out (seconds)',
        },
      },
      required: ['section_id'],
    },
  },
  {
    name: 'get_schema',
    description: 'Introspect the database schema. Returns available tables, their columns, and row counts. Use this to understand the data structure before querying.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: 'Specific table to inspect (optional, returns all if omitted)',
        },
      },
    },
  },
];

export async function handleToolCall(name: string, args: Record<string, any>): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    let result: any;

    switch (name) {
      case 'search_records':
        result = await search({
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
        break;

      case 'fulltext_search':
        result = await search({
          mode: 'fulltext',
          table: args.table,
          column: args.column,
          q: args.q,
          limit: args.limit,
          offset: args.offset,
        });
        break;

      case 'get_text_fragment':
        result = await search({
          mode: 'text-fragment',
          table: args.table,
          section_id: args.section_id,
          terms: args.terms,
          column: args.column,
          max_characters: args.max_characters,
          max_occurrences: args.max_occurrences,
        });
        break;

      case 'get_av_fragment':
        result = await search({
          mode: 'av-fragment',
          table: args.table || 'interview',
          section_id: args.section_id,
          terms: args.terms,
          max_characters: args.max_characters,
          max_occurrences: args.max_occurrences,
        });
        break;

      case 'get_av_indexation_fragment':
        result = await getAvIndexationFragment({
          section_id: args.section_id,
          section_tipo: args.section_tipo,
          component_tipo: args.component_tipo,
          tag_id: args.tag_id,
          tc_in: args.tc_in,
          tc_out: args.tc_out,
        });
        break;

      case 'get_schema':
        result = await getSchema(args.table);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
}
