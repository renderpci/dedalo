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
* The critical semantic shift is that `id_key` now references the stable,
* server-minted item `id` inside the main component's dato array — never a
* target section_id or array index — making pairings position-independent
* and surviving re-ordering or re-targeting of the main value. The positive
* type marker DEDALO_RELATION_TYPE_DATAFRAME ('dd490', defined in
* core/base/dd_tipos.php) identifies migrated entries unambiguously so that
* readers do not need heuristics.
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
*
* Entry-point: the 7.0.1 update block in core/base/update/updates.php calls
* migrate_matrix, migrate_time_machine, migrate_activity, and
* materialize_iri_titles in sequence, each with $save=true.
* migrate_all() is a convenience wrapper for tooling / CLI use.
*
* @package Dédalo
* @subpackage Core
*/
class dataframe_v7_migration {



	/**
	* Number of database rows fetched per keyset-pagination iteration.
	* Lower values reduce per-transaction lock contention; higher values
	* reduce round-trips. Adjust for large installations before running.
	* @var int $batch_size
	*/
	public static int $batch_size = 500;

	/**
	* Maximum number of individual issue strings stored in *_items detail lists
	* on the response object. Counters (->ambiguous, ->unresolved) are always
	* exact regardless of this cap, so totals remain accurate for reporting.
	* @var int $max_report_items
	*/
	public static int $max_report_items = 500;

	/**
	* Per-request cache of ontology model lookups (tipo -> model class name).
	* Avoids repeated calls to ontology_node::get_model_by_tipo() for the same
	* tipo across potentially thousands of locators in a single migration run.
	* Keyed by tipo string; value is the model string or null when unresolvable.
	* @var array<string, string|null> $model_cache
	*/
	private static array $model_cache = [];

	/**
	* Per-request cache of IRI label → target_section_id resolutions.
	* Avoids redundant get_label_record search queries and section creations
	* in materialize_iri_titles when many IRI items share the same title string
	* (e.g. "Wikipedia", "Getty Vocabularies"). Keyed by normalized title;
	* value is the target section_id (int) in the label section dd1706.
	* @var array<string, int> $label_cache
	*/
	private static array $label_cache = [];

	/**
	* Per-request cache of the component_dataframe model class name for the
	* IRI label frame slot (DEDALO_COMPONENT_IRI_LABEL_DATAFRAME). Avoids
	* repeated ontology_node::get_model_by_tipo() calls per IRI item.
	* @var string|null $df_model_cache
	*/
	private static ?string $df_model_cache = null;



	/**
	* MIGRATE_ALL
	* Convenience orchestrator: runs migrate_matrix, migrate_time_machine, and
	* migrate_activity in sequence and rolls up their results into a single
	* response. Intended for CLI/tooling use; the 7.0.1 update block calls the
	* three steps independently so each can have a different stop_on_error policy.
	*
	* The overall result is false if any step fails; the individual step results
	* are available as ->matrix, ->time_machine, and ->activity on the returned
	* object.
	*
	* @param bool $save [= false] - false = dry-run (scan and report only, no writes)
	* @return object $response - shape: {result, msg, dry_run, matrix, time_machine, activity}
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
	* Migrates dataframe pairing locators stored in the `relation` JSONB column
	* of matrix data tables (all tables matching 'matrix%' that expose a 'relation'
	* JSONB column, excluding matrix_time_machine which is handled separately).
	*
	* Each row's `relation` object is structured as:
	*   { <component_tipo>: [ <locator>, <locator>, ... ], ... }
	*
	* Relation-main resolution is row-local: the candidate main locators that a
	* frame entry must pair against (to extract item id) also live in the same
	* `relation` object, keyed by the frame's main_component_tipo. The $resolver
	* closure passed to transform_entries() captures this structure.
	*
	* Uses keyset pagination (WHERE id > $last_id ORDER BY id LIMIT batch_size)
	* to avoid full-table scans and keep memory footprint bounded.
	*
	* The @? JSONPath pre-filter (relation @? '$.**."section_id_key"') is applied
	* at the SQL level to skip already-migrated rows cheaply before deserializing
	* JSON. It checks for the legacy key at any nesting level without a text cast
	* and is GIN-indexable.
	*
	* @param array|null $ar_tables [= null] - explicit list of tables to migrate;
	*        null triggers auto-discovery via information_schema.columns
	* @param bool $save [= false] - false = dry-run (scan and report only, no writes)
	* @return object $response - new_step_response() shape extended with per-table errors
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
			if ($result===false) {
				$response->result	= false;
				$response->msg		= 'Error. Table discovery query failed';
				$response->errors[]	= 'Discovery query failed (information_schema.columns for relation): '
					. (pg_last_error($conn) ?: 'unknown error');
				return $response;
			}
			while ($row = pg_fetch_assoc($result)) {
				$ar_tables[] = $row['table_name'];
			}
		}

		foreach ($ar_tables as $table) {

			// keyset pagination anchor: reset per table so each table restarts from 0
			$last_id = 0;
			while (true) {

				// The @? JSONPath pre-filter checks for the legacy "section_id_key"
				// key at any nesting level without a text cast, discarding
				// already-migrated rows before JSON decode. GIN-indexable.
				$result = pg_query_params($conn,
					'SELECT id, section_tipo, section_id, relation::text AS relation
					 FROM "'.$table.'"
					 WHERE id > $1 AND relation @? \'$.**."section_id_key"\'
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
							// write back the transformed entries for this slot;
							// the whole relation object is persisted once after the slot loop
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
	* Migrates dataframe pairing locators stored in the `data` JSONB column of
	* matrix_time_machine. Each TM row holds a flat array of dato entries saved
	* at snapshot time: both the main component items AND their paired frame
	* locators are merged into the same array (see get_time_machine_data_to_save).
	*
	* Because the main component items and frame locators live together in the
	* same `data` array, resolution is row-local: the $resolver closure finds
	* candidate main items by matching from_component_tipo === main_component_tipo,
	* excluding entries that themselves look like frames (carry section_id_key or
	* id_key). This mirrors the structure that get_time_machine_data_to_save()
	* produces when writing a TM snapshot.
	*
	* Unresolvable TM rows are left untouched (dual-read readers handle them).
	* This is softer than the matrix migration because TM data is read-only in
	* normal operation and historical fidelity is more important than uniformity.
	*
	* @param bool $save [= false] - false = dry-run (scan and report only, no writes)
	* @return object $response - new_step_response() shape
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
				 WHERE id > $1 AND data @? \'$.**."section_id_key"\'
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
	* Migrates dataframe pairing locators embedded in matrix_activity JSON columns.
	* Activity rows are audit-log snapshots of section data at the moment of an
	* action; their column schema is discovered at runtime via information_schema
	* because the set of JSONB payload columns can vary between installations.
	*
	* Only LITERAL-main entries are re-keyed. Unlike a live matrix row, an
	* activity payload carries no sibling relation column from which to look up
	* the main locator's item id for relation-main frames. Attempting to resolve
	* them would require scanning the live record for the same section_tipo +
	* section_id, which is unreliable for deleted records or historical snapshots.
	* Relation-main entries are therefore left as legacy and reported.
	*
	* The payload walk is depth-first via transform_recursive() because activity
	* payloads have an arbitrary nesting structure (the column may hold an entire
	* section record JSON).
	*
	* @param bool $save [= false] - false = dry-run (scan and report only, no writes)
	* @return object $response - new_step_response() shape, columns iterated as sub-steps
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
		if ($result===false) {
			$response->result	= false;
			$response->msg		= 'Error. Column discovery query failed';
			$response->errors[]	= 'Column discovery query failed (information_schema.columns for '
				. $table . '): ' . (pg_last_error($conn) ?: 'unknown error');
			return $response;
		}
		while ($row = pg_fetch_assoc($result)) {
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
					 WHERE id > $1 AND "'.$column.'" @? \'$.**."section_id_key"\'
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
	* MIGRATE_ORDER_COMPONENTS
	* Migrates the relation sibling-order values stored in the `number` JSONB column.
	* Before the unified contract these inline values were parent-record-keyed
	* ({value, section_tipo_key, section_id_key}); now each order value is a dataframe
	* of the child's parent-link locator, paired by id_key (that locator's item id).
	*
	* Resolution is row-local: the child record's parent locators live in the SAME
	* row's `relation` column. For each order value keyed by (section_tipo_key,
	* section_id_key) = (parent_tipo, parent_id), the matching parent locator in
	* `relation` (section_tipo==parent_tipo, section_id==parent_id, carrying an item
	* id) is found and its id becomes the value's id_key; section_*_key are stripped.
	*
	* Idempotent (values already carrying id_key are skipped), batched via keyset
	* pagination, dry-run capable ($save=false). The @? JSONPath pre-filter
	* (number @? '$.**."section_id_key"') skips already-migrated rows cheaply.
	* Unresolvable values (no parent locator with an id) are left as-is and
	* reported under 'unresolved'.
	*
	* (!) NOT yet wired into migrate_all — call explicitly (or add to migrate_all)
	* once verified against a real database. See the v7 dataframe cutover notes.
	*
	* @param array|null $ar_tables [= null] - explicit tables; null = auto-discover (number jsonb)
	* @param bool $save [= false] - false = dry-run (scan and report only, no writes)
	* @return object $response - new_step_response() shape
	*/
	public static function migrate_order_components( ?array $ar_tables=null, bool $save=false ) : object {

		$response = self::new_step_response('order_components');

		$conn = DBi::_getConnection();
		if ($conn===false) {
			$response->result	= false;
			$response->msg		= 'Error. DDBB connection failed';
			return $response;
		}

		// tables. Discover matrix tables having a `number` jsonb column
		if ($ar_tables===null) {
			$ar_tables = [];
			$result = pg_query($conn, "
				SELECT table_name FROM information_schema.columns
				WHERE column_name = 'number'
				  AND data_type = 'jsonb'
				  AND table_name LIKE 'matrix%'
				  AND table_name NOT IN ('matrix_time_machine')
				ORDER BY table_name
			");
			if ($result===false) {
				$response->result	= false;
				$response->msg		= 'Error. Table discovery query failed';
				$response->errors[]	= 'Discovery query failed (information_schema.columns for number): '
					. (pg_last_error($conn) ?: 'unknown error');
				return $response;
			}
			while ($row = pg_fetch_assoc($result)) {
				$ar_tables[] = $row['table_name'];
			}
		}

		foreach ($ar_tables as $table) {

			$last_id = 0;
			while (true) {

				$result = pg_query_params($conn,
					'SELECT id, section_tipo, section_id, number::text AS number, relation::text AS relation
					 FROM "'.$table.'"
					 WHERE id > $1 AND number @? \'$.**."section_id_key"\'
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

					$number = json_decode($row['number']);
					if (!is_object($number)) {
						continue;
					}
					// the child's parent locators live in this same row's relation column
					$relation = json_decode($row['relation'] ?? 'null');

					// B4: build a per-row lookup map once from the relation object so
					// each order value resolves its parent-link id_key in O(1) instead
					// of re-scanning every relation slot per value.
					$lookup_map = self::build_order_lookup_map($relation);

					$context_ref = $table.' '.$row['section_tipo'].'_'.$row['section_id'];
					$row_changed = false;

					foreach ($number as $component_tipo => $values) {
						if (!is_array($values)) {
							continue;
						}
						$slot_changed = self::transform_order_values($values, $lookup_map, $response, $context_ref);
						if ($slot_changed) {
							$number->{$component_tipo} = $values;
							$row_changed = true;
						}
					}

					if ($row_changed) {
						$response->rows_changed++;
						if ($save) {
							$update_result = pg_query_params($conn,
								'UPDATE "'.$table.'" SET number = $1::jsonb WHERE id = $2',
								[json_encode($number, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $row['id']]
							);
							if ($update_result===false) {
								$response->result = false;
								$response->errors[] = 'Update failed on '.$table.' id '.$row['id'];
							}
						}
					}

					if (running_in_cli()) {
						self::print_cli_status('migrate_order_components', $table, $response);
					}
				}
			}
		}

		return $response;
	}//end migrate_order_components



	/**
	* TRANSFORM_ORDER_VALUES
	* Transformation kernel for one order component's inline value array. Rewrites
	* each legacy parent-keyed value ({value, section_tipo_key, section_id_key}) to
	* the unified {value, id_key} shape, resolving id_key from the per-row lookup
	* map built by build_order_lookup_map(). Mutates the value objects in place and
	* returns true when at least one value changed.
	*
	* @param array $values - inline value objects of one order component slot (by ref)
	* @param array $lookup_map - per-row "tipo|id" => item_id map from build_order_lookup_map()
	* @param object $response - shared stats/report accumulator
	* @param string $context_ref - human-readable context label
	* @return bool - true when any value was migrated
	*/
	private static function transform_order_values( array &$values, array $lookup_map, object $response, string $context_ref ) : bool {

		$changed = false;

		foreach ($values as $item) {

			if (!is_object($item)) {
				continue;
			}

			// already migrated (idempotence)
			if (isset($item->id_key)) {
				$response->locators_already++;
				continue;
			}

			// only legacy order values carry section_id_key
			if (!isset($item->section_id_key)) {
				continue;
			}

			$parent_tipo	= $item->section_tipo_key ?? '';
			$parent_id		= (int)$item->section_id_key;

			// O(1) lookup in the per-row map (first-match semantics preserved)
			$map_key	= $parent_tipo.'|'.$parent_id;
			$id_key		= $lookup_map[$map_key] ?? 0;

			if ($id_key<=0) {
				self::report($response, 'unresolved', $context_ref
					. ' | order value: unresolved parent-link id for parent '
					. to_string($parent_tipo) . '_' . $parent_id);
				continue;
			}

			$item->id_key = $id_key;
			unset($item->section_id_key, $item->section_tipo_key);
			$response->locators_migrated++;
			$changed = true;
		}

		return $changed;
	}//end transform_order_values



	/**
	* BUILD_ORDER_LOOKUP_MAP
	* Builds a per-row lookup map from a decoded relation object so that
	* transform_order_values can resolve each order value's parent-link id_key
	* in O(1) instead of re-scanning every relation slot per value.
	*
	* The map is keyed by "section_tipo|section_id" (or "|section_id" when the
	* locator has no section_tipo) and maps to the first locator's item id found
	* for that key. This mirrors the previous resolve_order_id_key() first-match
	* semantics exactly.
	*
	* @param mixed $relation - decoded relation object (or null)
	* @return array<string, int> - lookup map: "tipo|id" => item_id
	*/
	private static function build_order_lookup_map( mixed $relation ) : array {

		$map = [];
		if (!is_object($relation)) {
			return $map;
		}

		foreach ($relation as $entries) {
			if (!is_array($entries)) {
				continue;
			}
			foreach ($entries as $loc) {
				if (is_object($loc) && isset($loc->id) && isset($loc->section_id)) {
					$tipo = $loc->section_tipo ?? '';
					$key	= $tipo.'|'.(int)$loc->section_id;
					// first match wins (same semantics as the old linear scan)
					if (!isset($map[$key])) {
						$map[$key] = (int)$loc->id;
					}
				}
			}
		}

		return $map;
	}//end build_order_lookup_map



	/**
	* INTEGRITY_CHECK
	* Verifies dataframe pairing integrity across all matrix table rows: every
	* frame locator's id_key must match an existing item id of its main component
	* within the SAME record. Frame locators that fail this check are orphans —
	* the main item was deleted outside the standard cascade (e.g. a direct DB
	* fix or a cascade bug) without cleaning up the frame pairing.
	*
	* Orphans are reported under 'unresolved'; with $fix=true they are also
	* removed from the relation column and the row is re-saved. Frame TARGET
	* records are never touched here — the time machine may still need them
	* to reconstruct past states, and the delete_policy on the slot node governs
	* that lifecycle separately.
	*
	* Two special cases keep the check sound:
	* - Legacy (un-migrated) relation-main frames use section_id_key, not id_key:
	*   they cannot be verified by item id. They are counted as legacy_unmigrated
	*   and kept. Run the migration first, then re-run this check.
	* - The main item search (find_main_items) deliberately skips entries that
	*   themselves carry id_key or section_id_key, so frame locators do not
	*   accidentally serve as candidates for other frames.
	*
	* Main item lookup searches all JSONB data columns of the table (relation,
	* string, date, iri, geo, number, media, misc, data) because a main component
	* can live in any of them. Columns are decoded lazily to avoid deserializing
	* columns that do not contain the required tipo.
	*
	* @param array|null $ar_tables [= null] - explicit list of tables to check;
	*        null triggers auto-discovery via information_schema.columns
	* @param bool $fix [= false] - false = report only; true = remove orphan locators
	* @return object $response - new_step_response() shape plus frames_checked,
	*         legacy_unmigrated, orphans_fixed, rows_with_orphans counters.
	*         rows_with_orphans counts rows containing orphans regardless of $fix,
	*         so dry-runs report the scope of damage; rows_changed counts actually
	*         fixed rows (only incremented when $fix=true).
	*/
	public static function integrity_check( ?array $ar_tables=null, bool $fix=false ) : object {

		$response = self::new_step_response('integrity_check');
		$response->frames_checked		= 0;
		$response->legacy_unmigrated	= 0;
		$response->orphans_fixed		= 0;
		$response->rows_with_orphans	= 0;

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
			if ($result===false) {
				$response->result	= false;
				$response->msg		= 'Error. Table discovery query failed';
				$response->errors[]	= 'Discovery query failed (information_schema.columns for relation): '
					. (pg_last_error($conn) ?: 'unknown error');
				return $response;
			}
			while ($row = pg_fetch_assoc($result)) {
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
			if ($result===false) {
				$response->result	= false;
				$response->errors[]	= 'Column discovery query failed for table '.$table.': '
					. (pg_last_error($conn) ?: 'unknown error');
				continue;
			}
			while ($row = pg_fetch_assoc($result)) {
				if (in_array($row['column_name'], $data_columns, true)) {
					$table_columns[] = $row['column_name'];
				}
			}
			// skip tables where the relation column is absent after column discovery:
			// it was in the auto-discovery WHERE clause but could be missing for
			// explicitly-passed $ar_tables that include non-matrix tables
			if (!in_array('relation', $table_columns, true)) {
				continue;
			}

			// build the SELECT list as <col>::text AS <col> for all discovered data columns;
			// casting to text avoids a server-side JSONB-to-PHP object round-trip for columns
			// that may remain NULL and are decoded lazily by $find_main_items
			$select_cols = implode(', ', array_map(fn($c) => '"'.$c.'"::text AS "'.$c.'"', $table_columns));

			$last_id = 0;
			while (true) {

				$result = pg_query_params($conn,
					'SELECT id, section_tipo, section_id, '.$select_cols.'
					 FROM "'.$table.'"
					 WHERE id > $1 AND (relation @? \'$.**."id_key"\' OR relation @? \'$.**."section_id_key"\')
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
					// Main component items may live in any data column (string, date, iri, …).
					// $decoded_columns is captured by reference so the cache persists across
					// multiple calls for the same row without re-decoding the same JSON blob.
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
					$row_has_orphans = false;

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
							// A legacy relation-main locator with no id_key was keyed by the
							// TARGET record's section_id, not the main item id; we cannot
							// determine which item it paired with without the original live record.
							// Count it as un-migrated and keep it; run the migration first.
							if (!isset($el->id_key)) {
								$main_model = self::get_model((string)$el->main_component_tipo);
								if (self::is_relation_model($main_model)) {
									$response->legacy_unmigrated++;
									$clean_entries[] = $el;
									continue;
								}
							}

							// dual-read: prefer the v7 id_key; fall back to legacy section_id_key
							// for literal-main frames that have not been migrated yet
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
								$row_has_orphans = true;
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

					if ($row_has_orphans) {
						$response->rows_with_orphans++;
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
	* Converts deprecated inline `title` strings on component_iri dato items into
	* proper label frame records paired via the standard dataframe slot (dd560,
	* DEDALO_COMPONENT_IRI_LABEL_DATAFRAME). This eliminates the legacy duality
	* where the IRI label lived both as a literal string on the item AND as a
	* frame record linked through the slot.
	*
	* Processing per item:
	* 1. If the item already has a paired frame in the dd560 slot (matched by
	*    id_key / section_id_key + main_component_tipo), only strip `title`.
	* 2. If no frame exists yet and $save=true, resolve the label record via
	*    component_iri::save_label_dataframe_from_string() (first occurrence
	*    of each unique title only — subsequent items with the same title hit
	*    the per-request $label_cache), then write the pairing locator inline
	*    via a reused component_dataframe instance (cache=true +
	*    set_caller_dataframe per item) instead of calling
	*    component_iri::save_label_dataframe() per item. If the label record
	*    creation or the frame save fails, the item is reported as unresolved
	*    and left with its `title` intact.
	* 3. Items without an `id` cannot be given a pairing key; they are reported
	*    as unresolved and left untouched.
	*
	* The frame-existence check accepts both id_key (migrated) and section_id_key
	* (legacy) so that a partially-migrated installation does not double-create
	* frame records.
	*
	* Only the `iri` JSONB column is updated per row (the pairing locator is
	* written by the iri machinery into the relation column via a separate path).
	*
	* Idempotent: component_iri::resolve_title() falls back to the literal `title`
	* for unmigrated items, so reads continue to work until this runs.
	*
	* Performance: the $label_cache eliminates redundant get_label_record search
	* queries and section creations for duplicate titles (e.g. 100 IRIs labeled
	* "Wikipedia" → 1 search + 1 creation instead of 100). The instance reuse
	* avoids N-1 component_dataframe DB data loads per (row, component_tipo).
	*
	* @param bool $save [= false] - false = dry-run (scan and report only, no writes)
	* @return object $response - new_step_response() shape
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
		if ($result===false) {
			$response->result	= false;
			$response->msg		= 'Error. Table discovery query failed';
			$response->errors[]	= 'Discovery query failed (information_schema.columns for iri): '
				. (pg_last_error($conn) ?: 'unknown error');
			return $response;
		}
		while ($row = pg_fetch_assoc($result)) {
			$ar_tables[] = $row['table_name'];
		}

		// frame_slot_tipo: the iri label dataframe slot.
		// The constant is defined in core/base/dd_tipos.php; the hard-coded
		// fallback guards against running before that file is loaded (e.g.
		// in an isolated CLI migration script).
		$frame_slot_tipo = defined('DEDALO_COMPONENT_IRI_LABEL_DATAFRAME')
			? DEDALO_COMPONENT_IRI_LABEL_DATAFRAME
			: 'dd560';

		foreach ($ar_tables as $table) {

			$last_id = 0;
			while (true) {

				$result = pg_query_params($conn,
					'SELECT id, section_tipo, section_id, iri::text AS iri, relation::text AS relation
					 FROM "'.$table.'"
					 WHERE id > $1 AND iri @? \'$.**."title"\'
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
							// Dual-read: accept both id_key (migrated) and section_id_key (legacy)
							// so that a partially-migrated iri slot does not create duplicate frames.
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
								// B3 optimization: resolve the label record via a per-request
								// cache keyed by normalized title. Many IRI items across the
								// entire run share the same title (e.g. "Wikipedia"), so the
								// expensive get_label_record search + section creation is done
								// only once per unique title string.
								$normalized_title = trim(strip_tags((string)$item->title));
								$target_section_id = self::$label_cache[$normalized_title] ?? null;

								if ($target_section_id === null) {
									// (!) Wrapped in try/catch so one bad item does not abort the
									// whole batch. On failure the item is reported as unresolved
									// and its literal title is left intact (dual-read still works).
									try {
										$target_section_id = component_iri::save_label_dataframe_from_string((string)$item->title);
										if (empty($target_section_id)) {
											self::report($response, 'unresolved', $context_ref
												. ' | unable to create label record for title: '.to_string($item->title));
											continue;
										}
										// cache the resolution for subsequent items with the same title
										self::$label_cache[$normalized_title] = (int)$target_section_id;
									} catch (Throwable $e) {
										self::report($response, 'unresolved', $context_ref
											. ' | exception while materializing iri title (left intact): '
											. $e->getMessage());
										continue; // leave title intact, skip to next item
									}
								}

								// B3 optimization: inline save_label_dataframe with instance
								// reuse. Instead of calling component_iri::save_label_dataframe
								// (which does get_instance with cache=false per item, reloading
								// the component data from DB each time), we cache the model
								// lookup and reuse the component_dataframe instance via
								// cache=true + set_caller_dataframe per item. This avoids N-1
								// DB data loads per (row, component_tipo). The caller-aware
								// merge in set_data preserves siblings from previous saves.
								try {
									// cache the frame slot model lookup once per run
									if (self::$df_model_cache === null) {
										self::$df_model_cache = ontology_node::get_model_by_tipo($frame_slot_tipo, true);
									}

									$caller_dataframe = (object)[
										'id_key'				=> (int)$item->id,
										'section_tipo'			=> $row['section_tipo'],
										'main_component_tipo'	=> $component_tipo,
									];

									// cache=true: the instance is reused across items in the
									// same (section_tipo, section_id) row. The caller_dataframe
									// arg is only used on cache miss; we update it explicitly
									// via set_caller_dataframe on every call to be safe.
									$component_df = component_common::get_instance(
										self::$df_model_cache,
										$frame_slot_tipo,
										$row['section_id'],
										'list',
										DEDALO_DATA_NOLAN,
										$row['section_tipo'],
										true, // cache=true: reuse instance across items
										$caller_dataframe
									);
									$component_df->set_caller_dataframe($caller_dataframe);

									$new_locator = new locator();
										$new_locator->set_type( DEDALO_RELATION_TYPE_DATAFRAME );
										$new_locator->set_section_tipo( component_iri::$label_target_section_tipo );
										$new_locator->set_section_id( (string)$target_section_id );
										$new_locator->set_id_key( (int)$item->id );
										$new_locator->set_main_component_tipo( $component_tipo );

									$component_df->set_data( [$new_locator] );
									$component_df->save();

									// #4: keep the in-memory $relation in sync with the new frame
									// written by save, so subsequent items in the same row see it
									// in the has_frame check and we avoid redundant label-record
									// creation round-trips.
									if (!is_object($relation)) {
										$relation = new stdClass();
									}
									if (!isset($relation->{$frame_slot_tipo}) || !is_array($relation->{$frame_slot_tipo})) {
										$relation->{$frame_slot_tipo} = [];
									}
									$relation->{$frame_slot_tipo}[] = (object)[
										'type'					=> DEDALO_RELATION_TYPE_DATAFRAME,
										'section_tipo'			=> component_iri::$label_target_section_tipo,
										'section_id'			=> (string)$target_section_id,
										'from_component_tipo'	=> $frame_slot_tipo,
										'main_component_tipo'	=> $component_tipo,
										'id_key'				=> (int)$item->id
									];
								} catch (Throwable $e) {
									self::report($response, 'unresolved', $context_ref
										. ' | exception while saving iri label dataframe (left intact): '
										. $e->getMessage());
									continue; // leave title intact, skip to next item
								}
							}

							// strip the deprecated literal title
							// $item is an object reference inside $iri_column; unset() mutates
							// the in-memory object so the later json_encode picks it up.
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
	* Core transformation kernel applied to one entries array (the locator list
	* for a single component_tipo slot). Iterates over every entry and, for those
	* still in the legacy shape (have section_id_key, main_component_tipo,
	* from_component_tipo but no v7 id_key+type pair), rewrites them to the
	* unified v7 contract in-place.
	*
	* The $resolver callable is provided by the caller (migrate_matrix or
	* migrate_time_machine) and encapsulates where to look for candidate main
	* locator items, because that source differs between the two contexts:
	* - matrix: the same row's relation object, keyed by main_component_tipo
	* - time_machine: the same row's data array, filtered by from_component_tipo
	*
	* Resolution logic for relation-main frames:
	* 1. Call $resolver($el) to get the pool of candidate main items.
	* 2. Filter to items whose section_id matches section_id_key and, if
	*    section_tipo_key is present, whose section_tipo also matches. Frame-
	*    shaped entries (carrying section_id_key or id_key themselves) are
	*    excluded from candidates to prevent self-referential matches.
	* 3. From the remaining candidates, keep only those carrying an item id.
	* 4. If none remain: report 'unresolved' and skip (leave legacy, dual-read
	*    handles it). If more than one remain: report 'ambiguous' and use the
	*    first (same-target-linked-twice corner case; recorded for inspection).
	*    If section_tipo_key is missing on a relation-main frame, report
	*    'ambiguous' as a warning (matching by section_id only risks cross-tipo
	*    mis-pairing) even before counting candidates.
	* 5. Cast the chosen item's id to int and write it as id_key.
	*
	* The method mutates $entries objects in-place (PHP passes objects by
	* reference within arrays) and returns the array when at least one entry
	* changed, or null when nothing changed (allows the caller to skip writes).
	*
	* @param array $entries - flat array of locator objects for one component slot
	* @param callable $resolver - fn(object $frame_entry): array<object> candidate mains
	* @param object $response - shared stats/report accumulator (modified in-place)
	* @param string $context_ref - human-readable context label prepended to report lines
	* @return array|null - the (possibly mutated) entries array if anything changed, else null
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

				// (!) Warn when section_tipo_key is missing: matching falls back to
				// section_id only, which can mis-pair across different section tipos
				// that happen to share the same numeric section_id. Reported as
				// 'ambiguous' so the entry is flagged for manual review even when
				// only one candidate matches.
				if (!isset($el->section_tipo_key)) {
					self::report($response, 'ambiguous', $context_ref
						. ' | from: ' . $el->from_component_tipo
						. ' | main: ' . $el->main_component_tipo
						. ' | section_id_key: ' . to_string($el->section_id_key)
						. ' | WARNING: missing section_tipo_key, matching by section_id only (cross-tipo mis-pair risk)'
					);
				}

				$candidates = array_values(array_filter($resolver($el), function($item) use ($el) {
					return is_object($item)
						&& !isset($item->section_id_key) && !isset($item->id_key) // exclude frame entries
						&& isset($item->section_id) && isset($item->section_tipo)
						&& (string)$item->section_id === (string)$el->section_id_key
						&& (!isset($el->section_tipo_key) || $item->section_tipo === $el->section_tipo_key);
				}));

				// keep only candidates carrying an item id
				// Some relation locators lack an id (written before item-id minting was
				// enforced). They cannot be used as pairing keys; filter them out rather
				// than producing a null-cast id of 0 which could silently mis-pair.
				$with_id = array_values(array_filter($candidates, fn($item) => isset($item->id)));

				if (empty($with_id)) {
					// Unresolvable: no matching main locator found (or all lacked an id).
					// Leave untouched: dual-read readers handle both shapes, so data remains
					// accessible. The entry is reported for manual inspection or a later pass.
					self::report($response, 'unresolved', $context_ref
						. ' | from: ' . $el->from_component_tipo
						. ' | main: ' . $el->main_component_tipo
						. ' | section_id_key: ' . to_string($el->section_id_key)
						. ' | section_tipo_key: ' . to_string($el->section_tipo_key ?? null)
					);
					continue; // leave untouched: dual-read keeps it working
				}
				if (count($with_id) > 1) {
					// Ambiguous: the same target section_id appears more than once in the
					// main slot (e.g. the same person linked twice in a portal). The first
					// match is used; the pairing may be semantically wrong for the second
					// entry. Reported for manual review.
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
			// type = DEDALO_RELATION_TYPE_DATAFRAME ('dd490') is the positive
			// marker used by dataframe_entry_matches() to quickly identify pairing
			// locators without inspecting every property.
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
	* Depth-first recursive walker that migrates literal-main dataframe locators
	* embedded anywhere inside an arbitrary JSON payload (used for activity rows).
	* The node is mutated in-place via pass-by-reference so callers observe changes
	* directly on the decoded PHP value without needing to re-encode between levels.
	*
	* Walking strategy:
	* - Arrays: iterate all elements by reference, recurse into each child.
	* - Objects: first check if the current node is itself a legacy frame locator
	*   (has section_id_key + main_component_tipo + from_component_tipo, but NOT
	*   the v7 id_key + type=DEDALO_RELATION_TYPE_DATAFRAME marker). If it is and
	*   the main is a literal component, rewrite it to the unified contract.
	*   Then recurse into all properties regardless, so nested locators also get
	*   processed.
	* - Scalars (string, int, bool, null): no-op, return false immediately.
	*
	* The $key loop variable from 'foreach ($node as $key => &$value)' is
	* intentionally unused in the body; only $value is needed for recursion.
	* The unset($value) after the loop breaks the by-reference binding.
	*
	* @param mixed &$node - the current node (array, object, or scalar), mutated in-place
	* @param object $response - shared stats/report accumulator (modified in-place)
	* @param string $context_ref - human-readable context label for report lines
	* @return bool - true if at least one locator was migrated in this subtree
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
	* Returns the ontology model class name for a given tipo string (e.g.
	* 'component_iri', 'component_portal', 'component_input_text'), with results
	* cached in the per-request static $model_cache to avoid repeated lookups
	* across the thousands of locators processed during a migration run.
	*
	* Returns null when the tipo is not present in the ontology (unresolvable).
	* Callers must treat null defensively (is_relation_model treats it as
	* relation-main to fail safe rather than blindly renaming the locator).
	*
	* @param string $tipo - ontology node tipo identifier (e.g. 'dd560', 'rsc217')
	* @return string|null - model class name, or null when unresolvable
	*/
	private static function get_model( string $tipo ) : ?string {

		if (!array_key_exists($tipo, self::$model_cache)) {
			self::$model_cache[$tipo] = ontology_node::get_model_by_tipo($tipo);
		}

		return self::$model_cache[$tipo];
	}//end get_model



	/**
	* IS_RELATION_MODEL
	* Returns true when $model is one of the relation-component classes that store
	* their values as locators in the `relation` column (component_portal,
	* component_select, component_check_box, component_radio_button, etc. — the
	* full list is authoritative in component_relation_common::get_components_with_relations()).
	*
	* Relation-main frames had their legacy section_id_key set to the TARGET
	* record's section_id, NOT the main item's own id, so they require an
	* active lookup of the main locator to extract the item id. Literal-main
	* frames (component_iri, component_input_text, ...) used section_id_key as
	* the item id directly: a straight rename suffices.
	*
	* (!) Null or empty $model is treated as relation-main (returns true). This
	* is a safe default: it forces explicit resolution for unknown tipos rather
	* than blindly renaming the locator, avoiding silent data corruption on
	* ontology nodes that have not yet been loaded.
	*
	* @param string|null $model - class name returned by get_model(), or null
	* @return bool - true = relation-main (needs locator lookup); false = literal-main (direct rename)
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
	* Creates a fresh stdClass accumulator for one migration step. All public
	* methods return an object of this shape; migrate_all() merges them under
	* named properties. The counters are updated in-place by the caller and
	* by the report() helper.
	*
	* Shape:
	*   result             bool   - false if any error occurs
	*   msg                string - human message summarising the outcome
	*   step               string - step identifier passed in
	*   scanned            int    - rows examined (post SQL pre-filter)
	*   rows_changed       int    - rows whose JSON was actually modified
	*   locators_migrated  int    - individual locators rewritten to v7 contract
	*   locators_already   int    - locators skipped because already in v7 shape
	*   ambiguous          int    - exact count of ambiguous resolution events
	*   ambiguous_items    array  - detail strings, capped at $max_report_items
	*   unresolved         int    - exact count of unresolvable locators
	*   unresolved_items   array  - detail strings, capped at $max_report_items
	*   errors             array  - database-level error messages
	*
	* @param string $step - step identifier ('matrix', 'time_machine', 'activity', etc.)
	* @return object - fresh response accumulator
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
	* Accumulates one diagnostic issue into the response accumulator: increments
	* the exact integer counter (->ambiguous or ->unresolved) and appends the
	* detail string to the capped items list (*_items) for developer inspection.
	* Also writes the detail at WARNING level to the Dédalo debug log so that
	* issues surface in server logs even when the response object is not inspected.
	*
	* The items list is capped at $max_report_items to prevent unbounded memory
	* growth on large datasets. Counters are always exact regardless of the cap.
	*
	* @param object $response - the step response accumulator to update
	* @param string $kind - issue category: 'ambiguous' | 'unresolved'
	* @param string $detail - human-readable description of the specific issue
	* @return void
	*/
	private static function report( object $response, string $kind, string $detail ) : void {

		// exact counter: always incremented even when the items list is full
		$response->{$kind}++;

		$items_key = $kind.'_items';
		if (count($response->{$items_key}) < self::$max_report_items) {
			$response->{$items_key}[] = $detail;
		}

		// also write to the server log for visibility without inspecting the response object
		debug_log(__METHOD__ . ' ['.$kind.'] ' . $detail, logger::WARNING);
	}//end report



	/**
	* PRINT_CLI_STATUS
	* Emits a compact progress line to STDOUT when running under the CLI SAPI.
	* Output is throttled: only fires when scanned is an exact multiple of 100
	* to limit I/O during large migration runs without hiding progress entirely.
	* Uses the shared common::$pdata / print_cli() convention (shared/core_functions.php)
	* so that the update runner can capture and display structured progress.
	* No-op in web SAPI (running_in_cli() returns false).
	*
	* @param string $method - migration method name shown in the progress line
	* @param string $table - current table (or table.column) label
	* @param object $response - the live step response accumulator (read-only here)
	* @return void
	*/
	private static function print_cli_status( string $method, string $table, object $response ) : void {

		if (!running_in_cli()) {
			return;
		}
		// throttle: emit a line only every 100 rows to keep output readable
		if ($response->scanned % 100 !== 0) {
			return;
		}

		// write into common::$pdata so the update runner's progress display
		// picks it up alongside any other running tool's status
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
