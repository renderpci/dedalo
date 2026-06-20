<?php declare(strict_types=1);

/**
* sample.config.local.php — TEMPLATE for the optional admin-only PHP override file.
*
* Copy this to ../private/config.local.php (OUTSIDE the web root, next to .env) to override
* non-secret, general settings whose value is awkward to express as .env text (e.g. nested
* arrays / maps). Secrets do NOT belong here — put DEDALO_PASSWORD_CONN, DEDALO_SALT_STRING,
* etc. in ../private/.env (chmod 600). The migration and the installer never write this file;
* it is purely hand-authored and entirely optional (a fresh install needs none of it).
*
* FORMAT: return an array keyed by catalog DOT-PATH (not the DEDALO_* constant name), with the
* already-typed PHP value (int/bool/string/array). The dot-paths are the `path:` field of the
* catalog keys in core/base/config/catalog/domains/*.php.
*
* PRECEDENCE: this file is layered ABOVE the catalog defaults and the boot-resolved paths.*,
* but BELOW .env / .env.<host> / process env — so a value set in .env wins over the same key
* set here. It can override STATIC keys and the boot-resolved paths.* keys (DERIVED keys are
* always recomputed and cannot be overridden here).
*
* This sample returns [] so that, if copied verbatim, it changes nothing.
*/

return [

	// --- examples (uncomment + adjust; keys must exist in the catalog) ---

	// 'identity.timezone'        => 'Europe/Madrid',
	// 'identity.locale'          => 'es-ES',

	// override the boot-resolved web root (normally derived from the install location):
	// 'paths.root_web'           => '/dedalo',

	// a map/list value that is clumsy to JSON-encode into .env:
	// 'media.image.thumb_sizes'  => [200, 400, 800],

];
