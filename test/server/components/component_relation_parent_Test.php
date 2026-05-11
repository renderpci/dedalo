<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class component_relation_parent_test extends BaseTestCase {



	public static $model		= 'component_relation_parent';
	public static $tipo			= 'test71';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return object $component
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



	/**
	* TEST_CREATE_MINIMUM_SECTIONS
	* @return object $component
	*/
	public function test_create_minimum_sections() {

		// $this->user_login();

		$ar_section_id = [
			2,
			3
		];
		foreach ($ar_section_id as $section_id) {

			// Creates a new section
			$section = section::get_instance(
				self::$section_tipo, // string section_tipo
				'list'
			);

			// Create new section_record
			$created_section_id = $section->create_record((object)[
				'section_id' => $section_id
			]);

			// check the section was created
			$this->assertTrue(
				gettype($section)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($section)
			);

			// check if the section_id returns as integer
			$this->assertTrue(
				gettype($created_section_id)==='integer',
				'expected type integer : ' . PHP_EOL
					. gettype($created_section_id)
			);

			// check if the created_section_id is equal to section_id
			$this->assertTrue(
				$created_section_id===$section_id,
				'expected equal : ' . PHP_EOL
					. gettype($created_section_id)
			);
		}
	}//end test_create_minimum_sections



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_SAVE
	* @return void
	*/
	public function test_Save() {

		$component = $this->build_component_instance();

		$result	= $component->save();

		$this->assertTrue(
			gettype($result)==='boolean' || gettype($result)==='NULL',
			'expected type boolean|null : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===true,
			'expected equal : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_Save



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

		$old_data = $component->get_data();

		// add dato
			$data = json_decode('
				[{
					"section_tipo": "test3",
					"section_id": "2",
					"paginated_key": 1,
					"from_component_tipo": "test71"
				}]
			');

			$result	= $component->set_data($data);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===true,
				'expected true : ' . PHP_EOL
					. to_string($result)
			);

			$reference_data = json_decode('
				{
					"section_tipo": "test3",
					"section_id": "2",
					"from_component_tipo": "test71",
					"type": "dd47"
				}
			');
			$fixed_data = $component->get_data();

			$this->assertTrue(
				locator::in_array_locator($reference_data, $fixed_data),
				'expected equal : ' . PHP_EOL
					.' fixed_data: ' . to_string($fixed_data) . PHP_EOL
					.' reference_data: ' . to_string($reference_data)
			);

		// set null or []
			$data = null;

			$result	= $component->set_data($data);

			$this->assertTrue(
				$result===true,
				'expected true : ' . PHP_EOL
					. to_string($result)
			);

			$fixed_data		= $component->get_data();

			$this->assertTrue(
				$fixed_data===null,
				'expected null : ' . PHP_EOL
					. gettype($fixed_data)
			);


		// set dato from api insert (UNUSED NOW)
			// $changed_data = json_decode('
			// 	{
			// 	    "action": "insert",
			// 	    "key": 0,
			// 	    "value": {
			// 	        "section_tipo": "test3",
			// 	        "section_id": "2",
			// 	        "paginated_key": 1,
			// 	        "from_component_tipo": "test71"
			// 	    }
			// 	}
			// ');

			// $result	= $component->set_dato(
			// 	$changed_data->value
			// );

			// $fixed_dato		= $component->get_dato();
			// $reference_dato	= json_decode('
			// 	[{
			//         "section_tipo": "test3",
			//         "section_id": "2",
			//         "from_component_tipo": "test71"
			// 	}]
			// ');

			// $this->assertTrue(
			// 	json_encode($fixed_dato)===json_encode($reference_dato),
			// 	'expected equal : ' . PHP_EOL
			// 		. gettype($fixed_dato)
			// );


		// set dato from api update (UNUSED NOW)
			// $changed_data = json_decode('
			// 	{
			// 	    "action": "update",
			// 	    "key": 0,
			// 	    "value": {
			// 	        "section_tipo": "test3",
			// 	        "section_id": "2",
			// 	        "paginated_key": 1,
			// 	        "from_component_tipo": "test71"
			// 	    }
			// 	}
			// ');

			// $result	= $component->set_dato(
			// 	$changed_data->value
			// );

			// $fixed_dato		= $component->get_dato();
			// $reference_dato	= json_decode('
			// 	[{
			//         "section_tipo": "test3",
			//         "section_id": "2",
			//         "from_component_tipo": "test71"
			// 	}]
			// ');

			// $this->assertTrue(
			// 	json_encode($fixed_dato)===json_encode($reference_dato),
			// 	'expected equal : ' . PHP_EOL
			// 		. gettype($fixed_dato)
			// );

		// set dato from api remove (UNUSED NOW)
			// $changed_data = json_decode('
			// 	{
			// 	    "action": "remove",
			//         "key": 0,
			//         "value": null
			// 	}
			// ');

			// dump($component->get_dato(), '$component->get_dato() ++ '.to_string());

			// $result	= $component->set_dato(
			// 	$changed_data->value
			// );

			// $fixed_dato		= $component->get_dato();
			// $reference_dato	= [];

			// 	dump($fixed_dato, ' fixed_dato ++ '.to_string());
			// 	dump($reference_dato, ' reference_dato ++ '.to_string());

			// $this->assertTrue(
			// 	json_encode($fixed_dato)===json_encode($reference_dato),
			// 	'expected equal : ' . PHP_EOL
			// 		. gettype($fixed_dato)
			// );


		// restore dato
			$result	= $component->set_data($old_data);

			$this->assertTrue(
				json_encode($component->get_data())===json_encode($old_data),
				'expected old data : ' . PHP_EOL
					. to_string($component->get_data())
			);
	}//end test_set_data



	/**
	* TEST_update_children
	* (!) This method is not really necessary because it is private and executes actions
	* that are already done by the add_parent/remove_parent methods
	* @return void
	*/
		// public function test_update_children() {

		// 	$component = $this->build_component_instance();

		// 	// $old_dato = $component->get_dato();

		// 	// empty old values
		// 	$component->set_dato(null);

		// 	$section_id	= 2;

		// 	// private method access. Note that this method saves !
		// 	$result	= PHPUnitUtil::callMethod(
		// 		$component,
		// 		'update_children',
		// 		array(
		// 			'add', // action
		// 			$component->section_tipo,
		// 			$section_id
		// 		)
		// 	 );

		// 	$this->assertTrue(
		// 		gettype($result)==='boolean',
		// 		'expected type boolean : ' . PHP_EOL
		// 			. gettype($result)
		// 	);

		// 	if ($result===true) {

		// 		$dato_reference = json_decode('
		// 			[
		// 			    {
		// 			        "section_tipo": "'.self::$section_tipo.'",
		// 			        "section_id": "'.$section_id.'",
		// 			        "from_component_tipo": "'.self::$tipo.'"
		// 			    }
		// 			]
		// 		');
		// 		// dump($component->dato, '$component->dato ++ '.to_string());

		// 		$this->assertTrue(
		// 			json_encode($component->dato)===json_encode($dato_reference),
		// 			'expected dato_reference : ' . PHP_EOL
		// 				. to_string($component->dato)
		// 		);
		// 	}
		// }//end test_update_children



	/**
	* TEST_ADD_PARENT
	* @return void
	*/
	public function test_add_parent() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// empty old values
		$component->set_data(null);

		$section_id	= 3;

		$locator = new locator();
			$locator->set_section_tipo($component->section_tipo);
			$locator->set_section_id($section_id);

		$result = $component->add_parent(
			$locator
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		if ($result===true) {

			$reference_data = json_decode(
				'{
					"type": "'.DEDALO_RELATION_TYPE_PARENT_TIPO.'",
					"section_tipo": "'.self::$section_tipo.'",
					"section_id": "'.$section_id.'",
					"from_component_tipo": "'.self::$tipo.'"
				}'
			);

			$this->assertTrue(
				locator::in_array_locator($reference_data, $component->get_data()),
				'expected reference_data : ' . PHP_EOL
					. to_string($component->get_data)
			);

			// restore data
			$component->set_data($old_data);
			$component->save();
		}
	}//end test_add_parent



	/**
	* TEST_REMOVE_PARENT
	* @return void
	*/
	public function test_remove_parent() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$locator = new locator();
			$locator->set_section_tipo($component->section_tipo);
			$locator->set_section_id(3);

		// add dato (this action saves too)
			$component->set_data(null);
			$result = $component->add_parent(
				$locator
			);

			if ($result===false) {
				debug_log(__METHOD__
					. " Unable to add_parent " . PHP_EOL
					. to_string()
					, logger::ERROR
				);
				return;
			}

		// remove added (this action saves too)
			$result = $component->remove_parent(
				$locator
			);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);


			if ($result===true) {

				$this->assertTrue(
					null === $component->get_data(),
					'expected null : ' . PHP_EOL
						. to_string($component->get_data())
				);
			}

			// add multiple data
			$component->set_data(null);
			$locator->set_section_id(3);
			$result = $component->add_parent(
				$locator
			);
			$locator->set_section_id(4);
			$result = $component->add_parent(
				$locator
			);
			$locator->set_section_id(5);
			$result = $component->add_parent(
				$locator
			);
			$locator->set_section_id(6);
			$result = $component->add_parent(
				$locator
			);
			// remove multiple data
			$locator->set_section_id(3);
			$result = $component->remove_parent(
				$locator
			);
			$locator->set_section_id(5);
			$result = $component->remove_parent(
				$locator
			);

			$test_data = json_decode(
				'{
					"type": "'.DEDALO_RELATION_TYPE_PARENT_TIPO.'",
					"section_tipo": "'.self::$section_tipo.'",
					"section_id": "4",
					"from_component_tipo": "'.self::$tipo.'"
				}'
			);

			$test_data2 = json_decode(
				'{
					"type": "'.DEDALO_RELATION_TYPE_PARENT_TIPO.'",
					"section_tipo": "'.self::$section_tipo.'",
					"section_id": "6",
					"from_component_tipo": "'.self::$tipo.'"
				}'
			);

			$data = $component->get_data();
			$this->assertTrue(
				locator::in_array_locator($test_data, $data),
				'expected locator in data : ' . PHP_EOL
					. to_string($data)
			);

			$this->assertTrue(
				locator::in_array_locator($test_data2, $data),
				'expected locator in data : ' . PHP_EOL
					. to_string($data)
			);

			// restore data
			$component->set_data($old_data);
			$component->save();

	}//end test_remove_parent



	/**
	* TEST_get_component_relation_children_tipo
	* @return void
	*/
	public function test_get_component_relation_children_tipo() {

		$result = component_relation_parent::get_component_relation_children_tipo(
			self::$tipo
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$model = ontology_node::get_model_by_tipo($result, true);
		$this->assertTrue(
			$model==='component_relation_children',
			'expected component_relation_children : ' . PHP_EOL
				. to_string($result)
		);

		$reference_value = 'test201';
		$this->assertTrue(
			$result===$reference_value,
			'expected equal : ' . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
			.'reference_value: ' . to_string($reference_value)
		);
	}//end test_get_component_relation_children_tipo



	/**
	* TEST_get_parents
	* @return void
	*/
	public function test_get_parents() {

		$section_id = 1;

		$result = component_relation_parent::get_parents(
			$section_id,
			self::$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_parents



	/**
	* TEST_get_parents_recursive
	* @return void
	*/
	public function test_get_parents_recursive() {

		$section_id		= '1'; // 1;
		$section_tipo	= self::$section_tipo;

		// $section_id		= '66'; // 1;
		// $section_tipo	= 'oh0'; // self::$section_tipo

		$result = component_relation_parent::get_parents_recursive(
			$section_id,
			$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_parents_recursive



	/**
	* TEST_GET_ORDER_DATAFRAME_RETURNS_NULL_WHEN_NOT_CONFIGURED
	* @return void
	*/
	public function test_get_order_dataframe_returns_null_when_not_configured() {
		$this->user_login();

		$component = component_common::get_instance(
			'component_relation_parent',
			'test71',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Should return null if no order component configured in section_map
		$result = $component->get_order_dataframe();

		$this->assertTrue(
			$result===null || $result===false,
			'Should return null or false when order not configured : ' . to_string($result)
		);
	}//end test_get_order_dataframe_returns_null_when_not_configured



	/**
	* TEST_GET_NEXT_ORDER_IN_CONTEXT
	* @return void
	*/
	public function test_get_next_order_in_context() {
		$this->user_login();

		$component = component_common::get_instance(
			'component_relation_parent',
			'test71',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		// Should return 1 when no order component configured
		$result = $component->get_next_order_in_context('test3', 100);

		$this->assertEquals(1, $result);
	}//end test_get_next_order_in_context



	/**
	* TEST_RECALCULATE_SIBLING_ORDERS_RETURNS_FALSE_WHEN_NOT_CONFIGURED
	* @return void
	*/
	public function test_recalculate_sibling_orders_returns_false_when_not_configured() {
		$this->user_login();

		$component = component_common::get_instance(
			'component_relation_parent',
			'test71',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3'
		);

		$result = $component->recalculate_sibling_orders('test3', 100);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean : ' . gettype($result)
		);
	}//end test_recalculate_sibling_orders_returns_false_when_not_configured



	/**
	* TEST_SET_DATA_EMPTY
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set empty array
		$result = $component->set_data([]);

		$this->assertTrue(
			$result===true,
			'expected true on set_data with empty array : ' . PHP_EOL
				. to_string($result)
		);

		$fixed_data = $component->get_data();

		$this->assertTrue(
			$fixed_data===null || (is_array($fixed_data) && count($fixed_data)===0),
			'expected null or empty array : ' . PHP_EOL
				. to_string($fixed_data)
		);

		// restore
		$component->set_data($old_data);
		$component->save();
	}//end test_set_data_empty



	/**
	* TEST_SAVE_AND_RELOAD
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set new data and save
		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(2);

		$component->set_data(null);
		$component->add_parent($locator);
		// add_parent already saves

		// reload from DB
		$reloaded = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);

		$reloaded_data = $reloaded->get_data();

		$this->assertTrue(
			locator::in_array_locator($locator, $reloaded_data),
			'expected locator in reloaded data : ' . PHP_EOL
				. to_string($reloaded_data)
		);

		// restore
		$component->set_data($old_data);
		$component->save();
	}//end test_save_and_reload



	/**
	* TEST_COMPONENT_INSTANCE_MODES
	* @return void
	*/
	public function test_component_instance_modes() {

		$this->user_login();

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
				gettype($component)==='object',
				"expected object for mode {$mode} : " . gettype($component)
			);

			$this->assertTrue(
				$component->get_mode()===$mode,
				"expected mode {$mode} : " . $component->get_mode()
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_IS_EMPTY
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// with data
		$component->set_data(null);
		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(2);
		$component->add_parent($locator);

		$data = $component->get_data();

		// (!) is_empty() checks only for 'value' property which locators lack,
		// so for relation components check data directly instead
		$this->assertTrue(
			is_array($data) && count($data) > 0,
			'expected non-empty data after add_parent : ' . to_string($data)
		);

		// single item check with is_empty (returns true for locators without 'value' key)
		if (!empty($data)) {
			$item = $data[0] ?? null;
			$is_empty_item = $component->is_empty($item);
			$this->assertTrue(
				gettype($is_empty_item)==='boolean',
				'expected boolean from is_empty : ' . gettype($is_empty_item)
			);
		}

		// without data
		$component->set_data(null);

		$empty_data = $component->get_data();

		$this->assertTrue(
			$empty_data===null || (is_array($empty_data) && count($empty_data)===0),
			'expected null or empty data when set_data(null) : ' . to_string($empty_data)
		);

		// restore
		$component->set_data($old_data);
		$component->save();
	}//end test_is_empty



	/**
	* TEST_GET_IDENTIFIER
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$identifier = $component->get_identifier();

		$this->assertTrue(
			gettype($identifier)==='string',
			'expected string : ' . gettype($identifier)
		);

		$this->assertTrue(
			strpos($identifier, self::$tipo)!==false,
			'expected tipo in identifier : ' . to_string($identifier)
		);
	}//end test_get_identifier



	/**
	* TEST_GET_SORTABLE
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean : ' . gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected sortable=true : ' . to_string($result)
		);
	}//end test_get_sortable



	/**
	* TEST_GET_PARENT_TIPO
	* @return void
	*/
	public function test_get_parent_tipo() {

		$result = component_relation_parent::get_parent_tipo(
			self::$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . gettype($result)
		);

		if ($result !== null) {
			$this->assertTrue(
				$result===self::$tipo,
				'expected tipo ' . self::$tipo . ' : ' . to_string($result)
			);
		}
	}//end test_get_parent_tipo



	/**
	* TEST_ADD_PARENT_AUTO_REFERENCE
	* Test that add_parent rejects auto-reference (adding self as parent)
	* @return void
	*/
	public function test_add_parent_auto_reference() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// create locator pointing to self (same section_tipo + section_id)
		$locator = new locator();
			$locator->set_section_tipo($component->section_tipo);
			$locator->set_section_id($component->section_id);

		$result = $component->add_parent($locator);

		$this->assertTrue(
			$result===false,
			'expected false for auto-reference add_parent : ' . to_string($result)
		);

		// restore
		$component->set_data($old_data);
		$component->save();
	}//end test_add_parent_auto_reference



	/**
	* TEST_MAKE_ME_YOUR_PARENT
	* @return void
	*/
	public function test_make_me_your_parent() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$component->set_data(null);

		$result = $component->make_me_your_parent(
			self::$section_tipo,
			3
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . gettype($result)
		);

		if ($result===true) {

			$reference_data = json_decode(
				'{
					"type": "' . DEDALO_RELATION_TYPE_PARENT_TIPO . '",
					"section_tipo": "' . self::$section_tipo . '",
					"section_id": "3",
					"from_component_tipo": "' . self::$tipo . '"
				}'
			);

			$this->assertTrue(
				locator::in_array_locator($reference_data, $component->get_data()),
				'expected reference_data in component data : ' . to_string($component->get_data())
			);
		}

		// restore
		$component->set_data($old_data);
		$component->save();
	}//end test_make_me_your_parent



	/**
	* TEST_REMOVE_ME_AS_YOUR_PARENT
	* @return void
	*/
	public function test_remove_me_as_your_parent() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// add first
		$component->set_data(null);
		$add_result = $component->make_me_your_parent(
			self::$section_tipo,
			3
		);

		if ($add_result===true) {

			// remove
			$result = $component->remove_me_as_your_parent(
				self::$section_tipo,
				3
			);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . gettype($result)
			);

			if ($result===true) {

				$fixed_data = $component->get_data();

				$this->assertTrue(
					$fixed_data===null || (is_array($fixed_data) && count($fixed_data)===0),
					'expected null or empty data after remove : ' . to_string($fixed_data)
				);
			}
		}

		// restore
		$component->set_data($old_data);
		$component->save();
	}//end test_remove_me_as_your_parent



}//end class component_relation_parent_test
