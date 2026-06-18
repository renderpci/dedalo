<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';

final class boot_phase_Test extends TestCase {

	public function test_phase_holds_name_and_closure() : void {
		$ran = false;
		$p = new boot_phase('demo', function () use (&$ran) : void { $ran = true; });
		$this->assertSame('demo', $p->name);
		($p->run)();
		$this->assertTrue($ran);
	}

	public function test_should_run_default_true_for_all_profiles() : void {
		$p = new boot_phase('always', static function () : void {});
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertTrue($p->should_run(entrypoint_profile::CLI));
	}

	public function test_skip_in_excludes_named_profiles() : void {
		$p = new boot_phase('session', static function () : void {}, skip_in: ['cli', 'cron', 'worker_init', 'test']);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertFalse($p->should_run(entrypoint_profile::CLI));
		$this->assertFalse($p->should_run(entrypoint_profile::TEST));
	}
}
