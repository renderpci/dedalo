<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.migration_extractor.php';

final class migration_extractor_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) { mkdir($this->dir, 0755, true); }
	}

	private function write(string $name, string $php) : string {
		$path = $this->dir . '/' . $name;
		file_put_contents($path, $php);
		return $path;
	}

	public function test_resolves_scalar_literals() : void {
		$f = $this->write('me_lit.php', <<<'PHP'
		<?php
		define('M_INT', 5);
		define('M_NEG', -3);
		define('M_STR', 'hello');
		define('M_BOOL', true);
		define('M_NULL', null);
		PHP);
		$out = migration_extractor::extract([$f]);
		$this->assertSame('literal', $out['M_INT']['kind']);
		$this->assertSame(5, $out['M_INT']['value']);
		$this->assertSame(-3, $out['M_NEG']['value']);
		$this->assertSame('hello', $out['M_STR']['value']);
		$this->assertSame(true, $out['M_BOOL']['value']);
		$this->assertNull($out['M_NULL']['value']);
		$this->assertSame('literal', $out['M_NULL']['kind']);
	}

	public function test_folds_literal_concatenation() : void {
		$f = $this->write('me_concat.php', "<?php\ndefine('M_PATH', 'a' . '/' . 'b');\n");
		$out = migration_extractor::extract([$f]);
		$this->assertSame('literal', $out['M_PATH']['kind']);
		$this->assertSame('a/b', $out['M_PATH']['value']);
	}

	public function test_resolves_cross_reference_to_earlier_literal() : void {
		// INFO_KEY = ENTITY pattern (string ref to a previously defined literal const)
		$f = $this->write('me_ref.php', "<?php\ndefine('M_ENTITY', 'my_inst');\ndefine('M_INFO_KEY', M_ENTITY);\n");
		$out = migration_extractor::extract([$f]);
		$this->assertSame('literal', $out['M_INFO_KEY']['kind']);
		$this->assertSame('my_inst', $out['M_INFO_KEY']['value']);
	}

	public function test_marks_runtime_values_and_keeps_raw() : void {
		$f = $this->write('me_rt.php', <<<'PHP'
		<?php
		define('M_HOST', $_SERVER['HTTP_HOST']);
		define('M_ROOT', dirname(__FILE__, 2));
		define('M_LANG', fix_cascade_config_var('x', 'lg-eng'));
		define('M_ARR', ['a', 'b']);
		define('M_UNRESOLVED', SOME_UNKNOWN_CONST);
		PHP);
		$out = migration_extractor::extract([$f]);
		foreach (['M_HOST', 'M_ROOT', 'M_LANG', 'M_UNRESOLVED'] as $name) {
			$this->assertSame('runtime', $out[$name]['kind'], "$name should be runtime");
			$this->assertNull($out[$name]['value'], "$name value must be null");
		}
		// a pure-literal array resolves to its value (so list/map secrets carry a value)
		$this->assertSame('literal', $out['M_ARR']['kind']);
		$this->assertSame(['a', 'b'], $out['M_ARR']['value']);
		// verbatim source still preserved for runtime values
		$this->assertSame('dirname(__FILE__, 2)', $out['M_ROOT']['raw']);
	}

	public function test_first_active_definition_wins_and_records_line_and_file() : void {
		$f = $this->write('me_dup.php', "<?php\ndefine('M_DUP', 'first');\ndefine('M_DUP', 'second');\n");
		$out = migration_extractor::extract([$f]);
		$this->assertSame('first', $out['M_DUP']['value']);
		$this->assertSame($f, $out['M_DUP']['file']);
		$this->assertSame(2, $out['M_DUP']['line']);
	}

	public function test_ignores_commented_and_method_call_defines() : void {
		$f = $this->write('me_ignore.php', <<<'PHP'
		<?php
		define('M_REAL', 1);
		// define('M_LINE', 2);
		/* define('M_BLOCK', 3); */
		$o = new stdClass();
		$o->define('M_METHOD', 4);
		PHP);
		$out = migration_extractor::extract([$f]);
		$this->assertArrayHasKey('M_REAL', $out);
		$this->assertArrayNotHasKey('M_LINE', $out);
		$this->assertArrayNotHasKey('M_BLOCK', $out);
		$this->assertArrayNotHasKey('M_METHOD', $out);
	}

	public function test_symbol_table_persists_across_files_in_order() : void {
		$a = $this->write('me_a.php', "<?php\ndefine('M_BASE', '/srv');\n");
		$b = $this->write('me_b.php', "<?php\ndefine('M_SUB', M_BASE . '/data');\n");
		$out = migration_extractor::extract([$a, $b]);
		$this->assertSame('literal', $out['M_SUB']['kind']);
		$this->assertSame('/srv/data', $out['M_SUB']['value']);
	}
}
