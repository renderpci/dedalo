<?php

/**
* A PHP session handler to keep session data within a PostgreSQL database
*
* @author 	Ben Albon <ben@albon.me.uk>
* @link		https://github.com/ben-albon/PHP-PostgreSQL-Session-Handler
* @author 	Originally by Manuel Reinhard <manu@sprain.ch>
* @link		https://github.com/sprain/PHP-MySQL-Session-Handler
* 
*/

class PostgreSQLSessionHandler implements SessionHandlerInterface{
	protected $dbConnection;
	
	public function __construct($dbHost, $dbUser, $dbPassword, $dbDatabase) {
		#$connectionString = 'dbname='.$dbDatabase.' host='.$dbHost.' user='.$dbUser.' password='.$dbPassword;
		$connectionString = 'pgsql:host='.DEDALO_HOSTNAME_CONN.' port='.DEDALO_DB_PORT_CONN.' dbname='.DEDALO_DATABASE_CONN.' user='.DEDALO_USERNAME_CONN.' password='.DEDALO_PASSWORD_CONN;
		$this->dbConnection = new PDO($connectionString);

		#$connectionString 	= 'host='.DEDALO_HOSTNAME_CONN.' port='.DEDALO_DB_PORT_CONN.' dbname='.DEDALO_DATABASE_CONN.' user='.DEDALO_USERNAME_CONN.' password='.DEDALO_PASSWORD_CONN;
		#$this->dbConnection = pg_pconnect($connectionString);
		#var_dump($this->dbConnection); #die();
	}

	/**
	* Open the session
	* @return bool
	*/
	public function open( $path, $name ) {
		#$sql = "INSERT INTO session (session_id, session_data) values (". $this->dbConnection->quote($id) . ", ". $this->dbConnection->quote($data) . ") ON DUPLICATE KEY UPDATE timestamp =" . $this->dbConnection->quote($data);
		#return $this->dbConnection->query($sql);
		return true;
	}
	
	/**
	* Close the session
	* @return bool
	*/
	public function close( ) {
		$sessionId = session_id();
		return true;
	}
	
	/**
	* Read the session
	* @param int session id
	* @return string string of the sessoin
	*/
	public function read( $id ) {
		$sql = "SELECT session_data FROM session where session_id =" . $this->dbConnection->quote($id);
		$result = $this->dbConnection->query($sql);
		$data = $result->fetchColumn();
		$result->closeCursor();
		return $data; 
	}
	
	/**
	* Write the session
	* @param int session id
	* @param string data of the session
	*/
	public function write( $id, $data ) {
		// Poor Man's UPSERT (this is pretty vulnerable to an obvious race condition)
		// UPDATE the session_data (if the session_id exists)
		$sqlUPDATE = "UPDATE session SET session_data =" . $this->dbConnection->quote($data) . " WHERE session_id=" . $this->dbConnection->quote($id);
		// INSERT the session (if the session_id does not exist)
		$sqlINSERT = "INSERT INTO session (session_id, session_data) SELECT ". $this->dbConnection->quote($id) . ", ". $this->dbConnection->quote($data) . " WHERE NOT EXISTS (SELECT 1 FROM session WHERE session_id=" . $this->dbConnection->quote($id) . ")";
		$this->dbConnection->query($sqlUPDATE);
		$this->dbConnection->query($sqlINSERT);
		return true;
	}
	
	/**
	* Destroy the session
	* @param int session id
	* @return bool
	*/
	public function destroy( $id ) {
		$sql = "DELETE FROM session WHERE session_id =" . $this->dbConnection->quote($id);
		#setcookie(session_name(), "", time() - 3600);
		setcookie(session_name(), "", time() - 3600, '/', DEDALO_HOST, TRUE, TRUE);

		return $this->dbConnection->query($sql);
	}
		
	/**
	* Garbage Collector
	* @param int life time (sec.)
	* @return bool
	* @see session.gc_divisor      100
	* @see session.gc_maxlifetime 1440
	* @see session.gc_probability    1
	* @usage execution rate 1/100
	*        (session.gc_probability/session.gc_divisor)
	*/
	public function gc( $lifetime ) {
		$sql = "DELETE FROM session WHERE timestamp < NOW() - INTERVAL '" . $lifetime . " second'";
		return $this->dbConnection->query($sql);
	}
}//class
