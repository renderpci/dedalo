<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_subsystem_phases.php';

final class boot_subsystem_phases_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		boot::reset();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) {
			mkdir($this->dir, 0755, true);
		}
	}
	protected function tearDown() : void { boot::reset(); }

	public function test_include_phase_requires_the_file_when_run() : void {
		// a unique constant name so we never collide with real constants
		$path = $this->dir . '/bsp_inc.php';
		file_put_contents($path, "<?php\ndefine('BSP_FIXTURE_MARKER', 4242);\n");

		$phase = boot_subsystem_phases::include_phase('marker', $path);
		$this->assertSame('marker', $phase->name);
		$this->assertFalse(defined('BSP_FIXTURE_MARKER'), 'not defined until the phase runs');

		boot::run(entrypoint_profile::CLI, [$phase]);

		$this->assertSame(boot_state::READY, boot::state());
		$this->assertTrue(defined('BSP_FIXTURE_MARKER'));
		$this->assertSame(4242, BSP_FIXTURE_MARKER);
	}

	public function test_include_phase_throws_on_missing_file() : void {
		$phase = boot_subsystem_phases::include_phase('absent', $this->dir . '/does_not_exist_zzz.php');
		// boot::run() throws on phase failure; swallow it so we can assert the terminal state
		try {
			boot::run(entrypoint_profile::CLI, [$phase]);
		} catch (\RuntimeException $e) {
			// expected — boot wraps the phase failure and re-throws
		}
		// boot wraps the phase failure and lands FAILED with the phase recorded
		$this->assertSame(boot_state::FAILED, boot::state());
		$this->assertSame('absent', boot::failed_phase());
	}

	public function test_include_phase_honours_skip_in() : void {
		$phase = boot_subsystem_phases::include_phase('skipme', $this->dir . '/never.php', ['cli']);
		$this->assertFalse($phase->should_run(entrypoint_profile::CLI));
		$this->assertTrue($phase->should_run(entrypoint_profile::WEB));
	}
}
