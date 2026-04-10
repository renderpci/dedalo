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
	typo?:                 string;
	type?:                 string;
	action?:               string;
	model?:                string;
	tipo?:                 string;
	section_tipo?:         string;
	section_id?:           string | number | null;
	mode?:                 string;
	view?:                 string | null;
	lang?:                  string;
}

export interface rqo_options {
	include_debug?: boolean;
	include_empty?: boolean;
	levels?:        number;
	total?:         number;       // client-provided total records (main section)
	chunk_size?:    number;       // records per PHP call (default: 100)
	process_id?:    string;
	diffusion_element_tipo?: string;
	diffusion_tipo?:         string;
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
	varchar?:    number;
	length?:     number;
	output_format?: string;
	columns?:    Array<{ tipo: string; model: string }>;
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
	columns?:            Array<{ tipo: string; model: string }>;
	main_lang?:          string;
	[key: string]:       unknown;
}

export interface datum_record {
	section_id: string | number;
	entries:    Record<string, entry_value[]> | 'delete';
}

export interface entry_value {
	tipo:        string;
	lang:        string | null;
	value:       unknown;
	id:          string | null;
	meta?:       any;
	section_id?:   string | number | null;
	section_tipo?: string | null;
}

// Re-used for parser inputs, matches entry_value closely
export interface data_item {
	id:    string | null;
	value: any;
	tipo?: string;
	lang?: string | null;
	meta?: any;
	section_id?:   string | number | null;
	section_tipo?: string | null;
}


// =====================================================
// Processed output (ready for SQL)
// =====================================================

export interface processed_table {
	database_name:   string;
	table_name:      string;
	records:         processed_record[];
	deletions:       (string | number)[];   // section_ids to DELETE
	columns_context: Record<string, context_field>; // Map: sanitized_name -> context
}

export interface processed_record {
	section_id: string | number;
	lang:       string | null;
	columns:    Record<string, string | null>;
}


// =====================================================
// Diffusion engine response to client
// =====================================================

export interface consolidated_files {
	merged_url: string;
	zip_url:    string;
}

export interface diffusion_file_entry {
	file_url: string;
}

export interface engine_response {
	result:              boolean;
	msg:                 string;
	errors?:             string[];
	tables?:             { table_name: string; records_affected: number }[];
	diffusion_data?:     diffusion_file_entry[];
	consolidated_files?: consolidated_files;
}


// =====================================================
// Progress tracking (streaming + polling)
// =====================================================

export interface last_update_record_response {
	result:         boolean;
	msg:            string[];
	errors:         string[];
	class:          string;
	diffusion_data: diffusion_file_entry[];
}

export interface progress_data {
	process_id:  string;
	is_running:  boolean;
	started_at:  number;
	data: {
		msg:                          string;
		counter:                      number;
		total:                        number;
		section_label?:               string;
		current?:                     { section_id?: string | number; time?: number };
		total_ms?:                    number;
		diffusion_data?:              diffusion_file_entry[];
		last_update_record_response?: last_update_record_response;
		consolidated_files?:          consolidated_files;
	};
	total_time:  string;
	errors:      string[];
	result?:     engine_response;
}
