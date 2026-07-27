<?php declare(strict_types=1);

/**
* ENTRYPOINT_PROFILE
* Which boot behaviors apply to each kind of entrypoint (spec §5.7 matrix).
* Only WEB runs the per-request side-effects (session start, request-state
* resolution); CLI/CRON/WORKER_INIT/TEST skip them.
*/
enum entrypoint_profile : string {
	case WEB         = 'web';
	case CLI         = 'cli';
	case CRON        = 'cron';
	case WORKER_INIT = 'worker_init';
	case TEST        = 'test';

	public function starts_session() : bool {
		return $this === self::WEB;
	}

	public function resolves_request_state() : bool {
		return $this === self::WEB;
	}
}
