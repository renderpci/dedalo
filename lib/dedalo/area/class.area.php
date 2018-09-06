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

	# CHILDREN AREAS CRITERION
	protected $ar_children_include_modelo_name;
	protected $ar_children_exclude_modelo_name;

	static $ar_ts_children_all_areas_hierarchized;


	function __construct($tipo, $modo='list') {

		$this->define_tipo($tipo);		
		$this->define_lang(DEDALO_DATA_LANG);
		$this->define_modo($modo);

		$this->ar_children_include_modelo_name	= array('area','section','section_tool');
		$this->ar_children_exclude_modelo_name	= array('login','tools','section_list','filter','component_security_areas');
		
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
	* GET ARRAY TS CHILDREN PLAIN OF ALL AREAS
	* Get ar_ts_children_all_areas_hierarchized and flat keys in one array
	* @param $include_main_tipo
	*	bool(true) Optional default true
	* @see component_security_access - Get all major areas 
	*/
	public static function get_ar_ts_children_all_areas_plain($include_main_tipo=true) {

		# First retrieve hierarchized list
		$ar_ts_children_all_areas_hierarchized = area::get_ar_ts_children_all_areas_hierarchized($include_main_tipo);

		# Get all keys recursive to optain a plain array
		$ar_ts_children_all_areas_plain = array_keys_recursive($ar_ts_children_all_areas_hierarchized);	

		return $ar_ts_children_all_areas_plain;	
	}//end get_ar_ts_children_all_areas_plain



	/**
	* GET ARRAY TS CHILDREN HIERARCHIZED OF ALL MAJOR AREAS
	* Iterate all major existing area tipes (area_root,area_resource,area_admin)
	* and get hierarchycally tipos of every one mixed in one full array calling 
	* this->get_ar_ts_children_areas secuentialment
	* Used in menu
	* @param $include_main_tipo
	*	bool(true) Optional default true
	* @see menu
	*/
	public static function get_ar_ts_children_all_areas_hierarchized($include_main_tipo=true) {
		gc_disable();
		
		if(SHOW_DEBUG===true) $start_time=microtime(1);
		

		if (isset($_SESSION['dedalo4']['config']['ar_ts_children_all_areas_hierarchized']) ) {
			if(SHOW_DEBUG===true) {
				#return $_SESSION['dedalo4']['config']['ar_ts_children_all_areas_hierarchized'];
			}else{
				
			}
			return $_SESSION['dedalo4']['config']['ar_ts_children_all_areas_hierarchized'];		
		}

		# AREA_ROOT
		$current_tipo 						= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_root')[0];
		$area_root 							= new area_root($current_tipo);
		$ar_ts_childrens_root 				= $area_root->get_ar_ts_children_areas($include_main_tipo);

		# AREA_ACTIVITY
		$ar_ts_childrens_activity=array();
		$ar_area_activity 					= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_activity');
		if (isset($ar_area_activity[0])) {
			$current_tipo 					= $ar_area_activity[0];
			$area_activity 					= new area_activity($current_tipo);
			$ar_ts_childrens_activity 		= $area_activity->get_ar_ts_children_areas($include_main_tipo);
		}		

		# AREA_PUBLICATION
		$ar_ts_childrens_publication=array();
		$ar_area_publication 				= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_publication');
		if (isset($ar_area_publication[0])) {
			$current_tipo 				 	= $ar_area_publication[0];
			$area_publication 			 	= new area_publication($current_tipo);
			$ar_ts_childrens_publication 	= $area_publication->get_ar_ts_children_areas($include_main_tipo);
		}		
		
		# AREA_RESOURCE
		$current_tipo 						= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_resource')[0];
		$area_resource 						= new area_resource($current_tipo);
		$ar_ts_childrens_resource 			= $area_resource->get_ar_ts_children_areas($include_main_tipo);

		# AREA_TOOLS
		if (isset(RecordObj_dd::get_ar_terminoID_by_modelo_name('area_tool')[0])) {
			$current_tipo 					= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_tool')[0];
			$area_tool 						= new area_tool($current_tipo);
			$ar_ts_childrens_tools 			= $area_tool->get_ar_ts_children_areas($include_main_tipo);
		}else{
			$ar_ts_childrens_tools = array();
		}

		# AREA_THESAURUS
		if (isset(RecordObj_dd::get_ar_terminoID_by_modelo_name('area_thesaurus')[0])) {
			$current_tipo 					= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_thesaurus')[0];
			$area_thesaurus 				= new area_thesaurus($current_tipo);
			$ar_ts_childrens_thesaurus 		= $area_thesaurus->get_ar_ts_children_areas($include_main_tipo);
		}else{
			$ar_ts_childrens_thesaurus 		= array();
		}	

		# AREA_ADMIN
		$current_tipo 						= RecordObj_dd::get_ar_terminoID_by_modelo_name('area_admin')[0];
		$area_admin 						= new area_admin($current_tipo);
		$ar_ts_childrens_admin 				= $area_admin->get_ar_ts_children_areas($include_main_tipo);

		
		# ar_all merged
		$ar_all = array_merge($ar_ts_childrens_root, $ar_ts_childrens_activity, $ar_ts_childrens_publication, $ar_ts_childrens_resource, $ar_ts_childrens_tools, $ar_ts_childrens_thesaurus, $ar_ts_childrens_admin);

		#
		# ALLOW DENY AREAS
		if (SHOW_DEBUG===true) { //  || SHOW_DEVELOPER===true
			# All elements are accepted
		}else{
			# Remove not accepted elements
			
		}
		# Remove always for clarity	
		$ar_all = area::walk_recursive_remove($ar_all, 'area::area_to_remove');


		# Store in session for speed
		$_SESSION['dedalo4']['config']['ar_ts_children_all_areas_hierarchized'] = $ar_all;


		if(SHOW_DEBUG===true) {
			$total 	= round(microtime(1)-$start_time,3);
			$n 		= count($ar_all);
			debug_log(__METHOD__." Total ($n): ".exec_time_unit($start_time,'ms')." ms - ratio(total/n): " . ($total/$n), logger::DEBUG);			
		}

		 gc_enable();

		return $ar_all;
	}//end get_ar_ts_children_all_areas_hierarchized



	/**
	* AREA_TO_REMOVE
	* @return bool 
	*/
	public static function area_to_remove($tipo) {

		if( !include(DEDALO_LIB_BASE_PATH . '/config/config4_areas.php') ) {
			debug_log(__METHOD__." ERROR ON LOAD FILE config4_areas . Using empy values as default ".to_string(), logger::ERROR);
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. config4_areas file not found", 1);;
			}			

			$areas_deny  = array();
			$areas_allow = array();
		}		

		if ( true===in_array($tipo, $areas_deny) && false===in_array($tipo, $areas_allow) ) {			
			return true;
		}

		return false;
	}//end area_to_remove



	/** 
	* http://uk1.php.net/array_walk_recursive implementation that is used to remove nodes from the array. 
	* array_walk_recursive itself cannot unset values. Even though you can pass array by reference, unsetting the value in 
	* the callback will only unset the variable in that scope. 
	* @param array The input array. 
	* @param callable $callback Function must return boolean value indicating whether to remove the node. 
	* @return array 
	*/ 
	public static function walk_recursive_remove(array $array, callable $callback) {

	    foreach ($array as $k => $v) {
	    	
	    	#$to_remove = $callback($k); 
	    	$to_remove = area::area_to_remove($k);      		
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