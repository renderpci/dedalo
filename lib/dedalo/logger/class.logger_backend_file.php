<?php
/**
* LOGGER BACKEND FILE CLASS
*/
require_once( DEDALO_LIB_BASE_PATH .'/logger/class.logger_backend.php' );

class logger_backend_file extends logger_backend  {

	private $log_level;
	private $h_log_file;
	

	public function __construct($url_data) {

		# ANULADO DE MOMENTO
		return null;
	
		parent::__construct($url_data);

		# Set log level (defined as constant in config file)
		$this->log_level = LOGGER_LEVEL ;

		$log_file_path = $url_data['path'];

		if ( !strlen($log_file_path) ) {
			throw new Exception("No log_file_path was specified in the connection string.", 1);			
		}

		#print "Loggin data to $log_file_path";	

		
		# Open handler to log file (ommiting php error messages)
		$this->h_log_file = @fopen($log_file_path, 'a+');

		if ( !is_resource($this->h_log_file) ) {
			if(SHOW_DEBUG)
			trigger_error("The especified log file $log_file_path could not be opened or created for writing. Check file permissions.");
		}
		
		
		# Set encoding to ISO-8859-1
		#stream_encoding($this->h_log_file, 'iso-8859-1');
	}

	/**
	* LOG MESSAGES
	* 	LINE:
	*	MODULE  TIME  USER  IP  REFERRER  MESSAGE  SEVERITY_LEVEL  OPERATIONS 	
	*/
	public function log_message( $message, $log_level=logger::INFO, $module=NULL, $operations=NULL, $datos=NULL ) {	#$message, $log_level=logger::INFO, $tipo_donde=NULL, $projects=NULL, $datos=NULL

		# ANULADO DE MOMENTO
		return null;
		

		if ( $log_level > $this->log_level ) {
			return;
		}

		if(SHOW_DEBUG) $start_time = start_time();

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
			if (isset($_SESSION['dedalo4']['auth']['user_id']))
			$userID 		= $_SESSION['dedalo4']['auth']['user_id'];		

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
			#$message 		= str_replace("\t", ' ', $message);
			#$message 		= str_replace("\n", ' ', $message);
			$message 		= strip_tags($message,'<pre>');
			$message 		= str_replace('<pre>', "\n<pre>", $message);

			# Level
			$str_log_level 	= logger::level_to_string($log_level);
				#dump($str_log_level,'$str_log_level en file');

			# Operations
			if (isset($operations)) {
			$operations 	= str_replace("\t", ' ', $operations);
			$operations 	= str_replace("\n", ' ', $operations);
			}
		

		# separados por tabulaciones, delimitados por nueva línea
		$separator 	= "\t";
		$return_char= "\n";
		$log_line 	= "[$time]" .$separator.  $module .$separator. $message .$separator. $userID .$separator. $url .$separator. $referrer .$separator. $str_log_level .$separator. $operations .$return_char;
		
		#try {
			if (is_resource($this->h_log_file)) {
				@fwrite($this->h_log_file, $log_line);
			}			
		#} catch (Exception $e) {
		#	throw new Exception("Error Processing Request $e", 1);
		#}
		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $log_line);
		}
	}




}#end class logger_backend

?>