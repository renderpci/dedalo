<?php
/*
* CLASS COMPONENT SECURITY ACCESS
* Manages
*
*/
class component_security_access extends component_common {


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	protected $caller_id;
	
	
	/**
	* CONSTRUCT
	*/
	function __construct($tipo=false, $parent=null, $modo='edit',  $lang=null, $section_tipo=null) {	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)

		parent::__construct($tipo, $parent, $modo, $lang=$this->lang, $section_tipo);

		# caller_id from parent var (default)
		if(!empty($parent)) {
			$this->caller_id = $parent;
		}
		#dump($id,'id');	#throw new Exception("component_security_access Request", 1);
		# caller_id is set in main to this obj from request 'caller_id' (is id section parent of current component)
	}



	/**
	* GET DATO 
	* @return object $dato
	* Format {"dd244":"2"}
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		if (!is_object($dato) && empty($dato)) {
			$dato = new stdClass();
		}

		return (object)$dato;
	}



	/**
	* SET_DATO
	* @param object $dato
	*/
	public function set_dato($dato) {
		if (!is_object($dato)) {
			if(empty($dato)) {
				$dato = new stdClass();
			}else{
				$dato = (object)$dato;
			}
		}
		parent::set_dato((object)$dato);
	}
	


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		#
		# OJO: Este dato ($this->dato) es inyectado y lo pasa trigger component_common Save (NO es el dato existente en matrix)
		# lo asigna así: $component_obj->set_dato( $dato_clean ); 
		$dato = $this->dato;		
			if(SHOW_DEBUG===true) {
				#dump($dato, 'dato received to save (stopped script for debug)'); return null;
			}


		
		$this->set_dato( $dato ); // Incluiremos los dato '0' para preservar los cambios al propagar

		# A partir de aquí, salvamos de forma estándar
		$result = parent::Save();

		# reset session permisions table
		# unset($_SESSION['dedalo4']['auth']['permissions_table']);

			#dump($this->get_dato_unchanged(), ' this->get_dato_unchanged ++ '.to_string($this->dato));

		return $result;
	}//end Save



	# CLEAN_DATO_FOR_SAVE : Remove values zero like [dd710] => 0 to reduce saved data size
	private static function clean_dato_for_save($dato) {
		
		$clean_dato = new stdClass();
		
		foreach ((object)$dato as $element_tipo => $state) {
			$state = (int)$state;
			if ( $state>=1 ) {
				$clean_dato->$element_tipo = $state;
			}
		}
		return $clean_dato;
	}

	

	# GET_CALLER_ID
	public function get_caller_id() {
		return $this->caller_id ;
	}
	
	
	
	/**
	* GET USER AUTHORIZED AREAS
	* Get authorized areas (tipo) for current received user id
	* user_id is received as caller_id
	* Es una implementación a medida de los valores de areas autorizadas para este usuario
	* selecciona las que tienen estado 2 y elimina las pseudo-areas 'xxx-admin'
	* @see component_security_areas::get_ar_authorized_areas_for_user
	*/
	protected function get_user_authorized_areas() {

		if(SHOW_DEBUG===true) {
			#$start_time=microtime(1);
		}

		$user_id = self::get_caller_id();			
			
			/*
			# Verificamos que caller_id es llamado en el contexto 'Admin' es decir,
			# uno de los padres en estructura, es de tipo 'area_admin'

			$matrix_table = common::get_matrix_table_from_tipo($this->tipo);

			# Section
			$current_tipo = common::get_tipo_by_id($user_id, $matrix_table);			
				dump($current_tipo,"current_tipo");	

			if (empty($current_tipo))
				throw new Exception("get_user_authorized_areas: undefined 'tipo' for user:$user_id ", 1);
			*/

			/*
			$section_tipo 		= DEDALO_SECTION_USERS_TIPO;

			$RecordObj_dd 		= new RecordObj_dd($section_tipo);
			$ar_section_parents	= $RecordObj_dd->get_ar_parents_of_this($ksort=true);
				#dump($ar_section_parents,'ar_section_parents',"padres en estructura de $section_tipo ");

			$is_in_admin_context = false;
			foreach ($ar_section_parents as $parent_tipo) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($parent_tipo,true);
				if($modelo_name=='area_admin') {
					$is_in_admin_context = true;
					break;
				}
			}
			if($is_in_admin_context!==true) throw new Exception(" get_user_authorized_areas caller_id=$user_id is on NO Admin context (Not allowed)");
			*/
		# Get array of authorized areas for current user id
			//dump(DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO); die();
		$ar_authorized_areas_for_user = (array)component_security_areas::get_ar_authorized_areas_for_user($user_id, $mode_result='full', DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO, DEDALO_SECTION_USERS_TIPO);
			#dump($ar_authorized_areas_for_user,'ar_authorized_areas_for_user');
		
		# Gets something:
		# [dd321] => 2
	    # [dd294-admin] => 2
	    # [dd294] => 2	
	    # Clean the result to return an only areas array
	    $ar_areas = array();
	    foreach ($ar_authorized_areas_for_user as $tipo => $estado) {

	    	if ($tipo===DEDALO_SECTION_PROFILES_TIPO) continue; # Skip section profiles
	    
	    	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	    	if($estado>=2 && $modelo_name==='section'){			
	    		$ar_areas[] = $tipo ;
	    	}	    		
	    }//end foreach ($ar_authorized_areas_for_user as $tipo => $estado)
		
		return $ar_areas;
	}//end get_user_authorized_areas
	


	/**
	* GET_AR_TS_CHILDRENS_RECURSIVE . TS TREE FULL FROM PARENT
	* Le llegan los tipos de las secciones / areas y desglosa jeráquicamente sus section_group que luego
	* serán recorridos con el walk_ar_elements_recursive
	* @param string $terminoID
	* @return array $ar_tesauro
	*	array recursive of tesauro structure childrens
	*/
	public static function get_ar_ts_childrens_recursive($terminoID) {

		if(SHOW_DEBUG===true) {
			$start_time=microtime(1);
		}
		
		# STATIC CACHE
		static $ar_stat_data;
		$terminoID_source = $terminoID;		
		if(isset($ar_stat_data[$terminoID_source])) return $ar_stat_data[$terminoID_source];	
		
		$ar_current[$terminoID] = array();

		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($terminoID,true);
		switch ($modelo_name) {
			
			case 'section':

				$section_tipo 			 = $terminoID;
				$ar_modelo_name_required = array('section_group','section_tab','button_','relation_list','time_machine_list');

				# Real section
				//($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false)
				$ar_ts_childrens   = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, true, true, false, false);
				
				# Virtual section too is neccesary (buttons specifics)
				$ar_ts_childrens_v = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, true, false, false, false);
				$ar_ts_childrens = array_merge($ar_ts_childrens, $ar_ts_childrens_v);				
				break;
			
			default:
				# AREAS
				$RecordObj_dd	 = new RecordObj_dd($terminoID);
				$ar_ts_childrens = $RecordObj_dd->get_ar_childrens_of_this();				
				//if (count($ar_ts_childrens)<1) return array();				
				break;
		}
		

		$ar_exclude_modelo = array('component_security_administrator','section_list','search_list','semantic_node','box_elements','exclude_elements'); # ,'filter','tools'
		foreach((array)$ar_ts_childrens as $children_terminoID) {			
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);			
			foreach($ar_exclude_modelo as $exclude_modelo) {					
				if( strpos($modelo_name, $exclude_modelo)!==false ) {					
					continue 2;	
				}
			}		
			$ar_temp = self::get_ar_ts_childrens_recursive($children_terminoID);


			#
			# REMOVE_EXCLUDE_TERMS : CONFIG EXCLUDES
			# If instalation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove from ar_temp
			if (defined('DEDALO_AR_EXCLUDE_COMPONENTS')) {				
				$DEDALO_AR_EXCLUDE_COMPONENTS = unserialize(DEDALO_AR_EXCLUDE_COMPONENTS);
				foreach ($ar_temp as $current_key => $current_ar_value) {
					if (in_array($current_key, $DEDALO_AR_EXCLUDE_COMPONENTS)) {
						unset( $ar_temp[$current_key] );
						debug_log(__METHOD__." DEDALO_AR_EXCLUDE_COMPONENTS: Removed security access term $current_key ".to_string(), logger::DEBUG);
					}
				}								
			}
					
			$ar_current[$terminoID][$children_terminoID] = $ar_temp;	
		}
		
		$ar_tesauro[$terminoID] = $ar_current[$terminoID];
		
		# STORE CACHE DATA
		$ar_stat_data[$terminoID_source] = $ar_tesauro[$terminoID];

		if(SHOW_DEBUG===true) {
			$total=round(microtime(1)-$start_time,3);
			#debug_log(__METHOD__." ar_tesauro ($total) ".to_string($ar_tesauro), logger::DEBUG);				
		}
	
		return $ar_tesauro[$terminoID];		
	}//end get_ar_ts_childrens_recursive	



	/**
	* WALK TS CHILDRENS RECURSIVE . DEPLOY TS TREE FULL ARRAY
	*
	* @param array $ar_elements
	*	array of section childrens 
	* @param $arguments
	*	array of vars needed for construct final tree. default is empty array
	*
	* @return $tree_htm
	*	html final of builded tree
	*/
	public static function walk_ar_elements_recursive($ar_elements, $arguments=array()) {

		if(SHOW_DEBUG===true) {
			#$start_time=microtime(1);
		}	
		
		$dato 				= $arguments['dato'];
		$parent 			= $arguments['parent'];
		$dato_section_tipo 	= $arguments['dato_section_tipo'];	

		$open_group		= "<ul class=\"menu\">";
		$open_term		= "<li class=\"expanded\">";
		
		$close_term		= "</li>";
		$close_group	= "</ul>";


		$html_tree='';
		foreach((array)$ar_elements as $tipo => $value) {

			#if ($tipo=='mupreva21') {
			#	dump($dato->$dato_section_tipo->$tipo, ' $dato->$tipo ++ '.to_string());
			#}		
			
			$dato_current = isset($dato->$dato_section_tipo->$tipo) ? intval($dato->$dato_section_tipo->$tipo) : 0;

			# TERMINO (In current data lang with fallback)
			$termino	 = RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true);

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);		
			
				$html_tree	.= $open_term;

					$html_tree	.= "<a> ";
					$html_tree	.= component_security_access::create_radio($dato_current, $parent, $tipo, $dato_section_tipo);
					$html_tree	.= "<label>$termino</label>";
					if(SHOW_DEVELOPER===true) {
						$html_tree	.=" <span>[$tipo:<b>$dato_current</b> $modelo_name]</span>";
					}					
					$html_tree	.= "</a>";
					
					if(is_array($value)) {												
						$html_tree .= $open_group;
						$html_tree .= component_security_access::walk_ar_elements_recursive($value, $arguments);					
						$html_tree .= $close_group;							
					}
			
				$html_tree .= $close_term;

		}//end foreach((array)$ar_elements as $tipo => $value) {

		if(SHOW_DEBUG===true) {
			#$total=round(microtime(1)-$start_time,3); dump($total, 'total');	#dump($ar_authorized_areas_for_user, 'ar_authorized_areas_for_user');				
		}

		return (string)$html_tree;
	}//end walk_ar_elements_recursive	



	/**
	* CREATE RADIO BUTTON . USADO POR walk_ar_elements_recursive
	*/
	public static function create_radio($dato_current, $parent, $dato_tipo, $dato_section_tipo) {

		$lang 			= DEDALO_DATA_NOLAN;
		$section_tipo 	= DEDALO_SECTION_PROFILES_TIPO;
		$tipo 			= DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO;
		$name 			= $dato_section_tipo.'_'.$dato_tipo;
		$disabled 		= '';	
		$html 			= '';

		//if($dato_tipo=='rsc12') dump($dato_current, ' dato_current ++ '.$dato_section_tipo.' - '.to_string($dato_tipo));

		# OPTION 0  . NO ACCESS
		$checked = ($dato_current==0) ? 'checked="checked"' : '';
		$html .= "<input type=\"radio\" class=\"css_security_radio_button\" onchange=\"component_security_access.Save(this,event)\" ";
		$html .= "name=\"{$name}\" ";
		$html .= "data-tipo=\"{$tipo}\" ";
		$html .= "data-parent=\"{$parent}\" ";
		$html .= "data-lang=\"$lang\" ";
		$html .= "data-section_tipo=\"$section_tipo\" ";
		$html .= "data-dato_section_tipo=\"{$dato_section_tipo}\" ";
		$html .= "data-dato_tipo=\"{$dato_tipo}\" ";
		$html .= "value=\"0\" ";
		$html .= "title=\"No access\" ";
		$html .= "{$checked} {$disabled}/>";
		$html .= "<span class=\"span_property\">X</span>";
		
		# OPTION 1 . READ ONLY
		$checked = ($dato_current==1) ? 'checked="checked"' : '';
		$html .= "<input type=\"radio\" class=\"css_security_radio_button\" onchange=\"component_security_access.Save(this,event)\" ";
		$html .= "name=\"{$name}\" ";
		$html .= "data-tipo=\"{$tipo}\" ";
		$html .= "data-parent=\"{$parent}\" ";
		$html .= "data-lang=\"$lang\" ";
		$html .= "data-section_tipo=\"$section_tipo\" ";
		$html .= "data-dato_section_tipo=\"{$dato_section_tipo}\" ";
		$html .= "data-dato_tipo=\"{$dato_tipo}\" ";
		$html .= "value=\"1\" ";
		$html .= "title=\"Read only\" ";
		$html .= "{$checked} {$disabled}/>";
		$html .= "<span class=\"span_property\">R</span>";
		
		# OPTION 2 . READ AND WRITE
		$checked = ($dato_current==2) ? 'checked="checked"' : '';
		$html .= "<input type=\"radio\" class=\"css_security_radio_button\" onchange=\"component_security_access.Save(this,event)\" ";
		$html .= "name=\"{$name}\" ";
		$html .= "data-tipo=\"{$tipo}\" ";
		$html .= "data-parent=\"{$parent}\" ";
		$html .= "data-lang=\"$lang\" ";
		$html .= "data-section_tipo=\"$section_tipo\" ";
		$html .= "data-dato_section_tipo=\"{$dato_section_tipo}\" ";
		$html .= "data-dato_tipo=\"{$dato_tipo}\" ";
		$html .= "value=\"2\" ";
		$html .= "title=\"Read and write\" ";
		$html .= "{$checked} {$disabled}/>";
		$html .= "<span class=\"span_property\">RW</span>";
		
		return $html;
	}//end create_radio



	/**
	* PROPAGATE_AREAS_TO_ACCESS
	* @param object $areas_to_save
	*	Contains mixed area an section tipos without suffix -admin
	* @return bool
	*/
	public static function propagate_areas_to_access_DES($areas_to_save, $parent) {

		if (!is_object($areas_to_save)) {
			trigger_error("Sorry, only objects are accepted as 'areas_to_save' [propagate_areas_to_access]");
			return false;
		}

		// COMPONENT_SECURITY_ACCESS
		$component_security_access = component_common::get_instance('component_security_access',
																	DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
																	$parent,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	DEDALO_SECTION_PROFILES_TIPO);
		$security_access_dato = (object)$component_security_access->get_dato();		


		// REMOVE ACCESS VARS WHEN NOT IN RECEIVED AREAS	
		$rm=0;
		foreach ($security_access_dato as $section_tipo => $elements) {
			
			if (!isset($areas_to_save->$section_tipo)) {
				unset($security_access_dato->$section_tipo);
				debug_log(__METHOD__." Removed $section_tipo from access - section tipo: $section_tipo".to_string(), logger::DEBUG);
				$rm++;
			}			
		}

		
		// ADD AREAS TO ACCESS
		$add=0;
		foreach ((object)$areas_to_save as $current_tipo => $permissions) {
			
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if ($modelo_name!='section') continue; # Ignore areas and others, only sections are used now
			if (isset($security_access_dato->$current_tipo)) continue;	// Dato already exists. Nothing to do			

			$security_access_dato->$current_tipo = new stdClass();

			# ALL SHOWABLE ELEMENTS
			$ar_ts_childrens_plain = self::get_ar_ts_childrens_plain($current_tipo);
			foreach ((array)$ar_ts_childrens_plain as $children_tipo) {
				
				$security_access_dato->$current_tipo->$children_tipo = 2;	// Set all childrens to read/write (2) by default				
				$add++;				
			}
			debug_log(__METHOD__." ADD section: $current_tipo - childres: ".count($ar_ts_childrens_plain), logger::DEBUG);		

		}//end foreach ((array)$areas_to_save as $area_tipo => $permissions)
		

		// Update and save edited object dato
		$component_security_access->set_dato($security_access_dato);
		$component_security_access->Save();

		debug_log(__METHOD__." Propagated areas to access. Added $add elements. Removed sections: $rm".to_string(), logger::DEBUG);		
	}//end propagate_areas_to_access
	

	
	/**
	* GET_AR_TS_CHILDRENS_PLAIN (RECURSIVE)
	* @return array $ar_ts_childrens_plain
	*/
	public static function get_ar_ts_childrens_plain( $parent_tipo, $ar_elements=null ) {

		static $ar_ts_childrens_plain;

		if (is_null($ar_elements)) {
			$ar_elements = self::get_ar_ts_childrens_recursive($parent_tipo);
				#dump($ar_elements, ' ar_elements ++ '.to_string($parent_tipo));
		}
		

		foreach ($ar_elements as $current_tipo => $ar_value) {
			$ar_ts_childrens_plain[$parent_tipo][] = $current_tipo;
				#dump($ar_value, ' $ar_value ++ '.to_string());
			if (!empty($ar_value)) {
				self::get_ar_ts_childrens_plain($parent_tipo, $ar_value);
			}
		}

		if (isset($ar_ts_childrens_plain[$parent_tipo])) {
				dump($ar_ts_childrens_plain, ' ar_ts_childrens_plain ++ '.to_string());
			return $ar_ts_childrens_plain[$parent_tipo];
		}else{
			return array();
		}
	}//end get_ar_ts_childrens_plain



	/**
	* GET_SECURITY_AREAS_SECTIONS
	* Fiter security_areas sections and calculate childrens elements of every section
	* @return object $security_areas_sections_obj
	*/
	public function get_security_areas_sections() {

		$security_areas_sections_obj 	= new stdClass();

		$component_security_areas 		= component_common::get_instance('component_security_areas',
																		DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																		$this->get_parent(),
																		'edit',
																		DEDALO_DATA_NOLAN,
																		DEDALO_SECTION_PROFILES_TIPO );
		$component_security_areas_dato 	= (object)$component_security_areas->get_dato();
								
		foreach($component_security_areas_dato as $current_section_tipo => $permisions) {			

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_section_tipo,true);
			if ($modelo_name!='section') continue; # Skip
			$security_areas_sections_obj->$current_section_tipo = component_security_access::get_ar_ts_childrens_recursive($current_section_tipo);
		}

		return $security_areas_sections_obj;		
	}//end get_security_areas_sections



	/**
	* GET_AR_CHILDREN_ELEMENTS
	* @return array $ar_children_elements
	*/
	public static function get_ar_children_elements( $tipo ) {
		
		$get_ar_children_elements = array();

		$RecordObj_dd			= new RecordObj_dd($tipo);
		$ar_ts_childrens		= $RecordObj_dd->get_ar_childrens_of_this();
			#dump($ar_ts_childrens, ' ar_ts_childrens ++ '.to_string());
					
		foreach ((array)$ar_ts_childrens as $children_terminoID) {				
			
			$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);								
			$ar_exclude_modelo		= array('component_security_administrator','section_list','box_elements','exclude_elements');		# ,'filter'	,'tools','search_list'
			$exclude_this_modelo 	= false;
			foreach($ar_exclude_modelo as $modelo_exclude) {					
				if( strpos($modelo_name, $modelo_exclude)!==false ) {
					$exclude_this_modelo = true;
					break;	
				}
			}
			
			if ( $exclude_this_modelo !== true ) {		
				#$ar_temp = self::get_ar_ts_childrens_recursive($children_terminoID);						
				$get_ar_children_elements[] = $children_terminoID;				
			}				
		}

		return $get_ar_children_elements;
	}//end get_ar_children_elements



	/**
	* UPDATE_DATO_VERSION
	* @param array $update_version
	* @param mixed $dato_unchanged
	* @return object $response
	*/
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
		#dump($dato_unchanged, ' dato_unchanged ++ -- '.to_string($update_version)); #die();

		switch ($update_version) {

			case '4.0.11':					
				$data_changed=false;
				if(!empty($dato_unchanged)) {

					$new_dato = new stdClass();
					foreach ((object)$dato_unchanged as $tipo => $value) {

						if (is_object($value)) {
							break; // Temporal !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! sólo para datos mezcados 4.0.10 y 4.0.11 en la instalación de desarrollo
						}

						# Group elements by section
						$ar_terminoID = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section', 'parent', $search_exact=true);
						if (!empty($ar_terminoID[0])) {
							$section_tipo = $ar_terminoID[0];
						
							if (!isset($new_dato->$section_tipo)) {
								$new_dato->$section_tipo = new stdClass();
							}
							$new_dato->$section_tipo->$tipo = (int)$value; // Convert values to int
							$data_changed=true;
						}					
					}					
				}
					
				# Compatibility old dedalo instalations
				if ($data_changed) {
					$response = new stdClass();
						$response->result =1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;
				}else{
					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

			default:
				# code...
				break;
		}		
	}//end update_dato_version



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* En este caso, NO guardamos nada en 'valor_list'
	*
	* @see class.section.php
	* @return string $html
	*/
	public function get_valor_list_html_to_save() {
		$html='';
		
		return (string)$html;
	}//end get_valor_list_html_to_save



	/**
	* MERGE_DATO
	* Merge actual DB dato with received section dato
	* using array_merge (http://php.net/manual/es/function.array-merge.php)
	* @return array $ar_result
	*/
	public static function merge_dato(array $current_dato, array $new_dato) {
		/*
		$new_dato = array();
		foreach ($current_dato as $section_tipo => $ar_components) {
			if (isset($new_dato[$section_tipo])) {
				# code...
			}
		}
		*/

		$ar_result = array_merge($current_dato, $new_dato);
			#dump($current_dato, ' current_dato ++ '.to_string());
			#dump($new_dato, ' new_dato ++ '.to_string());
			#dump($ar_result, ' ar_result ++ '.to_string());

		return (array)$ar_result;
	}//end merge_dato


	
	
};
?>