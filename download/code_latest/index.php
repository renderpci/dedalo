<?php declare(strict_types=1);

/**
* CODE_LATEST
* Automatically start download of last available code version.
*/

// file includes
	define('APP_ROOT', dirname(__DIR__, 2)); // Go up 2 directories from this file to the root
	// config dedalo
	if (!include APP_ROOT . '/config/config.php') {
		throw new Exception('Config file not found');
	}
	// class download
	if (!include APP_ROOT . '/download/class.download.php') {
		throw new Exception('download class file not found');
	}

/**
* DOWNLOAD LAST DÉDALO VERSION FILE.
*
* Scan all Dédalo code directories recursively getting the zip files
* and downloading the last file sorted by name as '6.6.4_dedalo.zip'
*/
$download = new download();
$download->lattest_code_version();
