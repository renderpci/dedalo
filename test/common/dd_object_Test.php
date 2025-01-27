<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_object_test extends TestCase {



	/**
	* TEST__construct
	* @return void
	*/
	public function test__construct() {

		// empty value case
			$dd_object = new dd_object();
			$this->assertTrue(
				is_object($dd_object),
				'expected true, but received is: ' . to_string( is_object($dd_object) )
			);
			$this->assertTrue(
				$dd_object->typo==='ddo',
				'expected true, but received is: ' . to_string( $dd_object->typo==='ddo' )
			);

		// get access test like $dd_object->get_model()
			$property = 'model';
			$options = (object)[
				$property => 'section'
			];
			$dd_object	= new dd_object($options);
			$value		= call_user_func([$dd_object, 'get_'.$property]);
			$eq			= $value==='section';
			$this->assertTrue(
				$eq,
				'expected true (1), but received is: ' . to_string( $eq )
			);

		// direct access to property like $dd_object->model
			$value	= $dd_object->{$property};
			$eq		= $value==='section';
			$this->assertTrue(
				$eq,
				'expected true (2), but received is: ' . to_string( $eq )
			);

		// with string value case
			$ar_test = [
				'type'				=> 'section',
				'model'				=> 'section',
				'tipo'				=> 'test3',
				'section_tipo'		=> 'test3',
				'parent'			=> 'test1',
				'parent_grouper'	=> 'test1',
				'lang'				=> 'lg-spa',
				'mode'				=> 'list',
				'legacy_model'		=> 'section',
				'properties'		=> (object)['property1' => 'a'],
				'permissions'		=> 2,
				'label'				=> 'My label',
				'labels'			=> ['My label 1', 'My label 2'],
				'translatable'		=> true,
				'tools'				=> ['My tool 1', 'My tool 2'],
				'buttons'			=> ['My button 1', 'My button 2'],
				'css'				=> (object)['property1' => 'a'],
				'target_sections'	=> ['test3'],
				'request_config'	=> ['test3'],
				'columns_map'		=> ['test3'],
				'view'				=> 'view1',
				'children_view'		=> 'children_view1',
				'name'				=> 'name1',
				'description'		=> 'description1',
				'icon'				=> 'icon1',
				'show_in_inspector'	=> true,
				'show_in_component'	=> true,
				'config'			=> (object)['property1' => 'a'],
				'sortable'			=> true,
				'fields_separator'	=> ',',
				'records_separator'	=> ' | ',
				'autoload'			=> true,
				'role'				=> 'my role',
				'section_map'		=> json_decode('{
			 		"thesaurus": {
			 			"term": "hierarchy25",
			 			"model": "hierarchy27",
			 			"order": "hierarchy48",
			 			"parent": "hierarchy36",
			 			"is_indexable": "hierarchy24",
			 			"is_descriptor": "hierarchy23"
			 		}
			 	}')
			];

		foreach ($ar_test as $property => $current_value) {

			// get access test like $dd_object->get_model()
				$options = (object)[
					'model'		=> $ar_test['model'],
					$property	=> $current_value
				];
				$dd_object	= new dd_object($options);
				$value		= call_user_func([$dd_object, 'get_'.$property]);
				$eq			= $value===$current_value;
				$this->assertTrue(
					$eq,
					'expected true (1-B), but received is: ' . to_string( $eq )
				);

			// direct access to property like $dd_object->model
				$value	= $dd_object->{$property};
				$eq		= $value===$current_value;
				$this->assertTrue(
					$eq,
					'expected true (2-B), but received is: ' . to_string( $eq )
				);

			// using set
				$dd_object	= new dd_object();
				call_user_func([$dd_object, 'set_'.$property], $current_value );
				$eq = $dd_object->{$property}===$current_value;
				$this->assertTrue(
					$eq,
					'expected true (3-B), but received is: ' . to_string( $eq )
				);
		}
	}//end test__construct



	/**
	* TEST_compare_ddo
	* @return void
	*/
	public function test_compare_ddo() {

		// equal
			$dd_object1 = new dd_object();
				$dd_object1->set_model('component_iri');
				$dd_object1->set_tipo('test65');

			$dd_object2 = new dd_object();
				$dd_object2->set_model('component_iri');
				$dd_object2->set_tipo('test65');

			$result = dd_object::compare_ddo(
				$dd_object1,
				$dd_object2
			);

			$eq = $result===true;
			$this->assertTrue(
				$eq,
				'expected true, but received is: ' . to_string( $eq )
			);

		// distinct
			$dd_object1 = new dd_object();
				$dd_object1->set_model('component_iri');
				$dd_object1->set_tipo('test65');

			$dd_object2 = new dd_object();
				$dd_object2->set_model('component_iri');
				$dd_object2->set_tipo('test69');

			$result = dd_object::compare_ddo(
				$dd_object1,
				$dd_object2
			);

			$eq = $result===false;
			$this->assertTrue(
				$eq,
				'expected true, but received is: ' . to_string( $eq )
			);
	}//end test_compare_ddo



	/**
	* TEST_in_array_ddo
	* @return void
	*/
	public function test_in_array_ddo() {

		// equal
			$dd_object1 = new dd_object();
				$dd_object1->set_model('component_iri');
				$dd_object1->set_tipo('test65');

			$dd_object2 = new dd_object();
				$dd_object2->set_model('component_iri');
				$dd_object2->set_tipo('test69');

			$ar_ddo = [
				$dd_object1,
				$dd_object2
			];

			$result = dd_object::in_array_ddo(
				$dd_object1,
				$ar_ddo
			);
			$eq = $result===true;
			$this->assertTrue(
				$eq,
				'expected true (1), but received is: ' . to_string( $eq )
			);

		// distinct
			$dd_object3 = new dd_object();
				$dd_object1->set_model('component_iri');
				$dd_object1->set_tipo('test65');

			$result = dd_object::in_array_ddo(
				$dd_object3,
				$ar_ddo
			);
			$eq = $result===false;
			$this->assertTrue(
				$eq,
				'expected true (2), but received is: ' . to_string( $eq )
			);
	}//end test_in_array_ddo




}//end class dd_object_test
