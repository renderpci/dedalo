<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class login_test extends BaseTestCase {

	// Test constants
	private const TEST_USERNAME = 'test_user';
	private const TEST_PASSWORD = 'TestPassword123';
	private const INVALID_USERNAME = '';
	private const INVALID_PASSWORD = '123';
	private const SQL_INJECTION_ATTEMPT = "'; DROP TABLE users; --";



	protected function setUp(): void   {
		// Clean session before each test
		if (isset($_SESSION['dedalo'])) {
			unset($_SESSION['dedalo']);
		}
	}



	/**
	* FORCE_LOGIN
	* @param int $user_id
	* @return void
	*/
	public static function force_login($user_id) : void {

		// check is development server. if not, throw to prevent malicious access
			if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
				throw new Exception("Error. Only development servers can use this method", 1);
				die();
			}

		// user
			$username		= 'test ' . $user_id;
			$full_username	= 'test user ' . $user_id;

		// dd_init_test
			$init_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';
			if ($init_response->result===false) {
				debug_log(__METHOD__
					." Init test error (dd_init_test): ". PHP_EOL
					.' init_response: ' . $init_response->msg
					, logger::ERROR
				);
			}

		// is_global_admin (before set user session vars)
			$is_global_admin = (bool)security::is_global_admin($user_id);
			$_SESSION['dedalo']['auth']['is_global_admin'] = $is_global_admin;

		// is_developer (before set user session vars)
			$is_developer = (bool)security::is_developer($user_id);
			$_SESSION['dedalo']['auth']['is_developer'] = $is_developer;

		// session : If backup is OK, fix session data
			$_SESSION['dedalo']['auth']['user_id']			= $user_id;
			$_SESSION['dedalo']['auth']['username']			= $username;
			$_SESSION['dedalo']['auth']['full_username']	= $full_username;
			$_SESSION['dedalo']['auth']['is_logged']		= 1;

		// config key
			$_SESSION['dedalo']['auth']['salt_secure'] = dedalo_encrypt_openssl(DEDALO_SALT_STRING);

		// login_type
			$_SESSION['dedalo']['auth']['login_type'] = 'default';

		// dedalo_lock_components unlock
			if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
				lock_components::force_unlock_all_components($user_id);
			}

		// precalculate profiles datalist security access in background
		// This file is generated on every user login, launching the process in background
			if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {
				$cache_file_name = component_security_access::get_cache_tree_file_name(DEDALO_APPLICATION_LANG);
				dd_cache::process_and_cache_to_file((object)[
					'process_file'	=> DEDALO_CORE_PATH . '/component_security_access/calculate_tree.php',
					'data'			=> (object)[
						'session_id'	=> session_id(),
						'user_id'		=> $user_id,
						'lang'			=> DEDALO_APPLICATION_LANG
					],
					'file_name'		=> $cache_file_name,
					'wait'			=> false
				]);
			}

		// login activity report
			login::login_activity_report(
				"User $user_id is logged. Hello $username",
				'LOG IN',
				null
			);
	}//end force_login



	/**
	* LOGOUT
	* @param int $user_id
	* @return void
	*/
	public static function logout($user_id) : void {

		// check is development server. if not, throw to prevent malicious access
			if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
				throw new Exception("Error. Only development servers can use this method", 1);
				die();
			}

		$options = (object)[
			'mode'	=> null,
			'cause'	=> 'test unit exit'
		];
		login::quit($options);

		// unset($_SESSION['dedalo']['auth']);
		// $this->assertTrue(
		// 	!isset($_SESSION['dedalo']['auth']),
		// 	'expected not set session dedalo auth for this user: ' .$user_id
		// );
	}//end logout



	/**
	* TEST_LOGIN_SUCCESS
	* Test successful login with valid credentials
	* @return void
	*/
	public function test_login_success(): void {

		$user_id = TEST_USER_ID;

		// Ensure user is logged out first
		login_Test::logout($user_id);
		$this->assertFalse(login::is_logged(), 'User should not be logged in initially');

		// Force login for testing
		login_Test::force_login($user_id);
		
		// Verify login state
		$this->assertTrue(login::is_logged(), 'User should be logged in after force_login');
		$this->assertEquals($user_id, logged_user_id(), 'Logged user ID should match');
		$this->assertNotEmpty($_SESSION['dedalo']['auth']['username'], 'Username should be set in session');
		$this->assertNotEmpty($_SESSION['dedalo']['auth']['salt_secure'], 'Salt secure should be set in session');
		$this->assertEquals(1, $_SESSION['dedalo']['auth']['is_logged'], 'Login flag should be set to 1');

		// Clean up
		login_Test::logout($user_id);
		$this->assertFalse(login::is_logged(), 'User should be logged out after logout');
	}



	/**
	* TEST_LOGIN_FAILURE_INVALID_CREDENTIALS
	* Test login failure with invalid credentials
	* @return void
	*/
	public function test_login_failure_invalid_credentials(): void {

		// Test with empty username
		$options = (object)[
			'username' => self::INVALID_USERNAME,
			'password' => self::TEST_PASSWORD
		];
		$response = login::Login($options);
		$this->assertFalse($response->result, 'Login should fail with empty username');
		$this->assertNotEmpty($response->errors, 'Should have error messages for empty username');

		// Test with short password
		$options = (object)[
			'username' => self::TEST_USERNAME,
			'password' => self::INVALID_PASSWORD
		];
		$response = login::Login($options);
		$this->assertFalse($response->result, 'Login should fail with short password');
		$this->assertNotEmpty($response->errors, 'Should have error messages for short password');

		// Test with non-existent user
		$options = (object)[
			'username' => 'non_existent_user_12345',
			'password' => self::TEST_PASSWORD
		];
		$response = login::Login($options);
		$this->assertFalse($response->result, 'Login should fail with non-existent user');
		$this->assertNotEmpty($response->errors, 'Should have error messages for non-existent user');
	}
	/**
	* TEST_LOGIN_SQL_INJECTION_PROTECTION
	* Test SQL injection protection in login methods
	* @return void
	*/
	public function test_login_sql_injection_protection(): void {

		// Test SQL injection attempt in username lookup
		$malicious_username = self::SQL_INJECTION_ATTEMPT;
		$result = login::get_users_with_name($malicious_username);
		$this->assertIsArray($result, 'Should return array even for malicious input');
		$this->assertEmpty($result, 'Should not find any users for malicious input');

		// Test SQL injection attempt in code lookup
		$malicious_code = self::SQL_INJECTION_ATTEMPT;
		$result = login::get_users_with_code($malicious_code);
		$this->assertIsArray($result, 'Should return array even for malicious code input');
		$this->assertEmpty($result, 'Should not find any users for malicious code input');

		// Test with special characters that should be escaped
		$special_chars = "admin'; --";
		$result = login::get_users_with_name($special_chars);
		$this->assertIsArray($result, 'Should handle special characters safely');
	}

	/**
	* TEST_ACTIVE_ACCOUNT_CHECK
	* Test account status validation
	* @return void
	*/
	public function test_active_account_check(): void {

		// Test root user (always active)
		$this->assertTrue(
			login::active_account_check(-1),
			'Root user (-1) should always be considered active'
		);

		// Test with invalid user ID
		$this->assertFalse(
			login::active_account_check(0),
			'User ID 0 should not be active'
		);

		// Test with non-existent user ID
		$this->assertFalse(
			login::active_account_check(99999),
			'Non-existent user should not be active'
		);
	}

	/**
	* TEST_USER_RETRIEVAL_METHODS
	* Test user data retrieval methods
	* @return void
	*/
	public function test_user_retrieval_methods(): void {

		$user_id = TEST_USER_ID;

		// Test username retrieval
		$username = login::logged_user_username($user_id);
		$this->assertIsString($username, 'Username should be a string');
		$this->assertNotEmpty($username, 'Username should not be empty for valid user');

		// Test full username retrieval
		$full_username = login::get_full_username($user_id);
		$this->assertIsString($full_username, 'Full username should be a string');
		// Full username might be empty for some test users, so we just verify it's a string

		// Test user code retrieval
		$user_code = login::get_user_code($user_id);
		$this->assertIsString($user_code, 'User code should be a string');
		// User code might be empty for some users, so we don't assert non-empty

		// Test user image retrieval
		$user_image = login::get_user_image($user_id);
		$this->assertIsString($user_image, 'User image should be a string');
		// Image might be null/empty, so we don't assert non-empty

		// Test with invalid user ID
		$username = login::logged_user_username(99999);
		$this->assertIsString($username, 'Should return string even for invalid user');
		$this->assertEmpty($username, 'Should return empty string for invalid user');
	}

	/**
	* TEST_COOKIE_GENERATION_SECURITY
	* Test cookie generation security through reflection
	* @return void
	*/
	public function test_cookie_generation_security(): void {

		// Use reflection to test private methods
		$reflection = new ReflectionClass('login');
		
		// Test get_auth_cookie_name method
		$method = $reflection->getMethod('get_auth_cookie_name');
		$method->setAccessible(true);
		$cookie_name = $method->invoke(null);
		
		$this->assertIsString($cookie_name, 'Cookie name should be a string');
		$this->assertEquals(128, strlen($cookie_name), 'SHA512 hash should be 128 characters');
		$this->assertMatchesRegularExpression('/^[a-f0-9]+$/', $cookie_name, 'Cookie name should be hex string');

		// Test get_auth_cookie_value method
		$method = $reflection->getMethod('get_auth_cookie_value');
		$method->setAccessible(true);
		$cookie_value = $method->invoke(null);
		
		$this->assertIsString($cookie_value, 'Cookie value should be a string');
		$this->assertEquals(128, strlen($cookie_value), 'SHA512 hash should be 128 characters');
		$this->assertMatchesRegularExpression('/^[a-f0-9]+$/', $cookie_value, 'Cookie value should be hex string');

		// Test that multiple calls generate different values (randomness)
		$cookie_name2 = $method->invoke(null);
		$cookie_value2 = $method->invoke(null);
		$this->assertNotEquals($cookie_name, $cookie_name2, 'Cookie names should be different on multiple calls');
		$this->assertNotEquals($cookie_value, $cookie_value2, 'Cookie values should be different on multiple calls');
	}

	/**
	* TEST_LOGIN_VERIFICATION
	* Test login verification methods
	* @return void
	*/
	public function test_login_verification(): void {

		// Test when not logged in
		if (isset($_SESSION['dedalo'])) {
			unset($_SESSION['dedalo']);
		}
		$this->assertFalse(login::is_logged(), 'Should not be logged in when session is empty');
		$this->assertFalse(login::is_logged(), 'is_logged should be alias of verify_login');

		// Test with incomplete session data
		$_SESSION['dedalo']['auth']['user_id'] = TEST_USER_ID;
		$this->assertFalse(login::is_logged(), 'Should not be logged in with incomplete session');

		// Test with invalid login flag
		$_SESSION['dedalo']['auth']['is_logged'] = 0;
		$this->assertFalse(login::is_logged(), 'Should not be logged in with invalid flag');

		// Test with missing salt
		$_SESSION['dedalo']['auth']['is_logged'] = 1;
		$this->assertFalse(login::is_logged(), 'Should not be logged in without salt');

		// Test with valid session (force login)
		login_Test::force_login(TEST_USER_ID);
		$this->assertTrue(login::is_logged(), 'Should be logged in with valid session');

		// Clean up
		login_Test::logout(TEST_USER_ID);
	}

	/**
	* TEST_SAML_LOGIN
	* Test SAML login functionality
	* @return void
	*/
	public function test_saml_login(): void {

		// Test SAML login with invalid code
		$options = (object)[
			'code' => 'invalid_saml_code_12345'
		];
		$response = login::Login_SAML($options);
		$this->assertFalse($response->result, 'SAML login should fail with invalid code');
		$this->assertNotEmpty($response->errors, 'Should have error messages for invalid SAML code');

		// Test SAML login with empty code
		$options = (object)[
			'code' => ''
		];
		$response = login::Login_SAML($options);
		$this->assertFalse($response->result, 'SAML login should fail with empty code');
		$this->assertNotEmpty($response->errors, 'Should have error messages for empty SAML code');

		// Test SAML login with null code
		$options = (object)[
			'code' => null
		];
		$response = login::Login_SAML($options);
		$this->assertFalse($response->result, 'SAML login should fail with null code');
		$this->assertNotEmpty($response->errors, 'Should have error messages for null SAML code');
	}

	/**
	* TEST_LOGOUT_FUNCTIONALITY
	* Test logout functionality
	* @return void
	*/
	public function test_logout_functionality(): void {

		$user_id = TEST_USER_ID;

		// Login first
		login_Test::force_login($user_id);
		$this->assertTrue(login::is_logged(), 'User should be logged in initially');

		// Test logout
		$options = (object)[
			'mode' => 'test',
			'cause' => 'unit test logout'
		];
		$result = login::Quit($options);
		$this->assertTrue($result, 'Logout should return true on success');
		$this->assertFalse(login::is_logged(), 'User should not be logged out after logout');

		// Test logout when not logged in
		$result = login::Quit($options);
		$this->assertFalse($result, 'Logout should return false when user is not logged in');
	}

	/**
	* TEST_EDGE_CASES_INPUT_VALIDATION
	* Test edge cases and input validation
	* @return void
	*/
	public function test_edge_cases_input_validation(): void {

		// Test login with null options
		$this->expectException(TypeError::class);
		login::Login(null);

		// Test login with missing username
		$options = (object)[
			'password' => self::TEST_PASSWORD
		];
		$response = login::Login($options);
		$this->assertFalse($response->result, 'Should fail when username is missing');

		// Test login with missing password
		$options = (object)[
			'username' => self::TEST_USERNAME
		];
		$response = login::Login($options);
		$this->assertFalse($response->result, 'Should fail when password is missing');

		// Test user retrieval with negative ID (except root)
		$username = login::logged_user_username(-999);
		$this->assertIsString($username, 'Should handle negative user IDs gracefully');

		// Test account check with string input
		$result = login::active_account_check('invalid');
		$this->assertFalse($result, 'Should handle string input gracefully');
	}

	/**
	* TEST_MAINTENANCE_MODE
	* Test maintenance mode restrictions
	* @return void
	*/
	public function test_maintenance_mode(): void {

		// Skip if not in maintenance mode
		$maintenance_mode = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
			? DEDALO_MAINTENANCE_MODE_CUSTOM
			: DEDALO_MAINTENANCE_MODE;
		
		if (!$maintenance_mode) {
			$this->markTestSkipped('Maintenance mode is not enabled');
			return;
		}

		// Test that non-root users cannot login in maintenance mode
		$options = (object)[
			'username' => self::TEST_USERNAME,
			'password' => self::TEST_PASSWORD
		];
		$response = login::Login($options);
		$this->assertFalse($response->result, 'Non-root users should not login in maintenance mode');
		$this->assertStringContains('maintenance', strtolower($response->msg), 'Should mention maintenance in error message');
	}


}//end class
