<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_portal_test extends TestCase {



	public static $model		= 'component_portal';
	public static $tipo			= 'test80';
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
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		$component = $this->build_component_instance();

		$value = $component->regenerate_component();

		$this->assertTrue(
			$value===true,
			'expected true is but received is: ' . to_string($value)
		);
	}//end test_regenerate_component



	/**
	* TEST_add_new_element
	* @return void
	*/
	public function test_add_new_element() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = $this->build_component_instance();

		$request_options = new stdClass();
			$request_options->target_section_tipo = $section_tipo;

		$value = $component->add_new_element($request_options);

		$this->assertTrue(
			!empty($value->added_locator),
			'expected value do not match (empty $value->added_locator): '
				. to_string($value->added_locator)
		);
	}//end test_add_new_element



	/**
	* TEST_remove_element
	* @return void
	*/
	public function test_remove_element() {

		$component = $this->build_component_instance();

		$request_options = new stdClass();
			$request_options->locator = null;

		$value = $component->remove_element($request_options);

		$this->assertTrue(
			$value->result===false,
			'expected result false for empty locator remove: '
				. to_string($value->result)
		);
		$this->assertTrue(
			strpos($value->msg, 'Error')===0,
			'expected result msg error for empty locator remove: '
				. to_string($value->msg)
		);
	}//end test_remove_element



	/**
	* TEST_get_current_section_filter_data
	* @return void
	*/
	public function test_get_current_section_filter_data() {

		$component = $this->build_component_instance();

		$value = $component->get_current_section_filter_data();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' .PHP_EOL
				. gettype($value)
		);
	}//end test_get_current_section_filter_data



	/**
	* TEST_update_dato_version
	* @return void
	*/
	public function test_update_dato_version() {

		$options = new stdClass();
			$options->update_version = [6,0,0];
			$options->dato_unchanged = null;

		$value = component_portal::update_dato_version($options);

		// expected sample
			//  {
			//     "result": 2,
			//     "msg": "[] Current dato don't need update.<br />"
			// }

		$this->assertTrue(
			gettype($value->result)==='integer',
				'expected value do not match:' . PHP_EOL
				.' expected: integer' . PHP_EOL
				.' value: '.gettype($value->result)
		);
		$this->assertTrue(
			$value->result===2,
				'expected value do not match:' . PHP_EOL
				.' expected: 2' . PHP_EOL
				.' value: '.to_string($value->result)
		);
	}//end test_update_dato_version



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$value = $component->get_valor();

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' .PHP_EOL
				. gettype($value)
		);
	}//end test_get_valor



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		$component = $this->build_component_instance();

		$value = $component->get_valor_export();

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' .PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value==='unavailable',
			'expected string unavailable: ' .PHP_EOL
				. $value
		);
	}//end test_get_valor_export



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$value = $component->get_diffusion_value();

		// expected value sample
		// '["1"]'

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' .PHP_EOL
				. gettype($value)
		);
	}//end test_get_diffusion_value



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$value = $component->get_sortable();

		// expected value sample
		// '["1"]'

		$this->assertTrue(
			$value===true,
			'expected true : ' .PHP_EOL
				. to_string($value)
		);
	}//end test_get_sortable



	/**
	* TEST_get_order_path
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$component->build_request_config();

		$value = $component->get_order_path(
			'test80', // string $component_tipo
			'test3' // string $section_tipo
		);

		// expected value sample
		// [
		// 	{
		//    "component_tipo": "test80",
		//    "model": "component_portal",
		//    "name": "portal",
		//    "section_tipo": "test3"
		//   }, ...
		// ]

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' .PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			!empty($value[0]),
			'expected !empty() $value[0] : ' .PHP_EOL
				. to_string($value)
		);
	}//end test_get_order_path



	/**
	* TEST_get_structure_context
	* @return void
	*/
	public function test_get_structure_context() {

		$component = $this->build_component_instance();

		$result = $component->get_structure_context(
			2,
			true
		);

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$result->typo==='ddo',
				'expected value do not match:' . PHP_EOL
				.' expected type: ddo' . PHP_EOL
				.' type: '.to_string($result->typo)
		);

		$this->assertTrue(
			$result->tipo===$component->tipo,
				'expected value do not match:' . PHP_EOL
				.' expected type: ddo' . PHP_EOL
				.' type: '.to_string($result->tipo)
		);
	}//end test_get_structure_context



	/**
	* TEST_build_request_config
	* @return void
	*/
	public function test_build_request_config() {

		$component = $this->build_component_instance();

		$result = $component->build_request_config();

		$this->assertTrue(
			gettype($result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_build_request_config



	/**
	* TEST_get_ar_request_config
	* @return void
	*/
	public function test_get_ar_request_config() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_ar_request_config



	/**
	* TEST_get_request_config_object
	* @return void
	*/
	public function test_get_request_config_object() {

		$component = $this->build_component_instance();

		$result = $component->get_request_config_object();

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_request_config_object



	/**
	* TEST_get_subdatum
	* @return void
	*/
	public function test_get_subdatum() {

		$component = $this->build_component_instance();

		$result = $component->get_subdatum(
			null,
			$component->get_dato()
		);

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_subdatum



}//end class component_portal_test
