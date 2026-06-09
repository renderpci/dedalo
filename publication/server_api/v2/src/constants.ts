export const DEFAULT_TABLE = 'interview';
export const DEFAULT_COLUMN = 'transcription';
export const DEFAULT_LIMIT = 100;
export const DEFAULT_OFFSET = 0;
export const MAX_LIMIT = 1000;
export const MAX_BATCH_QUERIES = 20;
export const MAX_FRAGMENTS_PER_TERM = 10;
export const DEFAULT_MAX_CHARACTERS = 320;
export const DEFAULT_MAX_OCCURRENCES = 1;

export const TABLES = {
  INTERVIEW: 'interview',
  AUDIOVISUAL: 'audiovisual',
  INFORMANT: 'informant',
  TS_THEMES: 'ts_themes',
  TS_ONOMASTIC: 'ts_onomastic',
  TS_CHRONOLOGICAL: 'ts_chronological',
  PUBLICATIONS: 'publications',
} as const;

export const COLUMNS = {
  SECTION_ID: 'section_id',
  LANG: 'lang',
  CODE: 'code',
  TITLE: 'title',
  TRANSCRIPTION: 'transcription',
  VIDEO: 'rsc35',
  IMAGE: 'image',
  TERM_ID: 'term_id',
  TERM: 'term',
  INDEXATION: 'indexation',
  NAME: 'name',
  SURNAME: 'surname',
  DD_RELATIONS: 'dd_relations',
} as const;

export const PUBLICATION_SCHEMA_TABLE = 'publication_schema';
export const PUBLICATION_SCHEMA_ID = 1;
export const MAX_RESOLVE_DEPTH = 3;
export const MAX_RESOLVE_ROWS = 50;

export const SEARCH_MODES = {
  RECORDS: 'records',
  FULLTEXT: 'fulltext',
  TEXT_FRAGMENT: 'text-fragment',
  AV_FRAGMENT: 'av-fragment',
} as const;

export const TC_TAG_PATTERN = /\[tc-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]/g;
export const PAGE_TAG_PATTERN = /\[page-n-(\d+)\]/g;
