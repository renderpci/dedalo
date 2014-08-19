<?php
require_once(DEDALO_LIB_BASE_PATH . '/common/class.common.php'); 


class rows extends common {
	
	protected $ar_id_section_page;
	protected $ar_components_tipo;
	protected $ar_buttons_tipo;

	protected $section_list_obj;
	protected $section_obj;
	
	protected $modo;
	protected $tipo;
	protected $lang;
	
	function __construct( section_list $section_list ) {		

		$this->ar_id_section_page	= $section_list->get_ar_id_section_page();		#dump($this->ar_id_section_page, "Registros rows class: ar_id_section_page");
		$this->ar_components_tipo	= $section_list->get_ar_components_tipo();
		#$this->ar_buttons_tipo		= $section_list->get_ar_buttons_tipo();			#dump($this->ar_buttons_tipo);

		# Store received section_list obj (contain also section obj)
		$this->section_list_obj 	= $section_list;
		
		$this->define_id($id=NULL);
		$this->define_tipo($section_list->get_tipo());
		$this->define_lang(DEDALO_DATA_LANG);	
		$this->define_modo($section_list->get_modo());		

		$this->section_obj = $section_list->section_obj;	#dump($section_list->section_obj,'$section_list->section_obj');
	}


	# define id
	#protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }
	
	
	# HTML
	public function get_html() {
		
		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_in_'.microtime(1)]=microtime(1);
		}
			
		ob_start();
		include ( get_called_class().'.php' );
		$html =  ob_get_clean();
		

		
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [rows]', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_out_'.microtime(1)]=microtime(1);
		}	
		
		return $html;
	}

	
	/**
	* GET_AR_ROWS
	* Recorre y carga todos los rows de esta página (sólo los 10 o X visualizados) en un array resuelto
	*/
	public function get_ar_rows() {
		
		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_IN_'.microtime(1)]=microtime(1);
		}			

		$ar_component_obj 	= array();		
		$ar_rows			= array();
		$parent 			= NULL;
			#dump($this->ar_id_section_page,'$this->ar_id_section_page');
			#dump($this->ar_components_tipo,'$this->ar_components_tipo'."- modo: $this->modo");
			#dump($this->ar_id_section_page,'$this->ar_id_section_page'."- modo: $this->modo");
		
		# MATRIX TABLE : Calcula matrix table de la sección en base a su tipo
		$section_tipo 	= $this->section_list_obj->section_obj->get_tipo();	#dump($this->section_list_obj,"section_list_obj");
		$matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
		if(empty($matrix_table)) {
			if(SHOW_DEBUG) dump($this->section_list_obj->section_obj , "matrix_table:$matrix_table");
			throw new Exception("matrix_table not defined", 1);			
		}
		#dump($this->ar_id_section_page,'$this->ar_id_section_page');		
		
		# EXCEPCIONES
		# Modo 'lis_tm' : recoge los registros de 'matrix_time_machine' previamente calculados y fijados en $this->section_list_obj->ar_id_section
		if($this->modo=='list_tm') {
			$this->ar_id_section_page =	$this->section_list_obj->get_ar_id_section();
				#dump($this->section_list_obj->section_obj->get_ar_id_section_custom() ,"modo:$this->modo this->ar_id_section_page 2");
		}
		#dump($this->ar_id_section_page,'$this->ar_id_section_page');

		#
		# AR_ID_SECTION_PAGE
		if( is_array($this->ar_id_section_page) && count($this->ar_id_section_page)>0) foreach($this->ar_id_section_page as $parent) {			
			
			# COMPONENTS
			# Para cada registro (id matrix de la section) resolvemos sus componentes concretos (recibidos los tipos de section en $this->ar_components_tipo)			
			unset($ar_component_obj);
			if( is_array($this->ar_components_tipo)) foreach($this->ar_components_tipo as $component_parent => $tipo) {
				
				# DEDALO SUPERUSER : Avoid show DEDALO_SUPERUSER in list
				if($parent==DEDALO_SUPERUSER && $matrix_table=='matrix') continue; # SKIP
				
				/*
				#
				# LANG : Calculate lang for this tipo
				$RecordObj_ts 	= new RecordObj_ts($tipo);
				$traducible 	= $RecordObj_ts->get_traducible();
				if ($traducible=='no') {
					$component_lang = DEDALO_DATA_NOLAN;
				}else{
					$component_lang = DEDALO_DATA_LANG;
				}
				
				#
				# ID : Try calculate component id from tipo, parent, lang
				# Como hay que calcular el ID para cada componente, lo hacemos aquí, en lugar de delegar en el constructor de component_common ese cálculo
				$current_id 			= component_common::get_id_by_tipo_parent($tipo, $parent, $component_lang);
				
				$component_modelo_name	= $RecordObj_ts->get_modelo_name();	

				$component_modo 		= $this->modo;
				#if($component_modo=='list_tm')	$component_modo = 'list';			
				
				# LOAD CURRENT COMPONENT
				#$current_obj 			= component_common::load_component($current_id, $tipo, $this->modo, $parent, $component_lang); #($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL, $matrix_table='matrix')
				$current_obj 			= new $component_modelo_name($current_id, $tipo, $component_modo, $parent, $component_lang);
				*/

				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($tipo);
				$current_obj 			= new $component_modelo_name(NULL, $tipo, $this->modo, $parent);
				$component_lang 		= $current_obj->get_lang();

				#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [new component '.$component_modelo_name.']', "html");

				# EXCEPCIONES
				# TIME MACHINE LISTADO
				# Si estamos en modo 'list_tm' los componentes estarán vacíos. Inyectaremos los datos más recientes guardados en time machine
				if ($this->modo=='list_tm') {
					
					$arguments=array();			
					$arguments['parent'] 	= $parent;
					$arguments['tipo'] 		= $tipo;
					$arguments['lang'] 		= $component_lang ;
					$RecordObj_time_machine	= new RecordObj_time_machine(NULL);
					$ar_id					= $RecordObj_time_machine->search($arguments);
						#dump($ar_id,"registros del component $tipo");
					if(!empty($ar_id)) {
						$last_record_id = max($ar_id);

						# Get dato
						$RecordObj_time_machine	= new RecordObj_time_machine($last_record_id);
						$dato = $RecordObj_time_machine->get_dato();
							#dump($dato,'dato en time machine para este componente');

						# Inject dato
						$current_obj->set_dato($dato);
					}
				}#end if ($this->modo=='list_tm')
				

				$ar_component_obj[]		= $current_obj;
					#$dato = $current_obj->get_dato();
					#dump( $dato ,'$current_obj->get_dato()');
					#dump($current_obj,'current_obj dato:'.var_export($dato)." - table:".$current_obj->get_matrix_table()." - id:".$current_id." - ".print_r($arguments,true) );
			}#end foreach($this->ar_components_tipo as $tipo)
			#dump($ar_component_obj,'$ar_component_obj');

			
			# SECTION ID (FIRST COLUMN USED TO SORT)
			switch ($this->modo) {
				
				case 'list_tm':
					$current_section_id_matrix 	= $parent;
					# Get ar_id_section_custom from section obj formated as $key (id time machine) => $value (id matrix)
					$ar_id_section_custom = $this->section_list_obj->section_obj->get_ar_id_section_custom();	
					# Get record from matrix_time_machine corespondent to current section id
					$id_tm = array_search($current_section_id_matrix, $ar_id_section_custom);
						#dump($id_tm,"id_tm for id_matrix:$current_section_id_matrix");
					$RecordObj_time_machine 	= new RecordObj_time_machine($id_tm);	#($id=NULL, $parent=false, $tipo=false, $lang=NULL, $caller_obj=NULL)
					$dato 						= $RecordObj_time_machine->get_dato();	#dump($dato,"dato");			
					$section_id 				= $dato['section_id'];
					$tipo_section 				= $this->section_list_obj->section_obj->get_tipo();

					# Creamos la sección con todos los dato: id + tipo
					$section_obj 				= new section($current_section_id_matrix, $tipo_section);
					$section_id					= intval($section_id);
						#dump($section_obj, "section_id for $current_section_id_matrix - $tipo_section");	
					break;
				
				default:
					# Creamos la sección correspondiente al id matrix actual para obtener el 'section_id' o número de orden consecutivo 
					# de la sección actual (No confundir con id_madrix de la sección) 					
					$section_obj 				= new section($parent, $section_tipo);
					$section_id					= $section_obj->get_section_id();
						#dump($section_id,'section_id'," section id matrix: $parent");					
					break;
			}

			# Creamos el array final con todos los datos		
			if(isset($ar_component_obj) && isset($section_id) )	
			$ar_rows[$parent][$section_id]	= $ar_component_obj;
		}
		
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ', array_keys($ar_rows) );
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_OUT_'.microtime(1)]=microtime(1);
		}

		#dump($ar_rows,'ar_rows');
		return $ar_rows ;
	}
		
	
	
	
	


}#end class
?>