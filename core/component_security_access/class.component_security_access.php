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
	function __construct($tipo=false, $section_id=null, $mode='edit',  $lang=null, $section_tipo=null) {	#__construct($id=NULL, $tipo=false, $mode='edit', $section_id=NULL, $lang=NULL)

		parent::__construct($tipo, $section_id, $mode, $lang=$this->lang, $section_tipo);

		# caller_id from parent var (default)
		if(!empty($section_id)) {
			$this->caller_id = $section_id;
		}
		#dump($id,'id');	#throw new Exception("component_security_access Request", 1);
		# caller_id is set in main to this obj from request 'caller_id' (is id section parent of current component)
	}



	/**
	* GET DATO 
	* @return object $dato
	* Format [{"tipo":"dd21","parent":"dd20","value":3}]
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		if (!is_array($dato) && empty($dato)) {
			$dato = [];
		}

		return (array)$dato;
	}



	/**
	* SET_DATO
	* @param object $dato
	*/
	public function set_dato($dato) {
		if (!is_array($dato)) {
			if(empty($dato)) {
				$dato = [];
			}else{
				$dato = (array)$dato;
			}
		}
		parent::set_dato($dato);
	}
	


	/**
	* GET_CONTEXT
	* @return 
	*/
	public function get_context() {

		$user_id = navigator::get_user_id();

		if($user_id<0){

			$ar_areas = area::get_areas();

		}else{

			$dato = $this->get_dato();

			foreach ($dato as $current_item) {
					$RecordObj_dd 	= new RecordObj_dd($current_item->tipo);
					$label 			= $RecordObj_dd->get_label();
					$parent 		=[];
				}
			
		}
		
	}//end get_context




	/**
	* GET ARRAY TIPO ADMIN
	* @return array $ar_tipo_admin
	* Devulve el área 'Admin' además de sus hijos
	* (usado para excluirles las opciones admin en el arbol)
	*/
	public static function get_ar_tipo_admin() {

		# STATIC CACHE
		static $ar_tipo_admin;
		if(isset($ar_tipo_admin)) return $ar_tipo_admin;

		$ar_result 	= RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='area_admin', $prefijo='dd');
		$ar_tesauro = array();

		if(!empty($ar_result[0])) {
			$tipo					= $ar_result[0];
			$obj 					= new RecordObj_dd($tipo);
			$ar_childrens_of_this	= $obj->get_ar_childrens_of_this();
			$ar_tesauro 			= $ar_childrens_of_this;
			#dump($ar_tesauro);
		}
		# Añadimos el propio termino como padre del arbol
		#array_push($ar_tesauro, $tipo);
		array_unshift($ar_tesauro, $tipo);

		# STORE CACHE DATA
		$ar_tipo_admin = $ar_tesauro ;

		#dump($ar_tesauro," ar_tesauro");

		return $ar_tesauro ;
	}


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

			case '6.0.0':

			// old dato: {"oh1":{"oh2":2}}
			// new dato :[{"tipo":"oh2","parent":"oh1","value":2}]

			if(!empty($dato_unchanged) && is_object($dato_unchanged)) {

				$new_dato = [];
				foreach ($dato_unchanged as $current_parent => $current_ar_tipo) {
					foreach ($current_ar_tipo as $current_tipo => $value) {
						$current_dato = new stdClass();
						$current_dato->tipo 	= $current_tipo;
						$current_dato->parent 	= $current_parent;
						$current_dato->value 	= $value;
						$new_dato[] = $current_dato;
					}
				}

				$response = new stdClass();
					$response->result = 1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

			}else{
				$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}

			return $response;
			break;

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

		}		
	}//end update_dato_version





//////////////////////////////////////////// OLD V5 ////////////////////////




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
	* @see security::get_ar_authorized_areas_for_user
	*/
	protected function get_user_authorized_areas() {

		if(SHOW_DEBUG===true) {
			#$start_time=microtime(1);
		}
	
			
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
		$ar_authorized_areas_for_user = (array)security::get_ar_authorized_areas_for_user();
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