<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class ontology_data_io_test extends TestCase {



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	// /**
	// * GET_SAMPLE_DD_ROW
	// * @return
	// */
	// public static function get_sample_dd_row() {
	// 	return json_decode('
	// 		{
	// 			"id": "16028305",
	// 			"terminoID": "test102",
	// 			"parent": "test45",
	// 			"modelo": "dd1747",
	// 			"is_model": false,
	// 			"esdescriptor": "si",
	// 			"visible": "si",
	// 			"order_number": "28",
	// 			"tld": "test",
	// 			"translatable": false,
	// 			"relaciones": "null",
	// 			"propiedades": null,
	// 			"properties": null,
	// 			"term2": null,
	// 			"term": "{\"lg-spa\": \"section_id\"}"
	// 		}
	// 	');
	// }//end get_sample_dd_row



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_class_vars
	* @return void
	*/
	public function test_class_vars() {

		// ontology::$main_table
			$result		= ontology_data_io::$dd_tables;
			$expected	= ['matrix_dd','matrix_counter_dd','matrix_layout_dd'];
			$this->assertTrue(
				$result===$expected ,
				'expected: ' . to_string($expected) . PHP_EOL
				.'result: ' . to_string($result) . PHP_EOL
			);
	}//end test_class_vars



	/**
	* TEST_export_ontology_info
	* @return void
	*/
	public function test_export_ontology_info() {

		$response = ontology_data_io::export_ontology_info();

		$expected = 'object';
		$this->assertTrue(
			gettype($response)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response type: ' . gettype($response) . PHP_EOL
		);

		$expected = true;
		$this->assertTrue(
			$response->result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response->result: ' . to_string($response->result) . PHP_EOL
		);

		$expected = true;
		$this->assertTrue(
			empty($response->errors)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response->result: ' . to_string( empty($response->errors) ) . PHP_EOL
		);

		$expected = 'object';
		$this->assertTrue(
			gettype($response->data)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response type: ' . gettype($response->data) . PHP_EOL
			.' response: ' . to_string($response)
		);

		$expected = DEDALO_ENTITY;
		$this->assertTrue(
			$response->data->entity===$expected ,
			 ' expected: ' . to_string($expected) . PHP_EOL
			.' response->data->entity: ' . to_string($response->data->entity) . PHP_EOL
			.' response->data->entity type: ' . gettype($response->data->entity) . PHP_EOL
			.' response: ' . to_string($response)
		);

		$expected = 'string';
		$this->assertTrue(
			gettype($response->path_file)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response type: ' . gettype($response->path_file) . PHP_EOL
			.' response: ' . to_string($response)
		);

		$expected = 'integer';
		$this->assertTrue(
			gettype($response->saved)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response type: ' . gettype($response->saved) . PHP_EOL
			.' response: ' . to_string($response)
		);
	}//end test_export_ontology_info



	/**
	* TEST_set_ontology_io_path
	* @return void
	*/
	public function test_set_ontology_io_path() {

		$result = ontology_data_io::set_ontology_io_path();

		$expected = 'string';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
		);

		$dedalo_version	= get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];

		$base_name = basename($result);

		$expected = $version_path;
		$this->assertTrue(
			$base_name===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'base_name: ' . to_string($base_name) . PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_set_ontology_io_path



	/**
	* TEST_get_ontology_io_path
	* @return void
	*/
	public function test_get_ontology_io_path() {

		$result = ontology_data_io::get_ontology_io_path();

		$expected = 'string';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);

		$dedalo_version	= get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];

		$base_name = basename($result);

		$expected = $version_path;
		$this->assertTrue(
			$base_name===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'base_name: ' . to_string($base_name) . PHP_EOL
			.' result: ' . to_string($result)
		);


		$dedalo_fake_version	= [6,9,128];
		$result = ontology_data_io::get_ontology_io_path( $dedalo_fake_version );

		$expected = FALSE;
		$this->assertTrue(
			$result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_get_ontology_io_path



	/**
	* TEST_get_ontology_io_url
	* @return void
	*/
	public function test_get_ontology_io_url() {

		$result = ontology_data_io::get_ontology_io_url();

		$expected = 'string';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
		);

		$dedalo_version	= get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];

		$base_name = basename($result);

		$expected = $version_path;
		$this->assertTrue(
			$base_name===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'base_name: ' . to_string($base_name) . PHP_EOL
			.' result: ' . to_string($result)
		);


		$dedalo_fake_version	= [6,9,128];
		$result = ontology_data_io::get_ontology_io_url( $dedalo_fake_version );

		$expected = FALSE;
		$this->assertTrue(
			$result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_get_ontology_io_url



	/**
	* TEST_update_ontology_info
	* @return void
	*/
	public function test_update_ontology_info() {

		$result = ontology_data_io::update_ontology_info();


		$expected = 'boolean';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);

		$expected = true;
		$this->assertTrue(
			$result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_update_ontology_info



	/**
	* TEST_export_to_file
	* @return void
	*/
	public function test_export_to_file() {

		$tld = 'test';

		$result = ontology_data_io::export_to_file( $tld );


		$expected = 'object';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);

		$base_name = basename($result->debug->file_path);

		$expected = $tld . '.copy.gz';
		$this->assertTrue(
			$base_name===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'base_name: ' . to_string($base_name) . PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_export_to_file



	/**
	* TEST_export_private_lists_to_file
	* @return void
	*/
	public function test_export_private_lists_to_file() {

		$result = ontology_data_io::export_private_lists_to_file();


		$expected = 'object';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);

		$base_name = basename($result->debug->file_path);

		$expected = 'matrix_dd.copy.gz';
		$this->assertTrue(
			$base_name===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'base_name: ' . to_string($base_name) . PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_export_private_lists_to_file



	/**
	* TEST_import_from_file
	* @return void
	*/
	public function test_import_from_file() {

		$file_item = (object)[
			'section_tipo'	=> 'test0',
			'tld'			=> 'test',
			'url'			=> 'https://master.dedalo.dev/dedalo/import/ontology/6.4/XXXX0_dd.copy.gz'
		];

		$result = ontology_data_io::import_from_file($file_item);


		$expected = 'object';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);


		$expected = false;
		$this->assertTrue(
			$result->result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);

		$expected = false;
		$this->assertTrue(
			empty($result->errors)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_import_from_file



	/**
	* TEST_import_private_lists_from_file
	* @return void
	*/
	public function test_import_private_lists_from_file() {

		$file_item = (object)[
			'section_tipo'	=> 'test0',
			'tld'			=> 'test',
			'url'			=> 'https://master.dedalo.dev/dedalo/import/ontology/6.4/matrix_dd.copy.gz'
		];

		$result = ontology_data_io::import_private_lists_from_file($file_item);

		$expected = 'object';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);

		$expected = true;
		$this->assertTrue(
			$result->result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);

		$expected = true;
		$this->assertTrue(
			empty($result->errors)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);

		$base_name = basename($result->debug->file_path);

		$expected = 'matrix_dd.copy.gz';
		$this->assertTrue(
			$base_name===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'base_name: ' . to_string($base_name) . PHP_EOL
		);
	}//end test_import_private_lists_from_file



	/**
	* TEST_download_remote_ontology_file
	* @return void
	*/
	public function test_download_remote_ontology_file() {

		// bad URL
		$url = 'https://master.dedalo.dev/dedalo/import/ontology/6.4/fakeurl';

		$result = ontology_data_io::download_remote_ontology_file( $url );


		$expected = 'object';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
			.' result: ' . to_string($result)
		);

		$expected = false;
		$this->assertTrue(
			$result->result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);

		// good URL
		$url = 'https://master.dedalo.dev/dedalo/install/import/ontology/6.4/test.copy.gz';

		$result = ontology_data_io::download_remote_ontology_file( $url );
			// dump($result, ' test_download_remote_ontology_file result ++ '.to_string());

		$expected = true;
		$this->assertTrue(
			empty($result->errors)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);
	}//end test_download_remote_ontology_file



	/**
	* TEST_get_ontology_update_info
	* @return void
	*/
	public function test_get_ontology_update_info() {

		// bad version
		$version = [96,34,100];

		$result = ontology_data_io::get_ontology_update_info( $version );

		$expected = 'object';
		$this->assertTrue(
			gettype($result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result type: ' . gettype($result) . PHP_EOL
		);

		$expected = false;
		$this->assertTrue(
			$result->result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
		);

		// good version
		// $version = [6,4,0];
		$version = get_dedalo_version();

		$response = ontology_data_io::get_ontology_update_info( $version );

		$expected = 'object';
		$this->assertTrue(
			gettype($response)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response type: ' . gettype($response) . PHP_EOL
		);

		$expected = true;
		$this->assertTrue(
			empty($response->errors)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response: ' . to_string($response) . PHP_EOL
		);

		$expected = 'object';
		$this->assertTrue(
			gettype($response->result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response->result type: ' . gettype($response->result) . PHP_EOL
		);

		$result = $response->result;

		$expected = 'object';
		$this->assertTrue(
			gettype($result->info)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result->info type: ' . gettype($result->info) . PHP_EOL
		);

		$expected = 'string';
		$this->assertTrue(
			gettype($result->info->date)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result->date type: ' . gettype($result->info->date) . PHP_EOL
		);

		$expected = DEDALO_ENTITY;
		$this->assertTrue(
			$result->info->entity===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result->entity: ' . to_string($result->info->entity) . PHP_EOL
		);

		$expected = implode('.', $version);
		$this->assertTrue(
			$result->info->version===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result->version: ' . to_string($result->info->version) . PHP_EOL
		);

		$expected = 'array';
		$this->assertTrue(
			gettype($result->info->active_ontologies)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result->active_ontologies type: ' . gettype($result->info->active_ontologies) . PHP_EOL
		);

		$expected = 'array';
		$this->assertTrue(
			gettype($result->files)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'result->files type: ' . gettype($result->files) . PHP_EOL
		);
	}//end test_get_ontology_update_info



	/**
	* TEST_check_remote_server
	* @return void
	*/
	public function test_check_remote_server() {

		// bad URL
		$server = (object)[
			'url' => 'https://master.render.es/dedalo'
		];

		$response = ontology_data_io::check_remote_server( $server );
			// dump($response, ' test_check_remote_server response 1 ++ '.to_string());

		$expected = 'object';
		$this->assertTrue(
			gettype($response)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response type: ' . gettype($response) . PHP_EOL
			.'response: ' . to_string($response) . PHP_EOL
		);

		$expected = 'NULL';
		$this->assertTrue(
			gettype($response->result)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response type: ' . gettype($response->result) . PHP_EOL
			.'response: ' . to_string($response) . PHP_EOL
		);

		$expected = NULL;
		$this->assertTrue(
			$response->result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response: ' . to_string($response) . PHP_EOL
		);

		// good URL
		$server = (object)[
			'url' => 'https://master.dedalo.dev/dedalo/core/api/v1/json/'
		];

		$response = ontology_data_io::check_remote_server( $server );
			// dump($response, ' test_check_remote_server response 2 ++ '.to_string());

		$expected = true;
		$this->assertTrue(
			empty($response->errors)===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response: ' . to_string($response) . PHP_EOL
		);

		$expected = true;
		$this->assertTrue(
			$response->result->result===$expected ,
			'expected: ' . to_string($expected) . PHP_EOL
			.'response->result->result: ' . to_string($response->result->result) . PHP_EOL
			.'response: ' . to_string($response) . PHP_EOL
		);
	}//end test_check_remote_server



}//end class
