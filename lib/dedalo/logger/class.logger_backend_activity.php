<?php
/**
* LOGGER BACKEND ACTIVITY CLASS
*/
require_once( DEDALO_LIB_BASE_PATH .'/logger/class.logger_backend.php' );
require_once( DEDALO_ROOT .'/lib/thread/thread.class.php' );



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
	static $_COMPONENT_QUE 		= array('tipo'=>'dd545','modelo_name'=>'component_autocomplete_ts');
	static $_COMPONENT_DONDE 	= array('tipo'=>'dd546','modelo_name'=>'component_autocomplete_ts');
	static $_COMPONENT_CUANDO 	= array('tipo'=>'dd547','modelo_name'=>'component_date');
	static $_COMPONENT_PROYECTOS= array('tipo'=>'dd550','modelo_name'=>'component_filter');
	static $_COMPONENT_DATOS 	= array('tipo'=>'dd551','modelo_name'=>'component_input_text');
	
	static $ar_elements_activity_tipo;

	public static $disable_log 	= false;


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
	* LOG MESSAGES
	* 	LINE:
	*	MODULE  TIME  USER  IP  REFERRER  MESSAGE  SEVERITY_LEVEL  OPERATIONS
	*	IP_ADDRESS 	QUIEN 	QUE 	DONDE 	CUANDO 	DATOS
	*	QUE(like 'LOAD EDIT'), LOGLEVEL(INFO), TIPO(like 'dd120'), DATOS(array of related info) 
	*/
	public function log_message( $message, $log_level=logger::INFO, $tipo_donde=NULL, $projects=array(), $datos=NULL ) {

return null; # <-------------------------------------- DESACTIVO TEMPORALMENTE --------------------------------------------------------------------------------<<<<<

		# DISABLE LOG : OPTIONAL
		if(logger_backend_activity::$disable_log === true) return null;


		if (empty($tipo_donde)) return NULL;
	
			#
			# SECTION RECORD . Important: No use 'section:Save' because cause infinite loop when log new section
			#	

				# AUTOLOG STOP
				# Prevent infinite loop saving self
				if (in_array($tipo_donde, self::$ar_elements_activity_tipo)) return NULL;
					#dump($datos,"$message, $log_level, $tipo_donde ".self::$_SECTION_TIPO['tipo']); return null;


				# DEBUG : Time
				if(SHOW_DEBUG) {
					$start_time = start_time();
					global$TIMER;$TIMER[get_called_class().'_IN_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
				}

				
				# SECTION : Create new section activity matrix record
				$tipo 				= self::$_SECTION_TIPO['tipo'];
				$parent 			= intval(0);
				$matrix_table 		= self::$activity_matrix_table;
				$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);				
				
				# Store section dato as array(key=>value)
				# Current used keys: 'section_id', 'created_by_userID', 'created_date'
				$ar_section_dato  = array();	
				$ar_section_dato['section_id']			= counter::get_counter_value($tipo)+1;	#counter::get_new_counter_value($tipo) ;
				$ar_section_dato['created_by_userID']	= navigator::get_userID_matrix() ;
				$ar_section_dato['created_date'] 		= component_date::get_timestamp_now_for_db() ;	# Format 2012-11-05 19:50:44
				$ar_section_dato['ref_name']			= RecordObj_ts::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANGS_DEFAULT) ;					
				
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
#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_SECTION_'.$tipo_donde.'_'.microtime(1)]=microtime(1);	
			#
			# CHILDREN COMPONENTS OF CREATED SECTION DATA
			#
				# Current section is the 'parent' for all activity components
				$parent 	= $id_section;		

				
				# IP ADDRESS (user source ip) #############################################################					
					$ip_address	= 'unknow';
					if (isset($_SERVER['REMOTE_ADDR']))
					$ip_address	= $_SERVER["REMOTE_ADDR"];
					if($ip_address=='::1') $ip_address = 'localhost';
					
					$component = self::$_COMPONENT_IP;	
					$component = new $component['modelo_name'](NULL,$component['tipo'],'edit',$parent,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($ip_address);
					$id = $component->Save();
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");
					
#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_IP_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
				# QUIEN (store user section id_matrix and calculate name on view) ###########################					
					$userID_matrix = 'unknow';
					if (isset($_SESSION['auth4']['userID_matrix']))
					$userID_matrix	= $_SESSION['auth4']['userID_matrix'];
					
					$component = self::$_COMPONENT_QUIEN;					
					$component = new $component['modelo_name'](NULL,$component['tipo'],'edit',$parent,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($userID_matrix);
					$id =  $component->Save();
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");
					
#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_QUIEN_'.$tipo_donde.'_'.microtime(1)]=microtime(1);			
				# QUE (msg) # Message ########################################################################					
					$message 	= str_replace("\t", ' ', $message);
					$message 	= str_replace("\n", ' ', $message);
					$message 	= trim($message);	

					$label_tipo = NULL;
					if (isset(self::$que[$message])) {
						$label_tipo = self::$que[$message];
					}
					if (empty($label_tipo)) {
						throw new Exception("label_tipo (from log message) is empty", 1);						
					}
				
					$component = self::$_COMPONENT_QUE;		
					$component = new $component['modelo_name'](NULL,$component['tipo'],'edit',$parent,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($label_tipo);
					$id =  $component->Save();
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");
			
#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_QUE_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
				# DONDE (tipo) ################################################################################					
					$donde 		= $tipo_donde;
					if(!strlen($tipo_donde)) $donde = 'unknow';
					
					$component = self::$_COMPONENT_DONDE ;
					$component = new $component['modelo_name'](NULL,$component['tipo'],'edit',$parent,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($tipo_donde);
					$id =  $component->Save();
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");					

#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_DONDE_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
				# CUANDO (Time. timestamp formated) #############################################################					
					$time 		= component_date::get_timestamp_now_for_db();
					
					$component = self::$_COMPONENT_CUANDO ;
					$component = new $component['modelo_name'](NULL,$component['tipo'],'edit',$parent,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($time);
					$id =  $component->Save();
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");
					
#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_CUANDO_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
				# PROYECTOS (param 'datos' + url's ...)	#############################################################					
					$projects_dato = $projects;		#dump(filter::get_user_projects($userID_matrix),'filter::get_user_projects($user_id_matrix) '.$userID_matrix);

					$component = self::$_COMPONENT_PROYECTOS ;
					$component = new $component['modelo_name'](NULL,$component['tipo'],'edit',$parent,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($projects_dato);
					$component->set_propagate_filter(false); # Bypass portal test
					if(
						!empty($projects_dato) && 
						is_array($projects_dato) && 
						count($projects_dato)>0
					   ){
						$id =  $component->Save();
					}						
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");					
				
#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_PROYECTOS_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
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
					
					$component = self::$_COMPONENT_DATOS ;
					$component = new $component['modelo_name'](NULL,$component['tipo'],'edit',$parent,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
					$component->set_dato($dato_array);
					if(!empty($dato_array)) {
						$id =  $component->Save();
						#dump($id,"$component_name created id:$id -  component_tipo:$component_tipo, parent:$parent");
					}		
#if(SHOW_DEBUG) $TIMER[get_called_class().'_OUT_DATOS_'.$tipo_donde.'_'.microtime(1)]=microtime(1);		

		
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'logger_backend_activity '.$id_section);
			$TIMER[get_called_class().'_OUT_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
		}	
		
	}






}#end class 
?>