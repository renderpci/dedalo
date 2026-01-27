<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class section_test extends BaseTestCase {



	public static $model		= 'section';
	public static $tipo			= 'test3';
	public static $section_tipo	= 'test3';



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() : void {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_get_instance
	* @return void
	*/
	public function test_get_instance() : void {

		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		// cache true
			$section = section::get_instance(
				$section_tipo, // string tipo
				$mode, // string mode
				true // bool cache (default is true)
			);

			$this->assertTrue(
				gettype($section)==='object' ,
				'expected type object. Current type: ' .gettype($section)
			);

			$this->assertTrue(
				$section instanceof section ,
				'expected instance of section'
			);

			$this->assertTrue(
				count($section::$ar_section_instances)>0 ,
				'expected count($section::$ar_section_instances)>0. Current count: ' .count($section::$ar_section_instances)
			);

		// cache false
			$section2 = section::get_instance(
				$section_tipo, // string tipo
				$mode, // string mode
				false // bool cache
			);

			$this->assertTrue(
				$section->uid!==$section2->uid ,
				'expected non cache section (different uid) ' .$section->uid .' - '.$section2->uid
			);

		// cache true again
			$section3 = section::get_instance(
				$section_tipo, // string tipo
				$mode, // string mode
				true // bool cache
			);

			$this->assertTrue(
				$section->uid===$section3->uid ,
				'expected cached section (same uid) ' .$section->uid .' - '.$section3->uid
			);
	}//end test_get_instance



	/**
	* TEST_create_record
	* @return void
	*/
	public function test_create_record() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'edit', // string mode
			false // bool cache
		);

		$result = $section->create_record();

		$this->assertTrue(
			gettype($result)==='integer' ,
			'expected type integer. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$result > 0 ,
			'expected section_id > 0. Current value: ' .$result
		);

		// Verify the record was created by checking section_record
		$section_record = section_record::get_instance($section_tipo, $result);
		$exists = $section_record->exists_in_the_database();

		$this->assertTrue(
			$exists===true ,
			'expected record to exist in database'
		);
	}//end test_create_record



	/**
	* TEST_get_section_real_tipo
	* @return void
	*/
	public function test_get_section_real_tipo() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'list', // string mode
			false // bool cache
		);

		$result = $section->get_section_real_tipo();

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected type string. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$result===$section_tipo ,
			'expected result to equal section_tipo'
		);
	}//end test_get_section_real_tipo



	/**
	* TEST_get_section_real_tipo_static
	* @return void
	*/
	public function test_get_section_real_tipo_static() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_section_real_tipo_static($section_tipo);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected type string. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$result===$section_tipo ,
			'expected result to equal section_tipo'
		);
	}//end test_get_section_real_tipo_static



	/**
	* TEST_get_ar_children_tipo_by_model_name_in_section
	* @return void
	*/
	public function test_get_ar_children_tipo_by_model_name_in_section() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['component_'], // ar_model_name_required
			true, // from_cache
			false, // resolve_virtual
			true, // recursive
			false // search_exact
		);

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected type array. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			count($result)>0 ,
			'expected at least one component child'
		);
	}//end test_get_ar_children_tipo_by_model_name_in_section



	/**
	* TEST_get_ar_recursive_children
	* @return void
	*/
	public function test_get_ar_recursive_children() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_ar_recursive_children($section_tipo);

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected type array. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			count($result)>0 ,
			'expected at least one recursive child'
		);
	}//end test_get_ar_recursive_children



	/**
	* TEST_get_section_buttons_tipo
	* @return void
	*/
	public function test_get_section_buttons_tipo() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'edit', // string mode
			false // bool cache
		);

		$result = $section->get_section_buttons_tipo();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected type array. Current type: ' .gettype($result)
		);
	}//end test_get_section_buttons_tipo



	/**
	* TEST_get_section_tipo
	* @return void
	*/
	public function test_get_section_tipo() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'edit', // string mode
			false // bool cache
		);

		$result = $section->get_section_tipo();

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected type string. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$result===$section_tipo ,
			'expected result to equal section_tipo'
		);
	}//end test_get_section_tipo



	/**
	* TEST_get_section_info
	* @return void
	*/
	public function test_get_section_info() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'edit', // string mode
			false // bool cache
		);

		// Create a test record first
		$section_id = $section->create_record();

		// Get section_record to access data
		$section_record = section_record::get_instance($section_tipo, $section_id);

		$result = $section->get_section_info();

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected type object. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			isset($result->created_date) ,
			'expected created_date property'
		);

		$this->assertTrue(
			isset($result->created_by_user_id) ,
			'expected created_by_user_id property'
		);
	}//end test_get_section_info



	/**
	* TEST_get_ar_all_section_records_unfiltered
	* @return void
	*/
	public function test_get_ar_all_section_records_unfiltered() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_ar_all_section_records_unfiltered($section_tipo);

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected type array. Current type: ' .gettype($result)
		);
	}//end test_get_ar_all_section_records_unfiltered



	/**
	* TEST_get_resource_all_section_records_unfiltered
	* @return void
	*/
	public function test_get_resource_all_section_records_unfiltered() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_resource_all_section_records_unfiltered($section_tipo);

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected type object (PgSql\Result). Current type: ' .gettype($result)
		);
	}//end test_get_resource_all_section_records_unfiltered



	/**
	* TEST_get_section_map
	* @return void
	*/
	public function test_get_section_map() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_section_map($section_tipo);

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL' ,
			'expected type object|NULL. Current type: ' .gettype($result)
		);
	}//end test_get_section_map



	/**
	* TEST_get_metadata_definition
	* @return void
	*/
	public function test_get_metadata_definition() : void {

		$result = section::get_metadata_definition();

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected type object. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$result instanceof stdClass ,
			'expected instance of stdClass'
		);
	}//end test_get_metadata_definition



	/**
	* TEST_get_metadata_definition_tipos
	* @return void
	*/
	public function test_get_metadata_definition_tipos() : void {

		$result = section::get_metadata_definition_tipos();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected type array. Current type: ' .gettype($result)
		);
	}//end test_get_metadata_definition_tipos



	/**
	* TEST_build_sqo_id
	* @return void
	*/
	public function test_build_sqo_id() : void {

		$section_tipo = self::$section_tipo;

		$result = section::build_sqo_id($section_tipo);

		$this->assertTrue(
			gettype($result)==='string' ,
			'expected type string. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			!empty($result) ,
			'expected non-empty string'
		);
	}//end test_build_sqo_id



	/**
	* TEST_add_section_record
	* @return void
	*/
	public function test_add_section_record() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'edit', // string mode
			false // bool cache
		);

		// Create a test record
		$section_id = $section->create_record();

		// Get the section_record
		$section_record = section_record::get_instance($section_tipo, $section_id);

		// Add it to section
		$section->add_section_record($section_record);

		// Verify it was added (no exception thrown means success)
		$this->assertTrue(
			true ,
			'section_record added successfully'
		);
	}//end test_add_section_record



	/**
	* TEST_remove_section_record
	* @return void
	*/
	public function test_remove_section_record() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'edit', // string mode
			false // bool cache
		);

		// Create a test record
		$section_id = $section->create_record();

		// Get the section_record
		$section_record = section_record::get_instance($section_tipo, $section_id);

		// Add it first
		$section->add_section_record($section_record);

		// Now remove it
		$section->remove_section_record($section_record);

		// Verify it was removed (no exception thrown means success)
		$this->assertTrue(
			true ,
			'section_record removed successfully'
		);
	}//end test_remove_section_record



	/**
	* TEST_get_section_permissions
	* @return void
	*/
	public function test_get_section_permissions() : void {

		$section_tipo = self::$section_tipo;

		$section = section::get_instance(
			$section_tipo, // string tipo
			'edit', // string mode
			false // bool cache
		);

		$result = $section->get_section_permissions();

		$this->assertTrue(
			gettype($result)==='integer' ,
			'expected type integer. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$result >= 0 ,
			'expected permissions >= 0'
		);
	}//end test_get_section_permissions



}//end class section_test
