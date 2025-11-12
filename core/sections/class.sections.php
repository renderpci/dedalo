<?php declare(strict_types=1);
/**
* CLASS SECTIONS
*
*
*/
class sections extends common {



	/**
	* CLASS VARS
	*/
		// FIELDS
		protected $ar_locators;
		protected $ar_section_tipo;
		// protected $dato;

		// dd_request. Full dd_request
		public $dd_request;

		// search_query_object
		public $search_query_object;

		// string (section/portal)
		public $caller_tipo;



	/**
	* GET_INSTANCE
	* Singleton pattern
	* @param array|null $ar_locators
	* @param object|null $search_query_object = null
	* @param string|null $caller_tipo = null
	* 	normally will be section or component_portal
	* @param string $mode = list
	* @param string $lang = DEDALO_DATA_NOLAN
	* @return object $instance
	* 	Instance of sections class
	*/
	public static function get_instance( ?array $ar_locators, ?object $search_query_object=null, ?string $caller_tipo=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN ) : object {

		$instance = new sections($ar_locators, $search_query_object, $caller_tipo, $mode, $lang);

		return $instance;
	}//end get_instance



	/**
	* CONSTRUCT
	* @param array|null $ar_locators
	* @param object $search_query_object
	* @param string $caller_tipo
	* @param string $mode
	* @param string $lang
	*
	* @return void
	*/
	private function __construct(?array $ar_locators, ?object $search_query_object, ?string $caller_tipo, string $mode, string $lang) {

		// Set general vars
		$this->ar_locators			= $ar_locators;
		$this->search_query_object	= $search_query_object;
		$this->caller_tipo			= $caller_tipo;
		$this->mode					= $mode;
		$this->lang					= $lang;
	}//end __construct



	/**
	* GET_DATO
	* Get records from database using current sqo (search_query_object)
	* @return array $this->dato ($ar_records from search)
	*/
	public function get_dato() {

		// already calculated case
			if (isset($this->dato)) {
				return $this->dato;
			}

		// sqo. Use sqo.mode to define the search class manager to run your search
			$search_query_object = $this->search_query_object;

		// limit check
			if (!isset($search_query_object->limit)) {

				if ($this->mode==='edit') {

					$search_query_object->limit = 1;

				}else{

					$caller_model = ontology_node::get_model_by_tipo($this->caller_tipo,true);
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
								$search_query_object->limit = $found->sqo->limit;
							}
						}
					}
				}
			}

		// search
			$search		= search::get_instance($search_query_object);
			$rows_data	= $search->search();

		// fix result ar_records as dato
			$this->dato = $rows_data->ar_records;


		return $this->dato;
	}//end get_dato



	/**
	* GET_AR_SECTION_TIPO : alias of $this->get_tipo()
	* @return array $this->ar_section_tipo
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
					: false;

			// calculated
				if($this->ar_section_tipo===false){

					// force load dato
					$dato = $this->get_dato();

					$ar_section_tipo = [];
					foreach ($dato as $record) {

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
	* @return array $ar_all_section_id
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
				$rows_data	= $search->search();

				return array_map(function($row){
					return (int)$row->section_id;
				}, $rows_data->ar_records);

			})($this->search_query_object)
			: [];

		return $ar_all_section_id;
	}//end get_ar_all_section_id



	/**
	* DELETE
	* Removes one or more section records from database
	* If sqo is received, it will be used to search target sections,
	* else a new sqo will be created based on current section_tipo, section_id
	* Note that 'delete_mode' must be declared (delete_data|delete_record)
	* @param object $options
	* {
	*	delete_mode					: 'delete_data' | 'delete_record',
	*	section_tipo				: 'oh1',
	*	section_id					: 57 | null,
	*	caller_dataframe			: caller_dataframe ?? null,
	*	sqo							: {
	*										"section_tipo": [
	*											"oh1"
	*										],
	*										"filter_by_locators": [
	*											{
	*												"section_tipo": "oh1",
	*												"section_id": "127"
	*											}
	*										],
	*										"limit": 1
	*								   }
	*	delete_diffusion_records	: bool (false),
	*	delete_with_children		: bool (false),
	*	prevent_delete_main 		: bool (false)
	* }
	* @return object $response
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
			$rows_data		= $search->search();
			$ar_records		= $rows_data->ar_records;
			// check empty records
			if (empty($ar_records)) {
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
			$records_len = count($ar_records);
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
			foreach ($ar_records as $record) {

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
					$section_record = section_record::get_instance( $current_section_tipo, $current_section_id );
					// perform the delete in correct function
					$deleted = false;
					if ($delete_mode==='delete_record') {
						$deleted = $section_record->delete_record( $delete_diffusion_records );
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
								null
							);
						}
					}

				// Delete Ontology case (dd_ontology record).
				// If current section is a Ontology section (ends with zero like 'numisdata0'),
				// the 'dd_ontology' record must to be deleted too, to preserve the deletion coherence.
					$section_id_from_tipo = get_section_id_from_tipo($section_tipo);
					if ($section_id_from_tipo=='0') {
						// is ontology. Create a 'tipo' value for delete it in 'dd_ontology'
						$tipo_to_delete	= get_tld_from_tipo($section_tipo) . $section_id; // as 'numisdata631'
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
			}

		// ar_delete section_id
			$ar_delete_section_id = array_map(function($record){
				return $record->section_id;
			}, $ar_records);

		// check deleted all found sections. Exec the same search again expecting to obtain zero records
			if ($delete_mode==='delete_record') {

				$check_search		= search::get_instance($sqo);
				$check_rows_data	= $check_search->search();
				$check_ar_records	= $check_rows_data->ar_records;
				if(count($check_ar_records)>0) {

					$check_ar_section_id = array_map(function($record){
						return $record->section_id;
					}, $check_ar_records);

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
