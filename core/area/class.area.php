<?php
/**
* AREA
*
*
*/
class area extends common  {

	# VARS
	protected $tipo;
	protected $lang;
	protected $modo;

	# STRUCTURE DATA
	protected $RecordObj_dd ;
	protected $modelo;
	protected $norden;
	protected $label;

	static $ar_ts_children_all_areas_hierarchized;

	# CHILDREN AREAS CRITERION
	static $ar_children_include_modelo_name = array('area','section','section_tool');
	static $ar_children_exclude_modelo_name	= array('login','tools','section_list','filter');


	function __construct($tipo, $modo='list') {

		$this->define_tipo($tipo);
		$this->define_lang(DEDALO_DATA_LANG);
		$this->define_modo($modo);


		# common load tesauro data of current obj
		parent::load_structure_data();

		return true;
	}//end __construct

	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }


	/**
	* GET AREAS RECURSIVE IN JSON FORMAT OF ALL MAJOR AREAS
	* Iterate all major existing area tipes (area_root,area_resource,area_admin, ...)
	* and get all tipos of every one mixed in one full ontology json array
	* Used in menu and security access
	* @see menu, component_security_access
	*/
	public static function get_areas() {

		//gc_disable();

		//if(SHOW_DEBUG===true) $start_time=microtime(1);

		// if the session has the all_areas return it for speed
		if (isset($_SESSION['dedalo']['ontology']['all_areas'])) {
			return $_SESSION['dedalo']['ontology']['all_areas'];
		}

		// get the config_areas file to allow and denny some especific areas defined by installation.
		$config_areas = self::get_config_areas();

		$ar_root_areas = [];
		// ROOT_AREAS
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_root')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_activity')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_publication')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_resource')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_tool')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_thesaurus')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_admin')[0];
			$ar_root_areas[]	= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_development')[0];

			$areas = [];
			foreach ($ar_root_areas as $area_tipo) {

				// remove the areas_deny
				if(in_array($area_tipo, $config_areas->areas_deny)) continue;
				// get the JSON format of the ontology
				$areas[]		= ontology::tipo_to_json_item($area_tipo,[
					'tipo' 			=> true,
					'tld'			=> false,
					'is_model'		=> false,
					'model'			=> true,
					'model_tipo'	=> false,
					'parent'		=> true,
					'order'			=> true,
					'translatable'	=> false,
					'properties'	=> false,
					'relations'		=> false,
					'descriptors'	=> false,
					'label'			=> true]);
				// get the all children areas and sections of current
				$ar_group_areas	= self::get_ar_children_areas_recursive($area_tipo);
				// get the JSON format of the ontology for all childrens
				foreach ($ar_group_areas as $children_area) {
					$areas[]	= ontology::tipo_to_json_item($children_area,[
					'tipo' 			=> true,
					'tld'			=> false,
					'is_model'		=> false,
					'model'			=> true,
					'model_tipo'	=> false,
					'parent'		=> true,
					'order'			=> true,
					'translatable'	=> false,
					'properties'	=> false,
					'relations'		=> false,
					'descriptors'	=> false,
					'label'			=> true]);
				}
			}

		# Store in session for speed
		$_SESSION['dedalo']['ontology']['all_areas'] = $areas;


		// if(SHOW_DEBUG===true) {
		// 	$total 	= round(microtime(1)-$start_time,3);
		// 	$n 		= count($areas);
		// 	debug_log(__METHOD__." Total ($n): ".exec_time_unit($start_time,'ms')." ms - ratio(total/n): " . ($total/$n), logger::DEBUG);
		// }

		 //gc_enable();

		return $areas;

	}//end get_areas


	/**
	* GET AR CHILDREN AREAS RECURSIVE
	* Get all children areas (and sections) of current area (example: area_root)
	* Look structure tesauro for find childrens with valid model name
	* @param $terminoID
	*	tipo recursive. Firt tipo is null
	* @return $ar_ts_children_areas
	*	array recursive of tesauro structure childrens filtered by acepted model name
	* @see get_ar_ts_children_areas
	*/
	protected static function get_ar_children_areas_recursive($terminoID) {

		$ar_children_areas_recursive	= [];
		$RecordObj_dd					= new RecordObj_dd($terminoID);
		$ar_ts_childrens				= $RecordObj_dd->get_ar_childrens_of_this();

		if (count($ar_ts_childrens)>0) {

			foreach ($ar_ts_childrens as $children_terminoID) {

				$RecordObj_dd	= new RecordObj_dd($children_terminoID);
				$modelo 		= RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);
				$visible		= $RecordObj_dd->get_visible();

				# Test if modelo name is accepted or not (more restrictive)
				if( $visible!=='no' && in_array($modelo, area::$ar_children_include_modelo_name) && !in_array($modelo, area::$ar_children_exclude_modelo_name) ) {

					$ar_children_areas_recursive[] = $children_terminoID;
						//
					$ar_temp = self::get_ar_children_areas_recursive($children_terminoID);

					#if(count($ar_ts_childrens)>0)
					$ar_children_areas_recursive = array_merge($ar_children_areas_recursive, $ar_temp);
				}

			}#end foreach
		}

		return $ar_children_areas_recursive;
	}//end get_ar_children_areas_recursive



	/**
	* AREA_TO_REMOVE
	* @return bool
	*/
	public static function get_config_areas() {

		if( !include(DEDALO_CONFIG_PATH . '/config_areas.php') ) {
			debug_log(__METHOD__." ERROR ON LOAD FILE config4_areas . Using empy values as default ".to_string(), logger::ERROR);
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. config4_areas file not found", 1);;
			}

			$areas_deny  = array();
			$areas_allow = array();
		}

		$config_areas = new stdClass();
			$config_areas->areas_deny	= $areas_deny;
			$config_areas->areas_allow	= $areas_allow;

		return $config_areas;
	}//end area_to_remove







	//////////// OLD WORLD ////////////////





	

	/**
	* http://uk1.php.net/array_walk_recursive implementation that is used to remove nodes from the array.
	* array_walk_recursive itself cannot unset values. Even though you can pass array by reference, unsetting the value in
	* the callback will only unset the variable in that scope.
	* @param array The input array.
	* @param callable $callback Function must return boolean value indicating whether to remove the node.
	* @return array
	*/
	public static function walk_recursive_remove(array $array, callable $callback) {

		$user_id = (int)$_SESSION['dedalo4']['auth']['user_id'];

	    foreach ($array as $k => $v) {

	    	if (SHOW_DEBUG===true && $user_id===DEDALO_SUPERUSER ) {
	    		$to_remove = false;
	    	}else{
	    		$to_remove = area::area_to_remove($k);
	    	}

            if ($to_remove===true) {
                unset($array[$k]);
            }else if(is_array($v)) {
            	$array[$k] = area::walk_recursive_remove($v, $callback);
            }
	    }

	    return $array;
	}//end walk_recursive_remove



	/**
	* GET AR TS CHILDREN AREAS
	* Intermediate method for cache and easy use.
	* @see protected function get_ar_ts_children_areas_recursive($terminoID, $include_main_tipo=true)
	* Calculate current area tipo an call recursive protected function get_ar_ts_children_areas_recursive
	* to obtain hierarchycally the estructure children of current area component (example: area_root)
	* Method common for all area objects (area_root, area_resource, area_admin)
	* @param $include_main_tipo
	*	bool(true) default true. Case 'false', current tipo is omited as parent in results
	* @see menu
	*/
	public function get_ar_ts_children_areas($include_main_tipo=true) {

		$terminoID = $this->get_tipo();
		if(empty($terminoID)) throw new Exception("Error Processing Request: terminoID is empty !", 1);

		# STATIC CACHE
		static $ar_ts_children_areas_cache;
		$id_unic = $terminoID . '-'. intval($include_main_tipo) . '-' . DEDALO_DATA_LANG; #dump($id_unic);
		if(isset($ar_ts_children_areas_cache[$id_unic])) return $ar_ts_children_areas_cache[$id_unic];

		$ar_ts_children_areas = self::get_ar_ts_children_areas_recursive($terminoID, $include_main_tipo);

		# Añadimos el propio termino como padre del arbol
		if($include_main_tipo===true)
		$ar_ts_children_areas = array($terminoID => $ar_ts_children_areas);

		# STORE CACHE DATA
		$ar_ts_children_areas_cache[$id_unic] = $ar_ts_children_areas;


		return $ar_ts_children_areas ;
	}//end get_ar_ts_children_areas



	/**
	* GET AR TS CHILDREN AREAS RECURSIVE
	* Get all children areas (and sections) of current area (example: area_root)
	* Look structure tesauro for find childrens with valid model name
	* @param $terminoID
	*	tipo recursive. Firt tipo is null
	* @return $ar_ts_children_areas
	*	array recursive of tesauro structure childrens filtered by acepted model name
	* @see get_ar_ts_children_areas
	*/
	protected function get_ar_ts_children_areas_recursive($terminoID) {

		$ar_ts_children_areas_recursive = array();
		$RecordObj_dd					= new RecordObj_dd($terminoID);
		$ar_ts_childrens				= $RecordObj_dd->get_ar_childrens_of_this();

		if (count($ar_ts_childrens)>0) {

			foreach ($ar_ts_childrens as $children_terminoID) {

				$RecordObj_dd	= new RecordObj_dd($children_terminoID);
				$modelo 		= RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);
				$visible		= $RecordObj_dd->get_visible();

				# Test if modelo name is accepted or not (more restrictive)
				if( $visible!=='no' && in_array($modelo, $this->ar_children_include_modelo_name) && !in_array($modelo, $this->ar_children_exclude_modelo_name) ) {

					$ar_temp = $this->get_ar_ts_children_areas_recursive($children_terminoID);

					#if(count($ar_ts_childrens)>0)
					$ar_ts_children_areas_recursive[$children_terminoID] = $ar_temp;
				}

			}#end foreach

			return $ar_ts_children_areas_recursive;
		}

		return $ar_ts_children_areas_recursive;
	}//end get_ar_ts_children_areas_recursive



}
?>
