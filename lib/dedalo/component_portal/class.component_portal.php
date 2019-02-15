<?php
/*
* CLASS component_portal
* version 1.0
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
				trigger_error("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP");			
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

		return true;	
	}//end __construct



	/**
	* GET_DATO
	* @return 
	*/
	public function get_dato() {
		
		$dato = parent::get_dato();

		// external mode
			#$propiedades = $this->get_propiedades();
			#if(isset($propiedades->source->mode) && $propiedades->source->mode==='external'){
			#	// set_dato_external($save=false, $changed=false, $current_dato=false)
			#	$this->set_dato_external(true, false, $dato);	// Forces save updated dato with calculated external dato ($save=false, $changed=false)
			#	$dato = $this->dato;
			#}

		return (array)$dato;
	}//end get_dato



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
			#$total_list_time = round(microtime(1)-$start_time,3);
			#$bt = debug_backtrace();
			#dump($bt, ' bt');
			#debug_log(__METHOD__." WARNING CALLED GET VALOR IN COMPONENT PORTAL !! ({$total_list_time}ms) ".$this->tipo, logger::WARNING);
		}

		$this->valor = $valor_from_ar_locators->result;

		return $this->valor;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT_OLD
	* Return component value sended to export data
	* @return string $valor
	*//*
	public function get_valor_export_OLD( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
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

				$item = new stdClass();
					$item->section_id 	= $section_id;
					$item->tipo 		= $current_tipo;
					$item->model 		= $modelo_name;
					$item->value 		= $current_value_export;

				$ar_resolved[] = $item;
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
	}//end get_valor_export_OLD
	*/



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
		

		// TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual	
			$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();

		
		// FIELDS
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
			
			foreach ($fields as $current_tipo) {				
			
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $current_tipo,
																 $section_id,
																 'list',
																 $lang,
																 $section_tipo);
				$current_value_export = $component->get_valor_export( null, $lang, $quotes, $add_id );

				$item = new stdClass();
					$item->section_id 		= $section_id;
					$item->component_tipo 	= $current_tipo;
					$item->section_tipo 	= $section_tipo;
					$item->from_section_tipo= $this->section_tipo;
					$item->model 			= $modelo_name;
					$item->value 			= $current_value_export;

				$ar_resolved[] = $item;
			}
		}//end foreach( (array)$dato as $key => $value)
		#dump($ar_resolved, ' ar_resolved ++ '.to_string($this->tipo));
		
		$valor_export = $ar_resolved;
		#dump($valor_export, ' valor_export ++ '.to_string($this->tipo));
		
		return $valor_export;
	}//end get_valor_export



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

				debug_log(__METHOD__." Empty filter value in current section. Default project value will be used (section tipo: $this->section_tipo, section_id: $this->section_id) ".to_string(), logger::WARNING);

				# Default value is used
				# Temp section case Use default project here
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_SECTION_PROJECTS_TIPO);
					$locator->set_section_id(DEDALO_DEFAULT_PROJECT);
				$component_filter_dato = [$locator];

				#$msg = __METHOD__." Error on get filter data from this section ! ";
				#trigger_error($msg);
				#$response->msg .= $msg;
				#return $response;
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
				$save_options->is_portal 	= true; // Important set true !
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
			#$ar_component_filter = (array)$section_new->get_ar_children_objects_by_modelo_name_in_section('component_filter',true);
			$ar_tipo_component_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_target_tipo, 'component_filter', $from_cache=true, $resolve_virtual=true);
			if (!isset($ar_tipo_component_filter[0])) {
				$msg = __METHOD__." Error target section 'component_filter' not found in $section_target_tipo ! ";
				trigger_error($msg);
				$response->msg .= $msg;
				return $response;		
			}else{
				$component_filter 	= component_common::get_instance('component_filter',
																	 $ar_tipo_component_filter[0],
																	 $new_section_id,
																	 'list', // Important 'list' to avoid auto save default value !!
																	 DEDALO_DATA_NOLAN,
																	 $section_target_tipo
																	);
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
		if ($section_tipo===DEDALO_FILTER_SECTION_TIPO_DEFAULT) {
			
			#$component_filter_dato 	= array($section_id=>"2"); # Será su propio filtro
			$filter_locator = new locator();
				$filter_locator->set_section_tipo($section_tipo);
				$filter_locator->set_section_id($section_id);
			$component_filter_dato = [$filter_locator];
		
		}else{

			$search_model = 'component_filter';
			$ar_children_objects_by_modelo_name_in_section = (array)$section->get_ar_children_objects_by_modelo_name_in_section($search_model,true);

			if (empty($ar_children_objects_by_modelo_name_in_section[0])) {
				throw new Exception("Error Processing Request: 'component_filter' is empty 1", 1);
			}else {
				$component_filter		= $ar_children_objects_by_modelo_name_in_section[0];
				$component_filter_dato 	= $component_filter->get_dato_generic(); // Without 'from_component_tipo' and 'type' properties
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
		}//end foreach ($dato as $rel_locator)


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

		return false;
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

			#dump($view, ' $view ++ '.to_string());

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
						if ($modelo_name!=='edit_view') continue;

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
	*//*
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
	}//end get_ar_portals_map__DEPRECATED */	



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
	
		$component = component_common::get_instance(__CLASS__,
													$tipo,
													$parent,
													$modo,
													DEDALO_DATA_NOLAN,
													$section_tipo);
	

		if ($modo==='list' || $modo==='portal_list') {
			$component->html_options->rows_limit = 1;
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
		
		$diffusion_value = null;

		# Propiedades of diffusion element that references this component
		# (!) Note that is possible overwrite real component properties injecting properties from diffusion (see diffusion_sql::resolve_value)
		# 	  This is useful to change the 'data_to_be_used' param of target component (indirectly)
		$diffusion_properties = $this->get_diffusion_properties();

		$data_to_be_used = isset($diffusion_properties->data_to_be_used) ? $diffusion_properties->data_to_be_used : 'dato';

		switch ($data_to_be_used) {
			case 'valor_list':
				$diffusion_value = $this->get_valor( $lang, 'valor_list', $separator_rows='<br>', $separator_fields=', ' );
				break;
			case 'dato_full':
				$ar_values = null;
				$dato = $this->get_dato();
				if (!empty($dato)) {
					$ar_values = [];
					foreach ((array)$dato as $current_locator) {

						// Check target is publicable
							$current_is_publicable = diffusion::get_is_publicable($current_locator);
							if ($current_is_publicable!==true) {
								debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
								continue;
							}

						$ar_values[] = $current_locator;
					}
				}
				$diffusion_value = $ar_values;
				break;
			case 'dato':
			default:
				$ar_values = null;
				$dato = $this->get_dato();
				if (!empty($dato)) {
					$ar_values = [];
					foreach ((array)$dato as $current_locator) {

						// Check target is publicable
							$current_is_publicable = diffusion::get_is_publicable($current_locator);
							if ($current_is_publicable!==true) {
								debug_log(__METHOD__." + Skipped locator not publicable: ".to_string($current_locator), logger::DEBUG);
								continue;
							}
							
						$ar_values[] = $current_locator->section_id;
					}
				}
				$diffusion_value = $ar_values;
				break;		
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

		# Custom propiedades external dato 
		$propiedades = $this->get_propiedades();

		if(isset($propiedades->source->mode) && $propiedades->source->mode === 'external'){
			
			// Forces update dato with calculated external dato	
			$this->set_dato_external(true, true);
		
		}else{

			# Force loads dato always !IMPORTANT
			$this->get_dato();

			# Save component data
			$this->Save();
		}
		
		return true;
	}//end regenerate_component



	/**
	* SET_LOCATOR_ORDER
	* @return bool
	*/
	public function set_locator_order($locator, $norder) {
		
		$dato = $this->get_dato();

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
	public static function build_search_query_object( $request_options=array() ) {

		$start_time=microtime(1);
	
		$options = new stdClass();
			$options->q 	 			= null;
			$options->limit  			= 10;
			$options->offset 			= 0;
			$options->full_count		= false;			
			$options->order_custom 		= null;
			$options->lang 				= DEDALO_DATA_LANG;
			$options->id 				= 'temp';
			$options->section_tipo		= null;
			$options->select_fields		= 'default';
			$options->filter_by_locator	= false;
			$options->tipo 				= null;			
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
		
		# Defaults		
		$section_tipo 	= $options->section_tipo;	
		$tipo 			= $options->tipo;	

		# SELECT
			$select_group = [];
			$ar_related_section_tipo = common::get_ar_related_by_model('section', $tipo);
			if (isset($ar_related_section_tipo[0])) {	

				# Create from related terms
				$section_tipo 				= reset($ar_related_section_tipo); // Note override section_tipo here !
				$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($tipo,true,true);		
				foreach ($ar_terminos_relacionados as $current_tipo) {
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					if (strpos($modelo_name,'component')!==0) continue;

					$path = search_development2::get_query_path($current_tipo, $section_tipo, false);
					
					# SELECT . Select_element (select_group)
						$select_element = new stdClass();
							$select_element->path = $path;

						$select_group[] = $select_element;
				}
			}

		# FILTER
			$filter_group = null;
			$ar_section_id = [];
			if ($options->filter_by_locator!==false) {

					// Is an array of objects					
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

		$total_locators = count($ar_section_id);

		# QUERY OBJECT	
		$query_object = new stdClass();
			$query_object->id  	   		= $options->id;
			$query_object->section_tipo = $section_tipo;
			$query_object->limit   		= $options->limit;			
			$query_object->offset  		= $options->offset;
			$query_object->full_count  	= $total_locators>0 ? $total_locators : false ;//$options->full_count;
			$query_object->order_custom = $options->order_custom;		
			# Used only for time machine list
			#if ($options->forced_matrix_table!==false) {
				# add forced_matrix_table (time machine case)
			#	$query_object->forced_matrix_table = $options->forced_matrix_table;
			#}
			$query_object->filter  		= $filter_group;
			$query_object->select  		= $select_group;

		return (object)$query_object;
	}//end build_search_query_object



	/**
	* BUILD_COMPONENT_JSON_DATA
	* @return object $json_d
	*/
	public function build_component_json_data( $build_options ) {

		$max_records 	= $build_options->max_records;
		$offset 		= $build_options->offset;
			#debug_log(__METHOD__." max_records: $max_records - offset: $offset".to_string(), logger::DEBUG);

		$propiedades 	= $this->get_propiedades();
			#debug_log(__METHOD__."  propiedades ".to_string($propiedades), logger::DEBUG);

		$modo 			= $this->get_modo();
		$tipo 			= $this->get_tipo();
		$section_tipo 	= $this->get_section_tipo();
		$parent 		= $this->get_parent();
		$label 			= $this->get_label();
		$permissions	= $this->get_component_permissions();
		$context		= $this->get_context();
		if (isset($context->context_name) && $context->context_name==='tool_time_machine') {
			$this->set_show_button_new(false);
		}

		# Custom propiedades external dato 
		if(isset($propiedades->source->mode) && $propiedades->source->mode==='external') {
			$this->set_dato_external(true);	// Forces update dato with calculated external dato					
		}

		$dato 				= $this->get_dato();
		$dato_json 			= json_encode($dato);
		$valor				= $this->get_dato_as_string();
		$component_info 	= $this->get_component_info('json');
		$exclude_elements 	= $this->get_exclude_elements();

		$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();
		$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
		
		if (isset($propiedades->html_options)) foreach ($propiedades->html_options as $key => $value) {
			$this->html_options->$key = $value;
		}

		$n_rows = count($dato);
		#if ($this->html_options->rows_limit!==false && $n_rows >= (int)$this->html_options->rows_limit) {
		#	$this->html_options->buttons = false;
		#}

		#
		# EDIT VIEW CONFIG (propiedades)
		$edit_view 		= 'full'; // Default portal view if nothing is set about
		if(isset($propiedades->edit_view)) {
			$edit_view	= $propiedades->edit_view;
			$file_view 	= $modo.'_'.$edit_view;
		}
		#debug_log(__METHOD__." propiedades - edit_view:$edit_view -  ".to_string($propiedades->edit_view), logger::DEBUG);						
		
		if (empty($dato)) {

			# Empty object
			$rows_data = new stdClass();
				$rows_data->ar_records = array();

			$this->html_options->header = false;
			$this->html_options->rows 	= false;

			#throw new Exception("Stopped Processing Request. Empty dato here !", 1);						

		}else{

			$filter_by_locator = (array)$dato;
			
			$context = new stdClass();
				$context->context_name 	= 'list_in_portal';
				$context->portal_tipo 	= $tipo;
				$context->portal_parent = $parent;

			# OPTIONS
			#$search_options = new stdClass();
			#	$search_options->modo  		= 'portal_list';
			#	$search_options->context 	= $context;

			#
			# SEARCH_QUERY_OBJECT . Add search_query_object to options
			$search_query_object_options = new stdClass();
				$search_query_object_options->filter_by_locator  = $filter_by_locator;
				$search_query_object_options->section_tipo 		 = reset($ar_target_section_tipo);
				$search_query_object_options->tipo 		 		 = $this->tipo;
				#$search_query_object_options->limit 		 	 = 0;

				# paginations options
				$search_query_object_options->limit 		 	= $max_records;
				$search_query_object_options->offset 		 	= $offset;
				#$search_query_object_options->full_count 		= count($dato);

				// Order
					$order_values = array_map(function($locator){
						return (int)$locator->section_id;
					}, $dato);					
					$item = new stdClass();
						$item->column_name 	 = 'section_id';
						$item->column_values = $order_values;		
					$search_query_object_options->order_custom = [$item];

			$search_query_object = component_portal::build_search_query_object($search_query_object_options);
				#debug_log(__METHOD__." search_query_object ".json_encode($search_query_object, JSON_PRETTY_PRINT), logger::DEBUG);
			
			# Search
			$search_develoment2  = new search_development2($search_query_object);
			$rows_data 		 	 = $search_develoment2->search();

			#
			# COMPONENT STATE DATO
			/*
			if (isset($this->component_state_tipo)) {

				$state_options = $options;
				$state_options->tipo_de_dato = 'dato';
				$state_options->layout_map 	 = array($this->component_state_tipo);
				$rows_data_state = search::get_records_data($state_options);
					dump($rows_data_state, ' rows_data_state ++ '.to_string());		
				
				# STATE UPDATE DATA
				$this->update_state($rows_data_state);
			}
			*/
		}


		#
		# COLUMNS
		$ar_columns = $this->get_ar_columns($edit_view);

		# Buttons new/add
		$show_button_new = $this->get_show_button_new();
		
		# Daggable
		$dragable_connectWith = isset($propiedades->dragable_connectWith) ? "portal_table_".$propiedades->dragable_connectWith : null;

		# max_records
		#if (isset($propiedades->max_records) && $this->max_records==null) {
		#	$this->max_records = $propiedades->max_records;
		#}

		#$total_records  = count($dato);
		#$max_records 	= $this->max_records!==null ? (int)$this->max_records : 5;
		#$offset 		= $this->offset!==null ? (int)$this->offset : 0;
		

		#################### 
		

		$ar_columns_plus = array();
		foreach ($ar_columns as $c_tipo => $c_label) {
			$label_lower = strtolower($c_label);
			if ($label_lower==='edit' || $label_lower==='rol' || $label_lower==='tag_id') {
				$name = $label_lower;
			}else{
				$name = RecordObj_dd::get_modelo_name_by_tipo($c_tipo,true);
			}

			$column_data = new stdClass();
				$column_data->label = $c_label;
				$column_data->name 	= $name;
				$column_data->tipo 	= $c_tipo;

			#$ar_columns_plus[$c_tipo] = array('label'=>$c_label,'name'=>$name);
			$ar_columns_plus[] = $column_data;
		}
		//dump($ar_columns, ' ar_columns ++ '.to_string($tipo));

		$json_d = new stdClass();
			$json_d->dato 					= $dato;
			$json_d->propiedades 			= $propiedades;
			$json_d->label 					= $label;
			$json_d->permissions 			= $permissions;
			$json_d->component_info 		= $component_info;
			$json_d->exclude_elements 		= $exclude_elements;
			$json_d->html_options 			= $this->html_options;			
			$json_d->context 				= $context;
			$json_d->rows_data 				= $rows_data;
			$json_d->ar_columns 			= $ar_columns_plus;
			$json_d->ar_target_section_tipo = $ar_target_section_tipo;
			$json_d->show_button_new 		= $show_button_new;
			$json_d->dragable_connectWith 	= $dragable_connectWith;
			$json_d->n_rows 				= $n_rows;
			$json_d->max_records 			= $max_records;
			$json_d->offset 				= $offset;

			/*
			$json_data->edit_view 			= $edit_view;
			$json_data->file_view 			= $file_view;
			$json_data->file_name 			= $file_name;
			*/
			$json_d->rows_data_values 		= array();


			$row_number=0; foreach((array)$dato as $key => $current_locator) {

				# MAX_RECORDS Limit
				if( $row_number >= $max_records+$offset ){
					break;
				}
			
				$row_number++;

				# Offset
				if ($row_number <= $offset) {
					continue; # Skip print offset records
				}

				if (!isset($current_locator->section_tipo) || !isset($current_locator->section_id)) {
					debug_log(__METHOD__."ERROR. Skipped invalid locator ".to_string($current_locator), logger::ERROR);
					trigger_error("ERROR. Skipped invalid locator ");
					continue; # Skip invalid locator
				}
				
				$current_section_id 	= $current_locator->section_id;
				$current_section_tipo 	= $current_locator->section_tipo;
				$current_component_tipo = isset($current_locator->component_tipo) ? $current_locator->component_tipo : null;
				$current_tag_id 		= isset($current_locator->tag_id) ? $current_locator->tag_id : null;

				$current_row = $this->row_in_result( $current_locator, $rows_data->ar_records );						
					#dump($current_row, ' current_row ++ '.to_string());

				#
				# Limit rows
				/*
				if ($this->html_options->rows_limit && $key > $this->html_options->rows_limit) {
					debug_log(__METHOD__." Limit number of records to sowh ".to_string($this->html_options->rows_limit), logger::DEBUG);
					break; # Limit number of records to sowh
				}
				*/

				#
				# REL_LOCATOR : locator like object
					$rel_locator 								= json_encode($current_locator);
					$json_d->rows_data_values[$key]['locator'] 	= $rel_locator;

				#
				# SECTION ID
					$section_id 		 = $current_section_id;
					$target_section_tipo = $current_section_tipo;

				#debug_log(__METHOD__." **************** here  - modo:$modo - key:$key - ar_columns ".json_encode($ar_columns, JSON_PRETTY_PRINT), logger::DEBUG);	
				
				# Permissions of target section. Applied to delete button
				$permission_section = common::get_permissions($target_section_tipo,$target_section_tipo);
				
				#
				# COLUMNS
					$sort_id = !empty($rel_locator) ? $rel_locator : 0;
					$table='';															
					foreach ($ar_columns as $column_tipo => $column_label) {

						#
						# EDIT COLUMN
						if ($column_tipo==='edit') {
							if (!$this->html_options->id_column) continue;

							# SECTION_ID TEXT
							$column_edit_value = '';

							#
							# EDIT BUTTON
								$context_http_query = http_build_query($context);
								$url  = htmlspecialchars("?t=$target_section_tipo&id=$section_id&m=edit&portal_section_tipo={$section_tipo}&{$context_http_query}");
								$url .= "&locator=". urlencode($rel_locator);
								$url .= "&top_tipo=".TOP_TIPO."&top_id=".TOP_ID;
								$url .= "&exclude_elements=".$exclude_elements;

								# Breadcrumb : add bc_path = url vars
								$bc_path = tools::get_bc_path();
									#dump($bc_path, ' bc_path');
								$url 	.= "&bc_path=". base64_encode($bc_path);

								# id_path
								$id_path = tools::get_id_path($section_tipo.'.'.$section_id);
									#dump($section_id_path,"id_path - $section_id");
								$url 	.= "&id_path=". $id_path;								

								# Title
								$title = label::get_label('editar_registro').' '.$section_id;
								if (!empty($current_tag_id)) {
									$title .= ' - '.$current_component_tipo.' - '.$current_tag_id;
								}

								if(SHOW_DEVELOPER===true) {
									$title .= "\n url:$url \n modo $modo, context $context->context_name";
								}
								$edit_button = '';
								if (empty($current_row->section_id)) {
									$edit_button .= "<div class='div_image_link link' title=\"$title\" onclick=\"alert('Deleted record')\"> ! </div>";
								}else{
									$additional_css_style = $permissions <2 ? 'style="height: 100%;"' : '' ;
									$edit_button .= "<a href=\"javascript:void(0);\" onclick=\"component_portal.open_record(this,'$url')\" ";
									$edit_button .= "id=\"portal_link_open_{$tipo}_{$section_tipo}_{$section_id}\" ";
									$edit_button .= "class=\"id_column_buttons button_edit link\" ";
									$edit_button .= $additional_css_style;
									$edit_button .= "title=\"$title\">";
										# SECTION_ID TEXT									
										$edit_button .= "<span class=\"section_id_number\">";										
										$edit_button .= $section_id;										
										$edit_button .= "</span>";									
									$edit_button .= "</a>";											
								}
								$column_edit_value .= $edit_button;
							

							#
							# DELETE RECORD BUTTON
								$delete_button = '';							
								if ($permissions>=2) {

									# Defaults restrictive
									$permission_target_section_delete = 0;
									# Try to locate delete button inside
									$delete_button_objects = section::get_ar_children_tipo_by_modelo_name_in_section($target_section_tipo, array('button_delete'), true, true, true, true);
									if (isset($delete_button_objects[0])) {
										$permission_target_section_delete = common::get_permissions($target_section_tipo, $delete_button_objects[0]);
									}
									
									$title	= label::get_label('borrar') .' '. label::get_label('recurso');													
									$delete_button .= "<a href=\"javascript:void(0);\" class=\"id_column_buttons button_delete link\" ";
									$delete_button .= "onclick=\"component_portal.open_delete_dialog(this)\" ";
									$delete_button .= "data-rel_locator='{$rel_locator}' ";
									$delete_button .= "data-permission_target_section_delete=\"{$permission_target_section_delete}\" ";
									$delete_button .= "title=\"$title\">";							
									$delete_button .= "</a>";								
								}

							$json_d->rows_data_values[$key][$column_tipo] = array('edit'   => $column_edit_value,
																				  'delete' => $delete_button);

						#
						# TAG_ID
						}else if($column_tipo==='tag_id') {

							if( isset($current_locator->component_tipo) && isset($current_locator->tag_id) ) {

								$component_name = RecordObj_dd::get_termino_by_tipo($current_locator->component_tipo);
								$tag_id_column_value = '';
								$tag_id_column_value .= "<div class=\"tag_id tooltip_active\" title=\"$component_name\">";											
								$tag_id_column_value .= $current_locator->tag_id;
								$tag_id_column_value .= "</div>";

								$json_d->rows_data_values[$key][$column_tipo] = $tag_id_column_value;
							}

						#
						# DEDALO SEMANTICS COLUMNS
						}else if ( strpos($column_tipo, 'ds_')===0 ) {

							# Convert column name from 'ds_myname' to 'myname'
							$ds_key = substr($column_tipo, 3);

							# Mandatory vars to create semantic_node column
							$semantic_wrapper_id = $ds_key.'_'.$current_locator->section_tipo.'_'.$current_locator->section_id;
							$ds_element 		 = isset($current_locator->ds->$ds_key) ? $current_locator->ds->$ds_key : null;
								#dump($current_locator, ' current_locator ++ '.to_string());
								#dump($ds_element, ' ds_element ++ '.to_string());
							
							$ds_value = '';
							$ds_value .= "<div class=\"td_ds\">";
							ob_start();
							include(DEDALO_LIB_BASE_PATH . '/tools/tool_semantic_nodes/html/tool_semantic_nodes_node.phtml');
							$ds_value .= ob_get_clean();
							$ds_value .= "</div>";

							$json_d->rows_data_values[$key][$column_tipo] = $ds_value;				

						#
						# COMPONENTS COLUMNS
						}else{

							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($column_tipo, true);

							# aditional td css selectors
							$td_css_selector = 'td_'.$modelo_name.' td_'.$column_tipo. ' column_'.$column_tipo;
								#dump($td_css_selector, ' td_css_selector ++ '.to_string());

							# Row value default
							/*
							if (!isset($current_row[$column_tipo])) {
								$table .= "<td class=\"$td_css_selector\">"; 	dump($current_row[$column_tipo], ' excluded column_tipo ++ '.to_string($column_tipo));
								$table .= ' '; // User with NO access to this column
								$table .= "</td>";
								continue;
							}
							*/
							#dump($modelo_name, ' PORTAL EDIT modelo_name ++ '.to_string($column_tipo));

							# RECORDS FROM DATABASE
							# $column_value = isset($current_row[$column_tipo]) ? $current_row[$column_tipo] : null;
							$column_value = isset($current_row->$column_tipo) ? $current_row->$column_tipo : null;
						

							# Detect and avoid structure errors (portal list with deprecated elements for example)
							if (strpos($modelo_name, 'component_')===false) {
								dump($modelo_name, ' SKIPPED wrong modelo_name ++ column_tipo: '.to_string($column_tipo));
								if(SHOW_DEBUG===true) {
									throw new Exception("Error Processing Request", 1);
								}
								continue;
							}

							$render_list_mode = 'portal_list';
							// Verificar este supuesto !!!
			
							switch ($edit_view) {
								case 'view_mosaic':
									$render_list_mode = 'portal_list_view_mosaic';
									if ($modelo_name!=='component_image' && $modelo_name!=='component_av' && $modelo_name!=='component_portal') {
										# Only accept component_image as column
										debug_log(__METHOD__." Skipped component $column_label ($column_tipo) modelo_name: $modelo_name. Only component_image/component_av/component_portal are valid in mosaic mode ", logger::DEBUG);
										continue 2;
									}
									break;
								case strrpos($edit_view, 'view_tool_description'):
									if ($modelo_name==='component_portal') {
										$render_list_mode = 'portal_list_view_mosaic';
									}else{
										$render_list_mode = 'edit';
									}
									break;
								default:
									#$render_list_mode = 'edit';
									break;
							}
							#debug_log(__METHOD__." ++++++++++++++++++++++++++ render_list_mode ".to_string($render_list_mode), logger::ERROR);
					
		
							# Overwrite default list mode when need. Set component propiedades 'elements_list_mode' as you want, like edit..
							if (isset($propiedades->elements_list_mode->$column_tipo->mode)) {
								$render_list_mode = $propiedades->elements_list_mode->$column_tipo->mode;
							}
	
							if ($render_list_mode==='edit') {
								$current_component = component_common::get_instance( $modelo_name,
																					 $column_tipo,
																					 $section_id,
																					 $render_list_mode,
																					 DEDALO_DATA_LANG,
																					 $target_section_tipo);
								$value = $current_component->get_html();
							}else{
								$value = (string)$modelo_name::render_list_value($column_value, // value string from db
																			 $column_tipo, // current component tipo
																			 $section_id, // current portal row section id
																			 $render_list_mode, // mode get form properties or default
																			 DEDALO_DATA_LANG, // current data lang
																			 $target_section_tipo, // current section tipo
																			 $section_id, // Current portal parent
																			 $current_locator, // Used by text_area to select fragment
																			 $tipo // Current component_portal tipo
																			);	
							}

							#
							# TD COLUMN					
							if (is_string($value)) {						
								$json_d->rows_data_values[$key][$column_tipo] = $value;
							}else{						
								$json_d->rows_data_values[$key][$column_tipo] = to_string($value);
							}
						}//end if ($modelo_name=='component_portal')
					}//end foreach ($ar_columns as $column_tipo => $column_label)


				
			
			#$row_number++;
			}//end foreach((array)$dato as $key => $current_locator)
			#dump($dato, ' dato ++ '.to_string());
			#dump($json_d->rows_data_values, '$json_d->rows_data_values ++ '.to_string());
			#dump($json_d, ' json_d ++ '.to_string());

			# Important : Rebuild array indexes to avoid objects when use offset
			$json_d->rows_data_values = array_values($json_d->rows_data_values);

			// working here (!)
				if(SHOW_DEBUG===true && DEVELOPMENT_SERVER===true) {
					//if ($tipo==='oh17') 
					//$json_d->json_rows = section::build_json_rows($rows_data,'list');					
				}
				
		

		return $json_d;
	}//end build_component_json_data



	/*
	* GET_CALCULATION_DATA
	* @return $data
	* get the data of the component for do a calculation
	*/
	public function get_calculation_data($options=null) {

		$ar_data 			= [];
		$ref_component_tipo = $options->get_data_of_component_tipo;
		$dato 				= $this->get_dato();

		if(empty($dato)){
			return false;
		}

		foreach ($dato as $current_dato) {
			$section_id 	= $current_dato->section_id;
			$section_tipo 	= $current_dato->section_tipo;

			$RecordObj_dd 		= new RecordObj_dd($ref_component_tipo);
			$lang 				= ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
			$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($ref_component_tipo,true);						
			$current_componet 	= component_common::get_instance($modelo_name,
																 $ref_component_tipo,
																 $section_id,
																 'edit',
																 $lang,
																 $section_tipo);
			$ar_data[] = $current_componet->get_valor();
		}

		return $ar_data;
	}//end get_calculation_data



}//end class
?>