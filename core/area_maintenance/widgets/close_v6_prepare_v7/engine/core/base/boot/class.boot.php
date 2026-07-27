<?php declare(strict_types=1);

require_once __DIR__ . '/class.entrypoint_profile.php';
require_once __DIR__ . '/class.boot_state.php';
require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.boot_reentrancy_exception.php';

/**
* BOOT
* Ordered-phase boot orchestrator with an explicit lifecycle. Replaces the v6
* `if (defined('DEDALO_ROOT_PATH')) throw` guard: a READY re-run is a safe no-op
* (so multiple front-controller includes and worker re-entry don't fatal), an
* IN_PROGRESS re-entry is a real bug (throws), and a phase failure pins the
* failing phase so the shutdown handler can report it.
*
* ONCE PER PROCESS: after READY, run() is a no-op (this is what makes multiple
* front-controller includes and the worker boot-once model safe). There is NO
* in-process config reload — a long-lived worker refreshes config/secrets by
* RESTARTING the process (graceful worker.stop()), never by re-running boot.
* boot::reset() is a TEST seam only; do not call it to "reload" in production.
*/
final class boot {

	private static boot_state $state = boot_state::NOT_STARTED;
	private static ?string $failed_phase = null;

	/**
	* @param entrypoint_profile $profile
	* @param boot_phase[] $phases ordered
	* @return void
	*/
	public static function run(entrypoint_profile $profile, array $phases) : void {

		if (self::$state === boot_state::READY) {
			return; // idempotent success
		}
		if (self::$state === boot_state::IN_PROGRESS) {
			throw new boot_reentrancy_exception('boot: re-entrancy detected while IN_PROGRESS (a class autoloaded during boot triggered boot again)');
		}
		if (self::$state === boot_state::FAILED) {
			throw new \RuntimeException('boot: previously FAILED at phase ' . (self::$failed_phase ?? '?') . '; refusing to continue a half-built process');
		}

		self::$state = boot_state::IN_PROGRESS;

		foreach ($phases as $phase) {
			if ($phase->should_run($profile) === false) {
				continue;
			}
			try {
				($phase->run)();
			} catch (\Throwable $e) {
				self::$state = boot_state::FAILED;
				self::$failed_phase = $phase->name;
				// A nested re-entrant boot::run() throws boot_reentrancy_exception:
				// propagate it UNWRAPPED so callers can distinguish a re-entrancy
				// bug from an ordinary phase failure by exception type. The
				// offending phase is still recorded in failed_phase().
				if ($e instanceof boot_reentrancy_exception) {
					throw $e;
				}
				throw new \RuntimeException("boot: phase '{$phase->name}' failed: " . $e->getMessage(), 0, $e);
			}
		}

		self::$state = boot_state::READY;
	}//end run

	public static function state() : boot_state {
		return self::$state;
	}

	public static function failed_phase() : ?string {
		return self::$failed_phase;
	}

	/** test seam */
	public static function reset() : void {
		self::$state = boot_state::NOT_STARTED;
		self::$failed_phase = null;
	}
}
