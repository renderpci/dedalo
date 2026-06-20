<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_value.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';

/**
* env_value is the single source of truth for .env quoting/serialization, shared by the
* migration writer and the runtime installer. These tests pin the contract directly
* (it was previously only exercised indirectly via the two writers): every quoted value
* must round-trip back through env_loader::parse unchanged, and stringify must produce the
* one agreed encoding for every PHP type.
*/
final class env_value_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); env_loader::reset(); }
	protected function tearDown() : void { env_loader::reset(); }

	/** @return array<string,array{0:string}> */
	public static function round_trip_values() : array {
		return [
			'plain token'            => ['localhost'],
			'with spaces'            => ['hello world'],
			'with hash'             => ['a # not-a-comment'],
			'with equals'            => ['k=v&x=y'],
			'with double quote'      => ['p@ss"w0rd'],
			'with single quote'      => ["it's a value"],
			'both quote kinds'       => ['mix \'a\' and "b"'],
			'json single-quotable'   => ['[{"code":"","api_ui":null}]'],
			'leading/trailing space' => ['  padded  '],
			'dollar and braces'      => ['http://h/${OTHER}/x'],
			'backslash'              => ['a\\b\\c'],
			'newline'                => ["line1\nline2"],
			'empty string'           => [''],
		];
	}

	#[DataProvider('round_trip_values')]
	public function test_quote_round_trips_through_env_loader(string $value) : void {
		$line   = 'K=' . env_value::quote($value);
		$parsed = env_loader::parse($line);
		$this->assertSame($value, $parsed['K'] ?? '__missing__', "round-trip failed for: " . json_encode($value));
	}

	public function test_stringify_encodes_each_type() : void {
		$this->assertSame('null',  env_value::stringify(null));
		$this->assertSame('true',  env_value::stringify(true));
		$this->assertSame('false', env_value::stringify(false));
		$this->assertSame('10',    env_value::stringify(10));
		$this->assertSame('localhost', env_value::stringify('localhost'));
		$this->assertSame('["a","b"]', env_value::stringify(['a', 'b']));
		$this->assertSame('{"srv":"tok"}', env_value::stringify(['srv' => 'tok']));
	}

	public function test_stringify_then_quote_then_parse_round_trips_arrays() : void {
		$value  = ['srv' => 'tok', 'list' => [1, 2, 3]];
		$line   = 'K=' . env_value::quote(env_value::stringify($value));
		$parsed = env_loader::parse($line);
		$this->assertSame($value, json_decode($parsed['K'], true));
	}
}
