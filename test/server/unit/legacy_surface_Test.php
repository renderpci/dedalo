<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.legacy_surface.php';

final class legacy_surface_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) {
			mkdir($this->dir, 0755, true);
		}
	}

	private function write(string $name, string $php) : string {
		$path = $this->dir . '/' . $name;
		file_put_contents($path, $php);
		return $path;
	}

	public function test_extracts_scalar_literals_with_values() : void {
		$f = $this->write('ls_literals.php', <<<'PHP'
		<?php
		define('LIT_INT', 222);
		define('LIT_NEG', -5);
		define('LIT_FLOAT', 1.5);
		define('LIT_STR', 'hello');
		define('LIT_BOOL_T', true);
		define('LIT_BOOL_F', false);
		define('LIT_NULL', null);
		PHP);

		$out = legacy_surface::extract([$f]);

		$this->assertSame('literal', $out['LIT_INT']['kind']);
		$this->assertSame(222, $out['LIT_INT']['value']);
		$this->assertSame(-5, $out['LIT_NEG']['value']);
		$this->assertSame(1.5, $out['LIT_FLOAT']['value']);
		$this->assertSame('hello', $out['LIT_STR']['value']);
		$this->assertSame(true, $out['LIT_BOOL_T']['value']);
		$this->assertSame(false, $out['LIT_BOOL_F']['value']);
		$this->assertNull($out['LIT_NULL']['value']);
		$this->assertSame('literal', $out['LIT_NULL']['kind']);
	}

	public function test_classifies_non_literals_as_runtime() : void {
		$f = $this->write('ls_runtime.php', <<<'PHP'
		<?php
		define('LIT_STR', 'x');
		define('RT_CONCAT', 'a' . 'b');
		define('RT_FUNC', strtolower('X'));
		define('RT_CONST_REF', LIT_STR);
		define('RT_ARRAY', ['x', 'y']);
		define('RT_TERNARY', true ? 1 : 2);
		PHP);

		$out = legacy_surface::extract([$f]);

		foreach (['RT_CONCAT', 'RT_FUNC', 'RT_CONST_REF', 'RT_ARRAY', 'RT_TERNARY'] as $name) {
			$this->assertSame('runtime', $out[$name]['kind'], "$name should be runtime");
			$this->assertNull($out[$name]['value'], "$name runtime value must be null");
		}
	}

	public function test_ignores_comments_and_method_calls() : void {
		$f = $this->write('ls_ignore.php', <<<'PHP'
		<?php
		define('REAL', 1);
		// define('COMMENT_LINE', 2);
		# define('COMMENT_HASH', 3);
		/* define('COMMENT_BLOCK', 4); */
		$o = new stdClass();
		$o->define('METHOD_CALL', 5);
		PHP);

		$out = legacy_surface::extract([$f]);

		$this->assertArrayHasKey('REAL', $out);
		$this->assertArrayNotHasKey('COMMENT_LINE', $out);
		$this->assertArrayNotHasKey('COMMENT_HASH', $out);
		$this->assertArrayNotHasKey('COMMENT_BLOCK', $out);
		$this->assertArrayNotHasKey('METHOD_CALL', $out);
	}

	public function test_first_definition_wins_across_files() : void {
		$a = $this->write('ls_a.php', "<?php\ndefine('DUP', 'from_a');\n");
		$b = $this->write('ls_b.php', "<?php\ndefine('DUP', 'from_b');\n");

		$out = legacy_surface::extract([$a, $b]);

		$this->assertSame('from_a', $out['DUP']['value']);
		$this->assertSame($a, $out['DUP']['file']);
	}

	public function test_records_source_file() : void {
		$f = $this->write('ls_file.php', "<?php\ndefine('ONLY', 7);\n");
		$out = legacy_surface::extract([$f]);
		$this->assertSame($f, $out['ONLY']['file']);
	}
}
