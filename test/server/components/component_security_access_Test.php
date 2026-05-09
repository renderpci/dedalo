<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class component_security_access_test extends BaseTestCase {



	public static $model		= 'component_security_access';
	public static $tipo		= 'test157';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_security_access
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



	// === GETTERS ===



	/**
	* TEST_GET_CACHE_TREE_FILE_NAME
	* @return void
	*/
	public function test_get_cache_tree_file_name() {

		$lang = DEDALO_DATA_LANG;

		$result = component_security_access::get_cache_tree_file_name(
			$lang
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$expected = 'cache_tree_'.$lang.'.php';
		$this->assertTrue(
			$result===$expected,
			'expected '.$expected.' : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_cache_tree_file_name



	/**
	* TEST_GET_DATALIST
	* @return void
	*/
	public function test_get_datalist() {

		$component = $this->build_component_instance();

		$user_id = logged_user_id();

		$result	= $component->get_datalist(
			$user_id
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$first = $result[0];
			$this->assertTrue(
				gettype($first)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($first)
			);

			// verify datalist item keys: tipo, section_tipo, model, label, parent, ar_parent
			$required_keys = ['tipo', 'section_tipo', 'model', 'label', 'parent', 'ar_parent'];
			foreach ($required_keys as $key) {
				$this->assertTrue(
					array_key_exists($key, $first),
					'expected key '.$key.' in datalist item : ' . PHP_EOL
						. to_string(array_keys($first))
				);
			}
		}
	}//end test_get_datalist



	/**
	* TEST_GET_ELEMENT_DATALIST
	* @return void
	*/
	public function test_get_element_datalist() {

		$section_tipo = 'test3';

		$result	= component_security_access::get_element_datalist(
			$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$first = $result[0];
			$this->assertTrue(
				gettype($first)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($first)
			);

			// verify element datalist item keys: tipo, section_tipo, model, label, parent, ar_parent
			$required_keys = ['tipo', 'section_tipo', 'model', 'label', 'parent', 'ar_parent'];
			foreach ($required_keys as $key) {
				$this->assertTrue(
					array_key_exists($key, $first),
					'expected key '.$key.' in element datalist item : ' . PHP_EOL
						. to_string(array_keys($first))
				);
			}
		}
	}//end test_get_element_datalist



	/**
	* TEST_GET_AR_TIPO_ADMIN
	* @return void
	*/
	public function test_get_ar_tipo_admin() {

		$result	= component_security_access::get_ar_tipo_admin();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result[0])
			);
		}

		// verify static cache works (second call returns same result)
		$result2 = component_security_access::get_ar_tipo_admin();
		$this->assertTrue(
			$result===$result2,
			'expected static cache to return same result'
		);
	}//end test_get_ar_tipo_admin



	/**
	* TEST_GET_SORTABLE
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$value = $component->get_sortable();

		$this->assertTrue(
			$value===false,
			'expected false : ' .PHP_EOL
				. to_string($value)
		);
	}//end test_get_sortable



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



	// === DATA LIFECYCLE ===



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

		// empty array case
		$data	= [];
		$result	= $component->set_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$test_data = $component->get_data();
		$this->assertTrue(
			$test_data===null,
			'expected null : ' . PHP_EOL
				. to_string($test_data)
		);

		// null case
		$result	= $component->set_data(null);
		$test_data = $component->get_data();
		$this->assertTrue(
			$test_data===null,
			'expected null : ' . PHP_EOL
				. to_string($test_data)
		);

		// restore data
		$result	= $component->set_data($old_data);
		$test_data = $component->get_data();
		$this->assertTrue(
			json_encode($test_data)===json_encode($old_data),
			'expected old data : ' . PHP_EOL
				. to_string($test_data)
		);
	}//end test_set_data



	/**
	* TEST_SET_DATA_EMPTY
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set empty array
		$component->set_data([]);

		$result = $component->get_data();
		$this->assertTrue(
			$result===null,
			'expected null after set_data with empty array : ' . PHP_EOL
				. to_string($result)
		);

		// restore
		$component->set_data($old_data);
	}//end test_set_data_empty



	/**
	* TEST_SAVE_AND_RELOAD
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set new data with a permission item
		$new_data = [
			(object)[
				'tipo'			=> 'test45',
				'section_tipo'	=> 'test3',
				'value'			=> 2
			]
		];
		$component->set_data($new_data);
		$component->save();

		// reload component
		$component2 = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$reloaded_data = $component2->get_data();

		$this->assertTrue(
			gettype($reloaded_data)==='array',
			'expected type array after reload : ' . PHP_EOL
				. gettype($reloaded_data)
		);

		// restore original data
		$component2->set_data($old_data);
		$component2->save();
	}//end test_save_and_reload



	// === INSTANCE MODES ===



	/**
	* TEST_COMPONENT_INSTANCE_MODES
	* @return void
	*/
	public function test_component_instance_modes() {

		$modes = ['edit', 'list', 'search'];

		foreach ($modes as $mode) {

			$component = component_common::get_instance(
				self::$model,
				self::$tipo,
				1,
				$mode,
				DEDALO_DATA_NOLAN,
				self::$section_tipo
			);

			$this->assertTrue(
				$component->mode===$mode,
				'expected mode '.$mode.' : ' . PHP_EOL
					. to_string($component->mode)
			);

			$this->assertTrue(
				get_class($component)==='component_security_access',
				'expected class component_security_access : ' . PHP_EOL
					. get_class($component)
			);
		}
	}//end test_component_instance_modes



	// === STATE CHECKS ===



	/**
	* TEST_IS_EMPTY
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// is_empty_data: array-level check
		$data = $component->get_data();
		$result = $component->is_empty_data($data);
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean from is_empty_data : ' . PHP_EOL
				. gettype($result)
		);

		// is_empty with null data_item
		$result = $component->is_empty(null);
		$this->assertTrue(
			$result===true,
			'expected true for null data_item : ' . PHP_EOL
				. to_string($result)
		);

		// is_empty with data_item that has value property
		$data_item = (object)[
			'tipo'			=> 'test45',
			'section_tipo'	=> 'test3',
			'value'			=> 2
		];
		$result = $component->is_empty($data_item);
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean from is_empty with data_item : ' . PHP_EOL
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

		// identifier is composite: tipo_section_tipo_section_id
		$this->assertTrue(
			strpos($result, self::$tipo)!==false,
			'expected tipo in identifier : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_identifier



	// === COMPONENT-SPECIFIC ===



	/**
	* TEST_GET_CHILDREN_RECURSIVE_SECURITY_ACCESS
	* @return void
	*/
	public function test_get_children_recursive_security_access() {

		$component = $this->build_component_instance();

		$tipo = 'test3';

		// private method access
		$result	= PHPUnitUtil::callMethod(
			$component,
			'get_children_recursive_security_access',
			array(
				$tipo
			)
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$first = $result[0];
			$this->assertTrue(
				gettype($first)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($first)
			);

			// verify item keys: tipo, section_tipo, model, label, parent
			$required_keys = ['tipo', 'section_tipo', 'model', 'label', 'parent'];
			foreach ($required_keys as $key) {
				$this->assertTrue(
					array_key_exists($key, $first),
					'expected key '.$key.' : ' . PHP_EOL
						. to_string(array_keys($first))
				);
			}
		}
	}//end test_get_children_recursive_security_access



	/**
	* TEST_CALCULATE_TREE
	* @return void
	*/
	public function test_calculate_tree() {

		$user_id = logged_user_id();

		$result = component_security_access::calculate_tree(
			$user_id
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_calculate_tree



	/**
	* TEST_UPDATE_DATA_VERSION
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version'	=> [6, 0, 0],
			'data_unchanged'	=> false,
			'reference_id'		=> 'test',
			'tipo'				=> self::$tipo,
			'section_id'		=> 1,
			'section_tipo'		=> self::$section_tipo
		];

		$response = component_security_access::update_data_version(
			$request_options
		);

		$this->assertTrue(
			gettype($response)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($response)
		);

		$this->assertTrue(
			property_exists($response, 'result'),
			'expected result property in response'
		);

		// component doesn't have update for this version, so result should be 0
		$this->assertTrue(
			$response->result===0,
			'expected result 0 (no update available) : ' . PHP_EOL
				. to_string($response->result)
		);
	}//end test_update_data_version



	/**
	* TEST_DATALIST_PROPERTY
	* @return void
	*/
	public function test_datalist_property() {

		$component = $this->build_component_instance();

		// initial datalist is empty
		$this->assertTrue(
			gettype($component->datalist)==='array',
			'expected datalist to be array : ' . PHP_EOL
				. gettype($component->datalist)
		);

		// after get_datalist, property is populated
		$user_id = logged_user_id();
		$component->get_datalist($user_id);

		$this->assertTrue(
			!empty($component->datalist),
			'expected datalist to be populated after get_datalist'
		);

		// second call returns cached instance datalist
		$result2 = $component->get_datalist($user_id);
		$this->assertTrue(
			$result2===$component->datalist,
			'expected second get_datalist call to return cached datalist'
		);
	}//end test_datalist_property



}//end class component_security_access_test
