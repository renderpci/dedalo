<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER
* Project-based access-control component: assigns section records to projects
* and enforces which users can see those records.
*
* Every section record carries a component_filter whose stored value is an array
* of locators pointing at project records in the projects section
* (DEDALO_SECTION_PROJECTS_TIPO, typically 'dd153').  The access-control layer
* then restricts search results to records whose filter value overlaps with the
* requesting user's own project set (held in component_filter_master inside the
* User section 'dd128').
*
* Responsibilities:
* - Store and validate the list of projects a record belongs to (as locators
*   with relation type DEDALO_RELATION_TYPE_FILTER, typically 'dd675').
* - On save, prevent non-admin users from silently removing projects they do
*   not have access to (set_data override).
* - Populate a sensible default on new-record creation via three-stage
*   priority cascade (config-file default → properties.data_default → global
*   config constant DEDALO_DEFAULT_PROJECT).
* - Expose a user-scoped datalist (checkbox list) so the edit UI only offers
*   projects the current user may assign.
* - Build a sortable order path that traverses into the project name field
*   (DEDALO_PROJECTS_NAME_TIPO, typically component_input_text 'dd156').
*
* Data shape (stored in the 'relation' JSONB column):
*   Array of locator objects, each:
*   {
*     "section_tipo": "dd153",       // DEDALO_FILTER_SECTION_TIPO_DEFAULT
*     "section_id":   1,             // the target project record id
*     "type":         "dd675",       // DEDALO_RELATION_TYPE_FILTER
*     "from_component_tipo": "dd##"  // the filter component tipo in the source section
*   }
*
* Extends component_relation_common for relationship management capabilities.
* Extended by component_filter_master (user-section variant) which overrides
* save() to flush the per-user project cache on permission changes.
*
* The commented-out save() / propagate_filter() / get_diffusion_value() blocks
* are intentionally retained as disabled code pending a decision on portal
* propagation and diffusion strategy.
*
* @package Dédalo
* @subpackage Core
*/
class component_filter extends component_relation_common {



	/**
	* @var string|int|null $user_id
	* Lazily populated user identifier used during default-data calculation.
	* Starts as null; set to the logged-in user's id when needed.
	*/
	private string|int|null $user_id = null;

	/**
	* @var bool $run_propagate_filter
	* Controls whether filter changes cascade to child portal components after
	* save().  Set to false in regenerate_component() to skip the (expensive)
	* inverse portal search during bulk cache rebuilds.
	*/
	public bool $run_propagate_filter = true;

	// relation_type defaults
	/**
	* @var ?string $default_relation_type
	* The relation type tag stored on every locator written by this component.
	* Defaults to DEDALO_RELATION_TYPE_FILTER ('dd675').  Overrides the generic
	* null default from component_relation_common so that auto-built locators
	* always carry the correct type without explicit assignment.
	*/
	protected ?string $default_relation_type = DEDALO_RELATION_TYPE_FILTER;

	// test_equal_properties is used to verify duplicates when add locators
	/**
	* @var array $test_equal_properties
	* Property set used by locator::in_array_locator() to decide whether two
	* locators represent the same project assignment.  Including
	* 'from_component_tipo' ensures that a single project record referenced from
	* two different filter components on the same section remains distinct.
	*/
	public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* __CONSTRUCT
	* Builds the component, forcing the language to DEDALO_DATA_NOLAN.
	* Project filter data is language-neutral: project locators are the same
	* regardless of the active UI language, so no language suffix is stored.
	* @param string $tipo
	* @param mixed $section_id [= null]
	* @param string $mode [= 'list']
	* @param string $lang [= DEDALO_DATA_NOLAN] - overridden; always forced to DEDALO_DATA_NOLAN
	* @param ?string $section_tipo [= null]
	* @param bool $cache [= true]
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// force lang value always
			$this->lang = DEDALO_DATA_NOLAN;

		// Build the component normally
			parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* SET_DATA
	* Overwrites component_relation_common::set_data() with a security merge step.
	*
	* The security problem being solved: a non-admin user editing a record could
	* submit a locator array that omits projects the user has no visibility into.
	* A naive save would erase those hidden-project assignments, effectively
	* removing the record from projects the user cannot even see.
	*
	* Strategy:
	* 1. Global admins skip the merge; their submitted $data is stored verbatim.
	* 2. For regular users, identify every locator in the current database value
	*    whose (section_tipo, section_id) pair does NOT appear in the user's own
	*    project list (fetched from component_filter_master).
	* 3. Append those "non-access" locators to the incoming $data so they are
	*    always preserved.
	* @param ?array $data - new locator array from the client (may be null/empty)
	* @return bool - result of parent::set_data()
	*/
	public function set_data( ?array $data ) : bool {

		// preserve projects that user do not have access
			$user_id			= logged_user_id();
			$is_global_admin	= security::is_global_admin($user_id);
			if ($is_global_admin===true) {

				// do not modify data
				$final_data = $data;

			}else{

				// user projects
				$user_projects = component_filter_master::get_user_projects( $user_id );
				// actual data in DDBB
				$current_data = $this->get_data();
				// filter
				$non_access_locators = [];
				if (!empty($current_data)) {
					foreach ($current_data as $current_locator) {
						$in_my_projects = locator::in_array_locator(
							$current_locator,
							$user_projects,
							['section_tipo','section_id'] // array ar_properties
						);
						if ($in_my_projects===false) {
							$non_access_locators[] = $current_locator;
						}
					}
				}

				// merge final data
				$final_data = empty($data)
					? $non_access_locators
					: [...(array)$data, ...$non_access_locators];
			}


		$result = parent::set_data( $final_data );


		return $result;
	}//end set_data



	/**
	* SET_DATA_DEFAULT
	* Overwrite component common method.
	* Set the data default of the user for this component.
	* If the user has not write access to the component it will not set.
	* In these cases, the component will be empty and
	* only the user who created the section and the global administrator can access the record.
	*
	* Called automatically by the framework when a new section record is first
	* loaded in 'edit' mode with no existing data.  Only component_filter itself
	* triggers the auto-assignment (not its subclass component_filter_master).
	*
	* Guard conditions (all must hold before assigning defaults):
	* - Current user has write permission (>= 2) on the section's new button.
	* - Component is not in time-machine mode.
	* - Mode is 'edit' and the concrete class is exactly 'component_filter'.
	* - section_id is not null (not a template row).
	* - section_tipo is not 'test3' (unit-test sentinel excluded to avoid
	*   polluting test data with real project assignments).
	* @return bool true if defaults were saved, false otherwise
	*/
	protected function set_data_default() : bool {

		// Data default only can be saved by users than have permissions to save.
		// Read users can not change component data.
			$permissions = security::get_section_new_permissions($this->section_tipo);
			// $section = $this->get_my_section();
			// $permissions = $section->get_section_permissions();
			if ($permissions===null) {
				// no button new found or is not set
				// get the permissions from current component_filter
				$permissions = $this->get_component_permissions();
			}
			if ($permissions < 2) {
				return false;
			}

		// tm (time_machine) mode case
			if ($this->mode==='tm' || $this->data_source==='tm') {
				debug_log(__METHOD__
					. " Warning on set_data_default: invalid mode or data_source (tm) ! . Ignored order" . PHP_EOL
					. ' section_id: ' . to_string($this->section_id) . PHP_EOL
					. ' section_tipo: ' . $this->section_tipo . PHP_EOL
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' model: ' . get_class($this) . PHP_EOL
					. ' mode: ' . $this->mode . PHP_EOL
					. ' data_source: ' . $this->data_source . PHP_EOL
					. ' lang: ' . $this->lang
					, logger::WARNING
				);
				return false;
			}

		// dedalo_default_project
		// If component is in edit mode and don't have data, we assign the default data defined in config.
			if ($this->mode === 'edit' &&
				get_called_class() === 'component_filter' && // Remember that component_filter_master extends this class
				$this->section_id !== null &&
				$this->section_tipo !== 'test3' // exclude unit_test 'test3' section to create default data
				) {

				$data = $this->get_data();
				if(empty($data)) {

					// filter always save default project.
					$user_id				= logged_user_id();
					$default_data_for_user	= $this->get_default_data_for_user($user_id);

					// set current user projects default
					if (!empty($default_data_for_user)) {

						$this->set_data($default_data_for_user);
						$this->save();

						debug_log(__METHOD__
							." Saved component filter (tipo:$this->tipo, section_id:$this->section_id, section_tipo:$this->section_tipo) DEDALO_DEFAULT_PROJECT as ". PHP_EOL
							.' default_data_for_user: ' . json_encode($default_data_for_user, JSON_PRETTY_PRINT)
							, logger::DEBUG
						);

						// data default is fixed
						return true;
					}
				}
			}

		// data default is not set
		return false;
	}//end set_data_default



	/**
	* GET_DEFAULT_DATA_FOR_USER
	* Calculates the initial project locator array for a newly created record.
	*
	* Priority cascade (first non-empty result wins, then security-checked):
	*
	* 1. CONFIG_DEFAULT_FILE_PATH JSON file (optional, defined in config.php):
	*    An array of objects matching {tipo, [section_tipo,] value}.  The method
	*    searches for the first entry where tipo matches $this->tipo and, if
	*    section_tipo is present in the entry, also section_tipo matches.
	*    The 'value' property (array or scalar wrapped in array) becomes the
	*    initial default_data.
	*
	* 2. properties.data_default (legacy, deprecated for new installations):
	*    Reads properties->dato_default from the ontology node.  Supports two
	*    legacy formats:
	*      - v5:  {"<section_id>": <ignored_value>}  (numeric key = section_id)
	*      - v6:  {"section_id": "<id>", "section_tipo": "<tipo>"}
	*    Builds a single locator and appends it to default_data.
	*    (!) Move to CONFIG_DEFAULT_FILE_PATH as soon as possible.
	*
	* 3. Global config fallback:
	*    Uses DEDALO_DEFAULT_PROJECT (numeric section_id) and
	*    DEDALO_FILTER_SECTION_TIPO_DEFAULT (section_tipo, same as
	*    DEDALO_SECTION_PROJECTS_TIPO) to build a last-resort locator.
	*
	* Security check (applied for non-admin users after the cascade):
	*   If none of the computed locators falls inside the user's own project set
	*   (checked via locator::in_array_locator on section_tipo + section_id), the
	*   first locator from the user's project list is appended to ensure the
	*   creating user can always access the record they just created.
	* @param int $user_id
	* @return array $default_data - array of locator objects (never empty after cascade)
	*/
	public function get_default_data_for_user(int $user_id) : array {

		$default_data = [];

		// 1 file: optional defaults for '/config/config_defaults.json' file
			if (defined('CONFIG_DEFAULT_FILE_PATH')) {
				// config_default_file is a JSON array value
				$contents = file_get_contents(CONFIG_DEFAULT_FILE_PATH);
				$defaults = json_decode($contents);
				if (empty($defaults)) {

					// wrong file case
					debug_log(__METHOD__
						." Ignored empty defaults file contents ! (Check if JSON is valid) " . PHP_EOL
						.' CONFIG_DEFAULT_FILE_PATH: ' . to_string(CONFIG_DEFAULT_FILE_PATH) . PHP_EOL
						.' contents: ' .  to_string($contents) . PHP_EOL
						.' defaults from file: ' . to_string($defaults)
						, logger::ERROR
					);
				}else{

					if (!is_array($defaults)) {

						// bad format case
						debug_log(__METHOD__
							." Ignored config_default_file value. Expected type was 'array' but received is ". gettype($defaults)
							, logger::ERROR
						);
					}else{

						// OK case. Search for matching value
						$found = array_find($defaults, function($el){
							if (isset($el->section_tipo)) {
								return $el->tipo===$this->tipo && $el->section_tipo===$this->section_tipo; // Note if is defined section_tipo, use it to compare
							}
							return $el->tipo===$this->tipo; // Note that match only uses component tipo (case hierarchy25 problem)
						});
						if (is_object($found)) {
							// update default data
							$default_data = is_array($found->value)
								? $found->value
								: [$found->value];
						}
					}
				}
			}

		// 2 properties: optional properties data_default. It is appended to already set data if defined.
			if (empty($default_data)) {

				// Only for compatibility with old installations like mdcat
				// (!) Move ASAP generic default values from properties, to custom CONFIG_DEFAULT_FILE_PATH JSON file

				$properties = $this->get_properties();
				if (isset($properties->data_default)) {

					// section_id
						// legacy format of default data sample:
							// "dato_default": {
							// 	"91": "2"
							// }
						// current v6 format sample
							// "dato_default": {
							// 	"section_id": "91",
							// 	"section_tipo": "dd153"
							// }
						$section_id = null;
						foreach($properties->dato_default as $key => $value) {
							$section_id = $key==='section_id'
								? $value // v6 format
								: $key; // legacy v5 definition
							break;
						}

					// section_tipo
						$section_tipo = $properties->dato_default->section_tipo ?? DEDALO_FILTER_SECTION_TIPO_DEFAULT;

					// locator
						$filter_locator = new locator();
							$filter_locator->set_section_tipo($section_tipo);
							$filter_locator->set_section_id($section_id);
							$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
							$filter_locator->set_from_component_tipo($this->tipo);

						// add
						$default_data[] = $filter_locator;

					// info debug log
						debug_log(__METHOD__
							.' Created default data for component_filter with default data from \'properties\'' . PHP_EOL
							.' label: ' . $this->label . PHP_EOL
							.' section_id: ' . $this->section_id . PHP_EOL
							.' section_tipo: ' . $this->section_tipo . PHP_EOL
							.' properties: ' . to_string($this->properties)
							, logger::DEBUG
						);
				}
			}

		// global_admin case
			if (security::is_global_admin($user_id)===false) {

				// regular user case. We check if project values are allowed to current user
				$user_projects = component_filter_master::get_user_projects($user_id);
				if (!empty($user_projects)) {

					// check current added project is accessible for current user
						$in_my_projects = false;
						foreach ($default_data as $current_locator) {
							$in_my_projects = locator::in_array_locator(
								$current_locator,
								$user_projects,
								['section_tipo','section_id'] // array ar_properties
							);
							if ($in_my_projects===true) {
								break; // user have access to assigned default. We have finished
							}
						}

					// If not, add the first one to prevent no access situation
						if ($in_my_projects===false) {

							// First user project
							$user_projects_first_locator = reset($user_projects);

							$filter_locator = new locator();
								$filter_locator->set_section_tipo($user_projects_first_locator->section_tipo);
								$filter_locator->set_section_id($user_projects_first_locator->section_id);
								$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
								$filter_locator->set_from_component_tipo($this->tipo);

							$default_data[] = $filter_locator;
						}
				}
			}

		// final fallback config: default from config file
			if (empty($default_data)) {

				// Add default project defined in config
					$filter_locator = new locator();
						$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
						$filter_locator->set_section_id(DEDALO_DEFAULT_PROJECT);
						$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
						$filter_locator->set_from_component_tipo($this->tipo);

					$default_data[] = $filter_locator;

				// info debug log
					debug_log(__METHOD__
						. " Added default project from config " . PHP_EOL
						. ' DEDALO_DEFAULT_PROJECT: ' . to_string(DEDALO_DEFAULT_PROJECT)
						, logger::DEBUG
					);
			}

		// check value. Not empty value is expected here
			if (empty($default_data)) {
				debug_log(__METHOD__
					. " Unable to get default filter data " . PHP_EOL
					. ' user_id : ' . to_string($user_id) . PHP_EOL
					. ' CONFIG_DEFAULT_FILE_PATH: ' . to_string(CONFIG_DEFAULT_FILE_PATH) . PHP_EOL
					. ' properties: ' . to_string( $this->get_properties() ) . PHP_EOL
					. ' DEDALO_DEFAULT_PROJECT: ' . to_string(DEDALO_DEFAULT_PROJECT)
					, logger::ERROR
				);
			}


		return $default_data;
	}//end get_default_data_for_user



	/**
	* SAVE
	* Overwrite component_common method
	* @return bool
	*/
	// public function save() : bool {

	// 	// activity case logger only, never save project info
	// 	if( $this->tipo===logger_backend_activity::$_COMPONENT_PROJECTS['tipo'] ) {
	// 		return true;
	// 	}

	// 	// we save normally but we save the result
	// 	$parent_save_result = parent::save();


	// 	// portal case
	// 	// If the section to which this component belongs has a portal, we will propagate
	// 	// the changes to all existing resources in the portal of this section (if any)
	// 	if ($this->run_propagate_filter===true) {
	// 		$this->propagate_filter();
	// 	}


	// 	return $parent_save_result;
	// }//end save



	/**
	* PROPAGATE_FILTER
	* Propagate all current filter data (triggered when save) to children portals.
	* @return bool
	*/
	// public function propagate_filter() : bool {

	// 	$section_id = $this->get_section_id();
	// 	$section_tipo = $this->get_section_tipo();

	// 	$component_filter_data = $this->get_data();
	// 	if (empty($component_filter_data)) {
	// 		debug_log(__METHOD__
	// 			. " EMPTY DATA ($section_tipo, $section_id) . Nothing to propagate" . PHP_EOL
	// 			. ' component_filter_data: ' . to_string($component_filter_data)
	// 			, logger::ERROR
	// 		);
	// 		return true;
	// 	}

	// 	$data_filter = [];
	// 	foreach ($component_filter_data as $current_locator) {
	// 		if (isset($current_locator->section_tipo) && isset($current_locator->section_id)) {
	// 			$locator = new locator();
	// 				$locator->set_section_tipo($current_locator->section_tipo);
	// 				$locator->set_section_id($current_locator->section_id);
	// 			$data_filter[] = $locator;
	// 		}else{
	// 			debug_log(__METHOD__
	// 				. " IGNORED INVALID LOCATOR ($section_tipo, $section_id) ".to_string($current_locator)
	// 				, logger::ERROR
	// 			);
	// 		}
	// 	}

	// 	// Locate component_portal in this section.
	// 	$ar_model_name_required = ['component_portal'];
	// 	$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
	// 		$section_tipo,
	// 		$ar_model_name_required,
	// 		true, // bool from_cache
	// 		true, // bool resolve_virtual
	// 		true, // bool recursive
	// 		true, // bool search_exact
	// 		false, // array|bool ar_tipo_exclude_elements
	// 		null // array|null ar_exclude_models
	// 	);
	// 	foreach ($ar_children as $child_tipo) {
	// 		$component_portal = component_common::get_instance(
	// 			'component_portal',
	// 			$child_tipo,
	// 			$section_id,
	// 			'list',
	// 			DEDALO_DATA_NOLAN,
	// 			$section_tipo,
	// 			false
	// 		);
	// 		$component_portal->propagate_filter($data_filter);
	// 	}


	// 	return true;
	// }//end propagate_filter



	/**
	* GET_DATALIST
	* Works like ar_list_of_values but filtered by user authorized projects.
	*
	* Delegates to component_filter_master::get_user_authorized_projects() which
	* returns the enriched set of projects the logged-in user is allowed to assign
	* (i.e. the intersection of all projects and the user's own project list, with
	* hierarchy metadata and labels resolved from the ontology).
	*
	* The returned array is then sorted alphabetically (case-insensitive) by label
	* so the checkbox list in the edit UI is consistently ordered regardless of
	* the underlying project record ids.
	*
	* Each item in the returned array is a stdClass with:
	*   - type        (string) 'project'
	*   - label       (string) display name of the project
	*   - section_tipo (string) e.g. 'dd153'
	*   - section_id  (int|string) the project record id
	*   - value       (locator) the raw locator object (used for selected-state matching)
	*   - parent      (mixed) parent project info from the authorized-projects cache
	*   - order       (mixed) ordering value from the authorized-projects cache
	* @return array $datalist - sorted array of project stdClass items
	*/
	public function get_datalist() : array {
		$start_time = start_time();

		// ar_projects. Projects authorized to the current logged user
			$ar_projects = component_filter_master::get_user_authorized_projects(
				logged_user_id(),
				$this->tipo
			);

		// ar_projects_parsed
			$datalist = [];
			foreach ($ar_projects as $project_item) {

				$project = new stdClass();
					$project->type			= 'project';
					$project->label			= $project_item['label'];
					$project->section_tipo	= $project_item['locator']->section_tipo;
					$project->section_id	= $project_item['locator']->section_id;
					$project->value			= $project_item['locator'];
					$project->parent		= $project_item['parent'];
					$project->order			= $project_item['order'];

				$datalist[] = $project;
			}//end foreach ($ar_projects as $project_item)

		// sort by label ASC
			usort($datalist, function($a, $b) {

				$a_label = !empty($a->label) ? $a->label : '';
				$b_label = !empty($b->label) ? $b->label : '';

				return strcasecmp($a_label, $b_label);
			});

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					." Total time: ".exec_time_unit($start_time,'ms').' ms'
					, logger::DEBUG
				);
			}


		return $datalist;
	}//end get_datalist



	/**
	* UPDATE_DATA_VERSION
	* Handles format-migration requests dispatched by the update-data-version tool.
	*
	* The switch-case on $update_version allows each version string to describe a
	* migration step; the default branch returns result=0 ('no migration needed /
	* not implemented') because component_filter data is currently up-to-date.
	* Historical migrations (e.g. pre-v4.9.0 format) are handled by the separate
	* convert_dato_pre_490() static method and never passed through here.
	*
	* Result codes returned in $response->result:
	*   0 — this component has no migration for the requested version (ignored)
	*   1 — migration was applied successfully
	*   2 — migration attempted but data was already in the correct format
	* @param object $request_options
	*   Recognised keys: update_version (array), data_unchanged, reference_id,
	*   tipo, section_id, section_tipo, context
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->data_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* CONVERT_DATO_PRE_490
	* Migrates filter data saved before Dédalo v4.9.0 to the current locator format.
	*
	* Pre-v4.9.0 the component stored data as a JSON object whose keys were
	* project section_ids (integers) and values were permission level integers
	* (never used for access control, just a legacy artifact).
	* Example old format:  {"1": 2, "7": 1}
	*
	* This method converts each numeric key into a proper locator object:
	*   {section_tipo: DEDALO_FILTER_SECTION_TIPO_DEFAULT,
	*    section_id:   <int key>,
	*    type:         DEDALO_RELATION_TYPE_FILTER,
	*    from_component_tipo: $from_component_tipo}
	*
	* Already-converted entries (objects that already carry section_id and
	* section_tipo) are passed through unchanged, so the method is safe to call
	* on mixed datasets.
	*
	* Keys that produce section_id === 0 (e.g. malformed {"0":"1"} objects) are
	* silently discarded; this guards against a known bad-data pattern.
	* @param mixed $dato - raw stored value (object/array from JSON decode or existing locators)
	* @param string $from_component_tipo - component tipo to stamp on built locators
	* @return mixed $new dato - array of locator objects, or the original $dato if empty
	*/
	public static function convert_dato_pre_490( mixed $dato, string $from_component_tipo ) {

		if (!empty($dato) && $dato!='[]') {
			// Old format is received case

			$ar_locators = [];
			foreach ($dato as $key => $value) {

				$filter_locator = false;

				if (isset($value->section_id) && isset($value->section_tipo)) {
					# Updated dato (is locator)
					$filter_locator = $value;

				}else{
					# Remember: in old dato, the key is the target section_id and the value 0-2 is not used
					if ((int)$key>0) { // Avoid include bad formed data with values like {"0":"1"}
						# Old dato Like {"1": 2}
						$filter_locator = new locator();
							$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
							$filter_locator->set_section_id((int)$key);
							$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
							$filter_locator->set_from_component_tipo($from_component_tipo);
					}
				}
				# Add to clean array
				if ($filter_locator!==false) {
					$ar_locators[] = $filter_locator;
				}
			}
			# Replace old formatted value with new formatted array of locators
			$new_dato = $ar_locators;
		}else{
			$new_dato = $dato; // Empty untouched
		}

		return $new_dato;
	}//end convert_dato_pre_490



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load data to avoid save empty content
	*
	* Used by tool_update_cache during bulk cache-rebuild passes.  It disables
	* $run_propagate_filter before saving to avoid triggering the (expensive)
	* inverse-portal traversal for every record in the rebuild batch; propagation
	* can be re-run separately if required.
	*
	* (!) Always call get_data() before save() here: the component may not have
	* been loaded yet, and saving without loading would overwrite the stored data
	* with an empty array.
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// Force loads data always !IMPORTANT
		$data = $this->get_data();

		// Set run_propagate_filter as false to avoid calculate inverse search of portals, very long process.
		$this->run_propagate_filter = false;

		// Save component data
		$this->save();


		return true;
	}//end regenerate_component



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	// public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

	// 	$diffusion_value = null;

	// 	// data
	// 	$data = $this->get_data();
	// 	if (empty($data)) {
	// 		return $diffusion_value;
	// 	}

	// 	// label
	// 	$ar_label = [];
	// 	foreach ((array)$data as $locator) {
	// 		$label = ts_object::get_term_by_locator(
	// 			$locator,
	// 			$lang ?? DEDALO_DATA_LANG,
	// 			true
	// 		);
	// 		if (!empty($label)) {
	// 			$label = strip_tags(trim($label));
	// 			if (!empty($label)) {
	// 				$ar_label[] = $label;
	// 			}
	// 		}
	// 	}

	// 	// value
	// 	$diffusion_value = !empty($ar_label)
	// 		? implode(' | ', $ar_label)
	// 		: null;


	// 	return $diffusion_value;
	// }//end get_diffusion_value



	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Select source section/s
	* Overrides component common method
	*
	* Returns the canonical projects section tipo so that the generic relation
	* machinery (e.g. get_datalist fallback, portals, search helpers) knows which
	* section this component points at.  Returns an empty array when the constant
	* is not defined (e.g. minimal test environments) to fail gracefully.
	* @return array ar_target_section_tipo
	* 	Array of string like ['dd153']
	*/
	public function get_ar_target_section_tipo() : array {

		return defined('DEDALO_SECTION_PROJECTS_TIPO')
			? [DEDALO_SECTION_PROJECTS_TIPO]
			: [];
	}//end get_ar_target_section_tipo



	/**
	* GET_SORTABLE
	* @return bool
	* Default is false for relations. Override here.
	*
	* component_relation_common disables sorting by default because most relation
	* components reference arbitrary records without a meaningful sort field.
	* component_filter overrides this to true so that list views can sort by the
	* project name field (see get_order_path).
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	*
	* Defines the two-step traversal the column-order engine follows to reach the
	* sortable value:
	*   step 1 — this component itself (the join anchor)
	*   step 2 — the project name field inside the target project section
	*             (DEDALO_PROJECTS_NAME_TIPO, typically component_input_text 'dd156')
	*
	* This path instructs the search engine to JOIN through the relation and then
	* order by the text value of the project's name component, giving the user
	* alphabetical sorting by project label.
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path - ordered array of stdClass path-step objects
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		$path = [
			// self component path
			(object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_model_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_term_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			],
			// project name field (component_input_text dd156)
			(object)[
				'component_tipo'	=> DEDALO_PROJECTS_NAME_TIPO,
				'model'				=> ontology_node::get_model_by_tipo(DEDALO_PROJECTS_NAME_TIPO,true),
				'name'				=> ontology_node::get_term_by_tipo(DEDALO_PROJECTS_NAME_TIPO),
				'section_tipo'		=> DEDALO_SECTION_PROJECTS_TIPO
			]
		];

		return $path;
	}//end get_order_path



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to data. Override in other cases.
	* Note that empty array or string are returned as null
	*
	* Returns only the labels of projects that are BOTH stored in the record's
	* filter data AND accessible to the currently logged-in user.
	*
	* (!) Projects the user has no access to are silently omitted from the output.
	* This is intentional for UI display — the hidden project assignments are still
	* preserved in the database (see set_data) — but it means the list value does
	* not represent the complete set of project assignments for admin users reading
	* records owned by other users.  Future revisions may change this behaviour.
	* @return array|null $list_value - array of project label strings, or null if no data
	*/
	public function get_list_value() : ?array {

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		// (!) Note that only user authorized projects will be added, discarding others
		// maybe this behavior must be changed in future
		$user_id		= logged_user_id();
		$ar_projects	= component_filter_master::get_user_authorized_projects($user_id, $this->tipo);

		$list_value = [];
		foreach ($ar_projects as $item) {

			$locator = $item['locator'];
			if ( true===locator::in_array_locator($locator, $data, ['section_id','section_tipo']) ) {
				$list_value[] = $item['label'];
			}
		}


		return $list_value;
	}//end get_list_value



}//end class component_filter
