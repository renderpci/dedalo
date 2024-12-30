<?php declare(strict_types=1);
/**
* SYSTEM_INFO
* Widget to manage Dédalo system info and status
*/
class system_info {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		// get overall system info
			$info = system::get_info();

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

			// RAM
			$total_gb	= system::get_ram();
			$requeriments_list[] = (object)[
				'name'	=> 'System RAM memory',
				'value'	=> ($total_gb>=16),
				'info'	=> 'RAM: '.$total_gb .' GB - minimum: 16 GB'
			];

			// PHP version
			$requeriments_list[] = (object)[
				'name'	=> 'PHP Supported version',
				'value'	=> system::test_php_version_supported('8.3.0'),
				'info'	=> 'Version: '.PHP_VERSION . ' - minimum: 8.3.0'
			];

			// php_memory
			$php_memory_gigabytes = system::get_php_memory();
			$requeriments_list[] = (object)[
				'name'	=> 'PHP memory limit',
				'value'	=> $php_memory_gigabytes >= 8,
				'info'	=> 'Memory: '.$php_memory_gigabytes . ' GB - minimum: 8 GB'
			];

			// Apache version
			$version = system::get_apache_version();
			$requeriments_list[] = (object)[
				'name'	=> 'Apache supported version',
				'value'	=> system::test_apache_version_supported('2.4.6'),
				'info'	=> 'Version: '. $version . ' - minimum: 2.4.6'
			];

			// PostgreSQL version
			$version = system::get_postgresql_version();
			$requeriments_list[] = (object)[
				'name'	=> 'PostgreSQL supported version',
				'value'	=> system::test_postgresql_version_supported('16.1'),
				'info'	=> 'Version: '. $version . ' - minimum: 16.1'
			];

			// mysql
			if (	(defined('MYSQL_DEDALO_DATABASE_CONN') && !empty(MYSQL_DEDALO_DATABASE_CONN))
				&& ( defined('MYSQL_DEDALO_HOSTNAME_CONN') && MYSQL_DEDALO_HOSTNAME_CONN==='localhost'
					|| (defined('MYSQL_DEDALO_SOCKET_CONN') && !empty(MYSQL_DEDALO_SOCKET_CONN)) )
				) {
				$mysql_server = system::get_mysql_server();
				if (empty($mysql_server)) {
					$requeriments_list[] = (object)[
						'name'	=> 'MySQL/MariaDB server not found',
						'value'	=> false,
						'info'	=> 'Not installed'
					];
				} else {
					$version = system::get_mysql_version($mysql_server);
					if ($mysql_server==='mariadb') {
						$requeriments_list[] = (object)[
							'name'	=> 'MariaDB supported version',
							'value'	=> (version_compare(trim($version), '5.6') >= 0),
							'info'	=> 'Version: '. $version . ' - minimum: 5.6'
						];
					}else
					if ($mysql_server==='mysql') {
						$requeriments_list[] = (object)[
							'name'	=> 'MySQL supported version',
							'value'	=> (version_compare(trim($version), '5.6') >= 0),
							'info'	=> 'Version: '. $version . ' - minimum: 5.6'
						];
					}
				}
			}

			// HTTP Protocol
			$protocol = $_SERVER["SERVER_PROTOCOL"];
			$h2_protocol = ($protocol==='HTTP/2.0');
			$requeriments_list[] = (object)[
				'name'	=> 'HTTP h2 protocol',
				'value'	=> $h2_protocol,
				'info'	=> "Protocol: $protocol - required: HTTP/2.0"
			];

			// HTTPS support
			$is_https = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on')
					 || (isset($_SERVER['HTTPS']) && $_SERVER['SERVER_PORT'] == 443);
			$requeriments_list[] = (object)[
				'name'	=> 'HTTPS connection',
				'value'	=> $is_https,
				'info'	=> "Connection HTTPS: " . ($_SERVER['HTTPS'] ?? $_SERVER['SERVER_PORT']) . " - required: HTTPS 443"
			];

			// GD lib installed
			$gd_lib_installed = system::check_gd_lib();
			$requeriments_list[] = (object)[
				'name'	=> 'GD lib installed',
				'value'	=> $gd_lib_installed,
				'info'	=> 'GD lib is needed to manage images in PHP'
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

			// FFPROVE version
			$ffprove_version = Ffmpeg::get_ffprove_version();
			$requeriments_list[] = (object)[
				'name'	=> 'ffprove installed',
				'value'	=> !empty($ffprove_version),
				'info'	=> 'Version: ' .$ffprove_version. ' - Path: ' . Ffmpeg::get_ffprove_installed_path()
			];

			// FFMPEG libx264 installed
			$libx264_installed = Ffmpeg::check_lib('libx264');
			$requeriments_list[] = (object)[
				'name'	=> 'FFMPEG libx264 installed',
				'value'	=> $libx264_installed,
				'info'	=> 'FFMPEG lib libx264 enable'
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

			$free_space = system::get_disk_free_space() ?? 0; // in megabytes
			$requeriments_list[] = (object)[
				'name'	=> 'disk free space',
				'info'	=> 'Main disk available space: '. number_format($free_space/1024, 0,'', '.') .' GB',
				'value'	=> $free_space > 4000
			];

		// system_list

			$system_list = [];

			$system_list[] = (object)[
				'name'	=> 'os',
				'value'	=> $info->getOS()
			];

			$system_list[] = (object)[
				'name'	=> 'model',
				'value'	=> $info->getModel()
			];

			$system_list[] = (object)[
				'name'	=> 'CPU architecture',
				'value'	=> $info->getCPUArchitecture()
			];

			$system_list[] = (object)[
				'name'	=> 'cpu',
				'value'	=> $info->getCPU()
			];

			$system_list[] = (object)[
				'name'	=> 'kernel',
				'value'	=> $info->getKernel()
			];

			$system_list[] = (object)[
				'name'	=> 'distribution',
				'value'	=> $info->getDistro()
			];

			$system_list[] = (object)[
				'name'	=> 'hostname',
				'value'	=> $info->getHostname()
			];

			$system_list[] = (object)[
				'name'	=> 'virtualization',
				'value'	=> $info->getVirtualization()
			];

			$system_list[] = (object)[
				'name'	=> 'devices',
				'value'	=> $info->getDevs()
			];

			$system_list[] = (object)[
				'name'	=> 'raid',
				'value'	=> $info->getRAID()
			];

			$system_list[] = (object)[
				'name'	=> 'services',
				'value'	=> $info->getServices()
			];

			$system_list[] = (object)[
				'name'	=> 'load',
				'value'	=> $info->getLoad()
			];

			$system_list[] = (object)[
				'name'	=> 'ram',
				'value'	=> $info->getRam()
			];

			$system_list[] = (object)[
				'name'	=> 'hd',
				'value'	=> $info->getHD()
			];

			$system_list[] = (object)[
				'name'	=> 'disk info',
				'value'	=> system::get_disk_info()
			];

			$system_list[] = (object)[
				'name'	=> 'disk free space',
				'value'	=> number_format($free_space/1024, 0,'', '.') . ' GB'
			];

			$system_list[] = (object)[
				'name'	=> 'mounts',
				'value'	=> $info->getMounts()
			];

			$system_list[] = (object)[
				'name'	=> 'net',
				'value'	=> $info->getNet()
			];

			$system_list[] = (object)[
				'name'	=> 'uptime',
				'value'	=> $info->getUpTime()
			];

			$system_list[] = (object)[
				'name'	=> 'process_status',
				'value'	=> $info->getProcessStats()
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
	}//end get_value



}//end system_info
