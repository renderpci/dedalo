<?php declare(strict_types=1);
/**
 * DD_AGENT_API
 * LLM-facing API endpoints. Returns Dédalo data in the "agent view" shape
 * (see `class.agent_view_builder.php`) so small in-browser models can
 * consume records and section schemas without learning RQO/SQO, tipos or
 * portal mechanics.
 *
 * Actions:
 * - describe_section    : section schema (label list + simplified types)
 * - read_record_view    : one record as flat label→value JSON
 * - search_records_view : search + return list of agent-view records
 * - set_field_by_label  : update one field using its human label
 *
 * Phase 3 will add `collect_field`, `create_record_view`.
 *
 * Permission model: the same Dédalo per-section permission check used by
 * `dd_core_api` is applied here. No additional grants needed.
 *
 * @package Dedalo
 * @subpackage API
 */
final class dd_agent_api {



	/**
	 * SEC-024: explicit allowlist of methods callable as remote API actions.
	 * Anything not listed here is rejected by `dd_manager`.
	 */
	public const API_ACTIONS = [
		'describe_section',
		'read_record_view',
		'search_records_view',
		'count_records',
		'set_field_by_label',
		'get_media_url'
	];



	/**
	 * DESCRIBE_SECTION
	 * Returns the LLM-friendly schema of a section: human-label list of
	 * fields with simplified types. Source of truth for label↔tipo mapping.
	 *
	 * Request:
	 *   {
	 *     "action": "describe_section",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":  "oh1",
	 *       "lang":          "lg-eng",   // optional
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
	 * @param object $rqo
	 * @return object
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
		$section_tipo = self::resolve_section_identifier($section_tipo, $lang, $response);
		if ($section_tipo === false) return $response;

		// Permissions: read (>=1) on the section.
		$permissions = common::get_permissions($section_tipo, $section_tipo);
		if ($permissions < 1) {
			$response->msg		= "Error. Insufficient permissions to read section '$section_tipo'";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}

		try {
			$view = agent_view_builder::section_to_view($section_tipo, $lang, $include_tipos);
		} catch (\Throwable $e) {
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
	 * Returns one record as the flat agent-view shape.
	 *
	 * Request:
	 *   {
	 *     "action": "read_record_view",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":  "oh1",
	 *       "section_id":    42,
	 *       "lang":          "lg-eng",
	 *       "include_tipos": false       // optional, adds fields_by_tipo
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
	 * @param object $rqo
	 * @return object
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
	 * Search records in a section and return them as a list of agent-view
	 * shapes. Supports human-label filters that are resolved to tipos
	 * automatically.
	 *
	 * Request:
	 *   {
	 *     "action": "search_records_view",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":  "oh1",
	 *       "lang":          "lg-eng",
	 *       "limit":         10,
	 *       "offset":        0,
	 *       "full_count":    false,
	 *       "include_tipos": false,
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
	 *     "pagination": { "limit":10, "offset":0, "total":42 }
	 *   }
	 *
	 * @param object $rqo
	 * @return object
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
		$sqo = new search_query_object();
		$sqo->set_section_tipo([$section_tipo]);
		$sqo->set_limit($limit);
		$sqo->set_offset($offset);

		// Resolve label-based filters to tipo-based SQO filters
		if (!empty($filter) && is_object($filter) && !empty($filter->rules)) {
			$sqo_filter = self::build_sqo_filter_from_label_rules($section_tipo, $lang, $filter);
			if ($sqo_filter !== null) {
				$sqo->set_filter($sqo_filter);
			}
		}

		// Count (optional) — must be done separately because full_count on the
		// SQO changes search() to a COUNT query that returns {full_count} rows,
		// not {section_id,section_tipo} records.
		$total = null;
		if ($full_count) {
			try {
				$count_sqo = clone $sqo;
				$count_sqo->full_count = true;
				$count_search = search::get_instance($count_sqo);
				$count_data = $count_search->count();
				$total = $count_data->total ?? null;
			} catch (\Throwable $e) {
				debug_log(__METHOD__ . ' Count query failed: ' . $e->getMessage(), logger::WARNING);
			}
		}

		// Record search — always without full_count so we get actual records
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
	 * Return the total number of records in a section. Supports the same
	 * human-label filters as search_records_view.
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
	 * @param object $rqo
	 * @return object
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

		// Resolve label-based filters to tipo-based SQO filters
		if (!empty($filter) && is_object($filter) && !empty($filter->rules)) {
			$sqo_filter = self::build_sqo_filter_from_label_rules($section_tipo, $lang, $filter);
			if ($sqo_filter !== null) {
				$sqo->set_filter($sqo_filter);
			}
		}

		// Execute count
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
	 * Update one field on a record using its human label (resolved to tipo
	 * internally). Returns the updated record in agent-view shape.
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
	 *       "lang":          "lg-eng"
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
	 * @param object $rqo
	 * @return object
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

		// Resolve label → tipo
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

		// Component permissions (per-component write check)
		$component_permissions = common::get_permissions($section_tipo, $tipo);
		if ($component_permissions < 2) {
			$response->msg		= "Error. Insufficient permissions to write component '$tipo' ($field)";
			$response->errors[]	= 'permissions_denied';
			return $response;
		}

		try {
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

		// Return updated record view
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
	 * Convert human-label filter rules into a Dédalo SQO filter object.
	 * Each rule's `field` is resolved to a component tipo via the label map.
	 *
	 * @param string $section_tipo
	 * @param string $lang
	 * @param object $filter   { operator: "AND"|"OR", rules: [{ field, operator, value }, ...] }
	 * @return object|null
	 */
	private static function build_sqo_filter_from_label_rules( string $section_tipo, string $lang, object $filter ) : ?object {

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
				// Unknown label — skip this rule (best-effort)
				continue;
			}

			$component_tipo = $descriptor->tipo;

			// Map friendly operators to SQO q_operator values.
			// null = Dédalo default (contains-like text search).
			// '='   = exact match.
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
	 * Converts ISO 639 language codes that LLMs often emit (e.g. "es", "en")
	 * into Dédalo's lg-xxx format. Passes through codes that already start with
	 * "lg-" unchanged and falls back to DEDALO_DATA_LANG for invalid codes.
	 * @param string $lang
	 * @return string
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
	 * Accepts a section identifier that may be a tipo (e.g. "oh1") or a
	 * human name (e.g. "Cecas", "Oral History") and resolves it to the
	 * canonical section_tipo.
	 *
	 * Returns the resolved tipo string, or false on failure (with error
	 * details set on $response).
	 *
	 * @param string $identifier
	 * @param string $lang
	 * @param object $response  Reference to the response object for error handling.
	 * @return string|false
	 */
	private static function resolve_section_identifier( string $identifier, string $lang, object $response ) : string|false {

		// Fast path: if it looks like a tipo and IS a section, return directly.
		if (preg_match('/^[a-z]{1,5}[0-9]+$/i', $identifier) === 1) {
			$model = ontology_node::get_model_by_tipo($identifier, true);
			if ($model === 'section') {
				return $identifier;
			}
			// Looks like a tipo but isn't a section — don't fall through to
			// label search (the user likely passed a component tipo).
			$response->msg		= "Error. tipo '$identifier' is not a section (model=$model)";
			$response->errors[]	= 'not_a_section';
			return false;
		}

		// Resolve via label matching.
		$resolved = agent_view_builder::resolve_section_tipo($identifier, $lang);

		if ($resolved === null) {
			$response->msg		= "Error. Unknown section '$identifier'. Use the section name (e.g. 'Cecas') or its tipo.";
			$response->errors[]	= 'unknown_section';
			return false;
		}

		if (is_object($resolved)) {
			// Ambiguous — multiple sections matched.
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
	 * Return the public URL(s) of a media component for a given record
	 * without forcing a full agent-view payload. Optimised for batch
	 * pipelines (e.g. assistant bulk image analysis) where read_record_view
	 * would be wasteful.
	 *
	 * Request:
	 *   {
	 *     "action": "get_media_url",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section_tipo":   "numisdata6",
	 *       "section_id":     42,
	 *       "component_tipo": "numisdata18",
	 *       "quality":        "1.5MB",   // optional
	 *       "absolute":       true       // optional, default true
	 *     }
	 *   }
	 *
	 * Response.result:
	 *   {
	 *     "url":         "https://.../numisdata18/1.5MB/numisdata18-42.jpg",
	 *     "quality":     "1.5MB",
	 *     "extension":   "jpg",
	 *     "file_exist":  true,
	 *     "model":       "component_image"
	 *   }
	 *
	 * @param object $rqo
	 * @return object
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

		if (empty($model) || !is_subclass_of($model, 'component_media_common') && $model !== 'component_media_common') {
			// Accept any descendant of component_media_common (image, av, pdf, 3d).
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
	 * GET_SECTION_MAP
	 * Returns the full field map for a single section: tipo, multilingual labels
	 * for the section and every field, simplified types, and portal targets.
	 *
	 * Accepts a human-readable section name (any language) or a tipo identifier.
	 * Served from the pre-built `ontology_llm_map.json`; falls back to a live
	 * build from `agent_view_builder` when the artifact is missing.
	 *
	 * Request:
	 *   {
	 *     "action": "get_section_map",
	 *     "dd_api": "dd_agent_api",
	 *     "source": {
	 *       "section": "Oral History",  // name OR tipo e.g. "oh1"
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
	 * @param object $rqo
	 * @return object
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

		// Try pre-built LLM map first
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

		// Fallback: live-build from agent_view_builder
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
	 * Loads and decodes the pre-built `ontology_llm_map.json` artifact.
	 * Returns null when the file does not exist or cannot be decoded.
	 * @return array|null
	 */
	private static function load_llm_map() : ?array {

		// Request-level cache: 0 = not yet attempted, false = attempted+missing, array = loaded.
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
