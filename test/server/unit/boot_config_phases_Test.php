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

final class boot_config_phases_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); boot::reset(); config::reset(); }
	protected function tearDown() : void { boot::reset(); config::reset(); }

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_phases_returns_two_named_phases() : void {
		$phases = boot_config_phases::phases($this->catalog(), []);
		$this->assertCount(2, $phases);
		$this->assertSame('config_build', $phases[0]->name);
		$this->assertSame('compat_shim', $phases[1]->name);
	}

	public function test_end_to_end_boot_boots_config_and_emits_constants() : void {
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void { $recorded[$name] = $value; };

		boot::run(entrypoint_profile::TEST, boot_config_phases::phases($this->catalog(), [], $spy));

		// config repository is booted and reads resolved values
		$this->assertSame(boot_state::READY, boot::state());
		$this->assertSame(222, config('media.image.thumb_width'));
		// compat shim emitted the static/derived constants (via the recorder, not real define())
		$this->assertSame(222, $recorded['DEDALO_IMAGE_THUMB_WIDTH']);
		$this->assertSame('/dedalo/core/media_engine/img.php', $recorded['DEDALO_IMAGE_FILE_URL']);
		// request-scoped key never emitted
		$this->assertArrayNotHasKey('DEDALO_APPLICATION_LANG', $recorded);
	}

	public function test_layer_override_flows_through_boot() : void {
		$recorded = [];
		$spy = static function (string $n, mixed $v) use (&$recorded) : void { $recorded[$n] = $v; };
		boot::run(entrypoint_profile::TEST, boot_config_phases::phases($this->catalog(), [['media.image.thumb_width' => 300]], $spy));
		$this->assertSame(300, config('media.image.thumb_width'));
		$this->assertSame(300, $recorded['DEDALO_IMAGE_THUMB_WIDTH']);
	}
}
