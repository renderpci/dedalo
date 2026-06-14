<?php declare(strict_types=1);
require_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* CLASS TRANSFORM_DATA
* One-shot, idempotent helpers that physically restructure stored data during
* schema/ontology migrations.
*
* Every public method is a self-contained migration step called from an entry
* in core/base/update/updates.php (or unsupported_updates.php) via a versioned
* update hook. The common pattern is:
*
* 1. Load a declarative JSON definition file from one of the subdirectories
*    under core/base/transform_definition_files/:
*      move_tld/       – tipo (ontology identifier) renames
*      move_locator/   – section relocation with section_id rebase
*      move_to_portal/ – flat-component data promoted to a new portal section
*      move_to_table/  – rows copied from one matrix table to another
*      move_lang/      – component language-key migration
*
* 2. Iterate the affected matrix tables using update::tables_rows_iterator() or
*    update::convert_table_data(), passing a callback that rewrites each row in
*    place directly via pg_query_params().
*
* 3. Bypass Time Machine and activity log where appropriate (set
*    tm_record::$save_tm = false and logger_backend_activity::$enable_log = false
*    before the loop; restore them afterwards).
*
* Key contracts:
* - No method here emits Time Machine entries on its own unless explicitly
*   going through component_common::Save() — the raw SQL UPDATE paths skip TM.
* - Methods intended for use as update::convert_table_data() callbacks receive
*   and return ?object $datos (null signals no change, so the row is skipped).
* - CLI progress output is handled via common::$pdata + print_cli().
*
* @package Dédalo
* @subpackage Core
*/
class transform_data {



	/**
	* ADD_PORTAL_LEVEL
	* Transform component portal data from DS configuration on one level to a
	* bibliographic references like model, with a sub-level in between.
	*
	* Before the migration the relationship between a source section record and
	* a target record is encoded directly as a flat locator pair
	* (source_portal → target, ds → descriptor) stored in the source section.
	* After the migration an intermediate "reference section" is created for each
	* target locator; that new section holds the (target, descriptor) pair, and
	* its own section_id is linked back from the source section's target_portal.
	*
	* The operation is guarded against installations that do not use the given TLD
	* (checked against DEDALO_PREFIX_TIPOS), and against ontology mismatches
	* (model validation via ontology_node::get_model_by_tipo()).
	*
	* When $options->delete_old_data is true the source locators are removed from
	* the source section row via delete_relations_dato() at the end of each record
	* iteration.
	*
	* @param object $options - Migration descriptor with the following structure:
	*  {
	*    "tld"             : string,   // top-level domain prefix, e.g. "numisdata"
	*    "delete_old_data" : bool,     // whether to remove the old locators afterwards
	*    "original" : [
	*      { "model":"section",          "tipo":"<tipo>", "role":"section",       "info":"..." },
	*      { "model":"component_portal", "tipo":"<tipo>", "role":"source_portal", "info":"..." },
	*      { "model":"component_portal", "tipo":"<tipo>", "role":"target_portal", "info":"..." },
	*      { "model":"component_portal", "tipo":"<tipo>", "role":"ds",            "info":"..." }
	*    ],
	*    "new" : [
	*      { "model":"section",          "tipo":"<tipo>", "role":"section",       "info":"..." },
	*      { "model":"component_portal", "tipo":"<tipo>", "role":"target_portal", "info":"..." },
	*      { "model":"component_portal", "tipo":"<tipo>", "role":"ds",            "info":"..." }
	*    ]
	*  }
	* @return object $response - stdClass with bool $result and string $msg
	*/
	public static function add_portal_level( object $options ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// options
			$tld				= $options->tld; // string like 'numisdata'
			$original			= $options->original ?? []; // array of object
			$new				= $options->new ?? []; // array of objects
			$delete_old_data	= $options->delete_old_data; // bool true by default

		// check Ontology
			// TLD guard: the migration only applies to installations that carry this prefix.
			// Returning result=true (not an error) signals "safely skipped" to the update runner.
			if (!in_array($tld, DEDALO_PREFIX_TIPOS)) {
				$response->result	= true;
				$response->msg		= 'Script ignored. Your installation does not use this TLD: '.$tld;
				return $response;
			}

		// check Ontology tipos before do anything
			// Pre-flight validation: every tipo in both "original" and "new" must match
			// the model declared in $options. Failing fast here prevents partial writes.
			foreach ([...$original, ...$new] as $item) {
				$current_model = ontology_node::get_model_by_tipo($item->tipo, true);
				if ($current_model!==$item->model) {
					$response->msg = 'Invalid current_model from tipo: '.$item->tipo.' Check your Ontology for configuration errors';
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' calculated model: ' . to_string($current_model) . PHP_EOL
						. ' item: ' . to_string($item)
						, logger::ERROR
					);
					return $response;
				}
			}

		// short vars
			// Extract typed roles from the declarative config arrays so downstream
			// code uses readable variable names rather than repeated array_find calls.

			// original (source section)
				$original_section_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='section';
				})->tipo;
				$original_component_portal_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='source_portal';
				})->tipo;
				$original_component_portal_ds_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='ds';
				})->tipo;
				$original_component_portal_target_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='target_portal';
				})->tipo;

			// new (target section)
				$new_section_tipo = array_find($new, function($el){
					return $el->model==='section';
				})->tipo;
				$new_component_portal_tipo = array_find($new, function($el){
					return isset($el->role) && $el->role==='target_portal';
				})->tipo;
				$new_component_portal_ds_tipo = array_find($new, function($el){
					return isset($el->role) && $el->role==='ds';
				})->tipo;

			$table = common::get_matrix_table_from_tipo($original_section_tipo);
			if (empty($table)) {
				$response->msg = 'Invalid table from tipo: '.$original_section_tipo.'. Check your Ontology for configuration errors';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' original_section_tipo: ' . to_string($original_section_tipo)
					, logger::ERROR
				);
				return $response;
			}

			$created_records = 0;

		// section records
			// Fetch all rows for the source section ordered by section_id so the
			// migration runs deterministically and is easy to audit in logs.
			$sql = "
				SELECT id, section_id, datos FROM $table
				WHERE section_tipo = $1
				ORDER BY section_ID ASC
			";
			$result = matrix_db_manager::exec_search($sql, [$original_section_tipo]);

			// iterate resource row
			while($row = pg_fetch_assoc($result)) {

				$section_id	= (int)$row['section_id'];
				$datos		= json_handler::decode($row['datos']);
				$relations	= $datos->relations ?? [];

				// empty case
				if (empty($relations)) {
					continue;
				}

				// original_locators
					// Collect only the locators that belong to the deprecated source portal
					// component; these are the ones that will be promoted to the new sub-level.
					$original_locators = array_filter($relations, function($el) use($original_component_portal_tipo) {
						return $el->from_component_tipo === $original_component_portal_tipo;
					});
					// empty case
					if (empty($original_locators)) {
						continue;
					}

				// original_ds_locators
					// Descriptor (DS) locators are paired with each source locator by matching
					// section_id_key; they describe the role/nature of the relationship.
					$original_ds_locators = array_filter($relations, function($el) use($original_component_portal_ds_tipo) {
						return $el->from_component_tipo === $original_component_portal_ds_tipo;
					});

				// iterate original_locators
					// For each old source locator, create one new intermediate section,
					// link the original target into it, and copy the corresponding DS locators.
					foreach ($original_locators as $current_locator) {

						// create new record on target section
							$new_section = section::get_instance(
								null, // string|null section_id
								$new_section_tipo // string section_tipo
							);
							$new_section_id = $new_section->Save();

						// update counter
							$created_records++;

						// append new locator to new portal. sample: add created locator to portal 'Creators'
							// Attach the newly created reference section_id to the source record's
							// target portal, so the source now points at the intermediate section.
							$original_component_portal_target = component_common::get_instance(
								ontology_node::get_model_by_tipo($original_component_portal_target_tipo,true), // string model
								$original_component_portal_target_tipo, // string tipo
								$section_id, // string section_id
								'list', // string mode
								DEDALO_DATA_NOLAN, // string lang
								$original_section_tipo // string section_tipo
							);

							$new_locator = new locator();
								$new_locator->set_section_tipo($new_section_tipo);
								$new_locator->set_section_id($new_section_id);
								$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

							$original_component_portal_target->add_locator_to_data($new_locator);
							// save component
							$original_component_portal_target->Save();

						// target section : add elements. sample: add current emperor to portal 'People' in the new section
							// Within the new intermediate section, store the original target entity
							// (e.g. the person/entity record) in the new target portal.
							$new_component_portal = component_common::get_instance(
								ontology_node::get_model_by_tipo($new_component_portal_tipo,true), // string model
								$new_component_portal_tipo, // string tipo
								$new_section_id, // string section_id
								'list', // string mode
								DEDALO_DATA_NOLAN, // string lang
								$new_section_tipo // string section_tipo
							);

							$new_locator = new locator();
								$new_locator->set_section_tipo($current_locator->section_tipo);
								$new_locator->set_section_id($current_locator->section_id);
								$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

							$new_component_portal->add_locator_to_data($new_locator);
							// save component
							$new_component_portal->Save();

						// ds
							// Match DS locators to this source locator by section_id_key
							// (the DS locator's section_id_key equals the source locator's section_id).
							$current_ds_locators = array_filter($original_ds_locators, function($el) use($current_locator) {
								return $el->section_id_key == $current_locator->section_id;
							});
							// empty case
							if (empty($current_ds_locators)) {
								continue;
							}
							foreach ($current_ds_locators as $ds_locator) {

								// new_component_portal_ds. sample: add role 'Series arrangement' to portal 'Role' in the new section
								$new_component_portal_ds = component_common::get_instance(
									ontology_node::get_model_by_tipo($new_component_portal_ds_tipo,true), // string model
									$new_component_portal_ds_tipo, // string tipo
									$new_section_id, // string section_id
									'list', // string mode
									DEDALO_DATA_NOLAN, // string lang
									$new_section_tipo // string section_tipo
								);

								$new_locator = new locator();
									$new_locator->set_section_tipo($ds_locator->section_tipo);
									$new_locator->set_section_id($ds_locator->section_id);
									$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

								$new_component_portal_ds->add_locator_to_data($new_locator);
								// save component
								$new_component_portal_ds->Save();
							}

					}//end foreach ($original_locators as $current_locator)

				// delete_old_data (default is true). Remove previous portal locators and DS locators
					// Cleanup runs per source record, after all new records are committed for it,
					// so a partial run can be resumed without creating duplicate new sections.
					if ($delete_old_data===true) {
						self::delete_relations_dato(
							$original_section_tipo,
							$section_id,
							[...$original_locators, ...$original_ds_locators] // locators_to_remove
						);
					}
			}//end while($row = pg_fetch_assoc($result))

		// response
			$response->result	= true;
			$response->msg		= 'OK. created_records: ' . $created_records;


		return $response;
	}//end add_portal_level



	/**
	* DELETE_RELATIONS_DATO
	* Removes a targeted subset of locators from a section's raw relations array,
	* writing the cleaned JSON back to the matrix table directly via SQL UPDATE.
	*
	* This bypasses component_common::Save(), so it produces no Time Machine
	* entry and no activity log. It is intentionally a "surgical" low-level
	* operation used only during data migration cleanup.
	*
	* Matching uses locator::in_array_locator() keyed on ['section_id','section_tipo'],
	* so two locators are considered equal if both their section_tipo and section_id
	* match — from_component_tipo and type are ignored in the comparison.
	*
	* (!) Returns false both on database error and when no matching row is found;
	* callers must distinguish the two cases through their own context.
	*
	* @param string $section_tipo - Ontology tipo identifying the source section
	* @param string|int $section_id - Record identifier within that section
	* @param array $locators_to_remove - Locator objects to strip (matched by section_id + section_tipo)
	* @return bool - true on successful write, false if no row found or on DB error
	*/
	private static function delete_relations_dato(string $section_tipo, string|int $section_id, array $locators_to_remove) : bool {

		// Retrieve the matrix table associated with the given section_tipo.
		$table = common::get_matrix_table_from_tipo($section_tipo);
		if (empty($table)) {
			debug_log(__METHOD__
				. ' Invalid table from tipo. Check your Ontology for configuration errors' . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo)
				, logger::ERROR
			);
			return false;
		}

		$sql = "
			SELECT id, section_id, datos FROM $table
			WHERE section_tipo = $1
			AND section_id = $2
		";
		$current_result = matrix_db_manager::exec_search($sql, [$section_tipo, $section_id]);

		while($row = pg_fetch_assoc($current_result)) {

			$id		= $row['id'];
			$datos	= json_handler::decode( $row['datos'] );

			// relations empty case
				// (!) BUG — DOCUMENT ONLY, DO NOT FIX: the condition uses '&&' (AND) which
				// means it only skips when BOTH $datos is empty AND $datos->relations is empty.
				// When $datos is null or false the second operand triggers a PHP warning for
				// property access on null. The guard should be '||' (OR).
				if (empty($datos) && empty($datos->relations)) {
					continue;
				}

			$clean_relations = [];
			foreach ($datos->relations as $locator) {

				$match = locator::in_array_locator($locator, $locators_to_remove, ['section_id','section_tipo']);
				if ($match===true) {
					continue; // skip locator
				}

				$clean_relations[] = $locator;
			}

			// No-op guard: if the count is unchanged, none of the supplied locators
			// matched anything in this row — log and skip to avoid a pointless UPDATE.
			if (count($datos->relations)===count($clean_relations)) {
				debug_log(__METHOD__
					." Ignored delete action because nothing is changed. id: $id ($section_tipo-$section_id)"
					, logger::ERROR
				);
				continue;
			}

			// overwrite relations
			$datos->relations = $clean_relations;

			$section_data_encoded = json_handler::encode($datos);

			// save record
			$sql	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
			$result = matrix_db_manager::exec_search($sql, [$section_data_encoded, $id]);
			if($result===false) {
				$msg = "Failed Update section_data id: $id ($section_tipo-$section_id)";
				debug_log(__METHOD__
					." ERROR: $msg "
					, logger::ERROR
				);
				return false;
			}else{
				debug_log(__METHOD__
					." OK. record updated id: $id ($section_tipo-$section_id)"
					, logger::WARNING
				);
				return true;
			}
		}

		// No records found for the given section_tipo, section_id.
		return false;
	}//end delete_relations_dato



	/**
	* UPDATE_DATAFRAME_TO_V6_1
	* Entry point that triggers the dataframe v6.1 migration on the matrix table.
	*
	* Invokes update::convert_table_data() which iterates every row of 'matrix'
	* and passes each decoded $datos object to fix_dataframe_action() as a callback.
	* If fix_dataframe_action() returns a non-null object, the runner re-encodes it
	* and writes it back to the row.
	*
	* The commented-out table names show the full set of matrix tables evaluated
	* at the time this migration was written; only 'matrix' was needed.
	*
	* @return bool - always true (errors are logged inside the callback)
	*/
	public static function update_dataframe_to_v6_1() : bool {

		$ar_tables = [
			// 'new_matrix'
			'matrix',
			// 'matrix_activities',
			// 'matrix_dataframe',
			// 'matrix_dd',
			// 'matrix_hierarchy',
			// 'matrix_hierarchy_main',
			// 'matrix_indexations',
			// 'matrix_langs',
			// 'matrix_layout',
			// 'matrix_layout_dd',
			// 'matrix_list',
			// 'matrix_notes',
			// 'matrix_profiles',
			// 'matrix_projects',
			// 'matrix_structurations',
			// 'matrix_tools',
			// 'matrix_users',
			// 'matrix_stats'
		];
		$action = 'transform_data::fix_dataframe_action';

		update::convert_table_data($ar_tables, $action);

		return true;
	}//end update_dataframe_to_v6_1



	/**
	* FIX_DATAFRAME_ACTION
	* Callback for update::convert_table_data() that upgrades individual dataframe
	* locators from the v5 flat-inline model to the v6.1 dedicated-section model.
	*
	* In v5 a dataframe locator was embedded directly in the parent component's
	* relations array with a section_id_key property pointing at the related record.
	* In v6.1 each dataframe entry has its own section record (tipo rsc1242) so that
	* weight and other metadata can be stored independently.
	*
	* For each locator that carries section_id_key (i.e. an old-style dataframe entry):
	*   - A new rsc1242 ("dataframe active") section is created via section::Save().
	*   - The locator's section_id and section_tipo are rewritten to point at the
	*     new section.
	*   - The from_component_tipo is renamed to the v6.1 equivalent tipo.
	*
	* Only the specific numisdata/oh/rsc component tipos listed in the switch were
	* known to use the old format at migration time; any unrecognised from_component_tipo
	* is left untouched (default branch).
	*
	* Returning null signals to the caller that the row is unchanged and should not
	* be re-saved (used when no section_id_key locator is found, or datos has no
	* relations).
	*
	* Note: $ratting_tipo ('rsc1246', Weight) is declared but unused in this method —
	* it appears to be reserved for a weight-migration step that was not implemented.
	*
	* @param object|null $datos - Decoded row datos object passed by the update runner
	* @return object|null - Modified $datos, or null if no changes were made
	*/
	public static function fix_dataframe_action(?object $datos) : ?object {

		// empty relations cases
			if (empty($datos->relations)) {
				return null;
			}

		// fixed tipos
			$target_section_tipo	= 'rsc1242'; // dataframe active
			$ratting_tipo			= 'rsc1246'; // Weight

		// dataframe_to_save initial is false
			$dataframe_to_save = false;

		// relations container iteration
			$relations = $datos->relations ?? [];
			foreach ($relations as $locator) {

				if(isset($locator->section_id_key)) {

					$dataframe_to_save = true;

					// section
						// Factory closure to lazily create a fresh rsc1242 record.
						// Called once per v5 locator that must be promoted.
						$create_new_rating_section = function() use ($target_section_tipo){
							$section = section::get_instance(
								null, // string|null section_id
								$target_section_tipo // string section_tipo
							);
							$new_target_section_id = $section->Save();

							return $new_target_section_id;
						};

					// locator edit
						// Map the deprecated from_component_tipo to its v6.1 replacement.
						// Cases that require a new rsc1242 section also rewrite section_id and section_tipo.
						switch ($locator->from_component_tipo) {
							case 'numisdata885':
								// Numismatic object Type data frame
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1447';
								break;

							case 'numisdata1017':
								// types Mint data frame
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1448';
								break;

							case 'numisdata865':
								// types Denomination data frame
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1449';
								break;

							case 'oh126':
								// Informants role
								$locator->from_component_tipo	= 'oh115';
								break;

							case 'rsc1057':
								// Entities role
								$locator->from_component_tipo	= 'rsc1265';
								break;

							default:
								// Nothing to change
								break;
						}
				}//end if(isset($locator->section_id_key))

			}//end foreach ($relations as $locator)

		// no changes case
			if($dataframe_to_save === false){
				return null;
			}


		return $datos;
	}//end fix_dataframe_action


	/**
	* GET_TM_DATA_FROM_TIPO
	* Returns all matrix_time_machine rows for the given section + component tipo.
	*
	* The caller is responsible for iterating the returned result resource with
	* pg_fetch_assoc(). Returns false if the query itself fails (the doc-block
	* claim about returning an empty array is outdated — the actual return type is
	* \PgSql\Result|false).
	*
	* @param string|int $section_id - Section record identifier
	* @param string $section_tipo - Ontology tipo of the section
	* @param string $tipo - Ontology tipo of the component (or section) whose TM rows are needed
	* @return \PgSql\Result|false - PostgreSQL result resource, or false on query failure
	*/
	public static function get_tm_data_from_tipo(string|int $section_id, string $section_tipo, string $tipo) : \PgSql\Result|false {

		// get all records of the time_machine for the given component
		$sql = "
			SELECT * FROM matrix_time_machine
			WHERE section_id = $1
			AND section_tipo = $2
			AND tipo = $3
		";
		$result = matrix_db_manager::exec_search($sql, [$section_id, $section_tipo, $tipo]);

		return $result;
	}//end get_tm_data_from_tipo



	/**
	* SET_TM_DATA
	* Overwrites the 'dato' column of a specific matrix_time_machine row by primary key.
	*
	* The data array is JSON-encoded via json_handler::encode() and then sanitised to
	* replace null bytes that cause PostgreSQL TEXT column errors.
	*
	* (!) Stale doc-block: the original @param listed $section_id (string|int) as the
	* first parameter — the actual first parameter is $matrix_id (int), the row PK.
	*
	* (!) Always returns true even when the underlying pg_query_params() call fails;
	* the only indication of failure is a debug_log at ERROR level.
	*
	* @param int $matrix_id - Primary key of the matrix_time_machine row to update
	* @param array $data - New dato payload; will be JSON-encoded before writing
	* @return bool - true always (DB failure is only logged, not propagated)
	*/
	public static function set_tm_data( int $matrix_id, array $data) : bool {

		// data_encoded : JSON ENCODE ALWAYS !!!
			$data_encoded = json_handler::encode($data);
			// prevent null encoded errors
			$safe_data = str_replace(['\\u0000','\u0000'], ' ', $data_encoded);

			$query	= "UPDATE matrix_time_machine SET dato = $1 WHERE id = $2 ";
			$result	= pg_query_params(DBi::_getConnection(), $query, [$safe_data, $matrix_id]);
			if($result===false) {
				$msg = "Failed Update section_data $matrix_id";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					.' strQuery: ' . $query
					, logger::ERROR
				);
			}

		return true;
	}//end set_tm_data



	/**
	* UPDATE_PAPER_LIB_DATA
	* Entry point that triggers removal of legacy 'lib_data' entries from
	* component_image (rsc29) within the resources images section (rsc170).
	*
	* Delegates to update::convert_table_data() which feeds each decoded $datos
	* object to remove_paper_lib_data_rsc29() as a callback. Only rows where
	* remove_paper_lib_data_rsc29() returns a non-null object are re-saved.
	*
	* @return bool - always true (individual row errors are logged inside the callback)
	*/
	public static function update_paper_lib_data() : bool {

		$ar_tables = [
			'matrix'
		];
		$action = 'transform_data::remove_paper_lib_data_rsc29';

		update::convert_table_data($ar_tables, $action);

		return true;
	}//end update_paper_lib_data



	/**
	* REMOVE_PAPER_LIB_DATA_RSC29
	* Callback for update::convert_table_data() that strips the legacy 'lib_data'
	* property from the first image dato entry of component_image (rsc29) inside
	* resources images section (rsc170).
	*
	* 'lib_data' was a transient property populated by the "Paper" image library
	* integration; it was removed from the data model and must be cleaned from
	* persisted rows that still carry it.
	*
	* Returns null (no change) if:
	* - The row is not from section rsc170
	* - The components object is absent
	* - The expected dato path down to the first array element is not navigable
	* - The first element has no 'lib_data' property
	*
	* @param object|null $datos - Decoded row datos object passed by the update runner
	* @return object|null - Modified $datos with lib_data removed, or null if unchanged
	*/
	public static function remove_paper_lib_data_rsc29(?object $datos) : ?object {

		// fixed tipos
			$section_tipo	= 'rsc170'; // resources images
			$component_tipo	= 'rsc29'; // component_image

		// filter section_tipo
			// Fast-skip: this callback only applies to rsc170 rows; ignore everything else.
			if ($datos->section_tipo!==$section_tipo) {
				return null;
			}

		// empty relations cases
			if (empty($datos->components)) {
				return null;
			}

		// check value
			$lang = 'lg-nolan';
			if (	!isset($datos->components->{$component_tipo})
				 || !isset($datos->components->{$component_tipo}->dato)
				 || !isset($datos->components->{$component_tipo}->dato->{$lang})
				 || !is_array($datos->components->{$component_tipo}->dato->{$lang})
				 || !isset($datos->components->{$component_tipo}->dato->{$lang}[0])
				 || !isset($datos->components->{$component_tipo}->dato->{$lang}[0]->lib_data)
				) {
				return null;
			}

		// remove property if present
			unset($datos->components->{$component_tipo}->dato->{$lang}[0]->lib_data);

		// log
			debug_log(__METHOD__
				. ' Updating record ' . PHP_EOL
				. ' section_tipo: ' . $datos->section_tipo . PHP_EOL
				. ' section_id: ' . $datos->section_id . PHP_EOL
				. ' component ' . $component_tipo .' : ' . to_string($datos->components->{$component_tipo}->dato->{$lang}[0])
				, logger::WARNING
			);


		return $datos;
	}//end remove_paper_lib_data_rsc29



	/**
	* UPDATE_HIERARCHY_VIEW_IN_THESAURUS
	* Entry point that triggers the migration adding a separate "view in thesaurus"
	* component to all matrix_hierarchy_main rows.
	*
	* Delegates to update::convert_table_data() which calls add_view_in_thesaurus()
	* for each row. Unlike most callbacks, add_view_in_thesaurus() always returns
	* null (it writes its own data via component_common::Save()) so convert_table_data()
	* never performs an additional SQL UPDATE on its own.
	*
	* The commented-out table list records all matrix tables considered at migration
	* time; only matrix_hierarchy_main was required.
	*
	* @return bool - always true
	*/
	public static function update_hierarchy_view_in_thesaurus() : bool {

		$ar_tables = [
			// 'new_matrix'
			// 'matrix',
			// 'matrix_activities',
			// 'matrix_dataframe',
			// 'matrix_dd',
			// 'matrix_hierarchy',
			'matrix_hierarchy_main',
			// 'matrix_indexations',
			// 'matrix_langs',
			// 'matrix_layout',
			// 'matrix_layout_dd',
			// 'matrix_list',
			// 'matrix_notes',
			// 'matrix_profiles',
			// 'matrix_projects',
			// 'matrix_structurations',
			// 'matrix_tools',
			// 'matrix_users',
			// 'matrix_stats'
		];
		$action = 'transform_data::add_view_in_thesaurus';

		update::convert_table_data($ar_tables, $action);

		return true;
	}//end update_hierarchy_view_in_thesaurus



	/**
	* ADD_VIEW_IN_THESAURUS
	* Callback for update::convert_table_data() that creates a separate
	* "view in thesaurus" component (DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO)
	* for every hierarchy node that has an "active" locator.
	*
	* Prior to this migration the thesaurus visibility was controlled by the same
	* component that governed hierarchy active/inactive state. Separating them lets
	* a hierarchy remain active while its term is hidden from the thesaurus tree,
	* and vice versa.
	*
	* The new component is saved via component_common::Save() (generating a Time
	* Machine entry). This method therefore never modifies $datos directly and
	* always returns null so that the update runner skips its own UPDATE.
	*
	* Idempotency: if the view_in_ts component already has data (get_dato() is
	* non-empty), the method returns null early without creating a duplicate.
	*
	* Note: return type is absent from the signature (untyped) because PHP does not
	* allow 'null' as a standalone return type declaration; the effective type is
	* always null.
	*
	* @param object|null $datos - Decoded row datos object passed by the update runner
	* @return null - Always null; the save is handled internally via component::Save()
	*/
	public static function add_view_in_thesaurus(?object $datos) {

		// empty relations cases
			if (empty($datos) || empty($datos->relations)) {
				return null;
			}

		// fixed tipos
			$active		= DEDALO_HIERARCHY_ACTIVE_TIPO;
			$view_in_ts	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;
			$model		= ontology_node::get_model_by_tipo($view_in_ts,true);

		// relations container iteration
			$relations = $datos->relations ?? [];
			foreach ($relations as $locator) {

				if($locator->from_component_tipo === $active){

					// hierarchy view_in_ts
					$component_view_in_ts = component_common::get_instance(
						$model,
						$view_in_ts,
						$datos->section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$datos->section_tipo
					);

					$component_data = $component_view_in_ts->get_dato();
					if(!empty($component_data)){
						return null;
					}

					$view_in_ts_data = new locator();
						$view_in_ts_data->section_id	= $locator->section_id;
						$view_in_ts_data->section_tipo	= $locator->section_tipo;

					$component_view_in_ts->set_dato($view_in_ts_data);
					$component_view_in_ts->Save();
				}//end if($locator->from_component_tipo === $active)

			}//end foreach ($relations as $locator)

		return null;
	}//end add_view_in_thesaurus



	/**
	* CHANGES_IN_TIPOS
	* Renames ontology tipos (identifiers) across every column and JSON property
	* of the given matrix tables according to a declarative JSON map.
	*
	* Use case: when the TLD prefix of a project section or component changes (e.g.
	* "numisdata885" → "numisdata1447"), every stored reference must be rewritten so
	* that the platform continues to resolve data correctly.
	*
	* JSON definition files live in:
	*   core/base/transform_definition_files/move_tld/
	* Each file contains a JSON array of transform objects:
	*   { "old": "numisdata885", "new": "numisdata1447", "type": "section|component",
	*     "perform": ["replace_tipo"], "skip_virtuals": ["..."], "info": "..." }
	*
	* Processing order per row:
	*   1. section_tipo column — replaced if old matches
	*   2. tipo column (matrix_time_machine only) — replaced when section_tipo is in
	*      the affected section list, to avoid renaming virtual-section TM entries
	*   3. datos JSONB — relations/relations_search locator properties, components keys,
	*      inverse_locators (removed), and scalar top-level properties (e.g. section_tipo)
	*   4. dato column (matrix_time_machine) — string-replace of quoted tipo tokens
	*
	* For the 'components' / 'diffusion_info' keys a "perform" action method is
	* dispatched dynamically (e.g. replace_tipo). matrix_activity rows are handled
	* with a string-search shortcut before the full JSONB walk.
	*
	* @param array $ar_tables - Matrix table names to iterate (e.g. ['matrix','matrix_list'])
	* @param array $json_files - File names relative to move_tld/ directory
	* @return bool - true on success; false if a pg_query_params() call fails
	*/
	public static function changes_in_tipos(array $ar_tables, array $json_files) : bool {

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " changes_in_tipos - tables: " . json_encode($ar_tables) . PHP_EOL
			. " changes_in_tipos - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		// get transform map from files
			$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_tld/';
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {

				$contents = file_get_contents($path.$current_json_file);
				if ($contents === false) {
					debug_log(__METHOD__ . " ERROR: Failed to read JSON file: " . $path, logger::ERROR);
					continue; // Skip to next file
				}

				$transform_map = json_decode($contents);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($transform_map) && !is_object($transform_map)) {
					debug_log(__METHOD__ . " ERROR: Failed to decode JSON from file: " . $path . ". Error: " . json_last_error_msg(), logger::ERROR);
					continue; // Skip to next file
				}

				foreach ($transform_map as $transform_object) {
					// Ensure $transform_object is an object and has 'old' property
					if (is_object($transform_object) && isset($transform_object->old)) {
						$ar_transform_map[$transform_object->old] = $transform_object;
					} else {
						debug_log(__METHOD__ . " WARNING: Ignored Invalid transform object found in " . $path . ": " . json_encode($transform_object), logger::ERROR);
					}
				}
			}

		// ar_section_elements. Select affected sections
			// Only section-level entries drive the section_tipo column updates; component
			// entries are applied inside the JSONB datos walk.
			$ar_section_elements = array_filter($ar_transform_map, function($el){
				return $el->type==='section';
			});
			// ar_old_section_tipo without keys like ["numisdata279"]
			// Flat list of old section tipos used to scope the matrix_time_machine tipo update.
			$ar_old_section_tipo = array_map(function($el){
				return $el->old;
			}, $ar_section_elements);

		// skip_virtuals
			// Some section entries declare a list of virtual-section tipos that share
			// the same matrix table but must NOT have their datos rewritten (e.g.
			// internal dd* sections stored alongside real data sections).
			$skip_virtuals = array_map(function($el){
				return $el->skip_virtuals ?? [];
			}, $ar_section_elements);
			$skip_virtuals = array_flatten($skip_virtuals);

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// iterate tables
		update::tables_rows_iterator(
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) use($ar_transform_map, $ar_old_section_tipo, $skip_virtuals) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$dato			= (isset($row['dato'])) ? json_handler::decode($row['dato']) : null; // matrix_time_machine
				$tipo			= $row['tipo'] ?? null; // matrix_time_machine

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': changes_in_tipos'
							. ' | table: '			. $table
							. ' | id: '				. $id .' - ' . $max
							. ' | section_tipo: '	. $section_tipo
							. ' | section_id: '		. ($row['section_id'] ?? '');
						common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
							? dd_memory_usage() // update memory information once every 5000 items
							: common::$pdata->memory;
						common::$pdata->table = $table;
						common::$pdata->section_tipo = $section_tipo;
						common::$pdata->counter++;
						// send to output
						print_cli(common::$pdata);
					}

				// matrix_counter case
				if ( $table==='matrix_counter' ) {
					// delete record
					if( isset($ar_transform_map[$tipo]) ){
						$strQuery	= "DELETE FROM $table WHERE id = $1 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $id ));
						if($result===false) {
							$msg = "Failed Update section_tipo ($table) - $id";
							debug_log(__METHOD__
								." ERROR: $msg "
								, logger::ERROR
							);
							return false;
						}
					}
					return;
				}

				// section_tipo. All tables has section_tipo
				if( isset($section_tipo) && isset($ar_transform_map[$section_tipo]) ){

					$new_section_tipo = $ar_transform_map[$section_tipo]->new;

					$strQuery	= "UPDATE $table SET section_tipo = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_section_tipo, $id ));
					if($result===false) {
						$msg = "Failed Update section_tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// tipo. Only matrix_time_machine has tipo, it could not be set.
				// (!) Change only if section_tipo match any of ar_old_section_tipo
				if( isset($tipo) && isset($ar_transform_map[$tipo]) && in_array($section_tipo, $ar_old_section_tipo) ){

					$new_tipo = $ar_transform_map[$tipo]->new;

					$strQuery	= "UPDATE $table SET tipo = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_tipo, $id ));
					if($result===false) {
						$msg = "Failed Update tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// datos. Common matrix tables
				if( isset($datos) ){

					// check sections to change data to prevent change virtual sections data, etc.
					if ($table==='matrix_activity') {

						// whole record column 'datos' as '{"label":"Activity","relations":[{"type":"dd151",...'
						$datos_string = json_encode($datos);

						$contains_old_section_tipo = false;
						foreach ($ar_old_section_tipo as $current_old_section_tipo) {
							if (strpos($datos_string, '"'.$current_old_section_tipo.'"')!==false) {
								$contains_old_section_tipo = true;
								break;
							}
						}
						if ($contains_old_section_tipo===false) {
							// skip non containing sections records
							return;
						}
					}
					else if ( in_array($section_tipo, $skip_virtuals) ) {
						// check column section_tipo match for tables distinct to 'matrix_activity'
						// skip non wanted sections records (column section_tipo is not included in the sections to change list)
						return;
					}

					// datos properties
					// Walk every top-level property of the datos JSON object and rewrite
					// any tipo references found in it according to the transform map.
					foreach ($datos as $datos_key => $datos_value) {

						if( empty($datos_value) ){
							continue;
						}

						switch ($datos_key) {
							case 'relations_search':
							case 'relations':
								// update relations array
								// Iterate every locator property; any scalar value that appears as a
								// key in $ar_transform_map gets replaced with its 'new' equivalent.
								// Non-scalar values (nested objects/arrays) are skipped and logged.
								$relations = $datos_value ?? [];

								foreach ($relations as $locator) {
									foreach ($locator as $loc_key => $loc_value) {

										if (!is_string($loc_value) && !is_int($loc_value)) {
											debug_log(__METHOD__
												. " Ignored locator value ! " . PHP_EOL
												. ' loc_key: ' . to_string($loc_key) . PHP_EOL
												. ' loc_value: ' . to_string($loc_value) . PHP_EOL
												. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
												. ' table: ' . $table . PHP_EOL
												. ' id: ' . $id . PHP_EOL
												. ' locator: ' . to_string($locator)
												, logger::ERROR
											);
											continue;
										}

										if( isset($ar_transform_map[$loc_value]) ){
											// replace old tipo with the new one in any locator property
											$locator->{$loc_key} = $ar_transform_map[$loc_value]->new;
										}
									}
								}
								break;

							case 'diffusion_info':
							case 'components':
								// update components object
								// Rebuild the components/diffusion_info object key-by-key.
								// For any component tipo found in the transform map, dispatch
								// the named "perform" action method (e.g. replace_tipo) instead
								// of copying the value verbatim, allowing the action to rename
								// the key and/or transform the value. Components not in the map
								// are copied unchanged into $new_components.
								$literal_components = $datos_value ?? [];

								$new_components = new stdClass();

								foreach ($literal_components as $literal_tipo => $literal_value) {
									if( isset($ar_transform_map[$literal_tipo]) ){

										// replace old tipo with the new one in any locator property
										$perform = $ar_transform_map[$literal_tipo]->perform;
										foreach ($perform as $action) {

											// check method already exists
												if(!method_exists('transform_data', $action)) {
													debug_log(__METHOD__
														. " Error. Calling undefined method transform_data::$action . Ignored action !"
														, logger::ERROR
													);
													continue;
												}

											$options = new stdClass();
												$options->transform_object	= $ar_transform_map[$literal_tipo];
												$options->new_components	= &$new_components; // pass by reference to allow add (!)
												$options->literal_tipo		= $literal_tipo;
												$options->literal_value		= $literal_value;

											transform_data::{$action}( $options );
										}
									}else{
										$new_components->{$literal_tipo} = $literal_value;
									}
								}
								// replace whole object
								$datos->$datos_key = $new_components;
								break;

							case 'inverse_locators':
								// remove old data
								// inverse_locators is a derived/cached field that is regenerated
								// on demand; stripping it avoids stale tipo references.
								unset($datos->{$datos_key});
								break;

							default:
								// update other properties like section_tipo, section_real_tipo, etc.
								// Handles scalar top-level properties whose value is itself a tipo
								// (e.g. section_tipo, section_real_tipo stored inside datos JSON).
								$test_tipo = to_string($datos_value);
								if( isset($ar_transform_map[$test_tipo]) ){
									$datos->{$datos_key} = $ar_transform_map[$test_tipo]->new;
								}
								break;
						}
					}//end foreach ($datos as $datos_key => $datos_value)

					$section_data_encoded = json_encode($datos);

					$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}//end if( isset($datos) )

				// dato. Time machine matrix table
				if( isset($dato) && !empty($dato) && $table!=='matrix_counter'){

					$string_value = is_string($dato)
						? $dato
						: json_encode($dato);

					$options = new stdClass();
						$options->ar_transform_map	= $ar_transform_map;
						$options->tipo				= $tipo;
						$options->value				= $string_value;

					$new_dato_encoded = transform_data::replace_tm_data( $options );

					if($string_value !== $new_dato_encoded ){
						$strQuery	= "UPDATE $table SET dato = $1 WHERE id = $2 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato_encoded, $id ));
						if($result===false) {
							$msg = "Failed Update time machine ($table) record $id";
							debug_log(__METHOD__
								." ERROR: $msg "
								, logger::ERROR
							);
							return false;
						}
					}
				}//end if( isset($dato) )
			}//end anonymous function
		);


		return true;
	}//end changes_in_tipos



	/**
	* REPLACE_TIPO
	* "perform" action callback that renames a component key inside the components
	* or diffusion_info object during a changes_in_tipos() or change_data_lang() run.
	*
	* Reads the old literal_value from $options and assigns it to $new_components
	* under the new tipo name supplied by transform_object->new. The $new_components
	* object is passed by reference so mutations are visible to the caller.
	*
	* This is the simplest "perform" action: it renames the key and preserves the
	* value unchanged. More complex actions (e.g. lang_to_nolan) also transform
	* the value.
	*
	* @param object $options - Contains: transform_object (the map entry), new_components (by ref), literal_value
	* @return void
	*/
	public static function replace_tipo(object $options) {

		$transform_object	= $options->transform_object;
		$new_components		= $options->new_components; // pass by reference
		$literal_value		= $options->literal_value;

		// new tipo is transform_object map 'new' property
		$new_tipo = $transform_object->new;

		// modifies passed by reference object new_components
		$new_components->{$new_tipo} = $literal_value;
	}//end replace_tipo



	/**
	* REPLACE_TM_DATA
	* Rewrites tipo references inside a matrix_time_machine 'dato' column value
	* (stored as a raw JSON string) during a changes_in_tipos() run.
	*
	* Uses str_replace on the serialised JSON so that every occurrence of a quoted
	* old tipo (e.g. "numisdata885") is replaced by its new equivalent without
	* having to parse and re-encode the JSON. This is intentionally a string-level
	* operation for speed and robustness on large TM tables.
	*
	* Note: the original doc-block described this as setting a new_components key —
	* that description belongs to replace_tipo(). This method has a distinct
	* purpose: it returns the modified string value rather than modifying a shared
	* object.
	*
	* @param object $options - Contains: ar_transform_map (keyed by old tipo), value (JSON string)
	* @return string - The (possibly modified) JSON string; unchanged if no tipos matched
	*/
	public static function replace_tm_data(object $options) {

		$ar_transform_map	= $options->ar_transform_map;
		$value				= $options->value;

		if (empty($value)) {
			return $value;
		}

		foreach ($ar_transform_map as $current_tipo => $transform_map_object) {
			$value = str_replace(
				'"' . $current_tipo . '"',
				'"' . $transform_map_object->new . '"',
				$value
			);
		}


		return $value;
	}//end replace_tm_data



	/**
	* DELETE_TIPOS
	* Removes all stored data (matrix rows, Time Machine entries, and relations table
	* rows) that belong to deprecated component tipos being retired from the ontology.
	*
	* Three scopes are affected per entry in $ar_to_delete:
	*
	* 1. datos JSONB (all non-activity matrix tables):
	*    - relations / relations_search: any locator whose from_component_tipo matches
	*      a deleted tipo is removed from the array.
	*    - components / diffusion_info: the key for the deleted tipo is omitted from
	*      the rebuilt object.
	*    matrix_activity rows are skipped entirely (return early) to avoid corrupting
	*    audit data.
	*
	* 2. matrix_time_machine rows (when delete_tm === true):
	*    Rows whose 'tipo' column matches a deleted component_tipo are hard-deleted.
	*
	* 3. "relations" table (when delete_relations === true):
	*    All rows in the dedicated relations table where from_component_tipo matches
	*    the deleted tipo are hard-deleted.
	*
	* @param array $ar_tables - Matrix table names to iterate
	* @param array $ar_to_delete - Deletion spec objects:
	*   [{ "component_tipo": string, "delete_tm": bool, "delete_relations": bool, "info": string }]
	* @return bool - true on success; false if any pg_query_params() call fails
	*/
	public static function delete_tipos(array $ar_tables, array $ar_to_delete) : bool {

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " delete_tipos - tables: " . json_encode($ar_tables) . PHP_EOL
			. " delete_tipos - ar_to_delete: " . json_encode($ar_to_delete) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		// get transform map from files
			$ar_delete_map = [];
			foreach ($ar_to_delete as $object_to_delete) {
				$ar_delete_map[$object_to_delete->component_tipo] = $object_to_delete;
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// delete into matrix tables
			update::tables_rows_iterator(
				$ar_tables, // array of tables to iterate
				function($row, $table, $max) use($ar_delete_map) { // callback function

					$id				= $row['id'];
					$section_tipo	= $row['section_tipo'] ?? null;
					$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
					$tipo			= $row['tipo'] ?? null; // matrix_time_machine

					// CLI process data
						if ( running_in_cli()===true ) {
							common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': delete_tipos'
								. ' | table: ' 			. $table
								. ' | id: ' 			. $id .' - ' . $max
								. ' | section_tipo: ' 	. $section_tipo
								. ' | section_id: '  	. ($row['section_id'] ?? '');
							common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
								? dd_memory_usage() // update memory information once every 5000 items
								: common::$pdata->memory;
							common::$pdata->table = $table;
							common::$pdata->section_tipo = $section_tipo;
							common::$pdata->counter++;
							// send to output
							print_cli(common::$pdata);
						}

					// datos. Common matrix tables
					if( isset($datos) ){

						// check sections to change data to prevent change virtual sections data, etc.
						if ($table==='matrix_activity') {

							return;
						}

						// datos properties
						foreach ($datos as $datos_key => $datos_value) {

							if( empty($datos_value) ){
								continue;
							}

							switch ($datos_key) {
								case 'relations_search':
								case 'relations':
									// update relations array
									$relations = $datos_value ?? [];

									foreach ($relations as $rel_key => $locator) {
										foreach ($locator as $loc_key => $loc_value) {

											if (!is_string($loc_value) && !is_int($loc_value)) {
												debug_log(__METHOD__
													. " Ignored locator value ! " . PHP_EOL
													. ' loc_key: ' . to_string($loc_key) . PHP_EOL
													. ' loc_value: ' . to_string($loc_value) . PHP_EOL
													. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
													. ' table: ' . $table . PHP_EOL
													. ' id: ' . $id . PHP_EOL
													. ' locator: ' . to_string($locator)
													, logger::ERROR
												);
												continue;
											}

											if( isset($ar_delete_map[$loc_value]) && $loc_key==='from_component_tipo' ){
												unset( $relations[$rel_key] );
											}
										}
									}

									// replace whole object
									$datos->$datos_key = array_values($relations);
									break;

								case 'diffusion_info':
								case 'components':
									// update components object
									$literal_components = $datos_value ?? [];

									$new_components = new stdClass();

									foreach ($literal_components as $literal_tipo => $literal_value) {

										// is the component is not set in the transform_map
										// assign it to the new_components.
										if( !isset($ar_delete_map[$literal_tipo]) ){
											$new_components->{$literal_tipo} = $literal_value;
										}
									}
									// replace whole object
									$datos->$datos_key = $new_components;
									break;
							}
						}//end foreach ($datos as $datos_key => $datos_value)

						$section_data_encoded = json_encode($datos);

						$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
						if($result===false) {
							$msg = "Failed Update section_data ($table) $id";
							debug_log(__METHOD__
								." ERROR: $msg "
								, logger::ERROR
							);
							return false;
						}
					}//end if( isset($datos) )

					// tipo. Time machine matrix table
					if( isset($tipo) && $table!=='matrix_counter'){

						// check $tipo need to be deleted already exists
						if( isset($ar_delete_map[$tipo]) && $ar_delete_map[$tipo]->delete_tm === true ){
							$strQuery	= "DELETE FROM $table WHERE id = $1 ";
							$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $id ));
							if($result===false) {
								$msg = "Failed delete time machine ($table) record $id";
								debug_log(__METHOD__
									." ERROR: $msg "
									, logger::ERROR
								);
								return false;
							}
						}

					}//end if( isset($dato) )
				}//end anonymous function
			);

		// delete into relations table
			foreach ($ar_delete_map as $delete_item) {
				if(isset($delete_item->delete_relations) && $delete_item->delete_relations === true ){
					$strQuery	= "DELETE FROM \"relations\" WHERE \"from_component_tipo\" = $1 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $delete_item->component_tipo ));
					if($result===false) {
						$msg = "Failed delete relations table records $delete_item->component_tipo";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}
			}


		return true;
	}//end delete_tipos



	/**
	* CHANGES_IN_LOCATORS
	* Migrates section records from one section_tipo to another across all matrix
	* tables, rebasing section_id values so that the new section's ID space does not
	* collide with existing records.
	*
	* JSON definition files live in:
	*   core/base/transform_definition_files/move_locator/
	* Each file is a JSON array of transform objects:
	*   { "old":"rsc194", "new":"rsc197", "type":"section",
	*     "base_counter": <auto-populated>, "info":"..." }
	*
	* section_id rebasing: before the migration starts, counter::get_counter_value()
	* is called for each new section_tipo. That value becomes "base_counter". Every
	* old section_id is then shifted by adding base_counter, so:
	*   new_section_id = old_section_id + base_counter
	* This guarantees uniqueness without touching the database counter table during
	* iteration.
	*
	* Columns updated per table row:
	* - section_tipo + section_id: the row's own identity is rewritten.
	* - tipo (matrix_time_machine): the TM component tipo is renamed and its dato
	*   is processed via process_locators_in_section_data().
	* - datos JSONB: all locator references (section_tipo, section_id) inside
	*   relations, relations_search, and component_text_area embedded tags are updated.
	* - dato (matrix_time_machine): if the dato is a locator array, updated via
	*   replace_locator_in_tm_data(); if it is a component_text_area literal,
	*   updated via replace_locator_in_string().
	* - matrix_activity rows receive special handling: only the dd551 component
	*   (activity change detail) and any string occurrences of old tipos are updated;
	*   the activity structure is then encoded with null-byte sanitisation.
	*   dd774 (security access) TM rows are skipped.
	*
	* Activity logging is disabled for the duration of this method to prevent the
	* migration itself from generating TM/activity entries.
	*
	* @param array $ar_tables - Matrix table names to iterate
	* @param array $json_files - File names relative to move_locator/ directory
	* @return bool - true on success; false if any pg_query_params() call fails
	*/
	public static function changes_in_locators(array $ar_tables, array $json_files) : bool {

		// disable activity log
			logger_backend_activity::$enable_log = false;


		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " changes_in_locators - tables: " . json_encode($ar_tables) . PHP_EOL
			. " changes_in_locators - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_locator/';
		// get transform map from files
			//  value: {
			//		"rsc194": {
			//			"old": "rsc194",
			//			"new": "rsc197",
			//			"type": "section",
			//			"perform": [
			//				"move_tld"
			//			],
			//			"info": "Old People section => New People under Study section"
			//		}
			//	}
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {
				$contents			= file_get_contents($path.$current_json_file);
				$transform_map		= json_decode($contents);
				foreach ($transform_map as $transform_object) {
					$ar_transform_map[$transform_object->old] = $transform_object;
				}
			}

		// ar_section_elements. Select affected sections
			$ar_section_elements = array_filter($ar_transform_map, function($el){
				return $el->type==='section';
			});
			// ar_old_section_tipo without keys like ["rsc194"]
			$ar_old_section_tipo = array_map(function($el){
				return $el->old;
			}, $ar_section_elements, []);

		// counter of the new sections.
			// counter will use as base section_id to add new section_id into the old section as:
			// rsc197 counter = 8500
			// old locator = rsc194_1
			// will transform to rsc197_8501
			// so, the new section_id will be `counter` + old_section_id
			// it maintain coherence with all locators in every table and section.
			foreach ($ar_transform_map as $key => $value) {
				$counter = counter::get_counter_value( $value->new );
				$ar_transform_map[$key]->base_counter = $counter;
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		update::tables_rows_iterator(
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) use($ar_transform_map, $ar_old_section_tipo) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$section_id		= $row['section_id'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$dato			= (isset($row['dato'])) ? json_handler::decode($row['dato']) : null; // matrix_time_machine
				$tipo			= $row['tipo'] ?? null; // matrix_time_machine

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': changes_in_locators'
							. ' | table: ' 			. $table
							. ' | id: ' 			. $id .' - ' . $max
							. ' | section_tipo: ' 	. $section_tipo
							. ' | section_id: '  	. ($row['section_id'] ?? '');
						common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
							? dd_memory_usage() // update memory information once every 5000 items
							: common::$pdata->memory;
						common::$pdata->table = $table;
						common::$pdata->section_tipo = $section_tipo;
						common::$pdata->counter++;
						// send to output
						print_cli(common::$pdata);
					}

				// section_tipo. All tables has section_tipo
				if( isset($section_tipo) && isset($ar_transform_map[$section_tipo]) ){

					// new section_id
						$base_section_id	= $ar_transform_map[$section_tipo]->base_counter;
						$new_section_id		= (int)$section_id + (int)$base_section_id;

					// new section tipo
						$new_section_tipo = $ar_transform_map[$section_tipo]->new;

					// add data to new section
					// create data to identify the moved from previous records
						if( isset($ar_transform_map[$section_tipo]->add_data_to_new_section) && isset($datos) ){

							$process = $ar_transform_map[$section_tipo]->add_data_to_new_section;
							foreach ($process as $fn_object) {
								$fn 		= $fn_object->fn;
								$fn_class 	= explode('::', $fn)[0];
								$fn_method 	= explode('::', $fn)[1];
								// check method already exists
									if(!method_exists($fn_class, $fn_method)) {
										debug_log(__METHOD__
											. " Error. Calling undefined method $fn_object->fn . Ignored process !"
											, logger::ERROR
										);
										continue;
									}
								//set current datos into the options
								$fn_object->options->datos = $datos;

								$fn( $fn_object->options );
							}
						}

					$strQuery	= "UPDATE $table SET section_tipo = $1, section_id = $2 WHERE id = $3 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_section_tipo, $new_section_id, $id ));
					if($result===false) {
						$msg = "Failed Update section_tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// tipo. Only matrix_time_machine has tipo, it could not be set.
				// (!) Change only if section_tipo match any of ar_old_section_tipo
				if( isset($tipo) && isset($ar_transform_map[$tipo]) && in_array($section_tipo, $ar_old_section_tipo) ){

					$options = new stdClass();
						$options->ar_transform_map	= $ar_transform_map;
						$options->datos				= $dato;

					$processed_data = ( !empty($dato) )
						? transform_data::process_locators_in_section_data( $options )
						: null;

					$section_data_encoded = json_encode($processed_data);

					$new_tipo = $ar_transform_map[$tipo]->new;

					$strQuery	= "UPDATE $table SET tipo = $1, dato = $2 WHERE id = $3 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_tipo, $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// datos. Common matrix tables
				if( isset($datos) ){

					// matrix activity has a data has been changed by the time in the component dd551
					// in those case the change only is applied to this component
					if ($table==='matrix_activity') {

						$activity_data		= $datos;
						$old_activity_data	= json_encode($activity_data);

						//activity data is set into the dd551 component
						$dd551_value = $datos->components->dd551->dato->{DEDALO_DATA_NOLAN} ?? null;

						if( !empty($dd551_value) ){
							//store the old value to check if it change
							$old_dd51_value = json_encode($dd551_value);

							foreach ($dd551_value as $current_value) {
								// check tipo
								if(isset($current_value->tipo)
								&& isset($ar_transform_map[$current_value->tipo])
								&& $current_value->tipo === $ar_transform_map[$current_value->tipo]->old){
									// if data has tipo it will has id
									// change it with the base_counter
									if( isset($current_value->id) ){
										$current_value->id = (int)$ar_transform_map[$current_value->tipo]->base_counter + (int)$current_value->id;
									}
									$current_value->tipo = $ar_transform_map[$current_value->tipo]->new;
								}//end if

								// check section_tipo
								if(isset($current_value->section_tipo)
								&& isset($ar_transform_map[$current_value->section_tipo])
								&& $current_value->section_tipo === $ar_transform_map[$current_value->section_tipo]->old){
									// if data has section_tipo it will has section_id
									// change it with the base_counter
									if( isset($current_value->section_id) ){
										$current_value->section_id = (int)$ar_transform_map[$current_value->section_tipo]->base_counter + (int)$current_value->section_id;
									}
									$current_value->section_tipo = $ar_transform_map[$current_value->section_tipo]->new;
								}//end if

								// check top_tipo
								if(isset($current_value->top_tipo)
								&& isset($ar_transform_map[$current_value->top_tipo])
								&& $current_value->top_tipo === $ar_transform_map[$current_value->top_tipo]->old){
									// if data has top_tipo it will has top_id
									// change it with the base_counter
									if( isset($current_value->top_id) ){
										$current_value->top_id = (int)$ar_transform_map[$current_value->top_tipo]->base_counter + (int)$current_value->top_id;
									}
									$current_value->top_tipo = $ar_transform_map[$current_value->top_tipo]->new;
								}//end if

							}//end foreach

							$new_dd551_data = json_encode($dd551_value);
							// check if the dd551 data has been change, and set the new dd551 data
							if( $old_dd51_value !== $new_dd551_data ){
								$activity_data->components->dd551->dato->{DEDALO_DATA_NOLAN} = $dd551_value;
							}//end if
						}//end if

						// encode activity data
						// $new_activity_data = json_encode($activity_data);

						$new_activity_data  = json_handler::encode($activity_data);
						// prevent null encoded errors
						$new_activity_data = str_replace(['\\u0000','\u0000'], ' ', $new_activity_data);

						// change other data in activity
						// usually is data with section_tipo only as where component.
						// in those cases section_id is not assigned.
						// Only will change the component_tipo
						foreach ($ar_transform_map as $current_tipo => $transform_map_object) {
							$new_activity_data = str_replace(
								'"' . $current_tipo . '"',
								'"' . $transform_map_object->new . '"',
								$new_activity_data
							);
						}
						// if the activity was changed save it.
						if( $old_activity_data !== $new_activity_data ){

							$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
							$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_activity_data, $id ));
							if($result===false) {
								$msg = "Failed Update section_data ($table) $id";
								debug_log(__METHOD__
									." ERROR: $msg "
									, logger::ERROR
								);
								return false;
							}//end if
						}//end if

						// stop the process here. activity data is not compatible with other changes in standard sections.
						return true;

					}//end if ($table==='matrix_activity')

					// change the standard data in regular sections
					$options = new stdClass();
						$options->ar_transform_map	= $ar_transform_map;
						$options->datos				= $datos;

					$processed_data = ( !empty($datos) )
						? transform_data::process_locators_in_section_data( $options )
						: null;

					$section_data_encoded = json_encode($processed_data);

					$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}//end if( isset($datos) )

				// dato. Time machine matrix table
				// Time machine has specific columns and his data is of the component data, so it mix locators and literals.
				// excluding component security access
				if( isset($dato) && !empty($dato) && $table!=='matrix_counter' && $tipo!=='dd774'){
					// set all data as JSON
					$tm_value = is_string($dato)
						? json_decode($dato)
						: $dato;

					// save old data to be check before save
					$old_dato_encoded = json_encode( $tm_value );

					// current data is a locator
					if( is_array($tm_value) && is_object($tm_value[0]) && isset($tm_value[0]->section_tipo) && isset($tm_value[0]->type)){

						// process data as locator
						$options = new stdClass();
							$options->ar_transform_map	= $ar_transform_map;
							$options->tm_value			= $tm_value;

						$new_tm_value = transform_data::replace_locator_in_tm_data( $options );

						$new_dato_encoded = json_encode( $new_tm_value );

						//check if the data has been changed, if yes, save it.
						if($old_dato_encoded !== $new_dato_encoded){
							$strQuery	= "UPDATE $table SET dato = $1 WHERE id = $2 ";
							$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato_encoded, $id ));
							if($result===false) {
								$msg = "Failed Update time machine ($table) record $id";
								debug_log(__METHOD__
									." ERROR: $msg "
									, logger::ERROR
								);
								return false;
							}
						}
					}else{
						// if data is literal, it could be a component_text_area data and need to be processed as string
						$component_tm_model = ontology_node::get_model_by_tipo( $tipo );
						if( $component_tm_model==='component_text_area' ){

							$options = new stdClass();
								$options->string			= json_encode($tm_value);
								$options->ar_transform_map	= $ar_transform_map;

							$new_literal = transform_data::replace_locator_in_string( $options );

							//check if the data has been changed, if yes, save it.
							if($old_dato_encoded !== $new_literal ){
								$strQuery	= "UPDATE $table SET dato = $1 WHERE id = $2 ";
								$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_literal, $id ));
								if($result===false) {
									$msg = "Failed Update time machine ($table) record $id";
									debug_log(__METHOD__
										." ERROR: $msg "
										, logger::ERROR
									);
									return false;
								}
							}
						}
					}//end if ( is_array($tm_value) && is_object($tm_value[0]) && isset($tm_value[0]->section_tipo) && isset($tm_value[0]->type))
				}//end if( isset($dato) )
			}//end anonymous function
		);

		// re-enable activity log
			logger_backend_activity::$enable_log = true;


		return true;
	}//end changes_in_locators



	/**
	* PROCESS_LOCATORS_IN_SECTION_DATA
	* Rewrites every locator reference inside a decoded datos object according to
	* the transform map, shifting section_id values by the corresponding base_counter.
	*
	* This is the inner worker called by changes_in_locators() for both regular
	* section datos and matrix_time_machine dato payloads.
	*
	* Key rewriting rules:
	* - relations / relations_search: for each locator property that matches a map key,
	*   the value is replaced by map->new and section_id is rebased (section_id +=
	*   base_counter). Dataframe locators (loc_key === 'section_tipo_key') rebase
	*   section_id_key instead of section_id.
	* - components / diffusion_info: component_text_area data is string-processed
	*   via replace_locator_in_string(); other component types are left unchanged.
	* - inverse_locators: removed (derived/cached field, regenerated on demand).
	* - Other top-level scalar properties (e.g. section_tipo at the datos root):
	*   replaced by map->new; the root section_id is rebased accordingly.
	*
	* (!) Mutates $options->datos in place (PHP objects are reference-like); the
	* returned value is the same object that was passed in.
	*
	* @param object $options - Contains: ar_transform_map (keyed by old tipo), datos (decoded JSONB object)
	* @return object - The mutated datos object with all tipo references updated
	*/
	public static function process_locators_in_section_data( object $options ) : object {

		$ar_transform_map	= $options->ar_transform_map;
		$datos				= $options->datos;

		// datos properties
		foreach ($datos as $datos_key => $datos_value) {

			if( empty($datos_value) ){
				continue;
			}

			switch ($datos_key) {
				case 'relations_search':
				case 'relations':
					// update relations array
					$relations = $datos_value ?? [];

					foreach ($relations as $locator) {
						foreach ($locator as $loc_key => $loc_value) {

							if (!is_string($loc_value) && !is_int($loc_value)) {
								debug_log(__METHOD__
									. " Ignored locator value ! " . PHP_EOL
									. ' loc_key: ' . to_string($loc_key) . PHP_EOL
									. ' loc_value: ' . to_string($loc_value) . PHP_EOL
									. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
									. ' locator: ' . to_string($locator)
									, logger::ERROR
								);
								continue;
							}

							if( isset($ar_transform_map[$loc_value]) ){
								// replace old tipo with the new one in any locator property
								$locator->{$loc_key}	= $ar_transform_map[$loc_value]->new;
								// dataframe locator pointing to main locator that are changed its own section_tipo
								// if the dataframe locator is pointing to the changed section_tipo, the new section_id will be set into section_id_key
								// because the dataframe is linked to a locator in the main component that was changed.
								if($loc_key==='section_tipo_key'){
									$new_section_id				= (int)$ar_transform_map[$loc_value]->base_counter + (int)$locator->section_id_key;
									$locator->section_id_key	= (int)$new_section_id;
								}else{
									$new_section_id			= (int)$ar_transform_map[$loc_value]->base_counter + (int)$locator->section_id;
									// regular locator
									$locator->section_id	= (string)$new_section_id;
								}
							}
						}
					}
					break;

				case 'diffusion_info':
				case 'components':
					// update components object
					$literal_components = $datos_value ?? null;

					if( empty($literal_components) ){
						break;
					}

					foreach ($literal_components as $literal_tipo => $literal_value) {
						$model = ontology_node::get_model_by_tipo( $literal_tipo );
						if($model === 'component_text_area'){

							$options = new stdClass();
								$options->string			= json_encode($literal_value);
								$options->ar_transform_map	= $ar_transform_map;

							$new_literal = transform_data::replace_locator_in_string( $options );

							$literal_components->{$literal_tipo} = json_decode( $new_literal );
						}
					}

					// replace whole object
					$datos->$datos_key = $literal_components;
					break;

				case 'inverse_locators':
					// remove old data
					unset($datos->{$datos_key});
					break;

				default:
					// update other properties like section_tipo, section_real_tipo, etc.
					$test_tipo = to_string($datos_value);
					if( isset($ar_transform_map[$test_tipo]) ){
						$datos->{$datos_key} = $ar_transform_map[$test_tipo]->new;
						if( $datos_key === 'section_tipo'){
							$new_section_id		= (int)$ar_transform_map[$test_tipo]->base_counter + (int)$datos->section_id;
							$datos->section_id	= (int)$new_section_id;
						}
					}
					break;
			}
		}//end foreach ($datos as $datos_key => $datos_value)

		return $datos;
	}//end process_locators_in_section_data



	/**
	* REPLACE_LOCATOR_IN_TM_DATA
	* Rewrites tipo and section_id references within an array of locator objects
	* stored in the matrix_time_machine 'dato' column.
	*
	* The caller must pre-filter the tm dato to confirm it is an array of locator
	* objects (each having section_tipo and type properties) before calling this
	* method — it does not handle scalar / literal dato values.
	*
	* For each locator in $tm_value:
	* - If a property value matches a key in ar_transform_map and equals map->old,
	*   the property is rewritten to map->new and the paired id property is rebased
	*   by adding map->base_counter.
	* - Dataframe locators (loc_key === 'section_tipo_key') rebase section_id_key
	*   rather than section_id.
	* - Non-string / non-int property values are skipped and logged.
	*
	* @param object $options - Contains:
	*   ar_transform_map: keyed-by-old-tipo map (each entry has ->new, ->base_counter)
	*   tm_value: array of locator objects from matrix_time_machine.dato
	* @return array - The (possibly modified) $tm_value array
	*/
	public static function replace_locator_in_tm_data( object $options ) : array {

		$ar_transform_map	= $options->ar_transform_map;
		$tm_value			= $options->tm_value;

		foreach ( $tm_value as $current_locator ) {

			if (!is_object($current_locator)) {
				continue;
			}

			foreach ($current_locator as $loc_key => $current_value) {

				if (!is_string($current_value) && !is_int($current_value)) {
					debug_log(__METHOD__
						. " Ignored non acceptable  " . PHP_EOL
						. ' loc_key: ' . to_string($loc_key) . PHP_EOL
						. ' current_value: ' . to_string($current_value) . PHP_EOL
						. ' current_value type: ' . gettype($current_value) . PHP_EOL
						. ' current_locator: ' . to_string($current_locator)
						, logger::ERROR
					);
					continue;
				}

				if( isset($ar_transform_map[$current_value]) && $current_value === $ar_transform_map[$current_value]->old ){

					$current_locator->$loc_key	= $ar_transform_map[$current_value]->new;
					$base_section_id			= $ar_transform_map[$current_value]->base_counter;

					// dataframe locator pointing to main locator that are changed its own section_tipo
					// if the dataframe locator is pointing to the changed section_tipo, the new section_id will be set into section_id_key
					// because the dataframe is linked to a locator in the main component that was changed.
					if($loc_key==='section_tipo_key'){
						$new_section_id						= (int)$base_section_id + (int)$current_locator->section_id_key;
						$current_locator->section_id_key	= (int)$new_section_id;
					}else{
						// regular locator
						$new_section_id					= (int)$base_section_id + (int)$current_locator->section_id;
						$current_locator->section_id	= (string)$new_section_id;
					}
				}
			}//end foreach
		}//end foreach


		return $tm_value;
	}//end replace_locator_in_tm_data



	/**
	* REPLACE_LOCATOR_IN_STRING
	* Rewrites embedded locator references within a component_text_area JSON string.
	*
	* component_text_area stores rich-text content that can contain inline "People
	* tags" encoded as:
	*   data:{'section_tipo':'rsc194','section_id':'1'}:data
	* (single-quoted JSON embedded in a larger serialised string).
	*
	* This method extracts all such pseudo-locators with a regex, decodes them,
	* applies the transform map (rewriting section_tipo and rebasing section_id by
	* base_counter), re-encodes them with single quotes, and replaces all occurrences
	* in the original string.
	*
	* Deduplication via array_unique() avoids re-processing the same embedded locator
	* when it appears multiple times in the same text block.
	*
	* Non-string / non-int locator property values are skipped and logged.
	*
	* @param object $options - Contains: string (the JSON-encoded text_area value), ar_transform_map
	* @return string - The (possibly modified) string with embedded locator references updated
	*/
	public static function replace_locator_in_string( object $options ) : string {

		$string				= $options->string;
		$ar_transform_map	= $options->ar_transform_map;
		// get all locator in the middle of the string
		// locator is identified as:
		// text	'data:{'section_tipo':'rsc194','section_id':'1'}:data' text
		$regex = '/data:({.*?}):data/m';

		preg_match_all( $regex, $string, $matches);

		$ar_locators = $matches[1] ?? [];
		// remove duplicates
		$unique_locators = array_unique($ar_locators);

		foreach ($unique_locators as $pseudo_locator) {
			// string locator use a simple quotes, it need change to double quotes
			$current_locator = str_replace('\'', '"', $pseudo_locator);
			$current_locator = json_decode($current_locator);

			foreach ($current_locator as $loc_key => $loc_value) {

				if (!is_string($loc_value) && !is_int($loc_value)) {
					debug_log(__METHOD__
						. " Ignored locator value ! " . PHP_EOL
						. ' loc_key: ' . to_string($loc_key) . PHP_EOL
						. ' loc_value: ' . to_string($loc_value) . PHP_EOL
						. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
						. ' locator: ' . to_string($current_locator)
						, logger::ERROR
					);
					continue;
				}

				// check if the locator has the old section_tipo reference
				if( isset($ar_transform_map[$loc_value]) ){
					// replace old tipo with the new one in any locator property
					$current_locator->{$loc_key}	= $ar_transform_map[$loc_value]->new;
					$new_section_id					= (int)$ar_transform_map[$loc_value]->base_counter + (int)$current_locator->section_id;
					$current_locator->section_id	= (string)$new_section_id;

					//to replace, stringify the locator and change the double quotes to single
					$new_pseudo_locator	= json_encode($current_locator);
					$new_pseudo_locator	= str_replace( '"', '\'', $new_pseudo_locator);
					// replace all occurrences in the string.
					$string	= str_replace( $pseudo_locator, $new_pseudo_locator, $string);
				}
			}
		}

		return $string;
	}//end replace_locator_in_string



	/**
	* SET_MOVE_IDENTIFICATION_VALUE
	* Callback invoked per source section record by changes_in_locators() to stamp
	* moved records with an identification value that marks their origin section.
	*
	* Example: when People (rsc194) records are migrated to People under Study
	* (rsc197), this method can create a new "Typology" entry ("moved from People")
	* and inject its locator into every migrated record's relations array.
	*
	* Supported actions (via $options->action):
	*
	* 'new_only_once':
	*   Creates exactly one new section of $options->section_tipo and sets a component
	*   value inside it. The resulting locator is cached in a static variable so that
	*   all migrated records share the same identification locator rather than creating
	*   one per record. A database search is performed first to avoid duplicates if
	*   the migration is re-run.
	*   Component data is saved via component_common::Save(); translatable components
	*   are saved once per language, non-translatable once for DEDALO_DATA_NOLAN.
	*   Relation-type components (component_relation_common subclasses) are saved as
	*   a block.
	*
	* @param object $options - Migration options with the following properties:
	*   action            (string)  – currently only 'new_only_once' is implemented
	*   section_tipo      (string)  – section type for the identification record
	*   from_component_tipo (string) – component tipo for the injected locator
	*   type              (string)  – locator type constant
	*   component_tipo    (string)  – component to write the value into
	*   value             (mixed)   – value to store in the new component
	*   datos             (object)  – the migrated record's datos (mutated in place)
	*   q                 (string)  – search query to detect existing identification records
	*   model             (string)  – model name for the search path
	*   name              (string)  – name for the search path
	* @return object - The (mutated) $datos with the new locator appended to relations
	*/
	public static function set_move_identification_value( object $options ) : object {

		$action					= $options->action;
		$section_tipo			= $options->section_tipo ?? null;
		$from_component_tipo	= $options->from_component_tipo ?? null;
		$type					= $options->type ?? null;
		$component_tipo			= $options->component_tipo;
		$value					= $options->value;
		$datos					= $options->datos;
		$q						= $options->q;
		$model					= $options->model;
		$name					= $options->name;

		if( !empty($q) ){
			$q = addslashes($q);
		}
		// cache to be used when the data needs to apply into every new record
		// Static function-level cache keyed by (action, section_tipo, component_tipo).
		// Ensures 'new_only_once' creates its identification record only once even when
		// this callback is called thousands of times inside a table iterator loop.
		static $cache_set_move_identification_value;
		$cache_key = $action.'_'.$section_tipo.'_'.$component_tipo;

		switch ($action) {
			case 'new_only_once':
				// used to create new section as 'Typology' or other portal
				// and set a component data inside new section with the specified values
				// values could be a literal with translations or a related data.

				// set a cache with the locator created
				// new only once create new section and use his locator to be assigned to all moved records
				// therefore, if the cache is set, use previous locator in the cache
				// else (the first time) create new one.
				if (isset($cache_set_move_identification_value[$cache_key])) {

					$locator = $cache_set_move_identification_value[$cache_key];

				}else{

					// search in database (this prevents duplicates when user apply this update more than once)
					$sqo_data = (object)[
						'section_tipo' => [$section_tipo],
						'select' => [],
						'limit' => 10,
						'offset' => 0,
						'filter' => (object)[
							'$and' => [
								(object)[
									'q' => [$q],
									'q_operator' => null,
									'path' => [
										(object)[
											'section_tipo' => $section_tipo,
											'component_tipo' => $component_tipo,
											'model' => $model,
											'name' => $name
										]
									],
									'q_split' => true,
									'type' => 'jsonb'
								]
							]
						]
					];
					$sqo = new search_query_object($sqo_data);
					$search = search::get_instance(
						$sqo // object sqo
					);
					$db_result	= $search->search();
					$row		= $db_result->fetch_one();
					if($row){

						$new_section_id = $row->section_id;

					}else{

						// create new section to save new data
						// new section will be the locator to add into the records
						$new_section = section::get_instance(
							$section_tipo // string section_tipo
						);
						$new_section_id = $new_section->create_record();

						// create new component with the specification
						$component_model		= ontology_node::get_model_by_tipo( $component_tipo );
						// check if the component is a related to be save as block, else create component for every lang.
						$relation_components	= component_relation_common::get_components_with_relations();
						$is_related				= in_array( $component_model, $relation_components );
						// set the main lang of the component as translatable or not (for literals the lang will be change)
						$translatable			= ontology_node::get_translatable( $component_tipo );
						$lang					= $translatable === true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$component				= component_common::get_instance(
							$component_model, // string model
							$component_tipo, // string tipo
							$new_section_id, // string section_id
							'list', // string mode
							$lang, // string lang
							$section_tipo // string section_tipo
						);
						// related component can save his data as block
						if( $is_related	=== true ){
							$component->set_dato( $value );
							$component->Save();
						}else{
							// literal components needs to save his data by language
							foreach ($value as $current_lang => $current_value) {
								$component->set_lang( $current_lang );
								$component->set_dato( $current_value );
								$component->Save();
							}
						}
					}

					// fix new locator with the new section created
					// take account that the value is not the component value because this action use a related component to set the value
					$locator = new locator();
						$locator->set_section_tipo( $section_tipo );
						$locator->set_section_id( $new_section_id );
						$locator->set_from_component_tipo( $from_component_tipo );
						$locator->set_type( $type );

					// set new locator into the cache to be used next time
					$cache_set_move_identification_value[$cache_key] = $locator;
				}

				// add new locator to datos
				$datos->relations[] = $locator;
				break;

			default:
				// doesn't used right now.
				break;
		}


		return $datos;
	}//end set_move_identification_value



	/**
	* PORTALIZE_DATA
	* Promotes flat component data within a source section into a new dedicated
	* section and links the new section back via a portal component.
	*
	* Use case: a section previously held structured data (e.g. person name + role)
	* directly in its components. After the migration that data lives in a separate
	* reference section and the original section gets a portal locator pointing at it.
	*
	* JSON definition files live in:
	*   core/base/transform_definition_files/move_to_portal/
	* Each file defines one or more items:
	*   {
	*     "source_section": "...",    section tipo to read from
	*     "target_section": "...",    section tipo to write into
	*     "portal":         "...",    component_portal tipo on the source section
	*     "components": [
	*       { "source_tipo": "...", "target_tipo": "..." },
	*       ...
	*     ]
	*   }
	*
	* For each source record with at least one non-empty component value:
	* 1. A new target section is created via section::Save() with all component
	*    data (literals in a components object; relation data as relations array).
	* 2. A locator to the new target section is added to the source portal.
	* 3. Time Machine rows for migrated components are updated in place to reflect
	*    the new section_id, section_tipo, and tipo (target_tipo).
	* 4. The old component data on the source section is cleared (set_dato(null)).
	*    Time Machine is disabled (tm_record::$save_tm = false) during this cleanup.
	*
	* On failure creating the portal locator the new section is deleted and the
	* counter is consolidated via counter::consolidate_counter() to avoid gaps.
	*
	* Activity logging is disabled throughout to prevent the migration from
	* generating spurious audit entries.
	*
	* @param array $json_files - File names relative to move_to_portal/ directory
	* @return bool - true on success; false on any unrecoverable error
	*/
	public static function portalize_data( array $json_files) : bool {

		// disable activity log
			logger_backend_activity::$enable_log = false;

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " portalize_data - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_to_portal/';
		// get transform map from files
			//  value: {
			//		"rsc194": {
			//			"old": "rsc194",
			//			"new": "rsc197",
			//			"type": "section",
			//			"perform": [
			//				"move_tld"
			//			],
			//			"info": "Old People section => New People under Study section"
			//		}
			//	}
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {
				$contents			= file_get_contents($path.$current_json_file);
				$transform_map		= json_decode($contents);
				foreach ($transform_map as $transform_object) {
					$ar_transform_map[] = $transform_object;
				}
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// iterate items
		foreach ($ar_transform_map as $item) {

			$source_section	= $item->source_section;
			$target_section	= $item->target_section;
			$components		= $item->components;
			$portal_tipo	= $item->portal;

			$all_section_records = section::get_resource_all_section_records_unfiltered( $source_section );

			while ($row = pg_fetch_assoc($all_section_records)) {
				$section_id	= $row['section_id'];

				// create the source components
				$to_save = false;

				$main_relations			= [];
				$main_components_obj	= new stdClass();

				// get full data of the components
				foreach ($components as $component_item) {

					$source_tipo = $component_item->source_tipo;
					$target_tipo = $component_item->target_tipo;

					// source component
					// created to get his full data
					$model	= ontology_node::get_model_by_tipo($source_tipo);
					$lang	= ontology_node::get_translatable( $source_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
					$source_component = component_common::get_instance(
						$model, // string model
						$source_tipo, // string tipo
						$section_id, // string section_id
						'list', // string mode
						$lang, // string lang
						$source_section // string section_tipo
					);

					$data_full = $source_component->get_data();

					if( empty($data_full) ){
						continue;
					}
					// set that any component has data and need to be moved to the portal
					$to_save = true;

					//check if the component is a related component
					$is_related = in_array( $model, component_relation_common::get_components_with_relations() );

					if( $is_related===true ){
						// related components
						foreach ($data_full as $current_locator) {
							$current_locator->from_component_tipo = $target_tipo;

							$main_relations[] = $current_locator;
						}
					}else{
						// literal components
						$main_components_obj->$target_tipo = new stdClass();
						$main_components_obj->$target_tipo->dato = $data_full;
					}
				}

				if( $to_save===false ){
					continue;
				}
				// Create new target section
				// if any component has data, create new target section and set all moved component data into.
					$new_section = section::get_instance(
						null, // string|null section_id
						$target_section // string section_tipo
					);

					// save section with the all component data
					$save_options = new stdClass();
						$save_options->main_components_obj	= $main_components_obj;
						$save_options->main_relations		= $main_relations;

					$new_section_id = $new_section->Save( $save_options );

					// check the save was ok
					if( empty($new_section_id) ){
						debug_log(__METHOD__
							. " Error saving the new section with the component_data " . PHP_EOL
							. "item: ". to_string( $item ) . PHP_EOL
							. "source_section_id: ". to_string( $section_id ) . PHP_EOL
							, logger::ERROR
						);

						return false;
					}

				// create the component_portal to give the locator created
					$portal_model = ontology_node::get_model_by_tipo( $portal_tipo );

					$portal_component = component_common::get_instance(
						$portal_model, // string model
						$portal_tipo, // string tipo
						$section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$source_section // string section_tipo
					);

					$portal_locator = new locator();
						$portal_locator->set_section_id( $new_section_id );
						$portal_locator->set_section_tipo( $target_section );

					$portal_component->set_dato( $portal_locator );
					$portal_section_id = $portal_component->Save();

					// check the save was ok
					if( empty($portal_section_id) ){
						debug_log(__METHOD__
							. " Error saving the new portal with the component_data " . PHP_EOL
							. "item: ". to_string( $item ) . PHP_EOL
							. "source_section_id: ". to_string( $section_id ) . PHP_EOL
							. "target_section_id: ". to_string( $new_section_id ) . PHP_EOL
							, logger::ERROR
						);

						// remove the new section created
						$new_section->delete( 'delete_record', false );
						// set the counter to last valid section_id, to avoid empty section records
						$matrix_table	= common::get_matrix_table_from_tipo( $target_section );
						if (empty($matrix_table)) {
							debug_log(__METHOD__
								. ' Invalid matrix_table from tipo. Check your Ontology for configuration errors' . PHP_EOL
								. ' target_section: ' . to_string($target_section)
								, logger::ERROR
							);
							return false;
						}
						counter::consolidate_counter(
							$target_section,
							$matrix_table,
							'matrix_counter'
						);

						return false;
					}



				// remove the old component data and
				// change time machine data
					// disable time machine
					tm_record::$save_tm = false;

					foreach ($components as $component_item) {

						$source_tipo = $component_item->source_tipo;
						$target_tipo = $component_item->target_tipo;

						// remove the old component data in source section
							// source component
							// created to get his full data
							$model	= ontology_node::get_model_by_tipo($source_tipo);
							$lang	= ontology_node::get_translatable( $source_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
							$source_component = component_common::get_instance(
								$model, // string model
								$source_tipo, // string tipo
								$section_id, // string section_id
								'list', // string mode
								$lang, // string lang
								$source_section // string section_tipo
							);

							// remove the old data
							// the component data will be save later in the new section.
							$source_component->set_dato( null );
							$source_component->Save();

						// change the time machine data to set the new tipo, section_id and section_tipo
							$table 		= 'matrix_time_machine';
							//select the old component time machine data
							$strQuery	= "SELECT id FROM $table WHERE section_id = $1 AND section_tipo = $2 AND tipo = $3";
							$result		= pg_query_params( DBi::_getConnection(), $strQuery, array($section_id, $source_section, $source_tipo) );

							$n_rows = pg_num_rows($result);

							// if the component has not data go next component, nothing to change
							if ($n_rows<1){
								continue;
							}

							while($row = pg_fetch_assoc($result)) {

								$id		= $row['id'];
								// update his time_machine with the new section
								$strQuery	= "UPDATE $table SET tipo = $1, section_id = $2, section_tipo = $3 WHERE id = $4 ";
								$change_result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $target_tipo, $new_section_id, $target_section, $id ));
								if($change_result===false) {
									$msg = "Failed to update time machine data ($table) - $id";
									debug_log(__METHOD__
										." ERROR: $msg " . PHP_EOL
										. "source_section_id: ". to_string( $section_id ) . PHP_EOL
										. "source_section: ". to_string( $source_section ) . PHP_EOL
										. "source_tipo: ". to_string( $source_tipo ) . PHP_EOL
										. "target_tipo: ". to_string( $target_tipo ) . PHP_EOL
										. "new_section_id: ". to_string( $new_section_id ) . PHP_EOL
										. "target_section: ". to_string( $target_section ) . PHP_EOL

										, logger::ERROR
									);

									return false;
								}
							}
					}

					// active time machine
					tm_record::$save_tm = true;
			}
		}//end foreach ($ar_transform_map as $item)


		// re-enable activity log
			logger_backend_activity::$enable_log = true;


		return true;
	}//end portalize_data



	/**
	* MOVE_DATA_BETWEEN_MATRIX_TABLES
	* Physically relocates section rows from one matrix table to another within a
	* single PostgreSQL transaction per section_tipo.
	*
	* Use case: a section_tipo was originally stored in the wrong matrix table
	* (e.g. matrix_list) and must be moved to the correct one (e.g. matrix_hierarchy)
	* so that Dédalo's table-dispatch logic finds it in the right place.
	*
	* JSON definition files live in:
	*   core/base/transform_definition_files/move_to_table/
	* Each file contains a JSON array of transfer specs:
	*   [{ "section_tipo": "utoponymy1", "source_table": "matrix_list", "target_table": "matrix_hierarchy" }]
	*
	* Each item is processed in a BEGIN/INSERT SELECT/DELETE/COMMIT block.
	* Only section_id, section_tipo, and datos are copied (not the id column, to
	* avoid primary-key conflicts in the target table). On INSERT or DELETE failure
	* a ROLLBACK is issued and the method returns false immediately.
	*
	* @param array $json_files - File names relative to move_to_table/ directory
	* @return bool - true on success; false if any SQL operation fails
	*/
	public static function move_data_between_matrix_tables( array $json_files) : bool {


		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " move_data_between_matrix_tables - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_to_table/';
		// get transform map from files
			// [{
			//		"section_tipo": "utoponymy1",
			//		"source_table": "matrix_list",
			//		"target_table": "matrix_hierarchy"
			//	}]
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {

				$contents = file_get_contents($path.$current_json_file);
				if ($contents === false) {
					debug_log(__METHOD__ . " Error reading file: " . $path.$current_json_file, logger::ERROR);
					continue;
				}

				$transform_map		= json_decode($contents);

				if (json_last_error() !== JSON_ERROR_NONE) {
					debug_log(__METHOD__ . " Error decoding JSON from file: " . $current_json_file . " - " . json_last_error_msg(), logger::ERROR);
					continue;
				}
				if (!is_array($transform_map)) {
					debug_log(__METHOD__ . " Decoded JSON is not an array from file: " . $current_json_file, logger::ERROR);
					continue;
				}

				foreach ($transform_map as $transform_object) {
					$ar_transform_map[] = $transform_object;
				}
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// iterate items
		foreach ($ar_transform_map as $item) {

			if (!isset($item->section_tipo) || !isset($item->source_table) || !isset($item->target_table)) {
				debug_log(__METHOD__ . " Ignored Malformed transform object in JSON file. Missing required properties.", logger::ERROR);
				continue; // Skip this malformed item
			}

			$section_tipo	= $item->section_tipo;
			$source_table	= $item->source_table;
			$target_table	= $item->target_table;

			$conn = DBi::_getConnection();

			// safe section_tipo
			$section_tipo = pg_escape_string($conn, $section_tipo);

			// Start transaction
			if (!pg_query($conn, "BEGIN")) {
				debug_log(__METHOD__ . " Failed to start transaction: " . pg_last_error($conn), logger::ERROR);
				return false;
			}

			// Move rows between tables
				// select only section_id, section_tipo and datos, id columns could exist in the target_table and the constrain would fail.
				$str_query = PHP_EOL.sanitize_query("
					INSERT INTO $target_table(\"section_id\", \"section_tipo\", \"datos\")
					(
						SELECT \"section_id\", \"section_tipo\", \"datos\"
						FROM $source_table
						WHERE \"section_tipo\" = '$section_tipo'
					);
				");

				$result = pg_query($conn, $str_query);
				if($result===false) {
					pg_query($conn, "ROLLBACK"); // Rollback on error
					// error case
					debug_log(__METHOD__
						." Error Processing SQL request in move_data_between_matrix_tables ". PHP_EOL
						. pg_last_error($conn) .PHP_EOL
						. 'str_query: '.to_string($str_query)
						, logger::ERROR
					);
					return false;
				}

			// Delete the origin data
				$delete_str_query = PHP_EOL.sanitize_query("
					DELETE FROM $source_table
					WHERE \"section_tipo\" = '$section_tipo';
				");

				$result = pg_query($conn, $delete_str_query);
				if($result===false) {
					 pg_query($conn, "ROLLBACK"); // Rollback on error
					// error case
					debug_log(__METHOD__
						." Error Processing SQL request in move_data_between_matrix_tables ". PHP_EOL
						. pg_last_error($conn) .PHP_EOL
						. 'delete_str_query: '.to_string($delete_str_query)
						, logger::ERROR
					);
					return false;
				}

			// Commit transaction if both successful
			if (!pg_query($conn, "COMMIT")) {
				debug_log(__METHOD__ . " Commit failed: ".pg_last_error($conn), logger::ERROR);
				return false;
			}

		}//end foreach ($ar_transform_map as $item)


		return true;
	}//end move_data_between_matrix_tables



	/**
	* GET_SECTION_TIPO_KEY_FROM_MAIN_COMPONENT
	* Resolves the target section_tipo referenced by the parent (main) component of
	* a given component_dataframe tipo.
	*
	* A component_dataframe is always a child of a "main" relational component in the
	* ontology tree. This helper instantiates that parent component, calls
	* get_ar_target_section_tipo(), and returns the first entry from the result.
	*
	* Returns null if the parent component has no target section tipo configured,
	* logging an error in that case.
	*
	* @param string $section_tipo - Section tipo that owns the component
	* @param int|string $section_id - Record identifier within that section
	* @param string $dataframe_tipo - Ontology tipo of the component_dataframe
	* @return string|null - First target section tipo, or null on error
	*/
	private static function get_section_tipo_key_from_main_component( string $section_tipo, int|string $section_id, string $dataframe_tipo ) : ?string {

		$ontology_node			= ontology_node::get_instance($dataframe_tipo);
		$main_component_tipo	= $ontology_node->get_parent();

		// create the main component to obtain his data
			$model	= ontology_node::get_model_by_tipo( $main_component_tipo );
			$lang	= ontology_node::get_translatable($main_component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
			$main_component = component_common::get_instance(
				$model, // string model
				$main_component_tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				$lang, // string lang
				$section_tipo // string section_tipo
			);

			$ar_section_tipo_key = $main_component->get_ar_target_section_tipo();

		// check value
			if (empty($ar_section_tipo_key)) {
				debug_log(__METHOD__
					. " Empty target_section_tipo " . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' dataframe_tipo: ' . to_string($dataframe_tipo)
					, logger::ERROR
				);
				return null;
			}

		$section_tipo_key = $ar_section_tipo_key[0];


		return $section_tipo_key;
	}//end get_section_tipo_key_from_main_component



	/**
	* CHANGE_DATA_LANG
	* Migrates component dato values between language keys — for example when a
	* component changes from translatable (DEDALO_DATA_LANG_DEFAULT) to
	* non-translatable (DEDALO_DATA_NOLAN) or vice versa.
	*
	* JSON definition files live in:
	*   core/base/transform_definition_files/move_lang/
	* Each file is a JSON array:
	*   [{
	*     "tipo"      : "hierarchy89",
	*     "type"      : "component",
	*     "ar_tables" : ["matrix","matrix_hierarchy","matrix_list","matrix_activities"],
	*     "perform"   : ["lang_to_nolan"],
	*     "info"      : "URL translatable => URL non translatable and transliterable"
	*   }]
	*
	* Processing order:
	* 1. The unique set of tables declared across all definitions is iterated via
	*    update::tables_rows_iterator(). For each row the datos->components object
	*    is walked; any component tipo matching a definition entry dispatches the
	*    named "perform" action (e.g. lang_to_nolan) to rewrite the dato key.
	* 2. After all datos rows are processed, matrix_time_machine 'lang' column values
	*    are updated via a direct SQL UPDATE for each tipo + action combination
	*    (lang_to_nolan: DEDALO_DATA_LANG_DEFAULT → DEDALO_DATA_NOLAN;
	*     nolang_to_lang: DEDALO_DATA_NOLAN → DEDALO_DATA_LANG_DEFAULT).
	*
	* Activity logging is disabled throughout.
	*
	* Note: the return type is absent (untyped); the method returns void implicitly.
	*
	* @param array $json_files - File names relative to move_lang/ directory
	* @return void
	*/
	public static function change_data_lang( array $json_files ) {


		// disable activity log
			logger_backend_activity::$enable_log = false;


		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " changes_in_component_lang - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_lang/';
		// get transform map from files
			//  value: {
			// 	"tipo"		: "hierarchy89" ,
			// 	"type"		: "component"
			// 	"ar_tables" : ["matrix","matrix_hierarchy","matrix_list","matrix_activities"]
			// 	"perform"	: ["lang_to_nolan"]
			// 	"info"		: "URL translatable => URL non translatable and transliterable"
			// }

			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {
				$contents			= file_get_contents($path.$current_json_file);
				$transform_map		= json_decode($contents);
				foreach ($transform_map as $transform_object) {
					$ar_transform_map[$transform_object->tipo] = $transform_object;
				}
			}

			// ar_tables without keys like ["matrix"]
			// get the unique values specify by the definition
			$ar_tables = array_unique( array_merge( ...array_map( function($el) {
				return $el->ar_tables ?? [];
			}, $ar_transform_map, []) ) );


		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		update::tables_rows_iterator(
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) use($ar_transform_map) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$section_id		= $row['section_id'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': changes_in_locators'
							. ' | table: ' 			. $table
							. ' | id: ' 			. $id .' - ' . $max
							. ' | section_tipo: ' 	. $section_tipo
							. ' | section_id: '  	. ($row['section_id'] ?? '');
						common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
							? dd_memory_usage() // update memory information once every 5000 items
							: common::$pdata->memory;
						common::$pdata->table = $table;
						common::$pdata->section_tipo = $section_tipo;
						common::$pdata->counter++;
						// send to output
						print_cli(common::$pdata);
					}

				// datos. Common matrix tables
				if( isset($datos) ){

					// datos properties
					foreach ($datos as $datos_key => $datos_value) {

						if( empty($datos_value) ){
							continue;
						}

						switch ($datos_key) {
							// Only literal components has lang
							case 'components':
								// update components object
								$literal_components = $datos_value ?? [];

								$new_components = new stdClass();

								foreach ($literal_components as $literal_tipo => $literal_value) {
									if( isset($ar_transform_map[$literal_tipo]) ){

										// Get the perform from definition
										$perform = $ar_transform_map[$literal_tipo]->perform;
										foreach ($perform as $action) {

											// check method already exists
												if(!method_exists('transform_data', $action)) {
													debug_log(__METHOD__
														. " Error. Calling undefined method transform_data::$action . Ignored action !"
														, logger::ERROR
													);
													continue;
												}

											$options = new stdClass();
												$options->transform_object	= $ar_transform_map[$literal_tipo];
												$options->new_components	= &$new_components; // pass by reference to allow add (!)
												$options->literal_tipo		= $literal_tipo;
												$options->literal_value		= $literal_value;

											transform_data::{$action}( $options );
										}
									}else{
										$new_components->{$literal_tipo} = $literal_value;
									}
								}

								// replace whole object
								$datos->$datos_key = $new_components;
								break;

							default:

								break;
						}
					}//end foreach ($datos as $datos_key => $datos_value)

					$section_data_encoded = json_encode($datos);

					$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}//end if( isset($datos) )
			}//end anonymous function
		);

		// Time machine matrix table
		// change the langs into time machine rows
		foreach ($ar_transform_map as $tipo => $item) {

			// Get the perform from definition
			$perform = $item->perform;
			foreach ($perform as $action) {
				// define the query for all actions
				$strQuery = "
					UPDATE matrix_time_machine SET lang = $1 WHERE id in(
						SELECT id
						FROM \"matrix_time_machine\"
						WHERE \"tipo\" = $2 AND \"lang\" = $3
					);
				";
				// set the query values with the correct order based in perform actions
				switch ($action) {
					case 'lang_to_nolan':
						// set the default lang as nolan
						$result	= pg_query_params(
							DBi::_getConnection(),
							$strQuery,
							[DEDALO_DATA_NOLAN, $tipo, DEDALO_DATA_LANG_DEFAULT]
						);

						break;
					case 'nolang_to_lang':
					default:
						// set the nolan as default lang
						$result	= pg_query_params(
							DBi::_getConnection(),
							$strQuery,
							[DEDALO_DATA_LANG_DEFAULT, $tipo, DEDALO_DATA_NOLAN]
						);
						break;
				}
				if($result===false) {
					$msg = "Failed Update time machine record";
					debug_log(__METHOD__
						." ERROR: $msg ".PHP_EOL
						." tipo: ".$tipo .PHP_EOL
						." querry: ".$strQuery .PHP_EOL
						, logger::ERROR
					);
					return false;
				}
			}
		}

		// re-enable activity log
			logger_backend_activity::$enable_log = true;

	}//end change_data_lang



	/**
	* LANG_TO_NOLAN
	* "perform" action callback that moves a literal component's dato from the default
	* language key (DEDALO_DATA_LANG_DEFAULT) to DEDALO_DATA_NOLAN within the
	* components object being rebuilt during a change_data_lang() run.
	*
	* If DEDALO_DATA_LANG_DEFAULT is not present, falls back to the first non-empty
	* language found in common::get_ar_all_langs() so that records with a non-default
	* primary language are also migrated.
	*
	* The old language key is removed (unset) after copying to DEDALO_DATA_NOLAN.
	*
	* Writes the modified value to $new_components (passed by reference) under the
	* original component tipo key (transform_object->tipo).
	*
	* @param object $options - Contains:
	*   transform_object (object) – the definition map entry (must have ->tipo)
	*   new_components   (object) – the components object being rebuilt (passed by ref)
	*   literal_value    (object) – the current dato wrapper object with a ->dato property
	* @return void
	*/
	public static function lang_to_nolan(object $options) {

		$transform_object	= $options->transform_object;
		$new_components		= $options->new_components; // pass by reference
		$literal_value		= $options->literal_value;

		$lang		= DEDALO_DATA_LANG_DEFAULT;
		$nolan		= DEDALO_DATA_NOLAN;
		$all_langs	= common::get_ar_all_langs();

		// check if the default lang exist in data
		if( !empty($literal_value->dato->$lang) ){
			// set the old values into the nolan
			$literal_value->dato->$nolan = $literal_value->dato->$lang;
			// remove the default lang
			unset($literal_value->dato->$lang);
		}else{
			// set the fallback lang
			foreach ($all_langs as $current_lang) {
				// pick any of the projects langs
				if( !empty($literal_value->dato->$current_lang) ){
					// set the old values into the nolan
					$literal_value->dato->$nolan = $literal_value->dato->$current_lang;
					// remove the default lang
					unset($literal_value->dato->$current_lang);
					// stop
					break;
				}
			}
		}

		// modifies passed by reference object new_components
		$new_components->{$transform_object->tipo} = $literal_value;
	}//end lang_to_nolan




}//end class transform_data
