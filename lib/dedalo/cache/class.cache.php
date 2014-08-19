<?php
/*
* CLASS CACHE
*/


class cache {


	static $instance;


	# CONSTRUCT
	function __construct() {

		$this->setup();

		switch (DEDALO_CACHE_MANAGER) {
			case 'redis':
				cache::$instance = $this->init_predis();
				break;			
			default:
				throw new Exception("Error Processing Request. Bad cache manager selected", 1);
		}
		#return (cache::$instance);
	}

	protected function setup() {

		define('CACHE_COMPONENTS'		, false);
		define('CACHE_SECTIONS'			, false);
		define('CACHE_FILTER'			, true);
		define('CACHE_TOOLS'			, false);
		define('CACHE_BUTTONS'			, false);
		define('CACHE_LABELS'			, false);
		define('CACHE_AR_ID_RECORDS'	, false);
	}
	
	
	# SET
	public static function set( $key, $value ) {

		switch (DEDALO_CACHE_MANAGER) {
			case 'redis':
				cache::$instance->set($key, $value);
				#exec("/usr/local/bin/redis-cli set '$key' '$value' ");
				break;
		}
	}


	# GET
	public static function get( $key ) {

		switch (DEDALO_CACHE_MANAGER) {
			case 'redis':
				#dump(cache::$instance->get($key),'cache::$instance->get($key)');
				return cache::$instance->get($key);	
				
				#exec("/usr/local/bin/redis-cli get $key", $output);
				#dump($output,'$output');
				#return $output[0];		
				break;
		}
	}


	# EXISTS
	public static function exists( $key ) {

		switch (DEDALO_CACHE_MANAGER) {
			case 'redis':
				return cache::$instance->exists($key);				
				break;
		}
	}


	# DEL
	public static function del( $key ) {

		switch (DEDALO_CACHE_MANAGER) {
			case 'redis':
				return cache::$instance->del($key);
				break;
		}
	}


	# DEL_CONTAINS
	public static function del_contains( $range ) {

		switch (DEDALO_CACHE_MANAGER) {
			case 'redis':
				$command = "redis-cli --raw keys *".$range."* | xargs redis-cli del";
				exec($command, $output);					
				if(SHOW_DEBUG) {
					if(empty($output[0])) {
						#dump($output,"output for command: $command");
						trigger_error("WARNING CACHE: output for command: '$command' IS empty");
					}
				}
				break;
		}
	}











	# INIT PREDIS
	protected function init_predis() {

		$single_server = array(
		    'host'     => '127.0.0.1',
		    'port'     => 6379,
		    'database' => DEDALO_CACHE_MANAGER_DB
		);

		$multiple_servers = array(
		    array(
		       'host'     => '127.0.0.1',
		       'port'     => 6379,
		       'database' => DEDALO_CACHE_MANAGER_DB,
		       'alias'    => 'first',
		    ),
		    array(
		       'host'     => '127.0.0.1',
		       'port'     => 6380,
		       'database' => DEDALO_CACHE_MANAGER_DB,
		       'alias'    => 'second',
		    ),
		);

		$single_socket_server = array(		   
		    'path'     => '/tmp/redis.sock',
		    'database' => DEDALO_CACHE_MANAGER_DB
		);

		require_once( DEDALO_ROOT . '/lib/predis/autoload.php' );
		
		# Init instance
		return new Predis\Client($single_socket_server);	
		

		try{
			
		} catch (Exception $e) {
		    #echo 'Caught exception: ',  $e->getMessage(), "\n";
		}
	}


}
?>