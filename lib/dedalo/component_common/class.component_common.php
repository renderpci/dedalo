<?php
# COMPONENT COMMON (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES

require_once(DEDALO_LIB_BASE_PATH . '/common/class.common.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_time_machine.php');



abstract class component_common extends common {

	# GENERAL VARS
	protected $id ;						# id (int) Component id in matrix
	protected $tipo ;					# tipo en estructura ej ('dd22') eq. terminoID
	protected $parent ;					# id matrix del parent
	protected $lang ;					# lang en estructura ('lg-esp')
	protected $traducible ;				# definido en tesauro
	protected $modo ;					# default edit
	protected $dato ;					# dato
	protected $valor ;					# normalmente es dato
	public $version_date;				# normalmente despejado de time machine y asignado al component actual

	# STRUCTURE DATA
	protected $RecordObj_ts ;			# obj ts
	protected $modelo;
	protected $norden;
	protected $label;					# etiqueta

	protected $required ;				# field is required . Valorar de usar 'Usable en Indexación' (tesauro) para gestionar esta variable
	protected $debugger ;				# info for admin
	protected $ejemplo ;				# ex. 'MO36001-GA'
	protected $ar_tools_name = array('tool_time_machine','tool_lang');
	protected $ar_tools_obj ;

	protected $exists_dato_in_any_lan	= false;
	protected $dato_resolved ;

	protected $expected_lang;			# Idioma esperado para este componente (usado para verificar que la estrucutra está bien formada)

	public $section_obj;				# parent section obj (optional, util for component_av...)


	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {

		global $log_messages;

		# TIPO : Test valid tipo
		if ( empty($tipo) || !strlen($tipo) ) {
			$msg = "Component common: valid 'tipo' value is mandatory!";
			$log_messages .= $msg;
			throw new Exception($msg, 1);
		}
		# PARENT : Test valid parent
		if ( intval($id)<1 && !strlen($parent) ) {
			if ($id==='dummy') {
				# nothing to do...
			}else{
				$msg = "Component common: valid 'parent' value is mandatory! ";
				throw new Exception($msg, 1);
			}
		}
		# LANG : Test valid lang
		if ( empty($lang) ) {
			$msg = "Component common: valid 'lang' value is mandatory!";
			$log_messages .= $msg;
			throw new Exception($msg, 1);
		}
		# LANG : Overwrite var '$lang' with previous component declatarion of '$this->lang'
		if(isset($this->lang)) $lang = $this->lang;



		# STRUCTURE DATA : common::load_structure_data()
		# Fijamos el tipo recibido y cargamos la estructura previamente para despejar si este tipo es traducible o no
		# y fijar de nuevo el lenguaje en caso de no ser traducible
		$this->tipo 	= $tipo;
		parent::load_structure_data();



		# LANG : Check lang
		# Establecemos el lenguaje preliminar (aunque todavía no están cargados lo datos de matrix, ya tenemos la información de si es o no traducible
		# a partir de la carga de la estructura)
		$lang_expected = $lang;
		if ($this->traducible=='no') {
			$lang_expected = DEDALO_DATA_NOLAN;
			# Verify if received lang is coherent (Note if no lang is passed, default value 'DEDALO_DATA_LANG' is used)
			if($lang != $lang_expected) {
				#if(SHOW_DEBUG===true) dump($this);
				#trigger_error("Calling component Inconsistency detected: lang:$lang is not valid for a non-translatable component [$tipo] (expected lang:$lang_expected) ");
				#error_log("Warning: component 'non-translatable' is called with default lang ($lang). Assigned correct 'lg-nolan' instead for [component tipo [$tipo]");
			}
		}

		/**/
		# ID : Try calculate id from tipo, parent, lang
		if( intval($id)<1 && (strlen($tipo)>2 && intval($parent)>0 && strlen($lang_expected)>2) ) {
			$id = component_common::get_id_by_tipo_parent($tipo, $parent, $lang_expected);
				#dump($id,"Calculated id [$id] from tipo:$tipo, parent:$parent, lang_expected:$lang_expected ");
		}

		# Fix vars
		$this->id				= $id;
		$this->parent 			= $parent;
		$this->lang 			= $lang_expected;
		$this->modo 			= $modo;
		$this->ar_css			= NULL;
		$this->ar_tools_obj		= false;
		$this->debugger			= "ID:$this->id - tipo:$this->tipo - norden:$this->norden - modo:$this->modo - lang:$this->lang - parent:$this->parent";


		# MATRIX DATA : Load matrix data in common class
		$load_matrix_data = parent::load_matrix_data();


		# DEFAULT DATA TRY
		# If 'propiedades:dato_default' exists, use this value as initial value and save matrix record
		#if($load_matrix_data===NULL && $this->bl_loaded_matrix_data!=true && $modo=='edit') {
		if($this->id<1 && $this->modo=='edit' && $this->parent>0) {
			
			$propiedades = $this->RecordObj_ts->get_propiedades();
				#dump($propiedades,'$propiedades');

			if(!empty($propiedades)) {

				$propiedades = json_handler::decode($propiedades);
					#dump($propiedades->dato_default,'$propiedades->dato_default');
				if(isset($propiedades->dato_default)) {

					#dump($propiedades->dato_default,'$propiedades->dato_default intentando salvar desde tipo:'.$this->tipo." parent:".$this->parent);
										
					$this->set_dato($propiedades->dato_default);
					$this->id 	= $this->Save();

					# INFO LOG
					$msg = "INFO: Created ".get_called_class()." $this->id [$tipo] with default data from 'propiedades' (".to_string($propiedades->dato_default).") - modo:$this->modo";
					error_log($msg);
					#throw new Exception("$msg", 1);
					

					parent::load_matrix_data();
				}
			}

		}#end if($load_matrix_data==NULL)


	}#end __construct


	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }


	/**
	* FIX_LANGUAGE_NOLAN
	*/
	protected function fix_language_nolan() {

		$this->expected_lang = DEDALO_DATA_NOLAN;
		return NULL;

		dump($this," fix_language_nolan ");
		# Fix lang allways
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

		# No se meten en cahe ni devuelven nada
		if(login::is_logged()===true && isset($this->tipo)) {
			$permissions = common::get_permissions($this->tipo);
			if($permissions<1) return null;
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
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.get_called_class().']', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);		#.'_'.tools::get_memory_usage('pid')
		}		

		return $html;
	}


	/**
	* SAVE
	* Save component common in matrix
	* @param Is mandatory set object vars (id) or (tipo,parent,lang)
	* If current component don't have record in matrix, create new record and return matrix id
	* @return id matrix
	*/
	public function Save() {

		# main vars
		$id 	= $this->get_id();
		$parent = $this->get_parent();			#$id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=false) {
		$tipo 	= $this->get_tipo();
		$lang 	= $this->get_lang();
		if (empty($lang)) {
			$lang = DEDALO_DATA_LANG;
		}
		/* Innecesario ???
		# Si sabemos que el elemento no es traducible, fijamos su 'lang' en 'lg-nolan' (DEDALO_DATA_NOLAN)
		if ($this->traducible=='no') {
			$lang = DEDALO_DATA_NOLAN;
		}
		*/

		# PARENT : Verify parent . Un componentte no puede tener parent 0. Sólo las secciones
		if(intval($parent)<1) {
			throw new Exception("Error Processing Request. Inconsistency detected: component trying to save with parent '0' ", 1);			
		}

		# Verify dato is not empty . If dato is empty, nothing is done
		#if(!$id && empty($dato))
		#	throw new Exception("Save: Nothing to save.. (id:$id, dato:$dato)", 1);

		# Verify component minumun vars before save
		if( !$id && (empty($parent) || empty($tipo) || empty($lang)) )
			throw new Exception("Save: More data are needed! id:$id, parent:$parent, tipo,$tipo, lang,$lang", 1);


		# DATO
		$dato 	= $this->dato;
		

		# Matrix
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id,$parent,$tipo,$lang);

		$RecordObj_matrix->set_dato($dato);

		# Si no hay id definido para el componente, lo calcularemos en base al resto de variables ($tipo, $parent, $lang)
		if(!$id) {

			# Trying calculate id
			$id = self::get_id_by_tipo_parent($tipo, $parent, $lang);

			if(!$id) {
				$RecordObj_matrix->set_parent($parent);
				$RecordObj_matrix->set_tipo($tipo);
				$RecordObj_matrix->set_lang($lang);
			}else{
				$this->id = $id;
			}
		}
		#dump($this,'$RecordObj_matrix'); #die();
		#dump(common::get_matrix_table_from_tipo($tipo),' matrix table for tipo : '.$tipo); #die();

		# SAVE : matrix obj save
		$saved 		= $RecordObj_matrix->Save();
		$this->id 	= $RecordObj_matrix->get_ID();

		# TIME MACHINE : Get returned time_machine id on save
		$time_machine_last_id = $RecordObj_matrix->get_time_machine_last_id();
			#dump($time_machine_last_id,'$time_machine_last_id');

		# ID : Check valid id returned
		if (intval($this->id)<1) {
			throw new Exception("Save: received id ($id) not valid!", 1);
		}
		#dump($RecordObj_matrix,'$RecordObj_matrix',"id:$this->id");

		# ENCODING : Check correct encoding of db dato
		if (is_string($this->get_dato())) {
			# Check encoding strict
			$detected_encoding = mb_detect_encoding($this->get_dato(), 'UTF-8', true);
				#dump($detected_encoding,'$detected_encoding post-save');
			if ($detected_encoding==false) {
				trigger_error("Dato encoding is incorrect [$detected_encoding]. Must be UTF-8");
			}
		}

		# ACTIVITY
		# Prevent infinite loop saving self
		if (!in_array($tipo, logger_backend_activity::$ar_elements_activity_tipo)) {

			# Siempre y cuando el tipo a salvar no sea de un elemento de 'logger_backend_activity', calculamos los proyectos de su sección
			# Esto permitirá filtrar la actividad por proyectos autorizados al usuario que consulta
			try {
				$projects = filter::get_section_projects($this->id, $this->tipo, $this->parent);
					#dump($projects, "projects for vars: id:$this->id, tipo:$this->tipo, parent:$this->parent"); #$projects = NULL;

				$matrix_table 	= common::get_matrix_table_from_tipo($this->tipo);

				$top_tipo 		= $_SESSION['config4']['top_tipo'];
				$top_id 		= $_SESSION['config4']['top_id'];

				# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				logger::$obj['activity']->log_message(
					'SAVE',
					logger::INFO,
					$this->tipo,
					$projects,
					array(	"msg"			=> "Saved component data",
							"id" 			=> $this->id,
							"tipo"			=> $this->tipo,
							"parent"		=> $this->parent,
							"lang"			=> $this->lang,
							"top_id"		=> $top_id,
							"top_tipo"		=> $top_tipo,
							"component_name"=> get_called_class(),
							"table"			=> $matrix_table,
							"tm_id"			=> $time_machine_last_id
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
		}	
		
		


		# RETURN MATRIX ID
		return $this->id ;

	}#end Save




	/**
	* GENERATE_JS
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

		$propiedades = $this->RecordObj_ts->get_propiedades();
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

		$propiedades = $this->RecordObj_ts->get_propiedades();
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

		# STATIC CACHE
		static $id_by_tipo_parent_cache;
		$id_unic = $tipo . '-'. intval($parent) . '-' . $lang;
		if(isset($id_by_tipo_parent_cache[$id_unic])) {
			#dump($id_by_tipo_parent_cache[$id_unic], " result returned from cache (get_id_by_tipo_parent): $id_unic .  EN PRUEBAS (NO DEVUELVE EL RESULTADO DE CACHE. SÓLO NOTIFICA) ");
			#return $id_by_tipo_parent_cache[$id_unic];
		}

		# TRADUCIBLE
		# Si el elemento no es traducible, lo crearemos como lag 'DEDALO_DATA_NOLAN'. En otro caso aplicamos el idioma de los adatos actual
		# Evita insistencias en componentes como component_av cuando se le pasa un lenguaje incorrecto
		$RecordObj_ts 	= new RecordObj_ts($tipo);
		$traducible 	= $RecordObj_ts->get_traducible();
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
	}


	/**
	* FILTRO
	* Consulta si el parent (la sección a que pertenece) está autorizada para el usuario actual
	* @return bool(true/false)
	* Devuelve false si NO es autorizado
	*/
	function get_filter_authorized_record() {

		#dump($this->get_modo(),'get_filter_authorized_record modo');
		#dump(component_security_areas::get_ar_authorized_areas_for_user(navigator::get_userID_matrix(), $simple_array=false));

		# Si no estamos logeados, no se aplica el filtro (caso componentes input text etc, en formulario de login)
		if(!login::is_logged()) return NULL;

		# Si el modo es uno de los excluidos, no se aplica el filtro (caso de search por ejemplo)
		$ar_excluded = array('search','list_tm','tool_lang');
		$modo 		 = $this->get_modo();
		if (in_array($modo, $ar_excluded)) return NULL;


		$userID_matrix 		= navigator::get_userID_matrix();
		$is_global_admin 	= component_security_administrator::is_global_admin($userID_matrix);	#dump($is_global_admin,'',"current_userID:$userID_matrix");
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
	}




	# EJEMPLO
	protected function get_ejemplo() {
		return $this->debugger;
		if(empty($this->ejemplo)) return "example: 'MO-15-5620-GANDIA'";
		return parent::get_ejemplo();
	}


	# REQUIRED
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
		return $this->ar_tools_obj;
	}
	#
	# LOAD SPECIFIC TOOL
	# Note: Used in class.inspector to load relation tool
	public function load_specific_tool($tool_name) {

		$authorized_tool 		= component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		$tool_obj 				= null;

		if ($authorized_tool) {
			# TOOL OBJ
			require_once(DEDALO_LIB_BASE_PATH . '/component_tools/'.$tool_name.'/class.'.$tool_name.'.php');
			$tool_obj						= new $tool_name($this);
			#$this->ar_tools_obj[$tool_name]	= $tool_obj;
		}
		return $tool_obj;
	}
	# LOAD TOOLS
	public function load_tools() {

		# Si no estamos logeados, no es necesario cargar los tools
		if(!login::is_logged()) return null;

		# Load all tools of current component
		$ar_tools_name = $this->get_ar_tools_name();
			#dump($ar_tools_name,'ar_tools_name PRE AUTH');

		# Create obj tools array
		if( is_array($ar_tools_name)) foreach ($ar_tools_name as $tool_name) {

			$authorized_tool = component_security_tools::is_authorized_tool_for_logged_user($tool_name);

			if ($authorized_tool) {
				# TOOL OBJ
				require_once(DEDALO_LIB_BASE_PATH . '/component_tools/'.$tool_name.'/class.'.$tool_name.'.php');
				$tool_obj					= new $tool_name($this);
				$this->ar_tools_obj[$tool_name]	= $tool_obj;
			}
		}
		#dump($ar_tools_obj);

		return $this->ar_tools_obj;
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



	/**
	* GET DATO WITH LANG FALLBACK
	* SOLO HAREMOS LANG FALLBACK DEL DATO EN MODO LIST !
	*/
	protected function get_dato() {

		if(isset($this->dato_resolved)) return $this->dato_resolved;

		# !IMPORTANTY => SOLO HAREMOS LANG FALLBACK DEL DATO EN MODO LIST
		if( $this->modo!='list' ) {
			return $this->get_dato_real();
		}


		# Dato real del componente actual
		# Se asigna al crear el componente y solicitar algún dato, lo que dispara common:load_matrix_data
		#$dato 		= parent::get_dato();
		$dato 		= $this->dato;
			#dump($dato,'dato en get_dato component_common $tipo:'.$tipo);		


		$parent		= self::get_parent();		#dump($parent,'$parent');
		$tipo		= self::get_tipo();			#dump($tipo,'$tipo');
		$traducible	= self::get_traducible();	#dump($traducible,'$traducible');


		# LANG DEFAULT FALLBACK
		if(empty($dato) && $parent>0) {	#&& $this->dato_resolved!='si'

			#$dato = component_common::get_current_record_with_lang_fallback_unified($this)[$tipo];	dump($dato,'dato');

			# Verificamos si hay algún dato en algún idioma
			$arguments=array();
			$arguments['parent']= $parent;
			$arguments['tipo'] 	= $tipo;
			$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
			$ar_id				= $RecordObj_matrix->search($arguments);
				#dump($ar_id,'ar_id '.print_r($arguments,true));

			# Si existe alguna versión en algún idioma fijamos la variable
			if(count($ar_id)>0) $this->exists_dato_in_any_lang = true;

		  	# NO TRADUCIBLE
			# Si el componente no es traducible, lo reemplazamos por el único que existirá en matrix ignorando su lenguaje (si ya existe).
			if($traducible=='no') {

				$dato	= $this->get_dato_no_traducible();

		  	# SI TRADUCIBLE	Default es si
			# Localizamos el dato en el lenguaje por defecto
			}else{

				$dato_default_lang	= $this->get_dato_default_lang();
					#dump($dato_default_lang,'$dato_default_lang');

				# De momento lo asignamos como valor del texto del ejemplo (cuando el valor es string). Falta asignarlo a un tool de lenguaje para edit.
				#if(is_string($dato_default_lang)) {
				#	self::set_ejemplo(' Original: '.$dato_default_lang	.'');
				#}

				# Sólo si estamos en modo list retornamos el dato del leguaje por defecto
				# Es importante para no mostrar el dato incorrecto en los campos de edición (edit)
				# pero si mostrar la traducciín en los listados (con estilo pitufo)
				if($this->modo=='list') {
					$dato = component_common::decore_untranslated($dato_default_lang);
				}else{
					$dato = $dato_default_lang;
				}

			}#end if($traducible=='no')

		}#if(empty($dato)
		#if($tipo=='dd22') dump($dato,'dato');

		$this->dato_resolved = $dato;

		return $dato ;
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

		$parent = $this->get_parent();
		$tipo	= $this->get_tipo();				#dump($tipo);

		if (empty($parent) || empty($tipo)) {
			throw new Exception("Few vars on get_dato_default_lang", 1);
		}

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
	}

	/**
	* GET_DATO_NO_TRADUCIBLE
	* Despeja el único dato de este componente.
	* Si hay mas de 1 generará un error de consistencia
	* @see self::get_dato()
	*/
	protected function get_dato_no_traducible() {

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
			$component_obj		= new $current_class_name($current_id, $tipo, $modo='edit', $parent, $lang=DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
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
				$string .= $key .':'. $value .', ';
			}
			if(strlen($string)>2) $string = substr($string, 0,-2);
			return $string;
		}else if (is_object($dato)) {
			$string = 'Object: ' . get_class($dato);;
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

		$parent = self::get_parent();
		$tipo	= self::get_tipo();				#dump($tipo);

		if (empty($parent) || empty($tipo)) {
			throw new Exception("Few vars", 1);
		}

		# No existe registro en este idioma. Buscamos con el idioma de datos por defecto DEDALO_DATA_LANG_DEFAULT
		$arguments=array();
		$arguments['parent']= $parent;
		$arguments['tipo'] 	= $tipo;
		$arguments['lang'] 	= DEDALO_DATA_LANG_DEFAULT ;

		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
		$ar_id				= $RecordObj_matrix->search($arguments);
			#dump($ar_id,'ar_id '.print_r($arguments,true));

		# Existe registro matrix para este componente en su idioma principal
		if(!empty($ar_id[0])) {
			$current_id		= $ar_id[0];

			# Despejamos el dato
			$current_class_name	= get_class($this);
			$component_obj		= new $current_class_name($current_id, $tipo);
			
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
	* @return Array format id_matrix=>termino:
	* Array
	*		(
	*	    	[4825] => Hombre
	*	    	[4827] => Mujer
	*		)
	*/
	public function get_ar_list_of_values($lang=DEDALO_DATA_LANG) {

		if(isset($this->ar_list_of_values)) return $this->ar_list_of_values;

		# vars
		$ar_list_of_values	= array();
		$ar_final 			= array();
		$tipo 				= $this->tipo;

		# Obtenemos los terminos relacionados del componente actual
		#$ar_terminos_relacionados 	= RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true);
			#dump($ar_terminos_relacionados,"ar_terminos_relacionados");

		$ar_terminos_relacionados = $this->get_relaciones();
			#dump($ar_terminos_relacionados2,'$relaciones');

		# Recorremos el array por cada "valor" del dato del componente origen (es un array)
		foreach ($ar_terminos_relacionados as $terminoID_valor) {

				# Creamos un nuevo objeto tesauro con los terminos relacionados del termino "valor" para verificar que la lista se compone de datos de un campo diferente a "valor"
				$ar_termino_valor_relacionado 	= RecordObj_ts::get_ar_terminos_relacionados($terminoID_valor, $cache=false, $simple=true);
					#dump($ar_termino_valor_relacionado,"ar_termino_valor_relacionado for $terminoID_valor");


				# Si el termino "valor" del tesauro tiene relacion con algún campo
				# despejamos las relaciones para obtener los datos de los campos relacionados
				if (count($ar_termino_valor_relacionado) > 0) {

					throw new Exception("Temporal para detectar el uso real de este script", 1);
					foreach($ar_termino_valor_relacionado as $terminoID_valor) {

						#obtenemos el nombre del campo relacionado que identifica la lista
						//$terminoString_valor 	= RecordObj_ts::get_termino_by_tipo($terminoID_valor);

						#seleccionamos todos los datos de la lista con el idioma principal
						$arguments=array();
						$arguments['tipo']		= $terminoID_valor;
						#$arguments['lang']		= $lang;
						$matrix_table 			= common::get_matrix_table_from_tipo($terminoID_valor);
						$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
						$ar_records				= $RecordObj_matrix->search($arguments);
							#dump($ar_records,'ar_records', "arguments: ".var_export($arguments,true));

						# despejamos cada dato para obtener su padre que es el identificador del array
						# y despejamos el dato
						# creamos en array con forma: [padreID] [nº de orden] = dato
						foreach ($ar_records as $ID){

							$matrix_table 					= common::get_matrix_table_from_tipo($terminoID_valor);
							$RecordObj_matrix 				= new RecordObj_matrix($matrix_table,$ID);
							$parentID						= $RecordObj_matrix->get_parent();
							$ar_list_of_values[$parentID][] = $RecordObj_matrix->get_dato();
						}
						#dump($ar_list_of_values,'$ar_list_of_values');
					}

				}else{
						# si el término "valor" del tesauro NO tiene relacion con un campo
						# el dato de la lista se obtiene directamente
						$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($terminoID_valor);
							#dump($modelo_name,"modelo_name for $terminoID_valor");

						# MODELO FILTER : Only accept related elements of type 'component_xxx'
						# Stop execution on different elements like locators for example
						if(strpos($modelo_name, 'component_')===false) continue;

						/*
						# Es traducible ?
						$RecordObj_ts	= new RecordObj_ts($terminoID_valor);
						$traducible		= $RecordObj_ts->get_traducible();
							#dump($traducible,"traducible for $terminoID_valor");

						if ($traducible=='no') {
							$current_lang = DEDALO_DATA_NOLAN;
						}else{
							$current_lang = DEDALO_DATA_LANG;
						}
						#dump($current_lang,'$current_lang');
						*/

						/*
						# Matrix table
						$ar_parent_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($terminoID_valor, 'section', $relation_type='parent');
						if(empty($ar_parent_section[0])) throw new Exception("Error Processing Request: parent section of $terminoID_valor not found", 1);
						# Section related terms
						$ar_related = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($ar_parent_section[0], 'matrix_table', $relation_type='termino_relacionado');
						if(!empty($ar_related[0])) {
							$current_matrix_table = RecordObj_ts::get_termino_by_tipo($ar_related[0]);	# custom
						}else{
							$current_matrix_table = 'matrix';	# defult
						}
						#dump($current_matrix_table,'$current_matrix_table');
						*/

						/*
						# seleccionamos todos los datos de la lista con el idioma principal
						$arguments=array();
						$arguments['tipo']			= $terminoID_valor;
						#$arguments['lang']			= $current_lang;
						$arguments['order_by_asc']	= 'id';
						$matrix_table 				= common::get_matrix_table_from_tipo($terminoID_valor);
						$RecordObj_matrix			= new RecordObj_matrix($matrix_table,NULL);
						$ar_records					= $RecordObj_matrix->search($arguments);
							#dump($ar_records,"ar_records $modelo_name  arguments: ".print_r($arguments,true). " - terminoID_valor:$terminoID_valor - matrix_table:$current_matrix_table");

						foreach ($ar_records as $current_id) {

							$current_obj	= new $modelo_name($current_id, $terminoID_valor, $modo='edit', $parent=NULL, $current_lang);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
							$dato 			= $current_obj->get_dato();
							$parentID		= $current_obj->get_parent();		#dump($parentID,"parentID of $current_id - $terminoID_valor");

							$ar_final[$parentID][$terminoID_valor] = component_common::get_current_record_with_lang_fallback_unified($current_obj);
						}
						*/
						$arguments=array();
						$arguments['strPrimaryKeyName']	= 'parent';
						$arguments['tipo']				= $terminoID_valor;
						#$arguments['lang']				= 'lg-cat';
						$arguments['group_by']			= 'parent';
						$matrix_table 					= common::get_matrix_table_from_tipo($terminoID_valor);
						$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);	#($matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL) {
						$ar_records						= $RecordObj_matrix->search($arguments);
							#dump($ar_records,"ar_records $modelo_name  arguments: ".print_r($arguments,true). " - terminoID_valor:$terminoID_valor - matrix_table:$current_matrix_table");

						foreach ($ar_records as $current_id) {
							# Nota: Se usa modo list para evitar el bloque del falback existente en modeo edit
							$current_obj	= new $modelo_name(NULL, $terminoID_valor, $modo='list', $current_id, $lang);
							$ar_final[$current_id][$terminoID_valor] = $current_obj->get_dato(); #component_common::get_current_record_with_lang_fallback_unified($current_obj);	#
						}


				}#end if (count($ar_termino_valor_relacionado) > 0)
		}#end foreach ($ar_terminos_relacionados as $terminoID_valor)

		$ar_list_of_values = $ar_final;
			#dump($ar_list_of_values,'$ar_list_of_values');
		# agrupamos los valores del array por el parent y formateamos como key=>value / id_matrix=>termino
			#dump($ar_list_of_values,"ar_list_of_values before");
		$ar_list_of_values = self::get_imploded_ar_list_of_values($ar_list_of_values);
			#dump($ar_list_of_values,"ar_list_of_values after");

		$this->ar_list_of_values = $ar_list_of_values;
			#dump($ar_list_of_values,'$ar_list_of_values');

		return ($this->ar_list_of_values);
	}


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
	public static function get_ar_records_with_lang_fallback($ar_records_source, $tipo) {

		#dump($ar_records_source,'ar_records_source');

		$ar_records_final 	= array();
		$matrix_table		= common::get_matrix_table_from_tipo($tipo);
		$modelo_name 		= RecordObj_ts::get_modelo_name_by_tipo($tipo);

		if (is_array($ar_records_source)) foreach($ar_records_source as $id ) {

			/*
			# seleccionamos todos los datos de la lista con el idioma principal
			$arguments=array();
			$arguments['parent']		= $id;
			$arguments['tipo']			= $tipo;
			#$matrix_table 				= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix			= new RecordObj_matrix($matrix_table,NULL);
			$ar_records					= $RecordObj_matrix->search($arguments);
				#dump($ar_records,'ar_records ', "$modelo_name  arguments: ".print_r($arguments,true));

			# Recorremos los hijos para determinar cual mostrar en función del idioma
			foreach ($ar_records as $current_id) {

				$current_obj	= new $modelo_name($current_id, $tipo);
				$parentID		= $current_obj->get_parent();		#dump($parentID,"parentID of $current_id - $terminoID_valor");

				$current_record_with_lang_fallback 	= component_common::get_current_record_with_lang_fallback_unified($current_obj);
				$ar_records_final[$id]				= $current_record_with_lang_fallback[$tipo];
					dump($ar_records_final,'ar_records_final');
			}
			*/

			# Nota: Se usa modo list para evitar el bloque del falback existente en modo edit
			$current_obj = new $modelo_name(NULL, $tipo, 'list', $id);
				#dump($current_obj, 'current_obj', array());

			$dato = $current_obj->get_dato();
			$dato = str_replace('<mark></mark>', '<mark>untranslated ['.$id.']</mark>', $dato);
			$ar_records_final[$id]= $dato;

		}
		#dump($ar_records_final);
		return $ar_records_final;
	}



	# Despejamos la lista con los valores agrupados por "parents"
	private static function get_imploded_ar_list_of_values($ar_list_of_values) {

		$ar_list_of_values_formated = array();

		if(is_array($ar_list_of_values)) foreach($ar_list_of_values as $key => $value) {

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
		$lang_name 	= RecordObj_ts::get_termino_by_tipo($lang);

		return $lang_name;
	}



	/**
	* ADD ELEMENT TO DATO ARRAY
	* Add element received to array (dato) and return resultant array
	* @param $element
	*	String
	* @param $dato
	*	Array of elements. Key=auto, Value=tag,  like '0=>861.0.0,1=>875.0.0'
	*/
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
	/**
	* REMOVE ELEMENT TO DATO ARRAY
	* Remove element received on array (dato) and return resultant array
	* !Important: force build new array to keep numeric key correlation (maintain json array format in matrix)
	* @param $element
	*	String full tag like '861.0.0'
	* @param $dato
	*	Array of elements. Key=auto, Value=tag,  like '0=>861.0.0,1=>875.0.0'
	*/
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






	


	


	# LOCATORS MANAGER ####################################################################################

	/**
	* ADD LOCATOR TO DATO
	* Add element (tag locator) received to locators array (dato) and return resultant array
	* @param $tag_locator
	*	String full tag like '861.0.0'
	* @param $dato
	*	Array of relations. Key=auto, Value=tag,  like '0=>861.0.0, 1=>875.0.0'
	*/
	public static function add_locator_to_dato($tag_locator, $dato) {

		if(is_array($dato)) {
			array_push($dato, $tag_locator);
			$result = array_unique($dato);
		}else{
			$result = array($tag_locator);
		}

		return($result) ;
	}
	/**
	* REMOVE LOCATOR TO DATO
	* Remove element (tag locator) received on relations/portal array (dato) and return resultant array
	* !Important: force build new array to keep numeric key correlation (maintain json array format in matrix)
	* @param $tag_locator
	*	String full tag like '861.0.0'
	* @param $dato
	*	Array of relations. Key=auto, Value=tag,  like '0=>861.0.0,1=>875.0.0'
	*/
	public static function remove_locator_to_dato($tag_locator, $dato) {

		if(!is_array($dato)) return NULL;

		$ar_final = array();
		foreach ($dato as $current_target) {

			if ($current_target != $tag_locator) {
				# !Important: rebuilding array from index 0 (mantains json format)
				$ar_final[] = $current_target;
			}
		}

		return $ar_final;
	}
	/**
	* BUILD_LOCATOR : For index only
	*/
	public static function build_locator($section_top_tipo=null, $section_top_id_matrix=null, $section_id_matrix=null, $component_tipo='0', $tag_id='0') {

		if ( empty($section_top_tipo) || strpos($section_top_tipo,'dd')===false ) {
			throw new Exception("Error Processing Request: build_locator - section_top_tipo is empty", 1);
		}
		if (empty($section_top_id_matrix) || $section_top_id_matrix=='0') {
			throw new Exception("Error Processing Request: build_locator - section_top_id_matrix is empty", 1);
		}
		if (empty($section_id_matrix)) {
			throw new Exception("Error Processing build_locator Request: build_locator - section_id_matrix is empty", 1);
		}

		$ar_parts = array();
		$ar_parts['section_top_tipo']		= $section_top_tipo;
		$ar_parts['section_top_id_matrix'] 	= $section_top_id_matrix;
		$ar_parts['section_id_matrix']		= $section_id_matrix;
		$ar_parts['component_tipo'] 		= $component_tipo;
		$ar_parts['tag_id']					= $tag_id;

		$rel_locator = implode('.', $ar_parts);
			#dump($rel_locator,'$rel_locator');

		return $rel_locator ;
	}
	/**
	* GET_LOCATOR_AS_OBJ : For index only
	*/
	/*
	$section_top_tipo		= $ocator_as_obj->section_top_tipo;
	$section_top_id_matrix	= $ocator_as_obj->section_top_id_matrix;
	$section_id_matrix		= $ocator_as_obj->section_id_matrix;
	$component_tipo			= $ocator_as_obj->component_tipo;
	$tag_id					= $ocator_as_obj->tag_id;
	*/
	public static function get_locator_as_obj($rel_locator) {

		$ar_bits = explode('.', $rel_locator);

		if(	!isset($ar_bits[0]) || !isset($ar_bits[1]) || !isset($ar_bits[2]) || !isset($ar_bits[3]) || !isset($ar_bits[4]) ) {
			dump($rel_locator,'$rel_locator');
			throw new Exception("Error Processing Request. Wrong rel_locator format ($rel_locator)", 1);
		}

		$ar_parts['section_top_tipo']		= $ar_bits[0];
		$ar_parts['section_top_id_matrix'] 	= $ar_bits[1];
		$ar_parts['section_id_matrix']		= $ar_bits[2];
		$ar_parts['component_tipo'] 		= $ar_bits[3];
		$ar_parts['tag_id']					= $ar_bits[4];

		$obj = (object) $ar_parts;
			#dump($obj);

		return $obj;
	}
	public static function build_locator_from_obj($locator_obj) {
		return component_common::build_locator($locator_obj->section_top_tipo, $locator_obj->section_top_id_matrix, $locator_obj->section_id_matrix, $locator_obj->component_tipo, $locator_obj->tag_id);
	}


	/**
	* BUILD_LOCATOR_RELATION : For relation only
	*/
	public static function build_locator_relation($section_id_matrix=null, $component_tipo='0', $tag_id='0') {

		if (empty($section_id_matrix)) {
			throw new Exception("Error Processing build_locator Request: build_locator - section_id_matrix is empty", 1);
		}

		$ar_parts = array();
		$ar_parts['section_id_matrix']		= $section_id_matrix;
		$ar_parts['component_tipo'] 		= $component_tipo;
		$ar_parts['tag_id']					= $tag_id;

		$rel_locator = implode('.', $ar_parts);
			#dump($rel_locator,'$rel_locator');

		return $rel_locator ;
	}
	/**
	* GET_LOCATOR_RELATION_AS_OBJ : For relation only
	*/
	public static function get_locator_relation_as_obj($rel_locator) {
		#dump($rel_locator,'$rel_locator');
		$ar_bits = explode('.', $rel_locator);

		if(	!isset($ar_bits[0]) || !isset($ar_bits[1]) || !isset($ar_bits[2]) ) {
			dump($rel_locator,'$rel_locator');
			throw new Exception("Error Processing Request. Wrong rel_locator format : '$rel_locator' ", 1);
		}

		$ar_parts = array();
		$ar_parts['section_id_matrix']		= $ar_bits[0];
		$ar_parts['component_tipo'] 		= $ar_bits[1];
		$ar_parts['tag_id']					= $ar_bits[2];

		$obj = (object) $ar_parts;
			#dump($obj);

		return $obj;
	}







	# LOAD COMPONENT STATIC VERSION ####################################################################################

	/**
	* LOAD ONE COMPONENT BY ID OR TIPO
	*
	*/
	public static function load_component($current_id=NULL, $tipo, $modo='edit', $parent=NULL, $lang=NULL, $matrix_table='matrix') {

		if(empty($current_id) && empty($tipo)) throw new Exception("Error on load_component. Few vars to load component", 1);

		# If tipo is empty, calculate tipo from id
		if ( $current_id>0 && empty($tipo) ) {
			$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$current_id);
			$tipo 				= $RecordObj_matrix->get_tipo();
				#dump($tipo,'$tipo'); #die("55");
		}

		# Creamos un nuevo objeto de estructura (tesauro)
		$RecordObj_ts		= new RecordObj_ts($tipo);

		# Obtenemos su modeloID para identificar el tipo del componente
		$modeloID			= $RecordObj_ts->get_modelo();

		# Verify modelo
		if(empty($modeloID)) {
			throw new Exception("-> Invalid modeloID ($modeloID) from id: $current_id , tipo: $tipo", 1);
		}

		# Despejamos el nombre del modelo que será el tipo del componente (ej. 'component_input_text') y es también el nombre de la clase del mismo
		$clase_name			= $RecordObj_ts->get_modelo_name();		#dump($clase_name,'$clase_name');

		#dump($lang,'lang recibido en load_component');

		# LANG NULL . Lang default DEDALO_DATA_LANG if not defined
		$traducible 		= $RecordObj_ts->get_traducible();
		# Asignación por defecto
		if (empty($lang)) {
			if ($traducible=='no') {
				$lang = DEDALO_DATA_NOLAN;
			}else{
				$lang = DEDALO_DATA_LANG;
			}
		}else{
			# Verificación lang recibido
			if ($traducible=='no' && $lang!=DEDALO_DATA_NOLAN) {
				$msg = "Inconsistency detected: lang:$lang is not the expected lang:".DEDALO_DATA_NOLAN." ";
				if(SHOW_DEBUG===true) {
					$msg .= "<br> for $clase_name $tipo and id:$current_id and traducible:$traducible ";
				}
				#trigger_error($msg);
				throw new Exception($msg, 1);

			}
		}



		# COMPONENT . CREATE COMPONENT OBJ BY CLASS NAME
		# var_dump( is_callable($clase_name, true, $component) );
		$component			= new $clase_name($current_id, $tipo, $modo, $parent, $lang);		#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
			#dump($component,'component',"creado component con id:$current_id, tipo:$tipo, modo:$modo, parent:$parent");


		return $component ;
	}


	/**
	* DATO_ALREADY_EXISTS
	* Test if passed dato already esists in matrix
	* @return bool(true/false)
	*/
	public static function dato_already_exists($dato, $component_tipo=NULL) {

			#dump($dato, " dato_already_exists component_tipo: $component_tipo");

		$matrix_table='matrix';

		$arguments=array();
		if(!empty($component_tipo)) {
			# TIPO
			$arguments['tipo']	= $component_tipo;
			$matrix_table 		= common::get_matrix_table_from_tipo($component_tipo);


			# LANG
			$RecordObj_ts		= new RecordObj_ts($component_tipo);
			$traducible			= $RecordObj_ts->get_traducible();
			if ($traducible=='no') {
				$arguments['lang']	= DEDALO_DATA_NOLAN;
			}else{
				$arguments['lang']	= DEDALO_DATA_LANG;
			}
		}

		$arguments['dato:json']	= $dato;
		$matrix_table 			= common::get_matrix_table_from_tipo($component_tipo);
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_records				= $RecordObj_matrix->search($arguments);
			#dump($ar_records,'ar_records ', "$component_tipo  arguments: ".print_r($arguments,true));

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
		$RecordObj_ts 		= new RecordObj_ts($component_tipo);
		$ar_parents_of_this = $RecordObj_ts->get_ar_parents_of_this($ksort=false);

		# MODELO
		foreach ($ar_parents_of_this as $current_tipo) {

			#if(!is_null($section_tipo)) {
			#	dump($ar_parents_of_this,'$ar_parents_of_this');
			#	throw new Exception("Error Processing Request. Inconsistent data. More than one section found!", 1);
			#}

			$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_tipo);
			if($modelo_name=='section') {
				$section_tipo = $current_tipo;
				break;
			}
		}

		return $section_tipo;
	}


	/**
	* GET_SECTION_LIST_ID_NUMBER_FROM_COMPONENT_TIPO
	*/
	public static function get_section_list_id_number_from_component_tipo($component_tipo) {

		exit("UNDER CONSTRUCTION");

		$section_tipo = component_common::get_section_tipo_from_component_tipo($component_tipo);

		return $section_list_id_number;
	}


	/**
	* GET_DIFFUSION_OBJ
	*/
	public function get_diffusion_obj( $propiedades ) {

		$diffusion_obj = new diffusion_component_obj();

		$diffusion_obj->component_name		= get_class($this);
		$diffusion_obj->id 					= $this->get_id();
		$diffusion_obj->parent 				= $this->get_parent();
		$diffusion_obj->tipo 				= $this->get_tipo();
		$diffusion_obj->lang 				= $this->get_lang();
		$diffusion_obj->label 				= $this->get_label();
		#$diffusion_obj->dato 				= $this->get_dato();

		/*
		$valor = $this->get_dato();
		$valor = to_string($valor);
		#$valor = filter_var($valor, FILTER_SANITIZE_STRING);

		$diffusion_obj->columns['valor'] 	= $valor;
		*/
		$diffusion_obj->columns['valor']	= $this->get_valor();
			#dump($diffusion_obj,'$diffusion_obj');
			#dump($this->id);

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

				$current_component = new $caller_component('dummy',$tipo,'stats');
				$current_component->set_dato($current_dato);

				$valor = $current_component->get_valor();
					#dump($valor,'valor '.$caller_component. " - current_dato:$current_dato");

				$ar_final[$valor] = $value;
			}


		}#end foreach


		$label 		= RecordObj_ts::get_termino_by_tipo( $tipo ).':'.$stats_model;
		$ar_final 	= array($label => $ar_final );
			#dump($ar_final,'$ar_final '.$caller_component . " ".print_r($current_stats_value,true));

		return $ar_final;
	}


}
?>
