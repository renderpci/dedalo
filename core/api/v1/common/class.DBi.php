<?php
/**
* DBI
* DB CONNECTION
* PUBLIC API MYSQL CONNECTIONS
*/
abstract class DBi {



	/**
	* _GETCONNECTION_MYSQL
	*/
	public static function _getConnection_mysql(
		$host=MYSQL_DEDALO_HOSTNAME_CONN,
		$user=MYSQL_DEDALO_USERNAME_CONN,
		$password=MYSQL_DEDALO_PASSWORD_CONN,
		$database=MYSQL_DEDALO_DATABASE_CONN,
		$port=MYSQL_DEDALO_DB_PORT_CONN,
		$socket=MYSQL_DEDALO_SOCKET_CONN) {

		static $mysqli;

		if(isset($mysqli)) {
			return($mysqli);
		}

				/*
				$mysqli = new mysqli($host, $user, $password, $database, $port);
				if ($mysqli->connect_errno) {
				    echo "Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error;
				    die();
				}
				#echo $mysqli->host_info . "\n";

				return $mysqli;
				*/

		# Oculta el mensaje 'MySQL extension is deprecated & will be removed in the future of PHP' cuando se usa con PHP >=5
		# error_reporting(E_ERROR | E_PARSE);

		# INIT
		$mysqli = mysqli_init();

		if (!$mysqli) {
			#die('Dedalo '.__METHOD__ . ' Failed mysqli_init');
			throw new Exception(' Dedalo '.__METHOD__ . ' Failed mysqli_init ', 1);
		}

		#$mysqli->options(MYSQLI_OPT_INT_AND_FLOAT_NATIVE, 1);

		# AUTOCOMMIT : SET AUTOCOMMIT (Needed for InnoDB save)
		if (!$mysqli->options(MYSQLI_INIT_COMMAND, 'SET AUTOCOMMIT = 1')) {
			#die('Dedalo '.'Setting MYSQLI_INIT_COMMAND failed');
			throw new Exception(' Connect Error. Setting MYSQLI_INIT_COMMAND failed ', 1);
		}

		# TIMEOUT : SET CONNECT_TIMEOUT
		if (!$mysqli->options(MYSQLI_OPT_CONNECT_TIMEOUT, 10)) {
			#die('Dedalo '.'Setting MYSQLI_OPT_CONNECT_TIMEOUT failed');
			throw new Exception(' Connect Error. Setting MYSQLI_OPT_CONNECT_TIMEOUT failed ', 1);
		}

		# CONNECT
		if (!$mysqli->real_connect($host, $user, $password, $database,  $port, $socket)) {
			throw new Exception(' Connect Error on mysqli->real_connect '.mysqli_connect_errno().' - '.mysqli_connect_error(), 1);
			#die( wrap_pre('Dedalo '.'Connect Error (' . mysqli_connect_errno() . ') ' . mysqli_connect_error()) );
		}

		#echo 'Success... ' . $mysqli->host_info . "\n";

		# UTF8 : Change character set to utf8
		if (!$mysqli->set_charset("utf8")) {
			printf("Error loading character set utf8: %s\n", $mysqli->error);
		}


		return $mysqli;
	}//end _getConnection_mysql



}
