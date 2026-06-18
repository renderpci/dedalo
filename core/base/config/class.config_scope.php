<?php declare(strict_types=1);

/**
* CONFIG_SCOPE
* Per-key contract that decides how a config key is materialized:
*  STATIC          - shipped/overridable value, compiled into the artifact, emitted as a constant
*  DERIVED         - computed at compile time from other resolved values; compiled + emitted
*  DERIVED_REQUEST - computed at boot from request state ($_SERVER); emitted, NOT compiled
*  REQUEST         - per-request value (lang); accessor-only, NEVER emitted as a constant
*  USER            - per-logged-user value (debug flags); accessor-only, NEVER emitted
*  SECRET          - from env/.env; emitted from live env, NOT compiled into the artifact
*  STATE           - machine-written runtime state; emitted from live state, NOT compiled
*  PASSTHROUGH     - migrated unknown custom define; emitted unvalidated, compiled
*/
enum config_scope : string {
	case STATIC          = 'static';
	case DERIVED         = 'derived';
	case DERIVED_REQUEST = 'derived_request';
	case REQUEST         = 'request';
	case USER            = 'user';
	case SECRET          = 'secret';
	case STATE           = 'state';
	case PASSTHROUGH     = 'passthrough';
}
