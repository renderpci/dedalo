<?php declare(strict_types=1);
require_once(DEDALO_DIFFUSION_PATH . '/class.diffusion_api_client.php');
require_once(DEDALO_DIFFUSION_PATH . '/class.diffusion_activity_logger.php');
/**
* DIFFUSION_DELETE
* v7 delete propagation: when a record is deleted in the work system,
* its published copies must be removed from every diffusion target
* (SQL tables, RDF files, ...).
*
* Targets are resolved by walking the diffusion ontology (the published
* copy is always the single current one, so no registry is needed) and
* dispatched per diffusion type:
*  - sql / socrata : one call to the Bun engine (delete_record action)
*  - rdf / xml     : unlink the published file (deterministic name)
*  - others        : not supported yet (extension point)
*
* Hybrid model: propagation is attempted immediately; per-element failures
* are persisted as dd1758 activity rows with action = unpublish_pending,
* which retry_pending() finds and re-runs later (see also the opportunistic
* hook in dd_diffusion_api::diffuse and the CLI helper).
*/
class diffusion_delete {



	/**
	* DELETE_RECORD
	* Propagates the deletion of a work-system record to all diffusion targets.
	* Never throws for per-target failures (they become pending log rows);
	* only catastrophic errors (e.g. ontology unavailable) bubble up to the
	* caller's try/catch (section_record::delete).
	*
	* @param string $section_tipo
	* @param string|int $section_id
	* @param object|null $options = null
	* {
	* 	only_element_tipos: array|null - restrict to these diffusion_element tipos (used by retry)
	* 	log_activity: bool - log dd1758 rows (default true; retry manages its own rows)
	* }
	* @return object $response
	* {
	* 	result: bool - true when every resolved target was propagated
	* 	msg: string
	* 	ar_deleted: array - per-element info of propagated deletions
	* 	ar_pending: array - per-element info of failed (retryable) deletions
	* 	errors: array
	* }
	*/
	public static function delete_record(string $section_tipo, string|int $section_id, ?object $options=null) : object {

		$only_element_tipos	= $options->only_element_tipos ?? null;
		$log_activity		= $options->log_activity ?? true;

		$response = new stdClass();
			$response->result		= true;
			$response->msg			= 'OK. Nothing to delete';
			$response->ar_deleted	= [];
			$response->ar_pending	= [];
			$response->errors		= [];

		// 1. Resolve diffusion nodes targeting this section (ontology walk, alias-aware)
			$nodes = diffusion_utils::get_section_diffusion_nodes($section_tipo);
			if (empty($nodes)) {
				return $response; // section has no diffusion configuration
			}

		// 2. Group targets by diffusion element and type
			// element_tipo => {element_tipo, type, sql_targets: [{database_name, table_name}], }
			$elements = [];

			foreach ($nodes as $node) {

				// find the diffusion element in the parents path (immediate parent first)
				$element_path_item = null;
				foreach ($node->parents ?? [] as $path_item) {
					if ($path_item->model==='diffusion_element' || $path_item->model==='diffusion_element_alias') {
						$element_path_item = $path_item;
						break;
					}
				}
				if ($element_path_item===null) {
					continue; // node outside a diffusion element: not a publish target
				}

				// resolve real element tipo (diffusion map and RDF use real tipos)
				$resolved			= diffusion_utils::resolve_node_with_alias($element_path_item->tipo);
				$real_element_tipo	= $resolved->real_tipo ?? $element_path_item->tipo;
				$element_type		= $element_path_item->type ?? 'unknown';

				// optional restriction (used by retry_pending)
				if ($only_element_tipos!==null
					&& !in_array($real_element_tipo, $only_element_tipos)
					&& !in_array($element_path_item->tipo, $only_element_tipos)
				) {
					continue;
				}

				if (!isset($elements[$real_element_tipo])) {
					$elements[$real_element_tipo] = (object)[
						'element_tipo'	=> $real_element_tipo,
						'type'			=> $element_type,
						'sql_targets'	=> []
					];
				}

				switch ($element_type) {
					case 'sql':
					case 'socrata': // socrata publishes through the SQL path (Bun fallback)
						// database from the flat virtual diffusion tree: the node with
						// model 'database' under this element, label = database name
						$database_name	= diffusion_utils::get_database_name_for_element($element_path_item->tipo);
						$table_name		= $node->label; // alias-aware label = published table name (Bun datum.term)
						if (empty($database_name) || empty($table_name)) {
							debug_log(__METHOD__
								. " Ignored SQL delete target without database/table name" . PHP_EOL
								. ' element_tipo: ' . $real_element_tipo . PHP_EOL
								. ' database_name: ' . to_string($database_name) . PHP_EOL
								. ' table_name: ' . to_string($table_name)
								, logger::WARNING
							);
							break;
						}
						// dedupe by database.table
						$exists = false;
						foreach ($elements[$real_element_tipo]->sql_targets as $existing) {
							if ($existing->database_name===$database_name && $existing->table_name===$table_name) {
								$exists = true;
								break;
							}
						}
						if (!$exists) {
							$elements[$real_element_tipo]->sql_targets[] = (object)[
								'database_name'	=> $database_name,
								'table_name'	=> $table_name
							];
						}
						break;

					case 'rdf':
					case 'xml':
						// handled per element below (file path resolved from element + locator)
						break;

					// EXTENSION POINT: add new diffusion type delete handlers here
					default:
						debug_log(__METHOD__
							. " Delete propagation not supported for diffusion type '". $element_type ."'. Skipped." . PHP_EOL
							. ' element_tipo: ' . $real_element_tipo
							, logger::WARNING
						);
						break;
				}
			}//end foreach ($nodes as $node)

		// 3. Execute SQL deletions: one Bun call for ALL sql targets
			$sql_elements = array_filter($elements, function($el) {
				return !empty($el->sql_targets);
			});
			$sql_target_result = []; // "db|table" => bool success
			if (!empty($sql_elements)) {

				$targets = [];
				foreach ($sql_elements as $el) {
					foreach ($el->sql_targets as $t) {
						$targets[] = (object)[
							'database_name'	=> $t->database_name,
							'table_name'	=> $t->table_name,
							'section_ids'	=> [$section_id],
							'section_tipo'	=> $section_tipo // enables media publication marker removal in Bun
						];
					}
				}

				$bun_response = diffusion_api_client::call((object)[
					'action'	=> 'delete_record',
					'targets'	=> $targets
				]);

				// map per-target outcome ('deleted' lists successful targets)
				foreach ($bun_response->deleted ?? [] as $deleted_item) {
					$key = $deleted_item->database_name .'|'. $deleted_item->table_name;
					$sql_target_result[$key] = true;
				}
				if (!empty($bun_response->errors)) {
					$response->errors = array_merge($response->errors, (array)$bun_response->errors);
				}
			}

		// 4. Per-element outcome: execute RDF unlinks, collect results, log activity
			foreach ($elements as $element_tipo => $el) {

				$success	= true;
				$info		= (object)[
					'section_tipo'	=> $section_tipo,
					'section_id'	=> $section_id,
					'element_tipo'	=> $element_tipo,
					'type'			=> $el->type
				];

				switch ($el->type) {
					case 'sql':
					case 'socrata':
						if (empty($el->sql_targets)) {
							continue 2; // unresolvable targets already logged as warning
						}
						$info->targets = $el->sql_targets;
						foreach ($el->sql_targets as $t) {
							$key = $t->database_name .'|'. $t->table_name;
							if (empty($sql_target_result[$key])) {
								$success = false;
							}
						}
						break;

					case 'rdf':
						$rdf_result = self::delete_rdf($element_tipo, $section_tipo, $section_id);
						$success	= $rdf_result->result;
						$info->file_path = $rdf_result->file_path ?? null;
						if (!$success && !empty($rdf_result->msg)) {
							$response->errors[] = $rdf_result->msg;
						}
						break;

					default:
						continue 2; // unsupported types: skip silently (already logged)
				}

				if ($success) {
					$response->ar_deleted[] = $info;
					if ($log_activity) {
						diffusion_activity_logger::log(
							$section_tipo,
							(int)$section_id,
							$element_tipo,
							diffusion_activity_logger::ACTION_UNPUBLISHED
						);
					}
				}else{
					$response->ar_pending[] = $info;
					if ($log_activity) {
						diffusion_activity_logger::log(
							$section_tipo,
							(int)$section_id,
							$element_tipo,
							diffusion_activity_logger::ACTION_UNPUBLISH_PENDING
						);
					}
				}
			}//end foreach ($elements as $element_tipo => $el)

		// 5. Response
			$deleted_count	= count($response->ar_deleted);
			$pending_count	= count($response->ar_pending);
			$response->result = ($pending_count===0);
			$response->msg = $pending_count===0
				? "OK. Deleted diffusion records in $deleted_count element(s)"
				: "Warning. $pending_count element(s) pending retry, $deleted_count deleted";

			if ($pending_count>0) {
				debug_log(__METHOD__
					. ' ' . $response->msg . PHP_EOL
					. ' section: ' . $section_tipo .' '. $section_id . PHP_EOL
					. ' pending: ' . json_encode($response->ar_pending)
					, logger::WARNING
				);
			}


		return $response;
	}//end delete_record



	/**
	* COUNT_PENDING
	* Counts dd1758 activity rows with action = unpublish_pending.
	* @return int
	*/
	public static function count_pending() : int {

		$ar_row_id = self::search_pending_rows(null);

		return count($ar_row_id);
	}//end count_pending



	/**
	* RETRY_PENDING
	* Finds dd1758 activity rows with action = unpublish_pending and re-runs
	* the delete propagation for each (record, diffusion element). On success
	* the row is flipped in place to action = unpublished, keeping the pending
	* query trivially correct. Failures leave the row pending for the next run.
	*
	* Triggered opportunistically at the start of dd_diffusion_api::diffuse,
	* from the CLI helper (diffusion/migration/helpers/retry_pending_deletions.php)
	* and from the tool_diffusion UI.
	*
	* @param int $limit = 100
	* @return object $response
	* {
	* 	result: bool
	* 	msg: string
	* 	total: int - pending rows found
	* 	retried: int - rows successfully propagated and flipped
	* 	remaining: int - rows still pending
	* }
	*/
	public static function retry_pending(int $limit=100) : object {

		$response = new stdClass();
			$response->result		= true;
			$response->msg			= 'OK. No pending deletions';
			$response->total		= 0;
			$response->retried		= 0;
			$response->remaining	= 0;

		$ar_row_id = self::search_pending_rows($limit);
		if (empty($ar_row_id)) {
			return $response;
		}

		$response->total = count($ar_row_id);

		foreach ($ar_row_id as $row_id) {

			// read the full row to extract the target record and element
			$row = matrix_activity_diffusion_db_manager::read(
				'matrix_activity_diffusion',
				'dd1758',
				(int)$row_id
			);
			if ($row===false) {
				continue;
			}

			$row_data = self::parse_pending_row($row);
			if ($row_data===null || empty($row_data->target_section_tipo) || empty($row_data->target_section_id)) {
				debug_log(__METHOD__
					. " Ignored pending row without target record data" . PHP_EOL
					. ' row section_id: ' . $row_id
					, logger::WARNING
				);
				continue;
			}

			// re-run the delete restricted to the row's element (when known).
			// log_activity = false: this row already represents the intent;
			// it is flipped in place below instead of appending new rows.
			$delete_response = self::delete_record(
				$row_data->target_section_tipo,
				$row_data->target_section_id,
				(object)[
					'only_element_tipos'	=> $row_data->element_tipo ? [$row_data->element_tipo] : null,
					'log_activity'			=> false
				]
			);

			if ($delete_response->result===true) {
				// flip the row action in place: unpublish_pending -> unpublished
				$relation = $row_data->relation;
				foreach ($relation->{diffusion_activity_logger::ACTION_TIPO} ?? [] as $action_locator) {
					if ((int)$action_locator->section_id===diffusion_activity_logger::ACTION_UNPUBLISH_PENDING) {
						// string: locators serialize section_id as string (see search_pending_rows)
						$action_locator->section_id = (string)diffusion_activity_logger::ACTION_UNPUBLISHED;
					}
				}
				matrix_activity_diffusion_db_manager::update(
					'matrix_activity_diffusion',
					'dd1758',
					(int)$row_id,
					(object)['relation' => $relation]
				);
				$response->retried++;
			}
		}//end foreach ($ar_row_id as $row_id)

		$response->remaining	= $response->total - $response->retried;
		$response->result		= ($response->remaining===0);
		$response->msg			= "Retried {$response->retried} of {$response->total} pending deletion(s), {$response->remaining} remaining";

		debug_log(__METHOD__ .' '. $response->msg, $response->remaining===0 ? logger::DEBUG : logger::WARNING);


		return $response;
	}//end retry_pending



	/**
	* SEARCH_PENDING_ROWS
	* Finds dd1758 row section_ids whose action component (dd1767) points to
	* unpublish_pending, using JSONB containment on the relation column.
	* @param int|null $limit
	* @return array of int section_id
	*/
	private static function search_pending_rows(?int $limit) : array {

		// (!) locator objects serialize section_id as STRING in the relation
		// column; JSONB containment (@>) is type-sensitive, so the value here
		// must be a string too or the query never matches.
		$pending_locator = [
			diffusion_activity_logger::ACTION_TIPO => [[
				'section_id'	=> (string)diffusion_activity_logger::ACTION_UNPUBLISH_PENDING,
				'section_tipo'	=> diffusion_activity_logger::ACTION_SECTION_TIPO
			]]
		];

		$ar_row_id = matrix_activity_diffusion_db_manager::search(
			'matrix_activity_diffusion',
			[
				[
					'column'	=> 'section_tipo',
					'value'		=> 'dd1758'
				],
				[
					'column'	=> 'relation',
					'operator'	=> '@>',
					'value'		=> json_encode($pending_locator)
				]
			],
			'section_id ASC',
			$limit
		);

		return is_array($ar_row_id) ? $ar_row_id : [];
	}//end search_pending_rows



	/**
	* PARSE_PENDING_ROW
	* Extracts the target record (dd1764 section_id value, dd1765 section_tipo
	* value), the diffusion element (dd1766 locator) and the decoded relation
	* column from a raw dd1758 row. Scans all JSON columns so the extraction
	* does not depend on which column each component model uses.
	* @param object $row Raw row from matrix_activity_diffusion_db_manager::read
	* @return object|null {target_section_id, target_section_tipo, element_tipo, relation}
	*/
	private static function parse_pending_row(object $row) : ?object {

		$result = new stdClass();
			$result->target_section_id		= null;
			$result->target_section_tipo	= null;
			$result->element_tipo			= null;
			$result->relation				= null;

		foreach (matrix_activity_diffusion_db_manager::$json_columns as $column => $unused) {
			if (empty($row->$column)) {
				continue;
			}
			$decoded = is_string($row->$column)
				? json_decode($row->$column)
				: $row->$column;
			if (!is_object($decoded)) {
				continue;
			}

			if ($column==='relation') {
				$result->relation = $decoded;
			}

			// target section_id (dd1764: [{value: int}])
			if (isset($decoded->dd1764[0]->value)) {
				$result->target_section_id = $decoded->dd1764[0]->value;
			}
			// target section_tipo (dd1765: [{value: string}])
			if (isset($decoded->dd1765[0]->value)) {
				$result->target_section_tipo = $decoded->dd1765[0]->value;
			}
			// diffusion element (dd1766: [locator to '{tld}0' section]).
			// Reconstruct element tipo: 'oh0' + 63 -> 'oh63' (inverse of the
			// derivation in diffusion_activity_logger::log)
			if (isset($decoded->dd1766[0]->section_id) && isset($decoded->dd1766[0]->section_tipo)) {
				$tld = get_tld_from_tipo($decoded->dd1766[0]->section_tipo);
				if ($tld) {
					$result->element_tipo = $tld . $decoded->dd1766[0]->section_id;
				}
			}
		}

		if ($result->relation===null) {
			return null; // cannot flip the action without the relation column
		}


		return $result;
	}//end parse_pending_row



	/**
	* DELETE_RDF
	* Removes the published RDF file of a record (deterministic name) and any
	* legacy timestamped variants. Missing file = idempotent success.
	* Delegates to diffusion_rdf::delete_record_file (single source of truth
	* for the published file path, shared with the publish flow).
	*
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @param string|int $section_id
	* @return object {result: bool, msg: string, file_path: string|null, deleted_files: array}
	*/
	private static function delete_rdf(string $diffusion_element_tipo, string $section_tipo, string|int $section_id) : object {

		include_once DEDALO_DIFFUSION_PATH . '/class.diffusion_rdf.php';

		return diffusion_rdf::delete_record_file($diffusion_element_tipo, $section_tipo, $section_id);
	}//end delete_rdf



	/**
	* DELETE_XML
	* Removes the published XML file of a record (deterministic name) and any
	* legacy timestamped variants. Missing file = idempotent success.
	* Delegates to diffusion_xml::delete_record_file (single source of truth
	* for the published file path, shared with the publish flow).
	*
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @param string|int $section_id
	* @return object {result: bool, msg: string, file_path: string|null, deleted_files: array}
	*/
	private static function delete_xml(string $diffusion_element_tipo, string $section_tipo, string|int $section_id) : object {

		include_once DEDALO_DIFFUSION_PATH . '/class.diffusion_xml.php';

		return diffusion_xml::delete_record_file($diffusion_element_tipo, $section_tipo, $section_id);
	}//end delete_xml



}//end class diffusion_delete
