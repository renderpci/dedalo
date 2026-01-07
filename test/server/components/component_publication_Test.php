<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PUBLICATION_TEST
*/
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_publication_test extends BaseTestCase {



	public static $model		= 'component_publication';
	public static $tipo			= 'test92';
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
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// null case
			$data	= null;
			$result	= $component->set_data($data);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				empty($component->get_data()),
				'expected empty() data : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// object case
			$locator = json_decode('
				{
					"type":"dd151",
					"section_id":"1",
					"section_tipo":"dd64",
					"from_component_tipo":"test92"
				}
			');
			$data	= [$locator];
			$result	= $component->set_data($data);
			$this->assertTrue(
				json_encode($component->get_data()[0])===json_encode($locator),
				'expected array with locator : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// array case
			$data	= [$locator];
			$result	= $component->set_data($data);
			$this->assertTrue(
				json_encode($component->get_data())===json_encode($data),
				'expected array : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// restore data
			$result	= $component->set_data($old_data);

			$this->assertTrue(
				json_encode($component->get_data())===json_encode($old_data),
				'expected original data : ' . PHP_EOL
					. to_string($component->get_data())
			);
	}//end test_set_data



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



	/**
	* TEST_get_subdatum
	* @return void
	*/
	public function test_get_subdatum() {

		$component = $this->build_component_instance();
		$component->set_data($this->get_sample_data(self::$model));

		// Create request_config (needed to calculate the subdatum)
		$component->context = new stdClass();
		$component->context->request_config = $component->get_ar_request_config();

		$result = $component->get_subdatum(
			null,
			$component->get_data()
		);
		
		// 1 - Expected type object
		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);

		// 2 - Expected property context
		$this->assertTrue(
			isset($result->context),
			'expected property context do not match:' . PHP_EOL
			.' expected property: context' . PHP_EOL
			.' property: '.to_string($result->context ?? null)
		);

		// 3 - Expected property data
		$this->assertTrue(
			isset($result->data),
			'expected property data do not match:' . PHP_EOL
			.' expected property: data' . PHP_EOL
			.' property: '.to_string($result->data ?? null)
		);
	}//end test_get_subdatum



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();
		$component->set_data($this->get_sample_data(self::$model));

		$result = $component->get_grid_value();

		// 1 - Expected type object
		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		// 2 - Expected property model
		$this->assertTrue(
			$result->model==='component_publication',
			'expected property model do not match:' . PHP_EOL
			.' expected property: model' . PHP_EOL
			.' property: '.to_string($result->model ?? null)
		);

		// 3 - Expected property value as array
		$this->assertTrue(
			is_array($result->value),
			'expected property value to be array:' . PHP_EOL
			.' value: '.to_string($result->value ?? null)
		);

		// 4 - Expected property label (optional)
		$this->assertTrue(
			isset($result->label) || !isset($result->label),
			'expected property label to exist or not:' . PHP_EOL
			.' label: '.to_string($result->label ?? 'not set')
		);

		// 5 - Expected property ar_columns_obj as array
		$this->assertTrue(
			is_array($result->ar_columns_obj),
			'expected property ar_columns_obj to be array:' . PHP_EOL
			.' ar_columns_obj: '.to_string($result->ar_columns_obj ?? null)
		);

		// 6 - Check first item of ar_columns_obj
		if (!empty($result->ar_columns_obj)) {
			$this->assertTrue(
				isset($result->ar_columns_obj[0]->id),
				'expected property id in ar_columns_obj[0]:' . PHP_EOL
				.' item: '.to_string($result->ar_columns_obj[0] ?? null)
			);
		}
	}//end test_get_grid_value



}//end class component_publication_test
