<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';

final class env_loader_Test extends TestCase {

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
}
