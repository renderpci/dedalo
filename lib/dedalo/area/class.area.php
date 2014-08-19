<?php

 class area extends common  {	

	# VARS
	protected $tipo;
	protected $lang;
	protected $modo;
	
	# STRUCTURE DATA
	protected $RecordObj_ts ;
	protected $modelo;
	protected $norden;
	protected $label;

	# CHILDREN AREAS CRITERION
	protected $ar_children_include_modelo_name;
	protected $ar_children_exclude_modelo_name;


	function __construct($tipo, $modo='list') {

		$this->define_tipo($tipo);		
		$this->define_lang(DEDALO_DATA_LANG);
		$this->define_modo($modo);

		$this->ar_children_include_modelo_name	= array('area','section');
		$this->ar_children_exclude_modelo_name	= array('login','tools','section_list','filter','component_security_areas');
		
		# common load tesauro data of current obj
		parent::load_structure_data();

		#dump($this,'this');
	}

	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }	



	/**
	* GET CHILDREN SECTION BY LOCATOR
	* Return only one (first) because is not deseable more than one same locator
	* @param $locator_required_name (string)
	* @return $section_tipo (terminoID like 'dd145')
	* @see logger_backend_activity
	*/
	/* UNUSED !
	public function get_children_section_by_locator($locator_required_name) {
	
		# Structure childrens (first level only) of current area
		$RecordObj_ts		= new RecordObj_ts($this->tipo);				
		$ar_ts_childrens	= $RecordObj_ts->get_ar_childrens_of_this();		
			
		foreach ($ar_ts_childrens as $children_terminoID) {				
			
			$children_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($children_terminoID);
			
			# Test if modelo name is acepted or not (more restrictive)
			if( $children_modelo_name=='section' ) {

				# Is section
				$section_tipo = $children_terminoID;
				
				# Verify related locator of current section			
				$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($section_tipo, $cache=false, $simple=true);

				foreach ($ar_terminos_relacionados as $termino_relacionado) {

					$related_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($termino_relacionado);
					
					if ($related_modelo_name=='locator') {
						# Is locator
						$locator_name = RecordObj_ts::get_termino_by_tipo($termino_relacionado);
						if ($locator_name==$locator_required_name) {
							# Is locator required by name (locator_required_name)
							# Return only one (first) because is not deseable more than one same locator
							return $section_tipo;
						}
					}
				}		
			}

		}#end foreach
		
		return NULL;		
	}
	*/


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
			#dump($ar_ts_children_all_areas_plain,'ar_ts_children_all_areas_plain');

		return $ar_ts_children_all_areas_plain;	
	}



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

		#if(SHOW_DEBUG) $start_time = start_time();

		# AREA_ROOT
		$current_tipo 					= RecordObj_ts::get_ar_terminoID_by_modelo_name('area_root')[0];
		$area_root 						= new area_root($current_tipo);
		$ar_ts_childrens_root 			= $area_root->get_ar_ts_children_areas($include_main_tipo);

		# AREA_ACTIVITY
		$current_tipo 					= RecordObj_ts::get_ar_terminoID_by_modelo_name('area_activity')[0];
		$area_activity 					= new area_activity($current_tipo);
		$ar_ts_childrens_activity 		= $area_activity->get_ar_ts_children_areas($include_main_tipo);

		# AREA_RESOURCE
		$current_tipo 					= RecordObj_ts::get_ar_terminoID_by_modelo_name('area_publication')[0];
		$area_publication 				= new area_publication($current_tipo);
		$ar_ts_childrens_publication 	= $area_publication->get_ar_ts_children_areas($include_main_tipo);
		
		# AREA_RESOURCE
		$current_tipo 					= RecordObj_ts::get_ar_terminoID_by_modelo_name('area_resource')[0];
		$area_resource 					= new area_resource($current_tipo);
		$ar_ts_childrens_resource 		= $area_resource->get_ar_ts_children_areas($include_main_tipo);

		# AREA_ADMIN
		$current_tipo 					= RecordObj_ts::get_ar_terminoID_by_modelo_name('area_admin')[0];
		$area_admin 					= new area_admin($current_tipo);
		$ar_ts_childrens_admin 			= $area_admin->get_ar_ts_children_areas($include_main_tipo);

		$ar_all = array_merge($ar_ts_childrens_root, $ar_ts_childrens_activity, $ar_ts_childrens_publication, $ar_ts_childrens_resource, $ar_ts_childrens_admin);
			#dump($ar_all,'ar_all');

		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__,   array_keys($ar_all) );

		return $ar_all;	
	}



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

		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_ts_children_areas = self::get_ar_ts_children_areas_recursive($terminoID, $include_main_tipo);

		# Añadimos el propio termino como padre del arbol
		if($include_main_tipo==true)
		$ar_ts_children_areas = array($terminoID => $ar_ts_children_areas);

		# STORE CACHE DATA
		$ar_ts_children_areas_cache[$id_unic] = $ar_ts_children_areas;
			#dump($ar_ts_children_areas,'ar_ts_children_areas',"array recursive terminoID:$terminoID , include_main_tipo: var_export($include_main_tipo, true); ");

		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_ts_children_areas );

		return $ar_ts_children_areas ;
	}

	


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
		
		$ar_current 		= array();
		$RecordObj_ts		= new RecordObj_ts($terminoID);				
		$ar_ts_childrens	= $RecordObj_ts->get_ar_childrens_of_this(); 
		
		if (count($ar_ts_childrens)>0) {
			
			foreach ($ar_ts_childrens as $children_terminoID) {
				
				$RecordObj_ts	= new RecordObj_ts($children_terminoID);
				$modeloID		= $RecordObj_ts->get_modelo($children_terminoID);
				$modelo			= RecordObj_ts::get_termino_by_tipo($modeloID);

				$visible	= $RecordObj_ts->get_visible();
					#dump($usableIndex,'$usableIndex',"children_terminoID: $children_terminoID");

				# Test if modelo name is acepted or not (more restrictive)
				if( $visible != 'no' && in_array($modelo, $this->ar_children_include_modelo_name) && !in_array($modelo, $this->ar_children_exclude_modelo_name) ) {
								
					$ar_temp = $this->get_ar_ts_children_areas_recursive($children_terminoID);
			
					#if(count($ar_ts_childrens)>0)
					$ar_current[$children_terminoID] = $ar_temp;
				}

			}#end foreach
			
			#dump($ar_current,'ar_ts_children_areas',"array recursive pass:$terminoID ");
			
			return $ar_current;
		}
		
		return NULL;
	}


	protected function get_ar_ts_children() {	
		
		$ar_current 		= array();
		$RecordObj_ts		= new RecordObj_ts($this->tipo);				
		$ar_ts_childrens	= $RecordObj_ts->get_ar_childrens_of_this(); 
		
		if (count($ar_ts_childrens)>0) {
			
			foreach ($ar_ts_childrens as $children_terminoID) {
				
				$RecordObj_ts	= new RecordObj_ts($children_terminoID);
				$modeloID		= $RecordObj_ts->get_modelo($children_terminoID);
				$modelo_name	= RecordObj_ts::get_termino_by_tipo($modeloID);

				$visible	= $RecordObj_ts->get_visible();
					#dump($usableIndex,'$usableIndex',"children_terminoID: $children_terminoID");

				# Test if modelo name is acepted or not (more restrictive)
				if( $visible != 'no' ) {

					switch ($modelo_name) {
						case (strpos($modelo_name, 'button_')!==false) :

								$current_obj = new $modelo_name($children_terminoID, $target=NULL);
								$current_obj->set_context_tipo($this->tipo);
								$ar_current[$children_terminoID] = $current_obj;
								break;
					}
											
					#if(count($ar_ts_childrens)>0)
					
				}

			}#end foreach
			
			//dump($ar_current,'ar_ts_children_areas',"array recursive pass:$terminoID ");
			
			return $ar_current;
		}
		
		return NULL;
	}
	




	
}
?>