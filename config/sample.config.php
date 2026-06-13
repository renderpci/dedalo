<?php
/**
* DÉDALO — MAIN CONFIGURATION ENTRY POINT (template)
* =============================================================================
* Copy this file to `config/config.php` on a fresh install. It is intentionally
* thin: a duplicity guard plus a single require of the bootstrap kernel.
*
* WHERE CONFIGURATION LIVES NOW (layered bootstrap architecture):
*
*   config/bootstrap/kernel.php   Deterministic boot sequence (orchestrator).
*   config/bootstrap/paths.php    Computed path/host constants (from __DIR__).
*   config/bootstrap/schema.php   Manifest: key -> type, constant, flags.
*   config/defaults.env           Canonical declarative defaults (key=value).
*   config/profiles/<name>.env    Optional per-environment/per-entity overlays.
*   /private/.env                 Real per-deployment values + secrets
*                                 (OUTSIDE the web root; never version-controlled).
*   config/config_db.php          DB connection (until migrated to /private/.env).
*   config/config_core.php        Auto-managed runtime state (install/maintenance).
*
* Value precedence (last wins, override only the deltas):
*   defaults.env < profiles/<name>.env < /private/.env < real environment vars
*
* TO CONFIGURE AN INSTALL:
*   - Put DB credentials, salt and tokens in /private/.env (not here).
*   - Put non-secret overrides (entity, langs, media access...) in /private/.env
*     or a profile file. Override ONLY the keys that differ from defaults.env.
*   - Validate with:  php config/bootstrap/dev/lint_config.php
*
* Computed/derived and request-scoped constants are produced by the kernel;
* see config/bootstrap/kernel.php for the full, ordered boot sequence.
* =============================================================================
*/

// duplicity check
	if (defined('DEDALO_ROOT_PATH')) {
		throw new Exception("Error Processing Request: config file is already included!", 1);
	}

// boot
	require __DIR__ . '/bootstrap/kernel.php';
