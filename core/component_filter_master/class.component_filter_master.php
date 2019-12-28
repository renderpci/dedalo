<?php
require_once(dirname(dirname(__FILE__)).'/component_filter/class.component_filter.php');
/*
* CLASS COMPONENT FILTER MASTER
*
*
*/
class component_filter_master extends component_filter {


	private $user_id;
	// protected $caller_id;


	/**
	* __CONSTRUCT
	*/
	function __construct($tipo=false, $parent=null, $modo='edit', $lang=NULL, $section_tipo=null) {

		// Note that parent is NOT component_common here (is component_filter)
		parent::__construct($tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo);

		// $this->user_id  = $this->get_parent();

		// # caller_id from parent var (default)
		// if(!empty($parent)) {
		// 	$this->caller_id = $parent;
		// }

		return true;
	}//end __construct



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method
	*/
	public function Save() {
		# Reset cache session IMPORTANT !
		unset($_SESSION['dedalo4']['config']['get_user_projects']);

		return parent::Save();
	}//end Save



	/**
	* PROPAGATE_FILTER
	* Catch calls to parent method
	*/
	public function propagate_filter() {
		# Nothing to do
		debug_log(__METHOD__." Invalid call !! ".to_string(), logger::ERROR);

		return null;
	}//end propagate_filter



	/**
	* GET AR PROYECTOS SECTION ID
	* Devuelve un array de section_id de los proyectos que usan las areas autorizadas (estado 2) al usuario actual
	* @return $ar_projects_final
	*	Array formated as id=>project_name  like: [250] => Proyecto de Historia Oral
	*//*
	protected function get_ar_proyectos_section__OLD() {

		$user_id 			= navigator::get_user_id();
		$ar_projects_final	= array();

		$logged_user_is_global_admin = (bool)security::is_global_admin( $user_id );

		if ($logged_user_is_global_admin===true) {
			# ALL PROJECTS
			$strQuery 	= "SELECT section_id FROM matrix_projects ORDER BY section_id ASC";
			$result		= JSON_RecordObj_matrix::search_free($strQuery);
			while ($rows = pg_fetch_assoc($result)) {
				$ar_proyectos_section_id[] = $rows['section_id'];
			}
			#dump($ar_proyectos_section_id, ' ar_proyectos_section_id');#die();
		}else{
			# ONLY PROJECTS THAT CURRENT USER HAVE AUTHORIZED
			$component_filter_master = component_common::get_instance('component_filter_master',
																	  DEDALO_FILTER_MASTER_TIPO,
																	  $user_id,
																	  'list',
																	  DEDALO_DATA_NOLAN,
																	  DEDALO_SECTION_USERS_TIPO);
				#dump($component_filter_master, ' component_filter_master');
			$dato = $component_filter_master->get_dato();
			if (empty($dato)) {
				$ar_proyectos_section_id = array();
			}else{
				$dato = $component_filter_master->get_dato();
				$ar_proyectos_section_id = array_keys($dato);
			}
		}

		if (empty($ar_proyectos_section_id)) {

			log_messages("Not projects found. Plese, create one before continue");
			return $ar_projects_final;
		}


		// Resolve projects names
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_PROJECTS_NAME_TIPO,true);
		foreach ($ar_proyectos_section_id as $current_section_id) {

			$component = component_common::get_instance($modelo_name,
														DEDALO_PROJECTS_NAME_TIPO,
														$current_section_id,
														'list',
														DEDALO_DATA_LANG,
														DEDALO_SECTION_PROJECTS_TIPO);
			$current_dato = $component->get_valor(0);
			// Fallback to application default lang
			if ( empty($current_dato) ) {
				$component = component_common::get_instance($modelo_name,
														DEDALO_PROJECTS_NAME_TIPO,
														$current_section_id,
														'list',
														DEDALO_APPLICATION_LANGS_DEFAULT,
														DEDALO_SECTION_PROJECTS_TIPO);
				$current_dato = "<mark>".$component->get_valor(0)."</mark>";
			}
			$ar_projects_final[$current_section_id] = (string)$current_dato;
		}

		return $ar_projects_final;
	}//end get_ar_proyectos_section */



	/**
	* UPDATE_DATO_VERSION
	* @return object $response
	*//*
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;


		$update_version = implode(".", $update_version);

		switch ($update_version) {
			case '4.9.0':

					# Compatibility old dedalo instalations
					# Old dato is and object (associative array for php)
					// Like {"1": 2}
					if (!empty($dato_unchanged)) {
						// Old format is received case
						$ar_locators = [];
						foreach ($dato_unchanged as $key => $value) {

							if (isset($value->section_id) && isset($value->section_tipo)) {
								# Updated dato (is locator)
								$filter_locator = $value;

							}else{
								# Old dato Like {"1": 2}
								$filter_locator = new locator();
									$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
									$filter_locator->set_section_id($key);
									$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
									$filter_locator->set_from_component_tipo($options->tipo);
							}
							# Add to clean array
							$ar_locators[] = $filter_locator;
						}
						# Replace old formatted value with new formatted array of locators
						$new_dato = $ar_locators;
						$response = new stdClass();
							$response->result   = 1;
							$response->new_dato = $new_dato;
							$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
						return $response;

					}else{

						debug_log(__METHOD__." No project found in $options->section_tipo - $options->tipo - $options->section_id ".to_string(), logger::DEBUG);
						$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
						return $response;
					}
				break;
		}
	}//end update_dato_version */



}//end class
