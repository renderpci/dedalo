<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class ontology_node_test extends TestCase {



	/**
	* TEST___construct
	* @return void
	*/
	public function test___construct(): void {

		$test_term_id = 'dd1';

		$ontology_node	= new ontology_node( $test_term_id );
		$terminoID		= $ontology_node->get_terminoID();

		$type = gettype($terminoID);
		$eq = $type==='string';
		$this->assertTrue(
			$eq,
			'expected true (class===string) and received type: ' .$type
		);

		$eq = $terminoID===$test_term_id;
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'test_term_id: ' . $test_term_id . PHP_EOL
				.'terminoID: ' . $terminoID
		);

		$ontology_node	= new ontology_node( null, 'dd' );
		$terminoID		= $ontology_node->get_terminoID();

		$eq = $terminoID===null;
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'test_term_id: null'  . PHP_EOL
				.'terminoID: ' . $terminoID
		);

		$prefix = $ontology_node->get_prefijo();
		$eq = $prefix==='dd';
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'expected prefix: dd'  . PHP_EOL
				.'prefix: ' . $prefix
		);
	}//end test___construct



	/**
	* TEST_defineTableName
	* @return void
	*/
	public function test_defineTableName(): void {

		$table = ontology_node::$table;
		$eq = $table==='jer_dd';
		$this->assertTrue(
			$eq,
			'expected true for jer_dd' . PHP_EOL
				. ' table: ' . to_string($table)
		);

		// set DEDALO_RECOVERY_MODE as true temporally
		$_ENV['DEDALO_RECOVERY_MODE'] = true;

		$test_term_id	= 'dd1';
		$ontology_node	= new ontology_node( $test_term_id );

		$table = ontology_node::$table;
		$eq = $table==='jer_dd_recovery';
		$this->assertTrue(
			$eq,
			'expected true fro jer_dd_recovery' . PHP_EOL
				. ' table: ' . to_string($table)
		);

		// restore default
		unset($_ENV['DEDALO_RECOVERY_MODE']);
	}//end test_defineTableName



	/**
	* TEST_definePrimaryKeyName
	* @return void
	*/
	public function test_definePrimaryKeyName(): void {

		$test_term_id	= 'dd1';
		$ontology_node	= new ontology_node( $test_term_id );

		$result = $ontology_node->get_strPrimaryKeyName();
		$eq = $result==='terminoID';
		$this->assertTrue(
			$eq,
			'expected true from terminoID' . PHP_EOL
				. ' strPrimaryKeyName: ' . to_string($result)
		);
	}//end test_definePrimaryKeyName



	/**
	* TEST_defineRelationMap
	* @return void
	*/
	public function test_defineRelationMap(): void {

		$test_term_id	= 'dd1';
		$ontology_node	= new ontology_node( $test_term_id );

		$result = $ontology_node->get_arRelationMap();
		$eq = $result===[
			'terminoID'			=> 'terminoID',
			'parent'			=> 'parent',
			'modelo'			=> 'modelo',
			'model'				=> 'model',
			'is_model'			=> 'is_model',
			'esdescriptor'		=> 'esdescriptor',
			'visible'			=> 'visible',
			'order_number'		=> 'order_number',
			'tld'				=> 'tld',
			'is_translatable'	=> 'is_translatable',
			'relaciones'		=> 'relaciones',
			'propiedades'		=> 'propiedades',
			'properties'		=> 'properties',
			'term'				=> 'term'
		];
		$this->assertTrue(
			$eq,
			'expected true from get_arRelationMap' . PHP_EOL
				. ' arRelationMap: ' . to_string($result)
		);
	}//end test_defineRelationMap



	/**
	* TEST_get_propiedades
	* @return void
	*/
	public function test_get_propiedades(): void {

		$test_term_id	= 'dd1';

		$ontology_node	= new ontology_node($test_term_id);
		$result			= $ontology_node->get_propiedades();

		$expected	= 'NULL';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$ontology_node->set_propiedades((object)[
			'test' => true
		]);
		$result		= $ontology_node->get_propiedades();
		$expected	= 'object';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_propiedades



	/**
	* TEST_get_properties
	* @return void
	*/
	public function test_get_properties(): void {

		$test_term_id	= 'dd1';

		$ontology_node	= new ontology_node($test_term_id);
		$result			= $ontology_node->get_properties();

		$expected	= 'object';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$ontology_node->set_properties(null);
		$result		= $ontology_node->get_properties();
		$expected	= 'NULL';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$ontology_node->set_properties([1,2]);
		$result		= $ontology_node->get_properties();
		$expected	= 'array';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_properties



	/**
	* TEST_get_term
	* @return void
	*/
	public function test_get_term(): void {

		$test_term_id	= 'dd1';

		$ontology_node	= new ontology_node($test_term_id);
		$result			= $ontology_node->get_term();

		$expected	= 'object';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= 'string';
		$eq			= gettype($result->{DEDALO_STRUCTURE_LANG})===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_term



	/**
	* TEST_set_term
	* @return void
	*/
	public function test_set_term(): void {

		$test_term_id	= 'dd1';

		$sample_value = (object)[
			DEDALO_STRUCTURE_LANG => 'Test'
		];

		$ontology_node	= new ontology_node($test_term_id);
		$ontology_node->Load(); // force load
		$result			= $ontology_node->set_term($sample_value);

		$expected	= 'boolean';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$result		= $ontology_node->get_term();
		$expected	= $sample_value;
		$eq			= $result==$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$ontology_node->__destruct();
	}//end test_set_term



	/**
	* TEST_get_term_by_tipo
	* @return void
	*/
	public function test_get_term_by_tipo(): void {

		$test_term_id	= 'dd1';
		$result			= ontology_node::get_term_by_tipo($test_term_id, DEDALO_STRUCTURE_LANG);

		$expected	= 'string';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= true;
		$eq			= strpos($result, 'Dédalo')!==false;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_term_by_tipo



	/**
	* TEST_GET_MODEL_NAME
	* @return void
	*/
	public function test_get_model_name(): void {

		$test_term_id	= 'dd1';
		$ontology_node	= new ontology_node($test_term_id);
		$result			= $ontology_node->get_model_name();

		$expected	= 'string';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= 'root';
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_model_name



	/**
	* TEST_get_model_name_by_tipo
	* @return void
	*/
	public function test_get_model_name_by_tipo(): void {

		$test_term_id	= 'dd1';
		$result			= ontology_node::get_model_name_by_tipo($test_term_id);

		$expected	= 'string';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= 'root';
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_model_name_by_tipo



	/**
	* TEST_get_legacy_model_name_by_tipo
	* @return void
	*/
	public function test_get_legacy_model_name_by_tipo(): void {

		$test_term_id	= 'hierarchy92';
		$result			= ontology_node::get_legacy_model_name_by_tipo($test_term_id);

		$expected	= 'string';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= 'component_autocomplete_hi';
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$result		= ontology_node::get_model_name_by_tipo($test_term_id);
		$expected	= 'component_portal';
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_legacy_model_name_by_tipo



	/**
	* TEST_get_legacy_model_name
	* @return void
	*/
	public function test_get_legacy_model_name(): void {

		$test_term_id	= 'hierarchy92';
		$ontology_node	= new ontology_node($test_term_id);
		$result			= $ontology_node->get_legacy_model_name();

		$expected	= 'string';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= 'component_autocomplete_hi';
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$result		= $ontology_node->get_model_name();
		$expected	= 'component_portal';
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_legacy_model_name



	/**
	* TEST_get_lang_by_tipo
	* @return void
	*/
	public function test_get_lang_by_tipo(): void {

		$test_term_id	= 'hierarchy92';
		$result			= ontology_node::get_lang_by_tipo($test_term_id);

		$expected	= 'string';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= DEDALO_DATA_NOLAN;
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$result = ontology_node::get_lang_by_tipo('rsc36');

		$expected	= DEDALO_DATA_LANG;
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_lang_by_tipo



	/**
	* TEST_get_model_terminoID
	* @return void
	*/
	public function test_get_model_terminoID(): void {

		// root
			$result = ontology_node::get_model_terminoID('root');

			$expected	= 'string';
			$eq			= gettype($result)===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . gettype($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

			$expected	= 'dd117';
			$eq			= $result===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// component_portal
			$result = ontology_node::get_model_terminoID('component_portal');

			$expected	= 'dd592';
			$eq			= $result===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// section
			$result = ontology_node::get_model_terminoID('section');

			$expected	= 'dd6';
			$eq			= $result===$expected;
			$this->assertTrue(
				$eq,
				'expected "dd6" for get_model_terminoID section' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_model_terminoID



	/**
	* TEST_get_all_records_by_tld
	* @return void
	*/
	public function test_get_all_records_by_tld(): void {

		// root
			$result = ontology_node::get_all_records_by_tld(['dd','rsc']);

			$expected	= 'array';
			$eq			= gettype($result)===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . gettype($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// dd1
			$found = array_find($result, function($el) {
				return $el->terminoID==='dd1';
			});

			$expected	= true;
			$eq			= is_object($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// rsc15
			$found = array_find($result, function($el) {
				return $el->terminoID==='rsc15';
			});

			$expected	= true;
			$eq			= is_object($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_all_records_by_tld



	/**
	* TEST_GET_AR_TIPO_BY_MODEL_NAME
	* @return void
	*/
	public function test_get_ar_tipo_by_model_name(): void {

		// component_portal
			$result = ontology_node::get_ar_tipo_by_model_name(
				'component_portal'
			);

			$expected	= 'array';
			$eq			= gettype($result)===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . gettype($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// dd51
			$found = array_find($result, function($el) {
				return $el==='dd51';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// component_input_text
			$result = ontology_node::get_ar_tipo_by_model_name(
				'component_input_text'
			);

		// rsc85
			$found = array_find($result, function($el) {
				return $el==='rsc85';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_tipo_by_model_name



	/**
	* TEST_get_ar_all_models
	* @return void
	*/
	public function test_get_ar_all_models(): void {

		$ontology_node	= new ontology_node(NULL, 'dd');

		$result = $ontology_node->get_ar_all_models();

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// dd251
			$found = array_find($result, function($el) {
				return $el==='dd251';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_all_models



	/**
	* TEST_get_ar_all_terminoID_of_modelo_tipo
	* @return void
	*/
	public function test_get_ar_all_terminoID_of_modelo_tipo(): void {

		// section
			$result = ontology_node::get_ar_all_terminoID_of_modelo_tipo(
				'dd6'
			);

			$expected	= 'array';
			$eq			= gettype($result)===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . gettype($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// oh1
			$found = array_find($result, function($el) {
				return $el==='oh1';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_all_terminoID_of_modelo_tipo



	/**
	* TEST_get_ar_children_of_this
	* @return void
	*/
	public function test_get_ar_children_of_this(): void {

		$ontology_node	= new ontology_node('dd1', 'dd');

		$result = $ontology_node->get_ar_children_of_this();

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// dd242
			$found = array_find($result, function($el) {
				return $el==='dd242';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_children_of_this



	/**
	* TEST_get_ar_children
	* @return void
	*/
	public function test_get_ar_children(): void {

		$result = ontology_node::get_ar_children('dd1');

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// dd242
			$found = array_find($result, function($el) {
				return $el==='dd242';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_children



	/**
	* TEST_get_ar_recursive_children_of_this
	* @return void
	*/
	public function test_get_ar_recursive_children_of_this(): void {

		$ontology_node	= new ontology_node('dd242');
		$result			= $ontology_node->get_ar_recursive_children_of_this('dd242');

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// count
			$expected	= true;
			$eq			= count($result)>1;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_recursive_children_of_this



	/**
	* TEST_get_ar_recursive_children
	* @return void
	*/
	public function test_get_ar_recursive_children(): void {

		$result = ontology_node::get_ar_recursive_children('dd242');

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// count
			$expected	= true;
			$eq			= count($result)>1;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_recursive_children



	/**
	* TEST_get_ar_parents_of_this
	* @return void
	*/
	public function test_get_ar_parents_of_this(): void {
		// $start_time=start_time();

		$ontology_node	= new ontology_node('rsc85');
		$result			= $ontology_node->get_ar_parents_of_this();

		// $total = exec_time_unit($start_time,'ms').' ms';
		// dump($total, ' total time ++ '.to_string());
		// dump($result, ' result ++ '.to_string());

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// count
			$expected	= true;
			$eq			= count($result)>1;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected) . PHP_EOL
					. ' for get_ar_parents_of_this of rsc85'
			);
	}//end test_get_ar_parents_of_this



	/**
	* TEST_get_ar_siblings_of_this
	* @return void
	*/
	public function test_get_ar_siblings_of_this(): void {

		$ontology_node	= new ontology_node('rsc85');
		$result			= $ontology_node->get_ar_siblings_of_this();

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// count
			$expected	= true;
			$eq			= count($result)>1;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected) . PHP_EOL
					. ' for get_ar_siblings_of_this of rsc85'
			);

		// rsc85
			$found = array_find($result, function($el) {
				return $el==='rsc85';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_siblings_of_this



	/**
	* TEST_get_relaciones
	* @return void
	*/
	public function test_get_relations(): void {

		// image rsc88
		$ontology_node	= new ontology_node('rsc88');
		$result			= $ontology_node->get_relations();

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// count
			$expected	= true;
			$eq			= count($result)>1;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected) . PHP_EOL
					. ' for get_relaciones of rsc85'

			);

		// rsc170
			$values = [];
			foreach ($result as $value) {
				$values = array_merge($values, array_values($value));
			}
			$found = array_find($values, function($el) {
				return $el==='rsc170';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_relaciones



	/**
	* TEST_set_relaciones
	* @return void
	*/
	public function test_set_relaciones(): void {

		// image rsc88
		$ontology_node = new ontology_node('rsc88');
		// force load DB value
		$ontology_node->Load();
		$result			= $ontology_node->set_relaciones(['tipo'=>'rsc91']);

		$expected	= 'boolean';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// check set value
			$relaciones = $ontology_node->get_relaciones();

			$expected	= 'array';
			$eq			= gettype($relaciones)===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . gettype($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

			$expected	= ['tipo'=>'rsc91'];
			$eq			= $relaciones===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . gettype($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// null case
			$result = $ontology_node->set_relaciones(null);

			$expected	= 'boolean';
			$eq			= gettype($result)===$expected;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . gettype($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		$ontology_node->__destuct();
	}//end test_set_relaciones



	/**
	* TEST_GET_RELATION_NODES
	* @return void
	*/
	public function test_get_relation_nodes(): void {

		$result = ontology_node::get_relation_nodes(
			'rsc88',
			true,
			true // simple
		);

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// rsc170
			$found = array_find($result, function($el) {
				return $el==='rsc170';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_relation_nodes



	/**
	* TEST_GET_AR_TIPO_BY_MODEL_NAME_AND_RELATION
	* @return void
	*/
	public function test_get_ar_tipo_by_model_name_and_relation(): void {

		// children
		$result = ontology_node::get_ar_tipo_by_model_name_and_relation(
			'rsc88',
			'section_list',
			'children'
		);

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// rsc208
			$found = array_find($result, function($el) {
				return $el==='rsc208';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// children_recursive
		$result = ontology_node::get_ar_tipo_by_model_name_and_relation(
			'rsc75', // People
			'component_input_text',
			'children_recursive'
		);

		// rsc85
			$found = array_find($result, function($el) {
				return $el==='rsc85';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// related
		$result = ontology_node::get_ar_tipo_by_model_name_and_relation(
			'rsc88', // Image
			'component_input_text',
			'related'
		);

		// rsc23
			$found = array_find($result, function($el) {
				return $el==='rsc23';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// parent
		$result = ontology_node::get_ar_tipo_by_model_name_and_relation(
			'rsc88', // Image
			'section_group',
			'parent'
		);

		// rsc76
			$found = array_find($result, function($el) {
				return $el==='rsc76';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_ar_tipo_by_model_name_and_relation



	/**
	* TEST_get_translatable
	* @return void
	*/
	public function test_get_translatable(): void {

		// false
		$result = ontology_node::get_translatable(
			'rsc88', // component_image
		);

		$expected	= 'boolean';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= false;
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// true
		$result = ontology_node::get_translatable(
			'rsc99', // component_text_area
		);

		$expected	= 'boolean';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= true;
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_translatable



	/**
	* TEST_get_color
	* @return void
	*/
	public function test_get_color(): void {

		$result = ontology_node::get_color(
			'rsc167', // Audiovisual
		);

		$expected	= 'string';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$expected	= '#a93f25';
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_color



	/**
	* TEST_get_active_tlds
	* @return void
	*/
	public function test_get_active_tlds(): void {

		$result = ontology_node::get_active_tlds();

		$expected	= 'array';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// rsc
			$found = array_find($result, function($el) {
				return $el==='rsc';
			});

			$expected	= true;
			$eq			= is_string($found);
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_get_active_tlds



	/**
	* TEST_check_active_tld
	* @return void
	*/
	public function test_check_active_tld(): void {

		// true active
		$result = ontology_node::check_active_tld('rsc25');

		$expected	= 'boolean';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// rsc
			$expected	= true;
			$eq			= $result===true;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);

		// false active
		$result = ontology_node::check_active_tld('elraspatld92');

		$expected	= 'boolean';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		// rsc
			$expected	= true;
			$eq			= $result===false;
			$this->assertTrue(
				$eq,
				'expected equal true' . PHP_EOL
					. ' result: ' . to_string($result) . PHP_EOL
					. ' expected: ' . to_string($expected)
			);
	}//end test_check_active_tld



}//end class
