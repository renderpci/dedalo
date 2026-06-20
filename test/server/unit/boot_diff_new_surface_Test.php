<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class boot_diff_new_surface_Test extends TestCase {

	public function test_new_surface_script_emits_config_version_and_tipos() : void {
		$root   = dirname(__DIR__, 3);
		$script = $root . '/install/boot_diff_new_surface.php';
		$this->assertFileExists($script);

		$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script) . ' 2>/dev/null';
		$json = shell_exec($cmd);
		$surface = json_decode((string) $json, true);

		$this->assertIsArray($surface, 'new-surface script must print a JSON object of user constants');

		// a STATIC config constant (from the catalog via compat_shim)
		$this->assertArrayHasKey('DEDALO_IMAGE_THUMB_WIDTH', $surface);
		$this->assertSame(222, $surface['DEDALO_IMAGE_THUMB_WIDTH']);
		// a DERIVED path constant
		$this->assertArrayHasKey('DEDALO_CORE_PATH', $surface);
		// version.inc constant
		$this->assertArrayHasKey('DEDALO_VERSION', $surface);
		// a dd_tipos constant
		$this->assertArrayHasKey('DEDALO_ROOT_TIPO', $surface);
		// SECRET/STATE are NOT emitted by the hermetic new pipeline
		$this->assertArrayNotHasKey('DEDALO_PASSWORD_CONN', $surface);
		// REQUEST/USER accessor-only are NOT emitted
		$this->assertArrayNotHasKey('SHOW_DEBUG', $surface);
	}
}
