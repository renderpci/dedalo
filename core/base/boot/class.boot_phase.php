<?php declare(strict_types=1);

require_once __DIR__ . '/class.entrypoint_profile.php';

/**
* BOOT_PHASE
* One ordered boot step: a name, a side-effecting closure (fn(): void), and the
* set of entrypoint profiles in which it is skipped (by profile string value).
*/
final class boot_phase {

	/** @param string[] $skip_in entrypoint_profile string values to skip */
	public function __construct(
		public readonly string   $name,
		public readonly \Closure $run,
		public readonly array    $skip_in = [],
	) {}

	public function should_run(entrypoint_profile $profile) : bool {
		return !in_array($profile->value, $this->skip_in, true);
	}
}
