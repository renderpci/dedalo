<?php
/**
* LOGGER BACKEND MYSQL CLASS
*/
require_once( DEDALO_LIB_BASE_PATH .'/logger/class.logger_backend.php' );
#require_once( DEDALO_LIB_BASE_PATH .'/db/class.RecordObj_log.php' );


class logger_backend_mysql extends logger_backend {

	private $log_level;
	private $h_conn;
	private $table = 'log_data';


	# Require url_data string like: 'mysql://user:password@host/database?tabe=log_data' for caompatibity
	public function __construct($url_data) {
	
		parent::__construct($url_data);

		# Set log level (defined as constant in config file)
		$this->log_level = LOGGER_LEVEL;;

		$log_file_path = $url_data['path'];

		# URL_DATA: connection string is like: mysql://user:password@host/database?tabe=log_data
		# NOTA: en esta implementación sólo usaremos el parámetro 'scheme' para identificar la clase (logger_backend_+'mysql') y 
		# opcionalmente 'table' del string para sobreescribir la tabla por defecto		
		$host 		= $url_data['host'];
		$port 		= $url_data['port'];
		$user 		= $url_data['user'];
		$password 	= $url_data['pass'];
		$ar_path 	= explode('/', $url_data['path']);
		$database	= $ar_path[1];

		if ( !strlen($database) ) {
			throw new Exception("logger_backend_mysql: Invalid connection string. No database name was specified.", 1);			
		}

		$conn_str = '';
		if ($host) {
			$conn_str .= "host=$host ";
		}
		if ($port) {
			$conn_str .= "port=$port ";
		}
		if ($user) {
			$conn_str .= "user=$user ";
		}
		if ($password) {
			$conn_str .= "passwrod=$password ";
		}
		$conn_str .= "dbname=$database";

		# Connection not used here (managed by RecordObj_log)			
		#$this->h_conn = DBi::_getConnection($host, $user, $password, $database,  $port);
		#
		#if (!is_resource($this->h_conn)) {
		#	throw new Exception("Unable to connect to the log database ($database)", 1);			
		#}			

		# Optional url_data vars (like ...?tabe=log_data)
		$query_data = $url_data['query'];
		if (strlen($query_data)) {
			$ar_tmp_data 	= explode(' & ', $query_data);
			$ar_query 		= array();
			foreach ($ar_tmp_data as $query_item) {
				$ar_query_item = explode('=', $query_item);
				$ar_query[urldecode($ar_query_item[0])] = urldecode($ar_query_item[1]);
			}
		}

		# For overwrite default log table
		if (isset($ar_query['table'])) {
			$this->table = $ar_query['table'];
		}
		# owerwrite also fields if needed..
		
	}


	/**
	* LOG MESSAGES
	* 	LINE:
	*	MODULE  TIME  USER  IP  REFERRER  MESSAGE  SEVERITY_LEVEL  OPERATIONS 	
	*/
	public function log_message( $message, $log_level = logger::INFO, $module = NULL, $operations = NULL ) {

		if ( $log_level > $this->log_level ) {
			return;
		}

		# LINE VARS
			# Module
			if (isset($module)) {
			$module			= str_replace("\t", ' ', $module);
			$module 		= str_replace("\n", ' ', $module);
			}

			# Time. Asegurarse de haber establecido zona horaria en config
			# setlocale(LC_ALL,'es_ES'); date_default_timezone_set('Europe/Madrid');
			$time 			= strftime('%x %X', time());

			# User ID matrix
			$userID 		= 'no logged';
			if (isset($_SESSION['auth4']['userID_matrix']))
			$userID 		= $_SESSION['auth4']['userID_matrix'];		

			# IP (user source ip)
			$ip 			= 'unknow';
			if (isset($_SERVER['REMOTE_ADDR']))
			$ip 			= urldecode( $_SERVER["REMOTE_ADDR"] );

			# URL
			$url 			= 'unknow';
			if (isset($_SERVER['REQUEST_URI']))
			$url 			= urldecode( 'http://'.$_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI'] );	# 

			# Referrer
			$referrer 		= 'unknow';
			if (isset($_SERVER['HTTP_REFERER']))
			$referrer 		= $_SERVER['HTTP_REFERER'];

			# Message
			$message 		= str_replace("\t", ' ', $message);
			$message 		= str_replace("\n", ' ', $message);	

			# Level
			$str_log_level 	= logger::level_to_string($log_level);
				#dump($str_log_level,'$str_log_level en mysql');

			# Operations
			if (isset($operations)) {
			$operations 	= str_replace("\t", ' ', $operations);
			$operations 	= str_replace("\n", ' ', $operations);
			}
			

		$RecordObj_log = new RecordObj_log(NULL,$this->table);
		
		# Set and save vars into object
		$RecordObj_log->set_module($module);
		#$RecordObj_log->set_log_date("CURRENT_TIMESTAMP"); # set auto timestamp in db
		$RecordObj_log->set_userID($userID);
		$RecordObj_log->set_ip($ip);
		$RecordObj_log->set_url($url);
		$RecordObj_log->set_referrer($referrer);
		$RecordObj_log->set_message($message);
		$RecordObj_log->set_log_level($str_log_level);
		$RecordObj_log->set_operations($operations);
		
		$RecordObj_log->Save();
		
	}






}#end class 
?>