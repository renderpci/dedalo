<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class DBi_test extends TestCase {



	protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



	/**
	* TEST_getConnection
	* @return void
	*/
	public function test_getConnection(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// default vars
			$conn = DBi::_getConnection();
			// dump($conn, ' conn 1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='object';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$class	= get_class($conn);
			$eq		= $class==='PgSql\Connection';
			$this->assertTrue(
				$eq,
				'expected true (class===PgSql\Connection) and received class: ' .$class
			);

		// explicit vars
			$conn = DBi::_getConnection(
				DEDALO_HOSTNAME_CONN,
				DEDALO_USERNAME_CONN,
				DEDALO_PASSWORD_CONN,
				DEDALO_DATABASE_CONN,
				DEDALO_DB_PORT_CONN,
				DEDALO_SOCKET_CONN,
				true
			);
			// dump($conn, ' conn 2 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='object';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$class	= get_class($conn);
			$eq		= $class==='PgSql\Connection';
			$this->assertTrue(
				$eq,
				'expected true (class===PgSql\Connection) and received class: ' .$class
			);

		// explicit vars without cache
			$conn = DBi::_getConnection(
				DEDALO_HOSTNAME_CONN,
				DEDALO_USERNAME_CONN,
				DEDALO_PASSWORD_CONN,
				DEDALO_DATABASE_CONN,
				DEDALO_DB_PORT_CONN,
				DEDALO_SOCKET_CONN,
				false
			);
			// dump($conn, ' conn 3 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='object';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$class	= get_class($conn);
			$eq		= $class==='PgSql\Connection';
			$this->assertTrue(
				$eq,
				'expected true (class===PgSql\Connection) and received class: ' .$class
			);

		// explicit vars invalid port and socket
			$conn = DBi::_getConnection(
				DEDALO_HOSTNAME_CONN,
				DEDALO_USERNAME_CONN,
				DEDALO_PASSWORD_CONN,
				DEDALO_DATABASE_CONN,
				'patata_port', // port
				'patata_socket',
				false
			);
			// dump($conn, ' conn 4 ++ '.to_string());

			$this->assertTrue(
				!empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running with errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='boolean';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$eq		= $conn===false;
			$this->assertTrue(
				$eq,
				'expected false (conn) and received conn: ' . json_encode($conn)
			);
	}//end test_getConnection



	/**
	* TEST_getNewConnection
	* @return void
	*/
	public function test_getNewConnection(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// default vars
			$conn = DBi::_getNewConnection();
			// dump($conn, ' conn 1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='object';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$class	= get_class($conn);
			$eq		= $class==='PgSql\Connection';
			$this->assertTrue(
				$eq,
				'expected true (class===PgSql\Connection) and received class: ' .$class
			);

		// explicit vars
			$conn = DBi::_getNewConnection(
				DEDALO_HOSTNAME_CONN,
				DEDALO_USERNAME_CONN,
				DEDALO_PASSWORD_CONN,
				DEDALO_DATABASE_CONN,
				DEDALO_DB_PORT_CONN,
				DEDALO_SOCKET_CONN,
				false
			);
			// dump($conn, ' conn 2 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='object';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$class	= get_class($conn);
			$eq		= $class==='PgSql\Connection';
			$this->assertTrue(
				$eq,
				'expected true (class===PgSql\Connection) and received class: ' .$class
			);
	}//end test_getNewConnection



	/**
	* TEST_getConnectionPDO
	* @return void
	*/
	public function test_getConnectionPDO(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// default vars
			$conn = DBi::_getConnectionPDO();
			// dump($conn, ' conn mysql 1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='object';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$class	= get_class($conn);
			$eq		= $class==='PDO';
			$this->assertTrue(
				$eq,
				'expected true (class===PDO) and received class: ' .$class
			);
	}//end test_getConnectionPDO



	/**
	* TEST_getConnection_mysql
	* @return void
	*/
	public function test_getConnection_mysql(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// default vars
			$conn = DBi::_getConnection_mysql();
			// dump($conn, ' conn mysql 1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($conn);
			$eq		= $type==='object';
			$this->assertTrue(
				$eq,
				'expected true (class===object) and received type: ' .$type
			);

			$class	= get_class($conn);
			$eq		= $class==='mysqli';
			$this->assertTrue(
				$eq,
				'expected true (class===mysqli) and received class: ' .$class
			);
	}//end test_getConnection_mysql



}//end class
