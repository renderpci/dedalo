/**
 * Agent-view TypeScript types.
 *
 * These mirror the canonical JSON shapes produced by PHP
 * `agent_view_builder` so the MCP layer can type agent-tool
 * outputs and handlers without guessing field names.
 */

/** Simplified field type exposed to the LLM. */
export type AgentFieldType = 'text' | 'html' | 'date' | 'number' | 'link' | 'media';

/** One field descriptor in a section schema. */
export interface AgentFieldDescriptor {
	label: string;
	type: AgentFieldType;
	target?: string;
	tipo?: string;
	model?: string;
}

/** Section schema returned by `describe_section`. */
export interface SectionView {
	section_label: string;
	section_tipo: string;
	lang: string;
	fields: AgentFieldDescriptor[];
	_meta?: {
		field_tipos?: Record<string, string>;
	};
}

/** Expanded portal locator in a record view. */
export interface AgentPortalRef {
	ref: string;
	label: string;
	section_tipo: string;
	section_id: number;
}

/** Single record in agent-view shape: flat { label: value }. */
export interface RecordView {
	section_label: string;
	section_tipo: string;
	section_id: number;
	lang: string;
	fields: Record<string, string | number | boolean | null | AgentPortalRef[] | unknown>;
	_meta: {
		section_tipo: string;
		field_tipos: Record<string, string>;
	};
	fields_by_tipo?: Record<string, unknown>;
}

/** Pagination block in search results. */
export interface SearchPagination {
	limit: number;
	offset: number;
	total: number | null;
	count: number;
}

/** Search result envelope. */
export interface SearchResultView {
	section_tipo: string;
	section_label: string;
	lang: string;
	records: RecordView[];
	pagination: SearchPagination;
}

/** Set field result envelope. */
export interface SetFieldResult {
	section_tipo: string;
	section_id: number;
	field: string;
	tipo: string;
	record_view: RecordView | null;
}

/** Count result envelope. */
export interface CountResultView {
	section_tipo: string;
	section_label: string;
	total: number;
}

/** One field in a section map (multilingual labels, simplified type). */
export interface SectionMapField {
	tipo: string;
	label: Record<string, string>;
	type: AgentFieldType;
	target?: string;
}

/** Per-section flat map returned by `get_section_map`. */
export interface SectionMap {
	tipo: string;
	label: Record<string, string>;
	fields: SectionMapField[];
}