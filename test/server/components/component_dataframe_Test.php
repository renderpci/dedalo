<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_dataframe_test extends TestCase {



	public static $model		= 'component_dataframe';
	public static $tipo			= 'test60';
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
	* @return object
	*/
	private function build_component_instance( ?object $caller_dataframe=null ) : object {

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
			$section_tipo,
			true,
			$caller_dataframe
		);

		return $component;
	}//end build_component_instance



	/**
	* TEST_class_vars
	* @return void
	*/
	public function test_class_vars() {

		$component = $this->build_component_instance();

		// default_relation_type
		$result		= $component->get_default_relation_type();
		$expected	= 'dd151';
		$this->assertTrue(
			$result===$expected,
			'expected mismatch : ' . PHP_EOL
				.'expected: ' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
		);

		// default_relation_type_rel
		$result		= $component->get_default_relation_type_rel();
		$expected	= null;
		$this->assertTrue(
			$result===$expected,
			'expected mismatch : ' . PHP_EOL
				.'expected: ' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
		);

		// test_equal_properties
		$result		= $component->test_equal_properties;
		$expected	= ['type','section_id','section_tipo','from_component_tipo','section_id_key','section_tipo_key','main_component_tipo'];
		$this->assertTrue(
			$result===$expected,
			'expected mismatch : ' . PHP_EOL
				.'expected: ' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
		);

		// ar_target_section_tipo
		$result		= $component->ar_target_section_tipo;
		$expected	= null;
		$this->assertTrue(
			$result===$expected,
			'expected mismatch : ' . PHP_EOL
				.'expected: ' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_class_vars



	/**
	* TEST_get_all_data
	* @return void
	*/
	public function test_get_all_data() {

		$component = $this->build_component_instance();

		$result = $component->get_all_data();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_all_data



	/**
	* TEST_remove_locator_from_dato
	* @return void
	*/
	public function test_remove_locator_from_dato() {

		// without caller dataframe
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset
			$caller_dataframe = null;
			$component = $this->build_component_instance( $caller_dataframe );

			$locator = json_decode('
				{
					"type": "dd151",
					"section_id": "14",
					"section_tipo": "rsc1242",
					"section_id_key": 75,
					"section_tipo_key": "numisdata6",
					"from_component_tipo": "'.self::$tipo.'"
				}
			');

			$ar_properties = [];

			$result = $component->remove_locator_from_dato(
				$locator,
				$ar_properties
			);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$expected = false;
			$this->assertTrue(
				$result===$expected,
				'expected mismatch : ' . PHP_EOL
					.'expected: ' . to_string($expected) . PHP_EOL
					.'result: ' . to_string($result) . PHP_EOL
			);

			// expected running with errors
			$this->assertTrue( !empty($_ENV['DEDALO_LAST_ERROR']) );

		// with caller dataframe
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset
			$caller_dataframe = (object)[
				'section_id_key'	=> '75',
				'section_tipo_key'	=> 'numisdata6',
				'section_tipo'		=> 'numisdata3'
			];
			$component = $this->build_component_instance( $caller_dataframe );

			$locator = json_decode('
				{
					"type": "dd151",
					"section_id": "14",
					"section_tipo": "rsc1242",
					"section_id_key": 75,
					"section_tipo_key": "numisdata6",
					"from_component_tipo": "'.self::$tipo.'"
				}
			');

			$ar_properties = [];

			$result = $component->remove_locator_from_dato(
				$locator,
				$ar_properties
			);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$expected = false;
			$this->assertTrue(
				$result===$expected,
				'expected mismatch : ' . PHP_EOL
					.'expected: ' . to_string($expected) . PHP_EOL
					.'result: ' . to_string($result) . PHP_EOL
			);
			// expected running without errors
			$this->assertTrue( empty($_ENV['DEDALO_LAST_ERROR']) );
	}//end test_remove_locator_from_dato



	/**
	* TEST_get_locator_properties_to_check
	* @return void
	*/
	public function test_get_locator_properties_to_check() {

		$component = $this->build_component_instance();

		// default_relation_type
		$result		= $component->get_locator_properties_to_check();
		$expected	= ['type','section_id','section_tipo','from_component_tipo','section_id_key','section_tipo_key','main_component_tipo'];
		$this->assertTrue(
			$result===$expected,
			'expected mismatch : ' . PHP_EOL
				.'expected: ' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_get_locator_properties_to_check



	/**
	* TEST_empty_full_data_associated_to_main_component
	* @return void
	*/
	public function test_empty_full_data_associated_to_main_component() {

		$component = $this->build_component_instance();

		// default_relation_type
		$result		= $component->empty_full_data_associated_to_main_component();
		$expected	= true;
		$this->assertTrue(
			$result===$expected,
			'expected mismatch : ' . PHP_EOL
				.'expected: ' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_empty_full_data_associated_to_main_component





	// working here !



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



}//end class component_dataframe_test
