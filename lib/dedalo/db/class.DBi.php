<?php
#require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

# DB CONNECTION USING MYSQLI ######################

abstract class DBi {

	
	public static function _getConnection(
		$host=DEDALO_HOSTNAME_CONN,
		$user=DEDALO_USERNAME_CONN,
		$password=DEDALO_PASSWORD_CONN,
		$database=DEDALO_DATABASE_CONN,
		$port=DEDALO_DB_PORT_CONN,
		$socket=DEDALO_SOCKET_CONN) {
		
		static $mysqli;

		if(isset($mysqli)) {
			return($mysqli);
		}
		
		
		# INIT
		$mysqli = mysqli_init();
		
		if (!$mysqli) {
			die('Dedalo '.__METHOD__ . ' Failed mysqli_init');
		}

		#$mysqli->options(MYSQLI_OPT_INT_AND_FLOAT_NATIVE, 1);
		
		# AUTOCOMMIT : SET AUTOCOMMIT (Needed for InnoDB save)
		if (!$mysqli->options(MYSQLI_INIT_COMMAND, 'SET AUTOCOMMIT = 1')) {
			die('Dedalo '.'Setting MYSQLI_INIT_COMMAND failed');
		}
		
		# TIMEOUT : SET CONNECT_TIMEOUT
		if (!$mysqli->options(MYSQLI_OPT_CONNECT_TIMEOUT, 10)) {
			die('Dedalo '.'Setting MYSQLI_OPT_CONNECT_TIMEOUT failed');
		}
		
		# CONNECT
		if (!$mysqli->real_connect($host, $user, $password, $database,  $port, $socket)) {
			die( wrap_pre('Dedalo '.'Connect Error (' . mysqli_connect_errno() . ') '
					. mysqli_connect_error())
					);
		}
		
		#echo 'Success... ' . $mysqli->host_info . "\n";
		
		# UTF8 : Change character set to utf8 
		if (!$mysqli->set_charset("utf8")) {
			printf("Error loading character set utf8: %s\n", $mysqli->error);
		}

		#dump($mysqli);
				
		return $mysqli;
	}


}
?>