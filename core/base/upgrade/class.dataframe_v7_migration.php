<?php declare(strict_types=1);
/**
* CLASS DATAFRAME_V7_MIGRATION
*
* Migrates dataframe pairing locators from the legacy v6.8 shape to the
* unified v7 contract (see docs/core/components/component_dataframe.md):
*
*	legacy:	{type: dd151, ..., section_id_key: <target section_id | item id>, section_tipo_key: <tipo>, main_component_tipo, from_component_tipo}
*	v7:		{type: DEDALO_RELATION_TYPE_DATAFRAME, ..., id_key: <main item id>, main_component_tipo, from_component_tipo}
*
* Re-keying rules:
* - literal mains (component_iri, component_input_text, ...): the legacy
*   section_id_key already holds the main item id -> straight rename.
* - relation mains (component_portal, ...): the legacy section_id_key holds the
*   TARGET record section_id -> resolve the main locator item pointing at
*   (section_tipo_key, section_id_key) and use its item `id`. Ambiguity (same
*   target linked more than once) attaches to the first match and is reported.
*   Unresolvable entries are LEFT UNTOUCHED and reported: readers keep the
*   legacy-shape fallback (dual-read) for them.
*
* Scope: matrix tables (relation column), matrix_time_machine (data column,
* row-local resolution: TM rows store main + frame data merged) and
* matrix_activity payloads (literal mains only: relation-main entries in
* activity payloads carry no record context to resolve against).
*
* All methods support dry-run ($save=false): full scan + report, no writes.
* The migration is idempotent: already-migrated entries are skipped.
*/
class dataframe_v7_migration {



	// batch size for keyset pagination
	public static int $batch_size = 500;
	// cap for per-issue report detail lists (counters are always exact)
	public static int $max_report_items = 500;

	// model resolution cache
	private static array $model_cache = [];



	/**
	* MIGRATE_ALL
	* Runs the three migrations in order: matrix, time machine, activity.
	* @param bool $save = false (dry-run)
	* @return object $response
	*/
	public static function migrate_all( bool $save=false ) : object {

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'OK';
			$response->dry_run	= !$save;

		$response->matrix		= self::migrate_matrix(null, $save);
		$response->time_machine	= self::migrate_time_machine($save);
		$response->activity		= self::migrate_activity($save);

		foreach (['matrix','time_machine','activity'] as $step) {
			if ($response->{$step}->result===false) {
				$response->result	= false;
				$response->msg		= 'Error. One or more migration steps failed';
			}
		}

		return $response;
	}//end migrate_all



	/**
	* MIGRATE_MATRIX
	* Migrates dataframe locators inside the `relation` column of matrix tables.
	* Relation-main resolution is row-local: the main component locators live
	* in the same relation column, keyed by main_component_tipo.
	* @param array|null $ar_tables - matrix tables to scan; discovered when null
	* @param bool $save = false (dry-run)
	* @return object $response
	*/
	public static function migrate_matrix( ?array $ar_tables=null, bool $save=false ) : object {

		$response = self::new_step_response('matrix');

		$conn = DBi::_getConnection();
		if ($conn===false) {
			$response->result	= false;
			$response->msg		= 'Error. DDBB connection failed';
			return $response;
		}

		// tables. Discover matrix tables having a `relation` column
		if ($ar_tables===null) {
			$ar_tables = [];
			$result = pg_query($conn, "
				SELECT table_name FROM information_schema.columns
				WHERE column_name = 'relation'
				  AND data_type = 'jsonb'
				  AND table_name LIKE 'matrix%'
				  AND table_name NOT IN ('matrix_time_machine')
				ORDER BY table_name
			");
			while ($result!==false && ($row = pg_fetch_assoc($result))) {
				$ar_tables[] = $row['table_name'];
			}
		}

		foreach ($ar_tables as $table) {

			$last_id = 0;
			while (true) {

				$result = pg_query_params($conn,
					'SELECT id, section_tipo, section_id, relation::text AS relation
					 FROM "'.$table.'"
					 WHERE id > $1 AND relation::text LIKE \'%section_id_key%\'
					 ORDER BY id ASC LIMIT '.self::$batch_size,
					[$last_id]
				);
				if ($result===false) {
					$response->result = false;
					$response->errors[] = 'Query failed on table: '.$table;
					break;
				}

				$rows = pg_fetch_all($result);
				if (empty($rows)) {
					break;
				}

				foreach ($rows as $row) {

					$last_id = (int)$row['id'];
					$response->scanned++;

					$relation = json_decode($row['relation']);
					if (!is_object($relation)) {
						continue;
					}

					$context_ref = $table.' '.$row['section_tipo'].'_'.$row['section_id'];
					$row_changed = false;

					foreach ($relation as $component_tipo => $entries) {
						if (!is_array($entries)) {
							continue;
						}
						// resolver: candidate main items of a relation main live
						// in this same relation object, keyed by its tipo
						$resolver = function(object $el) use ($relation) : array {
							return (array)($relation->{$el->main_component_tipo} ?? []);
						};
						$changed = self::transform_entries($entries, $resolver, $response, $context_ref);
						if ($changed!==null) {
							$relation->{$component_tipo} = $changed;
							$row_changed = true;
						}
					}

					if ($row_changed) {
						$response->rows_changed++;
						if ($save) {
							$update_result = pg_query_params($conn,
								'UPDATE "'.$table.'" SET relation = $1::jsonb WHERE id = $2',
								[json_encode($relation, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $row['id']]
							);
							if ($update_result===false) {
								$response->result = false;
								$response->errors[] = 'Update failed: '.$context_ref;
							}
						}
					}

					self::print_cli_status('migrate_matrix', $table, $response);
				}
			}//end while batches
		}//end foreach tables

		return $response;
	}//end migrate_matrix



	/**
	* MIGRATE_TIME_MACHINE
	* Migrates dataframe locators inside matrix_time_machine `data`.
	* TM rows store main + frame data merged, so the relation-main resolution
	* is row-local: main locator candidates are the non-frame entries of the
	* same row whose from_component_tipo equals the frame's main_component_tipo.
	* Unresolvable rows are left untouched (readers keep the legacy fallback).
	* @param bool $save = false (dry-run)
	* @return object $response
	*/
	public static function migrate_time_machine( bool $save=false ) : object {

		$response = self::new_step_response('time_machine');

		$conn = DBi::_getConnection();
		if ($conn===false) {
			$response->result	= false;
			$response->msg		= 'Error. DDBB connection failed';
			return $response;
		}

		$table = 'matrix_time_machine';

		$last_id = 0;
		while (true) {

			$result = pg_query_params($conn,
				'SELECT id, section_tipo, section_id, tipo, data::text AS data
				 FROM "'.$table.'"
				 WHERE id > $1 AND data::text LIKE \'%section_id_key%\'
				 ORDER BY id ASC LIMIT '.self::$batch_size,
				[$last_id]
			);
			if ($result===false) {
				$response->result = false;
				$response->errors[] = 'Query failed on table: '.$table;
				break;
			}

			$rows = pg_fetch_all($result);
			if (empty($rows)) {
				break;
			}

			foreach ($rows as $row) {

				$last_id = (int)$row['id'];
				$response->scanned++;

				$data = json_decode($row['data']);
				if (!is_array($data)) {
					continue;
				}

				$context_ref = $table.' id:'.$row['id'].' '.$row['section_tipo'].'_'.$row['section_id'].' tipo:'.$row['tipo'];

				// resolver: main candidates are the same-row entries owned by
				// the frame's main component
				$resolver = function(object $el) use ($data) : array {
					return array_values(array_filter($data, function($item) use ($el) {
						return is_object($item)
							&& isset($item->from_component_tipo)
							&& $item->from_component_tipo===$el->main_component_tipo;
					}));
				};

				$changed = self::transform_entries($data, $resolver, $response, $context_ref);
				if ($changed!==null) {
					$response->rows_changed++;
					if ($save) {
						$update_result = pg_query_params($conn,
							'UPDATE "'.$table.'" SET data = $1::jsonb WHERE id = $2',
							[json_encode($changed, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $row['id']]
						);
						if ($update_result===false) {
							$response->result = false;
							$response->errors[] = 'Update failed: '.$context_ref;
						}
					}
				}

				self::print_cli_status('migrate_time_machine', $table, $response);
			}
		}//end while batches

		return $response;
	}//end migrate_time_machine



	/**
	* MIGRATE_ACTIVITY
	* Migrates dataframe locators inside matrix_activity payloads.
	* Only literal-main entries are re-keyed (their legacy section_id_key is
	* already the item id). Relation-main entries inside activity payloads
	* carry no record context to resolve the item id against: they are left
	* untouched and reported (readers keep the legacy fallback).
	* @param bool $save = false (dry-run)
	* @return object $response
	*/
	public static function migrate_activity( bool $save=false ) : object {

		$response = self::new_step_response('activity');

		$conn = DBi::_getConnection();
		if ($conn===false) {
			$response->result	= false;
			$response->msg		= 'Error. DDBB connection failed';
			return $response;
		}

		$table = 'matrix_activity';

		// jsonb columns of matrix_activity
		$jsonb_columns = [];
		$result = pg_query($conn, "
			SELECT column_name FROM information_schema.columns
			WHERE table_name = '$table' AND data_type = 'jsonb'
		");
		while ($result!==false && ($row = pg_fetch_assoc($result))) {
			$jsonb_columns[] = $row['column_name'];
		}
		if (empty($jsonb_columns)) {
			return $response;
		}

		foreach ($jsonb_columns as $column) {

			$last_id = 0;
			while (true) {

				$result = pg_query_params($conn,
					'SELECT id, "'.$column.'"::text AS payload
					 FROM "'.$table.'"
					 WHERE id > $1 AND "'.$column.'"::text LIKE \'%section_id_key%\'
					 ORDER BY id ASC LIMIT '.self::$batch_size,
					[$last_id]
				);
				if ($result===false) {
					$response->result = false;
					$response->errors[] = 'Query failed on column: '.$column;
					break;
				}

				$rows = pg_fetch_all($result);
				if (empty($rows)) {
					break;
				}

				foreach ($rows as $row) {

					$last_id = (int)$row['id'];
					$response->scanned++;

					$payload = json_decode($row['payload']);
					if ($payload===null) {
						continue;
					}

					$context_ref = $table.' id:'.$row['id'].' column:'.$column;

					$changed = self::transform_recursive($payload, $response, $context_ref);
					if ($changed) {
						$response->rows_changed++;
						if ($save) {
							$update_result = pg_query_params($conn,
								'UPDATE "'.$table.'" SET "'.$column.'" = $1::jsonb WHERE id = $2',
								[json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $row['id']]
							);
							if ($update_result===false) {
								$response->result = false;
								$response->errors[] = 'Update failed: '.$context_ref;
							}
						}
					}

					self::print_cli_status('migrate_activity', $table.'.'.$column, $response);
				}
			}//end while batches
		}//end foreach columns

		return $response;
	}//end migrate_activity



	/**
	* INTEGRITY_CHECK
	* Verifies the dataframe pairing integrity: every frame locator must pair
	* an EXISTING data item (its id_key must match an item id of its main
	* component in the same record). Orphan frame locators (their main item
	* was removed outside the cascade) are reported and, with $fix=true,
	* removed from the record.
	* Legacy (pre-migration) relation-main frames are target-keyed and cannot
	* be verified by item id: they are counted as legacy_unmigrated, never as
	* orphans (run the migration first).
	* Frame TARGET records are never touched here (time machine needs them).
	* @param array|null $ar_tables - matrix tables to scan; discovered when null
	* @param bool $fix = false (report only)
	* @return object $response
	*/
	public static function integrity_check( ?array $ar_tables=null, bool $fix=false ) : object {

		$response = self::new_step_response('integrity_check');
		$response->frames_checked		= 0;
		$response->legacy_unmigrated	= 0;
		$response->orphans_fixed		= 0;

		$conn = DBi::_getConnection();
		if ($conn===false) {
			$response->result	= false;
			$response->msg		= 'Error. DDBB connection failed';
			return $response;
		}

		// tables. Discover matrix tables having a `relation` column
		if ($ar_tables===null) {
			$ar_tables = [];
			$result = pg_query($conn, "
				SELECT table_name FROM information_schema.columns
				WHERE column_name = 'relation' AND data_type = 'jsonb'
				  AND table_name LIKE 'matrix%'
				  AND table_name NOT IN ('matrix_time_machine')
				ORDER BY table_name
			");
			while ($result!==false && ($row = pg_fetch_assoc($result))) {
				$ar_tables[] = $row['table_name'];
			}
		}

		// data columns where main component items can live
		$data_columns = ['relation','string','date','iri','geo','number','media','misc','data'];

		foreach ($ar_tables as $table) {

			// columns present in this table
			$table_columns = [];
			$result = pg_query_params($conn,
				"SELECT column_name FROM information_schema.columns
				 WHERE table_name = $1 AND data_type = 'jsonb'", [$table]);
			while ($result!==false && ($row = pg_fetch_assoc($result))) {
				if (in_array($row['column_name'], $data_columns, true)) {
					$table_columns[] = $row['column_name'];
				}
			}
			if (!in_array('relation', $table_columns, true)) {
				continue;
			}

			$select_cols = implode(', ', array_map(fn($c) => '"'.$c.'"::text AS "'.$c.'"', $table_columns));

			$last_id = 0;
			while (true) {

				$result = pg_query_params($conn,
					'SELECT id, section_tipo, section_id, '.$select_cols.'
					 FROM "'.$table.'"
					 WHERE id > $1 AND (relation::text LIKE \'%id_key%\')
					 ORDER BY id ASC LIMIT '.self::$batch_size,
					[$last_id]
				);
				if ($result===false) {
					$response->result = false;
					$response->errors[] = 'Query failed on table: '.$table;
					break;
				}

				$rows = pg_fetch_all($result);
				if (empty($rows)) {
					break;
				}

				foreach ($rows as $row) {

					$last_id = (int)$row['id'];
					$response->scanned++;

					$relation = json_decode($row['relation'] ?? 'null');
					if (!is_object($relation)) {
						continue;
					}

					// decode the other columns lazily on demand
					$decoded_columns = ['relation' => $relation];
					$find_main_items = function(string $main_tipo) use (&$decoded_columns, $table_columns, $row) : ?array {
						foreach ($table_columns as $column) {
							if (!array_key_exists($column, $decoded_columns)) {
								$decoded_columns[$column] = json_decode($row[$column] ?? 'null');
							}
							$column_data = $decoded_columns[$column];
							if (is_object($column_data) && isset($column_data->{$main_tipo}) && is_array($column_data->{$main_tipo})) {
								return $column_data->{$main_tipo};
							}
						}
						return null;
					};

					$context_ref = $table.' '.$row['section_tipo'].'_'.$row['section_id'];
					$row_changed = false;

					foreach ($relation as $component_tipo => $entries) {
						if (!is_array($entries)) {
							continue;
						}

						$clean_entries = [];
						$entries_changed = false;

						foreach ($entries as $el) {

							// only dataframe pairing locators are checked
							if (!is_object($el)
								|| !( (isset($el->id_key) || isset($el->section_id_key)) && isset($el->main_component_tipo) && isset($el->from_component_tipo) )) {
								$clean_entries[] = $el;
								continue;
							}

							$response->frames_checked++;

							// legacy relation-main frames are target-keyed: not verifiable
							if (!isset($el->id_key)) {
								$main_model = self::get_model((string)$el->main_component_tipo);
								if (self::is_relation_model($main_model)) {
									$response->legacy_unmigrated++;
									$clean_entries[] = $el;
									continue;
								}
							}

							$key = (int)($el->id_key ?? $el->section_id_key);
							$main_items = $find_main_items((string)$el->main_component_tipo);

							$paired = false;
							if (is_array($main_items)) {
								foreach ($main_items as $item) {
									// exclude frame-shaped entries from main candidates
									if (is_object($item) && isset($item->id) && (int)$item->id===$key
										&& !isset($item->id_key) && !isset($item->section_id_key)) {
										$paired = true;
										break;
									}
								}
							}

							if ($paired) {
								$clean_entries[] = $el;
							}else{
								self::report($response, 'unresolved', $context_ref
									. ' | ORPHAN frame: main ' . $el->main_component_tipo
									. ' has no item id ' . $key
									. ' (slot ' . $el->from_component_tipo . ', target '
									. ($el->section_tipo ?? '?') . '_' . ($el->section_id ?? '?') . ')'
								);
								if ($fix) {
									$response->orphans_fixed++;
									$entries_changed = true;
									// dropped (not added to clean_entries)
								}else{
									$clean_entries[] = $el;
								}
							}
						}

						if ($entries_changed) {
							$relation->{$component_tipo} = $clean_entries;
							$row_changed = true;
						}
					}

					if ($row_changed && $fix) {
						$response->rows_changed++;
						$update_result = pg_query_params($conn,
							'UPDATE "'.$table.'" SET relation = $1::jsonb WHERE id = $2',
							[json_encode($relation, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $row['id']]
						);
						if ($update_result===false) {
							$response->result = false;
							$response->errors[] = 'Update failed: '.$context_ref;
						}
					}

					self::print_cli_status('integrity_check', $table, $response);
				}
			}//end while batches
		}//end foreach tables

		return $response;
	}//end integrity_check



	/**
	* MATERIALIZE_IRI_TITLES
	* Resolves the component_iri title duality: items still carrying the
	* deprecated literal `title` property get a label frame record + pairing
	* locator created (reusing the iri label machinery), then the `title`
	* property is stripped. Items whose pairing frame already exists only get
	* the strip. Items without `id` are reported and left (no pairing key).
	* Idempotent; read-time fallback in component_iri::resolve_title keeps
	* unmigrated data working until this runs.
	* @param bool $save = false (dry-run)
	* @return object $response
	*/
	public static function materialize_iri_titles( bool $save=false ) : object {

		$response = self::new_step_response('iri_titles');

		$conn = DBi::_getConnection();
		if ($conn===false) {
			$response->result	= false;
			$response->msg		= 'Error. DDBB connection failed';
			return $response;
		}

		// tables with an iri column
		$ar_tables = [];
		$result = pg_query($conn, "
			SELECT table_name FROM information_schema.columns
			WHERE column_name = 'iri' AND data_type = 'jsonb'
			  AND table_name LIKE 'matrix%'
			  AND table_name NOT IN ('matrix_time_machine')
			ORDER BY table_name
		");
		while ($result!==false && ($row = pg_fetch_assoc($result))) {
			$ar_tables[] = $row['table_name'];
		}

		$frame_slot_tipo = defined('DEDALO_COMPONENT_IRI_LABEL_DATAFRAME')
			? DEDALO_COMPONENT_IRI_LABEL_DATAFRAME
			: 'dd560';

		foreach ($ar_tables as $table) {

			$last_id = 0;
			while (true) {

				$result = pg_query_params($conn,
					'SELECT id, section_tipo, section_id, iri::text AS iri, relation::text AS relation
					 FROM "'.$table.'"
					 WHERE id > $1 AND iri::text LIKE \'%"title"%\'
					 ORDER BY id ASC LIMIT '.self::$batch_size,
					[$last_id]
				);
				if ($result===false) {
					$response->result = false;
					$response->errors[] = 'Query failed on table: '.$table;
					break;
				}

				$rows = pg_fetch_all($result);
				if (empty($rows)) {
					break;
				}

				foreach ($rows as $row) {

					$last_id = (int)$row['id'];
					$response->scanned++;

					$iri_column	= json_decode($row['iri']);
					$relation	= json_decode($row['relation'] ?? 'null');
					if (!is_object($iri_column)) {
						continue;
					}

					$context_ref = $table.' '.$row['section_tipo'].'_'.$row['section_id'];
					$row_changed = false;

					foreach ($iri_column as $component_tipo => $items) {
						if (!is_array($items)) {
							continue;
						}
						// only component_iri data carries the deprecated title
						if (self::get_model((string)$component_tipo)!=='component_iri') {
							continue;
						}
						foreach ($items as $item) {

							if (!is_object($item) || !isset($item->title) || $item->title==='' || $item->title===null) {
								continue;
							}
							if (!isset($item->id)) {
								self::report($response, 'unresolved', $context_ref
									. ' | iri item with title but without id (cannot pair a frame)');
								continue;
							}

							// existing frame for this item?
							$has_frame = false;
							$frame_entries = is_object($relation) ? (array)($relation->{$frame_slot_tipo} ?? []) : [];
							foreach ($frame_entries as $frame) {
								$frame_key = is_object($frame) ? ($frame->id_key ?? $frame->section_id_key ?? null) : null;
								if ($frame_key!==null
									&& (int)$frame_key===(int)$item->id
									&& ($frame->main_component_tipo ?? null)===$component_tipo) {
									$has_frame = true;
									break;
								}
							}

							if (!$has_frame && $save) {
								// create/reuse the label record and pair it (iri machinery)
								$target_section_id = component_iri::save_label_dataframe_from_string((string)$item->title);
								if (empty($target_section_id)) {
									self::report($response, 'unresolved', $context_ref
										. ' | unable to create label record for title: '.to_string($item->title));
									continue;
								}
								component_iri::save_label_dataframe((object)[
									'section_tipo'		=> $row['section_tipo'],
									'section_id'		=> $row['section_id'],
									'component_tipo'	=> $component_tipo,
									'section_id_key'	=> (int)$item->id,
									'target_section_id'=> $target_section_id
								]);
							}

							// strip the deprecated literal title
							unset($item->title);
							$response->locators_migrated++;
							$row_changed = true;
						}
					}

					if ($row_changed) {
						$response->rows_changed++;
						if ($save) {
							$update_result = pg_query_params($conn,
								'UPDATE "'.$table.'" SET iri = $1::jsonb WHERE id = $2',
								[json_encode($iri_column, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $row['id']]
							);
							if ($update_result===false) {
								$response->result = false;
								$response->errors[] = 'Update failed: '.$context_ref;
							}
						}
					}

					self::print_cli_status('materialize_iri_titles', $table, $response);
				}
			}//end while batches
		}//end foreach tables

		return $response;
	}//end materialize_iri_titles



	/**
	* TRANSFORM_ENTRIES
	* Core transform of one entries array. Migrates every legacy dataframe
	* locator found, resolving relation mains through $resolver.
	* @param array $entries
	* @param callable $resolver - fn(object $frame_entry): array of candidate main items
	* @param object $response - stats accumulator
	* @param string $context_ref - human reference for reports
	* @return array|null - the transformed array, or null when unchanged
	*/
	private static function transform_entries( array $entries, callable $resolver, object $response, string $context_ref ) : ?array {

		$changed = false;

		foreach ($entries as $el) {

			if (!is_object($el)) {
				continue;
			}

			// already migrated (idempotence)
			if (isset($el->id_key) && isset($el->type) && $el->type===DEDALO_RELATION_TYPE_DATAFRAME) {
				$response->locators_already++;
				continue;
			}

			// legacy dataframe locator shape
			if (!isset($el->section_id_key) || !isset($el->main_component_tipo) || !isset($el->from_component_tipo)) {
				continue;
			}

			$main_model = self::get_model((string)$el->main_component_tipo);
			$is_relation_main = self::is_relation_model($main_model);

			if (!$is_relation_main) {

				// literal main: the legacy key is already the item id
				$id_key = (int)$el->section_id_key;

			}else{

				// relation main: resolve the main locator item pointing at
				// (section_tipo_key, section_id_key) and take its item id
				$candidates = array_values(array_filter($resolver($el), function($item) use ($el) {
					return is_object($item)
						&& !isset($item->section_id_key) && !isset($item->id_key) // exclude frame entries
						&& isset($item->section_id) && isset($item->section_tipo)
						&& (string)$item->section_id === (string)$el->section_id_key
						&& (!isset($el->section_tipo_key) || $item->section_tipo === $el->section_tipo_key);
				}));

				// keep only candidates carrying an item id
				$with_id = array_values(array_filter($candidates, fn($item) => isset($item->id)));

				if (empty($with_id)) {
					self::report($response, 'unresolved', $context_ref
						. ' | from: ' . $el->from_component_tipo
						. ' | main: ' . $el->main_component_tipo
						. ' | section_id_key: ' . to_string($el->section_id_key)
						. ' | section_tipo_key: ' . to_string($el->section_tipo_key ?? null)
					);
					continue; // leave untouched: dual-read keeps it working
				}
				if (count($with_id) > 1) {
					self::report($response, 'ambiguous', $context_ref
						. ' | from: ' . $el->from_component_tipo
						. ' | main: ' . $el->main_component_tipo
						. ' | target: ' . to_string($el->section_tipo_key ?? '').'_'.to_string($el->section_id_key)
						. ' | attached to first match (item id '.$with_id[0]->id.' of '.count($with_id).' candidates)'
					);
				}

				$id_key = (int)$with_id[0]->id;
			}

			// rewrite to the unified contract
			$el->type	= DEDALO_RELATION_TYPE_DATAFRAME;
			$el->id_key	= $id_key;
			unset($el->section_id_key);
			unset($el->section_tipo_key);

			$response->locators_migrated++;
			$changed = true;
		}

		return $changed ? $entries : null;
	}//end transform_entries



	/**
	* TRANSFORM_RECURSIVE
	* Walks an arbitrary JSON payload (activity records) migrating literal-main
	* dataframe locators in place. Relation-main entries are reported and left.
	* @param mixed $node
	* @param object $response
	* @param string $context_ref
	* @return bool - true when something changed
	*/
	private static function transform_recursive( mixed &$node, object $response, string $context_ref ) : bool {

		$changed = false;

		if (is_array($node)) {
			foreach ($node as &$child) {
				if (self::transform_recursive($child, $response, $context_ref)) {
					$changed = true;
				}
			}
			unset($child);
			return $changed;
		}

		if (!is_object($node)) {
			return false;
		}

		// legacy dataframe locator shape?
		if (isset($node->section_id_key) && isset($node->main_component_tipo) && isset($node->from_component_tipo)
			&& !(isset($node->id_key) && isset($node->type) && $node->type===DEDALO_RELATION_TYPE_DATAFRAME)) {

			$main_model = self::get_model((string)$node->main_component_tipo);
			if (!self::is_relation_model($main_model)) {
				// literal main: straight rename
				$node->type		= DEDALO_RELATION_TYPE_DATAFRAME;
				$node->id_key	= (int)$node->section_id_key;
				unset($node->section_id_key);
				unset($node->section_tipo_key);
				$response->locators_migrated++;
				$changed = true;
			}else{
				// relation main: no record context to resolve against
				self::report($response, 'unresolved', $context_ref
					. ' | relation-main entry in activity payload (left as legacy)'
					. ' | main: ' . $node->main_component_tipo
				);
			}
		}

		// recurse into properties
		foreach ($node as $key => &$value) {
			if (is_array($value) || is_object($value)) {
				if (self::transform_recursive($value, $response, $context_ref)) {
					$changed = true;
				}
			}
		}
		unset($value);

		return $changed;
	}//end transform_recursive



	/**
	* GET_MODEL
	* Cached ontology model resolution
	* @param string $tipo
	* @return string|null
	*/
	private static function get_model( string $tipo ) : ?string {

		if (!array_key_exists($tipo, self::$model_cache)) {
			self::$model_cache[$tipo] = ontology_node::get_model_by_tipo($tipo);
		}

		return self::$model_cache[$tipo];
	}//end get_model



	/**
	* IS_RELATION_MODEL
	* @param string|null $model
	* @return bool
	*/
	private static function is_relation_model( ?string $model ) : bool {

		if (empty($model)) {
			// unresolvable model: treat as relation so the entry requires
			// explicit resolution instead of a blind rename
			return true;
		}

		$relation_components = component_relation_common::get_components_with_relations();

		return in_array($model, $relation_components, true);
	}//end is_relation_model



	/**
	* NEW_STEP_RESPONSE
	* @param string $step
	* @return object
	*/
	private static function new_step_response( string $step ) : object {

		$response = new stdClass();
			$response->result				= true;
			$response->msg					= 'OK';
			$response->step					= $step;
			$response->scanned				= 0;
			$response->rows_changed			= 0;
			$response->locators_migrated	= 0;
			$response->locators_already		= 0;
			$response->ambiguous			= 0;
			$response->ambiguous_items		= [];
			$response->unresolved			= 0;
			$response->unresolved_items		= [];
			$response->errors				= [];

		return $response;
	}//end new_step_response



	/**
	* REPORT
	* Accumulates one issue: exact counter + capped detail list
	* @param object $response
	* @param string $kind - 'ambiguous' | 'unresolved'
	* @param string $detail
	* @return void
	*/
	private static function report( object $response, string $kind, string $detail ) : void {

		$response->{$kind}++;

		$items_key = $kind.'_items';
		if (count($response->{$items_key}) < self::$max_report_items) {
			$response->{$items_key}[] = $detail;
		}

		debug_log(__METHOD__ . ' ['.$kind.'] ' . $detail, logger::WARNING);
	}//end report



	/**
	* PRINT_CLI_STATUS
	* @param string $method
	* @param string $table
	* @param object $response
	* @return void
	*/
	private static function print_cli_status( string $method, string $table, object $response ) : void {

		if (!running_in_cli()) {
			return;
		}
		if ($response->scanned % 100 !== 0) {
			return;
		}

		if (!isset(common::$pdata)) {
			common::$pdata = new stdClass();
		}
		common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ': ' . $method
			. ' | table: '		. $table
			. ' | scanned: '	. $response->scanned
			. ' | migrated: '	. $response->locators_migrated
			. ' | unresolved: '	. $response->unresolved
			. ' | ambiguous: '	. $response->ambiguous;
		common::$pdata->memory = dd_memory_usage();
		print_cli(common::$pdata);
	}//end print_cli_status



}//end class dataframe_v7_migration
