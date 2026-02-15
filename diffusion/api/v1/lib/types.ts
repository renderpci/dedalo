/**
 * TYPES
 * Shared type definitions for the diffusion engine.
 */

// =====================================================
// RQO (Request Query Object)
// =====================================================

export interface rqo {
	dd_api?:  string;
	action:   string;
	source:   rqo_source;
	sqo?:     object;
	options?: rqo_options;
}

export interface rqo_source {
	diffusion_element_tipo: string;
	diffusion_tipo:         string;
	lang?:                  string;
}

export interface rqo_options {
	include_debug?: boolean;
	include_empty?: boolean;
	levels?:        number;
}


// =====================================================
// PHP diffusion_api response
// =====================================================

export interface php_api_response {
	result:     boolean;
	msg:        string;
	errors?:    string[];
	langs?:     Record<string, string>;
	main_lang?: string;
	main?:      main_node[];
	datum?:     datum_group[];
}

export interface main_node {
	diffusion_tipo: string;
	term:           string;
	model:          string;
	parent?:        string;
	properties?:    main_node_properties;
}

export interface main_node_properties {
	table_name?:    string;
	database_name?: string;
	[key: string]:  unknown;
}

export interface datum_group {
	diffusion_tipo: string;
	section_tipo:   string;
	term:           string;
	model:          string;
	parent?:        string;
	context:        context_field[];
	data:           datum_record[];
}

export interface context_field {
	term:        string;
	tipo:        string;
	model:       string;
	parent:      string;
	parser:      parser_definition | parser_definition[] | Record<string, never>;
}

export interface parser_definition {
	fn:       string;
	options?: parser_options;
	tipo?:    string;
	id?:      string;
}

export interface parser_options {
	pattern?:            string;
	separator?:          string;
	fields_separator?:   string;
	records_separator?:  string;
	date_mode?:          string;
	lang?:               string;
	[key: string]:       unknown;
}

export interface datum_record {
	section_id: string | number;
	entries:    Record<string, entry_value[]>;
}

export interface entry_value {
	tipo:   string;
	lang:   string | null;
	value:  unknown;
	id:     string | null;
}


// =====================================================
// Processed output (ready for SQL)
// =====================================================

export interface processed_table {
	database_name: string;
	table_name:    string;
	records:       processed_record[];
}

export interface processed_record {
	section_id: string | number;
	lang:       string | null;
	columns:    Record<string, string | null>;
}


// =====================================================
// Diffusion engine response to client
// =====================================================

export interface engine_response {
	result:   boolean;
	msg:      string;
	errors?:  string[];
	tables?:  { table_name: string; records_affected: number }[];
}


// =====================================================
// Progress tracking (streaming + polling)
// =====================================================

export interface progress_data {
	process_id:  string;
	is_running:  boolean;
	started_at:  number;
	data: {
		msg:            string;
		counter:        number;
		total:          number;
		section_label?: string;
		current?:       { section_id?: string | number; time?: number };
		total_ms?:      number;
	};
	total_time:  string;
	errors:      string[];
	result?:     engine_response;
}
