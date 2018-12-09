<?php

#var_dump($_REQUEST);

/**
 * Capture and deflate saml login request
 */

// SAMLRequest is get var received inflted gzip and base64 encoded 
$SAMLRequest 		= $_REQUEST['SAMLRequest'];
// Decode string (see https://www.samltool.com/decode.php)
$SAMLRequest_flat 	= gzinflate(base64_decode($SAMLRequest));

// Show as xml
header('Content-Type: text/xml');
echo '<?xml version="1.0"?>'.PHP_EOL;
echo $SAMLRequest_flat;
exit();
