<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.legacy_surface.php';
require_once dirname(__DIR__, 3) . '/install/class.boot_diff.php';

final class boot_diff_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) {
			mkdir($this->dir, 0755, true);
		}
	}

	/** a tiny catalog with one key per relevant scope */
	private function catalog() : array {
		return [
			new config_key('a.static',  'DD_STATIC',  'int',    1, config_scope::STATIC),
			new config_key('a.derived', 'DD_DERIVED', 'string', null, config_scope::DERIVED,
				config_merge::REPLACE, static fn(array $r) : string => 'd'),
			new config_key('a.request', 'DD_REQUEST', 'string', null, config_scope::REQUEST),
			new config_key('a.secret',  'DD_SECRET',  'string', null, config_scope::SECRET),
			new config_key('a.nullc',   null,         'string', 'x', config_scope::STATIC),
		];
	}

	private function subsystem_fixture() : array {
		$p = $this->dir . '/bd_subsystem.php';
		file_put_contents($p, "<?php\ndefine('DD_VERSION', '7.0');\ndefine('DD_TIPO_ROOT', 'dd1');\n");
		return [$p];
	}

	public function test_parity_when_new_reproduces_static_derived_and_subsystem() : void {
		$subsystem = $this->subsystem_fixture();
		// OLD: everything the real boot would emit
		$old = [
			'DD_STATIC' => 1, 'DD_DERIVED' => 'd',
			'DD_REQUEST' => 'lg-eng',        // excluded scope (old defines it, new must not)
			'DD_SECRET' => 'realsecret',     // live-sourced (old has it, new must not)
			'DEDALO_CORE' => 'core',         // a known drop
			'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1',
			'CUSTOM_HACK' => 'whatever',     // unexplained (user define / framework)
		];
		// NEW: exactly the static+derived config consts + subsystem consts
		$new = [
			'DD_STATIC' => 1, 'DD_DERIVED' => 'd',
			'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1',
		];

		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);

		$this->assertTrue($r['parity'], 'expected parity');
		$this->assertSame([], $r['missing']);
		$this->assertSame([], $r['new_extras']);
		$this->assertSame([], $r['value_mismatches']);
		$this->assertSame(['DD_REQUEST'], $r['buckets']['excluded']);
		$this->assertSame(['DD_SECRET'], $r['buckets']['live_secret_state']);
		$this->assertSame(['DEDALO_CORE'], $r['buckets']['dropped']);
		$this->assertSame(['CUSTOM_HACK'], $r['buckets']['unexplained']);
	}

	public function test_missing_expected_const_breaks_parity() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$new = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0']; // DD_TIPO_ROOT missing
		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);
		$this->assertFalse($r['parity']);
		$this->assertSame(['DD_TIPO_ROOT'], $r['missing']);
	}

	public function test_value_mismatch_breaks_parity() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$new = ['DD_STATIC' => 999, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);
		$this->assertFalse($r['parity']);
		$this->assertSame(['DD_STATIC'], $r['value_mismatches']);
	}

	public function test_new_extra_breaks_parity() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1', 'DD_EXTRA' => 5];
		$new = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1', 'DD_EXTRA' => 5];
		$r = boot_diff::classify($old, $new, $this->catalog(), $subsystem);
		$this->assertFalse($r['parity']);
		$this->assertSame(['DD_EXTRA'], $r['new_extras']);
	}

	public function test_render_never_prints_values() : void {
		$subsystem = $this->subsystem_fixture();
		$old = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_SECRET' => 'TOP_SECRET_SALT', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$new = ['DD_STATIC' => 1, 'DD_DERIVED' => 'd', 'DD_VERSION' => '7.0', 'DD_TIPO_ROOT' => 'dd1'];
		$out = boot_diff::render(boot_diff::classify($old, $new, $this->catalog(), $subsystem));
		$this->assertStringContainsString('DD_SECRET', $out);          // name appears
		$this->assertStringNotContainsString('TOP_SECRET_SALT', $out); // value never does
	}
}
