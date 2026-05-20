<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
// JSON data controller


/**
 * Note that this controller uses the 'area_thesaurus_json' file as if it were its own.
 */



// ontology custom config file
return include dirname(__FILE__, 2) .'/area_thesaurus/area_thesaurus_json.php';
