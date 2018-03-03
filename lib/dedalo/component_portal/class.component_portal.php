<?php
/*
* CLASS component_portal
*
*
*/
class component_portal extends component_relation_common {

	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	public $show_button_new = true;		# default show: true
	public $ar_target_section_tipo ;	# Used to fix ar section tipo (calculado a partir de los componentes relacionado de modelo section)
	public $target_section_tipo;		# Used in tool portal (resiest by url)
	public $portal_parent ;				# Used to fix current portal_parent in button new
	
	public $layout_map;
	public $ar_columns;					# Array of columns (tipo=>label)

	# HTML Options
	public $html_options;

	# section_list_key. Default is first (0) of various
	public $section_list_key = 0;

	# generate_json component
	public $generate_json_element = true;


	public $max_records = null;
	public $offset = null;


	
	/**
	* __CONSTRUCT
	*/
	function __construct( $tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null ) {

		if(SHOW_DEBUG===true) {
			$component_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			global$TIMER;$TIMER[__METHOD__.'_' .$component_name.'_IN_'.$tipo.'_'.$modo.'_'.$parent.'_'.microtime(1)]=microtime(1);
		}
		
		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;


		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		
		if(SHOW_DEBUG===true) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible==='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);				
			}
		}
		/*
		# EDIT : Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if($modo==='edit' && empty($id)) {
			

			# Si no existe, creamos un registro, SI o SI
			if(empty($id)) {				
				if( !empty($tipo) && intval($parent)>0 ) {
					
					$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
					$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,NULL, $parent, $tipo, $lang);	#($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $matrix_table='matrix')
					$RecordObj_matrix->set_parent($parent);
					$RecordObj_matrix->set_tipo($tipo);
					$RecordObj_matrix->set_lang($lang);
					$RecordObj_matrix->set_dato('');

					$RecordObj_matrix->Save();
					$id = $RecordObj_matrix->get_ID();

					# DEBUG
					if(SHOW_DEBUG===true) {
					$msg = "INFO: Created component_portal record $id with: (tipo:$tipo, parent:$parent, lang:$lang)";
					error_log($msg);
					}
				}else{
					$msg = "Impossible create new component_portal record ";
					if(SHOW_DEBUG===true) {
						$component_name = RecordObj_dd::get_termino_by_tipo($tipo);
						$msg .= "<hr> ".__METHOD__." (id:$id, tipo:$tipo, parent:$parent, lang:$lang, modo:$modo) Portal $component_name ";
						$msg .= "<br> parent expected: ddXX . Current parent: $parent ";
					}
					throw new Exception($msg, 1);
				}
			}#if(empty($id)) {
		}
		*/


		# Notificamos la carga de los elementos de la sección contenida en el portal
		if ($this->modo==='edit') {
			$this->notify_load_lib_element_tipo_of_portal();
		}


		# HTML Options defaults
		$this->html_options = new stdClass();
			$this->html_options->header 	= true;
			$this->html_options->rows   	= true;
			$this->html_options->id_column 	= true;
			$this->html_options->rows_limit	= false;
			$this->html_options->buttons 	= true;
			$this->html_options->sortable 	= true;


		if(SHOW_DEBUG===true) {
			$component_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			global$TIMER;$TIMER[__METHOD__.'_' .$component_name.'_OUT_'.$tipo.'_'.$modo.'_'.$parent.'_'.microtime(1)]=microtime(1);
		}		
	}//end __construct



	/**
	* GET VALOR 
	* Get resolved string representation of current values (locators)	
	* @return string | null
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $data_to_be_used='valor', $separator_rows='<br>', $separator_fields=', ' ) {
		$start_time = microtime(1);

		if (isset($this->valor)) {			
			return $this->valor;
		}

		$options = new stdClass();
			$options->lang 				= $lang;	
			$options->data_to_be_used 	= $data_to_be_used;
			$options->separator_rows 	= $separator_rows;
			$options->separator_fields 	= $separator_fields;

			$valor_from_ar_locators 	= $this->get_valor_from_ar_locators($options);
				#dump($valor_from_ar_locators, ' valor_from_ar_locators');
		
		if(SHOW_DEBUG===true) {
			$total_list_time = round(microtime(1)-$start_time,3);
			#$bt = debug_backtrace();
			#dump($bt, ' bt');
			#debug_log(__METHOD__." WARNING CALLED GET VALOR IN COMPONENT PORTAL !! ({$total_list_time}ms) ".$this->tipo, logger::WARNING);
		}

		return $this->valor = $valor_from_ar_locators->result;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$dato = $this->get_dato();
		
		if (empty($dato)) {			
			return '';
		}

		#
		# TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual	
		$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();

		#
		# FIELDS
		$fields=array();
		foreach ($ar_terminos_relacionados as $key => $ar_value) {
			foreach ($ar_value as $current_tipo) {
				
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				if (strpos($modelo_name, 'component_')!==false) {
					$fields[] = $current_tipo;
				}
			}
		}

		$ar_resolved=array();
		foreach( (array)$dato as $key => $value) {

			$section_tipo 	= $value->section_tipo;
			$section_id 	= $value->section_id;

			$ar_resolved[$section_id][] = $section_id;
			
			foreach ($fields as $current_tipo) {				
			
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $current_tipo,
																 $section_id,
																 'list',
																 $lang,
																 $section_tipo);
				$current_value_export = $component->get_valor_export( null, $lang, $quotes, $add_id );

				// Clean double spaces and remove \n
				$current_value_export = str_replace(array("\n","  "),array(' ',' '),$current_value_export);

				$ar_resolved[$section_id][] = $current_value_export;
			}
		}//end foreach( (array)$dato as $key => $value)

		$ar_valor_export=array();
		foreach ($ar_resolved as $key => $ar_value) {
			#$valor_export .= implode("\t", $ar_value).PHP_EOL;
			if (!empty($ar_value)) {
				$valor_line='';
				#$valor_line  = implode("\t", $ar_value);
				foreach ($ar_value as $lvalue) {
					$lvalue=trim($lvalue);
					if (!empty($lvalue)) {
						$valor_line .= "\t" . $lvalue;
					}
				}				
				$ar_valor_export[] = trim($valor_line);
			}
		}

		$valor_export = implode(PHP_EOL, $ar_valor_export);


		return (string)$valor_export;
	}#end get_valor_export



	/**
	* GET_DATO_AS_STRING
	*/
	public function get_dato_as_string() {
		$dato 	= (array)$this->get_dato();
		$string = '';
		foreach ($dato as $key => $value) {
			foreach ((array)$value as $current_key => $current_value) {
				$string .= "[$key] $current_key -> ".to_string($current_value)." \n";
			}
		}

		return $string;
	}//end get_dato_as_string



	/**
	* NOTIFY_LOAD_LIB_ELEMENT_TIPO_OF_PORTAL
	* Force notify portal related components load for give css/js support
	*/ 
	protected function notify_load_lib_element_tipo_of_portal() {
		
		$ar_children_tipo=array();

		$ar_relaciones = (array)$this->RecordObj_dd->get_relaciones();
		foreach ($ar_relaciones as $ar_value) {

			$current_terminoID  = reset($ar_value);
			$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($current_terminoID,true);

			if ($modelo_name==='exclude_elements') {
				continue;
			}

			# Notify element load to common
			common::notify_load_lib_element_tipo($modelo_name, $this->modo);
		}

		return true;
	}//end notify_load_lib_element_tipo_of_portal


	
	/**
	* Save : Overwrite Save common
	*/
	public function Save() {

		# Salvamos de forma estándar
		$result = parent::Save();
		

		return $result;
	}//end Save



	/**
	* UPDATE_STATE
	* Recoge el dato del component state de esta sección y lo añade 
	* @param object $rows_data_state
	* @return bool
	*/
	public function update_state($rel_locator) {

		if (empty($rel_locator->section_id) || empty($rel_locator->section_tipo)) {
			debug_log(__METHOD__." Called update_state with empty or invalid locator: (No component_state was update) ".json_encode($rel_locator), logger::WARNING);
			return false;
		}

		# Calculate portal locators component state dato
		$component_state_tipo 	= section::get_ar_children_tipo_by_modelo_name_in_section($rel_locator->section_tipo, 'component_state', true, true);
		if (isset($component_state_tipo[0])) {
			$component_state_tipo = $component_state_tipo[0];
			$modelo_name 		  = RecordObj_dd::get_modelo_name_by_tipo($component_state_tipo, true);
			$component_state 	  = component_common::get_instance($modelo_name ,
																   $component_state_tipo,
																   $rel_locator->section_id,
																   'edit',
																   DEDALO_DATA_NOLAN,
																   $rel_locator->section_tipo);

			debug_log(__METHOD__." Updated and saving component_state ($component_state_tipo - $rel_locator->section_id) with locator: ".json_encode($rel_locator));
			return $component_state->Save();

		}else{
			# No component_state exists
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Ignore 'update_state' in section without component_state. (".$this->get_section_tipo()."). locator: ".json_encode($rel_locator));
			}
		}

		return false;			
	}//end update_state


	
	/**
	* REMOVE_STATE_FROM_LOCATOR
	* DELETE AND UPDATE the state of this section and his parents
	* @param LOCATOR $rel_locator with the locator of the portal to remove into the state
	*/
	public function remove_state_from_locator($rel_locator) {

		$component_state = $this->get_component_state_obj();
		if (!empty($component_state)) {

			$component_state->remove_portal_locator($rel_locator);

			return $component_state->Save();
		}else{
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Ignored 'remove_state_from_locator' in section without component_state. (".$this->get_section_tipo()."). locator: ".json_encode($rel_locator));
			}
		}

		return false;
	}//end remove_state_from_locator



	/**
	* ADD_NEW_ELEMENT
	* Creates a new record in target section and propagates filter data
	* Add the new record section id to current component data (as locator) and save
	* @return object $response
	*/
	public function add_new_element( $request_options ) {

		$options = new stdClass();
			$options->section_target_tipo 	= null;
			$options->top_tipo 				= TOP_TIPO;
			$options->top_id 				= TOP_ID;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		#
		# 1 PROJECTS GET. Obtenemos los datos del filtro (proyectos) de la sección actual para heredarlos en el registro del portal
		# We get current portal filter data (projects) to heritage in the new portal record
			$component_filter_dato = $this->get_current_section_filter_data();
			if(empty($component_filter_dato)) {
				$msg = __METHOD__." Error on get filter data from this section ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}

		#
		# 2 SECTION . Creamos un nuevo registro vacío en la sección a que apunta el portal	
		# Section record . create new empty section in target section tipo
		# TRUE : Se le pasa 'true' al comando "Save" para decirle que SI es un portal
			if (empty($options->section_target_tipo)) {
				$ar_target_section_tipo = $this->get_ar_target_section_tipo();
				$section_target_tipo 	= reset($ar_target_section_tipo);
			}else{
				$section_target_tipo 	= $options->section_target_tipo;
			}			
			$section_new = section::get_instance(null, $section_target_tipo);

			$save_options = new stdClass();
				$save_options->is_portal 	= true;
				$save_options->portal_tipo 	= $this->tipo;
				$save_options->top_tipo 	= $options->top_tipo;
				$save_options->top_id 		= $options->top_id;
			
			$new_section_id = $section_new->Save( $save_options );			

			if($new_section_id<1) {
				$msg = __METHOD__." Error on create new section: new section_id is not valid ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;
			}
		
		#
		# 3 PROYECTOS SET. Creamos un nuevo registro de filtro ('component_filter') hijo de la nueva sección creada, que heredará los datos del filtro de la sección principal
		# Set target section projects filter settings as current secion
		# Los proyectos se heredan desde el registro actual donde está el portal hacia el registro destino del portal 
			$ar_component_filter = (array)$section_new->get_ar_children_objects_by_modelo_name_in_section('component_filter',true);
			if (empty($ar_component_filter[0])) {
				$msg = __METHOD__." Error target section 'component_filter' not found ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;		
			}else {
				$component_filter	= $ar_component_filter[0];
				$component_filter->set_dato($component_filter_dato);
				$component_filter->Save();
			}

		#
		# 4 PORTAL . Insertamos en dato (el array de 'id_madrix' del component_portal actual) el nuevo registro creado
		# Portal dato. add current section id to component portal dato array
					
			# Basic locator 
			$locator = new locator();
				$locator->set_section_id($new_section_id);
				$locator->set_section_tipo($section_target_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo($this->tipo);
			
			$added = $this->add_locator_to_dato($locator);			
			if ($added!==true) {
				$msg = __METHOD__." Error add_locator_to_dato. New locator is not added ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;	
			}
			

		# Save current component updated data
		$this->Save();


		$response->result 		= true;
		$response->section_id 	= $new_section_id;
		$response->added_locator= $locator;
		$response->msg 			= 'Ok. Request done '.__METHOD__;
		
		return $response;
	}//end add_new_element



	/**
	* REMOVE_ELEMENT
	* @return object $response
	*/
	public function remove_element( $request_options ) {
		
		$options = new stdClass();
			$options->locator 		= null;
			$options->remove_mode	= 'delete_link';	// delete_link | delete_all (deletes link and resource)
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$locator = $options->locator;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		# Remove locator from data
		$result = $this->remove_locator( $locator );
		if ($result!==true) {
			$response->msg .= " Error on remove locator. Skipped action ";
			return $response;
		}		
		
		# Remove target record
		if ($options->remove_mode==='delete_all') {

			$section = section::get_instance($locator->section_id, $locator->section_tipo);
			$delete  = $section->Delete($delete_mode='delete_record');
			if ($delete!==true) {
				$response->msg .= " Error on remove target section ($locator->section_tipo - $locator->section_id). Skipped action ";
				return $response;
			}
		}

		# Update state	
		# DELETE AND UPDATE the component state of this section and his parents
		$state = $this->remove_state_from_locator( $locator );

		# Save current component updated data
		$this->Save();

		$response->result 		= true;
		$response->remove_mode 	= $options->remove_mode;
		$response->msg 			= 'Ok. Request done '.__METHOD__;

		return $response;
	}//end remove_element



	/**
	* GET_CURRENT_SECTION_FILTER_DATA
	* Seach component filter in current section and get the component data
	* @return array $component_filter_dato
	*/
	public function get_current_section_filter_data() {
		
		$section_id		= $this->get_parent();
		$section_tipo	= $this->get_section_tipo();
		$section 		= section::get_instance($section_id, $section_tipo);

		# 1.1 PROYECTOS DE PROYECTOS : Portales de la sección proyectos
		if ($section_tipo===DEDALO_SECTION_PROJECTS_TIPO) {
			
			$component_filter_dato 	= array($section_id=>"2"); # Será su propio filtro
		
		}else{

			$search_model = 'component_filter';
			$ar_children_objects_by_modelo_name_in_section = (array)$section->get_ar_children_objects_by_modelo_name_in_section($search_model,true);

			if (empty($ar_children_objects_by_modelo_name_in_section[0])) {
				throw new Exception("Error Processing Request: 'component_filter' is empty 1", 1);				
			}else {
				$component_filter		= $ar_children_objects_by_modelo_name_in_section[0];
				$component_filter_dato 	= $component_filter->get_dato();
			}
		}


		return $component_filter_dato;
	}//end get_current_section_filter_data



	/**
	* GET AR SECTION RELATION FOR CURRENT TIPO SECTION (STATIC VERSION)
	* Este método es casi indéntico a component_relation::get_ar_section_relations_for_current_tipo_section_static() pero NO comprueba el tipo.
	* Cualquier tipo es válido
	*/
	public static function get_ar_section_relations_for_current_section_tipo_static($modo='ar_multiple', $dato) {

		# Recorremos cada registro relacionado
		$ar_id_records 			= array();
		$ar_rel_locator 		= array();
		$ar_section_relations 	= array();
							
		if(is_array($dato)) foreach ($dato as $rel_locator) {

			#dump($rel_locator,"rel_locator ");
			if (!is_object($rel_locator)) {
				if(SHOW_DEBUG===true) {
					dump($rel_locator,"rel_locator");
				}
				throw new Exception("Error Processing Request. rel_locator is not object", 1);				
			}
		
			$id_record = $rel_locator->section_id;
			
			if(!empty( $id_record )) {
				
				# Notar que aquí se sobreescriben los registros con el mismo id de section en la etiqueta (como 10.0.1 y 10.dd56.2)
				# y por tanto sólo se almacenarán en el array de id's uno por sección				
				if (!in_array($id_record, $ar_id_records)) {
					$ar_id_records[]	= $id_record ;
				}
				$ar_rel_locator[] 		= $rel_locator;								

				# Almacenamos el array de etiquetas de esta sección para usarlo en el listado de relaciones en la clase 'rows'
				$ar_section_relations[$id_record][] = $rel_locator;				
			}
		}# end foreach ($dato as $rel_locator)


		switch ($modo) {
			case 'ar_id_records':
				return $ar_id_records;
				break;

			case 'ar_rel_locator':
				return $ar_rel_locator;
				break;
			
			case 'ar_multiple':
			default:
				return $ar_section_relations;
				break;
		}
	}//end get_ar_section_relations_for_current_section_tipo_static


	
	/**
	* ADD_LOCATOR
	* @param object $locator
	* @return bool true if added, false if not
	*/
	public function add_locator($locator) {

		$locator = clone($locator);

		# Verify exists locator type
		if (!property_exists($locator,'type')) {
			$locator->type = $this->relation_type;
		}

		# Verify exists locator from_component_tipo
		if (!property_exists($locator,'from_component_tipo')) {
			$locator->from_component_tipo = $this->tipo;
		}

		return parent::add_locator_to_dato($locator);
	}//end add_locator



	/**
	* REMOVE_LOCATOR
	* @param object $locator
	* @return bool true if added, false if not
	*/
	public function remove_locator($locator) {

		$locator = clone($locator);

		# Verify exists locator type
		if (!property_exists($locator,'type')) {
			$locator->type = $this->relation_type;
		}

		# Verify exists locator from_component_tipo
		if (!property_exists($locator,'from_component_tipo')) {
			$locator->from_component_tipo = $this->tipo;
		}

		return parent::remove_locator_from_dato($locator);
	}//end remove_locator



	/**
	* GET_LAYOUT_MAP
	* Calculate current layout map to generate portal html
	* Cases:
	*	1. Modo 'list' : Uses childrens to build layout map
	* 	2. Modo 'edit' : Uses related terms to build layout map (default)	
	*/
	public function get_layout_map( $view='full' ) {
		
		if ($this->section_list_key===0 && isset($this->layout_map) && !empty($this->layout_map)) return $this->layout_map;

		$ar_related=array();
		switch ($this->modo) {
			case 'list':
			case 'portal_list':
				# CASE SECTION LIST IS DEFINED				
				$ar_terms 		  = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'section_list', 'children', true);
				$section_list_key = (int)$this->section_list_key;
				
				if(isset($ar_terms[$section_list_key]) ) {
					
					# Use found related terms as new list
					$current_term = $ar_terms[$section_list_key];
					$ar_related   = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);
					
				}else{

					# FALLBACK RELATED WHEN SECTION LIST IS NOT DEFINED
					# If not defined sectiopn list
					$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);						
				}
				break;
			
			case 'edit':
			default:
				if($view==='full') { // || $view==='view_mosaic'
					$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);
					break;
				}else{
					# CASE VIEW IS DEFINED
					$ar_terms = (array)RecordObj_dd::get_ar_childrens($this->tipo); 	#dump($ar_terms, " childrens $this->tipo".to_string());				
					foreach ($ar_terms as $current_term) {
						# Locate 'edit_views' in childrens
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_term,true);
						if ($modelo_name==='edit_view') {
							$view_name = RecordObj_dd::get_termino_by_tipo($current_term);

							if($view===$view_name){
								# Use related terms as new list
								$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);
								# Fix / set current edit_view propiedades to portal propiedades
								$RecordObj_dd 			= new RecordObj_dd($current_term);
								$edit_view_propiedades 	= json_decode($RecordObj_dd->get_propiedades());
								# dump($edit_view_propiedades, ' edit_view_propiedades->edit_view_options ++ '.to_string());		
								if ( isset($edit_view_propiedades->edit_view_options) ) {
									$this->edit_view_options = $edit_view_propiedades->edit_view_options;									
								}								
								break;
							}
						}
					}
				}
			break;
		}//end switch ($this->modo)	

		# PORTAL_SECTION_TIPO : Find portal_section_tipo in related terms and store for use later
		foreach ((array)$ar_related as $key => $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				#dump($modelo_name,"modelo_name $modelo");

			if ($modelo_name==='component_state') {
				$this->component_state_tipo = $current_tipo; // Store to reuse in custom layout map later
			}
			elseif ($modelo_name==='section') {
				$this->ar_target_section_tipo[] = $current_tipo; // Set portal_section_tipo find it
				unset($ar_related[$key]); // Remove self section_tipo from array of components
				//break;
			}
			elseif ($modelo_name==='exclude_elements') {
				unset($ar_related[$key]); // Remove self section_tipo from array of components
			}
		}
		$layout_map = array($this->tipo => $ar_related);


		#
		# REMOVE_EXCLUDE_TERMS : CONFIG EXCLUDES
		# If instalation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove elements from layout_map
		if (defined('DEDALO_AR_EXCLUDE_COMPONENTS') && !empty($layout_map)) {
			$DEDALO_AR_EXCLUDE_COMPONENTS = unserialize(DEDALO_AR_EXCLUDE_COMPONENTS);
			foreach ($layout_map as $section_tipo => $ar_tipos) foreach ((array)$ar_tipos as $key => $current_tipo) {
				if (in_array($current_tipo, $DEDALO_AR_EXCLUDE_COMPONENTS)) {
					unset( $layout_map[$section_tipo][$key] );
					debug_log(__METHOD__." DEDALO_AR_EXCLUDE_COMPONENTS: Removed portal layout_map term $current_tipo ".to_string(), logger::DEBUG);
				}
			}
		}

		if ($this->section_list_key===0) {
			# Fix only in default case
			$this->layout_map = $layout_map;
		}

		return $layout_map;
	}//end get_layout_map



	/**
	* GET_AR_COLUMNS
	* @return array $ar_columns
	*/
	public function get_ar_columns( $view='full' ) {

		if($this->section_list_key===0 && isset($this->ar_columns)) return $this->ar_columns;
		
		$layout_map  	= $this->get_layout_map($view);
		$ar_hcolumns 	= reset($layout_map);
		$ar_columns 	= array();

		# Semantic nodes columns
		$semantic_nodes = $this->get_semantic_nodes();		
		foreach ((array)$semantic_nodes as $semantic_node_tipo) {	
			$ar_columns['ds_'.$semantic_node_tipo] = RecordObj_dd::get_termino_by_tipo($semantic_node_tipo);
		}

		# Regular columns
		foreach ((array)$ar_hcolumns as $value) {			
			$ar_columns[$value] = RecordObj_dd::get_termino_by_tipo($value,DEDALO_APPLICATION_LANG,true);			
		}

		# Move publication columns to second column
		foreach ($ar_columns as $key => $value) {
			if(strpos($key, 'des_')===0 || $key==='edit') continue;
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($key, true);
			if($modelo_name==='component_publication') {
				$ar_columns = array($key => $ar_columns[$key]) + $ar_columns;
			}
		}

		# Tag column
		if($this->modo==='edit') {
			$dato = $this->get_dato();
			$contain_tag=false;
			foreach ((array)$dato as $current_locator) {
				if (property_exists($current_locator, 'tag_id')) {
					$contain_tag=true;
					break;
				}
			}
			if ($contain_tag) {
				# Prepend array element tag_id
				$ar_columns = array('tag_id' => label::get_label('tag')) + $ar_columns;
			}
		}

		# First column (fixed)
		# Prepend array element edit at beginning
		$ar_columns = array('edit' => label::get_label('edicion')) + $ar_columns;


		if ($this->section_list_key===0) {
			# Fix value only in default case
			$this->ar_columns = $ar_columns;
		}		
		
		return $ar_columns;
	}//end get_ar_columns


		
	/**
	* GET_DIFFUSION_OBJ
	*/
	# FORMATO DEL ARRAY DEVUELTO
	# [valor] => Array
    #    (
    #        [58] => Array
    #            (    #                [dd72] => Javier
    #                [dd77] => Gómez López
    #            )
    #        [61] => Array
    #            (
    #                [dd72] => José
    #                [dd77] => Perez Ramírez
    #            )
    #    )
	public function get_diffusion_obj( $propiedades ) {
		
		#
		# DIFFUSION_OBJ : Build standar diffusion_obj from component common
		#
			$diffusion_obj = parent::get_diffusion_obj( $propiedades );	

			if(!is_object($propiedades)) {
				return $diffusion_obj;
			}

		#
		# PORTAL RESOLVE SPECIFIC VALUE 
		#
			$valor=array();
			$dato = $this->get_dato();
				#dump($dato, ' dato get_diffusion_obj $propiedades');
			
			if(is_array($dato)) foreach ($dato as $current_rel_locator) {
				#dump($current_rel_locator,"current_rel_locator ");	dump($this,"");
				#$locator_relation_as_obj = component_common::get_locator_relation_as_obj($current_rel_locator);
				$current_portal_section_id = $current_rel_locator->section_id;
					#dump($current_portal_section_id,'current_portal_section_id');
				
				# Propiedades_portal_list
				$ar_propiedades_portal_list = $propiedades->portal_list;		
					#dump($ar_propiedades_portal_list,'ar_propiedades_portal_list '.to_string($this->tipo));
				
				if ( !empty($ar_propiedades_portal_list) && is_array($ar_propiedades_portal_list)) foreach ($ar_propiedades_portal_list as $current_component_tipo) {
						
					$current_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
					$current_component 		= component_common::get_instance($current_modelo_name, $current_component_tipo, $current_portal_section_id, $this->modo, DEDALO_DATA_NOLAN, $current_rel_locator->section_tipo);
						#dump($current_component,"current_component_tipo $current_component_tipo - $this->section_tipo");
					if(SHOW_DEBUG===true) {
						#error_log(__METHOD__." NOTA: USADO MUPREVA21 FIJO TEMPORALMENTE ");
					}					
					$valor[$current_portal_section_id][$current_component_tipo] = $current_component->get_valor();
				}			

			}#end if(is_array($dato)) foreach ($dato as $current_rel_locator) 		

		# OVERWRITE DEFAULT DIFFUSION_OBJ DATO WITH SPECIFIC COMPONENT RESOLUTION DATO
		$diffusion_obj->columns['valor'] = $valor;

		
		return $diffusion_obj;
	}//end get_diffusion_obj



	/**
	* GET_STATS_OBJ
	*/
	public function get_stats_obj( $propiedades ) {
		
		return null; // DESACTIVO !!!



		$stats_obj = new diffusion_stats_component_obj();

		# PORTAL : ITERATE ALL PORTAL RECORDS
		$ar_dato = array();
		$dato 	 = $this->get_dato();

		if(is_array($dato)) foreach ($dato as $current_rel_locator) {

			$locator_relation_as_obj   = component_common::get_locator_relation_as_obj($current_rel_locator);
			$current_portal_section_id = $locator_relation_as_obj->section_id;
				#dump($current_portal_section_id,'current_portal_section_id');

			if (empty($current_portal_section_id)) {
				# Puede tratarswe de un portal vacío (creado, pero sin registros asociados todavía)	
				# Skip
				continue;		
			}
			
			# PROPIEDADES_PORTAL_LIST
			$ar_propiedades_portal_list = $propiedades->portal_list;			
			if ( !empty($ar_propiedades_portal_list) && is_array($ar_propiedades_portal_list)) foreach ($ar_propiedades_portal_list as $current_component_tipo) {
					
				$current_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
				$current_component 		= component_common::get_instance($current_modelo_name,
																		 $current_component_tipo,
																		 $current_portal_section_id,
																		 $this->modo,
																		 DEDALO_DATA_LANG,
																		 $this->section_tipo);
					#dump($current_component,'$current_component');
				
				$ar_dato[] = $current_component->get_dato();
			}			

		}#end if(is_array($dato)) foreach ($dato as $current_rel_locator) {
		
		$stats_obj = $ar_dato;

		return $stats_obj;
	}//end get_stats_obj



	/**
	* GET_PORTALS_MAP
	* Return array of all portals => target section like
	* @param bool $filter_section_tipo default false
	* @return array $ar_portals_map in format:
	* 							key = portal tipo
	* 							value = target_section_tipo
	*/
	public static function get_ar_portals_map__DEPRECATED( $filter_section_tipo=false ) {

		$component_portal_model = 'dd592';
		$ar_all_terminoID 		= RecordObj_dd::get_ar_all_terminoID_of_modelo_tipo($component_portal_model);
		if(SHOW_DEBUG===true) {
			#dump($ar_all_terminoID, ' ar_all_terminoID');die();
		}

		$ar_recursive_childrens = RecordObj_dd::get_ar_recursive_childrens(DEDALO_ROOT_TIPO);

		$ar_portals_map=array();
		foreach ($ar_all_terminoID as $key => $current_terminoID) {

			if (!in_array($current_terminoID, $ar_recursive_childrens)) {
				continue; # Skip external elements
			}

			$ar_target_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_terminoID, $modelo_name='section', $relation_type='termino_relacionado');
			
			if (isset($ar_target_section_tipo)) {
				$ar_portals_map[$current_terminoID] = $ar_target_section_tipo;
			}			
		}
		if(SHOW_DEBUG===true) {
			#dump($ar_portals_map," ar_portals_map");die();
			if (empty($ar_portals_map)) {
				debug_log(__METHOD__." empty ar_portals_map ".to_string(), logger::DEBUG);
			}
		}

		return (array)$ar_portals_map;
	}//end get_ar_portals_map__DEPRECATED



	/**
	* GET_EXCLUDE_ELEMENTS
	* Locate in structure an optional 'exclude_elements' tipo
	* Used to reduce number of components in virtal sections like a special 'layout_map'
	* Is sended in URL across all portal links like ..&exclude_elements=rsc174
	* @see section->generate_content_html
	* @return string $exclude_elements (like rsc174) if found
	*		  bool false if not found
	*/
	public function get_exclude_elements() {

		if(isset($this->exclude_elements)) {			
			return $this->exclude_elements;
		}

		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'exclude_elements', 'termino_relacionado');
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name');
		if (empty($ar_terminoID_by_modelo_name[0])) {
			$exclude_elements = false;
		}else{
			$exclude_elements = $ar_terminoID_by_modelo_name[0];
		}

		# Fix value
		$this->exclude_elements = $exclude_elements;

		return $exclude_elements;
	}//end get_exclude_elements



	/**
	* ROW_IN_RESULT
	* Select match row in result if exists from locator
	* @return object $row / bool false
	*//*
	public function row_in_result__OLD( $locator, $result ) {

		if (empty($result)) {
			return false;
		}
		foreach ($result as $key => $table_rows) {
		foreach ($table_rows as $current_id => $row) {
			
			$section_id 	= $row['section_id'];
			$section_tipo 	= $row['section_tipo'];

			$ar_parts = explode('.', $current_id);	// current_id can have format like '8842' (link to whole section) or '8842.rs30.1' (link to partial section)
				#dump($ar_parts, ' ar_parts ++ '.to_string());
				$matrix_id 		= $ar_parts[0];	// mandatory
				$component_tipo = isset($ar_parts[1]) ? $ar_parts[1] : false;	// optional
				$tag_id 		= isset($ar_parts[2]) ? $ar_parts[2] : false;	// optional
			
			
			if ($tag_id && isset($locator->tag_id) && $section_id == $locator->section_id && $section_tipo === $locator->section_tipo && $tag_id==$locator->tag_id) {
				$findit = true;
			}else if (!$tag_id && $section_id == $locator->section_id && $section_tipo === $locator->section_tipo) {
				$findit = true;
			}else{
				$findit = false;
			}

			if ($findit) {
				# add current_id as current_id (rel_locator
				$row['current_id'] = $current_id;
				return $row;
			}	    	
		}}

		$virtual_row = array(
						"current_id" => null,
						"section_id" => $locator->section_id,
						"section_tipo" => $locator->section_tipo,
						);

		return $virtual_row;		
	}//end row_in_result*/



	/**
	* ROW_IN_RESULT
	* Select match row in result if exists from locator
	* @return object $row / bool false
	*/
	public function row_in_result( $locator, $ar_result ) {
		
		if (empty($ar_result)) {
			return false;
		}
		foreach ($ar_result as $key => $row) {
			
			$section_id 	= $row->section_id;
			$section_tipo 	= $row->section_tipo;
			$tag_id 		= isset($row->tag_id) ? $row->tag_id : false;	// optional
			
			/*
			if ($tag_id && isset($locator->tag_id) && $section_id == $locator->section_id && $section_tipo === $locator->section_tipo && $tag_id==$locator->tag_id) {
				$findit = true;
			}else if (!$tag_id && $section_id == $locator->section_id && $section_tipo === $locator->section_tipo) {
				$findit = true;
			}else{
				$findit = false;
			}*/
			if ($locator->section_id==$section_id && $locator->section_tipo===$section_tipo) {
				$findit = true;
			}else{
				$findit = false;
			}

			if ($findit===true) {
				# add current_id as current_id (rel_locator
				$current_row = $row;
				$current_row->current_id = $section_id;
				break;			
			}	    	
		}

		if (!isset($current_row)) {
			# Virtual row
			$current_row = new stdClass();
				$current_row->current_id = null;
				$current_row->section_id = $locator->section_id;
				$current_row->section_tipo = $locator->section_tipo;			
		}
		
	
		return $current_row;		
	}//end row_in_result



	/**
	* GET_AR_TARGET_SECTION_TIPO
	*
	*/
	public function get_ar_target_section_tipo() {
		
		if (!$this->tipo) return NULL;

		if(isset($this->ar_target_section_tipo)) {
			return $this->ar_target_section_tipo;
		}

		$ar_terminoID_by_modelo_name = common::get_ar_related_by_model('section', $this->tipo);

		if(SHOW_DEBUG===true) {

			if ( empty($ar_terminoID_by_modelo_name) ) {
				$portal_name = RecordObj_dd::get_termino_by_tipo($this->tipo,null,true);
				throw new Exception("Error Processing Request. Please, define target section structure for portal: $portal_name - $this->tipo", 1);
			}
		}

		$ar_target_section_tipo = $ar_terminoID_by_modelo_name;
		
		return $this->ar_target_section_tipo = (array)$ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null, $section_list_key=0) {
		
		if ($modo==='list' || $modo==='portal_list') {

			##$parent    = null; // Force null always !important
			$component = component_common::get_instance(__CLASS__,
														$tipo,
														$parent,
														$modo,
														DEDALO_DATA_NOLAN,
														$section_tipo);
			
			$component->html_options->rows_limit = 1;

		}else{

			$component = component_common::get_instance(__CLASS__,
														$tipo,
														$parent,
														$modo,
														DEDALO_DATA_NOLAN,
														$section_tipo);
		}


		# Set section_list_key for select what section list (can exists various) is selected to layout map
		$component->set_section_list_key( (int)$section_list_key );
		
		# Use already query calculated values for speed
		#$ar_records   = (array)json_handler::decode($value);
		##$component->set_dato($ar_locators);

		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo.'_'.$section_list_key); // Set unic id for build search_options_session_key used in sessions
		$html = $component->get_html();
		
		return $html;
	}//end render_list_value 


	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {
		
		$diffusion_value = $this->get_image_url(DEDALO_IMAGE_QUALITY_DEFAULT);

		# Propiedades of diffusion element that references this component
		$diffusion_properties = $this->get_diffusion_properties();

		# If not isset propiedades->data_to_be_used, we understand that is 'dato' for speed
		if (!isset($diffusion_properties->data_to_be_used)) {
			$data_to_be_used = 'dato';
			$dato = $this->get_dato();
			if (is_array($dato)) {
				$ar_id =array();
				foreach ($dato as $current_locator) {
					$ar_id[] = $current_locator->section_id;
				}
				$dato = $ar_id;
			}
			$diffusion_value = $dato;
		}else{
			# 'Default' behaviour is now get_valor (...)
			$data_to_be_used = 'valor_list';// Changed from valor to valor_list because input_text valor is an json array. $diffusion_properties->data_to_be_used;			
			$diffusion_value = $this->get_valor( $lang, $data_to_be_used, $separator_rows='<br>', $separator_fields=', ' );
			#dump($diffusion_value, '$diffusion_value ++ '.to_string($this->tipo));
		}


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_ORDER_BY_LOCATOR
	* OVERWRITE COMPONENT COMMON METHOD
	* @return bool
	*/
	public static function get_order_by_locator() {
		
		return false;
	}//end get_order_by_locator



	/**
	* GET_COMPONENT_POINTERS
	* Get component or tag portal pointers from inverse relations
	* @return array $ar_found
	* @see class.component_text_area.php -> fix_broken_index_tags
	*/
	public static function get_component_pointers($component_tipo, $section_tipo, $section_id, $tag_id=null) {
		
		$locator_to_search = new locator();
			$locator_to_search->set_section_tipo($section_tipo);
			$locator_to_search->set_section_id($section_id);
			$locator_to_search->set_component_tipo($component_tipo);				

			if (!is_null($tag_id)) 
				$locator_to_search->set_tag_id($tag_id);
					
			
		$section 		  = section::get_instance($section_id, $section_tipo);
		$inverse_locators = $section->get_inverse_locators();
		$ar_properties 	  = array_keys((array)$locator_to_search);
			#dump($ar_properties, ' $ar_properties ++ '.to_string());

		$ar_found=array();
		foreach ((array)$inverse_locators as $key => $reference_obj) {

			$current_section_tipo 	= $reference_obj->from_section_tipo;
			$current_section_id 	= $reference_obj->from_section_id;
			$current_component_tipo = $reference_obj->from_component_tipo;

			$modelo_name 	  		= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
			if ($modelo_name===__CLASS__) {
				$ar_found[] = $reference_obj;
			}
			/*		
			$component 				= component_common::get_instance($modelo_name,
																	 $current_component_tipo,
																	 $current_section_id,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 $current_section_tipo);
			$dato = (array)$component->get_dato();

			foreach ($dato as $key => $current_locator) {

				if (true===locator::compare_locators( $current_locator, $locator_to_search, $ar_properties)) {
					if (!in_array($current_locator, $ar_found)) {
						$ar_found[] = $current_locator;
					}					
				}
			}*/		
		}
		#dump($ar_found, ' ar_found ++ '.to_string());

		return (array)$ar_found;
	}//end get_component_pointers	



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() {
		
		return true;
	}//end regenerate_component



	/**
	* GET_JSON_build_options
	* Collect vars to js call to component for build html
	* @return object $options
	*//*
	public function get_json_build_options() {
		
		$options = parent::get_json_build_options();
			#dump($options, ' options ++ '.to_string());
		
		# add dato
		$options->dato = $this->get_dato();


		return $options;
	}//end get_json_build_options
	*/



	/**
	* GET_FROM_JSON
	* @return object $json_d
	*/
	public function get_from_json() {
		# Set to false
		$this->generate_json_element = false;

		# Include controler
		include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'.php' );
		#dump($json_d, ' json_d ++ '.to_string());

		return (object)$json_d;
	}//end get_from_json



	/**
	* GET_JSON_build_options
	* Collect vars to js call to component for build html
	* @return object $options
	*/
	public function get_json_build_options() {

		/* common options reference:
		$options->section_tipo 	 = $this->get_section_tipo();
		$options->section_id   	 = $this->get_parent();
		$options->component_tipo = $this->get_tipo();
		$options->model_name 	 = get_class($this);
		$options->lang 	 		 = $this->get_lang();
		$options->modo 	 		 = $this->get_modo();
		$options->unic_id 		 = 'wrapper_'.$this->get_identificador_unico();*/
		
		// Component common options
		$options = parent::get_json_build_options();

		
		// Specific component options
		$options->dato = $this->get_dato();

		return (object)$options;
	}//end get_json_build_options



	/**
	* SET_LOCATOR_ORDER
	* @return bool
	*/
	public function set_locator_order($locator, $norder) {
		
		$dato = $this->get_dato();
			#dump($dato, ' dato ++ '.to_string());

		# Remove requested locator from dato
		$ar_values 		= array();
		$ar_properties 	= ['section_id','section_tipo'];
		foreach ((array)$dato as $key => $current_locator) {
			if(true===locator::compare_locators($current_locator, $locator, $ar_properties)) {
				# Store original locator
				$original_locator = $current_locator;
			}else{
				# Add to clean array
				$ar_values[] = $current_locator;
			}
		}

		if (!isset($original_locator)) {
			# locator not found
			return false;
		}

		# Add requested locator at proper position		
		# array_splice($ar_values, (int)$norder -1, 0, array($original_locator));
		array_splice($ar_values, (int)$norder, 0, array($original_locator));

    	# Update component dato
    	$this->set_dato( array_values($ar_values) );


    	return true;
	}//end set_locator_order



	/**
	* BUILD_SEARCH_QUERY_OBJECT
	* @return object $query_object
	*/
	public function build_search_query_object( $request_options=array() ) {

		$start_time=microtime(1);
	
		$options = new stdClass();
			$options->q 	 			= null;
			$options->limit  			= 10;
			$options->order  			= null;
			$options->offset 			= 0;
			$options->lang 				= DEDALO_DATA_LANG;			
			$options->id 				= 'temp';
			$options->section_tipo		= null;
			$options->select_fields		= 'default';
			$options->filter_by_locator	= false;
			$options->full_count		= true;			
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
	
		# Defaults		
		$section_tipo = $options->section_tipo;		

		# SELECT
			$select_group = [];
			$ar_related_section_tipo = common::get_ar_related_by_model('section', $this->tipo);
			if (isset($ar_related_section_tipo[0])) {	

				# Create from related terms
				$section_tipo 				= reset($ar_related_section_tipo); // Note override section_tipo here !
				$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($this->tipo,true,true);		
				foreach ($ar_terminos_relacionados as $current_tipo) {
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					if (strpos($modelo_name,'component')!==0) continue;

					#$path_base  = search_development2::get_query_path($this->tipo, $this->section_tipo, false);
					$path = search_development2::get_query_path($current_tipo, $section_tipo, false);
										
					# SELECT . Select_element (select_group)
						$select_element = new stdClass();
							#$select_element->path = array_merge($path_base, $path);
							$select_element->path = $path;

						$select_group[] = $select_element;
				}
			}

		# FILTER
			$filter_group = null;
			if ($options->filter_by_locator!==false) {

					// Is an array of objects
					$ar_section_id = [];
					foreach ((array)$options->filter_by_locator as $key => $value_obj) {
						$current_section_id = (int)$value_obj->section_id;
						if (!in_array($current_section_id, $ar_section_id)) {
							$ar_section_id[] = $current_section_id;
						}						
					}
					
					$filter_element = new stdClass();
						$filter_element->q 		= json_encode($ar_section_id);
						$filter_element->path 	= json_decode('[
		                    {
		                        "section_tipo": "'.$section_tipo.'",
		                        "component_tipo": "dummy",
		                        "modelo": "component_section_id",
		                        "name": "Portal searching"
		                    }
		                ]');
						
					$op = '$and';
					$filter_group = new stdClass();
						$filter_group->$op = [$filter_element];
			}//end if ($options->filter_by_locator!==false)


		# QUERY OBJECT	
		$query_object = new stdClass();
			$query_object->id  	   		= $options->id;
			$query_object->section_tipo = $section_tipo;
			$query_object->limit   		= $options->limit;
			$query_object->order   		= $options->order;
			$query_object->offset  		= $options->offset;
			$query_object->full_count  	= $options->full_count;			
			# Used only for time machine list
			#if ($options->forced_matrix_table!==false) {
				# add forced_matrix_table (time machine case)
			#	$query_object->forced_matrix_table = $options->forced_matrix_table;
			#}
			$query_object->filter  		= $filter_group;
			$query_object->select  		= $select_group;
			
			
		#dump( json_encode($query_object, JSON_PRETTY_PRINT), ' query_object ++ '.to_string());
		#debug_log(__METHOD__." query_object ".json_encode($query_object, JSON_PRETTY_PRINT), logger::DEBUG);totaol
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);
		

		return (object)$query_object;
	}//end build_search_query_object



}//end class
?>