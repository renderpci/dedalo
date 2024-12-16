<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class ontology_test extends TestCase {



	/**
	* GET_SAMPLE_DD_ROW
	* @return
	*/
	public static function get_sample_dd_row() {
		return json_decode('
			{
				"id": "16028305",
				"terminoID": "test102",
				"parent": "test45",
				"modelo": "dd1747",
				"esmodelo": "no",
				"esdescriptor": "si",
				"visible": "si",
				"norden": "28",
				"tld": "test",
				"traducible": "no",
				"relaciones": "null",
				"propiedades": null,
				"properties": null,
				"term2": null,
				"term": "{\"lg-spa\": \"section_id\"}"
			}
		');
	}//end get_sample_dd_row



	/**
	* TEST_class_vars
	* @return void
	*/
	public function test_class_vars() {

		// disable log
		logger_backend_activity::$enable_log = false;

		// ontology::$main_table
			$result		= ontology::$main_table;
			$expected	= 'matrix_ontology_main';
			$this->assertTrue(
				$result===$expected ,
				'expected:' . $expected . PHP_EOL
				.'result: ' .$result . PHP_EOL
			);

		// ontology::$main_section_tipo
			$result		= ontology::$main_section_tipo;
			$expected	= DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';
			$this->assertTrue(
				$result===$expected ,
				'expected:' . $expected . PHP_EOL
				.'result: ' .$result . PHP_EOL
			);

		// ontology::$main_section_tipo
			$result		= ontology::$cache_target_section_tipo;
			$expected	= [
				'dd'			=> 'ontology40',
				'ontology'		=> 'ontology41',
				'localontology'	=> 'ontology42',
				'lg'			=> 'ontology43',
				'hierarchy'		=> 'ontology44',
				'rsc'			=> 'ontology45'
			];
			$this->assertTrue(
				$result===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
			);
	}//end test_class_vars



	/**
	* TEST_ceate_ontology_records
	* @return void
	*/
	public function test_ceate_ontology_records() {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$sample_dd_row = self::get_sample_dd_row();

		// force user id needed for search (filter by projects)
		$_SESSION['dedalo']['auth']['user_id'] = 1;

		$result = ontology::ceate_ontology_records( [$sample_dd_row] );

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$expected = true;
		$this->assertTrue(
			$result===$expected ,
			'expected:' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_ceate_ontology_records



	/**
	* TEST_add_section_record_from_jer_dd
	* @return void
	*/
	public function test_add_section_record_from_jer_dd() {

		$sample_dd_row = self::get_sample_dd_row();

		// force user id needed for search (filter by projects)
		$_SESSION['dedalo']['auth']['user_id'] = 1;

		$result = ontology::add_section_record_from_jer_dd( $sample_dd_row );

		$expected = true;
		$this->assertTrue(
			$result===$expected ,
			'expected:' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_add_section_record_from_jer_dd



	/**
	* TEST_get_ontology_main_from_tld
	* @return void
	*/
	public function test_get_ontology_main_from_tld() {

		// test tld
			$tld = 'dd';

			$result = ontology::get_ontology_main_from_tld( $tld );

			$expected = 'object';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);

			$expected = DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';
			$this->assertTrue(
				$result->section_tipo===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result section_tipo: ' . $result->section_tipo . PHP_EOL
			);

			$expected = 'Ontologies main';
			$this->assertTrue(
				$result->datos->label===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result datos->label: ' . $result->datos->label . PHP_EOL
			);

		// nonexitingtld tld
			$tld = 'nonexitingtld';

			$result = ontology::get_ontology_main_from_tld( $tld );

			$expected = 'NULL';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_get_ontology_main_from_tld



	/**
	* TEST_get_ontology_main_form_target_section_tipo
	* @return void
	*/
	public function test_get_ontology_main_form_target_section_tipo() {

		// target_section_tipo
			$target_section_tipo = 'ontology45';

			$result = ontology::get_ontology_main_form_target_section_tipo( $target_section_tipo );

			$expected = 'object';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);

			$expected = DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';
			$this->assertTrue(
				$result->section_tipo===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result section_tipo: ' . $result->section_tipo . PHP_EOL
			);

			$expected = '4';
			$this->assertTrue(
				$result->section_id===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result section_id: ' . $result->section_id . PHP_EOL
			);

		// nonexitingsectiontipo1 target_section_tipo
			$target_section_tipo = 'nonexitingsectiontipo1';

			$result = ontology::get_ontology_main_form_target_section_tipo( $target_section_tipo );

			$expected = 'NULL';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_get_ontology_main_form_target_section_tipo




	/**
	* TEST_assign_relations_from_jer_dd
	* @return void
	*/
	public function test_assign_relations_from_jer_dd() {

		// tld
			$tld = 'test';

			$result = ontology::assign_relations_from_jer_dd( $tld );

			$expected = 'boolean';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_assign_relations_from_jer_dd



	/**
	* TEST_reorder_nodes_from_jer_dd
	* @return void
	*/
	public function test_reorder_nodes_from_jer_dd() {

		// tld
			$tld = 'test';

			$result = ontology::reorder_nodes_from_jer_dd( $tld );

			$expected = 'boolean';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_reorder_nodes_from_jer_dd



	/**
	* TEST_add_main_section
	* @return void
	*/
	public function test_add_main_section() {

		// tld
			$tld = 'test';

			$result = ontology::add_main_section( $tld );

			$expected = 'NULL';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_add_main_section


	/**
	* TEST_create_jer_dd_local_ontology_section_node
	* @return void
	*/
	public function test_create_jer_dd_local_ontology_section_node() {

		// tld
			$tld = 'test';

			// Call the method under test
	   		$result = ontology::create_jer_dd_local_ontology_section_node($tld);
	   			dump($result, ' result ++ '.to_string());

			$expected = 'string';
			$this->assertTrue(
				gettype($result)===$expected ,
				'expected:' . to_string($expected) . PHP_EOL
				.'result type: ' . gettype($result) . PHP_EOL
			);
	}//end test_create_jer_dd_local_ontology_section_node



}//end class
