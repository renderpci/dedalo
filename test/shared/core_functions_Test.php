<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class core_functions_test extends TestCase {



	/**
	* TEST_dump
	* @return void
	*/
	public function test_dump() {

		$var = (object)[
			'prop1' => 'a',
			'prop2' => 'b'
		];

		$result = dump($var, ' var ++ '.to_string());

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected gettype($result)==="string" true, but received is: '
				. to_string( $eq )
		);
	}//end test_dump



	/**
	* TEST_get_user_id
	* @return void
	*/
	public function test_get_user_id() {

		$result = get_user_id();

		$eq = gettype($result)==='integer' || gettype($result)==='NULL';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_user_id



	/**
	* TEST_get_username
	* @return void
	*/
	public function test_get_username() {

		$result = get_username();

		$eq = gettype($result)==='string' || gettype($result)==='NULL';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_username



	/**
	* TEST_debug_log
	* @return void
	*/
	public function test_debug_log() {

		$result = debug_log(__METHOD__
			. " Test message " . PHP_EOL
			. to_string()
			, logger::DEBUG
		);

		$eq = gettype($result)==='NULL';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_debug_log



	/**
	* TEST_curl_request
	* @return void
	*/
	public function test_curl_request() {

		$api_url = defined('DEDALO_API_URL_UNIT_TEST')
			? DEDALO_API_URL_UNIT_TEST
			: 'https://localhost:8443/' .DEDALO_API_URL;

		$response = curl_request((object)[
			'url'			=> $api_url,
			'post'			=> true,
			'header'		=> false,
			'httpheader'	=> array('Content-Type:application/json')
		]);

		$eq = gettype($response)==='object';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $response->code===200;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq ) .PHP_EOL
				. ' response code: ' . to_string( $response->code ) . PHP_EOL
				. ' api_url: ' . $api_url
		);
	}//end test_curl_request



	/**
	* TEST_start_time
	* @return void
	*/
	public function test_start_time() {

		$result = start_time();

		$eq = gettype($result)==='integer';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_start_time



	/**
	* TEST_exec_time_unit
	* @return void
	*/
	public function test_exec_time_unit() {

		$result = exec_time_unit(
			start_time()
		);

		$eq = gettype($result)==='double';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_exec_time_unit



	/**
	* TEST_to_string
	* @return void
	*/
	public function test_to_string() {

		$value = [1,2,3];

		$result = to_string(
			$value
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='1|2|3';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_to_string



	/**
	* TEST_get_last_modification_date
	* @return void
	*/
	public function test_get_last_modification_date() {

		$path = DEDALO_CORE_PATH;

		$result = get_last_modification_date(
			$path
		);

		// $date = date("d-m-Y H:i:s ", $result);
		// dump($result, ' result ++ '.to_string());
		// dump($date, ' date ++ '.to_string());

		$eq = gettype($result)==='integer';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_last_modification_date



	/**
	* TEST_get_last_modified_file
	* @return void
	*/
	public function test_get_last_modified_file() {

		$path = DEDALO_CORE_PATH;

		$result = get_last_modified_file(
			$path,
			['php','js']
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_last_modified_file



	/**
	* TEST_dedalo_encrypt_openssl
	* @return void
	*/
	public function test_dedalo_encrypt_openssl() {

		$result = dedalo_encrypt_openssl(
			'random value to encrypt 254!ñpod^üà87',
			'random key 54564as89hdfs*ç|we?ïG'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_dedalo_encrypt_openssl



	/**
	* TEST_dedalo_decrypt_openssl
	* @return void
	*/
	public function test_dedalo_decrypt_openssl() {

		$result = dedalo_decrypt_openssl(
			'V01mZEZJOTYvSkpLeUZQL3RvZUgxb0laa1lhVjRZWThmdG1aSGJnL1BjY3JxaE1YNHdkcHdqeTMrcFh3VjNUa0dIOTdVZUxycnlsUFZnT2lvR0N4Y2c9PQ==',
			'random key 54564as89hdfs*ç|we?ïG'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_dedalo_decrypt_openssl



	/**
	* TEST_is_serialized
	* @return void
	*/
	public function test_is_serialized() {

		$value = serialize('value to serialize 1');

		$result = is_serialized(
			$value
		);

		$eq = gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$result = is_serialized(
			'value to serialize 1'
		);

		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_is_serialized



	/**
	* TEST_array_key_path
	* @return void
	*/
	public function test_array_key_path() {

		$needle = 'a';
		$haystack = [
			'b' => 1,
			'c' => 2,
			'a' => 3
		];

		$result = array_key_path(
			$needle,
			$haystack
		);

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = json_encode($result)===json_encode(['a']);
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_array_key_path



	/**
	* TEST_array_keys_recursive
	* @return void
	*/
	public function test_array_keys_recursive() {

		$haystack = [
			'b' => 1,
			'c' => 2,
			'a' => [
				'd' => 3,
				'e' => 4,
				'f' => 5
			]
		];

		$result = array_keys_recursive(
			$haystack
		);

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = json_encode($result)===json_encode([
		    "b",
		    "c",
		    "a",
		    "d",
		    "e",
		    "f"
		]);
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_array_keys_recursive



	/**
	* TEST_array_flatten
	* @return void
	*/
	public function test_array_flatten() {

		$haystack = [
			'b' => 1,
			'c' => 2,
			'a' => [
				'd' => 3,
				'e' => 4,
				'f' => 5
			]
		];

		$result = array_flatten(
			$haystack
		);

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = json_encode($result)===json_encode([
		    "b" => 1,
		    "c" => 2,
		    "d" => 3,
		    "e" => 4,
		    "f" => 5
		]);
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_array_flatten



	/**
	* TEST_rearrange_array
	* @return void
	*/
	public function test_rearrange_array() {

		$haystack = [
			1,2,3,4,5
		];

		$result = rearrange_array(
			$haystack,
			3
		);

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = json_encode($result)===json_encode([
			4,
			5,
			1,
			2,
			3
		]);
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_rearrange_array



	/**
	* TEST_is_associative
	* @return void
	*/
	public function test_is_associative() {

		// false case
			$haystack = [
				1,2,3,4,5
			];

			$result = is_associative(
				$haystack
			);

			$eq = gettype($result)==='boolean';
			$this->assertTrue(
				$eq,
				'expected true, but received is: '
					. to_string( $eq )
			);

			$eq = $result===false;
			$this->assertTrue(
				$eq,
				'expected true, but received is: '
					. to_string( $eq )
			);

		// true case
			$haystack = [
				'a' => 1,
				'b' => 2,
				'c' => 3
			];

			$result = is_associative(
				$haystack
			);

			$eq = $result===true;
			$this->assertTrue(
				$eq,
				'expected true, but received is: '
					. to_string( $eq )
			);
	}//end test_is_associative



	/**
	* TEST_sanitize_query
	* @return void
	*/
	public function test_sanitize_query() {

		$result = sanitize_query(
			' 	my query 	 --	'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='my query  --';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_sanitize_query



	/**
	* TEST_fix_cascade_config_var
	* @return void
	*/
	public function test_fix_cascade_config_var() {

		$result = fix_cascade_config_var(
			'calasparra',
			'conejera'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='conejera';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_fix_cascade_config_var



	/**
	* TEST_verify_dedalo_prefix_tipos
	* @return void
	*/
	public function test_verify_dedalo_prefix_tipos() {

		$result = verify_dedalo_prefix_tipos(
			'calasparra'
		);

		$eq = gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_verify_dedalo_prefix_tipos



	/**
	* TEST_search_string_in_array
	* @return void
	*/
	public function test_search_string_in_array() {

		$array = [
			'cät',
			'dóg',
			'hôrse'
		];

		$result = search_string_in_array(
			$array,
			'cat'
		);

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===["cät"];
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_search_string_in_array



	/**
	* TEST_add_accents
	* @return void
	*/
	public function test_add_accents() {

		$result = add_accents(
			'gàvia'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='gàv[iìíîï][aàáâãäå]';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_add_accents



	/**
	* TEST_array_get_by_key
	* @return void
	*/
	public function test_array_get_by_key() {

		$array = [
			'a' => 1,
			'b' => 2,
			'c' => 3
		];

		$result = array_get_by_key(
			$array,
			'b'
		);

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===[2];
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_array_get_by_key



	/**
	* TEST_array_get_by_key_r
	* @return void
	*/
	public function test_array_get_by_key_r() {

		$array = [
			'a' => 1,
			'b' => 2,
			'c' => 3
		];
		$results = [
			4
		];

		$result = array_get_by_key_r(
			$array,
			'b',
			$results
		);

		$eq = gettype($result)==='NULL';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $results===[4,2];
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_array_get_by_key_r



	/**
	* TEST_decbin32
	* @return void
	*/
	public function test_decbin32() {

		$result = decbin32(
			19685
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='00000000000000000100110011100101';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_decbin32



	/**
	* TEST_ip_in_range
	* @return void
	*/
	public function test_ip_in_range() {

		$result = ip_in_range(
			'192.168.0.78',
			'192.168.0.*'
		);

		$eq = gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// false case
		$result = ip_in_range(
			'192.168.0.78',
			'193.168.0.*'
		);

		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_ip_in_range



	/**
	* TEST_br2nl
	* @return void
	*/
	public function test_br2nl() {

		$result = br2nl(
			'lorem ipsum <br> continum'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='lorem ipsum '.PHP_EOL.' continum';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_br2nl



	/**
	* TEST_get_http_response_code
	* @return void
	*/
	public function test_get_http_response_code() {

		$result = get_http_response_code(
			'https://dedalo.dev'
		);

		$eq = gettype($result)==='integer';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===200;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_http_response_code



	/**
	* TEST_dd_memory_usage
	* @return void
	*/
	public function test_dd_memory_usage() {

		$result = dd_memory_usage();

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_dd_memory_usage



	/**
	* TEST_app_lang_to_tld2
	* @return void
	*/
	public function test_app_lang_to_tld2() {

		$result = app_lang_to_tld2(
			'lg-eng'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='en';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_app_lang_to_tld2



	/**
	* TEST_str_lreplace
	* @return void
	*/
	public function test_str_lreplace() {

		$result = str_lreplace(
			'dog',
			'cat',
			'dog is jumping'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='cat is jumping';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_str_lreplace



	/**
	* TEST_get_request_var
	* @return void
	*/
	public function test_get_request_var() {

		$result = get_request_var(
			'tipo'
		);

		$eq = gettype($result)==='NULL';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===NULL;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_request_var



	/**
	* TEST_safe_xss
	* @return void
	*/
	public function test_safe_xss() {

		$result = safe_xss(
			'tipo<?php echo $var;'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='tipo';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_safe_xss



	/**
	* TEST_safe_sql_query
	* @return void
	*/
	public function test_safe_sql_query() {

		$result = safe_sql_query(
			'SELECT * FROM matrix LIMIT 10'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='SELECT * FROM matrix LIMIT 10';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_safe_sql_query



	/**
	* TEST_session_start_manager
	* @return void
	*/
	public function test_session_start_manager() {

		$result = session_start_manager(
			[
				'session_name' => 'test_session'
			]
		);

		$eq = gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// if(session_status()===PHP_SESSION_ACTIVE) {
		// 	$eq = $result===true;
		// }else{
		// 	$eq = $result===false;
		// }
		// $this->assertTrue(
		// 	$eq,
		// 	'expected true, but received is: '
		// 		. to_string( $eq )
		// );
	}//end test_session_start_manager



	/**
	* TEST_safe_table
	* @return void
	*/
	public function test_safe_table() {

		$result = safe_table('my strange table <?php exit();');

		$eq = gettype($result)==='string' || gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// true
		$result = safe_table('matrix_activity');

		$eq = $result==='matrix_activity';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_safe_table



	/**
	* TEST_safe_lang
	* @return void
	*/
	public function test_safe_lang() {

		$result = safe_lang('en');

		$eq = gettype($result)==='string' || gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// true
		$result = safe_lang('lg-spa');

		$eq = $result==='lg-spa';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_safe_lang



	/**
	* TEST_safe_tipo
	* @return void
	*/
	public function test_safe_tipo() {

		$result = safe_tipo('rsc98wq');

		$eq = gettype($result)==='string' || gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// true
		$result = safe_tipo('rsc197');

		$eq = $result==='rsc197';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_safe_tipo



	/**
	* TEST_safe_section_id
	* @return void
	*/
	public function test_safe_section_id() {

		$result = safe_section_id('19875Wq6');

		$eq = gettype($result)==='string' || gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// true
		$result = safe_section_id(3658);

		$eq = $result===3658;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_safe_section_id



	/**
	* TEST_format_size_units
	* @return void
	*/
	public function test_format_size_units() {

		$result = format_size_units(1987458745);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='1.85 GB';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_format_size_units



	/**
	* TEST_encodeURIComponent
	* @return void
	*/
	public function test_encodeURIComponent() {

		$result = encodeURIComponent('?tipo=rsc15&mode=edit');

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='%3Ftipo%3Drsc15%26mode%3Dedit';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_encodeURIComponent



	/**
	* TEST_show_msg
	* @return void
	*/
	public function test_show_msg() {

		$result = show_msg('test message 1');

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_show_msg



	/**
	* TEST_get_current_version_in_db
	* @return void
	*/
	public function test_get_current_version_in_db() {

		$result = get_current_version_in_db('test message 1');

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result[0]===6;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_current_version_in_db



	/**
	* TEST_get_dedalo_version
	* @return void
	*/
	public function test_get_dedalo_version() {

		$result = get_dedalo_version('test message 1');

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result[0]===6;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_dedalo_version



	/**
	* TEST_check_basic_system
	* @return void
	*/
	public function test_check_basic_system() {

		$result = check_basic_system();

		$eq = gettype($result)==='object';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result->result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_check_basic_system



	/**
	* TEST_array_find
	* @return void
	*/
	public function test_array_find() {

		$array = [
			(object)[
				'label' => 'a',
				'value' => 1
			],
			(object)[
				'label' => 'b',
				'value' => 2
			],
			(object)[
				'label' => 'c',
				'value' => 3
			]
		];

		$result = array_find(
			$array,
			function($el) {
				return $el->value===2;
			}
		);

		$eq = json_encode($result)===json_encode($array[1]);
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_array_find



	/**
	* TEST_get_object_property
	* @return void
	*/
	public function test_get_object_property() {

		$object = (object)[
			'label' => 'a',
			'value' => 1
		];
		$ar_property_path = ['value'];

		$result = get_object_property(
			$object,
			$ar_property_path
		);

		$eq = $result===1;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_object_property



	/**
	* TEST_get_legacy_constant_value
	* @return void
	*/
	public function test_get_legacy_constant_value() {


		$result = get_legacy_constant_value(
			'DEDALO_PREFIX_TIPOS'
		);

		$eq = gettype($result)==='array';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_legacy_constant_value



	/**
	* TEST_test_php_version_supported
	* @return void
	*/
	public function test_test_php_version_supported() {

		$result = test_php_version_supported(
			'8.2.0'
		);

		$eq = gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_test_php_version_supported



	/**
	* TEST_sanitize_file_name
	* @return void
	*/
	public function test_sanitize_file_name() {

		$result = sanitize_file_name(
			'My field name ü calçot de aña .JPEG'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='my-field-name-cal-ot-de-a-a.jpeg';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_sanitize_file_name



	/**
	* TEST_beautify_filename
	* @return void
	*/
	public function test_beautify_filename() {

		$result = beautify_filename(
			'My field name ü calçot de aña .JPEG'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='my-field-name-ü-calçot-de-aña.jpeg';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_beautify_filename



	/**
	* TEST_callback
	* @return void
	*/
	public function test_callback() {

		$result = callback(
			function() {
				error_log('Executing function');
				return true;
			}
		);

		$eq = gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_callback



	/**
	* TEST_build_link
	* @return void
	*/
	public function test_build_link() {

		$result = build_link(
			'name of the link',
			['url' => 'https://dedalo.dev']
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_build_link



	/**
	* TEST_is_empty_dato
	* @return void
	*/
	public function test_is_empty_dato() {

		// 1 true
		$result = is_empty_dato(
			''
		);

		$eq = gettype($result)==='boolean';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// 2 true
		$result = is_empty_dato(
			[]
		);
		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// 3 true
		$result = is_empty_dato(
			[null]
		);
		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// 4 true
		$result = is_empty_dato(
			['']
		);
		$eq = $result===true;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// 5 false
		$result = is_empty_dato(
			[null,'a']
		);
		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		// 6 false
		$result = is_empty_dato(
			0.07
		);
		$eq = $result===false;
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_is_empty_dato



	/**
	* TEST_get_file_extension
	* @return void
	*/
	public function test_get_file_extension() {

		$result = get_file_extension(
			'my file.gif'
		);

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);

		$eq = $result==='gif';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_file_extension



	/**
	* TEST_get_client_ip
	* @return void
	*/
	public function test_get_client_ip() {

		$result = get_client_ip();

		$eq = gettype($result)==='string';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_client_ip



	/**
	* TEST_get_cookie_properties
	* @return void
	*/
	public function test_get_cookie_properties() {

		$result = get_cookie_properties();

		$eq = gettype($result)==='object';
		$this->assertTrue(
			$eq,
			'expected true, but received is: '
				. to_string( $eq )
		);
	}//end test_get_cookie_properties



}//end class core_functions_test