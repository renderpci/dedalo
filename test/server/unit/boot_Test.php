<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.entrypoint_profile.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_state.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_phase.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot.php';

final class boot_Test extends TestCase {

	protected function setUp() : void { parent::setUp(); boot::reset(); }
	protected function tearDown() : void { boot::reset(); }

	public function test_runs_phases_in_order_and_reaches_ready() : void {
		$order = [];
		boot::run(entrypoint_profile::TEST, [
			new boot_phase('a', function () use (&$order) : void { $order[] = 'a'; }),
			new boot_phase('b', function () use (&$order) : void { $order[] = 'b'; }),
		]);
		$this->assertSame(['a', 'b'], $order);
		$this->assertSame(boot_state::READY, boot::state());
	}

	public function test_ready_rerun_is_idempotent_noop() : void {
		$count = 0;
		$phases = [new boot_phase('once', function () use (&$count) : void { $count++; })];
		boot::run(entrypoint_profile::TEST, $phases);
		boot::run(entrypoint_profile::TEST, $phases); // second run: no-op
		$this->assertSame(1, $count);
	}

	public function test_skipped_phase_does_not_run() : void {
		$ran = false;
		boot::run(entrypoint_profile::CLI, [
			new boot_phase('session', function () use (&$ran) : void { $ran = true; }, skip_in: ['cli']),
		]);
		$this->assertFalse($ran);
		$this->assertSame(boot_state::READY, boot::state());
	}

	public function test_phase_throw_sets_failed_and_records_phase() : void {
		try {
			boot::run(entrypoint_profile::TEST, [
				new boot_phase('ok', static function () : void {}),
				new boot_phase('boom', static function () : void { throw new \LogicException('kaboom'); }),
			]);
			$this->fail('expected RuntimeException');
		} catch (\RuntimeException $e) {
			$this->assertStringContainsString('boom', $e->getMessage());
		}
		$this->assertSame(boot_state::FAILED, boot::state());
		$this->assertSame('boom', boot::failed_phase());
	}

	public function test_rerun_after_failed_throws() : void {
		try {
			boot::run(entrypoint_profile::TEST, [new boot_phase('boom', static function () : void { throw new \LogicException('x'); })]);
		} catch (\RuntimeException $e) { /* expected */ }
		$this->expectException(\RuntimeException::class);
		boot::run(entrypoint_profile::TEST, []); // FAILED state rejects re-run
	}

	public function test_reentrancy_during_in_progress_throws() : void {
		$this->expectException(\RuntimeException::class);
		boot::run(entrypoint_profile::TEST, [
			new boot_phase('reenter', static function () : void {
				boot::run(entrypoint_profile::TEST, []); // re-enter while IN_PROGRESS
			}),
		]);
	}
}
