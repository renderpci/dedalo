<?php declare(strict_types=1);

/**
* BOOT_STATE
* Lifecycle of the boot orchestrator. READY short-circuits re-runs (idempotent);
* IN_PROGRESS re-entry is a bug (throws); FAILED pins the failing phase.
*/
enum boot_state : string {
	case NOT_STARTED = 'not_started';
	case IN_PROGRESS = 'in_progress';
	case READY       = 'ready';
	case FAILED      = 'failed';
}
