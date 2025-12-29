<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_select_test extends TestCase {



	public static $model		= 'component_select';
	public static $tipo			= 'test91';
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
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$data	= [];
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$check_data = $component->get_data();
		$this->assertTrue(
			$check_data===null,
			'expected [] : ' . PHP_EOL
				. to_string($check_data)
		);

		// null case
			$result	= $component->set_data(null);
			$check_data = $component->get_data();
			$this->assertTrue(
				$check_data===null,
				'expected null : ' . PHP_EOL
					. to_string($check_data)
			);

		// restore dato
			$result	= $component->set_data($old_data);
			$check_data = $component->get_data();
			$this->assertTrue(
				json_encode($check_data)===json_encode($old_data),
				'expected old dato : ' . PHP_EOL
					. to_string($check_data)
			);
	}//end test_set_data



	/**
	* TEST_GET_SORTABLE
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$value = $component->get_sortable();

		$this->assertTrue(
			$value===true,
			'expected true : ' .PHP_EOL
				. to_string($value)
		);
	}//end test_get_sortable



	/**
	* TEST_SAVE
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();
	
		// empty case
		$data = [];
		$component->set_data($data);
		$result = $component->save();
		// check result
		$this->assertTrue(
			$result===true,
			'expected boolean true ' . PHP_EOL
				. to_string($result)
		);
		// null case
		$check_data = $component->get_data();
		$this->assertTrue(
			$check_data===null,
			'expected null : ' . PHP_EOL
				. to_string($check_data)
		);
		// data case
		$data = new locator();
			$data->set_section_tipo("dd64");
			$data->set_section_id("1");
			$data->set_id(1);

			// set data
			$component->set_data([$data]);
			$result = $component->save();
			// check result
			$check_data = $component->get_data();
			$this->assertTrue(
				$check_data===[$data],
				'expected [object] : ' . PHP_EOL
					. to_string($check_data)
			);
	}//end test_save


}//end class component_select_test
