<?php
$TOP_TIPO=false;
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');
require_once( dirname(dirname(__FILE__)) .'/class.tool_import_zotero.php');  # Read constants from here

#error_reporting(E_ALL | E_STRICT);
require(DEDALO_UPLOADER_DIR.'/server/php/UploadHandler.php');

$upload_dir = TOOL_IMPORT_ZOTERO_UPLOAD_DIR;
$upload_url = TOOL_IMPORT_ZOTERO_UPLOAD_URL;
$script_url = DEDALO_LIB_BASE_URL . '/tools/tool_import_zotero/html/import_files.php'; # current file url


# Options
# Overwrite default options when construct the class
$options = array(
		'script_url' => $script_url,	# current file url
		'upload_dir' => $upload_dir,	# target upload path. Normally DEDALO_MEDIA_BASE_PATH.DEDALO_PDF_FOLDER.'/temp'.'/files/'.'user_'.$_SESSION['dedalo4']['auth']['user_id'].'/'
		'upload_url' => $upload_url,	# target url base . Normally DEDALO_MEDIA_BASE_URL.DEDALO_PDF_FOLDER.'/temp'.'/files/'.'user_'.$_SESSION['dedalo4']['auth']['user_id'].'/'
		'user_dirs' => false,
		'mkdir_mode' => 0777,
		'param_name' => 'files',
		// Set the following option to 'POST', if your server does not support
		// DELETE requests. This is a parameter sent to the client:
		'delete_type' => 'DELETE',
		'access_control_allow_origin' => '*',
		'access_control_allow_credentials' => false,
		'access_control_allow_methods' => array(
			'OPTIONS',
			'HEAD',
			'GET',
			'POST',
			'PUT',
			'PATCH',
			'DELETE'
		),
		'access_control_allow_headers' => array(
			'Content-Type',
			'Content-Range',
			'Content-Disposition'
		),
		// Enable to provide file downloads via GET requests to the PHP script:
		//     1. Set to 1 to download files via readfile method through PHP
		//     2. Set to 2 to send a X-Sendfile header for lighttpd/Apache
		//     3. Set to 3 to send a X-Accel-Redirect header for nginx
		// If set to 2 or 3, adjust the upload_url option to the base path of
		// the redirect parameter, e.g. '/files/'.
		'download_via_php' => false,
		// Read files in chunks to avoid memory limits when download_via_php
		// is enabled, set to 0 to disable chunked reading of files:
		'readfile_chunk_size' => 10 * 1024 * 1024, // 10 MiB
		// Defines which files can be displayed inline when downloaded:
		'inline_file_types' => '/\.(json)$/i',
		//'inline_file_types' => '/\.(json)$/i',
		// Defines which files (based on their names) are accepted for upload:
		'accept_file_types' => '/.+$/i',
		// The php.ini settings upload_max_filesize and post_max_size
		// take precedence over the following max_file_size setting:
		'max_file_size' => null,
		'min_file_size' => 1,
		// The maximum number of files for the upload directory:
		'max_number_of_files' => null,
		// Defines which files are handled as image files:
		'image_file_types' => '/\.(gif|jpe?g|png)$/i',
		// Image resolution restrictions:
		'max_width' => null,
		'max_height' => null,
		'min_width' => 1,
		'min_height' => 1,
		// Set the following option to false to enable resumable uploads:
		'discard_aborted_uploads' => true,
		// Set to 0 to use the GD library to scale and orient images,
		// set to 1 to use imagick (if installed, falls back to GD),
		// set to 2 to use the ImageMagick convert binary directly:
		'image_library' => 0,
		// Uncomment the following to define an array of resource limits
		// for imagick:       
		#'imagick_resource_limits' => array(
		#    imagick::RESOURCETYPE_MAP => 32,
		#    imagick::RESOURCETYPE_MEMORY => 32
		#),
	   
		// Command or path for to the ImageMagick convert binary:
		//'convert_bin' => 'convert',
		'convert_bin' => MAGICK_PATH.'convert',
		// Uncomment the following to add parameters in front of each
		// ImageMagick convert call (the limit constraints seem only
		// to have an effect if put in front):        
		#'convert_params' => '-limit memory 32MiB -limit map 32MiB',
	   
		// Command or path for to the ImageMagick identify binary:
		'identify_bin' => MAGICK_PATH.'identify',		
		'image_versions' => array()
		/*
		'image_versions' => array(
			// The empty image version key defines options for the original image:
			'' => array(
				// Automatically rotate images based on EXIF meta data:
				'auto_orient' => true
			),
			// Uncomment the following to create medium sized images:           
			#'medium' => array(
			#    'max_width' => 800,
			#    'max_height' => 600
			#),
			
			'thumbnail' => array(
				// Uncomment the following to use a defined directory for the thumbnails
				// instead of a subdirectory based on the version identifier.
				// Make sure that this directory doesn't allow execution of files if you
				// don't pose any restrictions on the type of uploaded files, e.g. by
				// copying the .htaccess file from the files directory for Apache:
				//'upload_dir' => dirname($this->get_server_var('SCRIPT_FILENAME')).'/thumb/',
				//'upload_url' => $this->get_full_url().'/thumb/',
				// Uncomment the following to force the max
				// dimensions and e.g. create square thumbnails:
				//'crop' => true,
				'max_width' => 80,
				'max_height' => 80
			)
		
		)
		*/
	);
	#dump($options, 'options');


/**
* CustomUploadHandler
* Para no tocar la clase original, la heredamos y sobreescribimos algunos métodos
*/
class CustomUploadHandler extends UploadHandler {

	protected function get_upload_path($file_name = null, $version = null) {
		$file_name = $file_name ? $file_name : '';
		if (empty($version)) {
			$version_path = '';
		} else {
			if(isset($this->options['image_versions'][$version]['upload_dir']))
				$version_dir = @$this->options['image_versions'][$version]['upload_dir'];
			if (!empty($version_dir)) {
				return $version_dir.$this->get_user_path().$file_name;
			}
			$version_path = $version.'/';
		}
		return $this->options['upload_dir'].$this->get_user_path()
			.$version_path.$file_name;
	}

	protected function get_download_url($file_name, $version = null, $direct = false) {
		if (!$direct && $this->options['download_via_php']) {
			$url = $this->options['script_url']
				.$this->get_query_separator($this->options['script_url'])
				.$this->get_singular_param_name()
				.'='.rawurlencode($file_name);
			if ($version) {
				$url .= '&version='.rawurlencode($version);
			}
			return $url.'&download=1';
		}
		if (empty($version)) {
			$version_path = '';
		} else {
			if(isset($this->options['image_versions'][$version]['upload_url']))
				$version_url = @$this->options['image_versions'][$version]['upload_url'];
			if (!empty($version_url)) {
				return $version_url.$this->get_user_path().rawurlencode($file_name);
			}
			$version_path = rawurlencode($version).'/';
		}
		return $this->options['upload_url'].$this->get_user_path()
			.$version_path.rawurlencode($file_name);
	}

	protected function imagemagick_create_scaled_image($file_name, $version, $options) {
		list($file_path, $new_file_path) =
			$this->get_scaled_image_file_paths($file_name, $version);
		
		#$resize = @$options['max_width'].(empty($options['max_height']) ? '' : 'x'.$options['max_height']);
		$resize = (empty($options['max_height']) ? '' : 'x'.$options['max_height']);
		
		if (!$resize && empty($options['auto_orient'])) {
			if ($file_path !== $new_file_path) {
				return copy($file_path, $new_file_path);
			}
			return true;
		}
		$cmd = $this->options['convert_bin'];
		if (!empty($this->options['convert_params'])) {
			$cmd .= ' '.$this->options['convert_params'];
		}
		$cmd .= ' '.escapeshellarg($file_path);
		if (!empty($options['auto_orient'])) {
			$cmd .= ' -auto-orient';
		}
		if ($resize) {
			// Handle animated GIFs:
			$cmd .= ' -coalesce';
			if (empty($options['crop'])) {
				$cmd .= ' -resize '.escapeshellarg($resize.'>');
			} else {
				$cmd .= ' -resize '.escapeshellarg($resize.'^');
				$cmd .= ' -gravity center';
				$cmd .= ' -crop '.escapeshellarg($resize.'+0+0');
			}
			// Make sure the page dimensions are correct (fixes offsets of animated GIFs):
			$cmd .= ' +repage';
		}
		if (!empty($options['convert_params'])) {
			$cmd .= ' '.$options['convert_params'];
		}
		$cmd .= ' '.escapeshellarg($new_file_path);
		exec($cmd, $output, $error);
		if ($error) {
			error_log(implode('\n', $output));
			return false;
		}
		return true;
	}
}
# Iniciamos la clase pasándole nuestras opciones personalizadas
$upload_handler = new CustomUploadHandler($options);

?>