<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';

final class entrypoint_profile_Test extends TestCase {

	public function test_profiles_exist() : void {
		$names = array_map(static fn(entrypoint_profile $p) : string => $p->name, entrypoint_profile::cases());
		sort($names);
		$this->assertSame(['CLI', 'CRON', 'TEST', 'WEB', 'WORKER_INIT'], $names);
	}

	public function test_only_web_starts_session() : void {
		$this->assertTrue(entrypoint_profile::WEB->starts_session());
		$this->assertFalse(entrypoint_profile::CLI->starts_session());
		$this->assertFalse(entrypoint_profile::CRON->starts_session());
		$this->assertFalse(entrypoint_profile::WORKER_INIT->starts_session());
		$this->assertFalse(entrypoint_profile::TEST->starts_session());
	}

	public function test_only_web_resolves_request_state() : void {
		$this->assertTrue(entrypoint_profile::WEB->resolves_request_state());
		$this->assertFalse(entrypoint_profile::CLI->resolves_request_state());
		$this->assertFalse(entrypoint_profile::WORKER_INIT->resolves_request_state());
		$this->assertFalse(entrypoint_profile::CRON->resolves_request_state());
		$this->assertFalse(entrypoint_profile::TEST->resolves_request_state());
	}

	public function test_boot_state_cases() : void {
		$names = array_map(static fn(boot_state $s) : string => $s->name, boot_state::cases());
		sort($names);
		$this->assertSame(['FAILED', 'IN_PROGRESS', 'NOT_STARTED', 'READY'], $names);
	}
}
