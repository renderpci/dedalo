<?php
/**
* DBI
* DB CONNECTION
* To close connection, use pg_close(DBi::_getConnection()); at end of page
*/
abstract class DBi {



	/**
	* _GETCONNECTION
	* @return resource|object $pg_conn (object in PHP >=8.1)
	*/
	public static function _getConnection(
		$host=DEDALO_HOSTNAME_CONN,
		$user=DEDALO_USERNAME_CONN,
		$password=DEDALO_PASSWORD_CONN,
		$database=DEDALO_DATABASE_CONN,
		$port=DEDALO_DB_PORT_CONN,
		$socket=DEDALO_SOCKET_CONN) {

		static $pg_conn;

		if(isset($pg_conn)) {
			return($pg_conn);
		}

		# basic str_connect with mandatory vars
		$str_connect = "dbname=$database user=$user password=$password";

		# Port is optional
		if($port!==false) {
			$str_connect = "port=$port ".$str_connect;
		}

		# Host is optional. When false, use default sockect connection
		if($host!==false) {
			$str_connect = "host=$host ".$str_connect;
		}

		// Connecting, selecting database
		$pg_conn = pg_connect($str_connect);
		if($pg_conn===false) {
			throw new Exception("Error. Could not connect to database (52)", 1);
		}

		return $pg_conn;
	}//end _getConnection



	/**
	* _GETNEWCONNECTION
	* Get a new postgresql database connection without rehuse existing connections
	* @return resource|object $pg_conn (object in PHP >=8.1)
	*/
	public static function _getNewConnection(
		$host=DEDALO_HOSTNAME_CONN,
		$user=DEDALO_USERNAME_CONN,
		$password=DEDALO_PASSWORD_CONN,
		$database=DEDALO_DATABASE_CONN,
		$port=DEDALO_DB_PORT_CONN,
		$socket=DEDALO_SOCKET_CONN) {

		# basic str_connect with mandatory vars
		$str_connect = "dbname=$database user=$user password=$password";

		# Port is optional
		if($port!==false) {
			$str_connect = "port=$port ".$str_connect;
		}

		# Host is optional. When false, use default sockect connection
		if($host!==false) {
			$str_connect = "host=$host ".$str_connect;
		}

		// Connecting, selecting database
		$pg_conn = pg_connect($str_connect);
		if($pg_conn===false) {
			// throw new Exception("Error. Could not connect to database (52-2)", 1);
			debug_log(__METHOD__." Error. Could not connect to database (52-2) ".to_string(), logger::ERROR);
		}

		return $pg_conn;
	}//end _getNewConnection



	/**
	* _GETCONNECTION_MYSQL
	* @return resource $mysqli
	*/
	public static function _getConnection_mysql(
		$host=MYSQL_DEDALO_HOSTNAME_CONN,
		$user=MYSQL_DEDALO_USERNAME_CONN,
		$password=MYSQL_DEDALO_PASSWORD_CONN,
		$database=MYSQL_DEDALO_DATABASE_CONN,
		$port=MYSQL_DEDALO_DB_PORT_CONN,
		$socket=MYSQL_DEDALO_SOCKET_CONN) : object {

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

		// You should enable error reporting for mysqli before attempting to make a connection
			mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

		// INIT
			// $mysqli = mysqli_init();
			$mysqli = new mysqli($host, $user, $password, $database, $port);

			if ($mysqli===false) {
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

		# UTF8 : Change character set to utf8mb4
		if (!$mysqli->set_charset("utf8mb4")) {
			printf("Error loading character set utf8mb4: %s\n", $mysqli->error);
		}


		return $mysqli;
	}//end _getConnection_mysql



}//end class DBi
