<?php
/*
* CLASS COMPONENT LAYOUT

  Se encarga de hacer las agrupaciones de componentes para la visualización de las fichas en modo edit
  Hay un 'mapeo' obligatorio en estructura para cada modo y en adelante se implementará como una preferencia del usuario
  que sobre-escribe la de la estructura usada por defecto.
  Si no se define para una sección, generará un excepción.
*/

class component_layout extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	#static $pattern_tipo = "/\{(\w*)\}/";
	#static $ar_parts 	 = array('classes','pages'); // object dato parts ,'edit'

	
	# CONSTRUCT
	public function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {
		
		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);
	}



	/**
	* GET_DATO
	*/
	public function get_dato() {		
		$dato = parent::get_dato();

		if(!empty($dato) && !is_object($dato)) {
			if(SHOW_DEBUG===true) {
				trigger_error("Error. dato converted to layout_print because is not as expected object. ". gettype($dato));
			}
			$dato = new layout_print();
		}

		return (object)$dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {
		#dump($dato, ' dato ++ '.to_string());

		if (is_string($dato)) {
			if (!$dato = json_decode($dato)) {
				trigger_error("Error. Only valid JSON is accepted as dato");
				return false;
			}			
		}

		//dump($dato, " dato 1".to_string());
		# Dato is set as string. Convert to object before set
		#$dato = json_handler::decode($dato);

		if(!empty($dato) && !is_object($dato)) {
			$dato = new layout_print();
		}
		/*
		foreach (component_layout::$ar_parts as $part) {
			if(!property_exists($dato, $part)) $dato->$part = '';
			if (!json_encode($dato->$part)) {
				$dato->$part = json_decode($dato->$part);
			}
		}
		*/
		//dump($dato, " dato 2".to_string());
		
		parent::set_dato( (object)$dato );
	}//end set_dato



	/**
	* GET_VALOR
	* @return 
	*/
	public function get_valor() {
		$dato  = $this->get_dato();
		$valor = json_encode($dato);

		return $valor;
	}//end get_valor



	/**
	* GET_LAYOUT_MAP_FROM_SECTION
	* 
	* @param obj $section_obj
	* @param bool $from_cache default false
	* @return array $layout_map
	*/
	public static function get_layout_map_from_section(section $section_obj, $from_cache=false) {
		$layout_map = array();

		# layout map can be injected in section vars 'layout_map'
		if (isset($section_obj->layout_map) && !empty($section_obj->layout_map)) return $section_obj->layout_map;


		$modo 			= $section_obj->get_modo();
		$section_tipo 	= $section_obj->get_tipo();
		
		#
		# SECTION TOOL CASE
		# When current section is 'section_tool', $section_obj->section_tool was set with section_tool propiedades. In this case
		# section list of referenced 'tool_section_tipo' is used for create this layout_map and var section_tipo is changed here with it
		if (isset($section_obj->context->tool_section_tipo)) {	
			#dump($section_obj->section_tool, ' var ++ '.to_string());
			$section_tipo 	= $section_obj->context->tool_section_tipo;	// Override section tipo
				#dump($section_tipo, ' section_tipo ++ '.to_string());	
		}
		

		$cache_uid = $section_tipo.'_'.$modo;
		/*
		if ($from_cache && isset($_SESSION['dedalo4']['config']['get_layout_map_from_section'][$cache_uid])) {
			error_log("DEBUG INFO ".__METHOD__." From cache $terminoID.$lang");
			#return $_SESSION['dedalo4']['config']['get_layout_map_from_section'][$cache_uid];
		}
		*/


		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$section_tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		# Datos de mapeo (Forzamos NULL de momento..)
		$dato = NULL; 	#$this->get_dato();


		switch ($modo) {

			case 'portal_edit':
			case 'edit':
				if (!empty($dato)) {
					# Usamos el guardado en matrix como dato del usuario actual
					# De momento no existe esta opción..
					
				}else{
					
					# LAYOUT MAP EDIT VERSION 2
					# Concepto: Crear un mapa jerarquizado de todos los section_group y section_tab existentes en la sección (del tipo menu)
					# Resolverlo a nivel de html respetando el anidamiento
					# 
					# 1 Buscamos todos los elementos deseados (section groups y section taps) mas su términos relacionados (componentes u otros section groups/section taps)
					$ar_layout_hierarchie = component_layout::get_ar_layout_hierarchy($section_tipo);
						#dump($ar_layout_hierarchie,"AR_LAYOUT_HIERARCHIE");
					# 2 Recorremos el array llevando el control de los ya resueltos para no volver a incluirlos
					$layout_map = $ar_layout_hierarchie;
				}				
				break;

			case 'portal_list':			
				if (!empty($dato)) {
					# Usamos el guardado en matrix como dato del usuario actual
					# De momento no existe esta opción..					
				
				}else{

					# portal_tipo es configurado en el objeto section al hacer la llamada desde el controlador de component_portal
					$portal_tipo = $section_obj->portal_tipo;
						#dump($section_obj,"portal_tipo");

					#$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($portal_tipo, $cache=true, $simple=true);
					$ar_terminos_relacionados = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($portal_tipo, $modelo_name='component_', $relation_type='termino_relacionado'); 
						#dump($ar_terminos_relacionados,"ar_terminos_relacionados de portal tipo: $portal_tipo");
					
					if(empty($ar_terminos_relacionados)) throw new Exception("Portal structure error. Please define TR components", 1);						

					foreach ($ar_terminos_relacionados as $terminoID) {
						$layout_map[$portal_tipo][] = $terminoID;
					}
				}
				# LOG
				#$log = logger::get_instance();
				#$log->log_message("Loaded layout_map for section tipo $section_tipo " , logger::DEBUG, __METHOD__);					
				break;

			case 'portal_listXX':
			case 'list_tm':	
			case 'list':
					
				if (!empty($dato)) {
					# Usamos el guardado en matrix como dato del usuario actual
					# De momento no existe esta opción..		
				
				}else{

					$current_section_to_list = $section_tipo;

					#dump($this->section_obj->get_RecordObj_dd()->get_relaciones()[0],'$this->section_obj');
					#
					# RELACIONES (SECTION VIRTUAL)
					$relaciones = $section_obj->get_RecordObj_dd()->get_relaciones()[0];
						#dump($relaciones,'relaciones '.$this->tipo);
						if(!empty($relaciones)) {
							foreach ($relaciones as $key => $value) {
								$modelo 	= RecordObj_dd::get_termino_by_tipo($key, null, true);
								#if($modelo=='section') $current_section_to_list = $value;
							}
						}

					# Usamos el default definido en estructura
					# SECTION LIST
					# Usamos el section list (puede haber varios) para establecer qué componentes se mostrarán y en qué orden se agruparán estos						
					$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_to_list, 'section_list');
						#if(SHOW_DEBUG===true) dump($ar_section_list,"ar_section_list ar section list para $current_section_to_list");
					
					if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
						# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
						$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
							#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

						if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($terminoID,true);
							# Exclude 'tools_search'
							if(strpos($modelo_name, 'component_')!==false) {
								$layout_map[$section_list_tipo][]	= $terminoID;
							}								
						}else{
							error_log("Current section list don't have any component to show. Please configure properly this section list in structure");
						}
					}else{
						if(SHOW_DEBUG===true) {
							#dump($ar_section_list,"WARNING section_list for $section_tipo is not defined in structure (empty ar_section_list')");								
						}
						#throw new Exception("section_list for $section_tipo is not defined in structure (empty ar_section_list)", 1);
						trigger_error("section_list for $section_tipo is not defined in structure (empty ar_section_list)");
					}
				}
				# LOG
				#$log = logger::get_instance();
				#$log->log_message("Loaded layout_map for section tipo $section_tipo " , logger::DEBUG, __METHOD__);					
				break;

			case 'relation_reverse':
			case 'relation_reverse_sections':
			case 'relation':
					
				if (!empty($dato)) {
					# Usamos el guardado en matrix como dato del usuario actual
					# De momento no existe esta opción..					
				
				}else{
					# Usamos el default definido en estructura
					# RELATION LIST
					# Usamos el section list (puede haber varios) para establecer qué componentes se mostrarán y en qué orden se agruparán estos						
					$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'relation_list');
						#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
					
					if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
						# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
						$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
							#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

						if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
							$layout_map[$section_list_tipo][]	= $terminoID;
						}
					}else{
						throw new Exception("relation_list not found in structure. Please define relation_list for ". RecordObj_dd::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
					}
				}
				#if(SHOW_DEBUG===true) dump($layout_map,'layout_map',"layout_map for section tipo $section_tipo");
				
				# LOG
				#$log = logger::get_instance();
				#$log->log_message("Loaded layout_map for section tipo $section_tipo " , logger::DEBUG, __METHOD__);
				break;

			case 'portal_editXX':
					
				if (!empty($dato)) {
					# Usamos el guardado en matrix como dato del usuario actual
					# De momento no existe esta opción..					
				
				}else{
					# Usamos el default definido en estructura
					# RELATION LIST
					# Usamos el section list (puede haber varios) para establecer qué componentes se mostrarán y en qué orden se agruparán estos						
					$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'relation_list');
						#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
					
					if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
						# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
						$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
							#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

						if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
							$layout_map[$section_list_tipo][]	= $terminoID;
						}
					}else{
						throw new Exception("relation_list not found in structure. Please define relation_list for ". RecordObj_dd::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
					}
				}
				#if(SHOW_DEBUG===true) dump($layout_map,'layout_map',"layout_map for section tipo $section_tipo");
				
				# LOG
				#$log = logger::get_instance();
				#$log->log_message("Loaded layout_map for section tipo $section_tipo " , logger::DEBUG, __METHOD__);
				break;

			/*
			case 'relation_reverse':
				if (!empty($dato)) {
					# Usamos el guardado en matrix como dato del usuario actual
					# De momento no existe esta opción..					
				
				}else{
					# Usamos el default definido en estructura
					# RELATION REVERSE LIST
					# Usamos el section list (puede haber varios) para establecer qué componentes se mostrarán y en qué orden se agruparán estos						
					$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'relation_reverse_list');
						#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
					
					if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
						# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
						$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
							#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

						if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
							$layout_map[$section_list_tipo][] = $terminoID;
						}
					}else{
						throw new Exception("relation_reverse_list not found in structure. Please define relation_reverse_list for ". RecordObj_dd::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
					}
				}
				#if(SHOW_DEBUG===true) dump($layout_map,'layout_map',"layout_map for section tipo $section_tipo",true);
				# LOG
				$log = logger::get_instance();
				$log->log_message("Loaded layout_map for section tipo $section_tipo " , logger::DEBUG, __METHOD__);
				break;
				*/
			
			case 'search':
					
				if (!empty($dato)) {
					# Usamos el guardado en matrix como dato del usuario actual
					# De momento no existe esta opción..					
				
				}else{
					# Usamos el default definido en estructura
					# SEARCH LIST
					# Usamos el section list (puede haber varios) para establecer qué componentes se mostrarán y en qué orden se agruparán estos						
					$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'search_list');
						#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
					
					if(!empty($ar_search_list)) foreach ($ar_search_list as $search_list_tipo) {
						# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
						$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($search_list_tipo, $cache=false, $simple=true);
							#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

						if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
							$layout_map[$search_list_tipo][] = $terminoID;
						}
					}else{
						throw new Exception("search_list not found in structure. Please define search_list for ". RecordObj_dd::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
					}
				}
				#if(SHOW_DEBUG===true) dump($layout_map,'layout_map',"layout_map for section tipo $section_tipo",true);
				
				# LOG
				#$log = logger::get_instance();
				#$log->log_message("Loaded layout_map for search tipo $section_tipo " , logger::DEBUG, __METHOD__);
				
				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;
			
			default:
				trigger_error("modo: $modo is not valid", E_USER_ERROR);
				break;				
		}
		#if(SHOW_DEBUG===true) dump($layout_map,'layout_map',"layout_map for section tipo $section_tipo");		
		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$section_tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		#$_SESSION['dedalo4']['config']['get_layout_map_from_section'][$cache_uid] = $layout_map;

		
		#
		# REMOVE_EXCLUDE_TERMS : CONFIG EXCLUDES
		# If instalation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove elements from layout_map
		if (defined('DEDALO_AR_EXCLUDE_COMPONENTS') && !empty($layout_map)) {
			$DEDALO_AR_EXCLUDE_COMPONENTS = unserialize(DEDALO_AR_EXCLUDE_COMPONENTS);
			foreach ($layout_map as $section_tipo => $ar_tipos) foreach ((array)$ar_tipos as $key => $current_tipo) {
				if (in_array($current_tipo, $DEDALO_AR_EXCLUDE_COMPONENTS)) {
					unset( $layout_map[$section_tipo][$key] );
					debug_log(__METHOD__." DEDALO_AR_EXCLUDE_COMPONENTS: Removed layout_map term $current_tipo ".to_string(), logger::DEBUG);
				}
			}
		}
		#dump($layout_map, ' $layout_map 2 ++ '.to_string());
		


		
		return (array)$layout_map;
	}//end get_layout_map_from_section


	
	/**
	* GET_AR_LAYOUT_HIERARCHY
	* Genera el 'mapa' de los elementos necesarios para componer la sección actual resolviendo las relaciones entre componentes y grupos en la estructura.
	* Es necesario recorrerlo (walk_layout_map) para resolver su html
	* @see self::walk_layout_map
	* @see self::get_layout_map_from_section
	* @return: hierarchized array ($terminoID=>$ar_related_terms) as format:
	*    [dd295] => Array
	*        (
	*            [dd296] => Array ()
	*            [dd404] => Array ()
	*            [dd705] => Array () <- section group inside relation
	*            [dd702] => Array ()
	*        )
	*   [dd705] => Array
	*       (
	*           [dd703] => Array ()
	*           [dd704] => Array ()
	*       )
	*/	
	public static function get_ar_layout_hierarchy($section_tipo) {
		
		# Modelo name's searched
		# Buscamos sólo los elementos raiz, no los elementos específicos como componentes o botones
		$ar_include_modelo_name = array('section_group','section_tab','section_group_relation','section_group_portal','section_group_div');
		$ar_current 			= array();
		$RecordObj_dd			= new RecordObj_dd($section_tipo);				
		$ar_ts_childrens		= $RecordObj_dd->get_ar_childrens_of_this();
			#dump($RecordObj_dd,"ar_ts_childrens");
		foreach ($ar_ts_childrens as $children_terminoID) {			
			
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);
				
				# Test if modelo_name name is acepted or not 
				# Skip non include_modelo_name match (continue) 
				if( !in_array($modelo_name, $ar_include_modelo_name) ) {
					#error_log("Skiped $modelo_name in layout 'get_ar_layout_hierarchy");
					continue;
				}		

				# Reset ar_temp array value
				$ar_temp=array(); 

				# Add childrens
				$RecordObj_dd			= new RecordObj_dd($children_terminoID);
				$ar_children_elements	= $RecordObj_dd->get_ar_childrens_of_this();	#RecordObj_dd::get_ar_terminos_relacionados($children_terminoID, $cache=false, $simple=true);
					#dump($ar_children_elements,"ar_children_elements");
				
				######
				foreach($ar_children_elements as $element_tipo) {
					
					$modelo_name		= RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
						#dump($modelo_name,'modelo_name');
					
					if( in_array($modelo_name, $ar_include_modelo_name) ) {

						$ar_temp[$element_tipo] = component_layout::get_ar_layout_hierarchy($element_tipo);
							#dump($ar_temp,"ar_temp - modelo_name:$modelo_name - modeloID:$modeloID");
					}else{
						#$ar_temp[] = $element_tipo;
						#$ar_temp[$element_tipo] = array();
					}								
				}
				######

				#$ar_temp[$element_tipo] = array();
				$ar_current[$children_terminoID]= $ar_temp;			

		}#end foreach ($ar_ts_childrens as $children_terminoID) 			
		#dump($ar_current,'GET_AR_LAYOUT_HIERARCHy',"array recursive pass section_tipo:$section_tipo ");
		
		return (array)$ar_current;	
	}//end get_ar_layout_hierarchy



	/**
	* WALK_LAYOUT_MAP
	* Recursive method
	* @param array $ar_tipo (is layout_map structure array)
	* @param array &$ar_resolved_elements
	* @param array $ar_exclude_elements
	*/
	public static function walk_layout_map( $section_obj, $ar_tipo, &$ar_resolved_elements=array() ,$ar_exclude_elements) {

		$section_id				= $section_obj->get_section_id();
		$modo 					= $section_obj->get_modo();
		$current_tipo_section 	= $section_obj->get_tipo();
		$html 					= '';

			#array_push($ar_exclude_elements, 'exclude_elements');		
			#dump($ar_tipo,'$ar_tipo');die();
			#dump($ar_resolved_elements,'$ar_resolved_elements');
			#dump($ar_exclude_elements," ar_exclude_elements");

		# Recorremos el array de section groups nivel por nivel
		foreach ($ar_tipo as $terminoID => $ar_value) {

			# Evita re-resolver elementos
			if ( in_array($terminoID, $ar_resolved_elements) ) {
				#dump($ar_resolved_elements,"ar_resolved_elements $terminoID");
				return null;
			}

			# Skip to remove elements
			# dump($ar_exclude_elements,'ar_exclude_elements');
			if( is_array($ar_exclude_elements) && in_array($terminoID, $ar_exclude_elements) ) {
				#if(SHOW_DEBUG===true) dump($terminoID,"removed 4 $terminoID");
				continue; # skip
			}			

			# Resolvemos el elemento actual (será alguno de modelo 'section_group','section_tab','section_group_relation','section_group_portal')
			$RecordObj_dd 			= new RecordObj_dd($terminoID);
			$element_modelo_name	= $RecordObj_dd->get_modelo_name();		#dump($element_modelo_name,'switch element_modelo_name '.$terminoID);
			$element_tipo 			= $terminoID;
			$element_lang 			= ($RecordObj_dd->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
			$html_elements			= '';	# Important: reset html_elements every iteration
			
			$ar_tipo_next_level 	= $ar_tipo[$terminoID];
				#dump($ar_tipo_next_level,"ar_tipo - $terminoID - ar_tipo:\n".print_r($ar_tipo,true) );

			switch (true) {

				case ($element_modelo_name==='section_group_div'):

						# El html a incluir será el resultado de la recursión de sus hijos
						$ar_children_elements = $RecordObj_dd->get_ar_childrens_of_this();
						#$ar_children_elements = RecordObj_dd::get_ar_childrens($terminoID);
							#dump($ar_children_elements,'ar_children_elements' );

						foreach ($ar_children_elements as $children_tipo) {
							
							$children_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($children_tipo,true);
								#dump($children_modelo_name,'children_modelo_name');

							if ($children_modelo_name==='section_group_div' || $children_modelo_name==='section_group') {
								#dump($children_modelo_name,'$children_modelo_name');

								# Extraemos el html del conjunto recursivamente
								$html_elements .= component_layout::walk_layout_map($section_obj, $ar_tipo_next_level, $ar_resolved_elements, $ar_exclude_elements);

							}# if ($children_modelo_name==='section_group')
							else if ( strpos($children_modelo_name, 'component_')!==false ) { 
								#dump($children_modelo_name,'children_modelo_name');

								# Skip to remove elements
								# dump($ar_exclude_elements,'ar_exclude_elements');
								if( is_array($ar_exclude_elements) && in_array($children_tipo, $ar_exclude_elements) ) {
									#if(SHOW_DEBUG===true) dump($children_tipo,"removed 3 $children_tipo");
									continue; # skip
								}
								
								$RecordObj_dd2	= new RecordObj_dd($children_tipo);			
								$children_lang 	= ($RecordObj_dd2->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
								$component_obj	= component_common::get_instance($children_modelo_name,
																				 $children_tipo,
																				 $section_id,
																				 'edit',
																				 $children_lang,
																				 $section_obj->get_tipo());								

								$component_obj->current_tipo_section = $section_obj->get_tipo();//$current_tipo_section;

								$current_element_html = $component_obj->get_html();							
								$html_elements	.= $current_element_html;								
							}							
							array_push($ar_resolved_elements, $children_tipo);
							
						}#foreach ($ar_children_elements as $children_tipo)

						# Encapsulamos el resultado en un section group
						# SECTION GROUP
						$section_group 		= new section_group_div($element_tipo, $section_obj->get_tipo(), $modo, $html_elements);
							#dump($section_group,'section_group',"section group tipo $element_tipo ");

						$current_element_html = $section_group->get_html();
						#$current_element_html = '<div class="gridster"><ul>'.$current_element_html.'</ul></div>';
						$html .= $current_element_html;
						break;

				# SECTION GROUP
				case ($element_modelo_name==='section_group' || $element_modelo_name==='section_group_portal') :
						
						# El html a incluir será el resultado de la recursión de sus hijos
						$ar_children_elements = $RecordObj_dd->get_ar_childrens_of_this();
						#$ar_children_elements = RecordObj_dd::get_ar_childrens($terminoID);
							#dump($ar_children_elements,'ar_children_elements' );

						foreach ($ar_children_elements as $children_tipo) {
							
							$children_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($children_tipo,true);
								#dump($children_modelo_name,'children_modelo_name');

							if ($children_modelo_name==='section_group' || $children_modelo_name==='section_portal' || $children_modelo_name==='section_tab' || $children_modelo_name==='section_group_div') {
								#dump($children_modelo_name,'$children_modelo_name');

								# Extraemos el html del conjunto recursivamente
								$html_elements .= component_layout::walk_layout_map($section_obj, $ar_tipo_next_level, $ar_resolved_elements, $ar_exclude_elements);

							}# if ($children_modelo_name=='section_group')
							else if ( strpos($children_modelo_name, 'component_')!==false ) { 
								#dump($children_modelo_name,'children_modelo_name');

								# Skip to remove elements
								# dump($ar_exclude_elements,'ar_exclude_elements');
								if( is_array($ar_exclude_elements) && in_array($children_tipo, $ar_exclude_elements) ) {
									#if(SHOW_DEBUG===true) dump($children_tipo,"removed 3 $children_tipo");
									continue; # skip
								}
								
								$RecordObj_dd2 = new RecordObj_dd($children_tipo);
								$children_lang = ($RecordObj_dd2->get_traducible()==='no') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
								
								$component_obj = component_common::get_instance($children_modelo_name,
																				$children_tipo,
																				$section_id,
																				'edit',
																				$children_lang,
																				$section_obj->get_tipo() );
								if(SHOW_DEBUG===true) {
									#dump($component_obj," component_obj");
									#dump($section_obj->get_tipo()," section tipo  component $children_tipo ($children_modelo_name)");
								}									

								$component_obj->current_tipo_section = $section_obj->get_tipo();//$current_tipo_section;

								$current_element_html = $component_obj->get_html();
									#dump($current_element_html, ' $current_element_html ++ '.to_string($children_modelo_name));
								$html_elements	.= $current_element_html;								
							}
							else if ( strpos($children_modelo_name, 'button_')!==false ) {
								# Skip to remove elements
								# dump($ar_exclude_elements,'ar_exclude_elements');
								if( is_array($ar_exclude_elements) && in_array($children_tipo, $ar_exclude_elements) ) {
									#if(SHOW_DEBUG===true) dump($children_tipo,"removed 3 $children_tipo");
									continue; # skip
								}
								$button_obj	= new $children_modelo_name($children_tipo, ''); #$tipo, $target
								# Inyectamos el section id matrix al boton
								$button_obj->set_parent($section_id);
									#dump($button_obj,'button_obj');
								$current_element_html = $button_obj->get_html();
								$html_elements	.= $current_element_html ;
							}
							array_push($ar_resolved_elements, $children_tipo);
							if(SHOW_DEBUG===true) {
								#error_log("WALK LAYOUT ADDED Element $children_tipo");
							}
							
						}#foreach ($ar_children_elements as $children_tipo)

						# Encapsulamos el resultado en un section group
						# SECTION GROUP
						$section_group 		= new section_group($element_tipo, $section_obj->get_tipo(), $modo, $html_elements);
							#dump($section_group,'section_group',"section group tipo $element_tipo ");

						$current_element_html = $section_group->get_html();
						#$current_element_html = '<div class="gridster"><ul>'.$current_element_html.'</ul></div>';
						$html .= $current_element_html;				
						break;

				# SECTION TAB					
				case ($element_modelo_name==='section_tab') :
						
						#$ar_tab_html = array();
						# Buscamos sus tabs (son hijos)
						$ar_tabs = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($terminoID, $modelo_name='tab', $relation_type='children');
							#dump($ar_tabs,'ar_tabs');

						# Extract every tab html
						foreach($ar_tabs as $tab_tipo) {

							$ar_tipo_next_level 	= array();	# reset ar_tipo_next_level
							$RecordObj_dd			= new RecordObj_dd($tab_tipo);				
							$ar_related_elements	= $RecordObj_dd->get_ar_childrens_of_this();							

							foreach($ar_related_elements as $component_tipo) {
								
								# Formated as 'ar_tipo'  $key=>array()
								$ar_tipo_next_level[$component_tipo] = array();
									#dump($ar_tipo_next_level,"ar_tipo_next_level $terminoID");
								
								$ar_tab_html[$tab_tipo] = component_layout::walk_layout_map($section_obj,$ar_tipo_next_level, $ar_resolved_elements, $ar_exclude_elements);
									#dump( $ar_tab_html[$tab_tipo],'$ar_tab_html[$tab_tipo]');
							}									
						}

						# Compound section tap
						$section_tab = new section_tab($terminoID, $section_obj->get_tipo(), 'edit', $ar_tab_html, $section_id);
							#dump($section_tab,'section_tab',"section tab tipo $terminoID ");
						$html .= $section_tab->get_html();

						break;


				# SECTION GROUP RELATION
				case ($element_modelo_name==='section_group_relation') :
						continue; // DEACTIVATED FOR NOW

						# Calcular html de cada seccion									
						# SECTION GROUP RELATION
							# Despejamos el hijo de este section_group_relation. Será el componente 'component_relation' del cual obtendremos el tipo para crear el componente relation
							#$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($terminoID, $cache=true, $simple=true);
							$RecordObj_dd				= new RecordObj_dd($terminoID);				
							$ar_terminos_relacionados	= $RecordObj_dd->get_ar_childrens_of_this();
								#dump($ar_terminos_relacionados,'$ar_terminos_relacionados',"con tipo_section_group:$terminoID");

							if(empty($ar_terminos_relacionados) || count($ar_terminos_relacionados)>1) 
								throw new Exception("Incorrect section_group_relation config. Please review structure data", 1);
							
						# COMPONENT RELATION
							# Creamos el componente 'component_relation' a partir del tipo, el modo y el parent (la sección adtual) 									
							$component_relation_tipo= $ar_terminos_relacionados[0];
							#$component_relation 	= new component_relation($component_relation_tipo, $section_id, 'edit');
							$component_relation 	= component_common::get_instance('component_relation', $component_relation_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $section_obj->get_tipo());
								#dump($component_relation,'$component_relation');

							
							
							# Component relation id. Calculamos su ID
							$component_relation_id = $component_relation->get_id();

							
							# Despejamos todas las secciones (por tipo) que tinen registros en este component_relation
							# Las secciones definidas fijas en estructura, se incluirán en cualquier caso, aun no teniendo registros
							$ar_all_relation_sections = $component_relation->get_ar_all_relation_sections();
								#dump($ar_all_relation_sections,'$ar_all_relation_sections');
							
							# Recorremos todas las secciones del componente en modo 'relation' y les extraemos su contenido html que
							# viene ya encapsulado en section_groups
							foreach ($ar_all_relation_sections as $tipo_section) {

								# Configuramos el componente asignándole la sección en curso
								$component_relation->set_current_tipo_section($tipo_section);									
								# Extraemos el html sección a sección
								$html .= $component_relation->get_html();
									#dump($component_relation,'tipo_section');
							}

							# Fix section caller_tipo for eventual selection use
							#$this->caller_tipo = $component_relation_tipo;											
						/*
						# COMPONENT RELATION : LIST SELECTOR (INSPECTOR)
							# Después de todos los section_group añadimos el selector de secciones a relacionar que se cargará abajo
							$component_relation->set_modo('selector');
							$component_relation->set_current_tipo_section($component_relation_tipo);
							$selector_html = $component_relation->get_html();
							# Lo envolvemos con un section group
							$section_group_selector			= new section_group($component_relation_tipo, $modo, $selector_html, $section_id);
						
							$html .= $section_group_selector->get_html();
						*/	
						break;

				# COMPONENTS
				case (strpos($element_modelo_name, 'component_')!==false) :

						$component_obj	= component_common::get_instance($element_modelo_name,
																		 $terminoID,
																		 $section_id,
																		 'edit',
																		 $element_lang,
																		 $section_obj->get_tipo());
						$component_obj->current_tipo_section = $current_tipo_section;
							#dump($section_obj->get_tipo()," section tipo  component $terminoID ($element_modelo_name)"); #die();
						$html	.= $component_obj->get_html();
							#dump($element_modelo_name,"component_obj");
							#dump($component_obj->generate_json_element, '$component_obj->generate_json_element ++ '.to_string());					
						break;

				# BUTTONS
				case (strpos($element_modelo_name, 'button_')!==false) :
						$button_obj	= new $element_modelo_name($terminoID, ''); #$tipo, $target
						# Inyectamos el section id matrix al boton
						$button_obj->set_parent($section_id);
							#dump($button_obj,'button_obj');
						$html	.= $button_obj->get_html();

						break;
				
				# RELATION_LIST
				case (strpos($element_modelo_name, 'relation_list')!==false):
						# Nothing to do
						break;

				# COMPONENTS
				case ($element_modelo_name==='box elements') :
						# Nothing to do
						debug_log(__METHOD__." Skipped box element ".to_string($terminoID), logger::DEBUG);
						break;		
				default:
						throw new Exception("Error Processing Request. Tipo $terminoID ($element_modelo_name) not valid", 1);													
						break;
			}
			#array_push($ar_resolved_elements, $terminoID);

		}# end foreach
		

		return $html;
	}//end walk_layout_map



	/**
	* GET_VALUE_BY_KEY
	*/
	public static function get_value_by_key($array,$key) {
		
		foreach($array as $k=>$each) {

			if($k==$key) {
			   return $each;
			}

			if(is_array($each)) {
				if($return = component_layout::get_value_by_key($each,$key)) {
					return $return;
				}
			}
	 	}#end foreach($array as $k=>$each)
	}//end get_value_by_key
	

	

	
	


	



	

















	/* DEPRECATED METHODS 
	-------------------------------------------------------------------------------------------------------------------*/

		/**
		* BUILD_HTML_TEMPLATE
		* Get html code and create a template with apropiated substitutions
		* @param string $html_string . DOM element .page html
		* @return string $html_template
		* @see Documentation: http://simplehtmldom.sourceforge.net/manual.htm
		* @see Used in tool_layout_print
		*/
		public static function build_html_template__DEPRECATED($html_string) {

			# include dom parser
			include DEDALO_ROOT . '/lib/dom/simple_html_dom.php';

			if(SHOW_DEBUG===true) {
			 	#dump( htmlspecialchars($html_string)," html_string ");
			} 
			
			# Load to DOM parser
			$html = str_get_html($html_string);
			
			# Find elements by class (like jquery)
			$ar_component_box = (array)$html->find('div[class=dedalo_component]');
			
			foreach ($ar_component_box as $key => $box) {

				# Component_tipo is id attr
				$component_tipo = $box->id;			
					#dump($box->id," ");

				# Replace DOM element content with template var (like Smarty..)
				$box->innertext = '{'.$component_tipo.'}';
			}
			
			# Dumps the internal DOM tree back into string 
			$html_template = trim($html->save());
				#dump( htmlspecialchars($html_template) );

			return (string)$html_template;

		}//end build_html_template



		/**
		* RENDER_TEMPLATE_PREVIEW
		* Rebuild html from template. Replace php vars (like $oh1) by component html data
		* @param string $html_template
		* @param int $parent OR null. id matrix of current section
		* @return string $html_template
		*/
		public static function render_template_preview__DEPERECATED( $html_template, $record, $is_recursion=false ) {
			#error_log($html_template);				

			$parent 		= (int)$record['section_id'];
			$section_tipo 	= (string)$record['section_tipo'];

			#dump($section_tipo, ' section_tipo');
			$parent = empty($parent) ? null : (int)$parent;
			#error_log("parent: $parent");
			#dump( htmlspecialchars($html_template) );

			$pattern = self::$pattern_tipo;	# "/\{(\w*)\}/";
			preg_match_all($pattern, $html_template, $output_array);
				#dump($output_array, ' output_array');#die();

			if (empty($output_array[1])) {
				if(SHOW_DEBUG===true) {
					#error_log("This template don't have components!");
				}
				return $html_template; # Return untouched html
			}
			$ar_component_tipo = (array)$output_array[1];

			foreach ( $ar_component_tipo as $key => $component_tipo) {

				if ( strpos($component_tipo, '_')!==false && !$is_recursion) {
					#continue;
					$ar_tipos = explode('_', $component_tipo);
					$portal_tipo 	  = $ar_tipos[0];
					$portal_component = $ar_tipos[1];

					//error_log("portal_tipo:$portal_tipo - portal_component:$portal_component");

					$component_portal = component_common::get_instance('component_portal',$portal_tipo,$parent,'print',DEDALO_DATA_NOLAN,$section_tipo);
					$dato = $component_portal->get_dato();

					$parent = isset($dato[0]->section_id) ? $dato[0]->section_id : null;
					#dump($parent, ' parent'); die();
					#error_log( json_encode($dato) ." for $portal_tipo and portal_component:$portal_component - parent:$parent");		

					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($portal_component, true);
					$component 	 	= component_common::get_instance($modelo_name,$portal_component,$parent,'print',DEDALO_DATA_LANG,$section_tipo); // oh25_rsc70
					$component_html = $component->get_html();

					# Replace php var name with component html 
					$find 	 = '{'.$component_tipo.'}';
					$replace = trim($component_html);

					# Add button close
					$replace = '<div id="close" class="close" onclick="javascript:returnLeft('.$component_tipo.')"></div>'.$replace;
					$html_template = str_replace($find, $replace, $html_template);				

				}else{

					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
					$component 	 	= component_common::get_instance($modelo_name,$component_tipo,$parent,'print',DEDALO_DATA_LANG,$section_tipo); // oh25_rsc70
					$component_html = $component->get_html();

					# Replace php var name with component html 
					$find 	 = '{'.$component_tipo.'}';
					$replace = trim($component_html);
					# Add button close
					$replace = '<div id="close" class="close" onclick="javascript:returnLeft('.$component_tipo.')"></div>'.$replace;
					$html_template = str_replace($find, $replace, $html_template);
					#$html_template = preg_replace($pattern, $replace, $html_template); # preg replace version
				}			
				
			}//end foreach ( $ar_component_tipo as $key => $component_tipo)
			
			$html_template = preg_replace("/ {2,}/", " ", $html_template); # Remove double spaces

			if (isset($html_template_temp)) {
				$html_template .= $html_template_temp;
			}
			return $html_template;

		}#end render_template_preview



		/**
		* RENDER_TEMPLATE_FULL
		* Rebuild html from template. Replace php vars (like $oh1) by component html data
		* Create one page for each portal record
		* @param string $html_template
		* @param int $parent OR null. id matrix of current section
		* @return string $html_template
		*/
		public static function render_template_full_DEPRECATED( $html_template, $record, $is_recursion=false ) {

			$parent 		= (int)$record['section_id'];
			$section_tipo 	= (string)$record['section_tipo'];
				#dump($parent, ' parent');die();
				if (empty($parent)) {
					error_log(__METHOD__." Error: Empty parent");
					return '';
				}

			$pattern = self::$pattern_tipo;	# "/\{(\w*)\}/";
			preg_match_all($pattern, $html_template, $output_array);
				dump($output_array, ' output_array');die();

				if (empty($output_array[1])) {
					if(SHOW_DEBUG===true) {
						error_log(__METHOD__." Warning: This template don't have components!");
					}
					return $html_template; # Return untouched html
				}
				$ar_component_tipo = (array)$output_array[1];
			

			foreach ( $ar_component_tipo as $key => $component_tipo) {

				# PORTAL CASE
				if ( strpos($component_tipo, '_')!==false && !$is_recursion) {
					
					$ar_tipos = explode('_', $component_tipo);
					$portal_tipo 	  = $ar_tipos[0];
					$portal_component = $ar_tipos[1];

					$component_portal = component_common::get_instance('component_portal', $portal_tipo, $parent, 'print', DEDALO_DATA_NOLAN );
					$dato = $component_portal->get_dato();

					if(!isset($dato[0]->section_id)) {
						error_log(__METHOD__." Warning: This portal don't have records!");
						continue;
					}
					# Buil one pàge for each portal record
					$current_page = $html_template;
					foreach ($dato as $current_locator) {

						$parent 		= $current_locator->section_id;
						$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($portal_component, true);
						$component 	 	= component_common::get_instance($modelo_name,$portal_component,$parent,'print'); // oh25_rsc70
						$component_html = $component->get_html();

						# Replace php var name with component html 
						$find 	 = '{'.$component_tipo.'}';
						$replace = trim($component_html);
						$html_template = str_replace($find, $replace, $current_page);

					}//end foreach ($dato as $current_locator)

					

					# Replace php var name with component html 
					$find 	 = '{'.$component_tipo.'}';
					$replace = trim($component_html);
					# Add button close
					$replace = '<div id="close" class="close" onclick="javascript:returnLeft('.$component_tipo.')"></div>'.$replace;
					$html_template = str_replace($find, $replace, $html_template);				

				# DIRECT COMPONENT CASE
				}else{

					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
					$component 	 	= component_common::get_instance($modelo_name,$component_tipo,$parent,'print'); // oh25_rsc70
					$component_html = $component->get_html();

					# Replace php var name with component html 
					$find 	 = '{'.$component_tipo.'}';
					$replace = trim($component_html);
					# Add button close
					$replace = '<div id="close" class="close" onclick="javascript:returnLeft('.$component_tipo.')"></div>'.$replace;
					$html_template = str_replace($find, $replace, $html_template);
					#$html_template = preg_replace($pattern, $replace, $html_template); # preg replace version
				}			
				
			}//end foreach ( $ar_component_tipo as $key => $component_tipo)
			
			$html_template = preg_replace("/ {2,}/", " ", $html_template); # Remove double spaces

			if (isset($html_template_temp)) {
				$html_template .= $html_template_temp;
			}
			return $html_template;

		}#end render_template_full



	
	






	
	

	



};#END CLASS
?>