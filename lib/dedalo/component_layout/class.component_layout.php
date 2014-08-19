<?php
/*
* CLASS COMPONENT LAYOUT

  Se encarga de hacer la agrupaciones de componentes para la visualización de las fichas, tanto en los listados
  como en edit o relation
  Hay un 'mapeo' obligatorio en estructura para cada modo y en adelante se implementará como una preferencia del usuario
  que sobre-escribe la de la estructura usada por defecto.
  Si no se define para una sección generará un excepción.
  Extiente component_common ya que guardará datos en matrix cuando esté habilitada la opción

*/

class component_layout extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	public $section_obj;

	public $ar_resolved =array();
	public $ar_tipo_source;
	
	# CONSTRUCT
	# __construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL) {
	public function __construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL) {
		
		# De momento, no gestiona datos internos, por lo que NO llama al constructor real de su parent (component_common)
		# Más adelante utilizará un mapeo personalizado guardado en matrix
		return NULL;
	}


	/**
	* GET DATO
	*/
	protected function get_dato() {

		# Process and format dato here
		return NULL;

		#return parent::get_dato();
	}

	
	/**
	* GET LAYOUT MAP FOR CURRENT SECION
	*/
	public function get_layout_map(section $section_obj) {

		$layout_map 	= array();

		# Fix $this->section_obj
		$this->section_obj 	= $section_obj;
		$modo 				= $section_obj->get_modo();
		$section_tipo 		= $section_obj->get_tipo();

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$section_tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}


		# COMPONENTS
		# Array of all components of this section
		#$ar_components = $section_obj->get_section_components();
			#dump($ar_components,'ar_components',"Components of current section ($this->id)");

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
						$ar_layout_hierarchie = $this->get_ar_layout_hierarchy($section_tipo);
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

						# portal_tipo es configurado en el objeto section al hacer la llamada desde el controlado component_portal
						$portal_tipo = $this->section_obj->portal_tipo;

						#$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($portal_tipo, $cache=true, $simple=true);
						$ar_terminos_relacionados = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($portal_tipo, $modelo_name='component_', $relation_type='termino_relacionado'); 
							#dump($ar_terminos_relacionados,'$ar_terminos_relacionados');
						
						if(empty($ar_terminos_relacionados)) throw new Exception("Portal structure error. Please define TR components", 1);						

						foreach ($ar_terminos_relacionados as $terminoID) {
							$layout_map[$portal_tipo][] = $terminoID;
						}
						#dump($layout_map,'$layout_map');
						
					}
					# LOG
					#$log = logger::get_instance();
					#$log->log_message("Loaded layout_map for section tipo $section_tipo " , logger::DEBUG, __METHOD__);					
					break;

			case 'list_tm':			
			case 'list':
					
					if (!empty($dato)) {
						# Usamos el guardado en matrix como dato del usuario actual
						# De momento no existe esta opción..					
					
					}else{

						$current_section_to_list = $section_tipo;

						#dump($this->section_obj->get_RecordObj_ts()->get_relaciones()[0],'$this->section_obj');
						#
						# RELACIONES (SECTION VIRTUAL)
						$relaciones = $this->section_obj->get_RecordObj_ts()->get_relaciones()[0];
							#dump($relaciones,'relaciones '.$this->tipo);
							if(!empty($relaciones)) {
								foreach ($relaciones as $key => $value) {
									$modelo 	= RecordObj_ts::get_termino_by_tipo($key);
									#if($modelo=='section') $current_section_to_list = $value;
								}
							}


						# Usamos el default definido en estructura
						# SECTION LIST
						# Usamos el section list (puede haber varios) para establecer qué componentes se mostrarán y en qué orden se agruparán estos						
						$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_to_list, $ar_modelo_name_required=array('section_list'));
							#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $$current_section_to_list");
						
						if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
							# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
							$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
								#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

							if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
								$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($terminoID);
								# Exclude 'tools_search'
								if(strpos($modelo_name, 'component_')!==false) {
									$layout_map[$section_list_tipo][]	= $terminoID;
								}								
							}else{
								error_log("Current section list don't have any component to show. Please configure properly this section list in structure");
							}
						}else{
							if(SHOW_DEBUG) {
								dump($ar_section_list,'$ar_section_list');
							}
							throw new Exception("section_list for $section_tipo is not defined in structure (empty ar_section_list)", 1);
						}
						#dump($layout_map,'$layout_map');
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
						$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required=array('relation_list'));
							#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
						
						if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
							# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
							$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
								#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

							if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
								$layout_map[$section_list_tipo][]	= $terminoID;
							}
						}else{
							throw new Exception("relation_list not found in structure. Please define relation_list for ". RecordObj_ts::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
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
						$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required=array('relation_list'));
							#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
						
						if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
							# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
							$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
								#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

							if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
								$layout_map[$section_list_tipo][]	= $terminoID;
							}
						}else{
							throw new Exception("relation_list not found in structure. Please define relation_list for ". RecordObj_ts::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
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
						$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required=array('relation_reverse_list'));
							#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
						
						if(!empty($ar_section_list)) foreach ($ar_section_list as $section_list_tipo) {
							# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
							$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($section_list_tipo, $cache=false, $simple=true);
								#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

							if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
								$layout_map[$section_list_tipo][] = $terminoID;
							}
						}else{
							throw new Exception("relation_reverse_list not found in structure. Please define relation_reverse_list for ". RecordObj_ts::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
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
						$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required=array('search_list'));
							#if(SHOW_DEBUG===true) dump($ar_section_list,'$ar_section_list',"ar section list para $section_tipo");
						
						if(!empty($ar_search_list)) foreach ($ar_search_list as $search_list_tipo) {
							# Averiguamos los términos relacionados que tiene (serán los componentes agrupados por el)
							$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($search_list_tipo, $cache=false, $simple=true);
								#if(SHOW_DEBUG===true) dump($ar_terminos_relacionados,'ar_terminos_relacionados');

							if(!empty($ar_terminos_relacionados)) foreach ($ar_terminos_relacionados as $terminoID) {
								$layout_map[$search_list_tipo][] = $terminoID;
							}
						}else{
							throw new Exception("search_list not found in structure. Please define search_list for ". RecordObj_ts::get_termino_by_tipo($section_tipo). " [$section_tipo]", 1);
						}
					}
					#if(SHOW_DEBUG===true) dump($layout_map,'layout_map',"layout_map for section tipo $section_tipo",true);
					
					# LOG
					#$log = logger::get_instance();
					#$log->log_message("Loaded layout_map for search tipo $section_tipo " , logger::DEBUG, __METHOD__);
					break;

			
			default:
				trigger_error("modo: $modo is not valid", E_USER_ERROR);
				
		}
		#if(SHOW_DEBUG===true) dump($layout_map,'layout_map',"layout_map for section tipo $section_tipo");		
		#dump($layout_map,'$layout_map for $section_tipo: '.$section_tipo);	
		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$section_tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}	
		
		return $layout_map;		
	}

	



	/**
	* GET_AR_LAYOUT_HIERARCHY
	* Genera el 'mapa' de los elementos necesarios para componer la sección actual resolviendo las relaciones entre componentes y grupos en la estructura.
	* Es necesario recorrerlo (walk_layout_map) para resolver su html
	* @see self::walk_layout_map
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
	protected function get_ar_layout_hierarchy($section_tipo) {
		
		# Modelo name's searched
		# Buscamos sólo los elementos raiz, no los elementos específicos como componentes o botones
		$ar_include_modelo_name = array('section_group','section_tab','section_group_relation','section_group_portal');
		$ar_current 			= array();
		$RecordObj_ts			= new RecordObj_ts($section_tipo);				
		$ar_ts_childrens		= $RecordObj_ts->get_ar_childrens_of_this();
			
		foreach ($ar_ts_childrens as $children_terminoID) {			
			
			$modelo_name	= RecordObj_ts::get_modelo_name_by_tipo($children_terminoID);
			
				# Test if modelo_name name is acepted or not 

				# Skip non include_modelo_name match (continue) 
				if( !in_array($modelo_name, $ar_include_modelo_name) ) {
					#error_log("Skiped $modelo_name in layout 'get_ar_layout_hierarchy");
					continue;
				}		

				# Reset ar_temp array value
				$ar_temp=array(); 

				# Add childrens
				$RecordObj_ts			= new RecordObj_ts($children_terminoID);
				$ar_children_elements	= $RecordObj_ts->get_ar_childrens_of_this();	#RecordObj_ts::get_ar_terminos_relacionados($children_terminoID, $cache=false, $simple=true);
					#dump($ar_children_elements,"ar_children_elements");
				
				######
				foreach($ar_children_elements as $element_tipo) {
					
					$modelo_name		= RecordObj_ts::get_modelo_name_by_tipo($element_tipo);
						#dump($modelo_name,'modelo_name');
					
					if( in_array($modelo_name, $ar_include_modelo_name) ) {

						$ar_temp[$element_tipo] = $this->get_ar_layout_hierarchy($element_tipo);
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
		
		return $ar_current;	
	}


	/**
	* WALK_LAYOUT_MAP
	* Recursive method
	* @var array $ar_tipo (is layout_map structure array)
	* @var array &$ar_resolved_elements
	*/
	public function walk_layout_map( $ar_tipo, &$ar_resolved_elements=array() ,$ar_exclude_elements) {

		$section_id				= $this->section_obj->get_id();						
		$modo 					= $this->section_obj->get_modo();
		$current_tipo_section 	= $this->section_obj->get_tipo();
		$html 					= '';
		
			#dump($ar_tipo,'$ar_tipo');
			#dump($ar_resolved_elements,'$ar_resolved_elements');

		# Recorremos el array de section groups nivel por nivel
		if(is_array($ar_tipo)) foreach ($ar_tipo as $terminoID => $ar_value) {

			# Evita re-resolver elementos
			if ( in_array($terminoID, $ar_resolved_elements) ) {
				#dump($ar_resolved_elements,"ar_resolved_elements $terminoID");
				return null;
			}

			# Skip to remove elements
			# dump($ar_exclude_elements,'ar_exclude_elements');
			if( is_array($ar_exclude_elements) && in_array($terminoID, $ar_exclude_elements) ) {
				#if(SHOW_DEBUG) dump($terminoID,"removed 4 $terminoID");
				continue; # skip
			}			

			# Resolvemos el elemento actual (será uno de 'section_group','section_tab','section_group_relation','section_group_portal')
			$RecordObj_ts 			= new RecordObj_ts($terminoID);
			$element_modelo_name	= $RecordObj_ts->get_modelo_name();	#dump($element_modelo_name,'switch element_modelo_name '.$terminoID);
			$element_tipo 			= $terminoID;
			$element_lang 			= DEDALO_DATA_LANG;	if($RecordObj_ts->get_traducible()=='no') $element_lang = DEDALO_DATA_NOLAN;
			$html_elements			= '';	# Important: reset html_elements every iteration
			
			$ar_tipo_next_level 	= $ar_tipo[$terminoID];
				#dump($ar_tipo_next_level,"ar_tipo - $terminoID - ar_tipo:\n".print_r($ar_tipo,true) );

			switch (true) {

				# SECTION GROUP
				case ($element_modelo_name=='section_group' || $element_modelo_name=='section_group_portal') :
						
						# El html a incluir será el resultado de la recursión de sus hijos
						$ar_children_elements = $RecordObj_ts->get_ar_childrens_of_this();
							#dump($ar_children_elements,'ar_children_elements' );

						foreach ($ar_children_elements as $children_tipo) {
							
							$children_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($children_tipo);
								#dump($children_modelo_name,'children_modelo_name');

							if ($children_modelo_name=='section_group' || $children_modelo_name=='section_portal' || $children_modelo_name=='section_tab') {
								#dump($children_modelo_name,'$children_modelo_name');

								# Extraemos el html del conjunto recursivamente
								$html_elements .= $this->walk_layout_map($ar_tipo_next_level, $ar_resolved_elements, $ar_exclude_elements);

							}# if ($children_modelo_name=='section_group')
							else if ( strpos($children_modelo_name, 'component_')!==false ) { 
								#dump($children_modelo_name,'children_modelo_name');
								
								# Skip to remove elements
								# dump($ar_exclude_elements,'ar_exclude_elements');
								if( is_array($ar_exclude_elements) && in_array($children_tipo, $ar_exclude_elements) ) {
									#if(SHOW_DEBUG) dump($children_tipo,"removed 3 $children_tipo");
									continue; # skip
								}
								
								$RecordObj_ts2	= new RecordObj_ts($children_tipo);
								$children_lang 	= DEDALO_DATA_LANG;	if($RecordObj_ts2->get_traducible()=='no') $children_lang = DEDALO_DATA_NOLAN;

								# ID : Try calculate component id from tipo, parent, lang
								# Como hay que calcular el ID para cada componente, lo hacemos aquí, en lugar de delegar en el constructor de component_common ese cálculo
								$current_id		= component_common::get_id_by_tipo_parent($children_tipo, $section_id, $children_lang);
									#dump($current_id,'$current_id');

								$component_obj	= new $children_modelo_name($current_id, $children_tipo, $modo, $section_id, $children_lang);
								$component_obj->current_tipo_section = $current_tipo_section;
								$current_element_html = $component_obj->get_html();
								#$a++;$gg++; # GRIDSTER
								#$current_element_html = '<li data-row="'.$a.'" data-col="1" data-sizex="5" data-sizey="2">'.$current_element_html.'</li>';
								$html_elements	.= $current_element_html ;
								
							}
							else if ( strpos($children_modelo_name, 'button_')!==false ) {
								# Skip to remove elements
								# dump($ar_exclude_elements,'ar_exclude_elements');
								if( is_array($ar_exclude_elements) && in_array($children_tipo, $ar_exclude_elements) ) {
									#if(SHOW_DEBUG) dump($children_tipo,"removed 3 $children_tipo");
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
							
						}#foreach ($ar_children_elements as $children_tipo)

						# Encapsulamos el resultado en un section group
						# SECTION GROUP
						$section_group 		= new section_group($element_tipo, $modo, $html_elements, $section_id);
							#dump($section_group,'section_group',"section group tipo $element_tipo ");

						$current_element_html = $section_group->get_html();
						#$current_element_html = '<div class="gridster"><ul>'.$current_element_html.'</ul></div>';
						$html .= $current_element_html;					
						break;

				# SECTION TAB					
				case ($element_modelo_name=='section_tab') :
						
						#$ar_tab_html = array();
						# Buscamos sus tabs (son hijos)
						$ar_tabs = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($terminoID, $modelo_name='tab', $relation_type='children');
							#dump($ar_tabs,'ar_tabs');

						# Extract every tab html
						foreach($ar_tabs as $tab_tipo) {

							$ar_tipo_next_level 	= array();	# reset ar_tipo_next_level
							$RecordObj_ts			= new RecordObj_ts($tab_tipo);				
							$ar_related_elements	= $RecordObj_ts->get_ar_childrens_of_this();							

							foreach($ar_related_elements as $component_tipo) {
								
								# Formated as 'ar_tipo'  $key=>array()
								$ar_tipo_next_level[$component_tipo] = array();
									#dump($ar_tipo_next_level,"ar_tipo_next_level $terminoID");
								
								$ar_tab_html[$tab_tipo] = $this->walk_layout_map($ar_tipo_next_level, $ar_resolved_elements, $ar_exclude_elements);
									#dump( $ar_tab_html[$tab_tipo],'$ar_tab_html[$tab_tipo]');
							}									
						}

						# Compound section tap
						$section_tab = new section_tab($terminoID, 'edit', $ar_tab_html, $section_id);
							#dump($section_tab,'section_tab',"section tab tipo $terminoID ");
						$html .= $section_tab->get_html();

						break;


				# SECTION GROUP RELATION
				case ($element_modelo_name=='section_group_relation') :
						
						# Calcular html de cada seccion									
						# SECTION GROUP RELATION
							# Despejamos el hijo de este section_group_relation. Será el componente 'component_relation' del cual obtendremos el tipo para crear el componente relation
							#$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($terminoID, $cache=true, $simple=true);
							$RecordObj_ts				= new RecordObj_ts($terminoID);				
							$ar_terminos_relacionados	= $RecordObj_ts->get_ar_childrens_of_this();
								#dump($ar_terminos_relacionados,'$ar_terminos_relacionados',"con tipo_section_group:$terminoID");

							if(empty($ar_terminos_relacionados) || count($ar_terminos_relacionados)>1) 
								throw new Exception("Incorrect section_group_relation config. Please review structure data", 1);
							
						# COMPONENT RELATION
							# Creamos el componente 'component_relation' a partir del tipo, el modo y el parent (la sección adtual) 									
							$component_relation_tipo= $ar_terminos_relacionados[0];
							$component_relation 	= new component_relation(NULL, $component_relation_tipo, 'edit', $section_id);	#$id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
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
							$this->caller_tipo = $component_relation_tipo;											
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
						
						# ID : Try calculate component id from tipo, parent, lang
						# Como hay que calcular el ID para cada componente, lo hacemos aquí, en lugar de delegar en el constructor de component_common ese cálculo
						$current_id		= component_common::get_id_by_tipo_parent($terminoID, $section_id, $element_lang);
							#dump($current_id,'$current_id');

						$component_obj	= new $element_modelo_name($current_id, $terminoID, $modo, $section_id, $element_lang);
						$component_obj->current_tipo_section = $current_tipo_section;
						$html	.= $component_obj->get_html();
							#dump($element_modelo_name,"component_obj");
											
						break;

				# BUTTONS
				case (strpos($element_modelo_name, 'button_')!==false) :
						$button_obj	= new $element_modelo_name($terminoID, ''); #$tipo, $target
						# Inyectamos el section id matrix al boton
						$button_obj->set_parent($section_id);
							#dump($button_obj,'button_obj');
						$html	.= $button_obj->get_html();

						break;		

				default:
						throw new Exception("Error Processing Request. Tipo $terminoID ($element_modelo_name) not valid", 1);													
						break;
			}
			#array_push($ar_resolved_elements, $terminoID);

		}# end foreach
		

		return $html;

	}#end walk_layout_map




	/**
	* GET_VALUE_BY_KEY
	*/
	public static function get_value_by_key($array,$key) {
		
		foreach($array as $k=>$each) {

			if($k==$key) {
			   return $each;
			}

			if(is_array($each)) {
				if($return = self::get_value_by_key($each,$key)) {
					return $return;
				}
			}

	 	}#end foreach($array as $k=>$each)
	}




	/**
	* GET_AR_LAYOUT_HIERARCHY
	* Genera el 'mapa' de los elementos necesarios para componer la sección actual resolviendo las relaciones entre componentes y grupos en la estructura.
	* Es necesario recorrerlo (walk_layout_map) para resolver su html
	* @see $this->walk_layout_map
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
	*//*
	protected function get_ar_layout_hierarchy__OLD__($section_tipo) {
		
		# Modelo name's searched
		$ar_include_modelo_name = array('section_group','section_tab','section_group_relation','section_group_portal');
		$ar_current 			= array();
		$RecordObj_ts			= new RecordObj_ts($section_tipo);				
		$ar_ts_childrens		= $RecordObj_ts->get_ar_childrens_of_this();
			
		foreach ($ar_ts_childrens as $children_terminoID) {				
			
			$RecordObj_ts	= new RecordObj_ts($children_terminoID);
			$modeloID		= $RecordObj_ts->get_modelo($children_terminoID);				
			$modelo_name	= RecordObj_ts::get_termino_by_tipo($modeloID);
			
			# Test if modelo_name name is acepted or not 
			foreach($ar_include_modelo_name as $current_element) {

				# Skip non include_modelo_name match (continue)
				if( strpos($current_element, $modelo_name)===false ) continue;		

				# Reset ar_temp array value
				$ar_temp=array(); 

				# Add términos relacionados 
				$ar_related_elements		= RecordObj_ts::get_ar_terminos_relacionados($children_terminoID, $cache=false, $simple=true);
					#dump($ar_related_elements,"ar_related_elements");
				foreach($ar_related_elements as $component_tipo) {
					#$ar_temp[] = $component_tipo;
					$ar_temp[$component_tipo] = array();
				}

				$ar_current[$children_terminoID]= $ar_temp;				

			}#end foreach ($ar_ts_childrens as $children_terminoID)				

		}#end foreach ($ar_ts_childrens as $children_terminoID) 			
		#dump($ar_current,'GET_AR_LAYOUT_HIERARCHy',"array recursive pass section_tipo:$section_tipo ");
		
		return $ar_current;	
	}
	*/

	/**
	* WALK LAYOUT MAP
	* Recursive
	* @param $ar_tipo . Initial: layout_map (array ar_layout_hierarchie)
	* @return $html
	*//*
	public function walk_layout_map__OLD__($ar_tipo, $html='', &$ar_resolved=array(), $ar_tipo_source=array()) {
		
		#dump($ar_tipo,'WALK_LAYOUT_MAP AR_TIPO '); #return NULL;
		
		# Store original map to use later
		if(empty($ar_tipo_source)) $ar_tipo_source = $ar_tipo;

		$section_id			= $this->section_obj->get_id();						
		$modo 				= $this->section_obj->get_modo();	
		$components_html 	= '';	
		
		foreach ($ar_tipo as $terminoID => $ar_value) {			
			
			# Skip resolved elements (continue)
			if( in_array($terminoID, $ar_resolved) ) {
				#dump("resolved termino $terminoID", "RESOLVED TERMINO AND STOP XXXXXXXXXXXXXXXXXXXXXXX");
				continue;
			}
			#dump($ar_resolved, "this->ar_resolved on $terminoID");

			# Resolvemos el componente actual
			$RecordObj_ts 		= new RecordObj_ts($terminoID);
			$modelo_name 		= $RecordObj_ts->get_modelo_name();	#dump($modelo_name,'switch modelo_name '.$terminoID);
			$component_tipo 	= $terminoID;
			$component_lang 	= DEDALO_DATA_LANG;	if($RecordObj_ts->get_traducible()=='no') $component_lang = DEDALO_DATA_NOLAN;

			# Manage different types of elements (section_group,section_tab, section_group_relation, components.. )			
			switch(true) {

				# SECTION GROUP
				case ($modelo_name=='section_group' || $modelo_name=='section_group_portal' ) :
								if(SHOW_DEBUG) $start_time = start_time();
								# Si no tiene hijos directos, mapeamos el array de partida hacia su situación real
								# Aunque volverá a recorrerse, no se volverá a calcular porque estará incluido en 'ar_resolved'
								if( count($ar_value)==0 ) {
									# mapeamos el array original con el término actual como punto de partida
									#  [dd295] => Array (
									#            [dd296] => Array ()									
									#            [dd705] => Array () <- section group inside relation
									#            [dd404] => Array ()
									#            ..
									if(isset($ar_tipo_source[$terminoID]))
									$ar_value = $ar_tipo_source[$terminoID];	#dump($ar_value,'$ar_value SECTION GROUP RELATION INSIDE #################');
								}								

								# Creamos un section group a partir del html generado por este mismo método (recursión)
								$section_group_html = $this->walk_layout_map($ar_value, '', $ar_resolved, $ar_tipo_source);
								$section_group 		= new section_group($terminoID, $modo, $section_group_html, $section_id);
									#dump($section_group,'section_group',"section group tipo $terminoID ");
								$html .= $section_group->get_html();

								if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $terminoID ." [$modelo_name] ".count($ar_value)." elements " . to_string(array_keys($ar_value)) );
								break;
				
				# SECTION TAB					
				case ($modelo_name=='section_tab') :
								if(SHOW_DEBUG) $start_time = start_time();
								# Buscamos sus tabs (son hijos)
								$ar_tabs = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($terminoID, $modelo_name='tab', $relation_type='children');
									#dump($ar_tabs,'ar_tabs');

								# Extract every tab html
								foreach($ar_tabs as $tab_tipo) {

									$ar_value = array();	# reset ar_value
									$ar_related_elements		= RecordObj_ts::get_ar_terminos_relacionados($tab_tipo, $cache=false, $simple=true);
									foreach($ar_related_elements as $component_tipo) {
										
										# Formated as 'ar_tipo'  $key=>array()
										$ar_value[$component_tipo] = array();
											#dump($ar_value,'ar_value');
										
										$ar_tab_html[$tab_tipo] 	= $this->walk_layout_map($ar_value, '', $ar_resolved, $ar_tipo_source);
											#dump( $ar_tab_html[$tab_tipo],'$ar_tab_html[$tab_tipo]');
									}									
								}

								# Compound section tap
								$section_tab = new section_tab($terminoID, 'edit', $ar_tab_html, $section_id);
									#dump($section_tab,'section_tab',"section tab tipo $terminoID ");
								$html .= $section_tab->get_html();

								if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $terminoID ." [$modelo_name] ".count($ar_value)." elements ". to_string(array_keys($ar_value)) );
								break;
								
				# SECTION GROUP RELATION
				case ($modelo_name=='section_group_relation'):
								if(SHOW_DEBUG) $start_time = start_time();
								# Calcular html de cada seccion 
									
								# SECTION GROUP RELATION
									# Despejamos el hijo de este section_group_relation. Será el componente 'component_relation' del cual obtendremos el tipo para crear el componente relation
									$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($terminoID, $cache=true, $simple=true);
										#dump($ar_terminos_relacionados,'$ar_terminos_relacionados',"con tipo_section_group:$tipo_section_group");

									if(empty($ar_terminos_relacionados) || count($ar_terminos_relacionados)>1) 
										throw new Exception("Incorrect section_group_relation config. Please review structure data", 1);
									
								# COMPONENT RELATION
									# Creamos el componente 'component_relation' a partir del tipo, el modo y el parent (la sección adtual) 									
									$component_relation_tipo= $ar_terminos_relacionados[0];
									$component_relation 	= new component_relation(NULL, $component_relation_tipo, 'edit', $section_id);	#$id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
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
									$this->caller_tipo = $component_relation_tipo;											


								# COMPONENT RELATION : LIST SELECTOR (INSPECTOR)
									# Después de todos los section_group añadimos el selector de secciones a relacionar que se cargará abajo
									$component_relation->set_modo('selector');
									$component_relation->set_current_tipo_section($component_relation_tipo);
									$selector_html = $component_relation->get_html();
									# Lo envolvemos con un section group
									$section_group_selector			= new section_group($component_relation_tipo, $modo, $selector_html, $section_id);
									$html .= $section_group_selector->get_html();
								
								if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $component_relation_tipo ." [$modelo_name]" );	
								break;

				# COMPONENT
				default:		if(SHOW_DEBUG) $start_time = start_time();	#dump($modelo_name,'$modelo_name');
								$component_obj	= new $modelo_name(NULL, $component_tipo, $modo, $section_id, $component_lang);
									#dump($traducible, " NULL, $component_tipo, $modo, $this->id, $component_lang, $this->lang ");

								# Set current section object to current component
								$component_obj->section_obj = $this->section_obj;

								$html 	.= $component_obj->get_html();
								if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $component_tipo ." [$modelo_name]" );

			}
			# Push current term as resolved			
			array_push($ar_resolved, $terminoID);

		
		}#end foreach ($ar_tipo as $terminoID => $ar_value)
		
		#dump($this->ar_resolved, "this->ar_resolved");		

		return $html;
	}
	*/



	



	/**
	* WALK LAYOUT MAP
	* Recursive
	* @param $ar_tipo . Initial: layout_map (array ar_layout_hierarchie)
	* @return $html
	*//*
	public function walk_layout_map_DES__($ar_tipo, $html='', &$ar_resolved=array(), $ar_tipo_source=array()) {
		
		#dump($ar_tipo,'WALK_LAYOUT_MAP AR_TIPO '); #return NULL;
				
		# Store original map to use later
		if(empty($ar_tipo_source)) $ar_tipo_source = $ar_tipo;

		$section_id	= $this->section_obj->get_id();						
		$modo 		= $this->section_obj->get_modo();	
		$html 		= '';	
		
		foreach ($ar_tipo as $terminoID => $ar_value) {			
			
			#dump($terminoID, "terminoID: $terminoID");

			# Resolvemos el elemento actual
			$RecordObj_ts 			= new RecordObj_ts($terminoID);
			$element_modelo_name	= $RecordObj_ts->get_modelo_name();	#dump($element_modelo_name,'switch element_modelo_name '.$terminoID);
			$element_tipo 			= $terminoID;
			$element_lang 			= DEDALO_DATA_LANG;	if($RecordObj_ts->get_traducible()=='no') $element_lang = DEDALO_DATA_NOLAN;

			$ar_section_group = array('section_group','section_group_portal','section_tab');

			# Manage different types of elements (section_group,section_tab, section_group_relation, components.. )			
			switch(true) {

				# SECTION GROUP				
				case ( in_array($element_modelo_name, $ar_section_group) ) :
								#if(SHOW_DEBUG) $start_time = start_time();
								
								# Obtenemos los componentes (son sus hijos directos)
								$ar_children_elements	= $RecordObj_ts->get_ar_childrens_of_this();
									#dump($ar_children_elements,'$ar_children_elements');
							
								# Obtenemos el html de cada componente secuencialmente
								$components_html ='';
								foreach ($ar_children_elements as $key => $component_terminoID) {
									
									$RecordObj_ts 			= new RecordObj_ts($component_terminoID);
									$component_modelo_name	= $RecordObj_ts->get_modelo_name();
										#dump($component_modelo_name,"$key - component_modelo_name - $component_terminoID");
									
									# Descartamos los posibles anidamientos de section_groups dentro de otros
									if( in_array($component_modelo_name, $ar_section_group) ) {

										if($component_modelo_name=='section_tab') {

											# Buscamos sus tabs (son hijos)
											#$ar_tabs = RecordObj_ts::get_ar_terminoID_by_element_modelo_name_and_relation($terminoID, $element_modelo_name='tab', $relation_type='children');
												#dump($ar_tabs,'ar_tabs');
										}else{

											# SECTION GROUP INSIDE SECTION GROUP
											$ar_tipo_new = get_value_by_key($ar_tipo,$terminoID);
												#dump($ar_tipo_new,'ar_tipo_new');
											$components_html = $this->walk_layout_map($ar_tipo_new);
										}										
										

									}else{

										# COMPONENTS
										if (strpos($component_modelo_name, 'component_')!==false) {
											//throw new Exception("Current component has no valid model assigned. Plase review the structure for mistakes [$component_modelo_name]", 1);										
										
											$component_lang 		= DEDALO_DATA_LANG;	if($RecordObj_ts->get_traducible()=='no') $component_lang = DEDALO_DATA_NOLAN;
											$component_obj			= new $component_modelo_name(NULL, $component_terminoID, $modo, $section_id, $component_lang);
												#dump($component_modelo_name,'$component_modelo_name');								

											# Set current section object to current component
											$component_obj->section_obj = $this->section_obj;
											$component_obj->set_current_tipo_section( $this->section_obj->get_tipo() );

											$components_html 	.= $component_obj->get_html();
										}

									}//if( in_array($component_modelo_name, $ar_section_group) )									
																		
								}#end foreach

								
								$section_group 		= new section_group($element_tipo, $modo, $components_html, $section_id);
									#dump($section_group,'section_group',"section group tipo $element_tipo ");
								$html .= $section_group->get_html();

								#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $terminoID ." [$element_modelo_name] ".count($ar_value)." elements " . to_string(array_keys($ar_value)) );
								break;
				
				# SECTION TAB					
				case ($element_modelo_name=='section_tab99') :
								#if(SHOW_DEBUG) $start_time = start_time();
								# Buscamos sus tabs (son hijos)
								$ar_tabs = RecordObj_ts::get_ar_terminoID_by_element_modelo_name_and_relation($terminoID, $element_modelo_name='tab', $relation_type='children');
									#dump($ar_tabs,'ar_tabs');

								# Extract every tab html
								foreach($ar_tabs as $tab_tipo) {

									$ar_value = array();	# reset ar_value
									$ar_related_elements		= RecordObj_ts::get_ar_terminos_relacionados($tab_tipo, $cache=false, $simple=true);
									foreach($ar_related_elements as $component_tipo) {
										
										# Formated as 'ar_tipo'  $key=>array()
										$ar_value[$component_tipo] = array();
											#dump($ar_value,'ar_value');
										
										$ar_tab_html[$tab_tipo] 	= $this->walk_layout_map($ar_value, '', $ar_resolved, $ar_tipo_source);
											#dump( $ar_tab_html[$tab_tipo],'$ar_tab_html[$tab_tipo]');
									}									
								}

								# Compound section tap
								$section_tab = new section_tab($terminoID, 'edit', $ar_tab_html, $section_id);
									#dump($section_tab,'section_tab',"section tab tipo $terminoID ");
								$html .= $section_tab->get_html();

								#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $terminoID ." [$element_modelo_name] ".count($ar_value)." elements ". to_string(array_keys($ar_value)) );
								break;
								
				# SECTION GROUP RELATION
				case ($element_modelo_name=='section_group_relation'):
								#if(SHOW_DEBUG) $start_time = start_time();
								# Calcular html de cada seccion 
									
								# SECTION GROUP RELATION
									# Despejamos el hijo de este section_group_relation. Será el componente 'component_relation' del cual obtendremos el tipo para crear el componente relation
									$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($terminoID, $cache=true, $simple=true);
										#dump($ar_terminos_relacionados,'$ar_terminos_relacionados',"con tipo_section_group:$tipo_section_group");

									if(empty($ar_terminos_relacionados) || count($ar_terminos_relacionados)>1) 
										throw new Exception("Incorrect section_group_relation config. Please review structure data", 1);
									
								# COMPONENT RELATION
									# Creamos el componente 'component_relation' a partir del tipo, el modo y el parent (la sección adtual) 									
									$component_relation_tipo= $ar_terminos_relacionados[0];
									$component_relation 	= new component_relation(NULL, $component_relation_tipo, 'edit', $section_id);	#$id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
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
									$this->caller_tipo = $component_relation_tipo;											

								# COMPONENT RELATION : LIST SELECTOR (INSPECTOR)
									# Después de todos los section_group añadimos el selector de secciones a relacionar que se cargará abajo
									$component_relation->set_modo('selector');
									$component_relation->set_current_tipo_section($component_relation_tipo);
									$selector_html = $component_relation->get_html();
									# Lo envolvemos con un section group
									$section_group_selector			= new section_group($component_relation_tipo, $modo, $selector_html, $section_id);
									$html .= $section_group_selector->get_html();
								
								#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $component_relation_tipo ." [$element_modelo_name]" );	
								break;

				# COMPONENT
				default:		
								#if(SHOW_DEBUG) $start_time = start_time();	#dump($element_modelo_name,'$element_modelo_name');
								
								#$component_obj	= new $element_modelo_name(NULL, $component_tipo, $modo, $section_id, $component_lang);
									#dump($traducible, " NULL, $component_tipo, $modo, $this->id, $component_lang, $this->lang ");

								# Set current section object to current component
								#$component_obj->section_obj = $this->section_obj;

								#$html 	.= $component_obj->get_html();
								#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $component_tipo ." [$element_modelo_name]" );
								
			}
			# Push current term as resolved			
			#array_push($ar_resolved, $terminoID);

		
		}#end foreach ($ar_tipo as $terminoID => $ar_value)
		
		#dump($this->ar_resolved, "this->ar_resolved");		

		return $html;
	}
	*/


	
	

	



};#END CLASS



/*
function get_value_by_key($array,$key) {
		
	foreach($array as $k=>$each) {

		if($k==$key) {
		   return $each;
		   #return $array[$key];
		}

		if(is_array($each)) {
			if($return = get_value_by_key($each,$key)) {
				return $return;
				#return $each[$key];
			}
		}

 	}#end foreach($array as $k=>$each)
}
*/



?>