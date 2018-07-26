<?php
/**
* LOGGER BACKEND ACTIVITY CLASS
*/
require_once( DEDALO_LIB_BASE_PATH .'/logger/class.logger_backend.php' );
#require_once( DEDALO_ROOT .'/lib/thread/thread.class.php' );



class logger_backend_activity extends logger_backend {

	private $log_level;
	private $h_conn;
	private static $activity_matrix_table 		= 'matrix_activity';

	static $que 				= array(
									'LOG IN'		=>'dd696',	# login module
									'LOG OUT'		=>'dd697',	# login module
									'SAVE'			=>'dd700',	# component
									'SEARCH'		=>'dd699',	# component
									'LOAD EDIT'		=>'dd694',	# page
									'LOAD LIST'		=>'dd693',	# page
									'DELETE'		=>'dd698',	# section
									'NEW'			=>'dd695', 	# section
									'DOWNLOAD'		=>'dd1080', # download file by tool av / image / pdf
									'UPLOAD'			=>'dd1090', # upload file by tool upload
									'UPLOAD COMPLETE'	=>'dd1094', # upload file by tool upload
									'DELETE FILE'		=>'dd1095', # delete file by tool
									'NEW VERSION'		=>'dd1081', # new version file
									'RECOVER COMPONENT'	=>'dd1091', # recuperar componente
									'RECOVER SECTION'	=>'dd1092', # recuperar sección
									'STATS'				=>'dd1098', # estadisticas
								);
	
	static $_SECTION_TIPO 		= array('tipo'=>'dd542','modelo_name'=>'section');
	static $_COMPONENT_IP 		= array('tipo'=>'dd544','modelo_name'=>'component_ip');
	static $_COMPONENT_QUIEN 	= array('tipo'=>'dd543','modelo_name'=>'component_autocomplete');
	static $_COMPONENT_QUE 		= array('tipo'=>'dd545','modelo_name'=>'component_input_text');
	static $_COMPONENT_DONDE 	= array('tipo'=>'dd546','modelo_name'=>'component_input_text');
	static $_COMPONENT_CUANDO 	= array('tipo'=>'dd547','modelo_name'=>'component_date');
	static $_COMPONENT_PROYECTOS= array('tipo'=>'dd550','modelo_name'=>'component_filter');
	static $_COMPONENT_DATOS 	= array('tipo'=>'dd551','modelo_name'=>'component_input_text');
	
	static $ar_elements_activity_tipo;

	public static $enable_log 	= true;


	# CONSTRUCT
	# Require url_data string like: 'mysql://user:password@host/database?tabe=matrix_activity' for caompatibity
	public function __construct($url_data) {
		#parent::__construct($url_data);

		# FIX ARRAY ar_elements_activity_tipo
		logger_backend_activity::$ar_elements_activity_tipo = array(
																self::$_SECTION_TIPO['tipo'],
																self::$_COMPONENT_IP['tipo'],
																self::$_COMPONENT_QUIEN['tipo'],
																self::$_COMPONENT_QUE['tipo'],
																self::$_COMPONENT_DONDE['tipo'],
																self::$_COMPONENT_CUANDO['tipo'],
																self::$_COMPONENT_PROYECTOS['tipo'],
																self::$_COMPONENT_DATOS['tipo'],
															);
	}

	
	public function log_message99( $message, $log_level=logger::INFO, $tipo_donde=NULL, $projects=array(), $datos=NULL ) {
		//return false;
			dump($message, 'message', array());
		// listen
		mThread::listen();

		// start time
		$time = time() ;	
		
		//start thread #2, without receive return value with param value 10
		#mThread::start( 'logger_backend_activity::log_message_real', $message, $log_level, $tipo_donde, $projects, $datos ) ;
		mThread::start( 'myfunction_A') ;	
					
		// running till completed
		while ( mThread::runing () ) ;

		return;
	}


	
	/**
	* BUILD_COMPONENT_ACTIVITY_OBJECT
	*/
	public static function build_component_activity_object($dato) {
		
		$component_lang = DEDALO_DATA_NOLAN;
		$component_obj 	= new stdClass();
			$component_obj->dato = new stdClass();
			$component_obj->dato->$component_lang = new stdClass();
			$component_obj->dato->$component_lang = $dato;
			
		return $component_obj;
	}


	/*
	public static function build_component_activity_object_OLD($component, $value_list=null) {
		
		$component_lang = DEDALO_DATA_NOLAN;	#$component->get_lang();

		$component_obj = new stdClass();
			$component_obj->dato = new stdClass();
			$component_obj->dato->$component_lang = new stdClass();
			$component_obj->dato->$component_lang = $component->get_dato();
							
			#$component_obj->value_list = new stdClass();
			#$component_obj->value_list->$component_lang = new stdClass();
			#if (!empty($value_list)) {
			#	$component_obj->value_list->$component_lang = $value_list;
			#}else{
			#	$component_obj->value_list->$component_lang = $component->get_html();
			#}				

		return $component_obj;
	}*/

	/**
	* LOG MESSAGES
	* 	LINE:
	*	MODULE  TIME  USER  IP  REFERRER  MESSAGE  SEVERITY_LEVEL  OPERATIONS
	*	IP_ADDRESS 	QUIEN 	QUE 	DONDE 	CUANDO 	DATOS
	*	QUE(like 'LOAD EDIT'), LOGLEVEL(INFO), TIPO(like 'dd120'), DATOS(array of related info) 
	*/
	public function log_message( $message, $log_level=logger::INFO, $tipo_donde=NULL, $projects=array(), $datos=NULL ) {

		#dump($projects,"log_message message:$message - donde:$donde");


		/*
		*EXCEPCIONES A LA CREACIÓN DEL LOG
		*/

		# ENABLE LOG : OPTIONAL
		if(logger_backend_activity::$enable_log === false) return null;

		# Si no se envia el tipo de la actividad no se genera log
		if (empty($tipo_donde)) {
			trigger_error("Error on log_message (var 'tipo_donde' is empty) ".__METHOD__);
			return NULL;
		}

		# AUTOLOG STOP
		# Prevent infinite loop saving self
		if (in_array($tipo_donde, self::$ar_elements_activity_tipo)) {
			trigger_error("Error on log_message (infinite loop stopped) ".__METHOD__);
			return NULL;
		}
		#dump($datos,"$message, $log_level, $tipo_donde ".self::$_SECTION_TIPO['tipo']); return null;


		# DEBUG : Time
		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			global$TIMER;$TIMER[get_called_class().'_IN_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
		}

	

		#
		# SECTION RECORD . Creamos los componentes para generar el dato 
		#	
			$main_components_obj  = new stdClass();
			$relations 			  = [];
			$current_data_version = tool_administration::get_current_version_in_db();

				# IP ADDRESS (user source ip) #############################################################
					$ip_address	= 'unknow';
					if (isset($_SERVER['REMOTE_ADDR']))
					$ip_address	= $_SERVER["REMOTE_ADDR"];
					if($ip_address==='::1') $ip_address = 'localhost';

					$component_tipo = self::$_COMPONENT_IP['tipo'];
					$component_obj  = self::build_component_activity_object($ip_address);
					$main_components_obj->$component_tipo = $component_obj;
					/*
					$component = self::$_COMPONENT_IP;	#dump(self::$_COMPONENT_IP['tipo'],"");
					$component = new $component['modelo_name']($component['tipo'],null,'list',DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($ip_address);					
					
					$component_obj = self::build_component_activity_object($component);
						#dump($component_obj," ");#die();
					$component_tipo = $component->get_tipo();
					$main_components_obj->$component_tipo = $component_obj;
					*/

				# QUIEN (store user section id_matrix and calculate name on view) ###########################
					$user_id = isset($_SESSION['dedalo4']['auth']['user_id']) ? $_SESSION['dedalo4']['auth']['user_id'] : '-666';
					$locator_user_id = new locator();
						$locator_user_id->set_section_id($user_id);
						$locator_user_id->set_section_tipo(DEDALO_SECTION_USERS_TIPO);

					$component_tipo = self::$_COMPONENT_QUIEN['tipo'];

					# Switch data version
					if( $current_data_version[0] >= 4 && $current_data_version[1] >= 8 ) {
						$locator_user_id->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator_user_id->set_from_component_tipo($component_tipo);
						$relations[] = $locator_user_id;
					}else{
						$component_obj  = self::build_component_activity_object( array($locator_user_id) );
						$main_components_obj->$component_tipo = $component_obj;
					}
					/*
					$component = self::$_COMPONENT_QUIEN;					
					$component = new $component['modelo_name']($component['tipo'],$parent,'list',DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($user_id);
					
					$component_obj = self::build_component_activity_object($component);
					$component_tipo = $component->get_tipo();
					$main_components_obj->$component_tipo = $component_obj;
					*/

				# QUE (msg) # Message ########################################################################### 
					$message 	= str_replace("\t", ' ', $message);
					$message 	= str_replace("\n", ' ', $message);
					$message 	= trim($message);
						#dump($message,"message");	

					$label_tipo = NULL;
					if (isset(self::$que[$message])) {
						$label_tipo = self::$que[$message];
					}
					if (empty($label_tipo)) {
						throw new Exception("label_tipo (from log message) is empty", 1);						
					}

					$component_tipo = self::$_COMPONENT_QUE['tipo'];
					$component_obj  = self::build_component_activity_object($label_tipo);
					$main_components_obj->$component_tipo = $component_obj;
					/*
					$component = self::$_COMPONENT_QUE;		
					$component = new $component['modelo_name']($component['tipo'],$parent,'list',DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($label_tipo);
					
					$ar_labels = array(
									'LOG IN'			=>'entrada',	# login module
									'LOG OUT'			=>'salida',	# login module
									'SAVE'				=>'guardar',	# component
									'SEARCH'			=>'busqueda',	# component
									'LOAD EDIT'			=>'edicion',	# page
									'LOAD LIST'			=>'listado',	# page
									'DELETE'			=>'borrar',	# section
									'NEW'				=>'nuevo', 	# section
									'DOWNLOAD'			=>'descarga', # download file by tool av / image / pdf
									'UPLOAD'			=>'carga', # upload file by tool upload
									'UPLOAD COMPLETE'	=>'carga_completada', # upload file by tool upload
									'DELETE FILE'		=>'eliminar_archivo', # delete file by tool
									'NEW VERSION'		=>'nueva_version', # new version file
									'RECOVER COMPONENT'	=>'recuperar_componente', # recuperar componente
									'RECOVER SECTION'	=>'recuperar_seccion', # recuperar sección
									'STATS'				=>'estadiscticas', # estadisticas
								);
					$html_list = "<script>document.write(get_label.".$ar_labels[$message].")</script>";
					
						#dump($html,"html");
					$component_obj = self::build_component_activity_object($component,$html_list);
					$component_tipo = $component->get_tipo();
					$main_components_obj->$component_tipo = $component_obj;
					*/

				# DONDE (tipo) ################################################################################## 
					$donde 		= $tipo_donde;
					if(!strlen($tipo_donde)) $donde = 'unknow';

					$component_tipo = self::$_COMPONENT_DONDE['tipo'];
					$component_obj  = self::build_component_activity_object($tipo_donde);
					$main_components_obj->$component_tipo = $component_obj;
					/*
					$component = self::$_COMPONENT_DONDE ;
					$component = new $component['modelo_name']($component['tipo'],$parent,'edit',DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($tipo_donde);
					*/

				# CUANDO (Time. timestamp formated) ############################################################# 
					$time 		= component_date::get_timestamp_now_for_db();

					$component_tipo = self::$_COMPONENT_CUANDO['tipo'];
					$component_obj  = self::build_component_activity_object($time);
					$main_components_obj->$component_tipo = $component_obj;
					/*
					$component = self::$_COMPONENT_CUANDO ;
					$component = new $component['modelo_name']($component['tipo'],$parent,'edit',DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($time);
					$id =  $component->Save();
					*/

				# PROYECTOS (param 'datos' + url's ...)	######################################################### 
					if ( !empty($user_id) && $user_id!=='unknow' ) {
						$projects_dato = filter::get_user_projects($user_id);
						# dump($projects_dato, ' $projects_dato ++ '.to_string());
						foreach ((array)$projects_dato as $project_locator) {
							if (isset($project_locator->from_component_tipo)) {
								$project_locator->from_component_tipo = self::$_COMPONENT_PROYECTOS['tipo'];
								$relations[] = $project_locator;
							}							
						}
					}

				# DATOS (param 'datos' + url's ...)	############################################################# 
					if (!is_array($datos)) {
						$dato_array = array($datos);
					}else{
						$dato_array = $datos;
					}					

					# When msg is load, include datos of urls
					if (strpos($message, 'LOAD')!==false) {
						# URL
						$url 			= 'unknow';
						if (isset($_SERVER['REQUEST_URI']))
						$url 			= urldecode( 'http://'.$_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI'] );
						$dato_array['url'] = tools::build_link($url, array('url'=>$url,'css'=>'list_link'));
						# Referrer
						$referrer 		= 'unknow';
						if (isset($_SERVER['HTTP_REFERER']))
						$referrer 		= $_SERVER['HTTP_REFERER'];
						$dato_array['ref'] = tools::build_link($referrer, array('url'=>$referrer,'css'=>'list_link'));
					}

					$component_tipo = self::$_COMPONENT_DATOS['tipo'];
					$component_obj  = self::build_component_activity_object($dato_array);
					$main_components_obj->$component_tipo = $component_obj;				
					/*
					$component = self::$_COMPONENT_DATOS ;
					$component = new $component['modelo_name']($component['tipo'],$parent,'edit',DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($dato_array);
					if(!empty($dato_array)) {
						$id =  $component->Save();
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");
					}
					*/

				# SECTION ############################################################# 
					$section = section::get_instance(null, DEDALO_ACTIVITY_SECTION_TIPO, 'edit');

					# Switch data version
					#if( $current_data_version[0] >= 4 && $current_data_version[1] >= 8 ) {
					#	foreach ($relations as $clocator) {
					#		$section->add_relation($clocator);
					#	}
					#}
					
					$save_options = new stdClass();
						$save_options->main_components_obj 	= $main_components_obj;
						$save_options->main_relations 		= $relations;
							#dump($save_options,"save_options");die();				
					
					$id_section = $section->Save( $save_options );

					if(SHOW_DEBUG===true) {
						#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'logger_backend_activity '.$id_section);
						$TIMER[get_called_class().'_OUT_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
					}

					#dump($main_components_obj,"main_components_obj id created: $id_section");
					return $id_section;



						/* OLD MODE
						
						# SECTION : Create new section activity matrix record
						$tipo 				= self::$_SECTION_TIPO['tipo'];
						$parent 			= intval(0);
						$matrix_table 		= self::$activity_matrix_table;
						$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);				
						
						# Store section dato as array(key=>value)
						# Current used keys: 'section_id', 'created_by_userID', 'created_date'
						$ar_section_dato  = array();	
						$ar_section_dato['section_id']			= counter::get_counter_value($tipo)+1;	#counter::get_new_counter_value($tipo) ;
						$ar_section_dato['created_by_userID']	= navigator::get_user_id() ;
						$ar_section_dato['created_date'] 		= component_date::get_timestamp_now_for_db() ;	# Format 2012-11-05 19:50:44
						$ar_section_dato['ref_name']			= RecordObj_dd::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANGS_DEFAULT,true) ;					
						
						$RecordObj_matrix->set_dato($ar_section_dato);	
						$RecordObj_matrix->set_parent($parent);
						$RecordObj_matrix->set_tipo($tipo);	
						$RecordObj_matrix->set_lang(DEDALO_DATA_NOLAN);
						
						$RecordObj_matrix->save_time_machine_version = false;	# Avoid save time machine copy

						$saved 			= $RecordObj_matrix->Save();			
						$id_section		= $RecordObj_matrix->get_ID();
							#dump($id_section,"logger created section id:$id_section");

						# COUNTER UPDATE : If all is ok, update section counter (counter +1) in structure 'propiedades:section_id_counter'
						if ($id_section>0) {
							counter::update_counter($tipo);
						}
						*/
	
		return true;
	}//end log_message






}#end class 
?>