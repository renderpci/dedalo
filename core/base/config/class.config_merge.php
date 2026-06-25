<?php declare(strict_types=1);

/**
* CONFIG_MERGE
* How a higher-precedence layer combines with a lower one for a given key.
*  REPLACE - higher layer wholly replaces the value (default; matches v6 define() semantics)
*  DEEP    - associative arrays are merged key-by-key (opt-in, for map-shaped values)
*/
enum config_merge : string {
	case REPLACE = 'replace';
	case DEEP    = 'deep';
}
