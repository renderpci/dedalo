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



}//end class component_relation_parent_test
