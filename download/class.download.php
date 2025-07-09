<?php declare(strict_types=1);


/**
* DOWNLOAD CLASS
* Handles main Dédalo download tasks:
* 	- Code versions
* 	- Other downloads
* Is used by `master` installation to provide historical code versions.
* User can access directly like end points:
*	use /code path to list all available files as links.
* 	use /code_last to automatically start download of last available code version.
*/
class download {



	/**
	* __CONSTRUCT
	* @return void
	*/
	public function __construct() {
	}//end __construct



	/**
	* LATTEST_CODE_VERSION
	* Scan all Dédalo code directories recursively getting the zip files
	* and downloading the last file sorted by name as '6.6.4_dedalo.zip'
	* @return void
	*/
	public function lattest_code_version() : void {

		// starting point folder
		$start_directory = DEDALO_CODE_FILES_DIR;

		if (is_dir($start_directory)) {

			try {
				$iterator = new RecursiveIteratorIterator(
					new RecursiveDirectoryIterator($start_directory, FilesystemIterator::SKIP_DOTS),
					RecursiveIteratorIterator::LEAVES_ONLY // Only return "leaf" elements (files)
				);

				$valid_files = [];
				foreach ($iterator as $file) {

					// Ensure $file is a SplFileInfo object representing a file
					if (!$file->isFile()) {
						continue;
					}

					$file_name = $file->getFilename();
					if (strpos($file_name, '_dedalo.zip') === false) {
						continue;
					}
					// $file is now guaranteed to be a SplFileInfo object representing a file
					// You can get the full path with getPathname() or just the filename with getFilename()
					// echo $file->getPathname() . "<br>";
					// echo $file->getFilename() . "<br>";

					// Store file name as key and full path as value
					$valid_files[$file_name] = $file->getPathname();
				}

				// Sort $valid_files by key (filename) in descending order to get the latest version
				// Version numbers are lexicographically sortable (e.g., 6.6.4, 6.6.3)
				krsort($valid_files);

				// debug
				// echo json_encode($valid_files, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

				if (!empty($valid_files)) {
					// Get the first (and thus the latest) file from the sorted array
					$latest_file_name = key($valid_files); // Get the first key (filename)
					$latest_file_path = $valid_files[$latest_file_name]; // Get the corresponding path

					// Check if the file path and filename are valid before attempting download
					if ($latest_file_path && $latest_file_name) {
						// Download the last file
						$this->download_file($latest_file_path, $latest_file_name);
					} else {
						// This case is unlikely given the previous checks, but good for robustness
						echo 'Error: Could not determine valid file path or filename for download.';
					}
				} else {
					echo 'No Dédalo zip files found in the specified directory or its subdirectories.';
				}

			} catch (UnexpectedValueException $e) {
				// Catch exceptions from RecursiveDirectoryIterator (e.g., directory not found, permissions)
				echo "Error scanning directory: " . $e->getMessage();
			} catch (Exception $e) {
				// Catch any other unexpected errors
				echo "An unexpected error occurred: " . $e->getMessage();
			}
		} else {

			error_log("Error: Directory '$start_directory' not found or is not a directory. Check your config definition.");
			echo "Error: Directory for code not found or is not a directory. Check your config definition.";
		}
	}//end lattest_code_version



	/**
	* LIST_CODE_VERSIONS
	* Scan all Dédalo code directories recursively getting the zip files
	* and downloading the last file sorted by name as '6.6.4_dedalo.zip'
	* @return void
	*/
	public function list_code_versions() : void {

		// starting point folder
		$start_directory = DEDALO_CODE_FILES_DIR;

		if (!is_dir($start_directory)) {
			error_log("Error: Directory '$start_directory' not found or is not a directory. Check your config definition.");
			echo "Error: Directory for code not found or is not a directory. Check your config definition.";
			return;
		}

		try {
			$iterator = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator($start_directory, FilesystemIterator::SKIP_DOTS),
				RecursiveIteratorIterator::LEAVES_ONLY // Only return "leaf" elements (files)
			);

			$valid_files = [];
			foreach ($iterator as $file) {

				// Ensure $file is a SplFileInfo object representing a file
				if (!$file->isFile()) {
					continue;
				}

				$file_name = $file->getFilename();
				if (strpos($file_name, '_dedalo.zip') === false) {
					continue;
				}
				// $file is now guaranteed to be a SplFileInfo object representing a file
				// You can get the full path with getPathname() or just the filename with getFilename()
				// echo $file->getPathname() . "<br>";
				// echo $file->getFilename() . "<br>";

				// Store file name as key and full path as value
				$valid_files[$file_name] = $file->getPathname();
			}

			// Sort $valid_files by key (filename) in descending order to get the latest version
			// Version numbers are lexicographically sortable (e.g., 6.6.4, 6.6.3)
			ksort($valid_files);

			// debug
			// echo json_encode($valid_files, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

			if (!empty($valid_files)) {

				echo '<h2>Available Dédalo versions for download</h2>';

				foreach ($valid_files as $file_name => $file_path) {

					$safe_path = str_replace(DEDALO_ROOT_PATH, DEDALO_ROOT_WEB, $file_path);

					echo '<br><a href="' . $safe_path . '" target="_blank">' . basename($file_name) . '</a>';
				}

			} else {
				echo 'No Dédalo zip files found in the specified directory or its subdirectories.';
			}

		} catch (UnexpectedValueException $e) {
			// Catch exceptions from RecursiveDirectoryIterator (e.g., directory not found, permissions)
			error_log("Error scanning directory: " . $e->getMessage());
			echo "Error scanning directory";
		} catch (Exception $e) {
			// Catch any other unexpected errors
			error_log("An unexpected error occurred: " . $e->getMessage());
			echo "An unexpected error occurred";
		}
	}//end list_code_versions



	/**
	* DOWNLOAD_FILE
	* Set headers needed to download the given file and read
	* from the file path to the browser.
	* @param string $file_path The full path to the file to be downloaded.
	* @param string $file_name The desired filename for the download.
	* @return void
	*/
	private function download_file( string $file_path, string $file_name ) : void {

		// Check if the file exists and is readable
		if (file_exists($file_path) && is_readable($file_path)) {
			// Set the appropriate headers
			header('Content-Description: File Transfer');
			header('Content-Type: application/zip');
			header('Content-Disposition: attachment; filename="' . basename($file_name) . '"'); // Use basename for security
			header('Content-Transfer-Encoding: binary');
			header('Expires: 0');
			header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
			header('Pragma: public');
			header('Content-Length: ' . filesize($file_path)); // Get the file size

			// Clear output buffer to prevent unwanted content before file data
			if (ob_get_level()) {
				ob_end_clean();
			}
			flush(); // Flush system output buffer

			// Read the file and output it to the browser
			readfile($file_path);
			exit; // Terminate the script after sending the file
		} else {
			// Handle case where the file doesn't exist or is not readable
			error_log("Download failed: File not found or not readable: " . $file_path);
			echo 'Error: The requested file could not be found or accessed.';
		}
	}//end download_file



}//end download class
