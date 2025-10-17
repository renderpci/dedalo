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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset
			$conn = DBi::_getConnection(
				'patata_host',
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
				'expected type boolean and received type: ' .$type
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
	} //end test_getConnection_mysql



	/**
	 * TEST_check_table_exists
	 * @return void
	 */
	public function test_check_table_exists(): void
	{

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$table = 'matrix';

		$result = DBi::check_table_exists(
			$table
		);
		// dump($result, ' result 1 ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (class===boolean) and received type: ' . $type
		);

		$eq		= $result === true;
		$this->assertTrue(
			$eq,
			'expected true (result===true) and received: ' . print_r($result, true)
		);

		$result = DBi::check_table_exists(
			'non-existent_table'
		);

		$eq		= $result === false;
		$this->assertTrue(
			$eq,
			'expected true (result===true) and received: ' . print_r($result, true)
		);
	} //end test_check_table_exists



	/**
	 * TEST_check_column_exists
	 * @return void
	 */
	public function test_check_column_exists(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		
		$table = 'matrix_test';
		$column = 'section_tipo';

		$result = DBi::check_column_exists(
			$table,
			$column
		);
		// dump($result, ' result 1 ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='boolean';
		$this->assertTrue(
		$eq,
		'expected true (class===boolean) and received type: ' .$type
		);
	
		$eq		= $result===true;
		$this->assertTrue(
			$eq,
			'expected true (result===true) and received: ' . print_r($result, true)
		);

		$result = DBi::check_column_exists(
			$table,
			'non-existent_column'
		);

		$eq		= $result === false;
		$this->assertTrue(
			$eq,
			'expected true (result===true) and received: ' . print_r($result, true)
		);
	} //end test_check_column_exists



	/**
	 * TEST_add_column
	 * @return void
	 */
	public function test_add_column(): void
	{

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$table = 'matrix_test';
		$column = 'test_column';

		$result = DBi::add_column(
			$table,
			$column
		);
		// dump($result, ' result 1 ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (class===boolean) and received type: ' . $type
		);

		$eq		= $result === true;
		$this->assertTrue(
			$eq,
			'expected true (result===true) and received: ' . print_r($result, true)
		);

		$result = DBi::add_column(
			'non-existent_table',
			$column
		);

		$eq		= $result === false;
		$this->assertTrue(
			$eq,
			'expected true (result===true) and received: ' . print_r($result, true)
		);		
	} //end test_add_column



	/**
	 * TEST_remove_column
	 * @return void
	 */
	public function test_remove_column(): void
	{

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$table = 'matrix_test';
		$column = 'test_column';

		// $exists_result = DBi::check_column_exists(
		// 	$table,
		// 	$column
		// );
		// dump($exists_result, 'exists result');

		$result = DBi::remove_column(
			$table,
			$column
		);
		// dump($result, ' result 1 ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . $_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type === 'boolean';
		$this->assertTrue(
			$eq,
			'expected true (class===boolean) and received type: ' . $type
		);

		$eq		= $result === true;
		$this->assertTrue(
			$eq,
			'expected true (result===true) and received: ' . json_encode($result)
		);

		// Check if the column exists. If it does NOT exist, the goal is achieved, return true.
		$result = DBi::remove_column(
			$table,
			$column
		);
	
		$eq		= $result === true;
		$this->assertTrue(
			$eq,
			"expected true (result===true) and received: ($table.$column) " . json_encode($result)
		);

		// Check if the column exists. If it does NOT exist, the goal is achieved, return true.
		$result = DBi::remove_column(
			'bad_table_name',
			'bad_column_name'
		);

		$eq		= $result === true;
		$this->assertTrue(
			$eq,
			"expected true (result===true) and received: ($table.$column) " . json_encode($result)
		);
	} //end test_remove_column




}//end class
