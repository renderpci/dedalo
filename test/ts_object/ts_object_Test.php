<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class ts_object_test extends TestCase {



	/**
	 * vars
	 */
	public $section_id		= 1;
	public $section_tipo	= 'ts1';
	public $options			= null;
	public $mode			= 'edit';



	/**
	* test__construct
	* @return void
	*/
	public function test__construct(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ts_object = new ts_object(
			$this->section_id,
			$this->section_tipo,
			$this->options,
			$this->mode
		);
		// dump($ts_object, ' ts_object ++ '.to_string( get_class($ts_object) ));

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($ts_object);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (class===object) and received type: ' .$type
		);

		$class	= get_class($ts_object);
		$eq		= $class==='ts_object';
		$this->assertTrue(
			$eq,
			'expected true (class===ts_object) and received class: ' .$class
		);
	}//end test__construct



	/**
	* TEST_get_child_data
	* @return void
	*/
	public function test_get_child_data(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ts_object = new ts_object(
			$this->section_id,
			$this->section_tipo,
			$this->options,
			$this->mode
		);

		$result = $ts_object->get_child_data();
		// dump($result, ' result ++ '.to_string( gettype($result) ));

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$type	= gettype($result);
		$eq		= $type==='object';
		$this->assertTrue(
			$eq,
			'expected true (class===object) and received type: ' .$type
		);

		$type	= gettype($result->ar_elements);
		$eq		= $type==='array';
		$this->assertTrue(
			$eq,
			'expected true (class===array) and received type: ' .$type
		);
	}//end test_get_child_data



	/**
	* TEST_has_children_of_type
	* @return void
	*/
	public function test_has_children_of_type(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ts_object = new ts_object(
			$this->section_id,
			$this->section_tipo,
			$this->options,
			$this->mode
		);

		$locators = json_decode('[
			{
			    "type": "dd48",
			    "section_id": "205",
			    "section_tipo": "ts1",
			    "from_component_tipo": "hierarchy49"
			},
			{
			    "type": "dd48",
			    "section_id": "206",
			    "section_tipo": "ts1",
			    "from_component_tipo": "hierarchy49"
			}
		]');

		// descriptor
			$result = $ts_object->has_children_of_type(
				$locators,
				'descriptor'
			);
			// dump($result, ' result descriptor ++ '.to_string( gettype($result) ));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
			);

			$type	= gettype($result);
			$eq		= $type==='boolean';
			$this->assertTrue(
				$eq,
				'expected true (class===boolean) and received type: ' .$type
			);

			$eq		= $result===true;
			$this->assertTrue(
				$eq,
				'expected true (result===true) and received type: ' . json_encode($eq)
			);

		// nd
			$result = $ts_object->has_children_of_type(
				$locators,
				'nd'
			);
			// dump($result, ' result nd ++ '.to_string( gettype($result) ));

			$eq		= $result===false;
			$this->assertTrue(
				$eq,
				'expected true (result===true) and received type: ' . json_encode($eq)
			);
	}//end test_has_children_of_type



	/**
	* TEST_is_indexable
	* @return void
	*/
	public function test_is_indexable(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// default
			$result = ts_object::is_indexable(
				$this->section_tipo,
				$this->section_id
			);
			// dump($result, ' result ++ '.to_string( gettype($result) ));

			$type	= gettype($result);
			$eq		= $type==='boolean';
			$this->assertTrue(
				$eq,
				'expected true (class===boolean) and received type: ' .$type
			);

			$eq		= $result===true;
			$this->assertTrue(
				$eq,
				'expected true ($result===true) and received : ' .json_encode($result)
			);

		// hierarchy
			$result = ts_object::is_indexable(
				'hierarchy1',
				1
			);

			$eq		= $result===false;
			$this->assertTrue(
				$eq,
				'expected false ($result===false) and received : ' .json_encode($result)
			);
	}//end test_is_indexable



	/**
	* TEST_set_term_as_nd
	* @return void
	*/
	public function test_set_term_as_nd(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ar_elements = json_decode('[
			{
		        "type": "term",
		        "tipo": "hierarchy25",
		        "value": "nd-258",
		        "model": "component_input_text"
		    },
		    {
		        "type": "img",
		        "tipo": "hierarchy95",
		        "value": "",
		        "model": "component_svg"
		    }
		]');

		$result = ts_object::set_term_as_nd(
			$ar_elements
		);
		// dump($result, ' result ++ '.to_string( gettype($result) ));

		$type	= gettype($result);
		$eq		= $type==='array';
		$this->assertTrue(
			$eq,
			'expected true (class===array) and received type: ' .$type
		);

		$eq		= $ar_elements[0]->value==='nd-258';
		$this->assertTrue(
			$eq,
			'expected true (ar_elements[0]->value===nd-258) and received type: ' .$type
		);
	}//end test_set_term_as_nd



	/**
	* TEST_get_term_dato_by_locator
	* @return void
	*/
	public function test_get_term_dato_by_locator(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$locator = json_decode('
			{
			    "type": "dd48",
			    "section_id": "1",
			    "section_tipo": "ts1",
			    "from_component_tipo": "hierarchy49"
			}
		');
		$result = ts_object::get_term_dato_by_locator(
			$locator
		);
		// dump($result, ' result ++ '.to_string( gettype($result) ));

		$type	= gettype($result);
		$eq		= $type==='array';
		$this->assertTrue(
			$eq,
			'expected true (class===array) and received type: ' .$type
		);

		$eq		= !empty($result[0]);
		$this->assertTrue(
			$eq,
			'expected true !empty($result[0]) and received type: ' . !empty($result[0])
		);
	}//end test_get_term_dato_by_locator



	/**
	* TEST_get_term_by_locator
	* @return void
	*/
	public function test_get_term_by_locator(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$locator = json_decode('
			{
			    "type": "dd48",
			    "section_id": "1",
			    "section_tipo": "ts1",
			    "from_component_tipo": "hierarchy49"
			}
		');
		$result = ts_object::get_term_by_locator(
			$locator,
			DEDALO_DATA_LANG,
			false // from_cache
		);
		// dump($result, ' result ++ '.to_string( gettype($result) ));

		$type	= gettype($result);
		$eq		= ($type==='string' || $type==='boolean');
		$this->assertTrue(
			$eq,
			'expected true ($type===string || $type===boolean) and received type: ' .$eq
		);

		$eq		= !empty($result);
		$this->assertTrue(
			$eq,
			'expected true !empty($result) and received type: ' . !empty($result)
		);
	}//end test_get_term_by_locator



	/**
	* TEST_resolve_locator
	* @return void
	*/
	public function test_resolve_locator(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ts_object = new ts_object(
			$this->section_id,
			$this->section_tipo,
			$this->options,
			$this->mode
		);

		$locator = json_decode('
			{
			    "type": "dd48",
			    "section_id": "1",
			    "section_tipo": "ts1",
			    "from_component_tipo": "hierarchy49"
			}
		');
		$result = $ts_object->resolve_locator(
			$locator,
			DEDALO_DATA_LANG,
			false // from_cache
		);
		// dump($result, ' result ++ '.to_string( gettype($result) ));

		$type	= gettype($result);
		$eq		= ($type==='string' || $type==='boolean');
		$this->assertTrue(
			$eq,
			'expected true ($type===string || $type===boolean) and received type: ' .$eq
		);

		$eq		= !empty($result);
		$this->assertTrue(
			$eq,
			'expected true !empty($result) and received type: ' . !empty($result)
		);
	}//end test_resolve_locator



	/**
	* TEST_get_component_order_tipo
	* @return void
	*/
	public function test_get_component_order_tipo(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$section_tipo = 'ts1';

		$result = ts_object::get_component_order_tipo(
			$section_tipo
		);
		// dump($result, ' result ++ '.to_string( gettype($result) .' - '.$section_tipo ));

		$type	= gettype($result);
		$eq		= ($type==='string' || $type==='boolean');
		$this->assertTrue(
			$eq,
			'expected true ($type===string || $type===boolean) and received type: ' .$eq
		);

		$eq		= !empty($result);
		$this->assertTrue(
			$eq,
			'expected true !empty($result) and received type: ' . !empty($result)
		);
	}//end test_get_component_order_tipo



	/**
	* TEST_get_permissions_element
	* @return void
	*/
	public function test_get_permissions_element(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ts_object = new ts_object(
			$this->section_id,
			$this->section_tipo,
			$this->options,
			$this->mode
		);

		// component_relation_index
			$result = $ts_object->get_permissions_element(
				'component_relation_index'
			);
			// dump($result, ' result ++ '.to_string( gettype($result) ));

			$type	= gettype($result);
			$eq		= ($type==='integer');
			$this->assertTrue(
				$eq,
				'expected true ($type===integer) and received type: ' .$type . PHP_EOL
				. ' result: ' . to_string($result)
			);

		// component_relation_struct
			$result = $ts_object->get_permissions_element(
				'component_relation_struct'
			);
			// dump($result, ' result ++ '.to_string( gettype($result) ));

			$eq		= ($result===0);
			$this->assertTrue(
				$eq,
				'expected true ($result===0) and received : ' . to_string($eq) . PHP_EOL
				. ' result: ' . to_string($result)
			);
	}//end test_get_permissions_element



	/**
	* TEST_set
	* @return void
	*/
	public function test_set(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ts_object = new ts_object(
			$this->section_id,
			$this->section_tipo,
			$this->options,
			$this->mode
		);

		// component_relation_index
			$result = $ts_object->set_section_tipo(
				'ts2'
			);
			// dump($result, ' result ++ '.to_string( gettype($result) ));

			$type	= gettype($result);
			$eq		= ($type==='boolean');
			$this->assertTrue(
				$eq,
				'expected true ($type===boolean) and received type: ' .$type . PHP_EOL
				. ' result: ' . to_string($result)
			);

			$eq		= ($result===true);
			$this->assertTrue(
				$eq,
				'expected true ($result===0) and received : ' . to_string($eq) . PHP_EOL
				. ' result: ' . to_string($result)
			);
	}//end test_set



	/**
	* TEST_get
	* @return void
	*/
	public function test_get(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ts_object = new ts_object(
			$this->section_id,
			$this->section_tipo,
			$this->options,
			$this->mode
		);

		// exists property
			$result = $ts_object->get_section_tipo();
			// dump($result, ' result ++ '.to_string( gettype($result) ));

			$eq	= ($result===$this->section_tipo);
			$this->assertTrue(
				$eq,
				'expected true ($result===$this->section_tipo) and received: ' . PHP_EOL
				. ' result: ' . to_string($result)
			);


		// non exists property
			$result = $ts_object->get_fake_section_tipo();
			// dump($result, ' result ++ '.to_string( gettype($result) ));

			$eq	= ($result===false);
			$this->assertTrue(
				$eq,
				'expected true ($result===false) and received: ' . PHP_EOL
				. ' result: ' . to_string($result)
			);
	}//end test_get



}//end class
