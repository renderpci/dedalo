<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_web_phases.php';

final class boot_web_phases_Test extends TestCase {

	public function test_logger_phase_shape() : void {
		$p = boot_web_phases::logger_phase('/some/class.logger.php');
		$this->assertSame('logger', $p->name);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertTrue($p->should_run(entrypoint_profile::CLI)); // logger runs everywhere
	}

	public function test_session_phase_is_web_only() : void {
		$p = boot_web_phases::session_phase();
		$this->assertSame('session_start', $p->name);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertFalse($p->should_run(entrypoint_profile::CLI));
		$this->assertFalse($p->should_run(entrypoint_profile::CRON));
		$this->assertFalse($p->should_run(entrypoint_profile::WORKER_INIT));
		$this->assertFalse($p->should_run(entrypoint_profile::TEST));
	}

	public function test_request_state_phase_is_web_only() : void {
		$p = boot_web_phases::request_state_phase();
		$this->assertSame('request_state', $p->name);
		$this->assertTrue($p->should_run(entrypoint_profile::WEB));
		$this->assertFalse($p->should_run(entrypoint_profile::CLI));
		$this->assertFalse($p->should_run(entrypoint_profile::TEST));
	}
}
