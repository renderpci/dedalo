<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INFO_TEST
*/
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_info_test extends BaseTestCase {



	public static $model		= 'component_info';
	public static $tipo			= 'test212';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

		$this->user_login();

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
	* TEST_get_data
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
	* TEST_get_data_parsed
	* @return void
	*/
	public function test_get_data_parsed() {

		$component = $this->build_component_instance();

		$result	= $component->get_data_parsed();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data_parsed



	/**
	* TEST_get_db_data
	* @return void
	*/
	public function test_get_db_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_db_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_db_data



	/**
	* TEST_get_widgets
	* @return void
	*/
	public function test_get_widgets() {

		$component = $this->build_component_instance();

		$result	= $component->get_widgets();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_widgets



	/**
	* TEST_get_data_list
	* @return void
	*/
	public function test_get_data_list() {

		$component = $this->build_component_instance();

		$result = $component->get_data_list();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data_list



	/**
	* TEST_get_tools
	* @return void
	*/
	public function test_get_tools() {

		$component = $this->build_component_instance();

		$result = $component->get_tools();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===[],
			'expected [] : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_tools



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===false,
			'expected false : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$component = $this->build_component_instance();

		$result = $component->get_list_value();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_list_value



	/**
	* TEST_get_calculation_data
	* @return void
	*/
	public function test_get_calculation_data() {

		$component = $this->build_component_instance();

		$result = $component->get_calculation_data();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_calculation_data



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_grid_value



	/**
	* TEST_COMPONENT_INSTANCE_MODES
	* @return void
	*/
	public function test_component_instance_modes() {

		$modes = ['edit', 'list', 'search'];

		foreach ($modes as $current_mode) {

			$this->user_login();

			$component = component_common::get_instance(
				self::$model,
				self::$tipo,
				1,
				$current_mode,
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);

			$this->assertTrue(
				get_class($component)==='component_info',
				'expected class component_info : ' . PHP_EOL
					. get_class($component)
			);
			$this->assertTrue(
				$component->get_mode()===$current_mode,
				"expected mode {$current_mode} : " . PHP_EOL
					. $component->get_mode()
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_IS_EMPTY
	* Note: component_info data comes from widgets (use_db_data=false)
	* is_empty_data() checks array-level emptiness
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// is_empty_data: array-level check
		$result = $component->is_empty_data(
			$component->get_data()
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_is_empty



	/**
	* TEST_GET_IDENTIFIER
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			strlen($result) > 0,
			'expected non-empty string : ' . PHP_EOL
				. $result
		);
	}//end test_get_identifier



	/**
	* TEST_GET_DIFFUSION_VALUE
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_diffusion_value



	/**
	* TEST_USE_DB_DATA
	* component_info sets use_db_data = false
	* @return void
	*/
	public function test_use_db_data() {

		$component = $this->build_component_instance();

		$this->assertTrue(
			$component->use_db_data === false,
			'expected use_db_data === false : ' . PHP_EOL
				. to_string($component->use_db_data)
		);
	}//end test_use_db_data



	/**
	* TEST_SUPPORTS_TRANSLATION
	* component_info sets supports_translation = false (protected, check via get_translatable)
	* @return void
	*/
	public function test_supports_translation() {

		$component = $this->build_component_instance();

		// supports_translation is protected, use public getter
		$result = $component->get_translatable();

		$this->assertTrue(
			$result === false,
			'expected get_translatable() === false : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_supports_translation



}//end class component_info_test
