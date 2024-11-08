<?php
declare(strict_types=1);
/**
* AREA_MAINTENANCE_WIDGETS
* Handle area maintenance widgets values
*/
class area_maintenance_widgets extends area_common {



	/**
	* UPDATE_DATA_VERSION
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function update_data_version() : object {

		$updates				= update::get_updates();
		$update_version			= update::get_update_version();
		$update_version_plain	= empty($update_version)
			? ''
			: implode('', $update_version);

		$result = (object)[
			'update_version'		=> $update_version,
			'current_version_in_db'	=> get_current_version_in_db(),
			'dedalo_version'		=> get_dedalo_version(),
			'updates'				=> $updates->{$update_version_plain} ?? null
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end update_data_version



	/**
	* REGISTER_TOOLS
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function register_tools() : object {

		$tools_files_list = tools_register::get_tools_files_list();

		$result = (object)[
			'datalist'	=> $tools_files_list,
			'errors'	=> null
		];

		// matrix_tools field 'Developer' check
		if (empty(RecordObj_dd::get_modelo_name_by_tipo('dd1644',true))) {
			$result->errors = ['Your Ontology is outdated. Term \'dd1644\' (Developer) do not exists'];
		}

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end register_tools



	/**
	* SYSTEM_INFO
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function system_info() : object {

		// requeriments_list
			// installation elements test

			$requeriments_list = [];

			// Ontology server (master.dedalo.dev)
			$check = backup::check_remote_server();
			$code = $check->code ?? null;
			$requeriments_list[] = (object)[
				'name'	=> 'Available Ontology master server',
				'value'	=> $code===200,
				'info'	=> 'Code: ' . $code
			];

			// Code server (master.dedalo.dev)
			$requeriments_list[] = (object)[
				'name'	=> 'Available Dédalo master code server',
				'value'	=> check_url(DEDALO_SOURCE_VERSION_URL),
				'info'	=> 'URL: '.DEDALO_SOURCE_VERSION_URL
			];

			// PHP version
			$requeriments_list[] = (object)[
				'name'	=> 'PHP Supported version',
				'value'	=> test_php_version_supported('8.3.0'),
				'info'	=> 'Version: '.PHP_VERSION . ' - minimum: 8.3.0'
			];

			// Apache version
			$version = get_apache_version();
			$requeriments_list[] = (object)[
				'name'	=> 'Apache supported version',
				'value'	=> test_apache_version_supported('2.4.6'),
				'info'	=> 'Version: '. $version . ' - minimum: 2.4.6'
			];

			// PostgreSQL version
			$version = get_postgresql_version();
			$requeriments_list[] = (object)[
				'name'	=> 'PostgreSQL supported version',
				'value'	=> test_postgresql_version_supported('16.1'),
				'info'	=> 'Version: '. $version . ' - minimum: 16.1'
			];

			// FFMPEG installed
			$ffmpeg_version = Ffmpeg::get_version();
			$requeriments_list[] = (object)[
				'name'	=> 'FFMPEG installed',
				'value'	=> !empty($ffmpeg_version),
				'info'	=> 'Path: ' . Ffmpeg::get_ffmpeg_installed_path()
			];

			$requeriments_list[] = (object)[
				'name'	=> 'FFMPEG supported version',
				'value'	=> (version_compare(trim($ffmpeg_version), '5.0') >= 0),
				'info'	=> 'Version: '. $ffmpeg_version . ' - minimum: 5.0'
			];

			// IMAGEMAGICK installed
			$imagemagick_version = ImageMagick::get_version();
			$requeriments_list[] = (object)[
				'name'	=> 'ImageMagick installed',
				'value'	=> !empty($imagemagick_version),
				'info'	=> 'Path: ' . ImageMagick::get_imagemagick_installed_path()
			];

			$requeriments_list[] = (object)[
				'name'	=> 'ImageMagick supported version',
				'value'	=> (version_compare(trim($imagemagick_version), '6.9') >= 0),
				'info'	=> 'Version: '. $imagemagick_version . ' - minimum: 6.9'
			];

		// system_list
			// @use linfo
			// linfo lib installed via composer
			// @see https://github.com/jrgp/linfo
			include_once DEDALO_LIB_PATH . '/vendor/autoload.php';

			$linfo = new \Linfo\Linfo;

			$system_list = [];

			$system_list[] = (object)[
				'name'	=> 'cpu',
				'value'	=> $linfo->getOS()
			];

			$system_list[] = (object)[
				'name'	=> 'hostname',
				'value'	=> $linfo->getHostname()
			];

			$system_list[] = (object)[
				'name'	=> 'virtualization',
				'value'	=> $linfo->getVirtualization()
			];

			$system_list[] = (object)[
				'name'	=> 'load',
				'value'	=> $linfo->getLoad()
			];

			$system_list[] = (object)[
				'name'	=> 'cpu',
				'value'	=> $linfo->getCPU()
			];

			$system_list[] = (object)[
				'name'	=> 'ram',
				'value'	=> $linfo->getRam()
			];

			$system_list[] = (object)[
				'name'	=> 'model',
				'value'	=> $linfo->getModel()
			];

			$system_list[] = (object)[
				'name'	=> 'hd',
				'value'	=> $linfo->getHD()
			];

			$system_list[] = (object)[
				'name'	=> 'mounts',
				'value'	=> $linfo->getMounts()
			];

			$system_list[] = (object)[
				'name'	=> 'net',
				'value'	=> $linfo->getNet()
			];

			$system_list[] = (object)[
				'name'	=> 'uptime',
				'value'	=> $linfo->getUpTime()
			];

			$system_list[] = (object)[
				'name'	=> 'process_status',
				'value'	=> $linfo->getProcessStats()
			];



		$response = new stdClass();
			$response->result	= (object)[
				'requeriments_list'	=> $requeriments_list,
				'system_list'		=> $system_list,
				'errors'			=> null
			];
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end system_info



}//end area_maintenance_widgets
