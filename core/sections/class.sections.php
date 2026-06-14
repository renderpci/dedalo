<?php declare(strict_types=1);
/**
* CLASS SECTIONS
* Aggregate manager for querying, iterating, and deleting sets of section records.
*
* Whereas `section` represents a single section type (its schema and component
* layout) and `section_record` represents a single row in the data matrix,
* `sections` operates on a *collection* of records matched by a
* search_query_object (SQO). Its responsibilities are:
*
* - Execute a search via search::get_instance() and cache the db_result.
* - Expose the matched section tipos for the JSON controller (sections_json.php).
* - Provide the full list of matching section_id values without pagination, used
*   by callers such as component_relation_common that need to batch-process all
*   related records.
* - Orchestrate multi-record deletion, including permission checks, child-guard
*   logic (thesaurus trees), ontology/hierarchy cleanup, parent-reference
*   removal, and a post-delete verification search.
*
* Typical callers: component_portal (list view), relation_list, dd_core_api
* (create/delete API actions), component_text_area (related-list), and
* component_common::dataframe_common.
*
* Note: `get_instance()` always creates a fresh object — there is no shared
* singleton cache. Each call site owns its own instance.
*
* @package Dédalo
* @subpackage Core
*/
class sections extends common {



	/**
	* CLASS VARS
	*/
		/**
		 * Locators identifying specific section records to load.
		 * Each entry is a locator with section_tipo and section_id.
		 * Reserved for future targeted-load paths; currently not consumed by
		 * search or delete internally — callers pass an SQO with
		 * filter_by_locators instead.
		 * @var ?array $ar_locators
		 */
		protected ?array $ar_locators = null;

		/**
		 * Resolved list of section tipos covered by this instance.
		 * Populated lazily by get_ar_section_tipo(). In 'related' mode with
		 * section_tipo=['all'], the list is derived by scanning the db_result;
		 * otherwise it mirrors search_query_object->section_tipo.
		 * @var ?array $ar_section_tipo
		 */
		protected ?array $ar_section_tipo = null;

		/**
		 * Cached db_result from the first call to get_data().
		 * The db_result is iterable (implements Iterator) and exposes
		 * row_count(). Null until the first search executes.
		 * @var ?db_result $data
		 */
		private ?db_result $data = null;

		/**
		 * Full dd_request object defining the data retrieval configuration.
		 * Contains show, select, and search parameters for the sections query.
		 * Not populated by the constructor; reserved for callers that attach
		 * a request object after construction.
		 * @var ?object $dd_request
		 */
		public ?object $dd_request = null;

		/**
		 * Search query object (SQO) driving all searches performed by this
		 * instance. Cloned in the constructor so mutations by set_up() do not
		 * affect the caller's original SQO. Null when the instance is created
		 * without a search context (e.g. standalone delete with explicit
		 * section_tipo/section_id only).
		 * @var ?object $search_query_object
		 */
		public ?object $search_query_object = null;

		/**
		 * Tipo of the element that instantiated this sections object.
		 * Typically a section tipo or a component_portal tipo. Used by
		 * set_up() to look up the caller's request_config and inherit its
		 * configured SQO limit when the caller is a section.
		 * @var ?string $caller_tipo
		 */
		public ?string $caller_tipo = null;



	/**
	* GET_INSTANCE
	* Factory method — creates and returns a new sections instance.
	*
	* Unlike most Dédalo classes this is NOT a true singleton; it always
	* creates a fresh object because each call site requires its own SQO state.
	*
	* @param array|null $ar_locators [= null] - Reserved locator list (not yet consumed internally).
	* @param object|null $search_query_object [= null] - SQO describing which records to load. Cloned internally.
	* @param string|null $caller_tipo [= null] - Tipo of the calling section or component_portal.
	* @param string $mode [= 'list'] - Display mode ('list' | 'edit'); 'edit' forces limit=1.
	* @param string $lang [= DEDALO_DATA_NOLAN] - Language code for data retrieval.
	* @return object - New sections instance.
	*/
	public static function get_instance(
		array|null $ar_locators = null,
		object|null $search_query_object = null,
		string|null $caller_tipo = null,
		string $mode = 'list',
		string $lang = DEDALO_DATA_NOLAN
		): object {

		$instance = new sections($ar_locators, $search_query_object, $caller_tipo, $mode, $lang);

		return $instance;
	}//end get_instance


	/**
	* __CONSTRUCT
	* Initialises instance state and immediately runs set_up() to normalise the SQO.
	* Private — callers must use get_instance().
	*
	* @param array|null $ar_locators - Reserved locator list.
	* @param object|null $search_query_object - SQO; cloned to avoid mutating the caller's copy.
	* @param string|null $caller_tipo - Tipo of the calling element.
	* @param string $mode - Display mode ('list' | 'edit').
	* @param string $lang - Language code.
	* @return void
	*/
	private function __construct(?array $ar_locators, ?object $search_query_object, ?string $caller_tipo, string $mode, string $lang) {

		// Set general vars
		$this->ar_locators			= $ar_locators;
		$this->search_query_object	= isset($search_query_object) ? clone($search_query_object): null;
		$this->caller_tipo			= $caller_tipo;
		$this->mode					= $mode;
		$this->lang					= $lang;

		// set up
		$this->set_up();
	}//end __construct


	/**
	* SET_UP
	* Normalises the cloned SQO before any search executes.
	*
	* Responsibilities:
	* - Ensures limit is set. Priority order:
	*     1. Already set on the incoming SQO → leave untouched.
	*     2. mode='edit' → force limit=1 (single-record edit view).
	*     3. caller_tipo resolves to model='section' → inherit the limit from
	*        the caller's request_config (the Dédalo engine entry whose
	*        api_engine='dedalo').
	*     4. Fallback → default limit of 10.
	* - Ensures offset defaults to 0 when absent.
	* - Forces select=[] so the search returns only section_tipo and section_id
	*   columns, avoiding the cost of fetching full component data at the
	*   aggregate level (individual section instances fetch their own columns).
	*
	* @return void
	*/
	private function set_up() : void {

		// sqo. Use sqo.mode to define the search class manager to run your search
		if(!isset($this->search_query_object)){
			return;
		}
		// limit check
		if (!isset($this->search_query_object->limit)) {

			if ($this->mode==='edit') {

				$this->search_query_object->limit = 1;

			}else{

				$caller_model = ontology_node::get_model_by_tipo( $this->caller_tipo, true );
				if ($caller_model==='section') {

					// section case
					$section = section::get_instance(
						$this->caller_tipo // string section_tipo
					);
					// request_config (is array)
					$request_config = $section->build_request_config();

					$found = array_find($request_config, function($el){
						return isset($el->api_engine) && $el->api_engine==='dedalo';
					});
					if (is_object($found)) {
						if (isset($found->sqo) && isset($found->sqo->limit)) {
							$this->search_query_object->limit = $found->sqo->limit;
						}
					}
				}

				if (!isset($this->search_query_object->limit)) {
					// default limit
					$this->search_query_object->limit = 10;
				}
			}
		}

		if( !isset($this->search_query_object->offset) ) {
			$this->search_query_object->offset = 0;
		}

		// select. Force [] (section_tipo, section_id) to reduce unused data
		$this->search_query_object->select = [];

	}//end set_up



	/**
	* GET_DATA
	* Executes the search defined by $this->search_query_object and returns the
	* paginated db_result. The result is cached so repeated calls within the
	* same request reuse it without hitting the database again.
	*
	* Returns false when the underlying search fails (e.g. invalid SQL generated
	* for translation-memory mode). Callers must check for false before
	* iterating.
	*
	* @return db_result|false - Iterable result set, or false on search error.
	*/
	public function get_data() : db_result|false {

		// already calculated case
		if (isset($this->data)) {
			return $this->data;
		}

		// search
		$search		= search::get_instance($this->search_query_object);
		$db_result	= $search->search();

		// safety check: search can return false on error (e.g. invalid SQL for TM mode)
		if ($db_result === false) {
			debug_log(__METHOD__ . " search returned false for sqo: " . json_encode($this->search_query_object), logger::ERROR);
			return false;
		}

		// fix db_result ar_records as data
		$this->data = $db_result;


		return $db_result;
	}//end get_data



	/**
	* GET_AR_SECTION_TIPO
	* Returns the list of section tipos covered by this instance.
	*
	* The derivation depends on the SQO mode:
	* - 'related' with section_tipo != ['all']: use the tipos already listed in
	*   the SQO (the SQL JOIN already restricts results to those types).
	* - 'related' with section_tipo == ['all']: the actual set of tipos is not
	*   known until records are loaded, so get_data() is called and each
	*   record's section_tipo is collected into the unique list.
	* - Any other mode: mirror search_query_object->section_tipo directly.
	*
	* Result is cached after the first call.
	*
	* @return array - Non-empty list of section tipo strings (e.g. ['oh1', 'oh2']).
	*/
	public function get_ar_section_tipo() : array {

		// already calculated case
			if (isset($this->ar_section_tipo)) {
				return $this->ar_section_tipo;
			}

		// if the sqo has related mode, get the section_tipo from data,
		// It's not possible know the sections because data is a list of references to the source.
		// In some cases that sqo has specific sections because the search will be filtered only for those sections.
		// in these case we get the section_tipo from the SQL self definition
		if(isset($this->search_query_object->mode) && $this->search_query_object->mode==='related'){

			// ar_section_tipo. If is defined, we done. Else, case 'all' get data to resolve used sections
				$this->ar_section_tipo = (reset($this->search_query_object->section_tipo)!=='all')
					? $this->search_query_object->section_tipo
					: null;

			// calculated
				if($this->ar_section_tipo===null){

					// force load data
					$data = $this->get_data();

					$ar_section_tipo = [];
					foreach ($data as $record) {

						$current_section_tipo = $record->section_tipo;
						if (!in_array($current_section_tipo, $ar_section_tipo)) {
							$ar_section_tipo[] = $current_section_tipo;
						}
					}
					$this->ar_section_tipo = $ar_section_tipo;
				}

		}else{
			$this->ar_section_tipo = $this->search_query_object->section_tipo;
		}


		return $this->ar_section_tipo;
	}//end get_ar_section_tipo



	/**
	* GET_AR_ALL_SECTION_ID
	* Returns the section_id of every record matching the current SQO, ignoring
	* any pagination (limit/offset). Used by callers that need to operate on
	* the complete matched set (e.g. bulk relation updates).
	*
	* Internally builds an unpaginated, minimal search (limit=0, full_count=false,
	* select=[]) using an immediately-invoked closure to avoid mutating the
	* instance's own SQO. The $sqo argument to the closure is passed by value
	* via PHP's copy-on-write semantics, so the clone is write-safe.
	*
	* Returns an empty array when no SQO is set.
	*
	* @return array - Flat list of int section_ids; empty when no SQO or no results.
	*/
	public function get_ar_all_section_id() : array {

		$ar_all_section_id = isset($this->search_query_object)
			? (function($sqo){
				// sqo config
				$sqo->limit			= 0;
				$sqo->offset		= 0;
				$sqo->full_count	= false;
				$sqo->select		= [];
				$sqo->parsed		= true;

				// search
				$search		= search::get_instance($sqo);
				$db_result	= $search->search();

				$ar_section_id = [];
				foreach ($db_result as $row) {
					$ar_section_id[] = (int)$row->section_id;
				}

				return $ar_section_id;
			  })($this->search_query_object)
			: [];

		return $ar_all_section_id;
	}//end get_ar_all_section_id



	/**
	* DELETE
	* Removes one or more section records from the database with full
	* integrity and permission checks.
	*
	* Two deletion modes:
	* - 'delete_data'   — wipes component data inside records while keeping
	*                     the row skeleton (section_tipo/section_id) intact.
	*                     Delegates to section_record::delete_data().
	* - 'delete_record' — permanently removes the row and, where applicable,
	*                     cleans up parent-tree references and ontology nodes.
	*                     Delegates to section_record::delete().
	*
	* Execution order for each matched record in 'delete_record' mode:
	*   1. If the section is DEDALO_HIERARCHY_SECTION_TIPO or
	*      DEDALO_ONTOLOGY_SECTION_TIPO, call ontology::delete_main() first to
	*      tear down the tree node and subordinate matrix rows.
	*   2. If the section has a component_relation_children component and
	*      delete_with_children=false, skip records that still have children
	*      (thesaurus safety guard — orphaning child nodes is not allowed).
	*   3. Capture parent references before deletion so they can be cleaned up
	*      afterwards via component_relation_common::remove_parent_references().
	*   4. Call section_record::delete() / delete_data().
	*   5. Remove stale parent-tree references for hierarchical sections.
	*   6. If the section tipo ends with '0' (an ontology-type section such as
	*      'numisdata0'), reconstruct the ontology node tipo (e.g. 'numisdata631')
	*      and delete its dd_ontology entry via ontology_node::delete().
	*
	* After the loop, a verification search is run (delete_record mode only) to
	* confirm all targeted records have actually been removed.
	*
	* Guard rails:
	* - Permission level must be >= 2 (write access); otherwise returns an error.
	* - Bulk deletes (more than one record) are restricted to global admins.
	* - If no sqo is provided, one is auto-built from section_tipo + section_id;
	*   in this case section_id must be non-empty.
	* - prevent_delete_main=true suppresses the ontology::delete_main() call to
	*   avoid re-entrant loops when this method is already called from
	*   ontology::delete_main().
	*
	* @param object $options - Deletion parameters:
	*   {
	*     delete_mode               : 'delete_data' | 'delete_record',
	*     section_tipo              : string  (e.g. 'oh1'),
	*     section_id                : int | null,
	*     caller_dataframe          : mixed | null,
	*     sqo                       : search_query_object | null,
	*     delete_diffusion_records  : bool  (default true),
	*     delete_with_children      : bool  (default false),
	*     prevent_delete_main       : bool  (default false)
	*   }
	* @return object $response - {
	*   result   : int[] | false  (array of deleted section_ids on success),
	*   msg      : string,
	*   errors   : string[],
	*   delete_mode : string  (present on success)
	* }
	*/
	public function delete( object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. ';
			$response->errors	= [];

		// options
			$delete_mode				= $options->delete_mode ?? 'delete_data';
			$section_tipo				= $options->section_tipo ?? $options->tipo;
			$section_id					= $options->section_id ?? null;
			$sqo						= $options->sqo ?? null;
			$delete_diffusion_records	= $options->delete_diffusion_records ?? true;
			$delete_with_children		= $options->delete_with_children ?? false;
			$prevent_delete_main		= $options->prevent_delete_main ?? false;

		// permissions check (only sections area expected here)
			$section = section::get_instance(
				$section_tipo // string section_tipo
			);
			if ($section===false) {
				$msg = "[1] Error: Unable to get section instance for tipo: $section_tipo";
				$response->errors[] = 'unable to get section instance';
				$response->msg .= $msg;
				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' section_id: ' . to_string($section_id) . PHP_EOL
					.' delete options: '.to_string($options)
					, logger::ERROR
				);
				return $response;
			}
			$permissions = $section->get_section_permissions($section_tipo, $section_tipo);
			// debug
			debug_log(__METHOD__
				." To delete section: ($section_tipo-$section_id). Permissions: $permissions ".to_string($section_tipo)
				.' section_tipo: ' . $section_tipo . PHP_EOL
				.' section_id: ' . to_string($section_id) . PHP_EOL
				.' sqo: ' . to_string($sqo)
				, logger::DEBUG
			);
			if ($permissions<2) {
				$msg = '[2] Insufficient permissions to delete record (delete mode: '.$delete_mode.', section_tipo: '.$section_tipo.') permissions: '.$permissions;
				$response->errors[] = 'insufficient permissions to delete';
				$response->msg 	.= $msg;
				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' section_id: ' . to_string($section_id) . PHP_EOL
					.' delete options: '.to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// sqo. search_query_object. If empty, we will create a new one with default values
			if(empty($sqo)){
				// we build a new sqo based on the current source section_id

				// section_id check (is mandatory when no sqo is received)
					if (empty($section_id)) {
						$response->errors[] = 'empty sqo section_id';
						$response->msg 	.= '[3] section_id = null and $sqo = null, impossible to determinate the sections to delete. ';
						debug_log(__METHOD__
							." $response->msg " . PHP_EOL
							.' section_tipo: ' . $section_tipo . PHP_EOL
							.' section_id: ' . to_string($section_id) . PHP_EOL
							.' delete options: '.to_string($options)
							, logger::ERROR
						);
						return $response;
					}

				// Build sqo if not provided
					$self_locator = new locator();
						$self_locator->set_section_tipo($section_tipo);
						$self_locator->set_section_id($section_id);
					$sqo = new search_query_object();
						$sqo->set_section_tipo([$section_tipo]);
						$sqo->set_filter_by_locators([$self_locator]);
			}

		// search the sections to delete
			$sqo->offset	= 0;
			$sqo->limit		= 0; // prevent pagination affects to deleted records
			$search			= search::get_instance($sqo);
			$db_result		= $search->search();

			// check empty records
			$records_len = $db_result->row_count();
			if ( $records_len < 1 ) {
				$response->result = [];
				$response->msg 	.= 'No records found to delete ';
				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' delete options: '.to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// check delete multiple
		// only global admins can perform multiple deletes
			if($records_len > 1 && security::is_global_admin( logged_user_id() ) === false){
				$response->result = [];
				$response->msg 	.= 'forbidden delete multiple for this user';
				debug_log(__METHOD__
					." $response->msg " . PHP_EOL
					.' delete options: '.to_string($options)
					, logger::ERROR);
				return $response;
			}

		// component_relation_children check (thesaurus cases)
			$relation_children_tipo = null;
			if ( $delete_with_children===false && $delete_mode==='delete_record' ) {
				$relation_children_model	= 'component_relation_children';
				$ar_children_tipo			= section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo,
					[$relation_children_model],
					true, // bool from_cache
					true, // bool resolve_virtual
					true, // bool recursive
					true // bool search_exact
				);
				$relation_children_tipo = $ar_children_tipo[0] ?? null;
			}

		// Perform delete on each record
			$ar_delete_section_id = [];
			foreach ($db_result as $record) {

				$current_section_tipo	= $record->section_tipo;
				$current_section_id		= $record->section_id;

				// Delete main section from ontology or hierarchy
				// it will remove all nodes in dd_ontology and all matrix nodes.
					if(	$prevent_delete_main===false &&
						in_array($current_section_tipo, [DEDALO_HIERARCHY_SECTION_TIPO, DEDALO_ONTOLOGY_SECTION_TIPO])
						){

						$main_options = new stdClass();
							$main_options->section_tipo	= $current_section_tipo;
							$main_options->section_id	= $current_section_id;

						$delete_main_response = ontology::delete_main( $main_options );

						if( $delete_main_response->result===false ){
							return $delete_main_response;
						}
					}

				// Check if section has children and skip deletion if it does
					if ( $delete_with_children===false && $delete_mode==='delete_record' && !empty($relation_children_tipo)) {
						$component_relation_children = component_common::get_instance(
							$relation_children_model,
							$relation_children_tipo,
							$current_section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$current_section_tipo
						);
						$data = $component_relation_children->get_data();
						if (!empty($data)) {
							$children = array_map(function($el){
								return $el->section_id;
							}, $data);
							$response->errors[] = (label::get_label('skip_deletion_cause_children') ?? 'skipped record deletion because it has children')
								.' : ' . to_string($current_section_id). ' ['.join(',',$children).']';
							continue;
						}
					}

				// Delete the section record
					// Get parents BEFORE deletion (needed for reference removal)
					$parents_before_delete = null;
					if ($delete_mode==='delete_record' && !empty($relation_children_tipo)) {
						$parents_before_delete = component_relation_parent::get_parents(
							$current_section_id,
							$current_section_tipo
						);
					}

					$section_record = section_record::get_instance( $current_section_tipo, (int)$current_section_id );
					// perform the delete in correct function
					$deleted = false;
					if ($delete_mode==='delete_record') {
						$deleted = $section_record->delete( $delete_diffusion_records );
					}else if ($delete_mode==='delete_data') {
						$deleted = $section_record->delete_data();
					}
					if ($deleted!==true) {
						$response->errors[] = 'unable to delete record: '.to_string($current_section_id);
					}else{
						// remove_parent_references
						if ($delete_mode==='delete_record' && !empty($relation_children_tipo)) {
							// references. Calculate component parent and removes references to current section
							component_relation_common::remove_parent_references(
								$current_section_tipo,
								$current_section_id,
								null,
								$parents_before_delete
							);
						}
					}

				// Delete Ontology case (dd_ontology record).
				// If current section is a Ontology section (ends with zero like 'numisdata0'),
				// the 'dd_ontology' record must to be deleted too, to preserve the deletion coherence.
					$section_id_from_tipo = get_section_id_from_tipo($section_tipo);
					if ($section_id_from_tipo=='0' && !empty($current_section_id)) {
						// is ontology. Create a 'tipo' value for delete it in 'dd_ontology'
						$tipo_to_delete	= get_tld_from_tipo($section_tipo) . $current_section_id; // as 'numisdata631'
						$ontology_node	= ontology_node::get_instance($tipo_to_delete);
						$delete_result	= $ontology_node->delete();
						if (!$delete_result) {
							$response->errors[] = 'Error on delete Ontology node: ' . $tipo_to_delete;
							debug_log(__METHOD__
								. " Error on delete Ontology node " . PHP_EOL
								. ' tipo_to_delete: ' . to_string($tipo_to_delete) . PHP_EOL
								. ' options: ' . json_encode($options, JSON_PRETTY_PRINT)
								, logger::ERROR
							);
						}
					}

				// ar_delete section_id
				$ar_delete_section_id[] = $current_section_id;
			}

		// check deleted all found sections. Exec the same search again expecting to obtain zero records
			if ($delete_mode==='delete_record') {

				$check_search	= search::get_instance($sqo);
				$db_result		= $check_search->search();

				// check empty records
				if( $db_result->row_count() > 0 ) {

					$check_ar_section_id = [];
					foreach($db_result as $row){
						$check_ar_section_id[] = $row->section_id;
					}

					$response->errors[] = 'record not deleted: '.to_string($check_ar_section_id);
					$response->msg 	.= '[4] Some records were not deleted: '.json_encode($check_ar_section_id, JSON_PRETTY_PRINT);
					debug_log(__METHOD__
						." $response->msg " . PHP_EOL
						.' delete options: '.to_string($options) . PHP_EOL
						.' errors: ' . json_encode($response->errors, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					return $response;
				}
			}

		// response OK
			$response->result		= $ar_delete_section_id;
			$response->delete_mode	= $delete_mode;
			$response->msg			= !empty($errors)
				? 'Some errors occurred when delete sections.'
				: 'OK. Request done successfully.';


		return $response;
	}//end delete

}//end class sections
