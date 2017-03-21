<?php
/*
* CLASS COMPONENT_STATE
*
*
*/
class component_state extends component_common {
	
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	
	# Tipo del componente al que referencia el tool
	public $caller_component_tipo;

	# Options of the compoents, tools, and every caller that need one state component with one especific dato
	# Options = section_id, section_tipo, component_tipo, lang, tool_name
	# Options NO is a locator only a object with the infor for filter the dato
	public $options;


	public function __construct($tipo=NULL, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {
		/*
		$tipo="oh28";
		$section_tipo="oh1";
		$parent="3";
		$lang="lg-nolan";
		$modo="edit_component";
		*/
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

	
		# Set default options (self component like every tool)
		$this->options = new stdClass();
			$this->options->tool_locator 	= DEDALO_STATE_GENERAL_SECTION_TIPO.'_'.DEDALO_STATE_GENERAL_SECTION_ID;	// whole section state
			$this->options->lang 	 		= $this->lang;
			$this->options->section_tipo 	= $this->section_tipo;
			$this->options->section_id		= $this->parent;
			$this->options->component_tipo 	= $this->tipo;
				#dump($this->options, ' options ++ '.to_string($modo));			
	}//end __construct


	
	/**
	* SAVE
	* @return int $result , section_id
	*/
	public function Save() {

		# Detect and remove possible duplicates
		$this->dato = array_unique((array)$this->dato,SORT_REGULAR);
		$result = parent::Save();

		debug_log(__METHOD__." Saved $this->section_tipo - $this->parent - dato: ". to_string($this->dato), logger::DEBUG);

		if ($result) {
			# Update caller sections (from inverse locators)
			$this->propagate_state();
		}

		return $result;
	}#end Save



	/**
	* GET DATO
	* @param array $dato
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	/**
	* SET_DATO
	*/
	public function set_dato($dato) {
		if(is_string($dato)){
			$dato =  json_handler::decode($dato);
		}
		parent::set_dato( (array)$dato );
	}	

	/**
	* GET_AR_TOOLS_OBJ
	* Override component_common method
	*/
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		$this->ar_tools_name = array();
		
		return parent::get_ar_tools_obj();
	}

	

	/**
	* CONFIGURE_FOR_COMPONENT
	* Configure current component to manage related component and provide state process control
	* @param array $propiedades_state Like: "state":[{"section_tipo":"dd90","section_id":0}]
	* @return (array) $ar_state
	*/
	public function configure_for_component( $propiedades_state, $component_tipo, $section_id, $section_tipo, $lang ) {
		#dump($propiedades_state, ' propiedades_state ++ '.to_string());

		$ar_state=array();
		foreach ((array)$propiedades_state as $locator_obj) {

			if ((int)$locator_obj->section_id===0) {
				# get all rows of current list of values
				$records = (array)section::get_ar_all_section_records_unfiltered($locator_obj->section_tipo);
			}else{
				$records = array($locator_obj->section_id);
			}
			
			foreach ($records as $current_section_id) {

				$state_id = $locator_obj->section_tipo.'_'.$current_section_id;					

				$options = new stdClass();
					$options->tool_locator 	= $state_id;
					$options->lang 	 		= $lang;					
					$options->component_tipo= $component_tipo;
					$options->section_id 	= $section_id;
					$options->section_tipo 	= $section_tipo;

				# tool label
				$component_input_text = component_common::get_instance('component_input_text',
																		$locator_obj->component_tipo,
																		$current_section_id,
																		'edit',
																		DEDALO_DATA_LANG,
																		$locator_obj->section_tipo);
				$options->label = $component_input_text->get_valor();				

				$ar_state[] = $options;
			}
		}
		#dump($ar_state, ' ar_state ++ '.to_string());
		
		return $this->ar_state = $ar_state;
		
	}#end configure_for_component


	/**
	* SET_DEFAULTS
	* Calculate and set default values for current component_state based on state_map and components 'propiedades' data 
	*/
	public function set_defaults() {
		
		$resolve_virtual = false;	// Important: set to false because state_map is always present in caller section (usually a virtual section)
		$ar_state_map = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, 'state_map', $from_cache=true, $resolve_virtual);
			#dump($ar_state_map, ' ar_state_map ++ '.to_string($this->section_tipo));
		if (!isset($ar_state_map[0])) {
			debug_log(__METHOD__." Section without state_map. Nothing is set as defaults. section_tipo:$this->section_tipo, component_tipo:$this->tipo ".to_string(), logger::DEBUG);
			return false;
		}
		
		$state_map_tipo = reset($ar_state_map);	// Like rsc173
		$RecordObj_dd 	= new RecordObj_dd($state_map_tipo);
		$related_terms 	= (array)$RecordObj_dd->get_relaciones();
		
		$related_terms[] = array($this->get_modelo()=>$this->tipo);	// Add current component state too
			#dump($related_terms, ' related_terms ++ '.to_string());
		foreach($related_terms as $ar_value) foreach($ar_value as $odelo => $current_tipo) {
			$ar_state_id = array();			
			#dump($current_tipo, ' tipo ++ '.to_string());
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			$component 	 = component_common::get_instance($modelo_name,
														  $current_tipo,
														  $this->parent,
														  'edit',
														  DEDALO_DATA_LANG,
														  $this->section_tipo);
			$propiedades = $component->get_propiedades();
				#dump($propiedades, ' propiedades ++ '.to_string($current_tipo));
			if (isset($propiedades->state)) foreach((array)$propiedades->state as $ar_locator_obj) {
				
				foreach ($ar_locator_obj as $key => $locator_obj) {					
					
					if (empty($locator_obj->section_tipo)) {
						if(SHOW_DEBUG===true) {
							dump($locator_obj, ' $propiedades->state ++ '.to_string($modelo_name)." - current_tipo:$current_tipo");;
						}
						continue;
					}
					if ((int)$locator_obj->section_id===0) {
						# get all rows of current list of values
						$records = (array)section::get_ar_all_section_records_unfiltered($locator_obj->section_tipo);
							#dump($records, ' records ++ '.to_string());
						foreach ($records as $current_section_id) {
							$state_id 	   = $locator_obj->section_tipo.'_'.$current_section_id;
							$ar_state_id[] = $state_id;	
						}					
					}else{
						$state_id 	   = $locator_obj->section_tipo.'_'.$locator_obj->section_id;
							//dump($locator_obj, ' locator_obj ++ '.to_string($state_id));
						$ar_state_id[] = $state_id;						
					}

				}//end foreach ($ar_locator_obj as $key => $locator_obj) {									
			}//end if (isset($propiedades->state)) foreach((array)$propiedades->state as $ar_locator_obj) {

			foreach ($ar_state_id as $tool_locator) {
				
				$section_tipo 	= $component->get_section_tipo();
				$section_id 	= $component->get_parent();
				$component_tipo = $component->get_tipo();
				$lang 			= $component->get_lang();
				$dato 			= array(0,0);	

				$state = new stdClass();
					$state->$lang = new stdClass();
					$state->$lang->$tool_locator = $dato;

				$locator = new locator();
					$locator->set_section_tipo($section_tipo);
					$locator->set_section_id($section_id);
					$locator->set_component_tipo($component_tipo);
					$locator->set_state($state);
				
				$this->update_state($locator);
			}
		}//foreach($related_terms as $ar_value) foreach($ar_value as $odelo => $current_tipo) {
		#dump($ar_state_id, ' ar_state_id ++ '.to_string());
		#dump($this->get_dato(), ' this->get_dato() ++ '.to_string());
		
		$this->Save();

	}#end set_defaults


	/**
	* REMOVE_PORTAL_LOCATOR
	* Remove element from dato
	* @param object $portal_locator
	*/
	public function remove_portal_locator( $portal_locator ) {

		$section_tipo = $portal_locator->section_tipo;
		$section_id   = $portal_locator->section_id;

		$dato = (array)$this->get_dato();
			
		foreach ($dato as $key => $state_locator) {

			if($state_locator->section_tipo === $section_tipo && $state_locator->section_id == $section_id){
				unset($dato[$key]);
			}
		}
		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, object is created)
		$dato = array_values($dato);
		
		$this->set_dato($dato);

		return true;
	}


	/**
	* UPDATE_STATE_LOCATOR 
	* Update and save component dato with received options
	* @param object $options 
	* @param array $dato 
	*/
	public function update_state_locator( $options, $dato ) {

		$section_tipo 	= $options->section_tipo;
		$section_id 	= $options->section_id;
		$component_tipo = $options->component_tipo;
		$lang 			= $options->lang;
		$tool_locator 	= $options->tool_locator ;

		$state = new stdClass();
			$state->$lang = new stdClass();
			$state->$lang->$tool_locator = (array)$dato;

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_component_tipo($component_tipo);
			$locator->set_state($state);
		
		$this->update_state($locator);
		$this->Save();
		
		return true;

	}#end update_state_locator
	
	
	/**
	* UPDATE_STATE
	* Add / update current dato whith received locator
	* @param object locator_state
	* @return array $this->dato (updated)
	*/
	public function update_state( $locator_state ) {

		$dato = (array)$this->get_dato();
		$state_value =[0,0]; //default value for the state_value
		$locator_exists=false;		
		
		foreach ($dato as $key => $current_locator) {
			
			if( $current_locator->section_tipo 	 === $locator_state->section_tipo &&
				$current_locator->section_id 	 == $locator_state->section_id &&
				$current_locator->component_tipo === $locator_state->component_tipo ) {

				$locator_exists=true;

				# Iterate all langs to update one by one
				foreach ($locator_state->state as $lang => $ar_value) {
					#dump($value, ' value ++ '.to_string());

					foreach ($ar_value as $tool_locator => $value) {
						#dump($value, ' value ++ '.to_string());
						#$tool_locator 	 = key($value);	// Like dd90_1
						if(isset($tool_locator)){
							$state_value = $ar_value->$tool_locator; // change the value with the received value
						}
						
							#dump($state_value, ' state_value ++ '.to_string());

						if(!isset($current_locator->state->$lang)){
							$current_locator->state->$lang = new stdClass();
						}
						if(!isset($current_locator->state->$lang->$tool_locator)){
							$current_locator->state->$lang->$tool_locator = new stdClass();
						}

						$current_locator->state->$lang->$tool_locator = $state_value;
					}												
				}
				# Overwrite old locator in dato
				$dato[$key] = $current_locator;
				break;
			}
		}	

		# Case dato is empty or not match current locator in dato, locator is added to dato 
		if (!$locator_exists) {					
			$dato[] = $locator_state;
		}

		$dato = array_unique($dato,SORT_REGULAR);
		$this->set_dato($dato);
		
		#dump($locator_state, ' locator_state ++ '.to_string($locator_state->section_id)); //return;
		#dump($dato, ' dato final ++ '.to_string($locator_state->section_id));

		return (array)$this->dato;

	}//end update_state	


	/**
	* PROPAGATE_STATE
	* Propagate from this to every parent sections defined in current section inverse_locators
	* This method is recursive because for each component_state->Save action, is called propagate_state again
	* @return (bool) true if update / false if not
	*/
	public function propagate_state() {

		static $ar_locator_changed=[];

		$section = section::get_instance($this->parent, $this->section_tipo);
		$inverse_locators = $section->get_inverse_locators();
		if (empty($inverse_locators)) {
			return false;
		}

		$ar_locators = [];
		foreach ($inverse_locators as $current_locator) {

			if (!isset($current_locator->section_tipo) || !isset($current_locator->section_id)) {
				debug_log(__METHOD__." Omitted bad locator: ".to_string($current_locator), logger::WARNING);
				continue;	//Skip
			}

			$ref_locator = new locator();
				$ref_locator->set_section_tipo($current_locator->section_tipo);
				$ref_locator->set_section_id($current_locator->section_id);		
			
			$ar_locators[] = $ref_locator;
		}
		$ar_locators = array_unique((array)$ar_locators,SORT_REGULAR);

		foreach ($ar_locators as $current_locator) {

			$key_changed = $current_locator->section_id .'_'. $current_locator->section_tipo;
			if (in_array($key_changed, $ar_locator_changed)) {
				
				debug_log(__METHOD__." Skyp already changed: $key_changed ");				
				continue;	// Skyp already changed
			}
			$ar_locator_changed[] = $key_changed ;

			#$section_to_update 	= section::get_instance($current_locator->section_id, $current_locator->section_tipo);
			$component_state_tipo	= section::get_ar_children_tipo_by_modelo_name_in_section($current_locator->section_tipo, 'component_state', true, true);
			#dump($ar_result,'get_ar_children_tipo_by_modelo_name_in_section '.$section_tipo);			

			if (empty($component_state_tipo[0])) {
				continue;
			}
			
			$component_state_to_update = component_common::get_instance('component_state',
																		$component_state_tipo[0],
																		$current_locator->section_id,
																		'list',
																		DEDALO_DATA_NOLAN,
																		$current_locator->section_tipo);					

			# Force save (and trigger propagate_state again) every component_state_to of section related in inverse locators
			$component_state_to_update->Save();	

							
			debug_log( __METHOD__." Propagated from $this->section_tipo - $this->parent to ".to_string($current_locator) );
					
		}//end foreach ($ar_locators as $current_locator) {

		return true;

	}#end propagate_state


	/**
	* GET_VALOR_FOR_CHECKBOX
	* Resolve array value for current tool (configured in actual options)
	* @return array $valor_for_checkbox Like [0,100]
	*/
	function get_valor_for_checkbox( $options=false ) {
		
		$valor_for_checkbox =[0,0];		

		if (!$options) {	
			$options = $this->options;
		}
		if (empty($options)) {
			debug_log(__METHOD__." Please, define options for this component: ".get_class() );
			return $valor_for_checkbox;
		}	
		
		# Current tool config (options)
		$lang 			= $options->lang;
		$tool_locator 	= $options->tool_locator;

		$dato = $this->get_dato();	
			#dump($dato, ' dato ++ '.to_string());	

		foreach ((array)$dato as $current_locator) {
			if( $this->compare($current_locator,$options)===true ){						
				if (isset($current_locator->state->$lang->$tool_locator)) {
					$valor_for_checkbox = $current_locator->state->$lang->$tool_locator;			
				}
				break;
			}
		}	
		return (array)$valor_for_checkbox;
	}



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if(SHOW_DEBUG===true) {
			#return "STATE: n/a";
		}
		return "n/a";

	}#end get_valor_export

	
	/**
	* COMPARE
	* @return (bool) true/false
	*/
	public function compare( $locator, $options=false ) {

		if (!$options) {	
			$options = $this->options;
		}	

		if (!is_object($locator) || !isset($locator->section_tipo)) {
			debug_log(__METHOD__." Request compare bad locator: ".to_string($locator), logger::WARNING);
			return false;
		}	

		if(	$locator->section_tipo 	=== $options->section_tipo &&
			$locator->section_id 	== $options->section_id &&
			$locator->component_tipo=== $options->component_tipo)
			{
			return true;
		}
		return false;
	}#end compare



	/**
	* BOOL_TRACEABLE
	* Test if current component caller is traceble or not
	* @return 
	*/
	public function bool_traceable() {
		
		if (isset($this->options->component_tipo)) {
					
			$related_terms = (array)$this->RecordObj_dd->get_relaciones();				
				#dump($a, ' related_terms ++ '.to_string( $this->options->component_tipo ));				

			foreach($related_terms as $ar_value) foreach($ar_value as $odelo => $terminoID) {
			//foreach ( (array)array_flatten($related_terms) as $odelo => $terminoID) {				
				if ($this->options->component_tipo===$terminoID) {
					return true;
				}
			}
		}

		return false;
	}#end bool_traceable


	
	/**
	* GET_DATO_RECURSIVE
	* get all dato from every portal in this section and all sections childrens
	* @return $ar_dato_state, array with all dato from all component_state childrens
	*/
	public function get_dato_recursive() {

		$ar_portals = (array)section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, 'component_portal', true,true);
		$ar_dato_final = [];
		foreach ($ar_portals as $current_portal_tipo) {
			$current_portal = component_common::get_instance('component_portal',$current_portal_tipo,$this->parent, 'edit', DEDALO_DATA_NOLAN, $this->section_tipo);
			$ar_dato_final = array_merge($ar_dato_final, $current_portal->get_dato());

		}


		$ar_dato_state = [];
		foreach ($ar_dato_final as $current_locator) {
			$ar_state_tipo = (array)section::get_ar_children_tipo_by_modelo_name_in_section($current_locator->section_tipo, 'component_state', true,true);
			
			if(empty($ar_state_tipo[0])) continue;

			$current_state = component_common::get_instance('component_state',$ar_state_tipo[0],$current_locator->section_id, 'edit', DEDALO_DATA_NOLAN, $current_locator->section_tipo);

			$ar_dato_state = array_merge($ar_dato_state, $current_state->get_dato());
			$ar_dato_state = array_merge($ar_dato_state, $current_state->get_dato_recursive());

		}
		
		return $ar_dato_state;
	}//end get_valor



	/**
	* SET_VALOR
	* @param arry $valor 
	*/
	public function set_valor( $valor ) {
		#unset($this->valor);
		$this->valor = (array)$valor;
	}#end set_valor



	/**
	* GET_VALOR
	* Mix current component dato and all related sections component_state dato (from portals) to build a 
	* complete state vssion of current section
	*/
	public function get_valor() {

		if (isset($this->valor)) {
			return $this->valor;
		}

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		$dato 			= $this->get_dato();
		$all_state_dato = $this->get_dato_recursive();
		$final_dato 	= array_merge($dato, $all_state_dato);
		
		$this->valor = $this->resolve_valor($final_dato);
			#dump($valor, ' valor');

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $this->valor;
	}



	/**
	* RESOLVE_VALOR
	* Convert current section value to 'comprensible' lang independent grouped by process type, resolved adn sorted value
	* @param array $dato, array of objects state_locator
	* @return array $group
	*/
	public function resolve_valor($dato) {

		$ar_process_types = array('acabado','validado'); // values are not used as 
	
		#
		# GROUPS BY PROCESS TYPE
		$group = array();
		foreach ((array)$dato as $key => $current_locator) {

			if (!is_object($current_locator) || !isset($current_locator->section_tipo)) {
				debug_log(__METHOD__." Bad locator received. Skiping this locator. Please, review your data ASAP ".to_string($current_locator), logger::WARNING);
				continue;
			}
			
			$section_tipo 	= $current_locator->section_tipo;
			$section_id 	= $current_locator->section_id;
			$component_tipo = $current_locator->component_tipo;

			foreach ($current_locator->state as $lang => $object_value) {
				#dump($object_value, ' object_value ++ '.to_string($lang));
				foreach ($object_value as $tool_locator => $current_value) {									

					foreach ($ar_process_types as $process_key => $current_type) {
						$val = isset($current_value[$process_key]) ? $current_value[$process_key] : 0;
						$key = $tool_locator.'_'.$lang.'_'.$current_type.'_'.$val;
						if (!isset($group[$key])) {
							$group[$key] = 1;
						}else{
							$group[$key]++;
						}
					}//end foreach ($ar_process_types as $process_key => $current_type) {

				}//end foreach ($object_value as $tool_locator => $current_value) {
			}			
			
		}//end foreach ((array)$dato as $key => $current_locator) {
		ksort($group);
		#dump($group, ' group ++ '.to_string());				

		return $group;
	}//end get_valor



	/**
	* GET_AR_GRAPH
	* Build graph objects array ready to use as source data in javascript graph library (nvd3)
	* @return 
	*/
	public function get_ar_graph() {

		$group = $this->get_valor();

		#
		# BUILD ELEMENTS
			$ar_resolved=array();
			foreach ($group as $key => $value) {

				$ar_keys = explode('_', $key);
				
				$process_section_tipo 	= $ar_keys[0];
				$process_id 			= $ar_keys[1];
				$lang 					= $ar_keys[2];
				$process_type 			= $ar_keys[3];
				$process_value 			= $ar_keys[4];

				$process_name   = $this->get_process_name( $process_section_tipo.'_'.$process_id ) . ': ' . $this->get_process_type_name($process_type);
					#dump($process_name, ' process_tipo ++ '.to_string( $process_section_tipo.'_'.$process_id ));

				$process_value_name = $this->get_process_value_name($process_value, $process_type);

				$obj_values = new stdClass();
					$obj_values->x 		= $process_value_name;	// Label
					$obj_values->y 		= $value;				// Value
					switch (true) {
						case ($process_value_name==='no'):
							$obj_values->color 	= 'red'; 		// Color red
							break;
						case ($process_value_name==='si' || $process_value_name==='yes'):
							$obj_values->color 	= 'rgb(104, 195, 54)'; // Color green
							break;
						default:
							$obj_values->color 	= '#FFB733'; 	// Color orange
							break;
					}							

				if (isset($ar_resolved[$process_name])) {
					# Element exists, update values
					$ar_resolved[$process_name][0]->values[] = $obj_values; // Add value inside existing object array 'values'
					$ar_resolved[$process_name][0]->total += (int)$value;	// Add to total counter

				}else{
					# Element not exists, create object and add to array
					$object = new stdClass();
						$object->key 	= "Series $process_name";						
						$object->values = array($obj_values);
						$object->total 	= (int)$value;

					$ar_resolved[$process_name][] = $object;
				}
			}
			#dump($ar_resolved, '$ar_resolved ++ '.to_string());

		#
		# BUILD GRAPHIC DATA
			$ar_graph=array();
			foreach ($ar_resolved as $title => $data) {
				
				$total = reset($data)->total;
				$object = new stdClass();
					$object->title 		= strip_tags($title)." [$total]";
					$object->graph_type = 'stats_pie';
					$object->data 		= $data;

				$ar_graph[] = $object;
					
			}
			#dump($ar_graph, ' ar_graph ++ '.to_string());
		
		return $ar_graph;

	}#end get_ar_graph



	/**
	* GET_VALOR_PLAIN
	* @return 
	*/
	public function get_valor_plain( $valor ) {		
		
		#
		# BUILD ELEMENTS
		$ar_resolved=array();
		foreach ((array)$valor as $key => $value) {

			$ar_keys = explode('_', $key);
			
			$process_section_tipo 	= $ar_keys[0];
			$process_id 			= $ar_keys[1];
			$lang 					= $ar_keys[2];
			$process_type 			= $ar_keys[3];
			$process_value 			= $ar_keys[4];

			$process_name      = $this->get_process_name( $process_section_tipo.'_'.$process_id );// . ': ' . $this->get_process_type_name($process_type);
			$process_type_name = $this->get_process_type_name($process_type);
				#dump($process_name, ' process_tipo ++ '.to_string( $process_section_tipo.'_'.$process_id ));

			$process_value_name = $process_value;	// Not resolve name here. $this->get_process_value_name($process_value, $process_type);

			$obj_values = new stdClass();
				$obj_values->label 		= $process_value_name;	// Label
				$obj_values->value 		= $value;				// Value
	
			if ((int)$process_value>50) {
				$ar_resolved[$process_name]['show_icon'] = $process_section_tipo.'_'.$process_id;
			}				

			if (isset($ar_resolved[$process_name][$process_type])) {
				# Element exists, update values
				$ar_resolved[$process_name][$process_type]->values[] = $obj_values; // Add value inside existing object array 'values'
				$ar_resolved[$process_name][$process_type]->total += (int)$value;	// Add to total counter

			}else{
				# Element not exists, create object and add to array
				$object = new stdClass();
					$object->key 	= $process_name.': '.$process_type_name;					
					$object->values = array($obj_values);
					$object->total 	= (int)$value;

				$ar_resolved[$process_name][$process_type] = $object;
			}
		}

		return (array)$ar_resolved;
	}#end get_valor_plain



	/**
	* ELEMENT_OBJECT_TO_TEXT
	* Convert object element of state data to text like 'Ficha general Acabado: 2/3'
	* @return 
	*/
	public function element_object_to_text( $element_object ) {
		
		# FINISHED_VALUE : When label of current element is 100, current value is interpreted as 'yes' finish elements of total
		$finished_value = 0;
		foreach ((array)$element_object->values as $current_obj_value) {
			#dump($current_obj_value, ' current_obj_value ++ '.to_string());
			if ( isset($current_obj_value->label) && (int)$current_obj_value->label==100 ) {					
				$finished_value = isset($current_obj_value->value) ? $current_obj_value->value : 0;
			}
		}

		$total_value 	= isset($element_object->total) ? $element_object->total : 0;
		$plain_value 	= $finished_value .'/'. $total_value;
		$text 			= "$element_object->key: $plain_value";

		return $text;
	}#end element_object_to_text



	/**
	* GET_PROCESS_VALUE_NAME
	* @return string $value
	*/
	public function get_process_value_name( $source_value, $process_type ) {
		
		switch ($process_type) {
			case 'acabado':
				if ( (int)$source_value>0 ) {
					$value = label::get_label('si');
				}else{
					$value = label::get_label('no');
				}
				break;
			case 'validado':
				if ((int)$source_value==100) {
					$value = label::get_label('si');
				}else if ((int)$source_value==50) {
					$value = label::get_label('para_revisar');
				}else{
					$value = label::get_label('no');
				}
				break;
			default:
				$value = $source_value;
				break;
		}

		return $value;
	}#end get_process_value_name



	/**
	* GET_PROCESS_NAME
	* @param string $process_locator, Like 'dd174_1'
	* @return string $process_name 
	*/
	public function get_process_name( $process_locator=false, $process_section_tipo=null, $process_id=null ) {

		if ($process_locator) {
			$ar_parts 				= explode('_', $process_locator);
			$process_section_tipo 	= $ar_parts[0];
			$process_id 			= $ar_parts[1];
		}		

		$modelo_name  = 'component_input_text';
		$process_tipo = section::get_ar_children_tipo_by_modelo_name_in_section( $process_section_tipo, $modelo_name, true, true);
		if(!isset($process_tipo[0])) {
			return "n/d [{$process_section_tipo}_{$process_id}]";
		}
		$component 	  = component_common::get_instance( $modelo_name,
														$process_tipo[0],
														$process_id,
														'edit',
														DEDALO_DATA_LANG,
														$process_section_tipo);
		$process_name = $component->get_valor(0);

		return (string)$process_name;
	}#end get_process_name



	/**
	* GET_PROCESS_TYPE_NAME
	* @return 
	*/
	public function get_process_type_name( $type ) {		
		return label::get_label($type);
	}#end get_process_type_name
	


	/**
	* MAP_TOOL_NAME
	*/
	public function map_tool_name($key) {

		$map = array(	'tool_transcription' 	=> 'TR',
						'tool_indexation' 		=> 'ID',
						'tool_lang' 			=> 'LG',
					);

		if(!isset($map[$key])) return null;

		return $map[$key];
	}



	/**
	* MAP_DATO_TO_CURRENT_ELEMENT
	* Convert current value to boolean value
	* @return bool true/false
	*/
	public function map_dato_to_current_element_DEPRECATED() {

		if(empty($this->caller_element)) {
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request: caller_element is not defined", 1);
			}
			return false;					
		}

		$ar_dato = $this->get_dato();
			#dump($ar_dato,'ar_dato');

		if( empty($ar_dato[$this->caller_component_tipo])) {
			return false;
		}

		$ar_value = $ar_dato[$this->caller_component_tipo];
		if(is_array($ar_value)) foreach ($ar_value as $value) {
			if($value==$this->caller_element) return true;
		}
	}//end map_dato_to_current_element_DEPRECATED
	


	/**
	* GET_AR_DATA_BY_TOOL
	*//*
	protected function get_ar_data_by_tool_DEPRECATED() {

		if(SHOW_DEBUG===true) $start_time = start_time();

		$ar_data_by_tool = array();

		$section_id   = $this->parent;	if( intval($section_id)<1 ) throw new Exception("Error Processing Request: section_id is empty - modo:$this->modo", 1);
		$section_tipo = $this->get_section_tipo();

		# CACHE : Cache (las secciones del mismo tipo, tienen la misma estructura)
		static $ar_data_by_tool;
		if(isset($ar_data_by_tool[$section_tipo])) {
			#return $ar_data_by_tool[$section_tipo];
		}		
		
		
		$section = section::get_instance($section_id, $section_tipo);
			#dump($section_id, '$section_id ');		
		$ar_section_childrens = (array)section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_');
			#dump($ar_section_childrens,'$ar_section_childrens');

		foreach ($ar_section_childrens as $current_component_tipo) {
					
			$ar_tools = array();

			# COMPONENT : Build current component		
			$current_component 	= component_common::get_instance(null, $current_component_tipo, $section_id, 'edit', DEDALO_DATA_LANG, $section_tipo);

			#$current_component_tools = $current_component->get_ar_tools_obj();
			$current_component_tools = $current_component->get_ar_authorized_tool_name();
				#dump($current_component_tools,"current_component_tools -  current_component_tipo:$current_component_tipo");

			if(!empty($current_component_tools)) {
				$ar_tools = $current_component_tools;
				#dump($ar_tools,'ar_tools');			

				# INDEXABLES
				if( in_array('tool_indexation', $ar_tools)) {
					$ar_data_by_tool['tool_indexation'][] = $current_component_tipo;
				}

				# TRANSCRIBIBLES
				if( in_array('tool_transcription', $ar_tools)) {
					$ar_data_by_tool['tool_transcription'][] = $current_component_tipo;
				}
			}
			
				# TRADUCIBLES
				$traducible = $current_component->get_traducible();
					#dump($traducible,'traducible');
				if($traducible!='no') {
					$ar_data_by_tool['tool_lang'][] = $current_component_tipo;
				}
		}
		#dump($ar_data_by_tool," ar_data_by_tool");

		# AR LANGS ALL
		$ar_tool_lang_all 		= $section->get_ar_all_project_langs($resolve_termino=true);
		$ar_data_by_tool_final  = array($ar_data_by_tool,$ar_tool_lang_all);
			#dump($ar_data_by_tool_final,'ar_data_by_tool');

		# CACHE : Static cache
		#$ar_data_by_tool[$section_tipo] = $ar_data_by_tool_final;		

		return $ar_data_by_tool_final;
	}//end get_ar_data_by_tool_DEPRECATED
	*/
	

	/**
	* GET_ESTADO
	*//*
	protected function get_estado_DEPRECATED() {

		#dump($this->get_modo(),'get_estado this->modo'); return null;

		static $ar_estado;
		if(isset($ar_estado[$this->parent])) {
			if(SHOW_DEBUG===true) {
				#dump($ar_estado[$this->parent],'$ar_estado');
			}			
			return $ar_estado[$this->parent];
		}

		$ar_data = $this->get_ar_data_by_tool();

		# COMPONENTS BY TOOL
		$ar_data_by_tool = $ar_data[0];	
			#dump($ar_data_by_tool,'$ar_data_by_tool');

		# all langs
		$ar_tool_lang_all = $ar_data[1];
			#dump($ar_tool_lang_all,'ar_tool_lang_all');

		# dato
		$dato = $this->get_dato();
			#dump($dato,'dato');

		if(empty($dato)) return array();
		

		$n_current_tool_transcription=0;
		$n_current_tool_indexation=0;
		$n_total_tool_transcription=0;
		$n_total_tool_indexation=0;
		
		foreach ($ar_data_by_tool as $key => $ar_component_tipo) {
			
			# TRANSCRIBIBLES			
			if ($key==='tool_transcription') {
				foreach ($ar_component_tipo as $component_tipo) {
					$exists = array_key_exists($component_tipo, $dato);
					if($exists){
						foreach ($dato[$component_tipo] as $ar_tools) {
							if($ar_tools==='tool_transcription') $n_current_tool_transcription++;
						}
					}
				}
				$n_total_tool_transcription = count($ar_component_tipo);
			}

			# INDEXABLES			
			else if ($key==='tool_indexation') {
				foreach ($ar_component_tipo as $component_tipo) {
					$exists = array_key_exists($component_tipo, $dato);
					if($exists){
						foreach ($dato[$component_tipo] as $ar_tools) {
							if($ar_tools==='tool_indexation') $n_current_tool_indexation++;
						}
					}
				}
				$n_total_tool_indexation = count($ar_component_tipo);
			}

			# TRADUCIBLES			
			else if ($key==='tool_lang') {
				foreach ($ar_component_tipo as $component_tipo) {

					$exists = array_key_exists($component_tipo, $dato);
					if($exists){
						foreach ($dato[$component_tipo] as $current_tool) {
							#dump($current_tool,'$current_tool');
							
							if(strpos($current_tool, 'tool_lang:')!==false) {

								$ar_bits 		= explode(':', $current_tool);
								$actual_lang 	= $ar_bits[1];

								if(isset($ar_current_tool_lang[$actual_lang])) {
									$ar_current_tool_lang[$actual_lang] = $ar_current_tool_lang[$actual_lang] + 1;
								}else{
									$ar_current_tool_lang[$actual_lang] = 1;
								}								
							}# /if(strpos($current_tool, 'tool_lang:')!==false)								

						}# foreach
					}# /if($exists)				


					foreach ($ar_tool_lang_all as $actual_lang) {			
						if(isset($ar_total_tool_lang[$actual_lang])) {
							$ar_total_tool_lang[$actual_lang] = $ar_total_tool_lang[$actual_lang] + 1;
						}else{
							$ar_total_tool_lang[$actual_lang] = 1;
						}						
					}

				}# foreach ($ar_component_tipo as $component_tipo)

			}# /if ($key=='tool_lang')

		}# /foreach ($ar_data_by_tool as $key => $ar_component_tipo)

	

		# TANTOS POR CIEN 
		$porcentaje_transcription 	= 0;
		if($n_total_tool_transcription>0)
			$porcentaje_transcription 	= round($n_current_tool_transcription * 100 / $n_total_tool_transcription,2) ;
			#dump($porcentaje_transcription,'$porcentaje_transcription');
		
		$porcentaje_indexation 		= 0;
		if($n_total_tool_indexation>0)
			$porcentaje_indexation 		= round($n_current_tool_indexation * 100 / $n_total_tool_indexation,2) ;
			#dump($porcentaje_indexation,'$porcentaje_indexation');
		
		$ar_porcentaje_lang=array();
		foreach ($ar_tool_lang_all as $actual_lang) {
			if (!isset($ar_current_tool_lang[$actual_lang])) {
				$ar_current_tool_lang[$actual_lang] = 0;
			}
			$ar_porcentaje_lang[$actual_lang] 	= round($ar_current_tool_lang[$actual_lang] * 100 / $ar_total_tool_lang[$actual_lang],2);
				#dump($ar_porcentaje_lang[$actual_lang],"$actual_lang");
		}
		$n_keys = count($ar_porcentaje_lang);
		$total = 0;
		foreach ($ar_porcentaje_lang as $key => $value) {
			$total += $value;
		}
		if ($n_keys===0) {
			$porcentaje_lang_global = 0;
		}else{
			$porcentaje_lang_global = round($total / $n_keys,2);
		}		
			#dump($total,'total');
			#dump($porcentaje_lang_global,'porcentaje_lang_global');

		$estado = array(
					'tool_transcription' 	=> $porcentaje_transcription,
					'tool_indexation' 		=> $porcentaje_indexation,
					'tool_lang' 			=> $porcentaje_lang_global,
					'ar_porcentaje_lang' 	=> $ar_porcentaje_lang
					);

		# CACHE : Static cache
		$ar_estado[$this->parent] = $estado;
			#dump($ar_estado,'$ar_estado');

		return $estado;
	}//end get_estado_DEPRECATED
	*/



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
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		$current_valor  = $value;
		$valor 			= '';
		if(!empty($current_valor)) {					
			$component  = component_common::get_instance(__CLASS__,
														 $tipo,
													 	 $parent,
													 	 'list',
														 DEDALO_DATA_NOLAN,
													 	 $section_tipo);
			#$ar_val 	= json_decode($current_valor);
			#$component->set_valor($ar_val);
			$valor 		= $component->get_html();
		}

		return $valor;
	}#end render_list_value



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* En este caso, usaremos únicamente el 'valor'
	*
	* @see class.section.php
	* @return string $html
	*/
	public function get_valor_list_html_to_save() {		
		$group = $this->get_valor();	
		
		return (string)to_string($group)."+++";
	}//end get_valor_list_html_to_save





}//end class component_state
?>