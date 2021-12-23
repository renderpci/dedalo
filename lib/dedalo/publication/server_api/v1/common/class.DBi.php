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

		# INIT
		$mysqli = mysqli_init();

		if (!$mysqli) {
			throw new Exception(' Dedalo '.__METHOD__ . ' Failed mysqli_init ', 1);
		}

		# AUTOCOMMIT : SET AUTOCOMMIT (Needed for InnoDB save)
		if (!$mysqli->options(MYSQLI_INIT_COMMAND, 'SET AUTOCOMMIT = 1')) {
			throw new Exception(' Connect Error. Setting MYSQLI_INIT_COMMAND failed ', 1);
		}

		# TIMEOUT : SET CONNECT_TIMEOUT
		if (!$mysqli->options(MYSQLI_OPT_CONNECT_TIMEOUT, 10)) {
			throw new Exception(' Connect Error. Setting MYSQLI_OPT_CONNECT_TIMEOUT failed ', 1);
		}

		# CONNECT
		if (!$mysqli->real_connect($host, $user, $password, $database, $port, $socket)) {
			throw new Exception(' Connect Error on mysqli->real_connect '.mysqli_connect_errno().' - '.mysqli_connect_error(), 1);
		}

		# UTF8 : Change character set to utf8
		if (!$mysqli->set_charset("utf8")) {
			printf("Error loading character set utf8: %s\n", $mysqli->error);
		}


		return $mysqli;
	}//end _getConnection_mysql



}//end DBi class