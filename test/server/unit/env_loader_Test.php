<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';

final class env_loader_Test extends TestCase {

	protected function setUp() : void {
		parent::setUp();
		env_loader::reset();
	}

	protected function tearDown() : void {
		env_loader::reset();
	}

	public function test_parse_basic_key_value() : void {
		$out = env_loader::parse("FOO=bar\nBAZ=qux");
		$this->assertSame(['FOO' => 'bar', 'BAZ' => 'qux'], $out);
	}

	public function test_parse_skips_comments_and_blank_lines() : void {
		$out = env_loader::parse("# a comment\n\nFOO=bar\n   # indented comment\n");
		$this->assertSame(['FOO' => 'bar'], $out);
	}

	public function test_parse_single_quotes_are_literal() : void {
		// single quotes preserve $ and # verbatim, no interpolation
		$out = env_loader::parse("PW='p\$a#ss word'");
		$this->assertSame('p$a#ss word', $out['PW']);
	}

	public function test_parse_double_quotes_process_escapes() : void {
		$out = env_loader::parse('MSG="line1\nline2"');
		$this->assertSame("line1\nline2", $out['MSG']);
	}

	public function test_parse_unquoted_strips_trailing_inline_comment() : void {
		$out = env_loader::parse("HOST=localhost # the db host");
		$this->assertSame('localhost', $out['HOST']);
	}

	public function test_parse_rejects_invalid_keys() : void {
		$out = env_loader::parse("bad-key=1\nlower=2\n9NUM=3\nGOOD_KEY=4");
		$this->assertSame(['GOOD_KEY' => '4'], $out);
	}

	public function test_parse_strips_optional_export_prefix() : void {
		$out = env_loader::parse("export FOO=bar");
		$this->assertSame(['FOO' => 'bar'], $out);
	}

	public function test_parse_no_variable_interpolation() : void {
		// ${OTHER} must NOT be expanded
		$out = env_loader::parse('URL=http://host/${OTHER}/x');
		$this->assertSame('http://host/${OTHER}/x', $out['URL']);
	}

	private function write_env(string $content, int $perms = 0600) : string {
		$path = sys_get_temp_dir() . '/dedalo_envtest_' . getmypid() . '_' . uniqid() . '.env';
		file_put_contents($path, $content);
		chmod($path, $perms);
		return $path;
	}

	public function test_load_then_get_returns_value() : void {
		$path = $this->write_env("DB_HOST=db.internal\nDB_PORT=5432");
		env_loader::load($path);
		$this->assertSame('db.internal', env_loader::get('DB_HOST'));
		$this->assertSame(5432, env_loader::get_int('DB_PORT'));
		unlink($path);
	}

	public function test_get_returns_default_when_absent() : void {
		$this->assertSame('fallback', env_loader::get('NOT_SET', 'fallback'));
		$this->assertNull(env_loader::get('NOT_SET'));
		$this->assertFalse(env_loader::has('NOT_SET'));
	}

	public function test_real_process_env_wins_over_file() : void {
		putenv('DEDALO_ENVTEST_WIN=from_real_env');
		$path = $this->write_env('DEDALO_ENVTEST_WIN=from_file');
		env_loader::load($path);
		$this->assertSame('from_real_env', env_loader::get('DEDALO_ENVTEST_WIN'));
		putenv('DEDALO_ENVTEST_WIN'); // unset
		unlink($path);
	}

	public function test_load_refuses_group_or_world_writable_file() : void {
		$path = $this->write_env('SECRET=should_not_load', 0666);
		env_loader::load($path);
		$this->assertNull(env_loader::get('SECRET')); // refused, nothing loaded
		$this->assertFalse(env_loader::has('SECRET'), 'over-permissive .env file must not be loaded');
		unlink($path);
	}

	public function test_load_missing_file_is_noop_unless_required() : void {
		$missing = sys_get_temp_dir() . '/dedalo_envtest_missing_' . uniqid() . '.env';
		env_loader::load($missing); // no throw
		$this->assertNull(env_loader::get('ANYTHING'));
		$this->expectException(\RuntimeException::class);
		env_loader::load($missing, true); // required => throws
	}

	public function test_get_bool_coercion() : void {
		$path = $this->write_env("FLAG_ON=true\nFLAG_OFF=no");
		env_loader::load($path);
		$this->assertTrue(env_loader::get_bool('FLAG_ON'));
		$this->assertFalse(env_loader::get_bool('FLAG_OFF'));
		$this->assertNull(env_loader::get_bool('FLAG_MISSING'));
		unlink($path);
	}

	public function test_get_json_decodes_or_defaults() : void {
		$path = $this->write_env('LIST=\'["a","b"]\'' . "\nBADJSON='{not json'");
		env_loader::load($path);
		$this->assertSame(['a', 'b'], env_loader::get_json('LIST'));
		$this->assertSame([], env_loader::get_json('BADJSON', []));
		unlink($path);
	}
}
