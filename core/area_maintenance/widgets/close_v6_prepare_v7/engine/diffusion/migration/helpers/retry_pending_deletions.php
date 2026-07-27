<?php
/**
* RETRY_PENDING_DELETIONS
* CLI helper: retries delete propagation for records whose deletion could not
* reach one or more diffusion targets (dd1758 activity rows with
* action = unpublish_pending). Suitable for crontab, e.g.:
*
* 	*\/15 * * * * php /path/to/dedalo/diffusion/migration/helpers/retry_pending_deletions.php
*
* Authentication to the Bun engine uses DEDALO_DIFFUSION_INTERNAL_TOKEN
* (no session needed; see diffusion_api_client and diffusion/api/v1/lib/auth.ts).
*
* Usage:
* 	php retry_pending_deletions.php [limit]   # default limit: 100
*
* @see diffusion_delete::retry_pending
*/

if (php_sapi_name()!=='cli') {
	die('This script must be run from CLI'.PHP_EOL);
}

// USE V7 CODEBASE
require_once __DIR__ . '/../../../config/bootstrap.php';

$limit = (int)($argv[1] ?? 100);

$pending_count = diffusion_delete::count_pending();
echo "Pending deletions found: $pending_count" . PHP_EOL;

if ($pending_count===0) {
	exit(0);
}

$response = diffusion_delete::retry_pending($limit);

echo $response->msg . PHP_EOL;

exit($response->remaining===0 ? 0 : 1);
