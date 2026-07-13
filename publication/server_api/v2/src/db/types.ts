/**
 * A row as the driver returns it, before any interpretation. Values are `unknown`
 * because a published column can hold anything the diffusion writer put there —
 * including JSON stored in TEXT (parsed later by utils/parse-json) — so the type
 * must not promise more than the driver guarantees. Replaces mysql2's RowDataPacket.
 */
export interface DbRow {
  [key: string]: unknown;
}

export interface TableRow {
  [key: string]: string | number | boolean | null;
}

export interface InterviewRow extends TableRow {
  id: number;
  section_id: number;
  lang: string;
  code: string;
  title: string;
  abstract: string;
  transcription: string;
}

export interface AudiovisualRow extends TableRow {
  id: number;
  section_id: number;
  lang: string;
  rsc35: string;
  image: string;
}

export interface InformantRow extends TableRow {
  id: number;
  section_id: number;
  lang: string;
  name: string;
  surname: string;
}

export interface ThesaurusRow extends TableRow {
  id: number;
  term_id: string;
  term: string;
  scope_note: string;
  indexation: string;
  parent: string | null;
}

export interface PublicationRow extends TableRow {
  id: number;
  section_id: number;
  lang: string;
  title: string;
  transcription: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  row_count: number;
}

export interface SchemaResponse {
  tables: TableInfo[];
}

export interface TextFragment {
  text: string;
  page?: number;
  position: number;
}

export interface MediaInfo {
  video_url: string;
  image_url: string;
  tc_in: number;
  tc_out: number;
}

export interface Speaker {
  name: string;
  role: string;
}

export interface AvFragment {
  transcription: string;
  media: MediaInfo;
  speakers: Speaker[];
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
  media: MediaInfo;
  speakers: Speaker[];
  terms: Array<{ term_id: string; term: string }>;
}

export interface BatchResult {
  id: string;
  status: number;
  data?: unknown;
  problem?: unknown;
}

export interface BatchResponse {
  results: BatchResult[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  databases: Record<string, 'connected' | 'error'>;
  uptime: number;
  timestamp: string;
  version: string;
}
