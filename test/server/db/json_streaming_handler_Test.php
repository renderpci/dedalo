<?php declare(strict_types=1);
// bootstrap
require_once dirname(__FILE__, 2) . '/bootstrap.php';

/**
* JSON_STREAMING_HANDLER_TEST
* Regression tests for json_streaming_handler::stream (DB-04): the chunked
* streaming path must preserve object semantics. The previous code routed any
* large array — including associative arrays — through stream_array, which
* reindexes its chunk buffer and strips brackets, dropping string keys and
* emitting a values-only list instead of the intended object.
*/
final class json_streaming_handler_test extends BaseTestCase {



	/**
	* Helper: capture the echoed stream output.
	*/
	private function capture_stream($value, int $chunk_size) : string {
		ob_start();
		json_streaming_handler::stream($value, 0, $chunk_size);
		return (string) ob_get_clean();
	}//end capture_stream



	/**
	* TEST_LARGE_LIST_ROUND_TRIPS
	* A large sequential list streamed in small chunks must round-trip exactly.
	* @return void
	*/
	public function test_large_list_round_trips() : void {

		$list = [];
		for ($i = 0; $i < 5; $i++) {
			$list[] = (object)['n' => $i, 'label' => "item_$i"];
		}

		// chunk_size 2 < count 5 forces the chunked streaming path
		$out = $this->capture_stream($list, 2);

		$decoded = json_decode($out, true);
		$this->assertSame(
			json_decode(json_encode($list), true),
			$decoded,
			'large list must stream as an equivalent JSON array'
		);
	}//end test_large_list_round_trips



	/**
	* TEST_LARGE_ASSOC_PRESERVES_KEYS
	* DB-04: a large ASSOCIATIVE array must stream as an object preserving keys,
	* not as a values-only array.
	* @return void
	*/
	public function test_large_assoc_preserves_keys() : void {

		$assoc = [];
		for ($i = 0; $i < 5; $i++) {
			$assoc["key_$i"] = "value_$i";
		}

		// chunk_size 2 < count 5 — would have hit the broken stream_array path
		$out = $this->capture_stream($assoc, 2);

		$decoded = json_decode($out, true);
		$this->assertSame(
			$assoc,
			$decoded,
			'large associative array must keep its string keys (stream as an object)'
		);
		// guard against the regression shape (a bare list of values)
		$this->assertFalse(
			array_is_list($decoded ?? []),
			'streamed associative array must not collapse to a values-only list'
		);
	}//end test_large_assoc_preserves_keys



}//end class json_streaming_handler_test
