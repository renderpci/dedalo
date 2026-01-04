<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_model_test extends TestCase {



	public static $model		= 'component_relation_model';
	public static $tipo			= 'test169';
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
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$this->assertTrue(
				$component->get_data()===null,
				'expected null : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// add data
			$locator = json_decode('
				{
					"type":"dd98",
					"section_id":"1",
					"section_tipo":"dd922",
					"from_component_tipo":"test169"
				}
			');
			$data	= [$locator];
			$result	= $component->set_data($data);

			$this->assertTrue(
				locator::in_array_locator( $locator, $component->get_data() ),
				'expected array : ' . PHP_EOL
					. to_string($component->get_data())
			);

	}//end test_set_data



	/**
	* TEST_GET_AR_TARGET_SECTION_TIPO
	* @return void
	*/
	public function test_get_ar_target_section_tipo() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_target_section_tipo();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				$result===['dd922'],
				'expected result [dd922]: '
					. to_string($result)
			);
		}
	}//end test_get_ar_target_section_tipo



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



}//end class component_relation_model_test
