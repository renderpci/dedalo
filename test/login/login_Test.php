<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
		die();
	}



final class login_test extends TestCase {



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

		// is_global_admin (before set user session vars)
			$is_global_admin = (bool)security::is_global_admin($user_id);
			$_SESSION['dedalo']['auth']['is_global_admin'] = $is_global_admin;

		// is_developer (before set user session vars)
			$is_developer = (bool)login::is_developer($user_id);
			$_SESSION['dedalo']['auth']['is_developer'] = $is_developer;

		// session : If backup is ok, fix session data
			$_SESSION['dedalo']['auth']['user_id']			= $user_id;
			$_SESSION['dedalo']['auth']['username']			= $username;
			$_SESSION['dedalo']['auth']['full_username']	= $full_username;
			$_SESSION['dedalo']['auth']['is_logged']		= 1;

		// config key
			$_SESSION['dedalo']['auth']['salt_secure'] = dedalo_encrypt_openssl(DEDALO_SALT_STRING);

		// login_type
			$_SESSION['dedalo']['auth']['login_type'] = 'default';
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

		unset($_SESSION['dedalo']['auth']);
	}//end logout



	/**
	* TEST_LOGIN
	* @return void
	*/
	public function test_login(): void {

		if (isset($_SESSION['dedalo']['auth'])) {

			// already logged case

			login_Test::logout(DEDALO_SUPERUSER);
			$this->assertTrue( !isset($_SESSION['dedalo']['auth']) );

			// restore login status
			login_Test::force_login(DEDALO_SUPERUSER);

		}else{

			// not logged case

			login_Test::force_login(DEDALO_SUPERUSER);
			$this->assertFalse( $_SESSION['dedalo']['auth']===null );


			// restore login status
			login_Test::logout(DEDALO_SUPERUSER);
		}
	}//end test_login



}//end class