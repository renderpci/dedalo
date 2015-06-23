<?php
# COMPONENT COMMON (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES
require_once(DEDALO_LIB_BASE_PATH . '/common/class.common.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_time_machine.php');


abstract class component_common extends common {

	# GENERAL VARS	
	protected $tipo ;					# string component tipo in structur ex ('dd22') eq. terminoID
	protected $parent ;					# int parent section_id
	protected $section_tipo ;			# string parent section tipo
	protected $lang ;					# string lang en estructura ('lg-esp')
	protected $valor_lang ;				# string Idioma del valor final del componente (si es una lista de valor, el idioma del campo al que apunta que puede ser traducible aunque el componente no lo sea dato"1" valor:"Si" o "yes")
	protected $traducible ;				# string definido en tesauro (si/no)
	protected $modo ;					# string default edit
	protected $dato ;					# object dato (json ecoded in db)
	protected $valor ;					# string usually dato
	public $version_date;				# date normalmente despejado de time machine y asignado al component actual

	# STRUCTURE DATA
	public $RecordObj_dd ;			# obj ts
	protected $modelo;
	protected $norden;
	protected $label;					# etiqueta

	protected $required ;				# field is required . Valorar de usar 'Usable en Indexación' (tesauro) para gestionar esta variable
	protected $debugger ;				# info for admin
	protected $ejemplo ;				# ex. 'MO36001-GA'
	protected $ar_tools_name = array('tool_time_machine','tool_lang');
	protected $ar_tools_obj ;
	protected $ar_authorized_tool_name ;

	protected $exists_dato_in_any_lan	= false;
	protected $dato_resolved ;

	protected $expected_lang;			# Idioma esperado para este componente (usado para verificar que la estrucutra está bien formada)

	public $section_obj;				# parent section obj (optional, util for component_av...)

	# referenced section tipo (used by component_autocomplete, compoent_radio_button.. for set target section_tipo (propiedades) - aditional to referenced component tipo (TR)- )
	public $referenced_section_tipo;

	# CACHE COMPONENTS INTANCES
	#public static $ar_component_instances = array();	# array chache of called instances of components

	/**
	* GET_INSTANCE
    * Singleton pattern
    * @returns array array of component objects by key
    */
    public static function get_instance($component_name=null, $tipo, $parent=null, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {

    	# TIPO : MANDATORY
    	if (empty($tipo)) {
			throw new Exception("Error: on construct component : tipo is mandatory. tipo:$tipo, parent:$parent, modo:$modo, lanfg:$lang", 1);
		}	

		# PARENT : OPTIONAL (On save component, new section is created)
    	if (empty($parent)) {
    		if(SHOW_DEBUG) {
    	 		#dump($component_name,"component_name");
    	 	}  		
    	}

    	# SECTION_TIPO : OPTIONAL (if empty, section_tipo is calculated from: 1. page globals, 2. structure -only useful for real sections-)
		if (empty($section_tipo)) {
			$section_tipo = component_common::resolve_section_tipo($tipo);
		}


    	if(SHOW_DEBUG) {
			if ( !empty($component_name) && strpos($component_name, 'component_')===false ) {
				dump($tipo," tipo");
				throw new Exception("Error Processing Request. section or ($component_name) intented to load as component", 1);				
			}
			if ( is_numeric($tipo) || !is_string($tipo) || !RecordObj_dd::get_prefix_from_tipo($tipo) ) {
				dump($tipo," tipo");
				throw new Exception("Error Processing Request. trying to use wrong var: '$tipo' as tipo to load as component", 1);				
			}
			if ( !empty($parent) && (!is_numeric($parent) || abs($parent)<1) ) {
				dump($parent," parent");
				throw new Exception("Error Processing Request. trying to use wrong var: '$parent' as parent to load as component", 1);				
			}			
			$ar_valid_modo = array("edit","list","search","simple","list_tm","tool_portal","tool_lang","edit_tool","indexation","selected_fragment","tool_indexation",'tool_transcription');
			if ( empty($modo) || !in_array($modo, $ar_valid_modo) ) {
				#dump($modo," modo");
				#throw new Exception("Error Processing Request. trying to use wrong var: '$modo' as modo to load as component", 1);
				error_log(__METHOD__. " trying to use wrong var: '$modo' as modo to load as component")	;		
			}
			if ( empty($lang) || strpos($lang, 'lg-')===false ) {
				dump($lang," lang");
				throw new Exception("Error Processing Request. trying to use wrong var: '$lang' as lang to load as component", 1);				
			}			
		}
		
		static $ar_component_instances;

		# KEY : Store in memory key for re-use
    	$key = $tipo .'_'. $section_tipo .'_'. $parent .'_'. $lang;

    	# OVERLOAD : If ar_component_instances > 99 , not add current element to cache to avoid overload
    	if ( isset($ar_component_instances) && count($ar_component_instances)>300) {
    		#$first = reset($ar_component_instances);
    		#unset($first);
    		$ar_component_instances = array_slice($ar_component_instances,50,null,true); //50
    		if(SHOW_DEBUG) {
    			#error_log(__METHOD__." Overload components prevent. Unset first cache item [$key]");
    		}
    		#return new $component_name($tipo, $parent, $modo, $lang, $section_tipo);
    	}

    	# FIND CURRENT INSTANCE IN CACHE    	
    	if ( !isset($ar_component_instances) || !array_key_exists($key, $ar_component_instances) ) {

    		if (empty($component_name)) {
				$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					#dump($current_component_name, ' current_component_name');
			}					
	
			# __CONSTRUCT : Store new component in static array var
			$ar_component_instances[$key] = new $component_name($tipo, $parent, $modo, $lang, $section_tipo);

			if(SHOW_DEBUG) {
				#$label = RecordObj_dd::get_termino_by_tipo($tipo,null, true);
    			#error_log("-- NO exite una instancia de la sección $key ($component_name - $label). Se crea un nuevo componente");
    		}
    		   		
    	}else{
    		
    		# Change modo if need
    		if ($ar_component_instances[$key]->get_modo()!=$modo) {
    			$ar_component_instances[$key]->set_modo($modo);
    		}    		 
    		
    		if(SHOW_DEBUG) {
    			#$label = RecordObj_dd::get_termino_by_tipo($tipo,null, true);
    			#error_log("++ SI exite una instancia del componente $key ($component_name - ). Se devuelve el componente estático en caché");
    		}    		   			
    	}
    	

    	if(SHOW_DEBUG) {
    		# Verify 'component_name' and 'tipo' are correct
    		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
    		if (!empty($component_name) && $component_name!= $modelo_name) {
    			throw new Exception("Error Processing Request. Inconsistency detected with get_instance 'tipo' ($tipo). 
    								 Expected model is ($modelo_name) and received model is ($component_name)", 1);
    		}
    		#if (isset($ar_component_instances)) dump( array_keys($ar_component_instances), ' ar_component_instances');
    		#error_log('ar_component_instances: '.count($ar_component_instances));
    			#dump($key," key");
    	}
    	return $ar_component_instances[$key];

    }//end get_instance






    # __CONSTRUCT
	public function __construct($tipo=NULL, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {

		if ($tipo=='dummy') {
			throw new Exception("Error dummy caller!!", 1);			
		}
			/*
			# DEBUG ONLY
			$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$label = RecordObj_dd::get_termino_by_tipo($tipo,null, true);			
			error_log("Construido componente '$component_name' ($label) tipo: $tipo, parent: $parent, modo: $modo, lang: $lang");
			#error_log( print_r(debug_backtrace(null,1),true) );
			*/

		global $log_messages;

		# TIPO : Test valid tipo
		if ( empty($tipo) || !strlen($tipo) ) {
			$msg = "Component common: valid 'tipo' value is mandatory!";
			$log_messages .= $msg;
			throw new Exception($msg, 1);
		}
		# PARENT : Test valid parent
		#if ( $parent === NULL ) {			
		#	$msg = "Component common: valid 'parent' value is mandatory! ";
		#	throw new Exception($msg, 1);			
		#}
		# MODO
		if ( empty($modo) ) {
			$modo = 'edit';
		}
		$this->modo = $modo;

		# LANG : Test valid lang
		if ( empty($lang) ) {
			$msg = "Component common: valid 'lang' value is mandatory!";
			$log_messages .= $msg;
			throw new Exception($msg, 1);
		}
		# LANG : Overwrite var '$lang' with previous component declatarion of '$this->lang'
		if(isset($this->lang)) $lang = $this->lang;

		
		# SECTION_TIPO
		# SECTION_TIPO : OPTIONAL (if empty, section_tipo is calculated from: 1. page globals, 2. structure -only useful for real sections-)
		if (empty($section_tipo)) {
			$section_tipo = component_common::resolve_section_tipo($tipo);
		}
		$this->section_tipo = $section_tipo;


		# STRUCTURE DATA : common::load_structure_data()
		# Fijamos el tipo recibido y cargamos la estructura previamente para despejar si este tipo es traducible o no
		# y fijar de nuevo el lenguaje en caso de no ser traducible
		$this->tipo 	= $tipo;
		parent::load_structure_data();

		#dump($this->traducible);
		# LANG : Check lang
		# Establecemos el lenguaje preliminar (aunque todavía no están cargados lo datos de matrix, ya tenemos la información de si es o no traducible
		# a partir de la carga de la estructura)
		if ($this->traducible=='no') {
			$lang = DEDALO_DATA_NOLAN;
		}		

		$this->parent 			= $parent;
		$this->lang 			= $lang;		
		$this->ar_tools_obj		= false;
		$this->debugger			= "tipo:$this->tipo - norden:$this->norden - modo:$this->modo - parent:$this->parent";


		# MATRIX DATA : Load matrix data 
		$this->load_component_dato();
	

		# PROPIEDADES:DATO_DEFAULT : Default data try
		# If 'propiedades:dato_default' exists, use this value as initial value, save component data and reload component data
		if( ($this->dato===null || $this->dato==='' || $this->dato===false)
			&& ( $this->modo=='edit' && empty($this->parent) )
			) {
			
			$propiedades = $this->RecordObj_dd->get_propiedades();
				#dump($propiedades,'$propiedades');

			if(!empty($propiedades)) {

				$propiedades = json_handler::decode($propiedades);
					#dump($propiedades->dato_default,'$propiedades->dato_default');
				if(isset($propiedades->dato_default)) {	

					#dump($propiedades->dato_default,'$propiedades->dato_default intentando salvar desde tipo:'.$this->tipo." parent:".$this->parent);
					$dato_default = $propiedades->dato_default;

					#Method Used
					if(isset($propiedades->dato_default->method)) {

						$dato_default = $this->get_method( (string)$propiedades->dato_default->method );
					}

					$this->set_dato($dato_default);
					$this->id 	= $this->Save();

					# INFO LOG
					$msg = "INFO: component_common. Created ".get_called_class()." $this->id [$tipo] with default data from 'propiedades' (".to_string($propiedades->dato_default).") - modo:$this->modo";
					error_log($msg);
					#throw new Exception("$msg", 1);					

					$this->load_component_dato();
				}
			}

		}#end if


	}#end __construct


	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }

	
	# GET DATO	
	protected function get_dato() {

		if(isset($this->dato_resolved)) {
			if(SHOW_DEBUG) {
				error_log(__METHOD__." Dato already resolved");
			}
			return $this->dato_resolved;
		}

		# MATRIX DATA : Load matrix data 
		$this->load_component_dato();			

		return $this->dato; # <- Se aplicará directamente el fallback de idioma para el modo list
	}

	# GET_DATO_UNCHANGED
	# Recover component var 'dato' without change type or other custom component changes
	# This is a easy way to access internal protected var 'dato' from out of component (like section::save_component_dato) 
	public function get_dato_unchanged() {
		return $this->dato;
	}

	/**
	* LOAD MATRIX DATA
	* Get data once from matrix about parent, dato
	*/
	protected function load_component_dato() {
		
		if( empty($this->parent) || $this->modo=='dummy' || $this->modo=='search') {

			# Experimental (devolvemos como que ya se ha intentado cargar, aunque sin id)
			#$this->bl_loaded_matrix_data = true;
			return NULL;
		}
		
		if( !$this->bl_loaded_matrix_data ) {
			# Experimental (si ya se ha intentado cargar pero con sin id, y ahora se hace con id, lo volvemos a intentar)
			#if( !$this->bl_loaded_matrix_data || ($this->bl_loaded_matrix_data && intval($this->id)<1) ) {
							
				if (empty($this->section_tipo)) {
					if(SHOW_DEBUG) {
						$msg = __METHOD__." Error Processing Request. section tipo not found for component $this->tipo";
						#throw new Exception("$msg", 1);
						error_log($msg);											
					}
				}					
				$section = section::get_instance($this->parent, $this->section_tipo);
					#dump($section->get_dato()," section obj");
			
			# Fix dato
			# El lang_fallback, lo haremos directamente en la extracción del dato del componente en la sección y sólo para el modo list.
			$lang_fallback=false;
			if ($this->modo=='list') {
				$lang_fallback=true;
			}
			$this->dato = $section->get_component_dato($this->tipo, $this->lang, $lang_fallback);
				#dump($this->dato,"this->dato"); #die();

			$this->bl_loaded_matrix_data = true;
		}

	}#end load_component_dato


	/**
	* RESOLVE_SECTION_TIPO
	* @param string $tipo Component tipo
	* @return string $section_tipo
	*/
	public static function resolve_section_tipo($tipo) {
		
		if (defined('SECTION_TIPO')) {
			# 1 get from page globals
			$section_tipo = SECTION_TIPO;
		}else{
			# 2 calculate from structure -only useful for real sections-
			$section_tipo = component_common::get_section_tipo_from_component_tipo($tipo);
			if(SHOW_DEBUG) {
				error_log(__METHOD__." WARNING: calculate_section_tipo:$section_tipo from structure for component $tipo Called by:".debug_backtrace()[0]['function']);
				#dump(debug_backtrace()," debug_backtrace");
				if ($section_tipo==DEDALO_SECTION_USERS_TIPO || $section_tipo==DEDALO_SECTION_PROJECTS_TIPO) {
					error_log("WARNING SECTION BÁSICA!! Called by:".debug_backtrace()[0]['function'], 1);					
				}
			}
		}
		return $section_tipo;		
	}


	/**
	* FIX_LANGUAGE_NOLAN
	*/
	protected function fix_language_nolan() {

		$this->expected_lang = DEDALO_DATA_NOLAN;
		return NULL;

		#dump($this," fix_language_nolan ");
		# Fix lang always
		$this->lang = DEDALO_DATA_NOLAN;
		# Fix traducible
		$this->traducible = 'no';
	}


	/**
	* GET_COMPONENT_CACHE_KEY_NAME
	*/
	public function get_component_cache_key_name() {
		return DEDALO_DATABASE_CONN.'_component_get_html_'.$this->get_identificador_unico();
	}

	/**
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return $html
	*	Get standar path file "DEDALO_LIB_BASE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}

			#
			# DEDALO_CACHE_MANAGER : Read from cache if var exists ##			
			if(DEDALO_CACHE_MANAGER && CACHE_COMPONENTS) {
				# No guardamos los componentes de actividad en cache
				if (!in_array($this->tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
					$cache_key_name = $this->get_component_cache_key_name();					
					if (cache::exists($cache_key_name)) {
						#dump($cache_key_name,"COMPONENT SHOW FROM CACHE");
						#error_log("INFO: readed data from component cache key: $cache_key_name");
						# Notify for load component js/css
						# Ojo! los portales auto-notifican a sus componentes, (notify_load_lib_element_tipo_of_portal) por lo que 
						# haría falta una forma de ejecutar esto aun cuando se usan desde cache..
						//common::notify_load_lib_element_tipo($this->modelo);
						return cache::get($cache_key_name);
					}
				}					
			}
			# /DEDALO_CACHE_MANAGER #################################
		

		#
		# HTML BUFFER
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'.php' );
		$html =  ob_get_clean();		



			#
			# DEDALO_CACHE_MANAGER : Set cache var #################
			if(DEDALO_CACHE_MANAGER && CACHE_COMPONENTS) {
				#if(strpos($cache_key_name, 'list')!=false) 
				cache::set($cache_key_name, $html);					
			}
			# /DEDALO_CACHE_MANAGER #################################
			


		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}		

		return $html;
	}


	/**
	* SAVE
	* Save component data in matrix using parent section
	* Verify all necessary vars to save and call section 'save_component_dato($this)'
	* @see section->save_component_dato($this)
	* @return int $section_matrix_id
	*/
	public function Save() {

		# MAIN VARS	
		$section_tipo	= $this->get_section_tipo();
		$parent 		= $this->get_parent();
		$tipo 			= $this->get_tipo();
		$lang 			= $this->get_lang();
		if (empty($lang)) {
			$lang = DEDALO_DATA_LANG;
		}
		/* Innecesario ???
		# Si sabemos que el elemento no es traducible, fijamos su 'lang' en 'lg-nolan' (DEDALO_DATA_NOLAN)
		if ($this->traducible=='no') {
			$lang = DEDALO_DATA_NOLAN;
		}
		*/

		# PARENT : Verify parent
		if(abs($parent)<1) {
			if(SHOW_DEBUG) {
				dump($this, "this section_tipo:$section_tipo - parent:$parent - tipo:$tipo - lang:$lang");
				throw new Exception("Error Processing Request. Inconsistency detected: component trying to save without parent ($parent) ", 1);;
			}			
			die("Error. Save component data is stopped. Inconsistency detected. Contact with your administrator ASAP");		
		}

		# Verify component minumun vars before save
		if( (empty($parent) || empty($tipo) || empty($lang)) )
			throw new Exception("Save: More data are needed!  section_tipo:$section_tipo, parent:$parent, tipo,$tipo, lang,$lang", 1);

		# DATO
		$dato 	= $this->dato;
			#dump($dato,"dato en save del component common");
		

		# SECTION : Preparamos la sección que será la que se encargue de salvar el dato del componente
		$section 			= section::get_instance($parent, $section_tipo);
		$section_matrix_id 	= $section->save_component_dato($this);

		# ID : Check valid id returned
		if (abs($section_matrix_id)<1) {
			throw new Exception("Save: received id ($section_matrix_id) not valid!", 1);
		}
		#dump($section_matrix_id,"section_matrix_id");		


		# ACTIVITY
		# Prevent infinite loop saving self
		if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
			try {
				# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				$matrix_table 	= common::get_matrix_table_from_tipo($this->tipo);
				logger::$obj['activity']->log_message(
					'SAVE',
					logger::INFO,
					$this->tipo,
					null,
					array(	"msg"			=> "Saved component data",							
							"tipo"			=> $this->tipo,
							"parent"		=> $this->parent,
							"lang"			=> $this->lang,
							"top_id"		=> (TOP_ID ? TOP_ID : $section_matrix_id),
							"top_tipo"		=> (TOP_TIPO ? TOP_TIPO : $section_tipo),
							"component_name"=> get_called_class(),
							"table"			=> $matrix_table
						 )
				);
			} catch (Exception $e) {
			    if(SHOW_DEBUG) {
			    	$msg = 'Exception: ' . $e->getMessage();
			    	trigger_error($msg);
			    }
			}#end try catch
		}#end if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo))


		# DEDALO_CACHE_MANAGER : Delete cache of current component html	
		if(DEDALO_CACHE_MANAGER && CACHE_COMPONENTS) {
			# No borramos la chache de los componentes de activity ya que no son editables y por tanto no cambian nunca
			if (!in_array($this->tipo, logger_backend_activity::$ar_elements_activity_tipo)) {				
				# Delete all caches of current tipo
				cache::del_contains($this->tipo);
			}
			#error_log("Saved dato of component $this->tipo ($this->label) ");
		}

		# RETURN MATRIX ID
		return (int)$section_matrix_id;

	}#end Save




	/**
	* GENERATE_JS
	* @see component_radio_button.php
	*/
	/*
	array('js' => array(
					array('trigger'	=> array(
											"1" => array('component_common.show(\'dd658\')'),
											"3" => array('component_common.hide(\'dd658\')')
											),
				),
	);
     */
	public function generate_js() {

		$propiedades = $this->RecordObj_dd->get_propiedades();
		if(empty($propiedades)) return null;

		// JSON DECODE
		$propiedades = json_decode($propiedades);
			#dump($propiedades->js,'$propiedades->js');

		if(isset($propiedades->js)) {

			$propiedades_js = json_encode($propiedades->js);
			$wrapper_id 	= 'wrapper_'.$this->get_identificador_unico();

			$js_code  ='';
			$js_code .="\n<script>";
			$js_code .="component_common.parse_propiedades_js($propiedades_js,'$wrapper_id')";
			$js_code .="</script>\n";
				#dump($js_code,'js_code');

			return $js_code;

		}#end if(isset($propiedades->js))
	}


	public function generate_js_OLD() {

		$js_code='';
		$identificador_unico	= $this->get_identificador_unico();
		#$parent 				= $this->get_parent();

		$propiedades = $this->RecordObj_dd->get_propiedades();
		if(!empty($propiedades)) {

			$propiedades = json_decode($propiedades);
				#dump($propiedades->js,'$propiedades->js');

			if(isset($propiedades->js)) {

				$js_code .="\n<script>\n$(document).ready(function() {";

				#$js_code .= "\n  console.log( $('#wrapper_$identificador_unico') ); ";

				foreach ($propiedades->js as $key => $ar_values) {

					# INTERPRTETACIÓN JSON
					$ar_event = $ar_values->event;
					$ar_valor = $ar_values->valor;
						#dump($ar_event,'$ar_event');


					foreach ($ar_event as $current_event) {

						#$js_code .= " var wrap_obj = $('#wrapper_{$identificador_unico}')";
						#$js_code .= "\n  $('document.body').on('$current_event', '#wrapper_{$identificador_unico}', function(event) {";
						$js_code .= "\n  $('#wrapper_{$identificador_unico}').on('$current_event', function(event) {";

						#$js_code .= "\n var wrapper = document.getElementById('wrapper_{$identificador_unico}')";
						#$js_code .= "\n wrapper.$current_event = function(event){";

						#$js_code .= "\n	 alert( $(this).data('dato')  )";
						$js_code .= "\n  console.log( event.target.value )";
						#$js_code .= "\n  console.log( wrapper.dataset.dato )";
						#$js_code .= "\n  console.log( event.currentTarget.dataset.dato )";
						#$js_code .= "\n  console.log( event.currentTarget.attributes['data-dato'] )";
						#$js_code .= "\n  console.log( event.delegateTarget.attributes['data-dato'].nodeValue )";

						#$js_code .= "\n  switch ( $(this).data('dato') ) {";
						$js_code .= "\n  switch ( event.target.value ) {";
						#$js_code .= "\n  switch ( event.srcElement.value ) {";

						foreach ($ar_valor as $valor => $ar_accion) {

							$js_code .= "\n   case '$valor' : ";	#$( "input[name*='man']" ).val( "has man in it!" );

							#foreach ($ar_accion as $accion) {
								foreach ($ar_accion as $current_accion) {

									if(strpos($current_accion, 'contains')) {

									}

									#$current_accion = str_replace('$parent', $parent, $current_accion);

									$js_code .= "component_common.". $current_accion ." ;";
									#$js_code .= $current_accion ." ;";
								}
							#}

							$js_code .= "\n   break;";
						}
						$js_code .= "\n  }";

						$js_code .= "\n });";

					}#end foreach ($ar_event as $current_event) {

				}#end foreach ($propiedades->js as $key => $ar_values)

				$js_code .="\n});\n</script>\n";

			}#end if(isset($propiedades->js))

			#dump($js_code,'js_code');
		}

		return $js_code;
	}


	/**
	* RESOLVE ID BY TIPO , PARENT AND LANG
	* Only 1 record is valid
	*/
	public static function get_id_by_tipo_parent($tipo, $parent, $lang) {
trigger_error("!!! DEPRECATED ".__METHOD__);
	
		/*
		# STATIC CACHE
		static $id_by_tipo_parent_cache;
		$id_unic = $tipo . '-'. intval($parent) . '-' . $lang;
		if(isset($id_by_tipo_parent_cache[$id_unic])) {
			#dump($id_by_tipo_parent_cache[$id_unic], " result returned from cache (get_id_by_tipo_parent): $id_unic .  EN PRUEBAS (NO DEVUELVE EL RESULTADO DE CACHE. SÓLO NOTIFICA) ");
			#return $id_by_tipo_parent_cache[$id_unic];
		}

		# TRADUCIBLE
		# Si el elemento no es traducible, lo crearemos como lang 'DEDALO_DATA_NOLAN'. En otro caso aplicamos el idioma de los adatos actual
		# Evita insistencias en componentes como component_av cuando se le pasa un lenguaje incorrecto
		$RecordObj_dd 	= new RecordObj_dd($tipo);
		$traducible 	= $RecordObj_dd->get_traducible();
		if ($traducible=='no') {
			$lang = DEDALO_DATA_NOLAN;
			if(SHOW_DEBUG) {
				#error_log("Corregida llamada a 'get_id_by_tipo_parent' con incorect '$lang' - tipo:$tipo");
			}
		}

		$arguments=array();
		$arguments['parent']	= $parent;
		$arguments['tipo']		= $tipo;
		$arguments['lang']		= $lang;
		$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_result				= $RecordObj_matrix->search($arguments);
			#dump($ar_result, print_r($arguments,true));

		if (empty($ar_result)) {
			$result = NULL;
			#return NULL;
		}else if (count($ar_result)>1) {
			dump($arguments,'$arguments');
			dump($ar_result,'$ar_result');
			throw new Exception("Warning: Inconsistent database: more than one record was found. Please contact with the administrator", 1);
		}else{
			$result = $ar_result[0];
		}

		# STORE CACHE DATA
		#$id_by_tipo_parent_cache[$id_unic] = $result;

		return $result;
		*/
	}


	/**
	* FILTRO
	* Consulta si el parent (la sección a que pertenece) está autorizada para el usuario actual
	* @return bool(true/false)
	* Devuelve false si NO es autorizado
	*/
	function get_filter_authorized_record() {
		# NOTA : Obviamos esta comprobación en la nueva estructura de sección (json). Evaluar si 
		# realmente es necesaria cuando sea posible.
		if(SHOW_DEBUG) {
			#$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($this->tipo);
			#error_log("get_filter_authorized_record result is provisional. Please review this method ASAP [".__METHOD__."] ".$this->tipo ." ($modelo_name)");
		}		
		return true;
		
		/*
		#dump($this->get_modo(),'get_filter_authorized_record modo');

		# Si no estamos logeados, no se aplica el filtro (caso componentes input text etc, en formulario de login)
		if(!login::is_logged()) return NULL;

		# Si el modo es uno de los excluidos, no se aplica el filtro (caso de search por ejemplo)
		$ar_excluded = array('search','list_tm','tool_lang');
		$modo 		 = $this->get_modo();
		if (in_array($modo, $ar_excluded)) return NULL;


		$user_id 		= navigator::get_user_id();
		$is_global_admin 	= component_security_administrator::is_global_admin($user_id);	#dump($is_global_admin,'',"current_userID:$user_id");
		if ( $is_global_admin ) {
			return true;
		}
		# Filtro de registros
		# A partir del tipo del parent del componente (la sección a que pertenece) generamos el filtro y verificamos que estamos autorizados a ver este componente
		$parent 			= $this->get_parent();

		if ($parent==0) {
			# Estamos ya en una sección. No procede..
			#dump($this);
			return false; # ?????????????????????????????????????????
		}

		$tipo 				= $this->get_tipo();
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,$parent);
		$section_tipo 		= $RecordObj_matrix->get_tipo();
		$ar_filter 			= filter::get_ar_filter($section_tipo);
			#dump($this,'ar_filter', "parent $parent en section tipo $section_tipo");

		if (!in_array($parent, $ar_filter)) {
			#echo " No autorizado para ". $this->get_id();
			#throw new Exception("Warning: You are not authorized to see this record from component ($parent)", 1);
			return false;
		}
		return true;
		*/
	}




	# GET_EJEMPLO
	protected function get_ejemplo() {
		return $this->debugger;
		if(empty($this->ejemplo)) return "example: 'MO-15-5620-GANDIA'";
		return parent::get_ejemplo();
	}


	# GET_REQUIRED
	private function get_required() {
		if($this->required=='si') {
			return false;
		}else{
			return true;
		}
	}

	# GET TOOLS
	public function get_ar_tools_obj() {
		if($this->ar_tools_obj===false) {
			$this->load_tools();
		}
		#dump(null,'called $this->ar_tools_obj');
		#dump($this->ar_tools_obj," this->ar_tools_obj");
		return $this->ar_tools_obj;
	}
	#
	# LOAD SPECIFIC TOOL
	# Note: Used in class.inspector to load relation tool
	public function load_specific_tool($tool_name) {

		if ($tool_name=='tool_relation') {
			if(SHOW_DEBUG) {
				#error_log("DESACTIVA LA CARGA DE TOOL RELATION ".__METHOD__);				
			}
			return null;
		}

		$authorized_tool 		= component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		$tool_obj 				= null;

		if ($authorized_tool) {
			# TOOL OBJ
			require_once(DEDALO_LIB_BASE_PATH . '/tools/'.$tool_name.'/class.'.$tool_name.'.php');
			$tool_obj						= new $tool_name($this);
			#$this->ar_tools_obj[$tool_name]	= $tool_obj;
		}
		return $tool_obj;
	}
	# LOAD TOOLS
	public function load_tools() {

		if($this->modo!='edit'){
			if(SHOW_DEBUG) {
				#trigger_error("Innecesario cargar los tools aquí. Modo: $this->modo");
			}
			return null;
		} 

		# Si no estamos logeados, no es necesario cargar los tools
		if(!login::is_logged()) return null;
	
		# Load all tools of current component
		$ar_tools_name = $this->get_ar_tools_name();
			#dump($ar_tools_name,'ar_tools_name PRE AUTH');

		$traducible = $this->RecordObj_dd->get_traducible();
			#dump($traducible,"traducible");
		
		if ($traducible=='no' || $this->lang==DEDALO_DATA_NOLAN) {
			$key = array_search('tool_lang',$ar_tools_name);
			if($key!==false){
			    unset($ar_tools_name[$key]);			    	
			}
		}
		#dump($ar_tools_name,'ar_tools_name PRE AUTH');

		# Create obj tools array
		if( is_array($ar_tools_name)) foreach ($ar_tools_name as $tool_name) {

			$authorized_tool = component_security_tools::is_authorized_tool_for_logged_user($tool_name);
				#dump($authorized_tool," authorized_tool");

			if ($authorized_tool) {				

				# INDEATION TOOL CASE : When current tool have 'indexation' name, test thesaurus permissions for avoid inconsistencies
				if (strpos($tool_name, 'indexation')!==false) {
					$security=new security();
					$ts_permissions = (int)$security->get_security_permissions(DEDALO_TESAURO_TIPO);
					if ($ts_permissions<1) continue;	# Skip this tool
				}				

				# Authorized tools names
				if (!in_array($tool_name, (array)$this->ar_authorized_tool_name)) {
					$this->ar_authorized_tool_name[] = $tool_name;
				}
				
			}
		}
		if(SHOW_DEBUG) {
			#dump($this->ar_authorized_tool_name);
		}
		
		return $this->ar_authorized_tool_name;
	}
	


	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {

		$valor = self::get_dato();
		if(!is_array($valor)) return $valor;
		return "<em>No string value</em>";
	}



	
	# DATO REAL
	public function get_dato_real() {
		$dato_real = parent::get_dato();
			#dump($dato_real,'$dato_real');
		return $dato_real;
	}

	/**
	* DATO IN DEFAULT LANG
	*/
	protected function get_dato_default_lang() {

		$parent 		= $this->get_parent();
		$tipo			= $this->get_tipo();
		$section_tipo 	= $this->get_section_tipo();

		if (empty($parent) || empty($tipo)) {
			throw new Exception("Few vars on get_dato_default_lang", 1);
		}

		$current_component_name	= get_class($this);
		$component_obj			= component_common::get_instance($current_component_name, $tipo, $parent, 'edit', DEDALO_DATA_LANG_DEFAULT, $section_tipo);
		$dato					= $component_obj->get_dato_real();

		return $dato;


		/* OLD WORLD
		# No existe registro en este idioma. Buscamos con el idioma de datos por defecto DEDALO_DATA_LANG_DEFAULT
		$arguments=array();
		$arguments['parent']= $parent;
		$arguments['tipo'] 	= $tipo;
		$arguments['lang'] 	= DEDALO_DATA_LANG_DEFAULT ;

		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
		$ar_id				= $RecordObj_matrix->search($arguments);		#dump($ar_id);

		if(!empty($ar_id[0])) {
			$current_id		= $ar_id[0];

			# Despejamos el dato
			$current_class_name	= get_class($this);
			$component_obj		= new $current_class_name($current_id, $tipo);
			$dato				= $component_obj->get_dato_real();			#dump($dato);

			if ($dato=='""') {
				$dato 		= NULL;
			}

		}else{
			$dato			= NULL;
		}

		if(is_array($dato)) $dato = implode(',',$dato);

		return $dato ;
		*/
	}

	/**
	* GET_DATO_NO_TRADUCIBLE
	* Despeja el único dato de este componente.
	* Si hay mas de 1 generará un error de consistencia
	* @see self::get_dato()
	*/
	protected function get_dato_no_traducible() {
		trigger_error("En proceso : get_dato_no_traducible");
		$parent = self::get_parent();
		$tipo	= self::get_tipo();				#dump($tipo);

		if (empty($parent) || empty($tipo)) {
			throw new Exception("Few vars on get_dato_default_lang", 1);
		}

		# Búsqueda
		$arguments=array();
		$arguments['parent']= $parent;
		$arguments['tipo'] 	= $tipo;
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
		$ar_id				= $RecordObj_matrix->search($arguments);

		if(empty($ar_id)) {

			$dato 				= NULL;

		}else if(count($ar_id)>1) {

			if (SHOW_DEBUG) dump($ar_id,'$ar_id');
			throw new Exception("Error: Inconsistency: More than one record founded!", 1);

		}else{

			$current_id			= $ar_id[0];

			# Despejamos el dato
			$current_class_name	= get_class($this);
			$component_obj		= component_common::get_instance($current_class_name, $tipo, $parent, 'edit', $lang=DEDALO_DATA_NOLAN, $this->section_tipo);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
			$lang 				= $component_obj->get_lang();
			$dato				= $component_obj->get_dato_real();							#dump($dato,'dato');

			if ($lang != DEDALO_DATA_NOLAN) {
				trigger_error("Error. Incorrect lang ($lang) for current component ($current_class_name - $tipo - $current_id). Expected  ".DEDALO_DATA_NOLAN);
			}
		}

		return $dato ;
	}





	/**
	* GET DATO AS STRING
	* Get dato formated as string
	*/
	function get_dato_as_string() {

		$dato = $this->get_dato();
		#return var_export($dato,true);		

		if(is_array($dato)) {
			$string = 'Array: ';
			foreach ($dato as $key => $value) {
				if(is_array($value)) $value = 'array '.implode(', ', $value );
				if (is_string($value)) {
					$string .= $key .':'. $value .', ';
				}				
			}
			if(strlen($string)>2) $string = substr($string, 0,-2);
			return $string;
		}else if (is_object($dato)) {
			#$string = 'Object: ' . get_class($dato); #dump($string ,'$string ');die();
		}else if (is_int($dato)) {
			$string = 'Int: ' . $dato;
		}else if (is_string($dato)) {
			$string = 'Str: ' . $dato;
		}
		return $dato;
	}


	/**
	* GET_DEFAULT_COMPONENT
	* Devuelve el componente para el lenguaje por defecto del tipo y parent actual
	* Ejemplo: el dato de un componente (traducible) en el idioma actual está vacio (no se ha creado registro en matrix todavía). Cargamos el componente 
	* en el idioma por defecto para poder acceder a las tools de lenguaje (necesitan un id_matrix para cargarse) y mostramos el icono del tool para hacer
	* un traducción automática o hacer notar que existe información en otro idioma (en el principal)
	*/
	protected function get_default_component() {

		$parent = $this->get_parent();
		$tipo	= $this->get_tipo();
			#dump($this);

		if (empty($parent) || empty($tipo)) {
			throw new Exception("Few vars parent:$parent - tipo:$tipo", 1);
		}

		# No existe registro en este idioma. Buscamos con el idioma de datos por defecto DEDALO_DATA_LANG_DEFAULT

			# SECTION : DIRECT SEARCH
			$arguments=array();
			$arguments["section_id"] 		= $parent;
			$arguments["datos#>>'{components, $tipo, dato, ".DEDALO_DATA_LANG_DEFAULT."}':!="] = 'null';

			
			$matrix_table			= common::get_matrix_table_from_tipo($tipo);
			$section_tipo 			= $this->section_tipo;			
			$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,NULL,$section_tipo);
			$ar_id					= $JSON_RecordObj_matrix->search($arguments);

				#dump($ar_id,"ar_id $tipo - $matrix_table",$arguments);die();
			/* OLD WORLD
			$arguments=array();
			$arguments['parent']= $parent;
			$arguments['tipo'] 	= $tipo;
			$arguments['lang'] 	= DEDALO_DATA_LANG_DEFAULT ;

			$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
			$ar_id				= $RecordObj_matrix->search($arguments);
				#dump($ar_id,'ar_id '.print_r($arguments,true));
			*/

		# Existe registro matrix para este componente en su idioma principal
		if(!empty($ar_id[0])) {
			$current_id		= $ar_id[0];

			# Despejamos el dato
			$current_class_name	= get_class($this);
			$component_obj		= component_common::get_instance($current_class_name, $tipo, $current_id, 'edit', DEDALO_DATA_LANG_DEFAULT, $this->section_tipo);
			
			return $component_obj;

		# No existe registro en el idioma principal
		}else{

			return null;
		}
	}

	/**
	* COMPONENT IS RELATIONABLE
	* @return bool(true/false)
	*/
	protected function is_relationable() {

		$component_name 			= get_class($this);
		$ar_components_reationables = array('component_text_area');

		if( in_array($component_name, $ar_components_reationables) )
			return true;

		return false;
	}

	/**
	* GET MODIFICATION DATE
	*/
	function get_mod_date() {

		$RecordObj_time_machine = $this->get_last_time_machine_obj();						#dump($RecordObj_time_machine );

		if(is_object($RecordObj_time_machine)) {
			return $RecordObj_time_machine->get_mod_date();
		}
		return NULL;
	}
	/**
	* GET MODIFICATED BY USER
	*/
	function get_mod_by_user_name() {

		$RecordObj_time_machine = $this->get_last_time_machine_obj();						#dump($RecordObj_time_machine );

		if(is_object($RecordObj_time_machine)) {
			return $RecordObj_time_machine->get_user_name();
		}
		return NULL;
	}

	function get_last_time_machine_obj() {

		if(empty($this->id)) return null;

		$arguments=array();
		$arguments['id_matrix']		= $this->id;
		$arguments['lang']			= $this->lang;
		#$arguments['order_by_desc']	= 'timestamp';
		$RecordObj_time_machine		= new RecordObj_time_machine(NULL);
		$ar_id						= $RecordObj_time_machine->search($arguments);				#dump($ar_id,'ar_id');

		if(count($ar_id)>0) {
			$last_tm_record_id 		= $ar_id[0];
			$RecordObj_time_machine	= new RecordObj_time_machine($last_tm_record_id);		#dump($RecordObj_time_machine);

			return 	$RecordObj_time_machine;
		}
		return NULL;
	}

	


	/**
	* AR LIST OF VALUES
	* USADO POR CHECKBOXES, RADIO_BUTTONS Y SELECTS
	* @param string $lang default 'DEDALO_DATA_LANG'
	* @param string $id_path default false
	* @return object ar_list_of_values {result,info}
	* Format:
	*	Object {
	*		"result": Array (
	*	    		[{"section_id":"9","section_tipo":"dd882"}] => Hombre
	*	    		[{"section_id":"10","section_tipo":"dd882"}] => Mujer
	*				),
	*		"strQuery":"SELECT ....",
	*		"others":"..."
	* 	} parent
	*/
	public function get_ar_list_of_values($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false) {

		$use_cache = false;

		if(isset($this->ar_list_of_values)) {
			if(SHOW_DEBUG) {
				#error_log("get_ar_list_of_values already is calculated..");
			}
			return $this->ar_list_of_values;
		}

		static $list_of_values_cache;

		$uid = $this->tipo.'_'.$this->lang;
		if($use_cache===true && isset($list_of_values_cache[$uid])) {
			if(SHOW_DEBUG) {
				error_log("+++ Returned get_ar_list_of_values already is calculated in list_of_values_cache.. ($uid)");
			}
			return($list_of_values_cache[$uid]);
		}

		
		#if ($this->modo =='list' && isset($_SESSION['config4']['get_ar_list_of_values'][$uid]) ) {
		#	return $_SESSION['config4']['get_ar_list_of_values'][$uid];
		#}

		$start_time = microtime(1);

		# vars
		$list_of_values	= new stdClass();
		$ar_final 		= array();
		$tipo 			= $this->tipo;

		#dump($this->RecordObj_dd->get_relaciones(), ' this');

		/* OLD*/
		# Obtenemos los terminos relacionados del componente actual
		#$ar_terminos_relacionados = $this->get_relaciones();
		$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($this->tipo, true, true);
			#dump($ar_terminos_relacionados, ' ar_terminos_relacionados '.$lang);
	
		if (empty($ar_terminos_relacionados)) {
			#throw new Exception("Error Processing Request. List of values without TR. Please review structure ($tipo)", 1);
			$msg = "Error Processing Request. List of values without TR. Please review structure ($tipo) <br> Nota: esta función NO está acabada. Falta contemplar los casos en que el dato se accede directamente (Ver versión anterior abajo)"; 
			trigger_error($msg);
			$list_of_values->result   = (array)$ar_final;
			$list_of_values->msg 	  = (string)$msg;
			$list_of_values->strQuery = null;

			return $list_of_values;
		}

		# COMPONENT AUTOCOMPLETE CASE REMOVE SECTION OF ar_terminos_relacionados ARRAY (EN PRUEBAS..)
		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'section', 'termino_relacionado');
		if (!empty($ar_terminoID_by_modelo_name[0])) {
			foreach ($ar_terminos_relacionados as $key => $value) {
				if ($value==$ar_terminoID_by_modelo_name[0]) {
					unset($ar_terminos_relacionados[$key]);
					//fixed the section related to find the list
					$section_tipo_related = $ar_terminoID_by_modelo_name[0];
				}
			}
		}else{

			$component_related = reset($ar_terminos_relacionados);
			$related_section_tipo = $this->get_section_tipo_from_component_tipo($component_related);

			//fixed the section related to find the list
			$section_tipo_related = $related_section_tipo;

		}

		#dump($section_tipo_related,'$section_tipo_related');

		# Selecionamos el primero
		$terminoID_valor = reset($ar_terminos_relacionados);	# Format 'array([dd9] => rsc85)'
			#dump($ar_terminos_relacionados,"terminoID_valor $terminoID_valor");
		


		#$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'component_', 'termino_relacionado'); 
		#$terminoID_valor = reset($ar_terminoID_by_modelo_name);

		$matrix_table 		 = common::get_matrix_table_from_tipo($terminoID_valor);
		#$parent_section_tipo = isset($this->section_tipo) ? $this->section_tipo : component_common::get_section_tipo_from_component_tipo($terminoID_valor);
			#dump($parent_section_tipo," parent_section_tipo");		
			
		#
		# Selector de terminos relacionados en DB
		$strQuery_select='';
		$strQuery_where='';
		#datos #>'{components}' ? 
		foreach ($ar_terminos_relacionados as $current_tipo) {
			
			/* 
			# SELECCIÓN CON UN LENGUANJE
			$RecordObj_dd 	= new RecordObj_dd($current_tipo);
			$current_lang 	= ($RecordObj_dd->get_traducible() =='no' ? DEDALO_DATA_NOLAN : $lang);
			$strQuery_select .= JSON_RecordObj_matrix::build_pg_select('btree','datos',$current_tipo,'dato',$current_lang);
			*/
			# SELECCIÓN CON TODOS LOS LENGUAJES
			$strQuery_select .= "datos #>>'{components,$current_tipo,dato}' AS $current_tipo " ;
			# SELECCIÓN EN EL LENGUAJE ACTUAL (SÓLO PARA ORDENAR)
			$strQuery_select .= ", datos #>>'{components,$current_tipo,dato,$lang}' AS {$current_tipo}_lang " ;

			# WHERE CLAUSE
			#$strQuery_where = "datos #>'{components}' ? '$current_tipo'";
			$strQuery_where = "section_tipo = '$section_tipo_related'";
			if ( $current_tipo != end($ar_terminos_relacionados) ) $strQuery_where .=" AND ";

			if ( $current_tipo != end($ar_terminos_relacionados) ) $strQuery_select .=", \n\t\t\t\t\t";

		}
		#dump($strQuery_select, '$strQuery_select');


		#
		# PROPIEDADES : Filtrado por propiedades (opcional)
			$filter_propiedades='';
			
			#
			# filtered_by_field_value
			if (isset($this->propiedades->filtered_by_field_value)) {
				#trigger_error("Sorry: Working here");
				#dump($this->propiedades->filtered_by_field_value," filtered_by_field_value - $parent_section_tipo - ".TOP_TIPO);
				/*
				ejemplo:
					{
					    "filtered_by_field_value": {
					        "dd508": "ich32"
					    }
					}
				*/							
				# 1 Obtenemos el valor actual del value_component_tipo 
				$value_component_tipo  	 		= reset($this->propiedades->filtered_by_field_value);
				$matrix_table_tipo 				= common::get_matrix_table_from_tipo($value_component_tipo);
				#$value_component_section_tipo   = component_common::get_section_tipo_from_component_tipo($value_component_tipo);							
				if (!$id_path) {
				$id_path 						= (string)tools::get_id_path(null);
				}
				$ar_id 							= (array)explode(',', $id_path);
				#dump($ar_id,'$ar_id');
				$id_query='';
				$strQuery_select_tipo='';
				$RecordObj_dd_tipo 	= new RecordObj_dd($value_component_tipo);
				$current_lang_tipo 	= ($RecordObj_dd_tipo->get_traducible() =='no' ? DEDALO_DATA_NOLAN : $lang);
				$strQuery_select_tipo .= JSON_RecordObj_matrix::build_pg_select('btree','datos',$value_component_tipo,'dato',$current_lang_tipo);
					#dump($strQuery_select_tipo," strQuery_select_tipo");
				
				foreach ($ar_id as $key => $currrent_id) {
					$ar_locator = (array)explode('.',$currrent_id);
					$current_section_tipo 	= $ar_locator[0];
					$current_section_id 	= $ar_locator[1];
	
					$id_query .= "( section_tipo='$current_section_tipo' AND ";
					$id_query .= "section_id=$current_section_id )";
					if ( $currrent_id != end($ar_id) ) $id_query .=" OR ";

				}
				$query= "
						SELECT $strQuery_select_tipo
						FROM $matrix_table_tipo
						WHERE
						$id_query AND (
						datos #>'{components}' ? '$value_component_tipo');";
						#AND datos #>>'{section_tipo}' = '$value_component_section_tipo'
				#dump($query,'$query');
				$result		= JSON_RecordObj_matrix::search_free($query);
				$rows 		= (array)pg_fetch_assoc($result);
				$filter_locator  = reset($rows);
				#dump($value_component_tipo," value_component_tipo - value_component_section_tipo:$value_component_section_tipo - id_path:$id_path - ".print_r($ar_id,true). " query: $query - parent_id: $parent_id");
											
				#$component  = component_common::get_instance(null, $value_component_tipo, $parent_id, 'edit', DEDALO_DATA_LANG, $value_component_section_tipo);
				if(SHOW_DEBUG) {
					error_log(__METHOD__." Verificar section tipo en la llamada del componente..");
				}
				#$p_value 	= $component->get_dato_unchanged();
				#if(SHOW_DEBUG) {
					#dump($p_value,"p_value $value_component_tipo");
				#}
					

				$p_key = key($this->propiedades->filtered_by_field_value);
				$RecordObj_dd 	= new RecordObj_dd($p_key);
				$current_lang 	= ($RecordObj_dd->get_traducible() =='no' ? DEDALO_DATA_NOLAN : $lang);
				$filter_propiedades .= "AND ".JSON_RecordObj_matrix::build_pg_filter('gin','datos',$p_key,$current_lang,$filter_locator);
					#dump($filter_propiedades,'$filter_propiedades');
			}

			#
			# filtered_by
			# dump( end($this->propiedades->filtered_by) );
			if (isset($this->propiedades->filtered_by)) {
				/*
				ejemplo:
					{"filtered_by": {
					        "rsc90": [{
					            "section_id":"34","section_tipo":"dd914"
					        }]
					    }
					}
				*/							
				foreach($this->propiedades->filtered_by as $p_key => $p_value) {					

					$current_component_tipo = $p_key;
					$current_value  		= $p_value;
					$current_value_flat 	= json_encode($current_value);

					$RecordObj_dd = new RecordObj_dd($current_component_tipo);					
					$current_lang = $RecordObj_dd->get_traducible()=='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

					$filter_propiedades .= "AND datos#>'{components,$current_component_tipo,dato,$current_lang}' @> '$current_value_flat'::jsonb ";
					if ( $p_value != end($this->propiedades->filtered_by) ) $filter_propiedades .=" \n";
					/*
					#$p_value = json_encode($p_value);
					#dump($p_value," p_value:$p_key");
					#$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($p_key);								
					$RecordObj_dd 	= new RecordObj_dd($p_key);
					$current_lang 	= ($RecordObj_dd->get_traducible() =='no' ? DEDALO_DATA_NOLAN : $lang);
					$filter_propiedades .= "AND ".JSON_RecordObj_matrix::build_pg_filter('btree','datos',$p_key,$current_lang,$p_value);					
					#dump($filter_propiedades," filter_propiedades");
					//AND datos#>'{components,rsc90,dato,lg-nolan}' @> '[{"section_tipo": "dd911","section_id": "3"}]'::jsonb
					//AND datos #>'{components,rsc90,dato,lg-nolan}' ?| array['section_id','section_tipo'] '
					if ( $p_value != end($this->propiedades->filtered_by) ) $filter_propiedades .=" \n";
					*/
				}
			}


			#
			# filtered by REFERENCED_SECTION_TIPO (optional)
			if ($referenced_section_tipo) {
				$filter_propiedades .= "\n AND section_tipo = '$referenced_section_tipo' ";
			}
			

		# QUERY
		$strQuery="
				-- ".__METHOD__."
				SELECT section_id, section_tipo, $strQuery_select
				FROM \"$matrix_table\" WHERE
				$strQuery_where  $filter_propiedades				
				ORDER BY {$terminoID_valor}_lang ASC
				";
		#dump($strQuery,'$strQuery');
		$strQuery = sanitize_query($strQuery);
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		$ar_final = array();		
		while ($rows = pg_fetch_assoc($result)) {
			
			$locator  = new locator();
				$locator->set_section_id( $rows['section_id'] );
				$locator->set_section_tipo( $rows['section_tipo'] );
				
			$valor = (string)'';
			/*
			foreach ($ar_terminos_relacionados as $current_tipo) {
				$valor .= $rows[$current_tipo];
				if ( count($ar_terminos_relacionados)>1 && $current_tipo != end($ar_terminos_relacionados) ) $valor .=" ";
			}
			*/
			foreach ($ar_terminos_relacionados as $current_tipo) {

				# ROW format is string json with all langs data like '{"lg-cat": "No", "lg-eng": "No", "lg-eus": null, "lg-fra": null, "lg-spa": "No"}'
				# dump($rows[$current_tipo], '$rows[$current_tipo]');
				$val 		  = json_decode($rows[$current_tipo]);				

				#$RecordObj_dd 	= new RecordObj_dd($current_tipo);
				#$current_lang 	= ($RecordObj_dd->get_traducible() =='no' ? DEDALO_DATA_NOLAN : $lang);
				
				$lang_nolang = DEDALO_DATA_NOLAN;
				$lang_current= $lang;
				$lang_default= 'lg-spa';

				# LANG FALLBACK 
				switch (true) {
					# SET NOLAN (current component is not translatable)
					case (isset($val->$lang_nolang) && !empty($val->$lang_nolang)):
						
						if (is_array($val->$lang_nolang)) {
							dump($val->$lang_nolang, 'WARNING: expected string instead array var - '.$current_tipo);
						}
						$valor .= $val->$lang_nolang;
						break;
					# SET LANG CURRENT REQUEST (current component is translatable)
					case (isset($val->$lang_current)):
						$valor .= $val->$lang_current;
						break;
					# SET DEFAULT LANG FOR LIST OF VALUES
					case (isset($val->$lang_default)):
						$valor .= component_common::decore_untranslated( $val->$lang_default );
						break;
					# SET ANY VALUE FOUNDED (first value found)
					default:
						foreach ((array)$val as $key => $c_value) {
							if(!empty($c_value)) {
								$valor .= component_common::decore_untranslated( $c_value ); break;	// first value found in array of langs
							}
						}#end foreach ($val as $key => $c_value)
						break;
				}#end switch (true) {

				$valor .= ' '; # Add space between component values				
			}

			$ar_final[ json_encode($locator) ] = $valor;			
		}
		#dump($ar_final,'ar_final '.$strQuery);

		# Set object
		$list_of_values->result   = (array)$ar_final;
		$list_of_values->strQuery = (string)$strQuery;
		$list_of_values->msg      = (string)'ok';

		if(SHOW_DEBUG) {
			#if (strpos($strQuery, 'mdcat348')!==false) {
				#dump($ar_final,"ar_final en lang:$lang ".print_r($strQuery,true) ." -- tipo: $this->tipo");	#dump($this->tipo," ");
			#}
			$limit_time=SLOW_QUERY_MS/100;
			$html_info='';
			#dump($rows_data,"");
			$total_list_time = round(microtime(1)-$start_time,3);
			$style='';
			if ($total_list_time>$limit_time || $total_list_time>0.020) {
				$style = "color:red";
			}			
			$html_info .= "<div class=\"ar_list_of_values_debug_info\" style=\"{$style}\" onclick=\"$(this).children('pre').toggle()\"> Time: ";
			$html_info .= $total_list_time;
			$html_info .= "<pre style=\"display:none\"> ".$strQuery ."</pre>";
			$html_info .= "</div>";
			#echo "<div> Time To Generate section list: HTML: ".round(microtime(1)-$start_time,3)."</div>";
			
			$list_of_values->debug = $html_info;
			#if ($this->modo!='edit') {
			#	echo $html_info;
			#}
			#dump($strQuery," strQuery");
			if ($total_list_time>$limit_time) {
				error_log("SLOW QUERY: ".$strQuery);
			}
			#error_log("QUERY: $strQuery total_list_time:$total_list_time - uid:$uid");
		}#end if(SHOW_DEBUG)

		#if ($this->modo =='list') {
		#	$_SESSION['config4']['get_ar_list_of_values'][$uid] = $list_of_values;
		#}
		
		# CACHE
		if ($use_cache===true) {
			$list_of_values_cache[$uid] = $list_of_values;
		}		
		
		# Fix var
		return $this->ar_list_of_values = $list_of_values;
	
	}#end get_ar_list_of_values










	/**
	* GET CURRENT RECORD WITH LANG FALLBACK UNIFIED
	* A partir de tipo y parent del objeto recibido despeja cuales de los registros disponibles están en el idioma actual
	* (si son traducibles) y si no lo están busca el equivalente en el idioma de datos por defecto
	* @param $component_obj
	* @return $ar_final
	*	Array tipo => dato (like Array([dd156] => Documentos solamente))
	*/
	public static function get_current_record_with_lang_fallback_unified($component_obj) {

		# vars (need 'traducible', 'parent', 'tipo')
		$traducible 		= $component_obj->get_traducible();
		$parentID 			= $component_obj->get_parent();		if(empty($parentID)) { dump($component_obj,'$component_obj'); throw new Exception("parentID is empty", 1); };
		$tipo 				= $component_obj->get_tipo();
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);	#$component_obj->get_matrix_table();
		$ar_final 			= array();

			#dump($parentID);

		# Despejamos todos sus hijos
		$arguments=array();
		$arguments['parent']	= $parentID;
		$arguments['tipo']		= $tipo;
		#$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_records				= $RecordObj_matrix->search($arguments);
			#dump($ar_records,'$ar_records');


		# EMPTY RECORDS CASE
		if (empty($ar_records)) {
			if(SHOW_DEBUG) dump($component_obj,'$component_obj received obj');
			# Resultado vacío.
			#dump($ar_records,'ar_records', "arguments: ".print_r($arguments,true));
			trigger_error("No records found in matrix with arguments: ".print_r($arguments,true));

		# NORMAL CASE
		}else{

			foreach ($ar_records as $id) {

				# NO TRADUCIBLE
				if ($traducible=='no') {

					# Si hay mas de 1 registro lanzamos un error pues habrá una inconsistencia aquí
					if (count($ar_records)>1) {
						dump($ar_records,'$ar_records');
						throw new Exception("Inconsistency found. Too much records", 1);
					}

					#$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
					$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
					$lang 					= $RecordObj_matrix->get_lang();
					if ($lang==DEDALO_DATA_NOLAN) {
						$dato 				= $RecordObj_matrix->get_dato();				#dump($dato,"dato para $terminoID_valor ".DEDALO_DATA_NOLAN);
						$ar_final[$tipo]	= $dato;
					}
				# TRADUCIBLE FALLBACKS
				}else{

					#$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
					$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
					$lang 					= $RecordObj_matrix->get_lang();

					# 1 DEDALO_DATA_LANG
					if ($lang==DEDALO_DATA_LANG) {
						$dato 				= $RecordObj_matrix->get_dato();				#dump($dato,"dato para $terminoID_valor ".DEDALO_DATA_NOLAN);
						$ar_final[$tipo]	= $dato;
					}
					# 2 DEDALO_DATA_LANG_DEFAULT
					else if ($lang==DEDALO_DATA_LANG_DEFAULT){
						$dato 				= $RecordObj_matrix->get_dato();				#dump($dato,"dato para $terminoID_valor ".DEDALO_DATA_NOLAN);
						$ar_final[$tipo]	= component_common::decore_untranslated($dato);
					}

				}#if ($traducible=='no')

			}#END foreach

		}#END if (empty($ar_records))
		#dump($ar_final,"ar_final for $parentID - $tipo");
		return $ar_final;
	}


	/**
	* GET AR RECORDS WITH FALLBACK (lang fallback)
	* Return array of values with lang fallback of current component by tipo
	* Used by component_filter get_ar_proyectos_for_current_section
	* Used by component_filter_master get_ar_proyectos_section
	* @param $ar_records_source
	* @param $tipo
	*/
	public static function get_ar_records_with_lang_fallback($ar_records_source, $tipo, $section_tipo) {

		#dump($ar_records_source,'ar_records_source '.$tipo);

		$ar_records_final 	= array();
		$matrix_table		= common::get_matrix_table_from_tipo($tipo); 	#dump($matrix_table,"");die();
		$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		if (is_array($ar_records_source)) foreach($ar_records_source as $current_id ) {

			/*
			# seleccionamos todos los datos de la lista con el idioma principal
			$arguments=array();
			$arguments['parent']		= $current_id;
			$arguments['tipo']			= $tipo;
			#$matrix_table 				= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix			= new RecordObj_matrix($matrix_table,NULL);
			$ar_records					= $RecordObj_matrix->search($arguments);
				#dump($ar_records,'ar_records ', "$modelo_name  arguments: ".print_r($arguments,true));

			# Recorremos los hijos para determinar cual mostrar en función del idioma
			foreach ($ar_records as $current_id) {

				$current_obj	= component_common::get_instance($modelo_name, $current_id, $tipo);
				$parentID		= $current_obj->get_parent();		#dump($parentID,"parentID of $current_id - $terminoID_valor");

				$current_record_with_lang_fallback 	= component_common::get_current_record_with_lang_fallback_unified($current_obj);
				$ar_records_final[$current_id]				= $current_record_with_lang_fallback[$tipo];
					dump($ar_records_final,'ar_records_final');
			}
			*/

			# Nota: Se usa modo list para evitar el bloque del falback existente en modo edit
			$current_obj = component_common::get_instance($modelo_name, $tipo, $current_id, 'list', DEDALO_DATA_LANG, $section_tipo); # <--- POR VERIFICAR !!!!
				#dump($current_obj, 'current_obj', array());

			$dato = $current_obj->get_dato();
			$dato = str_replace('<mark></mark>', '<mark>untranslated ['.$current_id.']</mark>', $dato);
			$ar_records_final[$current_id] = $dato;

		}
		#dump($ar_records_final);
		return $ar_records_final;
	}



	# Despejamos la lista con los valores agrupados por "parents"
	private static function get_imploded_ar_list_of_values($ar_list_of_values) {

		$ar_list_of_values_formated = array();

		foreach($ar_list_of_values->result as $key => $value) {

			$string = '';
			if(is_array($value)) foreach($value as $key2) {
				if (is_array($key2)) foreach($key2 as $key3) {
					if (is_array($key3)) foreach ($key3 as $key4) {
						$string .= "$key4, ";
					}else{
						$string .= "$key3, ";
					}
				}else{
					$string .= "$key2, ";
				}
			}else{
				$string .= "$value, ";
			}
			#echo "\t - $key: $string <br>\n";
			$ar_list_of_values_formated[$key] =  substr($string,0,-2);
		}
		return $ar_list_of_values_formated;
	}



	/**
	* DECORE UNTRANSLATED
	*/
	public static function decore_untranslated($string) {
		#return '<span class="untranslated">'.$string.'</span>';
		#if(empty($string)) $string = 'untranslated';
		return '<mark>'.$string.'</mark>';
	}
	/**
	* GET LANG NAME
	*/
	protected function get_lang_name() {

		$lang 		= self::get_lang();
		$lang_name 	= RecordObj_ts::get_termino_by_tipo($lang,null,true);

		return $lang_name;
	}



	/**
	* ADD ELEMENT TO DATO ARRAY
	* Add element received to array (dato) and return resultant array
	* @param $element
	*	String
	* @param $dato
	*	Array of elements. Key=auto, Value=tag,  like '0=>861.0.0,1=>875.0.0'
	*//*
	public static function add_element_to_dato_array($element, Array $dato_array) {

		if(is_array($dato_array)) {
			array_push($dato_array, $element);
			$result = array_unique($dato_array);
		}else{
			$result = array($element);
		}
		#dump($result,'$result');
		return($result) ;
	}
	*/
	/**
	* REMOVE ELEMENT TO DATO ARRAY
	* Remove element received on array (dato) and return resultant array
	* !Important: force build new array to keep numeric key correlation (maintain json array format in matrix)
	* @param $element
	*	String full tag like '861.0.0'
	* @param $dato
	*	Array of elements. Key=auto, Value=tag,  like '0=>861.0.0,1=>875.0.0'
	*//*
	public static function remove_element_to_dato_array($element, $dato_array) {

		if(!is_array($dato_array)) return NULL;

		$ar_final = array();
		foreach ($dato_array as $current_target) {

			if ($current_target != $element) {
				# !Important: rebuilding array from index 0 (mantains json format)
				$ar_final[] = $current_target;
			}
		}

		return $ar_final;
	}
	*/


	
	/**
	* ADD_OBJECT_TO_DATO
	* Add received object to objects array
	*/
	public static function add_object_to_dato( $object, array $dato) {

		if (!is_object($object)) {
			throw new Exception("Error Processing Request. var 'object' is not of type object ", 1);			
		}
		if (get_class($object)=='locator') {
			$std_object = locator::get_std_class( $object );
		}else{
			$std_object = $object;
		}

		if(SHOW_DEBUG) {
			/*
			dump( $std_object, 'std_object');
			dump( $dato[0], 'dato[0]');
			dump( $std_object==$dato[0], ' std_object == dato[0]');			
			*/
		}		

		$object_exists=false;
		foreach ($dato as $key => $current_object_obj) {
			/*
			if (!is_object($current_object_obj)) {
				if(SHOW_DEBUG) {
					throw new Exception("Error Processing Request. 'dato' elements are not objects. Please verify json_decode is called before use this method", 1);
				}
				trigger_error(__METHOD__ . "Sorry. Object expected. Nothing is added");
				break;
			}
			*/
			if ((object)$std_object==(object)$current_object_obj) {
				$object_exists=true; break;				
			}
		}
		#dump($dato,"object_exists");

		if ($object_exists===false) {
			$dato[] = $std_object;
		}

		return $dato;
	}
	/**
	* REMOVE_OBJECT_IN_DATO
	* Remove received object in objects array
	*/
	public static function remove_object_in_dato( $object, array $dato) {

		if (!is_object($object)) {
			throw new Exception("Error Processing Request. var 'object' is not of type object ", 1);			
		}
		if (get_class($object)=='locator') {			
			$std_object = locator::get_std_class( $object );
		}else{
			$std_object = $object;
		}

		$remove_key=false;
		foreach ($dato as $key => $current_object_obj) {
			if (!is_object($current_object_obj)) {
				if(SHOW_DEBUG) {
					throw new Exception("Error Processing Request. 'dato' elements are not objects. Please verify json_decode is called before use this method", 1);
				}
				trigger_error(__METHOD__ . "Sorry. Object expected. Nothing is removed");
				break;
			}
			if ((object)$std_object==(object)$current_object_obj) {
				$remove_key=$key; break;							
			}
		}

		if ($remove_key!==false) {
			unset($dato[$remove_key]);
			$dato = array_values($dato); # Re-index array dato (IMPORTANT FOR MAINTAIN JSON ARRAY FORMAT !!)
			error_log(__METHOD__." Unset key $remove_key of dato");
		}
		#dump($dato,"dato - remove_key:$remove_key - ".print_r($std_object,true));

		return $dato;
	}

	


	


	







	/**
	* DATO_ALREADY_EXISTS
	* Test if passed dato already esists in matrix
	* @return bool(true/false)
	*/
	public static function dato_already_exists($dato, $component_tipo, $lang=DEDALO_DATA_LANG, $section_tipo) {

		#dump($dato, " dato_already_exists component_tipo: $component_tipo");die();

		$arguments=array();
		$arguments["datos#>>'{components, $component_tipo, dato,  $lang}'"] = $dato;
		$matrix_table			= common::get_matrix_table_from_tipo($component_tipo);
		$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,NULL,$section_tipo );
		$ar_records				= $JSON_RecordObj_matrix->search($arguments);
			#dump($ar_records,"ar_records - current_matrix_table:$matrix_table $dato ".print_r($arguments,true)); die();

		if (count($ar_records)>0) {
			return true;
		}else{
			return false;
		}
	}


	/**
	* GET_SECTION_TIPO_FROM_COMPONENT_TIPO
	*/
	public static function get_section_tipo_from_component_tipo($component_tipo) {

		$section_tipo = NULL;

		# SRTUCTURE PARENTS
		$RecordObj_dd 		= new RecordObj_dd($component_tipo);
		$ar_parents_of_this = $RecordObj_dd->get_ar_parents_of_this($ksort=false);

		# MODELO
		foreach ($ar_parents_of_this as $current_tipo) {

			#if(!is_null($section_tipo)) {
			#	dump($ar_parents_of_this,'$ar_parents_of_this');
			#	throw new Exception("Error Processing Request. Inconsistent data. More than one section found!", 1);
			#}

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if($modelo_name=='section') {
				$section_tipo = $current_tipo;
				break;
			}
		}

			/* OTRA OPCION ¿MÁS RÁPIDA?
			# Resolvemos el tipo de la sección en la que está el componente
			$ar_parent_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, $modelo_name='section', $relation_type='parent');
				#dump($ar_parent_section,"ar_parent_section: tipo=$this->tipo, modelo_name='section', relation_type='parent' ");#die();

			if (empty($ar_parent_section[0])) {
				throw new Exception("Error Processing Request", 1);
			}else if (count($ar_parent_section)==1) {
				$section 	= section::get_instance($this->parent, $ar_parent_section[0]);		
			}else if (count($ar_parent_section)>1) {
				#throw new Exception("Error Processing Request: tipo:$this->tipo, modo:$this->modo, parent:$this->parent. >> More than one parent section number:".count($ar_parent_section), 1);
				# Puede haber una sección dentro de otra (ej elementos y prcesos), por lo que sólo usaremos la última devuelta que es la más cercana
				$section 	= section::get_instance($this->parent, end($ar_parent_section));
			}
			*/

		return $section_tipo;
	}


	/**
	* GET_SECTION_LIST_ID_NUMBER_FROM_COMPONENT_TIPO
	*/
	public static function get_section_list_id_number_from_component_tipo($component_tipo) {

		exit("UNDER CONSTRUCTION");


		return $section_list_id_number;
	}


	/**
	* GET_DIFFUSION_OBJ
	* @param stdClass Object $propiedades
	*/
	public function get_diffusion_obj( $propiedades ) {
		
		# Build object
		$diffusion_obj = new diffusion_component_obj();
			$diffusion_obj->component_name		= get_class($this);
			#$diffusion_obj->id 				= $this->get_id();	# Removed in b4
			$diffusion_obj->parent 				= $this->get_parent();
			$diffusion_obj->section_tipo 		= $this->get_section_tipo();
			$diffusion_obj->tipo 				= $this->get_tipo();
			$diffusion_obj->lang 				= $this->get_lang();
			$diffusion_obj->label 				= $this->get_label();
			#$diffusion_obj->dato 				= $this->get_dato();

			# initial_media_path
			#$section 							= section::get_instance($diffusion_obj->parent, $diffusion_obj->section_tipo );
			#$diffusion_obj->initial_media_path  = $section->get_initial_media_path();
			
			$diffusion_obj->initial_media_path = $this->get_initial_media_path();
				#dump($diffusion_obj->initial_media_path, ' diffusion_obj '.$diffusion_obj->section_tipo);

			/*
			$valor = $this->get_dato();
			$valor = to_string($valor);
			#$valor = filter_var($valor, FILTER_SANITIZE_STRING);
			$diffusion_obj->columns['valor'] 	= $valor;
			*/

		# Set standar 'valor' (Overwrite when need resolve dato. Ex. portals)
		$diffusion_obj->columns['valor'] = $this->get_valor();
			#dump($diffusion_obj,'$diffusion_obj');

		return $diffusion_obj;
	}



	/**
	* GET_STATS_OBJ
	*/
	public function get_stats_obj( $propiedades ) {

		$stats_obj = new diffusion_stats_component_obj();

		$stats_obj = $this->get_dato();
			#dump($stats_obj,'$stats_obj');

		return $stats_obj;
	}


	# GET_STATS_VALUE
	public static function get_stats_value( $tipo, $ar_value ) {

		$caller_component = get_called_class();

		#if($caller_component!='component_radio_button') return;
		#dump($ar_value,'ar_value '.$caller_component);

		if(!isset($stats_value))
		static $stats_value;


		# Formateamos el dato recibido
		if( is_array($ar_value) ) {

			foreach ($ar_value as $key => $value) {

				if(!isset($stats_value[$tipo][$value])) $stats_value[$tipo][$value] = 0;
				$stats_value[$tipo][$value] = $stats_value[$tipo][$value] + 1;
			}

		}else{

			$value = $ar_value;

			if(!isset($stats_value[$tipo][$value])) $stats_value[$tipo][$value] = 0;
			$stats_value[$tipo][$value] = $stats_value[$tipo][$value] + 1;
		}

		#if($caller_component=='component_autocomplete_ts')
		#dump($stats_value[$tipo],'$stats_value - '.$caller_component." - tipo:".$tipo);

		return $stats_value[$tipo];
	}

	# GET_STATS_VALUE_RESOLVED
	public static function get_stats_value_resolved( $tipo, $current_stats_value, $stats_model ,$stats_propiedades=NULL ) {

		$caller_component = get_called_class();

		#if($caller_component=='component_autocomplete_ts')
		#dump($current_stats_value ,'$current_stats_value '.$tipo ." $caller_component");

		foreach ($current_stats_value as $current_dato => $value) {

			if( empty($current_dato) ) {

				$current_dato = 'nd';
				$ar_final[$current_dato] = $value;

			}else{

				$current_component = component_common::get_instance($caller_component, $tipo, NULL, 'stats');
				$current_component->set_dato($current_dato);

				$valor = $current_component->get_valor();
					#dump($valor,'valor '.$caller_component. " - current_dato:$current_dato");

				$ar_final[$valor] = $value;
			}


		}#end foreach


		$label 		= RecordObj_dd::get_termino_by_tipo( $tipo,null,true ).':'.$stats_model;
		$ar_final 	= array($label => $ar_final );
			#dump($ar_final,'$ar_final '.$caller_component . " ".print_r($current_stats_value,true));

		return $ar_final;
	}





	/**
	* GET_COMPONENT_AR_LANGS
	* Devuelve un arary con todos los idiomas usados por este componente a partir de el dato de la sección que lo aloja
	* @return array $component_ar_langs
	*/
	public function get_component_ar_langs() {

		$component_ar_langs=array();

		$tipo 			= $this->tipo;
		$parent 		= $this->parent;

		if (empty($parent)) {
			trigger_error("Error: parent is mandatory for ".__METHOD__);
			if(SHOW_DEBUG) {
					dump($this,"this");
				throw new Exception("Error Processing Request", 1);				
			}
		}
		$section_tipo 	= $this->section_tipo;		
		$section 		= section::get_instance($this->parent,$section_tipo);
		$section_dato 	= $section->get_dato();

		if (isset($section_dato->components->$tipo->dato)) {
			$component_dato_full = $section_dato->components->$tipo->dato;
		}else{
			$component_dato_full = null;
		}
		
			#dump($component_dato_full,"component_dato_full $tipo");
		
		#$n = count( (array)$component_dato_full );
			#dump($n,"n");

		if ($component_dato_full!=null) {
			foreach ($component_dato_full as $key => $value) {
				$component_ar_langs[] = $key;
			}
			#dump($component_ar_langs,"component_ar_langs");
		}		
		
		return (array)$component_ar_langs;	
	}


	public function get_ar_authorized_tool_name() {
		if ($this->get_permissions($this->tipo)<=1) {
			return array();
		}
		
		if (!isset($this->ar_authorized_tool_name)) {
			$this->get_ar_tools_obj();
		}		
		#dump($this->ar_authorized_tool_name, ' $this->ar_authorized_tool_name', array());
		return (array)$this->ar_authorized_tool_name;
	}

	public function get_component_info($format='json') {
		
		$component_info = new stdClass();
		
		$component_info->mod_date 			= (string)$this->get_mod_date();		
		$component_info->mod_by_user_name 	= (string)$this->get_mod_by_user_name();	
		$component_info->ar_tools_name 		= (array)$this->get_ar_authorized_tool_name();

		$component_info->propiedades 		= (object)$this->get_propiedades();

		switch ($format) {
			case 'json':
				return json_handler::encode($component_info);
				break;
			
			default:
				return $component_info;
				break;
		}
	}
	


	


	public static function build_locator() {
		throw new Exception("DEPRECATED METHOD", 1);		
	}
	public static function build_locator_relation() {
		throw new Exception("DEPRECATED METHOD", 1);		
	}

	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){
		return $this->lang;
	}


	/*
	* GET_METHOD
	* Return the result of the method calculation into the component 
	*/
	public function get_method( string $param ){
		if (SHOW_DEBUG) {
			error_log('This component don\'t have one method defined: '.$param);
		}
		return false;
	}



	/**
	* GET_REFERENCED_TIPO
	* (used by component_autocomplete, component_radio_button.. )
	* @return string $this->referenced_tipo from TR of current component
	*/
	public function get_referenced_tipo() {

		if (isset($this->referenced_tipo)) return $this->referenced_tipo;

		# RELACIONES : Search and add relations to current component
		$relaciones = (array)$this->RecordObj_dd->get_relaciones();
			#dump($relaciones,'$relaciones');

		# ONLY >1 TR IS ALLOWED
		if(count($relaciones)<1 || !isset($relaciones[0])) {
			$tipo 		= $this->get_tipo();
			$termino 	= RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			$modelo 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$msg = "Error Processing Request. invalid number of related components (".count($relaciones).") $termino";
			if(SHOW_DEBUG) {
				#dump($this,'this');				
				$msg .= "<hr> $modelo : $termino [$tipo] => relaciones = ". var_export($relaciones,true);
			}
			#throw new Exception($msg, 1);
		}
		
		#dump($relaciones, ' relaciones '.$this->tipo.'_'.$this->modo.'_'.$this->parent);
		$this->referenced_tipo = reset($relaciones[0]);
		#dump($referenced_tipo, ' referenced_tipo');
				
		return $this->referenced_tipo;
	}

	/**
	* GET_REFERENCED_SECTION_TIPO
	* (used by component_autocomplete, component_radio_button.. for set target section_tipo (propiedades) - aditional to referenced component tipo (TR)- )
	* @return string $this->referenced_section_tipo from json propiedades section_tipo
	*/
	/*
		ACABARÁ UNIFICANDOSE AL COMPORTAMIENTO DE PORTAL Y AUTOCOMPLETE

	*/
	public function get_referenced_section_tipo($tipo) {

		if (isset($this->referenced_section_tipo)) return $this->referenced_section_tipo;

		return $this->get_section_tipo_from_component_tipo($tipo);

		/* 
			NOTA: La convertimos en una alias de get_section_tipo_from_component_tipo

		#dump($this->propiedades," ");
		if (empty($this->propiedades) || !is_object($this->propiedades) || !property_exists($this->propiedades, 'section_tipo')) {
			#throw new Exception("Error Processing Request. ".get_class($this)." Propiedades -> section_tipo is mandatory ($this->tipo)", 1);			
		}

		$this->referenced_section_tipo = $this->propiedades->section_tipo;

		return $this->referenced_section_tipo;
		*/
	}


	/**
	* GET_TARGET_SECTION_TIPO
	* Sección de la que se alimenta de registros el portal. No confundir con la sección en la que está el portal
	*/
	public function get_target_section_tipo() {
		
		if (!$this->tipo) return NULL;

		if(isset($this->target_section_tipo)) {
			#dump($this->target_section_tipo,"Already calculated [target_section_tipo]");
			return $this->target_section_tipo;
		}

		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'section', 'termino_relacionado', $search_exact=true);
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name');

		if(SHOW_DEBUG) {

			if ( empty( reset($ar_terminoID_by_modelo_name) )) {
				$portal_name = RecordObj_dd::get_termino_by_tipo($this->tipo,null,true);
				throw new Exception("Error Processing Request. Please, define target section structure for portal: $portal_name - $this->tipo", 1);
			}
			if (count($ar_terminoID_by_modelo_name)!=1) {
				dump($ar_terminoID_by_modelo_name, '$ar_terminoID_by_modelo_name '."$this->tipo - section - termino_relacionado");
				throw new Exception("Error Processing Request. Structure element ($this->tipo) with more than one section related. Please fix ASAP. Count:".count($ar_terminoID_by_modelo_name), 1);				
			}
			#dump(count($ar_terminoID_by_modelo_name), 'count(var)');
		}

		$target_section_tipo = reset($ar_terminoID_by_modelo_name);
			#dump($target_section_tipo, '$target_section_tipo');
	

		# Fix value
		$this->target_section_tipo = $target_section_tipo;
		
		return $target_section_tipo;
	}


	
	/**
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components
	* @param string ..
	* @see class.section_list.php get_rows_data filter_by_search
	* @return string SQL query (ILIKE by default)
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value ) {
		if ( empty($search_value) ) {
			return null;
		}
		$search_query = " $json_field#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' ILIKE '%$search_value%' ";
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}
		return $search_query;
	}



	/**
	* GET_AR_COMPONENTS_WITH_REFERENCES
	* Get array of model name of components that store references (locators)
	* @return array $ar_components_with_references
	*/
	public function get_ar_components_with_references() {
		
		return array('component_portal','component_autocomplete','component_radio_button','component_check_box','component_select');

	}#end get_ar_components_with_references



	/**
	* RESOLVE_SEARCH_OPERATORS (temporal method)
	* @return string $sql_line
	*/
	public static function resolve_search_operators( $field_name, $string_to_resolve, $default_operator='=' ) {
		$sql_line = null;
		$ar_operators = array('<','>','<=','>=');
		foreach ($ar_operators as $current_operator) {
			if (strpos($string_to_resolve, $current_operator)!==false) {
				$sql_line = $field_name.$string_to_resolve;
				break;
			}
		}

		if (is_null($sql_line)) {
			$sql_line = $field_name . $default_operator . $string_to_resolve;
		}

		return (string)$sql_line;

	}#end resolve_search_operators


}
?>
