<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class login_test extends TestCase {



	protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
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
	* TEST_LOGIN
	* @return void
	*/
	public function test_login(): void {

		$user_id = TEST_USER_ID; //Defined in bootstrap

		if (isset($_SESSION['dedalo']['auth'])) {

			// already logged case

			login_Test::logout($user_id);
			$this->assertTrue( !isset($_SESSION['dedalo']['auth']) );

			// restore login status
			login_Test::force_login($user_id);

		}else{

			// not logged case

			login_Test::force_login($user_id);
			$this->assertFalse( $_SESSION['dedalo']['auth']===null );


			// restore login status
			login_Test::logout($user_id);
		}
	}//end test_login



	/**
	* test_re_login
	* @return void
	*/
		// public function test_re_login() {

		// 	self::force_login(DEDALO_SUPERUSER);

		// 	$this->assertTrue(
		// 		login::is_logged()===true ,
		// 		'expected login true'
		// 	);
		// }//end test_re_login



}//end class
