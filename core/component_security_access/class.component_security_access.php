<?php
/*
* CLASS COMPONENT SECURITY ACCESS
* Manages ontology elements access and permissions
*
*/
class component_security_access extends component_common {


	public $datalist;



	/**
	* GET DATO
	* @return array $dato
	* Format [{"tipo":"dd21","parent":"dd20","value":3}]
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		if (!is_array($dato) && empty($dato)) {
			$dato = [];
		}

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param array $dato
	*/
	public function set_dato($dato) {

		if (!is_array($dato)) {
			if(empty($dato)) {
				$dato = [];
			}else{
				$dato = (array)$dato;
			}
		}

		return parent::set_dato($dato);
	}//end set_dato



	/**
	* GET_DATALIST
	* @return array $datalist
	*/
	public function get_datalist($user_id=null) : array {
		$start_time = start_time();

		// already resolved in current instance
			if (isset($this->datalist)) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." Return already set datalist ".count($this->datalist), logger::DEBUG);
				}
				return $this->datalist;
			}

		// cache datalist from session
			// if (isset($_SESSION['dedalo']['component_security_access']['datalist'][DEDALO_APPLICATION_LANG])) {
			// 	if(SHOW_DEBUG===true) {
			// 		$total = count($_SESSION['dedalo']['component_security_access']['datalist'][DEDALO_APPLICATION_LANG]);
			// 		debug_log(
			// 			__METHOD__." Return already in session datalist ".$total,
			// 			logger::DEBUG
			// 		);
			// 	}
			// 	return $_SESSION['dedalo']['component_security_access']['datalist'][DEDALO_APPLICATION_LANG];
			// }

		// cache from file. This file is generated in background on every user login
			$contents = dd_cache::cache_from_file((object)[
				'file_name' => navigator::get_user_id() . '.cache_tree.json'
			]);
			$datalist = (!empty($contents))
				? json_decode($contents)
				: null;
			if (!empty($datalist)) {
				$this->datalist = $datalist;
				$total = exec_time_unit($start_time,'ms').' ms';
				debug_log(
					__METHOD__." Return already calculated and cached in file datalist. Total items: ". count($datalist).' in time: '.$total,
					logger::DEBUG
				);
				return $datalist;
			}

		// short vars
			$user_id			= $user_id ?? navigator::get_user_id();
			$is_global_admin	= security::is_global_admin($user_id);
			$ar_areas			= [];

		// areas (including sections)
			if($user_id===DEDALO_SUPERUSER || $is_global_admin===true){

				// full areas and sections list
				$ar_areas = area::get_areas();

			}else{

				// only areas and sections already included into the dato
				$dato = $this->get_dato();

				$ar_permisions_areas = array_filter($dato, function($item) {
					return (isset($item->type) && $item->type==='area') ? $item : null;
				});

				foreach ($ar_permisions_areas as $item) {
					$ar_areas[]	= ontology::tipo_to_json_item($item->tipo);
				}
			}

		// datalist. resolve section (real and virtual) components
			$datalist = [];
			$ar_areas_length = sizeof($ar_areas);
			for ($i=0; $i < $ar_areas_length ; $i++) {

				$current_area = $ar_areas[$i];
				$section_tipo = $current_area->tipo; // same as tipo

				// area could be area, area_thesaurus, section, ...
					$datalist[] = (object)[
						'tipo'			=> $current_area->tipo,
						'section_tipo'	=> $section_tipo,
						'model'			=> $current_area->model,
						'label'			=> $current_area->label,
						'parent'		=> $current_area->parent
					];

				// section case
					if ($current_area->model==='section') {

						// recursive calculated children area added too
						$children_recursive = ontology::get_children_recursive($current_area->tipo);
						foreach ($children_recursive as $current_child) {

							$datalist[] = (object)[
								'tipo'			=> $current_child->tipo,
								'section_tipo'	=> $section_tipo,
								'model'			=> $current_child->model,
								'label'			=> $current_child->label,
								'parent'		=> $current_child->parent
							];
						}
					}
			}//end for ($i=0; $i < $ar_areas_length ; $i++)

		// fix value
			$this->datalist = $datalist;

		// cache session. Store in session for speed
			// $_SESSION['dedalo']['component_security_access']['datalist'][DEDALO_APPLICATION_LANG] = $datalist;

		// debug
			debug_log(
				__METHOD__.' Calculated datalist (total: '.count($datalist).') in  '.exec_time_unit($start_time,'ms').' ms',
				logger::DEBUG
			);


		return $datalist;
	}//end get_datalist



	/**
	* GET ARRAY TIPO ADMIN
	* Devulve el área 'Admin' además de sus hijos
	* (usado para excluirles las opciones admin en el arbol)
	* @return array $ar_tipo_admin
	*/
	public static function get_ar_tipo_admin() : array {

		# STATIC CACHE
		static $ar_tipo_admin;
		if(isset($ar_tipo_admin)) return $ar_tipo_admin;

		$ar_result 	= RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='area_admin', $prefijo='dd');
		$ar_tesauro = array();

		if(!empty($ar_result[0])) {
			$tipo					= $ar_result[0];
			$obj					= new RecordObj_dd($tipo);
			$ar_childrens_of_this	= $obj->get_ar_childrens_of_this();
			$ar_tesauro				= $ar_childrens_of_this;
		}
		# Añadimos el propio termino como padre del arbol
		#array_push($ar_tesauro, $tipo);
		array_unshift($ar_tesauro, $tipo);

		# STORE CACHE DATA
		$ar_tipo_admin = $ar_tesauro ;

		return $ar_tesauro ;
	}//end get_ar_tipo_admin



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.0.0':

				// old dato: {"oh1":{"oh2":2}}
				// new dato :[{"tipo":"oh2","section_tipo":"oh1","value":2}]

				if(!empty($dato_unchanged) && is_object($dato_unchanged)) {

					$new_dato = [];
					foreach ($dato_unchanged as $current_parent => $current_ar_tipo) {
						foreach ($current_ar_tipo as $current_tipo => $value) {
							$current_dato = new stdClass();
								$current_dato->tipo			= $current_tipo;
								$current_dato->section_tipo	= $current_parent;
								$current_dato->value		= intval($value);
							// add
							$new_dato[] = $current_dato;
						}
					}

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{
					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* CALCULATE_TREE
	* @return object $response
	*/
	public static function calculate_tree( $user_id ) : array {

		// profile_section_id
			if($user_id===DEDALO_SUPERUSER || security::is_global_admin($user_id)===true){

				$section_id = null;
				// dump($section_id, ' IM ROOT  -section_id ++ '.to_string($is_global_admin));

			}else{

				$user_profile_locator = security::get_user_profile( $user_id );
				if (!empty($user_profile_locator)) {
					$section_id = (int)$user_profile_locator->section_id;
				}else{
					debug_log(__METHOD__." ERROR on get user_profile_locator: user_id: ".to_string($user_id), logger::ERROR);
				}
			}

		// $fiber = new Fiber(function() use($section_id) : void {
		// $fiber = new Fiber(function() use($section_id) : array {
			debug_log(__METHOD__." (1) user_id: " .$user_id." launching datalist ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// ".to_string(), logger::ERROR);

			$section_tipo				= DEDALO_SECTION_PROFILES_TIPO;
			$tipo						= DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO;
			$model						= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component_security_access	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string|null section_id
				'list', // string modo
				DEDALO_DATA_LANG, // string lang
				$section_tipo // string section_tipo
			);
			$datalist = $component_security_access->get_datalist( $user_id );
				// dump($datalist, ' datalist +++++++++++++++99999+++++88888+++++ '.to_string($tipo));


			// Fiber::suspend();
			debug_log(__METHOD__." (2) count: " . count($datalist) . " launching datalist ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// ".to_string(), logger::ERROR);

			return $datalist;
		// });
		// $fiber->start(); // running a Fiber
		// var_dump($fiber->getReturn());

		// return $fiber;
	}//end calculate_tree



}//end class component_security_access
