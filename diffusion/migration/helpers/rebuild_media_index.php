<?php
/**
* REBUILD_MEDIA_INDEX
* CLI helper: full resync of the media publication markers (the filesystem
* allowlist under DEDALO_MEDIA_PATH/.publication/ that the web server stats
* to authorize anonymous media access) from the publication databases.
*
* Run once when enabling DEDALO_MEDIA_ACCESS_MODE='publication' on an
* instance with existing publications, and to repair drift, e.g.:
*
* 	php /path/to/dedalo/diffusion/migration/helpers/rebuild_media_index.php
*
* PHP resolves the SQL targets from the diffusion ontology; the Bun engine
* executes the diff-sync (MariaDB is a Bun responsibility). Authentication
* uses DEDALO_DIFFUSION_INTERNAL_TOKEN (no session needed; see
* diffusion_api_client and diffusion/api/v1/lib/auth.ts).
*
* The Bun engine needs DEDALO_MEDIA_PATH set in its .env (same value as the
* PHP DEDALO_MEDIA_PATH constant).
*
* @see dd_diffusion_api::resolve_media_index_targets
* @see diffusion/api/v1/lib/media_index.ts
*/

if (php_sapi_name()!=='cli') {
	die('This script must be run from CLI'.PHP_EOL);
}

// USE V7 CODEBASE
require_once __DIR__ . '/../../../config/bootstrap.php';

$targets = dd_diffusion_api::resolve_media_index_targets();
echo 'Publication targets resolved from the ontology: ' . count($targets) . PHP_EOL;

$response = diffusion_api_client::call((object)[
	'action'	=> 'rebuild_media_index',
	'targets'	=> $targets
]);

echo ($response->msg ?? 'Error. Empty engine response') . PHP_EOL;
foreach ((array)($response->errors ?? []) as $error) {
	echo ' - ' . $error . PHP_EOL;
}

exit(($response->result ?? false)===true ? 0 : 1);
