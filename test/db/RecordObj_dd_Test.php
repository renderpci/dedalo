<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class RecordObj_dd_test extends TestCase {



	/**
	* TEST___construct
	* @return void
	*/
	public function test___construct(): void {

		$test_term_id = 'dd1';

		$RecordObj_dd	= new RecordObj_dd( $test_term_id );
		$terminoID		= $RecordObj_dd->get_terminoID();

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

		$RecordObj_dd	= new RecordObj_dd( null, 'dd' );
		$terminoID		= $RecordObj_dd->get_terminoID();

		$eq = $terminoID===null;
		$this->assertTrue(
			$eq,
			'expected true' . PHP_EOL
				.'test_term_id: null'  . PHP_EOL
				.'terminoID: ' . $terminoID
		);

		$prefix = $RecordObj_dd->get_prefijo();
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

		$table = RecordObj_dd::$table;
		$eq = $table==='jer_dd';
		$this->assertTrue(
			$eq,
			'expected true for jer_dd' . PHP_EOL
				. ' table: ' . to_string($table)
		);

		// set DEDALO_RECOVERY_MODE as true temporally
		$_ENV['DEDALO_RECOVERY_MODE'] = true;

		$test_term_id	= 'dd1';
		$RecordObj_dd	= new RecordObj_dd( $test_term_id );

		$table = RecordObj_dd::$table;
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
		$RecordObj_dd	= new RecordObj_dd( $test_term_id );

		$result = $RecordObj_dd->get_strPrimaryKeyName();
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
		$RecordObj_dd	= new RecordObj_dd( $test_term_id );

		$result = $RecordObj_dd->get_arRelationMap();
		$eq = $result===[
			'terminoID'		=> 'terminoID',
			'parent'		=> 'parent',
			'modelo'		=> 'modelo',
			'esmodelo'		=> 'esmodelo',
			'esdescriptor'	=> 'esdescriptor',
			'visible'		=> 'visible',
			'norden'		=> 'norden',
			'tld'			=> 'tld',
			'traducible'	=> 'traducible',
			'relaciones'	=> 'relaciones',
			'propiedades'	=> 'propiedades',
			'properties'	=> 'properties',
			'term'			=> 'term'
		];
		$this->assertTrue(
			$eq,
			'expected true from get_arRelationMap' . PHP_EOL
				. ' arRelationMap: ' . to_string($result)
		);
	}//end test_defineRelationMap



	/**
	* TEST_get_prefix_from_tipo
	* @return void
	*/
	public function test_get_prefix_from_tipo(): void {

		$test_term_id	= 'dd1';

		$result		= RecordObj_dd::get_prefix_from_tipo($test_term_id);
		$expected	= 'dd';
		$eq = $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$test_term_id	= 'dd1_2';

		$result		= RecordObj_dd::get_prefix_from_tipo($test_term_id);
		$expected	= 'dd';
		$eq = $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_prefix_from_tipo



	/**
	* TEST_get_id_from_tipo
	* @return void
	*/
	public function test_get_id_from_tipo(): void {

		$test_term_id	= 'dd1';

		$result		= RecordObj_dd::get_id_from_tipo($test_term_id);
		$expected	= '1';
		$eq = $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$test_term_id	= 'dd1a';

		$result		= RecordObj_dd::get_id_from_tipo($test_term_id);
		$expected	= '1';
		$eq = $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_id_from_tipo



	/**
	* TEST_get_propiedades
	* @return void
	*/
	public function test_get_propiedades(): void {

		$test_term_id	= 'dd1';

		$RecordObj_dd	= new RecordObj_dd($test_term_id);
		$result			= $RecordObj_dd->get_propiedades();

		$expected	= 'NULL';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$RecordObj_dd->set_propiedades((object)[
			'test' => true
		]);
		$result		= $RecordObj_dd->get_propiedades();
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

		$RecordObj_dd	= new RecordObj_dd($test_term_id);
		$result			= $RecordObj_dd->get_properties();

		$expected	= 'object';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$RecordObj_dd->set_properties(null);
		$result		= $RecordObj_dd->get_properties();
		$expected	= 'NULL';
		$eq = gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$RecordObj_dd->set_properties([1,2]);
		$result		= $RecordObj_dd->get_properties();
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

		$RecordObj_dd	= new RecordObj_dd($test_term_id);
		$result			= $RecordObj_dd->get_term();

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

		$RecordObj_dd	= new RecordObj_dd($test_term_id);
		$RecordObj_dd->Load(); // force load
		$result			= $RecordObj_dd->set_term($sample_value);

		$expected	= 'boolean';
		$eq			= gettype($result)===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . gettype($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$result		= $RecordObj_dd->get_term();
		$expected	= $sample_value;
		$eq			= $result==$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);

		$RecordObj_dd->__destruct();
	}//end test_set_term



	/**
	* TEST_get_termino_by_tipo
	* @return void
	*/
	public function test_get_termino_by_tipo(): void {

		$test_term_id	= 'dd1';
		$result			= RecordObj_dd::get_termino_by_tipo($test_term_id, DEDALO_STRUCTURE_LANG);

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
	}//end test_get_termino_by_tipo



	/**
	* TEST_get_modelo_name
	* @return void
	*/
	public function test_get_modelo_name(): void {

		$test_term_id	= 'dd1';
		$RecordObj_dd	= new RecordObj_dd($test_term_id);
		$result			= $RecordObj_dd->get_modelo_name();

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
	}//end test_get_modelo_name



	/**
	* TEST_get_modelo_name_by_tipo
	* @return void
	*/
	public function test_get_modelo_name_by_tipo(): void {

		$test_term_id	= 'dd1';
		$result			= RecordObj_dd::get_modelo_name_by_tipo($test_term_id);

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
	}//end test_get_modelo_name_by_tipo



	/**
	* TEST_get_legacy_model_name_by_tipo
	* @return void
	*/
	public function test_get_legacy_model_name_by_tipo(): void {

		$test_term_id	= 'hierarchy92';
		$result			= RecordObj_dd::get_legacy_model_name_by_tipo($test_term_id);

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

		$result		= RecordObj_dd::get_modelo_name_by_tipo($test_term_id);
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
		$RecordObj_dd	= new RecordObj_dd($test_term_id);
		$result			= $RecordObj_dd->get_legacy_model_name();

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

		$result		= $RecordObj_dd->get_modelo_name();
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
		$result			= RecordObj_dd::get_lang_by_tipo($test_term_id);

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

		$result = RecordObj_dd::get_lang_by_tipo('rsc36');

		$expected	= DEDALO_DATA_LANG;
		$eq			= $result===$expected;
		$this->assertTrue(
			$eq,
			'expected equal true' . PHP_EOL
				. ' result: ' . to_string($result) . PHP_EOL
				. ' expected: ' . to_string($expected)
		);
	}//end test_get_lang_by_tipo



}//end class
