<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.compat_shim.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_config_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_runtime_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';

final class boot_runtime_phases_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); boot::reset(); config::reset(); env_loader::reset(); }
	protected function tearDown() : void { boot::reset(); config::reset(); env_loader::reset(); }

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_apply_locale_phase_sets_timezone_and_encoding_from_config() : void {
		config::boot(['identity.timezone' => 'Europe/Madrid', 'identity.locale' => 'es-ES']);
		$phase = boot_runtime_phases::apply_locale_phase();
		$this->assertSame('apply_locale', $phase->name);
		($phase->run)();
		$this->assertSame('Europe/Madrid', date_default_timezone_get());
		$this->assertSame('UTF-8', mb_internal_encoding());
	}

	public function test_apply_locale_phase_reads_a_different_timezone() : void {
		config::boot(['identity.timezone' => 'UTC', 'identity.locale' => 'en-EN']);
		(boot_runtime_phases::apply_locale_phase()->run)();
		$this->assertSame('UTC', date_default_timezone_get());
	}

	public function test_env_load_phase_populates_env_loader() : void {
		env_loader::reset();
		$path = sys_get_temp_dir() . '/dedalo_rt_' . getmypid() . '_' . uniqid() . '.env';
		file_put_contents($path, "DEDALO_RT_TEST=loaded\n");
		chmod($path, 0600);

		$phase = boot_runtime_phases::env_load_phase($path);
		$this->assertSame('env_load', $phase->name);
		($phase->run)();
		$this->assertSame('loaded', env_loader::get('DEDALO_RT_TEST'));

		unlink($path);
		env_loader::reset();
	}

	public function test_for_assembly_order_without_env() : void {
		$phases = boot_runtime_phases::for($this->catalog(), [], null, null);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		$this->assertSame(['config_build', 'compat_shim', 'apply_locale'], $names);
	}

	public function test_for_assembly_includes_env_when_path_given() : void {
		$phases = boot_runtime_phases::for($this->catalog(), [], '/tmp/x.env', null);
		$names = array_map(static fn(boot_phase $p) : string => $p->name, $phases);
		$this->assertSame(['env_load', 'config_build', 'compat_shim', 'apply_locale'], $names);
	}

	public function test_end_to_end_pipeline_through_boot_run() : void {
		boot::reset();
		$recorded = [];
		$spy = static function (string $n, mixed $v) use (&$recorded) : void { $recorded[$n] = $v; };
		$bases = [['paths.root' => '/srv/dedalo', 'paths.root_web' => '/dedalo']];

		boot::run(entrypoint_profile::TEST, boot_runtime_phases::for($this->catalog(), $bases, null, $spy));

		$this->assertSame(boot_state::READY, boot::state());
		// config booted with the path family resolved to real values
		$this->assertSame('/srv/dedalo/core', config('paths.core_path'));
		$this->assertSame('/dedalo/core', config('paths.core_url'));
		// compat shim emitted the resolved path constants
		$this->assertSame('/srv/dedalo/core', $recorded['DEDALO_CORE_PATH']);
		// apply_locale ran (timezone from config default 'Europe/Madrid', encoding UTF-8)
		$this->assertSame('Europe/Madrid', date_default_timezone_get());
		$this->assertSame('UTF-8', mb_internal_encoding());
		boot::reset();
	}
}
