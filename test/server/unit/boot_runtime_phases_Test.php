<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_runtime_phases.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';

final class boot_runtime_phases_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); config::reset(); env_loader::reset(); }
	protected function tearDown() : void { config::reset(); env_loader::reset(); }

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
}
