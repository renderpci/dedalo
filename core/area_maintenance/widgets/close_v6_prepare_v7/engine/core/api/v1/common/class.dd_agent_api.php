<?php declare(strict_types=1);
/**
 * CLASS DD_AGENT_API
 * LLM-facing HTTP API layer for Dédalo. Returns section schemas and record
 * data in the simplified "agent view" shape produced by `agent_view_builder`
 * so that language-model clients can read and write Dédalo records using
 * human field labels — without needing to know RQO/SQO, tipos, portal
 * mechanics, or the matrix-JSONB data format.
 *
 * Registered actions (all listed in API_ACTIONS):
 * - describe_section    : return a section's schema as a label list with simplified types
 * - read_record_view    : fetch one record as a flat label→value JSON object
 * - search_records_view : run a label-based filter and return paginated agent-view records
 * - count_records       : count matching records (supports same label-based filters)
 * - set_field_by_label  : write one field value using its human label
 * - get_media_url       : resolve the public URL of a media component without a full record fetch
 * - list_sections_index : return a compact {tipo, label} index of all readable sections
 * - get_section_map     : return the full field map for one section (tipos + multilingual labels)
 *
 * Phase 3 will add `collect_field`, `create_record_view`.
 *
 * Permission model:
 * Every action applies `common::get_permissions()` at the section level (read ≥ 1,
 * write ≥ 2) and `security::assert_record_in_user_scope()` where a specific
 * section_id is addressed. No additional grants beyond the standard Dédalo
 * permission model are required or bypassed.
 *
 * All public static methods take a single `$rqo` (Request Query Object) and
 * return a `stdClass` with `result`, `msg`, and `errors` properties — the same
 * envelope convention used across dd_core_api and dd_tools_api.
 *
 * Depends on:
 * - agent_view_builder (shared/agent/) — builds / resolves agent-view shapes
 * - search / search_query_object       — SQO-based record lookups
 * - common, security, component_common — permission checks, record scope, component I/O
 * - ontology_node, dd_ontology_db_manager, ontology_data_io — ontology resolution
 *
 * @package Dedalo
 * @subpackage API
 */
final class dd_agent_api {



	/**
	 * SEC-024: explicit allowlist of methods callable as remote API actions.
	 * Adding a new public static method does NOT expose it over HTTP; it MUST
	 * also be added to this list. All private/helper methods are intentionally
	 * absent. Enforced by dd_manager before dispatching any action.
	 * @var array<int, string>
	 */
	public const API_ACTIONS = [
		'describe_section',
		'read_record_view',
		'search_records_view',
		'count_records',
		'set_field_by_label',
		'get_media_url',
		'list_sections_index',
		'get_section_map'
	];



	/**
	 * DESCRIBE_SECTION
	 * Returns the LLM-friendly schema of a section: an ordered list of fields
	 * with their human labels and one of the six simplified types
	 * (text | html | date | number | link | media). This is the primary source
	 * of truth for the label↔tipo mapping that all other actions rely on.
	 *
	 * `source.section_tipo` may be a canonical tipo (e.g. "oh1") OR a
	 * human-readable name in any supported language (e.g. "Oral History").
	 * Ambiguous names produce an 'ambiguous_section' error with candidates.
	 *
	 * When `include_tipos` is true, each field entry gains a `tipo` property
	 * so callers can directly address components without a label round-trip.
	 *
	 * Request:
	 *   {
	 *     "action": "describe_section",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":  "oh1",
	 *       "lang":          "lg-eng",   // optional, defaults to DEDALO_DATA_LANG
	 *       "include_tipos": false       // optional, default false
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "section_label": "Oral History",
	 *     "section_tipo": "oh1",
	 *     "lang": "lg-eng",
	 *     "fields": [
	 *       {"label":"Title","type":"text"},
	 *       {"label":"Informant","type":"link","target":"Person"}
	 *     ]
	 *   }
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function describe_section( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. describe_section request failed';
			$response->errors	= [];

		$source			= $rqo->source ?? new stdClass();
		$section_tipo	= $source->section_tipo ?? null;
		$lang			= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);
		$include_tipos	= (bool)($source->include_tipos ?? false);

		if (empty($section_tipo) || !is_string($section_tipo)) {
			$response->msg		= 'Error. Missing or invalid source.section_tipo';
			$response->errors[]	= 'missing_section_tipo';
			return $response;
		}

		// Resolve human name → tipo (e.g. "Cecas" → "numisdata6").
		// Errors are written into $response by the helper; false means bail out.
		$section_tipo = self::resolve_section_identifier($section_tipo, $lang, $response);
		if ($section_tipo === false) return $response;

		// Permissions: read (>=1) on the section.
		// Both arguments are the section_tipo; dd_core_api uses the same pattern
		// when checking section-level access (no separate "read" component_tipo).
		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 1) {
			$response->msg		= "Error. Insufficient permissions to read section '$section_tipo'";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}

		try {
			$view = agent_view_builder::section_to_view($section_tipo, $lang, $include_tipos);
		} catch (\Throwable $e) {
			// agent_view_builder may throw if the ontology node is missing or
			// the section has no accessible components.
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= 'builder_error';
			debug_log(__METHOD__ . ' ' . $e->getMessage(), logger::ERROR);
			return $response;
		}

		$response->result	= $view;
		$response->msg		= 'OK. describe_section done';

		return $response;
	}//end describe_section



	/**
	 * READ_RECORD_VIEW
	 * Returns one record as the flat agent-view shape: a `{label: value}` map
	 * where values are scalars for text/date/number fields, or
	 * `[{ref, label, ...}]` arrays for link/portal fields.
	 *
	 * Enforces two permission layers: section-level read permission and a
	 * per-record user-scope assertion (same gates as dd_core_api::read).
	 *
	 * `source.section_tipo` accepts a tipo ("oh1") or a human name
	 * ("Oral History") in the request language.
	 *
	 * When `include_tipos` is true, a `_meta` object is appended to the
	 * result containing the canonical `section_tipo` and a `field_tipos` map
	 * (human label → tipo) for all fields — useful when the caller needs to
	 * pass tipos to subsequent write operations.
	 *
	 * Request:
	 *   {
	 *     "action": "read_record_view",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":  "oh1",
	 *       "section_id":    42,
	 *       "lang":          "lg-eng",
	 *       "include_tipos": false       // optional, adds _meta.field_tipos
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "section_label": "Oral History",
	 *     "section_tipo": "oh1",
	 *     "section_id": 42,
	 *     "lang": "lg-eng",
	 *     "fields": {
	 *       "Title": "Interview with X",
	 *       "Informant": [{ "ref":"rsc197#7","label":"Person#7", ... }]
	 *     },
	 *     "_meta": { "section_tipo": "oh1", "field_tipos": { "Title":"oh14", ... } }
	 *   }
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function read_record_view( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. read_record_view request failed';
			$response->errors	= [];

		$source			= $rqo->source ?? new stdClass();
		$section_tipo	= $source->section_tipo ?? null;
		$section_id_raw	= $source->section_id ?? null;
		$lang			= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);
		$include_tipos	= (bool)($source->include_tipos ?? false);

		if (empty($section_tipo) || !is_string($section_tipo)) {
			$response->msg		= 'Error. Missing or invalid source.section_tipo';
			$response->errors[]	= 'missing_section_tipo';
			return $response;
		}
		if ($section_id_raw === null || $section_id_raw === '' || !is_numeric($section_id_raw)) {
			$response->msg		= 'Error. Missing or invalid source.section_id';
			$response->errors[]	= 'missing_section_id';
			return $response;
		}
		$section_id = (int)$section_id_raw;

		// Resolve human name → tipo.
		$section_tipo = self::resolve_section_identifier($section_tipo, $lang, $response);
		if ($section_tipo === false) return $response;

		// Permissions: read (>=1) on the section, plus per-record scope check
		// to match the gates applied across `dd_core_api` (see SEC-024).
		// The scope assertion throws when the record belongs to a project the
		// current user cannot access (multi-project installations).
		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 1) {
			$response->msg		= "Error. Insufficient permissions to read section '$section_tipo'";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}
		try {
			security::assert_record_in_user_scope($section_tipo, $section_id, __METHOD__);
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Record not in user scope';
			$response->errors[]	= 'out_of_scope';
			return $response;
		}

		try {
			$view = agent_view_builder::record_to_view($section_tipo, $section_id, $lang, $include_tipos);
		} catch (\Throwable $e) {
			// Propagate builder errors (e.g. missing section in DB) without
			// leaking internal stack traces to the LLM caller.
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= 'builder_error';
			debug_log(__METHOD__ . ' ' . $e->getMessage(), logger::ERROR);
			return $response;
		}

		$response->result	= $view;
		$response->msg		= 'OK. read_record_view done';

		return $response;
	}//end read_record_view



	/**
	 * SEARCH_RECORDS_VIEW
	 * Search records in a section and return a paginated list of agent-view
	 * shapes. Filter rules use human field labels that are resolved to tipos
	 * internally via `build_sqo_filter_from_label_rules`.
	 *
	 * Two queries are issued when `full_count` is true: a COUNT query (separate
	 * SQO clone with `full_count=true`) followed by the ordinary record-fetch
	 * query. Both share the same filter so counts and records are consistent.
	 * Count failures are logged as warnings but do not abort the request;
	 * `pagination.total` will be null if the count step fails.
	 *
	 * Individual records that cannot be built (e.g. orphaned matrix rows) are
	 * skipped with a WARNING log entry rather than aborting the entire response.
	 *
	 * Request:
	 *   {
	 *     "action": "search_records_view",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":  "oh1",
	 *       "lang":          "lg-eng",
	 *       "limit":         10,          // default 10
	 *       "offset":        0,           // default 0
	 *       "full_count":    false,       // set true to populate pagination.total
	 *       "include_tipos": false,       // set true to include _meta.field_tipos
	 *       "filter": {
	 *         "operator": "AND",
	 *         "rules": [
	 *           { "field": "Title", "operator": "contains", "value": "Picasso" }
	 *         ]
	 *       }
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "section_tipo": "oh1",
	 *     "section_label": "Oral History",
	 *     "lang": "lg-eng",
	 *     "records": [ { ...agent view... }, ... ],
	 *     "pagination": { "limit":10, "offset":0, "total":42, "count":10 }
	 *   }
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function search_records_view( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. search_records_view request failed';
			$response->errors	= [];

		$source			= $rqo->source ?? new stdClass();
		$section_tipo	= $source->section_tipo ?? null;
		$lang			= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);
		$limit			= (int)($source->limit ?? 10);
		$offset			= (int)($source->offset ?? 0);
		$full_count		= (bool)($source->full_count ?? false);
		$include_tipos	= (bool)($source->include_tipos ?? false);
		$filter			= $source->filter ?? null;

		if (empty($section_tipo) || !is_string($section_tipo)) {
			$response->msg		= 'Error. Missing or invalid source.section_tipo';
			$response->errors[]	= 'missing_section_tipo';
			return $response;
		}

		// Resolve human name → tipo.
		$section_tipo = self::resolve_section_identifier($section_tipo, $lang, $response);
		if ($section_tipo === false) return $response;

		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 1) {
			$response->msg		= "Error. Insufficient permissions to read section '$section_tipo'";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}

		// Build SQO
		// section_tipo is wrapped in an array because SQO supports multi-section
		// searches; here we always target exactly one section.
		$sqo = new search_query_object();
		$sqo->set_section_tipo([$section_tipo]);
		$sqo->set_limit($limit);
		$sqo->set_offset($offset);

		// Resolve label-based filters to tipo-based SQO filters.
		// Unknown field labels within the filter are silently skipped (best-effort).
		if (!empty($filter) && is_object($filter) && !empty($filter->rules)) {
			$sqo_filter = self::build_sqo_filter_from_label_rules($section_tipo, $lang, $filter);
			if ($sqo_filter !== null) {
				$sqo->set_filter($sqo_filter);
			}
		}

		// Count (optional) — must be done separately because full_count on the
		// SQO changes search() to a COUNT query that returns {full_count} rows,
		// not {section_id,section_tipo} records.
		// The SQO is cloned so the record-fetch SQO below is unaffected.
		$total = null;
		if ($full_count) {
			try {
				$count_sqo = clone $sqo;
				$count_sqo->full_count = true;
				$count_search = search::get_instance($count_sqo);
				$count_data = $count_search->count();
				$total = $count_data->total ?? null;
			} catch (\Throwable $e) {
				// Non-fatal: log and continue without a total count.
				debug_log(__METHOD__ . ' Count query failed: ' . $e->getMessage(), logger::WARNING);
			}
		}

		// Record search — always without full_count so we get actual records.
		try {
			$search		= search::get_instance($sqo);
			$db_result	= $search->search();
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Search execution failed: ' . $e->getMessage();
			$response->errors[]	= 'search_error';
			debug_log(__METHOD__ . ' ' . $e->getMessage(), logger::ERROR);
			return $response;
		}

		$records = [];

		foreach ($db_result as $section_record) {
			$record_section_id = (int)($section_record->section_id ?? 0);
			if ($record_section_id < 1) continue;

			try {
				$view = agent_view_builder::record_to_view($section_tipo, $record_section_id, $lang, $include_tipos);
				$records[] = $view;
			} catch (\Throwable $e) {
				debug_log(__METHOD__ . ' Skipping record ' . $record_section_id . ' error: ' . $e->getMessage(), logger::WARNING);
			}
		}

		$section_label = agent_view_builder::label_for_tipo($section_tipo, $lang);

		$response->result = (object)[
			'section_tipo'	=> $section_tipo,
			'section_label'	=> $section_label,
			'lang'			=> $lang,
			'records'		=> $records,
			'pagination'	=> (object)[
				'limit'		=> $limit,
				'offset'	=> $offset,
				'total'		=> $total,
				'count'		=> count($records),
			],
		];
		$response->msg = 'OK. search_records_view done';

		return $response;
	}//end search_records_view



	/**
	 * COUNT_RECORDS
	 * Returns the total number of records in a section that match an optional
	 * human-label filter. This is a lightweight alternative to
	 * `search_records_view` with `full_count=true` when only the count is
	 * needed (no record bodies are fetched or built).
	 *
	 * The SQO has `full_count=true` set on a clone so the underlying
	 * `search::count()` path is used rather than the record-fetch path.
	 *
	 * Request:
	 *   {
	 *     "action": "count_records",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo": "oh1",
	 *       "lang":         "lg-eng",
	 *       "filter": {
	 *         "operator": "AND",
	 *         "rules": [
	 *           { "field": "Title", "operator": "contains", "value": "Picasso" }
	 *         ]
	 *       }
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "section_tipo": "oh1",
	 *     "section_label": "Oral History",
	 *     "total": 42
	 *   }
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function count_records( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. count_records request failed';
			$response->errors	= [];

		$source			= $rqo->source ?? new stdClass();
		$section_tipo	= $source->section_tipo ?? null;
		$lang			= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);
		$filter			= $source->filter ?? null;

		if (empty($section_tipo) || !is_string($section_tipo)) {
			$response->msg		= 'Error. Missing or invalid source.section_tipo';
			$response->errors[]	= 'missing_section_tipo';
			return $response;
		}

		// Resolve human name → tipo.
		$section_tipo = self::resolve_section_identifier($section_tipo, $lang, $response);
		if ($section_tipo === false) return $response;

		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 1) {
			$response->msg		= "Error. Insufficient permissions to read section '$section_tipo'";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}

		// Build SQO
		$sqo = new search_query_object();
			$sqo->set_section_tipo([$section_tipo]);

		// Resolve label-based filters to tipo-based SQO filters.
		// Unknown field labels are silently skipped (best-effort).
		if (!empty($filter) && is_object($filter) && !empty($filter->rules)) {
			$sqo_filter = self::build_sqo_filter_from_label_rules($section_tipo, $lang, $filter);
			if ($sqo_filter !== null) {
				$sqo->set_filter($sqo_filter);
			}
		}

		// Execute count — clone the SQO to avoid mutating the base object in
		// case the SQO is reused for debugging or extended by subclasses later.
		try {
			$count_sqo = clone $sqo;
			$count_sqo->full_count = true;
			$search		= search::get_instance($count_sqo);
			$count_data	= $search->count();
			$total		= $count_data->total ?? 0;
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Count execution failed: ' . $e->getMessage();
			$response->errors[]	= 'count_error';
			debug_log(__METHOD__ . ' ' . $e->getMessage(), logger::ERROR);
			return $response;
		}

		$section_label = agent_view_builder::label_for_tipo($section_tipo, $lang);

		$response->result = (object)[
			'section_tipo'	=> $section_tipo,
			'section_label'	=> $section_label,
			'total'			=> $total,
		];
		$response->msg = 'OK. count_records done';

		return $response;
	}//end count_records



	/**
	 * SET_FIELD_BY_LABEL
	 * Updates one field on a record using its human label (resolved to tipo
	 * internally). Returns the updated record in agent-view shape after save.
	 *
	 * Permission model: write (≥ 2) is required at both the section level and
	 * the specific component level. The per-record scope assertion is also
	 * applied (same as read_record_view).
	 *
	 * Write strategy depends on the field type:
	 * - LINK models (component_relation_*): the caller provides an array of
	 *   `{section_tipo, section_id}` locator objects. When `clean=false`
	 *   (default), new locators are merged with existing ones, deduplicating
	 *   by `locator::in_array_locator`. When `clean=true`, existing locators
	 *   are replaced entirely. Link values are normalised via
	 *   `agent_view_builder::normalize_link_value`.
	 * - Scalar models (text, html, number, date, etc.): `action=insert` with
	 *   `key=0` is used so translatable components resolve the existing row id
	 *   and overwrite only the target language column.
	 *
	 * The response record_view reflects the post-save state. If the view build
	 * fails after a successful save, `record_view` is null but the result
	 * object is still returned (the save is not rolled back).
	 *
	 * Source params:
	 *   - section_tipo: tipo or human name of the section
	 *   - section_id:   integer record identifier
	 *   - field:        human label of the field to update (must match describe_section)
	 *   - value:        new value; shape depends on field type (see above)
	 *   - lang:         optional language code (ISO 639 or lg-xxx format)
	 *   - clean:        optional bool, default false; when true replaces link data entirely
	 *
	 * Request:
	 *   {
	 *     "action": "set_field_by_label",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":  "oh1",
	 *       "section_id":    42,
	 *       "field":         "Title",
	 *       "value":         "New Title",
	 *       "lang":          "lg-eng",
	 *       "clean":         false
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "section_tipo": "oh1",
	 *     "section_id": 42,
	 *     "field": "Title",
	 *     "tipo": "oh14",
	 *     "record_view": { ... }
	 *   }
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function set_field_by_label( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. set_field_by_label request failed';
			$response->errors	= [];

		$source			= $rqo->source ?? new stdClass();
		$section_tipo	= $source->section_tipo ?? null;
		$section_id_raw	= $source->section_id ?? null;
		$field			= $source->field ?? null;
		$value			= $source->value ?? null;
		$clean			= !empty($source->clean);
		$lang			= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);

		if (empty($section_tipo) || !is_string($section_tipo)) {
			$response->msg		= 'Error. Missing or invalid source.section_tipo';
			$response->errors[]	= 'missing_section_tipo';
			return $response;
		}
		if ($section_id_raw === null || $section_id_raw === '' || !is_numeric($section_id_raw)) {
			$response->msg		= 'Error. Missing or invalid source.section_id';
			$response->errors[]	= 'missing_section_id';
			return $response;
		}
		$section_id = (int)$section_id_raw;

		if (empty($field) || !is_string($field)) {
			$response->msg		= 'Error. Missing or invalid source.field';
			$response->errors[]	= 'missing_field';
			return $response;
		}

		// Resolve human name → tipo.
		$section_tipo = self::resolve_section_identifier($section_tipo, $lang, $response);
		if ($section_tipo === false) return $response;

		// Permissions: write (>=2) on the section.
		// Section-level permission is checked first; component-level write is
		// verified separately below after the field label is resolved to a tipo.
		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 2) {
			$response->msg		= "Error. Insufficient permissions to write section '$section_tipo'";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}

		try {
			security::assert_record_in_user_scope($section_tipo, $section_id, __METHOD__);
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Record not in user scope';
			$response->errors[]	= 'out_of_scope';
			return $response;
		}

		// Resolve label → tipo.
		// On failure, expose the full list of available field labels so the LLM
		// can self-correct without requiring a prior describe_section call.
		$descriptor = agent_view_builder::resolve_field($section_tipo, $lang, $field);
		if ($descriptor === null) {
			$available = agent_view_builder::available_fields($section_tipo, $lang);
			$response->msg		= "Error. Unknown field '$field' for section '$section_tipo'. Available: " . implode(', ', $available);
			$response->errors[]	= 'unknown_field';
			$response->hint		= (object)['available_fields' => $available];
			return $response;
		}

		$tipo	= $descriptor->tipo;
		$model	= $descriptor->model;

		// Component permissions (per-component write check).
		// A user may have section write access but be restricted from specific
		// components (e.g. security_access fields). Both checks are required.
		$component_permissions = common::get_permissions($section_tipo, $tipo);
		if ($component_permissions < 2) {
			$response->msg		= "Error. Insufficient permissions to write component '$tipo' ($field)";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}

		try {
			// Instantiate in 'edit' mode so the component resolves its full
			// data and applies edit-mode formatting rules (locator resolution,
			// etc.) rather than the read-only 'list' view.
			$component = component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo
			);
			if ($component === null) {
				throw new Exception("Could not instantiate component $tipo");
			}
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Component instantiation failed: ' . $e->getMessage();
			$response->errors[]	= 'component_error';
			return $response;
		}

		// Build changed_data and apply
		try {
			// For link/portal models, normalise agent-view ref objects into
			// Dédalo locator arrays before writing.
			$is_link = in_array($model, agent_view_builder::LINK_MODELS, true);

			if ($is_link) {
				$resolved_value = agent_view_builder::normalize_link_value($value);
				if (empty($resolved_value)) {
					$response->msg		= "Error. Link field '{$field}' requires locator value(s) like [{section_tipo, section_id}]. Received: " . substr(json_encode($value), 0, 200);
					$response->errors[]	= 'invalid_link_value';
					$response->hint		= (object)['expected_format' => '[{"section_tipo":"rsc197","section_id":7}]'];
					return $response;
				}

				if ($clean) {
					// Replace all locators entirely
					$changed_data = (object)[
						'action'	=> 'set_data',
						'value'		=> $resolved_value
					];
				} else {
					// Merge with existing data, avoiding duplicates
					$existing	= $component->get_data() ?? [];
					$merged		= $existing;
					foreach ($resolved_value as $new_loc) {
						if (!locator::in_array_locator($new_loc, $merged)) {
							$merged[] = $new_loc;
						}
					}
					$changed_data = (object)[
						'action'	=> 'set_data',
						'value'		=> $merged
					];
				}
			} else {
				// Scalar components (text, html, number, date, media):
				// 'insert' on monovalue components replaces the single value.
				// key=0 resolves the id from existing data so translatable
				// components stay in sync across language columns.
				$changed_data = (object)[
					'action'	=> 'insert',
					'id'		=> null,
					'key'		=> 0,
					'value'		=> (object)[
						'value'	=> $value,
						'id'	=> null,
						'lang'	=> $lang
					]
				];
			}

			$update_result = $component->update_data_value($changed_data);
			if ($update_result === false) {
				$response->msg		= 'Error. update_data_value failed for field ' . $field;
				$response->errors[]	= 'update_failed';
				return $response;
			}

			$save_result = $component->save();
			if ($save_result === null || $save_result === false) {
				$response->msg		= 'Error. Save failed for field ' . $field;
				$response->errors[]	= 'save_failed';
				return $response;
			}
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Write failed: ' . $e->getMessage();
			$response->errors[]	= 'write_error';
			debug_log(__METHOD__ . ' ' . $e->getMessage(), logger::ERROR);
			return $response;
		}

		// Return updated record view.
		// Errors here are non-fatal: the save already succeeded. A null
		// record_view signals that the view could not be built (e.g. a
		// transient ontology cache miss) but the data is persisted.
		try {
			$record_view = agent_view_builder::record_to_view($section_tipo, $section_id, $lang, false);
		} catch (\Throwable $e) {
			$record_view = null;
		}

		$response->result = (object)[
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'field'			=> $field,
			'tipo'			=> $tipo,
			'record_view'	=> $record_view,
		];
		$response->msg = 'OK. set_field_by_label done';

		return $response;
	}//end set_field_by_label



	/**
	 * BUILD_SQO_FILTER_FROM_LABEL_RULES
	 * Converts a human-label filter tree into a Dédalo SQO filter object
	 * consumable by `search::get_instance()`.
	 *
	 * Each rule's `field` is resolved to a component tipo via
	 * `agent_view_builder::resolve_field`. Rules whose field label cannot be
	 * resolved are silently skipped (best-effort policy — the caller receives
	 * partial results rather than an error, because an LLM may produce a
	 * slightly mis-cased label).
	 *
	 * Operator mapping:
	 * - 'eq' / 'equals' / '='  → exact match ('=')
	 * - 'lt' / '<'             → less-than ('<')
	 * - 'lte' / '<='           → less-than-or-equal ('<=')
	 * - 'gt' / '>'             → greater-than ('>')
	 * - 'gte' / '>='           → greater-than-or-equal ('>=')
	 * - 'contains' / 'like' / '~=' / 'starts_with' / 'ends_with' / unknown
	 *                          → null (Dédalo default unaccented LIKE search)
	 *
	 * Note: 'starts_with' and 'ends_with' both map to null because the SQO
	 * does not natively support anchored LIKE clauses. Both execute as
	 * unanchored contains searches — callers should be aware of this.
	 *
	 * Returns null when no valid rules could be built (all labels unknown),
	 * so callers can skip `set_filter` rather than setting an empty filter.
	 *
	 * @param string $section_tipo - Canonical section tipo for label resolution
	 * @param string $lang         - Language code used to look up field labels
	 * @param object $filter       - { operator: "AND"|"OR", rules: [{field, operator, value}, ...] }
	 * @return object|null         - SQO-compatible filter object, or null when no rules matched
	 */
	private static function build_sqo_filter_from_label_rules( string $section_tipo, string $lang, object $filter ) : ?object {

		// Map filter-level operator to the SQO $and / $or key.
		// All other values default to $and (most-restrictive, safest default).
		$operator = ($filter->operator ?? 'AND') === 'OR' ? '$or' : '$and';
		$rules = [];

		foreach ($filter->rules as $rule) {
			if (!is_object($rule)) continue;

			$field_label = $rule->field ?? null;
			$ope = $rule->operator ?? 'contains';
			$val = $rule->value ?? '';

			if (empty($field_label)) continue;

			$descriptor = agent_view_builder::resolve_field($section_tipo, $lang, $field_label);
			if ($descriptor === null) {
				// Unknown label — skip this rule (best-effort).
				// An LLM may send a slightly mis-cased or stale field name;
				// returning a partial result is more useful than a hard error.
				continue;
			}

			$component_tipo = $descriptor->tipo;

			// Map friendly operators to SQO q_operator values.
			// null = Dédalo default (unaccented contains-like JSONB text search).
			// '='  = exact JSONB equality match.
			$q_operator = match ($ope) {
				'eq', 'equals', '='       => '=',
				'lt', '<'                 => '<',
				'lte', '<='               => '<=',
				'gt', '>'                 => '>',
				'gte', '>='               => '>=',
				'contains', 'like', '~='  => null,
				'starts_with'             => null,
				'ends_with'               => null,
				default                   => null,
			};

			$sqo_rule = new stdClass();
				$sqo_rule->q		= $val;
				$sqo_rule->q_operator = $q_operator;
				$sqo_rule->path		= [(object)[
					'section_tipo'		=> $section_tipo,
					'component_tipo'	=> $component_tipo,
				]];
				$sqo_rule->type		= 'jsonb';
				$sqo_rule->unaccent	= true;

			$rules[] = $sqo_rule;
		}

		if (empty($rules)) {
			return null;
		}

		$sqo_filter = new stdClass();
		$sqo_filter->{$operator} = $rules;

		return $sqo_filter;
	}//end build_sqo_filter_from_label_rules



	/**
	 * NORMALISE_LANG
	 * Converts ISO 639-1 two-letter codes that LLMs commonly emit (e.g. "es",
	 * "en") into Dédalo's internal lg-xxx format (ISO 639-2/B three-letter
	 * codes, prefixed with "lg-", e.g. "lg-spa"). Codes already in lg-xxx form
	 * are passed through unchanged. Unrecognised codes fall back to the global
	 * DEDALO_DATA_LANG constant rather than raising an error, so LLM calls with
	 * imprecise language strings still produce useful results.
	 *
	 * @param string $lang - ISO 639-1 code ("en") or Dédalo lg-xxx code ("lg-eng")
	 * @return string      - Normalised Dédalo language code (e.g. "lg-eng")
	 */
	private static function normalise_lang( string $lang ) : string {

		if (str_starts_with($lang, 'lg-')) {
			return $lang;
		}

		$iso2to3 = [
			'en' => 'lg-eng', 'es' => 'lg-spa', 'fr' => 'lg-fra',
			'de' => 'lg-deu', 'it' => 'lg-ita', 'pt' => 'lg-por',
			'ca' => 'lg-cat', 'gl' => 'lg-glg', 'eu' => 'lg-eus',
			'nl' => 'lg-nld', 'ru' => 'lg-rus', 'ja' => 'lg-jpn',
			'zh' => 'lg-zho', 'ar' => 'lg-ara', 'hi' => 'lg-hin',
			'ko' => 'lg-kor',
		];

		$key = strtolower(trim($lang));

		return $iso2to3[$key] ?? DEDALO_DATA_LANG;
	}//end normalise_lang



	/**
	 * RESOLVE_SECTION_IDENTIFIER
	 * Accepts a section identifier that may be a canonical tipo (e.g. "oh1")
	 * or a human name in any supported language (e.g. "Cecas", "Oral History")
	 * and resolves it to the canonical section_tipo string.
	 *
	 * Resolution strategy:
	 * 1. Fast path: if the identifier matches the pattern /^[a-z]{1,5}[0-9]+$/i
	 *    (standard Dédalo tipo format), confirm it is a section via
	 *    `ontology_node::get_model_by_tipo`. Non-section tipos (e.g. component
	 *    tipos) trigger an immediate 'not_a_section' error rather than falling
	 *    through to label search.
	 * 2. Label path: delegates to `agent_view_builder::resolve_section_tipo`
	 *    which scans the ontology label index across all configured languages.
	 *    Returns a string on unique match, an object with `labels` map on
	 *    ambiguous match, or null when no section matches.
	 *
	 * On failure, writes a descriptive message and error code into `$response`
	 * (passed by value but mutated via object reference) and returns false so
	 * callers can immediately `return $response`.
	 *
	 * @param string $identifier - Tipo or human name of the section
	 * @param string $lang       - Language code for label resolution
	 * @param object $response   - Response envelope; errors are appended on failure
	 * @return string|false      - Canonical section_tipo, or false on failure
	 */
	private static function resolve_section_identifier( string $identifier, string $lang, object $response ) : string|false {

		// Fast path: if it looks like a tipo and IS a section, return directly.
		// The regex matches standard Dédalo tipo patterns: 1-5 letters + digits
		// (e.g. "oh1", "numisdata6", "dd345"). The second argument `true` to
		// get_model_by_tipo allows a null-safe fallback.
		if (preg_match('/^[a-z]{1,5}[0-9]+$/i', $identifier) === 1) {
			$model = ontology_node::get_model_by_tipo($identifier, true);
			if ($model === 'section') {
				return $identifier;
			}
			// Looks like a tipo but isn't a section — don't fall through to
			// label search (the user likely passed a component tipo by mistake).
			$response->msg		= "Error. tipo '$identifier' is not a section (model=$model)";
			$response->errors[]	= 'not_a_section';
			return false;
		}

		// Resolve via label matching across all sections and languages.
		$resolved = agent_view_builder::resolve_section_tipo($identifier, $lang);

		if ($resolved === null) {
			$response->msg		= "Error. Unknown section '$identifier'. Use the section name (e.g. 'Cecas') or its tipo.";
			$response->errors[]	= 'unknown_section';
			return false;
		}

		if (is_object($resolved)) {
			// Ambiguous — multiple sections share this label. Surface all
			// candidates with their tipos so the LLM can disambiguate.
			$labels = [];
			foreach ($resolved->labels as $st => $label) {
				$labels[] = "$label ($st)";
			}
			$response->msg		= "Error. Section '$identifier' is ambiguous. Candidates: " . implode(', ', $labels);
			$response->errors[]	= 'ambiguous_section';
			$response->hint		= (object)['candidates' => $resolved->labels];
			return false;
		}

		return $resolved;
	}//end resolve_section_identifier



	/**
	 * GET_MEDIA_URL
	 * Returns the public URL of a media component for a given record without
	 * building a full agent-view payload. Designed for batch pipelines (e.g.
	 * bulk image analysis) where `read_record_view` overhead is unnecessary.
	 *
	 * `source.component_tipo` accepts either a canonical tipo ("numisdata18")
	 * or a human field label (resolved via `agent_view_builder::resolve_field`).
	 * When resolution fails, `ontology_node::get_model_by_tipo` is tried
	 * directly as a fallback for callers that already know the tipo.
	 *
	 * Media model guard: the component must be an instance of (or a known
	 * subclass of) `component_media_common`. The check uses a two-step test:
	 * `is_subclass_of` first (works for loaded classes), then an explicit
	 * allowlist fallback for models loaded lazily or not yet instantiated.
	 * Accepted models: component_image, component_av, component_pdf, component_3d.
	 *
	 * URL resolution delegates to `component_media_common::get_url` with:
	 * - `test_file=true`     — validates the file exists on disk
	 * - `default_add=false`  — returns null rather than a placeholder URL
	 *                          when the file is absent (so callers can detect absence)
	 *
	 * When no `quality` is supplied, the component's own `get_quality()` default
	 * is used (component-class-specific, e.g. "1.5MB" for images).
	 *
	 * Request:
	 *   {
	 *     "action": "get_media_url",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":   "numisdata6",
	 *       "section_id":     42,
	 *       "component_tipo": "numisdata18",  // tipo OR human label
	 *       "quality":        "1.5MB",        // optional
	 *       "absolute":       true            // optional, default true
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "url":          "https://.../numisdata18/1.5MB/numisdata18-42.jpg",
	 *     "quality":      "1.5MB",
	 *     "extension":    "jpg",
	 *     "file_exist":   true,
	 *     "model":        "component_image",
	 *     "section_tipo": "numisdata6",
	 *     "section_id":   42,
	 *     "component_tipo": "numisdata18"
	 *   }
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function get_media_url( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. get_media_url request failed';
			$response->errors	= [];

		$source				= $rqo->source ?? new stdClass();
		$section_tipo		= $source->section_tipo ?? null;
		$section_id_raw		= $source->section_id ?? null;
		$component_tipo		= $source->component_tipo ?? null;
		$quality			= $source->quality ?? null;
		$absolute			= isset($source->absolute) ? (bool)$source->absolute : true;
		$lang				= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);

		if (empty($section_tipo) || !is_string($section_tipo)) {
			$response->msg		= 'Error. Missing or invalid source.section_tipo';
			$response->errors[]	= 'missing_section_tipo';
			return $response;
		}
		if ($section_id_raw === null || $section_id_raw === '' || !is_numeric($section_id_raw)) {
			$response->msg		= 'Error. Missing or invalid source.section_id';
			$response->errors[]	= 'missing_section_id';
			return $response;
		}
		if (empty($component_tipo) || !is_string($component_tipo)) {
			$response->msg		= 'Error. Missing or invalid source.component_tipo';
			$response->errors[]	= 'missing_component_tipo';
			return $response;
		}
		$section_id = (int)$section_id_raw;

		// Resolve human name → tipo (section identifier may be a label).
		$section_tipo = self::resolve_section_identifier($section_tipo, $lang, $response);
		if ($section_tipo === false) return $response;

		// Permissions: read (>=1) on the section + per-record scope check.
		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 1) {
			$response->msg		= "Error. Insufficient permissions to read section '$section_tipo'";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}
		try {
			security::assert_record_in_user_scope($section_tipo, $section_id, __METHOD__);
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Record not in user scope';
			$response->errors[]	= 'out_of_scope';
			return $response;
		}

		// Resolve the component model. The caller may have passed a tipo or a
		// human label; we try the label resolver first to mirror set_field_by_label.
		$descriptor = agent_view_builder::resolve_field($section_tipo, $lang, $component_tipo);
		if ($descriptor !== null) {
			$component_tipo = $descriptor->tipo;
			$model			= $descriptor->model;
		} else {
			$model = ontology_node::get_model_by_tipo($component_tipo, true);
		}

		// (!) Two-step media model guard:
		// is_subclass_of works reliably only when the class is already loaded.
		// For lazily-autoloaded component classes that may not be in memory yet,
		// fall back to an explicit allowlist. Both steps must clear before the
		// component is instantiated.
		if (empty($model) || !is_subclass_of($model, 'component_media_common') && $model !== 'component_media_common') {
			// Accept any known descendant of component_media_common (image, av, pdf, 3d).
			$is_media_model = in_array($model, ['component_image', 'component_av', 'component_pdf', 'component_3d'], true);
			if (!$is_media_model) {
				$response->msg		= "Error. Component '$component_tipo' is not a media component (model=$model)";
				$response->errors[]	= 'not_a_media_component';
				return $response;
			}
		}

		try {
			$component = component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);
			if ($component === null) {
				throw new Exception("Could not instantiate media component $component_tipo");
			}
		} catch (\Throwable $e) {
			$response->msg		= 'Error. Component instantiation failed: ' . $e->getMessage();
			$response->errors[]	= 'component_error';
			return $response;
		}

		// Resolve URL via component_media_common::get_url. test_file=true so a
		// missing original falls back to the Dédalo "0.jpg" placeholder; the
		// flag default_add=false keeps null for missing files so the caller
		// can detect absence.
		try {
			$resolved_quality = $quality ?: (method_exists($component, 'get_quality') ? $component->get_quality() : null);

			$url = $component->get_url(
				$resolved_quality,
				true,      // test_file
				$absolute, // absolute
				false      // default_add
			);

			$extension = method_exists($component, 'get_extension') ? $component->get_extension() : null;
			$file_exist = $url !== null;
		} catch (\Throwable $e) {
			$response->msg		= 'Error. URL resolution failed: ' . $e->getMessage();
			$response->errors[]	= 'url_error';
			debug_log(__METHOD__ . ' ' . $e->getMessage(), logger::ERROR);
			return $response;
		}

		$response->result = (object)[
			'url'			=> $url,
			'quality'		=> $resolved_quality,
			'extension'		=> $extension,
			'file_exist'	=> $file_exist,
			'model'			=> $model,
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'component_tipo'=> $component_tipo,
		];
		$response->msg = 'OK. get_media_url done';

		return $response;
	}//end get_media_url





	/**
	 * LIST_SECTIONS_INDEX
	 * Returns a compact `[{tipo, label}]` index of all sections the current
	 * user has read access to. Labels include all configured languages so
	 * callers can pick the most appropriate one.
	 *
	 * Data source priority:
	 * 1. Pre-built artifact `ontology_llm_map.json` (generated by the ontology
	 *    map build tool). Fast — a single file read with request-level caching.
	 * 2. Live scan of `dd_ontology` via `dd_ontology_db_manager::search` when
	 *    the artifact is absent. Slower but always current.
	 *
	 * Permission filtering is applied in both paths: sections the current user
	 * cannot read (permission < 1) are excluded from the index.
	 *
	 * Request:
	 *   {
	 *     "action": "list_sections_index",
	 *     "dd_api": "dd_agent_api",
	 *     "source": { "lang": "lg-eng" }   // lang used for normalisation only
	 *   }
	 *
	 * Response.result:
	 *   [
	 *     {"tipo": "oh1",        "label": {"lg-eng": "Oral History", "lg-spa": "Historia oral"}},
	 *     {"tipo": "numisdata6", "label": {"lg-eng": "Coin"}},
	 *     ...
	 *   ]
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function list_sections_index( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. list_sections_index request failed';
			$response->errors	= [];

		$source	= $rqo->source ?? new stdClass();
		$lang	= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);

		// Load pre-built LLM map.
		// Returns null when the artifact file is absent or unreadable.
			$map = self::load_llm_map();

		// Fallback: live scan of dd_ontology.
		// Used on instances that have not generated the artifact yet.
			if ($map === null) {
				$section_tipos = dd_ontology_db_manager::search(['model' => 'section'], true);
				if (!is_array($section_tipos)) {
					$response->msg		= 'Error. Unable to list sections from ontology';
					$response->errors[]	= 'db_query_failed';
					return $response;
				}
				$map = [];
				foreach ($section_tipos as $section_tipo) {
					$node		= ontology_node::get_instance($section_tipo);
					$term_data	= $node->get_term_data() ?? new stdClass();
					$map[]		= (object)['tipo' => $section_tipo, 'label' => $term_data, 'fields' => []];
				}
			}

		// Permission filter + build compact index.
		// Cast each entry to object to handle both array-decoded and object-decoded JSON.
			$index = [];
			foreach ($map as $entry) {
				$entry		= (object)$entry;
				$stipo		= $entry->tipo ?? null;
				if (empty($stipo)) continue;

				$permissions = common::get_permissions($stipo, $stipo);
				if ($permissions < 1) continue;

				$index[] = (object)[
					'tipo'	=> $stipo,
					'label'	=> $entry->label ?? new stdClass(),
				];
			}

		$response->result	= $index;
		$response->msg		= 'OK. list_sections_index done';

		return $response;
	}//end list_sections_index



	/**
	 * GET_SECTION_MAP
	 * Returns the full field map for a single section: canonical tipo,
	 * multilingual labels for the section and every component field, simplified
	 * field types, and portal target tipos where applicable.
	 *
	 * Accepts a human-readable section name (any configured language) or a
	 * canonical tipo identifier as `source.section`.
	 *
	 * Data source priority (same as list_sections_index):
	 * 1. Pre-built `ontology_llm_map.json` artifact — O(1) lookup by tipo.
	 * 2. Live build via `agent_view_builder::section_label_map` + ontology node
	 *    queries when the artifact is absent or does not contain the section.
	 *
	 * The `_meta` envelope and `include_tipos` flag used by describe_section
	 * are NOT present here; tipos are always included at the field level so
	 * the map can be used as a self-contained label↔tipo dictionary.
	 *
	 * Request:
	 *   {
	 *     "action": "get_section_map",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section": "Oral History",   // human name OR tipo (e.g. "oh1")
	 *       "lang":    "lg-eng"          // optional
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "tipo":   "oh1",
	 *     "label":  {"lg-eng": "Oral History", "lg-spa": "Historia oral"},
	 *     "fields": [
	 *       {"tipo":"oh14","label":{"lg-eng":"Title"},"type":"text"},
	 *       {"tipo":"oh24","label":{"lg-eng":"Informant"},"type":"link","target":"rsc197"}
	 *     ]
	 *   }
	 *
	 * @param object $rqo - Request Query Object; relevant keys under `source`
	 * @return object     - Standard response envelope {result, msg, errors[]}
	 */
	public static function get_section_map( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. get_section_map request failed';
			$response->errors	= [];

		$source		= $rqo->source ?? new stdClass();
		$section	= trim((string)($source->section ?? ''));
		$lang		= self::normalise_lang($source->lang ?? DEDALO_DATA_LANG);

		if ($section === '') {
			$response->msg		= 'Error. Missing source.section (section name or tipo)';
			$response->errors[]	= 'missing_section';
			return $response;
		}

		// Resolve identifier → canonical section_tipo
			$section_tipo = self::resolve_section_identifier($section, $lang, $response);
			if ($section_tipo === false) return $response;

		// Permission check
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			if ($permissions < 1) {
				$response->msg		= "Error. Insufficient permissions to read section '$section_tipo'";
				$response->errors[]	= 'permissions_denied';
				return $response;
			}

		// Try pre-built LLM map first.
		// Linear scan is acceptable because the map typically has O(tens) entries.
			$map = self::load_llm_map();
			if (is_array($map)) {
				foreach ($map as $entry) {
					$entry = (object)$entry;
					if (($entry->tipo ?? null) === $section_tipo) {
						$response->result	= $entry;
						$response->msg		= 'OK. get_section_map done (from artifact)';
						return $response;
					}
				}
			}

		// Fallback: live-build from agent_view_builder.
		// Fetches term data (multilingual labels) per ontology node so the
		// result always matches the current ontology state, even on installations
		// that have not regenerated the artifact after an ontology change.
			try {
				$label_map		= agent_view_builder::section_label_map($section_tipo, $lang);
				$section_node	= ontology_node::get_instance($section_tipo);
				$section_term	= $section_node->get_term_data() ?? new stdClass();

				$fields = [];
				foreach ($label_map->labels as $entry) {
					$comp_node	= ontology_node::get_instance($entry->tipo);
					$comp_term	= $comp_node->get_term_data() ?? new stdClass();
					$field		= (object)[
						'tipo'	=> $entry->tipo,
						'label'	=> $comp_term,
						'type'	=> $entry->type,
					];
					// Only link/portal entries carry a target; conditionally
					// setting it avoids polluting other field types with null.
					if (isset($entry->target)) {
						$field->target = $entry->target;
					}
					$fields[] = $field;
				}

				$response->result = (object)[
					'tipo'		=> $section_tipo,
					'label'		=> $section_term,
					'fields'	=> $fields,
				];
				$response->msg = 'OK. get_section_map done (live build)';

			} catch (\Throwable $e) {
				$response->msg		= 'Error. ' . $e->getMessage();
				$response->errors[]	= 'builder_error';
				debug_log(__METHOD__ . ' ' . $e->getMessage(), logger::ERROR);
			}

		return $response;
	}//end get_section_map



	/**
	 * LOAD_LLM_MAP
	 * Loads and JSON-decodes the pre-built `ontology_llm_map.json` artifact
	 * from the ontology I/O path. Returns null when the file does not exist,
	 * is unreadable, or decodes to a non-array value.
	 *
	 * Uses a static sentinel cache to avoid repeated filesystem reads within a
	 * single PHP request:
	 * - 0 (int)    : not yet attempted (initial state)
	 * - false      : attempted and determined the file is absent/invalid
	 * - array      : successfully loaded content
	 *
	 * @return array|null - Decoded JSON array of section map entries, or null
	 */
	private static function load_llm_map() : ?array {

		// Sentinel: 0 = not yet attempted; false = attempted+missing; array = loaded.
		// Integer 0 is the distinguisher because both null and false are "no data".
		static $cache = 0;
		if ($cache !== 0) {
			return ($cache === false) ? null : $cache;
		}

		try {
			$io_path = ontology_data_io::get_ontology_io_path();
			if ($io_path === false) { $cache = false; return null; }

			$file_path = "{$io_path}/ontology_llm_map.json";
			if (!is_file($file_path)) { $cache = false; return null; }

			$contents = file_get_contents($file_path);
			if ($contents === false) { $cache = false; return null; }

			$decoded = json_decode($contents);
			$cache = is_array($decoded) ? $decoded : false;
			return ($cache === false) ? null : $cache;

		} catch (\Throwable $e) {
			debug_log(__METHOD__ . ' failed: ' . $e->getMessage(), logger::WARNING);
			$cache = false;
			return null;
		}
	}//end load_llm_map



}//end class dd_agent_api
