<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_password_test extends TestCase {



	public static $model		= 'component_password';
	public static $tipo			= 'test152';
	public static $section_tipo	= 'test3';



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() {

		$component = $this->build_component_instance();

		$result	= $component->get_dato();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

		$component = $this->build_component_instance();

		// encrypted data
		$old_dato = $component->get_dato();

		$dato	= null;
		$result	= $component->set_dato($dato);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$this->assertTrue(
				$component->dato===null,
				'expected null : ' . PHP_EOL
					. to_string($component->dato)
			);

		// string case
			$dato = 'test58742Rtk$';
			$result	= $component->set_dato($dato);
			$this->assertTrue(
				$component->dato===[$dato],
				'expected array : ' . PHP_EOL
					. to_string($component->dato)
			);

		// array case
			$dato = ['test58742Rtk$'];
			$result	= $component->set_dato($dato);
			$this->assertTrue(
				$component->dato===$dato,
				'expected array : ' . PHP_EOL
					. to_string($component->dato)
			);

		// restore dato
			$old_dato_decoded = array_map(function($el){
				return dedalo_decrypt_openssl($el);
			}, $old_dato);
			$result = $component->set_dato($old_dato_decoded);

			$this->assertTrue(
				json_encode($component->dato)===json_encode($old_dato_decoded),
				'expected [] : ' . PHP_EOL
					. to_string($component->dato)
			);
	}//end test_set_dato



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result	= $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			json_encode($result->value)===json_encode(['***************']),
			'expected type object : ' . PHP_EOL
				. to_string($result->value)
		);
	}//end test_get_grid_value



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() {

		$component = $this->build_component_instance();

		$result	= $component->Save();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL',
			'expected type integer|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_Save



	/**
	* TEST_encrypt_password
	* @return void
	*/
	public function test_encrypt_password() {

		$value = 'Mjdld6$flsdo¿Wk';
		$result	= component_password::encrypt_password(
			$value
		);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$reverse = dedalo_decrypt_openssl($result);
		$this->assertTrue(
			$reverse===$value,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_encrypt_password



	/**
	* TEST_extract_component_value_fallback
	* @return void
	*/
	public function test_extract_component_value_fallback() {

		$component = $this->build_component_instance();

		$result	= component_password::extract_component_value_fallback(
			$component
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==='',
			'expected "" : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_extract_component_value_fallback




}//end class component_password_test
