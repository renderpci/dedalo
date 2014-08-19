<?php
/*
* CLASS COMPONENT PORTAL
*/


class component_portal extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	public $show_button_new = true;		# default show: true
	public $target_section_tipo ;		# Used to fix section tipo (calculado a partir del primer componente relacionado)
	public $portal_id ;					# Used to fix current portal_id in button new

	
	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=NULL) {

		# Force allways DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# EDIT : Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if($modo=='edit' && empty($id)) {
			
			# Despeja el id si existe a partir del tipo y el parent
			$id = component_common::get_id_by_tipo_parent($tipo, $parent, $lang);	
				#dump($id,"id calculado (get_id_by_tipo_parent) para tipo:$tipo - parent:$parent - lang:$lang");

			# Si no existe, creamos un registro, SI o SI
			if(empty($id)) {

				#throw new Exception("component_portal id not found. var: id:$id, tipo:$tipo, modo:$modo, parent:$parent, lang:$lang ", 1);				
				
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
						$component_name = RecordObj_ts::get_termino_by_tipo($tipo);
						$msg .= "<hr> ".__METHOD__." (id:$id, tipo:$tipo, parent:$parent, lang:$lang, modo:$modo) Portal $component_name ";
						$msg .= "<br> parent expected: ddXX . Current parent: $parent ";
					}
					throw new Exception($msg, 1);
				}
			}#if(empty($id)) {
		}

		# ya tenemos registro en matrix, a continuar...
		parent::__construct($id, $tipo, $modo, $parent, $lang);


		# Notificamos la carga de los elementos de la sección contenida en el portal
		$this->notify_load_lib_element_tipo_of_portal();

	}


	/**
	* NOTIFY_LOAD_LIB_ELEMENT_TIPO_OF_PORTAL : Fuerza la notificación de los elementos contenidos en 
	* la sección incluida en este portal (Si no, los elementos del portal que se cargan mediante ajax no
	* tendrán cargado su JS/CSS)
	*/ 
	protected function notify_load_lib_element_tipo_of_portal() {
		
		if ($this->modo!='edit') return;
			#dump($this->modo);

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}


		$ar_children_tipo=array();

		if(SHOW_DEBUG) $start_time = start_time();

		$ar_relaciones = $this->RecordObj_ts->get_relaciones();

		if (is_array($ar_relaciones)) foreach ($ar_relaciones as $key => $value) {

			$current_tipo = array_values($value)[0];
				#dump($current_tipo,'current_tipo');
			
			# Section : get section tipo of current related element
			$section_tipo = component_common::get_section_tipo_from_component_tipo($current_tipo);
				#dump($section_tipo,'section_tipo '.$current_tipo);

			if(empty($section_tipo)) {
				#throw new Exception("Error Processing Request. section_tipo is empty", 1);
				continue;
			}		

			# SECTION COMPONENTS : Get all components of current section
			$ar_children_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required=array('component_','button_') );

			# NOTIFY EVERY COMPONENT
			foreach ($ar_children_tipo as $key => $component_tipo) {

				$RecordObj_ts	= new RecordObj_ts($component_tipo);
				$modeloID		= $RecordObj_ts->get_modelo();
				$modelo_name 	= $RecordObj_ts->get_termino_by_tipo($modeloID);

				# Dummy
				#$component = new $modelo_name

				# Notificamos la carga del elemento a common
				common::notify_load_lib_element_tipo($modeloID,$modelo_name);
			}
			
			# Only need first element. Ignore others breaking loop
			break;				
		}

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_children_tipo);
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
	}


	public function get_valor() {
		
		$dato = $this->get_dato();
		return $dato;

		if(is_array($dato)) foreach ($dato as $value) {
			#$ar_id[] = 
		}
	}

	
	/**
	* REMOVE REFERENCES TO ID
	* Delete any reference in any component-portal to received section id matrix
	* @param $section_id (Int section id matrix)
	* @return $ar_modified_records (Array of id matrix records modified)
	* @see Used in trigger.button_delete: Del
	*/
	public static function remove_references_to_id( $section_id, $section_tipo ) {
		
		$ar_modified_records = array();

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request. section_tipo is empty", 1);			
		}

		# json dato references in matrix
		$ar_references = array();
		
		$arguments=array();
		$arguments['dato:json']	= $section_id;
		$matrix_table 			= common::get_matrix_table_from_tipo($section_tipo);
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_references			= $RecordObj_matrix->search($arguments);
			#dump($ar_references,'$ar_references');
			if (empty($ar_references)) return NULL;

		# component_portal tipo's
		$ar_terminoID_by_modelo_name = RecordObj_ts::get_ar_terminoID_by_modelo_name($modelo_name='component_portal');
			#dump($ar_terminoID_by_modelo_name,"tipos for $section_id");			
			if (empty($ar_terminoID_by_modelo_name)) return NULL;

		# Iterate references
		if ( is_array($ar_references) && is_array($ar_terminoID_by_modelo_name) ) foreach ($ar_references as $current_id) {
			
			# for every matrix record found, test tipo. If tipo is in array component_portal tipo's, delete refecence from current record
			$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$current_id);
			$current_tipo 		= $RecordObj_matrix->get_tipo();
			if (in_array($current_tipo, $ar_terminoID_by_modelo_name)) {
				
				# extract current id_section from dato array and save
				# Get current array dato
				$dato_array 	= $RecordObj_matrix->get_dato();
				# Remove current id from dato array elements
				$dato_array_edit= component_common::remove_element_to_dato_array($section_id, $dato_array);
				# Update RecordObj_matrix current dato
				$RecordObj_matrix->set_dato($dato_array_edit);
				# Save record
				$RecordObj_matrix->Save();
					#dump($current_id,"modified current_id:$current_id , current_tipo:$current_tipo, removed element:$section_id");

				$ar_modified_records[] = $current_id;

			}//if (in_array($current_tipo, $ar_terminoID_by_modelo_name))

		}//end foreach

		#dump($ar_modified_records,'$ar_modified_records');

		return $ar_modified_records;
	}


	/**
	* CONTAIN PORTAL (BOOLEAN)
	* @param $id (id matrix of section)
	* Verify that current section have component_portal, and if yes is mandatory to have component_portal record in matrix
	* @see section->Delete : delete_record
	*/
	public static function contain_portal($id=0, $section_tipo) {
		
		if(SHOW_DEBUG) $start_time = start_time();

		# Verify id is int
		if ($id<1) 			return false;

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request. section_tipo is empty", 1);			
		}

		# Verify is section
		$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id);
		$parent 			= $RecordObj_matrix->get_parent();
		if ($parent!=0) 	return false;

		$tipo 				= $RecordObj_matrix->get_tipo();
		$matrix_table 		= $RecordObj_matrix->get_matrix_table();

		# Verify if have component_portal in structure
		$ar_section_childrens = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_portal');

		# Verify if have component_portal record in matrix
		$arguments=array();
		$arguments['parent']= $id;
		$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
		$ar_rows			= $RecordObj_matrix->search($arguments);

		$have_matrix_record = false;
		if (count($ar_rows)>0) {
			# Calculate all portal tipos
			$ar_terminoID_by_modelo_name = RecordObj_ts::get_ar_terminoID_by_modelo_name($modelo_name='component_portal');

			foreach ($ar_rows as $children_id) {
				$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
				$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$children_id);
				$children_tipo 		= $RecordObj_matrix->get_tipo();
				if (in_array($children_tipo, $ar_terminoID_by_modelo_name)) {
					$have_matrix_record = true;
					break;
				}
			}
		}

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, '');

		# Compare structure data and matrix record
		if ( (empty($ar_section_childrens) || count($ar_section_childrens)==0) && $have_matrix_record == false ) {
			return false;
		}
		if ( count($ar_section_childrens)>0 && $have_matrix_record == true ) {
			return true;
		}

		# Incosistency alert
		throw new Exception("WARNING: contain_portal: Inconsistency detected. Please check this component", 1);
	}


	





	/**
	* GET_TARGET_SECTION_TIPO
	* Obtiene el tipo de la sección de los componentes relacionados en el portal. Usa para ello el parent del primer componente relacionado en estructura.
	* Return 'tipo' of section on save portal records (example: 'Elementos / procesos')
	* Is TR (related term) of current structure portal
	*//**/
	public function get_target_section_tipo_from_first_related_component__DESACTIVA() {
		
		if(SHOW_DEBUG) $start_time = start_time();

		if (!$this->tipo) return NULL;

		if(isset($this->target_section_tipo)) {
			#dump($this->target_section_tipo,"Already calculated [target_section_tipo]");
			return $this->target_section_tipo;
		}

		$section_tipo = null;

		$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($this->tipo, $cache=false, $simple=true);

		# Test $ar_terminos_relacionados
		if (empty($ar_terminos_relacionados[0])) 
			throw new Exception("Invalid state: No related terms founded for this portal ($this->tipo)", 1);			
		
		#if (count($ar_terminos_relacionados)>1) 
		#	throw new Exception("Invalid state: Too much [" . count($ar_terminos_relacionados) . "] related terms founded for this portal ($this->tipo)", 1);		

		$first_component_tipo = $ar_terminos_relacionados[0];


		# El section_tipo recibido es de un componente. Despejamos su sección para empezar a trabajar
		$ar_section_tipo 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($first_component_tipo, $modelo_name='section', $relation_type='parent');
		if (isset($ar_section_tipo[0])) {
			$section_tipo 		= $ar_section_tipo[0];
		}		
			#dump($section_tipo,'$section_tipo'." - component_portal tipo:$this->tipo");
			#dump($this,'this');
		
		# Fix value
		$this->target_section_tipo = $section_tipo;
			#dump($target_section_tipo,'$target_section_tipo');

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, '');

		return $this->target_section_tipo;
	}
	

	/**
	* GET_TARGET_SECTION_TIPO
	*/
	public function get_target_section_tipo() {

		if(SHOW_DEBUG) $start_time = start_time();
		
		#return $this->get_target_section_tipo_from_first_related_component__DESACTIVA();

		if (!$this->tipo) return NULL;

		if(isset($this->target_section_tipo)) {
			#dump($this->target_section_tipo,"Already calculated [target_section_tipo]");
			return $this->target_section_tipo;
		}

		$target_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
			#dump($target_section_tipo,'$target_section_tipo');

		if (empty($target_section_tipo)) {
			$portal_name = RecordObj_ts::get_termino_by_tipo($this->tipo);
			throw new Exception("Error Processing Request. Please, define target section structure for portal: $portal_name - $this->tipo", 1);
		}

		# Fix value
		$this->target_section_tipo = $target_section_tipo;

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, '');
		
		return $target_section_tipo;
	}




	/**
	* NEW_PORTAL_RECORD
	* Insert new poral record in DB (fired by trigger)
	*/
	public static function create_new_portal_record( $portal_id, $portal_tipo, $portal_section_target_tipo ) {
		
		#
		# 1 PROYECTOS . Obtenemos los datos del filtro (proyectos) de la sección actual para heredarlos en el registro del portal
		$component_portal 	= new component_portal($portal_id, $portal_tipo);
			#dump($component_portal,'$component_portal'. " $portal_id, $portal_tipo");
		$parent_section_id		= $component_portal->get_parent();
		$parent_section_tipo 	= common::get_tipo_by_id($parent_section_id, $table='matrix');
		$section_parent 		= new section($parent_section_id, $parent_section_tipo);
		$ar_children_objects_by_modelo_name_in_section = $section_parent->get_ar_children_objects_by_modelo_name_in_section('component_filter');
			#dump($ar_children_objects_by_modelo_name_in_section, '$ar_children_objects_by_modelo_name_in_section'. " $parent_section_id, $parent_section_tipo");

		if (empty($ar_children_objects_by_modelo_name_in_section[0])) {
			throw new Exception("Error Processing Request: 'component_filter' is empty 1", 1);				
		}else {
			$component_filter_parent	= $ar_children_objects_by_modelo_name_in_section[0];
			$component_filter_dato 		= $component_filter_parent->get_dato();
				#dump($component_filter_parent,'COMPONENT_FILTER_PARENT DATO');
		}
		#dump($section_parent,"section_parent (parent_section_id:$parent_section_id, parent_section_tipo:$parent_section_tipo)");

		# 1.1 PROYECTOS DE PROYECTOS : Portales de la sección proyectos
		if ($parent_section_tipo==DEDALO_SECTION_PROJECTS_TIPO) {
			$component_filter_dato 	= array($parent_section_id=>"2"); # Será su propio filtro
		}


		#
		# 2 SECTION . Creamos un nuevo registro vacío en la sección del portal	
		# Section record . create new empty section in target section tipo
		# TRUE : Se le pasa 'true' al comando "Save" para decirle que SI es un portal
		$section_new	= new section(NULL, $portal_section_target_tipo);
		$id_section 	= $section_new->Save( $is_portal=true, $portal_tipo );


		if($id_section<1) {
			$msg = "Error on create new section: new id_section is not valid ! ";
			if(SHOW_DEBUG) $msg .= " (Data: portal_section_target_tipo:$portal_section_target_tipo, portal_id:$portal_id )";
			throw new Exception($msg, 1);
		}
		#dump($section_new,"section_new (portal_section_target_tipo:$portal_section_target_tipo) id_section:$id_section");

		#
		# 3 PROYECTOS . Creamos un nuevo registro de filtro ('component_filter') hijo de la nueva sección creada, que heredará los datos del filtro de la sección principal
		# Set target section projects filter settings as current secion
		# Los proyectos se heredan desde el registro actual donde está el portal hacia el registro destino del portal
			
			# SECTION VIRTUAL CASE
			$section_real_tipo = $section_new->get_section_real_tipo();
			if($section_real_tipo!=false) {
				# Change tipo
				$section_new->set_tipo($section_real_tipo);
			}

		$ar_component_filter = (array)$section_new->get_ar_children_objects_by_modelo_name_in_section('component_filter');
		if (empty($ar_component_filter[0])) {
			throw new Exception("Error Processing Request: 'component_filter' is empty 2", 1);				
		}else {
			$component_filter	= $ar_component_filter[0];
			$component_filter->set_dato($component_filter_dato);
			$component_filter->Save();
				#dump($component_filter,"component_filter in portal section id:$id_section");
		}

		#
		# 4 PORTAL . Insertamos en dato (el array de 'id_madrix' del component_portal actual) el nuevo registro creado
		# Portal dato. add current section id to component portal dato array
		$component_portal 	= new component_portal($portal_id, $portal_section_target_tipo);
		$dato 				= $component_portal->get_dato();
		
		$locator 			= component_common::build_locator_relation($id_section, 0, 0);

		$dato_edit 			= component_common::add_locator_to_dato($locator, $dato);	
		$component_portal->set_dato($dato_edit);
		$component_portal->Save();

		return $id_section;
	}



	/**
	* GET AR SECTION RELATION FOR CURRENT TIPO SECTION (STATIC VERSION)
	* Este método es casi indéntico a component_relation::get_ar_section_relations_for_current_tipo_section_static() pero NO comprueba el tipo.
	* Cualquier tipo es válido
	*/
	public static function get_ar_section_relations_for_current_tipo_section_static($modo='ar_multiple', $dato) {

		# Recorremos cada registro relacionado
		$ar_id_records 			= array();
		$ar_rel_locator 		= array();
		$ar_section_relations 	= array();				
							
		if(is_array($dato)) foreach ($dato as $rel_locator) {

			$rel_locator_obj 	= component_common::get_locator_relation_as_obj($rel_locator);			
			$id_record 			= $rel_locator_obj->section_id_matrix;
			
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
	* REMOVE_LOCATOR_FROM_PORTAL
	* Elimina sólo la referencia en el portal actual (borra el rel_locator pasado del array de datos del portal)
	*/
	public function remove_locator_from_portal($rel_locator) {

		# current dato array (json like ["4125.0.0","4521.dd20.1"]) IMPORTANT! : Use allways '$this->dato' to force update value
		$ar_dato	= $this->dato;
		# remove current element (rel_locator) from dato array
		$ar_dato 	= component_common::remove_locator_to_dato($rel_locator, $ar_dato);
		# aply changes to curren object dato IMPORTANT! : Use allways '$this->set_dato' to force update db on save	
		$this->set_dato($ar_dato);
		# save dato
		$this->Save();
			#dump($this->dato,"this->dato eliminado rel_locator:$rel_locator");

		return true;
	}# /remove_locator_from_portal


	/**
	* REMOVE_RESOURCE_FROM_PORTAL
	* @see Previamente se habrá verificado que no se usa el recurso en otros portales
	*/
	public function remove_resource_from_portal($rel_locator, $portal_tipo=NULL) {

		if(empty($portal_tipo)) {
			throw new Exception("Error Processing Request. portal_tipo is mandatory", 1);
		}

		# Todas las referencias a el recurso dado con el locator
		$all_resource_references = $this->get_all_resource_references($rel_locator, $portal_tipo);
		# Verificamos que no se borra un recurso con más referencias que la actual
		if(count($all_resource_references)>1) throw new Exception("Error Processing Request. More than one ref exists for $rel_locator", 1);

		# 1 Remove all references in current portal
		# Eliminamos TODOS los locators relacionados en este portal
		$locator_as_obj 		= component_common::get_locator_relation_as_obj($rel_locator);
		$rel_locator_section_id = $locator_as_obj->section_id_matrix;

		$ar_dato 				= $this->get_dato();
		if(is_array($ar_dato)) foreach ($ar_dato as $current_rel_locator) {			

			$locator_as_obj 		= component_common::get_locator_relation_as_obj($current_rel_locator);
			$current_section_id 	= $locator_as_obj->section_id_matrix;

			if ($current_section_id==$rel_locator_section_id) {
				# Remove reference in current component_portal dato
				$this->remove_locator_from_portal($current_rel_locator);					
			}
		}

		# 2 Remove resource record
		# La sección será el primer valor del array (4521 para 4521.0.0)
		$section_id 	= $rel_locator_section_id;
		$section_tipo 	= common::get_tipo_by_id($section_id, $table='matrix');

		$section 		= new section($section_id, $section_tipo);
		$delete 		= $section->Delete($delete_mode='delete_record');

		return true;	
	}

	/**
	* GET_ALL_RESOURCE_REFERENCES
	* Devuelve el array de section id matrix de las secciones en las cuales hay portales con referencias a este locator
	*/
	public static function get_all_resource_references($rel_locator, $tipo=NULL) {

		if(SHOW_DEBUG) $start_time = start_time();

		if(empty($tipo)) {
			throw new Exception("Error Processing Request. Tipo is mandatory", 1);			
		}
		
		# La sección será el primer valor del array (4521 para 4521.0.0)
		$locator_as_obj 	= component_common::get_locator_relation_as_obj($rel_locator);
		$section_id 		= $locator_as_obj->section_id_matrix;
			#dump($section_id,"section_id for rel_locator $rel_locator");

		#$tipo 		= common::get_tipo_by_id($section_id, $current_matrix_table='matrix')

		# json dato references in matrix
		$ar_references = array();
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';
		$arguments['dato:json']			= $section_id.'.%';	# SQL LIKE "4521.%"
		$matrix_table 					= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_references					= $RecordObj_matrix->search($arguments);
			#dump($ar_references,'ar_references');
		
		# Valorar: Opcionalmente poríamos filtrar el tipo de sección deseado (portal, relation, etc...)
		/*
		# Los recorremos para seleccionar sólo los que son portales y excluir relaciones, etc..
		foreach ($ar_references as $section_id) {
			# code...
			$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$section_id);
			$tipo 				= $RecordObj_matrix->get_tipo();
			$modelo_name
		}
		*/
		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'ar_references:'.count($ar_references) );

		return $ar_references;
	}






	/**
	* PROPAGATE_FILTER
	* Actualiza los valores de proyecto de los recursos asociados al portal
	* El resultado a aasignar será la suma de todos los proyectos que referencien al recurso
	* NOTA: Si se eliminan todos los proyectos de todos los portales que referencien el recurso, se conservará en el recurso el último proyecto.
	*/
	public function propagate_filter($updated_component_filter) {

		# Buscamos todos los recursos (id_section) utilizados por este portal ej. [456,785,2341,..]
		$dato = $this->get_dato();
			#dump($dato,'dato');

		# Si el dato de este filtro es null, no se propagará el dato (así se conservará en el recurso el último proyecto)
		if (!is_array($dato)) return false;		
		
		# Recorremos todos los recursos asociados al portal
		foreach ($dato as $rel_locator) {

			# Para cada recurso del portal, calculamos todos los portales donde aparece
			$ar_resource_references = $this->get_all_resource_references($rel_locator, $this->tipo);
				#dump($ar_resource_references,"ar_resource_references for rel_locator:$rel_locator");

			# Recorremos todos los portales encontrados
			foreach ($ar_resource_references as $portal_section_id) {
				#dump($portal_section_id,'portal_section_id');

				# Calculamos los proyectos de cada portal
				$section_tipo 	= common::get_tipo_by_id($portal_section_id, $table='matrix');
				$portal_section = new section($portal_section_id, $section_tipo);
				
				$ar_children_objects = $portal_section->get_ar_children_objects_by_modelo_name_in_section('component_filter');
				if(empty($ar_children_objects[0])) throw new Exception("Error Processing Request: No projects (component_filter) found in structure!", 1);

				$component_filter 	= $ar_children_objects[0];

				if ($component_filter->id == $updated_component_filter->id ) {
					# IMPORTANT
					# Debido a la cache de 'RecordDataBounceObject-load' no se actualizará el dato del componente modificado.
					# Por ello usaremos la instancia del componente actualizado en su lugar como fuente de los datos.
					$dato_filter_inside = $updated_component_filter->dato;
						#dump($filter_dato,'$filter_dato AÑADIDO !! ');
				}else{
					$dato_filter_inside = $component_filter->get_dato();
						#dump($filter_dato,'$filter_dato CALCULADO !! ');
				}				

				# Los recorremos añadiéndolos al array ar_projects y con el formato de checkbox (1234:2,1345:2,.)
				if(is_array($dato_filter_inside)) foreach ($dato_filter_inside as $project_id_matrix => $state) {
					$ar_projects[$project_id_matrix] = 2;
				}
			}
			#dump($ar_projects,'ar_projects');
			
		}# /if (is_array($dato)) foreach ($dato as $rel_locator) {
		#dump($ar_projects,'ar_projects final');		
		
		# Volvemos a recorrer todos los recursos y actualizamos los datos de cada uno de ellos
		foreach ($dato as $rel_locator) {

			$locator_as_obj 	= component_common::get_locator_relation_as_obj($rel_locator);
			$section_id 		= $locator_as_obj->section_id_matrix;
			
			$section_tipo 	= common::get_tipo_by_id($section_id, $table='matrix');
			$portal_section = new section($section_id, $section_tipo);

			$ar_children_objects = $portal_section->get_ar_children_objects_by_modelo_name_in_section('component_filter');
			if(empty($ar_children_objects[0])) throw new Exception("Error Processing Request: No projects (component_filter) found in structure!", 1);

			$component_filter = $ar_children_objects[0];

			# Lo actualizamos al nuevo array de proyectos
			$component_filter->set_dato($ar_projects);
			$component_filter->Save();
				#dump($ar_projects,"updated projects on rel_locator:$rel_locator ");		
		}

	}

		
	/**
	* GET_DIFFUSION_OBJ
	*/
	# FORMATO DEL ARRAY DEVUELTO
	# [valor] => Array
    #    (
    #        [58] => Array
    #            (
    #                [dd72] => Javier
    #                [dd77] => Gómez López
    #            )
    #        [61] => Array
    #            (
    #                [dd72] => José
    #                [dd77] => Perez Ramírez
    #            )
    #    )
	public function get_diffusion_obj( $propiedades ) {
		
		$diffusion_obj = parent::get_diffusion_obj( $propiedades );
			#dump($propiedades,'$propiedades '.$this->tipo);
			#dump($propiedades->portal_list,'$propiedades->portal_list');

		if(!is_object($propiedades)) {
			return $diffusion_obj;
		}

		# PORTAL : ITERATE ALL PORTAL RECORDS
		$valor=array();
		$dato = $this->get_dato();
		if(is_array($dato)) foreach ($dato as $current_rel_locator) {

			$locator_relation_as_obj = component_common::get_locator_relation_as_obj($current_rel_locator);
			$current_portal_section_id = $locator_relation_as_obj->section_id_matrix;
				#dump($current_portal_section_id,'current_portal_section_id');
			
			# PROPIEDADES_PORTAL_LIST
			$ar_propiedades_portal_list = $propiedades->portal_list;		
				#dump($ar_propiedades_portal_list,'ar_propiedades_portal_list');
				#dump($this,'this');
			
			if ( !empty($ar_propiedades_portal_list) && is_array($ar_propiedades_portal_list)) foreach ($ar_propiedades_portal_list as $current_component_tipo) {
					
				$current_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($current_component_tipo);
				$current_component 		= new $current_modelo_name(NULL, $current_component_tipo, $this->modo, $current_portal_section_id);
					#dump($current_component,'$current_component');
				
				$valor[$current_portal_section_id][$current_component_tipo] = $current_component->get_valor();

			}			

		}#end if(is_array($dato)) foreach ($dato as $current_rel_locator) {
		
		$diffusion_obj->columns['valor'] = $valor;
			#dump($diffusion_obj,'$diffusion_obj '. print_r($valor));
		
		return $diffusion_obj;
	}


	/**
	* GET_STATS_OBJ
	*/
	public function get_stats_obj( $propiedades ) {
		return null;
		$stats_obj = new diffusion_stats_component_obj();

		# PORTAL : ITERATE ALL PORTAL RECORDS
		$ar_dato=array();
		$dato = $this->get_dato();


		dump($dato,"dato propiedades:$propiedades - tipo:$this->tipo ");return $stats_obj;

		if(is_array($dato)) foreach ($dato as $current_rel_locator) {

			$locator_relation_as_obj   = component_common::get_locator_relation_as_obj($current_rel_locator);
			$current_portal_section_id = $locator_relation_as_obj->section_id_matrix;
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
					
				$current_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($current_component_tipo);
				$current_component 		= new $current_modelo_name(NULL, $current_component_tipo, $this->modo, $current_portal_section_id);
					#dump($current_component,'$current_component');
				
				$ar_dato[] = $current_component->get_dato();
			}			

		}#end if(is_array($dato)) foreach ($dato as $current_rel_locator) {
		
		$stats_obj = $ar_dato;
			#dump($stats_obj,'$stats_obj');

		return $stats_obj;
	}



}
?>