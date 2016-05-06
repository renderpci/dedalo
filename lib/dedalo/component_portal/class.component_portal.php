<?php
/*
* CLASS COMPONENT PORTAL
*/


class component_portal extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	public $show_button_new = true;		# default show: true
	public $ar_target_section_tipo ;	# Used to fix ar section tipo (calculado a partir de los componentes relacionado de modelo section)
	public $target_section_tipo;		# Used in tool portal (resiest by url)
	public $portal_parent ;				# Used to fix current portal_parent in button new
	
	public $layout_map;
	public $ar_columns;					# Array of columns (tipo=>label)

	# HTML Options
	public $html_options;

	
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		if(SHOW_DEBUG) {
			$component_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			global$TIMER;$TIMER[__METHOD__.'_' .$component_name.'_IN_'.$tipo.'_'.$modo.'_'.$parent.'_'.microtime(1)]=microtime(1);
		}
		
		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;


		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		
		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);				
			}
		}
		/*
		# EDIT : Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if($modo=='edit' && empty($id)) {
			

			# Si no existe, creamos un registro, SI o SI
			if(empty($id)) {				
				if( !empty($tipo) && intval($parent)>0 ) {
					
					$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
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
		if ($this->modo=='edit') {
			$this->notify_load_lib_element_tipo_of_portal();
		}

		#$dato = $this->get_dato(); 	dump($dato,"dato portal tipo:$tipo - parent:$parent");

		# HTML Options defaults
		$this->html_options = new stdClass();
			$this->html_options->header 	= true;
			$this->html_options->rows   	= true;
			$this->html_options->id_column 	= true;
			$this->html_options->rows_limit	= false;
			$this->html_options->buttons 	= true;
			$this->html_options->sortable 	= true;


		if(SHOW_DEBUG) {
			$component_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			global$TIMER;$TIMER[__METHOD__.'_' .$component_name.'_OUT_'.$tipo.'_'.$modo.'_'.$parent.'_'.microtime(1)]=microtime(1);
		}		
	}//end __construct

	

	# GET DATO : 
	public function get_dato() {
		$dato = parent::get_dato();
		if (!empty($dato) && !is_array($dato)) {
			#dump($dato,"dato");
			trigger_error("Error: Portal dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent");
			$this->set_dato(array());
			$this->Save();
		}
		if ($dato==null) {
			$dato=array();
		}
		#$dato = json_handler::decode(json_encode($dato));	# Force array of objects instead default array of arrays

		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if(SHOW_DEBUG) {
			
		}
		parent::set_dato( (array)$dato );
	}

	# GET_VALOR OLD
	public function get_valor_OLD() {		
		$dato = $this->get_dato();
		return $dato;
	}
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
		
		if(SHOW_DEBUG) {
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
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG ) {
		
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		#$valor = $this->get_valor($lang);
		$dato = $this->get_dato();
		if (empty($dato)) {
			if(SHOW_DEBUG) {
				#return "PORTAL: ";
			}
			return '';
		}

		#
		# TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual	
		$ar_terminos_relacionados = (array)$this->RecordObj_dd->get_relaciones();
			#dump($ar_terminos_relacionados, ' ar_terminos_relacionados');
		#
		# FIELDS
		$fields=array();
		$ar_skip = array(MODELO_SECTION, $exclude_elements='dd1129');
		foreach ($ar_terminos_relacionados as $key => $ar_value) {
			$modelo = key($ar_value);
			$tipo 	= $ar_value[$modelo];
			if (!in_array($modelo, $ar_skip)) {				
				$fields[] = $tipo;
			}
		}
		#dump($fields, ' fields ');

		$ar_resolved=array();
		foreach( (array)$dato as $key => $value) {
			#dump($value, ' value ++ '.to_string());
			$section_tipo 	= $value->section_tipo;
			$section_id 	= $value->section_id;

			$ar_resolved[$section_id][] = $section_id;
			
			foreach ($fields as $current_tipo) {				
			
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo);
				$component 		= component_common::get_instance($modelo_name,
																 $current_tipo,
																 $section_id,
																 'list',
																 $lang,
																 $section_tipo);
				$ar_resolved[$section_id][] = $component->get_valor_export(null,$lang);
			}
		}
		#dump($ar_resolved, ' $ar_resolved ++ '.to_string());

		$valor_export='';
		foreach ($ar_resolved as $key => $ar_value) {
			$valor_export .= implode("\t", $ar_value) . "\n";
		}
		$valor_export = trim($valor_export);

		if(SHOW_DEBUG) {
			#return "PORTAL: ".$valor_export;
		}
		return $valor_export;

	}#end get_valor_export


	# GET_DATO_AS_STRING
	public function get_dato_as_string() {
		$dato = (array)$this->get_dato();
		$string='';
		foreach ($dato as $key => $value) {
			foreach ($value as $current_key => $current_value) {
				$string .= "[$key] $current_key -> $current_value \n";
			}
		}
		return $string;
	}

	/**
	* NOTIFY_LOAD_LIB_ELEMENT_TIPO_OF_PORTAL : Force notify portal related components load for give css/js support
	*/ 
	protected function notify_load_lib_element_tipo_of_portal() {		
		
		$ar_children_tipo=array();

		$ar_relaciones = (array)$this->RecordObj_dd->get_relaciones();
			#dump($ar_relaciones, ' ar_relaciones');
		foreach ($ar_relaciones as $key => $value) {

			$modeloID 	 = key($value);
			$modelo_name = RecordObj_dd::get_termino_by_tipo($modeloID, null, true);
				#dump($modelo_name,"modelo_name $modeloID");

			if ($modelo_name=='exclude_elements') {
				continue;
			}

			# Notify element load to common
			common::notify_load_lib_element_tipo($modeloID, $modelo_name, $this->modo);
			if(SHOW_DEBUG) {
				#dump($modelo_name, ' modeloID - '.$modeloID." - ".$this->modo);
			}				
		}

		return;		
	}


	


	/**
	* Save : Overwrite Save common
	*/
	public function Save() {		

		# Salvamos de forma estándar
		$result = parent::Save();
		
		#
		# SEARCH_OPTIONS : Clear old data and force recreate
			if (isset($_SESSION['dedalo4']['config']['search_options'])) {

				$component_portal_tipo  = $this->get_tipo();
				$section_tipo 			= $this->get_section_tipo();
				$tipo 					= $this->get_tipo();
				$parent 				= $this->get_parent();
				$modo 					= $this->get_modo();

				#
				# REFERENCE SEARCH_OPTIONS_SESSION_KEY: 'portal_'.$modo.'_'.$section_tipo.'_'.$tipo.'_'.$parent;				

				$search_options_key = 'portal_'.$modo .'_'.$section_tipo.'_'.$tipo.'_';//.$parent;
					#dump($current_search_options_key, ' current_search_options_key ++ '.to_string());
				foreach ($_SESSION['dedalo4']['config']['search_options'] as $current_search_options_key => $value) {
					
					if (strpos($current_search_options_key, $search_options_key)!==false ) {
						unset($_SESSION['dedalo4']['config']['search_options'][$current_search_options_key]);					
						debug_log(__METHOD__." Deleted session search_options_key: $current_search_options_key ", logger::DEBUG);
					}
				}
			}		

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
			debug_log(__METHOD__." Called update_state with empty or invalid locator: (No component_state was update) ".to_string($rel_locator), logger::WARNING);
			return false;
		}

		# Calculate portal locators component state dato
		$component_state_tipo 	= section::get_ar_children_tipo_by_modelo_name_in_section($rel_locator->section_tipo, 'component_state', true, true);
		if (isset($component_state_tipo[0])) {
			$component_state_tipo = $component_state_tipo[0];

			$component_state 	= component_common::get_instance('component_state',
																 $component_state_tipo,
																 $rel_locator->section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $rel_locator->section_tipo);

			debug_log(__METHOD__." Updated and saving component_state ($component_state_tipo - $rel_locator->section_id) with locator: ".to_string($rel_locator));

			return $component_state->Save();				

		}else{
			# No component_state exists
			if(SHOW_DEBUG) {
				debug_log(__METHOD__." Called update_state ($rel_locator->section_id) in section without component_state. ".to_string($rel_locator));
			}
		}		
		
	}#end update_state

	
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
			if(SHOW_DEBUG) {
				debug_log(__METHOD__." Called remove_state_from_locator in section without component_state. ".to_string($rel_locator));
			}
		}
	}
	



	






	/**
	* REMOVE_RESOURCE_FROM_PORTAL
	* @see Previamente se habrá verificado que no se usa el recurso en otros portales
	*/
	/*
	  NOTA: Por solucionar el caso en que el mismo recurso se usa en varios portales de la misma sección (ahora se 
	  borran todos pero no se avisa ni se refrescan los portales adicionales) !!!!!!!!!!!!
	*/
	public function remove_resource_from_portal($rel_locator, $portal_tipo=NULL) {

		if(empty($portal_tipo)) {
			throw new Exception("Error Processing Request. portal_tipo is mandatory", 1);
		}

		# 3 Remove main resource record
		# Como paso final, eliminamos el registro en sí de la DDBB
		$section_id 	= $rel_locator->section_id;	
		$section_tipo 	= $rel_locator->section_tipo;
			#dump($section_tipo, 'section_tipo - section_tipo2:'.$section_tipo, array());die();
		
		$section = section::get_instance($section_id, $section_tipo);
		$delete  = $section->Delete($delete_mode='delete_record');

		return 'ok';
		
	}#end remove_resource_from_portal
	
	





	
	

	




	/**
	* NEW_PORTAL_RECORD
	* Insert new portal record in DB (fired by trigger)
	* @return int section_id
	*/
	public static function create_new_portal_record( $portal_parent, $portal_tipo, $portal_section_target_tipo, $top_tipo, $top_id, $section_tipo ) {

		#
		# 1 PROYECTOS GET. Obtenemos los datos del filtro (proyectos) de la sección actual para heredarlos en el registro del portal
		$parent_section_id		= $portal_parent;		
		$parent_section_tipo	= $section_tipo;		
		$section_parent 		= section::get_instance($parent_section_id, $parent_section_tipo);
			#dump($section_parent,"section_parent");die();		

		# 1.1 PROYECTOS DE PROYECTOS : Portales de la sección proyectos
		if ($parent_section_tipo==DEDALO_SECTION_PROJECTS_TIPO) {
			
			$component_filter_dato 	= array($parent_section_id=>"2"); # Será su propio filtro
		
		}else{

			$ar_children_objects_by_modelo_name_in_section = (array)$section_parent->get_ar_children_objects_by_modelo_name_in_section('component_filter',true);
				#dump($ar_children_objects_by_modelo_name_in_section, '$ar_children_objects_by_modelo_name_in_section'. " $parent_section_id, $parent_section_tipo");die();

			if (empty($ar_children_objects_by_modelo_name_in_section[0])) {
				throw new Exception("Error Processing Request: 'component_filter' is empty 1", 1);				
			}else {
				$component_filter_parent	= $ar_children_objects_by_modelo_name_in_section[0];
				$component_filter_dato 		= $component_filter_parent->get_dato();
					#dump($component_filter_parent,'COMPONENT_FILTER_PARENT DATO');
			}
			#dump($section_parent,"section_parent (parent_section_id:$parent_section_id, parent_section_tipo:$parent_section_tipo)");die();
		}


		#
		# 2 SECTION . Creamos un nuevo registro vacío en la sección a que apunta el portal	
		# Section record . create new empty section in target section tipo
		# TRUE : Se le pasa 'true' al comando "Save" para decirle que SI es un portal		
		$section_new	= section::get_instance(NULL, $portal_section_target_tipo);

		$save_options = new stdClass();
			$save_options->is_portal 	= true;
			$save_options->portal_tipo 	= $portal_tipo;
			$save_options->top_tipo 	= $top_tipo;
			$save_options->top_id 		= $top_id;
		
		# Inverse locator for store into the section
		$portal_inverse_locator = new locator();
			$portal_inverse_locator->set_section_id($portal_parent);
			$portal_inverse_locator->set_section_tipo($section_tipo);			
			$portal_inverse_locator->set_component_tipo($portal_tipo);
		
		$section_new->add_inverse_locator($portal_inverse_locator);
		$section_id = $section_new->Save( $save_options );
		

		if($section_id<1) {
			$msg = __METHOD__." Error on create new section: new section_id is not valid ! ";
			trigger_error($msg);
			if(SHOW_DEBUG) {
				$msg .= " (Data: portal_section_target_tipo:$portal_section_target_tipo, portal_parent:$portal_parent - $section_id)";
				throw new Exception($msg, 1);
			}
			return;
		}
		#dump($section_new,"section_new (portal_section_target_tipo:$portal_section_target_tipo) section_id:$section_id");

		#
		# 3 PROYECTOS SET. Creamos un nuevo registro de filtro ('component_filter') hijo de la nueva sección creada, que heredará los datos del filtro de la sección principal
		# Set target section projects filter settings as current secion
		# Los proyectos se heredan desde el registro actual donde está el portal hacia el registro destino del portal
			
			# SECTION VIRTUAL CASE
			/* DESACTIVO 5-4-2015 TEST (Pasaremos la responsabilidad de resolver los hijos de la sección a la misma, sea virtual o no)
			$section_real_tipo = $section_new->get_section_real_tipo();
			if($section_real_tipo!=$portal_section_target_tipo) {
				# Change tipo
				$section_new->set_tipo($section_real_tipo);
			}
			*/

		$ar_component_filter = (array)$section_new->get_ar_children_objects_by_modelo_name_in_section('component_filter',true);
			#dump($ar_component_filter,"ar_component_filter for section_id:$section_id -  section_tipo:$portal_section_target_tipo");
		if (empty($ar_component_filter[0])) {
			throw new Exception("Error Processing Request: 'component_filter' is empty 2", 1);				
		}else {
			$component_filter	= $ar_component_filter[0];
			$component_filter->set_dato($component_filter_dato);
			$component_filter->Save();
				#dump($component_filter,"component_filter in portal section id:$section_id");
		}

		#
		# 4 PORTAL . Insertamos en dato (el array de 'id_madrix' del component_portal actual) el nuevo registro creado
		# Portal dato. add current section id to component portal dato array
		#$component_portal 	= new component_portal($portal_tipo, $portal_parent);
		$component_portal 	= component_common::get_instance('component_portal', $portal_tipo, $portal_parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		$dato 				= $component_portal->get_dato();
		
		# Basic locator 
		$locator = new locator();
			$locator->set_section_id($section_id);
			$locator->set_section_tipo($portal_section_target_tipo);
		
		#$dato_edit 			= component_common::add_locator_to_dato($locator, $dato);	
		#$component_portal->set_dato($dato_edit);
		$component_portal->add_locator($locator);		
		$component_portal->Save();

		return $section_id;
	}



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
			#dump($dato, 'dato', array());		
							
		if(is_array($dato)) foreach ($dato as $rel_locator) {

			#dump($rel_locator,"rel_locator ");
			if (!is_object($rel_locator)) {
				if(SHOW_DEBUG) {
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
			#dump($rel_locator,'$rel_locator');

		}# end foreach ($dato as $rel_locator)

		#dump($ar_section_relations,'$ar_section_relations');

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
	}


	
	/**
	* ADD_LOCATOR
	* @param object $rel_locator
	* @return bool true if added, false if not
	*/
	public function add_locator($rel_locator) {
	
		$dato 			= $this->get_dato();
		$new_ar_dato	= component_common::add_object_to_dato((object)$rel_locator, (array)$dato);
		$this->set_dato($new_ar_dato);

		# Add inverse locator into the destination section
		$section_to_add = section::get_instance($rel_locator->section_id, $rel_locator->section_tipo);

		$portal_inverse_locator = new locator();
			$portal_inverse_locator->set_section_id($this->parent);
			$portal_inverse_locator->set_section_tipo($this->section_tipo);
			$portal_inverse_locator->set_component_tipo($this->tipo);

		$section_to_add->add_inverse_locator($portal_inverse_locator);
		$section_to_add->Save();

		debug_log(__METHOD__." Added portal locator and section inverse locator from portal. ".to_string($rel_locator), logger::DEBUG);

		return true;
	}


	/**
	* REMOVE_LOCATOR
	* @param object $rel_locator
	* @return bool true if added, false if not
	*/
	public function remove_locator($rel_locator) {

		$dato 		 = $this->get_dato();
		$new_ar_dato = component_common::remove_object_in_dato((object)$rel_locator, (array)$dato);
		$this->set_dato($new_ar_dato);		

		# Remove inverse locator into the destination section
		$section_to_remove = section::get_instance($rel_locator->section_id, $rel_locator->section_tipo);

		$portal_inverse_locator = new locator();
			$portal_inverse_locator->set_section_id($this->parent);
			$portal_inverse_locator->set_section_tipo($this->section_tipo);			
			$portal_inverse_locator->set_component_tipo($this->tipo);

		$section_to_remove->remove_inverse_locator($portal_inverse_locator);
		$section_to_remove->Save();

		debug_log(__METHOD__." Remove portal locator and section inverse locator from portal. ".to_string($rel_locator), logger::DEBUG);

		return true;
	}


	/**
	* REMOVE_INVERSE_LOCATOR_REFERENCE
	* @param object $rel_locator
	*/
	public function remove_inverse_locator_reference($rel_locator) {

		$dato = $this->get_dato();
		foreach ((array)$dato as $key => $current_locator) {
			
			if ($current_locator->section_id==$rel_locator->section_id &&
				$current_locator->section_tipo==$rel_locator->section_tipo) {
				// Remove all references, to whole section and partial section matches
				unset($dato[$key]);
			}
		}
		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, object is created)
		$dato = array_values($dato);	
		
		$this->set_dato($dato);

		debug_log(__METHOD__." Remove inverse_locator from portal dato (Not saved yet). ".to_string($rel_locator), logger::DEBUG);

		return true;
	}


	/**
	* REMOVE_LOCATOR_FROM_PORTAL
	* Elimina sólo la referencia en el portal actual (borra el rel_locator pasado del array de datos del portal)
	*//*
	public function remove_locator_from_portal($rel_locator) {

		# current dato array (json like ["4125.0.0","4521.dd20.1"]) IMPORTANT! : Use always '$this->dato' to force update value
		$ar_dato	= $this->dato;
		# remove current element (rel_locator) from dato array
		$ar_dato 	= component_common::remove_object_in_dato($rel_locator, (array)$dato);
		# aply changes to curren object dato IMPORTANT! : Use always '$this->set_dato' to force update db on save	
		$this->set_dato($ar_dato);
		# save dato
		$this->Save();
			#dump($this->dato,"this->dato eliminado rel_locator:$rel_locator");

		return true;
	}# /remove_locator_from_portal
	*/

	

	






	/**
	* GET_LAYOUT_MAP
	* Calculate current layout map to generate portal html
	* Cases:
	* 	1. Modo 'edit' : Uses related terms to build layout map (default)
	* 	2. Modo 'list' : Uses childrens to build layout map
	*/
	public function get_layout_map() {

		if (isset($this->layout_map) && !empty($this->layout_map)) return $this->layout_map;
		
		$ar_related=array();
		switch ($this->modo) {
			case 'list':
				# CASE SECTION LIST IS DEFINED
				$ar_terms = (array)RecordObj_dd::get_ar_childrens($this->tipo); 	#dump($ar_terms, " childrens $this->tipo".to_string());				
				foreach ($ar_terms as $current_term) {
					# Locate 'section_list' in childrens
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_term,true);
					if ($modelo_name=='section_list') {
						# Use related terms as new list
						$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);
						break;
					}
				}
				# FALLBACK RELATED WHEN SECTION LIST IS NOT DEFINED
				if (empty($ar_related)) {
					# If not defined sectiopn list
					$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);
						#dump($ar_related, " ar_related ".to_string());
				}
				break;
			
			case 'edit':
			default:
				$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);
				break;
		}	
		#dump( $ar_related,"relacionados $this->tipo");#die();

		# PORTAL_SECTION_TIPO : Find portal_section_tipo in related terms and store for use later
		foreach ((array)$ar_related as $key => $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				#dump($modelo_name,"modelo_name $modelo");

			if ($modelo_name=='component_state') {
				$this->component_state_tipo = $current_tipo; // Store to reuse in custom layout map later
			}
			if ($modelo_name=='section') {
				$this->ar_target_section_tipo[] = $current_tipo; // Set portal_section_tipo find it
				unset($ar_related[$key]); // Remove self section_tipo from array of components
				//break;
			}
			if ($modelo_name=='exclude_elements') {
				unset($ar_related[$key]); // Remove self section_tipo from array of components
			}
		}
		$this->layout_map = array($this->tipo => $ar_related);

		#dump($this->layout_map,"layout_map inmodo $this->modo");

		return $this->layout_map;

	}//end get_layout_map


	/**
	* GET_AR_COLUMNS
	*/
	public function get_ar_columns() {

		if(isset($this->ar_columns)) return $this->ar_columns;
		
		#$ar_hcolumns = array_keys( reset($rows_data->result[0]) );
		#$ar_hcolumns  = reset($rows_data->options->layout_map);

		$layout_map  = $this->get_layout_map();
		$ar_hcolumns = reset($layout_map);
			#dump($ar_hcolumns,"ar_hcolumns ");

		$ar_columns = array();

		# First column (fixed)
		$ar_columns['edit'] = label::get_label('edicion');

		# Next columns
		foreach ((array)$ar_hcolumns as $value) {			
			$ar_columns[$value] = RecordObj_dd::get_termino_by_tipo($value,DEDALO_DATA_LANG,true);			
		}
		#dump($ar_columns,"ar_columns ");

		$this->ar_columns = $ar_columns;
		
		return $this->ar_columns;

	}//end get_ar_columns






	/**
	* PROPAGATE_FILTER
	* Actualiza los valores de proyecto de los recursos asociados al portal	
	*/
	public function propagate_filter__DEPRECATED($dato_filter) {

		return true;	// !!!!!! STOPED


		#dump($dato_filter,"dato_filter RECIBIDO");		
		$start_time=microtime(1);

		if(SHOW_DEBUG) {
			debug_log(__METHOD__." Disabed method !! ".to_string(), logger::DEBUG);			
		}	

		# Buscamos todos los recursos (id_section) utilizados por este portal ej. [456,785,2341,..]
		$dato_portal = $this->get_dato();
			#dump($dato_portal,'dato_portal');			

		# Si el dato de este filtro es null, no se propagará el dato (así se conservará en el recurso el último proyecto)
		if (!is_array($dato_portal) || empty($dato_portal) || empty($dato_portal[0])) {
			if(SHOW_DEBUG) {
				#dump($dato_portal,"returned false portal_tipo(".$this->tipo.") this method: ".__METHOD__);
			}
			return false;
		}


		#
		# REL_LOCATORS
		# Recorremos las referencias a cada uno de los registros (secciones) de este portal
		# y extraeremos sus datos de component_filter almacenándolos en un array general combinado
		#$ar_references_resolved=array();	
		foreach ($dato_portal as $rel_locator) {

			#dump($rel_locator,"rel_locator");
			if (empty($rel_locator->section_id)) {
				continue;
			}
	
			#$locator_ob 	= component_common::get_locator_relation_as_obj($rel_locator);
			$current_parent 		= $rel_locator->section_id;
			$current_section_tipo 	= $rel_locator->section_tipo;

								
			
			$ar_combined_component_filter_dato=array();
			/*foreach ($references as $section_id => $section_tipo) {					

				$section 				= section::get_instance($section_id, $current_section_tipo);
				$component_filter 		= $section->get_ar_children_objects_by_modelo_name_in_section('component_filter')[0]; # Filtro de la sección que llama al registro
				$component_filter_dato 	= (array)$component_filter->get_dato();
				foreach ($component_filter_dato as $key => $value) {
					$ar_combined_component_filter_dato[$key] = $value;
				}
			}
			*/

			$section 				= section::get_instance($current_parent, $current_section_tipo);
			$component_filter 		= $section->get_ar_children_objects_by_modelo_name_in_section('component_filter')[0]; # Filtro de la sección que llama al registro
			$component_filter_dato 	= (array)$component_filter->get_dato();
			foreach ($component_filter_dato as $key => $value) {
				$ar_combined_component_filter_dato[$key] = $value;
			}

			# Ahora usamos el valor combinado para el dato del filtro en la sección destino (el registro del portal). Usar el 'section_real_tipo' ya que las virtuales no tienen filtro

			 # Filtro de la sección del registro llamado desde un portal
			$component_filter->set_dato($ar_combined_component_filter_dato);
			$component_filter->set_propagate_filter(true);
			$component_filter->Save();
		}//foreach ($dato_portal as $rel_locator)
		#dump($ar_combined_component_filter_dato, 'ar_combined_component_filter_dato dato_filter:'.print_r($dato_filter,true));	#die();

		return true;

	}//END propagate_filter__DEPRECATED


	/**
	* GET_ALL_RESOURCE_REFERENCES
	* Devuelve el array de section id matrix de las secciones en las cuales hay portales con referencias a este locator
	*/
	public static function get_all_resource_references__DEPRECATED($rel_locator, $tipo=NULL) {		
		
		if(SHOW_DEBUG) $start_time = start_time();

		if(empty($tipo)) {
			throw new Exception("Error Processing Request. Tipo is mandatory", 1);			
		}
		

		$matrix_table	= common::get_matrix_table_from_tipo($tipo);
		
		$strQuery='';
		/* 
		# METHOD 1 . SEARCHING ONLY IN PORTALS
		# All portals tipo
		# Limitamos la búsqueda a los registros con modelo 'component_portal' 
		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name('component_portal');
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name');#die();
		$strQuery.=" 
		SELECT id, datos#>>'{section_tipo}' as section_tipo 
		FROM $matrix_table 
		WHERE 
		";
		foreach ($ar_terminoID_by_modelo_name as $current_tipo) {
			$strQuery.= " '\"$rel_locator\"' IN (SELECT cast(json_array_elements(datos#>'{components, $current_tipo, dato, lg-nolan}') as text) ) OR \n";
		}
		$strQuery= substr($strQuery, 0,-4);
		*/
		
		# METHOD 2 . SEARCHING IN ALL COMPONENTS WITH DATO 'lg-nolan'
		$locator_as_obj 	= component_common::get_locator_relation_as_obj($rel_locator);
		$section_id 		= $locator_as_obj->section_id;
		$strQuery = "
		WITH componentes AS (SELECT id, datos#>>'{section_tipo}' as section_tipo, json_object_keys(json_extract_path(datos, 'components')) AS componet_tipo, json_extract_path(datos, 'components') AS dato1 FROM $matrix_table)
		SELECT id, section_tipo
		FROM componentes
		WHERE 
		json_extract_path( dato1, componet_tipo ,'dato')->> 'lg-nolan' LIKE '%{$section_id}.%'
		";
		/**/
			#dump($strQuery,"strQuery");die();
		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		
		$ar_id=array();
		while ($rows = pg_fetch_assoc($result)) {
			$ar_references[] 		= $rows['id'];
			# Store array organized by section_tipo for other possible uses (filter results later by section tipo, for example)
			$section_tipo 			= $rows['section_tipo'];
			$ar_id[$section_tipo][] = $rows['id'];

		}
		#dump($ar_references,"ar_references");die();
		#dump($ar_id,"ar_id");

		
		# IMPORTANT : Valorar: Opcionalmente poríamos filtrar el tipo de sección deseado (portal, relation, etc...)
		# así como el pasarla a component common, pues se usa una parecida en relations :
		# component_relations::get_relation_reverse_records_from_id_section
		/*
		# Los recorremos para seleccionar sólo los que son portales y excluir relaciones, etc..
		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name('component_portal');
		foreach ($ar_id as $section_tipo => $section_id) {
			if(!in_array($section_tipo, $ar_terminoID_by_modelo_name)) unset($ar_references[$section_id]);
		}
		*/		
	
		return $ar_references;
	}


		
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
		#dump($propiedades,'$propiedades '.$this->tipo);
		#dump($propiedades->portal_list,'$propiedades->portal_list');
		
		#
		# DIFFUSION_OBJ : Build standar diffusion_obj from component common
		#
			$diffusion_obj = parent::get_diffusion_obj( $propiedades );	
				#dump($diffusion_obj, ' diffusion_obj');
				#dump($this, ' this');

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
					if(SHOW_DEBUG) {
						#error_log(__METHOD__." NOTA: USADO MUPREVA21 FIJO TEMPORALMENTE ");
					}					
					$valor[$current_portal_section_id][$current_component_tipo] = $current_component->get_valor();
				}			

			}#end if(is_array($dato)) foreach ($dato as $current_rel_locator) {
		

		# OVERWRITE DEFAULT DIFFUSION_OBJ DATO WITH SPECIFIC COMPONENT RESOLUTION DATO
		$diffusion_obj->columns['valor'] = $valor;
			#dump($diffusion_obj,"diffusion_obj $this->section_tipo ". print_r($valor));		
		
		return $diffusion_obj;

	}#end get_diffusion_obj





	/**
	* GET_STATS_OBJ
	*/
	public function get_stats_obj( $propiedades ) {
		
		return null; // DESACTIVO !!!



		$stats_obj = new diffusion_stats_component_obj();

		# PORTAL : ITERATE ALL PORTAL RECORDS
		$ar_dato=array();
		$dato = $this->get_dato();


		#dump($dato,"dato propiedades:$propiedades - tipo:$this->tipo ");return $stats_obj;

		if(is_array($dato)) foreach ($dato as $current_rel_locator) {

			$locator_relation_as_obj   = component_common::get_locator_relation_as_obj($current_rel_locator);
			$current_portal_section_id = $locator_relation_as_obj->section_id;
				#dump($current_portal_section_id,'current_portal_section_id');

			if (empty($current_portal_section_id)) {
				#dump($locator_relation_as_obj,'locator_relation_as_obj ');
				#throw new Exception("Error Processing Request. current_portal_section_id is empty for current_rel_locator:$current_rel_locator", 1);

				# Puede tratarswe de un portal vacío (creado, pero sin registros asociados todavía)	
				# Skip
				continue;		
			}
			
			# PROPIEDADES_PORTAL_LIST
			$ar_propiedades_portal_list = $propiedades->portal_list;		
				#dump($ar_propiedades_portal_list,'ar_propiedades_portal_list');
				#dump($this,'this');
			
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
			#dump($stats_obj,'$stats_obj');

		return $stats_obj;
	}



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
		if(SHOW_DEBUG) {
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
		if(SHOW_DEBUG) {
			#dump($ar_portals_map," ar_portals_map");die();
			if (empty($ar_portals_map)) {
				debug_log(__METHOD__." empty ar_portals_map ".to_string(), logger::DEBUG);
			}
		}

		return (array)$ar_portals_map;
	}



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
		return $this->exclude_elements = $exclude_elements;

	}#end get_exclude_elements



	


	/**
	* ROW_IN_RESULT
	* Select match row in result if exists from locator
	* @return object $row / bool false
	*/
	public function row_in_result( $locator, $result ) {

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
			
			
			if ($tag_id && isset($locator->tag_id) && $section_id == $locator->section_id && $section_tipo == $locator->section_tipo && $tag_id==$locator->tag_id) {
				$findit = true;
			}else if (!$tag_id && $section_id == $locator->section_id && $section_tipo == $locator->section_tipo) {
				$findit = true;
			}else{
				$findit = false;
			}

			if ($findit) {
				# add current_id as current_id (rel_locator
				$row['current_id'] = $current_id;
				return $row;
			}			
			#dump($locator, ' locator ++ '.to_string($current_id));
		   	#dump($section_id, ' section_id tag_id:'.to_string($tag_id));
		   	#dump($current_id, ' current_id ++ '.to_string());		    	
		}}

		$virtual_row = array(
						"current_id" => null,
						"section_id" => $locator->section_id,
						"section_tipo" => $locator->section_tipo,
						);
		return $virtual_row;
		return false;

	}#end row_in_result



	/**
	* GET_AR_TARGET_SECTION_TIPO
	*
	*/
	public function get_ar_target_section_tipo() {
		
		if (!$this->tipo) return NULL;

		if(isset($this->ar_target_section_tipo)) {
			#dump($this->ar_target_section_tipo,"Already calculated [ar_target_section_tipo]");
			return $this->ar_target_section_tipo;
		}

		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'section', 'termino_relacionado', $search_exact=true);
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name');

		if(SHOW_DEBUG) {

			if ( empty($ar_terminoID_by_modelo_name) ) {
				$portal_name = RecordObj_dd::get_termino_by_tipo($this->tipo,null,true);
				throw new Exception("Error Processing Request. Please, define target section structure for portal: $portal_name - $this->tipo", 1);
			}
		}

		$ar_target_section_tipo = $ar_terminoID_by_modelo_name;
			#dump($ar_target_section_tipo, '$ar_target_section_tipo');	
		
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
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id) {		
		#dump($value, " value ++ parent:$parent - tipo:$tipo - section_id:$section_id ".to_string());

		$parent    = null; // Force null always !important
		$component = component_common::get_instance(__CLASS__,
													$tipo,
													$parent,
													'list',
													DEDALO_DATA_NOLAN,
													$section_tipo);
		
		$component->html_options->rows_limit = 1; 
		
		# Use already query calculated values for speed
		$ar_records   = (array)json_handler::decode($value);	#dump($ar_records,"ar_records for portal $current_component_tipo - id:$id");#die();
		$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id); // Set unic id for build search_options_session_key used in sessions
		$html = $component->get_html();		

		return $component->get_html();

	}#end render_list_value

	
	


}
?>