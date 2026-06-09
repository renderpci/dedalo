export interface TableRow {
  [key: string]: string | number | boolean | null;
}

export interface TableInfo {
  name: string;
  columns: string[];
  row_count: number;
}

export interface SchemaResponse {
  tables: TableInfo[];
}

export interface SearchParams {
  mode: 'records' | 'fulltext' | 'text-fragment' | 'av-fragment';
  table: string;
  db_name?: string;
  lang?: string;
  fields?: string;
  where?: string;
  order?: string;
  limit?: number;
  offset?: number;
  section_id?: string;
  resolve_portals?: boolean;
  q?: string;
  column?: string;
  terms?: string;
  max_characters?: number;
  max_occurrences?: number;
}

export interface SearchResult<T = TableRow> {
  mode: string;
  data: T[];
  total: number;
  limit?: number;
  offset?: number;
  query?: string;
  terms?: string;
  section_id?: string | number;
}

export interface TextFragment {
  text: string;
  page?: number;
  position: number;
}

export interface AvFragment {
  transcription: string;
  media: {
    video_url: string;
    image_url: string;
    tc_in: number;
    tc_out: number;
  };
  speakers?: Array<{ name: string; role: string }>;
}

export interface Locator {
  section_id: number;
  section_tipo?: string;
  component_tipo?: string;
  tag_id?: number;
  tc_in?: number;
  tc_out?: number;
}

export interface AvIndexationFragment {
  locator: Locator;
  transcription: string;
  media: {
    video_url: string;
    image_url: string;
    tc_in: number;
    tc_out: number;
  };
  speakers?: Array<{ name: string; role: string }>;
  terms?: Array<{ term_id: string; term: string }>;
}

export interface BatchQuery {
  id: string;
  endpoint: string;
  params: Record<string, any>;
}

export interface BatchRequest {
  queries: BatchQuery[];
}

export interface BatchResult {
  id: string;
  status: number;
  data?: any;
  error?: string;
}

export interface BatchResponse {
  results: BatchResult[];
}
