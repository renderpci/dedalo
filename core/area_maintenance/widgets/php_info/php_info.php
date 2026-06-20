<?php declare(strict_types=1);
/**
* PHP_INFO ENDPOINT
* Standalone HTTP endpoint that renders the server's PHP configuration via
* phpinfo() inside a sandboxed <iframe> embedded in the area_maintenance widget.
*
* This file is NOT a class — it is a direct-output PHP script loaded as the
* `src` of an <iframe> created by render_php_info.js (get_content_data_edit).
* The iframe's `src` URL is supplied by the server as `value.src` inside the
* widget's JSON response; the client defers assigning it until the widget panel
* is first opened (see php_info.js → load() → activate()).
*
* Security:
*   Access is restricted to authenticated Dédalo users.  The script calls
*   login::is_logged() — which reads the session established by the normal
*   login flow — and aborts with a visible error message if the check fails.
*   phpinfo() output is only ever shown to logged-in administrators using
*   area_maintenance, which itself requires elevated privileges.
*
* Auto-resize:
*   After phpinfo() writes its HTML page, an inline <script> is appended.
*   When the iframe's document finishes loading, that script measures the
*   rendered body height (scrollHeight + 50 px padding) and writes it back
*   to the parent document's .php_info_iframe element so the widget panel
*   expands to show the full phpinfo table without a nested scrollbar.
*
* Invocation path:
*   area_maintenance → php_info widget → php_info.js load() → activate()
*   → <iframe src="…/php_info/php_info.php"> → this file
*
* Peer files:
*   js/php_info.js          — widget constructor + deferred-load logic
*   js/render_php_info.js   — DOM builder; creates .php_info_iframe element
*   css/php_info.less        — widget styles
*
* @package Dédalo
* @subpackage Core
*/

// config dedalo
require dirname(__FILE__, 5).'/config/bootstrap.php';


// Authentication guard
// (!) Must be checked before any output. If the session is not authenticated,
//     phpinfo() output must never be shown — it exposes sensitive server details.
if(login::is_logged()!==true) {
	die("<span class='error'> Auth error: please login </span>");
}

// Render the full PHP configuration page.
// phpinfo() writes a complete HTML document including <html>, <head>, and <body>
// tags, so no additional HTML wrapper is needed here.  The auto-resize <script>
// appended below is injected into the same document after phpinfo() closes </html>.
phpinfo();
?>
<script type="text/javascript">
	this.addEventListener("load", function(e){

		setTimeout(function(){
			// document real height
			const h = (this.document.body.scrollHeight + 50)
			// iframe in window.parent
			const php_info = window.parent.document.querySelector('.php_info_iframe')
			if (php_info) {
				php_info.height = h + 'px'
			}
		}, 150)
	})
</script>
