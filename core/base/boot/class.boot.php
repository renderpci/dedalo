<?php declare(strict_types=1);

require_once __DIR__ . '/class.entrypoint_profile.php';
require_once __DIR__ . '/class.boot_state.php';
require_once __DIR__ . '/class.boot_phase.php';

/**
* BOOT
* Ordered-phase boot orchestrator with an explicit lifecycle. Replaces the v6
* `if (defined('DEDALO_ROOT_PATH')) throw` guard: a READY re-run is a safe no-op
* (so multiple front-controller includes and worker re-entry don't fatal), an
* IN_PROGRESS re-entry is a real bug (throws), and a phase failure pins the
* failing phase so the shutdown handler can report it.
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
			throw new \RuntimeException('boot: re-entrancy detected while IN_PROGRESS (a class autoloaded during boot triggered boot again)');
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
