<?php declare(strict_types=1);

/**
* MIGRATION_DESTINATION
* Where the migrator routes a legacy constant:
*   ENV         → ../private/.env (secrets; redacted, never tracked)
*   STATE       → state.php (machine-written install state / fingerprints)
*   CONFIG      → typed config value file (overridable settings)
*   DROP        → not migrated (derived at boot, or request/user accessor-only)
*   PASSTHROUGH → preserved verbatim (unknown custom defines)
*/
enum migration_destination : string {
	case ENV         = 'env';
	case STATE       = 'state';
	case CONFIG      = 'config';
	case DROP        = 'drop';
	case PASSTHROUGH = 'passthrough';
}
